package services

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

type EscalationSLAScheduler struct {
	db *sql.DB
}

// StartEscalationSLAScheduler initializes and starts the background SLA checker
func StartEscalationSLAScheduler(db *sql.DB) {
	scheduler := &EscalationSLAScheduler{db: db}

	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()

		log.Println("✅ Escalation SLA Scheduler started (runs every 1 hour)")

		// Run immediately on startup
		if err := scheduler.CheckSLAMilestones(); err != nil {
			log.Printf("❌ Error checking SLA milestones: %v", err)
		}

		for range ticker.C {
			if err := scheduler.CheckSLAMilestones(); err != nil {
				log.Printf("❌ Error checking SLA milestones: %v", err)
			}
		}
	}()
}

// CheckSLAMilestones checks for overdue and upcoming SLA milestones
func (s *EscalationSLAScheduler) CheckSLAMilestones() error {
	// Find escalations reaching 72h remaining
	if err := s.checkMilestone("72h_remaining", 72, 71); err != nil {
		log.Printf("Error checking 72h milestone: %v", err)
	}

	// Find escalations reaching 48h remaining
	if err := s.checkMilestone("48h_remaining", 48, 47); err != nil {
		log.Printf("Error checking 48h milestone: %v", err)
	}

	// Find escalations reaching 24h remaining
	if err := s.checkMilestone("24h_remaining", 24, 23); err != nil {
		log.Printf("Error checking 24h milestone: %v", err)
	}

	// Find and flag overdue escalations
	if err := s.flagOverdueEscalations(); err != nil {
		log.Printf("Error flagging overdue escalations: %v", err)
	}

	return nil
}

// checkMilestone checks for escalations at a specific milestone
func (s *EscalationSLAScheduler) checkMilestone(milestone string, maxHours, minHours int) error {
	// Find escalations that haven't been reminded yet for this milestone
	// and are in the hour window
	rows, err := s.db.Query(`
		SELECT
			de.id,
			de.dispute_id,
			de.assigned_to_id,
			de.raised_by_id,
			de.reported_user_id,
			TIMESTAMPDIFF(HOUR, NOW(), de.sla_due_at) as hours_remaining
		FROM dispute_escalations de
		WHERE de.status IN ('open', 'under_review')
		AND de.sla_due_at > NOW()
		AND NOT EXISTS (
			SELECT 1 FROM escalation_reminders
			WHERE escalation_id = de.id AND milestone = ?
		)
		AND TIMESTAMPDIFF(HOUR, NOW(), de.sla_due_at) <= ?
		AND TIMESTAMPDIFF(HOUR, NOW(), de.sla_due_at) > ?
	`, milestone, maxHours, minHours)

	if err != nil {
		return fmt.Errorf("failed to query escalations for %s: %v", milestone, err)
	}
	defer rows.Close()

	for rows.Next() {
		var escalationID, assignedToID, raisedByID, reportedUserID, hoursRemaining int
		var disputeID sql.NullInt64

		if err := rows.Scan(&escalationID, &disputeID, &assignedToID, &raisedByID, &reportedUserID, &hoursRemaining); err != nil {
			continue
		}

		// Record the reminder
		_, err := s.db.Exec(`
			INSERT INTO escalation_reminders (escalation_id, milestone)
			VALUES (?, ?)
		`, escalationID, milestone)

		if err != nil {
			log.Printf("Failed to record reminder: %v", err)
			continue
		}

		// Send notifications (if assigned)
		if assignedToID > 0 {
			s.sendReminderNotification(escalationID, assignedToID, milestone, hoursRemaining)
		}

		log.Printf("✅ Recorded %s milestone reminder for escalation %d (hours remaining: %d)", milestone, escalationID, hoursRemaining)
	}

	return nil
}

// flagOverdueEscalations marks escalations as overdue and sends alerts
func (s *EscalationSLAScheduler) flagOverdueEscalations() error {
	rows, err := s.db.Query(`
		SELECT
			de.id,
			de.dispute_id,
			de.assigned_to_id,
			de.raised_by_id,
			de.reported_user_id,
			TIMESTAMPDIFF(HOUR, de.sla_due_at, NOW()) as hours_overdue
		FROM dispute_escalations de
		WHERE de.status IN ('open', 'under_review')
		AND de.sla_due_at <= NOW()
		AND NOT EXISTS (
			SELECT 1 FROM escalation_reminders
			WHERE escalation_id = de.id AND milestone = 'overdue'
		)
	`)

	if err != nil {
		return fmt.Errorf("failed to query overdue escalations: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var escalationID, assignedToID, raisedByID, reportedUserID, hoursOverdue int
		var disputeID sql.NullInt64

		if err := rows.Scan(&escalationID, &disputeID, &assignedToID, &raisedByID, &reportedUserID, &hoursOverdue); err != nil {
			continue
		}

		// Record the overdue reminder
		_, err := s.db.Exec(`
			INSERT INTO escalation_reminders (escalation_id, milestone)
			VALUES (?, 'overdue')
		`, escalationID)

		if err != nil {
			log.Printf("Failed to record overdue reminder: %v", err)
			continue
		}

		// Send urgent notification
		if assignedToID > 0 {
			s.sendOverdueNotification(escalationID, assignedToID, hoursOverdue)
		}

		log.Printf("🚨 Escalation %d is OVERDUE by %d hours", escalationID, hoursOverdue)
	}

	return nil
}

// sendReminderNotification (placeholder for email integration)
func (s *EscalationSLAScheduler) sendReminderNotification(escalationID, assignedToID int, milestone string, hoursRemaining int) {
	// In a real implementation, this would retrieve admin + party emails and send notifications
	// For now, just log the action
	log.Printf("📧 Would send %s reminder notification for escalation %d (admin: %d, hours: %d)",
		milestone, escalationID, assignedToID, hoursRemaining)
}

// sendOverdueNotification (placeholder for email integration)
func (s *EscalationSLAScheduler) sendOverdueNotification(escalationID, assignedToID, hoursOverdue int) {
	// In a real implementation, this would send urgent notification
	log.Printf("🚨 Would send URGENT overdue notification for escalation %d (admin: %d, hours overdue: %d)",
		escalationID, assignedToID, hoursOverdue)
}
