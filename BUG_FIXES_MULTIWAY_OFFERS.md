# Bug Fixes: Multiway Loop Auto-Offers & Multiple Offer Acceptance

## Bug 1: Multiway Detection Creates Offers Without User Consent

### Problem
When `evaluateAndCreateMultiwaySuggestion()` detects a 3-way loop, it was immediately:
- Locking User3's product (status='locked')
- Moving it out of the Products tab
- Making the product unavailable for other uses

This happened WITHOUT User3's explicit consent - just based on an auto-detection.

### Solution: Make Multiway Detection Passive
- ✅ **Removed** the premature product locking in `evaluateAndCreateMultiwaySuggestion()` (line ~368)
- ✅ **Added** product locking when User3 explicitly accepts in `AcceptMultiwayChain()` (line ~4556)

#### Changes Made:
1. **Line 365-368**: Removed `UPDATE products SET status='locked'` from loop suggestion creation
2. **Line 4556**: Added locking only when User3 accepts: `UPDATE products SET status='locked' WHERE id=? AND status='available'`

**Result**: Multiway suggestions are now passive notifications. Products are only locked when the user explicitly accepts the loop.

---

## Bug 2: Multiple Offers Can Be Accepted on Same Product

### Problem
When one offer on a product was accepted, other pending offers on the same product were NOT automatically declined. This meant:
- A product could be committed to multiple trades simultaneously
- The same physical item could be promised to multiple buyers
- Product status wasn't prevent new conflicting offers

### Solution: Auto-Decline & Lock on Acceptance
- ✅ **Added** logic to find all other pending offers on the same target product
- ✅ **Auto-decline** all competing pending offers
- ✅ **Unlock** products from declined offers
- ✅ **Notify** buyers whose offers were auto-declined

#### Changes Made in `UpdateTrade()` "accept" case (lines 1098-1150):

1. **Query other pending offers** (lines 1129-1138):
   ```sql
   SELECT id FROM trades 
   WHERE target_product_id = ? AND id != ? AND status = 'pending'
   ```

2. **Auto-decline competing offers** (lines 1154-1162):
   - Update trade status to 'declined'
   - Unlock their offered products
   - Unlock the target product from competing trades

3. **Send notifications** (lines 1190-1197):
   - Buyers are notified their offer was auto-declined
   - Message: "Your offer for [product] has been automatically declined because another offer was accepted for this item."

### Example Scenario:
```
Before Fix:
- Buyer A offers 2 items for iPhone (trade_id: 101, status: pending)
- Buyer B offers 3 items for iPhone (trade_id: 102, status: pending)
- Seller accepts Buyer A's offer
✗ Both trades now show as "accepted" - product locked for 2 trades!

After Fix:
- Buyer A's offer accepted (trade_id: 101 → status: accepted)
- Buyer B's offer auto-declined (trade_id: 102 → status: declined)
- Buyer B notified of auto-decline
✓ Only one trade active for the product
```

---

## Database State After Fixes

### Trade Records
- Target product can only have ONE active/accepted trade
- Other pending trades automatically declined
- Trade history preserved (status changed to 'declined')

### Product Records
- **Available**: Not in any trade
- **Locked**: In an accepted/active trade
- Returned to **Available** if competing trades auto-declined

### Notifications
- ✅ Buyers auto-notified when offers are declined due to competing acceptance
- ✅ Participants notified on multiway loop events

---

## Files Modified
- `handlers/trade_handler.go`
  - `evaluateAndCreateMultiwaySuggestion()` (line 365-368)
  - `AcceptMultiwayChain()` (line 4556)
  - `UpdateTrade()` (lines 1098-1197)

## Testing Checklist
- [ ] Create a multiway loop suggestion - verify product is NOT locked
- [ ] User3 accepts multiway loop - verify product IS locked
- [ ] Two pending offers on same product - accept one, verify other auto-declines
- [ ] Verify declined offer buyers receive notification
- [ ] Verify product status changes correctly through accept/decline/cancel flows
- [ ] Check no compiler errors: `go build ./cmd`
