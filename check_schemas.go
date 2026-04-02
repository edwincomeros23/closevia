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

	// Check users table schema
	fmt.Println("Users table columns:")
	rows, err := database.DB.Query(`
		SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_NAME = 'users' AND TABLE_SCHEMA = DATABASE()
		ORDER BY ORDINAL_POSITION
	`)
	if err != nil {
		log.Fatal("Error querying users schema:", err)
	}
	defer rows.Close()

	for rows.Next() {
		var colName, colType, isNullable, colDefault string
		rows.Scan(&colName, &colType, &isNullable, &colDefault)
		fmt.Printf("  - %s (%s)\n", colName, colType)
	}

	fmt.Println("\nProducts table columns:")
	rows, err = database.DB.Query(`
		SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_NAME = 'products' AND TABLE_SCHEMA = DATABASE()
		ORDER BY ORDINAL_POSITION
	`)
	if err != nil {
		log.Fatal("Error querying products schema:", err)
	}
	defer rows.Close()

	for rows.Next() {
		var colName, colType, isNullable, colDefault string
		rows.Scan(&colName, &colType, &isNullable, &colDefault)
		fmt.Printf("  - %s (%s)\n", colName, colType)
	}
}
