package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

func generateSlug(name string) string {
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

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Connect to database directly
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_NAME"),
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Ensure `slug` column exists
	addColQuery := "ALTER TABLE users ADD COLUMN slug VARCHAR(255) UNIQUE AFTER id;"
	_, err = db.Exec(addColQuery)
	if err != nil {
		// If MySQL < 8.0, IF NOT EXISTS throws an error, so we catch duplicate column error
		if !strings.Contains(err.Error(), "Duplicate column name") {
			log.Fatalf("❌ Failed to add `slug` column: %v", err)
		} else {
			log.Println("ℹ️ `slug` column already exists.")
		}
	} else {
		log.Println("✅ `slug` column ensured.")
	}

	// Fetch all users
	rows, err := db.Query("SELECT id, name FROM users WHERE slug IS NULL OR slug = ''")
	if err != nil {
		log.Fatalf("❌ Failed to fetch users: %v", err)
	}
	defer rows.Close()

	updatedCount := 0
	for rows.Next() {
		var id int
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			log.Printf("⚠️ Failed to scan user %d: %v", id, err)
			continue
		}

		// Generate slug
		slug := generateSlug(name)

		// Ensure uniqueness constraint
		baseSlug := slug
		counter := 1
		for {
			var exists int
			err := db.QueryRow("SELECT COUNT(*) FROM users WHERE slug = ?", slug).Scan(&exists)
			if err != nil || exists == 0 {
				break
			}
			slug = fmt.Sprintf("%s-%d", baseSlug, counter)
			counter++
		}

		// Update user
		_, err = db.Exec("UPDATE users SET slug = ? WHERE id = ?", slug, id)
		if err != nil {
			log.Printf("❌ Failed to update slug for user %d: %v", id, err)
		} else {
			updatedCount++
			log.Printf("✅ Updated user %d -> %s", id, slug)
		}
	}

	log.Printf("🎉 Finished! Generated slugs for %d users.", updatedCount)
}
