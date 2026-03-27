package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
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
	// The activity feed is non-critical UI. If the DB is slow/unavailable, fail soft and return [].
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	if err := h.db.PingContext(ctx); err != nil {
		log.Printf("GetRecentActivity: DB unavailable: %v", err)
		return c.JSON(fiber.Map{"success": true, "data": []ActivityItem{}})
	}

	activities := make([]ActivityItem, 0, 15)

	// 1) Fetch recent new listings
	rows, err := h.db.QueryContext(ctx, `
		SELECT id, title, image_urls, created_at
		FROM products
		WHERE status = 'available'
		ORDER BY created_at DESC
		LIMIT 10
	`)
	if err != nil {
		log.Printf("GetRecentActivity: listings query failed: %v", err)
	} else {
		defer rows.Close()
		for rows.Next() {
			var id int
			var title sql.NullString
			var imageURLsJSON sql.NullString
			var createdAt time.Time
			if err := rows.Scan(&id, &title, &imageURLsJSON, &createdAt); err != nil {
				continue
			}

			img := ""
			var urls []string
			if imageURLsJSON.Valid {
				if json.Unmarshal([]byte(imageURLsJSON.String), &urls) == nil && len(urls) > 0 {
					img = urls[0]
				}
			}

			activities = append(activities, ActivityItem{
				Type:      "new_listing",
				ID:        id,
				Message:   fmt.Sprintf("New item posted: %s", title.String),
				ImageURL:  img,
				Timestamp: createdAt,
			})
		}
	}

	// 2) Fetch recently completed trades
	tradeRows, err := h.db.QueryContext(ctx, `
		SELECT t.id, t.updated_at, p.title as target_title, p.image_urls
		FROM trades t
		JOIN products p ON t.target_product_id = p.id
		WHERE t.status = 'completed'
		ORDER BY t.updated_at DESC
		LIMIT 10
	`)
	if err != nil {
		log.Printf("GetRecentActivity: trades query failed: %v", err)
	} else {
		defer tradeRows.Close()
		for tradeRows.Next() {
			var id int
			var updatedAt time.Time
			var targetTitle sql.NullString
			var imageURLsJSON sql.NullString
			if err := tradeRows.Scan(&id, &updatedAt, &targetTitle, &imageURLsJSON); err != nil {
				continue
			}

			img := ""
			var urls []string
			if imageURLsJSON.Valid {
				if json.Unmarshal([]byte(imageURLsJSON.String), &urls) == nil && len(urls) > 0 {
					img = urls[0]
				}
			}

			// Find one offered item to make "A ↔ B" string (best-effort)
			var offeredTitle sql.NullString
			_ = h.db.QueryRowContext(ctx, `
				SELECT p.title
				FROM trade_items ti
				JOIN products p ON ti.product_id = p.id
				WHERE ti.trade_id = ?
				LIMIT 1
			`, id).Scan(&offeredTitle)

			message := fmt.Sprintf("Trade completed: %s", targetTitle.String)
			if offeredTitle.Valid && offeredTitle.String != "" {
				message = fmt.Sprintf("Trade completed: %s ↔ %s", targetTitle.String, offeredTitle.String)
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

	// 3) Near-you listings (only if caller provides lat/lng)
	latStr := c.Query("lat")
	lngStr := c.Query("lng")
	if latStr != "" && lngStr != "" {
		viewerLat, latErr := strconv.ParseFloat(latStr, 64)
		viewerLng, lngErr := strconv.ParseFloat(lngStr, 64)
		if latErr == nil && lngErr == nil {
			// Rough bounding box ~10km (about 0.09 degrees)
			const radiusDeg = 0.09
			var count int
			var sample sql.NullString
			nearErr := h.db.QueryRowContext(ctx, `
				SELECT COUNT(*) as cnt, MIN(title) as sample
				FROM products
				WHERE status = 'available'
				  AND created_at > DATE_SUB(NOW(), INTERVAL 2 DAY)
				  AND latitude IS NOT NULL
				  AND longitude IS NOT NULL
				  AND latitude BETWEEN ? AND ?
				  AND longitude BETWEEN ? AND ?
			`,
				viewerLat-radiusDeg, viewerLat+radiusDeg,
				viewerLng-radiusDeg, viewerLng+radiusDeg,
			).Scan(&count, &sample)
			if nearErr == nil && count > 0 {
				activities = append(activities, ActivityItem{
					Type:      "near_you",
					ID:        0,
					Message:   fmt.Sprintf("%d new listing(s) near you 📍", count),
					ImageURL:  "",
					Timestamp: time.Now(),
				})
			}
		}
	}

	// Sort unified timeline by timestamp DESC (small list; simple O(n^2) sort is fine)
	for i := 0; i < len(activities); i++ {
		for j := i + 1; j < len(activities); j++ {
			if activities[i].Timestamp.Before(activities[j].Timestamp) {
				activities[i], activities[j] = activities[j], activities[i]
			}
		}
	}

	if len(activities) > 15 {
		activities = activities[:15]
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    activities,
	})
}
