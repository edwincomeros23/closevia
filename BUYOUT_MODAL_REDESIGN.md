# Buyout Modal Redesign — Compact & Merged UI

## Overview
The BuyoutModal component has been redesigned to be more compact and intuitive by merging fulfillment and payment methods into a single section with improved visual hierarchy.

## Key Changes

### 1. **Unified "Fulfillment & Payment" Section**
- **Removed**: Separate "Fulfillment Option" and "Preferred Payment Method" sections
- **Added**: Single toggleable section with two cards: Meetup and Delivery
- **Logic**: Payment method is now derived from fulfillment choice:
  - `Meetup` → always `upfront` (cash on the spot)
  - `Delivery` → always `cod` (rider collects payment)

### 2. **Toggle Card Styling**

#### Selected State
- Border: 2px solid #1D9E75 (teal)
- Background: #E1F5EE (light teal)
- Text color: #1D9E75 (teal-tinted)
- Icon background: #1D9E75

#### Unselected State
- Border: 0.5px solid (gray-200)
- Background: white
- Icon background: gray-200

### 3. **Card Descriptions**
- **Meetup**: "Meet the seller in person and pay cash upfront on the spot."
- **Delivery**: "Rider delivers to you. Prepare the exact amount — no change given."

### 4. **Delivery Location Row** (Visible only when Delivery is selected)
- Compact single-line display with:
  - Pin icon (FaMapMarkerAlt)
  - Barangay name
  - Muted subtext: "Detected from your device"
  - "Clear" link to reset location
- **Below**: Slim "Detect my location" secondary button (full width, outline style)

### 5. **Info Notice**
- Single line with muted background
- Text: "Your preference is included in the offer. Trader can accept or propose a different setup in chat."
- Styling: 10px text, gray background, left border accent

### 6. **Action Row**
- Layout: Flex row with Cancel (ghost) + Confirm Buyout (teal filled)
- Confirm button takes 2/3 width
- Button styling:
  - Background: #1D9E75
  - Hover: #158A63
  - Active: #0F5A42
  - Icon: FaCreditCard
  - Text: 11px, bold

### 7. **Overall Styling**
- **Max width**: 400px modal container
- **Body text**: 11–12px
- **Section labels**: 11px, uppercase, muted, letter-spaced
- **Icons**: Changed from FaMapMarkerAlt (meetup) to FaUsers for consistency
- **Removed**: Dividers between sections for compact appearance

### 8. **Modal Size**
- Changed from `size="xl"` to `size="sm"`
- Explicit `maxW="400px"` for both main and confirmation modals

### 9. **Confirmation Modal Updates**
- Consistent with main modal styling
- Teal (#1D9E75) accent color throughout
- Compact button sizing (height: 36px)

## Component State Changes

### Removed
- `paymentMethod` state (now derived from `tradeOption`)

### Retained
- `tradeOption`: 'meetup' | 'delivery'
- `detectedCoords`: Geolocation coordinates
- `detectedLocationLabel`: Reverse-geocoded address
- All validation and submission logic

## Backend Integration
The payload sent to `/api/trades` now automatically determines payment method:
```typescript
const paymentMethod = tradeOption === 'meetup' ? 'upfront' : 'cod'
```

## Icons Used
- **Meetup**: `FaUsers` (people/group)
- **Delivery**: `FaTruck` (truck)
- **Confirm button**: `FaCreditCard` (card)
- **Location**: `FaMapMarkerAlt` (pin)

## Color Palette
- **Primary Teal**: #1D9E75 (selected borders, icons, accents)
- **Light Teal**: #E1F5EE (selected background)
- **Text**: #1D9E75 (teal-tinted)
- **Muted**: gray-600 / gray-400 (light mode / dark mode)
- **Borders (unselected)**: gray-200 / gray-700

## Responsive Behavior
- Modal maintains 400px max-width on all screen sizes
- Cards stack vertically in 2-column grid
- Sections remain readable and accessible

---

**File**: `client/src/components/BuyoutModal.tsx`  
**Dependencies**: Chakra UI, React Icons (FaUsers, FaTruck, etc.)  
**Date Updated**: April 6, 2026
