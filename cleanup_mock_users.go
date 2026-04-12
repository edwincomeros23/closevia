//go:build ignore

// ============================================================================
// cleanup_mock_users.go
// ============================================================================
// One-off script to delete the ~3,000 mock users created against the hosted
// DB by closevia/clovia-performance-test.js (k6 load test). Each k6 iteration
// registers a new account, so the rows look like:
//
//   name      = 'Performance Test User'   (clovia-performance-test.js:167)
//   email     = 'testuser-<ms>-<rand>@test.com'  (clovia-performance-test.js:65)
//   verified  = 0    (k6 never runs the OTP flow)
//   role      = 'user'
//
// All four conditions must match — defense in depth so we don't accidentally
// touch a real user.
//
// Run flow:
//
//   1) DRY RUN (default — no changes):
//        go run cleanup_mock_users.go
//      Inspect the printed counts. suspicious_matches MUST be 0. The sample
//      rows MUST all look like Performance Test User accounts.
//
//   2) ACTUAL CLEANUP (only after dry run looks correct AND an Aiven backup
//      has been taken):
//        go run cleanup_mock_users.go --confirm
//      This wraps everything in a transaction. If the post-delete safety
//      check fails (remaining_mock_users != 0), the script ROLLS BACK
//      automatically. On success it COMMITs.
//
// Cascade order mirrors handlers/user_handler.go:1856-1865 (the DeleteUser
// handler) — replicated here in case the hosted DB is missing some
// ON DELETE CASCADE constraints, since the hosted schema is known to drift
// from local migrations in places.
// ============================================================================

package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/xashathebest/clovia/database"
)

func main() {
	confirm := flag.Bool("confirm", false, "Actually run the DELETE block inside a transaction. Without this flag the script only prints the dry-run inspection.")
	flag.Parse()

	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}
	if err := database.InitDatabase(); err != nil {
		log.Fatal("Failed to init DB: ", err)
	}
	defer database.CloseDatabase()

	fmt.Println("============================================================")
	fmt.Println("CLEANUP: k6 'Performance Test User' rows")
	fmt.Println("============================================================")
	if *confirm {
		fmt.Println("Mode: COMMIT (will run transactional DELETE)")
	} else {
		fmt.Println("Mode: DRY RUN (no changes will be made)")
		fmt.Println("Pass --confirm to actually run the cleanup.")
	}
	fmt.Println()

	if err := dryRun(database.DB); err != nil {
		log.Fatal("Dry run failed: ", err)
	}

	if !*confirm {
		fmt.Println()
		fmt.Println("DRY RUN COMPLETE.")
		fmt.Println("If the numbers above look right, re-run with --confirm to execute the cleanup.")
		return
	}

	fmt.Println()
	if err := runCleanup(database.DB); err != nil {
		log.Fatal("Cleanup failed: ", err)
	}
}

// dryRun prints what WOULD be deleted without making any changes.
// It exits with status 1 if the suspicious_matches sanity check fails.
func dryRun(db *sql.DB) error {
	const targetWhere = `name = 'Performance Test User'
		  AND email LIKE 'testuser-%@test.com'
		  AND verified = 0
		  AND role = 'user'`

	// 1a. How many users will be targeted?
	var willDelete int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users WHERE ` + targetWhere).Scan(&willDelete); err != nil {
		return fmt.Errorf("1a will_delete_users: %w", err)
	}
	fmt.Printf("1a. will_delete_users      = %d\n", willDelete)

	// 1b. Sanity check: any matching name+email row that is NOT unverified+user-role?
	//     If this is > 0, something matches our pattern that we did NOT expect — STOP.
	var suspicious int
	if err := db.QueryRow(`
		SELECT COUNT(*) FROM users
		WHERE name = 'Performance Test User'
		  AND email LIKE 'testuser-%@test.com'
		  AND (verified = 1 OR role <> 'user')
	`).Scan(&suspicious); err != nil {
		return fmt.Errorf("1b suspicious_matches: %w", err)
	}
	fmt.Printf("1b. suspicious_matches     = %d   (MUST be 0)\n", suspicious)
	if suspicious > 0 {
		fmt.Println()
		fmt.Println("STOP: suspicious matches found.")
		fmt.Println("A row matches name+email but is verified or has a non-user role.")
		fmt.Println("Investigate manually before re-running.")
		os.Exit(1)
	}

	// 1c. 10 sample rows so a human can eyeball them.
	fmt.Println()
	fmt.Println("1c. sample rows (latest 10):")
	rows, err := db.Query(`
		SELECT id, name, email, verified, role, created_at FROM users
		WHERE ` + targetWhere + `
		ORDER BY id DESC
		LIMIT 10
	`)
	if err != nil {
		return fmt.Errorf("1c sample rows: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id, verified int
		var name, email, role, createdAt string
		if err := rows.Scan(&id, &name, &email, &verified, &role, &createdAt); err != nil {
			return fmt.Errorf("1c scan: %w", err)
		}
		fmt.Printf("    id=%d  name=%q  email=%q  verified=%d  role=%s  created_at=%s\n",
			id, name, email, verified, role, createdAt)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("1c rows.Err: %w", err)
	}

	// 1d. Downstream cascade counts.
	fmt.Println()
	fmt.Println("1d. downstream cascade counts:")
	targetSubquery := `(SELECT id FROM users WHERE ` + targetWhere + `)`

	var products, trades, notifications int
	if err := db.QueryRow(`SELECT COUNT(*) FROM products WHERE seller_id IN ` + targetSubquery).Scan(&products); err != nil {
		return fmt.Errorf("1d products: %w", err)
	}
	fmt.Printf("    products_to_delete      = %d\n", products)

	if err := db.QueryRow(`SELECT COUNT(*) FROM trades WHERE buyer_id IN ` + targetSubquery + ` OR seller_id IN ` + targetSubquery).Scan(&trades); err != nil {
		return fmt.Errorf("1d trades: %w", err)
	}
	fmt.Printf("    trades_to_delete        = %d\n", trades)

	if err := db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE user_id IN ` + targetSubquery).Scan(&notifications); err != nil {
		return fmt.Errorf("1d notifications: %w", err)
	}
	fmt.Printf("    notifications_to_delete = %d\n", notifications)

	return nil
}

// runCleanup performs the actual transactional delete. It always uses a
// single connection (via *sql.Tx) so the TEMPORARY TABLE is visible across
// every statement. On any error, or if the post-delete safety check fails,
// it rolls back and returns an error.
func runCleanup(db *sql.DB) error {
	fmt.Println("============================================================")
	fmt.Println("STEP 2 — TRANSACTIONAL CLEANUP")
	fmt.Println("============================================================")

	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	// Track whether we've already finalized (commit/rollback) so the deferred
	// rollback is a no-op on the success path.
	finalized := false
	defer func() {
		if !finalized {
			if rbErr := tx.Rollback(); rbErr != nil && rbErr != sql.ErrTxDone {
				fmt.Printf("rollback error: %v\n", rbErr)
			}
		}
	}()

	// Stage target IDs into a TEMPORARY TABLE. This both speeds up the
	// downstream DELETEs (no re-running the WHERE on every step) and locks
	// the working set so it can't drift mid-transaction if k6 ran again.
	if _, err := tx.ExecContext(ctx, `DROP TEMPORARY TABLE IF EXISTS _mock_user_ids`); err != nil {
		return fmt.Errorf("drop temp table: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `CREATE TEMPORARY TABLE _mock_user_ids (id INT PRIMARY KEY) ENGINE=MEMORY`); err != nil {
		return fmt.Errorf("create temp table: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO _mock_user_ids (id)
		SELECT id FROM users
		WHERE name = 'Performance Test User'
		  AND email LIKE 'testuser-%@test.com'
		  AND verified = 0
		  AND role = 'user'
	`); err != nil {
		return fmt.Errorf("populate temp table: %w", err)
	}

	var staged int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM _mock_user_ids`).Scan(&staged); err != nil {
		return fmt.Errorf("count staged: %w", err)
	}
	fmt.Printf("staged_user_ids = %d\n\n", staged)

	if staged == 0 {
		fmt.Println("Nothing to delete. Rolling back (no-op).")
		_ = tx.Rollback()
		finalized = true
		return nil
	}

	// Delete order mirrors handlers/user_handler.go:1856-1865 exactly.
	steps := []struct {
		label string
		stmt  string
	}{
		{
			"2a. trade_items via products",
			`DELETE ti FROM trade_items ti
			 JOIN products p ON p.id = ti.product_id
			 WHERE p.seller_id IN (SELECT id FROM _mock_user_ids)`,
		},
		{
			"2b. multiway_trades",
			`DELETE FROM multiway_trades
			 WHERE user1_id          IN (SELECT id FROM _mock_user_ids)
			    OR user2_id          IN (SELECT id FROM _mock_user_ids)
			    OR user3_id          IN (SELECT id FROM _mock_user_ids)
			    OR initiator_user_id IN (SELECT id FROM _mock_user_ids)`,
		},
		{
			"2c. trade_loop_agreements",
			`DELETE FROM trade_loop_agreements
			 WHERE user_id IN (SELECT id FROM _mock_user_ids)`,
		},
		{
			"2d. trades",
			`DELETE FROM trades
			 WHERE buyer_id  IN (SELECT id FROM _mock_user_ids)
			    OR seller_id IN (SELECT id FROM _mock_user_ids)`,
		},
		{
			"2e. products",
			`DELETE FROM products
			 WHERE seller_id IN (SELECT id FROM _mock_user_ids)`,
		},
		{
			"2f. notifications",
			`DELETE FROM notifications
			 WHERE user_id IN (SELECT id FROM _mock_user_ids)`,
		},
		{
			"2g. users",
			`DELETE FROM users
			 WHERE id IN (SELECT id FROM _mock_user_ids)`,
		},
	}

	for _, s := range steps {
		res, err := tx.ExecContext(ctx, s.stmt)
		if err != nil {
			return fmt.Errorf("%s: %w", s.label, err)
		}
		affected, _ := res.RowsAffected()
		fmt.Printf("%-32s deleted %d rows\n", s.label, affected)
	}

	// Post-delete safety check, still inside the same transaction.
	fmt.Println()
	var remaining, totalAfter int
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM users
		WHERE name = 'Performance Test User' AND email LIKE 'testuser-%@test.com'
	`).Scan(&remaining); err != nil {
		return fmt.Errorf("verify remaining: %w", err)
	}
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&totalAfter); err != nil {
		return fmt.Errorf("verify total: %w", err)
	}
	fmt.Printf("remaining_mock_users = %d   (must be 0)\n", remaining)
	fmt.Printf("total_users_after    = %d\n", totalAfter)

	// Drop the temp table — non-fatal on error since the connection ends here anyway.
	if _, err := tx.ExecContext(ctx, `DROP TEMPORARY TABLE IF EXISTS _mock_user_ids`); err != nil {
		fmt.Printf("warn: drop temp table: %v\n", err)
	}

	if remaining != 0 {
		fmt.Println()
		fmt.Println("SAFETY CHECK FAILED: remaining_mock_users != 0. Rolling back.")
		return fmt.Errorf("safety check failed: %d mock users still present after delete", remaining)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	finalized = true
	fmt.Println()
	fmt.Println("COMMITTED.")
	return nil
}
