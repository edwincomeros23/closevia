package services

import (
	"fmt"
	"strings"
)

// CounterfeitReport holds the results of the counterfeit detection.
type CounterfeitReport struct {
	IsSuspicious bool
	Reason       string
}

// suspiciousKeywords is a list of words that may indicate a counterfeit product.
var suspiciousKeywords = []string{
	"replica", "copy", "clone", "fake", "first copy", "inspired by",
}

// brandMinimumPrices maps high-value brands to their typical minimum market price.
var brandMinimumPrices = map[string]float64{
	"rolex":    1000.0,
	"gucci":    200.0,
	"louis vuitton": 150.0,
	"iphone":   250.0,
	"samsung":  150.0,
}

// DetectCounterfeit analyzes a product's details to flag suspicious listings.
func DetectCounterfeit(title, description string, price float64) CounterfeitReport {
	text := strings.ToLower(title + " " + description)

	// Check for suspicious keywords
	for _, keyword := range suspiciousKeywords {
		if strings.Contains(text, keyword) {
			return CounterfeitReport{
				IsSuspicious: true,
				Reason:       fmt.Sprintf("Listing contains the suspicious keyword: '%s'", keyword),
			}
		}
	}

	// Check for unusually low prices for high-value brands
	for brand, minPrice := range brandMinimumPrices {
		if strings.Contains(text, brand) && price < minPrice {
			return CounterfeitReport{
				IsSuspicious: true,
				Reason:       fmt.Sprintf("Price is unusually low for a product mentioning '%s'", brand),
			}
		}
	}

	return CounterfeitReport{IsSuspicious: false}
}
