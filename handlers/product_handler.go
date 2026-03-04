package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"mime/multipart"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
	"github.com/xashathebest/clovia/services"
)

// ProductHandler handles product-related HTTP requests
type ProductHandler struct {
	db *sql.DB
}

// NewProductHandler creates a new product handler
func NewProductHandler() *ProductHandler {
	return &ProductHandler{
		db: database.DB,
	}
}

// Condition multipliers for calculating suggested value
var conditionMultipliers = map[string]float64{
	"New":      1.0,
	"Like-New": 0.8,
	"Used":     0.6,
	"Fair":     0.4,
}

// calculateSuggestedValue calculates the value in points based on price and condition.
func calculateSuggestedValue(price float64, condition string) int {
	multiplier, ok := conditionMultipliers[condition]
	if !ok {
		multiplier = 0.5 // Default multiplier for unknown conditions
	}
	// Assuming 1 PHP = 1 point for simplicity, then apply multiplier
	return int(price * multiplier)
}

// generateSlug creates a URL-friendly slug from title and appends a short UUID
func generateSlug(title string) string {
	// Convert to lowercase
	slug := strings.ToLower(title)

	// Remove special characters, keep only alphanumeric, spaces, and hyphens
	reg := regexp.MustCompile(`[^a-z0-9\s-]`)
	slug = reg.ReplaceAllString(slug, "")

	// Replace spaces with hyphens
	slug = strings.ReplaceAll(slug, " ", "-")

	// Remove multiple consecutive hyphens
	reg = regexp.MustCompile(`-+`)
	slug = reg.ReplaceAllString(slug, "-")

	// Trim hyphens from start and end
	slug = strings.Trim(slug, "-")

	// Limit length to 50 characters
	if len(slug) > 50 {
		slug = slug[:50]
		slug = strings.TrimRight(slug, "-")
	}

	// Generate short UUID (first 8 characters)
	shortUUID := uuid.New().String()[:8]

	// Combine slug with UUID: "eco-bag-3f8a9d2a"
	return fmt.Sprintf("%s-%s", slug, shortUUID)
}

// CreateProduct creates a new product
func (h *ProductHandler) CreateProduct(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	// Parse fields
	title := c.FormValue("title")
	description := c.FormValue("description")
	priceStr := c.FormValue("price")
	var price *float64
	if priceStr != "" {
		p, err := strconv.ParseFloat(priceStr, 64)
		if err == nil {
			price = &p
		}
	}
	premium := c.FormValue("premium") == "true"
	allowBuying := c.FormValue("allow_buying") == "true"
	barterOnly := c.FormValue("barter_only") == "true"
	location := c.FormValue("location")
	condition := c.FormValue("condition")
	// Optional category override from client
	categoryOverride := c.FormValue("category")

	// Handle multiple file uploads
	form, err := c.MultipartForm()
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to parse uploaded files",
		})
	}
	files := form.File["images"]
	// Enforce maximum of 8 images per item
	if len(files) > 8 {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "You can upload up to 8 images per product",
		})
	}
	var imagePaths []string
	for _, file := range files {
		if url, err := services.UploadFileToCloudinary(file, "products"); err == nil && url != "" {
			imagePaths = append(imagePaths, url)
			continue
		} else if err != nil && err != services.ErrCloudinaryDisabled {
			fmt.Printf("Cloudinary upload failed: %v\n", err)
		}

		localURL, err := saveFileLocally(c, file, "products")
		if err != nil {
			fmt.Printf("Local file save failed: %v\n", err)
			continue
		}
		imagePaths = append(imagePaths, localURL)
	}

	// Convert imagePaths to JSON
	imageURLsJSONBytes, err := json.Marshal(imagePaths)
	if err != nil {
		imageURLsJSONBytes = []byte("[]")
	}

	// Ensure DB non-null price: default to 0.0 if not provided
	var insertPrice float64 = 0.0
	if price != nil {
		insertPrice = *price
	}

	// Appraise product based on title and description
	appraisal := services.AppraiseProduct(title, description)
	category := appraisal.Category
	if categoryOverride != "" {
		category = categoryOverride
	}

	// If user did not specify a condition, use the appraised one
	finalCondition := condition
	if finalCondition == "" {
		finalCondition = appraisal.Condition
	}

	// Geocode location
	var lat, lon *float64
	if location != "" {
		coords, err := services.GetCoordinates(location)
		if err == nil {
			lat = &coords.Latitude
			lon = &coords.Longitude
		}
	}

	// Calculate suggested value
	suggestedValue := calculateSuggestedValue(insertPrice, finalCondition)

	// Detect counterfeit
	report := services.DetectCounterfeit(title, description, insertPrice)
	finalDescription := description
	if report.IsSuspicious {
		finalDescription = "[SUSPICIOUS] " + report.Reason + ". " + finalDescription
	}

	// Generate unique slug
	slug := generateSlug(title)

	// Ensure slug is unique by checking and appending number if needed
	baseSlug := slug
	counter := 1
	for {
		var exists int
		err := h.db.QueryRow("SELECT COUNT(*) FROM products WHERE slug = ?", slug).Scan(&exists)
		if err != nil || exists == 0 {
			break
		}
		// If slug exists, append counter
		slug = fmt.Sprintf("%s-%d", baseSlug, counter)
		counter++
	}

	// Insert new product with slug. Build SQL dynamically so it's tolerant
	// to missing latitude/longitude columns (some DBs may not have applied migrations).
	cols := []string{"slug", "title", "description", "price", "image_urls", "seller_id", "premium", "allow_buying", "barter_only", "location", "status", "`condition`", "suggested_value", "category"}
	placeholders := []string{"?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?"}
	args := []interface{}{slug, title, finalDescription, insertPrice, string(imageURLsJSONBytes), userID, premium, allowBuying, barterOnly, location, "available", finalCondition, suggestedValue, category}

	// Only include latitude/longitude if geocoding produced values
	if lat != nil && lon != nil {
		// insert latitude and longitude after 'location' (which is index 9)
		insertIdx := 10 // index in cols/placeholders/args where 'status' currently resides
		cols = append(cols[:insertIdx], append([]string{"latitude"}, cols[insertIdx:]...)...)
		placeholders = append(placeholders[:insertIdx], append([]string{"?"}, placeholders[insertIdx:]...)...)
		args = append(args[:insertIdx], append([]interface{}{*lat}, args[insertIdx:]...)...)

		insertIdx2 := insertIdx + 1
		cols = append(cols[:insertIdx2], append([]string{"longitude"}, cols[insertIdx2:]...)...)
		placeholders = append(placeholders[:insertIdx2], append([]string{"?"}, placeholders[insertIdx2:]...)...)
		args = append(args[:insertIdx2], append([]interface{}{*lon}, args[insertIdx2:]...)...)
	}

	sqlStr := fmt.Sprintf("INSERT INTO products (%s) VALUES (%s)", strings.Join(cols, ", "), strings.Join(placeholders, ", "))
	result, err := h.db.Exec(sqlStr, args...)
	if err != nil {
		fmt.Printf("CreateProduct - insert error: %+v\n", err)
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to create product: %v", err),
		})
	}

	productID, _ := result.LastInsertId()

	// Store counterfeit detection results
	if report.IsSuspicious {
		flagsJSON, _ := json.Marshal(report.Flags)
		_, _ = h.db.Exec(
			"UPDATE products SET counterfeit_confidence = ?, counterfeit_flags = ?, last_counterfeit_check_at = CURRENT_TIMESTAMP WHERE id = ?",
			report.Confidence, string(flagsJSON), productID,
		)
	} else {
		_, _ = h.db.Exec(
			"UPDATE products SET counterfeit_confidence = 0, last_counterfeit_check_at = CURRENT_TIMESTAMP WHERE id = ?",
			productID,
		)
	}

	// Get the created product
	var createdProduct models.Product
	var slugNull sql.NullString
	err = h.db.QueryRow(
		"SELECT id, slug, title, description, price, image_urls, seller_id, premium, status, allow_buying, barter_only, location, `condition`, suggested_value, category, created_at, updated_at FROM products WHERE id = ?",
		productID,
	).Scan(&createdProduct.ID, &slugNull, &createdProduct.Title, &createdProduct.Description, &createdProduct.Price,
		&createdProduct.ImageURLs, &createdProduct.SellerID, &createdProduct.Premium, &createdProduct.Status,
		&createdProduct.AllowBuying, &createdProduct.BarterOnly, &createdProduct.Location,
		&createdProduct.Condition, &createdProduct.SuggestedValue, &createdProduct.Category, &createdProduct.CreatedAt, &createdProduct.UpdatedAt)

	if slugNull.Valid {
		createdProduct.Slug = slugNull.String
	}

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to retrieve created product",
		})
	}

	return c.Status(201).JSON(models.APIResponse{
		Success: true,
		Message: "Product created successfully",
		Data:    createdProduct,
	})
}

// GetProducts gets all products with search and filtering
func (h *ProductHandler) GetProducts(c *fiber.Ctx) error {
	// Parse query parameters
	keyword := c.Query("keyword", "")
	minPriceStr := c.Query("min_price", "")
	maxPriceStr := c.Query("max_price", "")
	premiumStr := c.Query("premium", "")
	status := c.Query("status", "")
	sellerIDStr := c.Query("seller_id", "")
	barterOnlyStr := c.Query("barter_only", "")
	allowBuyingStr := c.Query("allow_buying", "")
	location := c.Query("location", "")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	// Support optional offset-based pagination (limit & offset)
	if limit <= 0 {
		limit = 20
	}
	offsetParam := c.Query("offset", "")
	var offset int
	if offsetParam != "" {
		if o, err := strconv.Atoi(offsetParam); err == nil && o >= 0 {
			offset = o
			if limit > 0 {
				page = (offset / limit) + 1
			} else {
				page = 1
			}
		} else {
			offset = (page - 1) * limit
		}
	} else {
		offset = (page - 1) * limit
	}

	// Build WHERE clause
	whereClause := "WHERE 1=1"
	var args []interface{}

	if keyword != "" {
		// Broaden keyword search across product attributes and seller/org details
		whereClause += " AND ("
		whereClause += "p.title LIKE ? OR p.description LIKE ?"
		whereClause += " OR p.location LIKE ? OR p.category LIKE ? OR p.`condition` LIKE ?"
		whereClause += " OR u.name LIKE ? OR u.org_name LIKE ? OR u.department LIKE ?"
		whereClause += ")"
		like := "%" + keyword + "%"
		args = append(args, like, like, like, like, like, like, like, like)
		searchPattern := "%" + keyword + "%"
		whereClause += " AND (p.title LIKE ? OR p.description LIKE ? OR p.category LIKE ? OR p.condition LIKE ? OR u.name LIKE ?)"
		args = append(args, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern)
	}

	if minPriceStr != "" {
		if minPrice, err := strconv.ParseFloat(minPriceStr, 64); err == nil {
			whereClause += " AND p.price >= ?"
			args = append(args, minPrice)
		}
	}

	if maxPriceStr != "" {
		if maxPrice, err := strconv.ParseFloat(maxPriceStr, 64); err == nil {
			whereClause += " AND p.price <= ?"
			args = append(args, maxPrice)
		}
	}

	if premiumStr != "" {
		if premium, err := strconv.ParseBool(premiumStr); err == nil {
			whereClause += " AND p.premium = ?"
			args = append(args, premium)
		}
	}

	// Only apply the default 'available' status filter if no specific seller is requested.
	// This allows a user to see all of their own products (sold, traded, etc.).
	if sellerIDStr != "" {
		if sellerID, err := strconv.Atoi(sellerIDStr); err == nil {
			whereClause += " AND p.seller_id = ?"
			args = append(args, sellerID)
		}
	} else {
		// For the general public feed, default to 'available' if no status is specified.
		if status != "" {
			whereClause += " AND p.status = ?"
			args = append(args, status)
		} else {
			whereClause += " AND p.status = 'available'"
		}
	}

	if barterOnlyStr != "" {
		if barterOnly, err := strconv.ParseBool(barterOnlyStr); err == nil {
			whereClause += " AND p.barter_only = ?"
			args = append(args, barterOnly)
		}
	}

	if allowBuyingStr != "" {
		if allowBuying, err := strconv.ParseBool(allowBuyingStr); err == nil {
			whereClause += " AND p.allow_buying = ?"
			args = append(args, allowBuying)
		}
	}

	if location != "" {
		whereClause += " AND p.location LIKE ?"
		args = append(args, "%"+location+"%")
	}

	// Dedicated category filter: exact match on category OR keyword match in title/description
	categoryFilter := c.Query("category", "")
	if categoryFilter != "" {
		whereClause += " AND (p.category = ? OR p.title LIKE ? OR p.description LIKE ?)"
		catLike := "%" + categoryFilter + "%"
		args = append(args, categoryFilter, catLike, catLike)
	}

	// Get total count
	// NOTE: join users table here because WHERE can reference u.* fields
	countQuery := "SELECT COUNT(*) FROM products p LEFT JOIN users u ON p.seller_id = u.id " + whereClause
	var total int
	err := h.db.QueryRow(countQuery, args...).Scan(&total)
	if err != nil {
		// Enhanced debugging: print query and args
		fmt.Println("❌ Count query failed!")
		fmt.Println("Query:", countQuery)
		fmt.Println("Args:", args)
		fmt.Println("Error:", err.Error())
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get product count: " + err.Error(),
		})
	}

	// Use the full query with proper WHERE clause handling
	query := `
		SELECT p.id, p.slug, p.title, p.description, p.price, p.image_urls, p.seller_id, 
		       p.premium, p.status, p.allow_buying, p.barter_only, p.location, p.` + "`condition`" + `, 
		       p.suggested_value, p.category, p.latitude, p.longitude, p.created_at, p.updated_at,
		       u.name as seller_name, u.profile_picture as seller_profile_picture,
		       u.latitude as seller_latitude, u.longitude as seller_longitude
		FROM products p
		LEFT JOIN users u ON p.seller_id = u.id
		` + whereClause + `
		ORDER BY p.premium DESC, p.created_at DESC
		LIMIT ? OFFSET ?
	`
	args = append(args, limit, offset)

	rows, err := h.db.Query(query, args...)
	if err != nil {
		fmt.Println("❌ Products query failed!")
		fmt.Println("Query:", query)
		fmt.Println("Args:", args)
		fmt.Println("Error:", err.Error())
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get products: " + err.Error(),
		})
	}
	defer rows.Close()

	// Parse optional viewer coordinates for distance calculation (must be before row loop)
	viewerLatStr := c.Query("viewer_lat", "")
	viewerLonStr := c.Query("viewer_lng", "")
	var viewerLat, viewerLon *float64
	if viewerLatStr != "" && viewerLonStr != "" {
		if lat, err := strconv.ParseFloat(viewerLatStr, 64); err == nil {
			if lon, err := strconv.ParseFloat(viewerLonStr, 64); err == nil {
				viewerLat = &lat
				viewerLon = &lon
			}
		}
	}

	var products []models.Product
	for rows.Next() {
		var product models.Product
		var slugNull sql.NullString
		var priceNull sql.NullFloat64
		var sellerProfile sql.NullString
		var imageURLsJSONStr string
		var latNull, lonNull, sLatNull, sLonNull sql.NullFloat64
		err := rows.Scan(&product.ID, &slugNull, &product.Title, &product.Description, &priceNull,
			&imageURLsJSONStr, &product.SellerID, &product.Premium, &product.Status,
			&product.AllowBuying, &product.BarterOnly, &product.Location,
			&product.Condition, &product.SuggestedValue, &product.Category,
			&latNull, &lonNull, &product.CreatedAt, &product.UpdatedAt,
			&product.SellerName, &sellerProfile, &sLatNull, &sLonNull)
		if slugNull.Valid {
			product.Slug = slugNull.String
		}
		if err != nil {
			continue
		}
		if priceNull.Valid {
			p := priceNull.Float64
			product.Price = &p
		} else {
			product.Price = nil
		}
		if sellerProfile.Valid {
			product.SellerProfilePicture = sellerProfile.String
		}

		// Use product coords or fallback to seller coords
		var finalLat, finalLon *float64
		if latNull.Valid {
			l := latNull.Float64
			product.Latitude = &l
			finalLat = &l
		} else if sLatNull.Valid {
			l := sLatNull.Float64
			product.Latitude = &l // fallback to seller coords
			finalLat = &l
		}

		if lonNull.Valid {
			l := lonNull.Float64
			product.Longitude = &l
			finalLon = &l
		} else if sLonNull.Valid {
			l := sLonNull.Float64
			product.Longitude = &l // fallback to seller coords
			finalLon = &l
		}

		// Parse image URLs from JSON
		if imageURLsJSONStr != "" {
			var imageURLs []string
			if err := json.Unmarshal([]byte(imageURLsJSONStr), &imageURLs); err == nil {
				product.ImageURLs = models.StringArray(imageURLs)
			}
		}

		// Compute distance if we have both viewer and product (or seller) coordinates
		if viewerLat != nil && viewerLon != nil && finalLat != nil && finalLon != nil {
			result := services.CalculateDistance(*viewerLat, *viewerLon, *finalLat, *finalLon)
			product.Distance = fmt.Sprintf("%.1f KM", result.DistanceKm)
		}

		products = append(products, product)
	}

	// Background geocode products that have location text but no coordinates
	for i := range products {
		p := &products[i]
		if p.Location != "" && p.Latitude == nil && p.Longitude == nil {
			// Geocode in background and save to DB for future requests
			go func(productID int, loc string) {
				coords, err := services.GetCoordinates(loc)
				if err != nil {
					return
				}
				_, _ = h.db.Exec(
					"UPDATE products SET latitude = ?, longitude = ? WHERE id = ?",
					coords.Latitude, coords.Longitude, productID,
				)
				fmt.Printf("📍 Geocoded product %d (%s) -> %.6f, %.6f\n", productID, loc, coords.Latitude, coords.Longitude)
			}(p.ID, p.Location)
		}

		// Compute distance from viewer if both viewer and product have coordinates
		if viewerLat != nil && viewerLon != nil && p.Latitude != nil && p.Longitude != nil {
			result := services.CalculateDistance(*viewerLat, *viewerLon, *p.Latitude, *p.Longitude)
			distStr := fmt.Sprintf("%.1f KM", result.DistanceKm)
			p.Distance = distStr
		}
	}

	totalPages := (total + limit - 1) / limit

	// Ensure products is never nil (always a slice)
	if products == nil {
		products = []models.Product{}
	}
	return c.JSON(models.APIResponse{
		Success: true,
		Data: models.PaginatedResponse{
			Data:       products,
			Total:      total,
			Page:       page,
			Limit:      limit,
			TotalPages: totalPages,
		},
	})
}

func saveFileLocally(c *fiber.Ctx, file *multipart.FileHeader, folder string) (string, error) {
	fsPath, publicPath := services.GenerateLocalMediaPaths(folder, file.Filename)
	if err := os.MkdirAll(filepath.Dir(fsPath), 0o755); err != nil {
		return "", err
	}
	if err := c.SaveFile(file, fsPath); err != nil {
		return "", err
	}
	return publicPath, nil
}

// WishlistProduct adds a product to a user's wishlist
func (h *ProductHandler) WishlistProduct(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid product ID"})
	}

	// Check if the product exists
	var exists int
	err = h.db.QueryRow("SELECT COUNT(*) FROM products WHERE id = ?", productID).Scan(&exists)
	if err != nil || exists == 0 {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Product not found"})
	}

	// Check if already in wishlist
	var wishlistID sql.NullInt64
	err = h.db.QueryRow("SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?", userID, productID).Scan(&wishlistID)
	if err == nil && wishlistID.Valid {
		return c.Status(409).JSON(models.APIResponse{Success: false, Error: "Product already in wishlist"})
	}

	// Add to wishlist
	_, err = h.db.Exec("INSERT INTO wishlists (user_id, product_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)", userID, productID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to add to wishlist"})
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Product added to wishlist"})
}

// UnwishlistProduct removes a product from a user's wishlist
func (h *ProductHandler) UnwishlistProduct(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid product ID"})
	}

	_, err = h.db.Exec("DELETE FROM wishlists WHERE user_id = ? AND product_id = ?", userID, productID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to remove from wishlist"})
	}

	return c.JSON(models.APIResponse{Success: true, Message: "Product removed from wishlist"})
}

// GetUserWishlistStatus checks if a product is in the user's wishlist
func (h *ProductHandler) GetUserWishlistStatus(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid product ID"})
	}

	var exists int
	err = h.db.QueryRow("SELECT COUNT(*) FROM wishlists WHERE user_id = ? AND product_id = ?", userID, productID).Scan(&exists)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to check wishlist status"})
	}

	return c.JSON(models.APIResponse{Success: true, Data: fiber.Map{"in_wishlist": exists > 0}})
}

// GetProduct gets a single product by ID or slug
func (h *ProductHandler) GetProduct(c *fiber.Ctx) error {
	idOrSlug := c.Params("id")

	// Try to parse as integer first (ID)
	var product models.Product
	var slugNull sql.NullString
	var priceNull sql.NullFloat64
	var imageURLsJSON sql.NullString
	var err error

	productID, parseErr := strconv.Atoi(idOrSlug)
	if parseErr == nil {
		// It's a numeric ID
		err = h.db.QueryRow(`
			SELECT p.id, p.slug, p.title, p.description, p.price, p.image_urls, p.seller_id, 
			       p.premium, p.status, p.allow_buying, p.barter_only, p.location, p.`+"condition"+`, 
			       p.suggested_value, p.category, p.created_at, p.updated_at,
			       u.name as seller_name, u.profile_picture as seller_profile_picture
			FROM products p
			LEFT JOIN users u ON p.seller_id = u.id
			WHERE p.id = ?
		`, productID).Scan(&product.ID, &slugNull, &product.Title, &product.Description, &priceNull,
			&imageURLsJSON, &product.SellerID, &product.Premium, &product.Status,
			&product.AllowBuying, &product.BarterOnly, &product.Location,
			&product.Condition, &product.SuggestedValue, &product.Category, &product.CreatedAt, &product.UpdatedAt,
			&product.SellerName, &product.SellerProfilePicture)
	} else {
		// It's a slug
		err = h.db.QueryRow(`
			SELECT p.id, p.slug, p.title, p.description, p.price, p.image_urls, p.seller_id, 
			       p.premium, p.status, p.allow_buying, p.barter_only, p.location, p.`+"condition"+`, 
			       p.suggested_value, p.category, p.created_at, p.updated_at,
			       u.name as seller_name, u.profile_picture as seller_profile_picture
			FROM products p
			LEFT JOIN users u ON p.seller_id = u.id
			WHERE p.slug = ?
		`, idOrSlug).Scan(&product.ID, &slugNull, &product.Title, &product.Description, &priceNull,
			&imageURLsJSON, &product.SellerID, &product.Premium, &product.Status,
			&product.AllowBuying, &product.BarterOnly, &product.Location,
			&product.Condition, &product.SuggestedValue, &product.Category, &product.CreatedAt, &product.UpdatedAt,
			&product.SellerName, &product.SellerProfilePicture)
	}

	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(404).JSON(models.APIResponse{
				Success: false,
				Error:   "Product not found",
			})
		}
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get product",
		})
	}

	if slugNull.Valid {
		product.Slug = slugNull.String
	}
	if priceNull.Valid {
		p := priceNull.Float64
		product.Price = &p
	}

	// Parse image URLs JSON if present
	if imageURLsJSON.Valid && imageURLsJSON.String != "" {
		var urls []string
		if err := json.Unmarshal([]byte(imageURLsJSON.String), &urls); err == nil {
			product.ImageURLs = models.StringArray(urls)
		}
	}

	// Get vote counts
	var underCount, overCount int
	_ = h.db.QueryRow("SELECT COALESCE(SUM(CASE WHEN vote = 'under' THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN vote = 'over' THEN 1 ELSE 0 END),0) FROM product_votes WHERE product_id = ?", product.ID).Scan(&underCount, &overCount)

	// Get user's vote if authenticated
	var userVote sql.NullString
	userID, ok := middleware.GetUserIDFromContext(c)
	if ok {
		_ = h.db.QueryRow("SELECT vote FROM product_votes WHERE product_id = ? AND user_id = ?", product.ID, userID).Scan(&userVote)
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"product":   product,
			"votes":     fiber.Map{"under": underCount, "over": overCount},
			"user_vote": userVote.String,
		},
	})
}

// VoteProduct lets an authenticated user mark a product as under- or overpriced
func (h *ProductHandler) VoteProduct(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "User not authenticated"})
	}

	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid product ID"})
	}

	var body struct {
		Vote string `json:"vote"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request body"})
	}
	v := strings.ToLower(body.Vote)
	if v != "under" && v != "over" {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "vote must be 'under' or 'over'"})
	}

	// Ensure product exists and has a price (only allow voting for items with price)
	var price sql.NullFloat64
	err = h.db.QueryRow("SELECT price FROM products WHERE id = ?", productID).Scan(&price)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Product not found"})
		}
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to check product"})
	}
	if !price.Valid {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Voting allowed only for items with a price"})
	}

	// Insert or update vote (unique constraint on product_id,user_id)
	_, err = h.db.Exec("INSERT INTO product_votes (product_id, user_id, vote, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE vote = VALUES(vote), created_at = VALUES(created_at)", productID, userID, v)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to record vote"})
	}

	// Return updated counts
	var underCount int
	var overCount int
	_ = h.db.QueryRow("SELECT COALESCE(SUM(CASE WHEN vote = 'under' THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN vote = 'over' THEN 1 ELSE 0 END),0) FROM product_votes WHERE product_id = ?", productID).Scan(&underCount, &overCount)

	return c.JSON(models.APIResponse{Success: true, Data: fiber.Map{"votes": fiber.Map{"under": underCount, "over": overCount}, "user_vote": v}})
}

// UpdateProduct updates a product (only by seller)
func (h *ProductHandler) UpdateProduct(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid product ID",
		})
	}

	// Check if user owns the product and get its current state
	var p models.Product
	err = h.db.QueryRow("SELECT seller_id, status, price, `condition` FROM products WHERE id = ?", productID).Scan(&p.SellerID, &p.Status, &p.Price, &p.Condition)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(404).JSON(models.APIResponse{
				Success: false,
				Error:   "Product not found",
			})
		}
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get product",
		})
	}

	if p.SellerID != userID {
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "You can only update your own products",
		})
	}

	// Parse update fields
	var updateFields []string
	var args []interface{}

	title := c.FormValue("title")
	if title != "" {
		updateFields = append(updateFields, "title = ?")
		args = append(args, title)
	}

	description := c.FormValue("description")
	if description != "" {
		updateFields = append(updateFields, "description = ?")
		args = append(args, description)
	}

	priceStr := c.FormValue("price")
	if priceStr != "" {
		if price, err := strconv.ParseFloat(priceStr, 64); err == nil {
			updateFields = append(updateFields, "price = ?")
			args = append(args, price)
		}
	}

	premiumStr := c.FormValue("premium")
	if premiumStr != "" {
		premium := premiumStr == "true"
		updateFields = append(updateFields, "premium = ?")
		args = append(args, premium)
	}

	allowBuyingStr := c.FormValue("allow_buying")
	if allowBuyingStr != "" {
		allowBuying := allowBuyingStr == "true"
		updateFields = append(updateFields, "allow_buying = ?")
		args = append(args, allowBuying)
	}

	barterOnlyStr := c.FormValue("barter_only")
	if barterOnlyStr != "" {
		barterOnly := barterOnlyStr == "true"
		updateFields = append(updateFields, "barter_only = ?")
		args = append(args, barterOnly)
	}

	status := c.FormValue("status")
	if status != "" {
		updateFields = append(updateFields, "status = ?")
		args = append(args, status)
	}

	location := c.FormValue("location")
	if location != "" {
		updateFields = append(updateFields, "location = ?")
		args = append(args, location)
	}

	condition := c.FormValue("condition")
	if condition != "" {
		updateFields = append(updateFields, "`condition` = ?")
		args = append(args, condition)
	}

	category := c.FormValue("category")
	if category != "" {
		updateFields = append(updateFields, "category = ?")
		args = append(args, category)
	}

	// Handle image updates
	form, err := c.MultipartForm()
	if err == nil {
		files := form.File["images"]
		if len(files) > 0 {
			var imagePaths []string
			for _, file := range files {
				if url, err := services.UploadFileToCloudinary(file, "products"); err == nil && url != "" {
					imagePaths = append(imagePaths, url)
					continue
				} else if err != nil && err != services.ErrCloudinaryDisabled {
					fmt.Printf("Cloudinary upload failed: %v\n", err)
				}

				localURL, err := saveFileLocally(c, file, "products")
				if err != nil {
					fmt.Printf("Local file save failed: %v\n", err)
					continue
				}
				imagePaths = append(imagePaths, localURL)
			}
			if len(imagePaths) > 0 {
				imageURLsJSONBytes, _ := json.Marshal(imagePaths)
				updateFields = append(updateFields, "image_urls = ?")
				args = append(args, string(imageURLsJSONBytes))
			}
		}
	}

	if len(updateFields) == 0 {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "No fields to update",
		})
	}

	updateFields = append(updateFields, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, productID)

	query := fmt.Sprintf("UPDATE products SET %s WHERE id = ?", strings.Join(updateFields, ", "))
	_, err = h.db.Exec(query, args...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to update product",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Product updated successfully",
	})
}

// GetAdminProducts returns a paginated list of products for admin usage.
// Unlike the public feed, this can include all statuses.
func (h *ProductHandler) GetAdminProducts(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if limit <= 0 {
		limit = 20
	}
	offset := (page - 1) * limit

	// Optional status filter for admin (e.g., ?status=available)
	status := c.Query("status", "")

	whereClause := "WHERE 1=1"
	var args []interface{}

	if status != "" {
		whereClause += " AND p.status = ?"
		args = append(args, status)
	}

	// Total count
	countQuery := "SELECT COUNT(*) FROM products p " + whereClause
	var total int
	if err := h.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get product count",
		})
	}

	query := `
		SELECT p.id, p.slug, p.title, p.description, p.price, p.image_urls, p.seller_id,
		       p.premium, p.status, p.allow_buying, p.barter_only, p.location, p.` + "`condition`" + `,
		       p.suggested_value, p.category, p.created_at, p.updated_at,
		       u.name as seller_name
		FROM products p
		LEFT JOIN users u ON p.seller_id = u.id
		` + whereClause + `
		ORDER BY p.created_at DESC
		LIMIT ? OFFSET ?
	`
	args = append(args, limit, offset)

	rows, err := h.db.Query(query, args...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get products",
		})
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var product models.Product
		var slugNull sql.NullString
		var priceNull sql.NullFloat64
		var imageURLsJSONStr string
		if err := rows.Scan(
			&product.ID, &slugNull, &product.Title, &product.Description, &priceNull,
			&imageURLsJSONStr, &product.SellerID, &product.Premium, &product.Status,
			&product.AllowBuying, &product.BarterOnly, &product.Location,
			&product.Condition, &product.SuggestedValue, &product.Category,
			&product.CreatedAt, &product.UpdatedAt, &product.SellerName,
		); err != nil {
			continue
		}
		if slugNull.Valid {
			product.Slug = slugNull.String
		}
		if priceNull.Valid {
			p := priceNull.Float64
			product.Price = &p
		}
		if imageURLsJSONStr != "" {
			var imageURLs []string
			if err := json.Unmarshal([]byte(imageURLsJSONStr), &imageURLs); err == nil {
				product.ImageURLs = models.StringArray(imageURLs)
			}
		}
		products = append(products, product)
	}

	totalPages := (total + limit - 1) / limit

	return c.JSON(models.APIResponse{
		Success: true,
		Data: models.PaginatedResponse{
			Data:       products,
			Total:      total,
			Page:       page,
			Limit:      limit,
			TotalPages: totalPages,
		},
	})
}

// DeleteProduct deletes a product (only by seller)
func (h *ProductHandler) DeleteProduct(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid product ID",
		})
	}

	// Check if user owns the product
	var sellerID int
	err = h.db.QueryRow("SELECT seller_id FROM products WHERE id = ?", productID).Scan(&sellerID)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(404).JSON(models.APIResponse{
				Success: false,
				Error:   "Product not found",
			})
		}
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get product",
		})
	}

	if sellerID != userID {
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "You can only delete your own products",
		})
	}

	// Check if product has any orders
	var orderCount int
	err = h.db.QueryRow("SELECT COUNT(*) FROM orders WHERE product_id = ?", productID).Scan(&orderCount)
	if err == nil && orderCount > 0 {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Cannot delete product with existing orders",
		})
	}

	_, err = h.db.Exec("DELETE FROM products WHERE id = ?", productID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to delete product",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Product deleted successfully",
	})
}

// DeleteProductAdmin permanently deletes a product (admin only).
// This bypasses seller ownership checks but still respects FK constraints (orders, trades, etc.).
func (h *ProductHandler) DeleteProductAdmin(c *fiber.Ctx) error {
	_, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil || productID <= 0 {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid product ID",
		})
	}

	// Ensure product exists
	var exists int
	if err := h.db.QueryRow("SELECT COUNT(*) FROM products WHERE id = ?", productID).Scan(&exists); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to check product existence",
		})
	}
	if exists == 0 {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Product not found",
		})
	}

	result, err := h.db.Exec("DELETE FROM products WHERE id = ?", productID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to delete product",
		})
	}

	if rows, _ := result.RowsAffected(); rows == 0 {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Product not found",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Product deleted successfully",
	})
}

// GetUserProducts gets all products for a specific user
func (h *ProductHandler) GetUserProducts(c *fiber.Ctx) error {
	userID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid user ID",
		})
	}

	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if limit <= 0 {
		limit = 20
	}
	offset := (page - 1) * limit

	// Get total count
	var total int
	err = h.db.QueryRow("SELECT COUNT(*) FROM products WHERE seller_id = ?", userID).Scan(&total)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get product count",
		})
	}

	// Get products (use image_urls)
	active := c.Query("active", "") == "true"
	where := "WHERE p.seller_id = ?"
	if active {
		where += " AND p.status = 'available'"
	}
	rows, err := h.db.Query(`
		SELECT p.id, p.slug, p.title, p.description, p.price, p.image_urls, p.seller_id, 
		       p.premium, p.status, p.allow_buying, p.barter_only, p.created_at, p.updated_at, u.name as seller_name, u.profile_picture as seller_profile_picture
		FROM products p
		JOIN users u ON p.seller_id = u.id
		`+where+`
		ORDER BY p.created_at DESC
		LIMIT ? OFFSET ?
	`, userID, limit, offset)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get products",
		})
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var product models.Product
		var slugNull sql.NullString
		var priceNull sql.NullFloat64
		var sellerProfile sql.NullString
		var imageURLsJSONStr string
		err := rows.Scan(&product.ID, &slugNull, &product.Title, &product.Description, &priceNull,
			&imageURLsJSONStr, &product.SellerID, &product.Premium, &product.Status,
			&product.AllowBuying, &product.BarterOnly, &product.CreatedAt, &product.UpdatedAt, &product.SellerName, &sellerProfile)
		if slugNull.Valid {
			product.Slug = slugNull.String
		}
		if err != nil {
			continue
		}
		if priceNull.Valid {
			p := priceNull.Float64
			product.Price = &p
		} else {
			product.Price = nil
		}
		if sellerProfile.Valid {
			product.SellerProfilePicture = sellerProfile.String
		}

		// Parse image URLs from JSON
		if imageURLsJSONStr != "" {
			var imageURLs []string
			if err := json.Unmarshal([]byte(imageURLsJSONStr), &imageURLs); err == nil {
				product.ImageURLs = models.StringArray(imageURLs)
			}
		}

		products = append(products, product)
	}

	totalPages := (total + limit - 1) / limit

	return c.JSON(models.APIResponse{
		Success: true,
		Data: models.PaginatedResponse{
			Data:       products,
			Total:      total,
			Page:       page,
			Limit:      limit,
			TotalPages: totalPages,
		},
	})
}

// GenerateProductDetailsWithAI analyzes product images using Gemini AI and returns structured product details
func (h *ProductHandler) GenerateProductDetailsWithAI(c *fiber.Ctx) error {
	form, err := c.MultipartForm()
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to parse uploaded files",
		})
	}

	files := form.File["images"]
	if len(files) < 3 {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "At least 3 images are required for AI analysis",
		})
	}

	result, err := services.GenerateProductDetails(files)
	if err != nil {
		errMsg := fmt.Sprintf("AI generation failed: %v", err)
		log.Printf("Error in GenerateProductDetailsWithAI: %s", errMsg)
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   errMsg,
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    result,
	})
}
