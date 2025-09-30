package middleware

import (
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/models"
)

// ErrorMiddleware recovers from panics and returns a standardized JSON error response.
func ErrorMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("panic recovered in middleware: %v", r)
				// try to send a JSON response if possible
				_ = c.Status(fiber.StatusInternalServerError).JSON(models.APIResponse{
					Success: false,
					Error:   "Internal server error",
				})
			}
		}()
		return c.Next()
	}
}
