package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/models"
)

// HomeHandler handles home page requests
type HomeHandler struct{}

// NewHomeHandler creates a new home handler
func NewHomeHandler() *HomeHandler {
	return &HomeHandler{}
}

// GetHome handles home page requests
func (h *HomeHandler) GetHome(c *fiber.Ctx) error {
	return c.JSON(models.APIResponse{
		Success: true,
		Data:    "Welcome to Clovia API",
	})
}
