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

	fmt.Println("=== CHECKING FRANCIS (USER 55) ===\n")

	// Get all products sold by Francis
	rows, _ := database.DB.Query(`
		SELECT id, title, category, price, status, COALESCE(wants, ''), COALESCE(wanted_categories, '')
		FROM products 
		WHERE seller_id = 55
		ORDER BY id DESC
		LIMIT 5
	`)
	if rows != nil {
		for rows.Next() {
			var id int
			var title, category, _wants, _wanted string
			var price float64
			var status string
			if err := rows.Scan(&id, &title, &category, &price, &status, &_wants, &_wanted); err == nil {
				fmt.Printf("Product ID=%d: %s\n", id, title)
				fmt.Printf("  Category: %s, Price: %.0f, Status: %s\n", category, price, status)
				fmt.Printf("  Wants: %q\n", _wants)
				fmt.Printf("  Wanted Categories: %q\n", _wanted)
				fmt.Println()
			}
		}
		rows.Close()
	}

	fmt.Println("=== CHECKING PENDING/ACTIVE TRADES BY FRANCIS ===\n")
	tradeRows, _ := database.DB.Query(`
		SELECT t.id, t.buyer_id, t.seller_id, t.status, u.name, tp.title
		FROM trades t
		JOIN users u ON u.id = t.buyer_id  
		JOIN products tp ON tp.id = t.target_product_id
		WHERE (t.seller_id = 55 OR t.buyer_id = 55)
		AND t.status IN ('pending', 'pending_multiway', 'active')
		LIMIT 5
	`)
	if tradeRows != nil {
		for tradeRows.Next() {
			var id, bidID, sidID int
			var status, buyerName, targetTitle string
			if err := tradeRows.Scan(&id, &bidID, &sidID, &status, &buyerName, &targetTitle); err == nil {
				role := "seller"
				if bidID == 55 {
					role = "buyer"
				}
				fmt.Printf("Trade %d [%s as %s]: %s wants %s [%s]\n", id, buyerName, role, targetTitle, targetTitle, status)
			}
		}
		tradeRows.Close()
	}

	fmt.Println("\n=== THE ISSUE ===")
	fmt.Println("For the multiway to work correctly:")
	fmt.Println("1. Francis (55) must have his product marked as wanting PS5/gaming console")
	fmt.Println("2. Or Charlie must create a trade wanting MacBook from Francis first")
}
