# Trading App - AI Image Analysis & Moderation Features Implementation

## Overview
This document summarizes the implementation of AI image analysis improvements, upload flow enhancements, product detail page updates, and moderation features for the trading app.

---

## 1. AI IMAGE ANALYSIS IMPROVEMENTS

### Extended GeminiResponse Model
**File:** `services/gemini_service.go`

Added 8 new fields to detect image quality and content issues:
```go
IsProhibited        bool   // True if contains guns, drugs, alcohol, counterfeit
ProhibitedReason    string // Friendly message if prohibited
ContainsPerson      bool   // True if person/face detected
PersonWarning       string // Friendly message if person detected
IsSuspiciousImage   bool   // True if screenshot/watermark/stock photo detected
SuspiciousReason    string // Why it looks suspicious
IsBlurryOrDark      bool   // True if image quality is poor
QualityWarning      string // Friendly message about image quality
```

### Enhanced AI Prompts
**Files:** `services/gemini_service.go`, `services/groq_service.go`

Both services now prompt the AI to detect:
- **Prohibited items** (guns, drugs, alcohol, counterfeit goods) - BLOCKS submission
- **People/faces in images** - Shows warning
- **Suspicious images** (screenshots, watermarks, stock photos) - Shows warning
- **Blurry or dark images** - Shows warning

Prompts include specific rules and friendly error messages for each detection type.

---

## 2. UPLOAD FLOW ENHANCEMENTS

### Frontend: AddProduct Component
**File:** `client/src/pages/AddProduct.tsx`

#### Image Upload Constraints
- **Changed:** Support 2-5 images per listing (was 1-8)
- **Added:** `aiBlockingError` state to track blocking issues
- **Added:** `aiWarnings` state to track non-blocking warnings

#### AI Analysis Updates
- **Enhanced triggerAI()** function to:
  - Extract blocking errors from AI response
  - Extract warnings (person, suspicious image, quality)
  - Prevent form submission if blocking error detected
  - Show appropriate toast messages

#### Enhanced canProceed()
- Checks for `aiBlockingError` on step 1
- Blocks "Next" button if blocking error exists
- Requires 2-5 images (changed from >= 1)

#### UI Components Added
- **Loading indicator** with spinner during AI analysis
- **Error alert** showing blocking issues in red
- **Warning alerts** showing non-blocking issues in orange/yellow
- Updated image upload stats to show "/5" instead of "/8"

#### Error/Warning Handling
- Clear errors when new images are uploaded
- Clear errors when images are removed
- Reset AI trigger ref when images change

---

## 3. PRODUCT DETAIL PAGE UPDATES

### File: `client/src/pages/ProductDetail.tsx`

#### Estimated Value Display
- **Changed:** Replaced "Est. Value TBD" with "Est. Value Unavailable"
- **Benefit:** Clearer messaging to users
- **Updated:** Both occurrences (main detail and related products)

#### Report Listing Feature
- **Added:** Report Listing button (uses existing FiFlag icon)
- **Updated:** Report modal to focus on listing reports
- **New reason options:**
  - Wrong Category
  - Prohibited Item
  - Fake or Scam
  - Inappropriate Photo
  - Other

- **Removed minimum description requirement** for optional details
- **Added:** Select and Textarea to imports for better UI

---

## 4. MODERATION SYSTEM

### Backend: Product Handler
**File:** `handlers/product_handler.go`

#### ReportListing Handler
- Validates user is authenticated
- Validates report reason against allowed list
- Verifies product exists
- Inserts report into database with timestamp
- Returns success/error response

#### Endpoint
- Route: `POST /api/products/report`
- Authentication: Required (middleware protected)
- Request body:
  ```json
  {
    "product_id": 123,
    "reason": "prohibited_item",
    "details": "Optional explanation"
  }
  ```

### Backend: Models
**File:** `models/models.go`

#### ListingReport Model
```go
type ListingReport struct {
    ID              int       `json:"id"`
    ProductID       int       `json:"product_id"`
    ReporterID      int       `json:"reporter_id"`
    Reason          string    `json:"reason"` // one of: wrong_category, prohibited_item, fake_or_scam, inappropriate_photo, other
    Details         string    `json:"details,omitempty"`
    Status          string    `json:"status"` // pending, reviewed
    CreatedAt       time.Time `json:"created_at"`
    UpdatedAt       time.Time `json:"updated_at"`
    // Denormalized fields
    ProductTitle    string    `json:"product_title,omitempty"`
    ReporterName    string    `json:"reporter_name,omitempty"`
    ReporterAvatar  string    `json:"reporter_avatar,omitempty"`
}

type ListingReportCreate struct {
    ProductID int    `json:"product_id"`
    Reason    string `json:"reason"` // validation: oneof
    Details   string `json:"details,omitempty"`
}
```

### Database Migration
**File:** `sql/create_listing_reports_table.sql`

Creates `listing_reports` table with:
- Primary key (auto-increment)
- Foreign keys to products and users
- Reason validation (check constraint)
- Status field (pending/reviewed)
- Timestamps (created_at, updated_at)
- Indices for efficient querying

---

## 5. ROUTE REGISTRATION

### Main Router
**File:** `main.go`

Added new route:
```go
products.Post("/report", middleware.AuthMiddleware(), productHandler.ReportListing)
```

Placed before generic `:id` route to ensure proper matching.

---

## 6. ERROR MESSAGE TONE

All error and warning messages use friendly, helpful language:

### Examples
- **Prohibited:** "This item can't be listed for trading. Please try a different product!"
- **Person detected:** "This photo contains a person. Please retake without people in frame for a cleaner listing"
- **Suspicious image:** "This looks like a screenshot/stock photo. Original product photos work better!"
- **Image quality:** "This photo is too dark/blurry. Please retake with better lighting or focus"

---

## 7. IMPLEMENTATION NOTES

### AI Detection Workflow
1. User uploads 2-5 images
2. AI analysis triggers automatically after first image
3. AI checks for blocking issues first
4. If blocking issue found:
   - Shows error message
   - Disables Next button
   - Prevents form submission
5. If no blocking issues:
   - Fills form with AI data
   - Shows warnings if any
   - Enables Next button

### Flow Restrictions
- **Cannot proceed** to step 2 if blocking error exists
- **Can proceed** to step 2 even with warnings
- **Can revise** photos to resolve blocking errors
- **Warning messages** are advisory, not blocking

### Moderation Flow
1. User clicks report button on product detail page
2. Modal opens with reason selector
3. User selects reason and optionally adds details
4. Report submitted to backend
5. Confirmation message shown
6. Report stored for admin review

---

## 8. TESTING CHECKLIST

- [ ] Test AI detection with prohibited item image (gun, drug, alcohol, counterfeit)
- [ ] Test AI detection with person in image
- [ ] Test AI detection with screenshot/watermark
- [ ] Test AI detection with blurry/dark image
- [ ] Test upload with 2 images (minimum)
- [ ] Test upload with 5 images (maximum)
- [ ] Test upload with 6+ images (should reject)
- [ ] Test Next button disabled with blocking error
- [ ] Test Next button disabled with only 1 image
- [ ] Test Next button enabled after resolving issues
- [ ] Test product detail page shows estimated value
- [ ] Test product detail page shows "Est. Value Unavailable" when no value
- [ ] Test Report Listing button visible
- [ ] Test Report modal opens with correct reasons
- [ ] Test report submission successful
- [ ] Test report confirmation message shown
- [ ] Verify listing_reports table created in database

---

## 9. FILES MODIFIED

### Backend
1. `services/gemini_service.go` - Extended GeminiResponse, enhanced prompt
2. `services/groq_service.go` - Enhanced prompt with detection rules
3. `handlers/product_handler.go` - Added ReportListing handler
4. `models/models.go` - Added ListingReport model and ListingReportCreate
5. `main.go` - Added /report route

### Frontend
1. `client/src/pages/AddProduct.tsx` - Enhanced AI analysis, UI, constraints
2. `client/src/pages/ProductDetail.tsx` - Updated value display, report modal

### Database
1. `sql/create_listing_reports_table.sql` - New migration file

---

## 10. NEXT STEPS

1. Run database migration: `create_listing_reports_table.sql`
2. Restart backend server
3. Test all AI detection scenarios
4. Test upload flow with image constraints
5. Test report submission
6. Monitor moderation queue for reports
7. Consider adding admin dashboard for reviewing reports

---

## 11. PERFORMANCE CONSIDERATIONS

- AI analysis happens automatically, may add slight latency
- Consider caching AI results for identical images to avoid redundant API calls
- Database queries include indices for fast filtering
- Report submission is async, doesn't block user interaction

---

## 12. SECURITY NOTES

- All moderation endpoints require authentication
- Report creation validates reason against whitelist
- Product existence verified before creating report
- Foreign keys ensure data integrity
- User cannot see other users' reports (by default)
