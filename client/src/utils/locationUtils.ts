const REVERSE_GEOCODE_TIMEOUT_MS = 10000

export const formatCoordinates = (latitude: number, longitude: number): string => {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
}

const pickBestAddress = (data: any): string | undefined => {
  const address = data?.address || {}

  // Prefer PH barangay-like granularity first, then city/municipality.
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
      // Keep only the first two levels to avoid very verbose strings.
      return `${parts[0]}, ${parts[1]}`
    }
  }

  return data?.display_name
}

export const reverseGeocodeToAddress = async (latitude: number, longitude: number): Promise<string> => {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REVERSE_GEOCODE_TIMEOUT_MS)

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
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