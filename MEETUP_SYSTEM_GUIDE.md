# 🎯 Meetup System - Complete Implementation Guide

## Overview

This guide covers the complete stage-aware meetup system for Clovia, including testing procedures, styling enhancements, error handling, and advanced features.

---

## 📊 System Architecture

### Backend (Go)
- **MeetupService** (`services/meetup_service.go`) - Core business logic for 6 stage transitions
- **MeetupReminderService** (`services/meetup_reminder_service.go`) - Background scheduler for pre-meetup reminders
- **Handlers** (`handlers/meetup_handler.go`) - HTTP API endpoints
- **Database** (`database/database.go`) - Meetup tables with full status tracking

### Frontend (React/TypeScript)
- **MeetupStatusTracker** - Visual 5-stage timeline with animations
- **MeetupSystemMessage** - System message display with error handling
- **MeetupActionButtons** - Interactive action buttons for stage transitions
- **MeetupLocationSelector** - Map-based location picker
- **ViewTradeModal** - Chat integration with system messages

### Services
- **meetupSystemTester.ts** - Comprehensive test suite (8 tests)
- **meetupAlertService.ts** - Automated user alert scheduling

---

## ✅ Testing Guide

### Running Tests Programmatically

```typescript
import MeetupSystemTester from '@/services/meetupSystemTester'

// Initialize tester
const tester = new MeetupSystemTester()
const initialized = await tester.initialize(tradeId)

// Run all tests
const results = await tester.runAllTests()

// Print results
tester.printResults()

// Export results as JSON
const jsonResults = tester.exportResultsJSON()
console.log(jsonResults)

// Get summary
const summary = tester.getResultsSummary()
console.log(`Success Rate: ${summary.successRate}%`)
```

### Test Coverage

| # | Test Name | Purpose | Expected Result |
|---|-----------|---------|-----------------|
| 1 | ProposeMeetupTime | Propose time/location | Success with timestamp |
| 2 | ConfirmMeetupSchedule | Transition to scheduled | Stage becomes 'scheduled' |
| 3 | MarkHeadingOut | User leaving for meetup | Stage becomes 'on_the_way' |
| 4 | MarkArrived | User at meetup location | Stage becomes 'arrived' |
| 5 | ConfirmCompletion | Exchange completed | Stage becomes 'completed' |
| 6 | ReportNoShow | User didn't appear | Stage becomes 'no_show' |
| 7 | VerifySystemMessages | Chat messages created | System messages present |
| 8 | GetMeetupStatus | Fetch current status | Valid stage returned |

### Running Tests in Browser Console

```javascript
// From DevTools Console
const MeetupSystemTester = await import('./services/meetupSystemTester.ts')
const tester = new MeetupSystemTester.default()

await tester.initialize(123) // trade ID
const results = await tester.runAllTests()
tester.printResults()
```

---

## 🎨 Styling Enhancements

### MeetupStatusTracker Improvements

**Features:**
- Gradient background with animated effects
- Progress bar showing completion percentage
- Smooth animations on stage transitions
- Hover effects on stage circles
- Dynamic completion checkmarks
- Color-coded status badges
- Scheduled time/location display cards

**Color Scheme:**
- Active Stage: Purple (brand.500)
- Completed: Green (green.500)
- Inactive: Gray (gray.300)
- Completed background: Purple gradient

**Animations:**
- Stage entry: Staggered fade-in (0.1s delay per stage)
- Progress: Smooth transition on completion
- Hover: Scale up + shadow effect
- Connectors: Smooth color transition

### MeetupSystemMessage Styling

**Features:**
- Multiple gradient backgrounds per message type
- Animated message appearance
- Error state with alert UI
- Loading spinner during API calls
- Emoji-enhanced headers
- Disabled button states
- Responsive button layout

**Message Type Gradients:**
```typescript
- Negotiation: Purple (667eea → 764ba2)
- Proposal: Pink (f093fb → f5576c)
- Confirmation: Cyan (4facfe → 00f2fe)
- Reminder: Warm (fa709a → fee140)
- Completed: Teal (13547a → 80d0c7)
- No-Show: Red (ff6b6b → ee5a6f)
```

---

## ⚠️ Error Handling

### Frontend Error Handling

**MeetupSystemMessage**
```typescript
// Catches and displays errors
try {
  const response = await api.post(endpoint, payload)
  if (!response.data.success) {
    throw new Error(response.data.error)
  }
} catch (error) {
  setError(errorMessage)
  toast({ status: 'error', description: errorMessage })
}
```

**Error States:**
- Network errors
- API validation errors
- Missing trade ID
- Unauthorized user
- API timeout
- Invalid action type

**User Feedback:**
- Toast notifications (top-right)
- Inline error alerts
- Disabled action buttons during errors
- Retry capability built-in
- Detailed error descriptions

### Backend Error Handling

**MeetupService**
```go
if err != nil {
  return nil, fmt.Errorf("descriptive error: %w", err)
}
```

**Error Types:**
- Database errors
- Invalid stage transitions
- Missing meetup data
- Unauthorized updates
- Duplicate confirmations

### API Response Format

**Success:**
```json
{
  "success": true,
  "data": {
    "stage": "scheduled",
    "agreed_time": "2026-04-01T15:30:00Z",
    "message": "Meetup confirmed successfully"
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": "User is not authorized to update this trade's meetup status",
  "code": "UNAUTHORIZED"
}
```

---

## 🚀 Advanced Features

### 1. Map-Based Location Selection

**Component:** `MeetupLocationSelector.tsx`

**Features:**
- Interactive map with Leaflet
- Suggested locations (cafes, malls, public spaces)
- Search functionality
- Distance calculation
- Partner location badges
- 24/7 availability flags
- Map view tab
- List view tab

**Usage:**
```typescript
const { isOpen, onOpen, onClose } = useDisclosure()

<MeetupLocationSelector
  userLat={user.latitude}
  userLng={user.longitude}
  isOpen={isOpen}
  onClose={onClose}
  onLocationSelect={(location) => {
    console.log(`Selected: ${location.name}`)
  }}
/>
```

**Location Data:**
```typescript
{
  id: 'sm_mindpro',
  name: 'SM Mindpro Mall',
  address: 'La Purisima St, Zamboanga City',
  type: 'mall',
  lat: 6.9080,
  lng: 122.0745,
  isPartner: true,
  distance: 1.2,
  available24h: false
}
```

### 2. Automated User Alerts

**Service:** `meetupAlertService.ts`

**Alert Types:**
- MEETUP_SCHEDULED
- APPROACHING_TIME
- ONE_HOUR_BEFORE
- THIRTY_MINS_BEFORE
- USER_HEADING_OUT
- USER_ARRIVED
- AWAITING_OTHER_USER
- BOTH_ARRIVED
- COMPLETION_REQUIRED
- NO_SHOW_WARNING
- TRADE_COMPLETED

**Implementation:**
```typescript
import meetupAlertService from '@/services/meetupAlertService'

// Initialize with notification context
meetupAlertService.initialize(showNotification)

// Setup full alert schedule
const meetupTime = new Date('2026-04-01T15:30:00Z')
meetupAlertService.setupMeetupAlertSchedule(tradeId, meetupTime)

// Schedule individual alert
meetupAlertService.scheduleAlert(
  tradeId,
  AlertType.ONE_HOUR_BEFORE,
  oneHourBefore
)

// Cancel alerts
meetupAlertService.cancelAlert(tradeId, AlertType.ONE_HOUR_BEFORE)
meetupAlertService.cancelAllAlertsForTrade(tradeId)

// Get statistics
const stats = meetupAlertService.getAlertStats()
```

**Features:**
- Browser notifications (when granted)
- Scheduled timing (1h, 30m, 5m before)
- Auto-dismiss on timeout
- Action buttons in notifications
- Singleton pattern
- Track executions

**Permission Request:**
```typescript
const granted = await MeetupAlertService.requestNotificationPermission()
```

### 3. System Message Integration

**Automatic Generation:**
- Negotiation prompts
- Scheduled confirmations
- Heading out updates
- Arrival confirmations
- Completion requests
- No-show reports

**Display in Chat:**
```typescript
// Combined rendering of system messages + regular messages
[
  ...meetupSystemMessages.map(msg => ({
    ...msg,
    type: 'system'
  })),
  ...messages.map(msg => ({
    ...msg,
    type: 'regular'
  }))
]
.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
.map(item => {
  if (item.type === 'system') {
    return <MeetupSystemMessage {...item} />
  } else {
    return <RegularMessage {...item} />
  }
})
```

### 4. Pre-Meetup Reminder Scheduler

**Backend Service:** `MeetupReminderService`

**Functions:**
- Runs every 10 minutes
- Finds meetups within 24-30 hours
- Sends system messages with action buttons
- Marks reminders as sent
- Prevents duplicate reminders

**Configuration (main.go):**
```go
reminderService := services.NewMeetupReminderService(database.DB)
go func() {
  log.Println("Starting pre-meetup reminder scheduler...")
  reminderService.SchedulePreMeetupReminders()
}()
```

---

## 🔄 Stage Transition Flow

```
Negotiating
    ↓ (Both propose same time/location)
Scheduled ← System message: "✅ Meetup Scheduled!"
    ↓ (User clicks "I'm Heading Out")
On The Way ← System message: "🚗 On Your Way"
    ↓ (User clicks "I've Arrived")
Arrived ← System message: "📍 You've Arrived"
    ↓ (Both users click "Exchange Complete")
Completed ← System message: "🎉 Exchange Complete"

OR at any stage:
    ↓ (Click "Report No-Show")
No-Show ← System message: "⚠️ No-Show Reported"
```

---

## 📱 User Journey

### Step 1: Meetup Negotiation
- Buyer and seller discuss time/location in chat
- System message prompts: "Propose meetup details"
- Users click "Propose Time" button
- Modal opens with date/time picker and map

### Step 2: Scheduled Confirmation
- When both users propose matching time/location
- Automatic transition to "Scheduled"
- System message: "✅ Meetup Confirmed!"
- Displays agreed time and location
- Pre-meetup reminders scheduled

### Step 3: Heading Out
- User receives "30 mins before" alert
- User clicks "I'm Heading Out" button
- Status updates in real-time
- Other user notified via system message

### Step 4: Arrival
- User clicks "I've Arrived"
- System waits for other user
- When both arrive: "✨ Both Arrived!" message
- Button changes to "Exchange Complete"

### Step 5: Completion
- First user clicks "Complete Exchange"
- Waits for other user's confirmation
- Both must confirm
- Trade marked as "Completed"
- Receipt generated automatically

### Step 6: Dispute Handling
- If user doesn't arrive after time
- Other user clicks "Report No-Show"
- Modal with reason selector
- Support team notified
- Trade marked as "No-Show"

---

## 🔧 Configuration

### Environment Variables

```env
REACT_APP_API_URL=http://localhost:4000
REACT_APP_ENABLE_NOTIFICATIONS=true
REACT_APP_REMIND_BEFORE_MEETUP=true
```

### Backend Configuration (main.go)

```go
// Reminder service check interval
ticker := time.NewTicker(10 * time.Minute)

// Reminder window (24-30 hours before)
AND ms.agreed_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 HOUR)
```

---

## 📊 Metrics & Monitoring

### Test Results Example

```
============================================================
📊 MEETUP SYSTEM TEST RESULTS
============================================================

1. ✅ ProposeMeetupTime - PASS
   Duration: 245ms
   Details: Successfully proposed meetup time

2. ✅ ConfirmMeetupSchedule - PASS
   Duration: 189ms
   Details: Meetup confirmed and transitioned to scheduled stage

... (more tests)

============================================================
📈 SUMMARY
============================================================
Total Tests: 8
Passed: 8 ✅
Failed: 0 ❌
Success Rate: 100%
Average Duration: 201ms
============================================================
```

### Alert Statistics

```typescript
const stats = meetupAlertService.getAlertStats()
// {
//   total: 12,
//   executed: 3,
//   pending: 9,
//   byTrade: { 123: 4, 124: 8 }
// }
```

---

## 🐛 Troubleshooting

### Issue: System messages not appearing in chat
**Solution:**
- Check `fetchMeetupSystemMessages()` is called every 3 seconds
- Verify API endpoint returns valid messages
- Check browser console for errors

### Issue: Alerts not triggering
**Solution:**
- Call `meetupAlertService.initialize(showNotification)`
- Request browser notification permission
- Check Chrome console for timer logs

### Issue: Location selector not loading
**Solution:**
- Verify Leaflet CSS is imported
- Check map container has fixed height
- Verify user coordinates are valid

### Issue: Stage transition failed
**Solution:**
- Check user is part of trade (buyer or seller)
- Verify trade status is 'active'
- Check authentication token is valid
- See error message in toast notification

---

## 📝 API Endpoints

```
POST   /api/trades/:id/meetup/propose           - Propose time/location
POST   /api/trades/:id/meetup/confirm           - Confirm schedule
POST   /api/trades/:id/meetup/heading-out       - Mark heading out
POST   /api/trades/:id/meetup/arrived           - Mark arrived
POST   /api/trades/:id/meetup/confirm-completion - Confirm trade complete
POST   /api/trades/:id/meetup/report-no-show    - Report no-show
GET    /api/trades/:id/meetup/status            - Get current status
GET    /api/trades/:id/meetup/messages          - Get system messages
```

---

## ✨ Summary

The Clovia meetup system provides a complete stage-aware framework for coordinating in-person trades with:

✅ 6 stage transitions with mutual confirmations
✅ Automatic system messages guiding users
✅ Comprehensive error handling and user feedback
✅ Beautiful gradient animations and styling
✅ Map-based location selection with 6+ suggested locations
✅ Automated alert scheduling (1h, 30m, 5m before)
✅ Complete test suite with 8 integration tests
✅ Real-time notifications and browser alerts
✅ No-show reporting and dispute handling
✅ 24-hour pre-meetup reminder scheduler

All components are fully typed, error-handled, and production-ready.
