//go:build ignore

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"github.com/joho/godotenv"
	"github.com/xashathebest/clovia/database"
)

type ProductInfo struct {
	ID         int    `json:"id"`
	Title      string `json:"title"`
	SellerID   int    `json:"seller_id"`
	SellerName string `json:"seller_name"`
	Status     string `json:"status"`
	ImageURLs  string `json:"image_urls"`
}

type Results struct {
	Products []ProductInfo `json:"products"`
}

func main() {
	godotenv.Load()
	database.InitDatabase()
	defer database.CloseDatabase()

	results := Results{}

	// Check products
	rows, err := database.DB.Query(`
		SELECT p.id, p.title, p.seller_id, u.name, p.status, p.image_urls
		FROM products p
		LEFT JOIN users u ON p.seller_id = u.id
		WHERE p.title LIKE '%Bike Pedal%'
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p ProductInfo
			rows.Scan(&p.ID, &p.Title, &p.SellerID, &p.SellerName, &p.Status, &p.ImageURLs)
			results.Products = append(results.Products, p)
		}
	}

	data, _ := json.MarshalIndent(results, "", "  ")
	os.WriteFile("query_results.json", data, 0644)
	fmt.Println("Updated query_results.json")
}
