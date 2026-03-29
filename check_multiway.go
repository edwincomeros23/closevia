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

	// Check multiway_trades table - simple select
	fmt.Println("=== MULTIWAY_TRADES (all) ===")
	rows, err := database.DB.Query(`SELECT * FROM multiway_trades ORDER BY id DESC LIMIT 10`)
	if err != nil {
		fmt.Println("Error:", err)
	} else {
		cols, _ := rows.Columns()
		fmt.Println("Columns:", cols)
		for rows.Next() {
			vals := make([]interface{}, len(cols))
			ptrs := make([]interface{}, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			rows.Scan(ptrs...)
			for i, col := range cols {
				v := vals[i]
				if b, ok := v.([]byte); ok {
					v = string(b)
				}
				fmt.Printf("  %s: %v\n", col, v)
			}
			fmt.Println("---")
		}
		rows.Close()
	}

	// Check pending trades for user 55
	fmt.Println("\n=== TRADES involving user 55 (pending/active) ===")
	rows2, err := database.DB.Query(`
		SELECT id, buyer_id, seller_id, status
		FROM trades
		WHERE (buyer_id = 55 OR seller_id = 55) AND status IN ('pending', 'pending_multiway', 'active', 'accepted')
		ORDER BY id DESC
	`)
	if err != nil {
		fmt.Println("Error:", err)
	} else {
		for rows2.Next() {
			var id, buyerID, sellerID int
			var status string
			rows2.Scan(&id, &buyerID, &sellerID, &status)
			fmt.Printf("Trade #%d: buyer=%d -> seller=%d, status=%s\n", id, buyerID, sellerID, status)
		}
		rows2.Close()
	}

	fmt.Println("\n=== LOOP NOTIFICATIONS for user 55 ===")
	rows3, err := database.DB.Query(`
		SELECT id, user_id, loop_id, message, is_read
		FROM trade_loop_notifications
		WHERE user_id = 55
		ORDER BY id DESC LIMIT 10
	`)
	if err != nil {
		fmt.Println("Error:", err)
	} else {
		for rows3.Next() {
			var id, userID int
			var loopID, message string
			var isRead bool
			rows3.Scan(&id, &userID, &loopID, &message, &isRead)
			fmt.Printf("Notif #%d: loop=%s, read=%v, msg=%.80s\n", id, loopID, isRead, message)
		}
		rows3.Close()
	}

	fmt.Println("\nDone.")
}
