// PostProductForTrade allows a member to post a product for trade in the organization

package handlers

// ...existing code...
import (
	"database/sql"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
)

// PostProductForTrade allows a member to post a product for trade in the organization
func (h *OrganizationHandler) PostProductForTrade(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	slug := c.Params("slug")
	var payload struct {
		ProductID int `json:"product_id"`
	}
	if err := c.BodyParser(&payload); err != nil || payload.ProductID == 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid product_id"})
	}
	// Get org ID
	var orgID int
	err := h.db.QueryRow("SELECT id FROM organizations WHERE slug = ?", slug).Scan(&orgID)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
	}
	// Check membership
	var status string
	err = h.db.QueryRow("SELECT status FROM organization_memberships WHERE organization_id = ? AND user_id = ?", orgID, userID).Scan(&status)
	if err != nil || status != "approved" {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not a member of this organization"})
	}
	// Check product ownership
	var ownerID int
	err = h.db.QueryRow("SELECT seller_id FROM products WHERE id = ?", payload.ProductID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You do not own this product"})
	}
	// Insert or update trade post
	_, err = h.db.Exec(`INSERT INTO organization_trade_posts (organization_id, user_id, product_id, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())
		ON DUPLICATE KEY UPDATE updated_at = NOW()`,
		orgID, userID, payload.ProductID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to post product for trade"})
	}
	return c.JSON(models.APIResponse{Success: true})
}

// GetTradeFeed returns products posted for trade in the org, grouped by product
func (h *OrganizationHandler) GetTradeFeed(c *fiber.Ctx) error {
	slug := c.Params("slug")
	// Get org ID
	var orgID int
	err := h.db.QueryRow("SELECT id FROM organizations WHERE slug = ?", slug).Scan(&orgID)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
	}
	// Query all trade posts for this org (manually posted) + products tagged with this org
	rows, err := h.db.Query(`
		SELECT DISTINCT p.id, p.title, p.description, p.price, p.image_urls, p.status, p.category, p.seller_id,
			   u.id, u.name, u.profile_picture, COALESCE(otp.created_at, NOW()) as post_time
		FROM products p
		JOIN users u ON u.id = p.seller_id
		LEFT JOIN organization_trade_posts otp ON otp.product_id = p.id AND otp.organization_id = ?
		LEFT JOIN product_organization_tags pot ON pot.product_id = p.id AND pot.organization_id = ?
		WHERE (otp.organization_id = ? OR pot.organization_id = ?) AND p.status = 'available'
		ORDER BY post_time DESC, p.id DESC
	`, orgID, orgID, orgID, orgID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch trade feed"})
	}
	defer rows.Close()
	// Group by product
	type Member struct {
		ID             int    `json:"id"`
		Name           string `json:"name"`
		ProfilePicture string `json:"profile_picture"`
	}
	type ProductGroup struct {
		ProductID   int      `json:"product_id"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Price       float64  `json:"price"`
		ImageURLs   string   `json:"image_urls"`
		Status      string   `json:"status"`
		Category    string   `json:"category"`
		Members     []Member `json:"members"`
	}
	groups := map[int]*ProductGroup{}
	for rows.Next() {
		var pid int
		var title, desc, imageURLs, status, category string
		var price float64
		var sellerID, userID int
		var userName, userPic string
		var postTime interface{} // from COALESCE(otp.created_at, NOW())
		if err := rows.Scan(&pid, &title, &desc, &price, &imageURLs, &status, &category, &sellerID, &userID, &userName, &userPic, &postTime); err != nil {
			continue
		}
		g, ok := groups[pid]
		if !ok {
			g = &ProductGroup{
				ProductID: pid, Title: title, Description: desc, Price: price, ImageURLs: imageURLs, Status: status, Category: category, Members: []Member{},
			}
			groups[pid] = g
		}
		g.Members = append(g.Members, Member{ID: userID, Name: userName, ProfilePicture: userPic})
	}
	// Convert to slice
	out := []ProductGroup{}
	for _, g := range groups {
		out = append(out, *g)
	}
	return c.JSON(models.APIResponse{Success: true, Data: out})
}

type OrganizationHandler struct {
	db *sql.DB
}

func NewOrganizationHandler() *OrganizationHandler {
	return &OrganizationHandler{db: database.DB}
}

func normalizeOrgSlug(value string) string {
	s := strings.ToLower(strings.TrimSpace(value))
	s = strings.ReplaceAll(s, "@", "")
	s = regexp.MustCompile(`[^a-z0-9-\s]`).ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, " ", "-")
	s = regexp.MustCompile(`-+`).ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 64 {
		s = strings.Trim(s[:64], "-")
	}
	if s == "" {
		s = "organization"
	}
	return s
}

func tierOrgLimit(tier string) int {
	switch strings.ToLower(strings.TrimSpace(tier)) {
	case "premium":
		return 10
	case "pro", "plus":
		return 3
	default:
		return 1
	}
}

func (h *OrganizationHandler) getUserTierAndLimit(userID int) (string, int, error) {
	var tier string
	if err := h.db.QueryRow("SELECT COALESCE(premium_tier, 'free') FROM users WHERE id = ?", userID).Scan(&tier); err != nil {
		return "", 0, err
	}
	return tier, tierOrgLimit(tier), nil
}

func (h *OrganizationHandler) countCreatedOrganizations(userID int) (int, error) {
	var count int
	err := h.db.QueryRow("SELECT COUNT(*) FROM organizations WHERE creator_user_id = ? AND is_deleted = FALSE", userID).Scan(&count)
	return count, err
}

func (h *OrganizationHandler) resolveOrg(slug string) (int, int, string, bool, error) {
	var (
		orgID     int
		creatorID int
		category  string
		isDeleted bool
	)
	err := h.db.QueryRow(`
		SELECT id, creator_user_id, COALESCE(category, ''), COALESCE(is_deleted, FALSE)
		FROM organizations
		WHERE slug = ?
		LIMIT 1
	`, slug).Scan(&orgID, &creatorID, &category, &isDeleted)
	if err != nil {
		return 0, 0, "", false, err
	}
	return orgID, creatorID, category, isDeleted, nil
}

// GetQuota returns the current user's organization creation quota.
func (h *OrganizationHandler) GetQuota(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	tier, limit, err := h.getUserTierAndLimit(userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to resolve account tier"})
	}

	count, err := h.countCreatedOrganizations(userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load organization quota"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"tier":         strings.ToLower(tier),
			"limit":        limit,
			"created":      count,
			"remaining":    maxInt(limit-count, 0),
			"can_create":   count < limit,
			"upgrade_hint": "Upgrade your plan to create more organizations",
		},
	})
}

// CreateOrganization creates a new topic-focused organization and seeds creator membership.
func (h *OrganizationHandler) CreateOrganization(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	var req struct {
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		Category    string `json:"category"`
		LogoURL     string `json:"logo_url"`
		CoverURL    string `json:"cover_url"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)
	req.Category = strings.TrimSpace(req.Category)
	req.LogoURL = strings.TrimSpace(req.LogoURL)
	req.CoverURL = strings.TrimSpace(req.CoverURL)
	if req.Name == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Organization name is required"})
	}
	if req.Category == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Organization category is required"})
	}

	tier, limit, err := h.getUserTierAndLimit(userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to resolve account tier"})
	}
	count, err := h.countCreatedOrganizations(userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to check organization quota"})
	}
	if count >= limit {
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "Organization creation limit reached for your tier",
			Data: fiber.Map{
				"error_code":    "ORG_LIMIT_REACHED",
				"current_tier":  strings.ToLower(tier),
				"current_count": count,
				"limit":         limit,
			},
		})
	}

	slug := normalizeOrgSlug(req.Slug)
	if strings.TrimSpace(req.Slug) == "" {
		slug = normalizeOrgSlug(req.Name)
	}
	baseSlug := slug
	for i := 1; ; i++ {
		var exists int
		err = h.db.QueryRow("SELECT COUNT(*) FROM organizations WHERE slug = ?", slug).Scan(&exists)
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to validate organization slug"})
		}
		if exists == 0 {
			break
		}
		slug = fmt.Sprintf("%s-%d", baseSlug, i)
	}

	tx, err := h.db.Begin()
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to create organization"})
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		INSERT INTO organizations (creator_user_id, name, slug, description, category, logo_url, cover_url)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, userID, req.Name, slug, req.Description, req.Category, req.LogoURL, req.CoverURL)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to create organization"})
	}
	orgID64, _ := res.LastInsertId()
	orgID := int(orgID64)

	_, err = tx.Exec(`
		INSERT INTO organization_memberships (organization_id, user_id, status, requested_at, decided_at, decided_by_user_id)
		VALUES (?, ?, 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
	`, orgID, userID, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to create creator membership"})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to finalize organization creation"})
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Organization created", Data: fiber.Map{"id": orgID, "slug": slug, "name": req.Name}})
}

// ListOrganizations returns public directory cards for org discovery.
func (h *OrganizationHandler) ListOrganizations(c *fiber.Ctx) error {
	q := strings.TrimSpace(c.Query("q", ""))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	pattern := "%" + q + "%"
	rows, err := h.db.Query(`
		SELECT id, name, slug, description, category, logo_url, creator_user_id, member_count
		FROM (
			SELECT o.id, o.name, o.slug, COALESCE(o.description, '') as description, COALESCE(o.category, '') as category, 
			       COALESCE(o.logo_url, '') as logo_url, o.creator_user_id,
			       COALESCE(SUM(CASE WHEN m.status = 'approved' THEN 1 ELSE 0 END), 0) AS member_count,
			       o.created_at
			FROM organizations o
			LEFT JOIN organization_memberships m ON m.organization_id = o.id
			WHERE o.is_deleted = FALSE
			GROUP BY o.id, o.name, o.slug, o.description, o.category, o.logo_url, o.creator_user_id, o.created_at

			UNION ALL

			SELECT id, COALESCE(org_name, name) as name, COALESCE(org_handle, slug) as slug, 
			       COALESCE(bio, '') as description, COALESCE(org_category, '') as category, 
			       COALESCE(org_logo_url, profile_picture, '') as logo_url, id as creator_user_id,
			       0 AS member_count, created_at
			FROM users
			WHERE is_organization = TRUE
		) AS combined
		WHERE (? = '' OR name LIKE ? OR slug LIKE ? OR category LIKE ?)
		ORDER BY created_at DESC
		LIMIT ?
	`, q, pattern, pattern, pattern, limit)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load organizations"})
	}
	defer rows.Close()

	items := make([]fiber.Map, 0)
	for rows.Next() {
		var (
			id, creatorID, members           int
			name, slug, desc, category, logo string
		)
		if err := rows.Scan(&id, &name, &slug, &desc, &category, &logo, &creatorID, &members); err != nil {
			continue
		}
		items = append(items, fiber.Map{
			"id":              id,
			"name":            name,
			"slug":            slug,
			"description":     desc,
			"category":        category,
			"logo_url":        logo,
			"creator_user_id": creatorID,
			"member_count":    members,
		})
	}

	return c.JSON(models.APIResponse{Success: true, Data: items})
}

// GetOrganization returns org details and caller membership status (if authenticated).
func (h *OrganizationHandler) GetOrganization(c *fiber.Ctx) error {
	slug := normalizeOrgSlug(c.Params("slug"))
	if slug == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Organization slug is required"})
	}

	var (
		id, creatorID                                  int
		name, description, category, logoURL, coverURL string
		isDeleted                                      bool
	)
	err := h.db.QueryRow(`
		SELECT id, creator_user_id, name, COALESCE(description, ''), COALESCE(category, ''),
		       COALESCE(logo_url, ''), COALESCE(cover_url, ''), COALESCE(is_deleted, FALSE)
		FROM organizations
		WHERE slug = ?
		LIMIT 1
	`, slug).Scan(&id, &creatorID, &name, &description, &category, &logoURL, &coverURL, &isDeleted)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
		}
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load organization"})
	}
	if isDeleted {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
	}

	var memberCount int
	_ = h.db.QueryRow(`SELECT COUNT(*) FROM organization_memberships WHERE organization_id = ? AND status = 'approved'`, id).Scan(&memberCount)

	membershipStatus := "none"
	if userID, ok := middleware.GetUserIDFromContext(c); ok {
		if userID == creatorID {
			membershipStatus = "approved"
		} else {
			_ = h.db.QueryRow(`SELECT status FROM organization_memberships WHERE organization_id = ? AND user_id = ? LIMIT 1`, id, userID).Scan(&membershipStatus)
		}
	}

	return c.JSON(models.APIResponse{Success: true, Data: fiber.Map{
		"id":                id,
		"slug":              slug,
		"name":              name,
		"description":       description,
		"category":          category,
		"logo_url":          logoURL,
		"cover_url":         coverURL,
		"creator_user_id":   creatorID,
		"member_count":      memberCount,
		"membership_status": membershipStatus,
	}})
}

// RequestJoin creates or re-opens a join request.
func (h *OrganizationHandler) RequestJoin(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	slug := normalizeOrgSlug(c.Params("slug"))
	if slug == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Organization slug is required"})
	}

	orgID, creatorID, _, isDeleted, err := h.resolveOrg(slug)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
		}
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to request membership"})
	}
	if isDeleted {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
	}

	if userID == creatorID {
		return c.Status(409).JSON(models.APIResponse{Success: false, Error: "Creator is already an approved member"})
	}

	var (
		membershipID  int
		status        string
		cooldownUntil sql.NullTime
	)
	err = h.db.QueryRow(`
		SELECT id, status, cooldown_until
		FROM organization_memberships
		WHERE organization_id = ? AND user_id = ?
		LIMIT 1
	`, orgID, userID).Scan(&membershipID, &status, &cooldownUntil)

	if err != nil && err != sql.ErrNoRows {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to request membership"})
	}

	if err == nil {
		switch status {
		case "approved":
			return c.Status(409).JSON(models.APIResponse{Success: false, Error: "You are already a member"})
		case "pending":
			return c.Status(409).JSON(models.APIResponse{Success: false, Error: "Join request already pending"})
		case "blocked":
			return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You are blocked from this organization"})
		}
		if cooldownUntil.Valid && cooldownUntil.Time.After(time.Now()) {
			return c.Status(429).JSON(models.APIResponse{Success: false, Error: "You can re-request after cooldown"})
		}
		_, err = h.db.Exec(`
			UPDATE organization_memberships
			SET status = 'pending', requested_at = CURRENT_TIMESTAMP, decided_at = NULL, decided_by_user_id = NULL, removed_at = NULL, cooldown_until = NULL, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, membershipID)
	} else {
		_, err = h.db.Exec(`
			INSERT INTO organization_memberships (organization_id, user_id, status, requested_at)
			VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)
		`, orgID, userID)
	}
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to submit join request"})
	}

	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'org_join_request', ?, FALSE)", creatorID, "New join request received for @"+slug)

	return c.JSON(models.APIResponse{Success: true, Message: "Join request submitted"})
}

// ListJoinRequests returns pending requests for organization creator.
func (h *OrganizationHandler) ListJoinRequests(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	slug := normalizeOrgSlug(c.Params("slug"))

	orgID, creatorID, _, isDeleted, err := h.resolveOrg(slug)
	if err != nil || isDeleted {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
	}
	if userID != creatorID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Only the organization creator can manage requests"})
	}

	rows, err := h.db.Query(`
		SELECT m.user_id, COALESCE(u.slug, ''), COALESCE(u.name, ''), COALESCE(u.profile_picture, ''), m.requested_at
		FROM organization_memberships m
		JOIN users u ON u.id = m.user_id
		WHERE m.organization_id = ? AND m.status = 'pending'
		ORDER BY m.requested_at ASC
	`, orgID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load join requests"})
	}
	defer rows.Close()

	items := make([]fiber.Map, 0)
	for rows.Next() {
		var (
			requestUserID              int
			slug, name, profilePicture string
			requestedAt                time.Time
		)
		if err := rows.Scan(&requestUserID, &slug, &name, &profilePicture, &requestedAt); err != nil {
			continue
		}
		items = append(items, fiber.Map{
			"user_id":         requestUserID,
			"slug":            slug,
			"name":            name,
			"profile_picture": profilePicture,
			"requested_at":    requestedAt,
		})
	}

	return c.JSON(models.APIResponse{Success: true, Data: items})
}

// ListMembers returns approved members for organization creator admin panel.
func (h *OrganizationHandler) ListMembers(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	slug := normalizeOrgSlug(c.Params("slug"))

	orgID, creatorID, _, isDeleted, err := h.resolveOrg(slug)
	if err != nil || isDeleted {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
	}
	if userID != creatorID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Only the organization creator can view members"})
	}

	rows, err := h.db.Query(`
		SELECT m.user_id, COALESCE(u.slug, ''), COALESCE(u.name, ''), COALESCE(u.profile_picture, ''), m.requested_at
		FROM organization_memberships m
		JOIN users u ON u.id = m.user_id
		WHERE m.organization_id = ? AND m.status = 'approved'
		ORDER BY m.requested_at ASC
	`, orgID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load members"})
	}
	defer rows.Close()

	items := make([]fiber.Map, 0)
	for rows.Next() {
		var (
			memberUserID                     int
			memberSlug, name, profilePicture string
			joinedAt                         time.Time
		)
		if err := rows.Scan(&memberUserID, &memberSlug, &name, &profilePicture, &joinedAt); err != nil {
			continue
		}
		items = append(items, fiber.Map{
			"user_id":         memberUserID,
			"slug":            memberSlug,
			"name":            name,
			"profile_picture": profilePicture,
			"joined_at":       joinedAt,
		})
	}

	return c.JSON(models.APIResponse{Success: true, Data: items})
}

// DecideJoinRequest approves or rejects a pending request.
func (h *OrganizationHandler) DecideJoinRequest(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	slug := normalizeOrgSlug(c.Params("slug"))
	targetUserID, err := strconv.Atoi(c.Params("userId"))
	if err != nil || targetUserID <= 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid target user"})
	}

	var req struct {
		Action string `json:"action"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}
	action := strings.ToLower(strings.TrimSpace(req.Action))
	if action != "approve" && action != "reject" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Action must be approve or reject"})
	}

	orgID, creatorID, _, isDeleted, err := h.resolveOrg(slug)
	if err != nil || isDeleted {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
	}
	if userID != creatorID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Only the organization creator can manage requests"})
	}

	newStatus := "approved"
	cooldown := interface{}(nil)
	if action == "reject" {
		newStatus = "rejected"
		cooldown = time.Now().Add(7 * 24 * time.Hour)
	}

	res, err := h.db.Exec(`
		UPDATE organization_memberships
		SET status = ?, decided_at = CURRENT_TIMESTAMP, decided_by_user_id = ?, cooldown_until = ?, updated_at = CURRENT_TIMESTAMP
		WHERE organization_id = ? AND user_id = ? AND status = 'pending'
	`, newStatus, userID, cooldown, orgID, targetUserID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update join request"})
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Pending request not found"})
	}

	msg := "Your join request to @" + slug + " was approved"
	if newStatus == "rejected" {
		msg = "Your join request to @" + slug + " was rejected"
	}
	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'org_join_request', ?, FALSE)", targetUserID, msg)

	return c.JSON(models.APIResponse{Success: true, Message: "Join request updated"})
}

// RemoveMember removes an approved member and hides their org-feed posts.
func (h *OrganizationHandler) RemoveMember(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	slug := normalizeOrgSlug(c.Params("slug"))
	targetUserID, err := strconv.Atoi(c.Params("userId"))
	if err != nil || targetUserID <= 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid target user"})
	}

	orgID, creatorID, _, isDeleted, err := h.resolveOrg(slug)
	if err != nil || isDeleted {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
	}
	if userID != creatorID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Only the organization creator can remove members"})
	}
	if targetUserID == creatorID {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Creator cannot be removed"})
	}

	tx, err := h.db.Begin()
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to remove member"})
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		UPDATE organization_memberships
		SET status = 'removed', removed_at = CURRENT_TIMESTAMP, decided_at = CURRENT_TIMESTAMP, decided_by_user_id = ?, cooldown_until = ?, updated_at = CURRENT_TIMESTAMP
		WHERE organization_id = ? AND user_id = ? AND status = 'approved'
	`, userID, time.Now().Add(7*24*time.Hour), orgID, targetUserID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to remove member"})
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Approved member not found"})
	}

	_, _ = tx.Exec(`
		UPDATE organization_posts
		SET is_visible_in_org_feed = FALSE, hidden_reason = 'member_removed', updated_at = CURRENT_TIMESTAMP
		WHERE organization_id = ? AND author_user_id = ?
	`, orgID, targetUserID)

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to remove member"})
	}

	_, _ = h.db.Exec("INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'org_membership', ?, FALSE)", targetUserID, "You were removed from @"+slug)

	return c.JSON(models.APIResponse{Success: true, Message: "Member removed"})
}

// CreatePost creates an organization post for approved members only.
func (h *OrganizationHandler) CreatePost(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	slug := normalizeOrgSlug(c.Params("slug"))
	if slug == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Organization slug is required"})
	}

	orgID, _, orgCategory, isDeleted, err := h.resolveOrg(slug)
	if err != nil || isDeleted {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
	}

	var membershipStatus string
	err = h.db.QueryRow(`SELECT status FROM organization_memberships WHERE organization_id = ? AND user_id = ? LIMIT 1`, orgID, userID).Scan(&membershipStatus)
	if err != nil || membershipStatus != "approved" {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "You must be an approved member to post"})
	}

	var req struct {
		Content     string `json:"content"`
		CategoryTag string `json:"category_tag"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}
	req.Content = strings.TrimSpace(req.Content)
	req.CategoryTag = strings.TrimSpace(req.CategoryTag)
	if req.Content == "" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Post content is required"})
	}
	// Category tag is optional - only validate if provided
	if req.CategoryTag != "" && !strings.EqualFold(req.CategoryTag, orgCategory) {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Post category tag must match organization category"})
	}

	res, err := h.db.Exec(`
		INSERT INTO organization_posts (organization_id, author_user_id, content, category_tag, is_visible_in_org_feed)
		VALUES (?, ?, ?, ?, TRUE)
	`, orgID, userID, req.Content, req.CategoryTag)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to create organization post"})
	}
	postID, _ := res.LastInsertId()

	return c.JSON(models.APIResponse{Success: true, Message: "Post created", Data: fiber.Map{"id": postID}})
}

// GetFeed returns org posts visible to approved members only.
func (h *OrganizationHandler) GetFeed(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	slug := normalizeOrgSlug(c.Params("slug"))

	orgID, _, _, isDeleted, err := h.resolveOrg(slug)
	if err != nil || isDeleted {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
	}

	var membershipStatus string
	err = h.db.QueryRow(`SELECT status FROM organization_memberships WHERE organization_id = ? AND user_id = ? LIMIT 1`, orgID, userID).Scan(&membershipStatus)
	if err != nil || membershipStatus != "approved" {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Only approved members can view this feed"})
	}

	rows, err := h.db.Query(`
		SELECT p.id, p.author_user_id, COALESCE(u.slug, ''), COALESCE(u.name, ''), COALESCE(u.profile_picture, ''),
		       COALESCE(p.content, ''), COALESCE(p.category_tag, ''), p.created_at
		FROM organization_posts p
		JOIN users u ON u.id = p.author_user_id
		WHERE p.organization_id = ? AND p.is_visible_in_org_feed = TRUE
		ORDER BY p.created_at DESC
		LIMIT 100
	`, orgID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load organization feed"})
	}
	defer rows.Close()

	items := make([]fiber.Map, 0)
	for rows.Next() {
		var (
			id, authorID                                             int
			authorSlug, authorName, authorPicture, content, category string
			createdAt                                                time.Time
		)
		if err := rows.Scan(&id, &authorID, &authorSlug, &authorName, &authorPicture, &content, &category, &createdAt); err != nil {
			continue
		}
		items = append(items, fiber.Map{
			"id":                     id,
			"author_user_id":         authorID,
			"author_slug":            authorSlug,
			"author_name":            authorName,
			"author_profile_picture": authorPicture,
			"content":                content,
			"category_tag":           category,
			"created_at":             createdAt,
		})
	}

	return c.JSON(models.APIResponse{Success: true, Data: items})
}

// GetUserApprovedOrganizations returns all organizations where the user is an approved member.
// Used during product creation to allow tagging organizations.
func (h *OrganizationHandler) GetUserApprovedOrganizations(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	rows, err := h.db.Query(`
		SELECT o.id, o.name, o.slug, COALESCE(o.logo_url, '') as logo_url, COALESCE(o.description, '') as description
		FROM organizations o
		JOIN organization_memberships m ON o.id = m.organization_id
		WHERE m.user_id = ? AND m.status = 'approved' AND o.is_deleted = FALSE
		ORDER BY o.name ASC
	`, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load organizations"})
	}
	defer rows.Close()

	items := make([]fiber.Map, 0)
	for rows.Next() {
		var (
			id                               int
			name, slug, logoURL, description string
		)
		if err := rows.Scan(&id, &name, &slug, &logoURL, &description); err != nil {
			continue
		}
		items = append(items, fiber.Map{
			"id":          id,
			"name":        name,
			"slug":        slug,
			"logo_url":    logoURL,
			"description": description,
		})
	}

	return c.JSON(models.APIResponse{Success: true, Data: items})
}

// DeleteOrganization soft-deletes org and hides all org-feed posts while preserving profile visibility.
func (h *OrganizationHandler) DeleteOrganization(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}
	slug := normalizeOrgSlug(c.Params("slug"))

	orgID, creatorID, _, isDeleted, err := h.resolveOrg(slug)
	if err != nil || isDeleted {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Organization not found"})
	}
	if userID != creatorID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Only the creator can delete this organization"})
	}

	tx, err := h.db.Begin()
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to delete organization"})
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		UPDATE organizations
		SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, orgID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to delete organization"})
	}

	_, _ = tx.Exec(`
		UPDATE organization_posts
		SET is_visible_in_org_feed = FALSE, hidden_reason = 'org_deleted', updated_at = CURRENT_TIMESTAMP
		WHERE organization_id = ?
	`, orgID)

	_, _ = tx.Exec(`
		UPDATE organization_memberships
		SET status = CASE WHEN status = 'pending' THEN 'cancelled_org_deleted' ELSE status END,
		    decided_at = CASE WHEN status = 'pending' THEN CURRENT_TIMESTAMP ELSE decided_at END,
		    decided_by_user_id = CASE WHEN status = 'pending' THEN ? ELSE decided_by_user_id END,
		    updated_at = CURRENT_TIMESTAMP
		WHERE organization_id = ?
	`, userID, orgID)

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to delete organization"})
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Organization deleted"})
}

// GetProfilePosts returns organization posts for public profile rendering.
func (h *OrganizationHandler) GetProfilePosts(c *fiber.Ctx) error {
	userID, err := strconv.Atoi(c.Params("userId"))
	if err != nil || userID <= 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid user ID"})
	}

	rows, err := h.db.Query(`
		SELECT p.id, p.organization_id, COALESCE(o.name, ''), COALESCE(o.slug, ''), COALESCE(o.is_deleted, FALSE),
		       COALESCE(p.content, ''), COALESCE(p.category_tag, ''), p.created_at
		FROM organization_posts p
		LEFT JOIN organizations o ON o.id = p.organization_id
		WHERE p.author_user_id = ?
		ORDER BY p.created_at DESC
		LIMIT 200
	`, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to load profile posts"})
	}
	defer rows.Close()

	items := make([]fiber.Map, 0)
	for rows.Next() {
		var (
			id, organizationID                     int
			orgName, orgSlug, content, categoryTag string
			orgDeleted                             bool
			createdAt                              time.Time
		)
		if err := rows.Scan(&id, &organizationID, &orgName, &orgSlug, &orgDeleted, &content, &categoryTag, &createdAt); err != nil {
			continue
		}
		items = append(items, fiber.Map{
			"id":                   id,
			"organization_id":      organizationID,
			"organization_name":    orgName,
			"organization_slug":    orgSlug,
			"organization_deleted": orgDeleted,
			"content":              content,
			"category_tag":         categoryTag,
			"created_at":           createdAt,
		})
	}

	return c.JSON(models.APIResponse{Success: true, Data: items})
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
