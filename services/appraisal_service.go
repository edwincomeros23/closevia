package services

import (
	"strings"
)

// AppraisalResult holds the suggested category and condition.
type AppraisalResult struct {
	Category  string
	Condition string
}

// categoryKeywords maps keywords to product categories.
var categoryKeywords = map[string]string{
	"phone":     "Electronics",
	"iphone":    "Electronics",
	"samsung":   "Electronics",
	"macbook":   "Electronics",
	"laptop":    "Electronics",
	"camera":    "Electronics",
	"shirt":     "Apparel",
	"jeans":     "Apparel",
	"dress":     "Apparel",
	"shoes":     "Apparel",
	"book":      "Books",
	"novel":     "Books",
	"furniture": "Home Goods",
	"chair":     "Home Goods",
	"table":     "Home Goods",
}

// conditionKeywords maps keywords to product conditions.
var conditionKeywords = map[string]string{
	"brand new": "New",
	"sealed":    "New",
	"unopened":  "New",
	"like new":  "Like-New",
	"excellent": "Like-New",
	"gently used": "Used",
	"used":      "Used",
	"fair":      "Fair",
	"scratches": "Fair",
}

// AppraiseProduct analyzes a product's title and description to suggest a category and condition.
func AppraiseProduct(title, description string) AppraisalResult {
	result := AppraisalResult{
		Category:  "General", // Default category
		Condition: "Used",    // Default condition
	}

	text := strings.ToLower(title + " " + description)

	// Appraise Category
	for keyword, category := range categoryKeywords {
		if strings.Contains(text, keyword) {
			result.Category = category
			break // First match wins
		}
	}

	// Appraise Condition
	for keyword, condition := range conditionKeywords {
		if strings.Contains(text, keyword) {
			result.Condition = condition
			break // First match wins
		}
	}

	return result
}