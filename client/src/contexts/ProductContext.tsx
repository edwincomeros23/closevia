import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Product, ProductCreate, ProductUpdate, SearchFilters, PaginatedResponse } from '../types'
import { api } from '../services/api'
import { apiCallWithRetry } from '../utils/apiUtils'

interface ProductContextType {
  products: Product[]
  loading: boolean
  error: string | null
  hasMore: boolean
  isLoadingMore: boolean
  searchProducts: (filters: SearchFilters) => Promise<void>
  loadMore: () => Promise<void>
  getProduct: (idOrSlug: number | string) => Promise<Product | null>
  createProduct: (product: ProductCreate | FormData) => Promise<Product>
  updateProduct: (id: number, product: ProductUpdate) => Promise<void>
  deleteProduct: (id: number) => Promise<void>
  getUserProducts: (userId: number, page?: number) => Promise<PaginatedResponse<Product>>
  clearError: () => void
}

// Default no-op context so HMR / out-of-provider renders never crash
const defaultContext: ProductContextType = {
  products: [],
  loading: false,
  error: null,
  hasMore: false,
  isLoadingMore: false,
  searchProducts: async () => {},
  loadMore: async () => {},
  getProduct: async () => null,
  createProduct: async () => ({ id: 0, title: '', description: '', seller_id: 0, status: 'available', created_at: '', updated_at: '' } as any),
  updateProduct: async () => {},
  deleteProduct: async () => {},
  getUserProducts: async () => ({ data: [], total: 0, page: 1, limit: 20, total_pages: 0 }),
  clearError: () => {},
}

const ProductContext = createContext<ProductContextType>(defaultContext)

export const useProducts = () => {
  return useContext(ProductContext)
}

interface ProductProviderProps {
  children: ReactNode
}

export const ProductProvider: React.FC<ProductProviderProps> = ({ children }) => {
  const queryClient = useQueryClient()
  // Avoid calling `useAuth()` here to prevent errors when provider ordering
  // is incorrect during initialization. Read token from localStorage instead
  // which is safe even if `AuthProvider` isn't present yet.
  const [token] = useState<string | null>(() => localStorage.getItem('clovia_token'))
  const [products, setProducts] = useState<Product[]>(() => {
    // Try to restore from localStorage on mount
    try {
      const cached = localStorage.getItem('clovia_home_products')
      if (!cached) return []
      // Strip cached distances — they were computed against the user's
      // previous location and can be stale (e.g. showing 1.7km on every
      // card). Backend will refill on the next fetch.
      const parsed = JSON.parse(cached) as Product[]
      return parsed.map((p) => ({ ...p, distance: '', distanceKm: Infinity }))
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState<boolean>(true)
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [currentFilters, setCurrentFilters] = useState<SearchFilters | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const locationRequested = useRef(false)

  // Cache management refs
  const cacheRef = useRef<{ filters: string; products: Product[]; timestamp: number } | null>(null)
  const pendingRequestRef = useRef<Promise<void> | null>(null)
  const hasInitialized = useRef(false)

  // Persist products to localStorage
  useEffect(() => {
    if (products.length > 0) {
      try {
        localStorage.setItem('clovia_home_products', JSON.stringify(products))
      } catch (e) {
        console.warn('Failed to persist products:', e)
      }
    }
  }, [products])

  // Get user's current location
  useEffect(() => {
    if (locationRequested.current) return
    locationRequested.current = true

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude
          const lng = position.coords.longitude
          setUserLocation({ lat, lng })
          // Persist to backend so product distance calculations server-side
          // (and other users checking this user's location) stay fresh.
          if (token) {
            api.put('/api/users/location', { latitude: lat, longitude: lng }).catch(() => {})
          }
        },
        (error) => {
          console.warn('Geolocation error:', error.message)
          // Don't set error state, just silently fail - distance will show fallback
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // Cache for 5 minutes
        }
      )
    }
  }, [token])

  // Recalculate distances when user location becomes available
  useEffect(() => {
    if (userLocation && products.length > 0) {
      const productsWithDistance = addDistanceToProducts(products)
      setProducts(productsWithDistance)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation])

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number => {
    const R = 6371 // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // Format distance for display - refined for accuracy as per user request
  const formatDistance = (distanceKm: number): string => {
    if (distanceKm === 0) return '0 M away'
    
    // Convert to meters
    const meters = distanceKm * 1000
    
    if (meters < 2000) {
      // Show nearby distances in meters for better granularity (up to ~2km)
      if (meters < 10) {
        return `${meters.toFixed(1)} M away`
      }
      return `${Math.round(meters)} M away`
    } else {
      // If more than 1km, show in KM with 1 decimal place
      return `${distanceKm.toFixed(1)} KM away`
    }
  }

  // Add distance to products and sort by nearest first
  const addDistanceToProducts = (productsList: Product[]): Product[] => {
    if (!userLocation) return productsList

    const withDistance = productsList.map((product) => {
      let dist = Infinity
      if (product.latitude && product.longitude) {
        dist = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          product.latitude,
          product.longitude
        )
      }

      // If we couldn't compute a per-product distance on the client, keep
      // whatever the backend already returned (may be empty) instead of
      // stamping every card with 'Nearby' — that was making every card in
      // the feed look identical.
      const nextDistance =
        dist === Infinity ? (product.distance || '') : formatDistance(dist)

      return {
        ...product,
        distance: nextDistance,
        distanceKm: dist,
      }
    })

    // Sort by:
    // 1. Premium status (tie-breaker)
    // 2. Distance (nearest first)
    // 3. Newest first (for identical distance)
    withDistance.sort((a, b) => {
      const distA = a.distanceKm
      const distB = b.distanceKm
      
      const isAInf = distA === undefined || distA === Infinity
      const isBInf = distB === undefined || distB === Infinity

      if (isAInf && isBInf) {
        // Continue to other tie-breakers
      } else if (isAInf) {
        return 1
      } else if (isBInf) {
        return -1
      } else if (Math.abs(distA! - distB!) > 0.0001) {
        return distA! - distB!
      }
      
      // Otherwise, prioritize premium
      if (a.premium !== b.premium) {
        return a.premium ? -1 : 1
      }
      
      // Finally, newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return withDistance
  }

  // Helper function to ensure products is always an array
  const safeSetProducts = (newProducts: Product[] | null | undefined) => {
    if (Array.isArray(newProducts)) {
      const productsWithDistance = addDistanceToProducts(newProducts)
      setProducts(productsWithDistance)
    } else {
      setProducts([])
    }
  }

  // Helper function to get headers with auth token
  const getAuthHeaders = () => {
    const headers: any = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  const searchProducts = async (filters: SearchFilters) => {
    try {
      console.log('Searching products with filters:', filters)
      const filterKey = JSON.stringify(filters)

      // Return cached data if available and identical filters
      if (cacheRef.current && cacheRef.current.filters === filterKey) {
        console.log('Using cached products for filters:', filters)
        safeSetProducts(cacheRef.current.products)
        setHasMore(true)
        return
      }

      // Return pending request if same request is already in flight
      if (pendingRequestRef.current) {
        console.log('Request already pending, returning existing promise')
        return pendingRequestRef.current
      }

      // Create the fetch promise
      const fetchPromise = (async () => {
        setLoading(true)
        setError(null)
        setCurrentFilters(filters)

        const params = new URLSearchParams()
        if (filters.keyword) params.append(filters.useSmartSearch ? 'q' : 'keyword', filters.keyword)
        if (filters.category) params.append('category', filters.category)
        if (filters.condition) params.append('condition', filters.condition)
        if (filters.verified_seller_only !== undefined) params.append('verified_seller_only', filters.verified_seller_only.toString())
        if (filters.has_active_offers !== undefined) params.append('has_active_offers', filters.has_active_offers.toString())
        if (filters.sort_by) params.append('sort_by', filters.sort_by)
        if (filters.premium !== undefined) params.append('premium', filters.premium.toString())
        if (filters.seller_id) params.append('seller_id', filters.seller_id.toString())
        if (filters.barter_only !== undefined) params.append('barter_only', filters.barter_only.toString())
        if (filters.allow_buying !== undefined) params.append('allow_buying', filters.allow_buying.toString())
        // Pass viewer coordinates for server-side distance calculation
        if (userLocation) {
          params.append(filters.useSmartSearch ? 'lat' : 'viewer_lat', userLocation.lat.toString())
          params.append(filters.useSmartSearch ? 'lng' : 'viewer_lng', userLocation.lng.toString())
        }
        params.append('page', (filters.page || 1).toString())
        params.append('limit', (filters.limit || 10).toString())

        const endpoint = filters.useSmartSearch ? '/api/products/smart-search' : '/api/products'
        const response = await apiCallWithRetry(async () => {
          return await api.get(`${endpoint}?${params.toString()}`, {
            headers: getAuthHeaders(),
          })
        })

        console.log('API Response:', response.data)

        // Handle different response structures safely
        if (response.data && response.data.data) {
          const data = response.data.data as PaginatedResponse<Product>
          if (data && data.data && Array.isArray(data.data)) {
            console.log('Setting products from paginated response:', data.data.length)
            safeSetProducts(data.data)
            // Cache the result
            cacheRef.current = { filters: filterKey, products: data.data, timestamp: Date.now() }
            // Update pagination state
            setCurrentPage(data.page || 1)
            const total = data.total || 0
            const limit = data.limit || (filters.limit || 10)
            const loaded = data.data.length
            // If returned fewer than limit, we know there's no more
            setHasMore(loaded >= limit && (data.page < (data.total_pages || Number.MAX_SAFE_INTEGER)))
          } else {
            console.log('No products in paginated response')
            safeSetProducts([])
            setHasMore(false)
          }
        } else if (response.data && Array.isArray(response.data)) {
          // Direct array response
          console.log('Setting products from direct array response:', response.data.length)
          safeSetProducts(response.data)
          cacheRef.current = { filters: filterKey, products: response.data, timestamp: Date.now() }
          setHasMore(false)
        } else {
          // Fallback to empty array
          console.log('No products found, setting empty array')
          safeSetProducts([])
          setHasMore(false)
        }
      })()

      pendingRequestRef.current = fetchPromise
      try {
        await fetchPromise
      } finally {
        pendingRequestRef.current = null
      }
    } catch (error: any) {
      console.error('Error fetching products:', error)

      // Handle different types of errors
      let errorMessage = 'Failed to fetch products'
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error
      } else if (error.message) {
        errorMessage = error.message
      } else if (error.code === 'NETWORK_ERROR') {
        errorMessage = 'Network error. Please check your connection.'
      }

      setError(errorMessage)
      safeSetProducts([]) // Ensure products is always an array
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (loading || isLoadingMore || !hasMore) return
    if (!currentFilters) return
    try {
      setIsLoadingMore(true)
      const nextPage = (currentPage || 1) + 1

      const params = new URLSearchParams()
      const filters = currentFilters
      if (filters.keyword) params.append(filters.useSmartSearch ? 'q' : 'keyword', filters.keyword)
      if (filters.category) params.append('category', filters.category)
      if (filters.condition) params.append('condition', filters.condition)
      if (filters.verified_seller_only !== undefined) params.append('verified_seller_only', filters.verified_seller_only.toString())
      if (filters.has_active_offers !== undefined) params.append('has_active_offers', filters.has_active_offers.toString())
      if (filters.sort_by) params.append('sort_by', filters.sort_by)
      if (filters.premium !== undefined) params.append('premium', filters.premium.toString())
      if (filters.seller_id) params.append('seller_id', filters.seller_id.toString())
      if (filters.barter_only !== undefined) params.append('barter_only', filters.barter_only.toString())
      if (filters.allow_buying !== undefined) params.append('allow_buying', filters.allow_buying.toString())
      // Pass viewer coordinates for server-side distance calculation
      if (userLocation) {
        params.append(filters.useSmartSearch ? 'lat' : 'viewer_lat', userLocation.lat.toString())
        params.append(filters.useSmartSearch ? 'lng' : 'viewer_lng', userLocation.lng.toString())
      }
      params.append('page', nextPage.toString())
      params.append('limit', (filters.limit || 10).toString())

      const endpoint = filters.useSmartSearch ? '/api/products/smart-search' : '/api/products'
      const response = await apiCallWithRetry(async () => {
        return await api.get(`${endpoint}?${params.toString()}`, {
          headers: getAuthHeaders(),
        })
      })

      if (response.data && response.data.data) {
        const data = response.data.data as PaginatedResponse<Product>
        const newItems = Array.isArray(data?.data) ? data.data : []
        const newItemsWithDistance = addDistanceToProducts(newItems)
        setProducts(prev => (Array.isArray(prev) ? [...prev, ...newItemsWithDistance] : newItemsWithDistance))
        setCurrentPage(data.page || nextPage)
        const totalPages = data.total_pages || 0
        if (totalPages > 0) {
          setHasMore((data.page || nextPage) < totalPages)
        } else {
          // Fallback: if fewer than requested returned, no more
          setHasMore(newItems.length >= (currentFilters.limit || 10))
        }
      } else if (response.data && Array.isArray(response.data)) {
        const newItems = response.data as Product[]
        setProducts(prev => (Array.isArray(prev) ? [...prev, ...newItems] : newItems))
        setHasMore(newItems.length > 0)
        setCurrentPage(nextPage)
      } else {
        setHasMore(false)
      }
    } catch (error) {
      // On error do not change hasMore permanently; allow retry on next intersection
      console.error('Error loading more products:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const getProduct = async (idOrSlug: number | string): Promise<Product | null> => {
    try {
      setError(null)
      console.log(`🔍 Fetching product: ${idOrSlug}`)

      const response = await api.get(`/api/products/${idOrSlug}`, {
        headers: getAuthHeaders(),
      })

      console.log(`✓ Product ${idOrSlug} fetched successfully`)
      // Handle different response structures
      // API returns { data: { product: {...}, votes: {...}, user_vote: "" } }
      // We need to extract the actual product object
      const data = response.data?.data
      if (data?.product) {
        return data.product as Product
      } else if (data) {
        return data as Product
      } else if (response.data) {
        return response.data as Product
      }

      return null
    } catch (error: any) {
      console.error(`❌ Error fetching product ${idOrSlug}:`, error)

      // Provide specific error messages
      if (error.response?.status === 404) {
        const message = `Product not found. It may have been deleted or doesn't exist.`
        console.error(message)
        setError(message)
      } else if (error.response?.status === 403) {
        const message = `This item is no longer available`
        setError(message)
      } else if (error.response?.status === 401) {
        setError('Authentication failed. Please log in again.')
      } else {
        setError(error.response?.data?.error || `Failed to fetch product: ${error.message}`)
      }

      return null
    }
  }

  const createProduct = async (product: ProductCreate | FormData): Promise<Product> => {
    try {
      setError(null)

      let formData: FormData

      if (product instanceof FormData) {
        // If FormData is already provided, use it directly
        formData = product
      } else {
        // Create FormData from ProductCreate object
        formData = new FormData()
        formData.append('title', product.title)
        formData.append('description', product.description)
        if (product.price !== undefined) {
          formData.append('price', product.price.toString())
        }
        formData.append('premium', product.premium.toString())
        formData.append('allow_buying', product.allow_buying.toString())
        formData.append('barter_only', product.barter_only.toString())
        if (product.location) {
          formData.append('location', product.location)
        }
        if ((product as any).condition) {
          formData.append('condition', (product as any).condition)
        }
        if ((product as any).category) {
          formData.append('category', (product as any).category as string)
        }

        // Add images if they exist
        if (product.image_urls && product.image_urls.length > 0) {
          // Convert base64 data URLs to files
          for (let i = 0; i < product.image_urls.length && i < 8; i++) {
            const imageUrl = product.image_urls[i]
            if (imageUrl.startsWith('data:image/')) {
              // Convert base64 to blob
              const response = await fetch(imageUrl)
              const blob = await response.blob()
              const file = new File([blob], `image_${i}.jpg`, { type: blob.type })
              formData.append('images', file)
            }
          }
        }
      }

      const response = await api.post('/api/products', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...getAuthHeaders(),
        },
      })
      const newProduct = response.data.data
      safeSetProducts([newProduct, ...(products || [])])
      
      // Invalidate dashboard products cache
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'products'] })
      
      return newProduct
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to create product')
      throw error
    }
  }

  const updateProduct = async (id: number, product: ProductUpdate): Promise<void> => {
    try {
      setError(null)
      // Sanitize payload: do not send client-side data: URLs to the server
      const payload: any = { ...product }
      if (payload.image_urls && Array.isArray(payload.image_urls)) {
        const nonData = payload.image_urls.filter((u: any) => typeof u === 'string' && !u.startsWith('data:'))
        if (nonData.length > 0) {
          payload.image_urls = nonData
        } else {
          // Remove image_urls entirely if only local previews were present
          delete payload.image_urls
        }
      }

      await api.put(`/api/products/${id}`, payload, {
        headers: getAuthHeaders(),
      })
      safeSetProducts((products || []).map(p => p.id === id ? { ...p, ...product } : p))
      
      // Invalidate dashboard products cache
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'products'] })
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to update product')
      throw error
    }
  }

  const deleteProduct = async (id: number): Promise<void> => {
    try {
      setError(null)
      await api.delete(`/api/products/${id}`, {
        headers: getAuthHeaders(),
      })
      safeSetProducts((products || []).filter(p => p.id !== id))
      
      // Invalidate dashboard products cache
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'products'] })
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Failed to delete product'
      setError(errorMsg)
      const err = new Error(errorMsg)
      throw err
    }
  }

  const getUserProducts = async (userId: number, page: number = 1): Promise<PaginatedResponse<Product>> => {
    try {
      setError(null)
      const response = await api.get(`/api/products/user/${userId}?page=${page}`, {
        headers: getAuthHeaders(),
      })
      return response.data.data
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to fetch user products')
      throw error
    }
  }

  const clearError = () => setError(null)

  const value: ProductContextType = {
    products: products || [], // Ensure products is never null
    loading,
    error,
    hasMore,
    isLoadingMore,
    searchProducts,
    loadMore,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    getUserProducts,
    clearError,
  }

  return (
    <ProductContext.Provider value={value}>
      {children}
    </ProductContext.Provider>
  )
}
