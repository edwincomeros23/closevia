package handlers

import (
	"database/sql"
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/models"
)

type AdminHandler struct {
	db *sql.DB
}

type RevenueBreakdown struct {
	Period string  `json:"period"`
	Amount float64 `json:"amount"`
}

type RecentActivity struct {
	Action string    `json:"action"`
	Count  int       `json:"count"`
	Latest time.Time `json:"latest"`
}

type AdminStats struct {
	TotalUsers           int                `json:"total_users"`
	PremiumUsers         int                `json:"premium_users"`
	TotalIncome          float64            `json:"total_income"`
	ActiveListings       int                `json:"active_listings"`
	TotalTrades          int                `json:"total_trades"`
	NewUsersToday        int                `json:"new_users_today"`
	NewListingsToday     int                `json:"new_listings_today"`
	VerifiedUsers        int                `json:"verified_users"`
	PendingApprovals     int                `json:"pending_approvals"`
	PendingVerifications int                `json:"pending_verifications"`
	ReportsFiled         int                `json:"reports_filed"`
	SuspendedUsers       int                `json:"suspended_users"`
	StorageUsageMB       float64            `json:"storage_usage_mb"`
	RevenueBreakdown     []RevenueBreakdown `json:"revenue_breakdown"`
	RevenueBySource      map[string]float64 `json:"revenue_by_source"`
	RecentActivity       []RecentActivity   `json:"recent_activity"`
	LastUpdated          string             `json:"last_updated"`
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

	// Total Income (from earnings table + fallback to legacy trades)
	var totalIncome float64
	err = h.db.QueryRow(`
		SELECT COALESCE(
			(SELECT SUM(amount) FROM earnings),
			(SELECT SUM(net_amount) FROM trades WHERE status = 'completed')
		, 0)
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

	// Pending ID/COR verifications (users who submitted ID/COR awaiting admin review)
	var pendingVerifications int
	err = h.db.QueryRow(`SELECT COUNT(*) FROM users WHERE verification_status = 'pending'`).Scan(&pendingVerifications)
	if err != nil {
		pendingVerifications = 0
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
	var revenueBreakdown []RevenueBreakdown
	revenueRows, err := h.db.Query(`
		SELECT 
			DATE_FORMAT(created_at, '%Y-%U') as week,
			SUM(amount) as revenue
		FROM earnings
		WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
		GROUP BY week
		ORDER BY week DESC
		LIMIT 4
	`)
	if err == nil {
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

	// Revenue by Source
	revenueBySource := make(map[string]float64)
	sourceRows, err := h.db.Query(`SELECT source_type, SUM(amount) FROM earnings GROUP BY source_type`)
	if err == nil {
		defer sourceRows.Close()
		for sourceRows.Next() {
			var st string
			var amt float64
			sourceRows.Scan(&st, &amt)
			revenueBySource[st] = amt
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

	var recentActivity []RecentActivity
	if activityRows != nil {
		defer activityRows.Close()
		for activityRows.Next() {
			var ai RecentActivity
			if err := activityRows.Scan(&ai.Action, &ai.Count, &ai.Latest); err == nil {
				recentActivity = append(recentActivity, ai)
			}
		}
	}

	// ===== COMPILE ESSENTIAL STATISTICS =====

	stats := AdminStats{
		TotalUsers:           totalUsers,
		PremiumUsers:         premiumUsers,
		TotalIncome:          totalIncome,
		ActiveListings:       activeListings,
		TotalTrades:          totalTrades,
		NewUsersToday:        newUsersToday,
		NewListingsToday:     newListingsToday,
		VerifiedUsers:        verifiedUsers,
		PendingApprovals:     pendingApprovals,
		PendingVerifications: pendingVerifications,
		ReportsFiled:         reportsFiled,
		SuspendedUsers:       suspendedUsers,
		StorageUsageMB:       storageUsageMB,
		RevenueBreakdown:     revenueBreakdown,
		RevenueBySource:      revenueBySource,
		RecentActivity:       recentActivity,
		LastUpdated:          now.Format("2006-01-02 15:04:05"),
	}

	return c.JSON(models.APIResponse{Success: true, Data: stats})
}

// GetDailyStats returns per-day activity counts for a given month (for calendar dots)
func (h *AdminHandler) GetDailyStats(c *fiber.Ctx) error {
	yearStr := c.Query("year", "")
	monthStr := c.Query("month", "")

	now := time.Now()
	year := now.Year()
	month := int(now.Month())

	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil {
			year = y
		}
	}
	if monthStr != "" {
		if m, err := strconv.Atoi(monthStr); err == nil && m >= 1 && m <= 12 {
			month = m
		}
	}

	// Build date range for the requested month
	startDate := fmt.Sprintf("%04d-%02d-01", year, month)
	// Last day of month: first day of next month minus 1 day
	firstOfNext := time.Date(year, time.Month(month+1), 1, 0, 0, 0, 0, time.UTC)
	endDate := firstOfNext.AddDate(0, 0, -1).Format("2006-01-02")

	type DayStats struct {
		Date            string `json:"date"`
		NewUsers        int    `json:"new_users"`
		NewListings     int    `json:"new_listings"`
		CompletedTrades int    `json:"completed_trades"`
		ReportsFiled    int    `json:"reports_filed"`
	}

	// Aggregate all activity per day using a UNION approach
	rows, err := h.db.Query(`
		SELECT
			day,
			SUM(new_users) AS new_users,
			SUM(new_listings) AS new_listings,
			SUM(completed_trades) AS completed_trades,
			SUM(reports_filed) AS reports_filed
		FROM (
			SELECT DATE(created_at) AS day, COUNT(*) AS new_users, 0 AS new_listings, 0 AS completed_trades, 0 AS reports_filed
			FROM users
			WHERE DATE(created_at) BETWEEN ? AND ?
			GROUP BY DATE(created_at)

			UNION ALL

			SELECT DATE(created_at) AS day, 0, COUNT(*), 0, 0
			FROM products
			WHERE DATE(created_at) BETWEEN ? AND ?
			GROUP BY DATE(created_at)

			UNION ALL

			SELECT DATE(created_at) AS day, 0, 0, COUNT(*), 0
			FROM trades
			WHERE status = 'completed' AND DATE(created_at) BETWEEN ? AND ?
			GROUP BY DATE(created_at)

			UNION ALL

			SELECT DATE(created_at) AS day, 0, 0, 0, COUNT(*)
			FROM reports
			WHERE DATE(created_at) BETWEEN ? AND ?
			GROUP BY DATE(created_at)
		) combined
		GROUP BY day
		ORDER BY day ASC
	`, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch daily stats"})
	}
	defer rows.Close()

	var dailyStats []DayStats
	for rows.Next() {
		var ds DayStats
		var day time.Time
		if err := rows.Scan(&day, &ds.NewUsers, &ds.NewListings, &ds.CompletedTrades, &ds.ReportsFiled); err == nil {
			ds.Date = day.Format("2006-01-02")
			dailyStats = append(dailyStats, ds)
		}
	}

	if dailyStats == nil {
		dailyStats = []DayStats{}
	}

	return c.JSON(models.APIResponse{Success: true, Data: dailyStats})
}

// GetStatsByDate returns a full stats snapshot for a specific date (YYYY-MM-DD)
func (h *AdminHandler) GetStatsByDate(c *fiber.Ctx) error {
	dateStr := c.Query("date", "")
	if dateStr == "" {
		dateStr = time.Now().Format("2006-01-02")
	}

	// Validate date format
	if _, err := time.Parse("2006-01-02", dateStr); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid date format, use YYYY-MM-DD"})
	}

	var newUsers, newListings, completedTrades, reportsFiled int

	h.db.QueryRow(`SELECT COUNT(*) FROM users WHERE DATE(created_at) = ?`, dateStr).Scan(&newUsers)
	h.db.QueryRow(`SELECT COUNT(*) FROM products WHERE DATE(created_at) = ?`, dateStr).Scan(&newListings)
	h.db.QueryRow(`SELECT COUNT(*) FROM trades WHERE status = 'completed' AND DATE(created_at) = ?`, dateStr).Scan(&completedTrades)
	h.db.QueryRow(`SELECT COUNT(*) FROM reports WHERE DATE(created_at) = ?`, dateStr).Scan(&reportsFiled)

	// Revenue for that day
	var dayRevenue float64
	h.db.QueryRow(`SELECT COALESCE(SUM(amount), 0) FROM earnings WHERE DATE(created_at) = ?`, dateStr).Scan(&dayRevenue)
	if dayRevenue == 0 {
		// Fallback to legacy trades if no earnings recorded yet
		h.db.QueryRow(`SELECT COALESCE(SUM(net_amount), 0) FROM trades WHERE status='completed' AND DATE(created_at) = ?`, dateStr).Scan(&dayRevenue)
	}

	// Active listings snapshot (products that existed on that day and were active)
	var activeListings int
	h.db.QueryRow(`SELECT COUNT(*) FROM products WHERE DATE(created_at) <= ? AND status NOT IN ('sold','expired','draft','locked')`, dateStr).Scan(&activeListings)

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"date":             dateStr,
			"new_users":        newUsers,
			"new_listings":     newListings,
			"completed_trades": completedTrades,
			"reports_filed":    reportsFiled,
			"revenue":          dayRevenue,
			"active_listings":  activeListings,
		},
	})
}
