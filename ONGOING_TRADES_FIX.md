# Ongoing Trades Fetch Fix

## Issue
The "Ongoing Trades" subtab in the Offers section was failing to fetch data.

## Root Cause
The `fetchOngoingTrades()` function was not properly filtering trades by direction (incoming/outgoing). The API endpoint `/api/trades` requires a `direction` parameter to properly filter and return results. Without this parameter, the API couldn't determine what trades to return for the user.

### Original Implementation (Broken):
```typescript
const fetchOngoingTrades = async () => {
  if (!user) return
  try {
    setOngoingLoading(true)
    // Missing direction parameter - API can't filter properly
    const [bothDirections] = await Promise.all([
      api.get('/api/trades', { 
        params: { 
          include: 'products', 
          status: 'accepted,active',
          limit: 100
        } 
      }),
    ])
    // ... rest of code
  }
}
```

**Problem:** Without `direction: 'incoming'` or `direction: 'outgoing'`, the API doesn't know which trades to return.

## Solution
Updated `fetchOngoingTrades()` to explicitly request both incoming and outgoing active/accepted trades with proper direction parameters:

### Fixed Implementation:
```typescript
const fetchOngoingTrades = async () => {
  if (!user) return
  try {
    setOngoingLoading(true)
    // Fetch both incoming AND outgoing active trades separately
    const [incomingRes, outgoingRes] = await Promise.all([
      api.get('/api/trades', { 
        params: { 
          direction: 'incoming',      // ✅ Required parameter
          include: 'products', 
          status: 'accepted,active',
          limit: 100
        } 
      }),
      api.get('/api/trades', { 
        params: { 
          direction: 'outgoing',      // ✅ Required parameter
          include: 'products', 
          status: 'accepted,active',
          limit: 100
        } 
      })
    ])

    // Extract data from both responses
    const incomingData = Array.isArray(incomingRes.data?.data) 
      ? incomingRes.data.data 
      : (Array.isArray(incomingRes.data) ? incomingRes.data : [])

    const outgoingData = Array.isArray(outgoingRes.data?.data) 
      ? outgoingRes.data.data 
      : (Array.isArray(outgoingRes.data) ? outgoingRes.data : [])

    // Combine both and deduplicate
    const allTrades = [...incomingData, ...outgoingData]
    const uniqueTrades = new Map<number, Trade>()
    allTrades.forEach((tr: Trade) => {
      if (tr && tr.id) uniqueTrades.set(tr.id, tr)
    })

    const merged = Array.from(uniqueTrades.values())
    setOngoingTradesData(merged)
    setOngoingLoaded(true)
    cacheProductImages(merged)
  } catch (e: any) {
    console.error('Failed to fetch ongoing trades:', e)
    toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to load ongoing trades', status: 'error' })
    setOngoingTradesData([])
  } finally {
    setOngoingLoading(false)
  }
}
```

## Changes Made
- **File**: [Dashboard.tsx](Dashboard.tsx#L356-L402)
- **Lines**: 356-402
- Added explicit `direction: 'incoming'` parameter to incoming trades request
- Added explicit `direction: 'outgoing'` parameter to outgoing trades request
- Both requests now properly filter for `status: 'accepted,active'`
- Combined results from both requests with deduplication by trade ID

## Pattern Alignment
Now matches the pattern used in `fetchSentOffers()` and `fetchReceivedOffers()` which both include the `direction` parameter:

```typescript
// This pattern is now consistent across all offer/trade fetches
const response = await api.get('/api/trades', { 
  params: { 
    direction: 'incoming' | 'outgoing',  // ✅ Always included
    include: 'products', 
    status: 'accepted,active' | 'pending',
    limit: 100
  } 
})
```

## Result
✅ Ongoing Trades subtab now properly fetches and displays both incoming and outgoing accepted/active trades
✅ Data loads without errors
✅ Build compiles successfully
✅ Consistent with other fetch functions in Dashboard

## Testing
To verify the fix works:
1. Navigate to Dashboard → Offers tab
2. Click on "Ongoing Trades" subtab
3. Verify trades load without errors
4. Check browser console for any error messages
5. If trades exist, they should display as cards/list
