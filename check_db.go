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

	// Check delivery trades
	fmt.Println("=== DELIVERY TRADES ===")
	rows, err := database.DB.Query(`
		SELECT id, status, COALESCE(trade_option, 'meetup') as trade_option, buyer_id, seller_id
		FROM trades
		WHERE COALESCE(trade_option, 'meetup') = 'delivery'
		ORDER BY id DESC LIMIT 10
	`)
	if err != nil {
		log.Fatal("Query trades failed:", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id, buyerID, sellerID int
		var status, tradeOption string
		rows.Scan(&id, &status, &tradeOption, &buyerID, &sellerID)
		fmt.Printf("Trade #%d: status=%s, option=%s, buyer=%d, seller=%d\n", id, status, tradeOption, buyerID, sellerID)
	}

	// Check deliveries
	fmt.Println("\n=== DELIVERIES ===")
	rows2, err := database.DB.Query(`
		SELECT id, trade_id, status, rider_id, pickup_address, delivery_address
		FROM deliveries
		ORDER BY id DESC LIMIT 10
	`)
	if err != nil {
		log.Fatal("Query deliveries failed:", err)
	}
	defer rows2.Close()
	for rows2.Next() {
		var id int
		var tradeID, riderID *int
		var status, pickup, delivery string
		rows2.Scan(&id, &tradeID, &status, &riderID, &pickup, &delivery)
		tid := 0
		if tradeID != nil {
			tid = *tradeID
		}
		rid := 0
		if riderID != nil {
			rid = *riderID
		}
		fmt.Printf("Delivery #%d: trade_id=%d, status=%s, rider_id=%d, from=%s, to=%s\n", id, tid, status, rid, pickup, delivery)
	}

	// Check all trades
	fmt.Println("\n=== ALL TRADES (latest 10) ===")
	rows3, err := database.DB.Query(`
		SELECT id, status, COALESCE(trade_option, 'NULL') as trade_option
		FROM trades ORDER BY id DESC LIMIT 10
	`)
	if err != nil {
		log.Fatal("Query all trades failed:", err)
	}
	defer rows3.Close()
	for rows3.Next() {
		var id int
		var status, opt string
		rows3.Scan(&id, &status, &opt)
		fmt.Printf("Trade #%d: status=%s, option=%s\n", id, status, opt)
	}

	// Check riders table
	fmt.Println("\n=== RIDERS ===")
	rows4, err := database.DB.Query(`SELECT id, user_id, name, is_active FROM riders LIMIT 10`)
	if err != nil {
		fmt.Println("No riders table or error:", err)
	} else {
		defer rows4.Close()
		for rows4.Next() {
			var id, userID int
			var name string
			var isActive bool
			rows4.Scan(&id, &userID, &name, &isActive)
			fmt.Printf("Rider #%d: user_id=%d, name=%s, active=%v\n", id, userID, name, isActive)
		}
	}
}
