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

	// Check if target product is still available and get selection limit
	var targetStatus string
	var maxItems int
	err := h.db.QueryRow("SELECT status, max_items_per_offer FROM products WHERE id = ?", payload.TargetProductID).Scan(&targetStatus, &maxItems)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Target product not found"})
	}
	if targetStatus != "available" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "This product is no longer available for trading"})
	}

	// Validate selection limit
	if maxItems > 0 && len(payload.OfferedProductIDs) > maxItems {
		return c.Status(400).JSON(models.APIResponse{
			Success: false, 
			Error:   fmt.Sprintf("This product only allows up to %d items per trade offer", maxItems),
		})
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

	// CHECK PREMIUM LIMITS: Non-premium users are limited to 5 pending offers
	var isPremium bool
	var strikes int
	_ = h.db.QueryRow("SELECT is_premium, strikes FROM users WHERE id = ?", userID).Scan(&isPremium, &strikes)

	// Strike Ladder Enforcement: 2 strikes = Restricted (cannot post/send new offers)
	if strikes >= 2 {
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "Account Restricted: You cannot send new trade offers because you have 2 or more strikes. You can still finish your ongoing trades.",
		})
	}

	if !isPremium {
		var pendingCount int
		_ = h.db.QueryRow("SELECT COUNT(*) FROM trades WHERE buyer_id = ? AND status = 'pending'", userID).Scan(&pendingCount)
		if pendingCount >= 5 {
			return c.Status(403).JSON(models.APIResponse{
				Success: false,
				Error:   "Standard users are limited to 5 pending trade offers. Upgrade to Premium for 💎 Unlimited Trade Offers!",
			})
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
	go h.autoTriggerMultiwayForTrade(tradeID, sellerID, "trade_created")
	go h.rebuildTradeLoopCacheForUsers([]int{userID, sellerID})

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

func (h *TradeHandler) evaluateAndCreateMultiwaySuggestion(tradeID int, initiatorUserID int, triggerSource string) (bool, string, string, services.MultiwayDebugInfo, error) {
	debug := services.MultiwayDebugInfo{}

	var buyerID, sellerID int
	var tradeStatus string
	err := h.db.QueryRow("SELECT buyer_id, seller_id, status FROM trades WHERE id = ?", tradeID).Scan(&buyerID, &sellerID, &tradeStatus)
	if err != nil {
		return false, "", "Trade not found", debug, err
	}
	if tradeStatus != "pending" && tradeStatus != "pending_multiway" {
		return false, "", "Trade is not eligible for multi-way matching", debug, nil
	}

	matches, dbg, err := services.FindMultiwayMatchDetailed(h.db, buyerID, sellerID, tradeID, []int{})
	debug = dbg
	if err != nil {
		return false, "", "Failed to run multi-way matcher", debug, err
	}
	if len(matches) == 0 {
		if debug.NoMatchReason != "" {
			return false, "", debug.NoMatchReason, debug, nil
		}
		return false, "", "No available User 3 found in the same category within your price range", debug, nil
	}

	best := matches[0]
	chainID := fmt.Sprintf("chain_%d_%d_%d_%d", tradeID, buyerID, sellerID, best.User3ID)

	var existingStatus string
	err = h.db.QueryRow("SELECT status FROM multiway_trades WHERE chain_id = ?", chainID).Scan(&existingStatus)
	if err == nil {
		return false, existingStatus, "Loop suggestion already exists", debug, nil
	}
	if err != sql.ErrNoRows {
		return false, "", "Failed to verify existing loop suggestion", debug, err
	}

	var initiatorIsPremium bool
	if err := h.db.QueryRow("SELECT is_premium FROM users WHERE id = ?", initiatorUserID).Scan(&initiatorIsPremium); err != nil {
		return false, "", "Failed to verify initiator subscription", debug, err
	}

	loopStatus := "pending_user3"
	if !initiatorIsPremium {
		loopStatus = "pending_initiator_upgrade"
	}

	// Calculate expires_at: 18 hours from now for all chains (acceptance window).
	// All parties must accept within this window or the chain dissolves.
	expiresTime := time.Now().Add(18 * time.Hour)
	expiresAt := &expiresTime

	_, err = h.db.Exec(`
		INSERT INTO multiway_trades (chain_id, original_trade_id, initiator_user_id, user1_id, user2_id, user3_id, user3_trade_id, status, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, chainID, tradeID, initiatorUserID, buyerID, sellerID, best.User3ID, best.User3ProductID, loopStatus, expiresAt)
	if err != nil {
		return false, "", "Failed to create loop suggestion", debug, err
	}

	if initiatorIsPremium {
		_, _ = h.db.Exec("UPDATE trades SET status='pending_multiway', updated_at=CURRENT_TIMESTAMP WHERE id = ?", tradeID)

		// Get details for notification
		var initiatorName, targetProductTitle, user3ProductTitle string
		_ = h.db.QueryRow(`
			SELECT u.name, tp.title, u3p.title
			FROM users u
			JOIN products tp ON tp.id = ?
			JOIN products u3p ON u3p.id = ?
			WHERE u.id = ?
		`, best.User3ProductID, best.User1ProductID, initiatorUserID).Scan(&initiatorName, &targetProductTitle, &user3ProductTitle)

		// Notify User 3 with specific details
		user3Msg := fmt.Sprintf("%s invited you to a loop to trade your %s for their %s", initiatorName, targetProductTitle, best.User1ProductTitle)
		if user3ProductTitle != "" {
			user3Msg = fmt.Sprintf("%s invited you to a 3-way loop: %s wants your %s, and you want their %s", initiatorName, targetProductTitle, user3ProductTitle, best.User1ProductTitle)
		}
		h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_loop', ?, FALSE)", best.User3ID, user3Msg)
		publishNotification(best.User3ID, user3Msg)

		// Notify User 1 and User 2
		msgToOthers := "A 3-way loop was found for your trade. Open Multi-way tab to review it."
		for _, uid := range []int{buyerID, sellerID} {
			if uid != best.User3ID {
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_loop', ?, FALSE)", uid, msgToOthers)
				publishNotification(uid, msgToOthers)
			}
		}

		publishToUser(best.User3ID, sseEvent{Type: "multiway_opportunity", Data: fiber.Map{"chain_id": chainID, "source": triggerSource}})
		go h.rebuildTradeLoopCacheForUsers([]int{buyerID, sellerID, best.User3ID})
		return true, loopStatus, "Multi-way loop found and invites sent", debug, nil
	}

	upgradeMsg := "A 3-way loop was found for your trade — upgrade to Pro to start it."
	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_loop', ?, FALSE)", initiatorUserID, upgradeMsg)
	publishNotification(initiatorUserID, upgradeMsg)
	go h.rebuildTradeLoopCacheForUsers([]int{buyerID, sellerID})

	return true, loopStatus, "Loop found. Upgrade required to initiate invites.", debug, nil
}

func (h *TradeHandler) autoTriggerMultiwayForTrade(tradeID int, initiatorUserID int, source string) {
	created, _, msg, _, err := h.evaluateAndCreateMultiwaySuggestion(tradeID, initiatorUserID, source)
	if err != nil {
		log.Printf("autoTriggerMultiwayForTrade: trade=%d source=%s err=%v", tradeID, source, err)
		return
	}
	if created {
		log.Printf("autoTriggerMultiwayForTrade: trade=%d source=%s created suggestion (%s)", tradeID, source, msg)
	}
}

func (h *TradeHandler) autoTriggerMultiwayForNewAvailableProduct(productID int) {
	// Get the new product's category and price for filtering
	var productCategory string
	var productPrice float64
	if err := h.db.QueryRow(`
		SELECT COALESCE(category, ''), COALESCE(price, 0) 
		FROM products 
		WHERE id = ?
	`, productID).Scan(&productCategory, &productPrice); err != nil {
		log.Printf("autoTriggerMultiwayForNewAvailableProduct: failed to get product details: %v", err)
		return
	}

	// Build price range (±30%)
	minPrice := productPrice * 0.7
	maxPrice := productPrice * 1.3

	// Pre-filter pending trades by category match or price range, then take first 50
	query := `
		SELECT DISTINCT t.id, t.seller_id
		FROM trades t
		JOIN products p ON p.id = t.target_product_id
		WHERE t.status = 'pending'
		AND (
			p.category = ? 
			OR (p.price IS NOT NULL AND p.price >= ? AND p.price <= ?)
		)
		ORDER BY t.updated_at DESC
		LIMIT 50
	`
	rows, err := h.db.Query(query, productCategory, minPrice, maxPrice)
	if err != nil {
		log.Printf("autoTriggerMultiwayForNewAvailableProduct: query failed: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var tradeID, sellerID int
		if err := rows.Scan(&tradeID, &sellerID); err != nil {
			continue
		}
		// Natural initiator for auto flow is the target owner (seller/User 2).
		h.autoTriggerMultiwayForTrade(tradeID, sellerID, "new_available_item")
	}
}

func (h *TradeHandler) recordTradeRejectionSignal(tradeID, rejectorUserID, rejectedUserID int, reason string) {
	var targetProductID int
	if err := h.db.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tradeID).Scan(&targetProductID); err != nil {
		log.Printf("recordTradeRejectionSignal: failed to get target product for trade %d: %v", tradeID, err)
		return
	}

	var category sql.NullString
	_ = h.db.QueryRow("SELECT category FROM products WHERE id = ?", targetProductID).Scan(&category)

	_, err := h.db.Exec(`
		INSERT INTO trade_rejection_signals
		(trade_id, rejector_user_id, rejected_user_id, target_product_id, target_category, reason)
		VALUES (?, ?, ?, ?, ?, ?)
	`, tradeID, rejectorUserID, rejectedUserID, targetProductID, category.String, reason)
	if err != nil {
		log.Printf("recordTradeRejectionSignal: failed to insert signal: %v", err)
	}
}

func (h *TradeHandler) hasRecentRejectionSignal(rejectorUserID, rejectedUserID int) bool {
	var count int
	err := h.db.QueryRow(`
		SELECT COUNT(*)
		FROM trade_rejection_signals
		WHERE rejector_user_id = ?
		  AND rejected_user_id = ?
		  AND created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
	`, rejectorUserID, rejectedUserID).Scan(&count)
	if err != nil {
		return false
	}
	return count > 0
}

func (h *TradeHandler) getCachedLoopsForUser(userID int) ([]map[string]interface{}, error) {
	rows, err := h.db.Query(`
		SELECT payload_json
		FROM trade_loop_cache
		WHERE user_id = ? AND expires_at > NOW()
		ORDER BY score DESC, updated_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var loops []map[string]interface{}
	for rows.Next() {
		var payload string
		if err := rows.Scan(&payload); err != nil {
			continue
		}
		var loop map[string]interface{}
		if err := json.Unmarshal([]byte(payload), &loop); err == nil {
			loops = append(loops, loop)
		}
	}

	return loops, nil
}

func (h *TradeHandler) saveLoopCacheForUser(userID int, loops []map[string]interface{}) error {
	if _, err := h.db.Exec("DELETE FROM trade_loop_cache WHERE user_id = ?", userID); err != nil {
		return err
	}

	for idx, loop := range loops {
		loopID := fmt.Sprintf("cached_%d_%d", userID, idx)
		if v, ok := loop["id"]; ok {
			loopID = fmt.Sprintf("%v", v)
		}

		loopType := "graph"
		if v, ok := loop["loop_type"]; ok {
			loopType = fmt.Sprintf("%v", v)
		}

		loopLength := 0
		if v, ok := loop["loop_length"].(int); ok {
			loopLength = v
		}

		score := 50
		if v, ok := loop["score"].(int); ok {
			score = v
		}

		payloadBytes, err := json.Marshal(loop)
		if err != nil {
			continue
		}

		_, _ = h.db.Exec(`
			INSERT INTO trade_loop_cache
			(user_id, loop_id, loop_type, loop_length, score, payload_json, expires_at)
			VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))
		`, userID, loopID, loopType, loopLength, score, string(payloadBytes))
	}

	return nil
}

func (h *TradeHandler) buildUserLoopSuggestions(userID int) ([]map[string]interface{}, error) {
	graph, err := services.NewTradeGraph(h.db)
	if err != nil {
		return nil, err
	}

	allLoops := graph.FindTradeLoops()
	userLoops := []map[string]interface{}{}

	for _, loopEdges := range allLoops {
		involvesUser := false
		participants := []map[string]interface{}{}
		edges := []map[string]interface{}{}

		for _, edge := range loopEdges {
			if edge.FromUser == userID || edge.ToUser == userID {
				involvesUser = true
			}

			var fromUserName, toUserName, productTitle string
			_ = h.db.QueryRow("SELECT name FROM users WHERE id = ?", edge.FromUser).Scan(&fromUserName)
			_ = h.db.QueryRow("SELECT name FROM users WHERE id = ?", edge.ToUser).Scan(&toUserName)
			_ = h.db.QueryRow("SELECT p.title FROM trades t JOIN products p ON p.id = t.target_product_id WHERE t.id = ?", edge.TradeID).Scan(&productTitle)

			edges = append(edges, map[string]interface{}{
				"from_user":      edge.FromUser,
				"from_user_name": fromUserName,
				"to_user":        edge.ToUser,
				"to_user_name":   toUserName,
				"trade_id":       edge.TradeID,
				"product_title":  productTitle,
			})

			participants = append(participants, map[string]interface{}{
				"id":            edge.FromUser,
				"user_name":     fromUserName,
				"product_title": productTitle,
			})
		}

		if involvesUser {
			userLoops = append(userLoops, map[string]interface{}{
				"id":           loopEdges[0].TradeID,
				"loop_type":    "graph",
				"loop_length":  len(loopEdges),
				"score":        70,
				"participants": participants,
				"edges":        edges,
			})
		}
	}

	// Add auto 3-way candidates from existing manual trades using preference matching.
	rows, err := h.db.Query(`
		SELECT id, buyer_id, seller_id
		FROM trades
		WHERE status IN ('pending', 'pending_multiway')
		  AND (buyer_id = ? OR seller_id = ?)
		ORDER BY updated_at DESC
		LIMIT 12
	`, userID, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var tradeID, buyerID, sellerID int
			if err := rows.Scan(&tradeID, &buyerID, &sellerID); err != nil {
				continue
			}

			matches, err := services.FindMultiwayMatch(h.db, buyerID, sellerID, tradeID, []int{})
			if err != nil || len(matches) == 0 {
				continue
			}

			for _, m := range matches {
				if h.hasRecentRejectionSignal(m.User3ID, sellerID) {
					continue
				}

				var buyerName, sellerName, user3Name, targetTitle string
				_ = h.db.QueryRow("SELECT name FROM users WHERE id = ?", buyerID).Scan(&buyerName)
				_ = h.db.QueryRow("SELECT name FROM users WHERE id = ?", sellerID).Scan(&sellerName)
				_ = h.db.QueryRow("SELECT name FROM users WHERE id = ?", m.User3ID).Scan(&user3Name)
				_ = h.db.QueryRow("SELECT p.title FROM trades t JOIN products p ON p.id = t.target_product_id WHERE t.id = ?", tradeID).Scan(&targetTitle)

				userLoops = append(userLoops, map[string]interface{}{
					"id":          fmt.Sprintf("auto_%d_%d", tradeID, m.User3ID),
					"loop_type":   "auto_multiway",
					"loop_length": 3,
					"score":       85,
					"trade_id":    tradeID,
					"summary": fmt.Sprintf(
						"Trade Loop Found: You give %s, you get %s. Chain: %s → %s → %s → %s",
						targetTitle,
						m.User3ProductTitle,
						buyerName,
						sellerName,
						user3Name,
						buyerName,
					),
					"participants": []map[string]interface{}{
						{"id": buyerID, "user_name": buyerName, "product_title": m.User1ProductTitle},
						{"id": sellerID, "user_name": sellerName, "product_title": targetTitle},
						{"id": m.User3ID, "user_name": user3Name, "product_title": m.User3ProductTitle},
					},
				})
				break
			}
		}
	}

	return userLoops, nil
}

func (h *TradeHandler) rebuildTradeLoopCacheForUsers(userIDs []int) {
	seen := map[int]bool{}
	for _, userID := range userIDs {
		if userID <= 0 || seen[userID] {
			continue
		}
		seen[userID] = true

		loops, err := h.buildUserLoopSuggestions(userID)
		if err != nil {
			log.Printf("rebuildTradeLoopCacheForUsers: failed for user %d: %v", userID, err)
			continue
		}
		if err := h.saveLoopCacheForUser(userID, loops); err != nil {
			log.Printf("rebuildTradeLoopCacheForUsers: failed to save cache for user %d: %v", userID, err)
		}
	}
}

func (h *TradeHandler) notifyAlternativeLoopsIfAny(userID int, productTitle string) {
	loops, err := h.getCachedLoopsForUser(userID)
	if err != nil || len(loops) == 0 {
		return
	}

	msg := "We found alternative trade loops for your item"
	if strings.TrimSpace(productTitle) != "" {
		msg = fmt.Sprintf("We found alternative trade loops for your item: %s", productTitle)
	}

	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_loop', ?, FALSE)", userID, msg)
	publishNotification(userID, msg)
}

func mapKeysToSlice(m map[int]bool) []int {
	out := make([]int, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

// RebuildAllLoopCaches refreshes hybrid loop suggestions for premium users.
// Intended to be called by a background ticker/cron.
func (h *TradeHandler) RebuildAllLoopCaches() {
	rows, err := h.db.Query("SELECT id FROM users WHERE is_premium = TRUE")
	if err != nil {
		log.Printf("RebuildAllLoopCaches: failed to load premium users: %v", err)
		return
	}
	defer rows.Close()

	userIDs := []int{}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			userIDs = append(userIDs, id)
		}
	}

	if len(userIDs) == 0 {
		return
	}

	h.rebuildTradeLoopCacheForUsers(userIDs)
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
		if status == "pending" {
			where += " AND (t.status = 'pending' OR t.status = 'pending_multiway')"
		} else {
			where += " AND t.status = ?"
			args = append(args, status)
		}
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
			COALESCE(t.delivery_instructions, '') as delivery_instructions,
			t.proof_of_delivery,
			COALESCE(t.buyer_confirmed_receipt, FALSE) as buyer_confirmed_receipt,
			COALESCE(t.seller_confirmed_delivery, FALSE) as seller_confirmed_delivery
		FROM trades t LIMIT 1`
	testDeliveryRow := h.db.QueryRow(deliveryStateQuery)
	var testDeliveryType, testPaymentMethod, testDeliveryInstructions string
	var testPaymentConfirmed, testBuyerConfirmed, testSellerConfirmed bool
	var testProofOfDelivery sql.NullString
	if err := testDeliveryRow.Scan(&testDeliveryType, &testPaymentMethod, &testPaymentConfirmed, &testDeliveryInstructions, &testProofOfDelivery, &testBuyerConfirmed, &testSellerConfirmed); err == nil {
		// Delivery state columns exist, include them in query
		query += `,
			COALESCE(t.delivery_type, '') as delivery_type,
			COALESCE(t.payment_method, '') as payment_method,
			COALESCE(t.payment_confirmed, FALSE) as payment_confirmed,
			COALESCE(t.delivery_instructions, '') as delivery_instructions,
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
			'' as delivery_instructions,
			NULL as proof_of_delivery,
			FALSE as buyer_confirmed_receipt,
			FALSE as seller_confirmed_delivery`
	}

	query += `,
          COALESCE(t.meetup_location, '') as meetup_location, COALESCE(t.buyer_meetup_confirmed, FALSE) as buyer_meetup_confirmed, COALESCE(t.seller_meetup_confirmed, FALSE) as seller_meetup_confirmed,
          COALESCE(t.buyer_meetup_location, '') as buyer_meetup_location, COALESCE(t.buyer_meetup_time, '') as buyer_meetup_time,
          COALESCE(t.seller_meetup_location, '') as seller_meetup_location, COALESCE(t.seller_meetup_time, '') as seller_meetup_time,
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
		var deliveryType, paymentMethod, deliveryInstructions string
		var paymentConfirmed, buyerConfirmedReceipt, sellerConfirmedDelivery bool
		var proofOfDelivery sql.NullString
		var pimg, pimgs sql.NullString
		var offeredCashNull sql.NullFloat64

		if err := rows.Scan(&tr.ID, &tr.BuyerID, &tr.SellerID, &tr.TargetProductID, &tr.Status, &tr.Message, &offeredCashNull, &tr.CreatedAt, &tr.UpdatedAt, &tr.BuyerCompleted, &tr.SellerCompleted, &tr.CompletedAt, &tr.TradeOption, &tr.DeliveryAddress, &deliveryType, &paymentMethod, &paymentConfirmed, &deliveryInstructions, &proofOfDelivery, &buyerConfirmedReceipt, &sellerConfirmedDelivery, &tr.MeetupLocation, &tr.BuyerMeetupConfirmed, &tr.SellerMeetupConfirmed, &tr.BuyerMeetupLocation, &tr.BuyerMeetupTime, &tr.SellerMeetupLocation, &tr.SellerMeetupTime, &tr.BuyerName, &tr.SellerName, &tr.ProductTitle, &pimg, &pimgs); err == nil {
			// Set offered cash if valid
			if offeredCashNull.Valid {
				val := offeredCashNull.Float64
				tr.OfferedCash = &val
			}

			// Set delivery state fields
			tr.DeliveryType = deliveryType
			tr.PaymentMethod = paymentMethod
			tr.PaymentConfirmed = paymentConfirmed
			tr.DeliveryInstructions = deliveryInstructions
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
		if currentStatus != "pending" && currentStatus != "pending_multiway" && currentStatus != "countered" {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Trade is no longer pending (" + currentStatus + ")"})
		}
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

		rejectedUserID := buyerID
		if userID == buyerID {
			rejectedUserID = sellerID
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

		// Record rejection signal so hybrid matching can avoid poor fits and suggest better loops.
		go h.recordTradeRejectionSignal(tradeID, userID, rejectedUserID, payload.Message)
		go h.rebuildTradeLoopCacheForUsers([]int{buyerID, sellerID})
		go h.notifyAlternativeLoopsIfAny(rejectedUserID, productTitle)
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

		// Check target product item limit
		var targetProductID int
		if err := h.db.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tradeID).Scan(&targetProductID); err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load trade details"})
		}
		var maxItems int
		if err := h.db.QueryRow("SELECT max_items_per_offer FROM products WHERE id = ?", targetProductID).Scan(&maxItems); err != nil {
			_ = tx.Rollback()
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load product limits"})
		}
		if maxItems > 0 && len(payload.CounterOfferedProductIDs) > maxItems {
			_ = tx.Rollback()
			return c.Status(400).JSON(models.APIResponse{
				Success: false,
				Error:   fmt.Sprintf("This trade only allows up to %d items per offer", maxItems),
			})
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
		if currentStatus != "active" {
			log.Printf("Attempted to complete non-active trade %d (status: %s)", tradeID, currentStatus)
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Only active trades can be marked as complete"})
		}
		log.Printf("User %d attempting to complete trade %d", userID, tradeID)

		// Enforce photo evidence rule for meetup and delivery
		var proofURL sql.NullString
		var isCamera bool
		var tradeOption string
		proofCheckCol := "buyer_proof_url"
		camCheckCol := "buyer_photo_is_camera"
		if userID == sellerID {
			proofCheckCol = "seller_proof_url"
			camCheckCol = "seller_photo_is_camera"
		}
		err = h.db.QueryRow("SELECT "+proofCheckCol+", "+camCheckCol+", COALESCE(trade_option, 'meetup') FROM trades WHERE id = ?", tradeID).Scan(&proofURL, &isCamera, &tradeOption)
		if err == nil && (tradeOption == "meetup" || tradeOption == "delivery") {
			if !proofURL.Valid || proofURL.String == "" {
				return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Photo evidence is mandatory for " + tradeOption + " trades. Please provide a handoff photo."})
			}
			if !isCamera {
				return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Photo evidence must be taken using the in-app camera (no gallery upload)."})
			}
		}

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

		// Validate meetup location and time are provided
		if payload.MeetupLocation == "" {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Meetup location is required"})
		}
		if payload.MeetupTime == "" {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Meetup time is required"})
		}

		// Store each party's meetup selection separately
		var updateQuery string
		switch userID {
		case buyerID:
			updateQuery = "UPDATE trades SET buyer_meetup_location=?, buyer_meetup_time=?, buyer_meetup_confirmed=TRUE, updated_at=CURRENT_TIMESTAMP WHERE id = ?"
		case sellerID:
			updateQuery = "UPDATE trades SET seller_meetup_location=?, seller_meetup_time=?, seller_meetup_confirmed=TRUE, updated_at=CURRENT_TIMESTAMP WHERE id = ?"
		default:
			return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not authorized for this trade"})
		}

		// Update the trade with this party's meetup selection
		_, err = h.db.Exec(updateQuery, payload.MeetupLocation, payload.MeetupTime, tradeID)
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

		notifMsg := fmt.Sprintf("The %s has selected meetup: %s at %s", confirmerName, payload.MeetupLocation, payload.MeetupTime)
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", otherUserID, notifMsg)

		// Check if both parties have confirmed and if their selections MATCH
		var buyerConfirmed, sellerConfirmed bool
		var buyerLocation, buyerTime, sellerLocation, sellerTime sql.NullString
		err = h.db.QueryRow(`
			SELECT COALESCE(buyer_meetup_confirmed, FALSE), COALESCE(seller_meetup_confirmed, FALSE),
			       buyer_meetup_location, buyer_meetup_time,
			       seller_meetup_location, seller_meetup_time
			FROM trades WHERE id = ?`, tradeID).Scan(
			&buyerConfirmed, &sellerConfirmed,
			&buyerLocation, &buyerTime,
			&sellerLocation, &sellerTime)

		if err == nil && buyerConfirmed && sellerConfirmed {
			// Both parties confirmed - check if selections match (tolerant to whitespace/case)
			bLoc := strings.ToLower(strings.TrimSpace(buyerLocation.String))
			sLoc := strings.ToLower(strings.TrimSpace(sellerLocation.String))
			bTime := strings.ToLower(strings.TrimSpace(buyerTime.String))
			sTime := strings.ToLower(strings.TrimSpace(sellerTime.String))

			if bLoc == sLoc && bTime == sTime {
				// Selections match! Update trade status to active and set the final meetup details
				_, err = h.db.Exec(`
					UPDATE trades
					SET status='active', meetup_location=?, meetup_time=?, updated_at=CURRENT_TIMESTAMP
					WHERE id = ?`, buyerLocation.String, buyerTime.String, tradeID)
				if err == nil {
					log.Printf("Both parties agreed on meetup for trade %d (location: %s, time: %s), status updated to active",
						tradeID, buyerLocation.String, buyerTime.String)
					publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "active", "meetup_agreed": true}})
					publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "active", "meetup_agreed": true}})

					// Send agreement notifications
					_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)",
						buyerID, fmt.Sprintf("Meetup agreed! %s at %s. Trade is now active.", buyerLocation.String, buyerTime.String))
					_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)",
						sellerID, fmt.Sprintf("Meetup agreed! %s at %s. Trade is now active.", buyerLocation.String, buyerTime.String))
				}
			} else {
				// Selections don't match - notify both parties
				log.Printf("Meetup selections don't match for trade %d. Buyer: %s at %s, Seller: %s at %s",
					tradeID, buyerLocation.String, buyerTime.String, sellerLocation.String, sellerTime.String)
				publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "meetup_mismatch": true}})
				publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "meetup_mismatch": true}})

				// Send mismatch notifications
				mismatchMsg := fmt.Sprintf("Meetup selections don't match! You selected %s at %s, but the other party selected %s at %s. Please coordinate.",
					payload.MeetupLocation, payload.MeetupTime,
					func() string {
						if userID == buyerID {
							return sellerLocation.String
						}
						return buyerLocation.String
					}(),
					func() string {
						if userID == buyerID {
							return sellerTime.String
						}
						return buyerTime.String
					}())
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", userID, mismatchMsg)
			}
		} else {
			// Only one party confirmed, notify both about the confirmation
			publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "meetup_selection_submitted": true}})
			publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "meetup_selection_submitted": true}})
		}

		_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, ?, 'meetup_selection', ?)",
			tradeID, userID, currentStatus, "Meetup selection: "+payload.MeetupLocation+" at "+payload.MeetupTime)

	case "confirm_meetup_done":
		log.Printf("=== TRADE MEETUP DONE CONFIRMATION REQUEST ===")
		log.Printf("User %d confirming meetup happened for trade %d", userID, tradeID)

		column := "buyer_met"
		if userID == sellerID {
			column = "seller_met"
		}

		_, err = h.db.Exec("UPDATE trades SET "+column+"=TRUE, updated_at=CURRENT_TIMESTAMP WHERE id = ?", tradeID)
		if err != nil {
			log.Printf("Failed to update meetup done status for trade %d: %v", tradeID, err)
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to confirm meetup happened"})
		}

		// Notify other party
		var otherUserID int
		if userID == buyerID {
			otherUserID = sellerID
		} else {
			otherUserID = buyerID
		}
		publishToUser(otherUserID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "meetup_confirmed_done": true}})
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", otherUserID, "The other party confirmed the meeting took place.")
		_, _ = h.db.Exec("INSERT INTO trade_events (trade_id, actor_id, from_status, to_status, note) VALUES (?, ?, ?, 'meetup_confirmed_done', ?)",
			tradeID, userID, currentStatus, "User confirmed meeting happened")

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
			Action                  string  `json:"action"`
			DeliveryType            string  `json:"delivery_type,omitempty"`
			PaymentMethod           string  `json:"payment_method,omitempty"`
			PaymentConfirmed        *bool   `json:"payment_confirmed,omitempty"`
			DeliveryInstructions    *string `json:"delivery_instructions,omitempty"`
			ProofOfDelivery         string  `json:"proof_of_delivery,omitempty"`
			BuyerConfirmedReceipt   *bool   `json:"buyer_confirmed_receipt,omitempty"`
			SellerConfirmedDelivery *bool   `json:"seller_confirmed_delivery,omitempty"`
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
		if deliveryPayload.DeliveryInstructions != nil {
			updateFields = append(updateFields, "delivery_instructions = ?")
			updateArgs = append(updateArgs, *deliveryPayload.DeliveryInstructions)
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
	case "request_option_change":
		requestedOption := payload.RequestedOption
		if requestedOption != "meetup" && requestedOption != "delivery" {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid option. Must be 'meetup' or 'delivery'"})
		}
		_, err = h.db.Exec("UPDATE trades SET option_change_requested=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", requestedOption, tradeID)
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to request option change"})
		}
		// Notify the other party
		var notifyID int
		if userID == buyerID {
			notifyID = sellerID
		} else {
			notifyID = buyerID
		}
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", notifyID, fmt.Sprintf("Trade option change requested to %s", requestedOption))
		publishToUser(notifyID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID}})

	case "approve_option_change":
		// Get the requested option
		var requestedOption sql.NullString
		h.db.QueryRow("SELECT option_change_requested FROM trades WHERE id=?", tradeID).Scan(&requestedOption)
		if !requestedOption.Valid || requestedOption.String == "" {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "No pending option change"})
		}
		_, err = h.db.Exec("UPDATE trades SET trade_option=?, option_change_requested=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?", requestedOption.String, tradeID)
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to approve option change"})
		}
		// Notify requester
		var notifyID2 int
		if userID == buyerID {
			notifyID2 = sellerID
		} else {
			notifyID2 = buyerID
		}
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", notifyID2, "Trade option change approved")
		publishToUser(notifyID2, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID}})

	case "reject_option_change":
		_, err = h.db.Exec("UPDATE trades SET option_change_requested=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?", tradeID)
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to reject option change"})
		}
		var notifyID3 int
		if userID == buyerID {
			notifyID3 = sellerID
		} else {
			notifyID3 = buyerID
		}
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", notifyID3, "Trade option change rejected")
		publishToUser(notifyID3, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID}})

	case "convert_to_multiway":
		created, loopStatus, reason, debugInfo, suggestErr := h.evaluateAndCreateMultiwaySuggestion(tradeID, userID, "manual_convert")
		if suggestErr != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: reason})
		}

		if !created {
			return c.JSON(models.APIResponse{
				Success: true,
				Message: "No strong multi-way match yet. We will keep checking automatically.",
				Data: fiber.Map{
					"trade_id":          tradeID,
					"matched":           false,
					"no_match_reason":   reason,
					"matcher_threshold": debugInfo.Threshold,
					"debug":             debugInfo,
				},
			})
		}

		responseStatus := loopStatus
		if loopStatus == "pending_user3" {
			responseStatus = "pending_multiway"
			publishToUser(buyerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "pending_multiway"}})
			publishToUser(sellerID, sseEvent{Type: "trade_updated", Data: fiber.Map{"trade_id": tradeID, "status": "pending_multiway"}})
		}

		var createdChainID string
		_ = h.db.QueryRow(`
			SELECT chain_id
			FROM multiway_trades
			WHERE original_trade_id = ? AND initiator_user_id = ?
			ORDER BY id DESC
			LIMIT 1
		`, tradeID, userID).Scan(&createdChainID)

		return c.JSON(models.APIResponse{
			Success: true,
			Message: reason,
			Data: fiber.Map{
				"trade_id":   tradeID,
				"status":     responseStatus,
				"matched":    true,
				"loop_state": loopStatus,
				"chain_id":   createdChainID,
				"debug":      debugInfo,
			},
		})

	default:
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid action"})
	}

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update trade"})
	}

	var latestStatus string
	if statusErr := h.db.QueryRow("SELECT status FROM trades WHERE id = ?", tradeID).Scan(&latestStatus); statusErr == nil {
		if latestStatus == "pending" && currentStatus != "pending" {
			go h.autoTriggerMultiwayForTrade(tradeID, sellerID, "trade_pending_status_update")
		}
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

	// Allow both 'available' and 'locked' status.
	// Products are locked when a trade is accepted/active.
	if currentStatus != "available" && currentStatus != "locked" {
		log.Printf("Warning: Product %d is already in an un-tradable state (status: %s), skipping", productID, currentStatus)
		return nil // Don't fail the entire trade if one product is already finalized/unavailable
	}

	// Update product status to traded
	result, err := tx.Exec(`
		UPDATE products 
		SET status = 'traded', updated_at = CURRENT_TIMESTAMP 
		WHERE id = ? AND (status = 'available' OR status = 'locked')`,
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
		buyerID, "Your offer has been accepted! A delivery will be arranged shortly.")
	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'delivery_update', ?, FALSE)",
		sellerID, "You accepted the offer. A delivery request is being prepared.")

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

	// Check if delivery state columns exist (delivery progress + instructions)
	deliveryStateQuery := `
		SELECT
			COALESCE(t.delivery_type, '') as delivery_type,
			COALESCE(t.payment_method, '') as payment_method,
			COALESCE(t.payment_confirmed, FALSE) as payment_confirmed,
			COALESCE(t.delivery_instructions, '') as delivery_instructions,
			t.proof_of_delivery,
			COALESCE(t.buyer_confirmed_receipt, FALSE) as buyer_confirmed_receipt,
			COALESCE(t.seller_confirmed_delivery, FALSE) as seller_confirmed_delivery
		FROM trades t LIMIT 1`
	testDeliveryRow := h.db.QueryRow(deliveryStateQuery)
	var testDeliveryType, testPaymentMethod, testDeliveryInstructions string
	var testPaymentConfirmed, testBuyerConfirmed, testSellerConfirmed bool
	var testProofOfDelivery sql.NullString
	if err := testDeliveryRow.Scan(&testDeliveryType, &testPaymentMethod, &testPaymentConfirmed, &testDeliveryInstructions, &testProofOfDelivery, &testBuyerConfirmed, &testSellerConfirmed); err == nil {
		query += `,
			COALESCE(t.delivery_type, '') as delivery_type,
			COALESCE(t.payment_method, '') as payment_method,
			COALESCE(t.payment_confirmed, FALSE) as payment_confirmed,
			COALESCE(t.delivery_instructions, '') as delivery_instructions,
			t.proof_of_delivery,
			COALESCE(t.buyer_confirmed_receipt, FALSE) as buyer_confirmed_receipt,
			COALESCE(t.seller_confirmed_delivery, FALSE) as seller_confirmed_delivery`
	} else {
		query += `,
			'' as delivery_type,
			'' as payment_method,
			FALSE as payment_confirmed,
			'' as delivery_instructions,
			NULL as proof_of_delivery,
			FALSE as buyer_confirmed_receipt,
			FALSE as seller_confirmed_delivery`
	}

	query += `,
          COALESCE(t.meetup_location, '') as meetup_location,
          COALESCE(t.meetup_time, '') as meetup_time,
          t.buyer_meetup_confirmed, t.seller_meetup_confirmed,
          COALESCE(t.buyer_meetup_location, '') as buyer_meetup_location,
          COALESCE(t.buyer_meetup_time, '') as buyer_meetup_time,
          COALESCE(t.seller_meetup_location, '') as seller_meetup_location,
          COALESCE(t.seller_meetup_time, '') as seller_meetup_time,
          ub.name AS buyer_name, us.name AS seller_name, p.title AS product_title
        FROM trades t
        JOIN users ub ON ub.id = t.buyer_id
        JOIN users us ON us.id = t.seller_id
        JOIN products p ON p.id = t.target_product_id
        WHERE t.id = ?`

	var deliveryType, paymentMethod, deliveryInstructions string
	var paymentConfirmed, buyerConfirmedReceipt, sellerConfirmedDelivery bool
	var proofOfDelivery sql.NullString
	err = h.db.QueryRow(query, tradeID).Scan(&tr.ID, &tr.BuyerID, &tr.SellerID, &tr.TargetProductID, &tr.Status, &tr.Message, &tr.OfferedCash, &tr.CreatedAt, &tr.UpdatedAt, &tr.BuyerCompleted, &tr.SellerCompleted, &tr.CompletedAt, &tr.TradeOption, &tr.DeliveryAddress, &deliveryType, &paymentMethod, &paymentConfirmed, &deliveryInstructions, &proofOfDelivery, &buyerConfirmedReceipt, &sellerConfirmedDelivery, &tr.MeetupLocation, &tr.MeetupTime, &tr.BuyerMeetupConfirmed, &tr.SellerMeetupConfirmed, &tr.BuyerMeetupLocation, &tr.BuyerMeetupTime, &tr.SellerMeetupLocation, &tr.SellerMeetupTime, &tr.BuyerName, &tr.SellerName, &tr.ProductTitle)
	tr.DeliveryType = deliveryType
	tr.PaymentMethod = paymentMethod
	tr.PaymentConfirmed = paymentConfirmed
	tr.DeliveryInstructions = deliveryInstructions
	if proofOfDelivery.Valid {
		tr.ProofOfDelivery = proofOfDelivery.String
	}
	tr.BuyerConfirmedReceipt = buyerConfirmedReceipt
	tr.SellerConfirmedDelivery = sellerConfirmedDelivery
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
	allowedStatuses := map[string]bool{
		"pending": true, "pending_multiway": true, "accepted": true, "active": true,
		"completed": true, "declined": true, "cancelled": true, "countered": true,
		"expired": true, "auto_completed": true,
	}
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
		if status == "pending" {
			where += " AND (t.status = 'pending' OR t.status = 'pending_multiway')"
		} else {
			where += " AND t.status = ?"
			args = append(args, status)
		}
	}

	var count int
	// Use a prepared-like query with args to avoid injection and driver issues
	query := "SELECT COUNT(*) FROM trades t " + where

	// Retry logic for transient connection errors
	maxRetries := 2
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt*100) * time.Millisecond) // Exponential backoff
		}
		if err := h.db.QueryRow(query, args...).Scan(&count); err == nil {
			return c.JSON(models.APIResponse{Success: true, Data: fiber.Map{"count": count}})
		} else {
			lastErr = err
		}
	}

	// Log and return zero as a safe fallback to avoid 400 responses for UI polling
	fmt.Printf("CountTrades: db query error for user=%d query='%s' args=%v: %v (after %d retries) - returning count=0\n", userID, query, args, lastErr, maxRetries)
	return c.JSON(models.APIResponse{Success: true, Data: fiber.Map{"count": 0}})
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
		Rating        int    `json:"rating"`
		Feedback      string `json:"feedback"`
		ProofURL      string `json:"transaction_proof_url,omitempty"`
		IsCameraPhoto bool   `json:"is_camera_photo"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	// Validate rating
	if payload.Rating < 1 || payload.Rating > 5 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Rating must be between 1 and 5"})
	}

	// Fetch trade details
	var buyerID, sellerID int
	var tradeOption string
	err = h.db.QueryRow("SELECT buyer_id, seller_id, COALESCE(trade_option, 'meetup') FROM trades WHERE id = ?", tradeID).Scan(&buyerID, &sellerID, &tradeOption)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Trade not found"})
	}
	if userID != buyerID && userID != sellerID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not authorized for this trade"})
	}

	// Enforce photo evidence rule for meetup and delivery
	if tradeOption == "meetup" || tradeOption == "delivery" {
		if payload.ProofURL == "" {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Photo evidence is mandatory for " + tradeOption + " trades"})
		}
		if !payload.IsCameraPhoto {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Photo evidence must be taken using the in-app camera (no gallery upload allowed)"})
		}
	}

	// Determine which columns to update based on user role
	var ratingColumn, feedbackColumn, proofColumn, cameraFlagColumn, completedColumn string
	if userID == buyerID {
		ratingColumn = "buyer_rating"
		feedbackColumn = "buyer_feedback"
		proofColumn = "buyer_proof_url"
		cameraFlagColumn = "buyer_photo_is_camera"
		completedColumn = "buyer_completed"
	} else {
		ratingColumn = "seller_rating"
		feedbackColumn = "seller_feedback"
		proofColumn = "seller_proof_url"
		cameraFlagColumn = "seller_photo_is_camera"
		completedColumn = "seller_completed"
	}

	// Update the trade with rating, feedback, proof, camera flag, and completion status
	if payload.ProofURL != "" {
		_, err = h.db.Exec(
			"UPDATE trades SET "+ratingColumn+"=?, "+feedbackColumn+"=?, "+proofColumn+"=?, "+cameraFlagColumn+"=?, "+completedColumn+"=TRUE, updated_at=CURRENT_TIMESTAMP WHERE id = ?",
			payload.Rating, payload.Feedback, payload.ProofURL, payload.IsCameraPhoto, tradeID)
	} else {
		// This path is only reachable for non-meetup/delivery trades if we allow them without photo
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

	userLoops := []map[string]interface{}{}

	// Discover loop suggestions for all users. All users can create/join loops now.
	graph, err := services.NewTradeGraph(h.db)
	if err != nil {
		log.Printf("Error fetching trades for graph: %v", err)
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load trade graph"})
	}

	allLoops := graph.FindTradeLoops()
	expiresAt := time.Now().Add(48 * time.Hour).Format("2006-01-02 15:04:05")
	for _, loopEdges := range allLoops {
		involvesUser := false
		participants := []map[string]interface{}{}
		var edges []map[string]interface{}
		loopTradeParts := []string{"loop"}

		for _, edge := range loopEdges {
			loopTradeParts = append(loopTradeParts, strconv.Itoa(edge.TradeID))
			if edge.FromUser == userID || edge.ToUser == userID {
				involvesUser = true
			}

			var fromUserName, toUserName, productTitle string
			h.db.QueryRow("SELECT name FROM users WHERE id = ?", edge.FromUser).Scan(&fromUserName)
			h.db.QueryRow("SELECT name FROM users WHERE id = ?", edge.ToUser).Scan(&toUserName)

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

			participants = append(participants, map[string]interface{}{
				"id":            edge.FromUser,
				"user_name":     fromUserName,
				"product_title": productTitle,
				"status":        "pending",
			})
		}

		if !involvesUser {
			continue
		}

		loopID := strings.Join(loopTradeParts, "_")
		userLoops = append(userLoops, map[string]interface{}{
			"id":                loopID,
			"loop_id":           loopID,
			"loop_type":         "detected_loop",
			"initiator_view":    true,
			"can_join":          true,
			"can_decline":       true,
			"can_create":        true,
			"edges":             edges,
			"loop_length":       len(loopEdges),
			"participants":      participants,
			"status":            "pending",
			"initiator_user_id": userID,
			"expires_at":        expiresAt,
		})
	}

	// 5. Also fetch matches from multiway_trades table where user is participant (user3)
	rows, err := h.db.Query(`
		SELECT m.chain_id, m.original_trade_id, m.user3_id, m.user3_product_id, m.status, m.initiator_user_id,
		       DATE_FORMAT(DATE_ADD(m.created_at, INTERVAL 48 HOUR), '%Y-%m-%d %H:%i:%s') as expires_at,
		       t.buyer_id as user1_id, t.seller_id as user2_id, t.target_product_id as user2_product_id,
		       u1.name as user1_name, u2.name as user2_name, u3.name as user3_name, ui.name as initiator_name,
		       p1.title as user3_wanted_product_title, p2.title as user2_product_title, p3.title as user3_product_title
		FROM multiway_trades m
		JOIN trades t ON m.original_trade_id = t.id
		JOIN users u1 ON t.buyer_id = u1.id
		JOIN users u2 ON t.seller_id = u2.id
		JOIN users u3 ON m.user3_id = u3.id
		JOIN users ui ON m.initiator_user_id = ui.id
		JOIN products p2 ON t.target_product_id = p2.id
		JOIN products p3 ON m.user3_product_id = p3.id
		JOIN trade_items ti ON t.id = ti.trade_id
		JOIN products p1 ON ti.product_id = p1.id
		WHERE (m.user3_id = ? OR t.buyer_id = ? OR t.seller_id = ?) AND m.status IN ('pending_user3', 'pending_initiator_upgrade', 'user3_accepted', 'active')
	`, userID, userID, userID)

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var chainID, mStatus, expiresAt, u1Name, u2Name, u3Name, initiatorName, u3WantedTitle, u2Title, u3Title string
			var tradeID, u3ID, u3PID, initiatorUserID, u1ID, u2ID, u2PID int
			err = rows.Scan(&chainID, &tradeID, &u3ID, &u3PID, &mStatus, &initiatorUserID, &expiresAt, &u1ID, &u2ID, &u2PID, &u1Name, &u2Name, &u3Name, &initiatorName, &u3WantedTitle, &u2Title, &u3Title)
			if err == nil {
				if mStatus == "pending_initiator_upgrade" && userID != initiatorUserID {
					continue
				}

				// Hide from User A until User C accepts
				if mStatus == "pending_user3" && userID != initiatorUserID && userID != u3ID {
					continue
				}

				user3Status := "pending"
				switch mStatus {
				case "user3_accepted", "active":
					user3Status = "joined"
				case "user3_declined":
					user3Status = "declined"
				case "pending_initiator_upgrade":
					user3Status = "waiting_initiator_upgrade"
				}

				baseParticipantStatus := "pending"
				if user3Status == "joined" {
					baseParticipantStatus = "joined"
				}

				isInitiatorView := userID == initiatorUserID
				canJoin := userID == u3ID && mStatus == "pending_user3"
				canDecline := userID == u3ID && mStatus == "pending_user3"

				userLoops = append(userLoops, map[string]interface{}{
					"id":                chainID,
					"loop_id":           chainID,
					"chain_id":          chainID,
					"is_chain":          true,
					"loop_type":         "invited_chain",
					"status":            mStatus,
					"loop_length":       3,
					"initiator_user_id": initiatorUserID,
					"initiator_name":    initiatorName,
					"initiator_view":    isInitiatorView,
					"can_join":          canJoin,
					"can_decline":       canDecline,
					"expires_at":        expiresAt,
					"participants": []map[string]interface{}{
						{"id": u1ID, "user_name": u1Name, "product_title": u3WantedTitle, "status": baseParticipantStatus},
						{"id": u2ID, "user_name": u2Name, "product_title": u2Title, "status": baseParticipantStatus},
						{"id": u3ID, "user_name": u3Name, "product_title": u3Title, "status": user3Status},
					},
				})
			}
		}
	}

	if isPremium {
		_ = h.saveLoopCacheForUser(userID, userLoops)
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    userLoops,
	})
}

func (h *TradeHandler) GetTradeLoop(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	loopID := c.Params("id") // Format: loop_tradeid1_tradeid2_tradeid3
	log.Printf("[GetTradeLoop] userID=%d raw loopID=%q", userID, loopID)

	// Handle new multiway chain format (chain_ID)
	if strings.HasPrefix(loopID, "chain_") {
		var mID, tID, u3ID, u3PID int
		var status string
		err := h.db.QueryRow("SELECT id, original_trade_id, user3_id, user3_product_id, status FROM multiway_trades WHERE chain_id = ?", loopID).Scan(&mID, &tID, &u3ID, &u3PID, &status)
		if err != nil {
			// Backward compatibility for legacy chain_123 numeric IDs
			chainID, convErr := strconv.Atoi(strings.Replace(loopID, "chain_", "", 1))
			if convErr == nil {
				err = h.db.QueryRow("SELECT id, original_trade_id, user3_id, user3_product_id, status FROM multiway_trades WHERE id = ?", chainID).Scan(&mID, &tID, &u3ID, &u3PID, &status)
			}
		}
		if err != nil {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Multi-way chain not found"})
		}

		// Fetch original trade (U1 -> U2)
		var u1ID, u2ID, u2PID int
		err = h.db.QueryRow("SELECT buyer_id, seller_id, target_product_id FROM trades WHERE id = ?", tID).Scan(&u1ID, &u2ID, &u2PID)
		if err != nil {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Original trade not found"})
		}

		// Fetch U3's wanted product (which is U1's offered product)
		var u3WantedPID int
		err = h.db.QueryRow("SELECT product_id FROM trade_items WHERE trade_id = ? LIMIT 1", tID).Scan(&u3WantedPID)

		// Fetch names and titles
		var u1Name, u2Name, u3Name, u1Title, u2Title, u3Title string
		h.db.QueryRow("SELECT name FROM users WHERE id = ?", u1ID).Scan(&u1Name)
		h.db.QueryRow("SELECT name FROM users WHERE id = ?", u2ID).Scan(&u2Name)
		h.db.QueryRow("SELECT name FROM users WHERE id = ?", u3ID).Scan(&u3Name)

		h.db.QueryRow("SELECT title FROM products WHERE id = ?", u3WantedPID).Scan(&u1Title) // U1's product
		h.db.QueryRow("SELECT title FROM products WHERE id = ?", u2PID).Scan(&u2Title)       // U2's product
		h.db.QueryRow("SELECT title FROM products WHERE id = ?", u3PID).Scan(&u3Title)       // U3's product

		// Check if user is participant
		if userID != u1ID && userID != u2ID && userID != u3ID {
			return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You are not a participant in this multi-way trade"})
		}

		participantsDetails := []map[string]interface{}{
			{"user_id": u1ID, "user_name": u1Name, "product_id": u3WantedPID, "product_title": u1Title, "position": 0},
			{"user_id": u2ID, "user_name": u2Name, "product_id": u2PID, "product_title": u2Title, "position": 1},
			{"user_id": u3ID, "user_name": u3Name, "product_id": u3PID, "product_title": u3Title, "position": 2},
		}

		edges := []map[string]interface{}{
			{"from_user": u1ID, "to_user": u2ID, "from_user_name": u1Name, "to_user_name": u2Name, "product_title": u2Title},
			{"from_user": u2ID, "to_user": u3ID, "from_user_name": u2Name, "to_user_name": u3Name, "product_title": u3Title},
			{"from_user": u3ID, "to_user": u1ID, "from_user_name": u3Name, "to_user_name": u1Name, "product_title": u1Title},
		}

		return c.JSON(models.APIResponse{
			Success: true,
			Data: fiber.Map{
				"loop_id":      loopID,
				"is_chain":     true,
				"participants": participantsDetails,
				"edges":        edges,
				"status":       status,
			},
		})
	}

	// Backward-compatible support for cached auto suggestions: auto_{tradeID}_{user3ID}
	// This allows clients to view loop details before the chain row is materialized.
	if strings.HasPrefix(loopID, "auto_") {
		parts := strings.Split(loopID, "_")
		if len(parts) != 3 {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid loop ID format"})
		}

		tradeID, err := strconv.Atoi(parts[1])
		if err != nil || tradeID <= 0 {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid loop ID: bad trade reference"})
		}

		u3ID, err := strconv.Atoi(parts[2])
		if err != nil || u3ID <= 0 {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid loop ID: bad participant reference"})
		}

		log.Printf("[GetTradeLoop] auto invite detected: tradeID=%d user3ID=%d", tradeID, u3ID)

		// Fetch original trade (U1 -> U2)
		var u1ID, u2ID, u2PID int
		err = h.db.QueryRow("SELECT buyer_id, seller_id, target_product_id, status FROM trades WHERE id = ?", tradeID).
			Scan(&u1ID, &u2ID, &u2PID, new(string))
		if err != nil {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Original trade not found"})
		}

		// Find the specific User3 match (so we know what product User3 is offering)
		matches, err := services.FindMultiwayMatch(h.db, u1ID, u2ID, tradeID, []int{})
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to validate loop participants"})
		}

		var selected *services.MultiwayMatch
		for i := range matches {
			if matches[i].User3ID == u3ID {
				selected = &matches[i]
				break
			}
		}
		if selected == nil {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Multi-way chain not found"})
		}

		u3PID := selected.User3ProductID

		// Fetch names
		var u1Name, u2Name, u3Name string
		_ = h.db.QueryRow("SELECT name FROM users WHERE id = ?", u1ID).Scan(&u1Name)
		_ = h.db.QueryRow("SELECT name FROM users WHERE id = ?", u2ID).Scan(&u2Name)
		_ = h.db.QueryRow("SELECT name FROM users WHERE id = ?", u3ID).Scan(&u3Name)

		// Fetch U3's wanted product (which is U1's offered product)
		var u3WantedPID int
		_ = h.db.QueryRow(`
			SELECT ti.product_id
			FROM trade_items ti
			WHERE ti.trade_id = ? AND ti.offered_by = 'buyer'
			LIMIT 1
		`, tradeID).Scan(&u3WantedPID)

		// Fetch product titles
		var u1Title, u2Title, u3Title string
		_ = h.db.QueryRow("SELECT title FROM products WHERE id = ?", u3WantedPID).Scan(&u1Title)
		_ = h.db.QueryRow("SELECT title FROM products WHERE id = ?", u2PID).Scan(&u2Title)
		_ = h.db.QueryRow("SELECT title FROM products WHERE id = ?", u3PID).Scan(&u3Title)

		// Check if user is participant
		if userID != u1ID && userID != u2ID && userID != u3ID {
			return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You are not a participant in this multi-way trade"})
		}

		participantsDetails := []map[string]interface{}{
			{"user_id": u1ID, "user_name": u1Name, "product_id": u3WantedPID, "product_title": u1Title, "position": 0},
			{"user_id": u2ID, "user_name": u2Name, "product_id": u2PID, "product_title": u2Title, "position": 1},
			{"user_id": u3ID, "user_name": u3Name, "product_id": u3PID, "product_title": u3Title, "position": 2},
		}

		edges := []map[string]interface{}{
			{"from_user": u1ID, "to_user": u2ID, "from_user_name": u1Name, "to_user_name": u2Name, "product_title": u2Title},
			{"from_user": u2ID, "to_user": u3ID, "from_user_name": u2Name, "to_user_name": u3Name, "product_title": u3Title},
			{"from_user": u3ID, "to_user": u1ID, "from_user_name": u3Name, "to_user_name": u1Name, "product_title": u1Title},
		}

		// If the chain row already exists, prefer its status.
		status := "pending_user3"
		chainID := fmt.Sprintf("chain_%d_%d_%d_%d", tradeID, u1ID, u2ID, u3ID)
		_ = h.db.QueryRow("SELECT status FROM multiway_trades WHERE chain_id = ?", chainID).Scan(&status)

		return c.JSON(models.APIResponse{
			Success: true,
			Data: fiber.Map{
				"loop_id":      loopID,
				"is_chain":     true,
				"participants": participantsDetails,
				"edges":        edges,
				"status":       status,
			},
		})
	}

	// Verify loop exists and user is part of it. For simplicity in this implementation,
	// we will reconstruct the loop from the trade IDs in the string.
	parts := strings.Split(loopID, "_")
	if len(parts) < 3 || parts[0] != "loop" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid loop ID"})
	}

	var edges []map[string]interface{}
	var participantsDetails []map[string]interface{}
	involvesUser := false
	allTradesActive := true

	// Use loop agreements to represent participant confirmation status.
	agreementStatusByUser := map[int]string{}
	rowsAgreements, err := h.db.Query(`
		SELECT user_id, status
		FROM trade_loop_agreements
		WHERE loop_id = ?
	`, loopID)
	if err == nil {
		defer rowsAgreements.Close()
		var uid int
		var st string
		for rowsAgreements.Next() {
			if scanErr := rowsAgreements.Scan(&uid, &st); scanErr == nil {
				agreementStatusByUser[uid] = st
			}
		}
	}

	for i := 1; i < len(parts); i++ {
		tradeIDStr := parts[i]
		tradeID, err := strconv.Atoi(tradeIDStr)
		if err != nil {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid trade ID in loop"})
		}

		var buyerID, sellerID, targetProductID int
		var tradeStatus string
		err = h.db.QueryRow("SELECT buyer_id, seller_id, target_product_id, status FROM trades WHERE id = ?", tradeID).Scan(&buyerID, &sellerID, &targetProductID, &tradeStatus)
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

		participantsDetails = append(participantsDetails, map[string]interface{}{
			"user_id":       buyerID,
			"user_name":     fromUserName,
			"product_id":    targetProductID,
			"product_title": productTitle,
			"trade_id":      tradeID,
			"trade_status": func() string {
				if s, ok := agreementStatusByUser[buyerID]; ok {
					return s
				}
				return "pending"
			}(),
			"position_in_loop": i - 1,
		})

		edges = append(edges, map[string]interface{}{
			"from_user":      buyerID,
			"from_user_name": fromUserName,
			"to_user":        sellerID,
			"to_user_name":   toUserName,
			"trade_id":       tradeID,
			"product_title":  productTitle,
			"status":         tradeStatus,
		})

		if tradeStatus != "active" {
			allTradesActive = false
		}
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
			"status": func() string {
				if allTradesActive {
					return "completed"
				}
				return "active"
			}(),
		},
	})
}

// AcceptTradeLoop
func (h *TradeHandler) AcceptTradeLoop(c *fiber.Ctx) error {
	loopID := c.Params("id") // Format: loop_tradeid1_tradeid2_tradeid3
	log.Printf("[AcceptTradeLoop] raw loopID=%q", loopID)

	// Backward-compatible support for cached auto suggestions: auto_{tradeID}_{user3ID}
	// IMPORTANT: parse this upfront so later loop_id guards never treat `auto_*` as invalid.
	isAutoInvite := strings.HasPrefix(loopID, "auto_")
	var autoTradeID int
	var autoSuggestedUser3ID int

	if isAutoInvite {
		parts := strings.Split(loopID, "_")
		if len(parts) != 3 {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid loop ID format"})
		}

		tradeID, err := strconv.Atoi(parts[1])
		if err != nil || tradeID <= 0 {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid loop ID: bad trade reference"})
		}
		suggestedUser3ID, err := strconv.Atoi(parts[2])
		if err != nil || suggestedUser3ID <= 0 {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid loop ID: bad participant reference"})
		}

		autoTradeID = tradeID
		autoSuggestedUser3ID = suggestedUser3ID
	}

	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	// Determine subscription tier for access + quota enforcement.
	var isPremium bool
	if err := h.db.QueryRow("SELECT is_premium FROM users WHERE id = ?", userID).Scan(&isPremium); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to verify subscription tier"})
	}

	if isAutoInvite {
		log.Printf("[AcceptTradeLoop:auto] initiatorUserID=%d tradeID=%d suggestedUser3ID=%d", userID, autoTradeID, autoSuggestedUser3ID)

		// Free users cannot manually initiate loops (auto_*).
		if !isPremium {
			return c.Status(403).JSON(models.APIResponse{
				Success: false,
				Error:   "You're a great match to start a loop here — Pro members can initiate. Upgrade to unlock.",
			})
		}

		var buyerID, sellerID int
		var tradeStatus string
		tradeQuery := "SELECT buyer_id, seller_id, status FROM trades WHERE id = ?"
		log.Printf("[AcceptTradeLoop:auto] query=%s args=[%d]", tradeQuery, autoTradeID)
		err := h.db.QueryRow(tradeQuery, autoTradeID).Scan(&buyerID, &sellerID, &tradeStatus)
		if err != nil {
			log.Printf("[AcceptTradeLoop:auto] trades lookup failed tradeID=%d err=%v", autoTradeID, err)
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Loop no longer exists. Please refresh your dashboard."})
		}
		log.Printf("[AcceptTradeLoop:auto] trades row: buyerID=%d sellerID=%d status=%s", buyerID, sellerID, tradeStatus)

		if userID != buyerID && userID != sellerID {
			log.Printf("[AcceptTradeLoop:auto] unauthorized: initiatorUserID=%d buyerID=%d sellerID=%d", userID, buyerID, sellerID)
			return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You are not allowed to join this loop."})
		}

		if tradeStatus != "pending" && tradeStatus != "pending_multiway" {
			log.Printf("[AcceptTradeLoop:auto] invalid trade status: %s", tradeStatus)
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "This loop is no longer active."})
		}

		matches, err := services.FindMultiwayMatch(h.db, buyerID, sellerID, autoTradeID, []int{})
		if err != nil {
			log.Printf("[AcceptTradeLoop:auto] FindMultiwayMatch failed err=%v", err)
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to validate loop participants"})
		}

		var selected *services.MultiwayMatch
		for i := range matches {
			if matches[i].User3ID == autoSuggestedUser3ID {
				selected = &matches[i]
				break
			}
		}

		if selected == nil {
			log.Printf("[AcceptTradeLoop:auto] no matching User3 found user3ID=%d tradeID=%d buyerID=%d sellerID=%d", autoSuggestedUser3ID, autoTradeID, buyerID, sellerID)
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "This loop invite is no longer available. Please refresh and try another match."})
		}

		chainID := fmt.Sprintf("chain_%d_%d_%d_%d", autoTradeID, buyerID, sellerID, selected.User3ID)
		log.Printf("[AcceptTradeLoop:auto] computed chainID=%s (user3_product_id=%d)", chainID, selected.User3ProductID)

		// Move original trade into multi-way matching state.
		updateQuery := "UPDATE trades SET status='pending_multiway', updated_at=CURRENT_TIMESTAMP WHERE id = ?"
		log.Printf("[AcceptTradeLoop:auto] query=%s args=[%d]", updateQuery, autoTradeID)
		if res, err := h.db.Exec(updateQuery, autoTradeID); err != nil {
			log.Printf("[AcceptTradeLoop:auto] update trades failed err=%v", err)
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to activate multi-way loop"})
		} else {
			ra, _ := res.RowsAffected()
			log.Printf("[AcceptTradeLoop:auto] update trades rows_affected=%d", ra)
		}

		var existing int
		countQuery := "SELECT COUNT(*) FROM multiway_trades WHERE chain_id = ?"
		log.Printf("[AcceptTradeLoop:auto] query=%s args=[%s]", countQuery, chainID)
		if err := h.db.QueryRow(countQuery, chainID).Scan(&existing); err != nil {
			log.Printf("[AcceptTradeLoop:auto] count multiway_trades failed err=%v", err)
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to validate multi-way invitation"})
		}
		log.Printf("[AcceptTradeLoop:auto] existing multiway_trades for chain_id=%s => %d", chainID, existing)

		if existing == 0 {
			insertQuery := `
				INSERT INTO multiway_trades (chain_id, original_trade_id, initiator_user_id, user1_id, user2_id, user3_id, status)
				VALUES (?, ?, ?, ?, ?, ?, 'pending_user3')
			`
			log.Printf("[AcceptTradeLoop:auto] query=%s args=[chain_id=%s original_trade_id=%d initiator_user_id=%d user1_id=%d user2_id=%d user3_id=%d]",
				strings.TrimSpace(insertQuery), chainID, autoTradeID, userID, buyerID, sellerID, selected.User3ID)

			if _, err := h.db.Exec(insertQuery, chainID, autoTradeID, userID, buyerID, sellerID, selected.User3ID); err != nil {
				log.Printf("[AcceptTradeLoop:auto] insert multiway_trades failed err=%v", err)
				return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to create loop invitation"})
			}

			notifMsg := fmt.Sprintf("Someone wants your %s and has something you like! Check your multi-way opportunities.", selected.User3ProductTitle)
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_loop', ?, FALSE)", selected.User3ID, notifMsg)
			publishNotification(selected.User3ID, notifMsg)
			publishToUser(selected.User3ID, sseEvent{Type: "multiway_opportunity", Data: fiber.Map{"chain_id": chainID}})
		}

		go h.rebuildTradeLoopCacheForUsers([]int{buyerID, sellerID, selected.User3ID})

		return c.JSON(models.APIResponse{
			Success: true,
			Message: "Loop invite sent. Waiting for participant to hop in.",
			Data: fiber.Map{
				"loop_id":  chainID,
				"chain_id": chainID,
				"status":   "pending_user3",
			},
		})
	}

	// 1. Verify loop exists and user is part of it
	parts := strings.Split(loopID, "_")
	if len(parts) < 3 || parts[0] != "loop" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid loop ID"})
	}

	tradeIDs := []int{}
	participantIDs := make(map[int]bool)
	involvesUser := false

	for i := 1; i < len(parts); i++ {
		tid, _ := strconv.Atoi(parts[i])
		tradeIDs = append(tradeIDs, tid)

		var bID, sID int
		err := h.db.QueryRow("SELECT buyer_id, seller_id FROM trades WHERE id = ?", tid).Scan(&bID, &sID)
		if err != nil {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: fmt.Sprintf("Trade %d not found", tid)})
		}
		participantIDs[bID] = true
		participantIDs[sID] = true
		if bID == userID || sID == userID {
			involvesUser = true
		}
	}

	if !involvesUser {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You are not a participant in this loop"})
	}

	// If the loop has been cancelled, prevent further participation changes.
	var cancelledBy int
	if err := h.db.QueryRow("SELECT cancelled_by FROM trade_loop_cancellations WHERE loop_id = ? LIMIT 1", loopID).Scan(&cancelledBy); err == nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "This loop has been cancelled."})
	} else if err != sql.ErrNoRows {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to verify loop cancellation state"})
	}

	// Free tier: enforce monthly quota for auto-match loop participations.
	// Pro users have unlimited participation.
	if !isPremium {
		// If already accepted this loop, don't burn quota again.
		var existingStatus string
		_ = h.db.QueryRow("SELECT status FROM trade_loop_agreements WHERE loop_id = ? AND user_id = ?", loopID, userID).Scan(&existingStatus)
		if existingStatus != "accepted" {
			period := time.Now().Format("2006-01")
			limit := 2

			_, _ = h.db.Exec(`
				INSERT INTO loop_quota_usage (user_id, period, used, limit)
				VALUES (?, ?, 0, ?)
				ON DUPLICATE KEY UPDATE limit = limit
			`, userID, period, limit)

			res, qErr := h.db.Exec(`
				UPDATE loop_quota_usage
				SET used = used + 1
				WHERE user_id = ? AND period = ? AND used < limit
			`, userID, period)
			if qErr != nil {
				return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to enforce loop quota"})
			}

			ra, _ := res.RowsAffected()
			if ra == 0 {
				return c.Status(403).JSON(models.APIResponse{
					Success: false,
					Error:   "You've used your free loop matches this month — upgrade to Pro for unlimited.",
				})
			}
		}
	}

	// 2. Record acceptance
	_, err := h.db.Exec(`
		INSERT INTO trade_loop_agreements (loop_id, user_id, status)
		VALUES (?, ?, 'accepted')
		ON DUPLICATE KEY UPDATE status = 'accepted'
	`, loopID, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to record agreement"})
	}

	// 3. Check if all participants accepted
	var acceptedCount int
	err = h.db.QueryRow("SELECT COUNT(*) FROM trade_loop_agreements WHERE loop_id = ? AND status = 'accepted'", loopID).Scan(&acceptedCount)

	if acceptedCount >= len(participantIDs) {
		// All accepted! Execute.
		go h.rebuildTradeLoopCacheForUsers(mapKeysToSlice(participantIDs))
		return h.ExecuteTradeLoop(c)
	}

	for pid := range participantIDs {
		if pid == userID {
			continue
		}
		msg := "A participant accepted the trade loop. Waiting for all confirmations."
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_loop', ?, FALSE)", pid, msg)
		publishNotification(pid, msg)
	}
	go h.rebuildTradeLoopCacheForUsers(mapKeysToSlice(participantIDs))

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "You have accepted the trade loop. Waiting for other participants.",
		Data: fiber.Map{
			"accepted_count": acceptedCount,
			"target_count":   len(participantIDs),
		},
	})
}

// DeclineTradeLoop
func (h *TradeHandler) DeclineTradeLoop(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	loopID := c.Params("id")
	log.Printf("[DeclineTradeLoop] userID=%d raw loopID=%q", userID, loopID)

	// Prevent declining/collaborating on cancelled loops.
	var cancelledBy int
	if err := h.db.QueryRow("SELECT cancelled_by FROM trade_loop_cancellations WHERE loop_id = ? LIMIT 1", loopID).Scan(&cancelledBy); err == nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "This loop has been cancelled."})
	} else if err != sql.ErrNoRows {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to verify loop cancellation state"})
	}

	_, err := h.db.Exec(`
		INSERT INTO trade_loop_agreements (loop_id, user_id, status)
		VALUES (?, ?, 'declined')
		ON DUPLICATE KEY UPDATE status = 'declined'
	`, loopID, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to record decline"})
	}
	go h.rebuildTradeLoopCacheForUsers([]int{userID})

	return c.JSON(models.APIResponse{Success: true, Message: "Trade loop declined"})
}

// GetLoopQuota returns the current free-tier monthly loop hop usage.
// Free users have unlimited hops for their first 30 days; after that, 5 per month.
func (h *TradeHandler) GetLoopQuota(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	var isPremium bool
	var createdAt time.Time
	if err := h.db.QueryRow("SELECT is_premium, created_at FROM users WHERE id = ?", userID).Scan(&isPremium, &createdAt); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to verify subscription tier"})
	}

	period := time.Now().Format("2006-01")
	if isPremium {
		return c.JSON(models.APIResponse{
			Success: true,
			Data: fiber.Map{
				"unlimited": true,
				"period":    period,
				"used":      0,
				"limit":     0,
			},
		})
	}

	// Check if user is within 30 days of signup (unlimited trial period)
	daysSinceSignup := int(time.Since(createdAt).Hours() / 24)
	if daysSinceSignup <= 30 {
		return c.JSON(models.APIResponse{
			Success: true,
			Data: fiber.Map{
				"unlimited": true,
				"trial":     true,
				"period":    period,
				"used":      0,
				"limit":     0,
			},
		})
	}

	limit := 5
	used := 0
	err := h.db.QueryRow("SELECT used FROM loop_quota_usage WHERE user_id = ? AND period = ?", userID, period).Scan(&used)
	if err != nil && err != sql.ErrNoRows {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch loop quota"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"unlimited": false,
			"period":    period,
			"used":      used,
			"limit":     limit,
		},
	})
}

// CancelTradeLoop stops a detected loop from executing further.
// Pro only.
func (h *TradeHandler) CancelTradeLoop(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	var isPremium bool
	if err := h.db.QueryRow("SELECT is_premium FROM users WHERE id = ?", userID).Scan(&isPremium); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to verify subscription tier"})
	}
	if !isPremium {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Pro members only"})
	}

	loopID := c.Params("id") // format: chain_tradeID_buyerID_sellerID_user3ID

	// Get multiway_trades record and participants
	var user2ID, user3ID sql.NullInt64
	var canceller string
	if err := h.db.QueryRow(`
		SELECT user2_id, COALESCE(user3_id, 0)
		FROM multiway_trades
		WHERE chain_id = ?
	`, loopID).Scan(&user2ID, &user3ID); err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Loop not found"})
	}

	// Get canceller name for notification
	_ = h.db.QueryRow("SELECT name FROM users WHERE id = ?", userID).Scan(&canceller)
	if canceller == "" {
		canceller = "The loop initiator"
	}

	// Update multiway_trades with cancellation info
	_, err := h.db.Exec(`
		UPDATE multiway_trades
		SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancelled_by = ?
		WHERE chain_id = ?
	`, userID, loopID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to cancel loop"})
	}

	// Notify participants
	cancelMsg := fmt.Sprintf("%s cancelled the loop", canceller)
	participantIDs := []int{}
	if user2ID.Valid {
		participantIDs = append(participantIDs, int(user2ID.Int64))
		h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_loop', ?, FALSE)", user2ID.Int64, cancelMsg)
		publishNotification(int(user2ID.Int64), cancelMsg)
	}
	if user3ID.Valid && user3ID.Int64 > 0 {
		participantIDs = append(participantIDs, int(user3ID.Int64))
		h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_loop', ?, FALSE)", user3ID.Int64, cancelMsg)
		publishNotification(int(user3ID.Int64), cancelMsg)
	}

	// Refund quota for free-tier participants who were using a quota slot
	period := time.Now().Format("2006-01")
	for _, participantID := range participantIDs {
		var isPremiumParticipant bool
		if err := h.db.QueryRow("SELECT is_premium FROM users WHERE id = ?", participantID).Scan(&isPremiumParticipant); err == nil && !isPremiumParticipant {
			// Refund 1 quota slot
			_, _ = h.db.Exec(`
				UPDATE loop_quota_usage
				SET used = GREATEST(0, used - 1)
				WHERE user_id = ? AND period = ?
			`, participantID, period)
		}
	}

	// Add to cancellations table for tracking
	_, _ = h.db.Exec(`
		INSERT INTO trade_loop_cancellations (loop_id, cancelled_by)
		VALUES (?, ?)
		ON DUPLICATE KEY UPDATE cancelled_by = VALUES(cancelled_by)
	`, loopID, userID)

	// Rebuild cache for all participants
	go h.rebuildTradeLoopCacheForUsers(participantIDs)

	return c.JSON(models.APIResponse{Success: true, Message: "Loop cancelled and participants notified"})
}

// ReinviteTradeLoop re-enables a cancelled detected loop by clearing agreements and the cancellation record.
// Pro only.
func (h *TradeHandler) ReinviteTradeLoop(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	var isPremium bool
	if err := h.db.QueryRow("SELECT is_premium FROM users WHERE id = ?", userID).Scan(&isPremium); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to verify subscription tier"})
	}
	if !isPremium {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Pro members only"})
	}

	loopID := c.Params("id")

	_, err := h.db.Exec("DELETE FROM trade_loop_cancellations WHERE loop_id = ?", loopID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to reinvite loop"})
	}
	_, err = h.db.Exec("DELETE FROM trade_loop_agreements WHERE loop_id = ?", loopID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to reset loop agreements"})
	}

	// Best-effort cache rebuild for participants.
	parts := strings.Split(loopID, "_")
	if len(parts) >= 3 && parts[0] == "loop" {
		participantIDs := map[int]bool{}
		for i := 1; i < len(parts); i++ {
			tid, _ := strconv.Atoi(parts[i])
			var bID, sID int
			if err := h.db.QueryRow("SELECT buyer_id, seller_id FROM trades WHERE id = ?", tid).Scan(&bID, &sID); err == nil {
				participantIDs[bID] = true
				participantIDs[sID] = true
			}
		}
		go h.rebuildTradeLoopCacheForUsers(mapKeysToSlice(participantIDs))
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Loop reinvited"})
}

// CleanupExpiredPendingInitiatorUpgrades removes pending_initiator_upgrade records that have expired (7 days old)
// and notifies initiators to upgrade or their matches will be lost.
func (h *TradeHandler) CleanupExpiredPendingInitiatorUpgrades() {
	rows, err := h.db.Query(`
		SELECT id, chain_id, initiator_user_id
		FROM multiway_trades
		WHERE status = 'pending_initiator_upgrade'
		AND expires_at IS NOT NULL
		AND expires_at <= NOW()
	`)
	if err != nil {
		log.Printf("CleanupExpiredPendingInitiatorUpgrades: query failed: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var loopID string
		var initiatorID int
		var recordID int
		if err := rows.Scan(&recordID, &loopID, &initiatorID); err != nil {
			continue
		}

		// Update status to expired
		_, err := h.db.Exec(`
			UPDATE multiway_trades
			SET status = 'cancelled'
			WHERE id = ?
		`, recordID)
		if err != nil {
			continue
		}

		// Notify initiator
		msg := "Your loop match expired. Upgrade to Pro to get matched again with similar traders."
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_loop', ?, FALSE)", initiatorID, msg)
		publishNotification(initiatorID, msg)
		log.Printf("CleanupExpiredPendingInitiatorUpgrades: expired and notified loop %s (initiator %d)", loopID, initiatorID)
	}
}

// ExecuteTradeLoop
func (h *TradeHandler) ExecuteTradeLoop(c *fiber.Ctx) error {
	loopID := c.Params("id")
	parts := strings.Split(loopID, "_")

	// Prevent executing cancelled loops.
	var cancelledBy int
	if err := h.db.QueryRow("SELECT cancelled_by FROM trade_loop_cancellations WHERE loop_id = ? LIMIT 1", loopID).Scan(&cancelledBy); err == nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "This loop has been cancelled."})
	} else if err != sql.ErrNoRows {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to verify loop cancellation state"})
	}

	// Start transaction
	tx, err := h.db.Begin()
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to start transaction"})
	}
	defer tx.Rollback()

	tradeIDs := []int{}
	for i := 1; i < len(parts); i++ {
		tid, _ := strconv.Atoi(parts[i])
		tradeIDs = append(tradeIDs, tid)

		// 1. Update trade status to 'active' (since it's now a multi-way commitment)
		_, err = tx.Exec("UPDATE trades SET status = 'active' WHERE id = ?", tid)
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update trade status"})
		}

		// 2. Lock the target product
		var targetProductID int
		err = tx.QueryRow("SELECT target_product_id FROM trades WHERE id = ?", tid).Scan(&targetProductID)
		if err == nil {
			tx.Exec("UPDATE products SET status = 'locked' WHERE id = ?", targetProductID)
		}

		// 3. Lock offered products
		rows, _ := tx.Query("SELECT product_id FROM trade_items WHERE trade_id = ?", tid)
		for rows.Next() {
			var pid int
			rows.Scan(&pid)
			tx.Exec("UPDATE products SET status = 'locked' WHERE id = ?", pid)
		}
		rows.Close()
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to commit transaction"})
	}

	participantIDs := map[int]bool{}
	for _, tid := range tradeIDs {
		var bID, sID int
		if err := h.db.QueryRow("SELECT buyer_id, seller_id FROM trades WHERE id = ?", tid).Scan(&bID, &sID); err == nil {
			participantIDs[bID] = true
			participantIDs[sID] = true
		}
	}
	go h.rebuildTradeLoopCacheForUsers(mapKeysToSlice(participantIDs))

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Multi-way trade loop executed successfully! All trades are now active.",
	})
}

// GetTradeLoopNotifications returns notifications specifically related to trade loops
func (h *TradeHandler) GetTradeLoopNotifications(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	rows, err := h.db.Query(`
		SELECT id, message, created_at, is_read 
		FROM notifications 
		WHERE user_id = ? AND type = 'trade_loop' AND is_read = FALSE
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch notifications"})
	}
	defer rows.Close()

	var notifs []map[string]interface{}
	for rows.Next() {
		var id int
		var message, createdAt string
		var read bool
		if err := rows.Scan(&id, &message, &createdAt, &read); err == nil {
			notifs = append(notifs, map[string]interface{}{
				"id":                strconv.Itoa(id),
				"type":              "trade_loop",
				"message":           message,
				"participant_count": 0,     // We can compute this if worth it, but 0 is safe
				"loop_id":           "all", // Directs user to the loops list
				"created_at":        createdAt,
				"read":              read,
			})
		}
	}

	if notifs == nil {
		notifs = []map[string]interface{}{}
	}

	return c.JSON(models.APIResponse{Success: true, Data: notifs})
}

// MarkLoopNotificationRead marks a trade loop notification as read
func (h *TradeHandler) MarkLoopNotificationRead(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	notifID := c.Params("id")
	_, err := h.db.Exec("UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?", notifID, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update notification"})
	}

	return c.JSON(models.APIResponse{Success: true})
}

// ClearLoopNotifications marks all loop notifications as read/cleared
func (h *TradeHandler) ClearLoopNotifications(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	_, err := h.db.Exec("UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND type = 'trade_loop'", userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to clear notifications"})
	}

	return c.JSON(models.APIResponse{Success: true})
}

// DebugMultiwayMatch explains why a trade did or did not qualify for a multi-way suggestion.
// Admin-only route used by the dashboard debug panel.
func (h *TradeHandler) DebugMultiwayMatch(c *fiber.Ctx) error {
	tradeID, err := strconv.Atoi(c.Query("trade_id", "0"))
	if err != nil || tradeID <= 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "trade_id is required and must be a positive integer"})
	}

	compareTradeID := 0
	compareRaw := strings.TrimSpace(c.Query("compare_trade_id", ""))
	if compareRaw != "" {
		compareTradeID, err = strconv.Atoi(compareRaw)
		if err != nil || compareTradeID <= 0 {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "compare_trade_id must be a positive integer when provided"})
		}
	}

	overrideInitiatorUserID := 0
	initiatorRaw := strings.TrimSpace(c.Query("initiator_user_id", ""))
	if initiatorRaw != "" {
		overrideInitiatorUserID, err = strconv.Atoi(initiatorRaw)
		if err != nil || overrideInitiatorUserID <= 0 {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "initiator_user_id must be a positive integer when provided"})
		}
	}

	analyze := func(id int) (fiber.Map, error) {
		var buyerID, sellerID int
		var status string
		err := h.db.QueryRow("SELECT buyer_id, seller_id, status FROM trades WHERE id = ?", id).Scan(&buyerID, &sellerID, &status)
		if err != nil {
			if err == sql.ErrNoRows {
				return nil, fmt.Errorf("trade %d not found", id)
			}
			return nil, fmt.Errorf("failed to load trade %d", id)
		}

		initiatorUserID := sellerID
		if overrideInitiatorUserID > 0 {
			initiatorUserID = overrideInitiatorUserID
		}

		var initiatorIsPremium bool
		if err := h.db.QueryRow("SELECT is_premium FROM users WHERE id = ?", initiatorUserID).Scan(&initiatorIsPremium); err != nil {
			return nil, fmt.Errorf("failed to load initiator subscription for trade %d", id)
		}

		matches, debugInfo, err := services.FindMultiwayMatchDetailed(h.db, buyerID, sellerID, id, []int{})
		if err != nil {
			return nil, fmt.Errorf("matcher failed for trade %d", id)
		}

		recommendedLoopStatus := "no_match"
		if len(matches) > 0 {
			recommendedLoopStatus = "pending_user3"
			if !initiatorIsPremium {
				recommendedLoopStatus = "pending_initiator_upgrade"
			}
		}

		result := fiber.Map{
			"trade_id":                id,
			"trade_status":            status,
			"buyer_id":                buyerID,
			"seller_id":               sellerID,
			"initiator_user_id":       initiatorUserID,
			"initiator_is_premium":    initiatorIsPremium,
			"recommended_loop_status": recommendedLoopStatus,
			"match_count":             len(matches),
			"top_match":               nil,
			"debug":                   debugInfo,
		}

		if len(matches) > 0 {
			result["top_match"] = matches[0]
		}

		return result, nil
	}

	primary, err := analyze(tradeID)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: err.Error()})
	}

	data := fiber.Map{"primary": primary}
	if compareTradeID > 0 {
		comparison, cmpErr := analyze(compareTradeID)
		if cmpErr != nil {
			data["comparison_error"] = cmpErr.Error()
		} else {
			data["comparison"] = comparison
		}
	}

	return c.JSON(models.APIResponse{Success: true, Data: data})
}

// GetMultiwayOpportunities returns multi-way chains where the user is User 3
func (h *TradeHandler) GetMultiwayOpportunities(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	rows, err := h.db.Query(`
		SELECT mw.chain_id, mw.original_trade_id, mw.user1_id, mw.user2_id, mw.status,
		       u1.name as user1_name, u2.name as user2_name,
		       t.target_product_id as user2_wanted_product_id,
		       p2.title as user2_wanted_title
		FROM multiway_trades mw
		JOIN users u1 ON u1.id = mw.user1_id
		JOIN users u2 ON u2.id = mw.user2_id
		JOIN trades t ON t.id = mw.original_trade_id
		JOIN products p2 ON p2.id = t.target_product_id
		WHERE mw.user3_id = ? AND mw.status = 'pending_user3'
	`, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch opportunities"})
	}
	defer rows.Close()

	var opportunities []fiber.Map
	for rows.Next() {
		var o fiber.Map = make(fiber.Map)
		var chainID, status, u1Name, u2Name, pTitle string
		var tID, u1ID, u2ID, pID int
		if err := rows.Scan(&chainID, &tID, &u1ID, &u2ID, &status, &u1Name, &u2Name, &pID, &pTitle); err == nil {
			o["chain_id"] = chainID
			o["original_trade_id"] = tID
			o["user1_id"] = u1ID
			o["user1_name"] = u1Name
			o["user2_id"] = u2ID
			o["user2_name"] = u2Name
			o["user2_wanted_product_id"] = pID
			o["user2_wanted_title"] = pTitle
			o["status"] = status
			opportunities = append(opportunities, o)
		}
	}

	return c.JSON(models.APIResponse{Success: true, Data: opportunities})
}

// AcceptMultiwayChain is when User 3 accepts the opportunity
func (h *TradeHandler) AcceptMultiwayChain(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	chainID := c.Params("id")

	// Determine subscription tier for quota enforcement.
	var isPremium bool
	if err := h.db.QueryRow("SELECT is_premium FROM users WHERE id = ?", userID).Scan(&isPremium); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to verify subscription tier"})
	}

	// Start transaction to keep quota + acceptance consistent.
	tx, err := h.db.Begin()
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to start transaction"})
	}
	defer tx.Rollback()

	// Verify user is User 3 for this chain (lock the row).
	var user1ID, user2ID, originalTradeID int
	var user3ProductID sql.NullInt64
	err = tx.QueryRow(`
		SELECT user1_id, user2_id, original_trade_id, user3_product_id
		FROM multiway_trades
		WHERE chain_id = ? AND user3_id = ? AND status = 'pending_user3'
		FOR UPDATE
	`, chainID, userID).Scan(&user1ID, &user2ID, &originalTradeID, &user3ProductID)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Opportunity not found or already processed"})
	}

	// Fetch product IDs from the original trade for leg creation.
	var u1ProductID, u2ProductID int
	_ = tx.QueryRow(`
		SELECT ti.product_id, t.target_product_id
		FROM trades t
		JOIN trade_items ti ON ti.trade_id = t.id
		WHERE t.id = ?
		LIMIT 1
	`, originalTradeID).Scan(&u1ProductID, &u2ProductID)

	// Free tier: enforce monthly quota for auto-match loop hops.
	if !isPremium {
		period := time.Now().Format("2006-01")
		limit := 2

		_, _ = tx.Exec(`
			INSERT INTO loop_quota_usage (user_id, period, used, limit)
			VALUES (?, ?, 0, ?)
			ON DUPLICATE KEY UPDATE limit = limit
		`, userID, period, limit)

		res, qErr := tx.Exec(`
			UPDATE loop_quota_usage
			SET used = used + 1
			WHERE user_id = ? AND period = ? AND used < limit
		`, userID, period)
		if qErr != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to enforce loop quota"})
		}

		ra, _ := res.RowsAffected()
		if ra == 0 {
			return c.Status(403).JSON(models.APIResponse{
				Success: false,
				Error:   "You've used your free loop matches this month — upgrade to Pro for unlimited.",
			})
		}
	}

	// In a real implementation we would create a 3-way agreement or a special multiway trade record.
	// For now, let's mark it as accepted and notify participants.
	_, err = tx.Exec("UPDATE multiway_trades SET status = 'user3_accepted' WHERE chain_id = ?", chainID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to accept multi-way chain"})
	}

	// Update original trade status to multiway_active
	_, _ = tx.Exec("UPDATE trades SET status = 'multiway_active' WHERE id = (SELECT original_trade_id FROM multiway_trades WHERE chain_id = ?)", chainID)

	// Create per-leg records for the 3 handoffs (Phase 2: per-leg tracking).
	// Leg 0: User1 → User2 (User1 gives their product to User2)
	// Leg 1: User2 → User3 (User2 gives their product to User3)
	// Leg 2: User3 → User1 (User3 gives their product to User1)
	u3PID := 0
	if user3ProductID.Valid {
		u3PID = int(user3ProductID.Int64)
	}
	legs := []struct {
		idx     int
		from    int
		to      int
		product int
	}{
		{0, user1ID, user2ID, u1ProductID},
		{1, user2ID, userID, u2ProductID},
		{2, userID, user1ID, u3PID},
	}
	for _, leg := range legs {
		if leg.product > 0 {
			_, _ = tx.Exec(`
				INSERT INTO multiway_trade_legs (chain_id, leg_index, from_user_id, to_user_id, product_id, status)
				VALUES (?, ?, ?, ?, ?, 'pending')
				ON DUPLICATE KEY UPDATE updated_at = NOW()
			`, chainID, leg.idx, leg.from, leg.to, leg.product)
		}
	}

	// Commit DB changes before side effects (notifications/cache rebuild).
	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to commit transaction"})
	}

	// Notify User 1 and User 2
	msg := "Good news! A third participant has accepted the multiway trade. Proceed to dashboard to finalize."
	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", user1ID, msg)
	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", user2ID, msg)
	publishNotification(user1ID, msg)
	publishNotification(user2ID, msg)
	go h.rebuildTradeLoopCacheForUsers([]int{user1ID, user2ID, userID})

	return c.JSON(models.APIResponse{Success: true, Message: "You have accepted the multi-way trade opportunity!"})
}

// DeclineMultiwayChain is when User 3 declines
func (h *TradeHandler) DeclineMultiwayChain(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	chainID := c.Params("id")

	var payload struct {
		Action string `json:"action"` // "decline" or "search_again"
	}
	_ = c.BodyParser(&payload)

	// Update chain status
	_, err := h.db.Exec("UPDATE multiway_trades SET status = 'user3_declined' WHERE chain_id = ? AND user3_id = ?", chainID, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to decline"})
	}

	if payload.Action == "search_again" {
		// Get chain details to search for NEW User 3
		var u1ID, u2ID, tradeID int
		err = h.db.QueryRow("SELECT user1_id, user2_id, original_trade_id FROM multiway_trades WHERE chain_id = ?", chainID).Scan(&u1ID, &u2ID, &tradeID)
		if err == nil {
			// Find EXCLUDED users (already declined)
			rows, _ := h.db.Query("SELECT user3_id FROM multiway_trades WHERE original_trade_id = ? AND status = 'user3_declined'", tradeID)
			excluded := []int{}
			for rows.Next() {
				var id int
				if err := rows.Scan(&id); err == nil {
					excluded = append(excluded, id)
				}
			}
			rows.Close()

			// Search for next candidate
			matches, _ := services.FindMultiwayMatch(h.db, u1ID, u2ID, tradeID, excluded)
			if len(matches) > 0 {
				match := matches[0]
				newChainID := fmt.Sprintf("chain_%d_%d_%d_%d", tradeID, u1ID, u2ID, match.User3ID)
				_, _ = h.db.Exec(`
					INSERT INTO multiway_trades (chain_id, original_trade_id, initiator_user_id, user1_id, user2_id, user3_id, status)
					VALUES (?, ?, ?, ?, ?, ?, 'pending_user3')
				`, newChainID, tradeID, u2ID, u1ID, u2ID, match.User3ID)

				// Notify the NEW User 3
				notifMsg := fmt.Sprintf("Someone wants your %s and has something you like! Check your multi-way opportunities.", match.User3ProductTitle)
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_loop', ?, FALSE)", match.User3ID, notifMsg)
				publishNotification(match.User3ID, notifMsg)
			} else {
				// No more participants found. Notify User 1 (final decline)
				// User 1 sees a normal trade decline (per requirements)
				_, _ = h.db.Exec("UPDATE trades SET status = 'declined' WHERE id = ?", tradeID)
				msg := "Your trade offer was declined."
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", u1ID, msg)
				publishNotification(u1ID, msg)

				// User 2 sees multiway declined
				msg2 := "Multi-way matching failed. No more available partners found. Product is available again."
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", u2ID, msg2)
				publishNotification(u2ID, msg2)
			}
			go h.rebuildTradeLoopCacheForUsers([]int{u1ID, u2ID, userID})
		}
	}
	go h.rebuildTradeLoopCacheForUsers([]int{userID})

	return c.JSON(models.APIResponse{Success: true, Message: "Opportunity declined"})
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 2: Per-leg status tracking, chain health, privacy-scoped views
// ──────────────────────────────────────────────────────────────────────────────

// GetChainLegs returns the legs of a multiway chain along with a health indicator.
// Privacy-scoped: users only see legs where they are sender or receiver + the overall
// health indicator ("2 of 3 legs complete").
func (h *TradeHandler) GetChainLegs(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	chainID := c.Params("id")

	// Verify this user is a participant of the chain.
	var participantCount int
	h.db.QueryRow(`
		SELECT COUNT(*) FROM multiway_trades
		WHERE chain_id = ? AND (user1_id = ? OR user2_id = ? OR user3_id = ?)
	`, chainID, userID, userID, userID).Scan(&participantCount)
	if participantCount == 0 {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not a participant of this chain"})
	}

	// Get overall health: total legs and completed legs.
	var totalLegs, completedLegs int
	h.db.QueryRow("SELECT COUNT(*), SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) FROM multiway_trade_legs WHERE chain_id = ?", chainID).Scan(&totalLegs, &completedLegs)

	// Fetch only legs the user is involved in (privacy scope).
	rows, err := h.db.Query(`
		SELECT l.id, l.leg_index, l.from_user_id, l.to_user_id, l.product_id,
		       l.handoff_method, COALESCE(l.handoff_location, '') as handoff_location,
		       COALESCE(l.handoff_time, '') as handoff_time,
		       COALESCE(l.handoff_photo_url, '') as handoff_photo_url,
		       l.status,
		       COALESCE(fu.name, '') as from_user_name,
		       COALESCE(tu.name, '') as to_user_name,
		       COALESCE(p.title, '') as product_title
		FROM multiway_trade_legs l
		JOIN users fu ON fu.id = l.from_user_id
		JOIN users tu ON tu.id = l.to_user_id
		JOIN products p ON p.id = l.product_id
		WHERE l.chain_id = ? AND (l.from_user_id = ? OR l.to_user_id = ?)
		ORDER BY l.leg_index ASC
	`, chainID, userID, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch legs"})
	}
	defer rows.Close()

	var legs []fiber.Map
	for rows.Next() {
		var legID, legIndex, fromUID, toUID, productID int
		var handoffMethod, handoffLocation, handoffTime, handoffPhotoURL, status string
		var fromName, toName, productTitle string
		if err := rows.Scan(&legID, &legIndex, &fromUID, &toUID, &productID,
			&handoffMethod, &handoffLocation, &handoffTime, &handoffPhotoURL,
			&status, &fromName, &toName, &productTitle); err != nil {
			continue
		}
		legs = append(legs, fiber.Map{
			"id":                legID,
			"leg_index":         legIndex,
			"from_user_id":      fromUID,
			"from_user_name":    fromName,
			"to_user_id":        toUID,
			"to_user_name":      toName,
			"product_id":        productID,
			"product_title":     productTitle,
			"handoff_method":    handoffMethod,
			"handoff_location":  handoffLocation,
			"handoff_time":      handoffTime,
			"handoff_photo_url": handoffPhotoURL,
			"status":            status,
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"chain_id":       chainID,
			"legs":           legs,
			"total_legs":     totalLegs,
			"completed_legs": completedLegs,
			"health":         fmt.Sprintf("%d of %d legs complete", completedLegs, totalLegs),
			"all_complete":   completedLegs == totalLegs && totalLegs > 0,
		},
	})
}

// UpdateLegHandoff lets either party in a leg choose the handoff method (meetup or delivery).
func (h *TradeHandler) UpdateLegHandoff(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	legID := c.Params("legId")

	var payload struct {
		Method   string `json:"method"`   // "meetup" or "delivery"
		Location string `json:"location"` // optional meetup location
		Time     string `json:"time"`     // optional meetup time
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}
	if payload.Method != "meetup" && payload.Method != "delivery" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Method must be 'meetup' or 'delivery'"})
	}

	// Verify the user is part of this leg.
	res, err := h.db.Exec(`
		UPDATE multiway_trade_legs
		SET handoff_method = ?, handoff_location = ?, handoff_time = ?, status = 'in_progress', updated_at = NOW()
		WHERE id = ? AND (from_user_id = ? OR to_user_id = ?) AND status IN ('pending', 'in_progress')
	`, payload.Method, payload.Location, payload.Time, legID, userID, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update handoff"})
	}
	ra, _ := res.RowsAffected()
	if ra == 0 {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Leg not found or not your leg"})
	}

	// Notify the other party.
	var otherUserID int
	var chainID string
	h.db.QueryRow("SELECT CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END, chain_id FROM multiway_trade_legs WHERE id = ?", userID, legID).Scan(&otherUserID, &chainID)
	if otherUserID > 0 {
		msg := fmt.Sprintf("Your trade partner has chosen %s for your handoff. Check your multi-way chain details.", payload.Method)
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", otherUserID, msg)
		publishNotification(otherUserID, msg)
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Handoff method updated"})
}

// CompleteLeg marks a specific leg as completed, with optional handoff photo.
// When all legs of a chain are complete, the entire chain is marked as completed.
func (h *TradeHandler) CompleteLeg(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	legID := c.Params("legId")

	var payload struct {
		HandoffPhotoURL string `json:"handoff_photo_url"`
	}
	_ = c.BodyParser(&payload)

	// Complete the leg (only the receiver confirms completion).
	res, err := h.db.Exec(`
		UPDATE multiway_trade_legs
		SET status = 'completed', completed_at = NOW(), handoff_photo_url = COALESCE(?, handoff_photo_url), updated_at = NOW()
		WHERE id = ? AND to_user_id = ? AND status IN ('pending', 'in_progress')
	`, payload.HandoffPhotoURL, legID, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to complete leg"})
	}
	ra, _ := res.RowsAffected()
	if ra == 0 {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Leg not found, not your leg to confirm, or already completed"})
	}

	// Check if ALL legs of this chain are now complete → auto-complete the chain.
	var chainID string
	h.db.QueryRow("SELECT chain_id FROM multiway_trade_legs WHERE id = ?", legID).Scan(&chainID)

	var totalLegs, completedLegs int
	h.db.QueryRow("SELECT COUNT(*), SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) FROM multiway_trade_legs WHERE chain_id = ?", chainID).Scan(&totalLegs, &completedLegs)

	// Notify the sender that the leg is complete.
	var senderID int
	h.db.QueryRow("SELECT from_user_id FROM multiway_trade_legs WHERE id = ?", legID).Scan(&senderID)
	if senderID > 0 {
		msg := fmt.Sprintf("Your handoff has been confirmed! (%d of %d legs complete)", completedLegs, totalLegs)
		_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", senderID, msg)
		publishNotification(senderID, msg)
	}

	if completedLegs == totalLegs && totalLegs > 0 {
		// All legs done → mark chain as completed.
		_, _ = h.db.Exec("UPDATE multiway_trades SET status = 'completed', updated_at = NOW() WHERE chain_id = ?", chainID)

		// Mark original trade as completed too.
		_, _ = h.db.Exec(`
			UPDATE trades SET status = 'completed', completed_at = NOW(), updated_at = NOW()
			WHERE id = (SELECT original_trade_id FROM multiway_trades WHERE chain_id = ?)
		`, chainID)

		// Mark all involved products as traded.
		_, _ = h.db.Exec(`
			UPDATE products SET status = 'traded', updated_at = NOW()
			WHERE id IN (SELECT product_id FROM multiway_trade_legs WHERE chain_id = ?)
		`, chainID)

		// Notify all participants.
		var u1ID, u2ID, u3ID int
		h.db.QueryRow("SELECT user1_id, user2_id, COALESCE(user3_id, 0) FROM multiway_trades WHERE chain_id = ?", chainID).Scan(&u1ID, &u2ID, &u3ID)
		completionMsg := "🎉 All legs of your multi-way trade are complete! Great trading!"
		for _, uid := range []int{u1ID, u2ID, u3ID} {
			if uid > 0 {
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", uid, completionMsg)
				publishNotification(uid, completionMsg)
			}
		}

		log.Printf("Multi-way chain %s fully completed (all %d legs done)", chainID, totalLegs)
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: fmt.Sprintf("Leg completed! %d of %d legs done.", completedLegs, totalLegs),
		Data: fiber.Map{
			"completed_legs": completedLegs,
			"total_legs":     totalLegs,
			"all_complete":   completedLegs == totalLegs,
		},
	})
}

// GetProductMultiwayStatus checks if a product is currently involved in an active multiway chain.
// Used by frontend to show a "Pending multi-way match" badge on listings.
func (h *TradeHandler) GetProductMultiwayStatus(c *fiber.Ctx) error {
	productID := c.Params("id")

	var chainID string
	var status string
	err := h.db.QueryRow(`
		SELECT mw.chain_id, mw.status
		FROM multiway_trades mw
		LEFT JOIN multiway_trade_legs l ON l.chain_id = mw.chain_id AND l.product_id = ?
		LEFT JOIN trades t ON t.id = mw.original_trade_id
		LEFT JOIN trade_items ti ON ti.trade_id = t.id AND ti.product_id = ?
		WHERE (l.product_id IS NOT NULL OR t.target_product_id = ? OR ti.product_id IS NOT NULL)
		  AND mw.status IN ('pending_user3', 'user3_accepted', 'active', 'searching')
		LIMIT 1
	`, productID, productID, productID).Scan(&chainID, &status)

	if err != nil {
		return c.JSON(models.APIResponse{
			Success: true,
			Data: fiber.Map{
				"in_multiway_chain": false,
			},
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"in_multiway_chain": true,
			"chain_id":          chainID,
			"chain_status":      status,
		},
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3: Chain collapse, re-match, strike system, conflict resolution, admin
// ──────────────────────────────────────────────────────────────────────────────

// BackOutChain handles a participant backing out of an already-accepted chain.
// This triggers: (1) chain collapse, (2) strike for the backer-out, (3) single-leg
// re-match attempt with a 12-hour hold for the remaining parties.
func (h *TradeHandler) BackOutChain(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	chainID := c.Params("id")

	// Check if user is restricted by a previous strike-3.
	var restrictedUntil sql.NullTime
	h.db.QueryRow(`
		SELECT restricted_until FROM user_strikes
		WHERE user_id = ? AND restricted_until IS NOT NULL AND restricted_until > NOW()
		ORDER BY created_at DESC LIMIT 1
	`, userID).Scan(&restrictedUntil)
	if restrictedUntil.Valid {
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   fmt.Sprintf("You are restricted from multi-way trades until %s due to repeated back-outs.", restrictedUntil.Time.Format("Jan 2, 2006")),
		})
	}

	// Verify the user is a participant and the chain is in an accepted/active state.
	var u1ID, u2ID, u3ID, originalTradeID int
	var chainStatus string
	err := h.db.QueryRow(`
		SELECT user1_id, user2_id, COALESCE(user3_id, 0), original_trade_id, status
		FROM multiway_trades
		WHERE chain_id = ? AND (user1_id = ? OR user2_id = ? OR user3_id = ?)
	`, chainID, userID, userID, userID).Scan(&u1ID, &u2ID, &u3ID, &originalTradeID, &chainStatus)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Chain not found or you are not a participant"})
	}
	if chainStatus != "user3_accepted" && chainStatus != "active" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Can only back out of accepted/active chains"})
	}

	// 1. Collapse the chain — cancel all legs.
	_, _ = h.db.Exec("UPDATE multiway_trade_legs SET status = 'cancelled', updated_at = NOW() WHERE chain_id = ? AND status NOT IN ('completed', 'cancelled')", chainID)
	_, _ = h.db.Exec("UPDATE multiway_trades SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ?, updated_at = NOW() WHERE chain_id = ?", userID, chainID)

	// 2. Issue a strike to the backing-out user.
	strikeMsg := h.issueStrike(userID, chainID, "Backed out of an accepted multi-way chain")

	// 3. Notify the other participants about the collapse.
	var backerName string
	h.db.QueryRow("SELECT name FROM users WHERE id = ?", userID).Scan(&backerName)
	if backerName == "" {
		backerName = "A participant"
	}

	collapseMsg := fmt.Sprintf("%s backed out of the multi-way chain. The chain has been dissolved. We're attempting to find a replacement.", backerName)
	for _, uid := range []int{u1ID, u2ID, u3ID} {
		if uid > 0 && uid != userID {
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", uid, collapseMsg)
			publishNotification(uid, collapseMsg)
		}
	}

	// 4. Attempt single-leg re-match: find a replacement for the backed-out user.
	// Determine which user positions remain and which needs replacement.
	remainingUsers := []int{}
	for _, uid := range []int{u1ID, u2ID, u3ID} {
		if uid > 0 && uid != userID {
			remainingUsers = append(remainingUsers, uid)
		}
	}

	// Create a 12-hour re-match hold.
	backedOutLegIndex := 0
	switch userID {
	case u1ID:
		backedOutLegIndex = 0
	case u2ID:
		backedOutLegIndex = 1
	case u3ID:
		backedOutLegIndex = 2
	}

	holdExpires := time.Now().Add(12 * time.Hour)
	_, _ = h.db.Exec(`
		INSERT INTO multiway_rematch_holds (chain_id, original_chain_id, backed_out_user_id, backed_out_leg_index, hold_expires_at, status)
		VALUES (?, ?, ?, ?, ?, 'searching')
	`, chainID, chainID, userID, backedOutLegIndex, holdExpires)

	// Attempt immediate re-match using the existing matcher.
	excluded := []int{userID}
	// Collect all previously declined user3s for this trade.
	prevRows, _ := h.db.Query("SELECT user3_id FROM multiway_trades WHERE original_trade_id = ? AND status = 'user3_declined'", originalTradeID)
	if prevRows != nil {
		for prevRows.Next() {
			var prevID int
			if prevRows.Scan(&prevID) == nil {
				excluded = append(excluded, prevID)
			}
		}
		prevRows.Close()
	}

	rematchResult := "no_match"
	matches, _ := services.FindMultiwayMatch(h.db, u1ID, u2ID, originalTradeID, excluded)
	if len(matches) > 0 {
		match := matches[0]
		newChainID := fmt.Sprintf("chain_%d_%d_%d_%d", originalTradeID, u1ID, u2ID, match.User3ID)
		expiresAt := time.Now().Add(18 * time.Hour)
		_, insertErr := h.db.Exec(`
			INSERT INTO multiway_trades (chain_id, original_trade_id, initiator_user_id, user1_id, user2_id, user3_id, user3_product_id, status, expires_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_user3', ?)
		`, newChainID, originalTradeID, u2ID, u1ID, u2ID, match.User3ID, match.User3ProductID, expiresAt)
		if insertErr == nil {
			rematchResult = "found"
			// Update the hold record.
			_, _ = h.db.Exec("UPDATE multiway_rematch_holds SET status = 'found', replacement_user_id = ?, replacement_chain_id = ? WHERE chain_id = ? AND status = 'searching'",
				match.User3ID, newChainID, chainID)

			// Notify the new candidate.
			notifMsg := fmt.Sprintf("Someone wants your %s and has something you like! Check your multi-way opportunities.", match.User3ProductTitle)
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_loop', ?, FALSE)", match.User3ID, notifMsg)
			publishNotification(match.User3ID, notifMsg)

			// Notify remaining parties that a replacement was found.
			holdMsg := "A replacement participant has been found for the collapsed chain. Please wait for their response."
			for _, uid := range remainingUsers {
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", uid, holdMsg)
				publishNotification(uid, holdMsg)
			}
		}
	}

	if rematchResult == "no_match" {
		// No replacement found immediately — trade stays pending for 12hrs.
		// The background scheduler will dissolve it if no match is found.
		_, _ = h.db.Exec("UPDATE trades SET status = 'pending', updated_at = NOW() WHERE id = ? AND status IN ('multiway_active', 'pending_multiway')", originalTradeID)
		holdMsg := "We're searching for a replacement participant. You'll be notified within 12 hours."
		for _, uid := range remainingUsers {
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", uid, holdMsg)
			publishNotification(uid, holdMsg)
		}
	}

	go h.rebuildTradeLoopCacheForUsers([]int{u1ID, u2ID, u3ID})

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "You have backed out of the chain.",
		Data: fiber.Map{
			"strike_message":  strikeMsg,
			"rematch_status":  rematchResult,
			"hold_expires":    holdExpires.Format("2006-01-02 15:04:05"),
			"remaining_users": remainingUsers,
		},
	})
}

// issueStrike adds a progressive strike to a user's record and returns the warning message.
func (h *TradeHandler) issueStrike(userID int, chainID, reason string) string {
	// Count existing strikes for this user.
	var currentStrikes int
	h.db.QueryRow("SELECT COUNT(*) FROM user_strikes WHERE user_id = ?", userID).Scan(&currentStrikes)

	newStrikeNumber := currentStrikes + 1
	var severity, message string
	var restrictedUntil *time.Time

	switch {
	case newStrikeNumber >= 3:
		severity = "restriction"
		until := time.Now().AddDate(0, 0, 30) // 30-day restriction
		restrictedUntil = &until
		message = fmt.Sprintf("Strike %d: You have been restricted from multi-way trades for 30 days due to repeated back-outs.", newStrikeNumber)
	case newStrikeNumber == 2:
		severity = "final_warning"
		message = "Strike 2 — Final Warning: Backing out of accepted chains again will result in a 30-day restriction from multi-way trading."
	default:
		severity = "friendly_warning"
		message = "Strike 1 — Friendly Warning: Backing out of accepted multi-way chains affects other participants. Please be sure before accepting."
	}

	_, _ = h.db.Exec(`
		INSERT INTO user_strikes (user_id, chain_id, strike_number, reason, severity, restricted_until)
		VALUES (?, ?, ?, ?, ?, ?)
	`, userID, chainID, newStrikeNumber, reason, severity, restrictedUntil)

	// Notify the user.
	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", userID, message)
	publishNotification(userID, message)

	log.Printf("Issued strike %d (%s) to user %d for chain %s: %s", newStrikeNumber, severity, userID, chainID, reason)
	return message
}

// CheckMultiwayConflict checks if a product has conflicting pending offers
// (both a regular 2-way trade AND a pending multiway chain).
// The owner sees this and decides which to accept first.
func (h *TradeHandler) CheckMultiwayConflict(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	productID := c.Params("id")

	// Check for pending 2-way trades on this product.
	var twoWayCount int
	var twoWayTradeID sql.NullInt64
	h.db.QueryRow(`
		SELECT COUNT(*), MIN(id) FROM trades
		WHERE target_product_id = ? AND seller_id = ? AND status IN ('pending', 'accepted')
	`, productID, userID).Scan(&twoWayCount, &twoWayTradeID)

	// Check for pending multiway chains involving this product.
	var multiwayCount int
	var multiwayChainID sql.NullString
	var multiwayStatus sql.NullString
	h.db.QueryRow(`
		SELECT COUNT(*), MIN(mw.chain_id), MIN(mw.status)
		FROM multiway_trades mw
		LEFT JOIN multiway_trade_legs l ON l.chain_id = mw.chain_id AND l.product_id = ?
		LEFT JOIN trades t ON t.id = mw.original_trade_id
		LEFT JOIN trade_items ti ON ti.trade_id = t.id AND ti.product_id = ?
		WHERE (l.product_id IS NOT NULL OR t.target_product_id = ? OR ti.product_id IS NOT NULL)
		  AND mw.status IN ('pending_user3', 'user3_accepted', 'active', 'searching')
	`, productID, productID, productID).Scan(&multiwayCount, &multiwayChainID, &multiwayStatus)

	hasConflict := twoWayCount > 0 && multiwayCount > 0

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"has_conflict":      hasConflict,
			"two_way_count":     twoWayCount,
			"two_way_trade_id":  twoWayTradeID,
			"multiway_count":    multiwayCount,
			"multiway_chain_id": multiwayChainID,
			"multiway_status":   multiwayStatus,
			"recommendation":    "Accept the offer you prefer first. If you accept the 2-way trade, the multi-way chain will dissolve automatically.",
		},
	})
}

// ResolveMultiwayConflict lets the product owner choose between the 2-way offer
// and the multiway chain. If they choose 2-way, the multiway chain dissolves.
func (h *TradeHandler) ResolveMultiwayConflict(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	var payload struct {
		KeepType string `json:"keep_type"` // "two_way" or "multiway"
		ChainID  string `json:"chain_id"`
		TradeID  int    `json:"trade_id"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	if payload.KeepType == "two_way" && payload.ChainID != "" {
		// Dissolve the multiway chain.
		_, _ = h.db.Exec("UPDATE multiway_trades SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ?, updated_at = NOW() WHERE chain_id = ?", userID, payload.ChainID)
		_, _ = h.db.Exec("UPDATE multiway_trade_legs SET status = 'cancelled', updated_at = NOW() WHERE chain_id = ?", payload.ChainID)

		// Notify multiway participants.
		rows, _ := h.db.Query(`
			SELECT user1_id, user2_id, COALESCE(user3_id, 0) FROM multiway_trades WHERE chain_id = ?
		`, payload.ChainID)
		if rows != nil {
			for rows.Next() {
				var u1, u2, u3 int
				if rows.Scan(&u1, &u2, &u3) == nil {
					msg := "A multi-way chain you were part of has been dissolved because the item owner accepted a different trade offer."
					for _, uid := range []int{u1, u2, u3} {
						if uid > 0 && uid != userID {
							_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", uid, msg)
							publishNotification(uid, msg)
						}
					}
				}
			}
			rows.Close()
		}

		return c.JSON(models.APIResponse{Success: true, Message: "Multi-way chain dissolved. 2-way trade preserved."})
	} else if payload.KeepType == "multiway" && payload.TradeID > 0 {
		// Decline the 2-way trade.
		_, _ = h.db.Exec("UPDATE trades SET status = 'declined', updated_at = NOW() WHERE id = ? AND (seller_id = ? OR buyer_id = ?)", payload.TradeID, userID, userID)

		// Notify the 2-way trade partner.
		var partnerID int
		h.db.QueryRow("SELECT CASE WHEN buyer_id = ? THEN seller_id ELSE buyer_id END FROM trades WHERE id = ?", userID, payload.TradeID).Scan(&partnerID)
		if partnerID > 0 {
			msg := "Your trade offer was declined because the item is part of a multi-way chain."
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", partnerID, msg)
			publishNotification(partnerID, msg)
		}

		return c.JSON(models.APIResponse{Success: true, Message: "2-way trade declined. Multi-way chain preserved."})
	}

	return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid keep_type — must be 'two_way' or 'multiway'"})
}

// AdminGetChains returns all multiway chains with status, participants, health, and re-match holds.
func (h *TradeHandler) AdminGetChains(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	statusFilter := c.Query("status", "")
	offset := (page - 1) * limit

	// Count total chains.
	var total int
	countQuery := "SELECT COUNT(*) FROM multiway_trades"
	if statusFilter != "" {
		countQuery += " WHERE status = '" + statusFilter + "'"
	}
	h.db.QueryRow(countQuery).Scan(&total)

	// Fetch chains.
	query := `
		SELECT mw.id, mw.chain_id, mw.original_trade_id, mw.initiator_user_id,
		       mw.user1_id, mw.user2_id, COALESCE(mw.user3_id, 0), mw.status,
		       COALESCE(mw.expires_at, '1970-01-01') as expires_at,
		       COALESCE(mw.cancelled_at, '1970-01-01') as cancelled_at,
		       COALESCE(mw.cancelled_by, 0),
		       mw.created_at, mw.updated_at,
		       COALESCE(u1.name, '') as user1_name,
		       COALESCE(u2.name, '') as user2_name,
		       COALESCE(u3.name, '') as user3_name,
		       COALESCE(ui.name, '') as initiator_name
		FROM multiway_trades mw
		JOIN users u1 ON u1.id = mw.user1_id
		JOIN users u2 ON u2.id = mw.user2_id
		LEFT JOIN users u3 ON u3.id = mw.user3_id
		JOIN users ui ON ui.id = mw.initiator_user_id
	`
	if statusFilter != "" {
		query += " WHERE mw.status = ?"
	}
	query += " ORDER BY mw.created_at DESC LIMIT ? OFFSET ?"

	var rows *sql.Rows
	var err error
	if statusFilter != "" {
		rows, err = h.db.Query(query, statusFilter, limit, offset)
	} else {
		rows, err = h.db.Query(query, limit, offset)
	}
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch chains"})
	}
	defer rows.Close()

	var chains []fiber.Map
	for rows.Next() {
		var id, tradeID, initiatorID, u1ID, u2ID, u3ID, cancelledBy int
		var cID, status, u1Name, u2Name, u3Name, initiatorName string
		var expiresAt, cancelledAt, createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &cID, &tradeID, &initiatorID,
			&u1ID, &u2ID, &u3ID, &status,
			&expiresAt, &cancelledAt, &cancelledBy,
			&createdAt, &updatedAt,
			&u1Name, &u2Name, &u3Name, &initiatorName); err != nil {
			continue
		}

		// Get leg health for this chain.
		var totalLegs, completedLegs int
		h.db.QueryRow("SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) FROM multiway_trade_legs WHERE chain_id = ?", cID).Scan(&totalLegs, &completedLegs)

		// Check for active re-match holds.
		var activeHolds int
		h.db.QueryRow("SELECT COUNT(*) FROM multiway_rematch_holds WHERE chain_id = ? AND status = 'searching'", cID).Scan(&activeHolds)

		// Get strike count for participants.
		var totalStrikes int
		h.db.QueryRow("SELECT COUNT(*) FROM user_strikes WHERE chain_id = ?", cID).Scan(&totalStrikes)

		chain := fiber.Map{
			"id":                id,
			"chain_id":          cID,
			"original_trade_id": tradeID,
			"status":            status,
			"initiator_user_id": initiatorID,
			"initiator_name":    initiatorName,
			"participants": []fiber.Map{
				{"id": u1ID, "name": u1Name, "role": "user1"},
				{"id": u2ID, "name": u2Name, "role": "user2"},
			},
			"created_at":     createdAt.Format("2006-01-02 15:04:05"),
			"updated_at":     updatedAt.Format("2006-01-02 15:04:05"),
			"total_legs":     totalLegs,
			"completed_legs": completedLegs,
			"health":         fmt.Sprintf("%d of %d", completedLegs, totalLegs),
			"active_holds":   activeHolds,
			"strikes_issued": totalStrikes,
		}
		if u3ID > 0 {
			chain["participants"] = append(chain["participants"].([]fiber.Map), fiber.Map{"id": u3ID, "name": u3Name, "role": "user3"})
		}
		if !expiresAt.IsZero() && expiresAt.Year() > 1970 {
			chain["expires_at"] = expiresAt.Format("2006-01-02 15:04:05")
		}
		if !cancelledAt.IsZero() && cancelledAt.Year() > 1970 {
			chain["cancelled_at"] = cancelledAt.Format("2006-01-02 15:04:05")
			chain["cancelled_by"] = cancelledBy
		}
		chains = append(chains, chain)
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"chains":      chains,
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": (total + limit - 1) / limit,
		},
	})
}

// GetUserStrikes returns the strike history for a user (admin or self).
func (h *TradeHandler) GetUserStrikes(c *fiber.Ctx) error {
	targetUserID, _ := strconv.Atoi(c.Params("userId"))
	if targetUserID == 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid user ID"})
	}

	rows, err := h.db.Query(`
		SELECT id, chain_id, strike_number, reason, severity,
		       COALESCE(restricted_until, '1970-01-01') as restricted_until, created_at
		FROM user_strikes WHERE user_id = ?
		ORDER BY created_at DESC
	`, targetUserID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch strikes"})
	}
	defer rows.Close()

	var strikes []fiber.Map
	for rows.Next() {
		var id, strikeNum int
		var chainID, reason, severity string
		var restrictedUntil, createdAt time.Time
		if err := rows.Scan(&id, &chainID, &strikeNum, &reason, &severity, &restrictedUntil, &createdAt); err != nil {
			continue
		}
		s := fiber.Map{
			"id":            id,
			"chain_id":      chainID,
			"strike_number": strikeNum,
			"reason":        reason,
			"severity":      severity,
			"created_at":    createdAt.Format("2006-01-02 15:04:05"),
		}
		if restrictedUntil.Year() > 1970 {
			s["restricted_until"] = restrictedUntil.Format("2006-01-02 15:04:05")
		}
		strikes = append(strikes, s)
	}

	// Check if currently restricted.
	var isRestricted bool
	h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM user_strikes WHERE user_id = ? AND restricted_until IS NOT NULL AND restricted_until > NOW())", targetUserID).Scan(&isRestricted)

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"user_id":       targetUserID,
			"total_strikes": len(strikes),
			"is_restricted": isRestricted,
			"strikes":       strikes,
		},
	})
}

// AdminIssueStrike manually adds a strike to a user
func (h *TradeHandler) AdminIssueStrike(c *fiber.Ctx) error {
	targetUserID, _ := strconv.Atoi(c.Params("userId"))
	if targetUserID == 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid user ID"})
	}

	var payload struct {
		Reason  string `json:"reason"`
		ChainID string `json:"chain_id"`
	}
	if err := c.BodyParser(&payload); err != nil || payload.Reason == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Reason is required"})
	}

	h.issueStrike(targetUserID, payload.ChainID, payload.Reason)

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Strike issued successfully",
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 4: Per-leg dispute isolation, upstream collapse, admin dispute view
// ──────────────────────────────────────────────────────────────────────────────

// FileLegDispute allows a participant to file a dispute on a specific leg.
// Only the affected leg is frozen to 'disputed' status — the rest of the chain continues.
func (h *TradeHandler) FileLegDispute(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	legID, err := strconv.Atoi(c.Params("legId"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid leg ID"})
	}

	var payload struct {
		Reason       string   `json:"reason"`
		Description  string   `json:"description"`
		EvidenceURLs []string `json:"evidence_urls"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}
	if payload.Reason == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Reason is required"})
	}

	// Verify the user is part of this leg.
	var chainID string
	var fromUID, toUID int
	var legStatus string
	err = h.db.QueryRow(`
		SELECT chain_id, from_user_id, to_user_id, status
		FROM multiway_trade_legs WHERE id = ?
	`, legID).Scan(&chainID, &fromUID, &toUID, &legStatus)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Leg not found"})
	}
	if userID != fromUID && userID != toUID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You are not a participant of this leg"})
	}
	if legStatus == "cancelled" || legStatus == "disputed" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "This leg is already " + legStatus})
	}

	// Check for existing open dispute on this leg.
	var existingDispute int
	h.db.QueryRow("SELECT COUNT(*) FROM multiway_leg_disputes WHERE leg_id = ? AND status IN ('open', 'under_review')", legID).Scan(&existingDispute)
	if existingDispute > 0 {
		return c.Status(409).JSON(models.APIResponse{Success: false, Error: "A dispute is already open on this leg"})
	}

	// Determine who the dispute is against.
	againstUserID := toUID
	if userID == toUID {
		againstUserID = fromUID
	}

	// Marshal evidence URLs to JSON.
	var evidenceJSON []byte
	if len(payload.EvidenceURLs) > 0 {
		evidenceJSON, _ = json.Marshal(payload.EvidenceURLs)
	}

	// Create the dispute record.
	result, err := h.db.Exec(`
		INSERT INTO multiway_leg_disputes (chain_id, leg_id, filed_by, against_user_id, reason, description, evidence_urls, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
	`, chainID, legID, userID, againstUserID, payload.Reason, payload.Description, evidenceJSON)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to file dispute"})
	}
	disputeID, _ := result.LastInsertId()

	// Freeze ONLY the affected leg — set status to 'disputed'.
	_, _ = h.db.Exec("UPDATE multiway_trade_legs SET status = 'disputed', updated_at = NOW() WHERE id = ?", legID)

	// Notify the other party.
	var filerName string
	h.db.QueryRow("SELECT name FROM users WHERE id = ?", userID).Scan(&filerName)
	if filerName == "" {
		filerName = "Your trade partner"
	}
	msg := fmt.Sprintf("%s has filed a dispute on your handoff. The leg is frozen until an admin reviews it.", filerName)
	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", againstUserID, msg)
	publishNotification(againstUserID, msg)

	// Notify admins.
	adminRows, _ := h.db.Query("SELECT id FROM users WHERE role = 'admin'")
	if adminRows != nil {
		adminMsg := fmt.Sprintf("New multi-way leg dispute filed (chain: %s, leg: %d) by user %d against user %d: %s", chainID, legID, userID, againstUserID, payload.Reason)
		for adminRows.Next() {
			var adminID int
			if adminRows.Scan(&adminID) == nil {
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'report', ?, FALSE)", adminID, adminMsg)
			}
		}
		adminRows.Close()
	}

	return c.Status(201).JSON(models.APIResponse{
		Success: true,
		Message: "Dispute filed. Only this leg has been frozen — other legs in the chain continue normally.",
		Data: fiber.Map{
			"dispute_id": disputeID,
			"leg_id":     legID,
			"chain_id":   chainID,
		},
	})
}

// AdminResolveLegDispute allows an admin to resolve a per-leg dispute.
// Actions: no_action (unfreeze), cancel_leg (trigger upstream collapse), cancel_chain (full collapse).
func (h *TradeHandler) AdminResolveLegDispute(c *fiber.Ctx) error {
	adminID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	disputeID, err := strconv.Atoi(c.Params("disputeId"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid dispute ID"})
	}

	var payload struct {
		Resolution string `json:"resolution"` // "no_action", "cancel_leg", "cancel_chain"
		Status     string `json:"status"`     // "resolved_in_favor", "resolved_against", "cancelled_leg"
		AdminNotes string `json:"admin_notes"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	// Fetch the dispute.
	var chainID string
	var legID, filedBy, againstUID int
	err = h.db.QueryRow(`
		SELECT chain_id, leg_id, filed_by, against_user_id
		FROM multiway_leg_disputes WHERE id = ? AND status IN ('open', 'under_review')
	`, disputeID).Scan(&chainID, &legID, &filedBy, &againstUID)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Dispute not found or already resolved"})
	}

	// Update dispute resolution.
	resolvedStatus := payload.Status
	if resolvedStatus == "" {
		resolvedStatus = "resolved_in_favor"
	}
	_, _ = h.db.Exec(`
		UPDATE multiway_leg_disputes
		SET status = ?, resolution_action = ?, admin_reviewer_id = ?, admin_notes = ?, resolved_at = NOW(), updated_at = NOW()
		WHERE id = ?
	`, resolvedStatus, payload.Resolution, adminID, payload.AdminNotes, disputeID)

	upstreamTriggered := false

	switch payload.Resolution {
	case "no_action":
		// Unfreeze the leg — restore to in_progress.
		_, _ = h.db.Exec("UPDATE multiway_trade_legs SET status = 'in_progress', updated_at = NOW() WHERE id = ?", legID)
		// Notify both parties.
		msg := "The dispute on your trade leg has been resolved — no action taken. The leg is unfrozen and you can proceed."
		for _, uid := range []int{filedBy, againstUID} {
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", uid, msg)
			publishNotification(uid, msg)
		}

	case "cancel_leg":
		// Cancel ONLY this leg and trigger upstream collapse for dependent legs.
		_, _ = h.db.Exec("UPDATE multiway_trade_legs SET status = 'cancelled', updated_at = NOW() WHERE id = ?", legID)
		upstreamTriggered = h.upstreamCollapse(chainID, legID)
		_, _ = h.db.Exec("UPDATE multiway_leg_disputes SET upstream_collapse_triggered = ? WHERE id = ?", upstreamTriggered, disputeID)

		// Notify the leg participants.
		msg := "The dispute on your trade leg has been resolved. This leg has been cancelled."
		for _, uid := range []int{filedBy, againstUID} {
			_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", uid, msg)
			publishNotification(uid, msg)
		}

		// Issue a strike to the party the dispute was resolved against.
		if resolvedStatus == "resolved_in_favor" {
			h.issueStrike(againstUID, chainID, "Dispute resolved against you — leg cancelled")
		}

	case "cancel_chain":
		// Full chain collapse.
		_, _ = h.db.Exec("UPDATE multiway_trade_legs SET status = 'cancelled', updated_at = NOW() WHERE chain_id = ? AND status NOT IN ('completed', 'cancelled')", chainID)
		_, _ = h.db.Exec("UPDATE multiway_trades SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ?, updated_at = NOW() WHERE chain_id = ?", adminID, chainID)
		upstreamTriggered = true
		_, _ = h.db.Exec("UPDATE multiway_leg_disputes SET upstream_collapse_triggered = TRUE WHERE id = ?", disputeID)

		// Restore the original trade.
		_, _ = h.db.Exec(`
			UPDATE trades SET status = 'pending', updated_at = NOW()
			WHERE id = (SELECT original_trade_id FROM multiway_trades WHERE chain_id = ?)
			  AND status IN ('multiway_active', 'pending_multiway')
		`, chainID)

		// Restore all products.
		_, _ = h.db.Exec(`
			UPDATE products SET status = 'available', updated_at = NOW()
			WHERE id IN (SELECT product_id FROM multiway_trade_legs WHERE chain_id = ?)
			  AND status = 'locked'
		`, chainID)

		// Notify all chain participants.
		var u1, u2, u3 int
		h.db.QueryRow("SELECT user1_id, user2_id, COALESCE(user3_id, 0) FROM multiway_trades WHERE chain_id = ?", chainID).Scan(&u1, &u2, &u3)
		msg := "The entire multi-way chain has been cancelled by an admin due to a dispute. Your items are available again."
		for _, uid := range []int{u1, u2, u3} {
			if uid > 0 {
				_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", uid, msg)
				publishNotification(uid, msg)
			}
		}

		if resolvedStatus == "resolved_in_favor" {
			h.issueStrike(againstUID, chainID, "Dispute resolved against you — entire chain cancelled by admin")
		}

	default:
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Resolution must be 'no_action', 'cancel_leg', or 'cancel_chain'"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: fmt.Sprintf("Dispute resolved with action: %s", payload.Resolution),
		Data: fiber.Map{
			"dispute_id":        disputeID,
			"resolution":        payload.Resolution,
			"upstream_collapse": upstreamTriggered,
		},
	})
}

// upstreamCollapse cascades a leg cancellation to downstream legs that depend on it.
// In a 3-party chain (U1→U2→U3→U1), if leg 1 (U2→U3) is cancelled:
//   - Leg 2 (U3→U1) becomes impossible because U3 never received their item
//   - Leg 0 (U1→U2) may already be completed — that stays
//
// Returns true if any downstream legs were collapsed.
func (h *TradeHandler) upstreamCollapse(chainID string, cancelledLegID int) bool {
	// Get the cancelled leg's index.
	var cancelledIndex int
	h.db.QueryRow("SELECT leg_index FROM multiway_trade_legs WHERE id = ?", cancelledLegID).Scan(&cancelledIndex)

	// Get all legs for this chain.
	rows, err := h.db.Query(`
		SELECT id, leg_index, from_user_id, to_user_id, status
		FROM multiway_trade_legs WHERE chain_id = ? ORDER BY leg_index
	`, chainID)
	if err != nil {
		return false
	}
	defer rows.Close()

	type legInfo struct {
		id, index, from, to int
		status              string
	}
	var legs []legInfo
	for rows.Next() {
		var l legInfo
		if rows.Scan(&l.id, &l.index, &l.from, &l.to, &l.status) == nil {
			legs = append(legs, l)
		}
	}

	collapsed := false
	// Cancel downstream legs that haven't completed yet.
	// "Downstream" = legs after the cancelled one in the chain order (wrapping around).
	totalLegs := len(legs)
	for i := 1; i < totalLegs; i++ {
		downstreamIdx := (cancelledIndex + i) % totalLegs
		for _, leg := range legs {
			if leg.index == downstreamIdx && leg.status != "completed" && leg.status != "cancelled" {
				_, _ = h.db.Exec("UPDATE multiway_trade_legs SET status = 'cancelled', updated_at = NOW() WHERE id = ?", leg.id)

				// Restore the product to available.
				_, _ = h.db.Exec(`
					UPDATE products SET status = 'available', updated_at = NOW()
					WHERE id = (SELECT product_id FROM multiway_trade_legs WHERE id = ?) AND status = 'locked'
				`, leg.id)

				// Notify both parties of this leg.
				msg := "A leg in your multi-way chain has been cancelled due to a dispute on an earlier leg. Your item is available again."
				for _, uid := range []int{leg.from, leg.to} {
					_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'trade_update', ?, FALSE)", uid, msg)
					publishNotification(uid, msg)
				}
				collapsed = true
			}
		}
	}

	// If all legs are now cancelled or completed, update the chain status.
	var pendingLegs int
	h.db.QueryRow("SELECT COUNT(*) FROM multiway_trade_legs WHERE chain_id = ? AND status NOT IN ('completed', 'cancelled')", chainID).Scan(&pendingLegs)
	if pendingLegs == 0 {
		var completedLegs int
		h.db.QueryRow("SELECT COUNT(*) FROM multiway_trade_legs WHERE chain_id = ? AND status = 'completed'", chainID).Scan(&completedLegs)
		if completedLegs > 0 && completedLegs < totalLegs {
			// Partial completion — mark chain as cancelled (incomplete).
			_, _ = h.db.Exec("UPDATE multiway_trades SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE chain_id = ?", chainID)
		}
	}

	if collapsed {
		log.Printf("Upstream collapse triggered for chain %s from leg %d: downstream legs cancelled", chainID, cancelledLegID)
	}
	return collapsed
}

// AdminGetLegDisputes returns all leg disputes with chain context for the admin dashboard.
func (h *TradeHandler) AdminGetLegDisputes(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	statusFilter := c.Query("status", "")
	offset := (page - 1) * limit

	// Count.
	var total int
	if statusFilter != "" {
		h.db.QueryRow("SELECT COUNT(*) FROM multiway_leg_disputes WHERE status = ?", statusFilter).Scan(&total)
	} else {
		h.db.QueryRow("SELECT COUNT(*) FROM multiway_leg_disputes").Scan(&total)
	}

	// Fetch disputes with context.
	query := `
		SELECT d.id, d.chain_id, d.leg_id, d.filed_by, d.against_user_id,
		       d.reason, COALESCE(d.description, '') as description,
		       d.status, d.resolution_action, d.upstream_collapse_triggered,
		       COALESCE(d.admin_notes, '') as admin_notes,
		       d.created_at, COALESCE(d.resolved_at, '1970-01-01') as resolved_at,
		       COALESCE(filer.name, '') as filer_name,
		       COALESCE(against.name, '') as against_name,
		       COALESCE(l.leg_index, 0) as leg_index,
		       COALESCE(p.title, '') as product_title,
		       COALESCE(l.status, '') as leg_status,
		       COALESCE(mw.status, '') as chain_status,
		       d.evidence_urls
		FROM multiway_leg_disputes d
		JOIN users filer ON filer.id = d.filed_by
		JOIN users against ON against.id = d.against_user_id
		LEFT JOIN multiway_trade_legs l ON l.id = d.leg_id
		LEFT JOIN products p ON p.id = l.product_id
		LEFT JOIN multiway_trades mw ON mw.chain_id = d.chain_id
	`
	var args []interface{}
	if statusFilter != "" {
		query += " WHERE d.status = ?"
		args = append(args, statusFilter)
	}
	query += " ORDER BY d.created_at DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := h.db.Query(query, args...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch disputes"})
	}
	defer rows.Close()

	var disputes []fiber.Map
	for rows.Next() {
		var id, legID, filedBy, againstUID, legIndex int
		var chainID, reason, description, status, filerName, againstName string
		var productTitle, legStatus, chainStatus string
		var resolutionAction sql.NullString
		var adminNotes string
		var upstreamCollapse bool
		var createdAt, resolvedAt time.Time
		var evidenceJSON sql.RawBytes

		if err := rows.Scan(&id, &chainID, &legID, &filedBy, &againstUID,
			&reason, &description, &status, &resolutionAction, &upstreamCollapse,
			&adminNotes, &createdAt, &resolvedAt,
			&filerName, &againstName, &legIndex, &productTitle, &legStatus, &chainStatus, &evidenceJSON); err != nil {
			continue
		}

		// Count affected users from upstream collapse.
		var affectedUsers int
		if upstreamCollapse {
			h.db.QueryRow("SELECT COUNT(DISTINCT from_user_id) + COUNT(DISTINCT to_user_id) FROM multiway_trade_legs WHERE chain_id = ? AND status = 'cancelled'", chainID).Scan(&affectedUsers)
		}

		d := fiber.Map{
			"id":                          id,
			"chain_id":                    chainID,
			"leg_id":                      legID,
			"leg_index":                   legIndex,
			"filed_by":                    filedBy,
			"filer_name":                  filerName,
			"against_user_id":             againstUID,
			"against_name":                againstName,
			"reason":                      reason,
			"description":                 description,
			"status":                      status,
			"admin_notes":                 adminNotes,
			"upstream_collapse_triggered": upstreamCollapse,
			"affected_users":              affectedUsers,
			"product_title":               productTitle,
			"leg_status":                  legStatus,
			"chain_status":                chainStatus,
			"created_at":                  createdAt.Format("2006-01-02 15:04:05"),
			"evidence_urls":               nil,
		}
		if len(evidenceJSON) > 0 {
			var evUrls []string
			if err := json.Unmarshal(evidenceJSON, &evUrls); err == nil {
				d["evidence_urls"] = evUrls
			}
		}
		if resolutionAction.Valid {
			d["resolution_action"] = resolutionAction.String
		}
		if resolvedAt.Year() > 1970 {
			d["resolved_at"] = resolvedAt.Format("2006-01-02 15:04:05")
		}
		disputes = append(disputes, d)
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"disputes":    disputes,
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": (total + limit - 1) / limit,
		},
	})
}
