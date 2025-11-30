# Student Ads Quick Reference

## What Was Built?

A **React ad injection system** that seamlessly integrates Shopee student product ads into your product listing every 3-6 products. Perfect for demos and presentations.

## Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `client/src/components/StudentAdInjector.tsx` | Created | Ad logic, components, hooks |
| `client/src/pages/Home.tsx` | Modified | Integration into product grid |

## Key Features

- ✅ **Default 5 Shopee Links** - Pre-configured student products
- ✅ **Random Insertion** - Ads appear every 3-6 products randomly
- ✅ **Automatic Cycling** - Cycles through all ads for variety
- ✅ **Fallback Images** - SVG placeholder if images unavailable
- ✅ **Clickable** - Opens Shopee in new tab when clicked
- ✅ **Responsive** - Works on mobile, tablet, desktop
- ✅ **Demo-Safe** - No impact on actual functionality

## How It Works

```
Product 1
Product 2
Product 3
[AD 1] ← Inserted randomly
Product 4
Product 5
Product 6
Product 7
[AD 2] ← Inserted randomly
...continues...
```

## Using Default Ads

**No setup needed!** Ads automatically inject using defaults:

```typescript
// In Home.tsx - Already integrated!
<ProductGridWithAds products={products} user={user} />
```

**Default Shopee Products:**
1. Student Backpack - ₱499
2. LED Desk Lamp - ₱299
3. Wireless Earbuds - ₱899
4. Power Bank - ₱599
5. Notebook Set - ₱189

## Custom Ads Example

To use your own ads, create an array:

```typescript
import { StudentAd } from '../components/StudentAdInjector'

const myAds: StudentAd[] = [
  {
    id: 'ad-1',
    title: 'Budget Laptop for Students',
    imageUrl: 'https://your-image.jpg',
    shopeeLink: 'https://shopee.ph/your-product',
    price: '₱4,999',
    rating: 4.9,
    category: 'Laptops'
  },
  // Add more ads...
]

// Pass to hook
const { shouldInsertAdAt } = useStudentAdInjection(
  productCount,
  myAds  // Your custom ads
)
```

## Hook Usage Reference

```typescript
import { useStudentAdInjection } from '../components/StudentAdInjector'

// Basic usage
const {
  ads,                    // Array of all ads
  shouldInsertAdAt,      // (index) => boolean
  getAdForPosition,      // (position) => StudentAd | null
  getAdIndexAt,          // (index) => number
  insertionPositions     // Array of where ads are placed
} = useStudentAdInjection(
  productCount,
  customAds,             // Optional
  { min: 3, max: 6 }    // Optional: insertion interval
)
```

## Customize Insertion Frequency

```typescript
// Ads more frequent (every 2-4 products)
{ min: 2, max: 4 }

// Ads less frequent (every 5-10 products)
{ min: 5, max: 10 }

// Ads every exactly 4 products
{ min: 4, max: 4 }
```

## Ad Card Styling

Ads are styled with:
- 🟠 Orange gradient background (stands out from products)
- 🏷️ "SHOPEE AD" badge in top-left
- ⭐ Rating badge in bottom-right
- 🔗 "View on Shopee" CTA button
- 📱 Responsive sizing to match product grid

## Image Handling

### Works With
- ✅ Direct image URLs (http/https)
- ✅ Shopee image URLs
- ✅ CloudFlare URLs
- ✅ Any standard image format (jpg, png, webp)

### Fallback
- If image fails to load → SVG placeholder shows
- Placeholder: Light blue gradient with "Student Product" text
- Automatic fallback, no manual intervention needed

## Implementation in Home.tsx

The component is already integrated! The product grid automatically:

1. **Fetches products** from API (existing logic)
2. **Filters products** (removes sold/user's own items)
3. **Calculates insertion positions** using `useStudentAdInjection`
4. **Mixes products and ads** in display order
5. **Renders combined grid** with Product + Ad cards

```typescript
// In ProductGridWithAds component
const filteredProducts = products.filter(
  (p) => p.status === 'available' && p.seller_id !== user?.id
)

const { shouldInsertAdAt, getAdForPosition } = useStudentAdInjection(
  filteredProducts.length
)

// Build array with ads inserted
const itemsWithAds = [
  { type: 'product', data: product1 },
  { type: 'product', data: product2 },
  { type: 'product', data: product3 },
  { type: 'ad', data: shopeeAd1 },      // ← Auto-injected
  { type: 'product', data: product4 },
  // ... continues with random insertion
]
```

## Testing Ads

### View Ads in Action
1. Open Home page
2. Scroll through product listing
3. Every 3-6 products, you'll see an orange ad card
4. Click ad to verify Shopee link opens

### Test Different Intervals

```typescript
// In ProductGridWithAds, change insertion interval
const { shouldInsertAdAt } = useStudentAdInjection(
  filteredProducts.length,
  undefined,
  { min: 2, max: 3 }  // More frequent for testing
)
```

### Test Custom Ads

```typescript
const testAds: StudentAd[] = [
  {
    id: 'test-1',
    title: 'Test Product',
    shopeeLink: 'https://shopee.ph/test',
  }
]

const { shouldInsertAdAt } = useStudentAdInjection(
  filteredProducts.length,
  testAds  // Override with test ads
)
```

## Demo Presentation Tips

### Before Demo
1. ✅ Test on target device (laptop, tablet, phone)
2. ✅ Verify all Shopee links are valid
3. ✅ Check images load properly
4. ✅ Test ad clicks open in new tab
5. ✅ Scroll through full product list

### During Demo
1. **Point out ad placement** - "Ads appear naturally every 3-6 products"
2. **Show ad styling** - "Distinct orange background identifies sponsored content"
3. **Click an ad** - "Opens Shopee in new tab (demo-safe, no actual purchases)"
4. **Scroll more** - "Different ads appear as you scroll (automatic cycling)"
5. **Mention flexibility** - "Easy to customize links, images, interval"

### Key Talking Points
- ✅ "Demo-ready - doesn't affect actual trading"
- ✅ "Works on mobile and desktop"
- ✅ "Automatically cycles through multiple ads"
- ✅ "Production-ready when you have real partner links"

## Disabling Ads for Testing

If you need to temporarily hide ads (to test regular product flow):

```typescript
// Option 1: Comment out ad injection
// return <StandardProductGrid products={products} />

// Option 2: Toggle with flag
const SHOW_ADS = true

const ProductGridWithAds = ({ products, user }) => {
  if (!SHOW_ADS) {
    return <Grid>/* Regular grid without ads */</Grid>
  }
  return <Grid>/* With ads injected */</Grid>
}
```

## Troubleshooting Checklist

| Problem | Solution |
|---------|----------|
| No ads appear | Verify products.length > 3 |
| Images not showing | Check URL format (must be http/https) |
| Links don't work | Verify shopeeLink is valid URL |
| Ads appear too often | Increase min/max interval values |
| Ads appear too rarely | Decrease min/max interval values |
| Styling looks off | Check Chakra UI version compatibility |

## Production Checklist

Before deploying to production:

- [ ] Replace placeholder links with real Shopee partner links
- [ ] Update images with verified product photos
- [ ] Adjust interval based on avg products shown (min: 3, max: 6 recommended)
- [ ] Test on all device sizes (mobile, tablet, desktop)
- [ ] Verify all links open correct pages
- [ ] Test on various browsers (Chrome, Safari, Firefox, Edge)
- [ ] Add analytics tracking (optional)
- [ ] Review brand compliance

## Code Reference

### Import Ad Components
```typescript
import { 
  useStudentAdInjection,    // Hook for ad logic
  StudentAdCard             // Component for rendering ad
} from '../components/StudentAdInjector'
```

### Create Custom Ad
```typescript
const ad: StudentAd = {
  id: 'unique-id',
  title: 'Product Name',
  imageUrl: 'https://image-url.jpg',
  shopeeLink: 'https://shopee.ph/product',
  price: '₱999',
  rating: 4.8,
  category: 'Category Name'
}
```

### Render Ad Card
```typescript
<StudentAdCard ad={ad} />
```

## Files Structure

```
Clovia/
├── client/
│   └── src/
│       ├── components/
│       │   └── StudentAdInjector.tsx        ← Ad component & logic
│       ├── pages/
│       │   └── Home.tsx                      ← Integration point
│       └── ...
├── Documentations/
│   ├── STUDENT_ADS_IMPLEMENTATION_GUIDE.md   ← Full guide
│   └── STUDENT_ADS_QUICK_REFERENCE.md        ← This file
└── ...
```

## Support & Questions

### Common Questions

**Q: Will this affect my product data?**  
A: No! Ads are completely separate. No database changes.

**Q: Can I use my own Shopee links?**  
A: Yes! Pass custom ads array with your links.

**Q: How often do ads appear?**  
A: Every 3-6 products by default (configurable).

**Q: Do I need to change anything else?**  
A: No! It's already integrated in Home.tsx.

**Q: Can I disable ads for testing?**  
A: Yes! Toggle the `SHOW_ADS` flag or swap components.

---

**Version**: 1.0  
**Status**: ✅ Production Ready  
**Created**: December 2024
