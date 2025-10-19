package handlers

import (
	"database/sql"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
	"github.com/xashathebest/clovia/utils"
)

// UserHandler handles user-related HTTP requests
type UserHandler struct {
	db *sql.DB
}

// NewUserHandler creates a new user handler
func NewUserHandler() *UserHandler {
	return &UserHandler{
		db: database.DB,
	}
}

// Register handles user registration
func (h *UserHandler) Register(c *fiber.Ctx) error {
	var user models.UserRegister
	if err := c.BodyParser(&user); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Check if user already exists
	var existingUser models.User
	err := h.db.QueryRow("SELECT id FROM users WHERE email = ?", user.Email).Scan(&existingUser.ID)
	if err == nil {
		return c.Status(409).JSON(models.APIResponse{
			Success: false,
			Error:   "User with this email already exists",
		})
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(user.Password)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to process password",
		})
	}

	// Insert new user
	result, err := h.db.Exec(
		"INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
		user.Name, user.Email, hashedPassword, user.Role,
	)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to create user",
		})
	}

	userID, _ := result.LastInsertId()

	// Generate JWT token
	token, err := utils.GenerateJWT(int(userID), user.Email)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to generate token",
		})
	}

	return c.Status(201).JSON(models.APIResponse{
		Success: true,
		Message: "User registered successfully",
		Data: fiber.Map{
			"user": models.User{
				ID:       int(userID),
				Name:     user.Name,
				Email:    user.Email,
				Verified: false,
			},
			"token": token,
		},
	})
}

// Login handles user authentication
func (h *UserHandler) Login(c *fiber.Ctx) error {
	var login models.UserLogin
	if err := c.BodyParser(&login); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Find user by email
	var user models.User
	err := h.db.QueryRow(
		"SELECT id, name, email, password_hash, role, verified FROM users WHERE email = ?",
		login.Email,
	).Scan(&user.ID, &user.Name, &user.Email, &user.PasswordHash, &user.Role, &user.Verified)

	if err != nil {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid credentials",
		})
	}

	// Check password
	if !utils.CheckPasswordHash(login.Password, user.PasswordHash) {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid credentials",
		})
	}

	// Generate JWT token
	token, err := utils.GenerateJWT(user.ID, user.Email)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to generate token",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Login successful",
		Data: fiber.Map{
			"user":  user,
			"token": token,
		},
	})
}

// GetProfile gets the current user's profile
func (h *UserHandler) GetProfile(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	var user models.User
	err := h.db.QueryRow(
		"SELECT id, name, email, role, verified, created_at, updated_at FROM users WHERE id = ?",
		userID,
	).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Verified, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    user,
	})
}

// UpdateProfile updates the current user's profile
func (h *UserHandler) UpdateProfile(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{
			Success: false,
			Error:   "User not authenticated",
		})
	}

	var updateData struct {
		Name  *string `json:"name"`
		Email *string `json:"email"`
	}

	if err := c.BodyParser(&updateData); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Build update query dynamically
	query := "UPDATE users SET updated_at = CURRENT_TIMESTAMP"
	var args []interface{}

	if updateData.Name != nil {
		query += ", name = ?"
		args = append(args, *updateData.Name)
	}

	if updateData.Email != nil {
		query += ", email = ?"
		args = append(args, *updateData.Email)
	}

	query += " WHERE id = ?"
	args = append(args, userID)

	_, err := h.db.Exec(query, args...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to update profile",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Profile updated successfully",
	})
}

// GetUserByID gets a user by ID (public info only)
func (h *UserHandler) GetUserByID(c *fiber.Ctx) error {
	userID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid user ID",
		})
	}

	var user models.User
	err = h.db.QueryRow(
		"SELECT id, name, verified, created_at FROM users WHERE id = ?",
		userID,
	).Scan(&user.ID, &user.Name, &user.Verified, &user.CreatedAt)

	if err != nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    user,
	})
}

// GetUsers gets all users (admin only, paginated)
func (h *UserHandler) GetUsers(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	offset := (page - 1) * limit

	// Get total count
	var total int
	err := h.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&total)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get user count",
		})
	}

	// Get users
	rows, err := h.db.Query(
		"SELECT id, name, email, verified, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?",
		limit, offset,
	)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get users",
		})
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var user models.User
		err := rows.Scan(&user.ID, &user.Name, &user.Email, &user.Verified, &user.CreatedAt)
		if err != nil {
			continue
		}
		users = append(users, user)
	}

	totalPages := (total + limit - 1) / limit

	return c.JSON(models.APIResponse{
		Success: true,
		Data: models.PaginatedResponse{
			Data:       users,
			Total:      total,
			Page:       page,
			Limit:      limit,
			TotalPages: totalPages,
		},
	})
}

// SaveProduct saves a product to user's watchlist
func (h *UserHandler) SaveProduct(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(int)

	var req struct {
		ProductID int `json:"product_id"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Check if product exists
	var productExists bool
	err := h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM products WHERE id = ? AND deleted_at IS NULL)", req.ProductID).Scan(&productExists)
	if err != nil || !productExists {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Product not found",
		})
	}

	// Check if already saved
	var alreadySaved bool
	err = h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM saved_products WHERE user_id = ? AND product_id = ?)", userID, req.ProductID).Scan(&alreadySaved)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to check saved status",
		})
	}

	if alreadySaved {
		return c.Status(409).JSON(models.APIResponse{
			Success: false,
			Error:   "Product already saved",
		})
	}

	// Save the product
	_, err = h.db.Exec("INSERT INTO saved_products (user_id, product_id, created_at) VALUES (?, ?, NOW())", userID, req.ProductID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to save product",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Product saved successfully",
	})
}

// UnsaveProduct removes a product from user's watchlist
func (h *UserHandler) UnsaveProduct(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(int)
	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid product ID",
		})
	}

	// Remove the saved product
	result, err := h.db.Exec("DELETE FROM saved_products WHERE user_id = ? AND product_id = ?", userID, productID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to remove saved product",
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Saved product not found",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Product removed from saved items",
	})
}

// CheckSavedProduct checks if a product is saved by the user
func (h *UserHandler) CheckSavedProduct(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(int)
	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid product ID",
		})
	}

	var isSaved bool
	err = h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM saved_products WHERE user_id = ? AND product_id = ?)", userID, productID).Scan(&isSaved)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to check saved status",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"isSaved": isSaved,
		},
	})
}

// GetSavedProducts gets all saved products for a user
func (h *UserHandler) GetSavedProducts(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(int)
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	offset := (page - 1) * limit

	// Get total count
	var total int
	err := h.db.QueryRow("SELECT COUNT(*) FROM saved_products WHERE user_id = ?", userID).Scan(&total)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get saved products count",
		})
	}

	// Get saved products with product details
	rows, err := h.db.Query(`
		SELECT 
			p.id, p.title, p.description, p.price, p.image_urls, p.seller_id,
			p.premium, p.status, p.allow_buying, p.barter_only, p.location,
			p.condition, p.suggested_value, p.category, p.created_at, p.updated_at,
			u.name as seller_name,
			sp.created_at as saved_at
		FROM saved_products sp
		JOIN products p ON p.id = sp.product_id
		JOIN users u ON u.id = p.seller_id
		WHERE sp.user_id = ? AND p.deleted_at IS NULL
		ORDER BY sp.created_at DESC
		LIMIT ? OFFSET ?
	`, userID, limit, offset)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to get saved products",
		})
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var product models.Product
		var savedAt string
		err := rows.Scan(
			&product.ID, &product.Title, &product.Description, &product.Price,
			&product.ImageURLs, &product.SellerID, &product.Premium, &product.Status,
			&product.AllowBuying, &product.BarterOnly, &product.Location,
			&product.Condition, &product.SuggestedValue, &product.Category,
			&product.CreatedAt, &product.UpdatedAt, &product.SellerName, &savedAt,
		)
		if err != nil {
			continue
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
