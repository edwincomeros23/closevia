package main

import (
	"log"

	"github.com/joho/godotenv"
	"github.com/xashathebest/clovia/database"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using default values")
	}

	// Initialize database
	if err := database.InitDatabase(); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer database.CloseDatabase()

	// Run migration - check if columns exist first
	var count int
	err := database.DB.QueryRow("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trades' AND COLUMN_NAME = 'meetup_location'").Scan(&count)
	if err != nil {
		log.Fatal("Failed to check if column exists:", err)
	}

	if count == 0 {
		// Add columns
		migrationSQL := `
			ALTER TABLE trades
			  ADD COLUMN meetup_location VARCHAR(500) NULL AFTER seller_feedback,
			  ADD COLUMN buyer_meetup_confirmed BOOLEAN DEFAULT FALSE AFTER meetup_location,
			  ADD COLUMN seller_meetup_confirmed BOOLEAN DEFAULT FALSE AFTER buyer_meetup_confirmed;
		`

		if _, err := database.DB.Exec(migrationSQL); err != nil {
			log.Fatal("Failed to run migration:", err)
		}
		log.Println("Migration completed successfully!")
	} else {
		log.Println("Migration already applied!")
	}

	// Create index
	indexSQL := `CREATE INDEX IF NOT EXISTS idx_trades_meetup_confirmed ON trades (buyer_meetup_confirmed, seller_meetup_confirmed);`
	if _, err := database.DB.Exec(indexSQL); err != nil {
		log.Fatal("Failed to create index:", err)
	}

	log.Println("Index created successfully!")
}
