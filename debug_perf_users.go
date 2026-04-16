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
		log.Fatal("Failed to init DB: ", err)
	}
	defer database.CloseDatabase()

	fmt.Println("=== Performance Test User Breakdown ===\n")

	// Count by role
	fmt.Println("1. Breakdown by ROLE:")
	rows, err := database.DB.Query(`
		SELECT role, COUNT(*) as count
		FROM users
		WHERE name = 'Performance Test User'
		  AND email LIKE 'testuser-%@test.com'
		GROUP BY role
	`)
	if err != nil {
		log.Fatal("Query role breakdown: ", err)
	}
	defer rows.Close()
	for rows.Next() {
		var role string
		var count int
		if err := rows.Scan(&role, &count); err != nil {
			log.Fatal("Scan: ", err)
		}
		fmt.Printf("   role = '%s': %d users\n", role, count)
	}

	// Count by verified
	fmt.Println("\n2. Breakdown by VERIFIED:")
	rows2, err := database.DB.Query(`
		SELECT verified, COUNT(*) as count
		FROM users
		WHERE name = 'Performance Test User'
		  AND email LIKE 'testuser-%@test.com'
		GROUP BY verified
	`)
	if err != nil {
		log.Fatal("Query verified breakdown: ", err)
	}
	defer rows2.Close()
	for rows2.Next() {
		var verified int
		var count int
		if err := rows2.Scan(&verified, &count); err != nil {
			log.Fatal("Scan: ", err)
		}
		fmt.Printf("   verified = %d: %d users\n", verified, count)
	}

	// Total and expected targets
	var total, total_verified_or_nonuser int
	database.DB.QueryRow(`
		SELECT COUNT(*) FROM users
		WHERE name = 'Performance Test User'
		  AND email LIKE 'testuser-%@test.com'
	`).Scan(&total)

	database.DB.QueryRow(`
		SELECT COUNT(*) FROM users
		WHERE name = 'Performance Test User'
		  AND email LIKE 'testuser-%@test.com'
		  AND (verified = 1 OR role <> 'user')
	`).Scan(&total_verified_or_nonuser)

	fmt.Printf("\n3. Summary:\n")
	fmt.Printf("   Total Performance Test Users: %d\n", total)
	fmt.Printf("   Verified OR non-user role:   %d\n", total_verified_or_nonuser)
	fmt.Printf("   Safe to delete (unverified + user role): %d\n", total-total_verified_or_nonuser)

	// Sample suspicious ones
	fmt.Println("\n4. Sample suspicious rows (10 latest):")
	rows3, err := database.DB.Query(`
		SELECT id, verified, role, created_at
		FROM users
		WHERE name = 'Performance Test User'
		  AND email LIKE 'testuser-%@test.com'
		  AND (verified = 1 OR role <> 'user')
		ORDER BY id DESC
		LIMIT 10
	`)
	if err != nil {
		log.Fatal("Query suspicious: ", err)
	}
	defer rows3.Close()
	for rows3.Next() {
		var id int
		var verified int
		var role, createdAt string
		if err := rows3.Scan(&id, &verified, &role, &createdAt); err != nil {
			log.Fatal("Scan: ", err)
		}
		fmt.Printf("   id=%d verified=%d role='%s' created_at=%s\n", id, verified, role, createdAt)
	}
}
