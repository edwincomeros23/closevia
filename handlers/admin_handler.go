package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/models"
)

type AdminHandler struct {
	db *sql.DB

	statsCacheMu  sync.RWMutex
	statsCache    *AdminStats
	statsCacheExp time.Time
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
	// Cache to avoid hammering DB on frequent admin refreshes.
	// Keeps UX snappy without changing data semantics (short TTL).
	const cacheTTL = 60 * time.Second
	h.statsCacheMu.RLock()
	if h.statsCache != nil && time.Now().Before(h.statsCacheExp) {
		cached := *h.statsCache
		h.statsCacheMu.RUnlock()
		return c.JSON(models.APIResponse{Success: true, Data: cached})
	}
	h.statsCacheMu.RUnlock()

	now := time.Now()
	const perQueryTimeout = 3 * time.Second

	queryInt := func(q string, args ...any) (int, error) {
		ctx, cancel := context.WithTimeout(context.Background(), perQueryTimeout)
		defer cancel()
		var v int
		err := h.db.QueryRowContext(ctx, q, args...).Scan(&v)
		return v, err
	}
	queryFloat := func(q string, args ...any) (float64, error) {
		ctx, cancel := context.WithTimeout(context.Background(), perQueryTimeout)
		defer cancel()
		var v float64
		err := h.db.QueryRowContext(ctx, q, args...).Scan(&v)
		return v, err
	}

	// ===== ESSENTIAL METRICS =====
	// Avoid a single fragile query: older DBs may be missing tables/columns (earnings, reports, is_premium, etc).
	// If a metric query fails, we default it to 0 rather than 500 the entire dashboard.
	var totalUsers, premiumUsers, activeListings, totalTrades int
	var newUsersToday, newListingsToday, verifiedUsers int
	var pendingApprovals, pendingVerifications, reportsFiled, suspendedUsers int
	var totalIncome float64

	if v, err := queryInt(`SELECT COUNT(*) FROM users`); err == nil {
		totalUsers = v
	}

	// Premium users: prefer products.is_premium if present.
	if v, err := queryInt(`
		SELECT COUNT(DISTINCT seller_id)
		FROM products
		WHERE is_premium = true AND status NOT IN ('sold', 'expired', 'draft')
	`); err == nil {
		premiumUsers = v
	}

	// Total income: prefer earnings table if present, else fallback to completed trades.net_amount.
	if v, err := queryFloat(`SELECT COALESCE(SUM(amount), 0) FROM earnings`); err == nil {
		totalIncome = v
	} else if v2, err2 := queryFloat(`SELECT COALESCE(SUM(net_amount), 0) FROM trades WHERE status = 'completed'`); err2 == nil {
		totalIncome = v2
	}

	if v, err := queryInt(`SELECT COUNT(*) FROM products WHERE status NOT IN ('sold', 'expired', 'draft', 'locked')`); err == nil {
		activeListings = v
	}
	if v, err := queryInt(`SELECT COUNT(*) FROM trades WHERE status = 'completed'`); err == nil {
		totalTrades = v
	}
	if v, err := queryInt(`SELECT COUNT(*) FROM users WHERE created_at >= CURDATE() AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`); err == nil {
		newUsersToday = v
	}
	if v, err := queryInt(`SELECT COUNT(*) FROM products WHERE created_at >= CURDATE() AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`); err == nil {
		newListingsToday = v
	}
	if v, err := queryInt(`SELECT COUNT(*) FROM users WHERE verified = true`); err == nil {
		verifiedUsers = v
	}
	if v, err := queryInt(`SELECT COUNT(*) FROM products WHERE status = 'pending_approval'`); err == nil {
		pendingApprovals = v
	}
	if v, err := queryInt(`SELECT COUNT(*) FROM users WHERE verification_status = 'pending'`); err == nil {
		pendingVerifications = v
	}
	if v, err := queryInt(`SELECT COUNT(*) FROM reports`); err == nil {
		reportsFiled = v
	}
	// Suspended users: older/newer schemas might use role='suspended' or is_suspended boolean.
	if v, err := queryInt(`SELECT COUNT(*) FROM users WHERE role = 'suspended'`); err == nil {
		suspendedUsers = v
	} else if v2, err2 := queryInt(`SELECT COUNT(*) FROM users WHERE is_suspended = true`); err2 == nil {
		suspendedUsers = v2
	}

	// Storage Usage (prefer information_schema for fast metadata-based estimate)
	var storageUsageMB float64
	{
		ctx, cancel := context.WithTimeout(context.Background(), perQueryTimeout)
		defer cancel()
		err := h.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(data_length + index_length) / 1024 / 1024, 0)
		FROM information_schema.tables
		WHERE table_schema = DATABASE()
		`).Scan(&storageUsageMB)
		if err != nil {
			// Fallback to legacy estimate if information_schema isn't accessible.
			ctx2, cancel2 := context.WithTimeout(context.Background(), perQueryTimeout)
			defer cancel2()
			_ = h.db.QueryRowContext(ctx2, `
			SELECT COALESCE(SUM(CASE
				WHEN image_urls != '[]' THEN LENGTH(image_urls) * 0.001
				ELSE 0.1
			END), 0) as estimated_mb FROM products
			`).Scan(&storageUsageMB)
		}
	}

	// Revenue Breakdown (last 30 days by week)
	var revenueBreakdown []RevenueBreakdown
	var revenueRows *sql.Rows
	var revenueErr error
	{
		ctx, cancel := context.WithTimeout(context.Background(), perQueryTimeout)
		defer cancel()
		revenueRows, revenueErr = h.db.QueryContext(ctx, `
		SELECT 
			DATE_FORMAT(created_at, '%Y-%U') as week,
			SUM(amount) as revenue
		FROM earnings
		WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
		GROUP BY week
		ORDER BY week DESC
		LIMIT 4
		`)
	}
	if revenueErr == nil && revenueRows != nil {
		defer revenueRows.Close()
		for revenueRows.Next() {
			var rb RevenueBreakdown
			if err := revenueRows.Scan(&rb.Period, &rb.Amount); err == nil {
				// Format period as "Week XX" (guard against unexpected short strings)
				period := strings.TrimSpace(rb.Period)
				if len(period) >= 2 {
					rb.Period = "Week " + period[len(period)-2:]
				} else if period != "" {
					rb.Period = "Week " + period
				} else {
					rb.Period = "Week"
				}
				revenueBreakdown = append(revenueBreakdown, rb)
			}
		}
	}

	// Revenue by Source
	revenueBySource := map[string]float64{
		"trade_fee":            0,
		"premium_subscription": 0,
		"riders_remittance":    0,
		"advertisers_revenue":  0,
		"google_ads":           0,
	}
	var sourceRows *sql.Rows
	var sourceErr error
	{
		ctx, cancel := context.WithTimeout(context.Background(), perQueryTimeout)
		defer cancel()
		sourceRows, sourceErr = h.db.QueryContext(ctx, `SELECT source_type, COALESCE(SUM(amount), 0) FROM earnings GROUP BY source_type`)
	}
	if sourceErr == nil && sourceRows != nil {
		defer sourceRows.Close()
		for sourceRows.Next() {
			var st string
			var amt float64
			if err := sourceRows.Scan(&st, &amt); err != nil {
				continue
			}
			revenueBySource[st] = amt
		}
	}

	// Recent Activity (last 5 actions)
	var activityRows *sql.Rows
	var activityErr error
	{
		ctx, cancel := context.WithTimeout(context.Background(), perQueryTimeout)
		defer cancel()
		activityRows, activityErr = h.db.QueryContext(ctx, `
		SELECT 'New User' as action, COUNT(*) as count, MAX(created_at) as latest
		FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
		UNION ALL
		SELECT 'New Listing' as action, COUNT(*) as count, MAX(created_at) as latest
		FROM products WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
		UNION ALL
		SELECT 'Trade Completed' as action, COUNT(*) as count, MAX(created_at) as latest
		FROM trades WHERE status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
		`)
	}
	if activityErr != nil {
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

	h.statsCacheMu.Lock()
	h.statsCache = &stats
	h.statsCacheExp = time.Now().Add(cacheTTL)
	h.statsCacheMu.Unlock()

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

func parseAdminDateRange(c *fiber.Ctx) (start *time.Time, end *time.Time, err error) {
	startStr := c.Query("start", "")
	endStr := c.Query("end", "")

	if startStr != "" {
		s, err := time.ParseInLocation("2006-01-02", startStr, time.Local)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid start date")
		}
		start = &s
	}
	if endStr != "" {
		e, err := time.ParseInLocation("2006-01-02", endStr, time.Local)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid end date")
		}
		end = &e
	}

	return start, end, nil
}

// GetAdminRevenue returns revenue summed over an inclusive date range.
// Query params:
// - start=YYYY-MM-DD (optional)
// - end=YYYY-MM-DD (optional, inclusive)
func (h *AdminHandler) GetAdminRevenue(c *fiber.Ctx) error {
	startStr := c.Query("start", "")
	endStr := c.Query("end", "")

	var start *time.Time
	var endExclusive *time.Time

	if startStr != "" {
		s, err := time.ParseInLocation("2006-01-02", startStr, time.Local)
		if err != nil {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid start date"})
		}
		start = &s
	}
	if endStr != "" {
		e, err := time.ParseInLocation("2006-01-02", endStr, time.Local)
		if err != nil {
			return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid end date"})
		}
		ex := e.AddDate(0, 0, 1) // inclusive end -> exclusive upper bound
		endExclusive = &ex
	}

	where := "WHERE 1=1"
	args := make([]interface{}, 0, 2)
	if start != nil {
		where += " AND created_at >= ?"
		args = append(args, *start)
	}
	if endExclusive != nil {
		where += " AND created_at < ?"
		args = append(args, *endExclusive)
	}

	var revenue float64
	if err := h.db.QueryRow("SELECT COALESCE(SUM(amount), 0) FROM earnings "+where, args...).Scan(&revenue); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch revenue"})
	}

	if revenue == 0 {
		// Fallback for installs without earnings records.
		var legacy float64
		tradeWhere := strings.Replace(where, "WHERE 1=1", "WHERE status = 'completed'", 1)
		_ = h.db.QueryRow("SELECT COALESCE(SUM(net_amount), 0) FROM trades "+tradeWhere, args...).Scan(&legacy)
		if legacy > 0 {
			revenue = legacy
		}
	}

	return c.JSON(models.APIResponse{Success: true, Data: fiber.Map{"revenue": revenue}})
}

// GetAdminTrades returns a paginated list of trades for admin usage.
func (h *AdminHandler) GetAdminTrades(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = 20
	}
	offset := (page - 1) * limit

	status := c.Query("status", "")
	start, end, derr := parseAdminDateRange(c)
	if derr != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: derr.Error()})
	}

	where := "WHERE 1=1"
	args := make([]interface{}, 0, 6)
	if status != "" {
		where += " AND t.status = ?"
		args = append(args, status)
	}
	if start != nil {
		where += " AND t.created_at >= ?"
		args = append(args, *start)
	}
	if end != nil {
		where += " AND t.created_at < ?"
		args = append(args, *end)
	}

	var total int
	if err := h.db.QueryRow("SELECT COUNT(*) FROM trades t "+where, args...).Scan(&total); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to get trade count"})
	}

	rows, err := h.db.Query(`
		SELECT
			t.id,
			t.buyer_id,
			t.seller_id,
			t.target_product_id,
			t.status,
			COALESCE(t.trade_option, '') AS trade_option,
			t.created_at,
			t.updated_at,
			COALESCE(ub.name, '') AS buyer_name,
			COALESCE(us.name, '') AS seller_name,
			COALESCE(p.title, '') AS product_title
		FROM trades t
		LEFT JOIN users ub ON ub.id = t.buyer_id
		LEFT JOIN users us ON us.id = t.seller_id
		LEFT JOIN products p ON p.id = t.target_product_id
		`+where+`
		ORDER BY t.created_at DESC
		LIMIT ? OFFSET ?
	`, append(args, limit, offset)...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to get trades"})
	}
	defer rows.Close()

	trades := make([]models.Trade, 0, limit)
	for rows.Next() {
		var t models.Trade
		var tradeOption sql.NullString
		var buyerName sql.NullString
		var sellerName sql.NullString
		var productTitle sql.NullString
		if err := rows.Scan(
			&t.ID,
			&t.BuyerID,
			&t.SellerID,
			&t.TargetProductID,
			&t.Status,
			&tradeOption,
			&t.CreatedAt,
			&t.UpdatedAt,
			&buyerName,
			&sellerName,
			&productTitle,
		); err != nil {
			continue
		}
		if tradeOption.Valid {
			t.TradeOption = tradeOption.String
		}
		if buyerName.Valid {
			t.BuyerName = buyerName.String
		}
		if sellerName.Valid {
			t.SellerName = sellerName.String
		}
		if productTitle.Valid {
			t.ProductTitle = productTitle.String
		}
		trades = append(trades, t)
	}

	totalPages := (total + limit - 1) / limit
	return c.JSON(models.APIResponse{Success: true, Data: models.PaginatedResponse{Data: trades, Total: total, Page: page, Limit: limit, TotalPages: totalPages}})
}

// GetAdminCategories returns aggregated category counts from products.
func (h *AdminHandler) GetAdminCategories(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	if limit <= 0 {
		limit = 50
	}

	start, end, derr := parseAdminDateRange(c)
	if derr != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: derr.Error()})
	}

	where := "WHERE 1=1"
	args := make([]interface{}, 0, 4)
	if start != nil {
		where += " AND created_at >= ?"
		args = append(args, *start)
	}
	if end != nil {
		where += " AND created_at < ?"
		args = append(args, *end)
	}

	type CategoryRow struct {
		Category    string    `json:"category"`
		Total       int       `json:"total"`
		Available   int       `json:"available"`
		Premium     int       `json:"premium"`
		LastCreated time.Time `json:"last_created_at"`
	}

	rows, err := h.db.Query(`
		SELECT
			COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized') AS category,
			COUNT(*) AS total,
			SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
			SUM(CASE WHEN premium = true THEN 1 ELSE 0 END) AS premium,
			MAX(created_at) AS last_created_at
		FROM products
		`+where+`
		GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized')
		ORDER BY total DESC
		LIMIT ?
	`, append(args, limit)...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to get categories"})
	}
	defer rows.Close()

	result := make([]CategoryRow, 0, limit)
	for rows.Next() {
		var r CategoryRow
		if err := rows.Scan(&r.Category, &r.Total, &r.Available, &r.Premium, &r.LastCreated); err != nil {
			continue
		}
		result = append(result, r)
	}
	if result == nil {
		result = []CategoryRow{}
	}

	return c.JSON(models.APIResponse{Success: true, Data: result})
}
