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

	fmt.Println("=== MULTIWAY_TRADES ===")
	rows, err := database.DB.Query(`
		SELECT id, chain_id, original_trade_id, initiator_user_id, status 
		FROM multiway_trades 
		WHERE original_trade_id = 111 OR chain_id LIKE '%111%'
	`)
	if err != nil {
		fmt.Println("Error:", err)
	} else {
		for rows.Next() {
			var id, otid, iuid int
			var cid, st string
			rows.Scan(&id, &cid, &otid, &iuid, &st)
			fmt.Printf("Chain #%d: ID=%s, OrigTrade=%d, Initiator=%d, Status=%s\n", id, cid, otid, iuid, st)
		}
		rows.Close()
	}

	fmt.Println("\nDone.")
}
