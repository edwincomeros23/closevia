package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
)

type TradeHandler struct {
	db *sql.DB
}

func NewTradeHandler() *TradeHandler {
	return &TradeHandler{db: database.DB}
}

// CreateTrade creates a new trade proposal
func (h *TradeHandler) CreateTrade(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	var payload models.TradeCreate
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}
	if payload.TargetProductID <= 0 || len(payload.OfferedProductIDs) == 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid product IDs"})
	}

	// Check if target product is still available
	var targetStatus string
	err := h.db.QueryRow("SELECT status FROM products WHERE id = ?", payload.TargetProductID).Scan(&targetStatus)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Target product not found"})
	}
	if targetStatus != "available" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "This product is no longer available for trading"})
	}

	// Check if offered products are still available
	for _, productID := range payload.OfferedProductIDs {
		var offeredStatus string
		err := h.db.QueryRow("SELECT status FROM products WHERE id = ?", productID).Scan(&offeredStatus)
		if err != nil {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "One of your offered products not found"})
		}
		if offeredStatus != "available" {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "One of your offered products is no longer available"})
		}
	}

	// Use a transaction to ensure trade and items are created together
	tx, err := h.db.Begin()
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to start transaction"})
	}

	// Lookup target product to get seller_id inside the transaction
	var sellerID int
	if err := tx.QueryRow("SELECT seller_id FROM products WHERE id = ?", payload.TargetProductID).Scan(&sellerID); err != nil {
		_ = tx.Rollback()
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Target product not found"})
	}
	if sellerID == userID {
		_ = tx.Rollback()
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Cannot propose a trade on your own product"})
	}

	// Insert trade
	res, err := tx.Exec(`INSERT INTO trades (buyer_id, seller_id, target_product_id, status, message, offered_cash_amount) VALUES (?, ?, ?, 'pending', ?, ?)`, userID, sellerID, payload.TargetProductID, payload.Message, payload.OfferedCashAmount)
	if err != nil {
		_ = tx.Rollback()
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to create trade"})
	}
	tradeID64, _ := res.LastInsertId()
	tradeID := int(tradeID64)

	// Validate and insert offered items (buyer side)
	for _, pid := range payload.OfferedProductIDs {
		var ownerID int
		if err := tx.QueryRow("SELECT seller_id FROM products WHERE id = ?", pid).Scan(&ownerID); err != nil {
			_ = tx.Rollback()
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Offered product not found"})
		}
		if ownerID != userID {
			_ = tx.Rollback()
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "You can only offer your own products"})
		}
		if _, err := tx.Exec("INSERT INTO trade_items (trade_id, product_id, offered_by) VALUES (?, ?, 'buyer')", tradeID, pid); err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to attach offered items"})
		}
	}

	if err := tx.Commit(); err != nil {
		_ = tx.Rollback()
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to save trade"})
	}

	// Create notification for seller
	var buyerName string
	_ = h.db.QueryRow("SELECT name FROM users WHERE id = ?", userID).Scan(&buyerName)
	// Find product name for context
	var productTitle string
	_ = h.db.QueryRow("SELECT title FROM products WHERE id = ?", payload.TargetProductID).Scan(&productTitle)
	notifMsg := "You received a trade offer from " + buyerName + " for " + productTitle
	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_offer', ?, FALSE)", sellerID, notifMsg)
	publishNotification(sellerID, notifMsg)

	// Ensure chat conversation exists and add a system message
	convID, _ := ensureConversation(payload.TargetProductID, userID, sellerID)
	_, _, _ = saveMessage(convID, userID, "Trade offer started for "+productTitle+".")

	// Return created trade (items will appear when listing/fetching details)
	trade := models.Trade{ID: tradeID, BuyerID: userID, SellerID: sellerID, TargetProductID: payload.TargetProductID, Status: "pending", Message: payload.Message, OfferedCash: payload.OfferedCashAmount, CreatedAt: time.Now(), UpdatedAt: time.Now()}

	// Realtime notify seller via SSE
	publishToUser(sellerID, sseEvent{Type: "trade_created", Data: fiber.Map{
		"trade_id":            tradeID,
		"buyer_id":            userID,
		"target_product_id":   payload.TargetProductID,
		"message":             payload.Message,
		"offered_cash_amount": payload.OfferedCashAmount,
	}})

	return c.Status(201).JSON(models.APIResponse{Success: true, Message: "Trade created", Data: trade})
}

// GetTrades lists trades for the current user (as buyer or seller)
func (h *TradeHandler) GetTrades(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	status := c.Query("status", "")
	direction := c.Query("direction", "")
	where := "WHERE (t.buyer_id = ? OR t.seller_id = ?)"
	args := []interface{}{userID, userID}
	switch direction {
	case "incoming":
		where = "WHERE t.seller_id = ?"
		args = []interface{}{userID}
	case "outgoing":
		where = "WHERE t.buyer_id = ?"
		args = []interface{}{userID}
	}
	if status != "" {
		where += " AND t.status = ?"
		args = append(args, status)
	}

	rows, err := h.db.Query(`
        SELECT 
          t.id, t.buyer_id, t.seller_id, t.target_product_id, t.status, t.message, t.offered_cash_amount, t.created_at, t.updated_at,
          t.buyer_completed, t.seller_completed, t.completed_at,
          ub.name AS buyer_name, us.name AS seller_name, p.title AS product_title
        FROM trades t
        JOIN users ub ON ub.id = t.buyer_id
        JOIN users us ON us.id = t.seller_id
        JOIN products p ON p.id = t.target_product_id
        `+where+`
        ORDER BY t.created_at DESC
    `, args...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch trades"})
	}
	defer rows.Close()

	trades := []models.Trade{}
	for rows.Next() {
		var tr models.Trade
		if err := rows.Scan(&tr.ID, &tr.BuyerID, &tr.SellerID, &tr.TargetProductID, &tr.Status, &tr.Message, &tr.OfferedCash, &tr.CreatedAt, &tr.UpdatedAt, &tr.BuyerCompleted, &tr.SellerCompleted, &tr.CompletedAt, &tr.BuyerName, &tr.SellerName, &tr.ProductTitle); err == nil {
			// Load items
			itemRows, qerr := h.db.Query(`
                SELECT ti.id, ti.trade_id, ti.product_id, ti.offered_by, ti.created_at,
                       p.title, p.status, p.image_url
                FROM trade_items ti
                LEFT JOIN products p ON p.id = ti.product_id
                WHERE ti.trade_id = ?
            `, tr.ID)
			items := []models.TradeItem{}
			if qerr != nil {
				log.Printf("trade %d: joined items query error: %v", tr.ID, qerr)
			} else if itemRows != nil {
				for itemRows.Next() {
					var it models.TradeItem
					var offeredBy sql.NullString
					var title, pstatus, pimg sql.NullString
					if err := itemRows.Scan(&it.ID, &it.TradeID, &it.ProductID, &offeredBy, &it.CreatedAt, &title, &pstatus, &pimg); err == nil {
						if offeredBy.Valid {
							it.OfferedBy = offeredBy.String
						} else {
							it.OfferedBy = ""
						}
						if title.Valid {
							it.ProductTitle = title.String
						}
						if pstatus.Valid {
							it.ProductStatus = pstatus.String
						}
						if pimg.Valid {
							it.ProductImageURL = pimg.String
						}
						items = append(items, it)
					} else {
						log.Printf("trade %d: item row scan error: %v", tr.ID, err)
					}
				}
				itemRows.Close()
			}

			// Fallback: if no items found via join, fetch basic trade_items and enrich individually
			if len(items) == 0 {
				rows2, err2 := h.db.Query("SELECT id, trade_id, product_id, offered_by, created_at FROM trade_items WHERE trade_id = ?", tr.ID)
				if err2 != nil {
					log.Printf("trade %d: fallback items query error: %v", tr.ID, err2)
				} else {
					for rows2.Next() {
						var it models.TradeItem
						var offeredBy sql.NullString
						if err := rows2.Scan(&it.ID, &it.TradeID, &it.ProductID, &offeredBy, &it.CreatedAt); err == nil {
							if offeredBy.Valid {
								it.OfferedBy = offeredBy.String
							}
							// try to enrich product info
							var title, pstatus, pimg sql.NullString
							_ = h.db.QueryRow("SELECT title, status, image_url FROM products WHERE id = ?", it.ProductID).Scan(&title, &pstatus, &pimg)
							if title.Valid {
								it.ProductTitle = title.String
							}
							if pstatus.Valid {
								it.ProductStatus = pstatus.String
							}
							if pimg.Valid {
								it.ProductImageURL = pimg.String
							}
							items = append(items, it)
						} else {
							log.Printf("trade %d: fallback item scan error: %v", tr.ID, err)
						}
					}
					rows2.Close()
				}
			}

			tr.Items = items
			trades = append(trades, tr)
		} else {
			log.Printf("trade row scan error: %v", err)
		}
	}

	return c.JSON(models.APIResponse{Success: true, Data: trades})
}

// UpdateTrade allows seller or buyer to accept, decline, or counter
func (h *TradeHandler) UpdateTrade(c *fiber.Ctx) error {
	log.Printf("=== TRADE UPDATE ENDPOINT CALLED ===")
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		log.Printf("User not authenticated in UpdateTrade")
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	tradeID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		log.Printf("Invalid trade ID in UpdateTrade: %s", c.Params("id"))
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid trade id"})
	}
	log.Printf("UpdateTrade called: User %d, Trade %d", userID, tradeID)

	// Fetch trade
	var buyerID, sellerID int
	err = h.db.QueryRow("SELECT buyer_id, seller_id FROM trades WHERE id = ?", tradeID).Scan(&buyerID, &sellerID)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Trade not found"})
	}
	if userID != buyerID && userID != sellerID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not authorized for this trade"})
	}

	var payload models.TradeAction
	if err := c.BodyParser(&payload); err != nil {
		log.Printf("Failed to parse request body: %v", err)
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}
	log.Printf("Trade action received: %s for trade %d", payload.Action, tradeID)

	switch payload.Action {
	case "accept":
		_, err = h.db.Exec("UPDATE trades SET status='accepted', updated_at=CURRENT_TIMESTAMP WHERE id = ?", tradeID)
		if err == nil {
			// Ensure chat exists and add system message
			var pid int
			_ = h.db.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tradeID).Scan(&pid)
			var productTitle string
			_ = h.db.QueryRow("SELECT title FROM products WHERE id = ?", pid).Scan(&productTitle)
			convID, _ := ensureConversation(pid, buyerID, sellerID)
			_, _, _ = saveMessage(convID, userID, "Trade accepted for "+productTitle+".")
			// Mark as active post-accept
			_, _ = h.db.Exec("UPDATE trades SET status='active' WHERE id = ?", tradeID)
			// History
			_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, 'pending', 'accepted', ?)", tradeID, userID, payload.Message)
			publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "accepted"}})
			publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "accepted"}})
			// Notifications
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Your trade offer was accepted: "+productTitle)
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", sellerID, "You accepted a trade offer: "+productTitle)
		}
	case "decline":
		_, err = h.db.Exec("UPDATE trades SET status='declined', updated_at=CURRENT_TIMESTAMP WHERE id = ?", tradeID)
		if err == nil {
			var pid int
			_ = h.db.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tradeID).Scan(&pid)
			var productTitle string
			_ = h.db.QueryRow("SELECT title FROM products WHERE id = ?", pid).Scan(&productTitle)
			publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "declined"}})
			publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "declined"}})
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Your trade offer was declined: "+productTitle)
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", sellerID, "You declined a trade offer: "+productTitle)
			_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, NULL, 'declined', ?)", tradeID, userID, payload.Message)
		}
	case "counter":
		// Counter: set status countered and replace items with counter-offer from the countering party
		// Note: We keep offered items as belonging to the original sender (buyer)
		_, err = h.db.Exec("UPDATE trades SET status='countered', message=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?", payload.Message, tradeID)
		if err == nil {
			// If specific counter items supplied, replace buyer's items with provided set (still marked offered_by='buyer')
			if len(payload.CounterOfferedProductIDs) > 0 {
				_, _ = h.db.Exec("DELETE FROM trade_items WHERE trade_id = ?", tradeID)
				for _, pid := range payload.CounterOfferedProductIDs {
					_, _ = h.db.Exec("INSERT INTO trade_items (trade_id, product_id, offered_by) VALUES (?, ?, 'buyer')", tradeID, pid)
				}
			}
			// If counter cash amount provided, set it
			if payload.CounterOfferedCashAmount != nil {
				_, _ = h.db.Exec("UPDATE trades SET offered_cash_amount=? WHERE id = ?", payload.CounterOfferedCashAmount, tradeID)
			}
			publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "countered"}})
			publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "countered"}})
			// Notify buyer about counter
			var targetPid int
			_ = h.db.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tradeID).Scan(&targetPid)
			var productTitle string
			_ = h.db.QueryRow("SELECT title FROM products WHERE id = ?", targetPid).Scan(&productTitle)
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Your trade offer was countered: "+productTitle)
			_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, NULL, 'countered', ?)", tradeID, userID, payload.Message)
		}
	case "complete":
		log.Printf("=== TRADE COMPLETION REQUEST ===")
		log.Printf("User %d attempting to complete trade %d", userID, tradeID)
		// Mark party completion; finalize when both complete
		column := "buyer_completed"
		if userID == sellerID {
			column = "seller_completed"
		}
		log.Printf("Setting %s=TRUE for trade %d", column, tradeID)
		_, err = h.db.Exec("UPDATE trades SET "+column+"=TRUE, updated_at=CURRENT_TIMESTAMP WHERE id = ?", tradeID)
		if err == nil {
			log.Printf("Updated %s=TRUE for trade %d", column, tradeID)
			// Check both flags
			var bc, sc bool
			_ = h.db.QueryRow("SELECT buyer_completed, seller_completed FROM trades WHERE id = ?", tradeID).Scan(&bc, &sc)
			log.Printf("Trade %d completion status: buyer_completed=%t, seller_completed=%t", tradeID, bc, sc)
			if bc && sc {
				log.Printf("Both parties completed trade %d, starting completion process", tradeID)
				// Complete the trade with transaction safety
				err = h.completeTradeTransaction(tradeID)
				if err != nil {
					log.Printf("Failed to complete product trade: %v", err)
					return c.Status(500).JSON(models.APIResponse{
						Success: false,
						Error:   "Failed to complete trade",
					})
				}
				log.Printf("Trade %d completion process finished successfully", tradeID)
				
				publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "completed"}})
				publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "completed"}})
				_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, 'active', 'completed', ?)", tradeID, userID, payload.Message)
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Trade completed")
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", sellerID, "Trade completed")
			} else {
				publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "awaiting_other_party"}})
				publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "awaiting_other_party"}})
				_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, 'active', 'awaiting_other_party', ?)", tradeID, userID, payload.Message)
			}
		}
	case "cancel":
		// Allow cancel when active but not completed
		_, err = h.db.Exec("UPDATE trades SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id = ?", tradeID)
		if err == nil {
			publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "cancelled"}})
			publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "cancelled"}})
			_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, NULL, 'cancelled', ?)", tradeID, userID, payload.Message)
		}
	default:
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid action"})
	}

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update trade"})
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Trade updated"})
}

// completeTradeTransaction safely completes a trade and marks all products as sold
func (h *TradeHandler) completeTradeTransaction(tradeID int) error {
	log.Printf("Starting trade completion for trade ID: %d", tradeID)
	
	tx, err := h.db.Begin()
	if err != nil {
		log.Printf("Failed to start transaction for trade %d: %v", tradeID, err)
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	// Lock the trade row to prevent concurrent completions
	var currentStatus string
	var targetProductID int
	var buyerCompleted, sellerCompleted bool

	err = tx.QueryRow(`
		SELECT status, target_product_id, buyer_completed, seller_completed
		FROM trades 
		WHERE id = ? 
		FOR UPDATE`, tradeID).Scan(&currentStatus, &targetProductID, &buyerCompleted, &sellerCompleted)
	
	if err != nil {
		log.Printf("Trade %d not found: %v", tradeID, err)
		return fmt.Errorf("trade not found: %w", err)
	}

	log.Printf("Trade %d status: %s, buyer_completed: %t, seller_completed: %t", tradeID, currentStatus, buyerCompleted, sellerCompleted)

	// Verify both parties have completed
	if !buyerCompleted || !sellerCompleted {
		log.Printf("Trade %d: Both parties must complete - buyer: %t, seller: %t", tradeID, buyerCompleted, sellerCompleted)
		return fmt.Errorf("both parties must complete the trade before finalizing")
	}

	// Get all offered products in this trade
	rows, err := tx.Query(`
		SELECT product_id 
		FROM trade_items 
		WHERE trade_id = ?`, tradeID)
	
	if err != nil {
		log.Printf("Failed to get trade items for trade %d: %v", tradeID, err)
		return fmt.Errorf("failed to get trade items: %w", err)
	}
	defer rows.Close()

	var offeredProductIDs []int
	for rows.Next() {
		var productID int
		if err := rows.Scan(&productID); err != nil {
			log.Printf("Failed to scan product ID for trade %d: %v", tradeID, err)
			return fmt.Errorf("failed to scan product ID: %w", err)
		}
		offeredProductIDs = append(offeredProductIDs, productID)
	}

	log.Printf("Trade %d: Target product: %d, Offered products: %v", tradeID, targetProductID, offeredProductIDs)

	// Mark target product as sold with locking
	err = h.markProductUnavailable(tx, targetProductID)
	if err != nil {
		log.Printf("Failed to mark target product %d as sold: %v", targetProductID, err)
		return fmt.Errorf("failed to mark target product as sold: %w", err)
	}

	// Mark all offered products as sold
	for _, productID := range offeredProductIDs {
		err = h.markProductUnavailable(tx, productID)
		if err != nil {
			log.Printf("Failed to mark offered product %d as sold: %v", productID, err)
			return fmt.Errorf("failed to mark offered product %d as sold: %w", productID, err)
		}
	}

	// Update trade status to completed (but don't require status = 'active' since it might already be completed)
	result, err := tx.Exec(`
		UPDATE trades 
		SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
		WHERE id = ?`, tradeID)
	
	if err != nil {
		log.Printf("Failed to update trade %d status: %v", tradeID, err)
		return fmt.Errorf("failed to update trade status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Printf("Failed to check trade update result for trade %d: %v", tradeID, err)
		return fmt.Errorf("failed to check trade update result: %w", err)
	}

	if rowsAffected == 0 {
		log.Printf("Trade %d was already completed by another process", tradeID)
		return fmt.Errorf("trade was already completed by another process")
	}

	log.Printf("Successfully completed trade %d and marked products as sold", tradeID)
	return tx.Commit()
}

// markProductUnavailable marks a product as sold with row locking
func (h *TradeHandler) markProductUnavailable(tx *sql.Tx, productID int) error {
	log.Printf("Attempting to mark product %d as sold", productID)
	
	// Lock and verify product
	var currentStatus string
	
	err := tx.QueryRow(`
		SELECT status 
		FROM products 
		WHERE id = ? 
		FOR UPDATE`, productID).Scan(&currentStatus)
	
	if err != nil {
		log.Printf("Product %d not found: %v", productID, err)
		return fmt.Errorf("product %d not found: %w", productID, err)
	}

	log.Printf("Product %d current status: %s", productID, currentStatus)

	// Only update if product is available
	if currentStatus != "available" {
		log.Printf("Warning: Product %d is already sold/unavailable (status: %s), skipping", productID, currentStatus)
		return nil // Don't fail the entire trade if one product is already sold
	}

	// Update product status to sold
	result, err := tx.Exec(`
		UPDATE products 
		SET status = 'sold', updated_at = CURRENT_TIMESTAMP 
		WHERE id = ? AND status = 'available'`,
		productID)
	
	if err != nil {
		log.Printf("Failed to update product %d status: %v", productID, err)
		return fmt.Errorf("failed to update product %d status: %w", productID, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Printf("Failed to check update result for product %d: %v", productID, err)
		return fmt.Errorf("failed to check update result for product %d: %w", productID, err)
	}

	if rowsAffected == 0 {
		log.Printf("Product %d was not updated - may have been modified by another transaction", productID)
		return fmt.Errorf("product %d was modified by another transaction", productID)
	}

	log.Printf("Successfully marked product %d as sold", productID)
	return nil
}

// GetTradeMessages returns messages for a trade
func (h *TradeHandler) GetTradeMessages(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	tradeID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid trade id"})
	}
	// authorize
	var buyerID, sellerID int
	err = h.db.QueryRow("SELECT buyer_id, seller_id FROM trades WHERE id = ?", tradeID).Scan(&buyerID, &sellerID)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Trade not found"})
	}
	if userID != buyerID && userID != sellerID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not authorized for this trade"})
	}
	rows, err := h.db.Query("SELECT id, trade_id, sender_id, content, created_at FROM trade_messages WHERE trade_id = ? ORDER BY created_at ASC", tradeID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch messages"})
	}
	defer rows.Close()
	type msg struct {
		ID        int       `json:"id"`
		TradeID   int       `json:"trade_id"`
		SenderID  int       `json:"sender_id"`
		Content   string    `json:"content"`
		CreatedAt time.Time `json:"created_at"`
	}
	list := []msg{}
	for rows.Next() {
		var m msg
		if err := rows.Scan(&m.ID, &m.TradeID, &m.SenderID, &m.Content, &m.CreatedAt); err == nil {
			list = append(list, m)
		}
	}
	return c.JSON(models.APIResponse{Success: true, Data: list})
}

// GetTrade returns a single trade with detailed items
func (h *TradeHandler) GetTrade(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	tradeID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid trade id"})
	}
	var tr models.Trade
	err = h.db.QueryRow(`
        SELECT 
          t.id, t.buyer_id, t.seller_id, t.target_product_id, t.status, t.message, t.offered_cash_amount, t.created_at, t.updated_at,
          t.buyer_completed, t.seller_completed, t.completed_at,
          ub.name AS buyer_name, us.name AS seller_name, p.title AS product_title
        FROM trades t
        JOIN users ub ON ub.id = t.buyer_id
        JOIN users us ON us.id = t.seller_id
        JOIN products p ON p.id = t.target_product_id
        WHERE t.id = ?
    `, tradeID).Scan(&tr.ID, &tr.BuyerID, &tr.SellerID, &tr.TargetProductID, &tr.Status, &tr.Message, &tr.OfferedCash, &tr.CreatedAt, &tr.UpdatedAt, &tr.BuyerCompleted, &tr.SellerCompleted, &tr.CompletedAt, &tr.BuyerName, &tr.SellerName, &tr.ProductTitle)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Trade not found"})
	}
	if userID != tr.BuyerID && userID != tr.SellerID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not authorized for this trade"})
	}
	itemRows, qerr := h.db.Query(`
        SELECT ti.id, ti.trade_id, ti.product_id, ti.offered_by, ti.created_at,
               p.title, p.status, p.image_url
        FROM trade_items ti
        LEFT JOIN products p ON p.id = ti.product_id
        WHERE ti.trade_id = ?
    `, tr.ID)
	items := []models.TradeItem{}
	if qerr != nil {
		log.Printf("trade %d: joined items query error: %v", tr.ID, qerr)
	} else if itemRows != nil {
		for itemRows.Next() {
			var it models.TradeItem
			var offeredBy sql.NullString
			var title, pstatus, pimg sql.NullString
			if err := itemRows.Scan(&it.ID, &it.TradeID, &it.ProductID, &offeredBy, &it.CreatedAt, &title, &pstatus, &pimg); err == nil {
				if offeredBy.Valid {
					it.OfferedBy = offeredBy.String
				} else {
					it.OfferedBy = ""
				}
				if title.Valid {
					it.ProductTitle = title.String
				}
				if pstatus.Valid {
					it.ProductStatus = pstatus.String
				}
				if pimg.Valid {
					it.ProductImageURL = pimg.String
				}
				items = append(items, it)
			} else {
				log.Printf("trade %d: item row scan error: %v", tr.ID, err)
			}
		}
		itemRows.Close()
	}

	// Fallback like above
	if len(items) == 0 {
		rows2, err2 := h.db.Query("SELECT id, trade_id, product_id, offered_by, created_at FROM trade_items WHERE trade_id = ?", tr.ID)
		if err2 != nil {
			log.Printf("trade %d: fallback items query error: %v", tr.ID, err2)
		} else {
			for rows2.Next() {
				var it models.TradeItem
				var offeredBy sql.NullString
				if err := rows2.Scan(&it.ID, &it.TradeID, &it.ProductID, &offeredBy, &it.CreatedAt); err == nil {
					if offeredBy.Valid {
						it.OfferedBy = offeredBy.String
					}
					var title, pstatus, pimg sql.NullString
					_ = h.db.QueryRow("SELECT title, status, image_url FROM products WHERE id = ?", it.ProductID).Scan(&title, &pstatus, &pimg)
					if title.Valid {
						it.ProductTitle = title.String
					}
					if pstatus.Valid {
						it.ProductStatus = pstatus.String
					}
					if pimg.Valid {
						it.ProductImageURL = pimg.String
					}
					items = append(items, it)
				} else {
					log.Printf("trade %d: fallback item scan error: %v", tr.ID, err)
				}
			}
			rows2.Close()
		}
	}

	tr.Items = items
	return c.JSON(models.APIResponse{Success: true, Data: tr})
}

// GetTradeHistory returns the history of events for a trade
func (h *TradeHandler) GetTradeHistory(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	tradeID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid trade id"})
	}
	var buyerID, sellerID int
	if err := h.db.QueryRow("SELECT buyer_id, seller_id FROM trades WHERE id = ?", tradeID).Scan(&buyerID, &sellerID); err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Trade not found"})
	}
	if userID != buyerID && userID != sellerID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not authorized for this trade"})
	}
	rows, err := h.db.Query("SELECT id, trade_id, actor_id, from_status, to_status, note, created_at FROM trade_events WHERE trade_id = ? ORDER BY created_at ASC", tradeID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch history"})
	}
	defer rows.Close()
	type ev struct {
		ID         int       `json:"id"`
		TradeID    int       `json:"trade_id"`
		ActorID    *int      `json:"actor_id,omitempty"`
		FromStatus *string   `json:"from_status,omitempty"`
		ToStatus   *string   `json:"to_status,omitempty"`
		Note       *string   `json:"note,omitempty"`
		CreatedAt  time.Time `json:"created_at"`
	}
	list := []ev{}
	for rows.Next() {
		var e ev
		var actorID sql.NullInt64
		var fromSt, toSt, note sql.NullString
		if err := rows.Scan(&e.ID, &e.TradeID, &actorID, &fromSt, &toSt, &note, &e.CreatedAt); err == nil {
			if actorID.Valid {
				v := int(actorID.Int64)
				e.ActorID = &v
			}
			if fromSt.Valid {
				v := fromSt.String
				e.FromStatus = &v
			}
			if toSt.Valid {
				v := toSt.String
				e.ToStatus = &v
			}
			if note.Valid {
				v := note.String
				e.Note = &v
			}
			list = append(list, e)
		}
	}
	return c.JSON(models.APIResponse{Success: true, Data: list})
}

// SendTradeMessage posts a new message for a trade and notifies participants
func (h *TradeHandler) SendTradeMessage(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	tradeID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid trade id"})
	}
	var payload struct {
		Content string `json:"content"`
	}
	if err := c.BodyParser(&payload); err != nil || payload.Content == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid content"})
	}
	// authorize
	var buyerID, sellerID int
	err = h.db.QueryRow("SELECT buyer_id, seller_id FROM trades WHERE id = ?", tradeID).Scan(&buyerID, &sellerID)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Trade not found"})
	}
	if userID != buyerID && userID != sellerID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not authorized for this trade"})
	}
	// insert message
	res, err := h.db.Exec("INSERT INTO trade_messages (trade_id, sender_id, content) VALUES (?, ?, ?)", tradeID, userID, payload.Content)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to save message"})
	}
	id64, _ := res.LastInsertId()
	var createdAt time.Time
	_ = h.db.QueryRow("SELECT created_at FROM trade_messages WHERE id = ?", id64).Scan(&createdAt)
	// notify both
	evt := sseEvent{Type: "trade_message", Data: fiber.Map{
		"id":         int(id64),
		"trade_id":   tradeID,
		"sender_id":  userID,
		"content":    payload.Content,
		"created_at": createdAt,
	}}
	publishToUser(buyerID, evt)
	publishToUser(sellerID, evt)
	return c.Status(201).JSON(models.APIResponse{Success: true})
}

// CountTrades returns count of trades for current user by direction and status
func (h *TradeHandler) CountTrades(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	direction := c.Query("direction", "incoming")
	status := c.Query("status", "pending")
	where := "WHERE t.seller_id = ?"
	args := []interface{}{userID}
	if direction == "outgoing" {
		where = "WHERE t.buyer_id = ?"
	}
	if status != "" {
		where += " AND t.status = ?"
		args = append(args, status)
	}
	var count int
	_ = h.db.QueryRow("SELECT COUNT(*) FROM trades t "+where, args...).Scan(&count)
	return c.JSON(models.APIResponse{Success: true, Data: fiber.Map{"count": count}})
}

// CompleteTrade handles trade completion with rating and feedback
func (h *TradeHandler) CompleteTrade(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	
	tradeID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid trade id"})
	}

	var payload struct {
		Rating   int    `json:"rating"`
		Feedback string `json:"feedback"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	// Validate rating
	if payload.Rating < 1 || payload.Rating > 5 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Rating must be between 1 and 5"})
	}

	// Fetch trade and verify authorization
	var buyerID, sellerID int
	err = h.db.QueryRow("SELECT buyer_id, seller_id FROM trades WHERE id = ?", tradeID).Scan(&buyerID, &sellerID)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Trade not found"})
	}
	if userID != buyerID && userID != sellerID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not authorized for this trade"})
	}

	// Determine which columns to update based on user role
	var ratingColumn, feedbackColumn, completedColumn string
	if userID == buyerID {
		ratingColumn = "buyer_rating"
		feedbackColumn = "buyer_feedback"
		completedColumn = "buyer_completed"
	} else {
		ratingColumn = "seller_rating"
		feedbackColumn = "seller_feedback"
		completedColumn = "seller_completed"
	}

	// Update the trade with rating, feedback, and completion status
	_, err = h.db.Exec(
		"UPDATE trades SET "+ratingColumn+"=?, "+feedbackColumn+"=?, "+completedColumn+"=TRUE, updated_at=CURRENT_TIMESTAMP WHERE id = ?",
		payload.Rating, payload.Feedback, tradeID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update trade completion"})
	}

	// Check if both parties have completed
	var buyerCompleted, sellerCompleted bool
	err = h.db.QueryRow("SELECT buyer_completed, seller_completed FROM trades WHERE id = ?", tradeID).Scan(&buyerCompleted, &sellerCompleted)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to check completion status"})
	}

	// If both completed, finalize the trade
	if buyerCompleted && sellerCompleted {
		err = h.completeTradeTransaction(tradeID)
		if err != nil {
			log.Printf("Failed to complete trade transaction: %v", err)
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to finalize trade"})
		}

		// Notify both parties
		publishToUser(buyerID, sseEvent{Type: "trade_completed", Data: fiber.Map{"trade_id": tradeID}})
		publishToUser(sellerID, sseEvent{Type: "trade_completed", Data: fiber.Map{"trade_id": tradeID}})
		
		// Add notifications
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Trade completed successfully!")
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", sellerID, "Trade completed successfully!")
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Trade completion submitted successfully"})
}

// GetTradeCompletionStatus returns the completion status of a trade
func (h *TradeHandler) GetTradeCompletionStatus(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	
	tradeID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid trade id"})
	}

	// Fetch trade completion details
	var buyerID, sellerID int
	var buyerCompleted, sellerCompleted bool
	var buyerRating, sellerRating sql.NullInt64
	var buyerFeedback, sellerFeedback sql.NullString
	
	err = h.db.QueryRow(`
		SELECT buyer_id, seller_id, buyer_completed, seller_completed, 
		       buyer_rating, seller_rating, buyer_feedback, seller_feedback
		FROM trades WHERE id = ?`, tradeID).Scan(
		&buyerID, &sellerID, &buyerCompleted, &sellerCompleted,
		&buyerRating, &sellerRating, &buyerFeedback, &sellerFeedback)
	
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Trade not found"})
	}
	
	// Verify authorization
	if userID != buyerID && userID != sellerID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not authorized for this trade"})
	}

	// Prepare response data
	status := fiber.Map{
		"buyer_completed":  buyerCompleted,
		"seller_completed": sellerCompleted,
	}

	if buyerRating.Valid {
		status["buyer_rating"] = int(buyerRating.Int64)
	}
	if sellerRating.Valid {
		status["seller_rating"] = int(sellerRating.Int64)
	}
	if buyerFeedback.Valid {
		status["buyer_feedback"] = buyerFeedback.String
	}
	if sellerFeedback.Valid {
		status["seller_feedback"] = sellerFeedback.String
	}

	return c.JSON(models.APIResponse{Success: true, Data: status})
}
