package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
)

type WishlistHandler struct{}

func NewWishlistHandler() *WishlistHandler {
	return &WishlistHandler{}
}

// AddToWishlist adds a product to the user's wishlist
func (h *WishlistHandler) AddToWishlist(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return fiber.ErrUnauthorized
	}

	var payload struct {
		ProductID int `json:"product_id" validate:"required"`
	}

	if err := c.BodyParser(&payload); err != nil {
		return fiber.ErrBadRequest
	}

	query := `INSERT INTO wishlists (user_id, product_id) VALUES (?, ?)`
	_, err := database.DB.Exec(query, userID, payload.ProductID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to add product to wishlist",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(models.APIResponse{
		Success: true,
		Message: "Product added to wishlist",
	})
}

// RemoveFromWishlist removes a product from the user's wishlist
func (h *WishlistHandler) RemoveFromWishlist(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return fiber.ErrUnauthorized
	}

	productID, err := strconv.Atoi(c.Params("productId"))
	if err != nil {
		return fiber.ErrBadRequest
	}

	query := `DELETE FROM wishlists WHERE user_id = ? AND product_id = ?`
	res, err := database.DB.Exec(query, userID, productID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to remove product from wishlist",
		})
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(models.APIResponse{
			Success: false,
			Error:   "Product not found in wishlist",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Product removed from wishlist",
	})
}

// GetWishlist retrieves the user's wishlist
func (h *WishlistHandler) GetWishlist(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return fiber.ErrUnauthorized
	}

	query := `
		SELECT 
			w.id, w.user_id, w.product_id, w.created_at,
			p.id, p.title, p.description, p.price, p.image_url, p.seller_id, p.status
		FROM wishlists w
		JOIN products p ON w.product_id = p.id
		WHERE w.user_id = ?
		ORDER BY w.created_at DESC`
	rows, err := database.DB.Query(query, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to retrieve wishlist",
		})
	}
	defer rows.Close()

	var wishlist []models.Wishlist
	for rows.Next() {
		var item models.Wishlist
		var product models.Product
		err := rows.Scan(
			&item.ID, &item.UserID, &item.ProductID, &item.CreatedAt,
			&product.ID, &product.Title, &product.Description, &product.Price, &product.ImageURL, &product.SellerID, &product.Status,
		)
		if err != nil {
			continue
		}
		item.Product = &product
		wishlist = append(wishlist, item)
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    wishlist,
	})
}
