package services

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// FraudDetectionResult represents the fraud detection result
type FraudDetectionResult struct {
	Success          bool                   `json:"success"`
	IsFraud          bool                   `json:"is_fraud"`
	FraudProbability float64                `json:"fraud_probability"`
	RiskLevel        string                 `json:"risk_level"` // "low", "medium", "high"
	Error            string                 `json:"error,omitempty"`
	FeaturesUsed     map[string]interface{} `json:"features_used,omitempty"`
}

// FraudDetectionInput contains the features needed for fraud detection
type FraudDetectionInput struct {
	AccountAgeDays     int     `json:"account_age_days"`
	TotalTrades        int     `json:"total_trades"`
	TradesLast7Days    int     `json:"trades_last_7_days"`
	AvgItemValue       float64 `json:"avg_item_value"`
	ListedItemValue    float64 `json:"listed_item_value"`
	EstimatedItemValue float64 `json:"estimated_item_value"`
	CategoryMatch      int     `json:"category_match"`       // 0 or 1
	ImageIsStockPhoto  int     `json:"image_is_stock_photo"` // 0 or 1
	DescriptionLength  int     `json:"description_length"`
}

// FraudDetectionService handles fraud detection using the trained ML model
type FraudDetectionService struct {
	pythonScriptPath string
	pythonPath       string
}

// NewFraudDetectionService creates a new fraud detection service
func NewFraudDetectionService() *FraudDetectionService {
	// Find the fraud_detector.py script
	scriptPath := filepath.Join(getWorkingDir(), "fraud_detector.py")

	// Try to find Python executable
	pythonPath := findPythonExecutable()

	log.Printf("🔍 Fraud Detection Service initialized")
	log.Printf("   Script: %s", scriptPath)
	log.Printf("   Python: %s", pythonPath)

	return &FraudDetectionService{
		pythonScriptPath: scriptPath,
		pythonPath:       pythonPath,
	}
}

// DetectFraud analyzes the given input data for fraud risk
func (svc *FraudDetectionService) DetectFraud(input FraudDetectionInput) (*FraudDetectionResult, error) {
	result := &FraudDetectionResult{}

	// Check if script exists
	if _, err := os.Stat(svc.pythonScriptPath); err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("Fraud detection script not found: %v", err)
		log.Printf("⚠️  %s", result.Error)
		return result, nil
	}

	// Check if Python is available
	if svc.pythonPath == "" {
		result.Success = false
		result.Error = "Python executable not found on system"
		log.Printf("⚠️  %s", result.Error)
		return result, nil
	}

	// Convert input to JSON
	inputJSON, err := json.Marshal(input)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("Failed to marshal input: %v", err)
		return result, nil
	}

	// Call Python script
	cmd := exec.Command(svc.pythonPath, svc.pythonScriptPath, string(inputJSON))

	// Capture output
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Even if exec fails, try to parse the output as JSON (might contain error details)
		if len(output) > 0 {
			if parseErr := json.Unmarshal(output, result); parseErr == nil && result.Error != "" {
				log.Printf("⚠️  Fraud detection error: %s", result.Error)
				return result, nil
			}
		}
		result.Success = false
		result.Error = fmt.Sprintf("Python execution failed: %v", err)
		return result, nil
	}

	// Parse result
	if err := json.Unmarshal(output, result); err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("Failed to parse fraud detection result: %v", err)
		return result, nil
	}

	// Log the result
	if result.Success {
		emoji := "✅"
		if result.IsFraud {
			emoji = "⚠️ "
		}
		log.Printf("%s [FRAUD] Probability: %.2f%%, Risk: %s", emoji, result.FraudProbability*100, result.RiskLevel)
	}

	return result, nil
}

// findPythonExecutable tries to find the Python executable on the system
func findPythonExecutable() string {
	// Try common Python paths
	pythonPaths := []string{
		"python3",
		"python",
		"python3.11",
		"python3.10",
		"python3.9",
	}

	for _, pythonName := range pythonPaths {
		if path, err := exec.LookPath(pythonName); err == nil {
			return path
		}
	}

	return ""
}

// getWorkingDir returns the current working directory
func getWorkingDir() string {
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}
	return dir
}

// CalculateSellerRiskScore calculates a risk score based on seller behavior
func CalculateSellerRiskScore(accountAgeDays int, totalTrades int, tradesLast7Days int) float64 {
	score := 0.0

	// Very new account (less than 10 days)
	if accountAgeDays < 10 {
		score += 0.3
	} else if accountAgeDays < 30 {
		score += 0.1
	}

	// Too many trades too fast (more than 5 in 7 days)
	if tradesLast7Days > 5 {
		score += 0.2
	}

	// Very low total trades but unusual recent activity
	if totalTrades == 0 && tradesLast7Days > 0 {
		score += 0.2
	}

	return min(score, 1.0) // Cap at 1.0
}

// CalculatePriceRiskScore calculates risk based on price mismatches
func CalculatePriceRiskScore(listedPrice float64, estimatedPrice float64) float64 {
	if estimatedPrice == 0 {
		return 0.0
	}

	mismatchRatio := abs(listedPrice-estimatedPrice) / estimatedPrice

	// More than 50% off is suspicious
	if mismatchRatio > 0.5 {
		return 0.4
	} else if mismatchRatio > 0.3 {
		return 0.2
	}

	return 0.0
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

// LogFraudPrediction logs fraud predictions for future model retraining
func LogFraudPrediction(productID int, sellerID int, prediction *FraudDetectionResult) error {
	logFile := filepath.Join(getWorkingDir(), "fraud_predictions.log")

	entry := map[string]interface{}{
		"timestamp":         time.Now().Format(time.RFC3339),
		"product_id":        productID,
		"seller_id":         sellerID,
		"is_fraud":          prediction.IsFraud,
		"fraud_probability": prediction.FraudProbability,
		"risk_level":        prediction.RiskLevel,
	}

	data, _ := json.MarshalIndent(entry, "", "  ")

	file, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = file.Write(append(data, '\n'))
	return err
}
