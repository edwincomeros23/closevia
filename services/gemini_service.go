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
	Title       string `json:"title"`
	Description string `json:"description"`
	Condition   string `json:"condition"`
	Category    string `json:"category"`
}

func GenerateProductDetails(images []*multipart.FileHeader) (*GeminiResponse, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		apiKey = "AIzaSyCY70zA3iVXFre_4eWaaE8pDppSMEbG8lA"
	}

	if len(images) < 3 {
		return nil, errors.New("at least 3 images required")
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

		mimeType := http.DetectContentType(data)
		if !strings.HasPrefix(mimeType, "image/") {
			log.Printf("Image %d has invalid mime type: %s", i, mimeType)
			continue
		}

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

	prompt := `Analyze these product images and return a JSON object with exactly these fields:
{
  "title": "A concise product title (max 15 characters)",
  "description": "A detailed product description (50-500 characters)",
  "condition": "One of: New, Like-New, Used, Fair",
  "category": "One of: General, Electronics, Mobile Phones, Computers, Home Appliances, Fashion, Collectibles, Sports, Toys, Books, Automotive, Other"
}

Be specific and accurate based on what you see in the images.`

	parts = append(parts, map[string]interface{}{
		"text": prompt,
	})

	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": parts,
			},
		},
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error marshaling payload: %v", err)
		return nil, fmt.Errorf("failed to marshal request: %v", err)
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s", apiKey)
	log.Printf("Making request to Gemini API with %d image parts", len(parts)-1)

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

	// Check for API errors in response
	if geminiResp.Error.Message != "" {
		log.Printf("Gemini API returned error: %s", geminiResp.Error.Message)
		// Provide better error messages for common issues
		if strings.Contains(strings.ToLower(geminiResp.Error.Message), "unable to process input image") {
			return nil, fmt.Errorf("Gemini cannot process the uploaded images. Ensure images are: at least 100x100 pixels, clear photos of actual products, not blurry or too small")
		}
		return nil, fmt.Errorf("gemini API error: %s", geminiResp.Error.Message)
	}

	// Check for blocked content
	if geminiResp.PromptFeedback.BlockReason != "" {
		log.Printf("Gemini blocked request: %s", geminiResp.PromptFeedback.BlockReason)
		return nil, fmt.Errorf("gemini blocked request: %s", geminiResp.PromptFeedback.BlockReason)
	}

	if len(geminiResp.Candidates) == 0 {
		log.Printf("No candidates in Gemini response")
		return nil, errors.New("no response from Gemini")
	}

	if len(geminiResp.Candidates[0].Content.Parts) == 0 {
		log.Printf("No parts in Gemini response, finish reason: %s", geminiResp.Candidates[0].FinishReason)
		return nil, errors.New("no content in Gemini response")
	}

	text := geminiResp.Candidates[0].Content.Parts[0].Text
	text = strings.TrimSpace(text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var result GeminiResponse
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		log.Printf("Error unmarshaling product details JSON: %v", err)
		log.Printf("Text was: %s", text)
		return nil, fmt.Errorf("failed to parse Gemini response: %v", err)
	}

	if result.Condition == "" {
		result.Condition = "Used"
	}
	if result.Category == "" {
		result.Category = "General"
	}
	if len(result.Title) > 15 {
		result.Title = result.Title[:15]
	}
	if len(result.Description) < 50 {
		result.Description = result.Description + " This product is in good condition and ready for trade or purchase."
	}
	if len(result.Description) > 500 {
		result.Description = result.Description[:500]
	}

	log.Printf("Successfully generated product details: title=%s, condition=%s, category=%s", result.Title, result.Condition, result.Category)
	return &result, nil
}
