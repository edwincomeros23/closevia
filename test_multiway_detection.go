//go:build ignore

package main

import (
	"fmt"
	"log"

	"github.com/joho/godotenv"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/services"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	fmt.Println("Initializing database...")
	if err := database.InitDatabase(); err != nil {
		log.Fatal("Failed to init DB:", err)
	}
	defer database.CloseDatabase()

	fmt.Println("✓ Database initialized\n")

	// Step 1: Create a trade from Alice (User 100) wanting MacBook (from Bob 101)
	fmt.Println("╔════════════════════════════════════════════════════════════════╗")
	fmt.Println("║              CREATING TEST TRADE & DETECTING LOOP              ║")
	fmt.Println("╚════════════════════════════════════════════════════════════════╝\n")

	fmt.Println("STEP 1: Creating trade...")
	fmt.Println("─────────────────────────\n")

	result, err := database.DB.Exec(`
		INSERT INTO trades (buyer_id, seller_id, target_product_id, status, created_at, updated_at)
		VALUES (?, ?, ?, 'pending', NOW(), NOW())
	`, 100, 101, 185) // Alice (buyer) wants MacBook (185) from Bob (seller)

	if err != nil {
		log.Fatal("Failed to create trade:", err)
	}

	tradeID, _ := result.LastInsertId()
	fmt.Printf("✓ Trade created (ID=%d)\n", tradeID)
	fmt.Printf("  Buyer: Alice (ID=100)\n")
	fmt.Printf("  Seller: Bob (ID=101)\n")
	fmt.Printf("  Target: MacBook (Product 185)\n\n")

	// Step 2: Create trade items (what Alice offers and what Bob offers)
	fmt.Println("STEP 2: Adding trade items...")
	fmt.Println("───────────────────────────\n")

	_, err = database.DB.Exec(`
		INSERT INTO trade_items (trade_id, product_id, offered_by, created_at)
		VALUES (?, 184, 'buyer', NOW())
	`, tradeID)
	if err != nil {
		log.Fatal("Failed to add Alice's offering:", err)
	}
	fmt.Println("✓ Added: iPhone (Product 184) - Offered by buyer (Alice)")

	_, err = database.DB.Exec(`
		INSERT INTO trade_items (trade_id, product_id, offered_by, created_at)
		VALUES (?, 185, 'seller', NOW())
	`, tradeID)
	if err != nil {
		log.Fatal("Failed to add Bob's offering:", err)
	}
	fmt.Println("✓ Added: MacBook (Product 185) - Offered by seller (Bob)\n")

	// Step 3: Trigger multiway detection
	fmt.Println("STEP 3: Triggering multiway loop detection...")
	fmt.Println("───────────────────────────────────────────\n")

	// For multiway, User1 = Alice (100), User2 = Bob (101) - get from products
	// Find who has the MacBook that Alice wants
	var user2ID int
	database.DB.QueryRow("SELECT seller_id FROM products WHERE id = 185").Scan(&user2ID)

	matches, debug, err := services.FindMultiwayMatchDetailed(database.DB, 100, user2ID, int(tradeID), []int{})
	if err != nil {
		log.Printf("Error finding multiway: %v\n", err)
	}

	fmt.Printf("Found %d potential matches\n", len(matches))
	fmt.Printf("Threshold: %d points\n\n", debug.Threshold)

	// Step 4: Display results
	fmt.Println("STEP 4: Analyzing matches...")
	fmt.Println("───────────────────────────\n")

	if len(matches) == 0 {
		fmt.Println("❌ NO MATCHES FOUND - Check semantic matching\n")
		fmt.Println("Debug info:")
		fmt.Println("  - Alice wants MacBook (is Bob's MacBook in the system?)")
		fmt.Println("  - Bob wants PS5 (is Charlie's PS5 in the system?)")
		fmt.Println("  - Charlie wants iPhone (is Alice's iPhone offering?)")
		fmt.Println("  - Check if wants/desired_product fields are populated correctly")
	} else {
		fmt.Println("✅ MATCHES FOUND!\n")

		charlieFound := false
		for i, match := range matches {
			marker := "  "
			if match.User3ID == 102 {
				marker = "✅"
				charlieFound = true
			}
			fmt.Printf("[%d] %s User3: %s (ID=%d)\n", i+1, marker, match.User3Name, match.User3ID)
			fmt.Printf("    Product: %s (ID=%d, Price=%d)\n", match.User3ProductTitle, match.User3ProductID, match.MatchScore)
			fmt.Printf("    Wants your: %s\n", match.User1ProductTitle)
			fmt.Printf("    Match Score: %d/100\n\n", match.MatchScore)
		}

		if charlieFound {
			fmt.Println("\n╔════════════════════════════════════════════════════════════════╗")
			fmt.Println("║             ✅ TEST SUCCESSFUL - LOOP DETECTED!               ║")
			fmt.Println("║                Charlie correctly identified!                  ║")
			fmt.Println("╚════════════════════════════════════════════════════════════════╝")
			fmt.Println("\nThe multiway loop is: Alice → Bob → Charlie → Alice")
			fmt.Println("\nNext steps:")
			fmt.Println("1. Go to Dashboard → Multi-Way tab")
			fmt.Println("2. You should see the suggested loop")
			fmt.Println("3. Charlie will receive a notification to join the loop")
		} else {
			fmt.Println("\n⚠️  Charlie not at top - check scoring algorithm")
		}
	}

	fmt.Println("\n✓ Test complete!")
	fmt.Printf("Trade ID: %d\n", tradeID)
	fmt.Println("Database connection will close now...")
}
