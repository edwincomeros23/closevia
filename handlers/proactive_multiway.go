package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
)

// ProactiveMultiwayMatch represents a suggested multiway loop found without requiring existing trades
type ProactiveMultiwayMatch struct {
	SuggestionID      int
	User1ID           int
	User1Name         string
	User1ProductID    int
	User1ProductTitle string
	User1Wants        string
	User2ID           int
	User2Name         string
	User2ProductID    int
	User2ProductTitle string
	User2WantedCats   []string
	User3ID           int
	User3Name         string
	User3ProductID    int
	User3ProductTitle string
	User3WantedCats   []string
	MatchScore        int // 0-100 based on category/text match quality
	IsAcceptedByUser1 bool
	IsAcceptedByUser2 bool
	IsAcceptedByUser3 bool
	CreatedAt         time.Time
	ExpiresAt         time.Time
}

// FindProactiveMultiwayLoops scans all products to find potential 3-way loops
// when User A posts a product (without requiring existing trades first)
func (h *TradeHandler) FindProactiveMultiwayLoops(productID int) {
	// Get the newly posted product details
	var user1ID int
	var title, category, wants, wantedCategories, desiredProduct string
	var price float64

	err := h.db.QueryRow(`
		SELECT seller_id, title, COALESCE(category, ''), COALESCE(wants, ''), 
		       COALESCE(wanted_categories, ''), COALESCE(desired_product, ''), COALESCE(price, 0)
		FROM products 
		WHERE id = ? AND status = 'available'
	`, productID).Scan(&user1ID, &title, &category, &wants, &wantedCategories, &desiredProduct, &price)

	if err != nil {
		if err != sql.ErrNoRows {
			log.Printf("[ProactiveMultiway] Failed to get product %d: %v", productID, err)
		}
		return
	}

	log.Printf("[ProactiveMultiway] Starting proactive scan for product ID=%d (User1=%d, Category=%s, Wants=%s)",
		productID, user1ID, category, wants)

	// STRATEGY: Find User2 who WANTS this product (or category)
	// Then find User3 who HAS what User2 wants AND WANTS what User1 has

	query2 := `
		SELECT DISTINCT p.id, p.seller_id, u.name, p.title, 
		       COALESCE(p.wanted_categories, ''), COALESCE(p.wants, ''),
		       COALESCE(p.price, 0)
		FROM products p
		JOIN users u ON u.id = p.seller_id
		WHERE p.status = 'available'
		  AND p.seller_id != ?
		  AND p.created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
		  AND u.role != 'admin'
		  AND (
			LOWER(p.wanted_categories) LIKE LOWER(?)
			OR LOWER(p.wants) LIKE LOWER(?)
			OR LOWER(p.desired_product) LIKE LOWER(?)
		  )
	`

	rows2, err := h.db.Query(query2, user1ID,
		"%"+category+"%",
		"%"+title+"%",
		"%"+title+"%")
	if err != nil {
		log.Printf("[ProactiveMultiway] User2 query failed: %v", err)
		return
	}
	defer rows2.Close()

	matchCount := 0
	for rows2.Next() {
		var user2PID, user2ID int
		var user2Name, user2Title, user2WantedCats, user2Wants string
		var user2Price float64

		if err := rows2.Scan(&user2PID, &user2ID, &user2Name, &user2Title, &user2WantedCats, &user2Wants, &user2Price); err != nil {
			continue
		}

		log.Printf("[ProactiveMultiway] Found potential User2 (ID=%d, Product=%d)", user2ID, user2PID)

		// Now find User3: MUST HAVE what User2 wants AND WANT what User1 has
		query3 := `
			SELECT DISTINCT p.id, p.seller_id, u.name, p.title,
			       COALESCE(p.wanted_categories, ''), COALESCE(p.wants, ''),
			       COALESCE(p.price, 0)
			FROM products p
			JOIN users u ON u.id = p.seller_id
			WHERE p.status = 'available'
			  AND p.seller_id NOT IN (?, ?)
			  AND p.created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
			  AND u.role != 'admin'
		`

		rows3, err := h.db.Query(query3, user1ID, user2ID)
		if err != nil {
			log.Printf("[ProactiveMultiway] User3 query failed: %v", err)
			continue
		}

		for rows3.Next() {
			var user3PID, user3ID int
			var user3Name, user3Title, user3WantedCats, user3Wants string
			var user3Price float64

			if err := rows3.Scan(&user3PID, &user3ID, &user3Name, &user3Title, &user3WantedCats, &user3Wants, &user3Price); err != nil {
				continue
			}

			// Validate the loop closure:
			// 1. User2's wanted_categories/wants should match User3's product
			// 2. User3's wanted_categories/wants should match User1's product

			user2WantedCatsArr := parseWantedCategories(user2WantedCats)
			user3WantedCatsArr := parseWantedCategories(user3WantedCats)

			// Check if User3's product matches User2's wants
			user2WantsUser3 := matchesWants(user2WantedCatsArr, user2Wants, user3Title, user3WantedCats)

			// Check if User3 wants User1's product
			user3WantsUser1 := matchesWants(user3WantedCatsArr, user3Wants, title, category)

			if !user2WantsUser3 || !user3WantsUser1 {
				continue
			}

			log.Printf("[ProactiveMultiway] ✅ LOOP FOUND: U1=%d->U2=%d->U3=%d->U1", user1ID, user2ID, user3ID)

			// Calculate match score
			score := calculateProactiveMatchScore(
				category, user2Title, user3Title,
				user2WantedCatsArr, user3WantedCatsArr,
				user2Wants, user3Wants,
			)

			// Store suggestion
			h.storeMultiwaySuggestion(user1ID, productID, user2ID, user2PID, user3ID, user3PID,
				title, user2Title, user3Title, score)

			matchCount++
		}
		rows3.Close()
	}

	log.Printf("[ProactiveMultiway] Completed scan for product %d - found %d matches", productID, matchCount)
}

// matchesWants checks if a user's wants match a product using category/title/desired_product
func matchesWants(wantedCats []string, wantsText, targetTitle, targetCategory string) bool {
	targetTitleLower := strings.ToLower(targetTitle)
	targetCatLower := strings.ToLower(targetCategory)

	// Check wanted categories
	for _, cat := range wantedCats {
		if cat != "" && strings.Contains(targetCatLower, strings.ToLower(cat)) {
			return true
		}
	}

	// Check wants text (free form) - do simple keyword matching
	if strings.TrimSpace(wantsText) != "" {
		wantsLower := strings.ToLower(wantsText)
		if strings.Contains(wantsLower, targetTitleLower) ||
			strings.Contains(targetTitleLower, wantsLower) ||
			strings.Contains(targetCatLower, wantsLower) {
			return true
		}

		// Also try matching common keywords (laptop, phone, gaming, etc)
		keywords := extractKeywords(targetTitleLower)
		for _, kw := range keywords {
			if strings.Contains(wantsLower, kw) {
				return true
			}
		}
	}

	return false
}

// extractKeywords pulls out meaningful words from a product title
func extractKeywords(title string) []string {
	// Simple regex-free approach: split and filter common words
	commonWords := map[string]bool{
		"the": true, "a": true, "an": true, "is": true, "are": true,
		"and": true, "or": true, "in": true, "on": true, "at": true,
		"to": true, "for": true, "of": true, "with": true, "by": true,
	}

	words := strings.Fields(title)
	result := []string{}
	for _, w := range words {
		w = strings.TrimSpace(strings.ToLower(w))
		// Skip common words and single letters
		if len(w) > 2 && !commonWords[w] {
			result = append(result, w)
		}
	}
	return result
}

// calculateProactiveMatchScore estimates how good the loop match is (0-100)
func calculateProactiveMatchScore(
	user1Category, user2Title, user3Title string,
	user2WantedCats, user3WantedCats []string,
	user2Wants, user3Wants string,
) int {
	score := 30 // Base score for finding a loop at all

	// Bonus for direct category matches
	user2HasInCats := false
	for _, cat := range user2WantedCats {
		if strings.Contains(strings.ToLower(user3Title), strings.ToLower(cat)) {
			user2HasInCats = true
			break
		}
	}
	if user2HasInCats {
		score += 20
	}

	user3HasInCats := false
	for _, cat := range user3WantedCats {
		if strings.Contains(strings.ToLower(user1Category), strings.ToLower(cat)) {
			user3HasInCats = true
			break
		}
	}
	if user3HasInCats {
		score += 20
	}

	// Bonus for wants text match
	if strings.Contains(strings.ToLower(user2Wants), strings.ToLower(user3Title)) {
		score += 10
	}
	if strings.Contains(strings.ToLower(user3Wants), strings.ToLower(user2Title)) {
		score += 10
	}

	// Cap at 100
	if score > 100 {
		score = 100
	}

	return score
}

// storeMultiwaySuggestion saves a proactive multiway match to the database
// Using multiway_trades table with a synthetic chain_id to track proactive matches
func (h *TradeHandler) storeMultiwaySuggestion(user1ID, user1ProductID, user2ID, user2ProductID, user3ID, user3ProductID int,
	user1ProdTitle, user2ProdTitle, user3ProdTitle string, score int) {

	// Create a unique chain ID for this proactive suggestion
	// Format: proactive_U1_U2_U3_timestamp
	chainID := fmt.Sprintf("proactive_%d_%d_%d_%d", user1ID, user2ID, user3ID, time.Now().Unix())

	// Check if a similar suggestion already exists (avoid duplicates)
	var existingID int
	err := h.db.QueryRow(`
		SELECT id FROM multiway_trades 
		WHERE user1_id = ? AND user2_id = ? AND user3_id = ? 
		AND status IN ('pending_user3', 'pending_initiator_upgrade')
		LIMIT 1
	`, user1ID, user2ID, user3ID).Scan(&existingID)

	if err == nil {
		// Similar suggestion already exists
		log.Printf("[ProactiveMultiway] Suggestion already exists: id=%d", existingID)
		return
	}
	if err != sql.ErrNoRows {
		log.Printf("[ProactiveMultiway] Query error checking existing: %v", err)
		return
	}

	// Insert the multiway suggestion (no original_trade_id since it's proactive)
	expiresAt := time.Now().Add(48 * time.Hour)
	_, err = h.db.Exec(`
		INSERT INTO multiway_trades 
		(chain_id, original_trade_id, user1_id, user1_product_id, user2_id, user2_product_id, user3_id, 
		 user3_product_id, status, expires_at, initiator_user_id, is_proactive_match)
		VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'pending_user3', ?, ?, TRUE)
	`, chainID, user1ID, user1ProductID, user2ID, user2ProductID, user3ID, user3ProductID, expiresAt, user1ID)

	if err != nil {
		log.Printf("[ProactiveMultiway] Failed to store suggestion: %v", err)
		return
	}

	log.Printf("[ProactiveMultiway] ✅ Stored suggestion %s (User3=%d, Score=%d)", chainID, user3ID, score)

	// DISABLED: Proactive trade_loop notifications were excessive
	// notifMsg := fmt.Sprintf("Great match! %s wants your %s, and you can get their %s in a 3-way trade.",
	// 	"Someone", user3ProdTitle, user1ProdTitle)
	// _, _ = h.db.Exec(`
	// 	INSERT INTO notifications (user_id, type, message, is_read)
	// 	VALUES (?, 'trade_loop', ?, FALSE)
	// `, user3ID, notifMsg)

	// Broadcast via SSE if available (also disabled with proactive notifications)
	// publishNotification(user3ID, notifMsg)
	// publishToUser(user3ID, sseEvent{
	// 	Type: "multiway_suggestion_found",
	// 	Data: fiber.Map{
	// 		"chain_id":        chainID,
	// 		"match_score":     score,
	// 		"your_product":    user3ProdTitle,
	// 		"you_get_from_u1": user1ProdTitle,
	// 		"u1_gets_from_u2": user2ProdTitle,
	// 	},
	// })
}

// GetProactiveMultiwaySuggestions returns all proactive multiway suggestions for a user
func (h *TradeHandler) GetProactiveMultiwaySuggestions(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	// Get all suggestions where user is any of the 3 participants
	// For proactive suggestions, we have product IDs stored in user1_product_id, user2_product_id, user3_product_id
	rows, err := h.db.Query(`
		SELECT m.id, m.chain_id, m.user1_id, m.user2_id, m.user3_id,
		       m.user1_product_id, m.user2_product_id, m.user3_product_id,
		       u1.name as u1_name, u2.name as u2_name, u3.name as u3_name,
		       p1.title as u1_product_title, p2.title as u2_product_title, p3.title as u3_product_title,
		       m.status, m.created_at, m.expires_at
	    FROM multiway_trades m
	    JOIN users u1 ON u1.id = m.user1_id
		JOIN users u2 ON u2.id = m.user2_id
		JOIN users u3 ON u3.id = m.user3_id
		LEFT JOIN products p1 ON p1.id = m.user1_product_id
		LEFT JOIN products p2 ON p2.id = m.user2_product_id
		LEFT JOIN products p3 ON p3.id = m.user3_product_id
		WHERE m.is_proactive_match = TRUE
		AND (m.user1_id = ? OR m.user2_id = ? OR m.user3_id = ?)
		AND m.status IN ('pending_user3', 'pending_initiator_upgrade')
		AND m.expires_at > NOW()
		ORDER BY m.created_at DESC
	`, userID, userID, userID)

	if err != nil {
		log.Printf("[GetProactiveMultiwayS] Query error: %v", err)
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to fetch suggestions",
		})
	}
	defer rows.Close()

	suggestions := []fiber.Map{}
	for rows.Next() {
		var id int
		var chainID string
		var u1ID, u2ID, u3ID, u1PID, u2PID, u3PID int
		var u1Name, u2Name, u3Name, u1Title, u2Title, u3Title string
		var status string
		var createdAt, expiresAt time.Time

		if err := rows.Scan(&id, &chainID, &u1ID, &u2ID, &u3ID, &u1PID, &u2PID, &u3PID,
			&u1Name, &u2Name, &u3Name, &u1Title, &u2Title, &u3Title,
			&status, &createdAt, &expiresAt); err != nil {
			log.Printf("[GetProactiveMultiwayS] Scan error: %v", err)
			continue
		}

		suggestions = append(suggestions, fiber.Map{
			"chain_id":         chainID,
			"id":               id,
			"status":           status,
			"user1_id":         u1ID,
			"user2_id":         u2ID,
			"user3_id":         u3ID,
			"u1_name":          u1Name,
			"u2_name":          u2Name,
			"u3_name":          u3Name,
			"u1_product_title": u1Title,
			"u2_product_title": u2Title,
			"u3_product_title": u3Title,
			"u1_product_id":    u1PID,
			"u2_product_id":    u2PID,
			"u3_product_id":    u3PID,
			"created_at":       createdAt,
			"expires_at":       expiresAt,
		})
	}

	if suggestions == nil {
		suggestions = []fiber.Map{}
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    suggestions,
	})
}
