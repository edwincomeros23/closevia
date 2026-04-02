//go:build ignore

package main

import (
	"database/sql"
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

	fmt.Println("=== MULTIWAY CHAIN DETAILS ===\n")

	// Get the latest multiway trade (Trade 114)
	var mwID, origTradeID, initiatorID, u1ID, u2ID, u3ID int
	var u3PID sql.NullInt64
	var chainID, status string

	err := database.DB.QueryRow(`
		SELECT id, chain_id, original_trade_id, initiator_user_id, 
		       user1_id, user2_id, user3_id, user3_product_id, status
		FROM multiway_trades 
		WHERE original_trade_id = 114
		LIMIT 1
	`).Scan(&mwID, &chainID, &origTradeID, &initiatorID, &u1ID, &u2ID, &u3ID, &u3PID, &status)

	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	fmt.Printf("Multiway ID: %d\n", mwID)
	fmt.Printf("Chain ID: %s\n", chainID)
	fmt.Printf("Status: %s\n\n", status)

	// Get user names
	var initiatorName, u1Name, u2Name, u3Name string
	database.DB.QueryRow("SELECT name FROM users WHERE id = ?", initiatorID).Scan(&initiatorName)
	database.DB.QueryRow("SELECT name FROM users WHERE id = ?", u1ID).Scan(&u1Name)
	database.DB.QueryRow("SELECT name FROM users WHERE id = ?", u2ID).Scan(&u2Name)
	database.DB.QueryRow("SELECT name FROM users WHERE id = ?", u3ID).Scan(&u3Name)

	fmt.Printf("Initiator (User1): %s (ID=%d)\n", u1Name, u1ID)
	fmt.Printf("User 2: %s (ID=%d)\n", u2Name, u2ID)
	fmt.Printf("User 3 (Candidate): %s (ID=%d)\n\n", u3Name, u3ID)

	// Get what each user offers/wants
	var u2TargetTitle string
	database.DB.QueryRow("SELECT tp.title FROM trades t JOIN products tp ON tp.id = t.target_product_id WHERE t.id = ?", origTradeID).Scan(&u2TargetTitle)
	fmt.Printf("User 2 wants: %s\n", u2TargetTitle)

	if u3PID.Valid {
		var p3Title string
		database.DB.QueryRow("SELECT title FROM products WHERE id = ?", u3PID.Int64).Scan(&p3Title)
		fmt.Printf("User 3 offers: %s\n", p3Title)
	}

	fmt.Println("\n=== EXPECTED LOOP ===")
	fmt.Printf("%s has iPhone, wants MacBook\n", u1Name)
	fmt.Printf("%s has MacBook, wants PS5\n", u2Name)
	fmt.Printf("%s has %s, wants iPhone\n", u3Name, "?")

	fmt.Println("\n✓ Done")
}
