package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/utils"
)

// AuthMiddleware checks if the request has a valid JWT token
func AuthMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Get the Authorization header
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(401).JSON(fiber.Map{
				"success": false,
				"error":   "Authorization header required",
			})
		}

		// Check if the header starts with "Bearer "
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Status(401).JSON(fiber.Map{
				"success": false,
				"error":   "Invalid authorization format. Use 'Bearer <token>'",
			})
		}

		// Extract the token
		token := strings.TrimPrefix(authHeader, "Bearer ")

		// Validate the token
		claims, err := utils.ValidateJWT(token)
		if err != nil {
			return c.Status(401).JSON(fiber.Map{
				"success": false,
				"error":   "Invalid or expired token",
			})
		}

		// Extract user information from claims
		userID, ok := claims["user_id"].(float64)
		if !ok {
			return c.Status(401).JSON(fiber.Map{
				"success": false,
				"error":   "Invalid token claims",
			})
		}

		email, ok := claims["email"].(string)
		if !ok {
			return c.Status(401).JSON(fiber.Map{
				"success": false,
				"error":   "Invalid token claims",
			})
		}

		// Store user information in context for later use
		c.Locals("user_id", int(userID))
		c.Locals("user_email", email)

		return c.Next()
	}
}

// OptionalAuthMiddleware checks for JWT token but doesn't require it
func OptionalAuthMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Get the Authorization header
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Next()
		}

		// Check if the header starts with "Bearer "
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Next()
		}

		// Extract the token
		token := strings.TrimPrefix(authHeader, "Bearer ")

		// Try to validate the token
		claims, err := utils.ValidateJWT(token)
		if err != nil {
			return c.Next()
		}

		// Extract user information from claims
		userID, ok := claims["user_id"].(float64)
		if !ok {
			return c.Next()
		}

		email, ok := claims["email"].(string)
		if !ok {
			return c.Next()
		}

		// Store user information in context for later use
		c.Locals("user_id", int(userID))
		c.Locals("user_email", email)

		return c.Next()
	}
}

// GetUserIDFromContext gets the user ID from the context
func GetUserIDFromContext(c *fiber.Ctx) (int, bool) {
	userID, ok := c.Locals("user_id").(int)
	return userID, ok
}

// GetUserEmailFromContext gets the user email from the context
func GetUserEmailFromContext(c *fiber.Ctx) (string, bool) {
	email, ok := c.Locals("user_email").(string)
	return email, ok
}
