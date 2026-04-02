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

	fmt.Println("Testing database connection...")
	if err := database.InitDatabase(); err != nil {
		log.Fatal("Failed to init DB:", err)
	}

	fmt.Println("✓ Database initialized successfully")

	// Test 1: Check if products table exists and list columns
	fmt.Println("\nTesting products table schema...")
	rows, err := database.DB.Query(`
		SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_NAME = 'products' AND TABLE_SCHEMA = DATABASE()
	`)
	if err != nil {
		log.Fatal("Error querying schema:", err)
	}
	defer rows.Close()

	fmt.Println("Products table columns:")
	for rows.Next() {
		var colName, colType, isNullable, colDefault string
		rows.Scan(&colName, &colType, &isNullable, &colDefault)
		fmt.Printf("  - %s (%s)\n", colName, colType)
	}

	// Test 2: Try to insert a simple product
	fmt.Println("\nTesting product insertion...")
	result, err := database.DB.Exec(`
		INSERT INTO products (seller_id, title, slug, description, category, price, image_url, status, `+"`condition`"+`, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
	`, 100, "Test Product", "test-product", "Test Description", "Electronics", 50000, "https://example.com/test.jpg", "available", "like_new")

	if err != nil {
		log.Printf("Error inserting product: %v\n", err)
	} else {
		pid, _ := result.LastInsertId()
		fmt.Printf("✓ Product inserted successfully! ID: %d\n", pid)
	}

	database.CloseDatabase()
	fmt.Println("\n✓ Database connection test complete")
}
