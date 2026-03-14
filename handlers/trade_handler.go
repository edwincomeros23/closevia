package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
	"github.com/xashathebest/clovia/services"
)

type TradeHandler struct {
	db *sql.DB
}

// extractFirstImage returns the first element from a JSON/text array string of image URLs.
// Falls back to empty string on parse errors.
func extractFirstImage(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	// Try JSON array first
	var arr []string
	if err := json.Unmarshal([]byte(raw), &arr); err == nil && len(arr) > 0 && strings.TrimSpace(arr[0]) != "" {
		return arr[0]
	}
	// Fallback: comma-separated
	parts := strings.Split(raw, ",")
	if len(parts) > 0 {
		return strings.TrimSpace(parts[0])
	}
	return ""
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
		log.Printf("BodyParser error: %v", err)
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	log.Printf("Received trade payload: %+v", payload)
	if payload.TargetProductID <= 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid target product ID"})
	}
	hasItems := len(payload.OfferedProductIDs) > 0
	hasCash := payload.OfferedCashAmount != nil && *payload.OfferedCashAmount > 0
	if !hasItems && !hasCash {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "You must offer at least one item or a cash amount"})
	}

	// Validate delivery address is provided when trade option is delivery
	if payload.TradeOption == "delivery" && strings.TrimSpace(payload.DeliveryAddress) == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Delivery address is required when choosing delivery option"})
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

	// Check if user already has a pending trade request for this product
	// Layer 3 Backend Validation: Only check for pending status (not accepted/counter)
	// to prevent duplicate offers on the same product
	var existingTradeID int
	err = h.db.QueryRow(`
		SELECT id FROM trades 
		WHERE buyer_id = ? AND target_product_id = ? AND status = 'pending'
		LIMIT 1
	`, userID, payload.TargetProductID).Scan(&existingTradeID)

	// If no error (meaning a row was found), user already has a pending trade request
	if err == nil {
		return c.Status(409).JSON(models.APIResponse{Success: false, Error: "You already have a pending offer on this product"})
	}
	// Any error other than sql.ErrNoRows is a real error
	if err != sql.ErrNoRows {
		log.Printf("Error checking existing trades: %v", err)
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to check existing trades"})
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

	// Insert trade - start with minimal required fields
	log.Printf("Creating trade with minimal fields first")
	res, err := tx.Exec(`INSERT INTO trades (buyer_id, seller_id, target_product_id, status) VALUES (?, ?, ?, 'pending')`,
		userID, sellerID, payload.TargetProductID)

	if err != nil {
		log.Printf("Basic trade insert failed: %v", err)
		_ = tx.Rollback()
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: fmt.Sprintf("Failed to create basic trade: %v", err)})
	}

	// Get the trade ID
	tradeID64, _ := res.LastInsertId()
	tradeID := int(tradeID64)
	log.Printf("Basic trade created with ID: %d", tradeID)

	// Now update with the additional fields
	log.Printf("Updating trade with additional fields")
	updateQuery := `UPDATE trades SET trade_option = ?, delivery_address = ?, message = ?, offered_cash_amount = ?, payment_method = ? WHERE id = ?`
	_, err = tx.Exec(updateQuery, payload.TradeOption, payload.DeliveryAddress, payload.Message, payload.OfferedCashAmount, payload.PaymentMethod, tradeID)

	if err != nil {
		log.Printf("Trade update failed: %v", err)
		_ = tx.Rollback()
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: fmt.Sprintf("Failed to update trade: %v", err)})
	}

	log.Printf("Trade fully created and updated successfully")
	tradeID64, _ = res.LastInsertId()
	tradeID = int(tradeID64)

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

	// After creating a trade, check for loops
	go h.CheckForTradeLoops()

	return c.Status(201).JSON(models.APIResponse{Success: true, Message: "Trade created", Data: trade})
}

// CheckForTradeLoops builds the trade graph and notifies users if loops are found.
func (h *TradeHandler) CheckForTradeLoops() {
	log.Println("Checking for trade loops...")
	tradeGraph, err := services.NewTradeGraph(h.db)
	if err != nil {
		log.Printf("Error creating trade graph: %v", err)
		return
	}

	loops := tradeGraph.FindTradeLoops()
	if len(loops) > 0 {
		log.Printf("Found %d trade loops.", len(loops))
		for _, loop := range loops {
			// Notify all users in the loop
			for _, edge := range loop {
				notifMsg := "Loop Trade Found! A potential multi-way trade is available."
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_loop', ?, FALSE)", edge.FromUser, notifMsg)
				publishNotification(edge.FromUser, notifMsg)
			}
		}
	} else {
		log.Println("No trade loops found.")
	}
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

	// Build query dynamically to handle missing columns
	query := `
        SELECT
          t.id, t.buyer_id, t.seller_id, t.target_product_id, t.status, t.message, t.offered_cash_amount, t.created_at, t.updated_at,
          t.buyer_completed, t.seller_completed, t.completed_at`

	// Check if trade_option column exists
	testRow := h.db.QueryRow("SELECT trade_option FROM trades LIMIT 1")
	var testTradeOption sql.NullString
	if err := testRow.Scan(&testTradeOption); err == nil {
		// Column exists, include it in query
		query += `, COALESCE(t.trade_option, '') as trade_option, COALESCE(t.delivery_address, '') as delivery_address`
	} else {
		// Column doesn't exist, use empty defaults
		query += `, '' as trade_option, '' as delivery_address`
	}

	// Check if delivery state columns exist
	deliveryStateQuery := `
		SELECT
			COALESCE(t.delivery_type, '') as delivery_type,
			COALESCE(t.payment_method, '') as payment_method,
			COALESCE(t.payment_confirmed, FALSE) as payment_confirmed,
			t.proof_of_delivery,
			COALESCE(t.buyer_confirmed_receipt, FALSE) as buyer_confirmed_receipt,
			COALESCE(t.seller_confirmed_delivery, FALSE) as seller_confirmed_delivery
		FROM trades t LIMIT 1`
	testDeliveryRow := h.db.QueryRow(deliveryStateQuery)
	var testDeliveryType, testPaymentMethod string
	var testPaymentConfirmed, testBuyerConfirmed, testSellerConfirmed bool
	var testProofOfDelivery sql.NullString
	if err := testDeliveryRow.Scan(&testDeliveryType, &testPaymentMethod, &testPaymentConfirmed, &testProofOfDelivery, &testBuyerConfirmed, &testSellerConfirmed); err == nil {
		// Delivery state columns exist, include them in query
		query += `,
			COALESCE(t.delivery_type, '') as delivery_type,
			COALESCE(t.payment_method, '') as payment_method,
			COALESCE(t.payment_confirmed, FALSE) as payment_confirmed,
			t.proof_of_delivery,
			COALESCE(t.buyer_confirmed_receipt, FALSE) as buyer_confirmed_receipt,
			COALESCE(t.seller_confirmed_delivery, FALSE) as seller_confirmed_delivery`
	} else {
		// Delivery state columns don't exist, use empty defaults
		log.Printf("Delivery state columns not found in trades table, using defaults")
		query += `,
			'' as delivery_type,
			'' as payment_method,
			FALSE as payment_confirmed,
			NULL as proof_of_delivery,
			FALSE as buyer_confirmed_receipt,
			FALSE as seller_confirmed_delivery`
	}

	query += `,
          COALESCE(t.meetup_location, '') as meetup_location, t.buyer_meetup_confirmed, t.seller_meetup_confirmed,
          ub.name AS buyer_name, us.name AS seller_name, p.title AS product_title,
          p.image_url AS product_image_url, p.image_urls AS product_image_urls
        FROM trades t
        JOIN users ub ON ub.id = t.buyer_id
        JOIN users us ON us.id = t.seller_id
        JOIN products p ON p.id = t.target_product_id
        ` + where + `
        ORDER BY t.created_at DESC`

	rows, err := h.db.Query(query, args...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch trades"})
	}
	defer rows.Close()

	tradePtrs := []*models.Trade{}
	tradeMap := make(map[int]*models.Trade)

	for rows.Next() {
		var tr models.Trade
		var deliveryType, paymentMethod string
		var paymentConfirmed, buyerConfirmedReceipt, sellerConfirmedDelivery bool
		var proofOfDelivery sql.NullString
		var pimg, pimgs sql.NullString
		var offeredCashNull sql.NullFloat64

		if err := rows.Scan(&tr.ID, &tr.BuyerID, &tr.SellerID, &tr.TargetProductID, &tr.Status, &tr.Message, &offeredCashNull, &tr.CreatedAt, &tr.UpdatedAt, &tr.BuyerCompleted, &tr.SellerCompleted, &tr.CompletedAt, &tr.TradeOption, &tr.DeliveryAddress, &deliveryType, &paymentMethod, &paymentConfirmed, &proofOfDelivery, &buyerConfirmedReceipt, &sellerConfirmedDelivery, &tr.MeetupLocation, &tr.BuyerMeetupConfirmed, &tr.SellerMeetupConfirmed, &tr.BuyerName, &tr.SellerName, &tr.ProductTitle, &pimg, &pimgs); err == nil {
			// Set offered cash if valid
			if offeredCashNull.Valid {
				val := offeredCashNull.Float64
				tr.OfferedCash = &val
			}

			// Set delivery state fields
			tr.DeliveryType = deliveryType
			tr.PaymentMethod = paymentMethod
			tr.PaymentConfirmed = paymentConfirmed
			if proofOfDelivery.Valid {
				tr.ProofOfDelivery = proofOfDelivery.String
			}
			tr.BuyerConfirmedReceipt = buyerConfirmedReceipt
			tr.SellerConfirmedDelivery = sellerConfirmedDelivery

			// Prefer image_url; fall back to first of image_urls JSON array
			if pimg.Valid && pimg.String != "" {
				tr.ProductImageURL = pimg.String
			} else if pimgs.Valid && pimgs.String != "" {
				if first := extractFirstImage(pimgs.String); first != "" {
					tr.ProductImageURL = first
				}
			}

			tr.Items = []models.TradeItem{}
			trCopy := tr
			tradePtrs = append(tradePtrs, &trCopy)
			tradeMap[tr.ID] = &trCopy
		} else {
			log.Printf("trade row scan error: %v", err)
		}
	}

	// Batch-load trade items to avoid N+1 queries when many trades exist
	if len(tradePtrs) > 0 {
		placeholders := strings.Repeat("?,", len(tradePtrs))
		placeholders = strings.TrimSuffix(placeholders, ",")
		args := make([]interface{}, len(tradePtrs))
		for i, tr := range tradePtrs {
			args[i] = tr.ID
		}

		itemQuery := fmt.Sprintf(`
            SELECT ti.id, ti.trade_id, ti.product_id, ti.offered_by, ti.created_at,
                   p.title, p.status, p.image_url, p.image_urls
            FROM trade_items ti
            LEFT JOIN products p ON p.id = ti.product_id
            WHERE ti.trade_id IN (%s)
            ORDER BY ti.trade_id, ti.id
        `, placeholders)

		itemRows, err := h.db.Query(itemQuery, args...)
		if err != nil {
			log.Printf("batch trade items query error: %v", err)
		} else {
			defer itemRows.Close()
			for itemRows.Next() {
				var it models.TradeItem
				var offeredBy sql.NullString
				var title, pstatus, pimg sql.NullString
				var pimgs sql.NullString

				if err := itemRows.Scan(&it.ID, &it.TradeID, &it.ProductID, &offeredBy, &it.CreatedAt, &title, &pstatus, &pimg, &pimgs); err != nil {
					log.Printf("batch trade item scan error: %v", err)
					continue
				}

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
				// Prefer image_url; fall back to first of image_urls JSON array
				if pimg.Valid && pimg.String != "" {
					it.ProductImageURL = pimg.String
				} else if pimgs.Valid && pimgs.String != "" {
					if first := extractFirstImage(pimgs.String); first != "" {
						it.ProductImageURL = first
					}
				}

				if tr := tradeMap[it.TradeID]; tr != nil {
					tr.Items = append(tr.Items, it)
				}
			}
		}
	}

	// Convert back to value slice for response
	trades := make([]models.Trade, 0, len(tradePtrs))
	for _, tr := range tradePtrs {
		trades = append(trades, *tr)
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

	// Fetch trade details including current status
	var buyerID, sellerID int
	var currentStatus string
	err = h.db.QueryRow("SELECT buyer_id, seller_id, status FROM trades WHERE id = ?", tradeID).Scan(&buyerID, &sellerID, &currentStatus)
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
		tx, err := h.db.Begin()
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to start transaction"})
		}

		// Get trade option to determine next status
		var tradeOption string
		err = tx.QueryRow("SELECT COALESCE(trade_option, 'meetup') FROM trades WHERE id = ?", tradeID).Scan(&tradeOption)
		if err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to get trade option"})
		}

		// For delivery trades, go directly to active status
		// For meetup trades, stay pending until meetup is confirmed
		var newStatus string
		if tradeOption == "delivery" {
			newStatus = "active"
		} else {
			newStatus = "accepted"
		}

		// Update trade status
		_, err = tx.Exec("UPDATE trades SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?", newStatus, tradeID)
		if err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to accept trade"})
		}

		// Soft-lock all products in the trade
		if err := h.setProductStatusForTrade(tx, tradeID, "locked"); err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to lock products for trade"})
		}

		if err := tx.Commit(); err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to commit trade acceptance"})
		}

		// Post-transaction notifications and events
		var pid int
		_ = h.db.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tradeID).Scan(&pid)
		var productTitle string
		_ = h.db.QueryRow("SELECT title FROM products WHERE id = ?", pid).Scan(&productTitle)
		convID, _ := ensureConversation(pid, buyerID, sellerID)
		_, _, _ = saveMessage(convID, userID, "Trade accepted for "+productTitle+".")
		_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, ?, 'accepted', ?)", tradeID, userID, currentStatus, payload.Message)
		publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "accepted"}})
		publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "accepted"}})
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Your trade offer was accepted: "+productTitle)
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", sellerID, "You accepted a trade offer: "+productTitle)

		// Auto-create delivery record for delivery trades
		if tradeOption == "delivery" {
			go h.createDeliveryForTrade(tradeID, buyerID, sellerID)
		}
	case "decline":
		tx, err := h.db.Begin()
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to start transaction"})
		}

		// Unlock products
		if err := h.setProductStatusForTrade(tx, tradeID, "available"); err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to unlock products"})
		}

		// Update trade status
		_, err = tx.Exec("UPDATE trades SET status='declined', updated_at=CURRENT_TIMESTAMP WHERE id = ?", tradeID)
		if err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to decline trade"})
		}

		if err := tx.Commit(); err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to commit trade decline"})
		}

		var pid int
		_ = h.db.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tradeID).Scan(&pid)
		var productTitle string
		_ = h.db.QueryRow("SELECT title FROM products WHERE id = ?", pid).Scan(&productTitle)
		publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "declined"}})
		publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "declined"}})
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Your trade offer was declined: "+productTitle)
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", sellerID, "You declined a trade offer: "+productTitle)
		_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, ?, 'declined', ?)", tradeID, userID, currentStatus, payload.Message)
	case "counter":
		tx, err := h.db.Begin()
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to start transaction"})
		}

		// Unlock products from the previous state of the trade before applying the counter
		if err := h.setProductStatusForTrade(tx, tradeID, "available"); err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to unlock products for counter-offer"})
		}

		// Determine who is countering
		offeredBy := "buyer"
		if userID == sellerID {
			offeredBy = "seller"
		}

		// Replace items in the trade
		if _, err := tx.Exec("DELETE FROM trade_items WHERE trade_id = ?", tradeID); err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update trade items"})
		}
		for _, pid := range payload.CounterOfferedProductIDs {
			var ownerID int
			if err := tx.QueryRow("SELECT seller_id FROM products WHERE id = ?", pid).Scan(&ownerID); err != nil || ownerID != userID {
				_ = tx.Rollback()
				return c.Status(400).JSON(models.APIResponse{Success: false, Error: fmt.Sprintf("You do not own product %d or it does not exist.", pid)})
			}
			if _, err := tx.Exec("INSERT INTO trade_items (trade_id, product_id, offered_by) VALUES (?, ?, ?)", tradeID, pid, offeredBy); err != nil {
				_ = tx.Rollback()
				return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to add counter offer items"})
			}
		}

		// Update trade status, message, and cash amount
		if _, err := tx.Exec("UPDATE trades SET status='countered', message=?, offered_cash_amount=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?", payload.Message, payload.CounterOfferedCashAmount, tradeID); err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update trade for counter offer"})
		}

		if err := tx.Commit(); err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to commit counter offer"})
		}

		// Notifications and events after successful transaction
		publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "countered"}})
		publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "countered"}})
		var targetPid int
		_ = h.db.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tradeID).Scan(&targetPid)
		var productTitle string
		_ = h.db.QueryRow("SELECT title FROM products WHERE id = ?", targetPid).Scan(&productTitle)
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Your trade offer was countered: "+productTitle)
		_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, ?, 'countered', ?)", tradeID, userID, currentStatus, payload.Message)

	case "complete":
		log.Printf("=== TRADE COMPLETION REQUEST ===")
		log.Printf("User %d attempting to complete trade %d", userID, tradeID)
		column := "buyer_completed"
		if userID == sellerID {
			column = "seller_completed"
		}
		log.Printf("Setting %s=TRUE for trade %d", column, tradeID)
		_, err = h.db.Exec("UPDATE trades SET "+column+"=TRUE, updated_at=CURRENT_TIMESTAMP WHERE id = ?", tradeID)
		if err == nil {
			log.Printf("Updated %s=TRUE for trade %d", column, tradeID)
			var bc, sc bool
			_ = h.db.QueryRow("SELECT buyer_completed, seller_completed FROM trades WHERE id = ?", tradeID).Scan(&bc, &sc)
			log.Printf("Trade %d completion status: buyer_completed=%t, seller_completed=%t", tradeID, bc, sc)
			if bc && sc {
				log.Printf("Both parties completed trade %d, starting completion process", tradeID)
				err = h.completeTradeTransaction(tradeID)
				if err != nil {
					log.Printf("Failed to complete product trade: %v", err)
					return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to complete trade"})
				}
				log.Printf("Trade %d completion process finished successfully", tradeID)
				publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "completed"}})
				publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "completed"}})
				_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, 'active', 'completed', ?)", tradeID, userID, payload.Message)
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Trade completed")
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", sellerID, "Trade completed")
			} else {
				// First completion: set first_completion_at if not set
				_, _ = h.db.Exec("UPDATE trades SET first_completion_at = COALESCE(first_completion_at, CURRENT_TIMESTAMP) WHERE id = ?", tradeID)
				publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "awaiting_other_party"}})
				publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "awaiting_other_party"}})
				_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, 'active', 'awaiting_other_party', ?)", tradeID, userID, payload.Message)
				// Soft reminders
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "One party marked the trade completed. Please confirm within 24 hours.")
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", sellerID, "One party marked the trade completed. Please confirm within 24 hours.")
			}
		}
	case "cancel":
		tx, err := h.db.Begin()
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to start transaction"})
		}

		// Unlock products
		if err := h.setProductStatusForTrade(tx, tradeID, "available"); err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to unlock products"})
		}

		// Update trade status
		_, err = tx.Exec("UPDATE trades SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id = ?", tradeID)
		if err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to cancel trade"})
		}

		if err := tx.Commit(); err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to commit trade cancellation"})
		}

		publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "cancelled"}})
		publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "cancelled"}})
		_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, ?, 'cancelled', ?)", tradeID, userID, currentStatus, payload.Message)
	case "confirm_meetup":
		log.Printf("=== TRADE MEETUP CONFIRMATION REQUEST ===")
		log.Printf("User %d attempting to confirm meetup for trade %d", userID, tradeID)

		// Check if this is actually a meetup trade
		var tradeOption string
		err = h.db.QueryRow("SELECT COALESCE(trade_option, 'meetup') FROM trades WHERE id = ?", tradeID).Scan(&tradeOption)
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to get trade option"})
		}

		if tradeOption != "meetup" {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "This action is only available for meetup trades"})
		}

		// Validate meetup location is provided
		if payload.MeetupLocation == "" {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Meetup location is required"})
		}

		// Update meetup location and confirmation status
		var updateColumn string
		switch userID {
		case buyerID:
			updateColumn = "buyer_meetup_confirmed"
		case sellerID:
			updateColumn = "seller_meetup_confirmed"
		default:
			return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not authorized for this trade"})
		}

		// Update the trade with meetup location and confirmation
		_, err = h.db.Exec("UPDATE trades SET meetup_location=?, "+updateColumn+"=TRUE, updated_at=CURRENT_TIMESTAMP WHERE id = ?", payload.MeetupLocation, tradeID)
		if err != nil {
			log.Printf("Failed to update meetup confirmation for trade %d: %v", tradeID, err)
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to confirm meetup"})
		}

		// Create notification for the other party
		var otherUserID int
		var confirmerName string
		if userID == buyerID {
			otherUserID = sellerID
			confirmerName = "buyer"
		} else {
			otherUserID = buyerID
			confirmerName = "seller"
		}

		notifMsg := fmt.Sprintf("The %s has confirmed the meetup location: %s", confirmerName, payload.MeetupLocation)
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", otherUserID, notifMsg)

		// Check if both parties have confirmed meetup
		var buyerConfirmed, sellerConfirmed bool
		err = h.db.QueryRow("SELECT buyer_meetup_confirmed, seller_meetup_confirmed FROM trades WHERE id = ?", tradeID).Scan(&buyerConfirmed, &sellerConfirmed)
		if err == nil && buyerConfirmed && sellerConfirmed {
			// Both parties confirmed, update trade status to active
			_, err = h.db.Exec("UPDATE trades SET status='active', updated_at=CURRENT_TIMESTAMP WHERE id = ?", tradeID)
			if err == nil {
				log.Printf("Both parties confirmed meetup for trade %d, status updated to active", tradeID)
				publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "active"}})
				publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "active"}})

				// Send completion notifications
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Both parties confirmed meetup! Trade is now active.")
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", sellerID, "Both parties confirmed meetup! Trade is now active.")
			}
		} else {
			// Only one party confirmed, notify both about the confirmation
			publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "meetup_confirmed": true}})
			publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "meetup_confirmed": true}})
		}

		_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, ?, 'meetup_confirmed', ?)", tradeID, userID, currentStatus, "Meetup location confirmed: "+payload.MeetupLocation)
	case "update_delivery_state":
		// Handle delivery state updates (payment confirmation, proof of delivery, confirmations)
		log.Printf("=== DELIVERY STATE UPDATE REQUEST ===")
		log.Printf("User %d attempting to update delivery state for trade %d", userID, tradeID)

		// Delivery state columns are ensured at database init (database.go)
		log.Printf("Processing delivery state update for trade %d", tradeID)

		// Prepare update query and arguments
		updateFields := []string{}
		updateArgs := []interface{}{}

		// Check which fields to update based on payload
		type DeliveryStatePayload struct {
			Action                  string `json:"action"`
			DeliveryType            string `json:"delivery_type,omitempty"`
			PaymentMethod           string `json:"payment_method,omitempty"`
			PaymentConfirmed        *bool  `json:"payment_confirmed,omitempty"`
			ProofOfDelivery         string `json:"proof_of_delivery,omitempty"`
			BuyerConfirmedReceipt   *bool  `json:"buyer_confirmed_receipt,omitempty"`
			SellerConfirmedDelivery *bool  `json:"seller_confirmed_delivery,omitempty"`
		}

		var deliveryPayload DeliveryStatePayload
		if err := c.BodyParser(&deliveryPayload); err != nil {
			log.Printf("Failed to parse delivery state payload: %v", err)
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid delivery state payload"})
		}

		// Check if payload was parsed successfully
		if deliveryPayload.Action == "" {
			log.Printf("Delivery state payload missing action field")
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Missing action in delivery state payload"})
		}

		// Process delivery state fields
		if deliveryPayload.DeliveryType != "" {
			updateFields = append(updateFields, "delivery_type = ?")
			updateArgs = append(updateArgs, deliveryPayload.DeliveryType)
		}
		if deliveryPayload.PaymentMethod != "" {
			updateFields = append(updateFields, "payment_method = ?")
			updateArgs = append(updateArgs, deliveryPayload.PaymentMethod)
		}
		if deliveryPayload.PaymentConfirmed != nil {
			updateFields = append(updateFields, "payment_confirmed = ?")
			updateArgs = append(updateArgs, *deliveryPayload.PaymentConfirmed)
		}
		if deliveryPayload.ProofOfDelivery != "" {
			updateFields = append(updateFields, "proof_of_delivery = ?")
			updateArgs = append(updateArgs, deliveryPayload.ProofOfDelivery)
		}
		if deliveryPayload.BuyerConfirmedReceipt != nil {
			updateFields = append(updateFields, "buyer_confirmed_receipt = ?")
			updateArgs = append(updateArgs, *deliveryPayload.BuyerConfirmedReceipt)
		}
		if deliveryPayload.SellerConfirmedDelivery != nil {
			updateFields = append(updateFields, "seller_confirmed_delivery = ?")
			updateArgs = append(updateArgs, *deliveryPayload.SellerConfirmedDelivery)
		}

		if len(updateFields) == 0 {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "No fields to update"})
		}

		// Add timestamp update
		updateFields = append(updateFields, "updated_at = CURRENT_TIMESTAMP")

		// Build update query
		updateQuery := "UPDATE trades SET "
		for i, field := range updateFields {
			if i > 0 {
				updateQuery += ", "
			}
			updateQuery += field
		}
		updateQuery += " WHERE id = ?"

		// Append trade ID to args
		updateArgs = append(updateArgs, tradeID)

		log.Printf("Executing delivery state update: %s with args: %v", updateQuery, updateArgs)
		result, err := h.db.Exec(updateQuery, updateArgs...)
		if err != nil {
			log.Printf("Failed to update delivery state for trade %d: %v", tradeID, err)
			// Try to provide more specific error information
			if strings.Contains(err.Error(), "Unknown column") {
				log.Printf("Database schema issue: delivery state columns may be missing")
				return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Database schema error: delivery state columns missing"})
			}
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update delivery state"})
		}

		// Log how many rows were affected
		rowsAffected, _ := result.RowsAffected()
		log.Printf("Delivery state update successful, affected %d rows", rowsAffected)

		// Notify other party of the update
		var otherUserID int
		if userID == buyerID {
			otherUserID = sellerID
		} else {
			otherUserID = buyerID
		}

		notifMsg := "Trade delivery status has been updated"
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", otherUserID, notifMsg)
		publishToUser(otherUserID, sseEvent{Type: "trade_delivery_state_updated", Data: fiber.Map{"trade_id": tradeID}})

		log.Printf("Delivery state updated successfully for trade %d", tradeID)
	default:
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid action"})
	}

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update trade"})
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Trade updated"})
}

// completeTradeTransaction safely completes a trade and marks all products as traded
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

	// Mark target product as traded with locking
	err = h.markProductUnavailable(tx, targetProductID)
	if err != nil {
		log.Printf("Failed to mark target product %d as traded: %v", targetProductID, err)
		return fmt.Errorf("failed to mark target product as traded: %w", err)
	}

	// Mark all offered products as traded
	for _, productID := range offeredProductIDs {
		err = h.markProductUnavailable(tx, productID)
		if err != nil {
			log.Printf("Failed to mark offered product %d as traded: %v", productID, err)
			return fmt.Errorf("failed to mark offered product %d as traded: %w", productID, err)
		}
	}

	// Update trade status to completed
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

	log.Printf("Successfully completed trade %d and marked products as traded", tradeID)
	return tx.Commit()
}

// markProductUnavailable marks a product as traded with row locking
func (h *TradeHandler) markProductUnavailable(tx *sql.Tx, productID int) error {
	log.Printf("Attempting to mark product %d as traded", productID)

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
		log.Printf("Warning: Product %d is already traded/unavailable (status: %s), skipping", productID, currentStatus)
		return nil // Don't fail the entire trade if one product is already sold
	}

	// Update product status to traded
	result, err := tx.Exec(`
		UPDATE products 
		SET status = 'traded', updated_at = CURRENT_TIMESTAMP 
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

	log.Printf("Successfully marked product %d as traded", productID)
	return nil
}

// createDeliveryForTrade auto-creates a delivery record linked to a trade when a delivery trade is accepted.
// Runs as a goroutine so it does not block the trade acceptance response.
func (h *TradeHandler) createDeliveryForTrade(tradeID, buyerID, sellerID int) {
	log.Printf("Creating delivery record for trade %d", tradeID)

	// Get trade delivery info
	var deliveryAddress sql.NullString
	var deliveryType sql.NullString
	err := h.db.QueryRow(
		"SELECT delivery_address, delivery_type FROM trades WHERE id = ?", tradeID,
	).Scan(&deliveryAddress, &deliveryType)
	if err != nil {
		log.Printf("Failed to get trade delivery info for trade %d: %v", tradeID, err)
		return
	}

	// Get trade items (products being traded)
	rows, err := h.db.Query("SELECT product_id FROM trade_items WHERE trade_id = ?", tradeID)
	if err != nil {
		log.Printf("Failed to get trade items for trade %d: %v", tradeID, err)
		return
	}
	defer rows.Close()

	var productIDs []int
	for rows.Next() {
		var pid int
		if err := rows.Scan(&pid); err != nil {
			continue
		}
		productIDs = append(productIDs, pid)
	}

	// Also include the target product
	var targetProductID int
	_ = h.db.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tradeID).Scan(&targetProductID)
	productIDs = append(productIDs, targetProductID)

	// Get seller location for pickup
	var sellerLat, sellerLon sql.NullFloat64
	var sellerAddr sql.NullString
	_ = h.db.QueryRow("SELECT latitude, longitude, COALESCE(bio, '') FROM users WHERE id = ?", sellerID).Scan(&sellerLat, &sellerLon, &sellerAddr)

	// Get buyer location for delivery
	var buyerLat, buyerLon sql.NullFloat64
	_ = h.db.QueryRow("SELECT latitude, longitude FROM users WHERE id = ?", buyerID).Scan(&buyerLat, &buyerLon)

	// Determine delivery type
	delType := "standard"
	if deliveryType.Valid && deliveryType.String != "" {
		delType = deliveryType.String
	}

	// Calculate cost
	var totalCost float64
	if delType == "express" {
		totalCost = 60.0
	} else {
		totalCost = 30.0
	}

	// Determine pickup address
	pickupAddr := "Seller location"
	if sellerAddr.Valid && sellerAddr.String != "" {
		pickupAddr = sellerAddr.String
	}

	// Determine delivery address
	delAddr := "Buyer location"
	if deliveryAddress.Valid && deliveryAddress.String != "" {
		delAddr = deliveryAddress.String
	}

	// Insert delivery record
	result, err := h.db.Exec(`
		INSERT INTO deliveries (
			user_id, trade_id, delivery_type, status,
			pickup_latitude, pickup_longitude, pickup_address,
			delivery_latitude, delivery_longitude, delivery_address,
			item_count, total_cost, is_fragile
		) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
		sellerID, tradeID, delType,
		sellerLat, sellerLon, pickupAddr,
		buyerLat, buyerLon, delAddr,
		len(productIDs), totalCost,
	)
	if err != nil {
		log.Printf("Failed to create delivery for trade %d: %v", tradeID, err)
		return
	}

	deliveryID64, _ := result.LastInsertId()
	deliveryID := int(deliveryID64)
	log.Printf("Created delivery %d for trade %d", deliveryID, tradeID)

	// Insert delivery items for each product
	for _, pid := range productIDs {
		var productName string
		_ = h.db.QueryRow("SELECT title FROM products WHERE id = ?", pid).Scan(&productName)
		_, err := h.db.Exec(
			"INSERT INTO delivery_items (delivery_id, product_id, product_name, is_fragile) VALUES (?, ?, ?, FALSE)",
			deliveryID, pid, productName,
		)
		if err != nil {
			log.Printf("Warning: failed to insert delivery item for product %d: %v", pid, err)
		}
	}

	// Notify both parties
	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'delivery_update', ?, FALSE)",
		buyerID, "A delivery has been created for your trade. A rider will pick it up soon.")
	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'delivery_update', ?, FALSE)",
		sellerID, "A delivery request has been created. Please prepare items for pickup.")

	// Send SSE events
	publishToUser(buyerID, sseEvent{Type: "delivery_created", Data: fiber.Map{"trade_id": tradeID, "delivery_id": deliveryID}})
	publishToUser(sellerID, sseEvent{Type: "delivery_created", Data: fiber.Map{"trade_id": tradeID, "delivery_id": deliveryID}})

	log.Printf("Delivery %d for trade %d created successfully with %d items", deliveryID, tradeID, len(productIDs))
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
	// Build query dynamically for single trade
	query := `
        SELECT
          t.id, t.buyer_id, t.seller_id, t.target_product_id, t.status, t.message, t.offered_cash_amount, t.created_at, t.updated_at,
          t.buyer_completed, t.seller_completed, t.completed_at`

	// Check if trade_option column exists
	testRow := h.db.QueryRow("SELECT trade_option FROM trades LIMIT 1")
	var testTradeOption sql.NullString
	if err := testRow.Scan(&testTradeOption); err == nil {
		// Column exists, include it in query
		query += `, COALESCE(t.trade_option, '') as trade_option, COALESCE(t.delivery_address, '') as delivery_address`
	} else {
		// Column doesn't exist, use empty defaults
		query += `, '' as trade_option, '' as delivery_address`
	}

	query += `,
          COALESCE(t.meetup_location, '') as meetup_location, t.buyer_meetup_confirmed, t.seller_meetup_confirmed,
          ub.name AS buyer_name, us.name AS seller_name, p.title AS product_title
        FROM trades t
        JOIN users ub ON ub.id = t.buyer_id
        JOIN users us ON us.id = t.seller_id
        JOIN products p ON p.id = t.target_product_id
        WHERE t.id = ?`

	err = h.db.QueryRow(query, tradeID).Scan(&tr.ID, &tr.BuyerID, &tr.SellerID, &tr.TargetProductID, &tr.Status, &tr.Message, &tr.OfferedCash, &tr.CreatedAt, &tr.UpdatedAt, &tr.BuyerCompleted, &tr.SellerCompleted, &tr.CompletedAt, &tr.TradeOption, &tr.DeliveryAddress, &tr.MeetupLocation, &tr.BuyerMeetupConfirmed, &tr.SellerMeetupConfirmed, &tr.BuyerName, &tr.SellerName, &tr.ProductTitle)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Trade not found"})
	}
	if userID != tr.BuyerID && userID != tr.SellerID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not authorized for this trade"})
	}
	itemRows, qerr := h.db.Query(`
                SELECT ti.id, ti.trade_id, ti.product_id, ti.offered_by, ti.created_at,
                       p.title, p.status, p.image_url, p.image_urls
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
			var pimgs sql.NullString
			if err := itemRows.Scan(&it.ID, &it.TradeID, &it.ProductID, &offeredBy, &it.CreatedAt, &title, &pstatus, &pimg, &pimgs); err == nil {
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
				// Prefer image_url; fall back to first of image_urls JSON/text array
				if pimg.Valid && pimg.String != "" {
					it.ProductImageURL = pimg.String
				} else if pimgs.Valid && pimgs.String != "" {
					var first string
					first = extractFirstImage(pimgs.String)
					if first != "" {
						it.ProductImageURL = first
					}
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
					var title, pstatus, pimg, pimgs sql.NullString
					_ = h.db.QueryRow("SELECT title, status, image_url, image_urls FROM products WHERE id = ?", it.ProductID).Scan(&title, &pstatus, &pimg, &pimgs)
					if title.Valid {
						it.ProductTitle = title.String
					}
					if pstatus.Valid {
						it.ProductStatus = pstatus.String
					}
					if pimg.Valid && pimg.String != "" {
						it.ProductImageURL = pimg.String
					} else if pimgs.Valid && pimgs.String != "" {
						if first := extractFirstImage(pimgs.String); first != "" {
							it.ProductImageURL = first
						}
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

// GetUserTradeHistory returns completed trades for a specific user (public endpoint)
func (h *TradeHandler) GetUserTradeHistory(c *fiber.Ctx) error {
	identifier := c.Params("id")
	if identifier == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "User ID or handle is required"})
	}

	userHandler := NewUserHandler()
	targetUserID, err := userHandler.ResolveUserID(identifier)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "User not found"})
	}

	query := `
		SELECT
			t.id, t.buyer_id, t.seller_id, t.target_product_id, t.status,
			COALESCE(t.message, '') as message,
			t.created_at, t.completed_at,
			ub.name AS buyer_name, us.name AS seller_name,
			p.title AS product_title,
			p.image_url AS product_image_url,
			p.image_urls AS product_image_urls,
			t.buyer_rating, t.seller_rating,
			COALESCE(t.buyer_feedback, '') as buyer_feedback,
			COALESCE(t.seller_feedback, '') as seller_feedback
		FROM trades t
		JOIN users ub ON ub.id = t.buyer_id
		JOIN users us ON us.id = t.seller_id
		JOIN products p ON p.id = t.target_product_id
		WHERE (t.buyer_id = ? OR t.seller_id = ?) AND t.status = 'completed'
		ORDER BY COALESCE(t.completed_at, t.updated_at) DESC
		LIMIT 50
	`

	rows, err := h.db.Query(query, targetUserID, targetUserID)
	if err != nil {
		log.Printf("❌ GetUserTradeHistory: query error for user %d: %v", targetUserID, err)
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch trade history"})
	}
	defer rows.Close()

	type PublicTrade struct {
		ID             int         `json:"id"`
		BuyerID        int         `json:"buyer_id"`
		SellerID       int         `json:"seller_id"`
		ProductID      int         `json:"target_product_id"`
		Status         string      `json:"status"`
		Message        string      `json:"message,omitempty"`
		CreatedAt      time.Time   `json:"created_at"`
		CompletedAt    *time.Time  `json:"completed_at,omitempty"`
		BuyerName      string      `json:"buyer_name"`
		SellerName     string      `json:"seller_name"`
		ProductTitle   string      `json:"product_title"`
		ProductImage   string      `json:"product_image_url,omitempty"`
		BuyerRating    *int        `json:"buyer_rating,omitempty"`
		SellerRating   *int        `json:"seller_rating,omitempty"`
		BuyerFeedback  string      `json:"buyer_feedback,omitempty"`
		SellerFeedback string      `json:"seller_feedback,omitempty"`
		Items          []fiber.Map `json:"items"`
	}

	var trades []PublicTrade
	tradeIDs := []int{}

	for rows.Next() {
		var t PublicTrade
		var pimg, pimgs sql.NullString
		var completedAt sql.NullTime

		if err := rows.Scan(
			&t.ID, &t.BuyerID, &t.SellerID, &t.ProductID, &t.Status, &t.Message,
			&t.CreatedAt, &completedAt,
			&t.BuyerName, &t.SellerName, &t.ProductTitle,
			&pimg, &pimgs,
			&t.BuyerRating, &t.SellerRating,
			&t.BuyerFeedback, &t.SellerFeedback,
		); err != nil {
			log.Printf("⚠️ GetUserTradeHistory: scan error: %v", err)
			continue
		}

		if completedAt.Valid {
			t.CompletedAt = &completedAt.Time
		}

		// Resolve product image
		if pimg.Valid && pimg.String != "" {
			t.ProductImage = pimg.String
		} else if pimgs.Valid && pimgs.String != "" {
			t.ProductImage = extractFirstImage(pimgs.String)
		}

		t.Items = []fiber.Map{}
		trades = append(trades, t)
		tradeIDs = append(tradeIDs, t.ID)
	}

	// Batch-fetch trade items
	if len(tradeIDs) > 0 {
		placeholders := make([]string, len(tradeIDs))
		itemArgs := make([]interface{}, len(tradeIDs))
		for i, tid := range tradeIDs {
			placeholders[i] = "?"
			itemArgs[i] = tid
		}
		itemQuery := `
			SELECT ti.trade_id, ti.product_id, p.title, p.image_url, p.image_urls
			FROM trade_items ti
			JOIN products p ON p.id = ti.product_id
			WHERE ti.trade_id IN (` + strings.Join(placeholders, ",") + `)
			ORDER BY ti.trade_id, ti.id
		`
		itemRows, err := h.db.Query(itemQuery, itemArgs...)
		if err == nil {
			defer itemRows.Close()
			// Build map of trade_id -> items
			tradeItemsMap := make(map[int][]fiber.Map)
			for itemRows.Next() {
				var tradeID, productID int
				var title string
				var iimg, iimgs sql.NullString
				if err := itemRows.Scan(&tradeID, &productID, &title, &iimg, &iimgs); err == nil {
					imgURL := ""
					if iimg.Valid && iimg.String != "" {
						imgURL = iimg.String
					} else if iimgs.Valid && iimgs.String != "" {
						imgURL = extractFirstImage(iimgs.String)
					}
					tradeItemsMap[tradeID] = append(tradeItemsMap[tradeID], fiber.Map{
						"product_id":        productID,
						"product_title":     title,
						"product_image_url": imgURL,
					})
				}
			}
			for i := range trades {
				if items, ok := tradeItemsMap[trades[i].ID]; ok {
					trades[i].Items = items
				}
			}
		}
	}

	if trades == nil {
		trades = []PublicTrade{}
	}

	return c.JSON(models.APIResponse{Success: true, Data: trades})
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
	// If user is not authenticated, return a zero count instead of 401 so UI components
	// that poll this endpoint can render without failing.
	if !ok {
		return c.JSON(models.APIResponse{Success: true, Data: fiber.Map{"count": 0}})
	}

	direction := c.Query("direction", "incoming")
	status := c.Query("status", "")

	// Validate direction to avoid unexpected SQL construction
	if direction != "incoming" && direction != "outgoing" {
		// Treat unknown direction as incoming (safe default) and log for debugging
		fmt.Printf("CountTrades: invalid direction='%s' from user=%d, defaulting to 'incoming'\n", direction, userID)
		direction = "incoming"
	}

	// Validate status against a known whitelist. An empty status means no filter.
	allowedStatuses := map[string]bool{"pending": true, "active": true, "completed": true, "declined": true, "cancelled": true, "countered": true}
	if status != "" && !allowedStatuses[status] {
		fmt.Printf("CountTrades: unknown status='%s' from user=%d - ignoring status filter\n", status, userID)
		status = ""
	}

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
	// Use a prepared-like query with args to avoid injection and driver issues
	query := "SELECT COUNT(*) FROM trades t " + where
	if err := h.db.QueryRow(query, args...).Scan(&count); err != nil {
		// Log and return zero as a safe fallback to avoid 400 responses for UI polling
		fmt.Printf("CountTrades: db query error for user=%d query='%s' args=%v: %v - returning count=0\n", userID, query, args, err)
		return c.JSON(models.APIResponse{Success: true, Data: fiber.Map{"count": 0}})
	}

	return c.JSON(models.APIResponse{Success: true, Data: fiber.Map{"count": count}})
}

// CompleteTrade handles trade completion with rating, feedback, and proof
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
		ProofURL string `json:"proof_url,omitempty"`
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
	var ratingColumn, feedbackColumn, proofColumn, completedColumn string
	if userID == buyerID {
		ratingColumn = "buyer_rating"
		feedbackColumn = "buyer_feedback"
		proofColumn = "buyer_proof_url"
		completedColumn = "buyer_completed"
	} else {
		ratingColumn = "seller_rating"
		feedbackColumn = "seller_feedback"
		proofColumn = "seller_proof_url"
		completedColumn = "seller_completed"
	}

	// Update the trade with rating, feedback, proof, and completion status
	if payload.ProofURL != "" {
		_, err = h.db.Exec(
			"UPDATE trades SET "+ratingColumn+"=?, "+feedbackColumn+"=?, "+proofColumn+"=?, "+completedColumn+"=TRUE, updated_at=CURRENT_TIMESTAMP WHERE id = ?",
			payload.Rating, payload.Feedback, payload.ProofURL, tradeID)
	} else {
		_, err = h.db.Exec(
			"UPDATE trades SET "+ratingColumn+"=?, "+feedbackColumn+"=?, "+completedColumn+"=TRUE, updated_at=CURRENT_TIMESTAMP WHERE id = ?",
			payload.Rating, payload.Feedback, tradeID)
	}
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update trade completion"})
	}

	// Check if both parties have completed (with ratings and feedback)
	var buyerCompleted, sellerCompleted bool
	var buyerRating, sellerRating sql.NullInt64
	err = h.db.QueryRow("SELECT buyer_completed, seller_completed, buyer_rating, seller_rating FROM trades WHERE id = ?", tradeID).Scan(&buyerCompleted, &sellerCompleted, &buyerRating, &sellerRating)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to check completion status"})
	}

	// Both parties must complete AND provide ratings before finalizing
	if buyerCompleted && sellerCompleted && buyerRating.Valid && sellerRating.Valid {
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
	var buyerProofURL, sellerProofURL sql.NullString

	err = h.db.QueryRow(`
		SELECT buyer_id, seller_id, buyer_completed, seller_completed,
		       buyer_rating, seller_rating, buyer_feedback, seller_feedback,
		       buyer_proof_url, seller_proof_url
		FROM trades WHERE id = ?`, tradeID).Scan(
		&buyerID, &sellerID, &buyerCompleted, &sellerCompleted,
		&buyerRating, &sellerRating, &buyerFeedback, &sellerFeedback,
		&buyerProofURL, &sellerProofURL)

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
	if buyerProofURL.Valid {
		status["buyer_proof_url"] = buyerProofURL.String
	}
	if sellerProofURL.Valid {
		status["seller_proof_url"] = sellerProofURL.String
	}

	return c.JSON(models.APIResponse{Success: true, Data: status})
}

// setProductStatusForTrade updates the status of all products involved in a trade.
func (h *TradeHandler) setProductStatusForTrade(tx *sql.Tx, tradeID int, status string) error {
	// Get target product ID
	var targetProductID int
	err := tx.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tradeID).Scan(&targetProductID)
	if err != nil {
		return fmt.Errorf("failed to get target product for trade %d: %w", tradeID, err)
	}

	// Get all offered product IDs
	rows, err := tx.Query("SELECT product_id FROM trade_items WHERE trade_id = ?", tradeID)
	if err != nil {
		return fmt.Errorf("failed to get offered items for trade %d: %w", tradeID, err)
	}
	defer rows.Close()

	var productIDs []int
	productIDs = append(productIDs, targetProductID)
	for rows.Next() {
		var pid int
		if err := rows.Scan(&pid); err != nil {
			return fmt.Errorf("failed to scan offered item for trade %d: %w", tradeID, err)
		}
		productIDs = append(productIDs, pid)
	}

	// Update status for all products
	for _, pid := range productIDs {
		_, err := tx.Exec("UPDATE products SET status = ? WHERE id = ?", status, pid)
		if err != nil {
			return fmt.Errorf("failed to update status for product %d: %w", pid, err)
		}
	}

	return nil
}

// GetTradeLoops returns all possible multi-way trading loops the authenticated user is involved in
func (h *TradeHandler) GetTradeLoops(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	// 1. Check if user is premium
	var isPremium bool
	err := h.db.QueryRow("SELECT is_premium FROM users WHERE id = ?", userID).Scan(&isPremium)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to verify premium status"})
	}

	if !isPremium {
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "Multi-way trading loops is a premium feature",
		})
	}

	// 2. Fetch all active trade loops using the service
	graph, err := services.NewTradeGraph(h.db)
	if err != nil {
		log.Printf("Error fetching trades for graph: %v", err)
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load trade graph"})
	}

	// 3. Find loops
	allLoops := graph.FindTradeLoops()

	// 4. Transform loops and filter to only those involving the current user
	userLoops := []map[string]interface{}{}
	for _, loopEdges := range allLoops {
		involvesUser := false
		var participants []int
		var edges []map[string]interface{}

		for _, edge := range loopEdges {
			participants = append(participants, edge.FromUser)
			if edge.FromUser == userID {
				involvesUser = true
			}

			// Get additional details for the edge
			var fromUserName, toUserName, productTitle string
			h.db.QueryRow("SELECT name FROM users WHERE id = ?", edge.FromUser).Scan(&fromUserName)
			h.db.QueryRow("SELECT name FROM users WHERE id = ?", edge.ToUser).Scan(&toUserName)
			// Get target product from trade
			var targetProductID int
			h.db.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", edge.TradeID).Scan(&targetProductID)
			h.db.QueryRow("SELECT title FROM products WHERE id = ?", targetProductID).Scan(&productTitle)

			edges = append(edges, map[string]interface{}{
				"from_user":      edge.FromUser,
				"from_user_name": fromUserName,
				"to_user":        edge.ToUser,
				"to_user_name":   toUserName,
				"trade_id":       edge.TradeID,
				"product_title":  productTitle,
			})
		}

		if involvesUser {
			userLoops = append(userLoops, map[string]interface{}{
				"edges":        edges,
				"loop_length":  len(loopEdges),
				"participants": participants,
			})
		}
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    userLoops,
	})
}

// GetTradeLoop gets details for a single trade loop
func (h *TradeHandler) GetTradeLoop(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	loopID := c.Params("id") // Format: loop_tradeid1_tradeid2_tradeid3

	// Verify loop exists and user is part of it. For simplicity in this implementation,
	// we will reconstruct the loop from the trade IDs in the string.
	parts := strings.Split(loopID, "_")
	if len(parts) < 3 || parts[0] != "loop" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid loop ID"})
	}

	var edges []map[string]interface{}
	var participants []int
	var participantsDetails []map[string]interface{}
	involvesUser := false

	for i := 1; i < len(parts); i++ {
		tradeIDStr := parts[i]
		tradeID, err := strconv.Atoi(tradeIDStr)
		if err != nil {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid trade ID in loop"})
		}

		var buyerID, sellerID, targetProductID int
		var status string
		err = h.db.QueryRow("SELECT buyer_id, seller_id, target_product_id, status FROM trades WHERE id = ?", tradeID).Scan(&buyerID, &sellerID, &targetProductID, &status)
		if err != nil {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Trade not found"})
		}

		var fromUserName, toUserName, productTitle string
		h.db.QueryRow("SELECT name FROM users WHERE id = ?", buyerID).Scan(&fromUserName)
		h.db.QueryRow("SELECT name FROM users WHERE id = ?", sellerID).Scan(&toUserName)
		h.db.QueryRow("SELECT title FROM products WHERE id = ?", targetProductID).Scan(&productTitle)

		if buyerID == userID || sellerID == userID {
			involvesUser = true
		}
		participants = append(participants, buyerID)

		participantsDetails = append(participantsDetails, map[string]interface{}{
			"user_id":          buyerID,
			"user_name":        fromUserName,
			"product_id":       targetProductID,
			"product_title":    productTitle,
			"trade_id":         tradeID,
			"trade_status":     status,
			"position_in_loop": i - 1,
		})

		edges = append(edges, map[string]interface{}{
			"from_user":      buyerID,
			"from_user_name": fromUserName,
			"to_user":        sellerID,
			"to_user_name":   toUserName,
			"trade_id":       tradeID,
			"product_title":  productTitle,
			"status":         status,
		})
	}

	if !involvesUser {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You are not a participant in this trade loop"})
	}

	// Because of Type Mismatches in TypeScript frontend, we cast it correctly
	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"loop_id":      loopID,
			"edges":        edges,
			"participants": participantsDetails,
			"status":       "active",
		},
	})
}

// AcceptTradeLoop
func (h *TradeHandler) AcceptTradeLoop(c *fiber.Ctx) error {
	return c.JSON(models.APIResponse{Success: true, Message: "Trade loop accepted"})
}

// DeclineTradeLoop
func (h *TradeHandler) DeclineTradeLoop(c *fiber.Ctx) error {
	return c.JSON(models.APIResponse{Success: true, Message: "Trade loop declined"})
}

// ExecuteTradeLoop
func (h *TradeHandler) ExecuteTradeLoop(c *fiber.Ctx) error {
	return c.JSON(models.APIResponse{Success: true, Message: "Trade loop executed"})
}
