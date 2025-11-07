import React, { createContext, useContext, useState, ReactNode } from 'react'
import { Product, ProductCreate, ProductUpdate, SearchFilters, PaginatedResponse } from '../types'
import { api } from '../services/api'

interface ProductContextType {
  products: Product[]
  loading: boolean
  error: string | null
  hasMore: boolean
  isLoadingMore: boolean
  searchProducts: (filters: SearchFilters) => Promise<void>
  loadMore: () => Promise<void>
  getProduct: (id: number) => Promise<Product | null>
  createProduct: (product: ProductCreate | FormData) => Promise<Product>
  updateProduct: (id: number, product: ProductUpdate) => Promise<void>
  deleteProduct: (id: number) => Promise<void>
  getUserProducts: (userId: number, page?: number) => Promise<PaginatedResponse<Product>>
  clearError: () => void
}

const ProductContext = createContext<ProductContextType | undefined>(undefined)

export const useProducts = () => {
  const context = useContext(ProductContext)
  if (context === undefined) {
    throw new Error('useProducts must be used within a ProductProvider')
  }
  return context
}

interface ProductProviderProps {
  children: ReactNode
}

export const ProductProvider: React.FC<ProductProviderProps> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState<boolean>(true)
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [currentFilters, setCurrentFilters] = useState<SearchFilters | null>(null)

  // Helper function to ensure products is always an array
  const safeSetProducts = (newProducts: Product[] | null | undefined) => {
    if (Array.isArray(newProducts)) {
      setProducts(newProducts)
    } else {
      setProducts([])
    }
  }

  // Helper function to retry failed requests
  const retryRequest = async (fn: () => Promise<any>, maxRetries: number = 3) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn()
      } catch (error) {
        if (i === maxRetries - 1) throw error
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
      }
    }
  }

  const searchProducts = async (filters: SearchFilters) => {
    try {
      console.log('Searching products with filters:', filters)
      setLoading(true)
      setError(null)
      setCurrentFilters(filters)
      
      const params = new URLSearchParams()
      if (filters.keyword) params.append('keyword', filters.keyword)
      if (filters.min_price) params.append('min_price', filters.min_price.toString())
      if (filters.max_price) params.append('max_price', filters.max_price.toString())
      if (filters.premium !== undefined) params.append('premium', filters.premium.toString())
      if (filters.status) params.append('status', filters.status)
      if (filters.seller_id) params.append('seller_id', filters.seller_id.toString())
      if (filters.barter_only !== undefined) params.append('barter_only', filters.barter_only.toString())
      if (filters.allow_buying !== undefined) params.append('allow_buying', filters.allow_buying.toString())
      if (filters.location) params.append('location', filters.location)
      params.append('page', (filters.page || 1).toString())
      params.append('limit', (filters.limit || 10).toString())

      const response = await retryRequest(async () => {
        return await api.get(`/api/products?${params.toString()}`)
      })
      
      console.log('API Response:', response.data)
      
      // Handle different response structures safely
      if (response.data && response.data.data) {
        const data = response.data.data as PaginatedResponse<Product>
        if (data && data.data && Array.isArray(data.data)) {
          console.log('Setting products from paginated response:', data.data.length)
          safeSetProducts(data.data)
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
        setHasMore(false)
      } else {
        // Fallback to empty array
        console.log('No products found, setting empty array')
        safeSetProducts([])
        setHasMore(false)
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
      if (filters.keyword) params.append('keyword', filters.keyword)
      if (filters.min_price) params.append('min_price', filters.min_price.toString())
      if (filters.max_price) params.append('max_price', filters.max_price.toString())
      if (filters.premium !== undefined) params.append('premium', filters.premium.toString())
      if (filters.status) params.append('status', filters.status)
      if (filters.seller_id) params.append('seller_id', filters.seller_id.toString())
      if (filters.barter_only !== undefined) params.append('barter_only', filters.barter_only.toString())
      if (filters.allow_buying !== undefined) params.append('allow_buying', filters.allow_buying.toString())
      if (filters.location) params.append('location', filters.location)
      params.append('page', nextPage.toString())
      params.append('limit', (filters.limit || 10).toString())

      const response = await retryRequest(async () => {
        return await api.get(`/api/products?${params.toString()}`)
      })

      if (response.data && response.data.data) {
        const data = response.data.data as PaginatedResponse<Product>
        const newItems = Array.isArray(data?.data) ? data.data : []
        setProducts(prev => (Array.isArray(prev) ? [...prev, ...newItems] : newItems))
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

  const getProduct = async (id: number): Promise<Product | null> => {
    try {
      setError(null)
      const response = await api.get(`/api/products/${id}`)
      
      // Handle different response structures
      if (response.data && response.data.data) {
        return response.data.data
      } else if (response.data) {
        return response.data
      }
      
      return null
    } catch (error: any) {
      console.error('Error fetching product:', error)
      setError(error.response?.data?.error || 'Failed to fetch product')
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
        },
      })
      const newProduct = response.data.data
      safeSetProducts([newProduct, ...(products || [])])
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

      await api.put(`/api/products/${id}`, payload)
      safeSetProducts((products || []).map(p => p.id === id ? { ...p, ...product } : p))
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to update product')
      throw error
    }
  }

  const deleteProduct = async (id: number): Promise<void> => {
    try {
      setError(null)
      await api.delete(`/api/products/${id}`)
      safeSetProducts((products || []).filter(p => p.id !== id))
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to delete product')
      throw error
    }
  }

  const getUserProducts = async (userId: number, page: number = 1): Promise<PaginatedResponse<Product>> => {
    try {
      setError(null)
      const response = await api.get(`/api/products/user/${userId}?page=${page}`)
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
