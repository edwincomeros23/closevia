# AI Product Analysis - Testing Guide

## Quick API Test

### Option 1: Using cURL (Command Line)

```bash
# 1. Get authentication token first (from your login)
TOKEN="your_jwt_token_here"

# 2. Test the analysis endpoint
curl -X POST http://localhost:3000/api/ai/analyze-product \
  -H "Authorization: Bearer $TOKEN" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.jpg"
```

### Option 2: Using Postman

**Setup**:
1. Method: `POST`
2. URL: `http://localhost:3000/api/ai/analyze-product`
3. Headers tab:
   - Authorization: `Bearer {your_jwt_token}`
4. Body tab:
   - Select form-data
   - Key: `images` (Type: File)
   - Upload 1-3 image files

**Expected Response** (Success):
```json
{
  "success": true,
  "message": "Product analysis completed successfully",
  "provider": "gemini",
  "retried": false,
  "time_ms": 1250,
  "data": {
    "title": "Nike Air Force 1 White Sneakers Size 10",
    "description": "Classic white leather Nike Air Force 1...",
    "condition": "Good",
    "category": "Fashion",
    "tags": ["sneakers", "nike", "white"],
    "estimated_value_min": 45,
    "estimated_value_max": 65,
    "authenticity_risks": [],
    "quality_warning": null,
    "person_warning": null
  }
}
```

### Option 3: Using Frontend (Recommended)

1. Navigate to: http://localhost:5173/add-product
2. Click "Upload Images"
3. Select 2-3 product images
4. Wait for toast: "✨ AI Analysis Complete"
5. See Step 2 form pre-filled with AI suggestions
6. Edit as needed and submit

---

## Test Scenarios

### Scenario A: Analyze Sample Product

**Setup**:
1. Find a clear product photo (shoes, electronics, clothes, etc.)
2. Resize to ~2-3 MB if needed
3. Ensure clear, well-lit product

**Steps**:
1. Go to http://localhost:5173/add-product
2. Upload the image
3. Wait for analysis (1-2 seconds)

**Expected**:
- ✅ Form auto-fills with AI suggestions
- ✅ Toast shows: "✨ Gemini Analysis (1250ms)"
- ✅ Provider badge shows "gemini"
- ✅ Time indicator shows milliseconds
- ✅ All fields (title, description, category, condition) populated
- ✅ User can edit any field

**Log Expected** (Backend):
```
📸 [AI Analysis] Analyzing 1 product image(s)...
🤖 [AI] Attempting Gemini analysis (primary)...
✅ [AI Analysis] Complete (gemini in 1250ms)
```

---

### Scenario B: Multiple Images

**Setup**:
1. Gather 3 product images (different angles)
2. All clear, good lighting

**Steps**:
1. Go to http://localhost:5173/add-product
2. Upload all 3 images
3. Observe analysis time

**Expected**:
- ✅ Analysis completes in ~1.5-2 seconds (longer than 1 image)
- ✅ AI uses best quality image for analysis
- ✅ Form fields still auto-filled accurately

---

### Scenario C: Fallback Trigger (Requires Gemini Rate Limit)

**Setup**:
1. Have Gemini API key but quota exhausted
   - Easy way: Run many tests quickly to hit limit
2. Have Groq API key with available quota

**Steps**:
1. Trigger enough requests to exceed Gemini quota
2. Upload product images
3. System should automatically fall back

**Expected**:
- ✅ First attempt with Gemini fails with 429/quota error
- ✅ System automatically retries with Groq
- ✅ Analysis succeeds via Groq
- ✅ Toast shows: "✨ Groq Analysis (2100ms) - Used backup AI"
- ✅ Orange "Backup AI" badge visible
- ✅ Form still pre-filled correctly
- ✅ Total time ~2-3 seconds

**Log Expected** (Backend):
```
📸 [AI Analysis] Analyzing 2 product image(s)...
🤖 [AI] Attempting Gemini analysis (primary)...
🔄 [AI] Falling back to Groq (backup)...
✅ [AI Analysis] Complete (groq in 2100ms)
```

---

### Scenario D: Prohibited Item

**Setup**:
1. Find image of prohibited item (weapon simulation, etc.)
   - Or upload image with people in it

**Steps**:
1. Upload image
2. Wait for analysis

**Expected**:
- ✅ Analysis detects prohibited content
- ✅ Returns 400 status with "prohibited": true
- ✅ Frontend shows error toast
- ✅ Form does NOT submit
- ✅ Message: "This item cannot be listed"

**Log Expected** (Backend):
```
📸 [AI Analysis] Analyzing 1 product image(s)...
✅ [AI Analysis] Complete (gemini in 450ms)
❌ [AI Analysis] Failed: This item cannot be listed
```

---

### Scenario E: Authenticity Risk

**Setup**:
1. Image of potentially counterfeit designer item
   - Or clearly low-quality knockoff

**Steps**:
1. Upload image(s)
2. Wait for analysis

**Expected**:
- ✅ Analysis completes successfully (not blocked)
- ✅ authenticity_risks field populated
- ✅ Warning appears in AI info box: "⚠️ Note: May be counterfeit"
- ✅ User can still proceed (warned but not blocked)
- ✅ Form fields populated with AI suggestions

**Example Display**:
```
┌──────────────────────────────────┐
│ ✨ Gemini Analysis      1200ms    │
│ ⚠️ Note: May be counterfeit      │
└──────────────────────────────────┘
```

---

## Frontend Testing Checklist

- [ ] Navigate to Add Product page
- [ ] Click "Upload Images"
- [ ] Select 1 image → Analyze → Verify form pre-fills
- [ ] Go back, select 3 images → Analyze → Verify all fields populate
- [ ] Edit pre-filled title → Verify can override
- [ ] Edit pre-filled category → Verify can override
- [ ] Edit pre-filled description → Verify can override
- [ ] Verify AI provider badge shows correct provider
- [ ] Verify timing display (shows milliseconds)
- [ ] Verify "Backup AI" badge shows when fallback used
- [ ] Verify toast notification appears
- [ ] Proceed to Step 3 with AI suggestions verified
- [ ] Submit product and verify data saved correctly

---

## Backend Testing Checklist

- [ ] Backend compiles: `go build -o clovia.exe .`
- [ ] No errors on startup
- [ ] POST endpoint `/api/ai/analyze-product` registered
- [ ] Requires authentication (401 if no token)
- [ ] Validates image provided (400 if missing)
- [ ] Calls Gemini API successfully
- [ ] Returns correct response structure
- [ ] Handles Gemini errors gracefully
- [ ] Falls back to Groq on rate limit
- [ ] Detects and logs fallback trigger
- [ ] Returns "retried": true when fallback used
- [ ] Includes accurate timing (time_ms)
- [ ] Identifies prohibited items
- [ ] Includes authenticity warnings when detected
- [ ] Logs analysis results with provider info

---

## Performance Testing

### Test: Single Image Analysis Time
```
Run 5 consecutive analyses, record time:
1. Image 1: _____ ms
2. Image 2: _____ ms
3. Image 3: _____ ms
4. Image 4: _____ ms
5. Image 5: _____ ms

Average: _____ ms
Expected: 1000-2000 ms
```

### Test: Multiple Images Analysis Time
```
Run 5 consecutive 3-image analyses:
1. Batch 1: _____ ms
2. Batch 2: _____ ms
3. Batch 3: _____ ms
4. Batch 4: _____ ms
5. Batch 5: _____ ms

Average: _____ ms
Expected: 1500-2500 ms
```

### Test: Rate Limit Recovery
```
Run requests until Gemini quota exceeded:
1. Request before limit: _____ ms (gemini)
2. Request at limit: Falls back to Groq
3. Total time: _____ ms
4. Verify provider = "groq"
5. Verify retried = true
```

---

## Troubleshooting Steps

### Problem: "AI analysis failed" error
1. Check backend logs for actual error
2. Verify both API keys in .env file
3. Test API keys directly with provider
4. Check rate limits not exceeded
5. Verify image format (JPEG/PNG/WebP)
6. Ensure image < 5MB

### Problem: Form not auto-filling
1. Check browser console for JS errors
2. Verify aiAnalysis object being passed
3. Check ProductUploadStep2 receiving prop
4. Verify aiAnalysis.success === true
5. Check aiAnalysis.data has expected fields

### Problem: Long analysis time (>5s)
1. Check image file sizes
2. Monitor backend logs for timing
3. Check network latency
4. Verify API provider not slow
5. Consider reducing to 1-2 images

### Problem: Fallback not triggering
1. Check error message contains "429", "quota", or "rate"
2. Verify Groq API key valid
3. Test Groq endpoint manually
4. Check backend logs for error type

---

## Database Verification

After successful analysis + submission, verify in database:

```sql
-- Check product created with AI suggestions
SELECT id, title, description, category, condition, estimated_value_min, estimated_value_max
FROM products
ORDER BY created_at DESC
LIMIT 1;

-- Expected: title, description should match AI analysis suggestions
-- Expected: category should match AI detection
-- Expected: condition should match AI assessment
```

---

## Rollback Steps (If Needed)

### If API Endpoint Issues
1. Comment out route in main.go: `ai.Post(...)`
2. Remove AnalyzeProductImages method from upload_handler.go
3. Rebuild: `go build`
4. Redeploy

### If Frontend Issues
1. Remove aiAnalysis from ProductUploadFlow.tsx
2. Remove analyzeProductImages function
3. Remove aiAnalysis prop from ProductUploadStep2
4. Remove AI info box from ProductUploadStep2
5. Rebuild: `npm run build`
6. Redeploy

---

## Success Indicators

✅ **Backend Ready**: `go build` succeeds
✅ **Frontend Ready**: `npm run build` succeeds
✅ **API Responsive**: `POST /api/ai/analyze-product` returns 200
✅ **AI Analysis Works**: Form auto-fills with suggestions
✅ **Fallback Ready**: Groq kicks in when Gemini rate-limited
✅ **UX Polish**: Toast notifications and badges display correctly
✅ **User Control**: User can override any pre-filled field

---

## Production Deployment Checklist

- [ ] Both API keys configured in production env
- [ ] Rate limits understood for both providers
- [ ] Monitoring set up for /api/ai/analyze-product endpoint
- [ ] Error logging configured
- [ ] User feedback monitored (analyze feature usage)
- [ ] Performance baseline established
- [ ] Fallback provider tested in production
- [ ] Rollback procedure documented and tested
- [ ] Rate limit alerts configured
- [ ] Analytics tracking AI provider usage
