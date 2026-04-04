//go:build ignore

package main

import (
	"fmt"
	"log"
	"strings"

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

	fmt.Println("╔════════════════════════════════════════════════════════════════╗")
	fmt.Println("║            DEBUGGING MULTIWAY MATCHING FOR CHARLIE             ║")
	fmt.Println("╚════════════════════════════════════════════════════════════════╝\n")

	// Get User2 (Bob)'s target product details
	fmt.Println("STEP 1: Getting User2 (Bob) target product...")
	fmt.Println("─────────────────────────────────────────────\n")

	var targetCat, targetTitle, targetWants, targetWantedCat, targetDesiredProd string
	err := database.DB.QueryRow(`
		SELECT p.category, p.title, COALESCE(p.wants, ''), COALESCE(p.wanted_categories, ''), COALESCE(p.desired_product, '')
		FROM trades t 
		JOIN products p ON p.id = t.target_product_id 
		WHERE t.id = 116
	`).Scan(&targetCat, &targetTitle, &targetWants, &targetWantedCat, &targetDesiredProd)
	if err != nil {
		log.Fatal("Error getting target:", err)
	}

	fmt.Printf("User2's Target Product: %s\n", targetTitle)
	fmt.Printf("  Category: %s\n", targetCat)
	fmt.Printf("  Wants: %s\n", targetWants)
	fmt.Printf("  Wanted Categories: %s\n", targetWantedCat)
	fmt.Printf("  Desired Product: %s\n\n", targetDesiredProd)

	// Get User1 (Alice)'s offered products
	fmt.Println("STEP 2: Getting User1 (Alice) offered products...")
	fmt.Println("──────────────────────────────────────────────\n")

	rows, err := database.DB.Query(`
		SELECT p.id, p.title, p.category, COALESCE(p.price, 0), COALESCE(p.` + "`condition`" + `, '')
		FROM trade_items ti
		JOIN products p ON p.id = ti.product_id
		WHERE ti.trade_id = 116 AND ti.offered_by = 'buyer'
	`)
	if err != nil {
		log.Fatal("Error:", err)
	}
	defer rows.Close()

	var u1Prods []struct {
		id        int
		title     string
		category  string
		price     float64
		condition string
	}

	for rows.Next() {
		var p struct {
			id        int
			title     string
			category  string
			price     float64
			condition string
		}
		if err := rows.Scan(&p.id, &p.title, &p.category, &p.price, &p.condition); err == nil {
			u1Prods = append(u1Prods, p)
			fmt.Printf("Offered: %s (ID=%d)\n", p.title, p.id)
			fmt.Printf("  Category: %s\n", p.category)
			fmt.Printf("  Price: %.0f\n", p.price)
			fmt.Printf("  Condition: %s\n\n", p.condition)
		}
	}

	// Check Charlie's product
	fmt.Println("STEP 3: Checking Charlie (User 102) product...")
	fmt.Println("─────────────────────────────────────────────\n")

	var user3ID int
	var user3Name, user3ProductTitle, user3Category, user3Condition, wants, wantedCategories, desiredProduct string
	var user3Price float64

	err = database.DB.QueryRow(`
		SELECT u.id, u.name, p.id, p.title, COALESCE(p.category, ''), COALESCE(p.price, 0),
		       COALESCE(p.`+"`condition`"+`, ''), COALESCE(p.wants, ''), COALESCE(p.wanted_categories, ''), COALESCE(p.desired_product, '')
		FROM products p
		JOIN users u ON u.id = p.seller_id
		WHERE p.seller_id = 102
	`).Scan(&user3ID, &user3Name, &user3ID, &user3ProductTitle, &user3Category, &user3Price, &user3Condition, &wants, &wantedCategories, &desiredProduct)
	if err != nil {
		log.Fatal("Error:", err)
	}

	fmt.Printf("User3: %s (ID=%d)\n", user3Name, user3ID)
	fmt.Printf("Product: %s\n", user3ProductTitle)
	fmt.Printf("  Category: %s\n", user3Category)
	fmt.Printf("  Price: %.0f\n", user3Price)
	fmt.Printf("  Condition: %s\n", user3Condition)
	fmt.Printf("  Wants: %s\n", wants)
	fmt.Printf("  Wanted Categories: %s\n", wantedCategories)
	fmt.Printf("  Desired Product: %s\n\n", desiredProduct)

	// Check strategic filter
	fmt.Println("STEP 4: Checking Strategic Filter...")
	fmt.Println("───────────────────────────────────\n")

	u2Haystack := strings.ToLower(targetWants + " " + targetWantedCat + " " + targetDesiredProd)
	u3TitleLower := strings.ToLower(strings.TrimSpace(user3ProductTitle))
	u3CatLower := strings.ToLower(strings.TrimSpace(user3Category))

	fmt.Printf("User2 Haystack: %s\n", u2Haystack)
	fmt.Printf("User3 Title (lower): %s\n", u3TitleLower)
	fmt.Printf("User3 Category (lower): %s\n\n", u3CatLower)

	fmt.Printf("Contains checks:\n")
	fmt.Printf("  Haystack contains U3 title: %v\n", strings.Contains(u2Haystack, u3TitleLower))
	fmt.Printf("  Haystack contains U3 category: %v\n\n", strings.Contains(u2Haystack, u3CatLower))

	// Check wants signal
	fmt.Println("STEP 5: Checking Wants Signal...")
	fmt.Println("─────────────────────────────\n")

	needleTitle := strings.ToLower(strings.TrimSpace(u1Prods[0].title))
	haystack := strings.ToLower(wants + " " + wantedCategories + " " + desiredProduct)

	fmt.Printf("Charlie's wants haystack: %s\n", haystack)
	fmt.Printf("Alice's offered title (lower): %s\n\n", needleTitle)

	if strings.Contains(haystack, needleTitle) {
		fmt.Println("✅ MATCH: Charlie's wants contains Alice's iPhone title!")
	} else {
		fmt.Println("❌ NO MATCH: Charlie's wants does NOT contain Alice's iPhone title")
	}

	fmt.Println("\n✓ Debug analysis complete!")
}
