package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// SmartSearchResult holds the parsed search query from Gemini
type SmartSearchResult struct {
	Keywords       []string `json:"keywords"`
	Category       string   `json:"category,omitempty"`
	MinPrice       *float64 `json:"min_price,omitempty"`
	MaxPrice       *float64 `json:"max_price,omitempty"`
	SortByDistance bool     `json:"sort_by_distance"`
	Condition      string   `json:"condition,omitempty"`
}

// smartSearchCache stores parsed queries with TTL
type smartSearchCache struct {
	result    *SmartSearchResult
	expiresAt time.Time
}

var (
	searchCache sync.Map
	cacheTTL    = 5 * time.Minute
)

// ParseSearchQuery uses Gemini to parse a natural language search query into structured filters
func ParseSearchQuery(query string, hasLocation bool) (*SmartSearchResult, error) {
	// Check cache first
	cacheKey := fmt.Sprintf("%s|%v", strings.ToLower(strings.TrimSpace(query)), hasLocation)
	if cached, ok := searchCache.Load(cacheKey); ok {
		entry := cached.(*smartSearchCache)
		if time.Now().Before(entry.expiresAt) {
			return entry.result, nil
		}
		searchCache.Delete(cacheKey)
	}

	rawKey := os.Getenv("GEMINI_API_KEY")
	var sanitized strings.Builder
	for _, r := range rawKey {
		if r >= 33 && r <= 126 && r != '"' && r != '\'' {
			sanitized.WriteRune(r)
		}
	}
	apiKey := sanitized.String()

	if apiKey == "" {
		// Fallback: return query as-is when Gemini unavailable
		return &SmartSearchResult{
			Keywords: strings.Fields(query),
		}, nil
	}

	prompt := fmt.Sprintf(`You are a search query parser for a campus marketplace called Clovia. Parse the user's search query into structured filters.

User query: "%s"
User has location: %v

Available categories: General, Electronics, Phones, Computers, Appliances, Fashion, Collectibles, Sports, Toys, Books, Automotive, Other
Available conditions: New, Like-New, Used, Fair

Return ONLY valid JSON (no markdown, no code fences):
{
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "category": "category or empty string",
  "min_price": null or number,
  "max_price": null or number,
  "sort_by_distance": true/false,
  "condition": "condition or empty string"
}

Rules:
- "keywords" should expand the query into relevant search terms, synonyms, and related product names (3-6 keywords max)
- For "cheap" or "budget", set max_price around 5000 (PHP currency)
- For "expensive" or "premium", set min_price around 10000
- For "near me" or "nearby", set sort_by_distance to true
- Only set category if clearly implied
- Only set condition if clearly implied`, query, hasLocation)

	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]interface{}{
					{"text": prompt},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"temperature":     0.1,
			"topP":            0.8,
			"maxOutputTokens": 256,
		},
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return &SmartSearchResult{Keywords: strings.Fields(query)}, nil
	}

	models := []string{
		"gemini-2.5-flash",
		"gemini-2.0-flash",
		"gemini-2.5-flash-lite",
	}

	var lastErr error
	for _, model := range models {
		url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, apiKey)

		req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)

		if resp.StatusCode == 404 || resp.StatusCode == 429 {
			lastErr = fmt.Errorf("model %s returned %d", model, resp.StatusCode)
			continue
		}
		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("gemini API error (status %d)", resp.StatusCode)
			continue
		}

		// Parse Gemini response
		var geminiResp struct {
			Candidates []struct {
				Content struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
			} `json:"candidates"`
		}

		if err := json.Unmarshal(body, &geminiResp); err != nil {
			lastErr = err
			continue
		}

		if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
			lastErr = fmt.Errorf("empty Gemini response")
			continue
		}

		text := geminiResp.Candidates[0].Content.Parts[0].Text
		// Strip markdown code fences if present
		text = strings.TrimSpace(text)
		text = strings.TrimPrefix(text, "```json")
		text = strings.TrimPrefix(text, "```")
		text = strings.TrimSuffix(text, "```")
		text = strings.TrimSpace(text)

		var result SmartSearchResult
		if err := json.Unmarshal([]byte(text), &result); err != nil {
			log.Printf("[SmartSearch] Failed to parse Gemini JSON: %v, raw: %s", err, text)
			lastErr = err
			continue
		}

		// Ensure original query terms are included
		queryWords := strings.Fields(strings.ToLower(query))
		for _, w := range queryWords {
			if w == "near" || w == "me" || w == "cheap" || w == "expensive" || w == "budget" || w == "nearby" {
				continue
			}
			found := false
			for _, k := range result.Keywords {
				if strings.EqualFold(k, w) {
					found = true
					break
				}
			}
			if !found {
				result.Keywords = append(result.Keywords, w)
			}
		}

		// Cache result
		searchCache.Store(cacheKey, &smartSearchCache{
			result:    &result,
			expiresAt: time.Now().Add(cacheTTL),
		})

		log.Printf("[SmartSearch] Parsed '%s' → keywords=%v, category=%s, price=[%v-%v], distance=%v",
			query, result.Keywords, result.Category, result.MinPrice, result.MaxPrice, result.SortByDistance)

		return &result, nil
	}

	log.Printf("[SmartSearch] All models failed for '%s': %v — falling back to raw keywords", query, lastErr)
	return &SmartSearchResult{Keywords: strings.Fields(query)}, nil
}
