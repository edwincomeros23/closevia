# Student Ads - Customization Examples

## Scenario 1: Use Shopee Links You Provide

**Requirement**: Use your own Shopee links instead of defaults

**Solution**:

```typescript
// In Home.tsx or ProductGridWithAds component
import { useStudentAdInjection, StudentAd } from '../components/StudentAdInjector'

const customShopeeAds: StudentAd[] = [
  {
    id: 'my-shopee-1',
    title: 'Gaming Mouse - High DPI',
    imageUrl: 'https://cf.shopee.ph/file/gaming-mouse-image.jpg',
    shopeeLink: 'https://shopee.ph/Gaming-Mouse-High-DPI-p-123456789',
    price: '₱1,299',
    rating: 4.7,
    category: 'Gaming'
  },
  {
    id: 'my-shopee-2',
    title: 'USB-C Cable Pack - 3m',
    imageUrl: 'https://cf.shopee.ph/file/usb-cable-image.jpg',
    shopeeLink: 'https://shopee.ph/USB-C-Cable-Pack-3m-p-987654321',
    price: '₱199',
    rating: 4.5,
    category: 'Cables'
  },
  {
    id: 'my-shopee-3',
    title: 'Mechanical Keyboard RGB',
    imageUrl: 'https://cf.shopee.ph/file/keyboard-image.jpg',
    shopeeLink: 'https://shopee.ph/Mechanical-Keyboard-RGB-p-456789012',
    price: '₱2,499',
    rating: 4.9,
    category: 'Keyboards'
  },
  // Add more of your Shopee links...
]

// In ProductGridWithAds component
const { shouldInsertAdAt, getAdForPosition, getAdIndexAt } = useStudentAdInjection(
  filteredProducts.length,
  customShopeeAds  // ← Pass your custom ads
)
```

**Result**: Grid will use your Shopee links instead of defaults ✓

---

## Scenario 2: Change Ad Insertion Frequency

**Requirement**: Show ads more often (every 2-3 products) instead of 3-6

**Solution**:

```typescript
// In ProductGridWithAds component
const { shouldInsertAdAt } = useStudentAdInjection(
  filteredProducts.length,
  undefined,
  { min: 2, max: 3 }  // ← More frequent ads
)

// Result:
// Product 1, Product 2, [AD], Product 3, [AD], Product 4, [AD], ...
```

**Other interval examples**:

```typescript
// Ads every 4-6 products (default)
{ min: 4, max: 6 }

// Ads every 5-8 products (less frequent)
{ min: 5, max: 8 }

// Ads every 8-10 products (rare)
{ min: 8, max: 10 }

// Ads every exactly 5 products (fixed)
{ min: 5, max: 5 }

// Ads very frequent (every 1-2 products)
{ min: 1, max: 2 }
```

---

## Scenario 3: Add More Default Ads

**Requirement**: Expand default ads from 5 to 10 products

**Solution**:

Edit `StudentAdInjector.tsx`:

```typescript
const DEFAULT_SHOPEE_LINKS: StudentAd[] = [
  {
    id: 'ad-1',
    title: 'Student Backpack - Water Resistant',
    imageUrl: 'https://cf.shopee.ph/file/sg-11134201-7rblk-lym3z8t72a2iff',
    shopeeLink: 'https://shopee.ph/Student-Backpack-Water-Resistant-p-1234567890',
    price: '₱499',
    rating: 4.8,
    category: 'School Bags',
  },
  // ... existing 4 ads ...
  {
    id: 'ad-6',
    title: 'Portable Projector for Study',
    imageUrl: 'https://cf.shopee.ph/file/your-image-url',
    shopeeLink: 'https://shopee.ph/Portable-Projector-Study-p-new1234567',
    price: '₱3,999',
    rating: 4.6,
    category: 'Electronics',
  },
  {
    id: 'ad-7',
    title: 'Desk Organizer Set',
    imageUrl: 'https://cf.shopee.ph/file/your-image-url',
    shopeeLink: 'https://shopee.ph/Desk-Organizer-Set-p-new2345678',
    price: '₱399',
    rating: 4.4,
    category: 'Office',
  },
  {
    id: 'ad-8',
    title: 'Monitor Stand with USB',
    imageUrl: 'https://cf.shopee.ph/file/your-image-url',
    shopeeLink: 'https://shopee.ph/Monitor-Stand-USB-p-new3456789',
    price: '₱899',
    rating: 4.7,
    category: 'Accessories',
  },
  {
    id: 'ad-9',
    title: 'Webcam 1080p HD',
    imageUrl: 'https://cf.shopee.ph/file/your-image-url',
    shopeeLink: 'https://shopee.ph/Webcam-1080p-HD-p-new4567890',
    price: '₱1,299',
    rating: 4.8,
    category: 'Electronics',
  },
  {
    id: 'ad-10',
    title: 'Bluetooth Speaker - Waterproof',
    imageUrl: 'https://cf.shopee.ph/file/your-image-url',
    shopeeLink: 'https://shopee.ph/Bluetooth-Speaker-Waterproof-p-new5678901',
    price: '₱899',
    rating: 4.5,
    category: 'Audio',
  },
]
```

**Result**: Ads will cycle through 10 different products instead of 5 ✓

---

## Scenario 4: Use Partner Affiliate Links

**Requirement**: Link ads to your affiliate partner accounts

**Solution**:

```typescript
const affiliateAds: StudentAd[] = [
  {
    id: 'affiliate-1',
    title: 'Your Partner Product',
    imageUrl: 'https://partner-image-url.com/image.jpg',
    shopeeLink: 'https://shopee.ph/product?ref=YOUR_AFFILIATE_CODE',
    price: '₱999',
    rating: 4.8,
    category: 'Electronics'
  },
  // ... more affiliate links ...
]

// In ProductGridWithAds
const { shouldInsertAdAt } = useStudentAdInjection(
  filteredProducts.length,
  affiliateAds  // ← Your affiliate links
)
```

**Benefits**:
- Generate affiliate commissions
- Track clicks through referral codes
- Support partner businesses
- Diversify revenue streams

---

## Scenario 5: Category-Specific Ads

**Requirement**: Show different ads based on product category

**Solution**:

```typescript
const categoryAds = {
  'Electronics': [
    {
      id: 'elec-1',
      title: 'Laptop Stand',
      shopeeLink: 'https://shopee.ph/laptop-stand',
      // ...
    }
  ],
  'Books': [
    {
      id: 'book-1',
      title: 'Reading Light',
      shopeeLink: 'https://shopee.ph/reading-light',
      // ...
    }
  ],
  'Clothes': [
    {
      id: 'cloth-1',
      title: 'Backpack for School',
      shopeeLink: 'https://shopee.ph/backpack',
      // ...
    }
  ]
}

// In ProductGridWithAds
const ProductGridWithAds = ({ products, user, selectedCategory }) => {
  const filteredProducts = products.filter(
    (p) => p.status === 'available' && p.seller_id !== user?.id
  )

  // Get ads for current category
  const adsForCategory = categoryAds[selectedCategory] || DEFAULT_SHOPEE_LINKS

  const { shouldInsertAdAt } = useStudentAdInjection(
    filteredProducts.length,
    adsForCategory  // ← Category-specific ads
  )

  // ... rest of component
}
```

**Result**: When user selects "Electronics" category, see electronics ads. When they select "Books", see book-related ads. ✓

---

## Scenario 6: Disable Ads for Specific Users

**Requirement**: Don't show ads to logged-in premium users

**Solution**:

```typescript
const ProductGridWithAds = ({ products, user }) => {
  const filteredProducts = products.filter(
    (p) => p.status === 'available' && p.seller_id !== user?.id
  )

  // Check if user is premium
  const isPremiumUser = user?.premium === true

  // Build array differently based on user status
  let itemsWithAds = []

  if (isPremiumUser) {
    // No ads for premium users
    itemsWithAds = filteredProducts.map((product) => ({
      type: 'product',
      data: product,
    }))
  } else {
    // Regular users see ads
    const { shouldInsertAdAt, getAdForPosition } = useStudentAdInjection(
      filteredProducts.length
    )

    filteredProducts.forEach((product, idx) => {
      itemsWithAds.push({ type: 'product', data: product })
      if (shouldInsertAdAt(idx + 1)) {
        const ad = getAdForPosition(idx + 1)
        if (ad) itemsWithAds.push({ type: 'ad', data: ad })
      }
    })
  }

  // ... render grid
}
```

**Result**: Premium users see ad-free listing ✓

---

## Scenario 7: Time-Based Ad Rotation

**Requirement**: Show different ads depending on time of day

**Solution**:

```typescript
const timeBasedAds = {
  morning: [    // 6am - 12pm
    { id: 'coffee-1', title: 'Coffee Maker', /* ... */ },
    { id: 'lamp-1', title: 'Desk Lamp', /* ... */ },
  ],
  afternoon: [  // 12pm - 6pm
    { id: 'snack-1', title: 'Energy Snacks', /* ... */ },
    { id: 'fan-1', title: 'USB Fan', /* ... */ },
  ],
  evening: [    // 6pm - 12am
    { id: 'light-1', title: 'LED Lights', /* ... */ },
    { id: 'charger-1', title: 'Fast Charger', /* ... */ },
  ],
  night: [      // 12am - 6am
    { id: 'pillow-1', title: 'Neck Pillow', /* ... */ },
    { id: 'sleep-1', title: 'Sleep Mask', /* ... */ },
  ]
}

const getAdsByTime = () => {
  const hour = new Date().getHours()
  
  if (hour >= 6 && hour < 12) return timeBasedAds.morning
  if (hour >= 12 && hour < 18) return timeBasedAds.afternoon
  if (hour >= 18 && hour < 24) return timeBasedAds.evening
  return timeBasedAds.night
}

// In ProductGridWithAds
const adsForCurrentTime = getAdsByTime()

const { shouldInsertAdAt } = useStudentAdInjection(
  filteredProducts.length,
  adsForCurrentTime
)
```

**Result**: Different ads show based on time of day ✓

---

## Scenario 8: A/B Testing Different Intervals

**Requirement**: Test which ad frequency performs better

**Solution**:

```typescript
// User segmentation based on ID
const getIntervalForUser = (userId: string) => {
  const userHash = userId.charCodeAt(0) % 2
  
  if (userHash === 0) {
    return { min: 3, max: 5 }  // Group A: Every 3-5 products
  } else {
    return { min: 6, max: 8 }  // Group B: Every 6-8 products
  }
}

// In ProductGridWithAds
const ProductGridWithAds = ({ products, user }) => {
  const interval = getIntervalForUser(user?.id)
  
  const { shouldInsertAdAt } = useStudentAdInjection(
    filteredProducts.length,
    undefined,
    interval  // ← A/B test different intervals
  )
  
  // Track which group saw which interval
  console.log(`User ${user?.id} assigned to interval`, interval)
  
  // ... rest of component
}
```

**Result**: 50% of users see ads every 3-5 products, 50% see ads every 6-8 products ✓

---

## Scenario 9: Seasonal Ad Campaigns

**Requirement**: Show different ads during holiday seasons

**Solution**:

```typescript
const seasonalAds = {
  christmas: [
    { id: 'xmas-1', title: 'Gift Wrapping Set', /* ... */ },
    { id: 'xmas-2', title: 'LED String Lights', /* ... */ },
  ],
  newyear: [
    { id: 'ny-1', title: 'Planner & Notebook', /* ... */ },
    { id: 'ny-2', title: 'Goal-Setting Journal', /* ... */ },
  ],
  backtoschool: [
    { id: 'school-1', title: 'School Supplies Kit', /* ... */ },
    { id: 'school-2', title: 'Student Planner', /* ... */ },
  ],
  summer: [
    { id: 'summer-1', title: 'Beach Essentials', /* ... */ },
    { id: 'summer-2', title: 'Outdoor Speaker', /* ... */ },
  ],
  default: DEFAULT_SHOPEE_LINKS
}

const getSeasonalAds = () => {
  const month = new Date().getMonth()
  
  if (month === 11) return seasonalAds.christmas     // December
  if (month === 0) return seasonalAds.newyear        // January
  if (month === 7 || month === 8) return seasonalAds.backtoschool  // Aug-Sep
  if (month >= 5 && month <= 7) return seasonalAds.summer  // Jun-Aug
  
  return seasonalAds.default
}

// In ProductGridWithAds
const adsForSeason = getSeasonalAds()

const { shouldInsertAdAt } = useStudentAdInjection(
  filteredProducts.length,
  adsForSeason
)
```

**Result**: Different ads show based on current season/holiday ✓

---

## Scenario 10: Mix Default + Custom Ads

**Requirement**: Combine default ads with your own ads

**Solution**:

```typescript
import { useStudentAdInjection } from '../components/StudentAdInjector'

const yourCustomAds: StudentAd[] = [
  {
    id: 'custom-1',
    title: 'Your Special Product',
    shopeeLink: 'https://your-link.com',
    // ...
  }
]

// In ProductGridWithAds
const { ads: defaultAds } = useStudentAdInjection(
  0,
  [],
  { min: 1, max: 1 }
)

// Combine both
const allAds = [...defaultAds, ...yourCustomAds]

const { shouldInsertAdAt } = useStudentAdInjection(
  filteredProducts.length,
  allAds  // ← Mix of default + custom
)

// Result: Grid shows both default Shopee ads AND your custom ads
// Total rotation: 5 defaults + 1 custom = 6 different ads
```

**Result**: Ads cycle through all 6 products (5 default + 1 custom) ✓

---

## Quick Implementation Template

Use this template for quick customization:

```typescript
// ==========================================
// CUSTOMIZE BELOW
// ==========================================

const MY_CUSTOM_ADS: StudentAd[] = [
  {
    id: 'my-1',
    title: 'Your Product 1',
    imageUrl: 'YOUR_IMAGE_URL_1',
    shopeeLink: 'YOUR_SHOPEE_LINK_1',
    price: '₱XXX',
    rating: 4.8,
    category: 'Your Category'
  },
  // Add more ads...
]

const MY_INSERTION_INTERVAL = { min: 3, max: 6 }

// ==========================================
// IN ProductGridWithAds COMPONENT
// ==========================================

const { shouldInsertAdAt, getAdForPosition, getAdIndexAt } = useStudentAdInjection(
  filteredProducts.length,
  MY_CUSTOM_ADS,           // ← Use your custom ads
  MY_INSERTION_INTERVAL    // ← Use your interval
)

// Rest of component stays the same...
```

---

## Tips for Customization

1. **Image URLs**: Always use `https://` URLs, test URLs manually
2. **Shopee Links**: Verify links work before deploying
3. **Prices**: Keep realistic for demo credibility
4. **Ratings**: Use realistic ratings (4.0-5.0 range)
5. **Intervals**: Test with actual product counts (3-6 is balanced)
6. **Categories**: Match your business categories for consistency

---

**Last Updated**: December 2024  
**Examples Count**: 10 scenarios  
**Status**: Ready to implement
