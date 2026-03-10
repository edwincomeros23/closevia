# Mobile-Optimized Product Upload Interface - Implementation Guide

## Overview

A complete 3-step product listing form with modern mobile-first design, smooth animations, and comprehensive user feedback.

## Components

### 1. **ProductUploadStep1.tsx** - Upload Media
**What it does:**
- Accepts up to 8 product images (JPEG, PNG, WebP • max 5MB each)
- Supports drag-and-drop and tap-to-upload
- Shows thumbnail strip with primary image indicator
- Optional video upload (MP4/MOV • max 50MB)
- Real-time image count and validation

**Features:**
- ✓ Drag-and-drop support
- ✓ Horizontal scrollable thumbnail strip
- ✓ Primary image selection (first thumbnail shows "Primary" badge)
- ✓ AI analysis status badge (when analyzed)
- ✓ Individual image removal
- ✓ Video upload with preview
- ✓ Mobile-optimized touch targets (min 44x44pt)
- ✓ Loading states and progress

### 2. **ProductUploadStep2.tsx** - Details & Preferences
**What it does:**
- Collects product title, description, category, condition
- Pricing configuration (allow buying, set price, or trade-only)
- Location information
- Barter/trading preferences
- AI-generated suggestions

**Features:**
- ✓ Character counters for title (60 max) and description (500 max)
- ✓ Category dropdown (pre-populated from FILTER_CATEGORIES)
- ✓ Condition selector (New, Like New, Good, Used, For Parts)
- ✓ Flexible pricing: Direct sale, Trade-only, or Both
- ✓ Dual-mode card for pricing options
- ✓ AI suggestions panel for optimization
- ✓ Form validation before proceeding

### 3. **ProductUploadStep3.tsx** - Review & Post
**What it does:**
- Full preview of all product information
- Quality checklist with progress indicators
- Terms & conditions acceptance
- One-click submission

**Features:**
- ✓ Image/video preview carousel
- ✓ Complete product details review
- ✓ Quality checklist with status indicators
- ✓ Terms acceptance checkbox (required to post)
- ✓ Loading overlay during submission
- ✓ Success/error handling

### 4. **ProductUploadFlow.tsx** - Main Container
**What it does:**
- Orchestrates all 3 steps
- Manages state across steps
- Handles API submission
- Navigation between steps

**Features:**
- ✓ Seamless step navigation
- ✓ Data persistence between steps
- ✓ API integration ready
- ✓ Success callback support

## Usage

### Basic Setup

```tsx
import ProductUploadFlow from '@/components/ProductUploadFlow'
import { useNavigate } from 'react-router-dom'

export const AddProductPage = () => {
  const navigate = useNavigate()

  return (
    <ProductUploadFlow
      onSuccess={(productId) => {
        // Navigate to product detail page
        navigate(`/products/${productId}`)
      }}
    />
  )
}
```

### Creating a Route

Add this to your router configuration:

```tsx
{
  path: '/add-product',
  element: <ProductUploadFlow onSuccess={(id) => navigate(`/product/${id}`)} />
}
```

## Design Highlights

### Mobile-First Responsive Design
- **Base (mobile):** Optimized for touch with full-width inputs
- **Medium+:** Two-column layouts where appropriate
- **Large:** Full desktop experience

### Micro-Interactions

1. **Upload Area Hover:**
   - Border color changes to brand color
   - Background tints to brand color
   - Smooth 0.3s transition

2. **Thumbnail Selection:**
   - Click to set as primary
   - Selected thumbnail gets blue border
   - Smooth color transition

3. **Image Removal:**
   - X button appears on hover
   - Removes image with immediate UI update
   - Auto-selects new primary if removed

4. **Progress Indication:**
   - Horizontal stepper at top
   - Animated filled dots for completed steps
   - Progress bar fills as you advance

5. **Form Submission:**
   - Overlay appears with spinner
   - Prevents interaction during upload
   - Toast notifications for success/error

### Mobile Optimizations

✓ **Touch Targets:** All buttons and interactive elements are min 44x44pt
✓ **Bottom Navigation:** Fixed at bottom, respects safe area insets
✓ **Scrollable Areas:** Horizontal thumb strip for images
✓ **Haptic Feedback:** CSS animations simulate haptic responses
✓ **Keyboard Awareness:** Input fields don't overlap mobile keyboards
✓ **Loading States:** Shimmer effects and spinners for all async operations

## File Sizes & Validation

### Images
- **Formats:** JPEG, PNG, WebP
- **Max size per image:** 5MB
- **Max count:** 8 images
- **Validation:** File type and size checked before upload

### Videos
- **Formats:** MP4, MOV
- **Max size:** 50MB
- **Duration:** Recommended 5-15 seconds
- **Optional:** Video is fully optional

### Text Fields
- **Title:** 60 characters max (counter shown)
- **Description:** 500 characters max (counter shown)
- **Location:** Free text, optional

## Error Handling

All steps include comprehensive error handling:

```
❌ Validation Errors:
  - No images selected
  - Title too short/long
  - Price not set (if buying allowed)
  - Invalid file types
  - File size exceeded
  - Terms not accepted

✓ Success:
  - Toast notification
  - Callback triggered
  - Navigation to product page
```

## API Integration

The component expects an API endpoint at `/api/products` that accepts:

```
POST /api/products
Content-Type: multipart/form-data

FormData:
- images[] (File, multiple)
- video? (File, optional)
- title (string)
- description (string)
- price (number)
- category (string)
- condition (string)
- location (string)
- allow_buying (boolean)
- barter_only (boolean)
```

Expected response:
```json
{
  "id": 12345,
  "slug": "product-title-slug",
  "status": "available"
}
```

## Customization

### Change Brand Colors
Replace all instances of `colorScheme="brand"` with your color:
```tsx
colorScheme="blue"  // for blue theme
colorScheme="green" // for green theme
```

### Adjust Image Limits
```tsx
// ProductUploadStep1.tsx, line ~65
if (images.length + newImages.length >= 8) { // Change 8 to your limit
```

### Modify Category List
The component imports from `@/utils/categories`:
```tsx
// Add categories to FILTER_CATEGORIES export
export const FILTER_CATEGORIES = [
  'General',
  'Electronics',
  'Fashion',
  // Add more...
]
```

## Browser Support

- ✓ Chrome/Edge (v90+)
- ✓ Firefox (v88+)
- ✓ Safari (v14+)
- ✓ Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Optimizations

- Image previews use DataURL (no network calls)
- Thumbnails lazy-load background images
- Progress bar uses CSS transitions (no JS animation loop)
- File validation happens before upload
- Failed uploads don't block subsequent uploads

## Accessibility

- ✓ ARIA labels on all interactive elements
- ✓ Keyboard navigation support
- ✓ Color not sole indicator (badges have text)
- ✓ Sufficient contrast ratios
- ✓ Touch targets meet WCAG standards

## Next Steps

1. **Hook up API endpoint** - Ensure `/api/products` endpoint works
2. **Test on mobile devices** - Use iOS Safari and Chrome Mobile
3. **Add image optimization** - Consider compression before upload
4. **Add photo library picker** - For mobile native file access
5. **Enable AI analysis** - Connect Gemini API to auto-fill Step 2
6. **Add image cropping** - Allow users to crop before upload
7. **Analytics tracking** - Track step completion rates

## Troubleshooting

### Images not showing in preview
- Check CORS settings for CDN
- Verify FileReader API support
- Check browser console for errors

### Upload fails silently
- Check API endpoint URL
- Verify authentication token in headers
- Check FormData structure matches API

### Scrolling issues on mobile
- Ensure `pb={24}` bottom padding on main container
- Check for fixed position elements overlapping content
- Verify safe area insets are applied

## Support

For issues, refer to:
- Chakra UI docs: https://chakra-ui.com
- React docs: https://react.dev
- FormData API: https://developer.mozilla.org/en-US/docs/Web/API/FormData
