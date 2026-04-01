package services

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/xashathebest/clovia/models"
)

// MeetupReminderService handles pre-meetup reminders and notifications
type MeetupReminderService struct {
	db *sql.DB
}

// NewMeetupReminderService creates a new instance of MeetupReminderService
func NewMeetupReminderService(db *sql.DB) *MeetupReminderService {
	return &MeetupReminderService{db: db}
}

// SchedulePreMeetupReminders starts a background job to send reminders 24 hours before meetup
func (s *MeetupReminderService) SchedulePreMeetupReminders() {
	ticker := time.NewTicker(10 * time.Minute) // Check every 10 minutes for due reminders
	defer ticker.Stop()

	for range ticker.C {
		s.processPreMeetupReminders()
	}
}

// processPreMeetupReminders finds and sends reminders for trades with meetups scheduled within 24 hours
func (s *MeetupReminderService) processPreMeetupReminders() {
	query := `
		SELECT 
			t.id,
			t.buyer_id,
			t.seller_id,
			ms.agreed_time,
			ms.agreed_location,
			t.buyer_name,
			t.seller_name
		FROM trades t
		JOIN meetup_status ms ON t.id = ms.trade_id
		WHERE 
			t.status = 'active' 
			AND ms.stage = 'scheduled'
			AND ms.reminder_sent = 0
			AND ms.agreed_time IS NOT NULL
			AND ms.agreed_time >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
			AND ms.agreed_time <= DATE_ADD(NOW(), INTERVAL 1 DAY 1 MINUTE)
		LIMIT 50
	`

	rows, err := s.db.Query(query)
	if err != nil {
		log.Printf("Error fetching meetups for reminders: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var (
			tradeID    int
			buyerID    int
			sellerID   int
			agreedTime sql.NullTime
			location   sql.NullString
			buyerName  sql.NullString
			sellerName sql.NullString
		)

		err := rows.Scan(&tradeID, &buyerID, &sellerID, &agreedTime, &location, &buyerName, &sellerName)
		if err != nil {
			log.Printf("Error scanning reminder row: %v", err)
			continue
		}

		// Send reminder to both users
		mService := NewMeetupService(s.db)
		err = mService.SendPreMeetupReminder(tradeID, buyerID, sellerID)
		if err != nil {
			log.Printf("Error sending pre-meetup reminder for trade %d: %v", tradeID, err)
		}

		// Mark reminder as sent
		_, err = s.db.Exec(`
			UPDATE meetup_status 
			SET reminder_sent = 1, updated_at = NOW()
			WHERE trade_id = ?
		`, tradeID)

		if err != nil {
			log.Printf("Error marking reminder as sent for trade %d: %v", tradeID, err)
		}
	}
}

// SendPreMeetupReminderNotification sends a system message reminder
func (s *MeetupReminderService) SendPreMeetupReminderNotification(tradeID, userID int, scheduledTime string) error {
	systemMsg := &models.SystemMessage{
		MessageType: "pre_meetup_reminder",
		Title:       "🔔 Meetup Reminder!",
		Description: fmt.Sprintf("Your meetup is scheduled for %s. Please confirm you're ready to go!", scheduledTime),
		Actions: []models.Action{
			{
				Label:      "I'm Ready",
				ActionType: "confirm_attendance",
				Data: map[string]interface{}{
					"trade_id": tradeID,
					"user_id":  userID,
				},
			},
		},
	}

	// Insert into database
	_, err := s.db.Exec(`
		INSERT INTO meetup_system_messages (trade_id, message_type, title, description, actions, created_at)
		VALUES (?, ?, ?, ?, ?, NOW())
	`, tradeID, systemMsg.MessageType, systemMsg.Title, systemMsg.Description, fmt.Sprint(systemMsg.Actions))

	if err != nil {
		return fmt.Errorf("failed to save system message: %v", err)
	}

	return nil
}

// GetUpcomingMeetups returns trades with meetups scheduled in the next N hours
func (s *MeetupReminderService) GetUpcomingMeetups(hoursAhead int) ([]map[string]interface{}, error) {
	query := `
		SELECT 
			t.id,
			t.buyer_id,
			t.seller_id,
			ms.agreed_time,
			ms.agreed_location,
			t.buyer_name,
			t.seller_name
		FROM trades t
		JOIN meetup_status ms ON t.id = ms.trade_id
		WHERE 
			t.status = 'active' 
			AND ms.stage IN ('scheduled', 'on_the_way', 'arrived')
			AND ms.agreed_time IS NOT NULL
			AND ms.agreed_time >= NOW()
			AND ms.agreed_time <= DATE_ADD(NOW(), INTERVAL ? HOUR)
		ORDER BY ms.agreed_time ASC
	`

	rows, err := s.db.Query(query, hoursAhead)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch upcoming meetups: %v", err)
	}
	defer rows.Close()

	var meetups []map[string]interface{}

	for rows.Next() {
		var (
			tradeID    int
			buyerID    int
			sellerID   int
			agreedTime sql.NullTime
			location   sql.NullString
			buyerName  sql.NullString
			sellerName sql.NullString
		)

		err := rows.Scan(&tradeID, &buyerID, &sellerID, &agreedTime, &location, &buyerName, &sellerName)
		if err != nil {
			log.Printf("Error scanning upcoming meetup: %v", err)
			continue
		}

		meetup := map[string]interface{}{
			"trade_id":       tradeID,
			"buyer_id":       buyerID,
			"seller_id":      sellerID,
			"agreed_time":    agreedTime.Time,
			"location":       location.String,
			"buyer_name":     buyerName.String,
			"seller_name":    sellerName.String,
			"time_until_min": int(time.Until(agreedTime.Time).Minutes()),
		}

		meetups = append(meetups, meetup)
	}

	return meetups, nil
}

// CancelUncompleted Meetups handles no-show cases and updates status
func (s *MeetupReminderService) HandleNoShowFollowUp(tradeID int) error {
	// Query meetup status
	var stage, noShowReportedBy sql.NullString
	err := s.db.QueryRow(`
		SELECT stage, no_show_reported_by FROM meetup_status WHERE trade_id = ?
	`, tradeID).Scan(&stage, &noShowReportedBy)

	if err != nil {
		return fmt.Errorf("failed to fetch meetup status: %v", err)
	}

	if stage.String == "no_show" && noShowReportedBy.Valid {
		// Create system message for follow-up
		systemMsg := &models.SystemMessage{
			MessageType: "no_show_followup",
			Title:       "⚠️ Trade Marked as No-Show",
			Description: "This trade has been marked as no-show. Our support team will review the case within 24 hours. You can contact support if you need immediate assistance.",
			Actions: []models.Action{
				{
					Label:      "Contact Support",
					ActionType: "contact_support",
				},
			},
		}

		_, err := s.db.Exec(`
			INSERT INTO meetup_system_messages (trade_id, message_type, title, description, actions, created_at)
			VALUES (?, ?, ?, ?, ?, NOW())
		`, tradeID, systemMsg.MessageType, systemMsg.Title, systemMsg.Description, fmt.Sprint(systemMsg.Actions))

		if err != nil {
			return fmt.Errorf("failed to save follow-up message: %v", err)
		}
	}

	return nil
}
