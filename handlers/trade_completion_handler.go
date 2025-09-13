package handlers

import (
	"database/sql"
	"fmt"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
)

// TradeCompletionHandler handles trade completion with race condition protection
type TradeCompletionHandler struct {
	db *sql.DB
}

// NewTradeCompletionHandler creates a new trade completion handler
func NewTradeCompletionHandler() *TradeCompletionHandler {
	return &TradeCompletionHandler{
		db: database.DB,
	}
}

// CompleteTradeTransaction safely completes a trade and marks all products as unavailable
func (h *TradeCompletionHandler) CompleteTradeTransaction(tradeID int) error {
	tx, err := h.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	// Lock the trade row to prevent concurrent completions
	var currentStatus string
	var targetProductID int
	var buyerID, sellerID int
	var buyerCompleted, sellerCompleted bool

	err = tx.QueryRow(`
		SELECT status, target_product_id, buyer_id, seller_id, buyer_completed, seller_completed
		FROM trades 
		WHERE id = ? 
		FOR UPDATE`, tradeID).Scan(&currentStatus, &targetProductID, &buyerID, &sellerID, &buyerCompleted, &sellerCompleted)
	
	if err != nil {
		return fmt.Errorf("trade not found: %w", err)
	}

	// Verify trade is in active state and both parties have completed
	if currentStatus != "active" {
		return fmt.Errorf("trade is not in active state (status: %s)", currentStatus)
	}

	if !buyerCompleted || !sellerCompleted {
		return fmt.Errorf("both parties must complete the trade before finalizing")
	}

	// Get all offered products in this trade
	rows, err := tx.Query(`
		SELECT product_id 
		FROM trade_items 
		WHERE trade_id = ?`, tradeID)
	
	if err != nil {
		return fmt.Errorf("failed to get trade items: %w", err)
	}
	defer rows.Close()

	var offeredProductIDs []int
	for rows.Next() {
		var productID int
		if err := rows.Scan(&productID); err != nil {
			return fmt.Errorf("failed to scan product ID: %w", err)
		}
		offeredProductIDs = append(offeredProductIDs, productID)
	}

	// Mark target product as unavailable with version check
	err = h.markProductUnavailableWithLock(tx, targetProductID)
	if err != nil {
		return fmt.Errorf("failed to mark target product as unavailable: %w", err)
	}

	// Mark all offered products as unavailable
	for _, productID := range offeredProductIDs {
		err = h.markProductUnavailableWithLock(tx, productID)
		if err != nil {
			return fmt.Errorf("failed to mark offered product %d as unavailable: %w", productID, err)
		}
	}

	// Update trade status to completed (with additional check to prevent double completion)
	result, err := tx.Exec(`
		UPDATE trades 
		SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
		WHERE id = ? AND status = 'active'`, tradeID)
	
	if err != nil {
		return fmt.Errorf("failed to update trade status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check trade update result: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("trade was already completed by another process")
	}

	return tx.Commit()
}

// markProductUnavailableWithLock marks a product as unavailable with optimistic locking
func (h *TradeCompletionHandler) markProductUnavailableWithLock(tx *sql.Tx, productID int) error {
	// Lock and verify product
	var currentStatus string
	var currentVersion int
	
	err := tx.QueryRow(`
		SELECT status, version 
		FROM products 
		WHERE id = ? 
		FOR UPDATE`, productID).Scan(&currentStatus, &currentVersion)
	
	if err != nil {
		return fmt.Errorf("product %d not found: %w", productID, err)
	}

	// Only update if product is available
	if currentStatus != "available" {
		log.Printf("Warning: Product %d is already unavailable (status: %s), skipping", productID, currentStatus)
		return nil // Don't fail the entire trade if one product is already unavailable
	}

	// Update product status to unavailable with version increment
	result, err := tx.Exec(`
		UPDATE products 
		SET status = 'unavailable', version = version + 1, reserved_until = NULL, updated_at = CURRENT_TIMESTAMP 
		WHERE id = ? AND version = ? AND status = 'available'`,
		productID, currentVersion)
	
	if err != nil {
		return fmt.Errorf("failed to update product %d status: %w", productID, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check update result for product %d: %w", productID, err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("product %d was modified by another transaction", productID)
	}

	return nil
}

// ValidateTradeEligibility checks if products in a trade are still available
func (h *TradeCompletionHandler) ValidateTradeEligibility(tradeID int) error {
	// Get target product
	var targetProductID int
	err := h.db.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tradeID).Scan(&targetProductID)
	if err != nil {
		return fmt.Errorf("trade not found: %w", err)
	}

	// Check target product availability
	var targetStatus string
	err = h.db.QueryRow("SELECT status FROM products WHERE id = ?", targetProductID).Scan(&targetStatus)
	if err != nil {
		return fmt.Errorf("target product not found: %w", err)
	}

	if targetStatus != "available" {
		return fmt.Errorf("target product is no longer available (status: %s)", targetStatus)
	}

	// Check offered products availability
	rows, err := h.db.Query(`
		SELECT p.id, p.status 
		FROM products p
		JOIN trade_items ti ON p.id = ti.product_id
		WHERE ti.trade_id = ?`, tradeID)
	
	if err != nil {
		return fmt.Errorf("failed to check offered products: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var productID int
		var status string
		if err := rows.Scan(&productID, &status); err != nil {
			continue
		}

		if status != "available" {
			return fmt.Errorf("offered product %d is no longer available (status: %s)", productID, status)
		}
	}

	return nil
}

// HTTP Handler for completing trades
func (h *TradeCompletionHandler) CompleteTrade(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	var req struct {
		TradeID int `json:"trade_id" validate:"required"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Verify user is part of this trade
	var buyerID, sellerID int
	err := h.db.QueryRow("SELECT buyer_id, seller_id FROM trades WHERE id = ?", req.TradeID).Scan(&buyerID, &sellerID)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Trade not found",
		})
	}

	if userID != buyerID && userID != sellerID {
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "Not authorized for this trade",
		})
	}

	// Validate trade eligibility before completion
	if err := h.ValidateTradeEligibility(req.TradeID); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Trade cannot be completed: %s", err.Error()),
		})
	}

	// Complete the trade transaction
	if err := h.CompleteTradeTransaction(req.TradeID); err != nil {
		log.Printf("Failed to complete trade %d: %v", req.TradeID, err)
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to complete trade",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Trade completed successfully",
	})
}
