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

	fmt.Println("Initializing database...")
	if err := database.InitDatabase(); err != nil {
		log.Fatal("Failed to init DB:", err)
	}
	defer database.CloseDatabase()

	fmt.Println("✓ Database initialized\n")

	// Step 1: Create test users
	fmt.Println("STEP 1: Creating test users...")
	fmt.Println("─────────────────────────────\n")

	users := []struct {
		ID    int
		name  string
		email string
	}{
		{100, "Test Alice", "alice@test.local"},
		{101, "Test Bob", "bob@test.local"},
		{102, "Test Charlie", "charlie@test.local"},
	}

	for _, u := range users {
		_, err := database.DB.Exec(`
			INSERT INTO users (id, name, email, password_hash, slug, bio, profile_picture, is_premium, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
			ON DUPLICATE KEY UPDATE updated_at=NOW()
		`, u.ID, u.name, u.email, "$2y$10$test", "test-"+u.email[:strings.Index(u.email, "@")], "Test user", "https://i.pravatar.cc/150?img="+fmt.Sprintf("%d", u.ID))

		if err != nil {
			fmt.Printf("✗ Failed to create user %s: %v\n", u.name, err)
		} else {
			fmt.Printf("✓ Created user: %s (ID=%d)\n", u.name, u.ID)
		}
	}

	// Step 2: Create test products
	fmt.Println("\nSTEP 2: Creating test products with image URLs...")
	fmt.Println("─────────────────────────────────────────────────\n")

	products := []struct {
		sellerID       int
		sellerName     string
		title          string
		price          float64
		wants          string
		desiredProduct string
		image          string
	}{
		{
			100, "Alice",
			"iPhone 15 Pro Max - Test",
			75000,
			"MacBook Pro, MacBook Air, laptop, computer",
			"MacBook",
			"https://images.unsplash.com/photo-1592286927505-1def25115558?w=500&q=80",
		},
		{
			101, "Bob",
			"MacBook Pro 14 M3 Max - Test",
			120000,
			"PS5, PlayStation 5, gaming console, Xbox",
			"PS5",
			"https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&q=80",
		},
		{
			102, "Charlie",
			"PlayStation 5 Console - Test",
			35000,
			"iPhone, iPhone 15, iPhone 15 Pro, phone, mobile",
			"iPhone",
			"https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=500&q=80",
		},
	}

	var productIDs []int
	for _, p := range products {
		result, err := database.DB.Exec(`
			INSERT INTO products (seller_id, title, slug, description, category, price, wants, desired_product, image_url, status, `+"`condition`"+`, created_at, updated_at)
			VALUES (?, ?, ?, ?, 'Electronics', ?, ?, ?, ?, 'available', 'like_new', NOW(), NOW())
		`, p.sellerID, p.title, "test-"+strings.ToLower(strings.ReplaceAll(p.title, " ", "-")), p.title, p.price, p.wants, p.desiredProduct, p.image)

		if err != nil {
			fmt.Printf("✗ Failed to create product %s: %v\n", p.title, err)
			continue
		}

		pid, _ := result.LastInsertId()
		productIDs = append(productIDs, int(pid))
		fmt.Printf("✓ Product: %s (ID=%d)\n", p.title, int(pid))
		fmt.Printf("  Seller: %s (ID=%d)\n", p.sellerName, p.sellerID)
		fmt.Printf("  Wants: %s\n", p.wants)
		fmt.Printf("  Desired: %s\n", p.desiredProduct)
		fmt.Println()
	}

	fmt.Printf("\n✓ Created %d test products\n", len(productIDs))
	fmt.Println("\nTest data ready for multiway loop detection!")
}
