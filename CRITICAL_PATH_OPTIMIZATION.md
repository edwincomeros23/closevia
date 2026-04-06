# Critical Path Optimization - Lighthouse Findings Analysis

## Executive Summary
**Current Critical Path Latency: 9,918 ms** ❌  
**Target: < 3,000 ms** (3 seconds for LCP)

### Root Causes
1. **Sequential API calls** - `/user/58/stats` waits for all previous requests (9,918 ms!)
2. **Bundle bloat** - Main JS is 474.61 KiB (should be <200 KiB)
3. **Blocking requests** - Non-critical API calls delay page render
4. **No request batching** - 11 separate requests on initial load

---

## ISSUE #1: Sequential API Waterfall 🔴 CRITICAL

### Current Waterfall (Sequential)
```
1. /products/shoulder-bag (292ms) ──────────┐
2. /assets/index-B6laTobM.js (1,562ms) ────┤
3. /webConfig (1,998ms) ────────────────────┤
4. [counterfeit check] (5,043ms) ────────────┤
5. /ai/response-metrics (3,570ms) ──────────┤
6. /user/58?page=1 (4,348ms) ────────────────┤
7. /user/58/stats (9,918ms) ◄── LAST BLOCKER
8. /users/58 (5,803ms) ─────────────────────┤
9. /campaigns/active (4,331ms) ──────────────┘
```

**Problem:** Each request waits for the previous one to complete. The stats endpoint at 9,918ms is the last and blocks everything.

### Solution: Parallel Requests Instead of Sequential

#### Backend Fix: Combine Related Endpoints

**Before (9 separate calls):**
```typescript
// ❌ Current: Sequential horror
const product = await api.get(`/products/${slug}`)
const counterfeit = await api.get(`/products/${productId}/counterfeit/${reportId}`)
const metrics = await api.get(`/ai/response-metrics?user_id=58`)
const userPage = await api.get(`/user/58?page=1`)
const stats = await api.get(`/user/58/stats`)  // ◄── 9,918ms!
const userProfile = await api.get(`/users/58`)
const campaigns = await api.get(`/campaigns/active`)
```

**After (Batched calls):**
```typescript
// ✅ Solution: Parallel requests + combined endpoints
const [product, counterfeit, userProfile, campaigns] = await Promise.all([
    api.get(`/products/${slug}`),
    api.get(`/products/${productId}/counterfeit/${reportId}`),
    api.get(`/users/58?include=stats,profile,metrics`),  // ◄── BATCHED!
    api.get(`/campaigns/active`)
])

// Estimated time: ~5s (fastest request determines, not sum)
```

#### Backend: Create Composite Endpoint

**Add this endpoint to `/handlers/user_handler.go`:**

```go
// GET /api/users/:id/dashboard (combines stats, profile, metrics)
func (h *UserHandler) GetUserDashboard(c *fiber.Ctx) error {
    userID := c.Params("id")
    
    // Start all requests in parallel using goroutines
    statsChan := make(chan interface{})
    profileChan := make(chan interface{})
    metricsChan := make(chan interface{})
    
    go func() {
        stats, _ := h.getUserStats(userID)
        statsChan <- stats
    }()
    
    go func() {
        profile, _ := h.getUserProfile(userID)
        profileChan <- profile
    }()
    
    go func() {
        metrics, _ := h.getUserMetrics(userID)
        metricsChan <- metrics
    }()
    
    // Wait for all to complete
    dashboard := map[string]interface{}{
        "stats":    <-statsChan,
        "profile":  <-profileChan,
        "metrics":  <-metricsChan,
    }
    
    // Set cache headers
    c.Set("Cache-Control", "public, max-age=30")
    return c.JSON(dashboard)
}
```

**Impact:** `HIGH` - Reduces 9,918 ms to ~5,000 ms (50% improvement)

---

### Frontend: Fetch in Parallel, Not Sequential

**Location:** `client/src/pages/ProductDetail.tsx` or similar

**Before:**
```typescript
// ❌ Bad: Awaits each call sequentially
const product = await api.get(`/products/${slug}`)
const report = await api.get(`/products/${product.id}/counterfeit/218`)
const userStats = await api.get(`/user/${userId}/stats`)
const userProfile = await api.get(`/users/${userId}`)
```

**After:**
```typescript
// ✅ Good: All requests fire at once
const [product, userProfile] = await Promise.all([
    api.get(`/products/${slug}`),
    api.get(`/users/${userId}/dashboard`),  // ◄── Composite endpoint
])

// Then handle counterfeit check in background (not blocking)
api.get(`/products/${product.id}/counterfeit/218`).then(report => {
    setCounterfeitStatus(report)
})
```

**Estimated Impact:** `HIGH` - 40-50% latency reduction

---

## ISSUE #2: Bundle Size Is Too Large 🔴 CRITICAL

**Current:** 474.61 KiB (1,562 ms download)  
**Target:** < 150 KiB (400-500 ms download)

### Analysis: Where Are the 474 KiB Coming From?

Run this to analyze:
```bash
cd client
npm run build
npm install --save-dev webpack-bundle-analyzer
```

Then add to `vite.config.ts`:
```typescript
import { visualizer } from 'rollup-plugin-visualizer'

export default {
  plugins: [
    visualizer({
      open: true,
      gzipSize: true,
    })
  ]
}
```

### Code Splitting Strategy

**Location:** `client/src/App.tsx`

**Before (All in one bundle):**
```typescript
// ❌ All components in main bundle
import ViewTradeModal from './components/ViewTradeModal'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/AdminDashboard'
import ProductUploadFlow from './components/ProductUploadFlow'
```

**After (Lazy loaded):**
```typescript
// ✅ Code split: Only load when needed
const ViewTradeModal = lazy(() => import('./components/ViewTradeModal'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const ProductUploadFlow = lazy(() => import('./components/ProductUploadFlow'))

// Bundle size breakdown:
// - main bundle: 150 KiB (core)
// - viewtrademodal.chunk: 80 KiB (loaded on trade page)
// - admin.chunk: 60 KiB (only for admin)
// - productupload.chunk: 50 KiB (only on add product)
```

### Remove Unused Dependencies

```bash
# Analyze what's taking space
npm list --depth=0

# Check for duplicates
npm dedupe

# Remove unused packages (common culprits)
npm uninstall unused-package
```

**Common bloat in Clovia:**
- ❌ Leaflet + Mapbox (are both needed?)
- ❌ Multiple UI libraries
- ❌ Heavy date libraries (use lightweight alternative)
- ❌ Unused icon packs

**Suggested removals:**
```bash
# If only using Leaflet, remove Mapbox
npm uninstall mapbox-gl

# Replace moment.js (70 KiB) with date-fns (13 KiB)
npm uninstall moment
npm install date-fns
```

### Tree Shaking

Ensure `package.json` has:
```json
{
  "sideEffects": false,
  "module": "dist/index.esm.js"
}
```

And in `vite.config.ts`:
```typescript
export default {
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
  }
}
```

**Estimated Impact:** `HIGH` - Reduce bundle 474 KiB → 150 KiB (68% reduction, 1,562 ms → 400 ms)

---

## ISSUE #3: Render-Blocking Resources 🔴 CRITICAL

### Current Blocking Chain
```
CSS → RENDER BLOCKED → JS → RENDER BLOCKED → API Calls
```

### Solution: Preload Critical Resources

**Location:** `client/index.html`

**Before:**
```html
<!-- ❌ Default: Blocks rendering -->
<link rel="stylesheet" href="/assets/index-CIt22JOp.css">
<script type="module" src="/src/main.tsx"></script>
```

**After:**
```html
<!-- ✅ Preload critical, defer non-critical -->

<!-- 1. Preload fonts (critical for LCP) -->
<link rel="preload" href="/fonts/Poppins-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/Poppins-600.woff2" as="font" type="font/woff2" crossorigin>

<!-- 2. Inline critical CSS (above-the-fold only) -->
<style>
  /* Critical styles: layout, fonts, hero image ~ 2-3 KiB */
  body { font-family: Poppins, sans-serif; }
  .hero { background: url(...); }
  .container { max-width: 1200px; margin: 0 auto; }
</style>

<!-- 3. Defer non-critical CSS -->
<link rel="stylesheet" href="/assets/index-CIt22JOp.css" media="print" onload="this.media='all'">

<!-- 4. Add loading="eager" to JS if critical, else defer -->
<script type="module" src="/src/main.tsx"></script>
```

**Estimated Impact:** `HIGH` - Reduces CSS blocking by 500 ms

---

## ISSUE #4: Defer Non-Critical API Calls 🟡 MEDIUM

### Current: All APIs Fire on Page Load
```
Product Load (Critical) ──┐
                          ├─ Render Page
Stats Load (Non-Critical)─┘
```

### Solution: Load Critical First, Defer Others

**Location:** `client/src/pages/ProductDetail.tsx`

```typescript
// ✅ SOLUTION: Fetch in priority order

// TIER 1 (Critical): Load ASAP (blocks initial render)
const [product, sellerProfile] = useState(null)
useEffect(() => {
    const loadCritical = async () => {
        const [p, seller] = await Promise.all([
            api.get(`/products/${slug}`),
            api.get(`/users/${sellerId}`)
        ])
        setProduct(p)
        setSellerProfile(seller)
    }
    loadCritical()
}, [slug, sellerId])

return (
    <div>
        {product && <ProductImages {...product} />}
        {sellerProfile && <SellerCard {...sellerProfile} />}
        
        {/* TIER 2: Placeholder while loading non-critical content */}
        <StatsSkeleton />
        <ReviewsSkeleton />
    </div>
)

// TIER 2 (Nice-to-have): Load after page renders, show skeletons
useEffect(() => {
    if (!product) return
    
    // Low priority: Use requestIdleCallback to load when browser is idle
    const loadNonCritical = async () => {
        const [stats, reviews, campaigns] = await Promise.all([
            api.get(`/user/${sellerId}/stats`),
            api.get(`/products/${product.id}/reviews`),
            api.get(`/campaigns/active`)
        ])
        setStats(stats)
        setReviews(reviews)
        setCampaigns(campaigns)
    }
    
    // Load when idle (native browser optimization)
    if ('requestIdleCallback' in window) {
        requestIdleCallback(loadNonCritical, { timeout: 2000 })
    } else {
        setTimeout(loadNonCritical, 500)
    }
}, [product?.id, sellerId])
```

**Estimated Impact:** `HIGH` - Reduces perceived load time by deferring non-critical data

---

## ISSUE #5: Missing Image Optimization 🟡 MEDIUM

### Current: Likely Serving Full Resolution Images
```
Product image: 500 KiB (high resolution)
Seller avatar: 200 KiB
```

### Solution: Responsive Images + WebP

**Location:** HTML templates

**Before:**
```html
<!-- ❌ Serves full resolution to all devices -->
<img src="/uploads/product-full.jpg" />
```

**After:**
```html
<!-- ✅ Responsive + modern format -->
<picture>
  <source srcset="/uploads/product-400w.webp" media="(max-width: 640px)" type="image/webp">
  <source srcset="/uploads/product-800w.webp" media="(max-width: 1024px)" type="image/webp">
  <source srcset="/uploads/product-full.webp" type="image/webp">
  <source srcset="/uploads/product-400w.jpg" media="(max-width: 640px)">
  <source srcset="/uploads/product-800w.jpg" media="(max-width: 1024px)">
  <img src="/uploads/product-full.jpg" alt="Product" loading="lazy">
</picture>
```

Or use simpler approach with `srcset`:
```html
<img 
  srcset="
    /uploads/product-400w.webp 400w,
    /uploads/product-800w.webp 800w,
    /uploads/product-full.webp 1600w"
  sizes="(max-width: 640px) 90vw, (max-width: 1024px) 80vw, 1200px"
  src="/uploads/product-full.jpg"
  loading="lazy"
/>
```

**Estimated Impact:** `MEDIUM` - 30-50% image size reduction via WebP + responsive sizes

---

## ISSUE #6: Eliminate Cumulative Layout Shift (CLS) 🟡 MEDIUM

### Problem: Images/ads cause layout shift → User sees jarring jumps

**Location:** Images and placeholders in `ProductDetail.tsx`

**Before:**
```typescript
// ❌ Image has no size → causes layout shift when loads
<img src={imageUrl} />
```

**After:**
```typescript
// ✅ Reserve space for image using aspect-ratio
<div style={{ aspectRatio: '4/3', background: '#f0f0f0' }}>
  <img 
    src={imageUrl} 
    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
  />
</div>

// Or with Chakra:
<Box aspectRatio="4/3" bg="gray.100">
  <Image src={imageUrl} w="100%" h="100%" objectFit="cover" />
</Box>
```

**Estimated Impact:** `LOW` - Improves UX metric (CLS < 0.1)

---

## Complete Implementation Checklist

### Phase 1: Quick Wins (1 day, 25% improvement)
- [ ] Create composite `/api/users/:id/dashboard` endpoint
- [ ] Parallelize frontend API calls (remove sequential awaits)
- [ ] Inline critical CSS
- [ ] Defer non-critical JS chunks
- [ ] Add `requestIdleCallback` for low-priority data

**Estimated Result:** 9,918 ms → ~7,400 ms

### Phase 2: Bundle Optimization (1-2 days, 40% improvement)
- [ ] Run bundle analyzer
- [ ] Code split lazy routes
- [ ] Remove unused dependencies
- [ ] Replace heavy libraries (moment.js → date-fns)
- [ ] Enable gzip compression

**Estimated Result:** 7,400 ms → ~4,400 ms

### Phase 3: Image & Asset Optimization (1 day, 20% improvement)
- [ ] Convert images to WebP with fallbacks
- [ ] Add responsive image sizes
- [ ] Implement `loading="lazy"` for below-fold images
- [ ] Add font `preload` directives
- [ ] Enable GZIP compression on CDN

**Estimated Result:** 4,400 ms → ~3,500 ms

### Phase 4: Caching & Infrastructure (1-2 days, 30% improvement)
- [ ] Add `Cache-Control` headers (30-60s for API, 1yr for assets)
- [ ] Enable HTTP/2 push
- [ ] Deploy CDN for static assets
- [ ] Add database read replicas
- [ ] Implement Redis caching

**Estimated Result:** 3,500 ms → ~2,500 ms (Target achieved! ✅)

---

## Expected Timeline Improvements

| Phase | Action | Before | After | Improvement |
|-------|--------|--------|-------|-------------|
| 1 | Composite endpoints + parallel | 9,918ms | 7,400ms | -25% |
| 2 | Bundle split (474KB→150KB) | 7,400ms | 4,400ms | -40% |
| 3 | Image optimization | 4,400ms | 3,500ms | -20% |
| 4 | Caching + CDN | 3,500ms | 2,500ms | -28% |
| **FINAL** | **All implemented** | **9,918ms** | **2,500ms** | **-75%** 🎉 |

---

## LCP Monitoring Script

Add to track progress:

```typescript
// Track LCP improvement
let lcpSupported = 'PerformanceObserver' in window;

if (lcpSupported) {
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    console.log('LCP:', lastEntry.renderTime || lastEntry.loadTime);
    
    // Send to analytics
    analytics.track('LCP', { duration: lastEntry.renderTime || lastEntry.loadTime })
  });
  
  observer.observe({ entryTypes: ['largest-contentful-paint'] });
}
```

---

## Critical Path Summary

```
BEFORE:
┌─────────────────────────────────────────────────────────┐
│ 9,918ms Critical Path (Sequential requests)            │
│                                                          │
│ 292ms  100ms   1,562ms  1,910ms   5,043ms   9,918ms   │
│  ↓      ↓       ↓        ↓         ↓         ↓☠️        │
│ [Product]──[CSS]──[JS]──[Firebase]──[Stats]──[Timeout] │
└─────────────────────────────────────────────────────────┘

AFTER:
┌──────────────────────────────────────────────────────┐
│ 2,500ms Critical Path (Parallel requests)          │
│                                                      │
│ 292ms  100ms   500ms   1,500ms   500ms  500ms     │
│  ↓      ↓       ↓        ↓       ↓     ↓         │
│[Product]──[Fonts]──[CSS]──[JS]──[API]─[Idle]     │
└──────────────────────────────────────────────────────┘

✅ 75% improvement (9,918ms → 2,500ms)
✅ Achieves Lighthouse "Good" score (LCP < 2.5s)
```
