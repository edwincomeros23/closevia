//go:build ignore

package main

import (
	"fmt"
	"log"
	"strings"

	"github.com/joho/godotenv"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/services"
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
	fmt.Println("║        MULTIWAY LOOP TEST - COMPLETE SETUP & DETECTION         ║")
	fmt.Println("╚════════════════════════════════════════════════════════════════╝\n")

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
		_, _ = database.DB.Exec(`
			INSERT INTO users (id, name, email, email_verified_at, password, slug, bio, avatar, location, is_premium, created_at, updated_at)
			VALUES (?, ?, ?, NOW(), '$2y$10$test', ?, ?, ?, ?, 1, NOW(), NOW())
			ON DUPLICATE KEY UPDATE updated_at=NOW()
		`, u.ID, u.name, u.email, "test-"+u.email[:strings.Index(u.email, "@")], "Test user", "https://i.pravatar.cc/150?img="+fmt.Sprintf("%d", u.ID), "Test City")
		fmt.Printf("✓ Created user: %s (ID=%d)\n", u.name, u.ID)
	}
	fmt.Println()

	// Step 2: Create test products
	fmt.Println("STEP 2: Creating test products with wants & images...")
	fmt.Println("─────────────────────────────────────────────────────\n")

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
			100,
			"Alice",
			"iPhone 15 Pro Max - Test",
			75000,
			"MacBook Pro, MacBook Air, laptop, computer",
			"MacBook",
			"https://images.unsplash.com/photo-1592286927505-1def25115558?w=500&q=80",
		},
		{
			101,
			"Bob",
			"MacBook Pro 14 M3 Max - Test",
			120000,
			"PS5, PlayStation 5, gaming console, Xbox",
			"PS5",
			"https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&q=80",
		},
		{
			102,
			"Charlie",
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
			INSERT INTO products (seller_id, title, slug, description, category, price, wants, desired_product, image, status, condition, created_at, updated_at)
			VALUES (?, ?, ?, ?, 'Electronics', ?, ?, ?, ?, 'available', 'like_new', NOW(), NOW())
		`, p.sellerID, p.title, "test-"+p.title, p.title, p.price, p.wants, p.desiredProduct, p.image)

		if err != nil {
			log.Printf("Error inserting product: %v", err)
			fmt.Printf("✗ Failed to create product: %s\n", p.title)
			continue
		}

		pid, _ := result.LastInsertId()
		productIDs = append(productIDs, int(pid))
		fmt.Printf("✓ Product: %s (ID=%d, Price=%d)\n", p.title, pid, int(p.price))
		fmt.Printf("  Seller: %s (ID=%d)\n", p.sellerName, p.sellerID)
		fmt.Printf("  Wants: %s\n", p.wants)
		fmt.Printf("  Image: %s\n", p.image)
		fmt.Println()
	}

	// Step 3: Show the expected loop
	fmt.Println("STEP 3: Expected multiway loop structure")
	fmt.Println("──────────────────────────────────────\n")

	fmt.Println("┌─────────────────────────────────────────────┐")
	fmt.Println("│           THE PERFECT 3-WAY LOOP            │")
	fmt.Println("└─────────────────────────────────────────────┘\n")

	fmt.Println("  Alice (User 100)")
	fmt.Println("  ├─ Has: iPhone 15 Pro Max ($75,000)")
	fmt.Println("  └─ Wants: MacBook Pro")
	fmt.Println("      ↓")
	fmt.Println("  Bob (User 101)")
	fmt.Println("  ├─ Has: MacBook Pro 14\" ($120,000)")
	fmt.Println("  └─ Wants: PS5 / Gaming Console")
	fmt.Println("      ↓")
	fmt.Println("  Charlie (User 102)")
	fmt.Println("  ├─ Has: PlayStation 5 Console ($35,000)")
	fmt.Println("  └─ Wants: iPhone / Mobile")
	fmt.Println("      ↓")
	fmt.Println("      (back to Alice) ← LOOP COMPLETE!")
	fmt.Println()

	// Step 4: Create the trigger trade
	fmt.Println("STEP 4: Creating trigger trade...")
	fmt.Println("────────────────────────────────\n")

	result, _ := database.DB.Exec(`
		INSERT INTO trades (buyer_id, seller_id, target_product_id, status, created_at, updated_at)
		VALUES (?, ?, ?, 'pending', NOW(), NOW())
	`, 100, 101, productIDs[1]) // Alice wants Bob's MacBook

	tradeID, _ := result.LastInsertId()

	// Add trade item
	_, _ = database.DB.Exec(`
		INSERT INTO trade_items (trade_id, product_id, offered_by, created_at)
		VALUES (?, ?, 'buyer', NOW())
	`, tradeID, productIDs[0]) // Alice offering her iPhone

	fmt.Printf("✓ Trade %d created:\n", tradeID)
	fmt.Printf("  Buyer: Alice (100)\n")
	fmt.Printf("  Seller: Bob (101)\n")
	fmt.Printf("  Target: MacBook (ID=%d)\n", productIDs[1])
	fmt.Printf("  Offered: iPhone (ID=%d)\n\n", productIDs[0])

	// Step 5: Test multiway detection
	fmt.Println("STEP 5: Testing multiway loop detection...")
	fmt.Println("──────────────────────────────────────────\n")

	matches, debug, _ := services.FindMultiwayMatchDetailed(database.DB, 100, 101, int(tradeID), []int{})

	fmt.Printf("Threshold: %d points\n", debug.Threshold)
	fmt.Printf("Found %d matching candidates\n\n", len(matches))

	if len(matches) == 0 {
		fmt.Println("❌ NO MATCHES FOUND!")
		if debug.NoMatchReason != "" {
			fmt.Printf("Reason: %s\n", debug.NoMatchReason)
		}
		return
	}

	fmt.Println("✅ MULTIWAY CANDIDATES FOUND:\n")

	charlieFound := false
	for i, match := range matches {
		if match.User3ID == 102 && match.User3ProductID == productIDs[2] {
			fmt.Printf("[%d] ✅ USER3: %s (ID=%d) [CHARLIE - CORRECT!]\n", i+1, match.User3Name, match.User3ID)
			charlieFound = true
		} else {
			fmt.Printf("[%d] User3: %s (ID=%d)\n", i+1, match.User3Name, match.User3ID)
		}

		fmt.Printf("    Product: %s (ID=%d)\n", match.User3ProductTitle, match.User3ProductID)
		fmt.Printf("    Wants your: %s (ID=%d)\n", match.User1ProductTitle, match.User1ProductID)
		fmt.Printf("    Match Score: %d\n", match.MatchScore)
		fmt.Println()
	}

	// Step 6: Show results
	fmt.Println("╔════════════════════════════════════════════════════════════════╗")
	if charlieFound {
		fmt.Println("║             ✅ TEST SUCCESSFUL - LOOP DETECTED!               ║")
		fmt.Println("╚════════════════════════════════════════════════════════════════╝\n")

		fmt.Println("Next steps:")
		fmt.Println("1. Go to Dashboard → Multi-Way tab")
		fmt.Println("2. You should see the loop: Alice → Bob → Charlie → Alice")
		fmt.Println("3. Charlie will be invited to complete the loop")
		fmt.Println("4. Create multiway trades from different test users to verify it works")
	} else {
		fmt.Println("║          ⚠️  CHARLIE NOT IN TOP MATCH - CHECK SCORING        ║")
		fmt.Println("╚════════════════════════════════════════════════════════════════╝")
	}

	// Step 7: Create multiway if match found
	if charlieFound && len(matches) > 0 {
		fmt.Println("\n\nSTEP 6: Creating multiway trade...")
		fmt.Println("─────────────────────────────────\n")

		best := matches[0]
		chainID := fmt.Sprintf("chain_test_%d_%d_%d_%d", tradeID, 100, 101, best.User3ID)

		_, err := database.DB.Exec(`
			INSERT INTO multiway_trades (chain_id, original_trade_id, initiator_user_id, user1_id, user2_id, user3_id, user3_product_id, status, expires_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_user3', DATE_ADD(NOW(), INTERVAL 18 HOUR), NOW(), NOW())
		`, chainID, tradeID, 101, 100, 101, best.User3ID, best.User3ProductID)

		if err != nil {
			fmt.Printf("Error creating multiway: %v\n", err)
		} else {
			fmt.Printf("✅ Multiway trade created!\n")
			fmt.Printf("   Chain ID: %s\n", chainID)
			fmt.Printf("   Status: pending_user3 (waiting for Charlie to accept)\n")
			fmt.Printf("   Expires: in 18 hours\n")
		}
	}

	fmt.Println("\n✓ Test complete!")
}
