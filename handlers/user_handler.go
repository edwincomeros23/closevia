package handlers

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/google/uuid"

	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
	"github.com/xashathebest/clovia/services"
	"github.com/xashathebest/clovia/utils"
)

// UserHandler handles user-related HTTP requests
type UserHandler struct {
	db *sql.DB
}

// NewUserHandler creates a new user handler
func NewUserHandler() *UserHandler {
	return &UserHandler{
		db: database.DB,
	}
}

func nullableString(p *string) interface{} {
	if p == nil {
		return nil
	}
	if *p == "" {
		return nil
	}
	return *p
}

// computeActivityStatus returns activity status based on last_login time
func computeActivityStatus(lastLogin *time.Time) string {
	if lastLogin == nil {
		return "inactive"
	}
	since := time.Since(*lastLogin)
	if since < 24*time.Hour {
		return "active_today"
	}
	if since < 7*24*time.Hour {
		return "active_this_week"
	}
	return "inactive"
}

func derefString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// generateUserSlug creates a URL-friendly slug from name and appends a short UUID
func generateUserSlug(name string) string {
	slug := strings.ToLower(name)

	// Remove special characters, keep only alphanumeric, spaces, and hyphens
	slug = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == ' ' || r == '-' {
			return r
		}
		return -1
	}, slug)

	// Replace spaces with hyphens
	slug = strings.ReplaceAll(slug, " ", "-")

	// Remove multiple consecutive hyphens
	for strings.Contains(slug, "--") {
		slug = strings.ReplaceAll(slug, "--", "-")
	}

	slug = strings.Trim(slug, "-")

	if len(slug) > 30 {
		slug = slug[:30]
		slug = strings.TrimRight(slug, "-")
	}

	shortUUID := uuid.New().String()[:8]
	return fmt.Sprintf("%s-%s", slug, shortUUID)
}

// ResolveUserID resolves an identifier (either numeric ID or slug) to a numeric user ID
func (h *UserHandler) ResolveUserID(identifier string) (int, error) {
	// First, try parsing as an integer
	if id, err := strconv.Atoi(identifier); err == nil {
		// Verify the user exists with this ID
		var exists int
		err := h.db.QueryRow("SELECT id FROM users WHERE id = ?", id).Scan(&exists)
		if err == nil {
			return exists, nil
		}
		// If the ID isn't found, we can optionally fall back to checking if a slug is purely digits
		// But usually it just means "not found"
		if err != sql.ErrNoRows {
			return 0, err
		}
	}

	// If it's not a valid integer or ID not found, treat it as a slug
	var id int
	err := h.db.QueryRow("SELECT id FROM users WHERE slug = ?", identifier).Scan(&id)
	if err != nil {
		return 0, err
	}
	return id, nil
}

// Register handles user registration
func (h *UserHandler) Register(c *fiber.Ctx) error {
	var user models.UserRegister
	if err := c.BodyParser(&user); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Check if user already exists
	var existingUser models.User
	err := h.db.QueryRow("SELECT id FROM users WHERE email = ?", user.Email).Scan(&existingUser.ID)
	if err == nil {
		return c.Status(409).JSON(models.APIResponse{
			Success: false,
			Error:   "User with this email already exists",
		})
	}

	// Department required ONLY for WMSU emails
	isWmsuEmail := strings.HasSuffix(strings.ToLower(user.Email), "@wmsu.edu.ph")
	if !user.IsOrganization && isWmsuEmail {
		if user.Department == nil || *user.Department == "" {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Please select your department/college for WMSU registration"})
		}
	}

	// Strict password validation
	if len(user.Password) < 8 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Password must be at least 8 characters long"})
	}
	if matched, _ := regexp.MatchString(`[A-Z]`, user.Password); !matched {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Password must contain at least one uppercase letter"})
	}
	if matched, _ := regexp.MatchString(`[a-z]`, user.Password); !matched {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Password must contain at least one lowercase letter"})
	}
	if matched, _ := regexp.MatchString(`[0-9]`, user.Password); !matched {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Password must contain at least one number"})
	}
	if matched, _ := regexp.MatchString(`[!@#$%^&*(),.?":{}|<>]`, user.Password); !matched {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Password must contain at least one special character"})
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(user.Password)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to process password",
		})
	}

	// Generate slug for the new user
	slug := generateUserSlug(user.Name)

	// Ensure unique slug
	baseSlug := slug
	counter := 1
	for {
		var exists int
		err := h.db.QueryRow("SELECT COUNT(*) FROM users WHERE slug = ?", slug).Scan(&exists)
		if err != nil || exists == 0 {
			break
		}
		slug = fmt.Sprintf("%s-%d", baseSlug, counter)
		counter++
	}

	// Insert new user
	result, err := h.db.Exec(
		"INSERT INTO users (slug, name, email, password_hash, role, is_organization, org_verified, org_name, org_logo_url, department, bio, badges, profile_picture, language_preference, premium_tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, JSON_ARRAY(), ?, ?, ?)",
		slug,
		user.Name,
		user.Email,
		hashedPassword,
		user.Role,
		user.IsOrganization,
		false,
		user.OrgName,
		user.OrgLogoURL,
		nullableString(user.Department),
		user.Bio,
		"",
		"en",
		"free",
	)
	if err != nil {
		// Log the actual error for debugging
		fmt.Printf("❌ Error creating user: %v\n", err)
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to create user: " + err.Error(),
		})
	}

	userID, _ := result.LastInsertId()

	// Generate and send OTP for email verification
	otpCode, otpHash, otpExpiry, otpErr := generateOTP()
	requiresVerification := true
	if otpErr == nil {
		h.db.Exec(
			"UPDATE users SET email_otp_hash = ?, email_otp_expires = ? WHERE id = ?",
			otpHash, otpExpiry, userID,
		)
		go func() {
			err := services.SendOTPEmail(user.Email, user.Name, otpCode)
			if err != nil {
				fmt.Printf("❌ Failed to send OTP email: %v\n", err)
			}
		}()
	} else {
		fmt.Printf("⚠️ OTP generation failed: %v\n", otpErr)
		// Fallback: If OTP generation fails, mark as verified for safety
		h.db.Exec("UPDATE users SET verified = TRUE WHERE id = ?", userID)
		requiresVerification = false
	}

	return c.Status(201).JSON(models.APIResponse{
		Success: true,
		Message: "User registered successfully. Please verify your email.",
		Data: fiber.Map{
			"user": models.User{
				ID:                 int(userID),
				Slug:               slug,
				Name:               user.Name,
				Email:              user.Email,
				Verified:           !requiresVerification,
				IsOrganization:     user.IsOrganization,
				OrgVerified:        false,
				OrgName:            user.OrgName,
				OrgLogoURL:         user.OrgLogoURL,
				Department:         derefString(user.Department),
				Bio:                user.Bio,
				ProfilePicture:     "",
				LanguagePreference: "en",
				IsPremium:          false,
				PremiumTier:        "free",
			},
			"requires_verification": requiresVerification,
		},
	})
}

// generateOTP creates a 6-digit code, returns (plainCode, bcryptHash, expiry, error)
func generateOTP() (string, string, time.Time, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", "", time.Time{}, err
	}
	code := fmt.Sprintf("%06d", n.Int64())
	hash, err := utils.HashPassword(code)
	if err != nil {
		return "", "", time.Time{}, err
	}
	expiry := time.Now().Add(10 * time.Minute)
	return code, hash, expiry, nil
}

// VerifyEmail verifies the OTP code sent to the user's email.
// POST /api/auth/verify-email  { email, code }
func (h *UserHandler) VerifyEmail(c *fiber.Ctx) error {
	var req struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}
	if req.Email == "" || req.Code == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Email and code are required"})
	}

	var userID int
	var storedHash string
	var expires time.Time
	var verified bool

	err := h.db.QueryRow(
		"SELECT id, COALESCE(email_otp_hash,''), COALESCE(email_otp_expires, NOW()), verified FROM users WHERE email = ?",
		req.Email,
	).Scan(&userID, &storedHash, &expires, &verified)

	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "User not found"})
	}
	if verified {
		return c.JSON(models.APIResponse{Success: true, Message: "Email is already verified"})
	}
	if storedHash == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "No verification code found. Please request a new one."})
	}
	if time.Now().After(expires) {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Verification code has expired. Please request a new one."})
	}
	if !utils.CheckPasswordHash(req.Code, storedHash) {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid verification code"})
	}

	// Mark verified and clear OTP
	// Auto-grant premium for WMSU students (@wmsu.edu.ph email) after verification
	isWmsuStudent := strings.HasSuffix(strings.ToLower(req.Email), "@wmsu.edu.ph")

	query := "UPDATE users SET verified = true, email_otp_hash = NULL, email_otp_expires = NULL"
	if isWmsuStudent {
		query += ", is_premium = true, premium_tier = 'plus'"
	}
	query += " WHERE id = ?"

	_, err = h.db.Exec(query, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to verify email"})
	}

	// Generate JWT token now that they are verified
	token, err := utils.GenerateJWT(userID, req.Email)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to generate token"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Email verified successfully",
		Data:    fiber.Map{"token": token},
	})
}

// ResendVerification resends the OTP to the user's email.
// POST /api/auth/resend-verification  { email }
func (h *UserHandler) ResendVerification(c *fiber.Ctx) error {
	var req struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}
	if req.Email == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Email is required"})
	}

	var userID int
	var userName string
	var verified bool
	var currentExpires sql.NullTime

	err := h.db.QueryRow(
		"SELECT id, name, verified, email_otp_expires FROM users WHERE email = ?",
		req.Email,
	).Scan(&userID, &userName, &verified, &currentExpires)

	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "User not found"})
	}
	if verified {
		return c.JSON(models.APIResponse{Success: true, Message: "Email is already verified"})
	}

	// Cooldown: block resend if previous OTP was sent less than 60 seconds ago
	if currentExpires.Valid {
		secondsUntilExpiry := time.Until(currentExpires.Time).Seconds()
		// OTP was set for 10 min; if > 9 min remain it was sent <60s ago
		if secondsUntilExpiry > float64(9*60) {
			return c.Status(429).JSON(models.APIResponse{
				Success: false,
				Error:   "Please wait 60 seconds before requesting a new code",
			})
		}
	}

	// Generate new OTP
	otpCode, otpHash, otpExpiry, otpErr := generateOTP()
	if otpErr != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to generate verification code"})
	}

	_, err = h.db.Exec(
		"UPDATE users SET email_otp_hash = ?, email_otp_expires = ? WHERE id = ?",
		otpHash, otpExpiry, userID,
	)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update verification code"})
	}

	go services.SendOTPEmail(req.Email, userName, otpCode)

	return c.JSON(models.APIResponse{Success: true, Message: "Verification code resent"})
}

// ForgotPassword sends a password reset OTP to the user's email.
// POST /api/auth/forgot-password  { email }
func (h *UserHandler) ForgotPassword(c *fiber.Ctx) error {
	var req struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	if req.Email == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Email is required"})
	}

	// Look up user — always return success to prevent email enumeration
	var userID int
	var userName string
	var currentExpires sql.NullTime
	err := h.db.QueryRow(
		"SELECT id, name, password_reset_otp_expires FROM users WHERE email = ?",
		req.Email,
	).Scan(&userID, &userName, &currentExpires)
	if err != nil {
		// User not found — return success anyway (security: no email enumeration)
		return c.JSON(models.APIResponse{Success: true, Message: "If an account with that email exists, a reset code has been sent."})
	}

	// Cooldown: block resend if previous OTP was sent less than 60 seconds ago
	if currentExpires.Valid {
		secondsUntilExpiry := time.Until(currentExpires.Time).Seconds()
		// OTP is set for 15 min; if > 14 min remain it was sent <60s ago
		if secondsUntilExpiry > float64(14*60) {
			return c.Status(429).JSON(models.APIResponse{
				Success: false,
				Error:   "Please wait 60 seconds before requesting a new code",
			})
		}
	}

	// Generate 6-digit OTP with 15-minute expiry
	otpCode, otpHash, _, otpErr := generateOTP()
	if otpErr != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to generate reset code"})
	}
	otpExpiry := time.Now().Add(15 * time.Minute)

	_, err = h.db.Exec(
		"UPDATE users SET password_reset_otp_hash = ?, password_reset_otp_expires = ? WHERE id = ?",
		otpHash, otpExpiry, userID,
	)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to save reset code"})
	}

	go func() {
		if err := services.SendPasswordResetEmail(req.Email, userName, otpCode); err != nil {
			fmt.Printf("❌ Failed to send password reset email to %s: %v\n", req.Email, err)
		}
	}()

	return c.JSON(models.APIResponse{Success: true, Message: "If an account with that email exists, a reset code has been sent."})
}

// ResetPassword verified OTP and updates the user's password.
// POST /api/auth/reset-password  { email, code, new_password }
func (h *UserHandler) ResetPassword(c *fiber.Ctx) error {
	var req struct {
		Email       string `json:"email"`
		Code        string `json:"code"`
		NewPassword string `json:"new_password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	if req.Email == "" || req.Code == "" || req.NewPassword == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Email, code, and new password are required"})
	}
	if len(req.NewPassword) < 6 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Password must be at least 6 characters"})
	}

	// Look up user and OTP
	var userID int
	var otpHash sql.NullString
	var otpExpires sql.NullTime
	err := h.db.QueryRow(
		"SELECT id, password_reset_otp_hash, password_reset_otp_expires FROM users WHERE email = ?",
		req.Email,
	).Scan(&userID, &otpHash, &otpExpires)
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid email or code"})
	}

	// Verify OTP exists and hasn't expired
	if !otpHash.Valid || !otpExpires.Valid {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "No reset code found. Please request a new one."})
	}
	if time.Now().After(otpExpires.Time) {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Reset code has expired. Please request a new one."})
	}

	// Verify OTP matches
	if !utils.CheckPasswordHash(req.Code, otpHash.String) {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid reset code"})
	}

	// Hash new password and update
	newHash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to process new password"})
	}

	_, err = h.db.Exec(
		"UPDATE users SET password_hash = ?, password_reset_otp_hash = NULL, password_reset_otp_expires = NULL WHERE id = ?",
		newHash, userID,
	)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update password"})
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Password reset successful. You can now log in with your new password."})
}

// Login handles user authentication
func (h *UserHandler) Login(c *fiber.Ctx) error {
	var login models.UserLogin
	if err := c.BodyParser(&login); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Find user by email
	var user models.User
	err := h.db.QueryRow(
		"SELECT id, slug, name, email, password_hash, role, verified, COALESCE(is_premium, FALSE), COALESCE(premium_tier, 'free') FROM users WHERE email = ?",
		login.Email,
	).Scan(&user.ID, &user.Slug, &user.Name, &user.Email, &user.PasswordHash, &user.Role, &user.Verified, &user.IsPremium, &user.PremiumTier)

	if err != nil {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid credentials",
		})
	}

	// Check if user is verified
	if !user.Verified {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "Please verify your email address before logging in.",
		})
	}

	// Check password
	if !utils.CheckPasswordHash(login.Password, user.PasswordHash) {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid credentials",
		})
	}

	// Update last_login timestamp
	h.db.Exec("UPDATE users SET last_login = NOW() WHERE id = ?", user.ID)
	now := time.Now()
	user.LastLogin = &now
	user.ActivityStatus = "active_today"

	// Generate JWT token
	token, err := utils.GenerateJWT(user.ID, user.Email)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to generate token",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Login successful",
		Data: fiber.Map{
			"user":  user,
			"token": token,
		},
	})
}

// GoogleLogin handles Google OAuth authentication
func (h *UserHandler) GoogleLogin(c *fiber.Ctx) error {
	var req struct {
		IDToken     string `json:"idToken"`
		UID         string `json:"uid"`
		Email       string `json:"email"`
		DisplayName string `json:"displayName"`
		PhotoURL    string `json:"photoURL"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	if req.Email == "" {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Email is required",
		})
	}

	// Check if user exists
	var user models.User
	err := h.db.QueryRow(
		"SELECT id, slug, name, email, role, verified, profile_picture, language_preference, COALESCE(is_premium, FALSE), COALESCE(premium_tier, 'free') FROM users WHERE email = ?",
		req.Email,
	).Scan(&user.ID, &user.Slug, &user.Name, &user.Email, &user.Role, &user.Verified, &user.ProfilePicture, &user.LanguagePreference, &user.IsPremium, &user.PremiumTier)

	if err == sql.ErrNoRows {
		// Generate slug for the new user
		slug := generateUserSlug(req.DisplayName)

		// Ensure slug is unique
		baseSlug := slug
		counter := 1
		for {
			var exists int
			err := h.db.QueryRow("SELECT COUNT(*) FROM users WHERE slug = ?", slug).Scan(&exists)
			if err != nil || exists == 0 {
				break
			}
			slug = fmt.Sprintf("%s-%d", baseSlug, counter)
			counter++
		}

		premium_tier := "free"
		is_premium := false
		if strings.HasSuffix(strings.ToLower(req.Email), "@wmsu.edu.ph") {
			premium_tier = "plus"
			is_premium = true
		}

		// Create new user from Google info
		result, err := h.db.Exec(
			"INSERT INTO users (slug, name, email, role, verified, profile_picture, is_organization, org_verified, badges, language_preference, premium_tier, is_premium) VALUES (?, ?, ?, ?, ?, ?, ?, ?, JSON_ARRAY(), ?, ?, ?)",
			slug,
			req.DisplayName,
			req.Email,
			"user",
			true, // Mark as verified since they authenticated with Google
			req.PhotoURL,
			false,
			false,
			"en",
			premium_tier,
			is_premium,
		)
		if err != nil {
			fmt.Printf("❌ Error creating Google user: %v\n", err)
			return c.Status(500).JSON(models.APIResponse{
				Success: false,
				Error:   "Failed to create user",
			})
		}

		userID, _ := result.LastInsertId()
		user.ID = int(userID)
		user.Slug = slug
		user.Name = req.DisplayName
		user.Email = req.Email
		user.Verified = true
		user.ProfilePicture = req.PhotoURL
		user.Role = "user"
		user.LanguagePreference = "en"
		user.PremiumTier = premium_tier
		user.IsPremium = is_premium
	} else if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Database error",
		})
	}

	// Update last_login timestamp
	h.db.Exec("UPDATE users SET last_login = NOW() WHERE id = ?", user.ID)
	now := time.Now()
	user.LastLogin = &now
	user.ActivityStatus = "active_today"

	// Generate JWT token
	token, err := utils.GenerateJWT(user.ID, user.Email)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to generate token",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Google login successful",
		Data: fiber.Map{
			"user":  user,
			"token": token,
		},
	})
}

// GetProfile gets the current user's profile
func (h *UserHandler) GetProfile(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	var user models.User
	var schoolEmailVerifiedAt sql.NullTime
	var lastLogin sql.NullTime

	var slugNull sql.NullString
	err := h.db.QueryRow(
		`SELECT id, slug, name, email, role, verified, 
		        COALESCE(is_organization, FALSE) AS is_organization, COALESCE(org_verified, FALSE) AS org_verified, COALESCE(org_name, '') AS org_name,
		        COALESCE(org_logo_url, '') AS org_logo_url,
		        COALESCE(profile_picture, '') AS profile_picture,
		        COALESCE(bio, '') AS bio,
		        COALESCE(background_image, '') AS background_image,
		        COALESCE(background_position, '') AS background_position,
		        COALESCE(department, '') AS department, 
		        COALESCE(badges, '[]') AS badges,
		        COALESCE(is_premium, FALSE) AS is_premium,
		        COALESCE(verification_status, 'not_verified') AS verification_status,
		        COALESCE(school_name, '') AS school_name,
		        COALESCE(school_email, '') AS school_email,
		        school_email_verified_at,
		        COALESCE(verification_rejection_reason, '') AS verification_rejection_reason,
		        COALESCE(email_notifications_enabled, TRUE) AS email_notifications_enabled,
		        COALESCE(push_notifications_enabled, TRUE) AS push_notifications_enabled,
		        COALESCE(language_preference, 'en') AS language_preference,
		        COALESCE(premium_tier, 'free') AS premium_tier,
		        created_at, updated_at, last_login
		 FROM users WHERE id = ?`,
		userID,
	).Scan(
		&user.ID, &slugNull, &user.Name, &user.Email, &user.Role, &user.Verified,
		&user.IsOrganization, &user.OrgVerified, &user.OrgName,
		&user.OrgLogoURL, &user.ProfilePicture, &user.Bio, &user.BackgroundImage,
		&user.BackgroundPosition, &user.Department, &user.Badges, &user.IsPremium,
		&user.VerificationStatus, &user.SchoolName, &user.SchoolEmail, &schoolEmailVerifiedAt, &user.VerificationRejectionReason,
		&user.EmailNotificationsEnabled, &user.PushNotificationsEnabled,
		&user.LanguagePreference, &user.PremiumTier,
		&user.CreatedAt, &user.UpdatedAt, &lastLogin,
	)

	if schoolEmailVerifiedAt.Valid {
		user.SchoolEmailVerifiedAt = &schoolEmailVerifiedAt.Time
	}
	if lastLogin.Valid {
		user.LastLogin = &lastLogin.Time
	}
	user.ActivityStatus = computeActivityStatus(user.LastLogin)
	if slugNull.Valid {
		user.Slug = slugNull.String
	}

	if err != nil {
		fmt.Printf("❌ ERROR in GetProfile (ID: %v): %v\n", userID, err)
		// Return a proper error response so frontend can handle it correctly
		// Check if it's a "no rows" error (user doesn't exist)
		if err == sql.ErrNoRows {
			return c.Status(404).JSON(models.APIResponse{
				Success: false,
				Error:   "User not found",
			})
		}
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to fetch user profile: " + err.Error(),
		})
	}

	// Profile Insights
	var profileViews int
	// Use a short timeout for profile_views queries to prevent hanging
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err = h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM profile_views WHERE target_user_id = ?", user.ID).Scan(&profileViews)
	if err != nil {
		// If profile_views query fails (table missing or timeout), just set to 0
		fmt.Printf("⚠️ Profile views query failed: %v\n", err)
		profileViews = 0
	}

	var viewHistory []fiber.Map
	// Plus and Pro users can see who viewed their profile
	if user.PremiumTier != "free" {
		ctx2, cancel2 := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel2()

		rows, qErr := h.db.QueryContext(ctx2, `
			SELECT DISTINCT u.id, u.name, COALESCE(u.profile_picture, '') as profile_picture, MAX(pv.viewed_at) as last_viewed
			FROM profile_views pv
			JOIN users u ON pv.viewer_user_id = u.id
			WHERE pv.target_user_id = ?
			GROUP BY u.id, u.name, u.profile_picture
			ORDER BY last_viewed DESC
			LIMIT 10`, user.ID)
		if qErr == nil && rows != nil {
			defer rows.Close()
			for rows.Next() {
				var vID int
				var vName, vAvatar string
				var lv time.Time
				rows.Scan(&vID, &vName, &vAvatar, &lv)
				viewHistory = append(viewHistory, fiber.Map{
					"id":        vID,
					"name":      vName,
					"avatar":    vAvatar,
					"viewed_at": lv,
				})
			}
		} else if qErr != nil {
			fmt.Printf("⚠️ View history query failed: %v\n", qErr)
		}
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"user":          user,
			"profile_views": profileViews,
			"view_history":  viewHistory,
		},
	})
}

// UpdateProfile updates the current user's profile
func (h *UserHandler) UpdateProfile(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	var updateData struct {
		Name                      *string `json:"name"`
		Email                     *string `json:"email"`
		ProfilePicture            *string `json:"profile_picture"`
		Bio                       *string `json:"bio"`
		BackgroundImage           *string `json:"background_image"`
		BackgroundPosition        *string `json:"background_position"`
		LanguagePreference        *string `json:"language_preference"`
		EmailNotificationsEnabled *bool   `json:"email_notifications_enabled"`
		PushNotificationsEnabled  *bool   `json:"push_notifications_enabled"`
	}

	if err := c.BodyParser(&updateData); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Handle email change logic: if email is updated, mark user as unverified and send new OTP
	var newEmail string
	var currentEmail string
	var emailChanged bool

	if updateData.Email != nil {
		newEmail = strings.TrimSpace(strings.ToLower(*updateData.Email))
		// Get current email to compare
		err := h.db.QueryRow("SELECT email FROM users WHERE id = ?", userID).Scan(&currentEmail)
		if err == nil && newEmail != "" && newEmail != currentEmail {
			emailChanged = true

			// Check if new email is already taken by another user
			var exists int
			h.db.QueryRow("SELECT COUNT(*) FROM users WHERE email = ? AND id != ?", newEmail, userID).Scan(&exists)
			if exists > 0 {
				return c.Status(400).JSON(models.APIResponse{
					Success: false,
					Error:   "This email is already registered to another account",
				})
			}
		}
	}

	// Build update query dynamically
	query := "UPDATE users SET updated_at = CURRENT_TIMESTAMP"
	var args []interface{}

	if updateData.Name != nil {
		query += ", name = ?"
		args = append(args, *updateData.Name)
	}
	if updateData.Email != nil {
		query += ", email = ?"
		args = append(args, newEmail)
		if emailChanged {
			query += ", verified = false"
			// Revoke is_premium if it was from WMSU, they will get it back after verifying new WMSU email
			query += ", is_premium = false"
		}
	}

	// ... (rest of field updates)
	if updateData.ProfilePicture != nil {
		query += ", profile_picture = ?"
		args = append(args, *updateData.ProfilePicture)
	}

	if updateData.Bio != nil {
		query += ", bio = ?"
		args = append(args, *updateData.Bio)
	}

	if updateData.BackgroundImage != nil {
		query += ", background_image = ?"
		args = append(args, *updateData.BackgroundImage)
	}

	if updateData.BackgroundPosition != nil {
		query += ", background_position = ?"
		args = append(args, *updateData.BackgroundPosition)
	}

	if updateData.LanguagePreference != nil {
		query += ", language_preference = ?"
		args = append(args, *updateData.LanguagePreference)
	}

	if updateData.EmailNotificationsEnabled != nil {
		query += ", email_notifications_enabled = ?"
		args = append(args, *updateData.EmailNotificationsEnabled)
	}

	if updateData.PushNotificationsEnabled != nil {
		query += ", push_notifications_enabled = ?"
		args = append(args, *updateData.PushNotificationsEnabled)
	}

	query += " WHERE id = ?"
	args = append(args, userID)

	_, err := h.db.Exec(query, args...)
	if err != nil {
		// Handle missing columns: try to add any known columns then retry once
		if strings.Contains(err.Error(), "Unknown column") || strings.Contains(err.Error(), "1054") {
			h.db.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture VARCHAR(255) NULL")
			h.db.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS background_image VARCHAR(255) NULL")
			h.db.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS background_position VARCHAR(50) NULL")
			h.db.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NULL")
			h.db.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS language_preference VARCHAR(10) NULL DEFAULT 'en'")
			h.db.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT TRUE")
			h.db.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN DEFAULT TRUE")
			// retry update
			_, err = h.db.Exec(query, args...)
		}
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{
				Success: false,
				Error:   "Failed to update profile",
			})
		}
	}

	// If email changed, trigger verification email
	if emailChanged {
		// Generate OTP
		otpCode, otpHash, otpExpiry, otpErr := generateOTP()
		if otpErr == nil {
			// Save OTP to DB
			h.db.Exec("UPDATE users SET email_otp_hash = ?, email_otp_expires = ? WHERE id = ?", otpHash, otpExpiry, userID)

			// Send Email
			var userName string
			_ = h.db.QueryRow("SELECT name FROM users WHERE id = ?", userID).Scan(&userName)

			go func() {
				err := services.SendOTPEmail(newEmail, userName, otpCode)
				if err != nil {
					fmt.Printf("Error sending verification email for profile update: %v\n", err)
				}
			}()
		}

		return c.JSON(models.APIResponse{
			Success: true,
			Message: "Profile updated. Please verify your new email address. A verification code has been sent.",
			Data:    fiber.Map{"requires_verification": true},
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Profile updated successfully",
	})
}

// UploadProfilePicture handles uploading a single profile image and returns its URL
func (h *UserHandler) UploadProfilePicture(c *fiber.Ctx) error {
	// Extra safety net: catch any panic in this handler to avoid connection resets
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("🔴 [UploadProfilePicture] PANIC recovered: %v\n", r)
		}
	}()

	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	fmt.Printf("🖼️  [UploadProfilePicture] Starting upload for user ID: %d\n", userID)

	file, err := c.FormFile("image")
	if err != nil {
		// Debug info: log content-type and underlying error to help diagnose upload issues
		contentType := c.Get("Content-Type")
		fmt.Printf("UploadProfilePicture: missing form file 'image' - Content-Type: %s, err: %v\n", contentType, err)
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "No file uploaded: " + err.Error()})
	}

	fmt.Printf("🖼️  [UploadProfilePicture] File received: %s (size: %d bytes)\n", file.Filename, file.Size)

	var finalURL string
	if url, err := services.UploadFileToCloudinary(file, "profile-pictures"); err == nil && url != "" {
		finalURL = url
		fmt.Printf("🖼️  [UploadProfilePicture] Cloudinary upload successful: %s\n", finalURL)
	} else {
		if err != nil && err != services.ErrCloudinaryDisabled {
			fmt.Printf("Cloudinary profile upload failed: %v\n", err)
		}

		fmt.Printf("🖼️  [UploadProfilePicture] Falling back to local storage\n")
		fsPath, publicPath := services.GenerateLocalMediaPaths("profile-pictures", file.Filename)
		if err := os.MkdirAll(filepath.Dir(fsPath), 0o755); err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to prepare upload directory"})
		}
		if err := c.SaveFile(file, fsPath); err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to save file"})
		}

		finalURL = buildAbsoluteURL(c, publicPath)
		fmt.Printf("🖼️  [UploadProfilePicture] Local storage URL: %s\n", finalURL)
	}

	// Ensure profile_picture column exists
	var exists int
	err = h.db.QueryRow("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_picture'").Scan(&exists)
	if err == nil && exists == 0 {
		h.db.Exec("ALTER TABLE users ADD COLUMN profile_picture VARCHAR(255) NULL")
	}

	// Save URL to user's profile
	fmt.Printf("🖼️  [UploadProfilePicture] Saving URL to database for user %d: %s\n", userID, finalURL)
	_, err = h.db.Exec("UPDATE users SET profile_picture = ? WHERE id = ?", finalURL, userID)
	if err != nil {
		fmt.Printf("🖼️  [UploadProfilePicture] Database update FAILED: %v\n", err)
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update user profile picture"})
	}

	fmt.Printf("🖼️  [UploadProfilePicture] Successfully updated user %d with profile picture: %s\n", userID, finalURL)
	return c.JSON(models.APIResponse{Success: true, Data: finalURL, Message: "Uploaded"})
}

func buildAbsoluteURL(c *fiber.Ctx, path string) string {
	if path == "" {
		return ""
	}
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	scheme := c.Protocol()
	if scheme == "" {
		scheme = "http"
	}
	host := c.Hostname()
	if host == "" {
		host = c.Get("Host")
	}
	if host == "" {
		host = "localhost:4000"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return fmt.Sprintf("%s://%s%s", scheme, host, path)
}

// ChangePassword allows an authenticated user to change their password.
// Expects JSON: { current_password, new_password, confirm_password }
func (h *UserHandler) ChangePassword(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
		ConfirmPassword string `json:"confirm_password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	// Basic validation
	if len(req.NewPassword) < 8 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "New password must be at least 8 characters"})
	}
	if req.NewPassword != req.ConfirmPassword {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "New password and confirmation do not match"})
	}

	// Fetch current password hash
	var currentHash string
	err := h.db.QueryRow("SELECT password_hash FROM users WHERE id = ?", userID).Scan(&currentHash)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "User not found"})
		}
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to retrieve user"})
	}

	// Verify current password
	if !utils.CheckPasswordHash(req.CurrentPassword, currentHash) {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "Current password is incorrect"})
	}

	// Prevent reusing the same password
	if utils.CheckPasswordHash(req.NewPassword, currentHash) {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "New password must be different from the current password"})
	}

	// Hash new password
	hashed, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to process password"})
	}

	// Update DB
	_, err = h.db.Exec("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", hashed, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update password"})
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Password changed successfully"})
}

// GetUserByID gets a user by ID or slug (public info only)
func (h *UserHandler) GetUserByID(c *fiber.Ctx) error {
	identifier := c.Params("id")
	if identifier == "" {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "User ID or handle is required",
		})
	}

	userID, err := h.ResolveUserID(identifier)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
	}

	var user models.User
	var slugNull, profilePicture, backgroundImage, backgroundPosition, department, bio sql.NullString
	var verificationStatus, schoolName, schoolEmail, rejectionReason sql.NullString
	var emailVerifiedAt sql.NullTime
	var lastLogin sql.NullTime
	err = h.db.QueryRow(
		`SELECT id, slug, name, email, role, verified, COALESCE(is_organization, FALSE) AS is_organization, COALESCE(org_verified, FALSE) AS org_verified, COALESCE(org_name, '') as org_name, COALESCE(org_logo_url, '') as org_logo_url,
		        COALESCE(profile_picture, '') as profile_picture, COALESCE(background_image, '') as background_image, COALESCE(background_position, '') as background_position, COALESCE(department, '') as department, COALESCE(bio, '') as bio, COALESCE(badges, '[]') as badges,
		        COALESCE(verification_status, 'not_verified') as verification_status, COALESCE(school_name, '') as school_name, COALESCE(school_email, '') as school_email, COALESCE(school_email_verified_at, NULL) as school_email_verified_at, COALESCE(verification_rejection_reason, '') as verification_rejection_reason,
		        COALESCE(created_at, NOW()) as created_at, COALESCE(updated_at, NOW()) as updated_at, COALESCE(last_login, NULL) as last_login
		   FROM users WHERE id = ?`,
		userID,
	).Scan(
		&user.ID, &slugNull, &user.Name, &user.Email, &user.Role, &user.Verified,
		&user.IsOrganization, &user.OrgVerified, &user.OrgName, &user.OrgLogoURL,
		&profilePicture, &backgroundImage, &backgroundPosition, &department, &bio, &user.Badges,
		&verificationStatus, &schoolName, &schoolEmail, &emailVerifiedAt, &rejectionReason,
		&user.CreatedAt, &user.UpdatedAt, &lastLogin,
	)

	fmt.Printf("🔍 GetUserByID(%d) query result - error: %v\n", userID, err)
	if err != nil {
		fmt.Printf("❌ Database error for user %d: %v\n", userID, err)
		// Return proper error response so we can debug the actual database issue
		if err == sql.ErrNoRows {
			return c.Status(404).JSON(models.APIResponse{
				Success: false,
				Error:   "User not found",
			})
		}
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Database error: " + err.Error(),
		})
	}

	// Log profile view (with timeout to prevent hanging)
	viewerID, _ := middleware.GetUserIDFromContext(c)
	if viewerID > 0 && viewerID != userID { // Don't log self-views or anonymous views without ID
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		h.db.ExecContext(ctx, "INSERT INTO profile_views (target_user_id, viewer_user_id) VALUES (?, ?)", userID, viewerID)
		cancel()
	} else if viewerID == 0 {
		// Optional: log anonymous views with NULL viewer_user_id
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		h.db.ExecContext(ctx, "INSERT INTO profile_views (target_user_id, viewer_user_id) VALUES (?, NULL)", userID)
		cancel()
	}

	// Convert sql.NullString to regular strings AFTER error check
	if profilePicture.Valid {
		user.ProfilePicture = profilePicture.String
		fmt.Printf("✅ Setting profile_picture for user %d: '%s'\n", userID, profilePicture.String)
	} else {
		fmt.Printf("⚠️ profile_picture for user %d is NULL/invalid\n", userID)
	}
	if backgroundImage.Valid {
		user.BackgroundImage = backgroundImage.String
	}
	if backgroundPosition.Valid {
		user.BackgroundPosition = backgroundPosition.String
	}
	if department.Valid {
		user.Department = department.String
	}
	if bio.Valid {
		user.Bio = bio.String
	}
	if verificationStatus.Valid && verificationStatus.String != "" {
		user.VerificationStatus = verificationStatus.String
	}
	if schoolName.Valid {
		user.SchoolName = schoolName.String
	}
	if schoolEmail.Valid {
		user.SchoolEmail = schoolEmail.String
	}
	if emailVerifiedAt.Valid {
		t := emailVerifiedAt.Time
		user.SchoolEmailVerifiedAt = &t
	}
	if rejectionReason.Valid {
		user.VerificationRejectionReason = rejectionReason.String
	}
	if lastLogin.Valid {
		user.LastLogin = &lastLogin.Time
	}
	user.ActivityStatus = computeActivityStatus(user.LastLogin)

	// SECURITY: Strip sensitive fields from public profile payload
	user.Email = ""

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    user,
	})
}

// GetUsers gets all users (admin only, paginated)
func (h *UserHandler) GetUsers(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	offset := (page - 1) * limit

	search := c.Query("search", "")
	role := c.Query("role", "")
	verified := c.Query("verified", "")

	baseQuery := " FROM users WHERE 1=1"
	var args []interface{}

	if search != "" {
		baseQuery += " AND (name LIKE ? OR email LIKE ?)"
		likeSearch := "%" + search + "%"
		args = append(args, likeSearch, likeSearch)
	}

	if role != "" {
		baseQuery += " AND role = ?"
		args = append(args, role)
	}

	if verified != "" {
		if verified == "true" {
			baseQuery += " AND verified = true"
		} else if verified == "false" {
			baseQuery += " AND verified = false"
		}
	}

	// Get total count
	var total int
	err := h.db.QueryRow("SELECT COUNT(*)"+baseQuery, args...).Scan(&total)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get user count",
		})
	}

	// Get users
	query := "SELECT id, name, email, role, verified, profile_picture, created_at" + baseQuery + " ORDER BY created_at DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := h.db.Query(query, args...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get users",
		})
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var user models.User
		var profilePicture sql.NullString
		err := rows.Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Verified, &profilePicture, &user.CreatedAt)

		if profilePicture.Valid {
			user.ProfilePicture = profilePicture.String
		}

		if err != nil {
			continue
		}
		users = append(users, user)
	}

	totalPages := (total + limit - 1) / limit

	return c.JSON(models.APIResponse{
		Success: true,
		Data: models.PaginatedResponse{
			Data:       users,
			Total:      total,
			Page:       page,
			Limit:      limit,
			TotalPages: totalPages,
		},
	})
}

// DeleteUser permanently deletes a user (admin only).
// This uses ON DELETE CASCADE/SET NULL constraints to clean up related records.
func (h *UserHandler) DeleteUser(c *fiber.Ctx) error {
	adminID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	userID, err := strconv.Atoi(c.Params("id"))
	if err != nil || userID <= 0 {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid user ID",
		})
	}

	// Prevent admins from deleting their own account from the admin panel
	if userID == adminID {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "You cannot delete your own admin account from the admin panel",
		})
	}

	// Ensure user exists
	var exists int
	if err := h.db.QueryRow("SELECT COUNT(*) FROM users WHERE id = ?", userID).Scan(&exists); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to check user existence",
		})
	}
	if exists == 0 {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
	}

	result, err := h.db.Exec("DELETE FROM users WHERE id = ?", userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to delete user",
		})
	}

	if rows, _ := result.RowsAffected(); rows == 0 {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "User deleted successfully",
	})
}

// SaveProduct saves a product to user's watchlist
func (h *UserHandler) SaveProduct(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	var req struct {
		ProductID int `json:"product_id"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Check if product exists
	var productExists bool
	err := h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM products WHERE id = ?)", req.ProductID).Scan(&productExists)
	if err != nil || !productExists {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Product not found",
		})
	}

	// Check if already saved (including soft-deleted ones)
	var existingID sql.NullInt64
	err = h.db.QueryRow("SELECT id FROM saved_products WHERE user_id = ? AND product_id = ?", userID, req.ProductID).Scan(&existingID)

	if err == nil && existingID.Valid {
		// Record exists - check if it's soft-deleted
		var deletedAt sql.NullTime
		err = h.db.QueryRow("SELECT deleted_at FROM saved_products WHERE id = ?", existingID.Int64).Scan(&deletedAt)
		if err == nil {
			if deletedAt.Valid && !deletedAt.Time.IsZero() {
				// Restore soft-deleted record
				_, err = h.db.Exec("UPDATE saved_products SET deleted_at = NULL, updated_at = NOW() WHERE id = ?", existingID.Int64)
				if err != nil {
					return c.Status(500).JSON(models.APIResponse{
						Success: false,
						Error:   "Failed to restore saved product",
					})
				}
				return c.JSON(models.APIResponse{
					Success: true,
					Message: "Product saved successfully",
				})
			} else {
				// Already saved and not deleted
				return c.Status(409).JSON(models.APIResponse{
					Success: false,
					Error:   "Product already saved",
				})
			}
		}
	} else if err != sql.ErrNoRows {
		// Some other error occurred
		fmt.Printf("❌ SaveProduct check failed!\n")
		fmt.Printf("UserID: %d, ProductID: %d\n", userID, req.ProductID)
		fmt.Printf("Error: %v\n", err)
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to check saved status",
		})
	}

	// Save the product (new record)
	_, err = h.db.Exec("INSERT INTO saved_products (user_id, product_id, created_at) VALUES (?, ?, NOW())", userID, req.ProductID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to save product",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Product saved successfully",
	})
}

// UnsaveProduct removes a product from user's watchlist
func (h *UserHandler) UnsaveProduct(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}
	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid product ID",
		})
	}

	// Soft delete the saved product
	result, err := h.db.Exec("UPDATE saved_products SET deleted_at = NOW() WHERE user_id = ? AND product_id = ? AND deleted_at IS NULL", userID, productID)
	if err != nil {
		fmt.Printf("❌ UnsaveProduct query failed!\n")
		fmt.Printf("UserID: %d, ProductID: %d\n", userID, productID)
		fmt.Printf("Error: %v\n", err)
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to remove saved product: " + err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Saved product not found",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Product removed from saved items",
	})
}

// CheckSavedProduct checks if a product is saved by the user
func (h *UserHandler) CheckSavedProduct(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid product ID",
		})
	}
	var isSaved bool
	// Keep check that excludes soft-deleted saved_products
	query := "SELECT EXISTS(SELECT 1 FROM saved_products WHERE user_id = ? AND product_id = ? AND deleted_at IS NULL)"
	if err := h.db.QueryRow(query, userID, productID).Scan(&isSaved); err != nil {
		// Log for debugging
		fmt.Printf("❌ Failed to check saved status (user=%d, product=%d): %v\n", userID, productID, err)
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to check saved status: " + err.Error(),
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"isSaved": isSaved,
		},
	})
}

// GetSavedProducts gets all saved products for a user
func (h *UserHandler) GetSavedProducts(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	offset := (page - 1) * limit

	// Get total count (excluding soft-deleted)
	var total int
	err := h.db.QueryRow("SELECT COUNT(*) FROM saved_products WHERE user_id = ? AND deleted_at IS NULL", userID).Scan(&total)
	if err != nil {
		fmt.Printf("❌ GetSavedProducts count query failed!\n")
		fmt.Printf("UserID: %d\n", userID)
		fmt.Printf("Error: %v\n", err)
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get saved products count: " + err.Error(),
		})
	}

	// Get saved products with product details (excluding soft-deleted)
	rows, err := h.db.Query(`
		SELECT 
			p.id, p.title, p.description, p.price, p.image_urls, p.seller_id,
			p.premium, p.status, p.allow_buying, p.barter_only, p.location,
			p.condition, p.suggested_value, p.category, p.created_at, p.updated_at,
			u.name as seller_name,
			sp.created_at as saved_at
		FROM saved_products sp
		JOIN products p ON p.id = sp.product_id
		JOIN users u ON u.id = p.seller_id
		WHERE sp.user_id = ? AND sp.deleted_at IS NULL
		ORDER BY sp.created_at DESC
		LIMIT ? OFFSET ?
	`, userID, limit, offset)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get saved products",
		})
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var product models.Product
		var savedAt string
		err := rows.Scan(
			&product.ID, &product.Title, &product.Description, &product.Price,
			&product.ImageURLs, &product.SellerID, &product.Premium, &product.Status,
			&product.AllowBuying, &product.BarterOnly, &product.Location,
			&product.Condition, &product.SuggestedValue, &product.Category,
			&product.CreatedAt, &product.UpdatedAt, &product.SellerName, &savedAt,
		)
		if err != nil {
			continue
		}
		products = append(products, product)
	}

	totalPages := (total + limit - 1) / limit

	return c.JSON(models.APIResponse{
		Success: true,
		Data: models.PaginatedResponse{
			Data:       products,
			Total:      total,
			Page:       page,
			Limit:      limit,
			TotalPages: totalPages,
		},
	})
}

// GetSellerStats retrieves statistics for a seller profile
func (h *UserHandler) GetSellerStats(c *fiber.Ctx) error {
	identifier := c.Params("id")
	if identifier == "" {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "User ID or handle is required",
		})
	}

	userID, err := h.ResolveUserID(identifier)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
	}

	// Check if user exists
	var userCreatedAt time.Time
	err = h.db.QueryRow("SELECT created_at FROM users WHERE id = ?", userID).Scan(&userCreatedAt)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
	}

	stats := models.SellerStats{
		UserID:          userID,
		MemberSinceYear: userCreatedAt.Year(),
	}

	// Calculate total trades (completed trades for this user as seller)
	err = h.db.QueryRow(`
		SELECT COUNT(*) FROM trades 
		WHERE seller_id = ? AND status IN ('completed', 'auto_completed')
	`, userID).Scan(&stats.TotalTrades)
	if err != nil {
		stats.TotalTrades = 0
	}

	// Calculate completed trades
	err = h.db.QueryRow(`
		SELECT COUNT(*) FROM trades 
		WHERE seller_id = ? AND status = 'completed' AND seller_completed = true
	`, userID).Scan(&stats.CompletedTrades)
	if err != nil {
		stats.CompletedTrades = 0
	}

	// Calculate cancelled trades
	err = h.db.QueryRow(`
		SELECT COUNT(*) FROM trades 
		WHERE seller_id = ? AND status = 'cancelled'
	`, userID).Scan(&stats.CancelledTrades)
	if err != nil {
		stats.CancelledTrades = 0
	}

	// Calculate pending trades
	err = h.db.QueryRow(`
		SELECT COUNT(*) FROM trades 
		WHERE seller_id = ? AND status IN ('pending', 'accepted', 'active', 'awaiting_confirmation')
	`, userID).Scan(&stats.PendingTrades)
	if err != nil {
		stats.PendingTrades = 0
	}

	// Calculate average rating and positive feedback percentage from reviews table
	var avgRating sql.NullFloat64
	var totalReviews sql.NullInt64
	var positivePercent sql.NullFloat64

	err = h.db.QueryRow(`
		SELECT 
			COALESCE(AVG(rating), 0) AS avg_rating,
			COUNT(*) AS total_reviews,
			COALESCE(SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 0) AS positive_feedback
		FROM reviews
		WHERE reviewed_user_id = ?
	`, userID).Scan(&avgRating, &totalReviews, &positivePercent)

	if err == nil && avgRating.Valid {
		stats.AvgRating = avgRating.Float64
		stats.TotalFeedback = int(totalReviews.Int64)
		if positivePercent.Valid {
			stats.PositivePercent = positivePercent.Float64
		}
	}

	// Determine response metric based on average rating
	if stats.AvgRating >= 4.5 {
		stats.ResponseMetric = "excellent"
	} else if stats.AvgRating >= 3.5 {
		stats.ResponseMetric = "good"
	} else if stats.AvgRating >= 2.5 {
		stats.ResponseMetric = "average"
	} else {
		stats.ResponseMetric = "poor"
	}

	// Calculate average response time (estimated as minutes from trade creation to first completion activity)
	var avgResponseTimeMinutes sql.NullFloat64
	err = h.db.QueryRow(`
		SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, CASE 
			WHEN seller_completed THEN COALESCE(updated_at, NOW())
			ELSE NOW()
		END)) as avg_response_minutes
		FROM trades
		WHERE seller_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 90 DAY)
		LIMIT 100
	`, userID).Scan(&avgResponseTimeMinutes)

	if err == nil && avgResponseTimeMinutes.Valid {
		minutes := int(avgResponseTimeMinutes.Float64)
		if minutes < 60 {
			stats.AvgResponseTime = fmt.Sprintf("%dm", minutes)
		} else if minutes < 1440 {
			hours := minutes / 60
			stats.AvgResponseTime = fmt.Sprintf("%dh", hours)
		} else {
			days := minutes / 1440
			stats.AvgResponseTime = fmt.Sprintf("%dd", days)
		}
	} else {
		stats.AvgResponseTime = "N/A"
	}

	// --- Trust Score Computation (0-100) with detailed breakdown ---
	var trustFactors []models.TrustFactor

	// 1. Verified account: 15 points
	var verificationStatus string
	_ = h.db.QueryRow("SELECT COALESCE(verification_status, 'not_verified') FROM users WHERE id = ?", userID).Scan(&verificationStatus)
	verifiedPoints := 0
	verifiedStatus := "fail"
	switch verificationStatus {
	case "verified":
		verifiedPoints = 15
		verifiedStatus = "pass"
	case "pending":
		verifiedPoints = 5
		verifiedStatus = "warn"
	}
	trustFactors = append(trustFactors, models.TrustFactor{Label: "Verified account", Status: verifiedStatus, Points: verifiedPoints, Max: 15})

	// 2. Completed trades: 25 points (capped at 20 trades)
	tradePoints := 0
	tradeStatus := "warn"
	if stats.CompletedTrades > 0 {
		capped := stats.CompletedTrades
		if capped > 20 {
			capped = 20
		}
		tradePoints = int((float64(capped) / 20.0) * 25.0)
		if stats.CompletedTrades >= 5 {
			tradeStatus = "pass"
		}
	}
	trustFactors = append(trustFactors, models.TrustFactor{Label: "Completed trades", Status: tradeStatus, Points: tradePoints, Max: 25})

	// 3. Positive ratings: 25 points (avg_rating / 5 * 25)
	ratingPoints := 0
	ratingStatus := "warn"
	if stats.AvgRating > 0 {
		ratingPoints = int((stats.AvgRating / 5.0) * 25.0)
		if stats.AvgRating >= 4.0 {
			ratingStatus = "pass"
		} else if stats.AvgRating < 2.5 {
			ratingStatus = "fail"
		}
	}
	trustFactors = append(trustFactors, models.TrustFactor{Label: "Positive ratings", Status: ratingStatus, Points: ratingPoints, Max: 25})

	// 4. No reports: 20 points (lose points per report)
	var reportCount int
	err = h.db.QueryRow("SELECT COUNT(*) FROM reports WHERE reported_user_id = ? AND status IN ('reviewed', 'resolved')", userID).Scan(&reportCount)
	if err != nil {
		reportCount = 0
	}
	reportPoints := 20
	reportStatus := "pass"
	if reportCount > 0 {
		reportPoints = 20 - (reportCount * 5)
		if reportPoints < 0 {
			reportPoints = 0
		}
		if reportCount >= 3 {
			reportStatus = "fail"
		} else {
			reportStatus = "warn"
		}
	}
	trustFactors = append(trustFactors, models.TrustFactor{Label: "No reports", Status: reportStatus, Points: reportPoints, Max: 20})

	// 5. Response time: 15 points
	responsePoints := 0
	responseStatus := "warn"
	if avgResponseTimeMinutes.Valid {
		minutes := int(avgResponseTimeMinutes.Float64)
		if minutes <= 60 {
			responsePoints = 15
			responseStatus = "pass"
		} else if minutes <= 360 {
			responsePoints = 10
			responseStatus = "pass"
		} else if minutes <= 1440 {
			responsePoints = 5
			responseStatus = "warn"
		} else {
			responsePoints = 0
			responseStatus = "warn"
		}
	}
	trustFactors = append(trustFactors, models.TrustFactor{Label: "Fast responses", Status: responseStatus, Points: responsePoints, Max: 15})

	// Sum all factors
	totalScore := verifiedPoints + tradePoints + ratingPoints + reportPoints + responsePoints
	if totalScore > 100 {
		totalScore = 100
	}
	stats.TrustScore = totalScore
	stats.TrustFactors = trustFactors

	// Determine trust level
	if stats.TrustScore >= 80 {
		stats.TrustLevel = "trusted"
	} else if stats.TrustScore >= 50 {
		stats.TrustLevel = "new"
	} else {
		stats.TrustLevel = "risky"
	}

	stats.ReportCount = reportCount
	stats.HasReports = reportCount > 0

	// --- Conduct Summary from trade grades ---
	conductSummary := h.computeConductSummary(userID)
	if conductSummary != nil {
		stats.ConductSummary = conductSummary
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    stats,
	})
}

// SuspendUser updates a user's role to 'suspended' (admin only)
func (h *UserHandler) SuspendUser(c *fiber.Ctx) error {
	userID := c.Params("id")

	// Ensure we don't suspend the main admin accidentally, although we trust the admin UI
	if userID == "1" {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Cannot suspend the primary admin account",
		})
	}

	result, err := h.db.Exec("UPDATE users SET role = 'suspended', updated_at = NOW() WHERE id = ?", userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to suspend user: " + err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "User has been suspended successfully",
	})
}

// UnsuspendUser restores a suspended user's role to 'user' (admin only)
func (h *UserHandler) UnsuspendUser(c *fiber.Ctx) error {
	userID := c.Params("id")

	result, err := h.db.Exec("UPDATE users SET role = 'user', updated_at = NOW() WHERE id = ?", userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to unsuspend user: " + err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "User has been unsuspended successfully",
	})
}

// computeConductSummary builds a UserConductSummary for a given user from trade_grades
func (h *UserHandler) computeConductSummary(userID int) *models.UserConductSummary {
	rows, err := h.db.Query(`
		SELECT communication, item_accuracy, punctuality, overall
		FROM trade_grades WHERE graded_user_id = ?
	`, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var commSum, accSum, punctSum, overallSum float64
	var count int
	for rows.Next() {
		var comm, acc, punct, ov int
		if err := rows.Scan(&comm, &acc, &punct, &ov); err != nil {
			continue
		}
		commSum += float64(comm)
		accSum += float64(acc)
		punctSum += float64(punct)
		overallSum += float64(ov)
		count++
	}
	if count == 0 {
		return nil
	}

	commAvg := commSum / float64(count)
	accAvg := accSum / float64(count)
	punctAvg := punctSum / float64(count)
	overallAvg := overallSum / float64(count)

	// Cancellation rate: cancelled trades / total trades
	var totalTrades, cancelledTrades int
	_ = h.db.QueryRow(`SELECT COUNT(*) FROM trades WHERE buyer_id = ? OR seller_id = ?`, userID, userID).Scan(&totalTrades)
	_ = h.db.QueryRow(`SELECT COUNT(*) FROM trades WHERE (buyer_id = ? OR seller_id = ?) AND status = 'cancelled'`, userID, userID).Scan(&cancelledTrades)
	cancellationRate := 0.0
	if totalTrades > 0 {
		cancellationRate = float64(cancelledTrades) / float64(totalTrades)
	}

	// Dispute rate: reports filed against user / total trades
	var disputeCount int
	_ = h.db.QueryRow(`SELECT COUNT(*) FROM reports WHERE reported_user_id = ?`, userID).Scan(&disputeCount)
	disputeRate := 0.0
	if totalTrades > 0 {
		disputeRate = float64(disputeCount) / float64(totalTrades)
	}

	letterGrade := computeLetterGrade(overallAvg, cancellationRate, disputeRate)

	return &models.UserConductSummary{
		UserID:      userID,
		LetterGrade: letterGrade,
		OverallAvg:  overallAvg,
		TotalGrades: count,
		Categories: []models.ConductGrade{
			{Category: "Communication", Avg: commAvg, Count: count},
			{Category: "Item Accuracy", Avg: accAvg, Count: count},
			{Category: "Punctuality", Avg: punctAvg, Count: count},
			{Category: "Overall", Avg: overallAvg, Count: count},
		},
		CancellationRate: cancellationRate,
		DisputeRate:      disputeRate,
	}
}

// computeLetterGrade derives a letter grade from the overall average and behaviour rates
func computeLetterGrade(overallAvg, cancellationRate, disputeRate float64) string {
	// Penalty: lower effective score for high cancellation/dispute
	effective := overallAvg - (cancellationRate * 1.0) - (disputeRate * 1.5)
	if effective < 0 {
		effective = 0
	}
	switch {
	case effective >= 4.8:
		return "A+"
	case effective >= 4.5:
		return "A"
	case effective >= 4.0:
		return "B+"
	case effective >= 3.5:
		return "B"
	case effective >= 2.5:
		return "C"
	case effective >= 1.5:
		return "D"
	default:
		return "F"
	}
}

// SubmitTradeGrade allows a trade participant to grade their counterpart
func (h *UserHandler) SubmitTradeGrade(c *fiber.Ctx) error {
	graderID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	tradeID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid trade ID",
		})
	}

	// Verify trade exists and is completed
	var buyerID, sellerID int
	var status string
	err = h.db.QueryRow("SELECT buyer_id, seller_id, status FROM trades WHERE id = ?", tradeID).Scan(&buyerID, &sellerID, &status)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Trade not found",
		})
	}
	if status != "completed" && status != "auto_completed" {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Can only grade completed trades",
		})
	}

	// Determine who is being graded
	var gradedUserID int
	switch graderID {
	case buyerID:
		gradedUserID = sellerID
	case sellerID:
		gradedUserID = buyerID
	default:
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "You are not a participant in this trade",
		})
	}

	// Parse body
	var req models.TradeGradeCreate
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Validate ranges
	for _, v := range []int{req.Communication, req.ItemAccuracy, req.Punctuality, req.Overall} {
		if v < 1 || v > 5 {
			return c.Status(400).JSON(models.APIResponse{
				Success: false,
				Error:   "All grade categories must be between 1 and 5",
			})
		}
	}

	// Check for duplicate grade
	var existing int
	err = h.db.QueryRow("SELECT COUNT(*) FROM trade_grades WHERE trade_id = ? AND grader_id = ?", tradeID, graderID).Scan(&existing)
	if err == nil && existing > 0 {
		return c.Status(409).JSON(models.APIResponse{
			Success: false,
			Error:   "You have already graded this trade",
		})
	}

	_, err = h.db.Exec(`
		INSERT INTO trade_grades (trade_id, grader_id, graded_user_id, communication, item_accuracy, punctuality, overall, comment)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, tradeID, graderID, gradedUserID, req.Communication, req.ItemAccuracy, req.Punctuality, req.Overall, req.Comment)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to save trade grade",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Trade grade submitted successfully",
	})
}

// GetUserConduct returns the aggregated conduct summary for a user
func (h *UserHandler) GetUserConduct(c *fiber.Ctx) error {
	userID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid user ID",
		})
	}

	summary := h.computeConductSummary(userID)
	if summary == nil {
		return c.JSON(models.APIResponse{
			Success: true,
			Data: models.UserConductSummary{
				UserID:      userID,
				LetterGrade: "N/A",
				TotalGrades: 0,
				Categories:  []models.ConductGrade{},
			},
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    summary,
	})
}
