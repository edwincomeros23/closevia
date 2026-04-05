# Trade Flow Analysis - Offers/Multiway Creation and Acceptance

## 1. WHERE TRADES ARE CREATED

### **Trade Creation Entry Point**
- **File**: [handlers/trade_handler.go](handlers/trade_handler.go#L131)
- **Function**: `CreateTrade()` at line 131
- **Method**: POST request that inserts new trade records

### **Trade Insertion SQL**
- **Line**: [187](handlers/trade_handler.go#L187)
- **Query**:
```sql
INSERT INTO trades 
(buyer_id, seller_id, target_product_id, status, trade_option, delivery_address, message, offered_cash_amount, payment_method) 
VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
```
- Initial status: **'pending'**
- The `target_product_id` field identifies which product is being offered for

### **Multiway Trade Creation**
- **File**: [handlers/trade_handler.go](handlers/trade_handler.go#L283)
- **Function**: `evaluateAndCreateMultiwaySuggestion()` at line 283
- **Creates**: Record in `multiway_trades` table, NOT a regular `trades` record
- **Line 350**: Inserts into multiway_trades:
```sql
INSERT INTO multiway_trades (chain_id, original_trade_id, initiator_user_id, user1_id, user2_id, user3_id, user3_trade_id, user3_product_id, status, expires_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```
- Initial status for pending: **'pending_user3'** (if initiator is premium) or **'pending_initiator_upgrade'** (if not premium)

---

## 2. MULTIWAY SUGGESTION CREATION LOGIC

### **Does it create an actual trade record?**
**NO** - When a multiway suggestion is created via `evaluateAndCreateMultiwaySuggestion()`:
- It creates a record ONLY in the `multiway_trades` table (line 350)
- It does NOT create additional trade records for User 3
- The original trade record (the 2-way trade by User 1 and User 2) remains in the `trades` table
- The multiway_trades record is a SUGGESTION/OPPORTUNITY, not a binding trade

### **What gets created:**
1. **multiway_trades** record with:
   - `chain_id`: Unique identifier for the loop
   - `original_trade_id`: References the initial 2-way trade
   - `user1_id`: Buyer (User 1)
   - `user2_id`: Seller (User 2) 
   - `user3_id`: Third party (User 3)
   - `user3_product_id`: The product User 3 is contributing
   - `status`: 'pending_user3' or 'pending_initiator_upgrade'
   - `expires_at`: 18 hours from creation (line 345)

2. **Products locked** (line 353):
```sql
UPDATE products SET status='locked' WHERE id=? AND status='available'
```
User 3's product gets "locked" to prevent parallel trades

3. **Notifications sent** (lines 355-374)

### **When does it become a real trade?**
When User 3 accepts the chain via `AcceptMultiwayChain()`:
- **Line**: [4494](handlers/trade_handler.go#L4494)
- Updates multiway_trades status to **'user3_accepted'** (line 4560)
- Creates **multiway_trade_legs** records (lines 4580-4598) - one leg for each of the 3 handoffs:
  - Leg 0: User1 → User2
  - Leg 1: User2 → User3  
  - Leg 2: User3 → User1

---

## 3. WHERE PRODUCTS GET MOVED TO "OFFERS RECEIVED"

### **Frontend Display Logic**
- **File**: [client/src/pages/Offers.tsx](client/src/pages/Offers.tsx#L357)
- **Line**: 357-359 - Products are tagged as 'Offers Received':
```tsx
type SourceTrade = Trade & { source: 'Offers Received' | 'Offers Sent' }
...incomingSorted.filter(t => historyStatuses.includes(t.status)).map(t => ({ ...t, source: 'Offers Received' as const }))
```

### **What qualifies as "Offers Received"**
- **Direction**: `incoming` trades (fetched via `/api/trades?direction=incoming`)
- **Status must NOT be**:
  - 'pending_multiway'
  - 'accepted'
  - 'active'
  - History statuses: 'declined', 'cancelled', 'completed', 'auto_completed'
  - Archive statuses: 'expired'
- **Valid statuses** for visible offers: 'pending', 'countered'

### **Backend API Endpoint**
- **File**: [handlers/trade_handler.go](handlers/trade_handler.go#L780)
- **Endpoint**: `/api/trades` with `direction=incoming`
- Fetches trades where `seller_id = ?` (the current user is the seller/item owner)
- These are trades INCOMING to the product owner

---

## 4. OFFER ACCEPTANCE & WHAT HAPPENS TO OTHER PENDING OFFERS

### **Offer Acceptance Entry Point**
- **File**: [handlers/trade_handler.go](handlers/trade_handler.go#L1071)
- **Function**: `UpdateTrade()` at line 1071
- **Action**: `accept`

### **Acceptance Flow (lines 1100-1160)**
```go
case "accept":
    // Get trade option (meetup or delivery)
    var tradeOption string
    
    if tradeOption == "delivery" {
        newStatus = "active"  // Goes directly to active for delivery
    } else {
        newStatus = "accepted"  // Stays accepted for meetup (requires confirmation)
    }
    
    // Update trade status
    UPDATE trades SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?
    
    // Soft-lock all products in the trade
    setProductStatusForTrade(tx, tradeID, "locked")
```

### **CRITICAL: What happens to OTHER offers on the same product?**
**NOTHING** - The current code does NOT automatically reject other pending offers when one is accepted.

**However**, there IS detection for conflicts:
- **File**: [handlers/trade_handler.go](handlers/trade_handler.go#L5207-L5222)
- **Function**: `CheckMultiwayConflict()` at line 5207
- **Line 5196**: Checks for dual offers:
```sql
SELECT COUNT(*), MIN(id) FROM trades
WHERE target_product_id = ? AND seller_id = ? AND status IN ('pending', 'accepted')
```

- **Purpose**: If a product has BOTH a 2-way trade AND a pending multiway chain offer, the user is prompted to choose which one to accept first (conflict resolution UI)
- **Line 5239-5242**: User can choose:
  - `keep_type: "two_way"` → Dissolves the multiway chain automatically (line 5244-5255)
  - `keep_type: "multiway"` → Declines the 2-way trade (line 5257)

---

## 5. PREVENT MULTIPLE OFFERS ON SAME PRODUCT

### **Layer 1: Client-Side Prevention**
- **File**: [client/src/pages/ProductDetail.tsx](client/src/pages/ProductDetail.tsx#L253)
- **Lines**: 253-273
- User sees a tooltip when they already have a pending offer:
```tsx
const checkPendingOffer = async () => {
  const response = await api.get(`/api/trades?direction=outgoing&status=pending&limit=100`)
  const trades = Array.isArray(response.data?.data) ? response.data.data : []
  const hasPending = trades.some((trade: any) => trade.target_product_id === product.id)
  setHasPendingOfferOnProduct(hasPending)
}
```
- Button is disabled with message: "You already have a pending offer on this product"

- **File**: [client/src/components/TradeModal.tsx](client/src/components/TradeModal.tsx#L211)
- **Lines**: 211-227
- Second validation layer before submission

### **Layer 2: Backend Validation (MAIN ENFORCEMENT)**
- **File**: [handlers/trade_handler.go](handlers/trade_handler.go#L112)
- **Lines**: 119-131
- **Query**:
```sql
SELECT id FROM trades 
WHERE buyer_id = ? AND target_product_id = ? AND status = 'pending'
LIMIT 1
```
- If a match is found, returns **409 Conflict**:
```go
return c.Status(409).JSON(models.APIResponse{
    Success: false, 
    Error: "You already have a pending offer on this product"
})
```

### **KEY DETAIL**: Only 'pending' status is checked
- Does NOT prevent offers if previous offer is 'accepted' or 'countered'
- This allows users to:
  1. Make an offer → 'pending'
  2. Wait for seller to counter → 'countered'
  3. NOT make a new offer while 'countered' (because 'countered' is not 'pending')
  4. But if seller declines your countered offer, you CAN make a new pending offer

---

## 6. SUMMARY TABLE

| Aspect | Details |
|--------|---------|
| **Trade Creation** | INSERT INTO trades at line 187, status='pending' |
| **Multiway Suggestion** | INSERT INTO multiway_trades at line 350, NO trade record created |
| **Multiway Initial Status** | 'pending_user3' (premium) or 'pending_initiator_upgrade' (free) |
| **Offers Received Display** | Incoming trades filtered by direction='incoming', statuses include 'pending'/'countered' |
| **Products "Locked"** | When trade accepted or multiway created, product status='locked' |
| **Auto-Reject Other Offers** | NOT IMPLEMENTED - only detection/conflict resolution exists |
| **Conflict Resolution** | CheckMultiwayConflict() detects dual offers and prompts user to choose |
| **Prevent Duplicate Offers** | Backend check: no pending offers where buyer_id=user AND target_product_id=product |
| **Offer Acceptance Status** | delivery→'active', meetup→'accepted' |
| **Other Pending Offers** | Remain in 'pending' status; no cascade decline |

---

## 7. KEY CODE LOCATIONS

| Feature | File | Line(s) |
|---------|------|---------|
| Create Trade | handlers/trade_handler.go | 131-200 |
| Trade Insert SQL | handlers/trade_handler.go | 187 |
| Multiway Evaluation | handlers/trade_handler.go | 283-425 |
| Multiway Insert SQL | handlers/trade_handler.go | 350 |
| Accept Trade | handlers/trade_handler.go | 1100-1160 |
| Check Conflict | handlers/trade_handler.go | 5207-5222 |
| Resolve Conflict | handlers/trade_handler.go | 5239-5280 |
| Prevent Duplicate Offers | handlers/trade_handler.go | 119-131 |
| Frontend Display | client/src/pages/Offers.tsx | 357-365 |
| Client-Side Check | client/src/pages/ProductDetail.tsx | 253-273 |
| Trade Modal Validation | client/src/components/TradeModal.tsx | 211-227 |

---

## 8. POTENTIAL GAPS/ISSUES

1. **No automatic rejection of other pending offers** when one is accepted
   - All other offers remain in 'pending' status
   - Seller must manually decline them
   - Consider implementing cascade decline on acceptance

2. **Conflict detection doesn't prevent acceptance**
   - User can accept one offer, leaving multiway chain orphaned
   - Chain auto-dissolves but multiway participant isn't prevented from accepting

3. **Duplicate offer check only on 'pending'**
   - Can't make a new pending offer while 'countered'
   - But once 'countered' is declined, can make new pending
   - May be intentional to allow counter-offers

4. **No unique constraint on (buyer_id, target_product_id, status)**
   - Race condition possible if two create requests sent simultaneously
   - Consider database-level constraint

