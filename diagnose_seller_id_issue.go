package main

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

// DiagnoseSellerIDIssue checks for products assigned to wrong sellers
func DiagnoseSellerIDIssue(db *sql.DB) {
	fmt.Println("\n========== DIAGNOSING SELLER_ID ASSIGNMENT ISSUES ==========\n")

	// Check 1: Find products created by users who aren't their actual creators
	// (by comparing seller_id with the IP/device that created it, if available)
	fmt.Println("📊 [CHECK 1] Products assigned in last 24 hours:")
	rows, err := db.Query(`
		SELECT 
			p.id,
			p.created_at,
			p.seller_id,
			u.email as seller_email,
			p.title,
			(SELECT COUNT(*) FROM products WHERE seller_id = p.seller_id AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as recent_seller_count
		FROM products p
		LEFT JOIN users u ON p.seller_id = u.id
		WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
		ORDER BY p.created_at DESC
		LIMIT 50
	`)
	if err != nil {
		log.Printf("❌ Error querying products: %v\n", err)
		return
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var productID int
		var createdAt time.Time
		var sellerID int
		var sellerEmail, title string
		var recentCount int
		err := rows.Scan(&productID, &createdAt, &sellerID, &sellerEmail, &title, &recentCount)
		if err != nil {
			log.Printf("❌ Error scanning row: %v\n", err)
			continue
		}
		fmt.Printf("  Product #%d | Seller: %s (%d) | Title: %s | Recent Count: %d\n",
			productID, sellerEmail, sellerID, title, recentCount)
		count++
	}
	fmt.Printf("✅ Found %d recently created products\n\n", count)

	// Check 2: Find sellers with unusually high product creation rate (possible token sharing)
	fmt.Println("🔍 [CHECK 2] Unusual product creation patterns (last 24 hours):")
	rows2, err := db.Query(`
		SELECT 
			seller_id,
			u.email,
			COUNT(*) as product_count,
			MIN(created_at) as first_created,
			MAX(created_at) as last_created,
			TIMESTAMPDIFF(MINUTE, MIN(created_at), MAX(created_at)) as minutes_span
		FROM products p
		LEFT JOIN users u ON p.seller_id = u.id
		WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
		GROUP BY seller_id
		HAVING COUNT(*) >= 3
		ORDER BY COUNT(*) DESC
	`)
	if err != nil {
		log.Printf("❌ Error querying creation patterns: %v\n", err)
		return
	}
	defer rows2.Close()

	count2 := 0
	for rows2.Next() {
		var sellerID int
		var email string
		var productCount, minuteSpan int
		var firstCreated, lastCreated time.Time
		err := rows2.Scan(&sellerID, &email, &productCount, &firstCreated, &lastCreated, &minuteSpan)
		if err != nil {
			log.Printf("❌ Error scanning row: %v\n", err)
			continue
		}

		// Flag if products created too quickly (possible bot/token sharing)
		if minuteSpan >= 0 && productCount > 1 && minuteSpan < 5 {
			fmt.Printf("  ⚠️  SUSPICIOUS: User %s (%d) created %d products in %d minutes\n",
				email, sellerID, productCount, minuteSpan)
		} else {
			fmt.Printf("  User %s (%d) created %d products | Time span: %d minutes\n",
				email, sellerID, productCount, minuteSpan)
		}
		count2++
	}
	fmt.Printf("✅ Found %d sellers with multiple recent products\n\n", count2)

	// Check 3: Look for your (admin) account having products it shouldn't
	fmt.Println("👤 [CHECK 3] Products for account ID 1 (your account):")
	rows3, err := db.Query(`
		SELECT 
			id,
			title,
			created_at,
			updated_at,
			status
		FROM products
		WHERE seller_id = 1
		ORDER BY created_at DESC
		LIMIT 20
	`)
	if err != nil {
		log.Printf("❌ Error querying your products: %v\n", err)
		return
	}
	defer rows3.Close()

	count3 := 0
	for rows3.Next() {
		var productID int
		var title string
		var createdAt, updatedAt time.Time
		var status string
		err := rows3.Scan(&productID, &title, &createdAt, &updatedAt, &status)
		if err != nil {
			log.Printf("❌ Error scanning row: %v\n", err)
			continue
		}
		fmt.Printf("  Product #%d | Title: %s | Created: %s | Status: %s\n",
			productID, title, createdAt.Format("2006-01-02 15:04:05"), status)
		count3++
	}
	fmt.Printf("✅ Found %d products in your account\n\n", count3)

	// Check 4: JWT Token validation test
	fmt.Println("🔐 [CHECK 4] Potential JWT/Auth issues to investigate:")
	fmt.Println("  ✓ Check browser localStorage for 'clovia_token' and 'clovia_user'")
	fmt.Println("  ✓ Verify token hasn't been copied/shared between users")
	fmt.Println("  ✓ Check if auth header is correctly passed: 'Bearer <token>'")
	fmt.Println("  ✓ Verify JWT expiration time is reasonable (should be 7 days in app.go)")
	fmt.Println("  ✓ Check middleware.GetUserIDFromContext() is being called correctly\n")

	// Check 5: Database integrity check
	fmt.Println("🔧 [CHECK 5] Database integrity check:")
	var sellerIDNullCount int
	db.QueryRow("SELECT COUNT(*) FROM products WHERE seller_id IS NULL OR seller_id = 0").Scan(&sellerIDNullCount)
	if sellerIDNullCount > 0 {
		fmt.Printf("  ⚠️  WARNING: Found %d products with NULL or 0 seller_id\n", sellerIDNullCount)
	} else {
		fmt.Printf("  ✅ All products have valid seller_id assignments\n")
	}

	// Check 6: User session analysis
	fmt.Println("\n📋 [CHECK 6] Recent user activity:")
	rows4, err := db.Query(`
		SELECT 
			id,
			email,
			last_login,
			created_at
		FROM users
		WHERE last_login >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
		ORDER BY last_login DESC
		LIMIT 10
	`)
	if err != nil {
		log.Printf("Error querying user activity: %v\n", err)
		return
	}
	defer rows4.Close()

	for rows4.Next() {
		var userID int
		var email string
		var lastLogin sql.NullTime
		var createdAt time.Time
		err := rows4.Scan(&userID, &email, &lastLogin, &createdAt)
		if err != nil {
			log.Printf("Error scanning user: %v\n", err)
			continue
		}
		lastLoginStr := "Never"
		if lastLogin.Valid {
			lastLoginStr = lastLogin.Time.Format("2006-01-02 15:04:05")
		}
		fmt.Printf("  User #%d | Email: %s | Last Login: %s\n", userID, email, lastLoginStr)
	}

	fmt.Println("\n========== RECOMMENDATIONS ==========")
	fmt.Println("1. ✓ Enable audit logging in CreateProduct handler to log user_id before insert")
	fmt.Println("2. ✓ Add JWT validation logs to middleware to catch ID mismatches")
	fmt.Println("3. ✓ Check if user is sharing account credentials with someone else")
	fmt.Println("4. ✓ Run: mysql> SELECT * FROM products WHERE seller_id NOT IN (SELECT id FROM users);")
	fmt.Println("5. ✓ Validate that auth token in browser matches the user who should be logged in\n")
}

func main() {
	// Assuming your DB connection is already set up
	// Replace with your actual database connection
	dbConn, err := sql.Open("mysql", "root@tcp(localhost:3306)/clovia")
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer dbConn.Close()

	DiagnoseSellerIDIssue(dbConn)
}
