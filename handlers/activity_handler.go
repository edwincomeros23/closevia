package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
)

type ActivityHandler struct {
	db *sql.DB
}

func NewActivityHandler() *ActivityHandler {
	return &ActivityHandler{
		db: database.DB,
	}
}

type ActivityItem struct {
	Type      string    `json:"type"`      // "trade", "new_listing", "near_you"
	ID        int       `json:"id"`        // Relevant ID (trade_id or product_id)
	Message   string    `json:"message"`   // The text to display
	ImageURL  string    `json:"image_url"` // Image to show icon
	Timestamp time.Time `json:"timestamp"`
}

func (h *ActivityHandler) GetRecentActivity(c *fiber.Ctx) error {
	var activities []ActivityItem

	// 1. Fetch recent new listings
	rows, err := h.db.Query(`
		SELECT id, title, image_urls, created_at
		FROM products
		WHERE status = 'available'
		ORDER BY created_at DESC
		LIMIT 10
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id int
			var title, imageURLsJSON string
			var createdAt time.Time
			if err := rows.Scan(&id, &title, &imageURLsJSON, &createdAt); err == nil {
				img := ""
				var urls []string
				if json.Unmarshal([]byte(imageURLsJSON), &urls) == nil && len(urls) > 0 {
					img = urls[0]
				}

				activities = append(activities, ActivityItem{
					Type:      "new_listing",
					ID:        id,
					Message:   fmt.Sprintf("New item posted: %s", title),
					ImageURL:  img,
					Timestamp: createdAt,
				})
			}
		}
	}

	// 2. Fetch recently completed trades
	// We need the target product title + the offered product title
	// To simplify, we'll fetch the target product title and just 1 offered product title
	tradeRows, err := h.db.Query(`
		SELECT t.id, t.updated_at, p.title as target_title, p.image_urls
		FROM trades t
		JOIN products p ON t.target_product_id = p.id
		WHERE t.status = 'completed'
		ORDER BY t.updated_at DESC
		LIMIT 10
	`)
	if err == nil {
		defer tradeRows.Close()
		for tradeRows.Next() {
			var id int
			var updatedAt time.Time
			var targetTitle, imageURLsJSON string
			if err := tradeRows.Scan(&id, &updatedAt, &targetTitle, &imageURLsJSON); err == nil {
				img := ""
				var urls []string
				if json.Unmarshal([]byte(imageURLsJSON), &urls) == nil && len(urls) > 0 {
					img = urls[0]
				}

				// Find one offered item to make "Laptop <-> Camera" string
				var offeredTitle string
				errOffered := h.db.QueryRow(`
					SELECT p.title 
					FROM trade_items ti 
					JOIN products p ON ti.product_id = p.id 
					WHERE ti.trade_id = ? LIMIT 1
				`, id).Scan(&offeredTitle)

				message := fmt.Sprintf("Trade completed: %s", targetTitle)
				if errOffered == nil && offeredTitle != "" {
					message = fmt.Sprintf("Trade completed: %s ↔ %s", targetTitle, offeredTitle)
				}

				activities = append(activities, ActivityItem{
					Type:      "trade",
					ID:        id,
					Message:   message,
					ImageURL:  img,
					Timestamp: updatedAt,
				})
			}
		}
	}

	// Sort unified timeline by timestamp DESC
	// Bubble sort or just simple sort
	for i := 0; i < len(activities); i++ {
		for j := i + 1; j < len(activities); j++ {
			if activities[i].Timestamp.Before(activities[j].Timestamp) {
				activities[i], activities[j] = activities[j], activities[i]
			}
		}
	}

	// Cap to 15 items max to avoid overwhelming the feed
	if len(activities) > 15 {
		activities = activities[:15]
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    activities,
	})
}
