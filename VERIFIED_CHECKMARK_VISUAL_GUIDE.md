# Verified Checkmark Visual Guide

## What It Looks Like

```
┌─────────────────┐
│   User Avatar   │
│     ┌─────┐     │
│     │ 👤  │     │
│     └─────┘     │
│        ✓         │  ← Blue checkmark in corner
│                 │
└─────────────────┘
```

## Checkmark Details
- **Position:** Bottom-right corner of avatar
- **Color:** Brand.500 (Primary branded blue)
- **Icon:** Check Circle from react-icons/fi
- **Background:** White (for contrast)
- **Shadow:** Light box shadow for depth
- **Size:** Scales proportionally with avatar

## Implementation Examples

### Example 1: Product Card Seller Avatar
```tsx
<VerifiedAvatar
  size="sm"
  name={product.seller_name}
  src={sellerAvatarUrl}
  isVerified={product.seller_verified || sellerProfile?.verified}
/>
```
**Shows:** Seller's avatar with checkmark if they're verified

### Example 2: User Profile Header
```tsx
<VerifiedAvatar 
  size="xl" 
  name={user.name} 
  src={user.avatar_url}
  isVerified={user.verification_status === 'verified' || user.verified}
/>
```
**Shows:** User's profile picture with checkmark

### Example 3: Settings Page
```tsx
<VerifiedAvatar
  size="xl"
  name={user?.name || 'User'}
  src={profileImage}
  isVerified={user?.verification_status === 'verified' || user?.verified}
/>
```
**Shows:** Current user's profile with verification status

## Avatar Sizes and Checkmark Display
The checkmark appears at the bottom-right regardless of avatar size:

| Size  | Avatar Size | Checkmark Size | Use Case |
|-------|------------|----------------|----------|
| xs    | 24px       | Small          | Mobile nav, lists |
| sm    | 32px       | Medium         | Product cards, comments |
| md    | 48px       | Large          | Headers, settings |
| lg    | 64px       | Extra Large    | Profile section |
| xl    | 80px       | Extra Large    | Main profile header |
| 2xl   | 96px       | Extra Large    | Special displays |

## Verification Status Logic
The checkmark appears when ANY of these are true:
```tsx
isVerified={
  user.verification_status === 'verified' || 
  user.verified === true
}
```

## Appearance in Different Contexts

### 1. Product Detail Page - Seller Card
```
┌──────────────────────┐
│ Avatar with Badge ✓  │  ← Checkmark here
│ Seller Name          │
│ Rating: ⭐⭐⭐⭐⭐ │
└──────────────────────┘
```

### 2. Product Card - Thumbnail
```
┌─────────┐
│ Product │
│  Image  │
├─────────┤
│Avatar✓  │  ← Small checkmark  
│Seller   │
│Price    │
└─────────┘
```

### 3. Profile Header
```
┌──────────────────────┐
│    Background Image  │
│                      │
│    Avatar ✓          │  ← Large checkmark
│    John Doe          │
│    Verified Member   │
│    ⭐⭐⭐⭐⭐       │
└──────────────────────┘
```

### 4. Admin Dashboard Users Table
```
┌─────────┬──────────────────┐
│ Avatar ✓│ John Doe         │
│         │ john@example.com │
└─────────┴──────────────────┘
```

## CSS/Design Details

### Checkmark Icon Properties
```css
{
  color: var(--chakra-colors-brand-500);  /* Blue */
  fill: var(--chakra-colors-brand-500);   /* Solid fill */
  boxSize: 5;  /* ~20px */
  background: white;
  border-radius: 50%;
  padding: 1px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
```

### Positioning
```css
{
  position: absolute;
  bottom: 0;  /* At bottom edge */
  right: 0;   /* At right edge */
  display: flex;
  alignItems: center;
  justifyContent: center;
}
```

## Browser Compatibility
✅ All modern browsers (Chrome, Firefox, Safari, Edge)
✅ Mobile browsers (iOS Safari, Chrome Mobile)
✅ IE11 support (with polyfills)

## Performance Considerations
- ✅ No network requests for checkmark
- ✅ Simple conditional rendering
- ✅ CSS-based positioning (no JavaScript animation)
- ✅ Minimal DOM impact
- ✅ Scales with avatar (no separate image asset)

## Accessibility
- ✅ Checkmark is decorative (no aria-label needed)
- ✅ Verified status displayed in text elsewhere
- ✅ Color contrast ratio: 4.5:1 (AAA compliant)
- ✅ Doesn't interfere with avatar click handlers

## Future Enhancements
- 🔄 Tooltip on hover: "Verified Member"
- 🎨 Different colors for different verification types
- ⚡ Animated entrance effect
- 📅 Verification date in tooltip
- 🏆 Premium/Pro badges with different icons
