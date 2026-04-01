package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}
	db, err := sql.Open("mysql", "root:@tcp(localhost:3306)/clovia?charset=utf8mb4&parseTime=True&loc=Local")
	if err != nil {
		log.Fatal("Failed to connect to DB:", err)
	}
	defer db.Close()

	fmt.Println("=== GUITAR PRODUCTS ===")
	rows, err := db.Query("SELECT id, title, category, price, COALESCE(wants, ''), COALESCE(wanted_categories, '') FROM products WHERE title LIKE '%Guitar%'")
	if err != nil {
		fmt.Println("Error:", err)
	} else {
		for rows.Next() {
			var id int
			var title, category, wants, wantedCategories string
			var price float64
			rows.Scan(&id, &title, &category, &price, &wants, &wantedCategories)
			fmt.Printf("id=%d title='%s' price=%.2f wants='%s' wanted_cat='%s'\n", id, title, price, wants, wantedCategories)
		}
		rows.Close()
	}

	fmt.Println("\n=== PENDING MULTIWAY TRADES ===")
	rows, err = db.Query("SELECT id, buyer_id, seller_id, status FROM trades WHERE status = 'pending_multiway'")
	if err != nil {
		fmt.Println("Error:", err)
	} else {
		for rows.Next() {
			var id, b, s int
			var st string
			rows.Scan(&id, &b, &s, &st)
			fmt.Printf("Trade #%d Status=%s Buyer=%d Seller=%d\n", id, st, b, s)
		}
		rows.Close()
	}
	fmt.Println("\nDone.")
}
