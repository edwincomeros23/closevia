package handlers

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
	"github.com/xashathebest/clovia/services"
)

type VerificationHandler struct {
	db *sql.DB
}

func NewVerificationHandler() *VerificationHandler {
	return &VerificationHandler{db: database.DB}
}

var allowedSchools = map[string]string{
	"WMSU": "@wmsu.edu.ph",
}

// StartVerification sets school + email and (for now) marks the email as verified
// once it matches an allowed domain. This keeps the flow simple while preserving
// a clear place to plug in real email sending later.
func (h *VerificationHandler) StartVerification(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	var req struct {
		SchoolName string `json:"school_name"`
		SchoolEmail string `json:"school_email"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	req.SchoolName = strings.TrimSpace(req.SchoolName)
	req.SchoolEmail = strings.TrimSpace(req.SchoolEmail)

	if req.SchoolName == "" || req.SchoolEmail == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "School and email are required"})
	}

	domain, ok := allowedSchools[req.SchoolName]
	if !ok {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "School is not enabled for verification"})
	}

	emailLower := strings.ToLower(req.SchoolEmail)
	if !strings.HasSuffix(emailLower, strings.ToLower(domain)) {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: fmt.Sprintf("Email must end with %s", domain)})
	}

	now := time.Now()
	_, err := h.db.Exec(`
		UPDATE users
		SET school_name = ?, school_email = ?, school_email_verified_at = ?, verification_status = 
			CASE 
				WHEN verification_status = 'verified' THEN verification_status
				ELSE 'not_verified'
			END,
			verification_rejection_reason = NULL
		WHERE id = ?`,
		req.SchoolName, req.SchoolEmail, now, userID,
	)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to start verification"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "School email verified. You can now upload your school ID.",
	})
}

// UploadSchoolID stores the uploaded ID image in a private folder and marks the
// user's verification_status as pending.
func (h *VerificationHandler) UploadSchoolID(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	var status, schoolName, schoolEmail sql.NullString
	var emailVerifiedAt sql.NullTime
	err := h.db.QueryRow(`
		SELECT verification_status, school_name, school_email, school_email_verified_at
		FROM users WHERE id = ?`,
		userID,
	).Scan(&status, &schoolName, &schoolEmail, &emailVerifiedAt)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load user verification state"})
	}

	if !schoolName.Valid || !schoolEmail.Valid {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Please set and verify your school email first"})
	}
	if !emailVerifiedAt.Valid {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "School email is not verified"})
	}
	if status.String == "pending" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Your verification is already pending review"})
	}
	if status.String == "verified" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "You are already verified"})
	}

	// Optional: allow either School ID or COR (Certificate of Registration).
	// Frontend may send "document_type" in the multipart form with value "id" or "cor".
	docType := strings.ToLower(strings.TrimSpace(c.FormValue("document_type")))
	if docType != "" && docType != "id" && docType != "cor" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid document type. Must be 'id' or 'cor'."})
	}
	if docType == "" {
		docType = "id"
	}

	file, err := c.FormFile("id_image")
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "No ID image uploaded"})
	}

	// Store ID/COR images outside the public /uploads tree for privacy
	safeName := services.SanitizeFileName(file.Filename)
	relative := filepath.Join("private_uploads", "school-ids", fmt.Sprintf("%d_%s_%s", userID, docType, safeName))
	dir := filepath.Dir(relative)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to prepare upload directory"})
	}
	if err := c.SaveFile(file, relative); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to save ID image"})
	}

	_, err = h.db.Exec(`
		UPDATE users
		SET school_id_image_path = ?, verification_status = 'pending', verification_rejection_reason = NULL
		WHERE id = ?`,
		relative, userID,
	)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update verification status"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "School ID or COR submitted. Your verification is now pending review.",
	})
}

// GetVerificationStatus returns the current user's verification fields.
func (h *VerificationHandler) GetVerificationStatus(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	var user models.User
	var emailVerifiedAt sql.NullTime
	err := h.db.QueryRow(`
		SELECT id, name, email, role, verified,
		       COALESCE(verification_status, 'not_verified') as verification_status,
		       COALESCE(school_name, ''), COALESCE(school_email, ''),
		       school_email_verified_at,
		       COALESCE(verification_rejection_reason, '')
		FROM users WHERE id = ?`,
		userID,
	).Scan(
		&user.ID, &user.Name, &user.Email, &user.Role, &user.Verified,
		&user.VerificationStatus,
		&user.SchoolName, &user.SchoolEmail,
		&emailVerifiedAt,
		&user.VerificationRejectionReason,
	)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load verification status"})
	}
	if emailVerifiedAt.Valid {
		user.SchoolEmailVerifiedAt = &emailVerifiedAt.Time
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    user,
	})
}

// Admin: list pending/recent verifications
func (h *VerificationHandler) AdminListVerifications(c *fiber.Ctx) error {
	// Admin auth is enforced by router middleware
	rows, err := h.db.Query(`
		SELECT id, name, email, verification_status, school_name, school_email,
		       school_email_verified_at, school_id_image_path, verification_rejection_reason
		FROM users
		WHERE verification_status IN ('pending','rejected')
		ORDER BY updated_at DESC
		LIMIT 100`)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load verifications"})
	}
	defer rows.Close()

	type item struct {
		ID                         int        `json:"id"`
		Name                       string     `json:"name"`
		Email                      string     `json:"email"`
		VerificationStatus         string     `json:"verification_status"`
		SchoolName                 string     `json:"school_name"`
		SchoolEmail                string     `json:"school_email"`
		SchoolEmailVerifiedAt      *time.Time `json:"school_email_verified_at,omitempty"`
		VerificationRejectionReason string    `json:"verification_rejection_reason,omitempty"`
		HasIDImage                 bool       `json:"has_id_image"`
	}

	var items []item
	for rows.Next() {
		var it item
		var emailVerifiedAt sql.NullTime
		var idPath sql.NullString
		var reason sql.NullString
		if err := rows.Scan(
			&it.ID, &it.Name, &it.Email, &it.VerificationStatus,
			&it.SchoolName, &it.SchoolEmail,
			&emailVerifiedAt, &idPath, &reason,
		); err != nil {
			continue
		}
		if emailVerifiedAt.Valid {
			t := emailVerifiedAt.Time
			it.SchoolEmailVerifiedAt = &t
		}
		it.HasIDImage = idPath.Valid && idPath.String != ""
		if reason.Valid {
			it.VerificationRejectionReason = reason.String
		}
		items = append(items, it)
	}

	return c.JSON(models.APIResponse{Success: true, Data: items})
}

// Admin: stream the raw ID image for a given user (no public URL).
func (h *VerificationHandler) AdminGetIDImage(c *fiber.Ctx) error {
	// Admin auth via middleware
	userID, err := strconv.Atoi(c.Params("id"))
	if err != nil || userID <= 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid user ID"})
	}

	var path sql.NullString
	if err := h.db.QueryRow(`SELECT school_id_image_path FROM users WHERE id = ?`, userID).Scan(&path); err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "User not found"})
	}
	if !path.Valid || path.String == "" {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "No ID image uploaded"})
	}

	// Basic safety: ensure file is under private_uploads/school-ids
	if !strings.HasPrefix(path.String, "private_uploads"+string(filepath.Separator)+"school-ids") {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid ID image path"})
	}

	if _, err := os.Stat(path.String); err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "ID image not found on disk"})
	}

	return c.SendFile(path.String)
}

// AdminApproveVerification marks a user's verification as verified.
func (h *VerificationHandler) AdminApproveVerification(c *fiber.Ctx) error {
	userID, err := strconv.Atoi(c.Params("id"))
	if err != nil || userID <= 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid user ID"})
	}

	_, err = h.db.Exec(`UPDATE users SET verification_status = 'verified', verification_rejection_reason = NULL WHERE id = ?`, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to approve verification"})
	}

	return c.JSON(models.APIResponse{Success: true, Message: "User marked as verified"})
}

// AdminRejectVerification marks a user's verification as rejected with a reason.
func (h *VerificationHandler) AdminRejectVerification(c *fiber.Ctx) error {
	userID, err := strconv.Atoi(c.Params("id"))
	if err != nil || userID <= 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid user ID"})
	}

	var req struct {
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" {
		req.Reason = "Not specified"
	}

	_, err = h.db.Exec(`UPDATE users SET verification_status = 'rejected', verification_rejection_reason = ? WHERE id = ?`, req.Reason, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to reject verification"})
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Verification rejected"})
}

