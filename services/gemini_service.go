package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
)

type GeminiResponse struct {
	Title             string   `json:"title"`
	Description       string   `json:"description"`
	Condition         string   `json:"condition"`
	Category          string   `json:"category"`
	ItemType          string   `json:"item_type"`
	Brand             string   `json:"brand"`
	AuthenticityRisks string   `json:"authenticity_risks"`
	EstimatedValueMin *float64 `json:"estimated_value_min"`
	EstimatedValueMax *float64 `json:"estimated_value_max"`
	Tags              []string `json:"tags"`
}

func GenerateProductDetails(images []*multipart.FileHeader) (*GeminiResponse, error) {
	rawKey := os.Getenv("GEMINI_API_KEY")
	// Strip all whitespace, quotes, and non-printable/non-ASCII characters
	// This handles invisible Unicode chars that cause 400 on hosted environments like Render
	var sanitized strings.Builder
	for _, r := range rawKey {
		if r >= 33 && r <= 126 && r != '"' && r != '\'' {
			sanitized.WriteRune(r)
		}
	}
	apiKey := sanitized.String()

	if apiKey == "" {
		log.Printf("[Gemini] GEMINI_API_KEY raw length=%d, sanitized length=0 — key missing or all invalid chars", len(rawKey))
		return nil, errors.New("GEMINI_API_KEY environment variable not set or empty")
	}

	// Diagnostic log: show length and first/last few chars (safe partial reveal for debugging)
	safePreview := apiKey
	if len(safePreview) > 8 {
		safePreview = apiKey[:4] + "..." + apiKey[len(apiKey)-4:]
	}
	log.Printf("[Gemini] Key loaded: raw_len=%d sanitized_len=%d preview=%s", len(rawKey), len(apiKey), safePreview)

	if len(images) < 1 {
		return nil, errors.New("at least 1 image required")
	}

	var parts []map[string]interface{}
	for i, img := range images {
		if i >= 3 {
			break
		}
		file, err := img.Open()
		if err != nil {
			log.Printf("Error opening image %d: %v", i, err)
			continue
		}
		defer file.Close()

		data, err := io.ReadAll(file)
		if err != nil {
			log.Printf("Error reading image %d: %v", i, err)
			continue
		}

		// Log image info for debugging
		log.Printf("Image %d: filename=%s, size=%d bytes", i, img.Filename, len(data))

		// Detect MIME type from content
		mimeType := http.DetectContentType(data)

		// Handle special cases where http.DetectContentType might be incorrect
		if !strings.HasPrefix(mimeType, "image/") {
			fileName := strings.ToLower(img.Filename)
			switch {
			case strings.Contains(fileName, ".jpg") || strings.Contains(fileName, ".jpeg"):
				mimeType = "image/jpeg"
			case strings.Contains(fileName, ".png"):
				mimeType = "image/png"
			case strings.Contains(fileName, ".gif"):
				mimeType = "image/gif"
			case strings.Contains(fileName, ".webp"):
				mimeType = "image/webp"
			case strings.Contains(fileName, ".heic") || strings.Contains(fileName, ".heif"):
				mimeType = "image/jpeg" // treat as JPEG fallback
			}
		}

		// Validate it's an image format
		if !strings.HasPrefix(mimeType, "image/") {
			if len(data) > 0 {
				mimeType = "image/jpeg"
				log.Printf("Image %d: Using fallback mime type: %s", i, mimeType)
			} else {
				log.Printf("Image %d has no data, skipping", i)
				continue
			}
		}

		log.Printf("Image %d: mime_type=%s", i, mimeType)

		base64Data := base64.StdEncoding.EncodeToString(data)
		parts = append(parts, map[string]interface{}{
			"inline_data": map[string]interface{}{
				"mime_type": mimeType,
				"data":      base64Data,
			},
		})
	}

	if len(parts) == 0 {
		return nil, errors.New("no valid images found")
	}

	prompt := `Analyze the uploaded product image and return ONLY valid JSON with no markdown formatting.

Detect the following information about the product:

{
  "title": "max 25 characters",
  "description": "clear, natural product description for a marketplace listing",
  "condition": "one of: New, Like New, Good, Used, For Parts",
  "category": "one of: General, Electronics, Phones, Computers, Appliances, Fashion, Collectibles, Sports, Toys, Books, Automotive, Other",
  "item_type": "general type of item (e.g., Sneakers, Laptop, Camera)",
  "brand": "detected brand or Unknown",
  "authenticity_risks": "one of: Low, Medium, High",
  "estimated_value_min": 0,
  "estimated_value_max": 0,
  "tags": ["tag1", "tag2", "tag3"]
}

Rules:
- title must NOT exceed 25 characters
- description must be natural and helpful for a marketplace listing
- estimated_value_min and estimated_value_max must be numbers in PHP (Philippine Peso)
- tags must be relevant searchable keywords
- Return ONLY the JSON object, no markdown, no explanation

Example:
{
  "title": "Nike Air Force 1",
  "description": "White Nike Air Force 1 sneakers in good used condition with minor wear. Still clean and suitable for everyday casual use.",
  "condition": "Used",
  "category": "Fashion",
  "item_type": "Shoes",
  "brand": "Nike",
  "authenticity_risks": "Low",
  "estimated_value_min": 3000,
  "estimated_value_max": 3800,
  "tags": ["nike", "sneakers", "shoes", "fashion"]
}`

	parts = append(parts, map[string]interface{}{
		"text": prompt,
	})

	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": parts,
			},
		},
		"generationConfig": map[string]interface{}{
			"temperature":     0.2,
			"topP":            0.8,
			"maxOutputTokens": 1024,
		},
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error marshaling payload: %v", err)
		return nil, fmt.Errorf("failed to marshal request: %v", err)
	}

	// Use gemini-1.5-flash — stable, reliable vision model with better quota allocation
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=%s", apiKey)
	log.Printf("Making request to Gemini API (gemini-1.5-flash) with %d image part(s)", len(parts)-1)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Error creating request: %v", err)
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Error making request to Gemini API: %v", err)
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	log.Printf("Gemini API response status: %d", resp.StatusCode)
	if resp.StatusCode != http.StatusOK {
		log.Printf("Gemini API error response: %s", string(body))
		// Special handling for quota exceeded (429)
		if resp.StatusCode == 429 {
			return nil, fmt.Errorf("AI service is temporarily rate-limited. Please try again in a few minutes.")
		}
		return nil, fmt.Errorf("gemini API error (status %d): %s", resp.StatusCode, string(body))
	}

	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
			FinishReason string `json:"finishReason"`
		} `json:"candidates"`
		PromptFeedback struct {
			BlockReason string `json:"blockReason"`
		} `json:"promptFeedback"`
		Error struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.Unmarshal(body, &geminiResp); err != nil {
		log.Printf("Error unmarshaling Gemini response: %v", err)
		log.Printf("Raw response: %s", string(body))
		return nil, fmt.Errorf("failed to parse Gemini response: %v", err)
	}

	// Check for API errors in response body
	if geminiResp.Error.Message != "" {
		log.Printf("Gemini API returned error: %s", geminiResp.Error.Message)
		errMsg := strings.ToLower(geminiResp.Error.Message)
		if strings.Contains(errMsg, "model") && strings.Contains(errMsg, "not found") {
			return nil, fmt.Errorf("AI model not available. Please contact support.")
		}
		if strings.Contains(errMsg, "unable to process input image") {
			return nil, fmt.Errorf("Gemini cannot process uploaded images. Please use clear JPEG/PNG photos.")
		}
		if strings.Contains(errMsg, "invalid_argument") || strings.Contains(errMsg, "not supported") {
			return nil, fmt.Errorf("Image format not supported. Please use JPEG, PNG, or WebP.")
		}
		return nil, fmt.Errorf("AI error: %s", geminiResp.Error.Message)
	}

	// Check for blocked content
	if geminiResp.PromptFeedback.BlockReason != "" {
		log.Printf("Gemini blocked request: %s", geminiResp.PromptFeedback.BlockReason)
		return nil, fmt.Errorf("AI request blocked: %s", geminiResp.PromptFeedback.BlockReason)
	}

	if len(geminiResp.Candidates) == 0 {
		log.Printf("No candidates in Gemini response. Raw: %s", string(body))
		return nil, errors.New("no response from AI — please try again")
	}

	if len(geminiResp.Candidates[0].Content.Parts) == 0 {
		log.Printf("No parts in Gemini response, finish reason: %s", geminiResp.Candidates[0].FinishReason)
		return nil, errors.New("empty AI response — please try again")
	}

	rawText := geminiResp.Candidates[0].Content.Parts[0].Text
	log.Printf("Raw Gemini text: %s", rawText)

	// Robustly extract JSON from the response (handles markdown fences and extra text)
	jsonText := extractJSON(rawText)
	if jsonText == "" {
		log.Printf("[ERROR] Could not extract JSON from Gemini response: %s", rawText)
		_ = os.WriteFile("gemini_error.log", []byte(fmt.Sprintf("Could not extract JSON:\n%s", rawText)), 0644)
		return nil, fmt.Errorf("AI returned unexpected format — please try again")
	}

	var result GeminiResponse
	if err := json.Unmarshal([]byte(jsonText), &result); err != nil {
		_ = os.WriteFile("gemini_error.log", []byte(fmt.Sprintf("JSON parse error: %v\nJSON: %s", err, jsonText)), 0644)
		log.Printf("[ERROR] JSON parse failed: %v | text: %s", err, jsonText)
		return nil, fmt.Errorf("failed to parse AI response: %v", err)
	}

	// Apply defaults and sanity-checks
	if result.Condition == "" {
		result.Condition = "Used"
	}
	if result.Category == "" {
		result.Category = "General"
	}
	if result.AuthenticityRisks == "" {
		result.AuthenticityRisks = "Low"
	}
	if len(result.Title) > 25 {
		result.Title = result.Title[:25]
	}
	if result.Description == "" {
		result.Description = "Product in good condition and ready for trade."
	} else if len(result.Description) < 50 {
		result.Description = result.Description + " This product is in good condition and ready for trade or purchase."
	}
	if len(result.Description) > 800 {
		result.Description = result.Description[:800]
	}

	log.Printf("✅ Gemini success: title=%q condition=%s category=%s auth_risks=%s", result.Title, result.Condition, result.Category, result.AuthenticityRisks)
	return &result, nil
}

// extractJSON finds and returns the first valid JSON object from a string.
// Handles markdown code fences (```json ... ```) and raw JSON.
func extractJSON(s string) string {
	s = strings.TrimSpace(s)

	// Try to strip markdown fences first
	if idx := strings.Index(s, "```"); idx != -1 {
		// find opening fence end
		start := strings.Index(s[idx:], "\n")
		if start != -1 {
			start += idx + 1
			// find closing fence
			end := strings.LastIndex(s, "```")
			if end > start {
				s = strings.TrimSpace(s[start:end])
			}
		}
	}

	// Find the JSON object boundaries
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start == -1 || end == -1 || end < start {
		return ""
	}
	return s[start : end+1]
}
