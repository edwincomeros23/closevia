package handlers

import (
	"database/sql"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
	"github.com/xashathebest/clovia/services"
)

type AIFeaturesHandler struct {
	db *sql.DB
}

func NewAIFeaturesHandler() *AIFeaturesHandler {
	return &AIFeaturesHandler{
		db: database.DB,
	}
}

// GetProximity calculates and returns the distance between two users or a user and a product
func (h *AIFeaturesHandler) GetProximity(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "Unauthorized"})
	}

	// Get query parameters
	targetType := c.Query("type") // "user" or "product"
	targetIDStr := c.Query("target_id")

	if targetType == "" || targetIDStr == "" {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Missing required parameters: type and target_id",
		})
	}

	targetID, err := strconv.Atoi(targetIDStr)
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid target_id"})
	}

	// Get current user's coordinates
	var userLat, userLon sql.NullFloat64
	err = h.db.QueryRow("SELECT latitude, longitude FROM users WHERE id = ?", userID).Scan(&userLat, &userLon)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to get user location"})
	}

	if !userLat.Valid || !userLon.Valid {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "User location not set. Please update your profile with location information.",
		})
	}

	var distance *services.DistanceResult

	switch targetType {
	case "user":
		// Calculate distance to another user
		var targetLat, targetLon sql.NullFloat64
		err = h.db.QueryRow("SELECT latitude, longitude FROM users WHERE id = ?", targetID).Scan(&targetLat, &targetLon)
		if err != nil {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Target user not found"})
		}

		if !targetLat.Valid || !targetLon.Valid {
			return c.Status(400).JSON(models.APIResponse{
				Success: false,
				Error:   "Target user location not set",
			})
		}

		distance, err = services.CalculateDistanceBetweenUsers(
			&userLat.Float64, &userLon.Float64,
			&targetLat.Float64, &targetLon.Float64,
		)
	case "product":
		// Calculate distance to a product
		var productLat, productLon sql.NullFloat64
		err = h.db.QueryRow("SELECT latitude, longitude FROM products WHERE id = ?", targetID).Scan(&productLat, &productLon)
		if err != nil {
			return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Product not found"})
		}

		if !productLat.Valid || !productLon.Valid {
			return c.Status(400).JSON(models.APIResponse{
				Success: false,
				Error:   "Product location not set",
			})
		}

		distance, err = services.CalculateDistanceToProduct(
			&userLat.Float64, &userLon.Float64,
			&productLat.Float64, &productLon.Float64,
		)
	default:
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid type. Must be 'user' or 'product'"})
	}

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: err.Error()})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    distance,
	})
}

// GetResponseMetrics returns chat response metrics for a user
func (h *AIFeaturesHandler) GetResponseMetrics(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "Unauthorized"})
	}

	// Check if requesting own metrics or another user's
	targetUserIDStr := c.Query("user_id")
	targetUserID := userID

	if targetUserIDStr != "" {
		parsedID, err := strconv.Atoi(targetUserIDStr)
		if err == nil {
			targetUserID = parsedID
		}
		// Note: In production, you might want to restrict viewing other users' metrics
	}

	metrics, err := services.CalculateResponseMetrics(h.db, targetUserID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to calculate response metrics"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    metrics,
	})
}

// GetProfileAnalysis returns profile analysis for a user
func (h *AIFeaturesHandler) GetProfileAnalysis(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "Unauthorized"})
	}

	// Check if requesting own analysis or another user's
	targetUserIDStr := c.Query("user_id")
	targetUserID := userID

	if targetUserIDStr != "" {
		parsedID, err := strconv.Atoi(targetUserIDStr)
		if err == nil {
			targetUserID = parsedID
		}
	}

	analysis, err := services.AnalyzeProfile(h.db, targetUserID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to analyze profile"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    analysis,
	})
}

// AnalyzeAllProfiles analyzes all user profiles (admin only)
func (h *AIFeaturesHandler) AnalyzeAllProfiles(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "Unauthorized"})
	}

	// Check if user is admin
	var role string
	err := h.db.QueryRow("SELECT role FROM users WHERE id = ?", userID).Scan(&role)
	if err != nil || role != "admin" {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Admin access required"})
	}

	summary, err := services.AnalyzeAllProfiles(h.db)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to analyze profiles"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    summary,
	})
}

// GetCounterfeitReport returns counterfeit detection report for a product
func (h *AIFeaturesHandler) GetCounterfeitReport(c *fiber.Ctx) error {
	productIDStr := c.Params("id")
	productID, err := strconv.Atoi(productIDStr)
	if err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid product ID"})
	}

	// Get product details
	var title, description string
	var price sql.NullFloat64
	err = h.db.QueryRow("SELECT title, description, price FROM products WHERE id = ?", productID).Scan(&title, &description, &price)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Product not found"})
	}

	productPrice := 0.0
	if price.Valid {
		productPrice = price.Float64
	}

	report := services.DetectCounterfeit(title, description, productPrice)

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    report,
	})
}
