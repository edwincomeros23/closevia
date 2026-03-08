package services

import "strings"

// violatesProhibition checks if the response contains prohibited items
// This is a CRITICAL safety layer that catches AI models that ignore safety instructions
func violatesProhibition(result *GeminiResponse) bool {
	// If the AI correctly identified it as prohibited, that's fine
	if result.Prohibited {
		return false
	}

	// If no product details are present, it's safe
	if result.Title == "" && result.Description == "" {
		return false
	}

	// List of prohibited keywords that indicate dangerous/illegal items
	prohibitedKeywords := []string{
		// Weapons and firearms
		"handgun", "pistol", "revolver", "rifle", "shotgun", "gun", "firearm",
		"weapon", "ammunition", "ammo", "bullet", "cartridge", "explosive",

		// Bladed weapons
		"knife", "blade", "sword", "machete", "dagger",

		// Other weapons
		"taser", "pepper spray", "stun gun", "baton", "club",

		// Drugs and controlled substances
		"drug", "cocaine", "heroin", "meth", "methamphetamine", "cannabis", "marijuana",
		"fentanyl", "opioid", "lsd", "ecstasy", "mdma",

		// Alcohol (some restrictions apply)
		"alcohol", "beer", "wine", "liquor", "whiskey", "vodka", "gin", "rum",

		// Counterfeit goods (critical for marketplace trust)
		"counterfeit", "fake", "replica", "knock-off", "imitation",

		// Restricted adult content
		"adult", "sexual", "pornography", "xxx",

		// People/faces (privacy risk)
		"person", "face", "head", "portrait",
	}

	// Convert response fields to lowercase for case-insensitive matching
	titleLower := strings.ToLower(result.Title)
	descLower := strings.ToLower(result.Description)
	categoryLower := strings.ToLower(result.Category)
	itemTypeLower := strings.ToLower(result.ItemType)
	tagsLower := strings.ToLower(strings.Join(result.Tags, " "))

	// Check if any prohibited keyword appears in the response
	for _, keyword := range prohibitedKeywords {
		if strings.Contains(titleLower, keyword) ||
			strings.Contains(descLower, keyword) ||
			strings.Contains(categoryLower, keyword) ||
			strings.Contains(itemTypeLower, keyword) ||
			strings.Contains(tagsLower, keyword) {
			return true
		}
	}

	return false
}
