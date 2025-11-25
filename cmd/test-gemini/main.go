package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

func main() {
	// First, list available models
	listModels()
	fmt.Println("---")
	// Then try different models
	testGemini()
}

func listModels() {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		apiKey = "AIzaSyCY70zA3iVXFre_4eWaaE8pDppSMEbG8lA"
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models?key=%s", apiKey)

	resp, err := http.Get(url)
	if err != nil {
		fmt.Printf("Failed to list models: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("Available Models (Status %d):\n%s\n", resp.StatusCode, string(body))
}

func testGemini() {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		apiKey = "AIzaSyCY70zA3iVXFre_4eWaaE8pDppSMEbG8lA"
	}

	fmt.Printf("Using API key: %s...\n", apiKey[:20])

	// Use a larger, more realistic test image (100x100 PNG with actual content)
	// This is a valid product-like image
	pngBytes := createTestImage()

	base64Data := base64.StdEncoding.EncodeToString(pngBytes)

	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]interface{}{
					{
						"inline_data": map[string]interface{}{
							"mime_type": "image/png",
							"data":      base64Data,
						},
					},
					{
						"inline_data": map[string]interface{}{
							"mime_type": "image/png",
							"data":      base64Data,
						},
					},
					{
						"inline_data": map[string]interface{}{
							"mime_type": "image/png",
							"data":      base64Data,
						},
					},
					{
						"text": `Analyze these product images and return a JSON object with exactly these fields:
{
  "title": "A concise product title (max 15 characters)",
  "description": "A detailed product description (50-500 characters)",
  "condition": "One of: New, Like-New, Used, Fair",
  "category": "One of: General, Electronics, Mobile Phones, Computers, Home Appliances, Fashion, Collectibles, Sports, Toys, Books, Automotive, Other"
}

Be specific and accurate based on what you see in the images.`,
					},
				},
			},
		},
	}

	jsonData, _ := json.Marshal(payload)
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s", apiKey)

	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("Gemini API request failed: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("Gemini API Status: %d\n", resp.StatusCode)
	fmt.Printf("Gemini Response:\n%s\n", string(body))
}

func createTestImage() []byte {
	// Create a simple 50x50 red square PNG
	// This is a valid PNG that's more likely to be processed
	return []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x32, 0x00, 0x00, 0x00, 0x32, 0x08, 0x02, 0x00, 0x00, 0x00, 0x01, 0x54, 0x6B,
		0x19, 0xDD, 0x00, 0x00, 0x00, 0x1E, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, 0x0F, 0x00,
		0x00, 0x01, 0x01, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x03, 0x00, 0xF8, 0x5A, 0x0F, 0xC9, 0xB3, 0x5E, 0xA8,
		0x18, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
	}
}
