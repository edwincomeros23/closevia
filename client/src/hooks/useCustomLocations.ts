import { useState, useCallback, useEffect } from 'react'

export interface CustomLocation {
  id: string
  name: string
  address: string
  latitude: number
  longitude: number
  createdAt: string
}

const STORAGE_KEY = 'clovia_custom_locations'

export const useCustomLocations = () => {
  const [locations, setLocations] = useState<CustomLocation[]>([])
  const [loading, setLoading] = useState(true)

  // Load locations from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setLocations(Array.isArray(parsed) ? parsed : [])
      }
    } catch (err) {
      console.error('Error loading custom locations:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Save locations to localStorage
  const saveToStorage = useCallback((locs: CustomLocation[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(locs))
    } catch (err) {
      console.error('Error saving custom locations:', err)
    }
  }, [])

  // Add new location
  const addLocation = useCallback((location: Omit<CustomLocation, 'id' | 'createdAt'>) => {
    const newLocation: CustomLocation = {
      ...location,
      id: `loc_${Date.now()}`,
      createdAt: new Date().toISOString(),
    }
    const updated = [...locations, newLocation]
    setLocations(updated)
    saveToStorage(updated)
    return newLocation
  }, [locations, saveToStorage])

  // Delete location
  const deleteLocation = useCallback((locationId: string) => {
    const updated = locations.filter(loc => loc.id !== locationId)
    setLocations(updated)
    saveToStorage(updated)
  }, [locations, saveToStorage])

  // Update location
  const updateLocation = useCallback((locationId: string, updates: Partial<CustomLocation>) => {
    const updated = locations.map(loc =>
      loc.id === locationId ? { ...loc, ...updates } : loc
    )
    setLocations(updated)
    saveToStorage(updated)
  }, [locations, saveToStorage])

  // Get location by ID
  const getLocation = useCallback((locationId: string) => {
    return locations.find(loc => loc.id === locationId)
  }, [locations])

  return {
    locations,
    loading,
    addLocation,
    deleteLocation,
    updateLocation,
    getLocation,
  }
}
