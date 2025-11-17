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
