# Proactive Multiway Detection - Testing Guide

## Overview
The proactive multiway detection system automatically finds 3-way trade loops when a product is posted, without requiring manual trade creation.

## System Flow
```
User A posts Product1 (Laptop, wants: Phone)
                    ↓
FindProactiveMultiwayLoops() triggered in background
                    ↓
Scans all products for User B & C matching:
  - User B wants Product1 OR its category
  - User C has what User B wants
  - User C wants what User A has
                    ↓
Loop found! Stores in multiway_trades with is_proactive_match=TRUE
                    ↓
Suggestions visible in /api/trades/multiway/suggestions endpoint
```

---

## Test Scenario: 3-Way Loop

### Step 1: Create Test Users
Create three test accounts (can use existing or new):
- **User A**: email: `testuserA@test.com`, password: `Test@123456`
- **User B**: email: `testuserB@test.com`, password: `Test@123456`
- **User C**: email: `testuserC@test.com`, password: `Test@123456`

### Step 2: User B Posts Product (Before User A)
**User B logs in and posts:**
- **Title**: "iPhone 15 Pro"
- **Category**: "Electronics"
- **Wants**: "Laptop, Tablet" (or wanted_categories: "Electronics")
- **Desired Product**: "Laptop"
- **Price**: ₱15,000

**Expected**: Product is posted, no suggestions yet since loop isn't complete.

---

### Step 3: User C Posts Product
**User C logs in and posts:**
- **Title**: "Samsung Earbuds"
- **Category**: "Electronics"  
- **Wants**: "iPhone, Phone" (or wanted_categories: "Electronics")
- **Desired Product**: "iPhone"
- **Price**: ₱2,000

**Expected**: Product is posted, no suggestions yet since User A's product doesn't exist.

---

### Step 4: User A Posts Product (Triggers Detection!)
**User A logs in and posts:**
- **Title**: "MacBook Pro"
- **Category**: "Electronics"
- **Wants**: "iPhone, Headphones" (or wanted_categories: "Electronics")
- **Desired Product**: "iPhone"
- **Price**: ₱50,000

**Expected Flow:**
1. Product saved to database
2. `FindProactiveMultiwayLoops()` triggered automatically in background
3. Loop detected: A→B→C→A ✅
4. Entry created in `multiway_trades` table with:
   - `chain_id`: "proactive_userA_id_userB_id_userC_id_<timestamp>"
   - `is_proactive_match`: TRUE
   - `user1_id`: A's ID (initiator)
   - `user1_product_id`: A's MacBook ID
   - `user2_id`: B's ID
   - `user2_product_id`: B's iPhone ID
   - `user3_id`: C's ID
   - `user3_product_id`: C's Earbuds ID
   - `status`: "pending_user3"
   - `expires_at`: 48 hours from now

---

## Step 5: Verify Suggestions via API

### 5a. User A checks suggestions (should see 1 loop)
**GET /api/trades/multiway/suggestions**
Headers: `Authorization: Bearer <USER_A_TOKEN>`

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "chain_id": "proactive_A_B_C_<timestamp>",
      "id": <multiway_id>,
      "status": "pending_user3",
      "user1_id": <A_ID>,
      "user2_id": <B_ID>,
      "user3_id": <C_ID>,
      "u1_name": "User A",
      "u2_name": "User B",
      "u3_name": "User C",
      "u1_product_title": "MacBook Pro",
      "u2_product_title": "iPhone 15 Pro",
      "u3_product_title": "Samsung Earbuds",
      "u1_product_id": <A_PRODUCT_ID>,
      "u2_product_id": <B_PRODUCT_ID>,
      "u3_product_id": <C_PRODUCT_ID>,
      "created_at": "<timestamp>",
      "expires_at": "<48_hours_later>"
    }
  ]
}
```

### 5b. User B checks suggestions (should see 1 loop)
Same endpoint, different token. Should be the same loop.

### 5c. User C checks suggestions (should see 1 loop)
Same endpoint, different token. Should be the same loop.

---

## Expected Data in Database

### multiway_trades table entry
```sql
SELECT * FROM multiway_trades WHERE is_proactive_match = TRUE;
```

Should show:
- `is_proactive_match`: 1 (TRUE)
- `original_trade_id`: NULL (no existing trade, it's proactive)
- `user1_product_id`: <A's MacBook ID>
- `user2_product_id`: <B's iPhone ID>
- `user3_product_id`: <C's Earbuds ID>
- `status`: pending_user3
- `expires_at`: SET to 48 hours from creation

---

## Backend Validation Checklist

✅ **Loop Matching Logic**
- [ ] User B's wanted_categories/wants match User A's product title/category
- [ ] User C's wanted_categories/wants match User B's product title/category
- [ ] User A's wanted_categories/wants match User C's product title/category

✅ **Scoring Algorithm (0-100)**
- [ ] Base score: 30 points
- [ ] Direct category matches: +20 points each (up to +40)
- [ ] Wants text matches: +10 points each (up to +20)
- [ ] Final score: capped at 100

✅ **Database Storage**
- [ ] `is_proactive_match` column exists and set to TRUE
- [ ] `original_trade_id` allows NULL
- [ ] All product IDs stored (user1_product_id, user2_product_id, user3_product_id)
- [ ] Chain ID format: "proactive_<U1_ID>_<U2_ID>_<U3_ID>_<TIMESTAMP>"
- [ ] Expires_at set to 48 hours from creation

✅ **Duplicate Prevention**
- [ ] Same loop suggested twice: Should not occur (checked before insert)
- [ ] Different order (A→B→C vs B→C→A): May occur if conditions match differently

---

## Frontend Integration Checklist

After backend testing is complete:

- [ ] Dashboard Multiway tab shows "Suggested 3-Way Loops" section
- [ ] Displays all 3 participants with product names
- [ ] Shows match quality/score if available
- [ ] User can accept/decline each suggestion
- [ ] Clicking accept → Settlement modal for meetup/delivery location
- [ ] After settlement → moves to Ongoing Trades tab

---

## Debugging Commands

### Check Backend Logs
```bash
# Look for "[ProactiveMultiway]" entries in server logs
grep -i "proactive" <logfile>
```

### Sample Log Output (Expected)
```
[ProactiveMultiway] Starting proactive scan for product ID=123 (User1=5, Category=Electronics, Wants=Phone,Headphones)
[ProactiveMultiway] Found potential User2 (ID=6, Product=456)
[ProactiveMultiway] ✅ LOOP FOUND: U1=5->U2=6->U3=7->U1
[ProactiveMultiway] Stored suggestion proactive_5_6_7_1234567890 (User3=7, Score=90)
```

### Database Query to Verify Storage
```sql
-- Check all proactive suggestions
SELECT id, chain_id, user1_id, user2_id, user3_id, 
       user1_product_id, user2_product_id, user3_product_id,
       status, is_proactive_match, expires_at
FROM multiway_trades
WHERE is_proactive_match = TRUE
ORDER BY created_at DESC;
```

---

## Edge Cases to Test

### Test Case 1: Expired Suggestions
- Create loop, wait 48+ hours
- API should NOT return expired suggestions
- Old entries still exist in DB but filtered by `expires_at > NOW()`

### Test Case 2: Multiple Loops for Same User
- User A posts product that matches TWO different B-C pairs
- Should receive 2 suggestions
- Check that duplicates aren't created (check on same U1_ID, U2_ID, U3_ID combo)

### Test Case 3: Partial Matches
- User B wants "Electronics" category
- User C wants "Phone" (generic term)
- Should still link if categories align

### Test Case 4: Price Tolerance
- User B's phone: ₱15,000
- User C's earbuds: ₱2,000
- User A's laptop: ₱50,000
- Logic doesn't use price for matching (only categories/text)
- All 3 should still form loop

---

## Test Status Tracking

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| User B post | Product saved | ? | ⏳ PENDING |
| User C post | Product saved | ? | ⏳ PENDING |
| User A post | Triggers detection | ? | ⏳ PENDING |
| Loop found | 1 suggestion stored | ? | ⏳ PENDING |
| API /suggestions | Returns 3 users | ? | ⏳ PENDING |
| DB entry | is_proactive_match=TRUE | ? | ⏳ PENDING |
| Score calculated | 0-100 integer | ? | ⏳ PENDING |
| Expires_at | +48 hours | ? | ⏳ PENDING |
| Frontend integration | Displays in UI | ? | ⏳ PENDING |

---

## Post-Testing Checklist

- [ ] All loop logic working correctly
- [ ] Database migrations applied successfully
- [ ] API endpoint returns correct data
- [ ] No memory leaks from goroutine calls
- [ ] Expired suggestions not returned by API
- [ ] Duplicate prevention working
- [ ] Notification sent to User 3 (if implemented)
- [ ] Frontend displays suggestions properly
- [ ] User can accept loop (if implemented)

---

## Known Limitations (v1.0)

- Only matches on category/wanted_categories (strict string matching)
- Text matching is simple (keywords only, no fuzzy matching)
- Price tolerance NOT enforced in matching (could be added)
- No machine learning ranking (fixed scoring algorithm)
- Notifications may need tweaking

---

## Next Steps After Testing

1. **Update Dashboard Multiway Tab** - Show proactive suggestions separately
2. **Implement Acceptance Flow** - Handle user accepting a suggested loop
3. **Add Settlement UI** - Meetup location/delivery address before active
4. **Email Notifications** - Notify Users B and C about opportunity
5. **Performance Tuning** - Index optimization for large product count
6. **Analytics** - Track suggestion success rate, conversion rate

