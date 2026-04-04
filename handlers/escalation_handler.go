package handlers

import (
	"database/sql"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
	"github.com/xashathebest/clovia/services"
)

type EscalationHandler struct {
	db  *sql.DB
	svc *services.EscalationService
}

func NewEscalationHandler() *EscalationHandler {
	return &EscalationHandler{
		db:  database.DB,
		svc: services.NewEscalationService(database.DB),
	}
}

// GetEscalationQueue retrieves the admin escalation queue with filtering and sorting
func (h *EscalationHandler) GetEscalationQueue(c *fiber.Ctx) error {
	// Parse query parameters
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	status := c.Query("status", "")
	sortBy := c.Query("sort_by", "created_at")

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 10
	}

	// Parse assigned_to filter
	var assignedToID *int
	if assignedToStr := c.Query("assigned_to", ""); assignedToStr != "" {
		if id, err := strconv.Atoi(assignedToStr); err == nil {
			assignedToID = &id
		}
	}

	// Get queue
	items, total, err := h.svc.GetEscalationQueue(page, limit, status, assignedToID, sortBy)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Message: "Failed to fetch escalations",
			Error:   err.Error(),
		})
	}

	totalPages := (total + limit - 1) / limit

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Escalations retrieved successfully",
		Data: models.PaginatedEscalationQueue{
			Items:      items,
			Total:      total,
			Page:       page,
			Limit:      limit,
			TotalPages: totalPages,
		},
	})
}

// GetEscalationDetail retrieves full escalation details with evidence
func (h *EscalationHandler) GetEscalationDetail(c *fiber.Ctx) error {
	escalationID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid escalation ID",
		})
	}

	detail, err := h.svc.GetEscalationDetail(escalationID)
	if err != nil {
		if err.Error() == "escalation not found" {
			return c.Status(404).JSON(models.APIResponse{
				Success: false,
				Error:   "Escalation not found",
			})
		}
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Escalation detail retrieved",
		Data:    detail,
	})
}

// AssignEscalation assigns an escalation to an admin
func (h *EscalationHandler) AssignEscalation(c *fiber.Ctx) error {
	escalationID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid escalation ID",
		})
	}

	type AssignRequest struct {
		AssignedToID int `json:"assigned_to_id" validate:"required"`
	}

	var req AssignRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Verify the assigned admin exists
	var adminID int
	if err := h.db.QueryRow("SELECT id FROM users WHERE id = ? AND role = 'admin'", req.AssignedToID).Scan(&adminID); err != nil {
		if err == sql.ErrNoRows {
			return c.Status(400).JSON(models.APIResponse{
				Success: false,
				Error:   "Admin user not found",
			})
		}
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	if err := h.svc.AssignEscalation(escalationID, req.AssignedToID); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	// Get details to return
	detail, _ := h.svc.GetEscalationDetail(escalationID)

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Escalation assigned successfully",
		Data:    detail,
	})
}

// ResolveEscalation submits a resolution for an escalation
func (h *EscalationHandler) ResolveEscalation(c *fiber.Ctx) error {
	escalationID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid escalation ID",
		})
	}

	type ResolveRequest struct {
		OutcomeType  string   `json:"outcome_type" validate:"required"`
		RefundAmount *float64 `json:"refund_amount"`
		Notes        *string  `json:"notes"`
	}

	var req ResolveRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Get admin ID from context
	adminID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	// Validate outcome type
	validOutcomes := map[string]bool{
		"proceed":              true,
		"cancel_return_strike": true,
		"suspend_pending":      true,
		"partial_refund":       true,
		"warning_only":         true,
		"conditional_strike":   true,
		"split_resolution":     true,
	}

	if !validOutcomes[req.OutcomeType] {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid outcome type",
		})
	}

	// Get escalation details for processing
	detail, err := h.svc.GetEscalationDetail(escalationID)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Escalation not found",
		})
	}

	// Process outcome
	if err := h.processResolutionOutcome(detail, req.OutcomeType); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to process resolution: " + err.Error(),
		})
	}

	// Save resolution
	if err := h.svc.ResolveEscalation(escalationID, adminID, req.OutcomeType, req.RefundAmount, req.Notes); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	// Get updated detail
	updatedDetail, _ := h.svc.GetEscalationDetail(escalationID)

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Escalation resolved successfully",
		Data:    updatedDetail,
	})
}

// GetEscalationStats returns dashboard statistics
func (h *EscalationHandler) GetEscalationStats(c *fiber.Ctx) error {
	stats, err := h.svc.GetEscalationStats()
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Stats retrieved successfully",
		Data:    stats,
	})
}

// Helper function to process resolution outcomes
func (h *EscalationHandler) processResolutionOutcome(detail *models.EscalationDetail, outcomeType string) error {
	reportedUserID := detail.Escalation.ReportedUserID

	switch outcomeType {
	case "cancel_return_strike":
		// Issue strike to reported user
		return h.issueStrike(reportedUserID, detail.Escalation.ID, "Escalation resolved with strike")

	case "suspend_pending":
		// Issue strike and check for auto-suspension
		if err := h.issueStrike(reportedUserID, detail.Escalation.ID, "Escalation resolved - user suspension pending"); err != nil {
			return err
		}
		// Check if this is 3rd strike for auto-suspension
		var strikeCount int
		if err := h.db.QueryRow("SELECT COUNT(*) FROM user_strikes WHERE user_id = ?", reportedUserID).Scan(&strikeCount); err != nil {
			return err
		}
		if strikeCount >= 3 {
			_, err := h.db.Exec("UPDATE users SET is_suspended = TRUE WHERE id = ?", reportedUserID)
			if err != nil {
				return err
			}
		}
		return nil

	case "partial_refund":
		// Refund handling would go here (integration with payment system)
		return nil

	case "warning_only":
		// Just mark as resolved, no strike
		return nil

	case "conditional_strike":
		// Record strike but don't apply yet (conditional logic)
		return h.issueStrike(reportedUserID, detail.Escalation.ID, "Escalation resolved - conditional strike")

	case "split_resolution":
		// Both parties warned - no strikes but warnings issued
		return nil

	default:
		// proceed - just dismiss
		return nil
	}
}

// Helper function to issue a strike
func (h *EscalationHandler) issueStrike(userID, escalationID int, reason string) error {
	_, err := h.db.Exec(`
		INSERT INTO user_strikes (user_id, dispute_id, reason)
		VALUES (?, ?, ?)
	`, userID, escalationID, reason)

	if err != nil {
		return err
	}

	// Increment strikes count
	_, err = h.db.Exec("UPDATE users SET strikes = strikes + 1 WHERE id = ?", userID)
	if err != nil {
		return err
	}

	return nil
}
