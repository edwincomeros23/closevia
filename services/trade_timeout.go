package services

import (
	"database/sql"
	"log"
	"time"
)

// StartTradeTimeoutScheduler runs periodic checks to progress trades through two-stage timeout
func StartTradeTimeoutScheduler(db *sql.DB) {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			if err := runTradeTimeoutPass(db); err != nil {
				log.Printf("trade timeout pass error: %v", err)
			}
			<-ticker.C
		}
	}()
}

func runTradeTimeoutPass(db *sql.DB) error {
	// If the DB doesn't have the expected timeout columns (migrations not applied),
	// skip the pass to avoid SQL errors. Check for existence of first_completion_at.
	var cnt int
	if err := db.QueryRow("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'trades' AND column_name = 'first_completion_at'").Scan(&cnt); err != nil {
		// If we can't query information_schema, return the error so it can be retried later
		return err
	}
	if cnt == 0 {
		// migrations not applied; nothing to do for trade timeouts
		return nil
	}
	// Stage 1: Move to awaiting_confirmation after 24h from first_completion_at
	if _, err := db.Exec(`
        UPDATE trades
        SET status = 'awaiting_confirmation', awaiting_confirmation_since = NOW(), updated_at = NOW()
        WHERE status = 'active'
          AND first_completion_at IS NOT NULL
          AND awaiting_confirmation_since IS NULL
          AND ((buyer_completed = TRUE AND seller_completed = FALSE) OR (buyer_completed = FALSE AND seller_completed = TRUE))
          AND TIMESTAMPDIFF(HOUR, first_completion_at, NOW()) >= 24
    `); err != nil {
		return err
	}

	// Send reminders for newly moved trades
	// Simple approach: notify all trades that meet the condition right now
	rows, err := db.Query(`
        SELECT id, buyer_id, seller_id FROM trades
        WHERE status = 'awaiting_confirmation' 
          AND awaiting_confirmation_since IS NOT NULL
          AND TIMESTAMPDIFF(MINUTE, awaiting_confirmation_since, NOW()) < 10
    `)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, buyerID, sellerID int
			if err := rows.Scan(&id, &buyerID, &sellerID); err == nil {
				_, _ = db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Reminder: Please confirm the trade within 24 hours.")
				_, _ = db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", sellerID, "Reminder: Please confirm the trade within 24 hours.")
			}
		}
	}

	// Stage 2: Auto-complete after 48h from first_completion_at
	rows2, err := db.Query(`
        SELECT id FROM trades
        WHERE (status = 'awaiting_confirmation' OR status = 'active')
          AND first_completion_at IS NOT NULL
          AND auto_completed_at IS NULL
          AND ((buyer_completed = TRUE AND seller_completed = FALSE) OR (buyer_completed = FALSE AND seller_completed = TRUE))
          AND TIMESTAMPDIFF(HOUR, first_completion_at, NOW()) >= 48
    `)
	if err != nil {
		return err
	}
	defer rows2.Close()
	for rows2.Next() {
		var tradeID int
		if err := rows2.Scan(&tradeID); err == nil {
			if err := autoCompleteTrade(db, tradeID); err != nil {
				log.Printf("auto-complete trade %d failed: %v", tradeID, err)
			}
		}
	}

	// Stage 3: Expire inactive trades after 7 days with no progress
	// Ping DB to recover stale connections before querying
	if err := db.Ping(); err != nil {
		return err
	}
	var expireIDs []int
	expiredRows, err := db.Query(`
		SELECT id FROM trades
		WHERE status IN ('pending', 'accepted', 'countered', 'active')
		  AND TIMESTAMPDIFF(DAY, updated_at, NOW()) >= 7
	`)
	if err != nil {
		return err
	}
	for expiredRows.Next() {
		var tradeID int
		if err := expiredRows.Scan(&tradeID); err == nil {
			expireIDs = append(expireIDs, tradeID)
		}
	}
	expiredRows.Close()
	for _, tradeID := range expireIDs {
		if err := autoExpireTrade(db, tradeID); err != nil {
			log.Printf("auto-expire trade %d failed: %v", tradeID, err)
		}
	}

	// Stage 4: Auto-dissolve expired multi-way chains (18hr acceptance window)
	if err := dissolveExpiredMultiwayChains(db); err != nil {
		log.Printf("dissolve expired multiway chains error: %v", err)
	}

	// Stage 5: Expire 12-hour re-match holds (Phase 3)
	if err := expireRematchHolds(db); err != nil {
		log.Printf("expire rematch holds error: %v", err)
	}

	return nil
}

func autoCompleteTrade(db *sql.DB, tradeID int) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Lock trade and fetch participants and target
	var targetProductID, buyerID, sellerID int
	var status string
	err = tx.QueryRow(`
        SELECT target_product_id, buyer_id, seller_id, status
        FROM trades WHERE id = ? FOR UPDATE
    `, tradeID).Scan(&targetProductID, &buyerID, &sellerID, &status)
	if err != nil {
		return err
	}

	// Mark all products as traded
	// target product
	if _, err := tx.Exec("UPDATE products SET status='traded', updated_at=NOW() WHERE id = ?", targetProductID); err != nil {
		return err
	}
	// offered products
	rows, err := tx.Query("SELECT product_id FROM trade_items WHERE trade_id = ?", tradeID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var pid int
		if err := rows.Scan(&pid); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE products SET status='traded', updated_at=NOW() WHERE id = ?", pid); err != nil {
			return err
		}
	}

	// Update trade status
	if _, err := tx.Exec("UPDATE trades SET status='auto_completed', completed_at=NOW(), auto_completed_at=NOW(), updated_at=NOW() WHERE id = ?", tradeID); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	// Notify both users with dispute info
	_, _ = db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Trade auto-completed after 48 hours. If there is an issue, open a dispute.")
	_, _ = db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", sellerID, "Trade auto-completed after 48 hours. If there is an issue, open a dispute.")
	return nil
}

func autoExpireTrade(db *sql.DB, tradeID int) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Lock trade and fetch participants and current status
	var targetProductID, buyerID, sellerID int
	var currentStatus string
	err = tx.QueryRow(`
		SELECT target_product_id, buyer_id, seller_id, status
		FROM trades WHERE id = ? FOR UPDATE
	`, tradeID).Scan(&targetProductID, &buyerID, &sellerID, &currentStatus)
	if err != nil {
		return err
	}

	// Double-check status hasn't changed since the SELECT outside the tx
	switch currentStatus {
	case "pending", "accepted", "countered", "active":
		// valid for expiry
	default:
		return nil // Already moved to a terminal status; skip
	}

	// Unlock target product (only if currently locked)
	if _, err := tx.Exec("UPDATE products SET status='available', updated_at=NOW() WHERE id = ? AND status='locked'", targetProductID); err != nil {
		return err
	}

	// Unlock offered products
	offeredRows, err := tx.Query("SELECT product_id FROM trade_items WHERE trade_id = ?", tradeID)
	if err != nil {
		return err
	}
	var offeredPids []int
	for offeredRows.Next() {
		var pid int
		if err := offeredRows.Scan(&pid); err != nil {
			offeredRows.Close()
			return err
		}
		offeredPids = append(offeredPids, pid)
	}
	offeredRows.Close()
	for _, pid := range offeredPids {
		if _, err := tx.Exec("UPDATE products SET status='available', updated_at=NOW() WHERE id = ? AND status='locked'", pid); err != nil {
			return err
		}
	}

	// Update trade status to expired
	if _, err := tx.Exec("UPDATE trades SET status='expired', updated_at=NOW() WHERE id = ?", tradeID); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	// Notify both users (outside transaction)
	_, _ = db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)",
		buyerID, "A trade has expired due to 7 days of inactivity.")
	_, _ = db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)",
		sellerID, "A trade has expired due to 7 days of inactivity.")

	// Record trade event (system action, no actor)
	_, _ = db.Exec("INSERT INTO trade_events (trade_id, from_status, to_status, note) VALUES (?, ?, 'expired', 'Auto-expired after 7 days of inactivity')",
		tradeID, currentStatus)

	log.Printf("Trade %d auto-expired (was %s, inactive 7+ days)", tradeID, currentStatus)
	return nil
}

// dissolveExpiredMultiwayChains finds multi-way chains past their 18hr acceptance
// window and auto-dissolves them. The original trade is restored to 'pending' so
// the algorithm can re-search, and all parties are notified.
func dissolveExpiredMultiwayChains(db *sql.DB) error {
	// Check whether the multiway_trades table exists at all.
	var tblCount int
	if err := db.QueryRow(`
		SELECT COUNT(*) FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'multiway_trades'
	`).Scan(&tblCount); err != nil || tblCount == 0 {
		return nil // table does not exist yet; nothing to do
	}

	// Find expired chains that are still in a pending state.
	rows, err := db.Query(`
		SELECT id, chain_id, original_trade_id, user1_id, user2_id, user3_id, status
		FROM multiway_trades
		WHERE expires_at IS NOT NULL
		  AND expires_at <= NOW()
		  AND status IN ('pending_user3', 'pending_initiator_upgrade', 'searching')
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	type expiredChain struct {
		id, tradeID, u1, u2, u3 int
		chainID, status         string
	}
	var chains []expiredChain
	for rows.Next() {
		var c expiredChain
		var u3 sql.NullInt64
		if err := rows.Scan(&c.id, &c.chainID, &c.tradeID, &c.u1, &c.u2, &u3, &c.status); err != nil {
			continue
		}
		if u3.Valid {
			c.u3 = int(u3.Int64)
		}
		chains = append(chains, c)
	}

	for _, c := range chains {
		// Cancel the chain
		_, _ = db.Exec(`
			UPDATE multiway_trades
			SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
			WHERE id = ?
		`, c.id)

		// Restore the original trade back to pending so the matcher can re-try
		_, _ = db.Exec(`
			UPDATE trades
			SET status = 'pending', updated_at = NOW()
			WHERE id = ? AND status IN ('pending_multiway', 'multiway_active')
		`, c.tradeID)

		// Notify all parties
		msg := "A multi-way trade match has expired because not all parties accepted within 18 hours. Your items are available again."
		for _, uid := range []int{c.u1, c.u2, c.u3} {
			if uid <= 0 {
				continue
			}
			_, _ = db.Exec(
				"INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)",
				uid, msg,
			)
		}

		log.Printf("Auto-dissolved expired multiway chain %s (id=%d, was %s)", c.chainID, c.id, c.status)
	}

	return nil
}

// expireRematchHolds dissolves 12-hour re-match holds that expired without
// finding a replacement participant. Restores original trade to 'pending'.
func expireRematchHolds(db *sql.DB) error {
	// Check if table exists.
	var tblCount int
	if err := db.QueryRow(`
		SELECT COUNT(*) FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'multiway_rematch_holds'
	`).Scan(&tblCount); err != nil || tblCount == 0 {
		return nil
	}

	rows, err := db.Query(`
		SELECT id, chain_id, original_chain_id
		FROM multiway_rematch_holds
		WHERE status = 'searching' AND hold_expires_at <= NOW()
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	type expiredHold struct {
		id              int
		chainID         string
		originalChainID string
	}
	var holds []expiredHold
	for rows.Next() {
		var h expiredHold
		if err := rows.Scan(&h.id, &h.chainID, &h.originalChainID); err != nil {
			continue
		}
		holds = append(holds, h)
	}

	for _, hold := range holds {
		// Mark the hold as expired.
		_, _ = db.Exec("UPDATE multiway_rematch_holds SET status = 'expired' WHERE id = ?", hold.id)

		// Restore the original trade to pending.
		_, _ = db.Exec(`
			UPDATE trades SET status = 'pending', updated_at = NOW()
			WHERE id = (SELECT original_trade_id FROM multiway_trades WHERE chain_id = ?)
			  AND status IN ('pending_multiway', 'multiway_active')
		`, hold.originalChainID)

		// Notify all parties from the original chain.
		var u1, u2, u3 int
		if err := db.QueryRow("SELECT user1_id, user2_id, COALESCE(user3_id, 0) FROM multiway_trades WHERE chain_id = ?", hold.originalChainID).Scan(&u1, &u2, &u3); err == nil {
			msg := "The 12-hour search for a replacement participant has ended without finding a match. The chain has been dissolved and your items are available again."
			for _, uid := range []int{u1, u2, u3} {
				if uid > 0 {
					_, _ = db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", uid, msg)
				}
			}
		}

		log.Printf("Re-match hold expired for chain %s (original: %s)", hold.chainID, hold.originalChainID)
	}

	return nil
}
