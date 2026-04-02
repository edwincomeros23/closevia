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

	fmt.Println("Test Products and their WANTS:")
	fmt.Println("==============================\n")

	rows, err := database.DB.Query(`
		SELECT id, seller_id, title, price, wants, desired_product FROM products
		WHERE id IN (184, 185, 186) OR seller_id IN (100, 101, 102)
	`)
	if err != nil {
		log.Fatal("Error querying products:", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id, seller_id int
		var title, wants, desired_product string
		var price float64
		rows.Scan(&id, &seller_id, &title, &price, &wants, &desired_product)
		fmt.Printf("Product ID=%d (Seller ID=%d): %s\n", id, seller_id, title)
		fmt.Printf("  Price: %.0f\n", price)
		fmt.Printf("  Wants: %s\n", wants)
		fmt.Printf("  Desired: %s\n\n", desired_product)
	}

	fmt.Println("\n========================================")
	fmt.Println("Checking Bob's products and wants:")
	fmt.Println("==============================\n")

	rows, err = database.DB.Query(`
		SELECT id, title, wants FROM products
		WHERE seller_id = 101
	`)
	if err != nil {
		log.Fatal("Error:", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var title, wants string
		rows.Scan(&id, &title, &wants)
		fmt.Printf("ID=%d: %s\n", id, title)
		fmt.Printf("  Wants: %s\n\n", wants)
	}

	fmt.Println("\nChecking Charlie's products and wants:")
	fmt.Println("====================================\n")

	rows, err = database.DB.Query(`
		SELECT id, title, wants FROM products
		WHERE seller_id = 102
	`)
	if err != nil {
		log.Fatal("Error:", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var title, wants string
		rows.Scan(&id, &title, &wants)
		fmt.Printf("ID=%d: %s\n", id, title)
		fmt.Printf("  Wants: %s\n\n", wants)
	}
}
