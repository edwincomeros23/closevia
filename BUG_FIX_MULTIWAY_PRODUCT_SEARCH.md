# Bug Fix: Products in Active Trades Still Appearing in Multi-Way Search

## Problem
Products that were already in pending or active trades were still appearing in the Multi-Way tab as "Searching" candidates for new multiway loop matches. This could lead to:
- The same product being committed to multiple trades
- Confusion about product availability
- Double-booking of items

## Root Cause
The `FindMultiwayMatchDetailed()` function in `services/trade_matcher.go` only filtered products by `status='available'` but didn't check if those products were already involved in active trades through the `trades` and `trade_items` tables.

## Solution

### 1. Backend Fix: Filter Products in Active Trades (trade_matcher.go)

**File**: `services/trade_matcher.go` (lines 363-376)

**Change**: Updated the SQL query that fetches available products for multiway matching to exclude products that are:
- The target product in any pending/active trade
- Offered as items in any pending/active trade

**New Query**:
```sql
SELECT DISTINCT u.id, u.name, p.id, p.title, COALESCE(p.category, ''), COALESCE(p.price, 0),
       COALESCE(p.`condition`, ''), COALESCE(p.wants, ''), COALESCE(p.wanted_categories, ''), COALESCE(p.desired_product, '')
FROM products p
JOIN users u ON u.id = p.seller_id
WHERE p.status = 'available'
  AND u.role != 'admin'
  AND p.created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
  AND NOT EXISTS (
    SELECT 1 FROM trades t
    WHERE (t.target_product_id = p.id OR t.id IN (
      SELECT trade_id FROM trade_items WHERE product_id = p.id
    ))
    AND t.status IN ('pending', 'pending_multiway', 'accepted', 'active', 'multiway_active')
  )
```

**Excluded Trade Statuses**:
- `pending` - Initial pending offers
- `pending_multiway` - Trades awaiting multiway loop acceptance
- `accepted` - Accepted offers (meetup stage)
- `active` - Active ongoing trades
- `multiway_active` - Active multiway loops

### 2. Frontend Fix: Filter Products from Pending Multiway List (Dashboard.tsx)

**File**: `client/src/pages/Dashboard.tsx` (lines 1305-1350)

**Changes**:
1. Updated `pendingMultiWayTrades` filter to collect all products involved in active trades
2. Excluded products from "Finding Matches" section if they appear in any pending/active trade
3. Added import for `TradeItem` type (line 65)

**Filter Logic**:
```typescript
// Collect product IDs that are already involved in active/pending trades
const productsInActiveTrades = new Set<number>()
const activeTradeStatuses = ['pending', 'pending_multiway', 'accepted', 'active', 'multiway_active']

// Get target products and offered products from active trades
;[...sentOffers, ...receivedOffers, ...(ongoingTradesData || [])].forEach((t: Trade) => {
  if (activeTradeStatuses.includes(t.status)) {
    productsInActiveTrades.add(t.target_product_id)
    // Also add offered product IDs from trade items
    if (t.items && Array.isArray(t.items)) {
      t.items.forEach((item: TradeItem) => {
        productsInActiveTrades.add(item.product_id)
      })
    }
  }
})

// Exclude these products from multiway suggestions
return unique.filter(t => 
  !acceptedChainTradeIds.has(t.id) && 
  !acceptedOriginalTradeIds.has(t.id) &&
  !productsInActiveTrades.has(t.target_product_id)
)
```

## Impact

### Before Fix
- Product in pending trade still shows as "Searching" for multiway matches
- Could be matched as User3 in another loop
- Causes double-booking risk

### After Fix
- ✅ Backend prevents products in active trades from being queried for multiway matching
- ✅ Frontend filters out those products from "Finding Matches" display
- ✅ Products are only eligible for multiway matching when truly available
- ✅ Multi-layer protection: backend query + frontend filtering

## Files Modified
- `services/trade_matcher.go` - Updated product query (1 change)
- `client/src/pages/Dashboard.tsx` - Updated filtering logic (2 changes + 1 import)

## Testing Checklist
- [ ] Create a pending trade on product A
- [ ] Verify product A doesn't appear in multiway searches
- [ ] Accept the trade, verify product A still doesn't appear in multiway matches
- [ ] Cancel the trade, verify product A reappears in multiway matching
- [ ] Create multiple trades and verify "Finding Matches" doesn't show products in any active trades
- [ ] Verify backend build: `go build -o test_build.exe` ✓
- [ ] Verify frontend build: `npm run build` ✓

## Database Query Performance Notes
- The NOT EXISTS subquery uses indexed `trades` table lookup
- `trade_items` lookup is keyed by `product_id` (should be indexed)
- This is a minimal performance impact since multiway matching is already expensive
- Query runs only during multiway detection (not on every page load)
