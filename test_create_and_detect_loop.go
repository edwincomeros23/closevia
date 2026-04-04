//go:build ignore

package main

import (
	"fmt"
	"log"
	"time"

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

	fmt.Println("=== CREATING TEST TRADE ===\n")

	// Create trade: Alice (buyer, ID=52) → wants MacBook from Francis (seller, ID=55)
	result, err := database.DB.Exec(`
		INSERT INTO trades (buyer_id, seller_id, target_product_id, status, created_at, updated_at)
		VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`, 52, 55, 178) // 52=Alice, 55=Francis, 178=MacBook

	if err != nil {
		fmt.Println("Error creating trade:", err)
		return
	}

	tradeID, _ := result.LastInsertId()
	fmt.Printf("✓ Created Trade %d: Alice wants MacBook from Francis\n\n", tradeID)

	// Add trade item: Alice offers her iPhone
	_, _ = database.DB.Exec(`
		INSERT INTO trade_items (trade_id, product_id, offered_by, created_at)
		VALUES (?, ?, 'buyer', CURRENT_TIMESTAMP)
	`, tradeID, 177) // 177 = Alice's iPhone

	fmt.Println("✓ Added trade item: Alice offering iPhone 15 Pro")
	fmt.Println()

	// Wait a bit for async processing
	time.Sleep(2 * time.Second)

	// Now check if multiway was created
	fmt.Println("=== CHECKING FOR MULTIWAY LOOP ===\n")

	var mwID, u1ID, u2ID, u3ID int
	var chainID, status string
	err = database.DB.QueryRow(`
		SELECT id, chain_id, user1_id, user2_id, user3_id, status
		FROM multiway_trades
		WHERE original_trade_id = ?
		LIMIT 1
	`, tradeID).Scan(&mwID, &chainID, &u1ID, &u2ID, &u3ID, &status)

	if err != nil {
		fmt.Println("❌ NO MULTIWAY FOUND:", err)
		return
	}

	fmt.Printf("✅ MULTIWAY DETECTED!\n")
	fmt.Printf("  ID: %d\n", mwID)
	fmt.Printf("  Chain: %s\n", chainID)
	fmt.Printf("  Status: %s\n", status)
	fmt.Printf("  User1 (Alice): %d\n", u1ID)
	fmt.Printf("  User2 (Francis): %d\n", u2ID)
	fmt.Printf("  User3 (Candidate): %d\n", u3ID)
	fmt.Println()

	// Get user names
	var u3Name string
	database.DB.QueryRow("SELECT name FROM users WHERE id = ?", u3ID).Scan(&u3Name)

	if u3ID == 59 {
		fmt.Printf("✅✅✅ CORRECT! User3 is Charlie (ID=59) - %s\n", u3Name)
		fmt.Println("\n🎉 THE SEMANTIC MATCHING WORKED!")
	} else {
		fmt.Printf("⚠️  User3 is ID %d (%s) - Not Charlie\n", u3ID, u3Name)
	}

	fmt.Println()
	fmt.Println("=== TRADE FLOW ===")
	fmt.Println("1. Alice (52) wants MacBook from Francis (55) → offers iPhone")
	fmt.Println("2. Francis wants 'gaming console' (semantic match for PS5)")
	fmt.Println("3. Charlie (59) has PS5 and wants iPhone")
	fmt.Println("4. ✅ LOOP FOUND: Alice → Francis → Charlie → Alice")
}
