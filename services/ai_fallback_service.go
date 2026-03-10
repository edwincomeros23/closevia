package services

import (
	"fmt"
	"log"
	"mime/multipart"
	"os"
	"time"
)

// AIAnalysisResult represents the unified response from either Gemini or Groq
type AIAnalysisResult struct {
	Success  bool
	Provider string // "gemini" or "groq"
	Data     *GeminiResponse
	Error    string
	TimeMs   int64
	Retried  bool
}

// AnalyzeProductWithFallback attempts to analyze product images with Gemini first,
// and automatically falls back to Groq if Gemini fails due to rate limits or errors
func AnalyzeProductWithFallback(images []*multipart.FileHeader) (*AIAnalysisResult, error) {
	result := &AIAnalysisResult{}
	startTime := time.Now()

	// Step 1: Try Gemini first (primary provider - fastest)
	log.Printf("🚀 [AI] PRIMARY: Attempting Gemini analysis...")
	geminiResult, geminiErr := GenerateProductDetails(images)
	geminiTimeMs := time.Since(startTime).Milliseconds()

	if geminiErr == nil && geminiResult != nil {
		// ✅ Gemini succeeded - return immediately (fast path)
		result.Success = true
		result.Provider = "gemini"
		result.Data = geminiResult
		result.TimeMs = geminiTimeMs
		result.Retried = false
		log.Printf("✅ [AI] Gemini SUCCESS in %dms (FAST PATH)", geminiTimeMs)
		return result, nil
	}

	// Step 2: Gemini failed - log the error
	if geminiErr != nil {
		log.Printf("⚠️  [AI] Gemini FAILED after %dms: %v", geminiTimeMs, geminiErr)
	}

	// Step 3: Fall back to Groq (backup provider)
	log.Printf("🔄 [AI] FALLBACK: Trying Groq backup provider...")
	groqStartTime := time.Now()
	groqResult, groqErr := AnalyzeProductWithGroq(images)
	groqTimeMs := time.Since(groqStartTime).Milliseconds()
	totalTimeMs := time.Since(startTime).Milliseconds()

	if groqErr == nil && groqResult != nil {
		// ✅ Groq succeeded
		result.Success = true
		result.Provider = "groq"
		result.Data = groqResult
		result.TimeMs = totalTimeMs
		result.Retried = true
		log.Printf("✅ [AI] Groq FALLBACK SUCCESS in %dms (Total: %dms, Gemini failed: %dms + Groq analysis: %dms)",
			groqTimeMs, totalTimeMs, geminiTimeMs, groqTimeMs)
		return result, nil
	}

	// ❌ Both Gemini AND Groq failed
	result.Success = false
	result.Provider = "none"
	result.TimeMs = totalTimeMs
	result.Error = fmt.Sprintf("Both AI providers failed. Gemini: %v | Groq: %v", geminiErr, groqErr)
	log.Printf("❌ [AI] CRITICAL: Both Gemini and Groq failed after %dms total: %s", totalTimeMs, result.Error)

	return result, fmt.Errorf("AI analysis unavailable: %s", result.Error)
}

// GetActiveAIProvider returns which AI provider is currently available
func GetActiveAIProvider() string {
	// Try Gemini first
	if isGeminiAvailable() {
		return "gemini"
	}
	// Fallback to Groq
	if isGroqAvailable() {
		return "groq"
	}
	return "none"
}

func isGeminiAvailable() bool {
	// Check if GEMINI_API_KEY is set and not empty
	// This is a simple check; actual availability is tested during analysis
	return os.Getenv("GEMINI_API_KEY") != ""
}

func isGroqAvailable() bool {
	// Check if GROQ_API_KEY is set and not empty
	// This is a simple check; actual availability is tested during analysis
	return os.Getenv("GROQ_API_KEY") != ""
}
