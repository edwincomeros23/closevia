package handlers

import (
	"database/sql"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
)

// OrderHandler handles order-related HTTP requests
type OrderHandler struct {
	db *sql.DB
}

// NewOrderHandler creates a new order handler
func NewOrderHandler() *OrderHandler {
	return &OrderHandler{
		db: database.DB,
	}
}

// CreateOrder creates a new order
func (h *OrderHandler) CreateOrder(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	var orderData models.OrderCreate
	if err := c.BodyParser(&orderData); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Check if product exists and is available
	var product models.Product
	err := h.db.QueryRow(`
		SELECT id, title, price, seller_id, status FROM products WHERE id = ?
	`, orderData.ProductID).Scan(&product.ID, &product.Title, &product.Price, &product.SellerID, &product.Status)

	if err != nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Product not found",
		})
	}

	if product.Status != "available" {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Product is not available for purchase",
		})
	}

	// Check if user is trying to buy their own product
	if product.SellerID == userID {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "You cannot buy your own product",
		})
	}

	// Check if user already has a pending order for this product
	var existingOrderID int
	err = h.db.QueryRow(`
		SELECT id FROM orders WHERE product_id = ? AND buyer_id = ? AND status = 'pending'
	`, orderData.ProductID, userID).Scan(&existingOrderID)

	if err == nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "You already have a pending order for this product",
		})
	}

	// Start transaction
	tx, err := h.db.Begin()
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to start transaction",
		})
	}
	defer tx.Rollback()

	// Create order
	result, err := tx.Exec(`
		INSERT INTO orders (product_id, buyer_id, status) VALUES (?, ?, 'pending')
	`, orderData.ProductID, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to create order",
		})
	}

	orderID, _ := result.LastInsertId()

	// Update product status to sold
	_, err = tx.Exec("UPDATE products SET status = 'sold' WHERE id = ?", orderData.ProductID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to update product status",
		})
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to commit transaction",
		})
	}

	// Get the created order with product details
	var order models.Order
	err = h.db.QueryRow(`
		SELECT o.id, o.product_id, o.buyer_id, o.status, o.created_at, o.updated_at
		FROM orders o
		WHERE o.id = ?
	`, orderID).Scan(&order.ID, &order.ProductID, &order.BuyerID, &order.Status, &order.CreatedAt, &order.UpdatedAt)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to retrieve created order",
		})
	}

	// Add product details
	order.Product = &product

	return c.Status(201).JSON(models.APIResponse{
		Success: true,
		Message: "Order created successfully",
		Data:    order,
	})
}

// GetOrders gets orders for the current user
func (h *OrderHandler) GetOrders(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	// Determine if user wants to see orders they made or received
	orderType := c.Query("type", "bought") // "bought" or "sold"
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	offset := (page - 1) * limit

	var query string
	var args []interface{}

	if orderType == "sold" {
		// Orders for products sold by the user
		query = `
			SELECT o.id, o.product_id, o.buyer_id, o.status, o.created_at, o.updated_at
			FROM orders o
			JOIN products p ON o.product_id = p.id
			WHERE p.seller_id = ?
		`
		args = append(args, userID)
	} else {
		// Orders made by the user
		query = `
			SELECT o.id, o.product_id, o.buyer_id, o.status, o.created_at, o.updated_at
			FROM orders o
			WHERE o.buyer_id = ?
		`
		args = append(args, userID)
	}

	// Get total count
	countQuery := "SELECT COUNT(*) FROM (" + query + ") as count_table"
	var total int
	err := h.db.QueryRow(countQuery, args...).Scan(&total)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get order count",
		})
	}

	// Get orders
	query += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := h.db.Query(query, args...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get orders",
		})
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var order models.Order
		err := rows.Scan(&order.ID, &order.ProductID, &order.BuyerID, &order.Status, &order.CreatedAt, &order.UpdatedAt)
		if err != nil {
			continue
		}

		// Get product details
		var product models.Product
		err = h.db.QueryRow(`
			SELECT p.id, p.title, p.description, p.price, p.image_url, p.seller_id, 
			       p.premium, p.status, p.created_at, p.updated_at, u.name as seller_name
			FROM products p
			JOIN users u ON p.seller_id = u.id
			WHERE p.id = ?
		`, order.ProductID).Scan(&product.ID, &product.Title, &product.Description, &product.Price,
			&product.ImageURL, &product.SellerID, &product.Premium, &product.Status,
			&product.CreatedAt, &product.UpdatedAt, &product.SellerName)

		if err == nil {
			order.Product = &product
		}

		// Get buyer details
		var buyer models.User
		err = h.db.QueryRow(`
			SELECT id, name, email, verified, created_at, updated_at
			FROM users WHERE id = ?
		`, order.BuyerID).Scan(&buyer.ID, &buyer.Name, &buyer.Email, &buyer.Verified, &buyer.CreatedAt, &buyer.UpdatedAt)

		if err == nil {
			order.Buyer = &buyer
		}

		orders = append(orders, order)
	}

	totalPages := (total + limit - 1) / limit

	return c.JSON(models.APIResponse{
		Success: true,
		Data: models.PaginatedResponse{
			Data:       orders,
			Total:      total,
			Page:       page,
			Limit:      limit,
			TotalPages: totalPages,
		},
	})
}

// GetOrder gets a specific order by ID
func (h *OrderHandler) GetOrder(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	orderID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid order ID",
		})
	}

	var order models.Order
	err = h.db.QueryRow(`
		SELECT o.id, o.product_id, o.buyer_id, o.status, o.created_at, o.updated_at
		FROM orders o
		WHERE o.id = ?
	`, orderID).Scan(&order.ID, &order.ProductID, &order.BuyerID, &order.Status, &order.CreatedAt, &order.UpdatedAt)

	if err != nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Order not found",
		})
	}

	// Check if user has access to this order
	if order.BuyerID != userID {
		// Check if user is the seller
		var sellerID int
		err = h.db.QueryRow("SELECT seller_id FROM products WHERE id = ?", order.ProductID).Scan(&sellerID)
		if err != nil || sellerID != userID {
			return c.Status(403).JSON(models.APIResponse{
				Success: false,
				Error:   "Access denied",
			})
		}
	}

	// Get product details
	var product models.Product
	err = h.db.QueryRow(`
		SELECT p.id, p.title, p.description, p.price, p.image_url, p.seller_id, 
		       p.premium, p.status, p.created_at, p.updated_at, u.name as seller_name
		FROM products p
		JOIN users u ON p.seller_id = u.id
		WHERE p.id = ?
	`, order.ProductID).Scan(&product.ID, &product.Title, &product.Description, &product.Price,
		&product.ImageURL, &product.SellerID, &product.Premium, &product.Status,
		&product.CreatedAt, &product.UpdatedAt, &product.SellerName)

	if err == nil {
		order.Product = &product
	}

	// Get buyer details
	var buyer models.User
	err = h.db.QueryRow(`
		SELECT id, name, email, verified, created_at, updated_at
		FROM users WHERE id = ?
	`, order.BuyerID).Scan(&buyer.ID, &buyer.Name, &buyer.Email, &buyer.Verified, &buyer.CreatedAt, &buyer.UpdatedAt)

	if err == nil {
		order.Buyer = &buyer
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    order,
	})
}

// UpdateOrderStatus updates the status of an order
func (h *OrderHandler) UpdateOrderStatus(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	orderID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid order ID",
		})
	}

	var updateData models.OrderUpdate
	if err := c.BodyParser(&updateData); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Check if user has access to this order
	var order models.Order
	err = h.db.QueryRow(`
		SELECT o.id, o.product_id, o.buyer_id, o.status
		FROM orders o
		WHERE o.id = ?
	`, orderID).Scan(&order.ID, &order.ProductID, &order.BuyerID, &order.Status)

	if err != nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Order not found",
		})
	}

	// Check if user is the seller
	var sellerID int
	err = h.db.QueryRow("SELECT seller_id FROM products WHERE id = ?", order.ProductID).Scan(&sellerID)
	if err != nil || sellerID != userID {
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "Only the seller can update order status",
		})
	}

	// Update order status
	_, err = h.db.Exec("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", updateData.Status, orderID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to update order status",
		})
	}

	// If order is completed, create transaction record
	if updateData.Status != nil && *updateData.Status == "completed" {
		// Get product price
		var price float64
		err = h.db.QueryRow("SELECT price FROM products WHERE id = ?", order.ProductID).Scan(&price)
		if err == nil {
			// Create transaction record
			_, err = h.db.Exec(`
				INSERT INTO transactions (order_id, amount) VALUES (?, ?)
			`, orderID, price)
			if err != nil {
				// Log error but don't fail the request
				// In production, you might want to handle this differently
			}
		}
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Order status updated successfully",
	})
}
