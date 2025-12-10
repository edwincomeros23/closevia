# Student Product Ads Component - Implementation Guide

## Overview

The **StudentAdInjector** component provides a demo-ready solution for integrating student product advertisements (from Shopee) into the product listing grid. It seamlessly injects ads every 3-6 products without affecting actual functionality.

## Features

✅ **Automatic Ad Injection** - Randomly inserts ads every 3-6 products  
✅ **Shopee Integration** - Clickable ads that open Shopee links in new tabs  
✅ **Fallback Images** - Uses placeholder SVG if product images unavailable  
✅ **Seamless Layout** - Ads match the product card grid styling  
✅ **Ad Cycling** - Automatically cycles through multiple ads for variety  
✅ **Demo-Safe** - Does not affect actual product functionality  
✅ **Fully Configurable** - Support for custom ads and insertion intervals  

## File Structure

```
client/src/
├── components/
│   └── StudentAdInjector.tsx    (Ad injection logic & components)
├── pages/
│   └── Home.tsx                  (Modified to include ads)
```

## Components & Exports

### StudentAdInjector.tsx

#### 1. **StudentAd Interface**
```typescript
interface StudentAd {
  id: string
  title: string
  imageUrl?: string
  shopeeLink: string
  price?: string
  rating?: number
  category?: string
}
```

#### 2. **useStudentAdInjection Hook**
Hook that calculates ad insertion positions and manages ad cycling.

```typescript
const { 
  ads, 
  insertionPositions,        // Array of positions where ads appear
  shouldInsertAdAt,          // Check if position has ad
  getAdForPosition,          // Get specific ad at position
  getAdIndexAt               // Get ad index at position
} = useStudentAdInjection(
  productCount,              // Total products count
  customAds,                 // Optional custom ads
  { min: 3, max: 6 }        // Insertion interval (products between ads)
)
```

#### 3. **StudentAdCard Component**
Renders a single ad card in the grid.

```typescript
<StudentAdCard ad={studentAd} />
```

#### 4. **Default Shopee Links**
Pre-configured with 5 sample student products:
- Student Backpack - Water Resistant (₱499)
- LED Desk Lamp for Study (₱299)
- Wireless Earbuds for Students (₱899)
- Portable Power Bank 20000mAh (₱599)
- Notebook Set - Quality Paper (₱189)

## Usage in Home.tsx

The component is already integrated in `Home.tsx`. The product grid now uses `ProductGridWithAds` component:

```typescript
<ProductGridWithAds products={products} user={user} />
```

**How it works:**
1. Filters available products (excluding user's own items)
2. Calculates random positions for ad insertion (every 3-6 products)
3. Combines products and ads into a single array
4. Renders grid with product cards and ad cards mixed together
5. Ads cycle through the default 5 student products

## Customization

### Option 1: Use Default Ads
No configuration needed. Ads will automatically inject using default Shopee links.

```typescript
const { shouldInsertAdAt, getAdForPosition } = useStudentAdInjection(
  filteredProducts.length
)
```

### Option 2: Provide Custom Ads
Pass custom ads array:

```typescript
const customAds: StudentAd[] = [
  {
    id: 'custom-1',
    title: 'Your Product Title',
    imageUrl: 'https://your-image-url.jpg',
    shopeeLink: 'https://shopee.ph/your-product',
    price: '₱999',
    rating: 4.8,
    category: 'Your Category'
  }
]

const { shouldInsertAdAt } = useStudentAdInjection(
  filteredProducts.length,
  customAds  // Pass custom ads here
)
```

### Option 3: Adjust Insertion Interval
Change how frequently ads appear:

```typescript
// Ads every 2-5 products
const { shouldInsertAdAt } = useStudentAdInjection(
  filteredProducts.length,
  undefined,
  { min: 2, max: 5 }  // Change interval
)

// Ads every 5-8 products
const { shouldInsertAdAt } = useStudentAdInjection(
  filteredProducts.length,
  undefined,
  { min: 5, max: 8 }
)
```

### Option 4: Use StudentAdInjector Component
For more control, use the main component:

```typescript
import StudentAdInjector from '../components/StudentAdInjector'

<StudentAdInjector 
  productCount={products.length}
  customAds={optionalCustomAds}
  insertionInterval={{ min: 3, max: 6 }}
  onAdsLoaded={(ads) => console.log('Ads loaded:', ads)}
/>
```

## Ad Styling

### Visual Features
- **Orange gradient background** - Stands out from product cards
- **SHOPEE AD badge** - Clear identification as sponsored content
- **Star rating** - Displays product rating from Shopee
- **CTA Button** - "View on Shopee" button with external link icon
- **Hover effect** - Lifts up with shadow on hover

### Color Scheme
- Primary: `orange` (colorScheme)
- Accent: `orange.300` - `orange.400` (borders)
- Background: Gradient `#fff9e6` to `#fffdf1`
- Badges: Orange, Blue, Yellow variants

## Demo Data

### Default Shopee Links
The component includes 5 pre-configured student product ads:

| Product | Price | Rating | Link |
|---------|-------|--------|------|
| Student Backpack | ₱499 | 4.8⭐ | Shopee Link |
| LED Desk Lamp | ₱299 | 4.7⭐ | Shopee Link |
| Wireless Earbuds | ₱899 | 4.6⭐ | Shopee Link |
| Power Bank 20000mAh | ₱599 | 4.9⭐ | Shopee Link |
| Notebook Set | ₱189 | 4.5⭐ | Shopee Link |

### Placeholder Images
If Shopee images fail to load, ads fall back to a placeholder SVG showing:
- Light blue gradient background
- "Student Product" text
- Automatic fallback on image load errors

## Implementation Flow

```
Home.tsx
├── Fetches products from API
├── Filters products (available status, not user's items)
├── Passes to ProductGridWithAds component
│
└── ProductGridWithAds
    ├── Calls useStudentAdInjection hook
    ├── Calculates insertion positions (random 3-6 products apart)
    ├── Builds combined items array [product, ad, product, ...]
    ├── Renders Grid with proper spacing
    │
    └── For each item:
        ├── If 'product' type → StudentAdCard NOT rendered
        └── If 'ad' type → StudentAdCard rendered (orange background, CTA button)
```

## Features & Behaviors

### Automatic Ad Cycling
- If only 4 default ads exist and 10 positions need filling
- Ads cycle through automatically (ad 0 → 1 → 2 → 3 → 0 → ...)
- Each position gets a unique ad for variety

### Responsive Layout
- Mobile (2 columns): Ads display full width in 2-column grid
- Tablet (3 columns): Ads display in 3-column layout
- Desktop (4+ columns): Ads scale appropriately

### Accessibility
- Keyboard navigation support (Enter/Space to open link)
- ARIA labels and semantic HTML
- High contrast badges for readability
- External link icon indicates new tab opening

### Performance
- No API calls needed (uses default or provided ads)
- Lightweight hook calculations
- Efficient array mapping and filtering
- No database impact or actual data modification

## Troubleshooting

### Ads Not Appearing
**Issue**: No ads show in the grid  
**Solution**: 
- Check if products.length > 0
- Verify insertion interval doesn't exceed product count
- Check browser console for errors

### Shopee Links Not Working
**Issue**: Clicking ad doesn't open Shopee  
**Solution**:
- Verify `shopeeLink` is correct URL format
- Check popup blocker isn't preventing new tabs
- Test link manually in new tab

### Images Not Loading
**Issue**: Placeholder appears instead of product image  
**Solution**:
- This is expected behavior - fallback is automatic
- Update `imageUrl` with working image URL
- Check image URL protocol (http/https)

### Insertion Interval Too Frequent
**Issue**: Ads appearing too often (more than every 3 products)  
**Solution**:
```typescript
// Increase interval
{ min: 5, max: 8 }  // Ads appear less frequently
```

## Production Considerations

### Before Going Live
1. **Replace sample links** with actual Shopee affiliate/partner links
2. **Update images** with verified product images (not placeholder)
3. **Adjust interval** based on products per page
4. **Test responsiveness** on all device sizes
5. **Verify links** open correct Shopee pages
6. **Add tracking** (optional) - add analytics to link clicks
7. **Review styling** - ensure ads match brand guidelines

### Optional Enhancements
- Add click tracking/analytics
- Implement A/B testing for different intervals
- Dynamic ad rotation based on time of day
- Category-specific ads based on search filters
- Seasonal ad campaigns
- User preference-based ad display

## API Integration

The component is **completely independent** from actual product data:
- ✅ No backend API calls
- ✅ No database modifications
- ✅ No user trade/purchase system affected
- ✅ Safe for demo presentations
- ✅ Can be toggled on/off easily

## Example: Toggle Ads for Presentation

```typescript
// In Home.tsx
const ENABLE_ADS = true  // Toggle ads for demo

// In ProductGridWithAds
const ProductGridWithAds = ({ products, user }) => {
  if (!ENABLE_ADS) {
    // Render without ads
    return <StandardProductGrid products={products} />
  }
  
  // Render with ads
  return <GridWithAdInjection products={products} />
}
```

## Support

For questions or issues:
1. Check console for error messages
2. Verify component imports are correct
3. Ensure types match `StudentAd` interface
4. Test with default ads first before customizing

---

**Last Updated**: December 2024  
**Component Version**: 1.0  
**Status**: Production Ready
