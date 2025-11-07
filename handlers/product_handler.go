package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
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
		savePath := fmt.Sprintf("uploads/%d_%s", time.Now().UnixNano(), file.Filename)
		if err := c.SaveFile(file, savePath); err != nil {
			continue // skip failed uploads
		}
		imagePaths = append(imagePaths, "/"+savePath)
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

	// Insert new product
	biddingType := c.FormValue("bidding_type")
	result, err := h.db.Exec(
		"INSERT INTO products (title, description, price, image_urls, seller_id, premium, allow_buying, barter_only, location, status, `condition`, suggested_value, category, latitude, longitude, bidding_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		title, finalDescription, insertPrice, string(imageURLsJSONBytes), userID, premium, allowBuying, barterOnly, location, "available", finalCondition, suggestedValue, category, lat, lon, biddingType,
	)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to create product",
		})
	}

	productID, _ := result.LastInsertId()

	// Get the created product
	var createdProduct models.Product
	err = h.db.QueryRow(
		"SELECT id, title, description, price, image_urls, seller_id, premium, status, allow_buying, barter_only, location, `condition`, suggested_value, category, latitude, longitude, created_at, updated_at FROM products WHERE id = ?",
		productID,
	).Scan(&createdProduct.ID, &createdProduct.Title, &createdProduct.Description, &createdProduct.Price,
		&createdProduct.ImageURLs, &createdProduct.SellerID, &createdProduct.Premium, &createdProduct.Status,
		&createdProduct.AllowBuying, &createdProduct.BarterOnly, &createdProduct.Location,
		&createdProduct.Condition, &createdProduct.SuggestedValue, &createdProduct.Category, &createdProduct.Latitude, &createdProduct.Longitude, &createdProduct.CreatedAt, &createdProduct.UpdatedAt)

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
		whereClause += " AND (p.title LIKE ? OR p.description LIKE ?)"
		args = append(args, "%"+keyword+"%", "%"+keyword+"%")
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

	// Get total count
	countQuery := "SELECT COUNT(*) FROM products p " + whereClause
	var total int
	err := h.db.QueryRow(countQuery, args...).Scan(&total)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get product count",
		})
	}

	// Use the full query with proper WHERE clause handling
	var query string
	if keyword == "" {
		// No search keyword: show latest products
		query = `
		       SELECT p.id, p.title, p.description, p.price, p.seller_id,
			      p.premium, p.status, p.allow_buying, p.barter_only, p.location,
			      p.created_at, p.updated_at, COALESCE(u.name, 'Unknown') as seller_name,
			      p.image_urls
		       FROM products p
		       LEFT JOIN users u ON p.seller_id = u.id
		       ` + whereClause + `
		       ORDER BY p.created_at DESC
		       LIMIT ? OFFSET ?
	       `
	} else {
		// Search: prioritize premium, then latest
		query = `
		       SELECT p.id, p.title, p.description, p.price, p.seller_id,
			      p.premium, p.status, p.allow_buying, p.barter_only, p.location,
			      p.created_at, p.updated_at, COALESCE(u.name, 'Unknown') as seller_name,
			      p.image_urls
		       FROM products p
		       LEFT JOIN users u ON p.seller_id = u.id
		       ` + whereClause + `
		       ORDER BY p.premium DESC, p.created_at DESC
		       LIMIT ? OFFSET ?
	       `
	}
	args = append(args, limit, offset)

	// Test a simple query first
	var testCount int
	err = h.db.QueryRow("SELECT COUNT(*) FROM products").Scan(&testCount)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Database connection test failed: " + err.Error(),
		})
	}
	rows, err := h.db.Query(query, args...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get products: " + err.Error(),
		})
	}
	defer rows.Close()

	// Check for errors after query execution
	if err = rows.Err(); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Error after query execution: " + err.Error(),
		})
	}

	var products []models.Product
	rowCount := 0
	for rows.Next() {
		rowCount++
		// Scan all fields with proper NULL handling
		var id int
		var title string
		var description string
		var price sql.NullFloat64
		var sellerID int
		var premium int64
		var status string
		var allowBuying int64
		var barterOnly int64
		var location sql.NullString
		var createdAt sql.NullTime
		var updatedAt sql.NullTime
		var sellerName string
		var imageURLsJSON sql.NullString

		err := rows.Scan(&id, &title, &description, &price, &sellerID, &premium, &status,
			&allowBuying, &barterOnly, &location, &createdAt, &updatedAt, &sellerName, &imageURLsJSON)
		if err != nil {
			// Log the error but continue processing other rows
			continue
		}

		// Create a complete product struct
		product := models.Product{
			ID:          id,
			Title:       title,
			Description: description,
			SellerID:    sellerID,
			Status:      status,
			SellerName:  sellerName,
			ImageURLs:   models.StringArray{},
		}

		// Set boolean flags
		product.Premium = premium != 0
		product.AllowBuying = allowBuying != 0
		product.BarterOnly = barterOnly != 0

		// Handle price
		if price.Valid {
			p := price.Float64
			product.Price = &p
		}

		// Handle location
		if location.Valid {
			product.Location = location.String
		}

		// Handle timestamps
		if createdAt.Valid {
			product.CreatedAt = createdAt.Time
		} else {
			product.CreatedAt = time.Now()
		}
		if updatedAt.Valid {
			product.UpdatedAt = updatedAt.Time
		} else {
			product.UpdatedAt = time.Now()
		}

		// Parse image URLs JSON if present
		if imageURLsJSON.Valid && imageURLsJSON.String != "" {
			var urls []string
			if err := json.Unmarshal([]byte(imageURLsJSON.String), &urls); err == nil {
				product.ImageURLs = models.StringArray(urls)
			}
		}

		products = append(products, product)
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

// GetProduct gets a product by ID
func (h *ProductHandler) GetProduct(c *fiber.Ctx) error {
	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid product ID",
		})
	}

	var product models.Product
	var priceNull sql.NullFloat64
	var imageURLsJSONStr sql.NullString
	var locationNull sql.NullString
	var biddingTypeNull sql.NullString
	var sellerNameNull sql.NullString

	err = h.db.QueryRow(`
		SELECT p.id, p.title, p.description, p.price, p.image_urls, p.seller_id,
		       p.premium, p.status, p.allow_buying, p.barter_only, p.location,
		       p.created_at, p.updated_at, u.name as seller_name,
		       (SELECT COUNT(*) FROM wishlists WHERE product_id = p.id) as wishlist_count,
		       p.bidding_type
		FROM products p
		LEFT JOIN users u ON p.seller_id = u.id
		WHERE p.id = ?
	`, productID).Scan(&product.ID, &product.Title, &product.Description, &priceNull,
		&imageURLsJSONStr, &product.SellerID, &product.Premium, &product.Status,
		&product.AllowBuying, &product.BarterOnly, &product.Location,
		&product.CreatedAt, &product.UpdatedAt, &product.SellerName, &product.WishlistCount, &product.BiddingType)

	// Parse image URLs from JSON
	if imageURLsJSONStr != "" {
		var imageURLs []string
		if err := json.Unmarshal([]byte(imageURLsJSONStr), &imageURLs); err == nil {
			product.ImageURLs = models.StringArray(imageURLs)
		}
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
			Error:   "Database error",
		})
	}

	if priceNull.Valid {
		p := priceNull.Float64
		product.Price = &p
	} else {
		product.Price = nil
	}

	if imageURLsJSONStr.Valid {
		var imageURLs []string
		if err := json.Unmarshal([]byte(imageURLsJSONStr.String), &imageURLs); err == nil {
			product.ImageURLs = models.StringArray(imageURLs)
		}
	}

	if locationNull.Valid {
		product.Location = locationNull.String
	}

	if biddingTypeNull.Valid {
		product.BiddingType = biddingTypeNull.String
	}

	if sellerNameNull.Valid {
		product.SellerName = sellerNameNull.String
	} else {
		product.SellerName = "Unknown"
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    product,
	})
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
			Error:   "Failed to retrieve product details",
		})
	}

	if p.SellerID != userID {
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "You can only update your own products",
		})
	}

	var updateData models.ProductUpdate
	if err := c.BodyParser(&updateData); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Prevent editing of products that are already sold or traded
	if p.Status == "sold" || p.Status == "traded" {
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "Cannot edit a product that has been sold or traded",
		})
	}

	// Build update query dynamically
	query := "UPDATE products SET updated_at = CURRENT_TIMESTAMP"
	var args []interface{}

	if updateData.Title != nil {
		query += ", title = ?"
		args = append(args, *updateData.Title)
	}
	if updateData.Description != nil {
		query += ", description = ?"
		args = append(args, *updateData.Description)
	}
	if updateData.Price != nil {
		query += ", price = ?"
		args = append(args, *updateData.Price)
	}
	if updateData.ImageURLs != nil {
		// Ensure we don't accidentally persist client-side data URLs or extremely large strings
		var safeList []string
		for _, u := range *updateData.ImageURLs {
			if u == "" {
				continue
			}
			if len(u) > 2000 {
				// skip very large entries (likely data URLs)
				continue
			}
			if len(u) > 10 && (u[:5] == "data:" || u[:7] == "data:/") {
				// skip inline data URLs
				continue
			}
			safeList = append(safeList, u)
		}
		// Marshal safeList to JSON string to store
		imgJSON, _ := json.Marshal(safeList)
		query += ", image_urls = ?"
		args = append(args, string(imgJSON))
	}
	if updateData.Premium != nil {
		query += ", premium = ?"
		args = append(args, *updateData.Premium)
	}
	if updateData.Status != nil {
		query += ", status = ?"
		args = append(args, *updateData.Status)
	}
	if updateData.AllowBuying != nil {
		query += ", allow_buying = ?"
		args = append(args, *updateData.AllowBuying)
	}
	if updateData.BarterOnly != nil {
		query += ", barter_only = ?"
		args = append(args, *updateData.BarterOnly)
	}
	if updateData.Location != nil {
		query += ", location = ?"
		args = append(args, *updateData.Location)
	}
	if updateData.Condition != nil {
		query += ", `condition` = ?"
		args = append(args, *updateData.Condition)
	}

	if updateData.BiddingType != nil {
		query += ", bidding_type = ?"
		args = append(args, *updateData.BiddingType)
	}

	// Re-check for counterfeit if title, description, or price changes
	if updateData.Title != nil || updateData.Description != nil || updateData.Price != nil {
		newTitle := p.Title
		if updateData.Title != nil {
			newTitle = *updateData.Title
		}
		newDescription := p.Description
		if updateData.Description != nil {
			newDescription = *updateData.Description
		}
		newPrice := p.Price
		if updateData.Price != nil {
			newPrice = updateData.Price
		}
		var priceValue float64
		if newPrice != nil {
			priceValue = *newPrice
		}

		report := services.DetectCounterfeit(newTitle, newDescription, priceValue)
		if report.IsSuspicious {
			// Prepend warning to the description if it's being updated
			if updateData.Description != nil {
				*updateData.Description = "[SUSPICIOUS] " + report.Reason + ". " + *updateData.Description
			} else {
				// If description is not being updated, we can't add the warning
				// In a real app, you might want to force an update or handle this differently
			}
		}
	}
	if updateData.Location != nil {
		coords, err := services.GetCoordinates(*updateData.Location)
		if err == nil {
			query += ", latitude = ?, longitude = ?"
			args = append(args, coords.Latitude, coords.Longitude)
		}
	}

	// Recalculate suggested value if price or condition changed
	if updateData.Price != nil || updateData.Condition != nil {
		newPrice := p.Price
		if updateData.Price != nil {
			newPrice = updateData.Price
		}

		newCondition := p.Condition
		if updateData.Condition != nil {
			newCondition = *updateData.Condition
		}

		var priceValue float64
		if newPrice != nil {
			priceValue = *newPrice
		}

		newSuggestedValue := calculateSuggestedValue(priceValue, newCondition)
		query += ", suggested_value = ?"
		args = append(args, newSuggestedValue)
	}

	// Do not proceed if no fields were updated
	if len(args) == 0 {
		return c.JSON(models.APIResponse{
			Success: true,
			Message: "No fields to update",
		})
	}

	query += " WHERE id = ?"
	args = append(args, productID)

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
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Product not found",
		})
	}

	if sellerID != userID {
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "You can only delete your own products",
		})
	}

	// Check if product has orders
	var orderCount int
	err = h.db.QueryRow("SELECT COUNT(*) FROM orders WHERE product_id = ?", productID).Scan(&orderCount)
	if err == nil && orderCount > 0 {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Cannot delete product with existing orders",
		})
	}

	// Delete the product
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

// GetUserProducts gets products by a specific user
func (h *ProductHandler) GetUserProducts(c *fiber.Ctx) error {
	userID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid user ID",
		})
	}

	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
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
		SELECT p.id, p.title, p.description, p.price, p.image_urls, p.seller_id, 
		       p.premium, p.status, p.allow_buying, p.barter_only, p.created_at, p.updated_at, u.name as seller_name
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
		var priceNull sql.NullFloat64
		var imageURLsJSONStr string
		err := rows.Scan(&product.ID, &product.Title, &product.Description, &priceNull,
			&imageURLsJSONStr, &product.SellerID, &product.Premium, &product.Status,
			&product.AllowBuying, &product.BarterOnly, &product.CreatedAt, &product.UpdatedAt, &product.SellerName)
		if err != nil {
			continue
		}
		if priceNull.Valid {
			p := priceNull.Float64
			product.Price = &p
		} else {
			product.Price = nil
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
