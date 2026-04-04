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

	fmt.Println("=== RESETTING FOR FRESH TEST ===\n")

	// Delete multiway for trade 114
	_, _ = database.DB.Exec("DELETE FROM multiway_trades WHERE original_trade_id = 114")
	fmt.Println("✓ Deleted multiway trade for trade 114")

	// Delete trade items for trade 114
	_, _ = database.DB.Exec("DELETE FROM trade_items WHERE trade_id = 114")
	fmt.Println("✓ Deleted trade items for trade 114")

	// Delete trade 114
	_, _ = database.DB.Exec("DELETE FROM trades WHERE id = 114")
	fmt.Println("✓ Deleted trade 114")

	fmt.Println("\n✓ Reset complete - ready to recreate the trade with new semantic matching!")
	fmt.Println("\nNow create the trade again via the API:")
	fmt.Println("POST /api/trades")
	fmt.Println("{")
	fmt.Println("  \"sellerProductID\": 178,  // MacBook Pro (Francis)")
	fmt.Println("  \"myProducts\": [177],       // iPhone 15 Pro Max (Alice)")
	fmt.Println("}")
}
