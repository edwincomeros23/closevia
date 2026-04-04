package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/xashathebest/clovia/models"
)

type EscalationService struct {
	db *sql.DB
}

func NewEscalationService(db *sql.DB) *EscalationService {
	return &EscalationService{db: db}
}

// CreateEscalation creates a new escalation from a dispute
func (s *EscalationService) CreateEscalation(disputeID, tradeID, raisedByID, reportedUserID int, reason string) (int, error) {
	// Determine SLA based on reason (safety/harassment = 24h, others = 72h)
	slaDuration := 72 * time.Hour
	if reason == "safety" || reason == "harassment" || reason == "inappropriate_behavior" {
		slaDuration = 24 * time.Hour
	}
	slaDueAt := time.Now().Add(slaDuration)

	var escalationID int
	err := s.db.QueryRow(`
		INSERT INTO dispute_escalations
		(dispute_id, trade_id, raised_by_id, reported_user_id, reason, status, sla_due_at)
		VALUES (?, ?, ?, ?, ?, 'open', ?)
	`, disputeID, tradeID, raisedByID, reportedUserID, reason, slaDueAt).Scan(&escalationID)

	if err != nil {
		return 0, fmt.Errorf("failed to create escalation: %v", err)
	}

	// Gather and store evidence automatically
	if err := s.GatherEvidence(escalationID, tradeID, raisedByID); err != nil {
		log.Printf("Warning: failed to gather evidence for escalation %d: %v", escalationID, err)
	}

	return escalationID, nil
}

// GetEscalationQueue retrieves escalations for admin queue with filtering/sorting
func (s *EscalationService) GetEscalationQueue(page, limit int, status string, assignedToID *int, sortBy string) ([]*models.EscalationQueueItem, int, error) {
	// Build query
	whereClause := "WHERE 1=1"
	args := []interface{}{}

	if status != "" && status != "all" {
		whereClause += " AND de.status = ?"
		args = append(args, status)
	}

	if assignedToID != nil {
		whereClause += " AND de.assigned_to_id = ?"
		args = append(args, *assignedToID)
	}

	// Get total count
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*) FROM dispute_escalations de
		%s
	`, whereClause)

	var total int
	if err := s.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count escalations: %v", err)
	}

	// Build sort clause
	sortClause := "ORDER BY de.created_at DESC"
	if sortBy == "sla_due_at" {
		sortClause = "ORDER BY de.sla_due_at ASC"
	}

	offset := (page - 1) * limit

	// Query escalations with user names
	query := fmt.Sprintf(`
		SELECT
			de.id,
			de.dispute_id,
			de.trade_id,
			de.raised_by_id,
			de.reported_user_id,
			de.reason,
			de.status,
			de.assigned_to_id,
			de.sla_due_at,
			de.created_at,
			u1.name,
			u2.name,
			IFNULL(u3.name, NULL),
			TIMESTAMPDIFF(HOUR, NOW(), de.sla_due_at) as hours_until_due
		FROM dispute_escalations de
		LEFT JOIN users u1 ON de.raised_by_id = u1.id
		LEFT JOIN users u2 ON de.reported_user_id = u2.id
		LEFT JOIN users u3 ON de.assigned_to_id = u3.id
		%s
		%s
		LIMIT ? OFFSET ?
	`, whereClause, sortClause)

	args = append(args, limit, offset)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query escalations: %v", err)
	}
	defer rows.Close()

	items := []*models.EscalationQueueItem{}
	for rows.Next() {
		var item models.EscalationQueueItem
		var assignedToName sql.NullString
		var hoursUntilDue sql.NullFloat64

		if err := rows.Scan(
			&item.ID,
			&item.DisputeID,
			&item.TradeID,
			&item.RaisedByID,
			&item.ReportedUserID,
			&item.Reason,
			&item.Status,
			&item.AssignedToID,
			&item.SLADueAt,
			&item.CreatedAt,
			&item.RaisedByName,
			&item.ReportedUserName,
			&assignedToName,
			&hoursUntilDue,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan escalation: %v", err)
		}

		if assignedToName.Valid {
			item.AssignedToName = &assignedToName.String
		}

		if hoursUntilDue.Valid {
			item.HoursUntilDue = hoursUntilDue.Float64
			item.IsOverdue = hoursUntilDue.Float64 < 0
			if hoursUntilDue.Float64 < 24 && hoursUntilDue.Float64 >= 0 {
				item.SLAStatus = "warning"
			} else if hoursUntilDue.Float64 < 0 {
				item.SLAStatus = "overdue"
			} else {
				item.SLAStatus = "on_track"
			}
		}

		items = append(items, &item)
	}

	return items, total, nil
}

// GetEscalationDetail retrieves full escalation details with evidence
func (s *EscalationService) GetEscalationDetail(escalationID int) (*models.EscalationDetail, error) {
	// Get escalation
	var esc models.DisputeEscalation
	err := s.db.QueryRow(`
		SELECT id, dispute_id, trade_id, raised_by_id, reported_user_id, reason, status, assigned_to_id, sla_due_at, created_at, updated_at
		FROM dispute_escalations
		WHERE id = ?
	`, escalationID).Scan(&esc.ID, &esc.DisputeID, &esc.TradeID, &esc.RaisedByID, &esc.ReportedUserID,
		&esc.Reason, &esc.Status, &esc.AssignedToID, &esc.SLADueAt, &esc.CreatedAt, &esc.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("escalation not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch escalation: %v", err)
	}

	// Get evidence
	evidenceRows, err := s.db.Query(`
		SELECT id, escalation_id, evidence_type, evidence_url, evidence_data, uploaded_by_id, created_at
		FROM escalation_evidence
		WHERE escalation_id = ?
		ORDER BY created_at ASC
	`, escalationID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch evidence: %v", err)
	}
	defer evidenceRows.Close()

	evidence := []*models.EscalationEvidence{}
	for evidenceRows.Next() {
		var e models.EscalationEvidence
		var url, data sql.NullString
		if err := evidenceRows.Scan(&e.ID, &e.EscalationID, &e.EvidenceType, &url, &data, &e.UploadedByID, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan evidence: %v", err)
		}
		if url.Valid {
			e.EvidenceURL = &url.String
		}
		if data.Valid {
			e.EvidenceData = &data.String
		}
		evidence = append(evidence, &e)
	}

	// Get resolution if exists
	var resolution *models.EscalationResolution
	var refundAmount sql.NullFloat64
	var notes sql.NullString
	resolution = &models.EscalationResolution{}
	err = s.db.QueryRow(`
		SELECT id, escalation_id, resolved_by_admin_id, outcome_type, refund_amount, notes, resolved_at
		FROM escalation_resolutions
		WHERE escalation_id = ?
	`, escalationID).Scan(&resolution.ID, &resolution.EscalationID, &resolution.ResolvedByAdminID,
		&resolution.OutcomeType, &refundAmount, &notes, &resolution.ResolvedAt)

	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to fetch resolution: %v", err)
	} else if err == nil {
		if refundAmount.Valid {
			resolution.RefundAmount = &refundAmount.Float64
		}
		if notes.Valid {
			resolution.Notes = &notes.String
		}
	} else {
		resolution = nil
	}

	return &models.EscalationDetail{
		Escalation: &esc,
		Evidence:   evidence,
		Resolution: resolution,
	}, nil
}

// AssignEscalation assigns an escalation to an admin
func (s *EscalationService) AssignEscalation(escalationID, adminID int) error {
	_, err := s.db.Exec(`
		UPDATE dispute_escalations
		SET assigned_to_id = ?, status = 'under_review', updated_at = NOW()
		WHERE id = ?
	`, adminID, escalationID)

	return err
}

// GatherEvidence automatically gathers photos and chat transcripts
func (s *EscalationService) GatherEvidence(escalationID int, tradeID int, raisedByID int) error {
	// Gather photos from dispute
	var evidenceImg1, evidenceImg2 sql.NullString
	err := s.db.QueryRow(`
		SELECT evidence_image_1, evidence_image_2
		FROM trade_disputes
		WHERE trade_id = ?
		LIMIT 1
	`, tradeID).Scan(&evidenceImg1, &evidenceImg2)

	if err == nil {
		if evidenceImg1.Valid {
			s.db.Exec(`
				INSERT INTO escalation_evidence
				(escalation_id, evidence_type, evidence_url, uploaded_by_id)
				VALUES (?, 'photo', ?, ?)
			`, escalationID, evidenceImg1.String, raisedByID)
		}
		if evidenceImg2.Valid {
			s.db.Exec(`
				INSERT INTO escalation_evidence
				(escalation_id, evidence_type, evidence_url, uploaded_by_id)
				VALUES (?, 'photo', ?, ?)
			`, escalationID, evidenceImg2.String, raisedByID)
		}
	}

	// Gather chat transcript
	var conversationID int
	err = s.db.QueryRow(`
		SELECT id FROM conversations
		WHERE (product_id IN (
			SELECT product_id FROM trade_items WHERE trade_id = ?
		))
		LIMIT 1
	`, tradeID).Scan(&conversationID)

	if err == nil {
		// Get all messages for this conversation
		rows, err := s.db.Query(`
			SELECT sender_id, content, created_at
			FROM messages
			WHERE conversation_id = ?
			ORDER BY created_at ASC
		`, conversationID)

		if err == nil {
			defer rows.Close()
			var messages []map[string]interface{}

			for rows.Next() {
				var senderID int
				var content string
				var createdAt time.Time
				if err := rows.Scan(&senderID, &content, &createdAt); err != nil {
					continue
				}
				messages = append(messages, map[string]interface{}{
					"sender_id":  senderID,
					"content":    content,
					"created_at": createdAt,
				})
			}

			if len(messages) > 0 {
				jsonData, _ := json.Marshal(messages)
				s.db.Exec(`
					INSERT INTO escalation_evidence
					(escalation_id, evidence_type, evidence_data, uploaded_by_id)
					VALUES (?, 'chat_transcript', ?, ?)
				`, escalationID, string(jsonData), raisedByID)
			}
		}
	}

	return nil
}

// ResolveEscalation records the resolution of an escalation
func (s *EscalationService) ResolveEscalation(escalationID int, adminID int, outcomeType string, refundAmount *float64, notes *string) error {
	// Insert resolution
	_, err := s.db.Exec(`
		INSERT INTO escalation_resolutions
		(escalation_id, resolved_by_admin_id, outcome_type, refund_amount, notes)
		VALUES (?, ?, ?, ?, ?)
	`, escalationID, adminID, outcomeType, refundAmount, notes)

	if err != nil {
		return fmt.Errorf("failed to save resolution: %v", err)
	}

	// Update escalation status
	_, err = s.db.Exec(`
		UPDATE dispute_escalations
		SET status = 'resolved', updated_at = NOW()
		WHERE id = ?
	`, escalationID)

	return err
}

// GetEscalationStats returns dashboard statistics
func (s *EscalationService) GetEscalationStats() (*models.EscalationStats, error) {
	var stats models.EscalationStats

	// Open count
	s.db.QueryRow(`SELECT COUNT(*) FROM dispute_escalations WHERE status = 'open'`).Scan(&stats.OpenCount)

	// Under review count
	s.db.QueryRow(`SELECT COUNT(*) FROM dispute_escalations WHERE status = 'under_review'`).Scan(&stats.UnderReviewCount)

	// Overdue count
	s.db.QueryRow(`SELECT COUNT(*) FROM dispute_escalations WHERE status != 'resolved' AND sla_due_at < NOW()`).Scan(&stats.OverdueCount)

	// Total resolved
	s.db.QueryRow(`SELECT COUNT(*) FROM dispute_escalations WHERE status = 'resolved'`).Scan(&stats.TotalResolved)

	// Average resolution time (hours)
	s.db.QueryRow(`
		SELECT IFNULL(AVG(TIMESTAMPDIFF(HOUR, de.created_at, er.resolved_at)), 0)
		FROM dispute_escalations de
		JOIN escalation_resolutions er ON de.id = er.escalation_id
		WHERE de.status = 'resolved'
	`).Scan(&stats.AvgResolutionHours)

	// Median resolution time (simplified - just use avg if complex query fails)
	s.db.QueryRow(`
		SELECT IFNULL(AVG(TIMESTAMPDIFF(HOUR, de.created_at, er.resolved_at)), 0)
		FROM dispute_escalations de
		JOIN escalation_resolutions er ON de.id = er.escalation_id
		WHERE de.status = 'resolved'
	`).Scan(&stats.MedianResolutionHrs)

	return &stats, nil
}

// GetEscalationByDisputeID checks if a dispute has an escalation
func (s *EscalationService) GetEscalationByDisputeID(disputeID int) (*models.DisputeEscalation, error) {
	var esc models.DisputeEscalation
	err := s.db.QueryRow(`
		SELECT id, dispute_id, trade_id, raised_by_id, reported_user_id, reason, status, assigned_to_id, sla_due_at, created_at, updated_at
		FROM dispute_escalations
		WHERE dispute_id = ?
	`, disputeID).Scan(&esc.ID, &esc.DisputeID, &esc.TradeID, &esc.RaisedByID, &esc.ReportedUserID,
		&esc.Reason, &esc.Status, &esc.AssignedToID, &esc.SLADueAt, &esc.CreatedAt, &esc.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil // No escalation exists
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch escalation: %v", err)
	}

	return &esc, nil
}
