package handlers

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"math/big"
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

func derefString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
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

	// WMSU prioritization: enforce WMSU email for non-organization accounts
	if !user.IsOrganization {
		if !strings.HasSuffix(strings.ToLower(user.Email), "@wmsu.edu.ph") {
			return c.Status(400).JSON(models.APIResponse{
				Success: false,
				Error:   "WMSU students must register with their @wmsu.edu.ph email",
			})
		}
		// Department required for WMSU emails
		if user.Department == nil || *user.Department == "" {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Please select your department/college"})
		}
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(user.Password)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to process password",
		})
	}

	// Insert new user
	result, err := h.db.Exec(
		"INSERT INTO users (name, email, password_hash, role, is_organization, org_verified, org_name, org_logo_url, department, bio, badges, profile_picture, language_preference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, JSON_ARRAY(), ?, ?)",
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

	// ── EMAIL VERIFICATION TEMPORARILY DISABLED (Mailgun key not yet configured) ──
	// To re-enable: remove the verified=TRUE line below and uncomment the OTP block.
	h.db.Exec("UPDATE users SET verified = TRUE WHERE id = ?", userID)
	// otpCode, otpHash, otpExpiry, otpErr := generateOTP()
	// if otpErr == nil {
	// 	h.db.Exec(
	// 		"UPDATE users SET email_otp_hash = ?, email_otp_expires = ? WHERE id = ?",
	// 		otpHash, otpExpiry, userID,
	// 	)
	// 	go services.SendOTPEmail(user.Email, user.Name, otpCode)
	// }

	// Auto-grant premium for WMSU students (@wmsu.edu.ph email)
	isWmsuStudent := !user.IsOrganization && strings.HasSuffix(strings.ToLower(user.Email), "@wmsu.edu.ph")
	if isWmsuStudent {
		h.db.Exec("UPDATE users SET is_premium = TRUE WHERE id = ?", userID)
	}

	// Generate JWT token immediately so user is logged in right after registration
	token, err := utils.GenerateJWT(int(userID), user.Email)
	if err != nil {
		token = ""
	}

	return c.Status(201).JSON(models.APIResponse{
		Success: true,
		Message: "User registered successfully",
		Data: fiber.Map{
			"user": models.User{
				ID:                 int(userID),
				Name:               user.Name,
				Email:              user.Email,
				Verified:           true,
				IsOrganization:     user.IsOrganization,
				OrgVerified:        false,
				OrgName:            user.OrgName,
				OrgLogoURL:         user.OrgLogoURL,
				Department:         derefString(user.Department),
				Bio:                user.Bio,
				ProfilePicture:     "",
				LanguagePreference: "en",
				IsPremium:          isWmsuStudent,
			},
			"requires_verification": false,
			"token":                 token,
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
	_, err = h.db.Exec(
		"UPDATE users SET verified = true, email_otp_hash = NULL, email_otp_expires = NULL WHERE id = ?",
		userID,
	)
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
		"SELECT id, name, email, password_hash, role, verified FROM users WHERE email = ?",
		login.Email,
	).Scan(&user.ID, &user.Name, &user.Email, &user.PasswordHash, &user.Role, &user.Verified)

	if err != nil {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid credentials",
		})
	}

	// Check password
	if !utils.CheckPasswordHash(login.Password, user.PasswordHash) {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid credentials",
		})
	}

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
		"SELECT id, name, email, role, verified, profile_picture, language_preference FROM users WHERE email = ?",
		req.Email,
	).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Verified, &user.ProfilePicture, &user.LanguagePreference)

	if err == sql.ErrNoRows {
		// Create new user from Google info
		result, err := h.db.Exec(
			"INSERT INTO users (name, email, role, verified, profile_picture, is_organization, org_verified, badges, language_preference) VALUES (?, ?, ?, ?, ?, ?, ?, JSON_ARRAY(), ?)",
			req.DisplayName,
			req.Email,
			"user",
			true, // Mark as verified since they authenticated with Google
			req.PhotoURL,
			false,
			false,
			"en",
		)
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{
				Success: false,
				Error:   "Failed to create user",
			})
		}

		userID, _ := result.LastInsertId()
		user.ID = int(userID)
		user.Name = req.DisplayName
		user.Email = req.Email
		user.Verified = true
		user.ProfilePicture = req.PhotoURL
		user.Role = "user"
		user.LanguagePreference = "en"
	} else if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Database error",
		})
	}

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

	err := h.db.QueryRow(
		`SELECT id, name, email, role, verified, 
		        COALESCE(org_logo_url, '') AS org_logo_url,
		        COALESCE(profile_picture, '') AS profile_picture,
		        COALESCE(bio, '') AS bio,
		        COALESCE(background_image, '') AS background_image,
		        COALESCE(background_position, '') AS background_position,
		        COALESCE(department, '') AS department, 
		        COALESCE(is_premium, FALSE) AS is_premium,
		        COALESCE(verification_status, 'not_verified') AS verification_status,
		        COALESCE(school_name, '') AS school_name,
		        COALESCE(school_email, '') AS school_email,
		        school_email_verified_at,
		        COALESCE(verification_rejection_reason, '') AS verification_rejection_reason,
		        COALESCE(email_notifications_enabled, TRUE) AS email_notifications_enabled,
		        COALESCE(push_notifications_enabled, TRUE) AS push_notifications_enabled,
		        COALESCE(language_preference, 'en') AS language_preference,
		        created_at, updated_at
		 FROM users WHERE id = ?`,
		userID,
	).Scan(
		&user.ID, &user.Name, &user.Email, &user.Role, &user.Verified, &user.OrgLogoURL,
		&user.ProfilePicture, &user.Bio, &user.BackgroundImage, &user.BackgroundPosition, &user.Department, &user.IsPremium,
		&user.VerificationStatus, &user.SchoolName, &user.SchoolEmail, &schoolEmailVerifiedAt, &user.VerificationRejectionReason,
		&user.EmailNotificationsEnabled, &user.PushNotificationsEnabled,
		&user.LanguagePreference,
		&user.CreatedAt, &user.UpdatedAt,
	)

	if schoolEmailVerifiedAt.Valid {
		user.SchoolEmailVerifiedAt = &schoolEmailVerifiedAt.Time
	}

	if err != nil {
		fmt.Printf("❌ ERROR in GetProfile (ID: %v): %v\n", userID, err)
		// Return a friendly fallback (200) so frontend does not produce a network 404.
		// Frontend expects a user-like object; provide minimal public fields.
		fallback := models.User{
			ID:             userID,
			Name:           "User",
			Verified:       false,
			IsOrganization: false,
			CreatedAt:      time.Now(),
			ProfilePicture: "",
		}
		return c.JSON(models.APIResponse{
			Success: true,
			Data:    fallback,
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    user,
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

	// Build update query dynamically
	query := "UPDATE users SET updated_at = CURRENT_TIMESTAMP"
	var args []interface{}

	if updateData.Name != nil {
		query += ", name = ?"
		args = append(args, *updateData.Name)
	}
	if updateData.Email != nil {
		query += ", email = ?"
		args = append(args, *updateData.Email)
	}
	if updateData.ProfilePicture != nil {
		query += ", profile_picture = ?"
		args = append(args, *updateData.ProfilePicture)
		fmt.Printf("✅ UpdateProfile: Setting profile_picture to '%s' for user %d\n", *updateData.ProfilePicture, userID)
	}

	if updateData.Bio != nil {
		query += ", bio = ?"
		args = append(args, *updateData.Bio)
	}

	if updateData.BackgroundImage != nil {
		// allow column name background_image or cover_photo depending on schema; try background_image first
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
		fmt.Printf("✅ UpdateProfile: Setting language_preference to '%s' for user %d\n", *updateData.LanguagePreference, userID)
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
			// Try adding profile_picture, background_image, background_position, bio, language_preference as needed
			// Note: guard each ALTER with best-effort; ignore errors to let retry attempt proceed
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

// GetUserByID gets a user by ID (public info only)
func (h *UserHandler) GetUserByID(c *fiber.Ctx) error {
	userID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid user ID",
		})
	}

	var user models.User
	var profilePicture, backgroundImage, backgroundPosition, department, bio sql.NullString
	var verificationStatus, schoolName, schoolEmail, rejectionReason sql.NullString
	var emailVerifiedAt sql.NullTime
	err = h.db.QueryRow(
		`SELECT id, name, email, role, verified, is_organization, org_verified, org_name, org_logo_url,
		        profile_picture, background_image, background_position, department, bio, badges,
		        verification_status, school_name, school_email, school_email_verified_at, verification_rejection_reason,
		        created_at, updated_at
		   FROM users WHERE id = ?`,
		userID,
	).Scan(
		&user.ID, &user.Name, &user.Email, &user.Role, &user.Verified,
		&user.IsOrganization, &user.OrgVerified, &user.OrgName, &user.OrgLogoURL,
		&profilePicture, &backgroundImage, &backgroundPosition, &department, &bio, &user.Badges,
		&verificationStatus, &schoolName, &schoolEmail, &emailVerifiedAt, &rejectionReason,
		&user.CreatedAt, &user.UpdatedAt,
	)

	fmt.Printf("🔍 GetUserByID(%d) query result - error: %v\n", userID, err)
	if err != nil {
		fmt.Printf("❌ Database error for user %d: %v\n", userID, err)
		// Return a friendly fallback (200) so frontend does not produce a network 404.
		fallback := models.User{
			ID:             userID,
			Name:           "User",
			Verified:       false,
			IsOrganization: false,
			CreatedAt:      time.Now(),
			ProfilePicture: "",
		}
		return c.JSON(models.APIResponse{
			Success: true,
			Data:    fallback,
		})
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

	// Get total count
	var total int
	err := h.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&total)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get user count",
		})
	}

	// Get users
	rows, err := h.db.Query(
		"SELECT id, name, email, role, verified, profile_picture, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?",
		limit, offset,
	)
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

// GetSellerStats gets comprehensive seller statistics
func (h *UserHandler) GetSellerStats(c *fiber.Ctx) error {
	userID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid user ID",
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

	// Calculate trust score (0-100) from rating, positive feedback, and completed trades
	// Rating component: up to 40 points (rating/5 * 40)
	ratingScore := 0.0
	if stats.AvgRating > 0 {
		ratingScore = (stats.AvgRating / 5.0) * 40.0
	}
	// Positive feedback component: up to 30 points (percent/100 * 30)
	feedbackScore := 0.0
	if stats.PositivePercent > 0 {
		feedbackScore = (stats.PositivePercent / 100.0) * 30.0
	}
	// Completed trades component: up to 30 points (capped at 20 trades)
	tradeScore := 0.0
	if stats.CompletedTrades > 0 {
		capped := stats.CompletedTrades
		if capped > 20 {
			capped = 20
		}
		tradeScore = (float64(capped) / 20.0) * 30.0
	}
	stats.TrustScore = int(ratingScore + feedbackScore + tradeScore)
	if stats.TrustScore > 100 {
		stats.TrustScore = 100
	}

	// Determine trust level
	if stats.TrustScore >= 80 {
		stats.TrustLevel = "trusted"
	} else if stats.TrustScore >= 50 {
		stats.TrustLevel = "new"
	} else {
		stats.TrustLevel = "risky"
	}

	// Count reports against this user (only reviewed/resolved ones)
	var reportCount int
	err = h.db.QueryRow("SELECT COUNT(*) FROM reports WHERE reported_user_id = ? AND status IN ('reviewed', 'resolved')", userID).Scan(&reportCount)
	if err != nil {
		reportCount = 0
	}
	stats.ReportCount = reportCount
	stats.HasReports = reportCount > 0

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
