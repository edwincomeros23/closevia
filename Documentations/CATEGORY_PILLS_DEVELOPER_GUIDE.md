# 📚 Category Pills - Developer Reference

## Quick Start

The category pills component is built directly into `Home.tsx`. No separate component needed.

### Key Files
- **Implementation**: `client/src/pages/Home.tsx` (lines ~140 and ~1010)
- **Icon Library**: `react-icons` (fa6, fa, md)
- **UI Framework**: `Chakra UI v2`

---

## Data Structure

### Category Object Schema
```typescript
interface Category {
  name: string                    // Display name
  icon: IconType                  // React Icon component
  color: string                   // Chakra color (active bg)
  lightColor: string              // Chakra color (hover light)
  accentColor: string             // Chakra color (border)
}

// Example
{ 
  name: 'Book', 
  icon: FaBook, 
  color: 'purple', 
  lightColor: 'purple.50', 
  accentColor: 'purple.600' 
}
```

### Full Categories Array
```typescript
const categories = [
  { name: 'All', icon: MdLocalOffer, color: 'brand', lightColor: 'brand.50', accentColor: 'brand.600' },
  { name: 'Bag', icon: FaBagShopping, color: 'orange', lightColor: 'orange.50', accentColor: 'orange.600' },
  { name: 'School Supply', icon: MdSchool, color: 'cyan', lightColor: 'cyan.50', accentColor: 'cyan.600' },
  { name: 'Book', icon: FaBook, color: 'purple', lightColor: 'purple.50', accentColor: 'purple.600' },
  { name: 'Electronic', icon: FaClock, color: 'indigo', lightColor: 'indigo.50', accentColor: 'indigo.600' },
  { name: 'Clothing', icon: FaShirt, color: 'pink', lightColor: 'pink.50', accentColor: 'pink.600' },
  { name: 'Shoe', icon: FaShop, color: 'red', lightColor: 'red.50', accentColor: 'red.600' },
  { name: 'Accessory', icon: FaGem, color: 'yellow', lightColor: 'yellow.50', accentColor: 'yellow.600' },
  { name: 'Home & Living', icon: FaHouse, color: 'green', lightColor: 'green.50', accentColor: 'green.600' },
  { name: 'Toy', icon: FaBox, color: 'teal', lightColor: 'teal.50', accentColor: 'teal.600' },
  { name: 'Beauty', icon: FaStar, color: 'rose', lightColor: 'rose.50', accentColor: 'rose.600' },
]
```

---

## State Management

```typescript
// Selected category state
const [selectedCategory, setSelectedCategory] = useState<string>('All')

// Update on category selection
const handleCategorySelect = (categoryName: string) => {
  setSelectedCategory(categoryName)
  
  if (categoryName === 'All') {
    setSearchTerm('')
    setFilters(prev => ({ ...prev, keyword: '', page: 1 }))
  } else {
    setSearchTerm(categoryName)
    setFilters(prev => ({ ...prev, keyword: categoryName, page: 1 }))
  }
  
  setHasSearched(true)
}
```

---

## Component Structure

### Container
```tsx
<Box 
  px={{ base: 3, md: 7 }} 
  py={4}
  bg="linear-gradient(135deg, #FFFDF1 0%, #FFFCF0 100%)"
  borderBottomWidth="1px"
  borderBottomColor="gray.100"
>
  {/* Pill list */}
</Box>
```

### Pill List
```tsx
<HStack
  spacing={{ base: 2.5, md: 3 }}
  overflowX="auto"
  whiteSpace="nowrap"
  pb={{ base: 2, md: 0 }}
  sx={{
    '::-webkit-scrollbar': { display: 'none', height: '0px' },
    msOverflowStyle: 'none',
    scrollbarWidth: 'none',
    '&': { scrollBehavior: 'smooth' }
  }}
>
  {/* Individual pills */}
</HStack>
```

### Individual Pill
```tsx
<Box 
  key={category.name} 
  flexShrink={0}
  as="button"
  onClick={() => handleCategorySelect(category.name)}
  cursor="pointer"
  transition="all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
  _active={{ transform: 'scale(0.95)' }}
>
  {/* Pill content */}
</Box>
```

### Pill Content
```tsx
<Box
  display="flex"
  alignItems="center"
  gap={{ base: 1.5, md: 2 }}
  px={{ base: 3.5, md: 5 }}
  py={{ base: 2.5, md: 3 }}
  rounded="full"
  // ... more styling
>
  <Icon as={IconComponent} w={{ base: 3.5, md: 4 }} h={{ base: 3.5, md: 4 }} />
  <Text display={{ base: category.name === 'All' ? 'inline' : 'none', md: 'inline' }}>
    {category.name}
  </Text>
</Box>
```

---

## Styling Reference

### Colors and States

| Property | Inactive | Active | Hover Inactive | Hover Active |
|----------|----------|--------|----------------|--------------|
| `bg` | `white` | `category.color` | `category.lightColor` | `category.color` |
| `color` | `gray.700` | `white` | `gray.700` | `white` |
| `borderColor` | `gray.200` | `category.accentColor` | `category.accentColor` | `category.accentColor` |
| `boxShadow` | Small | Medium | Medium | Large |
| `transform` | None | None | `translateY(-2px)` | `translateY(-2px)` |

### Responsive Sizing

| Breakpoint | Padding | Icon Size | Gap | Font Size |
|------------|---------|-----------|-----|-----------|
| base | `px: 3.5, py: 2.5` | `3.5x3.5` | `1.5` | `xs` |
| md | `px: 5, py: 3` | `4x4` | `2` | `sm` |

### Animation Timing

```typescript
// All transitions use this easing
transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"

// Breakpoint: 300ms
// Easing: cubic-bezier creates bounce effect
// Effect: Responsive, playful, premium feel
```

---

## Icon Imports

```typescript
import { FaUserCircle, FaHandshake, FaHome } from 'react-icons/fa'
import { FaBagShopping, FaBook, FaClock, FaShirt, FaShop, FaGem, FaHouse, FaBox, FaStar } from 'react-icons/fa6'
import { MdSchool, MdLocalOffer } from 'react-icons/md'
```

### Available Icons
- **MdLocalOffer** - All (Tag)
- **FaBagShopping** - Bag (Shopping Bag)
- **MdSchool** - School Supply (Graduation Cap)
- **FaBook** - Book (Book)
- **FaClock** - Electronic (Clock)
- **FaShirt** - Clothing (Shirt)
- **FaShop** - Shoe (Shop)
- **FaGem** - Accessory (Gem)
- **FaHouse** - Home & Living (House)
- **FaBox** - Toy (Box)
- **FaStar** - Beauty (Star)

---

## Customization Guide

### Changing a Category Color

```typescript
// Find the category in the array
{
  name: 'Book',
  icon: FaBook,
  color: 'purple',           // ← Change this
  lightColor: 'purple.50',   // ← And this
  accentColor: 'purple.600'  // ← And this
}

// Available Chakra colors:
// brand, red, orange, yellow, green, cyan, blue, purple, pink, rose, teal, indigo, etc.
```

### Changing an Icon

```typescript
// Option 1: Use different icon from same library
{ name: 'Book', icon: FaBookOpen }  // from fa6

// Option 2: Import from different library
import { GiBook } from 'react-icons/gi'
{ name: 'Book', icon: GiBook }

// Available icon libraries:
// react-icons/fa      (Font Awesome)
// react-icons/fa6     (Font Awesome 6)
// react-icons/md      (Material Design)
// react-icons/gi      (Game Icons)
// react-icons/bs      (Bootstrap)
// And many more...
```

### Adding a New Category

```typescript
// 1. Import the icon
import { FaUmbrella } from 'react-icons/fa6'

// 2. Add to array
const categories = [
  // ... existing categories
  {
    name: 'Umbrella',
    icon: FaUmbrella,
    color: 'gray',
    lightColor: 'gray.50',
    accentColor: 'gray.600'
  }
]

// 3. Update any backend filters if needed
```

### Removing a Category

```typescript
// Simply remove from the array
const categories = [
  // Keep these
  { name: 'All', ... },
  { name: 'Bag', ... },
  // { name: 'Book', ... }  ← Delete this line
]
```

### Adjusting Animation Speed

```typescript
// Current: 300ms cubic-bezier
transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"

// Faster (200ms):
transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)"

// Slower (400ms):
transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"

// Different easing (smooth):
transition: "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)"

// Different easing (snappy):
transition: "all 0.3s cubic-bezier(0.6, 0.04, 0.98, 0.34)"
```

### Adjusting Hover Lift Height

```tsx
_hover={{
  transform: 'translateY(-4px)',  // Was -2px (higher lift)
  // ... other properties
}}
```

---

## Advanced Customizations

### Adding Tooltips

```tsx
<Tooltip label={category.name} placement="top">
  <Box
    // ... pill styling
  >
    {/* Pill content */}
  </Box>
</Tooltip>
```

### Adding Badge Count

```tsx
<Box position="relative">
  <Icon as={IconComponent} />
  <Badge
    position="absolute"
    top={0}
    right={0}
    borderRadius="full"
    bg="red.500"
    color="white"
    fontSize="10px"
  >
    5
  </Badge>
</Box>
```

### Conditional Icon Display

```tsx
<Icon
  as={IconComponent}
  display={{ base: selectedCategory === category.name ? 'block' : 'none', md: 'block' }}
/>
```

### Category Favorites

```tsx
// Add to state
const [favorites, setFavorites] = useState<string[]>(['All', 'Book'])

// Reorder in render
const sortedCategories = [
  ...categories.filter(c => favorites.includes(c.name)),
  ...categories.filter(c => !favorites.includes(c.name))
]
```

---

## Integration Points

### With Search
```typescript
// When category selected
handleCategorySelect('Book')
↓
setSearchTerm('Book')
↓
searchProducts({ ...filters, keyword: 'Book', page: 1 })
↓
Products filtered automatically
```

### With Filters
```typescript
// Category acts as quick filter
// Same as using keyword filter in advanced filters
setFilters(prev => ({ 
  ...prev, 
  keyword: categoryName, 
  page: 1 
}))
```

### With Product List
```typescript
// Products grid updates when:
// 1. Category selected
// 2. API call returns new products
// 3. Component re-renders with new data
```

---

## Browser DevTools Tips

### Inspect Animations
1. Open DevTools (F12)
2. Go to Animations tab
3. Hover over pill
4. See 300ms cubic-bezier animation
5. Slow down animation in DevTools to debug

### Check CSS
1. Right-click pill
2. Select "Inspect"
3. View applied styles
4. Check computed values
5. Test live CSS edits

### Performance
1. Open Performance tab
2. Record interaction (hover + click)
3. Check 60fps smooth animation
4. Look for paint/layout issues

---

## Common Patterns

### Select All Categories
```typescript
const selectAllCategories = () => {
  setSelectedCategory('All')
  handleCategorySelect('All')
}
```

### Clear Selection
```typescript
const clearSelection = () => {
  setSelectedCategory('All')
  setSearchTerm('')
  setFilters(prev => ({ ...prev, keyword: '', page: 1 }))
}
```

### Get Active Category
```typescript
const getActiveCategory = () => {
  return categories.find(c => c.name === selectedCategory)
}
```

### Check if Category Exists
```typescript
const categoryExists = (name: string) => {
  return categories.some(c => c.name === name)
}
```

---

## Testing Utilities

### Test Active State
```javascript
// In browser console
selectedCategory === 'Book'  // true = active
```

### Test Animation
```javascript
// Check transition timing
getComputedStyle(element).transition
// Should show: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)
```

### Test Colors
```javascript
// Verify active pill color
getComputedStyle(element).backgroundColor
// Should show category color (e.g., rgb(147, 51, 234) for purple)
```

---

## Debugging Checklist

| Issue | Cause | Solution |
|-------|-------|----------|
| Animation not smooth | Low frame rate | Check GPU acceleration, reduce other effects |
| Color not showing | Missing color in Chakra theme | Verify color name exists in theme |
| Icon not displaying | Icon not imported | Check import statement |
| Hover not working | CSS selector issue | Verify `_hover` prop syntax |
| Mobile text not hidden | Responsive prop wrong | Check `display={{ base: 'none', md: 'inline' }}` |
| Scroll not working | Overflow hidden | Verify `overflowX: 'auto'` on HStack |
| Border not visible | Border color missing | Check `borderColor` prop |
| Shadow not deep enough | Low shadow value | Increase rgba alpha value |

---

## Performance Optimization Tips

### 1. Use CSS Transitions (Already Done ✅)
```typescript
// Good - GPU accelerated
transition: "all 0.3s ease"

// Avoid - CPU intensive
animation: customKeyframe 0.3s ease
```

### 2. Use Transform Properties (Already Done ✅)
```typescript
// Good - GPU accelerated
transform: 'translateY(-2px)'
transform: 'scale(0.95)'

// Avoid - Causes reflow
top: '-2px'
width: '95%'
```

### 3. Memoize Category List
```typescript
const categories = useMemo(() => [
  // ... category definitions
], [])
```

### 4. Memoize Handler
```typescript
const handleCategorySelect = useCallback((categoryName: string) => {
  // ... handler logic
}, [setSelectedCategory, setSearchTerm, setFilters, setHasSearched])
```

---

## Accessibility Checklist

- ✅ Color + Icon (not just color)
- ✅ Keyboard navigation (Tab key)
- ✅ Focus indicators visible
- ✅ Semantic button element
- ✅ Cursor: pointer
- ✅ Touch targets 44px+
- ✅ Sufficient contrast ratio
- ✅ No color-only information

### Add ARIA Labels (if needed)
```tsx
<Box
  aria-label={`Select ${category.name} category`}
  role="button"
  aria-pressed={isSelected}
>
  {/* Pill content */}
</Box>
```

---

## Migration Notes

If updating from old category pills:

1. **Removed**: Old `categoryColors` object (no longer needed)
2. **Changed**: Categories now objects instead of strings
3. **Added**: Icon imports and category icons
4. **Improved**: Animation easing (cubic-bezier)
5. **Enhanced**: Mobile display (icon-only)

### Before
```typescript
const categories = ['All', 'Bag', 'Book', ...]
const categoryColors = { 'Bag': '#FFE5D0', ... }
```

### After
```typescript
const categories = [
  { name: 'All', icon: MdLocalOffer, color: 'brand', ... },
  { name: 'Bag', icon: FaBagShopping, color: 'orange', ... },
  { name: 'Book', icon: FaBook, color: 'purple', ... },
  ...
]
```

---

## Version History

### Current Version
- **Version**: 2.0 (Complete Redesign)
- **Date**: November 2025
- **Changes**: 
  - Added icons
  - Enhanced animations
  - Improved responsive design
  - Modern color palette
  - Accessibility improvements

### Previous Version
- **Version**: 1.0 (Original)
- **Style**: Flat, static
- **Colors**: Limited palette

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────┐
│ CATEGORY PILLS - QUICK REFERENCE                    │
├─────────────────────────────────────────────────────┤
│ Animation:    300ms cubic-bezier(0.34, 1.56, 0.64, 1)
│ Hover Lift:   translateY(-2px)                      │
│ Click Scale:  scale(0.95)                           │
│ Active Shadow: 0 8px 16px rgba(0,0,0,0.1)          │
│ Border:       2px solid (color-based)              │
│ Mobile:       Icon-only display                    │
│ Colors:       11 distinct color schemes             │
│ Icons:        React Icons (fa6, fa, md)            │
├─────────────────────────────────────────────────────┤
│ Files: client/src/pages/Home.tsx (~130, ~1010)     │
│ Location: Between search bar and product grid       │
│ State: selectedCategory                             │
│ Handler: handleCategorySelect()                     │
└─────────────────────────────────────────────────────┘
```

---

## Support & Resources

- **Chakra UI Docs**: https://chakra-ui.com
- **React Icons**: https://react-icons.github.io/react-icons
- **CSS Transitions**: https://developer.mozilla.org/en-US/docs/Web/CSS/transition
- **Cubic Bezier**: https://cubic-bezier.com

---

This guide covers everything needed to understand, customize, and maintain the modern category pills component!
