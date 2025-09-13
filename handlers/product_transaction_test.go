package handlers

import (
	"database/sql"
	"sync"
	"testing"

	_ "github.com/go-sql-driver/mysql"
)

// TestConcurrentProductPurchase tests race condition handling during concurrent purchases
func TestConcurrentProductPurchase(t *testing.T) {
	// This test requires a test database connection
	// Replace with your test database connection string
	db, err := sql.Open("mysql", "test_user:test_pass@tcp(localhost:3306)/clovia_test")
	if err != nil {
		t.Skip("Test database not available")
	}
	defer db.Close()

	handler := &ProductTransactionHandler{db: db}

	// Setup test product
	result, err := db.Exec(`
		INSERT INTO products (title, description, price, seller_id, status, allow_buying, barter_only, location, version) 
		VALUES ('Test Product', 'Test Description', 100.00, 1, 'available', TRUE, FALSE, 'Test Location', 1)`)
	if err != nil {
		t.Fatalf("Failed to create test product: %v", err)
	}

	productID, _ := result.LastInsertId()

	// Test concurrent purchases
	const numGoroutines = 10
	var wg sync.WaitGroup
	results := make(chan error, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(buyerID int) {
			defer wg.Done()
			err := handler.CompleteProductSale(int(productID), buyerID+2) // Start from user ID 2
			results <- err
		}(i)
	}

	wg.Wait()
	close(results)

	// Count successful and failed purchases
	successCount := 0
	failCount := 0
	for err := range results {
		if err == nil {
			successCount++
		} else {
			failCount++
		}
	}

	// Only one purchase should succeed
	if successCount != 1 {
		t.Errorf("Expected exactly 1 successful purchase, got %d", successCount)
	}

	if failCount != numGoroutines-1 {
		t.Errorf("Expected %d failed purchases, got %d", numGoroutines-1, failCount)
	}

	// Verify product status is 'sold'
	var status string
	err = db.QueryRow("SELECT status FROM products WHERE id = ?", productID).Scan(&status)
	if err != nil {
		t.Fatalf("Failed to check product status: %v", err)
	}

	if status != "sold" {
		t.Errorf("Expected product status to be 'sold', got '%s'", status)
	}

	// Cleanup
	db.Exec("DELETE FROM products WHERE id = ?", productID)
	db.Exec("DELETE FROM orders WHERE product_id = ?", productID)
}

// TestProductReservation tests the product reservation mechanism
func TestProductReservation(t *testing.T) {
	db, err := sql.Open("mysql", "test_user:test_pass@tcp(localhost:3306)/clovia_test")
	if err != nil {
		t.Skip("Test database not available")
	}
	defer db.Close()

	handler := &ProductTransactionHandler{db: db}

	// Setup test product
	result, err := db.Exec(`
		INSERT INTO products (title, description, price, seller_id, status, allow_buying, barter_only, location, version) 
		VALUES ('Test Product 2', 'Test Description', 100.00, 1, 'available', TRUE, FALSE, 'Test Location', 1)`)
	if err != nil {
		t.Fatalf("Failed to create test product: %v", err)
	}

	productID, _ := result.LastInsertId()

	// Test reservation
	err = handler.ReserveProduct(int(productID), 2, 5) // Reserve for 5 minutes
	if err != nil {
		t.Fatalf("Failed to reserve product: %v", err)
	}

	// Try to reserve again (should fail)
	err = handler.ReserveProduct(int(productID), 3, 5)
	if err == nil {
		t.Error("Expected second reservation to fail, but it succeeded")
	}

	// Cleanup expired reservations
	db.Exec("UPDATE products SET reserved_until = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?", productID)
	
	err = handler.CleanupExpiredReservations()
	if err != nil {
		t.Errorf("Failed to cleanup expired reservations: %v", err)
	}

	// Should be able to reserve again after cleanup
	err = handler.ReserveProduct(int(productID), 3, 5)
	if err != nil {
		t.Errorf("Failed to reserve product after cleanup: %v", err)
	}

	// Cleanup
	db.Exec("DELETE FROM products WHERE id = ?", productID)
}

// BenchmarkConcurrentAccess benchmarks concurrent access to products
func BenchmarkConcurrentAccess(b *testing.B) {
	db, err := sql.Open("mysql", "test_user:test_pass@tcp(localhost:3306)/clovia_test")
	if err != nil {
		b.Skip("Test database not available")
	}
	defer db.Close()

	handler := &ProductTransactionHandler{db: db}

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			// Create a test product
			result, err := db.Exec(`
				INSERT INTO products (title, description, price, seller_id, status, allow_buying, barter_only, location, version) 
				VALUES ('Bench Product', 'Bench Description', 100.00, 1, 'available', TRUE, FALSE, 'Test Location', 1)`)
			if err != nil {
				b.Fatalf("Failed to create test product: %v", err)
			}

			productID, _ := result.LastInsertId()

			// Try to purchase it
			handler.CompleteProductSale(int(productID), 2)

			// Cleanup
			db.Exec("DELETE FROM products WHERE id = ?", productID)
			db.Exec("DELETE FROM orders WHERE product_id = ?", productID)
		}
	})
}
