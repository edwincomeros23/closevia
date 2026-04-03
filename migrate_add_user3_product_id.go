//go:build ignore

package main

import (
	"fmt"
	"log"

	"github.com/joho/godotenv"
	"github.com/xashathebest/clovia/database"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}
	if err := database.InitDatabase(); err != nil {
		log.Fatal("Failed to init DB:", err)
	}
	defer database.CloseDatabase()

	fmt.Println("=== ADDING user3_product_id COLUMN ===\n")

	// Check if column already exists
	var columnExists bool
	err := database.DB.QueryRow(`
		SELECT COUNT(*) > 0 
		FROM INFORMATION_SCHEMA.COLUMNS 
		WHERE TABLE_SCHEMA = DATABASE() 
		AND TABLE_NAME = 'multiway_trades' 
		AND COLUMN_NAME = 'user3_product_id'
	`).Scan(&columnExists)

	if err != nil {
		fmt.Println("Error checking column:", err)
		return
	}

	if columnExists {
		fmt.Println("✓ Column user3_product_id already exists")
		return
	}

	fmt.Println("Adding user3_product_id column...")
	_, err = database.DB.Exec(`
		ALTER TABLE multiway_trades 
		ADD COLUMN user3_product_id INT NULL COMMENT 'Product that User 3 has (wants)' AFTER user3_id,
		ADD FOREIGN KEY (user3_product_id) REFERENCES products(id) ON DELETE SET NULL
	`)

	if err != nil {
		fmt.Println("Error adding column:", err)
		return
	}

	fmt.Println("✓ Column added successfully!")

	// Verify
	var count int
	database.DB.QueryRow(`
		SELECT COUNT(*) 
		FROM INFORMATION_SCHEMA.COLUMNS 
		WHERE TABLE_SCHEMA = DATABASE() 
		AND TABLE_NAME = 'multiway_trades' 
		AND COLUMN_NAME = 'user3_product_id'
	`).Scan(&count)

	if count > 0 {
		fmt.Println("✓ Verification: Column exists and is accessible")
	}

	fmt.Println("\n✓ Migration complete")
}
