# Meetup Scheduling Enhancements - Quick Reference Guide

## For Testers

### 🧪 Test Scenarios

#### 1. Date Selection (Happy Path)
1. Open trade modal → Go to Meetup tab
2. Click location (e.g., "Coffee Shop")
3. In "Schedule a Meetup" section:
   - [ ] See 7 date buttons ("Today", "Tomorrow", "Mon 15", etc.)
   - [ ] Click "Today" → Selected with blue background
   - [ ] Click "Tomorrow" → Changes selection to Tomorrow
   - [ ] Cannot scroll to more dates (only 7 shown)

#### 2. Time Slot Validation (Current Time Filtering)
1. It's currently 2:30 PM (14:30)
2. Select "Today"
3. Expected time slots: 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00
   - [ ] Earlier times (09:00-14:00) NOT shown
   - [ ] 14:30 and 14:45 NOT shown (in past)
   - [ ] Only slots after 14:30 are visible

#### 3. Time Slot for Future Date (No Filtering)
1. Select "Tomorrow"
2. Expected time slots: 09:00, 09:30, 10:00, ..., 17:30, 18:00
   - [ ] ALL 20 time slots shown (09:00-18:00, 30-min intervals)
   - [ ] No time slots removed/filtered

#### 4. Validation Error Messages
1. Try to submit without selecting date
   - [ ] Error: "Please select a date"
   - [ ] Red error box appears at top
2. Select date, try to submit without time
   - [ ] Error: "Please select a time"
3. Both selected, try to submit without location
   - [ ] Error appears for location (existing feature)

#### 5. Past Date Prevention (Edge Case - Can Try Tomorrow)
1. Today is December 12
2. Try to select December 11
   - [ ] Button appears grayed out or disabled
   - [ ] Cannot click/select
   - [ ] Error shown if attempted

#### 6. Seven Day Limit
1. Today is December 12
2. Can select: Dec 12, 13, 14, 15, 16, 17, 18
   - [ ] Dec 18 is farthest (6 days ahead = 7 day window)
3. Cannot select Dec 19 or later
   - [ ] Buttons not shown
   - [ ] If attempted: Error "must be scheduled within 7 days"

#### 7. Cancel Trade Feature
1. Open active trade modal
2. Scroll to bottom → Modal footer visible
3. [ ] See "Cancel Trade" button (red outline)
4. Click "Cancel Trade"
   - [ ] AlertDialog appears with warning
   - [ ] Red warning box: "Cancelling will negatively affect your trust score"
   - [ ] Product name shown
   - [ ] Trading partner name shown
5. Click "Keep Trade Active"
   - [ ] Dialog closes
   - [ ] No changes made
   - [ ] Returns to normal modal view
6. Click "Cancel Trade" again
7. Click "Yes, Cancel Trade"
   - [ ] Dialog closes
   - [ ] Loading state appears
   - [ ] Toast notification: "Trade Cancelled"
   - [ ] Modal closes
   - [ ] Trade shows as cancelled in list

#### 8. Cancel Button Conditions
1. Open completed trade modal
   - [ ] "Cancel Trade" button NOT visible (trade done)
2. Open active trade modal
   - [ ] "Cancel Trade" button visible (red outline)
3. Open accepted trade modal
   - [ ] "Cancel Trade" button visible
4. Open declined trade modal
   - [ ] "Cancel Trade" button NOT visible

### 📱 Mobile Testing
1. Open trade modal on phone (portrait)
   - [ ] Date buttons stack nicely (responsive)
   - [ ] Time slots display in grid (3 columns on mobile)
   - [ ] All buttons tap-able (good size)
2. Date labels show correctly ("Today", "Tomorrow", format)
3. Zoom to 150% - still usable?
   - [ ] Text readable
   - [ ] Buttons accessible
   - [ ] No layout breaks

### ⏱️ Time Boundary Testing
1. Test at 08:59 AM
   - [ ] Select Today → No times shown (all past)
   - [ ] Error: "No available times remaining today"
2. Test at 09:00 AM
   - [ ] Select Today → [09:30], [10:00], ... shown
   - [ ] [09:00] not shown (current time not included)
3. Test at 18:00 PM (6 PM)
   - [ ] Select Today → No times shown (all past)
   - [ ] Must select Tomorrow for options
4. Test at 17:31 PM
   - [ ] Select Today → [18:00] shown only
   - [ ] [17:30] not shown (in past)

### 🌙 Edge Cases
1. Day rollover (midnight)
   - [ ] At 23:59 PM, today's times still show
   - [ ] At 00:01 AM, "Today" refers to new date
2. Daylight saving time (if applicable)
   - [ ] Dates/times still work correctly
3. Time zone differences
   - [ ] Uses local time of device
   - [ ] Times match device clock

---

## For Developers

### 📖 Code Structure

#### Helper Functions
```typescript
getNext7Days(): string[]
// Returns: ["2024-12-12", "2024-12-13", ..., "2024-12-18"]
// Usage: Populate date selector buttons

formatDateLabel(dateStr: string): string
// Input: "2024-12-13"
// Output: "Tomorrow" or "Mon 13" or "Fri 13 Dec"
// Usage: Display friendly date labels

generateTimeSlots(dateStr: string | null): string[]
// Input: "2024-12-12" (and current time is 14:45)
// Output: ["15:00", "15:30", "16:00", ..., "18:00"]
// Filters past times automatically
// Usage: Populate time selector buttons

validateDateTimeSelection(date: string | null, time: string | null): string | null
// Input: date="2024-12-12", time="14:00"
// Output: "Cannot select a past time" (if current is 14:45)
// Input: date="2024-12-30", time="15:00"
// Output: "Meetup must be scheduled within 7 days"
// Input: date="2024-12-13", time="15:30"
// Output: null (valid)
```

#### Event Handlers
```typescript
const handleCancelTrade = async () => {
  // Sends: PUT /api/trades/{id} with action: 'cancel'
  // Updates UI on success
  // Shows toast notification
  // Auto-closes modal after 1.5s
}

const confirmMeetup = async () => {
  // NEW: Validates date/time first
  // Then: Sends confirm_meetup action
  // Unchanged: Agreement logic and feedback
}
```

#### State Variables (New)
```typescript
const [selectedDate, setSelectedDate] = useState<string | null>(null)
// Format: "YYYY-MM-DD" or null
// Example: "2024-12-13"

const [validationError, setValidationError] = useState<string | null>(null)
// Contains error message or null if valid
// Used to display inline error box

const [showCancelDialog, setShowCancelDialog] = useState(false)
// Controls AlertDialog visibility

const [cancelingTrade, setCancelingTrade] = useState(false)
// Loading state during cancellation

const cancelDialogRef = useRef<HTMLButtonElement>(null)
// Focus management for AlertDialog (accessibility)
```

### 🔧 Modifications to Existing Implementation

```typescript
// BEFORE
const confirmMeetup = async () => {
  if (!trade || !selectedLocation || !selectedTime || confirmingMeetup) return
  
  try {
    setConfirmingMeetup(true)
    await api.put(`/api/trades/${trade.id}`, {
      action: 'confirm_meetup',
      meetup_location: selectedLocation,
      meetup_time: selectedTime,
    })
    // ... rest
  }
}

// AFTER
const confirmMeetup = async () => {
  if (!trade || !selectedLocation || !selectedTime || !selectedDate || confirmingMeetup) return

  // NEW: Validation step
  const error = validateDateTimeSelection(selectedDate, selectedTime)
  if (error) {
    setValidationError(error)
    toast({ title: 'Invalid Selection', description: error, status: 'warning' })
    return
  }

  const fullDateTime = `${selectedDate}T${selectedTime}`

  try {
    setConfirmingMeetup(true)
    setValidationError(null)  // Clear previous errors
    await api.put(`/api/trades/${trade.id}`, {
      action: 'confirm_meetup',
      meetup_location: selectedLocation,
      meetup_time: selectedTime,
      meetup_date: selectedDate,  // NEW: Sent but ignored by backend
    })
    // ... rest (unchanged)
  }
}
```

### 🧪 Unit Testing Examples

```typescript
// Test getNext7Days
test('getNext7Days returns 7 consecutive days', () => {
  const days = getNext7Days()
  expect(days).toHaveLength(7)
  // Verify they're consecutive
  for (let i = 0; i < 6; i++) {
    const current = new Date(days[i])
    const next = new Date(days[i + 1])
    expect(next.getTime() - current.getTime()).toBe(24 * 60 * 60 * 1000)
  }
})

// Test generateTimeSlots
test('generateTimeSlots filters past times for today', () => {
  // Mock current time as 14:45
  const slots = generateTimeSlots('2024-12-12') // today
  expect(slots).not.toContain('09:00')
  expect(slots).not.toContain('14:00')
  expect(slots).not.toContain('14:30')
  expect(slots).toContain('15:00')
  expect(slots).toContain('18:00')
})

// Test generateTimeSlots
test('generateTimeSlots returns all slots for future dates', () => {
  const slots = generateTimeSlots('2024-12-13') // tomorrow
  expect(slots).toContain('09:00')
  expect(slots).toContain('18:00')
  expect(slots).toHaveLength(20) // 09:00 to 18:00 in 30-min intervals
})

// Test validateDateTimeSelection
test('validateDateTimeSelection rejects past dates', () => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStr = formatDateForValidation(yesterday)
  
  const error = validateDateTimeSelection(dateStr, '15:00')
  expect(error).toBe('Cannot select a past date')
})

// Test validateDateTimeSelection
test('validateDateTimeSelection rejects dates beyond 7 days', () => {
  const dayEight = new Date()
  dayEight.setDate(dayEight.getDate() + 8)
  const dateStr = formatDateForValidation(dayEight)
  
  const error = validateDateTimeSelection(dateStr, '15:00')
  expect(error).toBe('Meetup must be scheduled within 7 days')
})
```

### 🔌 Integration Points

#### Frontend-Backend Communication
```javascript
// Send to backend
PUT /api/trades/{tradeID}
{
  action: 'confirm_meetup',
  meetup_location: 'Coffee Shop',
  meetup_time: '15:30',
  meetup_date: '2024-12-13'  // Ignored by backend, just validation
}

// Receive from backend
{
  success: true,
  data: {
    id: 123,
    status: 'active',
    buyer_meetup_confirmed: true,
    buyer_meetup_location: 'Coffee Shop',
    buyer_meetup_time: '15:30',
    seller_meetup_location: 'Coffee Shop',
    seller_meetup_time: '15:30',
    seller_meetup_confirmed: true,
    // ... other fields
  }
}
```

#### Cancel Trade Integration
```javascript
// Send to backend
PUT /api/trades/{tradeID}
{
  action: 'cancel'
}

// Receive from backend
{
  success: true,
  message: 'Trade cancelled',
  data: {
    id: 123,
    status: 'cancelled',
    // ... updated trade data
  }
}
```

### 🐛 Debugging

#### Common Issues

1. **Dates showing "NaN" or invalid**
   - Check date format is "YYYY-MM-DD"
   - Use `new Date(dateStr + 'T00:00:00')` for parsing
   - Avoid `new Date(dateStr)` - timezone issues

2. **Time slots not generating**
   - Check `selectedDate` is not null
   - Verify date is valid (YYYY-MM-DD format)
   - Check time slot generation logic

3. **Validation never clears**
   - Call `setValidationError(null)` after valid selection
   - Check you're clearing before validation check, not after

4. **Cancel dialog not showing**
   - Verify `showCancelDialog` state is true
   - Check AlertDialog isOpen prop is connected
   - Verify trade status is 'active' or 'accepted'

#### Debug Logging
```typescript
console.log('Selected date:', selectedDate)
console.log('Selected time:', selectedTime)
console.log('Available slots:', generateTimeSlots(selectedDate))
console.log('Validation result:', validateDateTimeSelection(selectedDate, selectedTime))
```

### 📦 Dependencies

No new external dependencies added. Uses existing:
- Chakra UI components (Modal, Button, HStack, etc.)
- React hooks (useState, useRef, useEffect)
- react-icons (FaTimesCircle added)
- Existing API service

### ♿ Accessibility Checklist

- [x] AlertDialog uses proper focus management
- [x] `cancelDialogRef` connected to least destructive button
- [x] Color not used alone for status (includes text)
- [x] Button labels are clear and descriptive
- [x] Error messages announced in toast

### 📊 Performance Notes

- Validation functions: O(1) or O(7)
- Date comparisons: Native Date API (optimized by browser)
- Rendering: No new expensive renders
- No performance regression expected

---

## Deployment Checklist

- [ ] All TypeScript errors resolved
- [ ] Tested on Chrome, Firefox, Safari
- [ ] Tested on mobile (portrait/landscape)
- [ ] Tested edge cases (midnight, boundary times)
- [ ] Cancel dialog tested on all trade statuses
- [ ] Toast notifications appear correctly
- [ ] No console errors
- [ ] No memory leaks (check dev tools)
- [ ] Performance acceptable (<100ms for operations)
- [ ] Accessible with keyboard navigation
- [ ] No backend changes required

## Production Monitoring

Monitor these metrics after deploy:
- Error rate in cancel trade flow
- Time to select date/time (UX performance)
- Cancel trade feature usage (how often used)
- Validation error frequency (if high, adjust defaults)

---

## Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Dates show wrong range | Check system date is correct |
| Time slots all past | Current time is after 18:00, try tomorrow |
| Validation error won't clear | Clear error state explicitly: `setValidationError(null)` |
| Cancel button not visible | Check trade status is 'active' or 'accepted' |
| Dialog doesn't appear | Check `showCancelDialog` state binding |
| Tests failing | Verify date format "YYYY-MM-DD" used everywhere |

---

## Resources

- **Full Feature Spec**: See `MEETUP_SCHEDULING_ENHANCEMENTS.md`
- **Before/After Comparison**: See `MEETUP_SCHEDULING_BEFORE_AFTER.md`
- **Component File**: `client/src/components/ViewTradeModal.tsx`
- **Types**: `client/src/types/index.ts` (Trade, Product interfaces)
- **API Service**: `client/src/services/api.ts` (PUT /api/trades/{id})

