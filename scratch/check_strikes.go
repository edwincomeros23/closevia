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

	fmt.Println("=== USERS WITH STRIKES ===")
	rows, err := database.DB.Query("SELECT id, name, email, strikes, role FROM users WHERE strikes > 0")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var name, email, role string
		var strikes int
		if err := rows.Scan(&id, &name, &email, &strikes, &role); err == nil {
			fmt.Printf("ID: %d | Name: %s | Email: %s | Role: %s | Strikes: %d\n", id, name, email, role, strikes)
		}
	}
}
