package services

import (
	"database/sql"
	"time"
)

// ProfileAnalysisResult represents the analysis of a user profile
type ProfileAnalysisResult struct {
	IsOutdated      bool      `json:"is_outdated"`
	IsInactive      bool      `json:"is_inactive"`
	LastActivityAt  *time.Time `json:"last_activity_at,omitempty"`
	ProfileAge      int        `json:"profile_age_days"`
	Recommendations []string   `json:"recommendations"`
	Score           float64    `json:"score"` // 0.0 to 1.0, higher is better
}

// AnalyzeProfile analyzes a user's profile to determine if it's outdated or inactive
func AnalyzeProfile(db *sql.DB, userID int) (ProfileAnalysisResult, error) {
	result := ProfileAnalysisResult{
		Recommendations: []string{},
		Score:           1.0,
	}

	// Get user's last activity (last product created, last trade, last message)
	var lastProductCreated, lastTradeCreated, lastMessageSent sql.NullTime
	var profileCreatedAt time.Time
	var bio sql.NullString
	var hasLocation bool

	// Get user profile info
	err := db.QueryRow(`
		SELECT 
			u.created_at,
			u.bio,
			CASE WHEN u.latitude IS NOT NULL AND u.longitude IS NOT NULL THEN 1 ELSE 0 END as has_location,
			(SELECT MAX(updated_at) FROM products WHERE seller_id = u.id) as last_product,
			(SELECT MAX(created_at) FROM trades WHERE buyer_id = u.id OR seller_id = u.id) as last_trade,
			(SELECT MAX(created_at) FROM messages WHERE sender_id = u.id) as last_message
		FROM users u
		WHERE u.id = ?
	`, userID).Scan(
		&profileCreatedAt,
		&bio,
		&hasLocation,
		&lastProductCreated,
		&lastTradeCreated,
		&lastMessageSent,
	)
	if err != nil {
		return result, err
	}

	// Determine last activity
	var lastActivity *time.Time
	activities := []*time.Time{
		&lastProductCreated.Time,
		&lastTradeCreated.Time,
		&lastMessageSent.Time,
	}

	for _, activity := range activities {
		if activity != nil && !activity.IsZero() {
			if lastActivity == nil || activity.After(*lastActivity) {
				lastActivity = activity
			}
		}
	}

	result.LastActivityAt = lastActivity

	// Calculate profile age
	profileAge := int(time.Since(profileCreatedAt).Hours() / 24)
	result.ProfileAge = profileAge

	// Check if profile is outdated (no activity in 90+ days)
	if lastActivity != nil {
		daysSinceActivity := int(time.Since(*lastActivity).Hours() / 24)
		if daysSinceActivity >= 90 {
			result.IsOutdated = true
			result.Score -= 0.3
			result.Recommendations = append(result.Recommendations, "Your profile hasn't been active in over 90 days. Consider updating it or listing new items.")
		} else if daysSinceActivity >= 60 {
			result.Score -= 0.15
			result.Recommendations = append(result.Recommendations, "Your profile activity is decreasing. Stay active to maintain visibility.")
		}
	} else {
		// No activity at all
		if profileAge >= 30 {
			result.IsInactive = true
			result.Score -= 0.5
			result.Recommendations = append(result.Recommendations, "Your profile has no activity. Start by listing your first item or browsing products.")
		}
	}

	// Check if profile is incomplete
	if !bio.Valid || bio.String == "" {
		result.Score -= 0.1
		result.Recommendations = append(result.Recommendations, "Add a bio to your profile to help others learn about you.")
	}

	if !hasLocation {
		result.Score -= 0.1
		result.Recommendations = append(result.Recommendations, "Add your location to help buyers and sellers find you nearby.")
	}

	// Ensure score doesn't go below 0
	if result.Score < 0 {
		result.Score = 0
	}

	return result, nil
}

// AnalyzeAllProfiles analyzes all user profiles and returns a summary
func AnalyzeAllProfiles(db *sql.DB) (map[string]int, error) {
	summary := map[string]int{
		"total":           0,
		"outdated":        0,
		"inactive":        0,
		"needs_attention": 0,
	}

	rows, err := db.Query("SELECT id FROM users WHERE role = 'user'")
	if err != nil {
		return summary, err
	}
	defer rows.Close()

	for rows.Next() {
		var userID int
		if err := rows.Scan(&userID); err != nil {
			continue
		}

		summary["total"]++
		analysis, err := AnalyzeProfile(db, userID)
		if err != nil {
			continue
		}

		if analysis.IsOutdated {
			summary["outdated"]++
		}
		if analysis.IsInactive {
			summary["inactive"]++
		}
		if analysis.Score < 0.5 {
			summary["needs_attention"]++
		}
	}

	return summary, nil
}

