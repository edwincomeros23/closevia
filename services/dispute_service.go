package services

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

// DisputeService handles background jobs for disputes
type DisputeService struct {
	db   *sql.DB
	done chan struct{}
}

// NewDisputeService creates a new dispute service
func NewDisputeService(db *sql.DB) *DisputeService {
	return &DisputeService{
		db:   db,
		done: make(chan struct{}),
	}
}

// StartAutoEscalationJob starts a background job to check and auto-escalate expired disputes
// Runs every 30 minutes by default
func (ds *DisputeService) StartAutoEscalationJob(interval time.Duration) {
	if interval == 0 {
		interval = 30 * time.Minute // Default: check every 30 minutes
	}

	ticker := time.NewTicker(interval)
	go func() {
		// Run immediately on startup
		log.Println("Starting initial dispute auto-escalation check...")
		if err := ds.AutoEscalateExpiredDisputes(); err != nil {
			log.Printf("Error in initial auto-escalation check: %v", err)
		}

		// Then run periodically
		for {
			select {
			case <-ticker.C:
				log.Println("Running scheduled dispute auto-escalation check...")
				if err := ds.AutoEscalateExpiredDisputes(); err != nil {
					log.Printf("Error in auto-escalation check: %v", err)
				}
			case <-ds.done:
				log.Println("Stopping dispute auto-escalation job")
				ticker.Stop()
				return
			}
		}
	}()
}

// StopAutoEscalationJob stops the background job
func (ds *DisputeService) StopAutoEscalationJob() {
	close(ds.done)
}

// AutoEscalateExpiredDisputes checks for disputes that have exceeded 48-hour deadline and auto-escalates them to admin
func (ds *DisputeService) AutoEscalateExpiredDisputes() error {
	now := time.Now()

	// Find all disputes that are past the 48-hour response deadline and not yet escalated
	rows, err := ds.db.Query(`
		SELECT id, trade_id, raised_by_id, reported_user_id, response_deadline, status
		FROM trade_disputes
		WHERE response_deadline IS NOT NULL
		AND response_deadline < ?
		AND status IN ('filed', 'mutual_resolution', 'negotiation')
		AND auto_escalated = FALSE
	`, now)

	if err != nil {
		log.Printf("Error querying expired disputes: %v", err)
		return err
	}
	defer rows.Close()

	var escalatedCount int
	for rows.Next() {
		var disputeID, tradeID, raisedByID, reportedUserID int
		var responseDeadline time.Time
		var status string

		if err := rows.Scan(&disputeID, &tradeID, &raisedByID, &reportedUserID, &responseDeadline, &status); err != nil {
			log.Printf("Error scanning dispute row: %v", err)
			continue
		}

		// Check if mutual agreement was reached (both parties agreed)
		var party1Agreed, party2Agreed bool
		err := ds.db.QueryRow(`
			SELECT mutual_agreement_party1, mutual_agreement_party2
			FROM trade_disputes
			WHERE id = ?
		`, disputeID).Scan(&party1Agreed, &party2Agreed)

		if err == nil && party1Agreed && party2Agreed {
			// Mutual agreement was reached, skip auto-escalation
			log.Printf("Dispute #%d skipped auto-escalation: mutual agreement reached", disputeID)
			continue
		}

		// Auto-escalate to admin
		escalationReason := fmt.Sprintf("Auto-escalated: No response or agreement within 48 hours. Previous status: %s", status)
		_, err = ds.db.Exec(`
			UPDATE trade_disputes
			SET status = 'admin_escalation', 
			    auto_escalated = TRUE, 
			    auto_escalated_at = ?,
			    escalation_reason = ?,
			    updated_at = ?
			WHERE id = ?
		`, now, escalationReason, now, disputeID)

		if err != nil {
			log.Printf("Error auto-escalating dispute #%d: %v", disputeID, err)
			continue
		}

		escalatedCount++

		// Notify admin (user_id = 1)
		_, _ = ds.db.Exec(`
			INSERT INTO notifications (user_id, type, message, is_read, created_at)
			VALUES (?, ?, ?, FALSE, ?)
		`, 1, "dispute_escalated_to_admin",
			fmt.Sprintf("Dispute #%d has been auto-escalated due to no response/agreement within 48 hours", disputeID), now)

		// Notify both parties
		_, _ = ds.db.Exec(`
			INSERT INTO notifications (user_id, type, message, is_read, created_at)
			VALUES (?, ?, ?, FALSE, ?), (?, ?, ?, FALSE, ?)
		`, raisedByID, "dispute_escalated", "Your dispute has been escalated to admin review due to no mutual agreement within 48 hours.", now,
			reportedUserID, "dispute_escalated", "Your dispute has been escalated to admin review due to no mutual agreement within 48 hours.", now)

		log.Printf("Auto-escalated dispute #%d to admin review", disputeID)
	}

	log.Printf("Auto-escalation complete: %d disputes escalated", escalatedCount)
	return nil
}
