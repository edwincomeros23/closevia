# Fraud Detection - Quick Reference

## 1. Installation Checklist

- [ ] Install Python 3.7+
- [ ] Run: `pip install -r fraud_detection_requirements.txt`
- [ ] Verify: `python -c "import pandas, sklearn, joblib; print('OK')"`
- [ ] Check: `models/fraud_model.joblib` exists
- [ ] Run: `python test_fraud_detection.py` (should show all ✅ PASSED)
- [ ] Database: Run migration SQL (adds columns)
- [ ] Handlers: Add fraud detection code (see integration guide)
- [ ] Restart: Go server
- [ ] Monitor: tail -f fraud_predictions.log

## 2. Feature extraction flow

```
Product/Trade Data
    ↓
Seller Stats (from DB) ─┐
    ├─ Account age
    ├─ Trade count  
    ├─ Avg item value
    └─ Recent activity
    ↓
Extract 10 Features ─┐
    ├─ account_age_days
    ├─ total_trades
    ├─ trades_last_7_days
    ├─ avg_item_value
    ├─ listed_item_value
    ├─ estimated_item_value
    ├─ price_mismatch_ratio ← (calculated)
    ├─ category_match
    ├─ image_is_stock_photo
    └─ description_length
    ↓
Send to Python ─ fraud_detector.py
    ├─ Load model
    ├─ Predict
    └─ Return probability
    ↓
Risk Level
    ├─ 🟢 Low < 0.4
    ├─ 🟡 Medium 0.4-0.7
    └─ 🔴 High ≥ 0.7
    ↓
Action
    ├─ Log result
    ├─ Update DB
    └─ Alert if high
```

## 3. Code Integration Template

### In Go Handler:
```go
// Import
import "github.com/xashathebest/clovia/services"

// Create service
fraudService := services.NewFraudDetectionService()

// Get seller stats
sellerStats, err := services.GetSellerStats(h.db, sellerID)

// Extract features
fraudInput := services.ExtractFraudDetectionFeatures(
    h.db,
    &product,      // Product struct
    sellerStats,   // Seller stats
    category,      // Category
    isStockPhoto,  // Boolean
)

// Run detection
result, err := fraudService.DetectFraud(fraudInput)

// Handle result
if result.Success {
    if result.RiskLevel == "high" {
        // Take action: flag, restrict, review, etc
    }
}

// Log for retraining
services.LogFraudPrediction(productID, sellerID, result)
```

## 4. Database Queries

### View flagged products
```sql
SELECT id, title, fraud_probability, fraud_risk_level 
FROM products 
WHERE fraud_probability > 0.7 
ORDER BY fraud_probability DESC;
```

### View statistics
```sql
SELECT 
    fraud_risk_level,
    COUNT(*) as count,
    AVG(fraud_probability) as avg_prob
FROM products
GROUP BY fraud_risk_level;
```

### Get fraud timeline
```sql
SELECT 
    DATE(last_fraud_check_at) as date,
    COUNT(*) as total,
    SUM(IF(fraud_risk_level='high',1,0)) as high_risk
FROM products
GROUP BY DATE(last_fraud_check_at)
ORDER BY date DESC;
```

## 5. Testing Commands

### Verify Python setup
```bash
python --version
python -m pip show pandas numpy scikit-learn joblib
```

### Verify model
```bash
python -c "import joblib; m = joblib.load('models/fraud_model.joblib'); print('✅ Model OK')"
```

### Run full test suite
```bash
python test_fraud_detection.py
```

### Manual test
```bash
python fraud_detector.py '{"account_age_days":365,"total_trades":25,"trades_last_7_days":2,"avg_item_value":3000,"listed_item_value":3000,"estimated_item_value":3000,"category_match":1,"image_is_stock_photo":0,"description_length":150}'
```

### Monitor predictions
```bash
tail -f fraud_predictions.log | jq .
```

## 6. Risk Level Actions

### 🟢 LOW (< 0.40)
- Standard processing
- Normal approval flow
- No special actions

### 🟡 MEDIUM (0.40-0.70)
- Log for monitoring
- Optional: send to review queue
- Collect data for model improvement
- Watch for patterns

### 🔴 HIGH (≥ 0.70)
- Flag for manual review
- Optional: temporarily restrict
- Investigate seller history
- Store detailed audit log
- Consider account suspension criteria

## 7. Common Issues & Fixes

| Problem | Solution |
|---------|----------|
| "Model not found" | Check `models/fraud_model.joblib` exists |
| "Python not found" | Install Python, add to PATH |
| "ImportError: joblib" | `pip install scikit-learn joblib` |
| "Connection timeout" | Model files too large? (usually not) |
| "High false positives" | Increase threshold in code (default 0.7) |
| "Missing features" | Ensure DB queries working correctly |
| "Slow predictions" | Normal takes ~100-500ms, check CPU |

## 8. Files Overview

```
Clovia/
├── fraud_detector.py                         ← Python ML inference
├── fraud_detection_requirements.txt          ← Python deps
├── test_fraud_detection.py                   ← Test suite
├── FRAUD_DETECTION_QUICK_START.md           ← START HERE
├── FRAUD_DETECTION_INTEGRATION.md           ← Integration code
├── FRAUD_DETECTION_SUMMARY.md               ← This overview
├── QUICK_REFERENCE.md                       ← Reference
├── models/
│   └── fraud_model.joblib                   ← Trained model
├── services/
│   ├── fraud_detection_service.go           ← Go wrapper
│   └── fraud_features_extractor.go          ← Feature extraction
├── migrations/
│   └── 2024_03_10_add_fraud_detection.sql  ← DB schema
└── handlers/
    ├── product_handler.go                    ← Add integration here
    └── trade_handler.go                      ← Add integration here
```

## 9. Deployment Checklist

- [ ] Python dependencies installed
- [ ] Model file verified
- [ ] Test suite passes
- [ ] Database migration ran
- [ ] Handler code integrated
- [ ] Server restarted
- [ ] Fraud predictions logging
- [ ] Database columns populated
- [ ] Monitoring setup
- [ ] Team trained on decision criteria

## 10. Performance Notes

- **Prediction time**: 100-500ms per request
- **Model size**: ~500KB
- **Memory usage**: Low (Python subprocess)
- **CPU impact**: Minimal
- **Network**: None (local only)
- **Training**: Can retrain daily if needed

---

See FRAUD_DETECTION_SUMMARY.md for full documentation.
