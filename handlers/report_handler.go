package handlers

import (
	"database/sql"
	"fmt"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
)

// ReportHandler handles user reports
type ReportHandler struct {
	db *sql.DB
}

// NewReportHandler creates a new report handler
func NewReportHandler() *ReportHandler {
	return &ReportHandler{
		db: database.DB,
	}
}

// CreateReport creates a new report against a trader
func (h *ReportHandler) CreateReport(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	var req models.ReportCreate
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Prevent self-reporting
	if req.ReportedUserID == userID {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "You cannot report yourself",
		})
	}

	// Check if reported user exists
	var reportedUserExists bool
	err := h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = ?)", req.ReportedUserID).Scan(&reportedUserExists)
	if err != nil || !reportedUserExists {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Reported user not found",
		})
	}

	// Check if product exists (if provided)
	if req.ProductID != nil {
		var productExists bool
		err := h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM products WHERE id = ?)", *req.ProductID).Scan(&productExists)
		if err != nil || !productExists {
			return c.Status(404).JSON(models.APIResponse{
				Success: false,
				Error:   "Product not found",
			})
		}
	}

	// Check for duplicate reports from same user in last 7 days
	var duplicateCount int
	err = h.db.QueryRow(`
		SELECT COUNT(*) FROM reports 
		WHERE reporter_id = ? 
		AND reported_user_id = ? 
		AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
	`, userID, req.ReportedUserID).Scan(&duplicateCount)

	if err == nil && duplicateCount > 0 {
		return c.Status(409).JSON(models.APIResponse{
			Success: false,
			Error:   "You have already reported this user recently",
		})
	}

	// Create report
	result, err := h.db.Exec(`
		INSERT INTO reports (reporter_id, reported_user_id, product_id, reason, description, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW())
	`, userID, req.ReportedUserID, req.ProductID, req.Reason, req.Description)

	if err != nil {
		fmt.Printf("❌ Error creating report: %v\n", err)
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to create report",
		})
	}

	reportID, _ := result.LastInsertId()

	return c.Status(201).JSON(models.APIResponse{
		Success: true,
		Message: "Report submitted successfully",
		Data: fiber.Map{
			"id": reportID,
		},
	})
}

// GetReports gets all reports (admin only) — includes reporter/reported names
func (h *ReportHandler) GetReports(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	status := c.Query("status", "") // Filter by status
	offset := (page - 1) * limit

	// Build count query
	countQuery := "SELECT COUNT(*) FROM reports"
	var countArgs []interface{}
	if status != "" {
		countQuery += " WHERE status = ?"
		countArgs = append(countArgs, status)
	}

	var total int
	err := h.db.QueryRow(countQuery, countArgs...).Scan(&total)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get reports count",
		})
	}

	// Rich query: JOIN with users to get names
	query := `
		SELECT 
			r.id, r.reporter_id, r.reported_user_id, r.product_id,
			r.reason, r.description, r.status, r.reviewer_id, r.reviewer_comment,
			r.created_at, r.updated_at,
			COALESCE(reporter.name, '') AS reporter_name,
			COALESCE(reported.name, '') AS reported_name,
			COALESCE(p.title, '') AS product_title
		FROM reports r
		LEFT JOIN users reporter ON reporter.id = r.reporter_id
		LEFT JOIN users reported ON reported.id = r.reported_user_id
		LEFT JOIN products p ON p.id = r.product_id
	`
	var args []interface{}
	if status != "" {
		query += " WHERE r.status = ?"
		args = append(args, status)
	}
	query += " ORDER BY r.created_at DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := h.db.Query(query, args...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get reports",
		})
	}
	defer rows.Close()

	type RichReport struct {
		models.Report
		ReporterName  string `json:"reporter_name"`
		ReportedName  string `json:"reported_name"`
		ProductTitle  string `json:"product_title"`
	}

	var reports []RichReport
	for rows.Next() {
		var r RichReport
		err := rows.Scan(
			&r.ID, &r.ReporterID, &r.ReportedUserID, &r.ProductID,
			&r.Reason, &r.Description, &r.Status, &r.ReviewerID,
			&r.ReviewerComment, &r.CreatedAt, &r.UpdatedAt,
			&r.ReporterName, &r.ReportedName, &r.ProductTitle,
		)
		if err != nil {
			continue
		}
		reports = append(reports, r)
	}

	totalPages := (total + limit - 1) / limit

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"data":        reports,
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": totalPages,
		},
	})
}

// GetReportByID gets a specific report (admin only)
func (h *ReportHandler) GetReportByID(c *fiber.Ctx) error {
	reportID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid report ID",
		})
	}

	var report models.Report
	err = h.db.QueryRow(`
		SELECT id, reporter_id, reported_user_id, product_id, reason, description, status, 
		       reviewer_id, reviewer_comment, created_at, updated_at
		FROM reports 
		WHERE id = ?
	`, reportID).Scan(
		&report.ID, &report.ReporterID, &report.ReportedUserID, &report.ProductID,
		&report.Reason, &report.Description, &report.Status, &report.ReviewerID,
		&report.ReviewerComment, &report.CreatedAt, &report.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(404).JSON(models.APIResponse{
				Success: false,
				Error:   "Report not found",
			})
		}
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get report",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    report,
	})
}

// UpdateReport updates a report status (admin only)
func (h *ReportHandler) UpdateReport(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	// Check if user is admin
	var userRole string
	err := h.db.QueryRow("SELECT role FROM users WHERE id = ?", userID).Scan(&userRole)
	if err != nil || userRole != "admin" {
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "Admin access required",
		})
	}

	reportID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid report ID",
		})
	}

	var req models.ReportUpdate
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Update report
	_, err = h.db.Exec(`
		UPDATE reports 
		SET status = ?, reviewer_id = ?, reviewer_comment = ?, updated_at = NOW()
		WHERE id = ?
	`, req.Status, userID, req.ReviewerComment, reportID)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to update report",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Report updated successfully",
	})
}

// GetUserReports gets reports against a specific user (public - shows summary)
func (h *ReportHandler) GetUserReports(c *fiber.Ctx) error {
	userID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid user ID",
		})
	}

	// Count reports by reason
	var totalReports int
	var inappropriateCount int
	var counterfeitCount int
	var spamCount int
	var scamCount int

	h.db.QueryRow("SELECT COUNT(*) FROM reports WHERE reported_user_id = ? AND status IN ('reviewed', 'resolved')", userID).Scan(&totalReports)
	h.db.QueryRow("SELECT COUNT(*) FROM reports WHERE reported_user_id = ? AND reason = 'inappropriate' AND status IN ('reviewed', 'resolved')", userID).Scan(&inappropriateCount)
	h.db.QueryRow("SELECT COUNT(*) FROM reports WHERE reported_user_id = ? AND reason = 'counterfeit' AND status IN ('reviewed', 'resolved')", userID).Scan(&counterfeitCount)
	h.db.QueryRow("SELECT COUNT(*) FROM reports WHERE reported_user_id = ? AND reason = 'spam' AND status IN ('reviewed', 'resolved')", userID).Scan(&spamCount)
	h.db.QueryRow("SELECT COUNT(*) FROM reports WHERE reported_user_id = ? AND reason = 'scam' AND status IN ('reviewed', 'resolved')", userID).Scan(&scamCount)

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"total":          totalReports,
			"inappropriate":  inappropriateCount,
			"counterfeit":    counterfeitCount,
			"spam":           spamCount,
			"scam":           scamCount,
			"is_flagged":     totalReports > 0,
		},
	})
}
