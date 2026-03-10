# Quick Start Guide - Fraud Detection System

## Step 1: Install Python Dependencies

```bash
pip install -r fraud_detection_requirements.txt
```

Or individually:
```bash
pip install pandas numpy scikit-learn joblib
```

## Step 2: Verify the Model File

Check that the trained model exists:
```bash
ls -la models/fraud_model.joblib
```

Expected output:
```
-rw-r--r-- 1 user group 123456 Mar 10 12:34 models/fraud_model.joblib
```

## Step 3: Run the Test Suite

Test the fraud detection system:

```bash
python test_fraud_detection.py
```

Expected output:
```
============================================================
FRAUD DETECTION SYSTEM - TEST SUITE
============================================================
✅ Python found: Python 3.10.x

📦 Checking dependencies...
   ✅ pandas
   ✅ numpy
   ✅ sklearn
   ✅ joblib

🤖 Checking model file...
   ✅ Model found at c:\xampp\htdocs\Clovia\models\fraud_model.joblib

🧪 Running test cases...
============================================================
TEST: Legitimate Seller - Normal Item
============================================================
...
✅ Test PASSED!

============================================================
TEST: Suspicious - Very New Account
============================================================
...
✅ Test PASSED!

...

============================================================
TEST SUMMARY
============================================================
✅ Passed: 4/4
❌ Failed: 0/4

🎉 All tests passed! Fraud detection system is ready to use.
```

## Step 4: Test Manually (Optional)

Test the fraud detector directly with JSON input:

```bash
python fraud_detector.py '{"account_age_days":365,"total_trades":25,"trades_last_7_days":2,"avg_item_value":3000,"listed_item_value":3000,"estimated_item_value":3000,"category_match":1,"image_is_stock_photo":0,"description_length":150}'
```

Expected output:
```json
{
  "success": true,
  "is_fraud": false,
  "fraud_probability": 0.12,
  "risk_level": "low",
  "features_used": { ... }
}
```

## Step 5: Add Database Columns

Run the migration to add fraud detection columns:

```bash
mysql -u root -p clovia < migrations/2024_03_10_add_fraud_detection.sql
```

## Step 6: Integrate into Handlers

### For Product Creation
Edit `handlers/product_handler.go` and add fraud detection after line 180 (after counterfeit detection). See FRAUD_DETECTION_INTEGRATION.md for exact code.

### For Trade Creation  
Edit `handlers/trade_handler.go` and add fraud detection after line 60. See FRAUD_DETECTION_INTEGRATION.md for exact code.

## Step 7: Restart Your Server

```bash
# Stop the current server
# Then restart it

go run main.go
```

## Step 8: Monitor Fraud Detections

Watch the logs for fraud detection:

```bash
tail -f fraud_predictions.log
```

Or query the database:

```sql
SELECT * FROM flagged_products_view ORDER BY fraud_probability DESC LIMIT 10;
```

## Troubleshooting

### Error: "Python executable not found"
- Verify Python is installed: `python --version` or `python3 --version`
- Add Python to PATH if needed on Windows

### Error: "Model file not found"  
- Ensure `fraud_model.joblib` exists in `models/` folder
- Check file permissions

### Error: "Module not found" (pandas, numpy, sklearn)
```bash
pip install --upgrade pandas numpy scikit-learn joblib
```

### Model Not Predicting
- Run `test_fraud_detection.py` to validate the model
- Check `fraud_detector.py` is in the project root
- Verify model file is not corrupted

### False Positives
- Adjust fraud probability thresholds in `services/fraud_detection_service.go`
- Increase `trades_last_7_days` threshold requirement
- Collect confirmed fraud labels to retrain model

## Next Steps

1. ✅ System is now ready for production use
2. Monitor fraud predictions daily
3. Collect confirmed fraud cases (when fraud is confirmed by manual review)
4. After collecting 100+ confirmed cases, retrain the model
5. Update `fraud_model.joblib` with improved version

## Features Monitored

The fraud detection model analyzes:

- **Seller Behavior**: Account age, trade history, recent activity
- **Pricing**: Price mismatches between listed and estimated value
- **Content Quality**: Description length, image quality
- **Category Matching**: Whether category is appropriate for item
- **Red Flags**: Stock photos, very new accounts, unusual activity patterns

## Risk Levels

- **🟢 Low Risk** (probability < 0.4): Normal listing, minimal concerns
- **🟡 Medium Risk** (probability 0.4-0.7): Some suspicious indicators, monitor
- **🔴 High Risk** (probability ≥ 0.7): Strong fraud indicators, review/restrict

## Support

For issues or questions:
1. Check FRAUD_DETECTION_INTEGRATION.md for detailed documentation
2. Review fraud_detector.py code comments
3. Check fraud_detection_service.go for Go implementation details
4. Review test cases in test_fraud_detection.py for examples
