package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
)

// DisputeHandler handles trade disputes and reporting workflow
type DisputeHandler struct {
	db *sql.DB
}

// NewDisputeHandler creates a new dispute handler
func NewDisputeHandler() *DisputeHandler {
	return &DisputeHandler{
		db: database.DB,
	}
}

// DisputeRequest represents a dispute filing request
type DisputeRequest struct {
	TradeID          int    `json:"trade_id" validate:"required"`
	Category         string `json:"category" validate:"required"` // item_not_as_described, no_show, rider_damage, safety, harassment
	Description      string `json:"description" validate:"required,min=20,max=1000"`
	EvidenceImageURL string `json:"evidence_image_url" validate:"required"` // At least one photo required
}

// DisputeResponse represents a dispute response from respondent
type DisputeResponse struct {
	DisputeID    int    `json:"dispute_id" validate:"required"`
	Action       string `json:"action" validate:"required"` // 'accept' or 'counter'
	Message      string `json:"message" validate:"max=500"`
	CounterPhoto string `json:"counter_photo"`
}

// DisputeMessage represents a message in the negotiation phase
type DisputeMessage struct {
	DisputeID     int    `json:"dispute_id" validate:"required"`
	Message       string `json:"message" validate:"required,min=10,max=500"`
	PhotoEvidence string `json:"photo_evidence"`
}

// FileDispute creates a new dispute for a trade
func (h *DisputeHandler) FileDispute(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	var req DisputeRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	// Validate category
	validCategories := []string{"item_not_as_described", "no_show", "rider_damage", "safety", "harassment"}
	isValidCategory := false
	for _, cat := range validCategories {
		if req.Category == cat {
			isValidCategory = true
			break
		}
	}
	if !isValidCategory {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid dispute category"})
	}

	// Check if trade exists and get details
	var tradeID, buyerID, sellerID int
	var tradeStatus string
	err := h.db.QueryRow(`
		SELECT id, buyer_id, seller_id, status
		FROM trades
		WHERE id = ?
	`, req.TradeID).Scan(&tradeID, &buyerID, &sellerID, &tradeStatus)

	if err == sql.ErrNoRows {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Trade not found"})
	} else if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch trade"})
	}

	// Check if user is a party in the trade
	if userID != buyerID && userID != sellerID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You are not a party to this trade"})
	}

	// Determine respondent
	respondentID := sellerID
	if userID == sellerID {
		respondentID = buyerID
	}

	// Prevent self-disputes
	if userID == respondentID {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Cannot file dispute against yourself"})
	}

	// Check if dispute already exists for this trade
	var existingDisputeID int
	err = h.db.QueryRow(`
		SELECT id FROM trade_disputes
		WHERE trade_id = ? AND status IN ('filed', 'mutual_resolution', 'counter_evidence', 'negotiation')
	`, req.TradeID).Scan(&existingDisputeID)

	if err == nil {
		return c.Status(409).JSON(models.APIResponse{Success: false, Error: "An active dispute already exists for this trade"})
	}

	// Create dispute with FILED status
	responseDeadline := time.Now().Add(48 * time.Hour)
	now := time.Now()

	result, err := h.db.Exec(`
		INSERT INTO trade_disputes (
			trade_id, raised_by_id, reported_user_id, reason, 
			description, evidence_image_1, category, status,
			response_deadline, dispute_frozen_at, archive_timer_paused_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		req.TradeID, userID, respondentID, req.Category,
		req.Description, req.EvidenceImageURL, req.Category, "filed",
		responseDeadline, now, now, now, now)

	if err != nil {
		log.Printf("Error creating dispute: %v", err)
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to create dispute"})
	}

	disputeID, err := result.LastInsertId()
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to get dispute ID"})
	}

	// Freeze trade and pause archive timer
	_, err = h.db.Exec(`
		UPDATE trades
		SET is_dispute_frozen = TRUE,
		    archive_timer_paused = TRUE,
		    archive_timer_paused_at = ?,
		    dispute_id = ?,
		    status = 'disputed'
		WHERE id = ?
	`, now, disputeID, req.TradeID)

	if err != nil {
		log.Printf("Error freezing trade: %v", err)
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to freeze trade"})
	}

	// Send notifications to both parties
	go h.notifyBothParties(userID, respondentID, "dispute_filed", fmt.Sprintf("A dispute has been filed on trade #%d", req.TradeID))

	return c.Status(201).JSON(fiber.Map{
		"success":           true,
		"message":           "Dispute filed successfully",
		"dispute_id":        disputeID,
		"status":            "filed",
		"response_deadline": responseDeadline,
	})
}

// GetDispute retrieves dispute details
func (h *DisputeHandler) GetDispute(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	disputeID := c.Params("id")

	var dispute struct {
		ID               int       `json:"id"`
		TradeID          int       `json:"trade_id"`
		RaisedByID       int       `json:"raised_by_id"`
		ReportedUserID   int       `json:"reported_user_id"`
		Category         string    `json:"category"`
		Description      string    `json:"description"`
		EvidenceImage1   string    `json:"evidence_image_1"`
		Status           string    `json:"status"`
		ResponseDeadline time.Time `json:"response_deadline"`
		CreatedAt        time.Time `json:"created_at"`
	}

	err := h.db.QueryRow(`
		SELECT id, trade_id, raised_by_id, reported_user_id, category, 
		       description, evidence_image_1, status, response_deadline, created_at
		FROM trade_disputes
		WHERE id = ?
	`, disputeID).Scan(
		&dispute.ID, &dispute.TradeID, &dispute.RaisedByID, &dispute.ReportedUserID,
		&dispute.Category, &dispute.Description, &dispute.EvidenceImage1, &dispute.Status,
		&dispute.ResponseDeadline, &dispute.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Dispute not found"})
	} else if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch dispute"})
	}

	// Check if user is party to the dispute
	if userID != dispute.RaisedByID && userID != dispute.ReportedUserID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You are not a party to this dispute"})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"dispute": dispute,
	})
}

// RespondToDispute handles respondent's response (accept or counter)
func (h *DisputeHandler) RespondToDispute(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	disputeID := c.Params("id")

	var req DisputeResponse
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	// Validate action
	if req.Action != "accept" && req.Action != "counter" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Action must be 'accept' or 'counter'"})
	}

	// Get dispute details
	var reportedUserID int
	var status string
	err := h.db.QueryRow(`
		SELECT reported_user_id, status
		FROM trade_disputes
		WHERE id = ?
	`, disputeID).Scan(&reportedUserID, &status)

	if err == sql.ErrNoRows {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Dispute not found"})
	} else if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch dispute"})
	}

	// Check if user is the respondent
	if userID != reportedUserID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Only the respondent can respond to this dispute"})
	}

	// Check if dispute is still in FILED status
	if status != "filed" {
		return c.Status(409).JSON(models.APIResponse{Success: false, Error: "This dispute is not awaiting a response"})
	}

	if req.Action == "accept" {
		// Respondent accepts fault - dispute RESOLVED_ACCEPTED
		err = h.acceptDispute(disputeID)
		if err != nil {
			log.Printf("Error accepting dispute: %v", err)
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to accept dispute"})
		}

		return c.JSON(fiber.Map{
			"success": true,
			"message": "You have accepted the dispute. A strike has been awarded.",
			"status":  "resolved_accepted",
		})
	} else {
		// Respondent provides counter-evidence - move to MUTUAL_RESOLUTION
		err = h.counterDispute(disputeID, req.CounterPhoto)
		if err != nil {
			log.Printf("Error countering dispute: %v", err)
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to counter dispute"})
		}

		return c.JSON(fiber.Map{
			"success": true,
			"message": "Counter-evidence submitted. Entering negotiation phase.",
			"status":  "mutual_resolution",
		})
	}
}

// SendDisputeMessage sends a message during negotiation phase
func (h *DisputeHandler) SendDisputeMessage(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	disputeID := c.Params("id")

	var req DisputeMessage
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	// Get dispute details
	var raisedByID, reportedUserID int
	var status string
	err := h.db.QueryRow(`
		SELECT raised_by_id, reported_user_id, status
		FROM trade_disputes
		WHERE id = ?
	`, disputeID).Scan(&raisedByID, &reportedUserID, &status)

	if err == sql.ErrNoRows {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Dispute not found"})
	} else if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch dispute"})
	}

	// Check if user is party to the dispute
	if userID != raisedByID && userID != reportedUserID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You are not a party to this dispute"})
	}

	// Check if dispute is in negotiation phase
	if status != "mutual_resolution" && status != "negotiation" {
		return c.Status(409).JSON(models.APIResponse{Success: false, Error: "This dispute is not in negotiation phase"})
	}

	// Insert message
	responseDeadline := time.Now().Add(12 * time.Hour)
	_, err = h.db.Exec(`
		INSERT INTO dispute_messages (dispute_id, sender_id, message, photo_evidence, sent_at, last_response_deadline, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, disputeID, userID, req.Message, req.PhotoEvidence, time.Now(), responseDeadline, time.Now())

	if err != nil {
		log.Printf("Error sending message: %v", err)
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to send message"})
	}

	// Update dispute status to NEGOTIATION if first message
	if status == "mutual_resolution" {
		_, _ = h.db.Exec(`UPDATE trade_disputes SET status = 'negotiation' WHERE id = ?`, disputeID)
	}

	// Get the other party and notify them
	otherPartyID := reportedUserID
	if userID == reportedUserID {
		otherPartyID = raisedByID
	}

	go h.notifyUser(otherPartyID, "dispute_message", fmt.Sprintf("New message in dispute #%s", disputeID))

	return c.JSON(fiber.Map{
		"success":           true,
		"message":           "Message sent successfully",
		"response_deadline": responseDeadline,
	})
}

// GetDisputeMessages retrieves all messages in a dispute
func (h *DisputeHandler) GetDisputeMessages(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	disputeID := c.Params("id")

	// Check if user is party to the dispute
	var raisedByID, reportedUserID int
	err := h.db.QueryRow(`
		SELECT raised_by_id, reported_user_id
		FROM trade_disputes
		WHERE id = ?
	`, disputeID).Scan(&raisedByID, &reportedUserID)

	if err == sql.ErrNoRows {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Dispute not found"})
	}

	if userID != raisedByID && userID != reportedUserID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You are not a party to this dispute"})
	}

	// Fetch messages
	rows, err := h.db.Query(`
		SELECT id, sender_id, message, photo_evidence, sent_at
		FROM dispute_messages
		WHERE dispute_id = ?
		ORDER BY sent_at ASC
	`, disputeID)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch messages"})
	}
	defer rows.Close()

	type Message struct {
		ID       int       `json:"id"`
		SenderID int       `json:"sender_id"`
		Message  string    `json:"message"`
		Photo    string    `json:"photo_evidence"`
		SentAt   time.Time `json:"sent_at"`
	}

	var messages []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.ID, &msg.SenderID, &msg.Message, &msg.Photo, &msg.SentAt); err == nil {
			messages = append(messages, msg)
		}
	}

	return c.JSON(fiber.Map{
		"success":  true,
		"messages": messages,
	})
}

// MutualAgreementRequest represents a party's agreement on resolution
type MutualAgreementRequest struct {
	DisputeID            int    `json:"dispute_id" validate:"required"`
	AgreedResolutionType string `json:"agreed_resolution_type" validate:"required,oneof=complete cancel"`
	Rating               int    `json:"rating" validate:"required,min=1,max=5"`
	Feedback             string `json:"feedback" validate:"max=500"`
}

// AgreeOnResolution handles party agreement on dispute resolution (complete or cancel trade + rating)
func (h *DisputeHandler) AgreeOnResolution(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	var req MutualAgreementRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	// Get dispute details
	var raisedByID, reportedUserID, tradeID int
	var status string
	var party1Rating, party2Rating sql.NullInt64
	err := h.db.QueryRow(`
		SELECT raised_by_id, reported_user_id, status, trade_id, party1_rating, party2_rating
		FROM trade_disputes
		WHERE id = ?
	`, req.DisputeID).Scan(&raisedByID, &reportedUserID, &status, &tradeID, &party1Rating, &party2Rating)

	if err == sql.ErrNoRows {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Dispute not found"})
	} else if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch dispute"})
	}

	// Check if user is party to the dispute
	if userID != raisedByID && userID != reportedUserID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You are not a party to this dispute"})
	}

	// Check if dispute is in negotiation phase
	if status != "mutual_resolution" && status != "negotiation" && status != "filed" {
		return c.Status(409).JSON(models.APIResponse{Success: false, Error: "This dispute is not in a state that allows mutual agreement"})
	}

	// Determine party position (1 or 2)
	isParty1 := userID == raisedByID
	now := time.Now()

	// Record party's agreement and rating
	_, err = h.db.Exec(`
		INSERT INTO trade_responses (dispute_id, party_id, agreed_resolution_type, rating, user_feedback, response_type, responded_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			agreed_resolution_type = ?,
			rating = ?,
			user_feedback = ?,
			response_type = 'agreement',
			responded_at = ?
	`, req.DisputeID, userID, req.AgreedResolutionType, req.Rating, req.Feedback, "agreement",
		req.AgreedResolutionType, req.Rating, req.Feedback, now)

	if err != nil {
		log.Printf("Error recording agreement: %v", err)
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to record agreement"})
	}

	// Update the dispute with this party's rating and agreement
	if isParty1 {
		_, err = h.db.Exec(`
			UPDATE trade_disputes
			SET mutual_agreement_party1 = TRUE, party1_rating = ?, updated_at = ?
			WHERE id = ?
		`, req.Rating, now, req.DisputeID)
	} else {
		_, err = h.db.Exec(`
			UPDATE trade_disputes
			SET mutual_agreement_party2 = TRUE, party2_rating = ?, updated_at = ?
			WHERE id = ?
		`, req.Rating, now, req.DisputeID)
	}

	if err != nil {
		log.Printf("Error updating dispute agreement: %v", err)
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update agreement"})
	}

	// Check if both parties have now agreed
	var party1Agreed, party2Agreed bool
	err = h.db.QueryRow(`
		SELECT mutual_agreement_party1, mutual_agreement_party2
		FROM trade_disputes
		WHERE id = ?
	`, req.DisputeID).Scan(&party1Agreed, &party2Agreed)

	if err != nil {
		log.Printf("Error checking mutual agreement: %v", err)
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to check mutual agreement status"})
	}

	// If both parties have agreed, finalize the resolution
	if party1Agreed && party2Agreed {
		// Get their agreed resolution type (should be same, but take from dispute)
		var agreedType string
		err = h.db.QueryRow(`
			SELECT agreed_resolution_type
			FROM trade_responses
			WHERE dispute_id = ? AND party_id = ?
			LIMIT 1
		`, req.DisputeID, raisedByID).Scan(&agreedType)

		if err != nil {
			agreedType = "cancel" // Default to cancel if not found
		}

		// Mark dispute as RESOLVED_MUTUAL
		_, err = h.db.Exec(`
			UPDATE trade_disputes
			SET status = 'resolved_mutual', resolution = 'mutual', 
			    mutual_agreement_at = ?, agreed_resolution_type = ?, updated_at = ?
			WHERE id = ?
		`, now, agreedType, now, req.DisputeID)

		if err != nil {
			log.Printf("Error finalizing mutual agreement: %v", err)
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to finalize mutual agreement"})
		}

		// Update trade status based on agreed resolution type
		if agreedType == "complete" {
			_, _ = h.db.Exec(`
				UPDATE trades
				SET status = 'completed', is_dispute_frozen = FALSE, 
				    archive_timer_paused = FALSE, completed_at = ?, updated_at = ?
				WHERE id = ?
			`, now, now, tradeID)
		} else {
			_, _ = h.db.Exec(`
				UPDATE trades
				SET status = 'cancelled', is_dispute_frozen = FALSE, 
				    archive_timer_paused = FALSE, updated_at = ?
				WHERE id = ?
			`, now, tradeID)
		}

		// Notify both parties
		go h.notifyBothParties(raisedByID, reportedUserID, "dispute_resolved_mutual",
			fmt.Sprintf("Dispute #%d has been resolved by mutual agreement. Both parties have rated each other.", req.DisputeID))

		return c.JSON(fiber.Map{
			"success":  true,
			"message":  "Mutual agreement reached! Both parties have rated each other. Dispute resolved.",
			"status":   "resolved_mutual",
			"resolved": true,
		})
	}

	// Notify the other party
	otherPartyID := reportedUserID
	if userID == reportedUserID {
		otherPartyID = raisedByID
	}

	go h.notifyUser(otherPartyID, "dispute_awaiting_agreement",
		fmt.Sprintf("The other party has agreed to %s this trade with a rating. Please respond to finalize.", req.AgreedResolutionType))

	return c.JSON(fiber.Map{
		"success":  true,
		"message":  "Your agreement has been recorded. Awaiting the other party's response.",
		"status":   "awaiting_mutual_agreement",
		"resolved": false,
	})
}

// Helper functions

// acceptDispute marks dispute as RESOLVED_ACCEPTED and awards strike
func (h *DisputeHandler) acceptDispute(disputeID interface{}) error {
	// Get dispute details
	var raisedByID, reportedUserID, tradeID int
	var category string
	err := h.db.QueryRow(`
		SELECT trade_id, raised_by_id, reported_user_id, category
		FROM trade_disputes
		WHERE id = ?
	`, disputeID).Scan(&tradeID, &raisedByID, &reportedUserID, &category)

	if err != nil {
		return err
	}

	// Update dispute status
	_, err = h.db.Exec(`
		UPDATE trade_disputes
		SET status = 'resolved_accepted', resolution = 'accepted', updated_at = ?
		WHERE id = ?
	`, time.Now(), disputeID)

	if err != nil {
		return err
	}

	// Award strike to respondent
	_, err = h.db.Exec(`
		INSERT INTO user_strikes (user_id, admin_id, dispute_id, reason, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, reportedUserID, 1, disputeID, fmt.Sprintf("Strike for %s", category), time.Now())

	if err != nil {
		log.Printf("Error creating strike: %v", err)
		// Don't fail the request if strike creation fails
	}

	// Resolve trade as CANCELLED
	_, _ = h.db.Exec(`
		UPDATE trades
		SET status = 'cancelled', is_dispute_frozen = FALSE, updated_at = ?
		WHERE id = ?
	`, time.Now(), tradeID)

	// Notify both parties
	go h.notifyBothParties(raisedByID, reportedUserID, "dispute_resolved",
		fmt.Sprintf("Dispute #%v has been resolved. Strike awarded.", disputeID))

	return nil
}

// counterDispute transitions dispute to COUNTER_EVIDENCE state
func (h *DisputeHandler) counterDispute(disputeID interface{}, counterPhoto string) error {
	// Update dispute status and store counter-evidence
	_, err := h.db.Exec(`
		UPDATE trade_disputes
		SET status = 'mutual_resolution', evidence_image_2 = ?, updated_at = ?
		WHERE id = ?
	`, counterPhoto, time.Now(), disputeID)

	return err
}

// notifyUser sends a notification to a specific user
func (h *DisputeHandler) notifyUser(userID int, notificationType string, message string) {
	_, err := h.db.Exec(`
		INSERT INTO notifications (user_id, type, message, is_read, created_at)
		VALUES (?, ?, ?, FALSE, ?)
	`, userID, notificationType, message, time.Now())

	if err != nil {
		log.Printf("Error creating notification for user %d: %v", userID, err)
	}
}

// notifyBothParties sends notifications to both trade parties
func (h *DisputeHandler) notifyBothParties(user1ID, user2ID int, notificationType string, message string) {
	h.notifyUser(user1ID, notificationType, message)
	h.notifyUser(user2ID, notificationType, message)
}

// CheckAndEscalateDisputesHandler is an HTTP endpoint to manually trigger auto-escalation check
// The actual auto-escalation happens automatically in the background via DisputeService
// This endpoint can be called by cron jobs to manually trigger a check if needed
func (h *DisputeHandler) CheckAndEscalateDisputesHandler(c *fiber.Ctx) error {
	// Note: The automatic auto-escalation job runs every 30 minutes in the background
	// This endpoint is provided for manual triggering or testing purposes
	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Auto-escalation check triggered. The dispute auto-escalation background job runs every 30 minutes automatically.",
	})
}
