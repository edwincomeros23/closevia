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

	fmt.Println("=== SEMANTIC MATCHING TEST ===\n")

	// Test the semantic matching is working
	fmt.Println("Testing if products are properly set up for semantic matching:")
	fmt.Println()

	// Get the three products
	var aliceWants, francisWants, charlieWants string
	var aliceTitle, francisTitle, charlieTitle string
	database.DB.QueryRow("SELECT wants, title FROM products WHERE id = 177").Scan(&aliceWants, &aliceTitle)
	database.DB.QueryRow("SELECT wants, title FROM products WHERE id = 178").Scan(&francisWants, &francisTitle)
	database.DB.QueryRow("SELECT wants, title FROM products WHERE id = 179").Scan(&charlieWants, &charlieTitle)

	fmt.Printf("Alice (%s):\n  Wants: %s\n\n", aliceTitle, aliceWants)
	fmt.Printf("Francis (%s):\n  Wants: %s\n\n", francisTitle, francisWants)
	fmt.Printf("Charlie (%s):\n  Wants: %s\n\n", charlieTitle, charlieWants)

	fmt.Println("=== EXPECTED SEMANTIC MATCHES ===")
	fmt.Println("Alice wants 'MacBook' → should match Francis's MacBook ✓")
	fmt.Println("Francis wants 'gaming console' → should semantically match Charlie's PS5 ✓")
	fmt.Println("Charlie wants 'iPhone' → should match Alice's iPhone 15 Pro ✓")
	fmt.Println()

	fmt.Println("=== CHECKING EXISTING TRADES/MULTIWAYS ===")
	fmt.Println("\nTrades created recently:")
	rows, _ := database.DB.Query(`
		SELECT t.id, t.buyer_id, t.seller_id, t.status, u1.name, u2.name
		FROM trades t
		JOIN users u1 ON u1.id = t.buyer_id
		JOIN users u2 ON u2.id = t.seller_id
		WHERE t.id >= 114
		ORDER BY t.id DESC LIMIT 5
	`)
	if rows != nil {
		for rows.Next() {
			var id, bid, sid int
			var status, b, s string
			if err := rows.Scan(&id, &bid, &sid, &status, &b, &s); err == nil {
				fmt.Printf("  Trade %d: %s → %s [%s]\n", id, b, s, status)
			}
		}
		rows.Close()
	}

	fmt.Println("\nMultiway loops recently created:")
	mwRows, _ := database.DB.Query(`
		SELECT id, chain_id, status, created_at
		FROM multiway_trades
		WHERE id >= 16
		ORDER BY id DESC LIMIT 5
	`)
	if mwRows != nil {
		for mwRows.Next() {
			var id int
			var chainID, status, createdAt string
			if err := mwRows.Scan(&id, &chainID, &status, &createdAt); err == nil {
				fmt.Printf("  Multiway %d: %s [%s]\n", id, chainID, status)
			}
		}
		mwRows.Close()
	}

	fmt.Println("\n=== NEXT STEPS ===")
	fmt.Println("1. Check the logs for matching details when trades are created")
	fmt.Println("2. Look for '[FindMultiwayMatch] ✅ LOOP FOUND' in logs")
	fmt.Println("3. Look for '[MultiWayLoop] ✅ LOOP CREATED' in logs")
	fmt.Println("4. The system should now find Charlie as User3 for the Alice→Francis trade")
}
