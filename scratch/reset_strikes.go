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

	fmt.Println("=== RESETTING STRIKES AND SETTING ADMIN ROLES ===")

	// Reset strikes and set admin role for Edwin (ID 4)
	res1, err := database.DB.Exec("UPDATE users SET strikes = 0, role = 'admin' WHERE id = 4")
	if err != nil {
		log.Printf("Failed to update user 4: %v", err)
	} else {
		affected, _ := res1.RowsAffected()
		fmt.Printf("User 4 (Edwin) updated: %d rows affected\n", affected)
	}

	// Reset strikes for Francis (ID 55)
	res2, err := database.DB.Exec("UPDATE users SET strikes = 0 WHERE id = 55")
	if err != nil {
		log.Printf("Failed to update user 55: %v", err)
	} else {
		affected, _ := res2.RowsAffected()
		fmt.Printf("User 55 (Francis) updated: %d rows affected\n", affected)
	}

	fmt.Println("=== DONE ===")
}
