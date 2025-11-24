package services

import (
	"fmt"
	"math"
	"regexp"
	"strings"
)

// CounterfeitReport holds the results of the counterfeit detection.
type CounterfeitReport struct {
	IsSuspicious bool     `json:"is_suspicious"`
	Reason       string   `json:"reason"`
	Confidence   float64  `json:"confidence"` // 0.0 to 1.0
	Flags        []string `json:"flags"`      // List of detected issues
}

// suspiciousKeywords is a list of words that may indicate a counterfeit product.
var suspiciousKeywords = []string{
	"replica", "copy", "clone", "fake", "first copy", "inspired by",
	"knockoff", "imitation", "duplicate", "counterfeit", "unauthorized",
	"unbranded", "generic", "similar to", "looks like",
}

// brandMinimumPrices maps high-value brands to their typical minimum market price.
var brandMinimumPrices = map[string]float64{
	"rolex":         1000.0,
	"gucci":         200.0,
	"louis vuitton": 150.0,
	"iphone":        250.0,
	"samsung":       150.0,
	"apple":         200.0,
	"nike":          50.0,
	"adidas":        50.0,
	"prada":         300.0,
	"chanel":        500.0,
	"hermes":        1000.0,
	"dior":          200.0,
	"versace":       150.0,
	"burberry":      200.0,
	"cartier":       500.0,
	"tiffany":       200.0,
}

// suspiciousPatterns are regex patterns that indicate suspicious listings
var suspiciousPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\d+%\s*(off|discount|cheap)`),
	regexp.MustCompile(`(?i)too\s+good\s+to\s+be\s+true`),
	regexp.MustCompile(`(?i)wholesale\s+price`),
	regexp.MustCompile(`(?i)factory\s+direct`),
	regexp.MustCompile(`(?i)no\s+box\s+no\s+tags`),
	regexp.MustCompile(`(?i)authentic\s+quality\s+replica`),
}

// DetectCounterfeit analyzes a product's details to flag suspicious listings using AI-based heuristics.
func DetectCounterfeit(title, description string, price float64) CounterfeitReport {
	text := strings.ToLower(title + " " + description)
	flags := []string{}
	confidence := 0.0

	// Check for suspicious keywords (weight: 0.3)
	for _, keyword := range suspiciousKeywords {
		if strings.Contains(text, keyword) {
			flags = append(flags, fmt.Sprintf("Contains suspicious keyword: '%s'", keyword))
			confidence += 0.3
			break // Only count once
		}
	}

	// Check for suspicious patterns (weight: 0.25)
	for _, pattern := range suspiciousPatterns {
		if pattern.MatchString(text) {
			flags = append(flags, "Matches suspicious pattern")
			confidence += 0.25
			break
		}
	}

	// Check for unusually low prices for high-value brands (weight: 0.35)
	priceFlagged := false
	for brand, minPrice := range brandMinimumPrices {
		if strings.Contains(text, brand) {
			if price < minPrice {
				priceDiff := (minPrice - price) / minPrice
				flags = append(flags, fmt.Sprintf("Price suspiciously low for %s (%.0f%% below typical minimum)", brand, priceDiff*100))
				confidence += 0.35 * math.Min(priceDiff*2, 1.0) // Scale confidence based on how far below
				priceFlagged = true
				break
			}
		}
	}

	// Check for price-to-description mismatch (weight: 0.1)
	// If description mentions luxury/premium but price is very low
	luxuryKeywords := []string{"luxury", "premium", "designer", "authentic", "genuine", "original"}
	hasLuxuryMention := false
	for _, keyword := range luxuryKeywords {
		if strings.Contains(text, keyword) {
			hasLuxuryMention = true
			break
		}
	}
	if hasLuxuryMention && price < 50 && !priceFlagged {
		flags = append(flags, "Luxury/premium mentioned but price is very low")
		confidence += 0.1
	}

	// Check for excessive use of promotional language (weight: 0.1)
	promoWords := []string{"limited", "exclusive", "rare", "one of a kind", "once in a lifetime"}
	promoCount := 0
	for _, word := range promoWords {
		if strings.Contains(text, word) {
			promoCount++
		}
	}
	if promoCount >= 3 && price < 100 {
		flags = append(flags, "Excessive promotional language with low price")
		confidence += 0.1
	}

	// Cap confidence at 1.0
	confidence = math.Min(confidence, 1.0)

	// Determine if suspicious (threshold: 0.3)
	isSuspicious := confidence >= 0.3
	reason := ""
	if isSuspicious {
		if len(flags) > 0 {
			reason = strings.Join(flags, "; ")
		} else {
			reason = "Multiple suspicious indicators detected"
		}
	}

	return CounterfeitReport{
		IsSuspicious: isSuspicious,
		Reason:       reason,
		Confidence:   math.Round(confidence*100) / 100,
		Flags:        flags,
	}
}
