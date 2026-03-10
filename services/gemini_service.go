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
	Prohibited        bool     `json:"prohibited"`
	Reason            string   `json:"reason,omitempty"`
	Title             string   `json:"title"`
	Description       string   `json:"description"`
	Condition         string   `json:"condition"`
	Category          string   `json:"category"`
	Subcategory       string   `json:"subcategory,omitempty"`
	ItemType          string   `json:"item_type,omitempty"`
	Brand             string   `json:"brand,omitempty"`
	AuthenticityRisks string   `json:"authenticity_risks,omitempty"`
	EstimatedValueMin float64  `json:"estimated_value_min,omitempty"`
	EstimatedValueMax float64  `json:"estimated_value_max,omitempty"`
	Tags              []string `json:"tags,omitempty"`
	IsProhibited      bool     `json:"is_prohibited,omitempty"`
	ProhibitedReason  string   `json:"prohibited_reason,omitempty"`
	ContainsPerson    bool     `json:"contains_person,omitempty"`
	PersonWarning     string   `json:"person_warning,omitempty"`
	IsSuspiciousImage bool     `json:"is_suspicious_image,omitempty"`
	SuspiciousReason  string   `json:"suspicious_reason,omitempty"`
	IsBlurryOrDark    bool     `json:"is_blurry_or_dark,omitempty"`
	QualityWarning    string   `json:"quality_warning,omitempty"`

	// Enhanced image quality fields
	ImageQualityScore  int                 `json:"image_quality_score,omitempty"`
	ImageQualityIssues []ImageQualityIssue `json:"image_quality_issues,omitempty"`
	IsNonProductImage  bool                `json:"is_non_product_image,omitempty"`
	NonProductReason   string              `json:"non_product_reason,omitempty"`
	AppearsOnline      bool                `json:"appears_online,omitempty"`
	OnlineImageReason  string              `json:"online_image_reason,omitempty"`
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
- Animals/Pets: living animals, dogs, cats, birds, reptiles, insects, ANY living creature (pet photos prohibited)
- Illegal items: anything violating local laws

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
- "This item can't be listed on our platform. Photos of animals and pets are not allowed."
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
  "subcategory": "specific subcategory like Smartphone, Sneakers, etc.",
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
  "quality_warning": "",
  "is_non_product_image": false,
  "non_product_reason": "",
  "appears_online": false,
  "online_image_reason": ""
}

FURTHER ANALYSIS (only if image is safe):

1. IMAGE QUALITY DETECTION (check carefully):
   a. BLURRY/DARK: Set is_blurry_or_dark=true if the photo is noticeably blurry, out of focus, too dark (underexposed), or too bright (overexposed/washed out). Provide quality_warning with specific reason.
   b. SUSPICIOUS IMAGE: Set is_suspicious_image=true if the image looks like:
      - A screenshot from a website, app, or social media
      - A stock photo, marketing image, or catalog photo (perfect studio lighting, white background, multiple angles composited)
      - An image with visible watermarks, logos from other platforms, or text overlays
      - A photo taken of a screen/monitor showing another image
      Give the reason in suspicious_reason.
   c. NON-PRODUCT IMAGE: Set is_non_product_image=true if the image is NOT a photo of a physical product (memes, text-only images, screenshots of apps/games, random scenery, collages). Give the reason in non_product_reason.
   d. APPEARS ONLINE: Set appears_online=true if the image appears to be downloaded from an online source rather than an original photo. Indicators:
      - Visible watermarks (Shutterstock, Getty, AliExpress, Amazon, etc.)
      - Perfect product placement typical of e-commerce listings
      - Marketing text or price tags from other platforms visible in the image
      - Heavy compression artifacts typical of re-uploaded images
      Give the reason in online_image_reason.

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

	// Try multiple Gemini models with fallback
	models := []string{
		"gemini-2.5-flash",      // primary (most recent)
		"gemini-2.0-flash",      // fallback
		"gemini-2.5-flash-lite", // ultra-fallback (lightweight)
	}

	var lastErr error
	for _, model := range models {
		log.Printf("[Gemini] Trying model: %s", model)
		url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, apiKey)
		log.Printf("Making request to Gemini API (%s / v1beta) with %d image part(s)", model, len(parts)-1)

		req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			log.Printf("Error creating request for %s: %v", model, err)
			lastErr = err
			continue
		}
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Error making request to Gemini API (%s): %v", model, err)
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)

		log.Printf("Gemini API (%s) response status: %d", model, resp.StatusCode)
		// Check for model not found errors
		if resp.StatusCode == 404 {
			log.Printf("Model %s not found (404), trying next model...", model)
			lastErr = fmt.Errorf("model %s not found", model)
			continue
		}
		if resp.StatusCode != http.StatusOK {
			log.Printf("Gemini API error response: %s", string(body))
			// Special handling for quota exceeded (429)
			if resp.StatusCode == 429 {
				lastErr = fmt.Errorf("AI service is temporarily rate-limited. Please try again in a few minutes.")
				continue // Try fallback model
			}
			lastErr = fmt.Errorf("gemini API error (status %d): %s", resp.StatusCode, string(body))
			continue
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
			log.Printf("Error unmarshaling Gemini response from %s: %v", model, err)
			log.Printf("Raw response: %s", string(body))
			lastErr = fmt.Errorf("failed to parse Gemini response: %v", err)
			continue
		}

		// Check for API errors in response body
		if geminiResp.Error.Message != "" {
			log.Printf("Gemini API (%s) returned error: %s", model, geminiResp.Error.Message)
			errMsg := strings.ToLower(geminiResp.Error.Message)
			if strings.Contains(errMsg, "model") && strings.Contains(errMsg, "not found") {
				lastErr = fmt.Errorf("model %s: not found", model)
				continue // Try next model
			}
			if strings.Contains(errMsg, "unable to process input image") {
				return nil, fmt.Errorf("Gemini cannot process uploaded images. Please use clear JPEG/PNG photos.")
			}
			if strings.Contains(errMsg, "invalid_argument") || strings.Contains(errMsg, "not supported") {
				return nil, fmt.Errorf("Image format not supported. Please use JPEG, PNG, or WebP.")
			}
			if strings.Contains(errMsg, "permission denied") || strings.Contains(errMsg, "authentication") || strings.Contains(errMsg, "api key") {
				return nil, fmt.Errorf("Invalid API credentials for Gemini. Please check your GEMINI_API_KEY.")
			}
			lastErr = fmt.Errorf("Gemini API: %s", geminiResp.Error.Message)
			continue
		}

		// Check for blocked content
		if geminiResp.PromptFeedback.BlockReason != "" {
			log.Printf("Gemini blocked request from %s: %s", model, geminiResp.PromptFeedback.BlockReason)
			return nil, fmt.Errorf("Gemini blocked the request: %s", geminiResp.PromptFeedback.BlockReason)
		}

		if len(geminiResp.Candidates) == 0 {
			log.Printf("No candidates in Gemini response from %s", model)
			if geminiResp.PromptFeedback.BlockReason != "" {
				return nil, fmt.Errorf("Gemini blocked the request: %s", geminiResp.PromptFeedback.BlockReason)
			}
			lastErr = errors.New("no response from Gemini")
			continue
		}

		var sb strings.Builder
		for _, candidate := range geminiResp.Candidates {
			for _, part := range candidate.Content.Parts {
				sb.WriteString(part.Text)
			}
		}
		raw := sb.String()

		log.Printf("Raw Gemini response from %s: %s", model, truncate(raw, 200))

		// Remove markdown code blocks if present
		raw = strings.TrimSpace(raw)
		if strings.HasPrefix(raw, "```") {
			old := raw
			raw = strings.TrimPrefix(raw, "```")
			if idx := strings.Index(raw, "\n"); idx != -1 {
				raw = raw[idx+1:]
			}
			raw = strings.TrimSuffix(raw, "```")
			raw = strings.TrimSpace(raw)
			log.Printf("Stripped markdown: %q -> %q", truncate(old, 50), truncate(raw, 50))
		}

		var result GeminiResponse
		if err := json.Unmarshal([]byte(raw), &result); err != nil {
			log.Printf("Error unmarshaling JSON from Gemini (%s): %v", model, err)
			log.Printf("Raw text: %s", raw)
			lastErr = fmt.Errorf("failed to parse Gemini analysis: %v", err)
			continue
		}

		// Success - return immediately
		log.Printf("✅ [Gemini] Successfully analyzed with model: %s", model)
		return &result, nil
	}

	// All Gemini models failed
	if lastErr == nil {
		lastErr = errors.New("all Gemini models failed")
	}
	log.Printf("❌ [Gemini] All models exhausted. Last error: %v", lastErr)
	return nil, lastErr
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

// truncate safely truncates a string to a maximum length
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
