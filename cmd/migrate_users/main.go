package main

import (
	"fmt"
	"log"

	"github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
	"github.com/xashathebest/clovia/database"
)

func main() {
	if err := godotenv.Load(".env"); err != nil {
		log.Fatal("Error loading .env file")
	}

	if err := database.InitDatabase(); err != nil {
		log.Fatalf("Failed to init db: %v", err)
	}
	defer database.CloseDatabase()

	queries := []string{
		"ALTER TABLE users ADD COLUMN verification_status VARCHAR(50) DEFAULT 'not_verified'",
		"ALTER TABLE users ADD COLUMN school_name VARCHAR(255) NULL",
		"ALTER TABLE users ADD COLUMN school_email VARCHAR(255) NULL",
		"ALTER TABLE users ADD COLUMN school_email_verified_at TIMESTAMP NULL",
		"ALTER TABLE users ADD COLUMN school_id_image_path VARCHAR(512) NULL",
		"ALTER TABLE users ADD COLUMN verification_rejection_reason TEXT NULL",
		"ALTER TABLE users ADD COLUMN is_premium BOOLEAN DEFAULT FALSE",
	}

	for _, query := range queries {
		_, err := database.DB.Exec(query)
		if err != nil {
			if mysqlErr, ok := err.(*mysql.MySQLError); ok && mysqlErr.Number == 1060 {
				fmt.Printf("Column already exists: %v\n", err)
			} else {
				fmt.Printf("Error running '%s': %v\n", query, err)
			}
		} else {
			fmt.Printf("Successfully added column for query: %s\n", query)
		}
	}
}
