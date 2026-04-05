package main

import (
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/utils"
)

func main() {
	// Load env files if present (same behavior as server startup).
	// godotenv.Load does NOT override already-set env vars.
	_ = godotenv.Load(".env.local")
	_ = godotenv.Load()
	if os.Getenv("DB_HOST") == "" {
		log.Println("Warning: DB_HOST is not set; ensure .env is present or env vars are configured")
	}

	createAdminUser()
}

func createAdminUser() {
	// Initialize database
	if err := database.InitDatabase(); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer database.CloseDatabase()

	// Create admin user
	adminEmail := "admin@clovia.com"
	adminPassword := "admin123"
	adminName := "Admin User"

	// Check if admin already exists
	var existingID int
	err := database.DB.QueryRow("SELECT id FROM users WHERE email = ?", adminEmail).Scan(&existingID)
	if err == nil {
		// Ensure password/role/verified are correct and predictable.
		hashedPassword, err := utils.HashPassword(adminPassword)
		if err != nil {
			log.Fatal("Failed to hash password:", err)
		}
		_, updErr := database.DB.Exec(
			"UPDATE users SET password_hash = ?, role = 'admin', verified = true WHERE id = ?",
			hashedPassword, existingID,
		)
		if updErr != nil {
			log.Fatal("Failed to update existing admin user:", updErr)
		}

		log.Printf("Admin user already exists with ID: %d (password/role refreshed)", existingID)
		log.Printf("Email: %s", adminEmail)
		log.Printf("Password: %s", adminPassword)
		log.Printf("Role: admin")
		return
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(adminPassword)
	if err != nil {
		log.Fatal("Failed to hash password:", err)
	}

	// Insert admin user
	result, err := database.DB.Exec(
		"INSERT INTO users (name, email, password_hash, role, verified) VALUES (?, ?, ?, 'admin', true)",
		adminName, adminEmail, hashedPassword,
	)
	if err != nil {
		log.Fatal("Failed to create admin user:", err)
	}

	adminID, _ := result.LastInsertId()
	log.Printf("Admin user created successfully with ID: %d", adminID)
	log.Printf("Email: %s", adminEmail)
	log.Printf("Password: %s", adminPassword)
	log.Printf("Role: admin")
}
