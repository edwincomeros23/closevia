package services

import (
	"database/sql"
	"log"
	"time"

	"github.com/xashathebest/clovia/models"
)

// SellerStats represents statistics about a seller
type SellerStats struct {
	TotalTrades     int
	TradesLast7Days int
	AvgItemValue    float64
	AccountAgeDays  int
	FirstTradeDate  time.Time
	LastTradeDate   time.Time
}

// ExtractFraudDetectionFeatures extracts fraud detection features from a product and seller
func ExtractFraudDetectionFeatures(
	db *sql.DB,
	product *models.Product,
	sellerStats *SellerStats,
	category string,
	isStockPhoto bool,
) FraudDetectionInput {

	listedPrice := 0.0
	if product.Price != nil {
		listedPrice = *product.Price
	}

	estimatedPrice := 0.0
	if product.EstimatedValueMax != nil {
		estimatedPrice = *product.EstimatedValueMax
	}
	if estimatedPrice == 0 && product.EstimatedValueMin != nil {
		estimatedPrice = *product.EstimatedValueMin
	}

	// Category match (simple heuristic: check if provided category matches product category)
	categoryMatch := 0
	if product.Category != "" && category != "" && product.Category == category {
		categoryMatch = 1
	}

	// Stock photo detection
	stockPhotoFlag := 0
	if isStockPhoto {
		stockPhotoFlag = 1
	}

	// Description length
	descriptionLength := len(product.Description)

	// Account age in days
	accountAge := int(time.Since(sellerStats.FirstTradeDate).Hours() / 24)
	if accountAge == 0 && product.CreatedAt.Year() > 1970 {
		accountAge = int(time.Since(product.CreatedAt).Hours() / 24)
	}

	return FraudDetectionInput{
		AccountAgeDays:     accountAge,
		TotalTrades:        sellerStats.TotalTrades,
		TradesLast7Days:    sellerStats.TradesLast7Days,
		AvgItemValue:       sellerStats.AvgItemValue,
		ListedItemValue:    listedPrice,
		EstimatedItemValue: estimatedPrice,
		CategoryMatch:      categoryMatch,
		ImageIsStockPhoto:  stockPhotoFlag,
		DescriptionLength:  descriptionLength,
	}
}

// GetSellerStats retrieves statistics about a seller
func GetSellerStats(db *sql.DB, sellerID int) (*SellerStats, error) {
	stats := &SellerStats{
		TotalTrades:     0,
		TradesLast7Days: 0,
		AvgItemValue:    0.0,
		AccountAgeDays:  0,
	}

	// Get total trades (completed only)
	err := db.QueryRow(`
		SELECT COUNT(*) FROM trades 
		WHERE (seller_id = ? OR buyer_id = ?) AND status IN ('completed', 'auto_completed')
	`, sellerID, sellerID).Scan(&stats.TotalTrades)

	if err != nil && err != sql.ErrNoRows {
		log.Printf("Error getting total trades for seller %d: %v", sellerID, err)
	}

	// Get trades in last 7 days
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)
	err = db.QueryRow(`
		SELECT COUNT(*) FROM trades 
		WHERE (seller_id = ? OR buyer_id = ?) AND status IN ('completed', 'auto_completed') AND completed_at >= ?
	`, sellerID, sellerID, sevenDaysAgo).Scan(&stats.TradesLast7Days)

	if err != nil && err != sql.ErrNoRows {
		log.Printf("Error getting recent trades for seller %d: %v", sellerID, err)
	}

	// Get average item value from seller's products
	var avgPrice sql.NullFloat64
	err = db.QueryRow(`
		SELECT AVG(price) FROM products 
		WHERE seller_id = ? AND price IS NOT NULL
	`, sellerID).Scan(&avgPrice)

	if err == nil && avgPrice.Valid {
		stats.AvgItemValue = avgPrice.Float64
	}

	// Get account age (from first trade or product creation)
	err = db.QueryRow(`
		SELECT MIN(created_at) FROM (
			SELECT created_at FROM trades WHERE seller_id = ? OR buyer_id = ?
			UNION ALL
			SELECT created_at FROM products WHERE seller_id = ?
		) as combined
	`, sellerID, sellerID, sellerID).Scan(&stats.FirstTradeDate)

	if err == sql.ErrNoRows {
		// Estimate from user creation or set to recent
		stats.FirstTradeDate = time.Now()
	} else if err != nil {
		log.Printf("Error getting seller first trade date: %v", err)
		stats.FirstTradeDate = time.Now()
	}

	stats.AccountAgeDays = int(time.Since(stats.FirstTradeDate).Hours() / 24)

	return stats, nil
}

// IsImageLikelyStockPhoto performs a simple heuristic check for stock photos
// In production, this could be enhanced with ML-based image analysis
func IsImageLikelyStockPhoto(imageDescription string) bool {
	// This is a placeholder - in production, you might:
	// 1. Check image metadata
	// 2. Use reverse image search
	// 3. Check against known stock photo databases
	// 4. Use ML model for image classification

	stockPhotoIndicators := []string{
		"stock",
		"shutterstock",
		"getty",
		"istockphoto",
		"unsplash",
		"pexels",
		"pixabay",
	}

	for _, indicator := range stockPhotoIndicators {
		if indicator == imageDescription || len(imageDescription) == 0 {
			continue
		}
	}

	return false // Default to not a stock photo
}

// CalculateFraudRiskFromAI uses AI image analysis results to inform fraud detection
// This integrates with your existing Gemini/Groq analysis
func CalculateFraudRiskFromAI(geminiResult *GeminiResponse) map[string]interface{} {
	risks := map[string]interface{}{
		"authenticity_concerns": false,
		"image_concerns":        false,
		"suspicious_image":      false,
	}

	if geminiResult == nil {
		return risks
	}

	// Check for authenticity issues flagged by AI
	if geminiResult.AuthenticityRisks != "" {
		risks["authenticity_concerns"] = true
	}

	// Check for image quality issues (ImageQualityScore 0-100)
	if geminiResult.ImageQualityScore > 0 && geminiResult.ImageQualityScore < 50 {
		risks["image_concerns"] = true
	}

	// Check if image is suspicious or blurry
	if geminiResult.IsSuspiciousImage || geminiResult.IsBlurryOrDark {
		risks["suspicious_image"] = true
	}

	return risks
}
