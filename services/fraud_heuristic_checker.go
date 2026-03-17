package services

import (
	"strings"
	"unicode"
)

// FraudHeuristicCheck performs quick heuristic checks for obvious fraud patterns
// Returns: (isFraud bool, reason string)
func FraudHeuristicCheck(title, description, wants string, price float64, estimatedValueMin float64, wantedCategories string) (bool, string) {
	// Normalize inputs
	title = strings.TrimSpace(title)
	description = strings.TrimSpace(description)
	wants = strings.TrimSpace(wants)

	// Check 1: Detect prohibited items (animals, weapons, drugs) - HEURISTIC ONLY
	// Note: This is a FAST text pattern check. Visual detection of animals happens in Gemini.
	// Only include keywords that clearly indicate the item itself is a prohibited animal/pet.
	// Don't include generic words like "animal" which could appear in legitimate product descriptions.
	prohibitedKeywords := []string{
		// Animals - ONLY specific pet/animal names that indicate selling an actual animal
		"dog", "puppy", "cat", "kitten", "pet dog", "pet cat", "for sale dog", "for sale cat",
		// Weapons
		"gun", "firearm", "pistol", "revolver", "rifle", "shotgun", "ammunition", "bomb", "explosive",
		// Drugs
		"cocaine", "cannabis", "marijuana", "heroin", "fentanyl",
	}

	lowerTitle := strings.ToLower(title)
	lowerDesc := strings.ToLower(description)
	lowerWants := strings.ToLower(wants)

	for _, keyword := range prohibitedKeywords {
		if strings.Contains(lowerTitle, keyword) ||
			strings.Contains(lowerDesc, keyword) ||
			strings.Contains(lowerWants, keyword) {
			// Categorize the violation based on keyword
			if strings.Contains(keyword, "dog") || strings.Contains(keyword, "cat") || strings.Contains(keyword, "puppy") || strings.Contains(keyword, "kitten") {
				return true, "Live animals and pets cannot be sold on this platform"
			}
			if strings.Contains(keyword, "gun") || strings.Contains(keyword, "firearm") || strings.Contains(keyword, "pistol") || strings.Contains(keyword, "rifle") || strings.Contains(keyword, "ammunition") {
				return true, "Firearms and weapons cannot be listed on this platform"
			}
			if strings.Contains(keyword, "cocaine") || strings.Contains(keyword, "cannabis") || strings.Contains(keyword, "marijuana") || strings.Contains(keyword, "heroin") || strings.Contains(keyword, "fentanyl") {
				return true, "Drugs and controlled substances cannot be listed on this platform"
			}
			// Fallback for any other match
			return true, "Product contains prohibited items and cannot be listed"
		}
	}

	// Check 2: Detect repeated gibberish patterns (catches "dOGSCAMdOGSCAMdOGSCAM")
	if HasRepeatedPatterns(title, 6) || HasRepeatedPatterns(description, 8) || HasRepeatedPatterns(wants, 8) {
		return true, "Product appears to contain repeated nonsense patterns and cannot be listed"
	}

	// Check 2: Extreme gibberish detection on title (most likely to catch obvious spam)
	gibberishTitle := CalculateGibberishScore(title)
	if len(title) > 8 && gibberishTitle > 0.6 { // Lower threshold to catch more gibberish
		return true, "Product title appears to be gibberish or contains invalid characters"
	}

	// Check 3: Extreme gibberish detection on description
	gibberishScore := CalculateGibberishScore(description)
	if len(description) > 15 && gibberishScore > 0.7 {
		return true, "Product description appears to be gibberish or contains invalid characters"
	}

	// Check 4: Contains scam keywords
	scamKeywords := []string{"scam", "fake", "stolen", "illegal", "counterfeit", "replica"}
	for _, keyword := range scamKeywords {
		lowerTitle := strings.ToLower(title)
		lowerDesc := strings.ToLower(description)
		lowerWants := strings.ToLower(wants)
		if strings.Contains(lowerTitle, keyword) ||
			strings.Contains(lowerDesc, keyword) ||
			strings.Contains(lowerWants, keyword) {
			return true, "Product listing contains prohibited keywords and cannot be listed"
		}
	}

	// Check 5: Zero or negative price (AFTER gibberish checks to prioritize obvious fraud)
	if price <= 0 && len(description) > 0 && len(title) > 0 {
		if !IsLegitimateBarterListing(title, description, wants, wantedCategories) && estimatedValueMin <= 0 {
			return true, "Invalid pricing: Items must have a positive price or be clearly barter items"
		}
	}

	// Check 6: Title is empty or too short
	if len(title) < 3 && (len(description) < 10 || price > 0) {
		return true, "Product title is too short or incomplete"
	}

	// Check 7: Description way too short for a listing
	if len(description) < 5 && len(title) > 0 && price > 0 {
		return true, "Product description is too short or incomplete"
	}

	// Check 8: All main fields are gibberish/nonsense (redundant but catches extreme cases)
	if len(title) > 0 && len(description) > 0 {
		if CalculateGibberishScore(title) > 0.7 &&
			CalculateGibberishScore(description) > 0.7 {
			return true, "Product listing appears to contain invalid or nonsensical text"
		}
	}

	return false, ""
}

// HasRepeatedPatterns detects if a string contains the same pattern repeated many times
// It's smarter than exact matching - it finds overlapping/near-repeating patterns
func HasRepeatedPatterns(text string, minRepeats int) bool {
	if len(text) < 5 {
		return false
	}

	text = strings.ToLower(text)

	// Try different pattern lengths (3 to 8 chars)
	for patternLen := 3; patternLen <= 8; patternLen++ {
		if patternLen > len(text)/2 {
			continue
		}

		// Try each position as a starting pattern
		for start := 0; start < patternLen && start < len(text); start++ {
			if start+patternLen > len(text) {
				continue
			}

			pattern := text[start : start+patternLen]

			// Count how many times this exact pattern appears in the text
			count := 0
			for i := 0; i <= len(text)-patternLen; i++ {
				if text[i:i+patternLen] == pattern {
					count++
				}
			}

			if count >= minRepeats {
				// Found pattern repeated many times
				return true
			}
		}
	}

	return false
}

// CalculateGibberishScore returns a score 0.0-1.0 indicating how much gibberish the text is
// High score = more gibberish
// Gibberish indicators:
// - Unusual consonant clusters
// - Lack of common words
// - Random case changes
// - Few vowels
func CalculateGibberishScore(text string) float64 {
	if len(text) < 5 {
		return 0.0
	}

	text = strings.TrimSpace(text)
	if len(text) == 0 {
		return 1.0
	}

	score := 0.0

	// Check 1: Unusual character patterns
	vowels := 0
	consonants := 0
	numbers := 0
	spaces := 0
	specialChars := 0

	for _, ch := range text {
		if isVowel(ch) {
			vowels++
		} else if unicode.IsLetter(ch) {
			consonants++
		} else if unicode.IsDigit(ch) {
			numbers++
		} else if unicode.IsSpace(ch) {
			spaces++
		} else {
			specialChars++
		}
	}

	totalChars := vowels + consonants + numbers + spaces + specialChars

	// Too few vowels = gibberish (good text has ~40% vowels)
	vowelRatio := float64(vowels) / float64(totalChars)
	if vowelRatio < 0.2 {
		score += 0.3
	}

	// Too many special characters or numbers = suspicious
	specialRatio := float64(specialChars+numbers) / float64(totalChars)
	if specialRatio > 0.3 {
		score += 0.2
	}

	// Random case changes (like "dOGsCAm") = suspicious
	hasRandomCase := false
	for i := 0; i < len(text)-1; i++ {
		if unicode.IsLetter(rune(text[i])) && unicode.IsLetter(rune(text[i+1])) {
			isLower1 := unicode.IsLower(rune(text[i]))
			isLower2 := unicode.IsLower(rune(text[i+1]))
			if isLower1 != isLower2 {
				hasRandomCase = true
				break
			}
		}
	}
	if hasRandomCase {
		score += 0.2
	}

	// No spaces in long text = gibberish (e.g., "abcdefghijklmnop")
	if len(text) > 15 && spaces == 0 {
		score += 0.2
	}

	// Cap at 1.0
	if score > 1.0 {
		score = 1.0
	}

	return score
}

// isVowel checks if a character is a vowel
func isVowel(ch rune) bool {
	return strings.ContainsRune("aeiouAEIOU", ch)
}

// IsLegitimateBarterListing checks if this is a valid barter-only listing (no price needed)
func IsLegitimateBarterListing(title, description, wants string, wantedCategories string) bool {
	// Barter listings should have clear indication of what they want
	// Either specific text or categories
	lowerWants := strings.ToLower(wants)

	// Treat short but clear inputs like "other", "anything", "open to trade" as valid
	if (len(wants) >= 3 && !strings.Contains(lowerWants, "scam")) ||
		(len(wantedCategories) > 0 && wantedCategories != "[]" && wantedCategories != "\"\"") {
		return true
	}
	return false
}
