# Multiway Trading — Polish Summary

All changes target the **Auto Search Results** tab in the Dashboard's Multi-Way trading section.

**Files modified:**
- `handlers/trade_handler.go` (backend)
- `client/src/pages/Dashboard.tsx` (frontend)

---

## Session 1: Core Fixes

### 1. Dynamic Match Scoring (was: hardcoded 60%)

**Problem:** Every Auto Search card showed "60% MATCH" because `buildLoopSuggestionsForUser` had a hardcoded fallback (`pl["score"] = 60`).

**Fix:** Created `productMatchScore()` — a scored version of the existing `productMatchesDesires()` that returns 0–100 based on match quality:

| Score | Match Type |
|-------|-----------|
| 95 | Direct product-name match (title substring of desires or vice versa) |
| 75 | Category substring match |
| 70 | Category token matches desire token |
| 60 | Desire token equals a title word exactly |
| 55 | Title keyword cross-match |
| 45 | Semantic match only (via `SemanticMatcher`) |

In `findProductBasedMultiwayLoops`, the 3 edges (A→B, B→C, C→A) are each scored and averaged for the loop's overall score. The hardcoded 60 fallback was changed to 0.

### 2. Duplicate Card Elimination

**Problem:** The same product combination appeared multiple times because different third-party participants could complete the same visible cycle (e.g., "PS5 → iPhone" appeared 3 times with different third products).

**Fix:** Added a **third dedup pass** in `selectBestLoopsPerProduct`, keyed on the sorted triple of all 3 product IDs:

```
key = "pm_<pid0>_<pid1>_<pid2>" (sorted)
```

Only the highest-scored loop per product triple is kept. Also fixed `rebuildTradeLoopCacheForUsers` to apply `selectBestLoopsPerProduct` before saving to cache — previously the cache stored un-deduped results.

### 3. Full 3-Way Cycle Display

**Problem:** Cards only showed 2 products (`yourGive → yourGet`), making different cycles look identical.

**Fix:** Updated the card rendering in `Dashboard.tsx` to show all 3 products:

```
PS5 Console → iPhone 15 Pro Max → HP Laptop
```

Uses `trade.participants.map(p => p.product_title).join(' → ')` when 3 participants are available.

---

## Session 2: Polish & Optimization

### 4. Word-Boundary Matching

**Problem:** Substring matching caused false positives — e.g., "phone" matched "headphone", "top" matched "laptop".

**Fix:** Both `productMatchScore` and `productMatchesDesires` now use **exact word equality** (`tw == dt`) instead of `strings.Contains(dt, tk)` for token-level matching. Multi-word phrases like "gaming laptop" still match via full-phrase containment as a fallback.

### 5. Price Similarity Scoring

**Problem:** Loops with wildly mismatched product values ranked the same as fair-value trades.

**Fix:** Added `Price` field to the product query. When all 3 products have prices set:

| Price Ratio (min/max) | Bonus |
|----------------------|-------|
| >= 0.8 (within ±20%) | +5 points |
| >= 0.5 (within ±50%) | +2 points |
| < 0.5 | No bonus |

### 6. Reputation Scoring

**Problem:** No distinction between verified and unverified traders in loop ranking.

**Fix:** Added `SellerVerified` (from `users.verified`) to the product query. Each verified user in the loop adds **+1 point** to the score (max +3). Final score is clamped to 100.

### 7. Scheduled Rescan for All Active Users

**Problem:** Background cache rebuild (`RebuildAllLoopCaches`) only ran for premium users, leaving free users with stale or empty caches.

**Fix:** Changed the query from `SELECT id FROM users WHERE is_premium = TRUE` to select all users who have at least one available product with desires set (within 3 months). The existing 5-minute background ticker in `main.go` remains unchanged.

### 8. O(N³) Loop Finder Optimization

**Problem:** `findProductBasedMultiwayLoops` iterated all 200 other products in both inner loops (up to 200 × 200 = 40,000 iterations per user product).

**Fix:** Added `buildCandidateSet()` method that pre-indexes other products by **category and title words** into a `map[string][]int`. Inner loops now only iterate over candidates whose keywords overlap with the current desires. Falls back to full scan only when no index hits are found.

### 9. UX Empty State

**Status:** Already handled — `Dashboard.tsx` line 4923 shows "No loop matches found yet / We'll notify you when one is available" when all multiway sections (including Auto Search) are empty. No change needed.

---

## Verification

Both sessions verified with:
- `cd closevia && go build ./...` — clean
- `cd closevia/client && npm run build` — clean
- Manual testing across multiple accounts (2-product user, 10-product user)
