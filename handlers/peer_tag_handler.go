package handlers

import (
	"database/sql"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
)

// PeerTagHandler handles peer tag-related HTTP requests
type PeerTagHandler struct {
	db *sql.DB
}

// NewPeerTagHandler creates a new peer tag handler
func NewPeerTagHandler() *PeerTagHandler {
	return &PeerTagHandler{
		db: database.DB,
	}
}

// Valid peer tags
var validPeerTags = map[string]bool{
	"Item as described": true,
	"On time":           true,
	"Friendly":          true,
	"Safe meetup spot":  true,
	"Smooth delivery":   true,
	"Responsive":        true,
}

// CreatePeerTag creates a peer tag for a trade participant
func (h *PeerTagHandler) CreatePeerTag(c *fiber.Ctx) error {
	// Get authenticated user (the giver of the tag)
	giverID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	tradeID, err := c.ParamsInt("id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid trade ID",
		})
	}

	// Parse request body
	var req models.PeerTagCreate
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Validate tag name
	if !validPeerTags[req.TagName] {
		return c.Status(fiber.StatusBadRequest).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid tag name",
		})
	}

	// Get trade details to verify user is part of the trade and it's completed
	var buyerID, sellerID int
	var status string
	var completedAt sql.NullTime

	err = h.db.QueryRow(
		"SELECT buyer_id, seller_id, status, completed_at FROM trades WHERE id = ?",
		tradeID,
	).Scan(&buyerID, &sellerID, &status, &completedAt)

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(models.APIResponse{
			Success: false,
			Error:   "Trade not found",
		})
	}
	if err != nil {
		log.Printf("❌ Failed to fetch trade: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to fetch trade",
		})
	}

	// Verify user is part of the trade
	if giverID != buyerID && giverID != sellerID {
		return c.Status(fiber.StatusForbidden).JSON(models.APIResponse{
			Success: false,
			Error:   "You are not part of this trade",
		})
	}

	// Verify trade is completed (only allow tagging after completion)
	if status != "completed" {
		return c.Status(fiber.StatusBadRequest).JSON(models.APIResponse{
			Success: false,
			Error:   "Trade must be completed before tagging",
		})
	}

	// Determine who the receiver is (the other party in the trade)
	var receiverID int
	if giverID == buyerID {
		receiverID = sellerID
	} else {
		receiverID = buyerID
	}

	// Don't allow tagging yourself
	if giverID == receiverID {
		return c.Status(fiber.StatusBadRequest).JSON(models.APIResponse{
			Success: false,
			Error:   "You cannot tag yourself",
		})
	}

	// Check if this tag already exists for this trade and giver
	var existingTagID int
	err = h.db.QueryRow(
		"SELECT id FROM peer_tags WHERE trade_id = ? AND giver_id = ? AND receiver_id = ? AND tag_name = ?",
		tradeID, giverID, receiverID, req.TagName,
	).Scan(&existingTagID)

	if err == nil {
		// Tag already exists, return success with existing ID
		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"success": true,
			"message": "Tag already exists for this trade",
			"data": fiber.Map{
				"id": existingTagID,
			},
		})
	}
	if err != sql.ErrNoRows {
		log.Printf("❌ Failed to check existing tag: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to process tag",
		})
	}

	// Insert peer tag
	result, err := h.db.Exec(
		"INSERT INTO peer_tags (trade_id, giver_id, receiver_id, tag_name, created_at) VALUES (?, ?, ?, ?, ?)",
		tradeID, giverID, receiverID, req.TagName, time.Now(),
	)
	if err != nil {
		log.Printf("❌ Failed to create peer tag: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to create peer tag",
		})
	}

	tagID, _ := result.LastInsertId()

	// Update or create peer_tag_counts entry
	_, err = h.db.Exec(
		`INSERT INTO peer_tag_counts (receiver_id, tag_name, count, updated_at)
		 VALUES (?, ?, 1, ?)
		 ON DUPLICATE KEY UPDATE count = count + 1, updated_at = ?`,
		receiverID, req.TagName, time.Now(), time.Now(),
	)
	if err != nil {
		log.Printf("❌ Failed to update peer tag count: %v", err)
		// Don't fail the entire operation if count update fails
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"message": "Peer tag created successfully",
		"data": fiber.Map{
			"id": tagID,
		},
	})
}

// GetUserPeerTags retrieves the peer tag profile for a user
func (h *PeerTagHandler) GetUserPeerTags(c *fiber.Ctx) error {
	identifier := c.Params("id")
	if identifier == "" {
		return c.Status(fiber.StatusBadRequest).JSON(models.APIResponse{
			Success: false,
			Error:   "User ID or handle is required",
		})
	}

	// Resolve user ID from identifier (handle or ID)
	userHandler := NewUserHandler()
	userID, err := userHandler.ResolveUserID(identifier)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
	}

	// Fetch all peer tag counts for this user
	rows, err := h.db.Query(
		`SELECT tag_name, count FROM peer_tag_counts
		 WHERE receiver_id = ?
		 ORDER BY count DESC, tag_name ASC`,
		userID,
	)
	if err != nil {
		log.Printf("❌ Failed to fetch peer tags for user %d: %v", userID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to fetch peer tags",
		})
	}
	defer rows.Close()

	var tags []models.PeerTagCount
	totalTags := 0
	for rows.Next() {
		var tagCount models.PeerTagCount
		if err := rows.Scan(&tagCount.TagName, &tagCount.Count); err != nil {
			continue
		}
		tags = append(tags, tagCount)
		totalTags += tagCount.Count
	}

	// Ensure tags list is not nil
	if tags == nil {
		tags = []models.PeerTagCount{}
	}

	profile := models.PeerTagProfile{
		UserID: userID,
		Tags:   tags,
		Total:  totalTags,
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    profile,
	})
}

// GetTradeParticipantsTags retrieves the peer tag profiles for both participants in a trade
func (h *PeerTagHandler) GetTradeParticipantsTags(c *fiber.Ctx) error {
	tradeID, err := c.ParamsInt("id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid trade ID",
		})
	}

	// Get trade participants
	var buyerID, sellerID int
	err = h.db.QueryRow(
		"SELECT buyer_id, seller_id FROM trades WHERE id = ?",
		tradeID,
	).Scan(&buyerID, &sellerID)

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(models.APIResponse{
			Success: false,
			Error:   "Trade not found",
		})
	}
	if err != nil {
		log.Printf("❌ Failed to fetch trade: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to fetch trade",
		})
	}

	// Fetch tags for both participants
	buyerTags := h.fetchUserTagCounts(buyerID)
	sellerTags := h.fetchUserTagCounts(sellerID)

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"buyer_id":    buyerID,
			"buyer_tags":  buyerTags,
			"seller_id":   sellerID,
			"seller_tags": sellerTags,
		},
	})
}

// Helper function to fetch tag counts for a user
func (h *PeerTagHandler) fetchUserTagCounts(userID int) models.PeerTagProfile {
	rows, err := h.db.Query(
		`SELECT tag_name, count FROM peer_tag_counts
		 WHERE receiver_id = ?
		 ORDER BY count DESC, tag_name ASC`,
		userID,
	)
	if err != nil {
		log.Printf("❌ Failed to fetch tags for user %d: %v", userID, err)
		return models.PeerTagProfile{
			UserID: userID,
			Tags:   []models.PeerTagCount{},
			Total:  0,
		}
	}
	defer rows.Close()

	var tags []models.PeerTagCount
	totalTags := 0
	for rows.Next() {
		var tagCount models.PeerTagCount
		if err := rows.Scan(&tagCount.TagName, &tagCount.Count); err != nil {
			continue
		}
		tags = append(tags, tagCount)
		totalTags += tagCount.Count
	}

	if tags == nil {
		tags = []models.PeerTagCount{}
	}

	return models.PeerTagProfile{
		UserID: userID,
		Tags:   tags,
		Total:  totalTags,
	}
}

// GetTagsGivenInTrade retrieves all tags given in a specific trade
func (h *PeerTagHandler) GetTagsGivenInTrade(c *fiber.Ctx) error {
	tradeID, err := c.ParamsInt("id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid trade ID",
		})
	}

	rows, err := h.db.Query(
		`SELECT pt.id, pt.trade_id, pt.giver_id, pt.receiver_id, pt.tag_name, pt.created_at
		 FROM peer_tags pt
		 WHERE pt.trade_id = ?
		 ORDER BY pt.created_at DESC`,
		tradeID,
	)
	if err != nil {
		log.Printf("❌ Failed to fetch tags for trade %d: %v", tradeID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to fetch tags",
		})
	}
	defer rows.Close()

	var tags []models.PeerTag
	for rows.Next() {
		var tag models.PeerTag
		if err := rows.Scan(&tag.ID, &tag.TradeID, &tag.GiverID, &tag.ReceiverID, &tag.TagName, &tag.CreatedAt); err != nil {
			log.Printf("❌ Failed to scan tag: %v", err)
			continue
		}
		tags = append(tags, tag)
	}

	if tags == nil {
		tags = []models.PeerTag{}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"trade_id": tradeID,
			"tags":     tags,
		},
	})
}
