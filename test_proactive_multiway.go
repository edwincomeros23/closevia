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

	fmt.Println("=== CHECKING SYSTEM STATE ===\n")

	// Get the three products
	var iPhoneID, macbookID, ps5ID int
	var iPhoneSeller, macbookSeller, ps5Seller int
	database.DB.QueryRow("SELECT id, seller_id FROM products WHERE title = 'iPhone 15 Pro Max'").Scan(&iPhoneID, &iPhoneSeller)
	database.DB.QueryRow("SELECT id, seller_id FROM products WHERE title = 'Apple MacBook Pro'").Scan(&macbookID, &macbookSeller)
	database.DB.QueryRow("SELECT id, seller_id FROM products WHERE title = 'PlayStation 5 Console'").Scan(&ps5ID, &ps5Seller)

	fmt.Printf("iPhone (ID=%d, Seller=%d): wants 'laptop'\n", iPhoneID, iPhoneSeller)
	fmt.Printf("MacBook (ID=%d, Seller=%d): wants 'gaming console'\n", macbookID, macbookSeller)
	fmt.Printf("PS5 (ID=%d, Seller=%d): wants 'iPhone 15 Pro'\n\n", ps5ID, ps5Seller)

	fmt.Println("=== EXPECTED MULTIWAY LOOP ===")
	fmt.Println("Alice (seller of iPhone) wants MacBook")
	fmt.Println("Bob (seller of MacBook) wants PS5")
	fmt.Println("Charlie (seller of PS5) wants iPhone")
	fmt.Println("→ PERFECT 3-WAY LOOP!\n")

	fmt.Println("=== CURRENT TRADES ===")
	rows, _ := database.DB.Query(`
		SELECT t.id, t.buyer_id, t.seller_id, u1.name, u2.name, tp.title
		FROM trades t
		JOIN users u1 ON u1.id = t.buyer_id
		JOIN users u2 ON u2.id = t.seller_id
		JOIN products tp ON tp.id = t.target_product_id
		ORDER BY t.id DESC LIMIT 10
	`)
	if rows != nil {
		count := 0
		for rows.Next() {
			var id, bid, sid int
			var b, s, title string
			if err := rows.Scan(&id, &bid, &sid, &b, &s, &title); err == nil {
				fmt.Printf("  Trade %d: %s(%d) wants %s from %s(%d)\n", id, b, bid, title, s, sid)
				count++
			}
		}
		rows.Close()
		if count == 0 {
			fmt.Println("  (No trades yet)")
		}
	}

	fmt.Println("\n=== CURRENT MULTIWAY TRADES ===")
	mwRows, _ := database.DB.Query(`
		SELECT id, chain_id, original_trade_id, status, created_at
		FROM multiway_trades
		ORDER BY id DESC LIMIT 10
	`)
	if mwRows != nil {
		count := 0
		for mwRows.Next() {
			var id, origTradeID int
			var chainID, status, createdAt string
			if err := mwRows.Scan(&id, &chainID, &origTradeID, &status, &createdAt); err == nil {
				fmt.Printf("  Multiway %d: Trade %d -> %s [%s]\n", id, origTradeID, chainID, status)
				count++
			}
		}
		mwRows.Close()
		if count == 0 {
			fmt.Println("  (None yet)")
		}
	}

	fmt.Println("\n=== ACTION REQUIRED ===")
	fmt.Println("To trigger multiway detection:")
	fmt.Println("1. Create a trade from Alice (user ID " + fmt.Sprintf("%d", iPhoneSeller) + ") wanting MacBook from Bob")
	fmt.Println("2. System will auto-detect that Charlie wants iPhone & Bob wants PS5")
	fmt.Println("3. 3-way loop will be created!")
	fmt.Println("\nOr use the proactive endpoint:")
	fmt.Println("/api/trades/multiway/find-all (POST)")

	fmt.Println("\n✓ Analysis complete")
}
