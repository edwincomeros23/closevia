package handlers

import (
	"database/sql"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/models"
)

type AdminHandler struct {
	db *sql.DB
}

func NewAdminHandler() *AdminHandler {
	return &AdminHandler{db: database.DB}
}

// GetAdminStats returns essential dashboard statistics for admin
func (h *AdminHandler) GetAdminStats(c *fiber.Ctx) error {
	now := time.Now()

	// ===== ESSENTIAL METRICS =====

	// Total Users
	var totalUsers int
	err := h.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&totalUsers)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch total users"})
	}

	// Premium Users (users with premium listings)
	var premiumUsers int
	err = h.db.QueryRow(`
		SELECT COUNT(DISTINCT u.id) FROM users u
		JOIN products p ON p.seller_id = u.id
		WHERE p.is_premium = true AND p.status NOT IN ('sold', 'expired', 'draft')
	`).Scan(&premiumUsers)
	if err != nil {
		premiumUsers = 0
	}

	// Total Income (completed trades revenue)
	var totalIncome float64
	err = h.db.QueryRow(`
		SELECT COALESCE(SUM(COALESCE(net_amount, 0)), 0) FROM trades
		WHERE status = 'completed'
	`).Scan(&totalIncome)
	if err != nil {
		totalIncome = 0
	}

	// Active Listings
	var activeListings int
	err = h.db.QueryRow(`
		SELECT COUNT(*) FROM products
		WHERE status NOT IN ('sold', 'expired', 'draft', 'locked')
	`).Scan(&activeListings)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch active listings"})
	}

	// Total Trades/Completed Deals
	var totalTrades int
	err = h.db.QueryRow(`SELECT COUNT(*) FROM trades WHERE status = 'completed'`).Scan(&totalTrades)
	if err != nil {
		totalTrades = 0
	}

	// New Users Today
	var newUsersToday int
	err = h.db.QueryRow(`
		SELECT COUNT(*) FROM users
		WHERE DATE(created_at) = CURDATE()
	`).Scan(&newUsersToday)
	if err != nil {
		newUsersToday = 0
	}

	// New Listings Today
	var newListingsToday int
	err = h.db.QueryRow(`
		SELECT COUNT(*) FROM products
		WHERE DATE(created_at) = CURDATE()
	`).Scan(&newListingsToday)
	if err != nil {
		newListingsToday = 0
	}

	// Verified Users
	var verifiedUsers int
	err = h.db.QueryRow(`SELECT COUNT(*) FROM users WHERE verified = true`).Scan(&verifiedUsers)
	if err != nil {
		verifiedUsers = 0
	}

	// Pending Approvals (products awaiting approval)
	var pendingApprovals int
	err = h.db.QueryRow(`
		SELECT COUNT(*) FROM products
		WHERE status = 'pending_approval'
	`).Scan(&pendingApprovals)
	if err != nil {
		pendingApprovals = 0
	}

	// Reports Filed
	var reportsFiled int
	err = h.db.QueryRow(`SELECT COUNT(*) FROM reports`).Scan(&reportsFiled)
	if err != nil {
		reportsFiled = 0
	}

	// Suspended/Banned Users
	var suspendedUsers int
	err = h.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'suspended'`).Scan(&suspendedUsers)
	if err != nil {
		suspendedUsers = 0
	}

	// Storage Usage (estimate based on uploaded files - this is a rough calculation)
	var storageUsageMB float64
	err = h.db.QueryRow(`
		SELECT COALESCE(SUM(CASE
			WHEN image_urls != '[]' THEN LENGTH(image_urls) * 0.001  -- Rough estimate per image
			ELSE 0.1  -- Base size for products with minimal images
		END), 0) as estimated_mb FROM products
	`).Scan(&storageUsageMB)
	if err != nil {
		storageUsageMB = 0
	}

	// Revenue Breakdown (last 30 days by week)
	revenueRows, err := h.db.Query(`
		SELECT
			DATE_FORMAT(created_at, '%Y-%U') as week,
			COALESCE(SUM(COALESCE(net_amount, 0)), 0) as revenue
		FROM trades
		WHERE status = 'completed' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
		GROUP BY week
		ORDER BY week DESC
		LIMIT 4
	`)
	if err != nil {
		revenueRows = nil
	}

	type RevenueBreakdown struct {
		Period string  `json:"period"`
		Amount float64 `json:"amount"`
	}

	var revenueBreakdown []RevenueBreakdown
	if revenueRows != nil {
		defer revenueRows.Close()
		for revenueRows.Next() {
			var rb RevenueBreakdown
			if err := revenueRows.Scan(&rb.Period, &rb.Amount); err == nil {
				// Format period as "Week X"
				rb.Period = "Week " + rb.Period[len(rb.Period)-2:]
				revenueBreakdown = append(revenueBreakdown, rb)
			}
		}
	}

	// Recent Activity (last 5 actions)
	activityRows, err := h.db.Query(`
		SELECT 'New User' as action, COUNT(*) as count, MAX(created_at) as latest
		FROM users WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
		UNION ALL
		SELECT 'New Listing' as action, COUNT(*) as count, MAX(created_at) as latest
		FROM products WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
		UNION ALL
		SELECT 'Trade Completed' as action, COUNT(*) as count, MAX(created_at) as latest
		FROM trades WHERE status = 'completed' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
	`)
	if err != nil {
		activityRows = nil
	}

	type ActivityItem struct {
		Action string    `json:"action"`
		Count  int       `json:"count"`
		Latest time.Time `json:"latest"`
	}

	var recentActivity []ActivityItem
	if activityRows != nil {
		defer activityRows.Close()
		for activityRows.Next() {
			var ai ActivityItem
			if err := activityRows.Scan(&ai.Action, &ai.Count, &ai.Latest); err == nil {
				recentActivity = append(recentActivity, ai)
			}
		}
	}

	// ===== COMPILE ESSENTIAL STATISTICS =====

	stats := fiber.Map{
		// Core Metrics
		"total_users":     totalUsers,
		"premium_users":   premiumUsers,
		"total_income":    totalIncome,
		"active_listings": activeListings,
		"total_trades":    totalTrades,

		// Daily Metrics
		"new_users_today":    newUsersToday,
		"new_listings_today": newListingsToday,

		// User Management
		"verified_users":    verifiedUsers,
		"pending_approvals": pendingApprovals,
		"reports_filed":     reportsFiled,
		"suspended_users":   suspendedUsers,

		// System Metrics
		"storage_usage_mb":  storageUsageMB,
		"revenue_breakdown": revenueBreakdown,
		"recent_activity":   recentActivity,

		// Metadata
		"last_updated": now.Format("2006-01-02 15:04:05"),
	}

	return c.JSON(models.APIResponse{Success: true, Data: stats})
}
