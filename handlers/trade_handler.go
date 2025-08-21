package handlers

import (
	"database/sql"
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
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "target_product_id and offered_product_ids are required"})
	}

	// Lookup target product to get seller_id
	var sellerID int
	err := h.db.QueryRow("SELECT seller_id FROM products WHERE id = ?", payload.TargetProductID).Scan(&sellerID)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Target product not found"})
	}
	if sellerID == userID {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Cannot propose a trade on your own product"})
	}

	// Insert trade
	res, err := h.db.Exec(`INSERT INTO trades (buyer_id, seller_id, target_product_id, status, message) VALUES (?, ?, ?, 'pending', ?)`, userID, sellerID, payload.TargetProductID, payload.Message)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to create trade"})
	}
	tradeID64, _ := res.LastInsertId()
	tradeID := int(tradeID64)

	// Insert offered items (buyer side)
	for _, pid := range payload.OfferedProductIDs {
		_, _ = h.db.Exec("INSERT INTO trade_items (trade_id, product_id, offered_by) VALUES (?, ?, 'buyer')", tradeID, pid)
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

	// Return created trade
	trade := models.Trade{ID: tradeID, BuyerID: userID, SellerID: sellerID, TargetProductID: payload.TargetProductID, Status: "pending", Message: payload.Message, CreatedAt: time.Now(), UpdatedAt: time.Now()}

	// Realtime notify seller via SSE
	publishToUser(sellerID, sseEvent{Type: "trade_created", Data: fiber.Map{
		"trade_id":          tradeID,
		"buyer_id":          userID,
		"target_product_id": payload.TargetProductID,
		"message":           payload.Message,
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
	if direction == "incoming" {
		where = "WHERE t.seller_id = ?"
		args = []interface{}{userID}
	} else if direction == "outgoing" {
		where = "WHERE t.buyer_id = ?"
		args = []interface{}{userID}
	}
	if status != "" {
		where += " AND t.status = ?"
		args = append(args, status)
	}

	rows, err := h.db.Query(`
        SELECT 
          t.id, t.buyer_id, t.seller_id, t.target_product_id, t.status, t.message, t.created_at, t.updated_at,
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
		if err := rows.Scan(&tr.ID, &tr.BuyerID, &tr.SellerID, &tr.TargetProductID, &tr.Status, &tr.Message, &tr.CreatedAt, &tr.UpdatedAt, &tr.BuyerName, &tr.SellerName, &tr.ProductTitle); err == nil {
			// Load items
			itemRows, _ := h.db.Query("SELECT id, trade_id, product_id, offered_by, created_at FROM trade_items WHERE trade_id = ?", tr.ID)
			items := []models.TradeItem{}
			for itemRows.Next() {
				var it models.TradeItem
				var offeredBy string
				if err := itemRows.Scan(&it.ID, &it.TradeID, &it.ProductID, &offeredBy, &it.CreatedAt); err == nil {
					it.OfferedBy = offeredBy
					items = append(items, it)
				}
			}
			itemRows.Close()
			tr.Items = items
			trades = append(trades, tr)
		}
	}

	return c.JSON(models.APIResponse{Success: true, Data: trades})
}

// UpdateTrade allows seller or buyer to accept, decline, or counter
func (h *TradeHandler) UpdateTrade(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	tradeID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid trade id"})
	}

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
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

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
		}
	case "counter":
		// Counter: set status countered and replace items with counter-offer from the countering party
		_, err = h.db.Exec("UPDATE trades SET status='countered', message=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?", payload.Message, tradeID)
		if err == nil {
			// Clear existing items
			_, _ = h.db.Exec("DELETE FROM trade_items WHERE trade_id = ?", tradeID)
			// Insert counter items (by whoever is acting)
			offeredBy := "buyer"
			if userID == sellerID {
				offeredBy = "seller"
			}
			for _, pid := range payload.CounterOfferedProductIDs {
				_, _ = h.db.Exec("INSERT INTO trade_items (trade_id, product_id, offered_by) VALUES (?, ?, ?)", tradeID, pid, offeredBy)
			}
			publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "countered"}})
			publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "countered"}})
			// Notify buyer about counter
			var targetPid int
			_ = h.db.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tradeID).Scan(&targetPid)
			var productTitle string
			_ = h.db.QueryRow("SELECT title FROM products WHERE id = ?", targetPid).Scan(&productTitle)
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", buyerID, "Your trade offer was countered: "+productTitle)
		}
	default:
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid action"})
	}

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update trade"})
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Trade updated"})
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
