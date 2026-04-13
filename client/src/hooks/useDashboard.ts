import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from '../services/api'
import { Product, Order, Trade } from '../types'

// Query keys for consistent caching
export const DASHBOARD_QUERY_KEYS = {
  products: ['dashboard', 'products'] as const,
  orders: ['dashboard', 'orders'] as const,
  counts: ['dashboard', 'counts'] as const,
  sentOffers: ['dashboard', 'offers', 'sent'] as const,
  receivedOffers: ['dashboard', 'offers', 'received'] as const,
  ongoingTrades: ['dashboard', 'offers', 'ongoing'] as const,
  archivedTrades: ['dashboard', 'offers', 'archived'] as const,
  tradeHistory: ['dashboard', 'tradeHistory'] as const,
}

// Custom hook for user products with caching
export const useDashboardProducts = (userId: number | undefined) => {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEYS.products, userId],
    queryFn: async (): Promise<Product[]> => {
      if (!userId) throw new Error('User ID required')
      try {
        // Use same method as UserProfile - direct API call (auth header set by interceptor)
        const response = await api.get(`/api/products/user/${userId}`)
        console.log('Products API Response:', response.data)

        // response.data = { success: true, data: { data: [...], total, page, totalPages } }
        const paginatedResponse = response.data?.data
        if (paginatedResponse && Array.isArray(paginatedResponse.data)) {
          console.log('Returning products from paginated response:', paginatedResponse.data.length)
          return paginatedResponse.data
        }
        // Fallback: direct array
        if (Array.isArray(response.data?.data)) {
          console.log('Returning direct data array:', response.data.data.length)
          return response.data.data
        }
        if (Array.isArray(response.data)) {
          console.log('Returning response as array:', response.data.length)
          return response.data
        }
        console.log('No products array found')
        return []
      } catch (error) {
        console.error('Error fetching products:', error)
        throw error
      }
    },
    enabled: !!userId,
    // Products data reduced to 1 minute to avoid stale dashboard
    staleTime: 1000 * 30, // 30 seconds for dashboard freshness
    refetchOnMount: 'always',
    placeholderData: keepPreviousData,
  })
}

// Custom hook for user orders with caching
export const useDashboardOrders = () => {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.orders,
    queryFn: async (): Promise<Order[]> => {
      const response = await api.get('/api/orders?type=bought')
      return response.data?.data?.data || []
    },
    // Orders change less frequently
    staleTime: 1000 * 60 * 15, // 15 minutes
    placeholderData: keepPreviousData,
  })
}

// Custom hook for dashboard counts (notifications, offers) with caching
export const useDashboardCounts = () => {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.counts,
    queryFn: async () => {
      const response = await api.get('/api/dashboard/counts')
      return {
        unread_notifications: response.data?.unread_notifications || 0,
        pending_offers: response.data?.pending_offers || 0,
      }
    },
    // Counts should refresh more frequently
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 5, // Background refetch every 5 minutes
    placeholderData: keepPreviousData,
  })
}

// Custom hook for sent offers with caching
export const useSentOffers = () => {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.sentOffers,
    queryFn: async (): Promise<Trade[]> => {
      const [pendingRes, counteredRes] = await Promise.all([
        api.get('/api/trades', {
          params: {
            direction: 'outgoing',
            include: 'products',
            status: 'pending',
            limit: 100,
          },
        }),
        api.get('/api/trades', {
          params: {
            direction: 'outgoing',
            include: 'products',
            status: 'countered',
            limit: 100,
          },
        }),
      ])

      const extractData = (response: any): Trade[] => {
        return Array.isArray(response?.data?.data)
          ? response.data.data
          : (Array.isArray(response?.data) ? response.data : [])
      }

      const allTrades = [...extractData(pendingRes), ...extractData(counteredRes)]
      const unique = new Map<number, Trade>()
      allTrades.forEach((tr: Trade) => {
        if (tr && tr.id) unique.set(tr.id, tr)
      })
      return Array.from(unique.values())
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // 30s fallback — SSE handles immediate push updates
    placeholderData: keepPreviousData,
  })
}

// Custom hook for received offers with caching
export const useReceivedOffers = () => {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.receivedOffers,
    queryFn: async (): Promise<Trade[]> => {
      const [pendingRes, counteredRes] = await Promise.all([
        api.get('/api/trades', {
          params: {
            direction: 'incoming',
            include: 'products',
            status: 'pending',
            limit: 100,
          },
        }),
        api.get('/api/trades', {
          params: {
            direction: 'incoming',
            include: 'products',
            status: 'countered',
            limit: 100,
          },
        }),
      ])

      const extractData = (response: any): Trade[] => {
        return Array.isArray(response?.data?.data)
          ? response.data.data
          : (Array.isArray(response?.data) ? response.data : [])
      }

      const allTrades = [...extractData(pendingRes), ...extractData(counteredRes)]
      const unique = new Map<number, Trade>()
      allTrades.forEach((tr: Trade) => {
        if (tr && tr.id) unique.set(tr.id, tr)
      })
      return Array.from(unique.values())
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // 30s fallback — SSE handles immediate push updates
    placeholderData: keepPreviousData,
  })
}

// Custom hook for ongoing trades with caching
export const useOngoingTrades = () => {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.ongoingTrades,
    queryFn: async (): Promise<Trade[]> => {
      // Fetch both directions and both statuses separately (API limitation: single status per request)
      const [incomingAccepted, incomingActive, outgoingAccepted, outgoingActive, incomingMultiwayActive, outgoingMultiwayActive] = await Promise.all([
        api.get('/api/trades', { params: { direction: 'incoming', include: 'products', status: 'accepted', limit: 100 } }),
        api.get('/api/trades', { params: { direction: 'incoming', include: 'products', status: 'active', limit: 100 } }),
        api.get('/api/trades', { params: { direction: 'outgoing', include: 'products', status: 'accepted', limit: 100 } }),
        api.get('/api/trades', { params: { direction: 'outgoing', include: 'products', status: 'active', limit: 100 } }),
        api.get('/api/trades', { params: { direction: 'incoming', include: 'products', status: 'multiway_active', limit: 100 } }),
        api.get('/api/trades', { params: { direction: 'outgoing', include: 'products', status: 'multiway_active', limit: 100 } })
      ])

      const extractData = (response: any) => {
        return Array.isArray(response?.data?.data) ? response.data.data : (Array.isArray(response?.data) ? response.data : [])
      }

      const allTrades = [
        ...extractData(incomingAccepted),
        ...extractData(incomingActive),
        ...extractData(outgoingAccepted),
        ...extractData(outgoingActive),
        ...extractData(incomingMultiwayActive),
        ...extractData(outgoingMultiwayActive)
      ]

      // Deduplicate by trade ID
      const uniqueTrades = new Map<number, Trade>()
      allTrades.forEach((tr: Trade) => {
        if (tr && tr.id) uniqueTrades.set(tr.id, tr)
      })

      return Array.from(uniqueTrades.values())
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 1000 * 60 * 5, // Background refetch every 5 minutes
    placeholderData: keepPreviousData,
  })
}

// Custom hook for archived (expired) trades with caching
export const useArchivedTrades = () => {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.archivedTrades,
    queryFn: async (): Promise<Trade[]> => {
      const [incomingExpired, outgoingExpired] = await Promise.all([
        api.get('/api/trades', { params: { direction: 'incoming', include: 'products', status: 'expired', limit: 100 } }),
        api.get('/api/trades', { params: { direction: 'outgoing', include: 'products', status: 'expired', limit: 100 } })
      ])

      const extractData = (response: any) => {
        return Array.isArray(response?.data?.data) ? response.data.data : (Array.isArray(response?.data) ? response.data : [])
      }

      const allTrades = [
        ...extractData(incomingExpired),
        ...extractData(outgoingExpired)
      ]

      // Deduplicate by trade ID
      const uniqueTrades = new Map<number, Trade>()
      allTrades.forEach((tr: Trade) => {
        if (tr && tr.id) uniqueTrades.set(tr.id, tr)
      })

      return Array.from(uniqueTrades.values())
    },
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  })
}

// Custom hook for trade history with caching
export const useTradeHistory = () => {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.tradeHistory,
    queryFn: async (): Promise<Trade[]> => {
      const response = await api.get('/api/trades', {
        params: {
          status: 'completed',
          include: 'products',
          limit: 100
        }
      })
      return Array.isArray(response.data?.data) ? response.data.data : (Array.isArray(response.data) ? response.data : [])
    },
    staleTime: 1000 * 60 * 5, // 5 minutes (completed trades don't change)
    placeholderData: keepPreviousData,
  })
}

// Hook to prefetch dashboard data
export const usePrefetchDashboard = (userId: number | undefined) => {
  const queryClient = useQueryClient()

  const prefetchDashboardData = async () => {
    if (!userId) return

    // Prefetch all dashboard data in parallel
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: [...DASHBOARD_QUERY_KEYS.products, userId],
        queryFn: async (): Promise<Product[]> => {
          const response = await api.get(`/api/products/user/${userId}`)
          return response.data?.data?.data || response.data?.data || []
        },
        staleTime: 1000 * 60,
      }),
      queryClient.prefetchQuery({
        queryKey: DASHBOARD_QUERY_KEYS.orders,
        queryFn: async (): Promise<Order[]> => {
          const response = await api.get('/api/orders?type=bought')
          return response.data?.data?.data || []
        },
        staleTime: 1000 * 60 * 15,
      }),
      queryClient.prefetchQuery({
        queryKey: DASHBOARD_QUERY_KEYS.counts,
        queryFn: async () => {
          const response = await api.get('/api/dashboard/counts')
          return {
            unread_notifications: response.data?.unread_notifications || 0,
            pending_offers: response.data?.pending_offers || 0,
          }
        },
        staleTime: 1000 * 30,
      }),
    ])
  }

  return { prefetchDashboardData }
}

// Hook to invalidate dashboard cache when data changes
export const useInvalidateDashboard = () => {
  const queryClient = useQueryClient()

  const invalidateDashboard = () => {
    return queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const invalidateProducts = () => {
    return queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.products })
  }

  const invalidateOffers = () => {
    return queryClient.invalidateQueries({ queryKey: ['dashboard', 'offers'] })
  }

  const invalidateCounts = () => {
    return queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.counts })
  }

  return {
    invalidateDashboard,
    invalidateProducts,
    invalidateOffers,
    invalidateCounts,
  }
}
