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
		"ALTER TABLE users ADD COLUMN email_notifications_enabled BOOLEAN DEFAULT TRUE",
		"ALTER TABLE users ADD COLUMN push_notifications_enabled BOOLEAN DEFAULT TRUE",
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
