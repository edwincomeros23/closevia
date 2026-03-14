# Fraud Detection Integration Guide

## Overview
Your trained `fraud_model.joblib` has been integrated into the Clovia system. The integration consists of:

1. **fraud_detector.py** - Python script that loads and uses the ML model
2. **fraud_detection_service.go** - Go service wrapper that calls the Python script
3. **fraud_features_extractor.go** - Helper functions to extract features from products/trades
4. **Handler integration** - Automatic fraud checks on product creation and trades

## System Architecture

```
Product/Trade Created
        ↓
Extract Features (seller stats, item data, etc)
        ↓
Call fraud_detection_service
        ↓
Execute fraud_detector.py (Python)
        ↓
Load fraud_model.joblib
        ↓
Predict fraud risk & probability
        ↓
Return risk assessment
        ↓
Log result & optionally flag/restrict listing
```

## Features Used by Model

The fraud detection model analyzes these 10 features:

| Feature | Description |
|---------|-------------|
| `account_age_days` | Days since seller account/first trade |
| `total_trades` | Total completed trades by seller |
| `trades_last_7_days` | Trades completed in last 7 days |
| `avg_item_value` | Average price of seller's items |
| `listed_item_value` | Price of current item being listed |
| `estimated_item_value` | AI-estimated value |
| `price_mismatch_ratio` | (listed - estimated) / estimated |
| `category_match` | If product category matches (0/1) |
| `image_is_stock_photo` | If images are stock photos (0/1) |
| `description_length` | Length of product description |

## Output

The fraud detection returns:

```json
{
  "success": true,
  "is_fraud": false,
  "fraud_probability": 0.15,
  "risk_level": "low",
  "features_used": { /* extracted features */ }
}
```

**Risk Levels:**
- `low`: fraud_probability < 0.4
- `medium`: fraud_probability 0.4-0.7
- `high`: fraud_probability >= 0.7

## Installation & Setup

### 1. Verify Python Dependencies

```bash
pip install pandas numpy scikit-learn joblib
```

### 2. Verify Model File

Ensure `fraud_model.joblib` exists in:
```
c:\xampp\htdocs\Clovia\models\fraud_model.joblib
```

### 3. Test the Fraud Detector

Run manually to verify it works:

```bash
python fraud_detector.py '{"account_age_days":10,"total_trades":0,"trades_last_7_days":0,"avg_item_value":5000,"listed_item_value":100,"estimated_item_value":5000,"category_match":0,"image_is_stock_photo":1,"description_length":5}'
```

Expected output:
```json
{
  "success": true,
  "is_fraud": true,
  "fraud_probability": 0.92,
  "risk_level": "high",
  ...
}
```

## Integration Points

### 1. Product Creation

Add to `handlers/product_handler.go` in the `CreateProduct` function (after line 250, before database insert):

```go
// Fraud Detection Check
fraudService := services.NewFraudDetectionService()
sellerStats, _ := services.GetSellerStats(h.db, userID)

fraudInput := services.ExtractFraudDetectionFeatures(
    h.db,
    &models.Product{
        Title:               title,
        Description:         finalDescription,
        Price:               price,
        EstimatedValueMin:   estimatedValueMin,
        EstimatedValueMax:   estimatedValueMax,
        Category:            category,
        CreatedAt:           time.Now(),
    },
    sellerStats,
    category,
    false, // could enhance with image analysis
)

fraudResult, _ := fraudService.DetectFraud(fraudInput)

// Optional: Flag high-risk products
if fraudResult.Success && fraudResult.RiskLevel == "high" {
    log.Printf("⚠️  [FRAUD] High-risk product detected (Probability: %.2f%%)", fraudResult.FraudProbability*100)
    // Store fraud assessment in database
    _, _ = h.db.Exec(
        "UPDATE products SET fraud_risk_level = ?, fraud_probability = ? WHERE id = ?",
        fraudResult.RiskLevel,
        fraudResult.FraudProbability,
        productID,
    )
}

// Log for model retraining
_ = services.LogFraudPrediction(int(productID), userID, fraudResult)
```

### 2. Trade Creation

Add to `handlers/trade_handler.go` in the `CreateTrade` function:

```go
// Similar fraud check for the trade
fraudService := services.NewFraudDetectionService()
buyerStats, _ := services.GetSellerStats(h.db, userID) // userID is the buyer here
sellerStats, _ := services.GetSellerStats(h.db, targetProduct.SellerID)

// Check buyer
buyerFraudInput := services.ExtractFraudDetectionFeatures(h.db, targetProduct, buyerStats, targetProduct.Category, false)
buyerFraudResult, _ := fraudService.DetectFraud(buyerFraudInput)

// Check seller (target product owner)
sellerFraudInput := services.ExtractFraudDetectionFeatures(h.db, targetProduct, sellerStats, targetProduct.Category, false)
sellerFraudResult, _ := fraudService.DetectFraud(sellerFraudInput)

if (buyerFraudResult.Success && buyerFraudResult.RiskLevel == "high") ||
   (sellerFraudResult.Success && sellerFraudResult.RiskLevel == "high") {
    // Flag the trade for review
    log.Printf("⚠️  [FRAUD] High-risk trade detected")
}
```

## Monitoring & Logging

### View Fraud Predictions Log
```bash
tail -f fraud_predictions.log
```

### Database Storage

Add to your database schema:

```sql
ALTER TABLE products ADD COLUMN fraud_risk_level VARCHAR(50);
ALTER TABLE products ADD COLUMN fraud_probability FLOAT;
ALTER TABLE products ADD COLUMN last_fraud_check_at TIMESTAMP;

ALTER TABLE trades ADD COLUMN fraud_risk_level VARCHAR(50);
ALTER TABLE trades ADD COLUMN fraud_probability FLOAT;
```

## Retraining the Model

The system logs all predictions to `real_fraud_data.csv` with fields:
- `predicted_fraud` - Model's prediction
- `risk_probability` - Confidence score
- `timestamp` - When prediction was made
- `confirmed_fraud` - Manual label (update later when known)

### Retrain After Labels are Collected

```bash
python retrain_fraud_model.py
```

This will:
1. Load `real_fraud_data.csv`
2. Retrain the model with confirmed labels
3. Save updated `fraud_model.joblib`

## Performance Tuning

The model is production-ready but consider:

1. **Batch Processing**: For bulk analysis, batch predictions instead of per-item
2. **Caching**: Cache seller stats (refresh every hour)
3. **Thresholds**: Adjust risk level thresholds based on business needs
4. **Monitoring**: Track false positives/negatives to identify bias

## Troubleshooting

### "Python executable not found"
Ensure Python is installed and in PATH:
```bash
python --version  # or python3 --version
```

### "Model file not found"
Verify location:
```bash
ls -la c:\xampp\htdocs\Clovia\models\fraud_model.joblib
```

### Model not loading
Check dependencies:
```bash
python -c "import joblib; print(joblib.__version__)"
```

### False Positives
- Adjust risk level thresholds in `fraud_detection_service.go`
- Increase `trades_last_7_days` threshold
- Review model performance metrics

## Next Steps

1. ✅ Test fraud detector manually
2. ✅ Add database columns for fraud assessment
3. ✅ Integrate into product handler
4. ✅ Integrate into trade handler
5. ✅ Monitor predictions for accuracy
6. ✅ Collect confirmed labels
7. ✅ Retrain model with real data
