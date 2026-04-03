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

	// Check trades table schema
	fmt.Println("Trades table columns:")
	rows, err := database.DB.Query(`
		SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_NAME = 'trades' AND TABLE_SCHEMA = DATABASE()
		ORDER BY ORDINAL_POSITION
	`)
	if err != nil {
		log.Fatal("Error querying trades schema:", err)
	}
	defer rows.Close()

	for rows.Next() {
		var colName, colType, isNullable, colDefault string
		rows.Scan(&colName, &colType, &isNullable, &colDefault)
		fmt.Printf("  - %s (%s)\n", colName, colType)
	}

	// Check trade_items table schema
	fmt.Println("\nTrade_items table columns:")
	rows, err = database.DB.Query(`
		SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_NAME = 'trade_items' AND TABLE_SCHEMA = DATABASE()
		ORDER BY ORDINAL_POSITION
	`)
	if err != nil {
		log.Fatal("Error querying trade_items schema:", err)
	}
	defer rows.Close()

	for rows.Next() {
		var colName, colType, isNullable, colDefault string
		rows.Scan(&colName, &colType, &isNullable, &colDefault)
		fmt.Printf("  - %s (%s)\n", colName, colType)
	}

	// Check multiway_trades table schema
	fmt.Println("\nMultiway_trades table columns:")
	rows, err = database.DB.Query(`
		SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_NAME = 'multiway_trades' AND TABLE_SCHEMA = DATABASE()
		ORDER BY ORDINAL_POSITION
	`)
	if err != nil {
		log.Fatal("Error querying multiway_trades schema:", err)
	}
	defer rows.Close()

	for rows.Next() {
		var colName, colType, isNullable, colDefault string
		rows.Scan(&colName, &colType, &isNullable, &colDefault)
		fmt.Printf("  - %s (%s)\n", colName, colType)
	}
}
