package handlers

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
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
			// Fallback: save locally
			uploadsDir := filepath.Join(".", "uploads", folder)
			os.MkdirAll(uploadsDir, 0755)
			ext := filepath.Ext(file.Filename)
			filename := fmt.Sprintf("%d_%s%s", time.Now().UnixMilli(), uuid.New().String()[:8], ext)
			savePath := filepath.Join(uploadsDir, filename)
			if saveErr := c.SaveFile(file, savePath); saveErr != nil {
				return c.Status(500).JSON(fiber.Map{
					"success": false,
					"error":   "Failed to save image locally: " + saveErr.Error(),
				})
			}
			localURL := fmt.Sprintf("/uploads/%s/%s", folder, filename)
			return c.Status(201).JSON(fiber.Map{
				"success": true,
				"message": "Image uploaded successfully (local)",
				"data": fiber.Map{
					"url":           localURL,
					"original_name": file.Filename,
					"size":          file.Size,
					"type":          uploadType,
				},
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

// AnalyzeProductImages handles POST /api/analyze-product
// Accepts multipart/form-data with field "images" (multiple files allowed)
// Returns AI-generated product details with Gemini as primary and Groq as fallback
func (h *UploadHandler) AnalyzeProductImages(c *fiber.Ctx) error {
	// Get all uploaded images
	form, err := c.MultipartForm()
	if err != nil {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to parse uploaded files",
		})
	}

	images := form.File["images"]
	if len(images) == 0 {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"error":   "No images provided. Use field name 'images'",
		})
	}

	// Limit to 3 images for faster processing
	if len(images) > 3 {
		images = images[:3]
	}

	fmt.Printf("📸 [AI Analysis] Analyzing %d product image(s)...\n", len(images))

	// Analyze with fallback
	result, err := services.AnalyzeProductWithFallback(images)
	if err != nil || result == nil {
		errMsg := "AI analysis failed"
		if err != nil {
			errMsg = err.Error()
		}
		fmt.Printf("❌ [AI Analysis] Failed: %s\n", errMsg)
		return c.Status(500).JSON(fiber.Map{
			"success": false,
			"error":   errMsg,
		})
	}

	// If analysis returns prohibited status
	if result.Data != nil && result.Data.Prohibited {
		return c.Status(400).JSON(fiber.Map{
			"success":    false,
			"error":      "This item cannot be listed",
			"reason":     result.Data.Reason,
			"provider":   result.Provider,
			"time_ms":    result.TimeMs,
			"prohibited": true,
		})
	}

	fmt.Printf("✅ [AI Analysis] Complete (%s in %dms)\n", result.Provider, result.TimeMs)

	return c.Status(200).JSON(fiber.Map{
		"success":  true,
		"message":  "Product analysis completed successfully",
		"provider": result.Provider,
		"retried":  result.Retried,
		"time_ms":  result.TimeMs,
		"data": fiber.Map{
			"title":               result.Data.Title,
			"description":         result.Data.Description,
			"condition":           result.Data.Condition,
			"category":            result.Data.Category,
			"subcategory":         result.Data.Subcategory,
			"item_type":           result.Data.ItemType,
			"brand":               result.Data.Brand,
			"authenticity_risks":  result.Data.AuthenticityRisks,
			"estimated_value_min": result.Data.EstimatedValueMin,
			"estimated_value_max": result.Data.EstimatedValueMax,
			"tags":                result.Data.Tags,
			"quality_warning":     result.Data.QualityWarning,
			"person_warning":      result.Data.PersonWarning,
		},
	})
}
