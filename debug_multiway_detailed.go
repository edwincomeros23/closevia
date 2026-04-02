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

	fmt.Println("=== PRODUCTS ===")
	rows, err := database.DB.Query(`
		SELECT id, title, slug, category, price, status, seller_id, 
		       COALESCE(wants, '') as wants, 
		       COALESCE(wanted_categories, '') as wanted_cats,
		       COALESCE(desired_product, '') as desired_prod
		FROM products 
		WHERE title IN ('iPhone 15 Pro Max', 'PlayStation 5 Console', 'Apple MacBook Pro')
		   OR slug IN ('iphone-15-pro-max-83faec16', 'playstation-5-console-a0628dad', 'apple-macbook-pro-fce9d8b2')
	`)
	if err != nil {
		fmt.Println("Product query error:", err)
		return
	}
	defer rows.Close()

	type Product struct {
		ID          int
		Title       string
		Slug        string
		Category    string
		Price       float64
		Status      string
		SellerID    int
		Wants       string
		WantedCats  string
		DesiredProd string
	}

	var products []Product
	for rows.Next() {
		var p Product
		err := rows.Scan(&p.ID, &p.Title, &p.Slug, &p.Category, &p.Price, &p.Status,
			&p.SellerID, &p.Wants, &p.WantedCats, &p.DesiredProd)
		if err != nil {
			fmt.Println("Scan error:", err)
			continue
		}
		products = append(products, p)
		fmt.Printf("Product ID=%d, Title=%s\n", p.ID, p.Title)
		fmt.Printf("  Slug: %s\n", p.Slug)
		fmt.Printf("  Status: %s, Category: %s, Price: %.2f\n", p.Status, p.Category, p.Price)
		fmt.Printf("  Seller ID: %d\n", p.SellerID)
		fmt.Printf("  Wants: %q\n", p.Wants)
		fmt.Printf("  Wanted Categories: %q\n", p.WantedCats)
		fmt.Printf("  Desired Product: %q\n", p.DesiredProd)
		fmt.Println()
	}

	fmt.Println("=== TRADES ===")
	tradeRows, err := database.DB.Query(`
		SELECT t.id, t.buyer_id, t.seller_id, t.status, 
		       ub.name as buyer_name, us.name as seller_name,
		       tp.title as target_product_title
		FROM trades t
		JOIN users ub ON ub.id = t.buyer_id
		JOIN users us ON us.id = t.seller_id
		JOIN products tp ON tp.id = t.target_product_id
		ORDER BY t.id DESC LIMIT 20
	`)
	if err != nil {
		fmt.Println("Trade query error:", err)
		return
	}
	defer tradeRows.Close()

	for tradeRows.Next() {
		var tradeID, buyerID, sellerID int
		var status, buyerName, sellerName, targetTitle string
		err := tradeRows.Scan(&tradeID, &buyerID, &sellerID, &status, &buyerName, &sellerName, &targetTitle)
		if err != nil {
			fmt.Println("Trade scan error:", err)
			continue
		}
		fmt.Printf("Trade ID=%d: %s(%d) -> %s(%d) wants %s [status: %s]\n",
			tradeID, buyerName, buyerID, sellerName, sellerID, targetTitle, status)

		// Check trade_items for this trade
		itemRows, err := database.DB.Query(`
			SELECT ti.product_id, p.title, ti.offered_by
			FROM trade_items ti
			JOIN products p ON p.id = ti.product_id
			WHERE ti.trade_id = ?
		`, tradeID)
		if err != nil {
			fmt.Println("  Error loading trade items:", err)
			continue
		}
		defer itemRows.Close()

		itemCount := 0
		for itemRows.Next() {
			var productID int
			var title, offeredBy string
			if err := itemRows.Scan(&productID, &title, &offeredBy); err == nil {
				fmt.Printf("  - Item: %s (ID=%d) offered by %s\n", title, productID, offeredBy)
				itemCount++
			}
		}
		itemRows.Close()
		if itemCount == 0 {
			fmt.Println("  ⚠️ NO TRADE ITEMS FOUND!")
		}
		fmt.Println()
	}

	fmt.Println("=== MULTIWAY TRADES ===")
	mwRows, err := database.DB.Query(`
		SELECT id, chain_id, original_trade_id, initiator_user_id, status, created_at
		FROM multiway_trades
		ORDER BY id DESC LIMIT 10
	`)
	if err != nil {
		fmt.Println("Multiway query error:", err)
		return
	}
	defer mwRows.Close()

	foundAny := false
	for mwRows.Next() {
		var id, origTradeID, initiatorID int
		var chainID, status, createdAt string
		err := mwRows.Scan(&id, &chainID, &origTradeID, &initiatorID, &status, &createdAt)
		if err != nil {
			fmt.Println("Multiway scan error:", err)
			continue
		}
		foundAny = true
		fmt.Printf("Multiway ID=%d: Chain=%s, OrigTrade=%d, Initiator=%d, Status=%s, Created=%s\n",
			id, chainID, origTradeID, initiatorID, status, createdAt)
	}
	if !foundAny {
		fmt.Println("No multiway trades found yet")
	}

	fmt.Println("\n✓ Done")
}
