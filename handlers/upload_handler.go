package handlers

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/services"
)

// UploadHandler handles generic file uploads (images)
type UploadHandler struct{}

// NewUploadHandler creates a new upload handler
func NewUploadHandler() *UploadHandler {
	return &UploadHandler{}
}

// UploadImage handles POST /api/upload
// Accepts multipart/form-data with field "image"
// Optional "type" field to specify the folder (e.g. "trade_proof", "product", "profile")
func (h *UploadHandler) UploadImage(c *fiber.Ctx) error {
	file, err := c.FormFile("image")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"error":   "No image file provided. Use field name 'image'.",
		})
	}

	// Validate file type
	contentType := file.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		// Fallback: check extension
		name := strings.ToLower(file.Filename)
		if !strings.HasSuffix(name, ".jpg") && !strings.HasSuffix(name, ".jpeg") &&
			!strings.HasSuffix(name, ".png") && !strings.HasSuffix(name, ".gif") &&
			!strings.HasSuffix(name, ".webp") {
			return c.Status(400).JSON(fiber.Map{
				"success": false,
				"error":   "File must be an image (jpg, png, gif, webp)",
			})
		}
	}

	// Validate file size (max 10MB)
	if file.Size > 10*1024*1024 {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"error":   "Image must be smaller than 10MB",
		})
	}

	// Determine Cloudinary folder from optional "type" field
	uploadType := c.FormValue("type", "uploads")
	folder := "uploads"
	switch uploadType {
	case "trade_proof":
		folder = "trade-proofs"
	case "product":
		folder = "products"
	case "profile":
		folder = "profile-pictures"
	default:
		folder = uploadType
	}

	fmt.Printf("📤 [Upload] file=%s size=%d type=%s folder=%s\n", file.Filename, file.Size, uploadType, folder)

	url, err := services.UploadFileToCloudinary(file, folder)
	if err != nil {
		if err == services.ErrCloudinaryDisabled {
			return c.Status(503).JSON(fiber.Map{
				"success": false,
				"error":   "Image upload service is not configured. Please set CLOUDINARY_URL in .env",
			})
		}
		fmt.Printf("❌ [Upload] Cloudinary error: %v\n", err)
		return c.Status(500).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to upload image: " + err.Error(),
		})
	}

	return c.Status(201).JSON(fiber.Map{
		"success": true,
		"message": "Image uploaded successfully",
		"data": fiber.Map{
			"url":           url,
			"original_name": file.Filename,
			"size":          file.Size,
			"type":          uploadType,
		},
	})
}
