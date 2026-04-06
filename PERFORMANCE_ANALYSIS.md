# Performance Analysis & Optimization Recommendations

## Executive Summary
This analysis identifies **critical N+1 query problems**, **inefficient polling patterns**, **missing database indexes**, and **frontend re-fetching issues** that impact latency and server load.

---

## 1. DATABASE LEVEL

### 🔴 CRITICAL: N+1 Query Problem in Trade Creation
**Location:** `handlers/trade_handler.go` lines 106-112, 204, 225

```go
// ❌ PROBLEM: Loop queries products one-by-one (N+1)
for _, productID := range payload.OfferedProductIDs {
    var offeredStatus string
    err := h.db.QueryRow("SELECT status FROM products WHERE id = ?", productID).Scan(&offeredStatus)
    // This runs once per offered product
}

// Also happens when fetching seller_id for each product
if err := tx.QueryRow("SELECT seller_id FROM products WHERE id = ?", pid).Scan(&ownerID)
```

**Impact:** `HIGH` - If user offers 5 items, this runs 5 separate queries instead of 1

**Fix:**
```go
// ✅ SOLUTION: Use IN clause for batch lookup
query := `
    SELECT id, status, seller_id FROM products 
    WHERE id IN (` + strings.Repeat("?,", len(payload.OfferedProductIDs)-1) + "?)"

rows, err := h.db.Query(query, toInterfaces(payload.OfferedProductIDs)...)
productMap := make(map[int]ProductInfo)
for rows.Next() {
    var id int
    var status string
    var sellerID int
    rows.Scan(&id, &status, &sellerID)
    productMap[id] = ProductInfo{Status: status, SellerID: sellerID}
}

// Use productMap instead of individual queries
for _, pid := range payload.OfferedProductIDs {
    info := productMap[pid]
    // Use info.Status and info.SellerID
}
```

---

### 🔴 CRITICAL: Missing Database Indexes

**Current Slow Queries Identified:**

1. **Messages polling (3 seconds interval)**
   ```sql
   -- Missing index on (trade_id, created_at)
   SELECT * FROM trade_messages WHERE trade_id = ? ORDER BY created_at ASC
   ```
   **Fix:**
   ```sql
   CREATE INDEX idx_trade_messages_trade_created ON trade_messages(trade_id, created_at);
   ```

2. **Trade lookup queries**
   ```sql
   -- Missing index on (buyer_id, status)
   SELECT id FROM trades WHERE buyer_id = ? AND status IN (...)
   ```
   **Fix:**
   ```sql
   CREATE INDEX idx_trades_buyer_status ON trades(buyer_id, status);
   CREATE INDEX idx_trades_seller_status ON trades(seller_id, status);
   CREATE INDEX idx_trades_target_product ON trades(target_product_id);
   ```

3. **Product availability checks (LIKE query)**
   ```sql
   -- This does full table scan
   SELECT id, title, category, price FROM products WHERE title LIKE '%Guitar%'
   ```
   **Fix:** Use FULLTEXT search instead
   ```sql
   ALTER TABLE products ADD FULLTEXT INDEX ftx_title (title);
   SELECT id, title, category, price FROM products 
   WHERE MATCH(title) AGAINST('Guitar' IN BOOLEAN MODE);
   ```

4. **Delivery tracking queries**
   ```sql
   -- Missing index on trade_id
   SELECT * FROM deliveries WHERE trade_id = ? AND status = ?
   ```
   **Fix:**
   ```sql
   CREATE INDEX idx_deliveries_trade_status ON deliveries(trade_id, status);
   ```

**Estimated Impact:** `HIGH` - Reduces query time by 80-95% for indexed columns

---

### 🟡 MEDIUM: Query Bloat - SELECT * Over-fetching

**Problem:** Frontend polls every 3 seconds and 10 seconds for messages and delivery:
```go
// Line 1395: Polls every 3 seconds
messagesPollRef.current = setInterval(() => fetchMessages({ showLoading: false }), 3000)

// Line 1432: Polls every 10 seconds  
const interval = setInterval(fetchLinkedDelivery, 10000)
```

**Current API likely returns all fields:**
```go
// ❌ Returns unnecessary fields (images, descriptions, etc)
SELECT * FROM trade_messages WHERE trade_id = ?
```

**Fix:**
```go
// ✅ Only fetch what's needed
SELECT id, sender_id, content, created_at FROM trade_messages WHERE trade_id = ?
```

**Estimated Impact:** `MEDIUM` - 30-50% bandwidth reduction

---

### 🟡 MEDIUM: Connection Pooling Not Optimized

**Problem:** No explicit connection pool configuration found. Go's `database/sql` has defaults that may not match traffic patterns.

**Fix for high-traffic app:**
```go
// In your database initialization
db.SetMaxOpenConns(50)      // Adjust based on CPU cores
db.SetMaxIdleConns(10)      // Keep warm connections
db.SetConnMaxLifetime(5 * time.Minute)
```

**Estimated Impact:** `MEDIUM` - Prevents connection exhaustion under load

---

### 🟢 LOW: Pagination - Currently Good

✅ Your queries use `LIMIT` pagination which is fine for now.  
⚠️ **Future consideration:** For large datasets (100K+ records), use cursor-based pagination to avoid OFFSET performance degradation.

---

## 2. BACKEND / API LEVEL

### 🔴 CRITICAL: Blocking Write Operations in Response Path

**Location:** `handlers/trade_handler.go` lines 247-258

```go
// ❌ BLOCKING: These are called inside request handler
publishNotification(sellerID, notifMsg)           // Network I/O
_ = h.db.Exec("INSERT INTO notifications ...")   // Database I/O
ensureConversation(...)                           // Database I/O
saveMessage(convID, userID, ...)                 // Database I/O
```

**Problem:** User waits for all these to complete before getting response. If any is slow, request hangs.

**Fix: Move to Background Queue**
```go
// ✅ Queue notification async
go func() {
    publishNotification(sellerID, notifMsg)
    h.db.Exec("INSERT INTO notifications ...")
    ensureConversation(...)
    // All happens in background
}()

// Return immediately
return c.Status(201).JSON(models.APIResponse{Success: true, Data: trade})
```

**Estimated Impact:** `HIGH` - Reduces response time by 200-500ms

---

### 🔴 CRITICAL: Loop Database Inserts

**Location:** `handlers/trade_handler.go` lines 200-211

```go
// ❌ PROBLEM: Called N times (once per offered product)
for _, pid := range payload.OfferedProductIDs {
    _, err := tx.Exec(
        "INSERT INTO trade_items (trade_id, product_id, offered_by) VALUES (?, ?, 'buyer')",
        tradeID, pid,
    )
}
```

**Fix: Batch Insert**
```go
// ✅ SOLUTION: Single multi-value INSERT
values := []interface{}{}
placeholders := []string{}
for _, pid := range payload.OfferedProductIDs {
    placeholders = append(placeholders, "(?, ?, 'buyer')")
    values = append(values, tradeID, pid)
}

query := fmt.Sprintf(
    "INSERT INTO trade_items (trade_id, product_id, offered_by) VALUES %s",
    strings.Join(placeholders, ","),
)
_, err := tx.Exec(query, values...)
```

**Estimated Impact:** `HIGH` - 5 items: 5 queries → 1 query

---

### 🟡 MEDIUM: API Cache Headers Missing

**Problem:** Every poll (3s, 10s) re-fetches data that's identical

**Fix: Add Cache Headers**
```go
// For messages endpoint
c.Set("Cache-Control", "private, max-age=2")  // 2 second cache
c.Set("ETag", generateETag(messages))

// For delivery status
c.Set("Cache-Control", "private, max-age=5")  // 5 second cache
```

**Estimated Impact:** `MEDIUM` - Reduces load by 30-50% if client honors cache

---

### 🟢 LOW: Consider POST/PUT Optimistic Caching

**Observation:** After `api.put('/api/trades/{id}/complete')`, app likely refetches full data.

**Example improvement:**
```typescript
// ❌ Current: Refetch everything
await api.put(`/api/trades/${trade.id}/complete`, {...})
await fetchCompletionStatus()  // Another full fetch

// ✅ Better: Optimistic update + verify
setCompletionStatus(prev => ({
    ...prev,
    buyer_completed: isUserBuyer ? true : prev.buyer_completed
}))
await api.put(`/api/trades/${trade.id}/complete`, {...})
// Refetch only if mutation response doesn't include updated data
```

**Estimated Impact:** `LOW` - Feels 200-300ms faster to user

---

## 3. FRONTEND LEVEL

### 🔴 CRITICAL: Excessive Polling Without Debouncing

**Location:** `client/src/components/ViewTradeModal.tsx` lines 1395, 1432

```typescript
// ❌ PROBLEM: Fires on EVERY modal re-render dependency change
messagesPollRef.current = setInterval(() => fetchMessages({ showLoading: false }), 3000)

// Also polling delivery every 10 seconds
const interval = setInterval(fetchLinkedDelivery, 10000)
```

**Issues:**
- If trade updates frequently, polling interval restarts every time
- No exponential backoff when trade is inactive
- Returns all messages instead of just new ones

**Fix:**
```typescript
// ✅ SOLUTION: Smart polling with back-off
const [pollInterval, setPollInterval] = useState(3000)
const [noChangeCount, setNoChangeCount] = useState(0)

useEffect(() => {
    if (!isOpen || !trade?.id) return
    
    const poll = async () => {
        const response = await api.get(
            `/api/trades/${trade.id}/messages?since=${lastMessageTime}&limit=50`
        )
        
        if (response.data?.data?.length === 0) {
            // No new messages - back off
            setNoChangeCount(prev => {
                const next = prev + 1
                setPollInterval(Math.min(30000, 3000 * Math.pow(1.5, next)))
                return next
            })
        } else {
            // New messages - reset interval
            setNoChangeCount(0)
            setPollInterval(3000)
        }
    }
    
    const interval = setInterval(poll, pollInterval)
    return () => clearInterval(interval)
}, [pollInterval, isOpen, trade?.id])
```

**Estimated Impact:** `HIGH` - Reduces polling by 70% after 30 seconds of inactivity

---

### 🔴 CRITICAL: Re-fetching Full Data After Updates

**Location:** `client/src/components/ViewTradeModal.tsx` line 756

```typescript
// ❌ Problem: Fetches entire trade after submit
await api.put(`/api/trades/${trade.id}/complete`, {...})
await fetchCompletionStatus()  // Full trade fetch
```

**Fix: Backend should return updated resource**
```typescript
// ✅ Better: Backend returns mutated data
const response = await api.put(`/api/trades/${trade.id}/complete`, {...})
setCompletionStatus(response.data.data)  // Use response, no refetch needed
```

**Or optimistic update:**
```typescript
// Optimistic: Update immediately
setCompletionStatus(prev => ({...prev, buyer_completed: true}))
try {
    await api.put(`/api/trades/${trade.id}/complete`, {...})
    // Success - no action needed, UI already updated
} catch (error) {
    // Revert on error
    await fetchCompletionStatus()
}
```

**Estimated Impact:** `HIGH` - Saves one network round-trip (200-500ms)

---

### 🟡 MEDIUM: Leaflet Map Re-rendering Inefficiency

**Location:** `client/src/components/ViewTradeModal.tsx` lines 67-83

```typescript
// ❌ Problem: setTimeout delays at 350ms, 700ms, 1000ms every modal open
// This is trying to work around Chakra animation timing
const timers = [
    setTimeout(() => map.invalidateSize(), 350),
    setTimeout(() => map.invalidateSize(), 600),
    setTimeout(() => map.invalidateSize(), 1000),
]
```

**Fix: Use MutationObserver instead**
```typescript
// ✅ Better: Detect when modal is actually visible
useEffect(() => {
    if (!isOpen || !mapContainer) return
    
    const observer = new ResizeObserver(() => {
        map.invalidateSize()
    })
    
    if (mapContainer) {
        observer.observe(mapContainer)
    }
    
    return () => observer.disconnect()
}, [isOpen])
```

**Estimated Impact:** `LOW` - Saves 1-2 unnecessary DOM measure cycles, but prevents jank

---

## 4. INFRASTRUCTURE

### 🔴 CRITICAL: No Apparent Caching Layer

**Problem:** All reads (messages, trades, deliveries) hit database every time.

**Fix: Implement Redis Caching**
```go
// Backend example
func (h *TradeHandler) GetMessages(c *fiber.Ctx) error {
    tradeID := c.Params("tradeID")
    cacheKey := fmt.Sprintf("messages:%s", tradeID)
    
    // Try cache first
    if cached, err := h.redis.Get(cacheKey); err == nil {
        return c.JSON(cached)
    }
    
    // Cache miss - fetch from DB
    messages, _ := h.db.Query("SELECT ... FROM trade_messages WHERE trade_id = ?", tradeID)
    
    // Cache for 2 seconds
    h.redis.Set(cacheKey, messages, 2*time.Second)
    
    return c.JSON(messages)
}
```

**Estimated Impact:** `HIGH` - Reduces response time by 90% for cached reads

---

### 🟡 MEDIUM: Database in Same Region as Server?

Ask yourself:
- Is database on same server as Go backend? (Best)
- Same datacenter? (Good, <5ms latency)
- Different region? (Bad, 50-200ms latency)

If different regions, **prioritize local read replicas**.

---

### 🟡 MEDIUM: Read Replica for High Read/Write Ratio

**Profile:** Marketplace heavily reads (messages, products, delivery status), lighter writes

**Fix:**
```go
// Route reads to replica, writes to primary
if method == "GET" {
    db = replicaPool
} else {
    db = primaryPool
}
```

**Estimated Impact:** `MEDIUM` - If using fair hardware, scales reads 5-10x

---

### 🟢 LOW: Static Assets CDN

Check if your frontend static files are served via CDN:
```bash
# Test if assets are cached
curl -I https://yoursite.com/static/app.js | grep "cache-control"
```

**If not cached:** Configure Cloudflare/AWS CloudFront to cache JS/CSS for 1 week.

---

## 5. DIAGNOSIS STEPS

### Enable Slow Query Logging (MySQL)

```sql
-- Enable slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 0.5;  -- Log queries > 500ms
SET GLOBAL log_queries_not_using_indexes = 'ON';

-- View slow queries
SELECT * FROM mysql.slow_log ORDER BY query_time DESC LIMIT 10;
```

### Analyze Query with EXPLAIN
```sql
EXPLAIN FORMAT=JSON
SELECT t.id, t.buyer_id, m.id as message_id
FROM trades t
LEFT JOIN trade_messages m ON t.id = m.trade_id
WHERE t.buyer_id = 41 AND t.status = 'active'
ORDER BY m.created_at DESC;
```

Look for:
- ❌ `"type": "ALL"` = Full table scan (bad)
- ✅ `"type": "ref"` = Using index (good)
- ❌ High `rows` examined relative to rows returned

### Identify Slowest API Endpoints

Use Go profiling:
```bash
# In main.go, add:
import _ "net/http/pprof"

# Then:
go func() {
    log.Println(http.ListenAndServe("localhost:6060", nil))
}()

# Profile for 30 seconds
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30

# View hot spots
(pprof) top10
```

Or use HTTP middleware:
```go
app.Use(func(c *fiber.Ctx) error {
    start := time.Now()
    err := c.Next()
    duration := time.Since(start)
    
    if duration > 200*time.Millisecond {
        log.Printf("SLOW: %s %s took %dms", c.Method(), c.Path(), duration.Milliseconds())
    }
    
    return err
})
```

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 hours)
- [ ] Add database indexes (trade_handler N+1 queries)
- [ ] Move notifications to background goroutine
- [ ] Implement batch insert for trade_items
- [ ] Add `only_needed_fields` selector to message queries

### Phase 2: Backend (4-6 hours)
- [ ] Implement Redis caching layer for messages/trades
- [ ] Add ETag support to read endpoints
- [ ] Convert loose polling to exponential backoff  
- [ ] Add response compression with `Content-Encoding: gzip`

### Phase 3: Frontend (2-3 hours)
- [ ] Fix optimistic updates for trade completion
- [ ] Implement smart message polling with `since` parameter
- [ ] Replace setTimeout delays with ResizeObserver for map
- [ ] Cache localStorage for recent trades/messages

### Phase 4: Infrastructure (1-2 hours)
- [ ] Enable slow query logging
- [ ] Set up read replica (if feasible)
- [ ] Configure CDN for static assets
- [ ] Add APM/monitoring (DataDog, New Relic)

---

## Expected Results

| Fix | Before | After | Impact |
|-----|--------|-------|--------|
| N+1 Queries | 5 queries, 50ms | 1 query, 5ms | 90% faster |
| Batch Inserts | 5 INSERTs, 15ms | 1 INSERT, 2ms | 87% faster |
| Background Ops | 500ms response | 50ms response | 90% faster |
| Redis Caching | 100ms DB hit | 5ms cache hit | 95% faster |
| Smart Polling | 20 requests/min | 5 requests/min | 75% less load |
| Indexes | FTS: 200ms LIKE | 2ms index lookup | 99% faster |

**Combined estimated improvement:** 4-6x faster response times, 60-80% less server load
