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

	// Find user "testt"
	var id1 int
	var name1 string
	err := database.DB.QueryRow(`SELECT id, name FROM users WHERE name LIKE '%testt%' LIMIT 1`).Scan(&id1, &name1)
	if err != nil {
		fmt.Println("User 'testt' not found:", err)
	} else {
		fmt.Printf("User A (testt): id=%d name=%s\n", id1, name1)
	}

	// Check user 55 (Francis)
	var id2 int
	var name2 string
	err = database.DB.QueryRow(`SELECT id, name FROM users WHERE id = 55`).Scan(&id2, &name2)
	if err != nil {
		fmt.Println("User 55 not found:", err)
	} else {
		fmt.Printf("User B (Francis): id=%d name=%s\n", id2, name2)
	}

	// Check latest 5 trades
	fmt.Println("\nLatest 5 trades:")
	rows, _ := database.DB.Query(`
		SELECT t.id, t.buyer_id, t.seller_id, t.status, t.created_at,
		       ub.name, us.name
		FROM trades t
		JOIN users ub ON ub.id = t.buyer_id
		JOIN users us ON us.id = t.seller_id
		ORDER BY t.id DESC LIMIT 5
	`)
	if rows != nil {
		for rows.Next() {
			var tid, bid, sid int
			var st, ca, bn, sn string
			rows.Scan(&tid, &bid, &sid, &st, &ca, &bn, &sn)
			fmt.Printf("  #%d: %s(%d)->%s(%d) status=%s created=%s\n", tid, bn, bid, sn, sid, st, ca)
		}
		rows.Close()
	}

	fmt.Println("\nDone.")
}
