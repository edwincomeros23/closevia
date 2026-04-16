# Location Data Structure Analysis - BuyoutModal & Products

## 1. BuyoutModal "Detect my location" Button - How It Works

### Button Implementation
**File:** [client/src/components/BuyoutModal.tsx](client/src/components/BuyoutModal.tsx#L433)

```tsx
<Button
  size="sm"
  variant="outline"
  w="full"
  fontSize="11px"
  height="32px"
  isLoading={detectingLocation}
  loadingText="Detecting..."
  onClick={handleDetectLocation}
  borderColor={selectedBorder}
  color={selectedBorder}
  _hover={{ bg: selectedBg }}
>
  📍 Detect my location
</Button>
```

### Handler Function: `handleDetectLocation()`
**File:** [client/src/components/BuyoutModal.tsx](client/src/components/BuyoutModal.tsx#L190)

```tsx
const handleDetectLocation = async () => {
  if (!navigator.geolocation) {
    toast({
      id: "buyoutmodal-geolocation-not-supported", 
      title: 'Geolocation not supported', 
      status: 'error', 
      duration: 3000 
    })
    return
  }

  if (tradeOption !== 'delivery') {
    setTradeOption('delivery')  // Auto-switch to delivery when detecting location
  }

  setDetectingLocation(true)
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords
      const address = await reverseGeocodeToAddress(latitude, longitude)
      setDetectedCoords({ lat: latitude, lng: longitude })
      setDetectedLocationLabel(address)

      try {
        // Also save to user profile
        await api.put('/api/users/profile', { latitude, longitude })
        if (refreshUser) await refreshUser()
        toast({
          id: "buyoutmodal-location-saved", 
          title: 'Location saved!', 
          description: address, 
          status: 'success', 
          duration: 3000 
        })
      } catch {
        toast({
          id: "buyoutmodal-failed-to-save-location", 
          title: 'Detected location only for this offer', 
          description: address, 
          status: 'warning', 
          duration: 3500 
        })
      }

      setDetectingLocation(false)
    },
    () => {
      toast({
        id: "buyoutmodal-location-access-denied", 
        title: 'Location access denied', 
        status: 'warning', 
        duration: 4000 
      })
      setDetectingLocation(false)
    },
    { enableHighAccuracy: true, timeout: 10000 }
  )
}
```

### Key Steps:
1. **Check Geolocation Support** - Validates browser has geolocation API
2. **Auto-switch to Delivery** - Sets `tradeOption` to 'delivery' if not already
3. **Get Device Location** - Uses `navigator.geolocation.getCurrentPosition()`
4. **Reverse Geocode** - Converts coordinates to human-readable address using Nominatim
5. **Save to Profile** - Calls `/api/users/profile` with latitude/longitude
6. **Update Local State** - Stores coordinates and address in component state

---

## 2. Location Data Structure Stored

### State Variables in BuyoutModal
**File:** [client/src/components/BuyoutModal.tsx](client/src/components/BuyoutModal.tsx#L28)

```tsx
const [detectingLocation, setDetectingLocation] = useState(false)
const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lng: number } | null>(null)
const [detectedLocationLabel, setDetectedLocationLabel] = useState('')
const [profileLocationLabel, setProfileLocationLabel] = useState('')
```

### Location Data Storage Hierarchy

**Priority Order** (from `resolvedDeliveryAddress()` function):
1. **Detected Location Label** - Reverse-geocoded address from current device geolocation
2. **Detected Coordinates** - Raw lat/lng with fallback formatting
3. **Profile Location Label** - Address from user profile (reverse-geocoded)
4. **User Profile Coordinates** - `user?.latitude` and `user?.longitude`
5. **Undefined** - If no location is available

```tsx
const resolvedDeliveryAddress = (): string | undefined => {
  if (detectedLocationLabel.trim()) return detectedLocationLabel.trim()
  if (detectedCoords) return formatCoordinates(detectedCoords.lat, detectedCoords.lng)
  if (profileLocationLabel.trim()) return profileLocationLabel.trim()
  if (user?.latitude && user?.longitude) return formatCoordinates(user.latitude, user.longitude)
  return undefined
}
```

### Example Output Format
The location detected will be returned as:
- **Full Address**: `"Santo Niño, Zamboanga City"`
- **Road + Barangay**: `"General Luna St, Santo Niño"`
- **Fallback Coordinates**: `"8.646710, 123.598123"`

---

## 3. Geolocation API Handling

### Browser Geolocation Options
**File:** [client/src/components/BuyoutModal.tsx](client/src/components/BuyoutModal.tsx#L221)

```tsx
{ 
  enableHighAccuracy: true,  // Request high accuracy position
  timeout: 10000             // Wait max 10 seconds
}
```

### Position Coordinates Structure

From `navigator.geolocation.getCurrentPosition()`:

```typescript
position.coords = {
  latitude: number,        // e.g., 8.646710
  longitude: number,       // e.g., 123.598123
  accuracy: number,        // Accuracy radius in meters
  altitude: number | null,
  altitudeAccuracy: number | null,
  heading: number | null,
  speed: number | null
}
```

The handler extracts:
```tsx
const { latitude, longitude } = position.coords
```

---

## 4. Reverse Geocoding to Human-Readable Address

### Reverse Geocode Function
**File:** [client/src/utils/locationUtils.ts](client/src/utils/locationUtils.ts)

```tsx
export const reverseGeocodeToAddress = async (
  latitude: number, 
  longitude: number
): Promise<string> => {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
      {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }
    )

    if (!response.ok) {
      return formatCoordinates(latitude, longitude)
    }

    const data = await response.json()
    return pickBestAddress(data) || formatCoordinates(latitude, longitude)
  } catch {
    return formatCoordinates(latitude, longitude)
  } finally {
    window.clearTimeout(timeoutId)
  }
}
```

### Address Selection Logic (`pickBestAddress()`)

Nominatim API returns raw address components, algorithm selects best combination:

1. **Priority 1**: Barangay + City/Municipality
   - `city_district`, `quarter`, `suburb`, `village`, `hamlet`, `neighbourhood` 
   - + `city`, `municipality`, `town`, `county`
   - **Result**: `"Santo Niño, Zamboanga City"`

2. **Priority 2**: Road + Barangay
   - e.g., `"General Luna St, Santo Niño"`

3. **Priority 3**: Multi-level fallback
   - Uses first available: barangay, city/municipality, state
   - `"Santo Niño, Zamboanga"`

4. **Priority 4**: Nominatim display_name (first 2 parts)
   - If Nominatim returns: `"Santo Niño, Zamboanga City, Philippines"`
   - Returns: `"Santo Niño, Zamboanga City"`

5. **Fallback**: Full display_name or coordinates
   - `"Santo Niño, Zamboanga City, Philippines"`
   - or `"8.646710, 123.598123"`

**File snippet** from [client/src/utils/locationUtils.ts](client/src/utils/locationUtils.ts#L8):

```tsx
const pickBestAddress = (data: any): string | undefined => {
  const address = data?.address || {}

  // Prefer PH barangay-like granularity first
  const barangay =
    address.city_district ||
    address.quarter ||
    address.suburb ||
    address.village ||
    address.hamlet ||
    address.neighbourhood

  const cityOrMunicipality =
    address.city ||
    address.municipality ||
    address.town ||
    address.county

  const road = address.road || address.pedestrian || address.footway

  if (barangay && cityOrMunicipality) {
    return `${barangay}, ${cityOrMunicipality}`
  }

  if (road && barangay) {
    return `${road}, ${barangay}`
  }

  const primary = [barangay, cityOrMunicipality, address.state].filter(Boolean)
  if (primary.length > 0) {
    return primary.join(', ')
  }

  if (typeof data?.display_name === 'string' && data.display_name.trim() !== '') {
    const parts = data.display_name
      .split(',')
      .map((part: string) => part.trim())
      .filter(Boolean)

    if (parts.length >= 2) {
      return `${parts[0]}, ${parts[1]}`
    }
  }

  return data?.display_name
}
```

---

## 5. Product Location Data Storage

### Product Interface
**File:** [client/src/types/index.ts](client/src/types/index.ts#L43)

```typescript
export interface Product {
  id: number
  title: string
  description: string
  price?: number
  image_urls: string[]
  seller_id: number
  
  // ===== LOCATION FIELDS =====
  location?: string           // Human-readable location (e.g., "Santo Niño, Zamboanga City")
  latitude?: number           // Seller latitude at time of listing
  longitude?: number          // Seller longitude at time of listing
  distance?: string           // Calculated distance from user (e.g., "1.2km nearby")
  distanceKm?: number         // Numeric distance in km for sorting
  
  condition?: string
  category?: string
  status: 'available' | 'sold' | 'traded' | 'locked' | 'suspended'
  allow_buying: boolean
  barter_only: boolean
  created_at: string
  updated_at: string
  // ... other fields
}
```

### User Location Profile
**File:** [client/src/types/index.ts](client/src/types/index.ts#L1)

```typescript
export interface User {
  id: number
  name: string
  email: string
  
  // ===== LOCATION FIELDS =====
  latitude?: number           // User's detected/stored latitude
  longitude?: number          // User's detected/stored longitude
  
  profile_picture?: string
  verified: boolean
  created_at: string
  updated_at: string
  // ... other fields
}
```

### Available Product Location Fields Summary

| Field | Type | Source | Example |
|-------|------|--------|---------|
| `location` | `string?` | Geocoded at listing creation | `"Santo Niño, Zamboanga City"` |
| `latitude` | `number?` | Device geolocation | `8.646710` |
| `longitude` | `number?` | Device geolocation | `123.598123` |
| `distance` | `string?` | Calculated from user | `"1.2 km"`, `"500 M"` |
| `distanceKm` | `number?` | Calculated | `1.2` |

---

## 6. Trade Submission with Location

### TradeCreate Interface
**File:** [client/src/types/index.ts](client/src/types/index.ts#L303)

```typescript
export interface TradeCreate {
  target_product_id: number
  offered_product_ids: number[]
  message?: string
  offered_cash_amount?: number
  trade_option: TradeOption           // 'meetup' | 'delivery'
  delivery_address?: string           // Location address for delivery
  payment_method?: 'cod' | 'upfront'  // 'cod' for delivery, 'upfront' for meetup
}
```

### Buyout Submit Payload
**File:** [client/src/components/BuyoutModal.tsx](client/src/components/BuyoutModal.tsx#L150)

```tsx
const submitTrade = async () => {
  // ... validation ...
  
  const deliveryAddress = resolvedDeliveryAddress()
  
  // Determine payment method based on trade option
  const paymentMethod = tradeOption === 'meetup' ? 'upfront' : 'cod'
  
  const payload: TradeCreate = {
    target_product_id: targetProductId,
    offered_product_ids: [],              // Empty for buyout
    message: tradeMessage,
    offered_cash_amount: Number(cashAmount),
    trade_option: tradeOption,            // 'meetup' or 'delivery'
    delivery_address: tradeOption === 'delivery' ? deliveryAddress : undefined,
    payment_method: paymentMethod,
  }
  
  await api.post('/api/trades', payload)
}
```

### Example Payload for Delivery Buyout
```json
{
  "target_product_id": 42,
  "offered_product_ids": [],
  "message": "I'm interested in this item!",
  "offered_cash_amount": 500,
  "trade_option": "delivery",
  "delivery_address": "Santo Niño, Zamboanga City",
  "payment_method": "cod"
}
```

---

## 7. Complete Location Detection Flow

```
User clicks "📍 Detect my location" button
         ↓
Check if navigator.geolocation is supported
         ↓
Auto-switch trade_option to 'delivery'
         ↓
Set detectingLocation = true (show loading state)
         ↓
Call navigator.geolocation.getCurrentPosition()
         ↓
  ┌─────────────────────────────┐
  │   Position Retrieved        │
  │ lat: 8.646710              │
  │ lng: 123.598123            │
  └─────────────────────────────┘
         ↓
Call reverseGeocodeToAddress(lat, lng)
  → Fetch from Nominatim API
  → Parse address components
  → Return: "Santo Niño, Zamboanga City"
         ↓
Store in state:
  - detectedCoords = { lat: 8.646710, lng: 123.598123 }
  - detectedLocationLabel = "Santo Niño, Zamboanga City"
         ↓
Try to save to user profile
  - PUT /api/users/profile { latitude, longitude }
  - Call refreshUser() to update auth context
         ↓
Show success/warning toast with address
         ↓
Set detectingLocation = false (hide loading)
         ↓
Display location in delivery address box
         ↓
User submits trade with delivery_address = "Santo Niño, Zamboanga City"
```

---

## 8. Display in UI

### Location Display Section (when delivery is selected)
**File:** [client/src/components/BuyoutModal.tsx](client/src/components/BuyoutModal.tsx#L387)

```tsx
{tradeOption === 'delivery' && (
  <VStack spacing={2} mt={3} align="stretch">
    {/* Location Display */}
    <Box 
      p={2.5} 
      bg={useColorModeValue('gray.50', 'gray.700')} 
      borderWidth="1px" 
      borderColor={useColorModeValue('gray.200', 'gray.600')} 
      rounded="md"
    >
      <HStack justify="space-between" align="center" spacing={2}>
        <HStack spacing={2} flex={1} minW={0}>
          <Icon as={FaMapMarkerAlt} boxSize={4} color={selectedBorder} flexShrink={0} />
          <VStack spacing={0} align="start" minW={0} flex={1}>
            <Text fontSize="11px" fontWeight="600" noOfLines={1}>
              {detectedLocationLabel || profileLocationLabel || 'Location not set'}
            </Text>
            <Text fontSize="9px" color={mutedTextColor} noOfLines={1}>
              Detected from your device
            </Text>
          </VStack>
        </HStack>
        {(detectedCoords || profileLocationLabel) && (
          <Link
            fontSize="9px"
            fontWeight="600"
            color={selectedBorder}
            onClick={() => {
              setDetectedCoords(null)
              setDetectedLocationLabel('')
            }}
            textDecoration="none"
            _hover={{ textDecoration: 'underline' }}
            flexShrink={0}
          >
            Clear
          </Link>
        )}
      </HStack>
    </Box>
  </VStack>
)}
```

### Display Output
Shows address like:
```
📍 Santo Niño, Zamboanga City
   Detected from your device        [Clear]
```

---

## 9. Summary of Key Fields & Variables

| Component | Field/Variable | Type | Purpose |
|-----------|---------------|------|---------|
| **BuyoutModal** | `detectedCoords` | `{ lat: number; lng: number } \| null` | Raw GPS coordinates from device |
| **BuyoutModal** | `detectedLocationLabel` | `string` | Human-readable address from reverse geocoding |
| **BuyoutModal** | `profileLocationLabel` | `string` | Cached address from user profile coordinates |
| **BuyoutModal** | `detectingLocation` | `boolean` | Loading state for button |
| **BuyoutModal** | `tradeOption` | `'meetup' \| 'delivery' \| null` | Selected fulfillment method |
| **User** | `latitude` | `number?` | User's stored latitude |
| **User** | `longitude` | `number?` | User's stored longitude |
| **Product** | `location` | `string?` | Product listing location text |
| **Product** | `latitude` | `number?` | Seller coordinates at listing |
| **Product** | `longitude` | `number?` | Seller coordinates at listing |
| **TradeCreate** | `delivery_address` | `string?` | Address sent with trade offer |
| **TradeCreate** | `trade_option` | `'meetup' \| 'delivery'` | Fulfillment method selected |

---

## 10. Tech Stack Used

- **Geolocation API**: Browser native `navigator.geolocation.getCurrentPosition()`
- **Reverse Geocoding**: OpenStreetMap Nominatim API (free, no API key)
- **Coordinates Format**: WGS-84 (latitude, longitude in decimal degrees)
- **Address Components**: Parsed from Nominatim JSON response
- **Timeout**: 10 seconds for geolocation request
