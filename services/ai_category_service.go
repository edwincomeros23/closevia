package services

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// CategorySuggestion represents AI-suggested category information
type CategorySuggestion struct {
	Category     string   `json:"category"`      // Main category (e.g., "Other")
	Subcategory  string   `json:"subcategory"`   // Suggested subcategory (e.g., "Plants")
	Confidence   float64  `json:"confidence"`    // Confidence level 0-1
	Reasoning    string   `json:"reasoning"`     // Why this category was chosen
	AlternativesRaw string `json:"alternatives"` // Alternative categories as JSON string
	IsNewCategory bool    `json:"is_new_category"` // Whether this is a dynamically suggested category
}

// StandardCategories are the predefined categories in the system
var StandardCategories = []string{
	"Electronics",
	"Apparel",
	"Books",
	"Home Goods",
	"General",
}

// SuggestCategoryWithAI uses Gemini API to intelligently suggest categories for items
// that don't match standard keyword patterns
func SuggestCategoryWithAI(title, description string) (*CategorySuggestion, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		log.Printf("[Category AI] Gemini API key not available, skipping AI categorization")
		return nil, nil
	}

	// Sanitize the API key (same as in gemini_service.go)
	var sanitized strings.Builder
	for _, r := range apiKey {
		if r >= 33 && r <= 126 && r != '"' && r != '\'' {
			sanitized.WriteRune(r)
		}
	}
	apiKey = sanitized.String()

	if apiKey == "" {
		return nil, nil
	}

	// Build the prompt for category suggestion
	prompt := `You are a product categorization expert. Analyze the product and suggest an appropriate category.

PRODUCT INFO:
Title: ` + title + `
Description: ` + description + `

AVAILABLE MAIN CATEGORIES:
- Electronics (phones, laptops, cameras, etc.)
- Apparel (clothing, shoes, accessories)
- Books (novels, textbooks, magazines)
- Home Goods (furniture, decor, kitchenware)
- General (everything else)

INSTRUCTIONS:
1. If the product clearly fits one of the standard categories, return that category with high confidence
2. If the product doesn't fit standard categories, suggest it as "Other" with an appropriate subcategory
3. Be specific with subcategories (e.g., "Plants", "Sports Equipment", "Art Supplies", "Collectibles")
4. Provide confidence level (0.0-1.0) for your suggestion
5. Include brief reasoning and alternative categories

Return ONLY valid JSON (no markdown, no extra text):
{
  "category": "Electronics" or "Apparel" or "Books" or "Home Goods" or "General" or "Other",
  "subcategory": "if Other, provide a specific subcategory like 'Plants', 'Sports', etc.",
  "confidence": 0.85,
  "reasoning": "Brief explanation",
  "alternatives": "[\"Alternative1\", \"Alternative2\"]"
}`

	// Call Gemini API
	url := "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey

	requestBody := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]interface{}{
					{
						"text": prompt,
					},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"temperature":   0.3, // Lower temperature for consistent categorization
			"maxOutputTokens": 500,
		},
	}

	bodyBytes, _ := json.Marshal(requestBody)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		log.Printf("[Category AI] Failed to create request: %v", err)
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[Category AI] Gemini API request failed: %v", err)
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("[Category AI] Gemini API returned status %d", resp.StatusCode)
		return nil, nil // Gracefully fall back on API errors
	}

	var result struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Printf("[Category AI] Failed to decode response: %v", err)
		return nil, err
	}

	if len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
		log.Printf("[Category AI] No response from Gemini")
		return nil, nil
	}

	responseText := result.Candidates[0].Content.Parts[0].Text
	log.Printf("[Category AI] Gemini response: %s", responseText)

	// Parse JSON response (handle potential markdown formatting)
	responseText = strings.TrimSpace(responseText)
	if strings.HasPrefix(responseText, "```") {
		// Remove markdown code blocks
		responseText = strings.TrimPrefix(responseText, "```json")
		responseText = strings.TrimPrefix(responseText, "```")
		responseText = strings.TrimSuffix(responseText, "```")
		responseText = strings.TrimSpace(responseText)
	}

	var suggestion CategorySuggestion
	if err := json.Unmarshal([]byte(responseText), &suggestion); err != nil {
		log.Printf("[Category AI] Failed to parse JSON response: %v", err)
		return nil, err
	}

	// Mark if this is a new dynamic category
	suggestion.IsNewCategory = suggestion.Category == "Other" || !contains(StandardCategories, suggestion.Category)

	log.Printf("[Category AI] ✅ Suggested category: %s (subcategory: %s, confidence: %.2f, new: %v)",
		suggestion.Category, suggestion.Subcategory, suggestion.Confidence, suggestion.IsNewCategory)

	return &suggestion, nil
}

// AppriseProductWithAI enhances the basic keyword-based appraisal with AI suggestions
func AppraiseProductWithAI(title, description string) AppraisalResult {
	// First try keyword-based matching (fast)
	result := AppraiseProduct(title, description)

	// If we got "General" (no match), try AI for better categorization
	if result.Category == "General" {
		suggestion, err := SuggestCategoryWithAI(title, description)
		if err == nil && suggestion != nil {
			if suggestion.Confidence >= 0.6 { // Only use if reasonably confident
				if suggestion.Subcategory != "" {
					// Return "Other: Subcategory" format
					result.Category = suggestion.Category + ": " + suggestion.Subcategory
				} else {
					result.Category = suggestion.Category
				}
				log.Printf("[Appraisal] AI enhanced category: %s (confidence: %.2f)", result.Category, suggestion.Confidence)
			}
		}
	}

	return result
}

// contains checks if a string is in a slice
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
