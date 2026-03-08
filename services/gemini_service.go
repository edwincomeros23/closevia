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
	// SAFETY CHECK: This takes absolute priority
	Prohibited bool   `json:"prohibited,omitempty"` // True if image fails safety check - no further analysis done
	Reason     string `json:"reason,omitempty"`     // Friendly user-facing message for rejection

	// Product analysis fields (only populated if not prohibited)
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

	// Image quality & content detection fields
	IsProhibited      bool   `json:"is_prohibited,omitempty"`       // True if contains guns, drugs, alcohol, counterfeit
	ProhibitedReason  string `json:"prohibited_reason,omitempty"`   // Friendly message if prohibited
	ContainsPerson    bool   `json:"contains_person,omitempty"`     // True if person/face detected
	PersonWarning     string `json:"person_warning,omitempty"`      // Friendly message if person detected
	IsSuspiciousImage bool   `json:"is_suspicious_image,omitempty"` // True if screenshot/watermark/stock photo detected
	SuspiciousReason  string `json:"suspicious_reason,omitempty"`   // Why it looks suspicious (screenshot, watermark, stock photo)
	IsBlurryOrDark    bool   `json:"is_blurry_or_dark,omitempty"`   // True if image quality is poor
	QualityWarning    string `json:"quality_warning,omitempty"`     // Friendly message about image quality
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

		data, err := io.ReadAll(file)
		file.Close() // Close immediately after reading
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

	prompt := `SAFETY CHECK - DO THIS FIRST, BEFORE ANYTHING ELSE:

Before analyzing the product, you MUST check if the image contains ANY prohibited items.

PROHIBITED ITEMS - BLOCK IMMEDIATELY:
- Firearms: handguns, pistols, revolvers, rifles, shotguns, guns, ammunition, explosives, bombs, grenades
- Weapons: knives, blades, swords, tasers, brass knuckles, clubs, batons, any sharp/dangerous object
- Drugs: pills, syringes, needles, cannabis, cocaine, powder substances, any drug paraphernalia
- Alcohol: beer, wine, liquor, spirits, alcohol bottles
- Counterfeit goods: fake branded items, pirated media, knockoffs, replicas
- Adult content: sexual or explicit content
- People/Faces: ANY visible human face, person, or body

IF THE IMAGE CONTAINS ANY PROHIBITED ITEM:
Stop immediately and respond ONLY with this JSON (no other fields):
{
  "prohibited": true,
  "reason": "<friendly plain English reason>"
}

Examples of rejection reasons:
- "This item can't be listed. Firearms and weapons are not allowed on this platform."
- "This item can't be listed. Drugs and alcohol are not allowed on this platform."
- "Please upload a photo of the item only. Photos containing people are not allowed for privacy reasons."
- "This item can't be listed on our platform. It violates our community guidelines."

Do not analyze further. Do not return title, description, value, or condition. Return ONLY the rejected response.

---

IF THE IMAGE IS SAFE, proceed with normal analysis. Return ONLY this exact structure:
{
  "prohibited": false,
  "title": "max 25 characters",
  "description": "clear, natural product description for a marketplace listing",
  "condition": "one of: New, Like New, Good, Used, For Parts",
  "category": "one of: General, Electronics, Phones, Computers, Appliances, Fashion, Collectibles, Sports, Toys, Books, Automotive, Other",
  "item_type": "general type of item (e.g., Sneakers, Laptop, Camera)",
  "brand": "detected brand or Unknown",
  "authenticity_risks": "one of: Low, Medium, High",
  "estimated_value_min": 0,
  "estimated_value_max": 0,
  "tags": ["tag1", "tag2", "tag3"],
  "is_prohibited": false,
  "prohibited_reason": "",
  "contains_person": false,
  "person_warning": "",
  "is_suspicious_image": false,
  "suspicious_reason": "",
  "is_blurry_or_dark": false,
  "quality_warning": ""
}

FURTHER ANALYSIS (only if image is safe):

1. Quality checks:
   - Check for blurry/dark images: set is_blurry_or_dark=true if poor quality
   - Check for screenshots, watermarks, or stock photos: set is_suspicious_image=true

2. Person/Face check (double-check):
   - If any person visible (though already checked above), set contains_person=true
   - person_warning: "This photo contains a person. Please retake without people in frame for a cleaner listing"

3. Product analysis:
   - Estimate value in Philippine Pesos (PHP)
   - If cannot estimate (abstract), set both to 0
   - Be conservative if uncertain
   - Provide clear, natural description

Remember: Check for prohibited items FIRST. If found, respond ONLY with {"prohibited": true, "reason": "..."}. Only proceed with full analysis if the image is completely safe. Return valid JSON only, no markdown.`

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

	// Use gemini-1.5-flash on v1 (stable) — v1beta does not support this model
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=%s", apiKey)
	log.Printf("Making request to Gemini API (gemini-1.5-flash / v1) with %d image part(s)", len(parts)-1)

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

	// CRITICAL: Validate response for safety violations
	// If the AI returned product details for a prohibited item, override and reject it
	if violatesProhibition(&result) {
		log.Printf("⚠️ SAFETY VIOLATION: AI returned product analysis for prohibited item! Forcing rejection.")
		return &GeminiResponse{
			Prohibited: true,
			Reason:     "This item can't be listed. Weapons and firearms are not allowed on this platform.",
		}, nil
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
