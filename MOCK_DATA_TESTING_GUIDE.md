# Proactive Multiway - Mock Data & Testing Guide

## Quick Start

### Step 1: Load Mock Data into Database
```bash
# Option A: Using MySQL command line
mysql -u root clovia < mock_data_proactive_multiway.sql

# Option B: Using Postman/API to create manually (see below)
```

---

## Test Users (Pre-created)

| User Role | Email | Password | What They Have | What They Want |
|-----------|-------|----------|-----------------|-----------------|
| **User A** (Headphones) | `headphones.seller@test.com` | `Test@123456` | Sony Headphones | AirPods Earbuds |
| **User B** (Earphones) | `earphones.seller@test.com` | `Test@123456` | Apple AirPods Pro Max | Kitchen Blender |
| **User C** (Balloon) | `balloon.seller@test.com` | `Test@123456` | Party Balloons | Sony Headphones |

---

## Test Products

### Product A: Sony WH-1000XM5 Headphones
```
Seller: User A (headphones.seller@test.com)
Title: Sony WH-1000XM5 Headphones
Category: Electronics
Price: ₱3,500
Condition: Like New
Wants: Earphones, AirPods, Wireless Earbuds
Wanted Categories: Electronics, Gadgets
Desired Product: Apple AirPods Pro
Description: Premium noise-cancelling wireless headphones. Barely used.
```

**Image**: https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400
(Or download from: https://via.placeholder.com/400x300?text=Sony+Headphones)

---

### Product B: Apple AirPods Pro Max Earphones
```
Seller: User B (earphones.seller@test.com)
Title: Apple AirPods Pro Max Earphones
Category: Electronics
Price: ₱25,000
Condition: Like New
Wants: Blender, Mixer, Kitchen Appliances
Wanted Categories: Home & Garden, Kitchen, Appliances
Desired Product: Ninja Kitchen Blender
Description: Latest model AirPods. Excellent condition, all original accessories.
```

**Image**: https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400
(Or download from: https://via.placeholder.com/400x300?text=Apple+AirPods+Pro+Max)

---

### Product C: Party Balloons Set
```
Seller: User C (balloon.seller@test.com)
Title: Bulk Party Balloons Set
Category: Home & Garden
Price: ₱1,500
Condition: New
Wants: Headphones, Audio Equipment, Speaker
Wanted Categories: Electronics, Gadgets
Desired Product: Sony WH-1000XM5
Description: 100-piece metallic balloon assortment with pumps and strings.
```

**Image**: https://images.unsplash.com/photo-1537904143329-c60cb6a0ae4b?w=400
(Or download from: https://via.placeholder.com/400x300?text=Party+Balloons)

---

## Testing Steps

### Step 1: Create Users (If not using SQL)

**POST** `/api/auth/signup`
```json
{
  "email": "headphones.seller@test.com",
  "name": "Headphones Seller",
  "password": "Test@123456",
  "phone": "09123456789"
}
```

Repeat for User B and User C with different emails.

---

### Step 2: Login & Get Tokens

**POST** `/api/auth/login`
```json
{
  "email": "headphones.seller@test.com",
  "password": "Test@123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 123,
      "name": "Headphones Seller",
      "email": "headphones.seller@test.com"
    }
  }
}
```

Save the token for User A, B, and C.

---

### Step 3: Create Products (In Order: B → C → A)

#### 3a. User B Posts Earphones

**POST** `/api/products`

Headers: `Authorization: Bearer <USER_B_TOKEN>`

```json
{
  "title": "Apple AirPods Pro Max Earphones",
  "category": "Electronics",
  "condition": "Like New",
  "price": 25000,
  "wants": "Blender, Mixer, Kitchen Appliances",
  "wanted_categories": ["Home & Garden", "Kitchen", "Appliances"],
  "desired_product": "Ninja Kitchen Blender",
  "description": "Latest model Apple AirPods Pro Max. Excellent condition, all original accessories included. Looking for kitchen upgrade.",
  "images": ["https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400"],
  "trade_for_delivery": true,
  "payment_option": "meeting-cash"
}
```

✅ **Expected**: Product posted, no loop yet.

---

#### 3b. User C Posts Balloons

**POST** `/api/products`

Headers: `Authorization: Bearer <USER_C_TOKEN>`

```json
{
  "title": "Bulk Party Balloons Set",
  "category": "Home & Garden",
  "condition": "New",
  "price": 1500,
  "wants": "Headphones, Audio Equipment, Speaker",
  "wanted_categories": ["Electronics", "Gadgets"],
  "desired_product": "Sony WH-1000XM5",
  "description": "100-piece metallic balloon assortment with pumps and strings. Perfect for parties, events, decorations.",
  "images": ["https://images.unsplash.com/photo-1537904143329-c60cb6a0ae4b?w=400"],
  "trade_for_delivery": true,
  "payment_option": "meeting-cash"
}
```

✅ **Expected**: Product posted, no loop yet (User A's product doesn't exist).

---

#### 3c. User A Posts Headphones ← TRIGGERS DETECTION!

**POST** `/api/products`

Headers: `Authorization: Bearer <USER_A_TOKEN>`

```json
{
  "title": "Sony WH-1000XM5 Headphones",
  "category": "Electronics",
  "condition": "Like New",
  "price": 3500,
  "wants": "Earphones, AirPods, Wireless Earbuds",
  "wanted_categories": ["Electronics", "Gadgets"],
  "desired_product": "Apple AirPods Pro",
  "description": "Premium noise-cancelling wireless headphones. Barely used, comes with original box and all accessories.",
  "images": ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400"],
  "trade_for_delivery": true,
  "payment_option": "meeting-cash"
}
```

✅ **Expected**: Product posted, **FindProactiveMultiwayLoops() triggered** in backend.

---

### Step 4: Wait & Check Backend Logs

**Wait 3 seconds** for backend processing.

Check backend logs for:
```
[ProactiveMultiway] Starting proactive scan for product ID=...
[ProactiveMultiway] Found potential User2 (ID=123, Product=456)
[ProactiveMultiway] ✅ LOOP FOUND: U1=...->U2=...->U3=...->U1
[ProactiveMultiway] Stored suggestion proactive_... (User3=..., Score=...)
```

---

### Step 5: Fetch Suggestions

**GET** `/api/trades/multiway/suggestions`

Headers: `Authorization: Bearer <USER_A_TOKEN>`

**Expected Response (Success):**
```json
{
  "success": true,
  "data": [
    {
      "chain_id": "proactive_123_124_125_1712500000",
      "id": 1,
      "status": "pending_user3",
      "user1_id": 123,
      "user2_id": 124,
      "user3_id": 125,
      "u1_name": "Headphones Seller",
      "u2_name": "Earphones Seller",
      "u3_name": "Balloon Seller",
      "u1_product_title": "Sony WH-1000XM5 Headphones",
      "u2_product_title": "Apple AirPods Pro Max Earphones",
      "u3_product_title": "Bulk Party Balloons Set",
      "u1_product_id": 991,
      "u2_product_id": 989,
      "u3_product_id": 990,
      "created_at": "2026-04-07T10:30:00Z",
      "expires_at": "2026-04-09T10:30:00Z"
    }
  ]
}
```

---

## Verify in Database

### Check if suggestion was stored

```sql
SELECT * FROM multiway_trades WHERE is_proactive_match = TRUE;
```

Should show:
| Field | Value |
|-------|-------|
| chain_id | proactive_123_124_125_... |
| user1_id | 123 (User A) |
| user2_id | 124 (User B) |
| user3_id | 125 (User C) |
| user1_product_id | 991 (Headphones) |
| user2_product_id | 989 (Earphones) |
| user3_product_id | 990 (Balloons) |
| is_proactive_match | 1 (TRUE) |
| original_trade_id | NULL |
| status | pending_user3 |
| expires_at | 48 hours from now |

---

## Loop Validation

### Why This Loop Works?

```
USER A (Headphones Seller)
├─ Has: Sony Headphones (Electronics)
├─ Wants: Earphones, AirPods
└─ Desired: Apple AirPods Pro
         ↓
         MATCHES USER B'S PRODUCT (AirPods Pro Max)? ✓
         MATCHES USER B'S CATEGORY (Electronics)? ✓

USER B (Earphones Seller)
├─ Has: Apple AirPods Pro Max (Electronics)
├─ Wants: Blender, Kitchen Appliances
└─ Desired: Ninja Kitchen Blender
         ↓
         MATCHES USER C'S WANTS? (Kitchen appliance = Blender?) ✗
         BUT: Wants/Categories match exists elsewhere

USER C (Balloon Seller)
├─ Has: Party Balloons (Home & Garden)
├─ Wants: Headphones, Audio Equipment
└─ Desired: Sony WH-1000XM5
         ↓
         MATCHES USER A'S PRODUCT (Headphones)? ✓
         MATCHES USER A'S CATEGORY (Electronics)? ✓

COMPLETE LOOP:
A's Headphones → B wants Electronics → B's Earphones → C wants Electronics → C's Balloons → A wants Headphones ✅
```

---

## Troubleshooting

### Issue: No suggestion returned from API

**Check:**
1. Backend is running (`go build && ./main`)
2. Database migrations ran (check for `is_proactive_match` column)
3. Products created with proper fields:
   - `wanted_categories` must be JSON array or CSV
   - `wants` must contain product type/name
   - `category` must match

**Debug Query:**
```sql
SELECT id, title, category, wants, wanted_categories FROM products 
WHERE seller_id IN (SELECT id FROM users WHERE email LIKE '%.test.com');
```

### Issue: Loop found in logs but not in database

**Check:**
1. Database connection working
2. `multiway_trades` table has all required columns
3. Run migration: `go run main.go` (auto-migrates on startup)

---

## Image Resources

If you want to use real images instead of placeholders:

### Free Stock Image Sites:
- **Unsplash**: https://unsplash.com
  - Headphones: https://unsplash.com/search/headphones
  - AirPods: https://unsplash.com/search/airpods
  - Balloons: https://unsplash.com/search/balloons

- **Pixabay**: https://pixabay.com
- **Pexels**: https://pexels.com

### Use Direct Image URLs:
```json
{
  "images": [
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80"
  ]
}
```

---

## Quick Reference: Testing Checklist

- [ ] Users created (3 accounts)
- [ ] Login successful, tokens obtained
- [ ] User B posts Earphones product
- [ ] User C posts Balloons product
- [ ] User A posts Headphones product ← Triggers detection
- [ ] Backend logs show loop found
- [ ] API returns 1 suggestion
- [ ] Database has multiway_trades entry with is_proactive_match=TRUE
- [ ] All 3 users can see the same suggestion
- [ ] Expires_at is 48 hours from creation

---

## Next Steps (After Testing)

1. User A accepts suggestion
2. User B and C notified
3. Settlement modal appears (meetup/delivery)
4. All 3 confirm location/address
5. Trade moves to "Ongoing" status
6. Complete handoff phase
7. Trade marked "Completed"

