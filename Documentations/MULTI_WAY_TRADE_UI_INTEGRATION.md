# Multi-Way Trade UI Integration Guide

## Overview

The Multi-Way Trade UI has been successfully integrated into the Dashboard component as a dedicated tab (Tab 2: Multi-Way Trades). This feature allows premium users to see and join multi-way trading loops where 3-5 participants are automatically matched by the system.

## Files Modified/Created

### 1. **Created: `client/src/components/MultiWayTradeUI.tsx`**
A reusable component that displays a single multi-way trade loop with:
- Visual representation of 3-5 participant boxes
- Animated arrows showing trade flow direction
- Each participant box includes: avatar, user name, product image, product title
- "What they want next" indicators
- Loop completion badge
- "How It Works" explanation
- Join, View Details, and Decline action buttons

### 2. **Modified: `client/src/pages/Dashboard.tsx`**

#### Imports Added:
```typescript
import MultiWayTradeUI from '../components/MultiWayTradeUI'
```

#### State Variables Added:
```typescript
const [multiWayTrades, setMultiWayTrades] = useState<any[]>([])
const [multiWayTradesLoading, setMultiWayTradesLoading] = useState(false)
const [selectedMultiWayTrade, setSelectedMultiWayTrade] = useState<any>(null)
const [multiWayTradeJoining, setMultiWayTradeJoining] = useState(false)
```

#### Functions Added:

**fetchMultiWayTrades()**: Fetches available multi-way trades for premium users
```typescript
const fetchMultiWayTrades = async () => {
  try {
    setMultiWayTradesLoading(true)
    const response = await api.get('/api/multi-way-trades/available', {
      params: { user_id: user?.id }
    })
    setMultiWayTrades(response.data?.data || [])
  } catch (error) {
    // Error handling...
  }
}
```

**handleJoinMultiWayTrade(trade)**: Handles joining a multi-way trade loop
```typescript
const handleJoinMultiWayTrade = async (trade: any) => {
  // API call to join trade
  // Refreshes the list after joining
}
```

**handleDeclineMultiWayTrade(trade)**: Handles declining a multi-way trade
```typescript
const handleDeclineMultiWayTrade = async (trade: any) => {
  // API call to decline trade
  // Refreshes the list after declining
}
```

#### Tab Structure:
The Multi-Way Trades Tab (Tab 2) now includes:

1. **Non-Premium Users**: Upsell screen with:
   - Feature highlights
   - "How it works" section
   - Benefits list
   - CTA to upgrade to Pro (₱299/year)

2. **Premium Users**: 
   - Loading state while fetching trades
   - Empty state if no active trades
   - List of available multi-way trades with MultiWayTradeUI component

#### useEffect Hook Added:
```typescript
// Fetch multi-way trades when tab is selected
useEffect(() => {
  if (user && activeTab === 2 && user.is_premium) {
    fetchMultiWayTrades()
  }
}, [user, activeTab])
```

## UI Workflow

### For Non-Premium Users
1. User clicks "Multi-Way Trades" tab
2. Sees premium feature upsell
3. Can click "Upgrade to Pro" button to purchase

### For Premium Users
1. User clicks "Multi-Way Trades" tab
2. System fetches available multi-way trades
3. For each trade, displays MultiWayTradeUI showing:
   - Banner: "Multi-Way Trade Detected!"
   - Loop length indicator (3-way, 4-way, 5-way)
   - Participant cards in horizontal loop
   - Animated arrows showing flow direction
   - "How It Works" explanation
   - Three action buttons:
     - **Join Trade Loop** (green) - Joins the loop
     - **View Details** (blue) - Shows more info
     - **Decline** (red) - Rejects the loop

## Component Structure

### MultiWayTradeUI Props
```typescript
interface MultiWayTradeUIProps {
  participants: TradeParticipant[]    // Array of 3-5 participants
  onJoinTrade?: () => void             // Callback when user joins
  onViewDetails?: () => void           // Callback to view details
  onDecline?: () => void               // Callback to decline
  isLoading?: boolean                  // Loading state for button
}

interface TradeParticipant {
  id: number
  user_name: string
  user_avatar?: string
  product_id: number
  product_title: string
  product_image?: string
  wants_product_id?: number
  wants_user_id?: number
}
```

## Visual Features

### Animations
- **Arrow Flow**: Subtle horizontal movement animation on arrows
- **Card Hover**: Lift effect on participant cards with color change
- **Position Badges**: Green badges showing participant position (P1, P2, etc.)
- **Status Indicators**: Color-coded avatars (blue, green, purple, orange, pink)

### Responsive Design
- **Mobile**: Horizontal scrolling for 4-5 participant loops
- **Tablet/Desktop**: Full display without scrolling
- **Dark Mode**: Automatic theme adjustment

### Color Coding
- **Header**: Blue background with blue icons
- **Arrows**: Animated blue arrows
- **Completion**: Green checkmark indicator
- **Avatars**: Multi-color rotation for differentiation

## API Endpoints Required

The Dashboard expects the following backend endpoints:

### 1. Get Available Multi-Way Trades
```
GET /api/multi-way-trades/available
Query Params:
  - user_id: number (user's ID)

Response:
{
  "data": [
    {
      "id": 1,
      "status": "pending",
      "participants": [
        {
          "id": 1,
          "user_name": "Alice",
          "product_id": 201,
          "product_title": "Vintage Camera",
          "product_image": "url",
          "wants_product_id": 202,
          "wants_user_id": 2
        },
        // ... more participants
      ]
    },
    // ... more trades
  ]
}
```

### 2. Join Multi-Way Trade
```
POST /api/multi-way-trades/:id/join
Body:
{
  "user_id": number
}

Response:
{
  "message": "Joined successfully",
  "trade_id": number
}
```

### 3. Decline Multi-Way Trade
```
POST /api/multi-way-trades/:id/decline
Body:
{
  "reason": "Not interested"
}

Response:
{
  "message": "Declined successfully"
}
```

## Integration Checklist

- ✅ MultiWayTradeUI component created
- ✅ Import added to Dashboard
- ✅ State variables initialized
- ✅ Fetch function implemented
- ✅ Join handler implemented
- ✅ Decline handler implemented
- ✅ Tab structure updated
- ✅ useEffect hook for tab selection added
- ✅ Premium check implemented
- ✅ Loading and empty states handled
- ⏳ Backend endpoints needed to be created
- ⏳ Mock data or actual API implementation

## Usage Example

When the Dashboard is rendered and the user is premium, clicking the "Multi-Way Trades" tab will:

1. Trigger the useEffect that calls `fetchMultiWayTrades()`
2. Display loading spinner while fetching
3. Show each available trade using MultiWayTradeUI
4. Allow user to:
   - Join the trade (calls `handleJoinMultiWayTrade`)
   - View details (can open modal if needed)
   - Decline the trade (calls `handleDeclineMultiWayTrade`)

## Testing

### Manual Testing Steps:
1. Log in as a premium user
2. Navigate to Dashboard
3. Click "Multi-Way Trades" tab
4. Verify loading spinner appears
5. When data loads, verify:
   - Participant boxes display correctly
   - Arrows animate smoothly
   - Buttons are clickable
   - Responsive on mobile (scroll for 4-5 way loops)

### With Mock Data:
For testing without a backend, modify `fetchMultiWayTrades()` to return mock data:

```typescript
const fetchMultiWayTrades = async () => {
  try {
    setMultiWayTradesLoading(true)
    // Mock data for testing
    const mockTrades = [
      {
        id: 1,
        participants: [
          { id: 1, user_name: 'Alice', product_id: 1, product_title: 'Camera', product_image: 'url', wants_product_id: 2 },
          { id: 2, user_name: 'Bob', product_id: 2, product_title: 'Jacket', product_image: 'url', wants_product_id: 3 },
          { id: 3, user_name: 'Charlie', product_id: 3, product_title: 'Laptop', product_image: 'url', wants_product_id: 1 },
        ]
      }
    ]
    setMultiWayTrades(mockTrades)
  } catch (error) {
    // Error handling
  } finally {
    setMultiWayTradesLoading(false)
  }
}
```

## Performance Considerations

- ✅ Non-blocking fetch (doesn't block other tab operations)
- ✅ Only fetches when tab is selected and user is premium
- ✅ Uses memoization for participant validation
- ✅ Proper loading states prevent UI jank
- ✅ Component auto-caps participants at 5 (safety check)

## Accessibility

- ✅ Semantic HTML structure
- ✅ Proper heading hierarchy
- ✅ Color not the only indicator (badges include text)
- ✅ Touch-friendly button sizes
- ✅ Proper ARIA labels and roles where needed
- ✅ Keyboard navigable

## Future Enhancements

1. **Real-time Updates**: WebSocket integration for live participant status
2. **Trade Details Modal**: Show more information about each participant
3. **Status Progress**: Visual indicator of how many participants have joined
4. **Notification Center**: Alerts when new trades are available
5. **Schedule View**: Show when the trade will execute
6. **Rating System**: See ratings of other participants before joining
7. **Trade History**: Track completed multi-way trades
8. **Custom Preferences**: Filter trades by number of participants, item categories, etc.

## Troubleshooting

### Issue: "No multi-way trades found" appears for premium users
**Solution**: Check if backend endpoint is working and returning data

### Issue: Animations not smooth
**Solution**: Check browser performance, may need to reduce animation complexity

### Issue: Participant data not displaying
**Solution**: Verify TradeParticipant interface matches backend response

### Issue: Buttons not responding
**Solution**: Check if `handleJoinMultiWayTrade` or `handleDeclineMultiWayTrade` functions have errors in console

## Related Files

- `/client/src/components/MultiWayTradeUI.tsx` - UI Component
- `/client/src/pages/Dashboard.tsx` - Main Dashboard with integration
- `/client/src/types/index.ts` - Type definitions (may need TradeParticipant interface)
- `/Documentations/MULTI_WAY_TRADING_IMPLEMENTATION_CHECKLIST.md` - Business logic checklist

## Support

For issues or questions about the Multi-Way Trade UI integration, refer to:
- Component source code comments
- MultiWayTradeUI component documentation
- Dashboard API service configuration
- Backend API documentation
