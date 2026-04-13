/**
 * useCallAPI - Custom hook for cached API calls with auto-deduplication
 * Provides easy caching interface for components
 */

import { useEffect, useState, useRef } from 'react'
import { cacheService, sellerStatsCache, reviewsCache } from '../services/cacheService'
import { api } from '../services/api'

interface UseCallAPIOptions {
  cacheKey?: string
  cacheDuration?: number
  useSpecializedCache?: 'reviews' | 'stats' | 'default'
  enabled?: boolean
}

export function useCallAPI<T>(
  endpoint: string,
  options: UseCallAPIOptions = {}
): {
  data: T | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
} {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const isMountedRef = useRef(true)

  const {
    cacheKey = endpoint,
    cacheDuration = 5 * 60 * 1000, // 5 minutes default
    useSpecializedCache = 'default',
    enabled = true,
  } = options

  // Select appropriate cache service
  const getCache = () => {
    switch (useSpecializedCache) {
      case 'reviews':
        return reviewsCache
      case 'stats':
        return sellerStatsCache
      default:
        return cacheService
    }
  }

  const cache = getCache()

  const fetchData = async () => {
    if (!isMountedRef.current) return

    setLoading(true)
    setError(null)

    try {
      const result = await cache.getOrFetch<T>(
        cacheKey,
        () => api.get(endpoint).then((r: any) => r.data?.data || r.data),
        cacheDuration
      )

      if (isMountedRef.current) {
        setData(result || null)
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)))
        console.error(`[API Error] ${endpoint}:`, err)
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    fetchData()

    return () => {
      isMountedRef.current = false
    }
  }, [endpoint, enabled, cacheKey, cacheDuration])

  const refetch = async () => {
    // Clear cache for this key first
    cache.delete(cacheKey)
    await fetchData()
  }

  return { data, loading, error, refetch }
}

export default useCallAPI
