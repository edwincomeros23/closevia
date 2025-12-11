import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box,
  Container,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  SimpleGrid,
  Card,
  CardBody,
  CardHeader,
  CardFooter,
  Badge,
  Image,
  Flex,
  Spinner,
  Center,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  useToast,
  IconButton,
  Avatar,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  Icon,
  Stack,
  Select,
  Textarea,
  Link,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  ScaleFade,
  Fade,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react'
import { AddIcon, EditIcon, DeleteIcon, BellIcon, SettingsIcon, WarningIcon, ChevronLeftIcon, ChevronRightIcon, CheckIcon, CloseIcon, SearchIcon, ViewIcon, StarIcon } from '@chakra-ui/icons'
import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { useRealtime } from '../contexts/RealtimeContext'
import { Product, Order, Trade, TradeAction } from '../types'
import FloatingTab from '../components/FloatingTab'
import { api } from '../services/api'
import { FaHandshake, FaTimes, FaCheckCircle, FaClock, FaHistory, FaShoppingBag, FaExchangeAlt, FaComments, FaMapMarkerAlt, FaTruck } from 'react-icons/fa'
import { FiShoppingBag, FiRefreshCw, FiMessageCircle, FiFilter, FiArrowDown } from 'react-icons/fi'
import { formatPHP } from '../utils/currency'
import { getFirstImage } from '../utils/imageUtils'
import OfferDetailsModal from '../components/OfferDetailsModal'
import TradeCompletionModal from '../components/TradeCompletionModal'
import ViewTradeModal from '../components/ViewTradeModal'
import DeliveryRequestModal from '../components/DeliveryRequestModal'
import DeliveryTracking from '../components/DeliveryTracking'
import MultiWayTradeUI from '../components/MultiWayTradeUI'

const Dashboard: React.FC = () => {
  const { user, loading, isAuthenticated } = useAuth()
  const { getUserProducts, deleteProduct } = useProducts()
  const { refreshCounts } = useRealtime()
  const navigate = useNavigate()
  const [userProducts, setUserProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [tradedItems, setTradedItems] = useState<Product[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [tradedCurrentPage, setTradedCurrentPage] = useState(1)
  const itemsPerPage = 12
  const [popupOpen, setPopupOpen] = useState(false)
  const [popupConfig, setPopupConfig] = useState<any>(null)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [unreadOffers, setUnreadOffers] = useState(0)
  const toast = useToast()
  
  // Product filters
  const [productFilter, setProductFilter] = useState<'all' | 'available' | 'sold' | 'traded' | 'locked'>('all')
  const [productSearch, setProductSearch] = useState('')
  const [productSort, setProductSort] = useState<'newest' | 'oldest'>('newest')
  
  // Unified search - searches across all content
  const [unifiedSearch, setUnifiedSearch] = useState('')
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  
  // Loading states
  const [productsLoading, setProductsLoading] = useState(false)
  // notifications state (handled on /notifications page)
  // dev helper: when true, show multiple pages for testing even if there are no notifications
  const DEV_SHOW_PAGES_ALWAYS = true
  
  // Offers state
  const [incoming, setIncoming] = useState<Trade[]>([]) // received
  const [outgoing, setOutgoing] = useState<Trade[]>([]) // sent
  const [ongoingTradesData, setOngoingTradesData] = useState<Trade[]>([])
  const [offersLoading, setOffersLoading] = useState(false)
  const [sentLoaded, setSentLoaded] = useState(false)
  const [receivedLoaded, setReceivedLoaded] = useState(false)
  const [ongoingLoaded, setOngoingLoaded] = useState(false)
  const [sentLoading, setSentLoading] = useState(false)
  const [receivedLoading, setReceivedLoading] = useState(false)
  const [ongoingLoading, setOngoingLoading] = useState(false)
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([])
  const [tradeHistoryLoading, setTradeHistoryLoading] = useState(false)
  const [offersSort, setOffersSort] = useState<'newest' | 'oldest'>('newest')
  const [offersSubTab, setOffersSubTab] = useState(0) // 0: Sent, 1: Received, 2: Ongoing, 3: Completed
  const [offersPage, setOffersPage] = useState(1)
  const [offersSearch, setOffersSearch] = useState('')
  const [offersStatusFilter, setOffersStatusFilter] = useState<string>('all')
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [viewTradeModalOpen, setViewTradeModalOpen] = useState(false)
  const [completionModalOpen, setCompletionModalOpen] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [tradeToCancel, setTradeToCancel] = useState<Trade | null>(null)
  const [declineModalOpen, setDeclineModalOpen] = useState(false)
  const [tradeToDecline, setTradeToDecline] = useState<Trade | null>(null)
  const [declineFeedback, setDeclineFeedback] = useState('')
  const [productTitles, setProductTitles] = useState<Map<number, string>>(new Map())
  const productImageCache = useRef<Map<number, string | null>>(new Map())
  const notificationCountsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Delivery modals state
  const [deliveryRequestModalOpen, setDeliveryRequestModalOpen] = useState(false)
  const [deliveryTrackingModalOpen, setDeliveryTrackingModalOpen] = useState(false)
  const [tradeForDelivery, setTradeForDelivery] = useState<Trade | null>(null)
  const [productsForDelivery, setProductsForDelivery] = useState<Product[]>([])
  const [currentDeliveryId, setCurrentDeliveryId] = useState<number | null>(null)
  
  // Multi-way trade state
  const [multiWayTrades, setMultiWayTrades] = useState<any[]>([])
  const [multiWayTradesLoading, setMultiWayTradesLoading] = useState(false)
  const [selectedMultiWayTrade, setSelectedMultiWayTrade] = useState<any>(null)
  const [multiWayTradeJoining, setMultiWayTradeJoining] = useState(false)
  
  // Color mode values
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  useEffect(() => {
    if (user) {
      fetchUserData()
    }
  }, [user])

  // Check if user is authenticated, redirect to login if not
  // Only redirect if not loading (to prevent race conditions after login)
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      console.log('Dashboard: Not authenticated, redirecting to login')
      navigate('/login', { replace: true })
    }
  }, [isAuthenticated, loading, navigate])

  // Fetch multi-way trades when tab is selected
  useEffect(() => {
    if (user && activeTab === 2 && user.is_premium) {
      fetchMultiWayTrades()
    }
  }, [user, activeTab])

  const fetchUserData = async () => {
    if (!user) return
    
    setDataLoading(true)
    setProductsLoading(true)
    try {
      // Fetch user products and orders in parallel (non-blocking)
      const [productsResponse, ordersResponse] = await Promise.all([
        getUserProducts(user.id),
        api.get('/api/orders?type=bought'),
      ])
      
      const allProducts = productsResponse.data
      
      // Separate available and traded items
      const availableProducts = allProducts.filter(p => p.status === 'available')
      const tradedProducts = allProducts.filter(p => p.status === 'traded' || p.status === 'sold')
      
      setUserProducts(availableProducts)
      setTradedItems(tradedProducts)
      setOrders(ordersResponse.data.data.data)
      
      // DO NOT fetch offers here - defer until Offers tab is clicked
      // This significantly speeds up initial dashboard load
    } catch (error) {
      console.error('Failed to fetch user data:', error)
    } finally {
      setDataLoading(false)
      setProductsLoading(false)
      
      // Fetch notification counts after products are loaded (non-blocking)
      fetchNotificationCounts()
    }
  }
  
  // Computed dashboard stats
  const dashboardStats = useMemo(() => {
    const activeProducts = userProducts.filter(p => p.status === 'available').length
    const activeTrades = ongoingTradesData.length
    const newOffers = incoming.filter(t => t.status === 'pending').length
    const completedTrades = tradeHistory.length
    return {
      totalProducts: userProducts.length,
      activeProducts,
      activeTrades,
      newOffers,
      completedTrades
    }
  }, [userProducts, incoming, ongoingTradesData, tradeHistory])
  
  // Get product title helper (needs to be defined before use)
  const getProductTitle = (productId: number, fallbackTitle?: string): string => {
    if (fallbackTitle) return fallbackTitle
    return productTitles.get(productId) || 'Unnamed Item'
  }

  // Unified search filter - applies to all content types
  const applyUnifiedSearch = useCallback((items: any[], searchTerm: string, type: 'product' | 'trade') => {
    if (!searchTerm.trim()) return items
    
    const searchLower = searchTerm.toLowerCase()
    return items.filter((item: any) => {
      if (type === 'product') {
        return (
          item.title?.toLowerCase().includes(searchLower) ||
          item.description?.toLowerCase().includes(searchLower) ||
          item.category?.toLowerCase().includes(searchLower) ||
          item.seller_name?.toLowerCase().includes(searchLower)
        )
      } else {
        // For trades/offers
        const productTitle = getProductTitle(item.target_product_id, item.product_title).toLowerCase()
        const buyerName = (item.buyer_name || '').toLowerCase()
        const sellerName = (item.seller_name || '').toLowerCase()
        return (
          productTitle.includes(searchLower) ||
          buyerName.includes(searchLower) ||
          sellerName.includes(searchLower)
        )
      }
    })
  }, [])

  // Filtered products - now uses unified search
  const filteredProducts = useMemo(() => {
    let filtered = [...userProducts]
    
    // Status filter
    if (productFilter !== 'all') {
      filtered = filtered.filter(p => p.status === productFilter)
    }
    
    // Apply unified search (fallback to productSearch for backward compatibility)
    const searchTerm = unifiedSearch || productSearch
    if (searchTerm.trim()) {
      filtered = applyUnifiedSearch(filtered, searchTerm, 'product')
    }
    
    return filtered
  }, [userProducts, productFilter, unifiedSearch, productSearch, applyUnifiedSearch])

  const fetchNotificationCounts = async () => {
    try {
      // Fetch both counts in a single, lightweight request
      const countsResponse = await api.get('/api/dashboard/counts')
      setUnreadNotifications(countsResponse.data?.unread_notifications || 0)
      setUnreadOffers(countsResponse.data?.pending_offers || 0)
    } catch (error) {
      console.error('Failed to fetch notification counts:', error)
    }
  }

  // Debounced notification count fetch to prevent spam
  const fetchNotificationCountsDebounced = useCallback(() => {
    // Clear existing timeout
    if (notificationCountsTimeout.current) {
      clearTimeout(notificationCountsTimeout.current)
    }
    // Schedule new fetch with 500ms delay
    notificationCountsTimeout.current = setTimeout(() => {
      fetchNotificationCounts()
    }, 500)
  }, [])

  // Fetchers for each offers sub-section (on-demand) - OPTIMIZED
  const fetchSentOffers = async () => {
    if (!user) return
    try {
      setSentLoading(true)
      const outRes = await api.get('/api/trades', { 
        params: { 
          direction: 'outgoing', 
          include: 'products', 
          status: 'pending',
          limit: 100 // Add limit to prevent large payloads
        } 
      })
      const outgoingData = Array.isArray(outRes.data?.data) ? outRes.data.data : (Array.isArray(outRes.data) ? outRes.data : [])
      setOutgoing(outgoingData)
      setSentLoaded(true)
      // Cache images from response without additional fetch
      cacheProductImages(outgoingData)
    } catch (e: any) {
      console.error('Failed to fetch sent offers:', e)
      toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to load sent offers', status: 'error' })
      setOutgoing([])
    } finally {
      setSentLoading(false)
    }
  }

  const fetchReceivedOffers = async () => {
    if (!user) return
    try {
      setReceivedLoading(true)
      const incRes = await api.get('/api/trades', { 
        params: { 
          direction: 'incoming', 
          include: 'products', 
          status: 'pending',
          limit: 100 // Add limit to prevent large payloads
        } 
      })
      const incomingData = Array.isArray(incRes.data?.data) ? incRes.data.data : (Array.isArray(incRes.data) ? incRes.data : [])
      setIncoming(incomingData)
      setReceivedLoaded(true)
      // Cache images from response without additional fetch
      cacheProductImages(incomingData)
    } catch (e: any) {
      console.error('Failed to fetch received offers:', e)
      toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to load received offers', status: 'error' })
      setIncoming([])
    } finally {
      setReceivedLoading(false)
    }
  }

  const fetchOngoingTrades = async () => {
    if (!user) return
    try {
      setOngoingLoading(true)
      // Optimized: Only 2 requests instead of 4 by using comma-separated status filter
      const [bothDirections] = await Promise.all([
        api.get('/api/trades', { 
          params: { 
            include: 'products', 
            status: 'accepted,active', // Fetch both statuses in one call
            limit: 100 // Add limit to prevent large payloads
          } 
        }),
      ])

      const allTradesData = Array.isArray(bothDirections.data?.data) 
        ? bothDirections.data.data 
        : (Array.isArray(bothDirections.data) ? bothDirections.data : [])

      // Deduplicate by trade ID
      const uniqueTrades = new Map<number, Trade>()
      allTradesData.forEach((tr: Trade) => {
        if (tr && tr.id) uniqueTrades.set(tr.id, tr)
      })

      const merged = Array.from(uniqueTrades.values())
      setOngoingTradesData(merged)
      setOngoingLoaded(true)
      // Cache images from response without additional fetch
      cacheProductImages(merged)
    } catch (e: any) {
      console.error('Failed to fetch ongoing trades:', e)
      toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to load ongoing trades', status: 'error' })
      setOngoingTradesData([])
    } finally {
      setOngoingLoading(false)
    }
  }

  // New optimized function to cache images from trades without additional API calls
  const cacheProductImages = (trades: Trade[]) => {
    trades.forEach(trade => {
      // Cache target product image if available
      const productImageUrl = (trade as any)?.product_image_url
      if (trade.target_product_id && productImageUrl) {
        productImageCache.current.set(trade.target_product_id, productImageUrl)
      }
      // Cache item images if available
      if (trade.items) {
        trade.items.forEach((item: any) => {
          if (item.product_id && item.product_image_url) {
            productImageCache.current.set(Number(item.product_id), item.product_image_url)
          }
        })
      }
    })
  }

  const fetchTradeHistory = useCallback(async () => {
    if (!user) return
    try {
      setTradeHistoryLoading(true)
      const res = await api.get('/api/trades', { params: { status: 'completed', include: 'products', limit: 100 } })
      const data = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : [])
      setTradeHistory(data)
      // Cache images from response
      cacheProductImages(data)
    } catch (e: any) {
      console.error('Failed to fetch trade history:', e)
    } finally {
      setTradeHistoryLoading(false)
    }
  }, [user])

  // Refresh only the datasets the user has already loaded (avoid unnecessary calls)
  const refreshOffersData = useCallback(() => {
    if (sentLoaded && !sentLoading) {
      fetchSentOffers()
    }
    if (receivedLoaded && !receivedLoading) {
      fetchReceivedOffers()
    }
    if (ongoingLoaded && !ongoingLoading) {
      fetchOngoingTrades()
    }
  }, [sentLoaded, receivedLoaded, ongoingLoaded, sentLoading, receivedLoading, ongoingLoading])

  // Load trade history independently on mount (does not depend on Offers tab)
  useEffect(() => {
    if (user) {
      fetchTradeHistory()
    }
  }, [user, fetchTradeHistory])

  // On-demand fetch based on active Offers sub-tab
  useEffect(() => {
    if (!user || activeTab !== 1) return
    if (offersSubTab === 0 && !sentLoaded && !sentLoading) {
      fetchSentOffers()
    }
    if (offersSubTab === 1 && !receivedLoaded && !receivedLoading) {
      fetchReceivedOffers()
    }
    if (offersSubTab === 2 && !ongoingLoaded && !ongoingLoading) {
      fetchOngoingTrades()
    }
  }, [user, activeTab, offersSubTab])

  const fetchProductTitles = async (trades: Trade[]) => {
    const productIds = new Set<number>()
    const newTitles = new Map(productTitles)
    
    // First, extract titles from trades response (if backend returns them)
    trades.forEach(trade => {
      if (trade.target_product_id && trade.product_title) {
        newTitles.set(trade.target_product_id, trade.product_title)
      }
      if (trade.items) {
        trade.items.forEach((item: any) => {
          if (item.product_id && item.product_title) {
            newTitles.set(Number(item.product_id), item.product_title)
          }
        })
      }
    })
    
    // Collect remaining IDs that need to be fetched
    trades.forEach(trade => {
      if (trade.target_product_id && !newTitles.has(trade.target_product_id)) {
        productIds.add(trade.target_product_id)
      }
      if (trade.items) {
        trade.items.forEach((item: any) => {
          const pid = Number(item.product_id)
          if (pid && !newTitles.has(pid)) {
            productIds.add(pid)
          }
        })
      }
    })

    // Update state with titles we already have from response
    setProductTitles(newTitles)

    // Only fetch remaining titles if needed
    const titlesToFetch = Array.from(productIds)
    if (titlesToFetch.length > 0) {
      try {
        // Use batch endpoint to fetch multiple product titles in one request
        const response = await api.post('/api/products/batch/titles', { ids: titlesToFetch })
        const results = response.data?.data || []
        
        const finalTitles = new Map(newTitles)
        results.forEach(({ id, title }: any) => {
          finalTitles.set(id, title || 'Unnamed Item')
        })
        setProductTitles(finalTitles)
      } catch (error) {
        console.error('Failed to fetch product titles:', error)
        // Fallback: use 'Unnamed Item' for all missing titles
        const finalTitles = new Map(newTitles)
        titlesToFetch.forEach(id => {
          if (!finalTitles.has(id)) {
            finalTitles.set(id, 'Unnamed Item')
          }
        })
        setProductTitles(finalTitles)
      }
    }
  }

  const resolveItemImage = (it: any): string | undefined => {
    if (!it) return undefined
    if (it.product_image_url) return it.product_image_url
    if (it.productImageUrl) return it.productImageUrl
    const maybeImgs = it.product_image_urls ?? it.productImages ?? null
    if (Array.isArray(maybeImgs) && maybeImgs.length > 0) return getFirstImage(maybeImgs)
    if (typeof maybeImgs === 'string' && maybeImgs.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(maybeImgs)
        if (Array.isArray(parsed) && parsed.length > 0) return getFirstImage(parsed)
      } catch {}
    }
    return undefined
  }

  const fetchMultiWayTrades = async () => {
    try {
      setMultiWayTradesLoading(true)
      const response = await api.get('/api/multi-way-trades/available', {
        params: { user_id: user?.id }
      })
      setMultiWayTrades(response.data?.data || [])
    } catch (error) {
      console.error('Failed to fetch multi-way trades:', error)
      toast({ title: 'Error', description: 'Failed to load multi-way trades', status: 'error' })
      setMultiWayTrades([])
    } finally {
      setMultiWayTradesLoading(false)
    }
  }

  const handleJoinMultiWayTrade = async (trade: any) => {
    try {
      setMultiWayTradeJoining(true)
      await api.post(`/api/multi-way-trades/${trade.id}/join`, {
        user_id: user?.id,
      })
      toast({
        title: 'Success',
        description: 'You joined the trade loop!',
        status: 'success',
        duration: 3000,
      })
      setSelectedMultiWayTrade(null)
      // Refresh multi-way trades list
      await fetchMultiWayTrades()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to join trade',
        status: 'error',
      })
    } finally {
      setMultiWayTradeJoining(false)
    }
  }

  const handleDeclineMultiWayTrade = async (trade: any) => {
    try {
      await api.post(`/api/multi-way-trades/${trade.id}/decline`, {
        reason: 'Not interested'
      })
      toast({
        title: 'Declined',
        description: 'You declined this multi-way trade',
        status: 'info',
        duration: 2000,
      })
      setSelectedMultiWayTrade(null)
      // Refresh multi-way trades list
      await fetchMultiWayTrades()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to decline trade',
        status: 'error',
      })
    }
  }

  const ProductThumb: React.FC<{ pid: number; src?: string; alt?: string; size?: string }> = ({ pid, src, alt, size = "40px" }) => {
    const [img, setImg] = useState<string | null>(src ?? null)

    useEffect(() => {
      let mounted = true
      // If src is provided, use it directly (avoid API call)
      if (src) {
        setImg(src)
        return
      }
      
      // Check cache first
      const cached = productImageCache.current.get(pid)
      if (cached !== undefined) {
        setImg(cached)
        return
      }
      
      // If no src and not cached, don't fetch - use fallback
      // This prevents unnecessary API calls for thumbnails
      productImageCache.current.set(pid, null)
      setImg(null)
    }, [pid, src])

    const isLarge = size === "full"
    
    return (
      <Image
        src={img ?? ''}
        alt={alt ?? 'Product Image'}
        w={isLarge ? "full" : size}
        h={isLarge ? "120px" : size}
        objectFit="cover"
        borderRadius="md"
        loading="lazy"
        fallbackSrc={isLarge ? "https://via.placeholder.com/300x200?text=No+Image" : "https://via.placeholder.com/40x40?text=?"}
      />
    )
  }

  const updateTrade = useCallback(async (id: number, action: TradeAction) => {
    try {
      await api.put(`/api/trades/${id}`, action)
      toast({ title: 'Success', description: 'Offer updated', status: 'success' })
      refreshOffersData()
      fetchTradeHistory()
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to update offer', status: 'error' })
    }
  }, [refreshOffersData, fetchTradeHistory])

  const handleCompleteTradeClick = (trade: Trade) => {
    // Check if meetup is confirmed before allowing completion
    const meetupConfirmed = trade.meetup_confirmed || (trade.buyer_meetup_confirmed && trade.seller_meetup_confirmed)
    
    if (!meetupConfirmed && (trade.status === 'accepted' || trade.status === 'active')) {
      toast({
        title: 'Meetup Required',
        description: 'Please confirm the meetup location before completing the trade.',
        status: 'warning',
        duration: 4000,
      })
      // Open ViewTradeModal to confirm meetup
      setSelectedTrade(trade)
      setViewTradeModalOpen(true)
      return
    }
    
    setSelectedTrade(trade)
    setCompletionModalOpen(true)
  }

  const handleCancelTradeClick = (trade: Trade) => {
    setTradeToCancel(trade)
    setCancelModalOpen(true)
  }

  const handleConfirmCancel = async () => {
    if (!tradeToCancel) return
    
    try {
      await updateTrade(tradeToCancel.id, { action: 'cancel' })
      setCancelModalOpen(false)
      setTradeToCancel(null)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to cancel offer',
        status: 'error'
      })
    }
  }

  const handleDeclineTradeClick = (trade: Trade) => {
    setTradeToDecline(trade)
    setDeclineFeedback('')
    setDeclineModalOpen(true)
  }

  const handleConfirmDecline = async () => {
    if (!tradeToDecline) return
    
    try {
      await updateTrade(tradeToDecline.id, { 
        action: 'decline',
        message: declineFeedback.trim() || undefined
      })
      setDeclineModalOpen(false)
      setTradeToDecline(null)
      setDeclineFeedback('')
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to decline offer',
        status: 'error'
      })
    }
  }

  const historyStatuses = ['declined', 'cancelled', 'completed']
  
  // Computed stats for offers (excluding completed - those go to Trade History)
  const offersStats = useMemo(() => {
    const sentPending = outgoing.filter(t => t.status === 'pending').length
    const receivedPending = incoming.filter(t => t.status === 'pending').length
    const ongoing = ongoingTradesData.length
    return {
      sentPending,
      receivedPending,
      ongoing,
      totalPending: sentPending + receivedPending
    }
  }, [incoming, outgoing, ongoingTradesData])
  
  // Completed trades count for Trade History tab
  const completedTradesCount = useMemo(() => {
    return tradeHistory.length
  }, [tradeHistory])

  // Filter and search logic - now uses unified search and optimized with memoization
  const filterTrades = useCallback((trades: Trade[], searchTerm: string, statusFilter: string) => {
    let filtered = [...trades]
    
    // Use unified search if available, otherwise use provided searchTerm
    const effectiveSearch = unifiedSearch || searchTerm
    
    // Search filter
    if (effectiveSearch.trim()) {
      filtered = applyUnifiedSearch(filtered, effectiveSearch, 'trade')
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(trade => trade.status === statusFilter)
    }
    
    return filtered
  }, [unifiedSearch, applyUnifiedSearch])

  // Get trades for each sub-tab (excluding completed - those go to Trade History)
  // Optimized to only sort when rendering, not during filter
  const sentOffers = useMemo(() => {
    const active = outgoing.filter(t => t.status === 'pending') // Only show pending offers
    const filtered = filterTrades(active, offersSearch, offersStatusFilter)
    // Sort inline to avoid extra function call
    filtered.sort((a, b) => {
      const at = new Date(a.created_at).getTime()
      const bt = new Date(b.created_at).getTime()
      return offersSort === 'newest' ? bt - at : at - bt
    })
    return filtered
  }, [outgoing, offersSearch, offersStatusFilter, offersSort, filterTrades])

  const receivedOffers = useMemo(() => {
    const active = incoming.filter(t => t.status === 'pending') // Only show pending offers
    const filtered = filterTrades(active, offersSearch, offersStatusFilter)
    // Sort inline to avoid extra function call
    filtered.sort((a, b) => {
      const at = new Date(a.created_at).getTime()
      const bt = new Date(b.created_at).getTime()
      return offersSort === 'newest' ? bt - at : at - bt
    })
    return filtered
  }, [incoming, offersSearch, offersStatusFilter, offersSort, filterTrades])

  const ongoingTrades = useMemo(() => {
    const all = [...ongoingTradesData]
    const filtered = filterTrades(all, offersSearch, offersStatusFilter)
    // Sort inline to avoid extra function call
    filtered.sort((a, b) => {
      const at = new Date(a.created_at).getTime()
      const bt = new Date(b.created_at).getTime()
      return offersSort === 'newest' ? bt - at : at - bt
    })
    return filtered
  }, [incoming, outgoing, offersSearch, offersStatusFilter, offersSort, filterTrades])
  
  // Unified search handler - clears tab-specific searches when unified search is used
  const handleUnifiedSearchChange = (value: string) => {
    setUnifiedSearch(value)
    // Clear tab-specific searches when using unified search
    if (value.trim()) {
      setProductSearch('')
      setOffersSearch('')
      setTradeHistorySearch('')
    }
  }
  
  // Trade History: All completed trades
  const [tradeHistorySearch, setTradeHistorySearch] = useState('')
  const [tradeHistorySort, setTradeHistorySort] = useState<'newest' | 'oldest'>('newest')
  const [tradeHistoryPage, setTradeHistoryPage] = useState(1)
  
  const allCompletedTrades = useMemo(() => {
    const completed = [...tradeHistory]
    let filtered = [...completed]
    
    // Use unified search if available, otherwise use tradeHistorySearch
    const effectiveSearch = unifiedSearch || tradeHistorySearch
    
    // Search filter
    if (effectiveSearch.trim()) {
      filtered = applyUnifiedSearch(filtered, effectiveSearch, 'trade')
    }
    
    // Sort
    filtered.sort((a, b) => {
      const at = new Date(a.completed_at || a.updated_at).getTime()
      const bt = new Date(b.completed_at || b.updated_at).getTime()
      return tradeHistorySort === 'newest' ? bt - at : at - bt
    })
    
    return filtered
  }, [tradeHistory, unifiedSearch, tradeHistorySearch, tradeHistorySort, applyUnifiedSearch])
  
  const tradeHistoryPerPage = 6
  const tradeHistoryTotalPages = Math.ceil(allCompletedTrades.length / tradeHistoryPerPage)
  const paginatedTradeHistory = useMemo(() => {
    const start = (tradeHistoryPage - 1) * tradeHistoryPerPage
    return allCompletedTrades.slice(start, start + tradeHistoryPerPage)
  }, [allCompletedTrades, tradeHistoryPage])

  // Get current tab's trades (memoized to prevent unnecessary recalculations)
  const currentTabTrades = useMemo(() => {
    switch (offersSubTab) {
      case 0: return sentOffers
      case 1: return receivedOffers
      case 2: return ongoingTrades
      default: return []
    }
  }, [offersSubTab, sentOffers, receivedOffers, ongoingTrades])
  const offersPerPage = 9
  const totalPages = Math.ceil(currentTabTrades.length / offersPerPage)
  const paginatedTrades = useMemo(() => {
    const start = (offersPage - 1) * offersPerPage
    return currentTabTrades.slice(start, start + offersPerPage)
  }, [currentTabTrades, offersPage])

  const badgeColor = (status: Trade['status']) => {
    const statusMap: Record<string, { color: string; icon: string }> = {
      'pending': { color: 'yellow', icon: '🕓' },
      'accepted': { color: 'green', icon: '✓' },
      'declined': { color: 'red', icon: '✗' },
      'cancelled': { color: 'gray', icon: '✗' },
      'countered': { color: 'purple', icon: '🔁' },
      'expired': { color: 'gray', icon: '⌛' },
      'completed': { color: 'green', icon: '✓' },
      'active': { color: 'blue', icon: '💬' }
    }
    return statusMap[status.toLowerCase()] || { color: 'gray', icon: '•' }
  }
  
  const getStatusBadge = (status: Trade['status']) => {
    const { color, icon } = badgeColor(status)
    const statusText = status.charAt(0).toUpperCase() + status.slice(1)
    return (
      <Badge 
        colorScheme={color} 
        variant="subtle"
        display="flex"
        alignItems="center"
        gap={1.5}
        px={2.5}
        py={1}
        rounded="full"
        fontSize="xs"
        fontWeight="medium"
        textTransform="none"
        boxShadow="sm"
      >
        <Text as="span" fontSize="0.9em">{icon}</Text>
        <Text as="span">{statusText}</Text>
      </Badge>
    )
  }

  const renderOfferedItems = (t: Trade) => {
    const offered = (t.items || []).filter((i: any) => {
      const ob = (i?.offered_by ?? i?.offeredBy ?? i?.sender ?? i?.from_user_role)
      if (typeof ob === 'string') {
        const v = ob.toLowerCase()
        return v === 'buyer' || v === 'from_buyer' || v === 'sender'
      }
      return false
    })
    if (offered.length === 0) return null
    
    // Use compact horizontal scroll for multiple items
    if (offered.length > 2) {
      return (
        <Box mt={2}>
          <Text fontSize="xs" color="gray.600" mb={1} fontWeight="medium">
            Offered Items ({offered.length}):
          </Text>
          <Box
            overflowX="auto"
            css={{
              '&::-webkit-scrollbar': {
                height: '4px',
              },
              '&::-webkit-scrollbar-track': {
                background: '#f1f1f1',
                borderRadius: '4px',
              },
              '&::-webkit-scrollbar-thumb': {
                background: '#888',
                borderRadius: '4px',
              },
            }}
          >
            <HStack spacing={2} minW="max-content">
              {offered.map((it: any) => {
                const pid = it.product_id
                const ptitle = it.product_title
                const pimg = it.product_image_url
                return (
                  <VStack key={it.id} spacing={1} align="center" minW="60px">
                    <ProductThumb pid={Number(pid)} src={pimg} alt={getProductTitle(Number(pid), ptitle)} size="50px" />
                    <Text fontSize="2xs" color="gray.600" noOfLines={1} maxW="60px" textAlign="center">
                      {getProductTitle(Number(pid), ptitle).slice(0, 10)}
                    </Text>
                  </VStack>
                )
              })}
            </HStack>
          </Box>
        </Box>
      )
    }
    
    // For 1-2 items, show compact grid
    return (
      <Box mt={2}>
        <Text fontSize="xs" color="gray.600" mb={1} fontWeight="medium">
          Offered Items:
        </Text>
        <SimpleGrid columns={offered.length} spacing={2}>
          {offered.map((it: any) => {
            const pid = it.product_id
            const ptitle = it.product_title
            const pimg = it.product_image_url
            return (
              <VStack key={it.id} spacing={1} align="center">
                <ProductThumb pid={Number(pid)} src={pimg} alt={getProductTitle(Number(pid), ptitle)} size="50px" />
                <Text fontSize="2xs" color="gray.600" noOfLines={2} textAlign="center">
                  {getProductTitle(Number(pid), ptitle)}
                </Text>
              </VStack>
            )
          })}
        </SimpleGrid>
      </Box>
    )
  }

  const handleDeleteProductClick = (product: Product) => {
    setProductToDelete(product)
    showPopup({
      type: 'warning',
      title: 'Delete Product',
      message: `Are you sure you want to delete "${product.title}"? All offers and related data for this item will be permanently removed.`,
      confirmText: 'Delete Product',
      cancelText: 'Cancel',
      onConfirm: () => handleConfirmDelete(),
      onCancel: () => setPopupOpen(false),
      icon: WarningIcon,
      confirmColorScheme: 'red'
    })
  }

  const handleConfirmDelete = async () => {
    if (!productToDelete) return
    
    try {
      setDeleting(true)
      await deleteProduct(productToDelete.id)
      setUserProducts(prev => prev.filter(p => p.id !== productToDelete.id))
      setTradedItems(prev => prev.filter(p => p.id !== productToDelete.id))
      
      setPopupOpen(false)
      showPopup({
        type: 'success',
        title: 'Product Deleted',
        message: `"${productToDelete.title}" has been successfully deleted along with all associated offers.`,
        confirmText: 'OK',
        onConfirm: () => setPopupOpen(false),
        icon: CheckIcon,
        confirmColorScheme: 'green'
      })
      
      setProductToDelete(null)
    } catch (error: any) {
      setPopupOpen(false)
      showPopup({
        type: 'error',
        title: 'Delete Failed',
        message: error.message || 'Failed to delete the product. Please try again.',
        confirmText: 'OK',
        onConfirm: () => setPopupOpen(false),
        icon: CloseIcon,
        confirmColorScheme: 'red'
      })
    } finally {
      setDeleting(false)
    }
  }

  const showPopup = (config: any) => {
    setPopupConfig(config)
    setPopupOpen(true)
  }

  const getPaginatedItems = (items: Product[], currentPage: number) => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return items.slice(startIndex, endIndex)
  }

  const getTotalPages = (items: Product[]) => {
    return Math.ceil(items.length / itemsPerPage)
  }

  const PaginationControls = ({ 
    currentPage, 
    totalPages, 
    onPageChange, 
    itemsCount 
  }: { 
    currentPage: number
    totalPages: number
    onPageChange: (page: number) => void
    itemsCount: number
  }) => {
    if (itemsCount <= itemsPerPage) return null

    return (
      <HStack spacing={2} justify="center" mt={6}>
        <Button
          size="sm"
          variant="outline"
          leftIcon={<ChevronLeftIcon />}
          onClick={() => onPageChange(currentPage - 1)}
          isDisabled={currentPage === 1}
          _hover={{ bg: 'gray.50' }}
        >
          Previous
        </Button>
        
        <HStack spacing={1}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <Button
              key={page}
              size="sm"
              variant={page === currentPage ? 'solid' : 'outline'}
              colorScheme={page === currentPage ? 'brand' : 'gray'}
              onClick={() => onPageChange(page)}
              minW="40px"
              _hover={{ bg: page === currentPage ? 'brand.600' : 'gray.50' }}
            >
              {page}
            </Button>
          ))}
        </HStack>
        
        <Button
          size="sm"
          variant="outline"
          rightIcon={<ChevronRightIcon />}
          onClick={() => onPageChange(currentPage + 1)}
          isDisabled={currentPage === totalPages}
          _hover={{ bg: 'gray.50' }}
        >
          Next
        </Button>
      </HStack>
    )
  }

  const getProductOffersCount = (productId: number) => {
    return [...incoming, ...outgoing].filter(t => t.target_product_id === productId && t.status !== 'declined' && t.status !== 'cancelled').length
  }

  const ProductCardSkeleton = () => (
    <Card variant="outline">
      <Box h="120px" bg="gray.200" borderRadius="lg" />
      <CardBody>
        <VStack spacing={2} align="stretch">
          <Box h="20px" bg="gray.200" borderRadius="md" />
          <Box h="16px" bg="gray.200" borderRadius="md" w="60%" />
          <HStack spacing={2} mt={2}>
            <Box h="16px" bg="gray.200" borderRadius="md" w="80px" />
            <Box h="16px" bg="gray.200" borderRadius="md" w="80px" />
          </HStack>
        </VStack>
      </CardBody>
    </Card>
  )

  // Reusable Product Card Component
  const ProductCard = ({ product, showActions = true }: { product: Product, showActions?: boolean }) => {
    // Never show actions for traded/sold items
    const shouldShowActions = showActions && product.status !== 'traded' && product.status !== 'sold'
    const offersCount = getProductOffersCount(product.id)
    const viewsCount = 0 // TODO: Fetch from API when available
    
    return (
    <ScaleFade in={true} initialScale={0.95}>
      <Card 
        key={product.id}
        variant="outline"
        _hover={{ 
          shadow: "lg",
          transform: "translateY(-4px)",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        }}
        transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        role="article"
        aria-label={`Product: ${product.title}`}
      >
        <Image
          src={getFirstImage(product.image_urls)}
          alt={product.title}
          w="full"
          h="120px"
          borderRadius="lg"
          objectFit="cover"
          loading="lazy"
          fallbackSrc="https://via.placeholder.com/300x200?text=No+Image"
        />
        <CardHeader pb={2}>
          <Flex justify="space-between" align="start">
            <Heading size="sm" noOfLines={2} flex={1} mr={2}>
              {product.title}
            </Heading>
            {product.premium && (
              <Badge colorScheme="yellow" variant="solid" fontSize="xs">
                Premium
              </Badge>
            )}
          </Flex>
          <Text color="gray.600" noOfLines={2} fontSize="sm">
            {product.description}
          </Text>
        </CardHeader>
        <CardBody pt={0}>
          <VStack spacing={2} align="stretch">
            <HStack justify="space-between" align="center">
              <Text fontSize="md" fontWeight="semibold" color="brand.500">
                {product.allow_buying && !product.barter_only && product.price
                  ? formatPHP(product.price)
                  : ''}
              </Text>
            </HStack>
            <HStack spacing={2} align="center" flexWrap="wrap">
              <Badge
                colorScheme={product.status === 'available' ? 'green' : product.status === 'sold' ? 'red' : 'orange'}
                variant="subtle"
                fontSize="2xs"
                px={1.5}
                py={0.5}
                borderRadius="sm"
              >
                {product.status}
              </Badge>
              {product.barter_only && (
                <Badge 
                  colorScheme="purple" 
                  variant="subtle"
                  fontSize="2xs"
                  px={1.5}
                  py={0.5}
                  borderRadius="sm"
                >
                  Barter Only
                </Badge>
              )}
            </HStack>
            {/* Views and Offers Count */}
            <HStack spacing={4} fontSize="xs" color="gray.500" mt={1}>
              <HStack spacing={1}>
                <Icon as={ViewIcon} boxSize={3} />
                <Text>{viewsCount} views</Text>
              </HStack>
              <HStack spacing={1}>
                <Icon as={FaHandshake} boxSize={3} />
                <Text>{offersCount} offers</Text>
              </HStack>
            </HStack>
          </VStack>
        </CardBody>
        {shouldShowActions && (
          <CardFooter pt={0}>
            <HStack spacing={2} w="full">
              <Button
                as={RouterLink}
                to={`/edit-product/${product.id}`}
                leftIcon={<EditIcon />}
                variant="outline"
                colorScheme="brand"
                size="sm"
                flex={1}
                _hover={{ transform: 'scale(1.02)' }}
                transition="all 0.2s"
              >
                Edit
              </Button>
              <Button
                leftIcon={<DeleteIcon />}
                variant="outline"
                colorScheme="red"
                size="sm"
                flex={1}
                onClick={() => handleDeleteProductClick(product)}
                _hover={{ transform: 'scale(1.02)' }}
                transition="all 0.2s"
              >
                Delete
              </Button>
            </HStack>
          </CardFooter>
        )}
      </Card>
    </ScaleFade>
    )
  }

  // Enhanced Ongoing Trade Card Component
  const OngoingTradeCard: React.FC<{
    trade: Trade
    isIncoming: boolean
    onView: () => void
    onComplete?: () => void
  }> = ({ trade, isIncoming, onView, onComplete }) => {
    const userName = isIncoming ? (trade.seller_name || 'Anonymous User') : (trade.buyer_name || 'Anonymous User')
    
    // Get items offered by the other party
    // For incoming trades, we want items offered by the buyer (seller is us)
    // For outgoing trades, we want items offered by the seller (buyer is us)
    const offeredItems = (trade.items || []).filter((i: any) => {
      const ob = (i?.offered_by ?? i?.offeredBy ?? i?.sender ?? i?.from_user_role ?? '').toLowerCase()
      
      // If we can't determine who offered it, include it anyway (show all items)
      if (!ob) return true
      
      // For incoming: we want items from the buyer
      if (isIncoming) {
        return ob === 'buyer' || ob === 'from_buyer' || ob === 'sender'
      }
      // For outgoing: we want items from the seller
      return ob === 'seller' || ob === 'from_seller' || ob === 'recipient'
    })
    
    const getOngoingStatusBadge = () => {
      if (trade.status === 'completed') {
        return { text: 'Completed', color: 'blue' }
      }

      if (trade.trade_option === 'delivery') {
        if (trade.status === 'active') {
          return { text: 'Delivery in Progress', color: 'green' }
        }
        return { text: 'Pending Delivery', color: 'yellow' }
      } else {
        // Meetup trades
        if (trade.meetup_confirmed || (trade.buyer_meetup_confirmed && trade.seller_meetup_confirmed)) {
          return { text: 'Meetup Confirmed', color: 'blue' }
        }
        if (trade.status === 'accepted') {
          return { text: 'Waiting for Meetup', color: 'orange' }
        }
        if (trade.status === 'active') {
          return { text: 'Exchange in Progress', color: 'green' }
        }
      }

      return { text: 'Pending', color: 'yellow' }
    }
    
    const statusBadge = getOngoingStatusBadge()
    const timeAgo = getTimeAgo(trade.updated_at || trade.created_at)
    
    return (
      <ScaleFade in={true} initialScale={0.95}>
        <Card
          variant="outline"
          h="100%"
          display="flex"
          flexDirection="column"
          _hover={{
            shadow: 'lg',
            transform: 'translateY(-4px)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            borderColor: 'brand.400',
          }}
          transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
          borderLeftWidth="4px"
          borderLeftColor="green.400"
          role="article"
        >
          <Box position="relative" w="full" h="140px" display="flex" gap={1} p={1} bg="gray.50" flexWrap="wrap" alignContent="flex-start" overflow="hidden">
            <Box flex={1} position="relative" borderRadius="md" overflow="hidden" borderWidth="2px" borderColor="blue.300" minW="60px">
              <ProductThumb
                pid={trade.target_product_id}
                alt={getProductTitle(trade.target_product_id, trade.product_title)}
                size="full"
              />
              <Badge position="absolute" top={1} left={1} colorScheme="blue" fontSize="2xs" px={1} py={0.5}>
                Your Item
              </Badge>
            </Box>
            
            {/* Show offered items in a row or stack if multiple */}
            {offeredItems.length > 0 ? (
              <>
                {offeredItems.slice(0, 3).map((item: any, idx: number) => (
                  <Box 
                    key={item.id || idx}
                    flex="0 0 auto"
                    position="relative" 
                    borderRadius="md" 
                    overflow="hidden" 
                    borderWidth="2px" 
                    borderColor="green.300"
                    w={offeredItems.length === 1 ? "calc(100% - 70px)" : "60px"}
                    h="100%"
                  >
                    <ProductThumb
                      pid={Number(item.product_id)}
                      src={item.product_image_url}
                      alt={getProductTitle(Number(item.product_id), item.product_title)}
                      size="full"
                    />
                    {idx === 2 && offeredItems.length > 3 && (
                      <Box position="absolute" inset={0} bg="blackAlpha.600" display="flex" alignItems="center" justifyContent="center">
                        <Text fontSize="xs" color="white" fontWeight="bold">
                          +{offeredItems.length - 3}
                        </Text>
                      </Box>
                    )}
                  </Box>
                ))}
                <Badge position="absolute" top={1} right={1} colorScheme="green" fontSize="2xs" px={1} py={0.5}>
                  Their Items{offeredItems.length > 1 ? 's' : ''}
                </Badge>
              </>
            ) : (
              <Box flex={1} position="relative" borderRadius="md" overflow="hidden" borderWidth="2px" borderColor="gray.300" minW="60px">
                <Box w="full" h="full" bg="gray.200" display="flex" alignItems="center" justifyContent="center">
                  <Text fontSize="xs" color="gray.500">No items</Text>
                </Box>
                <Badge position="absolute" top={1} right={1} colorScheme="gray" fontSize="2xs" px={1} py={0.5}>
                  No Items
                </Badge>
              </Box>
            )}
          </Box>

          <CardHeader pb={2} flex={1}>
            <VStack spacing={2} align="stretch">
              <Flex justify="space-between" align="start">
                <Badge colorScheme={statusBadge.color} variant="subtle" fontSize="xs" px={2} py={1} borderRadius="full">
                  {statusBadge.text}
                </Badge>
              </Flex>
              
              <HStack spacing={2} align="center" flexWrap="wrap" mt={2}>
                <Heading size="sm" noOfLines={2} lineHeight="1.3">
                  {getProductTitle(trade.target_product_id, trade.product_title)}
                </Heading>
                {trade.trade_option && (
                  <Badge 
                    colorScheme={trade.trade_option === 'meetup' ? 'blue' : 'green'}
                    variant="subtle"
                    fontSize="2xs"
                    display="flex"
                    alignItems="center"
                    gap={1}
                  >
                    <Icon as={trade.trade_option === 'meetup' ? FaMapMarkerAlt : FaTruck} boxSize={2.5} />
                    {trade.trade_option === 'meetup' ? 'Meetup' : 'Delivery'}
                  </Badge>
                )}
              </HStack>
              
              <HStack spacing={1} mt={1}>
                <Avatar
                  name={userName}
                  size="sm"
                  bg={isIncoming ? 'green.500' : 'blue.500'}
                  color="white"
                />
                <Box flex={1} minW={0}>
                  <Text fontSize="xs" fontWeight="medium" color="gray.800" noOfLines={1}>
                    {userName}
                  </Text>
                  <Text fontSize="2xs" color="gray.500">
                    Accepted {timeAgo}
                  </Text>
                </Box>
              </HStack>
            </VStack>
          </CardHeader>

          <CardFooter pt={0} pb={3}>
            <Button
              size="sm"
              colorScheme="brand"
              w="full"
              onClick={onView}
              leftIcon={<Icon as={ViewIcon} />}
              _hover={{ transform: 'scale(1.02)', shadow: 'md' }}
              transition="all 0.2s"
            >
              View Trade
            </Button>
          </CardFooter>
        </Card>
      </ScaleFade>
    )
  }

  const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const OfferCard: React.FC<{ 
    trade: Trade
    isIncoming: boolean
    onView: () => void
    onAccept?: () => void
    onDecline?: () => void
    onCancel?: () => void
    onComplete?: () => void
  }> = ({ trade, isIncoming, onView, onAccept, onDecline, onCancel, onComplete }) => {
    const userName = isIncoming ? (trade.buyer_name || 'Anonymous User') : (trade.seller_name || 'Anonymous User')
    
    return (
      <ScaleFade in={true} initialScale={0.95}>
        <Card 
          variant="outline"
          _hover={{ 
            shadow: "md",
            transform: "translateY(-2px)",
            transition: "all 0.2s ease"
          }}
          transition="all 0.2s ease"
          borderLeftWidth="4px"
          borderLeftColor={
            trade.status === 'countered' ? 'purple.400' :
            trade.status === 'pending' ? 'yellow.400' :
            trade.status === 'accepted' || trade.status === 'active' ? 'green.400' :
            'gray.200'
          }
          role="article"
          aria-label={`Offer for ${getProductTitle(trade.target_product_id, trade.product_title)}`}
        >
          <Box position="relative" w="full" h="120px" overflow="hidden" borderRadius="lg">
            <ProductThumb
              pid={trade.target_product_id}
              alt={getProductTitle(trade.target_product_id, trade.product_title)}
              size="full"
            />
          </Box>
          <CardHeader pb={2}>
            <Flex justify="space-between" align="start" mb={2}>
              <HStack spacing={1} flexWrap="wrap">
                <Badge 
                  colorScheme={isIncoming ? 'blue' : 'green'}
                  variant="subtle"
                  fontSize="2xs"
                  px={1.5}
                  py={0.5}
                  borderRadius="sm"
                >
                  {isIncoming ? 'Received' : 'Sent'}
                </Badge>
                {getStatusBadge(trade.status)}
              </HStack>
            </Flex>
            <HStack spacing={2} align="center" flexWrap="wrap">
              <Heading size="sm" noOfLines={2}>
                {getProductTitle(trade.target_product_id, trade.product_title)}
              </Heading>
              {trade.trade_option && (
                <Badge 
                  colorScheme={trade.trade_option === 'meetup' ? 'blue' : 'green'}
                  variant="subtle"
                  fontSize="2xs"
                  display="flex"
                  alignItems="center"
                  gap={1}
                >
                  {trade.trade_option === 'meetup' ? 'Meetup' : 'Delivery'}
                </Badge>
              )}
            </HStack>
            <HStack spacing={1} mt={1}>
              <Avatar 
                name={userName}
                size="xs"
                bg={isIncoming ? 'blue.500' : 'green.500'}
                color="white"
              />
              <Text fontSize="xs" color="gray.600" noOfLines={1}>
                {userName}
              </Text>
            </HStack>
          </CardHeader>
          <CardBody pt={0}>
            <VStack spacing={2} align="stretch">
              <Text fontSize="xs" color="gray.500">
                {new Date(trade.created_at).toLocaleDateString()}
              </Text>
              {renderOfferedItems(trade)}
            </VStack>
          </CardBody>
          <CardFooter pt={0}>
            <HStack spacing={2} w="full" flexWrap="wrap">
              <Button
                size="sm"
                variant="outline"
                colorScheme="brand"
                flex={1}
                minW="70px"
                onClick={onView}
                _hover={{ bg: 'brand.50', transform: 'scale(1.02)' }}
                transition="all 0.2s"
              >
                View
              </Button>
              {isIncoming && trade.status === 'pending' && onAccept && onDecline && (
                <>
                  <Button
                    size="sm"
                    colorScheme="green"
                    flex={1}
                    minW="70px"
                    onClick={onAccept}
                    _hover={{ transform: 'scale(1.02)' }}
                    transition="all 0.2s"
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    colorScheme="red"
                    variant="outline"
                    flex={1}
                    minW="70px"
                    onClick={onDecline}
                    _hover={{ transform: 'scale(1.02)' }}
                    transition="all 0.2s"
                  >
                    Decline
                  </Button>
                </>
              )}
              {!isIncoming && trade.status === 'pending' && onCancel && (
                <Button
                  size="sm"
                  colorScheme="red"
                  variant="outline"
                  flex={1}
                  minW="70px"
                  onClick={onCancel}
                  leftIcon={<Icon as={FaTimes} />}
                  _hover={{ transform: 'scale(1.02)' }}
                  transition="all 0.2s"
                >
                  Cancel
                </Button>
              )}
              {(trade.status === 'accepted' || trade.status === 'active') && onComplete && (
                <Button
                  size="sm"
                  colorScheme="blue"
                  flex={1}
                  minW="70px"
                  onClick={onComplete}
                  leftIcon={<Icon as={FaHandshake} />}
                  _hover={{ transform: 'scale(1.02)' }}
                  transition="all 0.2s"
                >
                  Complete
                </Button>
              )}
            </HStack>
          </CardFooter>
        </Card>
      </ScaleFade>
    )
  }


  // Reusable Popup Component
  const PopupModal = () => {
    if (!popupConfig) return null

    const getColorScheme = () => {
      switch (popupConfig.type) {
        case 'success': return 'green'
        case 'warning': return 'orange'
        case 'error': return 'red'
        default: return 'blue'
      }
    }

    const getIconColor = () => {
      switch (popupConfig.type) {
        case 'success': return 'green.500'
        case 'warning': return 'orange.500'
        case 'error': return 'red.500'
        default: return 'blue.500'
      }
    }

    return (
      <Modal isOpen={popupOpen} onClose={() => setPopupOpen(false)} size="sm" isCentered>
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <ModalContent
          bg="white"
          borderRadius="xl"
          boxShadow="xl"
          mx={4}
        >
          <ModalBody p={6} textAlign="center">
            <VStack spacing={4}>
              <Icon as={popupConfig.icon} color={getIconColor()} boxSize={8} />
              <VStack spacing={2}>
                <Text fontWeight="bold" fontSize="lg" color="gray.800">
                  {popupConfig.title}
                </Text>
                <Text fontSize="sm" color="gray.600" textAlign="center">
                  {popupConfig.message}
                </Text>
              </VStack>
              
              <HStack spacing={3} w="full">
                {popupConfig.cancelText && (
                  <Button
                    variant="outline"
                    size="md"
                    flex={1}
                    onClick={popupConfig.onCancel}
                    isDisabled={deleting}
                  >
                    {popupConfig.cancelText}
                  </Button>
                )}
                <Button
                  colorScheme={popupConfig.confirmColorScheme || getColorScheme()}
                  size="md"
                  flex={1}
                  onClick={popupConfig.onConfirm}
                  isLoading={deleting}
                  loadingText="Processing..."
                  leftIcon={popupConfig.type === 'success' ? <CheckIcon /> : undefined}
                >
                  {popupConfig.confirmText}
                </Button>
              </HStack>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    )
  }

  if (loading) {
    return (
      <Center h="50vh">
        <Spinner size="xl" color="brand.500" />
      </Center>
    )
  }

  // Early return if no user (in case redirect hasn't processed yet)
  if (!user) {
    return null
  }

  return (
    <Box bg="#FFFDF1" minH="100vh" w="100%">
      <Container maxW="container.xl" py={8}>
       <VStack spacing={6} align="stretch">
         <VStack spacing={4} align="stretch">
           <Flex
             align="center"
             justify="space-between"
             gap={4}
             flexWrap={{ base: 'wrap', md: 'nowrap' }}
           >
             {/* Left: Welcome Message */}
             <Box minW="fit-content" display={{ base: 'none', md: 'block' }}>
               <Heading size="md" color="brand.500" mb={1}>
                 Welcome, {user?.name}!
               </Heading>
               <Text color="gray.600" fontSize="sm">
                 Manage your products, trades, and offers
               </Text>
             </Box>

             {/* Center: Unified Search Bar */}
             <InputGroup 
               flex={{ base: '1', md: '1 1 350px' }} 
               maxW={{ base: '100%', md: '800px' }}
               position="relative"
             >
               <InputLeftElement pointerEvents="none">
                 <SearchIcon color="gray.400" />
               </InputLeftElement>
               <Input
                 placeholder="Search products, trades, offers..."
                 value={unifiedSearch}
                 onChange={(e) => {
                   handleUnifiedSearchChange(e.target.value)
                   setShowSearchSuggestions(e.target.value.trim().length > 0)
                 }}
                 onFocus={() => {
                   if (unifiedSearch.trim().length > 0) {
                     setShowSearchSuggestions(true)
                   }
                 }}
                 onBlur={() => {
                   setTimeout(() => setShowSearchSuggestions(false), 200)
                 }}
                 bg={cardBg}
                 borderColor={borderColor}
                 _focus={{ 
                   borderColor: 'brand.400', 
                   boxShadow: '0 0 0 1px var(--chakra-colors-brand-400)' 
                 }}
                 size="md"
               />
               {unifiedSearch && (
                 <InputRightElement>
                   <IconButton
                     aria-label="Clear search"
                     icon={<CloseIcon />}
                     size="xs"
                     variant="ghost"
                     onClick={() => {
                       handleUnifiedSearchChange('')
                       setShowSearchSuggestions(false)
                     }}
                   />
                 </InputRightElement>
               )}
               
               {/* Search Suggestions Dropdown */}
               {showSearchSuggestions && unifiedSearch.trim() && (
                 <Box
                   position="absolute"
                   top="100%"
                   left={0}
                   right={0}
                   mt={1}
                   bg="white"
                   borderWidth="1px"
                   borderColor={borderColor}
                   borderRadius="md"
                   boxShadow="lg"
                   zIndex={1000}
                   maxH="300px"
                   overflowY="auto"
                 >
                   <VStack align="stretch" spacing={0} p={2}>
                     <Text fontSize="xs" fontWeight="semibold" color="gray.500" px={2} py={1}>
                       Quick Results
                     </Text>
                     <Box
                       p={2}
                       _hover={{ bg: 'gray.50' }}
                       cursor="pointer"
                       borderRadius="md"
                       onClick={() => {
                         setActiveTab(0)
                         setShowSearchSuggestions(false)
                       }}
                     >
                       <HStack spacing={2}>
                         <Icon as={FiShoppingBag} color="brand.500" />
                         <Text fontSize="sm">Products matching "{unifiedSearch}"</Text>
                       </HStack>
                     </Box>
                     <Box
                       p={2}
                       _hover={{ bg: 'gray.50' }}
                       cursor="pointer"
                       borderRadius="md"
                       onClick={() => {
                         setActiveTab(1)
                         setShowSearchSuggestions(false)
                       }}
                     >
                       <HStack spacing={2}>
                         <Icon as={FiMessageCircle} color="orange.500" />
                         <Text fontSize="sm">Offers matching "{unifiedSearch}"</Text>
                       </HStack>
                     </Box>
                     <Box
                       p={2}
                       _hover={{ bg: 'gray.50' }}
                       cursor="pointer"
                       borderRadius="md"
                       onClick={() => {
                         setActiveTab(2)
                         setShowSearchSuggestions(false)
                       }}
                     >
                       <HStack spacing={2}>
                         <Icon as={FiRefreshCw} color="green.500" />
                         <Text fontSize="sm">Trade History matching "{unifiedSearch}"</Text>
                       </HStack>
                     </Box>
                   </VStack>
                 </Box>
               )}
             </InputGroup>

             {/* Right: Compact Stats Buttons (Row) 
             <HStack spacing={2} flexShrink={0}>
               <Tooltip 
                 label={`${dashboardStats.totalProducts} total • ${dashboardStats.activeProducts} active • ${userProducts.filter(p => p.premium).length} premium`}
                 placement="bottom"
                 hasArrow
               >
                 <Button
                   size="sm"
                   variant="outline"
                   leftIcon={<Icon as={FiShoppingBag} />}
                   onClick={() => setActiveTab(0)}
                   _hover={{ bg: 'brand.50', borderColor: 'brand.400' }}
                   borderColor={activeTab === 0 ? 'brand.400' : borderColor}
                   bg={activeTab === 0 ? 'brand.50' : 'white'}
                   whiteSpace="nowrap"
                 >
                   Products
                   {dashboardStats.totalProducts > 0 && (
                     <Badge ml={2} colorScheme="brand" borderRadius="full" fontSize="xs">
                       {dashboardStats.totalProducts}
                     </Badge>
                   )}
                 </Button>
               </Tooltip>

               <Tooltip 
                 label={dashboardStats.newOffers > 0 ? `${dashboardStats.newOffers} pending offers` : 'No pending offers'}
                 placement="bottom"
                 hasArrow
               >
                 <Button
                   size="sm"
                   variant="outline"
                   leftIcon={<Icon as={FiMessageCircle} />}
                   onClick={() => { setActiveTab(1); setOffersSubTab(1) }}
                   _hover={{ bg: 'orange.50', borderColor: 'orange.400' }}
                   borderColor={activeTab === 1 ? 'orange.400' : (dashboardStats.newOffers > 0 ? 'orange.300' : borderColor)}
                   bg={activeTab === 1 ? 'orange.50' : (dashboardStats.newOffers > 0 ? 'orange.50' : 'white')}
                   whiteSpace="nowrap"
                 >
                   Offers
                   {dashboardStats.newOffers > 0 && (
                     <Badge ml={2} colorScheme="orange" borderRadius="full" fontSize="xs">
                       {dashboardStats.newOffers}
                     </Badge>
                   )}
                 </Button>
               </Tooltip>

               <Tooltip 
                 label={`${dashboardStats.activeTrades} active trades • ${completedTradesCount} completed`}
                 placement="bottom"
                 hasArrow
               >
                 <Button
                   size="sm"
                   variant="outline"
                   leftIcon={<Icon as={FiRefreshCw} />}
                   onClick={() => setActiveTab(2)}
                   _hover={{ bg: 'green.50', borderColor: 'green.400' }}
                   borderColor={activeTab === 2 ? 'green.400' : borderColor}
                   bg={activeTab === 2 ? 'green.50' : 'white'}
                   whiteSpace="nowrap"
                 >
                   History
                   {completedTradesCount > 0 && (
                     <Badge ml={2} colorScheme="green" borderRadius="full" fontSize="xs">
                       {completedTradesCount}
                     </Badge>
                   )}
                 </Button>
               </Tooltip>
             </HStack>
             */}

             {/* Mobile: Filter/Sort Controls for All Tabs (Left Side) */}
             <HStack spacing={1} display={{ base: 'flex', lg: 'none' }}>
               {activeTab === 0 && (
                 <>
                   <Tooltip label={`Filter: ${productFilter === 'all' ? 'All Status' : productFilter}`} hasArrow>
                     <IconButton
                       aria-label="Filter products"
                       icon={<FiFilter />}
                       size="sm"
                       variant="ghost"
                       onClick={() => {
                         const filters = ['all', 'available', 'sold', 'traded', 'locked']
                         const currentIndex = filters.indexOf(productFilter)
                         setProductFilter(filters[(currentIndex + 1) % filters.length] as any)
                         setCurrentPage(1)
                       }}
                     />
                   </Tooltip>
                   <Tooltip label={`Sort: ${productSort === 'newest' ? 'Newest First' : 'Oldest First'}`} hasArrow>
                     <IconButton
                       aria-label="Sort products"
                       icon={<FiArrowDown />}
                       size="sm"
                       variant="ghost"
                       onClick={() => {
                         setProductSort(productSort === 'newest' ? 'oldest' : 'newest')
                         setCurrentPage(1)
                       }}
                     />
                   </Tooltip>
                 </>
               )}

               {activeTab === 1 && (
                 <>
                   <Tooltip label={`Filter: ${offersStatusFilter === 'all' ? 'All Status' : offersStatusFilter}`} hasArrow>
                     <IconButton
                       aria-label="Filter offers"
                       icon={<FiFilter />}
                       size="sm"
                       variant="ghost"
                       onClick={() => {
                         const statuses = ['all', 'pending', 'accepted', 'active', 'countered']
                         const currentIndex = statuses.indexOf(offersStatusFilter)
                         setOffersStatusFilter(statuses[(currentIndex + 1) % statuses.length])
                         setOffersPage(1)
                       }}
                     />
                   </Tooltip>
                   <Tooltip label={`Sort: ${offersSort === 'newest' ? 'Newest First' : 'Oldest First'}`} hasArrow>
                     <IconButton
                       aria-label="Sort offers"
                       icon={<FiArrowDown />}
                       size="sm"
                       variant="ghost"
                       onClick={() => {
                         setOffersSort(offersSort === 'newest' ? 'oldest' : 'newest')
                       }}
                     />
                   </Tooltip>
                 </>
               )}

               {activeTab === 2 && (
                 <Tooltip label={`Sort: ${tradeHistorySort === 'newest' ? 'Newest First' : 'Oldest First'}`} hasArrow>
                   <IconButton
                     aria-label="Sort trade history"
                     icon={<FiArrowDown />}
                     size="sm"
                     variant="ghost"
                     onClick={() => {
                       setTradeHistorySort(tradeHistorySort === 'newest' ? 'oldest' : 'newest')
                       setTradeHistoryPage(1)
                     }}
                   />
                 </Tooltip>
               )}
             </HStack>

             {/* Notifications & Profile */}
             <HStack spacing={2} flexShrink={0}>
               <Box position="relative">
                 <IconButton
                   aria-label="Notifications"
                   icon={<BellIcon />}
                   size="md"
                   bg="#319795"
                   color="white"
                   _hover={{ bg: '#2A8280' }}
                   _active={{ bg: '#267E7C' }}
                   onClick={() => navigate('/notifications')}
                 />
                 {unreadNotifications > 0 && (
                   <Badge
                     position="absolute"
                     top="-2px"
                     right="-2px"
                     bg="red.500"
                     color="white"
                     borderRadius="full"
                     fontSize="xs"
                     minW="18px"
                     h="18px"
                     display="flex"
                     alignItems="center"
                     justifyContent="center"
                     fontWeight="bold"
                   >
                     {unreadNotifications > 99 ? '99+' : unreadNotifications}
                   </Badge>
                 )}
               </Box>
               <Avatar name={user?.name || 'User'} size="md" bg="brand.500" color="white" cursor="pointer" />
             </HStack>
           </Flex>
         </VStack>

         {/* Tabs with Sticky Navigation */}
        <Box bg="white" rounded="lg" shadow="sm" position="relative">
           <Box
             position="sticky"
             top={0}
             zIndex={10}
             bg="white"
             borderTopRadius="lg"
             borderBottom="1px solid"
             borderColor="gray.200"
             py={2}
           >
             <Flex justify="space-between" align="center" px={4} gap={{ base: 2, md: 4 }} flexWrap={{ base: 'wrap', md: 'nowrap' }}>
               <Tabs index={activeTab} onChange={setActiveTab} variant="line" colorScheme="brand" flex={1} minW={0}>
                 <TabList 
                   overflowX={{ base: 'visible', md: 'visible' }}
                   display="flex"
                   flexWrap={{ base: 'nowrap', md: 'nowrap' }}
                   justifyContent={{ base: 'space-between', md: 'flex-start' }}
                   sx={{
                     '&::-webkit-scrollbar': { display: 'none' },
                     scrollbarWidth: 'none',
                     msOverflowStyle: 'none',
                     '& > button': {
                       fontSize: { base: '0.75rem', sm: '0.875rem', md: '1rem' },
                       whiteSpace: 'nowrap',
                       minW: { base: 'auto', md: 'auto' },
                       px: { base: '6px', sm: '12px', md: '16px' },
                       py: { base: '8px', sm: '12px' },
                       flex: { base: '1', md: 'initial' },
                       justifyContent: { base: 'center', md: 'flex-start' },
                     }
                   }}>
                   <Tab 
                     _selected={{ 
                       color: 'brand.600', 
                       borderColor: 'brand.600',
                       fontWeight: 'semibold'
                     }}
                     transition="all 0.2s"
                   >
                     <HStack spacing={{ base: 1, sm: 2, md: 3 }}>
                       <Icon as={FiShoppingBag} boxSize={{ base: 4, sm: 4, md: 5 }} mr={{ base: 1, md: 2 }} />
                       <Text display={{ base: 'none', sm: 'block' }}>My Products</Text>
                       {userProducts.length > 0 && (
                         <Badge colorScheme="green" borderRadius="full" fontSize="xs" display={{ base: 'none', sm: 'inline-flex' }}>
                           {userProducts.length}
                         </Badge>
                       )}
                     </HStack>
                   </Tab>
                   <Tab 
                     position="relative"
                     _selected={{ 
                       color: 'brand.600', 
                       borderColor: 'brand.600',
                       fontWeight: 'semibold'
                     }}
                     transition="all 0.2s"
                   >
                     <HStack spacing={{ base: 1, sm: 2, md: 3 }}>
                       <Icon as={FiMessageCircle} boxSize={{ base: 4, sm: 4, md: 5 }} mr={{ base: 1, md: 2 }} />
                       <Text display={{ base: 'none', sm: 'block' }}>Offers</Text>
                       {unreadOffers > 0 && (
                         <Badge
                           bg="orange.500"
                           color="white"
                           borderRadius="full"
                           fontSize="2xs"
                           minW={{ base: '16px', md: '18px' }}
                           h={{ base: '16px', md: '18px' }}
                           display="inline-flex"
                           alignItems="center"
                           justifyContent="center"
                           fontWeight="bold"
                         >
                           {unreadOffers > 99 ? '99+' : unreadOffers}
                         </Badge>
                       )}
                     </HStack>
                   </Tab>
                   <Tab
                     _selected={{ 
                       color: 'brand.600', 
                       borderColor: 'brand.600',
                       fontWeight: 'semibold'
                     }}
                     transition="all 0.2s"
                   >
                     <HStack spacing={{ base: 1, sm: 2, md: 3 }}>
                       <Icon as={FaExchangeAlt} boxSize={{ base: 4, sm: 4, md: 5 }} mr={{ base: 1, md: 2 }} />
                       <Text display={{ base: 'none', sm: 'block' }}>Multi-Way Trades</Text>
                       <Badge colorScheme="purple" fontSize="2xs" px={{ base: 1, md: 1.5 }} display={{ base: 'none', sm: 'inline-flex' }}>
                         PRO
                       </Badge>
                     </HStack>
                   </Tab>
                   <Tab 
                     ml={{ base: 'auto', md: 0 }}
                     _selected={{ 
                       color: 'brand.600', 
                       borderColor: 'brand.600',
                       fontWeight: 'semibold'
                     }}
                     transition="all 0.2s"
                   >
                     <HStack spacing={{ base: 1, sm: 2, md: 3 }}>
                       <Icon as={FiRefreshCw} boxSize={{ base: 4, sm: 4, md: 5 }} mr={{ base: 1, md: 2 }} />
                       <Text display={{ base: 'none', sm: 'block' }}>Trade History</Text>
                       {completedTradesCount > 0 && (
                         <Badge colorScheme="green" borderRadius="full" fontSize="2xs" display={{ base: 'none', sm: 'inline-flex' }}>
                           {completedTradesCount}
                         </Badge>
                       )}
                     </HStack>
                   </Tab>
                 </TabList>
               </Tabs>

               {/* Right: Filter/Sort Controls - Icon Buttons on Mobile */}
               <HStack
                 spacing={{ base: 1, md: 3 }}
                 flexShrink={0}
                 justify="flex-end"
               >
                 {activeTab === 0 && (
                   <>
                     {/* Desktop: Show selects only */}
                     <Box display={{ base: 'none', lg: 'block' }}>
                       <Select
                         value={productFilter}
                         onChange={(e) => {
                           setProductFilter(e.target.value as any)
                           setCurrentPage(1)
                         }}
                         w={{ base: '120px', md: '150px' }}
                         bg={cardBg}
                         borderColor={borderColor}
                         size="sm"
                       >
                         <option value="all">All Status</option>
                         <option value="available">Active</option>
                         <option value="sold">Sold</option>
                         <option value="traded">Traded</option>
                         <option value="locked">Hidden</option>
                       </Select>
                     </Box>
                     <Box display={{ base: 'none', lg: 'block' }}>
                       <Select
                         value={productSort}
                         onChange={(e) => {
                           setProductSort(e.target.value as any)
                           setCurrentPage(1)
                         }}
                         w={{ base: '120px', md: '140px' }}
                         bg={cardBg}
                         borderColor={borderColor}
                         size="sm"
                       >
                         <option value="newest">Newest First</option>
                         <option value="oldest">Oldest First</option>
                       </Select>
                     </Box>
                   </>
                 )}
                 
                 {activeTab === 1 && (
                   <>
                     {/* Desktop: Show selects only */}
                     <Box display={{ base: 'none', lg: 'block' }}>
                       <Select
                         value={offersStatusFilter}
                         onChange={(e) => {
                           setOffersStatusFilter(e.target.value)
                           setOffersPage(1)
                         }}
                         w={{ base: '120px', md: '140px' }}
                         bg={cardBg}
                         borderColor={borderColor}
                         size="sm"
                       >
                         <option value="all">All Status</option>
                         <option value="pending">Pending</option>
                         <option value="accepted">Accepted</option>
                         <option value="active">Active</option>
                         <option value="countered">Countered</option>
                       </Select>
                     </Box>
                     <Box display={{ base: 'none', lg: 'block' }}>
                       <Select
                         value={offersSort}
                         onChange={(e) => setOffersSort(e.target.value as any)}
                         w={{ base: '120px', md: '140px' }}
                         bg={cardBg}
                         borderColor={borderColor}
                         size="sm"
                       >
                         <option value="newest">Newest First</option>
                         <option value="oldest">Oldest First</option>
                       </Select>
                     </Box>
                   </>
                 )}

                 {activeTab === 2 && (
                   <>
                     {/* Desktop: Show select only */}
                     <Box display={{ base: 'none', lg: 'block' }}>
                       <Select
                         value={tradeHistorySort}
                         onChange={(e) => {
                           setTradeHistorySort(e.target.value as any)
                           setTradeHistoryPage(1)
                         }}
                         w={{ base: '120px', md: '140px' }}
                         bg={cardBg}
                         borderColor={borderColor}
                         size="sm"
                       >
                         <option value="newest">Newest First</option>
                         <option value="oldest">Oldest First</option>
                       </Select>
                     </Box>
                   </>
                 )}
               </HStack>
             </Flex>
           </Box>
           
           <Tabs index={activeTab} onChange={setActiveTab}>
             <TabPanels>
              {/* Products Tab */}
              <TabPanel>
                <VStack spacing={6} align="stretch">
                  {/* Filters and Actions (Search moved to top bar) */}
                  <HStack spacing={3} flexWrap="wrap" justify="space-between">
                    <HStack spacing={2} flexWrap="wrap">
                      {unifiedSearch && (
                        <Badge colorScheme="blue" variant="subtle" fontSize="sm" px={2} py={1}>
                          Searching: "{unifiedSearch}"
                        </Badge>
                      )}
                    </HStack>
                  </HStack>

                   {/* Products Grid - Apply Sort */}
                   {productsLoading ? (
                     <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} spacing={4}>
                       {Array.from({ length: 8 }).map((_, i) => (
                         <ProductCardSkeleton key={i} />
                       ))}
                     </SimpleGrid>
                   ) : filteredProducts.length === 0 ? (
                     <Fade in={true}>
                       <Box 
                         textAlign="center" 
                         py={16} 
                         bg="green.50" 
                         borderRadius="lg" 
                         border="2px dashed" 
                         borderColor="green.200"
                       >
                         <Icon as={FiShoppingBag} boxSize={16} color="green.300" mb={4} />
                        <Text color="gray.600" fontSize="lg" fontWeight="medium" mb={2}>
                          {(unifiedSearch || productSearch) || productFilter !== 'all' 
                            ? 'No products match your search/filters'
                            : 'Start by adding your first product!'}
                        </Text>
                        <Text color="gray.500" fontSize="sm" mb={4}>
                          {(unifiedSearch || productSearch) || productFilter !== 'all' 
                            ? 'Try adjusting your search or filters'
                            : 'Create your first listing to get started with trading'}
                        </Text>
                        {(!(unifiedSearch || productSearch) && productFilter === 'all') && (
                           <Button
                             as={RouterLink}
                             to="/add-product"
                             colorScheme="green"
                             leftIcon={<AddIcon />}
                             size="lg"
                           >
                             Add Your First Product
                           </Button>
                         )}
                       </Box>
                     </Fade>
                   ) : (
                     <>
                       <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} spacing={4}>
                         {getPaginatedItems(
                           filteredProducts.sort((a, b) => {
                             const aDate = new Date(a.created_at).getTime()
                             const bDate = new Date(b.created_at).getTime()
                             return productSort === 'newest' ? bDate - aDate : aDate - bDate
                           }),
                           currentPage
                         ).map((product) => (
                           <ProductCard key={product.id} product={product} showActions={true} />
                         ))}
                       </SimpleGrid>
                       <PaginationControls
                         currentPage={currentPage}
                         totalPages={getTotalPages(filteredProducts)}
                         onPageChange={setCurrentPage}
                         itemsCount={filteredProducts.length}
                       />
                     </>
                   )}
                 </VStack>
               </TabPanel>

              {/* Offers Tab */}
              <TabPanel>
                <VStack spacing={6} align="stretch">
                  {/* Sub-tabs for Offers */}
                  <Tabs 
                    index={offersSubTab} 
                    onChange={(index) => {
                      setOffersSubTab(index)
                      setOffersPage(1) // Reset to first page when switching tabs
                    }} 
                    variant="soft-rounded" 
                    colorScheme="brand"
                  >
                    <TabList 
                      flexWrap={{ base: 'nowrap', md: 'nowrap' }}
                      overflowX={{ base: 'auto', md: 'visible' }}
                      justifyContent={{ base: 'space-between', md: 'flex-start' }}
                      w="100%"
                      sx={{
                        '&::-webkit-scrollbar': { display: 'none' },
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        gap: '4px',
                        '& > button': {
                          px: '6px !important',
                          py: '4px !important',
                          minW: 'fit-content',
                          flex: { base: 'initial', md: 'initial' },
                        }
                      }}
                    >
                      <Tab fontSize={{ base: '10px', md: 'sm' }} mr={{ base: 12, md: 0 }}>
                        <Box display={{ base: 'none', md: 'inline' }}>Sent Offers</Box>
                        <Box display={{ base: 'inline', md: 'none' }}>Sent</Box>
                        {offersStats.sentPending > 0 && (
                          <Badge ml={2} colorScheme="yellow" borderRadius="full" fontSize="xs">
                            {offersStats.sentPending}
                          </Badge>
                        )}
                      </Tab>
                      <Tab fontSize={{ base: '10px', md: 'sm' }} mr={{ base: 10, md: 0 }}>
                        <Box display={{ base: 'none', md: 'inline' }}>Received Offers</Box>
                        <Box display={{ base: 'inline', md: 'none' }}>Received</Box>
                        {offersStats.receivedPending > 0 && (
                          <Badge ml={2} colorScheme="blue" borderRadius="full" fontSize="xs">
                            {offersStats.receivedPending}
                          </Badge>
                        )}
                      </Tab>
                      <Tab fontSize={{ base: '10px', md: 'sm' }}>
                        <Box display={{ base: 'none', md: 'inline' }}>Ongoing Trades</Box>
                        <Box display={{ base: 'inline', md: 'none' }}>Ongoing</Box>
                        {offersStats.ongoing > 0 && (
                          <Badge ml={2} colorScheme="green" borderRadius="full" fontSize="xs">
                           {offersStats.ongoing}
                         </Badge>
                       )}
                     </Tab>
                   </TabList>

                    <TabPanels>
                      {/* Sent Offers */}
                      <TabPanel px={0}>
                        {offersLoading ? (
                          <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} spacing={4}>
                            {Array.from({ length: 8 }).map((_, i) => (
                              <ProductCardSkeleton key={i} />
                            ))}
                          </SimpleGrid>
                        ) : sentOffers.length === 0 ? (
                          <Fade in={true}>
                            <Box 
                              textAlign="center" 
                              py={12} 
                              bg="green.50" 
                              borderRadius="lg" 
                              border="2px dashed" 
                              borderColor="green.200"
                            >
                              <Icon as={FaHandshake} boxSize={16} color="green.300" mb={4} />
                              <Text color="gray.600" fontSize="lg" fontWeight="medium" mb={2}>
                                {(unifiedSearch || offersSearch) || offersStatusFilter !== 'all' 
                                  ? 'No offers match your search/filters.'
                                  : 'No sent offers'}
                              </Text>
                              <Text color="gray.500" fontSize="sm">
                                {(unifiedSearch || offersSearch) || offersStatusFilter !== 'all' 
                                  ? 'Try adjusting your search or filters.'
                                  : 'Start making offers to see them here!'}
                              </Text>
                            </Box>
                          </Fade>
                        ) : (
                          <>
                            <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} spacing={4} mb={6}>
                              {paginatedTrades.map((trade) => {
                                const isIncoming = false
                                return (
                                  <OfferCard
                                   
                                    key={trade.id}
                                    trade={trade}
                                    isIncoming={isIncoming}
                                    onView={() => { setSelectedTrade(trade); setDetailsOpen(true) }}
                                    onCancel={() => handleCancelTradeClick(trade)}
                                  />
                                )
                              })}
                            </SimpleGrid>
                            {totalPages > 1 && (
                              <HStack justify="center" spacing={2} mt={4}>
                                <Button
                                  size="sm"
                                  leftIcon={<ChevronLeftIcon />}
                                  onClick={() => setOffersPage(p => Math.max(1, p - 1))}
                                  isDisabled={offersPage === 1}
                                >
                                  Previous
                                </Button>
                                <Text fontSize="sm" color="gray.600">
                                  Page {offersPage} of {totalPages}
                                </Text>
                                <Button
                                  size="sm"
                                  rightIcon={<ChevronRightIcon />}
                                  onClick={() => setOffersPage(p => Math.min(totalPages, p + 1))}
                                  isDisabled={offersPage === totalPages}
                                >
                                  Next
                                </Button>
                              </HStack>
                            )}
                          </>
                        )}
                      </TabPanel>

                      {/* Received Offers */}
                      <TabPanel px={0}>
                        {offersLoading ? (
                          <SimpleGrid columns={{ base:  1, md: 2, lg: 3, xl: 4 }} spacing={4}>
                            {Array.from({ length: 8 }).map((_, i) => (
                              <ProductCardSkeleton key={i} />
                            ))}
                          </SimpleGrid>
                        ) : receivedOffers.length === 0 ? (
                          <Fade in={true}>
                            <Box 
                              textAlign="center" 
                              py={12} 
                              bg="blue.50" 
                              borderRadius="lg" 
                              border="2px dashed" 
                              borderColor="blue.200"
                            >
                              <Icon as={FaHandshake} boxSize={16} color="blue.300" mb={4} />
                              <Text color="gray.600" fontSize="lg" fontWeight="medium" mb={2}>
                                {(unifiedSearch || offersSearch) || offersStatusFilter !== 'all' 
                                  ? 'No offers match your search/filters.'
                                  : 'No received offers'}
                              </Text>
                              <Text color="gray.500" fontSize="sm" mb={4}>
                                {(unifiedSearch || offersSearch) || offersStatusFilter !== 'all' 
                                  ? 'Try adjusting your search or filters.'
                                  : 'You haven\'t received any offers yet'}
                              </Text>
                            </Box>
                          </Fade>
                        ) : (
                          <>
                            <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} spacing={4} mb={6}>
                              {paginatedTrades.map((trade) => {
                                const isIncoming = true
                                return (
                                  <OfferCard
                                    key={trade.id}
                                    trade={trade}
                                    isIncoming={isIncoming}
                                    onView={() => { setSelectedTrade(trade); setDetailsOpen(true) }}
                                    onAccept={() => updateTrade(trade.id, { action: 'accept' })}
                                    onDecline={() => handleDeclineTradeClick(trade)}
                                  />
                                                               )
                              })}
                            </SimpleGrid>
                            {totalPages > 1 && (
                              <HStack justify="center" spacing={2} mt={4}>
                                <Button
                                  size="sm"
                                  leftIcon={<ChevronLeftIcon />}
                                  onClick={() => setOffersPage(p => Math.max(1, p - 1))}
                                  isDisabled={offersPage === 1}
                                >
                                  Previous
                                </Button>
                                <Text fontSize="sm" color="gray.600">
                                  Page {offersPage} of {totalPages}
                                </Text>
                                <Button
                                  size="sm"
                                  rightIcon={<ChevronRightIcon />}
                                  onClick={() => setOffersPage(p => Math.min(totalPages, p + 1))}
                                  isDisabled={offersPage === totalPages}
                                >
                                  Next
                                </Button>
                              </HStack>
                            )}
                          </>
                        )}
                      </TabPanel>

                      {/* Ongoing Trades */}
                      <TabPanel px={0}>
                        {offersLoading ? (
                          <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} spacing={4}>
                            {Array.from({ length: 8 }).map((_, i) => (
                              <ProductCardSkeleton key={i} />
                            ))}
                          </SimpleGrid>
                        ) : ongoingTrades.length === 0 ? (
                          <Fade in={true}>
                            <Box 
                              textAlign="center" 
                              py={12} 
                              bg="green.50" 
                              borderRadius="lg" 
                              border="2px dashed" 
                              borderColor="green.200"
                            >
                              <Icon as={FaHandshake} boxSize={16} color="green.300" mb={4} />
                              <Text color="gray.600" fontSize="lg" fontWeight="medium" mb={2}>
                                {(unifiedSearch || offersSearch) || offersStatusFilter !== 'all' 
                                  ? 'No trades match your search/filters.'
                                  : 'No ongoing trades'}
                              </Text>
                              <Text color="gray.500" fontSize="sm" mb={4}>
                                {(unifiedSearch || offersSearch) || offersStatusFilter !== 'all' 
                                  ? 'Try adjusting your search or filters.'
                                  : 'Accepted offers will appear here'}
                              </Text>
                            </Box>
                          </Fade>
                        ) : (
                          <>
                            <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} spacing={4} mb={6}>
                              {paginatedTrades.map((trade) => {
                                const isIncoming = incoming.some(t => t.id === trade.id)
                                return (
                                  <OngoingTradeCard
                                    key={trade.id}
                                    trade={trade}
                                    isIncoming={isIncoming}
                                    onView={() => { setSelectedTrade(trade); setViewTradeModalOpen(true) }}
                                    onComplete={() => handleCompleteTradeClick(trade)}
                                  />
                                )
                              })}
                            </SimpleGrid>
                            {totalPages > 1 && (
                              <HStack justify="center" spacing={2} mt={4}>
                                <Button
                                  size="sm"
                                  leftIcon={<ChevronLeftIcon />}
                                  onClick={() => setOffersPage(p => Math.max(1, p - 1))}
                                  isDisabled={offersPage === 1}
                                >
                                  Previous
                                </Button>
                                <Text fontSize="sm" color="gray.600">
                                  Page {offersPage} of {totalPages}
                                </Text>
                                <Button
                                  size="sm"
                                  rightIcon={<ChevronRightIcon />}
                                  onClick={() => setOffersPage(p => Math.min(totalPages, p + 1))}
                                  isDisabled={offersPage === totalPages}
                                >
                                  Next
                                </Button>
                              </HStack>
                            )}
                          </>
                        )}
                      </TabPanel>

                    </TabPanels>
                  </Tabs>
                </VStack>
              </TabPanel>

              {/* Multi-Way Trades Tab */}
              <TabPanel>
                {multiWayTradesLoading ? (
                  <Center py={12}>
                    <Spinner size="lg" color="brand.500" />
                  </Center>
                ) : multiWayTrades.length === 0 ? (
                  <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                    {/* Mock Trade Loop 1 */}
                    <Box p={4} bg={cardBg} borderRadius="lg" borderWidth="1px" borderColor={borderColor}>
                      <MultiWayTradeUI
                        participants={[
                          { id: 1, user_name: 'John Doe', product_id: 1, product_title: 'PlayStation 5' },
                          { id: 2, user_name: 'Sarah Smith', product_id: 2, product_title: 'iPhone 13' },
                          { id: 3, user_name: 'Mike Johnson', product_id: 3, product_title: 'MacBook Pro' },
                        ]}
                        onJoinTrade={() => toast({ title: 'Joined Trade Loop', status: 'success' })}
                        onViewDetails={() => {}}
                        onDecline={() => {}}
                        isLoading={false}
                      />
                    </Box>

                    {/* Mock Trade Loop 2 */}
                    <Box p={4} bg={cardBg} borderRadius="lg" borderWidth="1px" borderColor={borderColor}>
                      <MultiWayTradeUI
                        participants={[
                          { id: 4, user_name: 'Emma Wilson', product_id: 4, product_title: 'Galaxy S23' },
                          { id: 5, user_name: 'Alex Chen', product_id: 5, product_title: 'iPad Air' },
                          { id: 6, user_name: 'Lisa Anderson', product_id: 6, product_title: 'Apple Watch' },
                          { id: 7, user_name: 'Tom Davis', product_id: 7, product_title: 'AirPods Pro' },
                        ]}
                        onJoinTrade={() => toast({ title: 'Joined Trade Loop', status: 'success' })}
                        onViewDetails={() => {}}
                        onDecline={() => {}}
                        isLoading={false}
                      />
                    </Box>

                    {/* Mock Trade Loop 3 */}
                    <Box p={4} bg={cardBg} borderRadius="lg" borderWidth="1px" borderColor={borderColor}>
                      <MultiWayTradeUI
                        participants={[
                          { id: 8, user_name: 'Chris Martin', product_id: 8, product_title: 'Nintendo Switch' },
                          { id: 9, user_name: 'Jessica Brown', product_id: 9, product_title: 'Bicycle' },
                          { id: 10, user_name: 'Robert Taylor', product_id: 10, product_title: 'Guitar' },
                          { id: 11, user_name: 'Nina Patel', product_id: 11, product_title: 'Camera' },
                          { id: 12, user_name: 'Kevin Lee', product_id: 12, product_title: 'Headphones' },
                        ]}
                        onJoinTrade={() => toast({ title: 'Joined Trade Loop', status: 'success' })}
                        onViewDetails={() => {}}
                        onDecline={() => {}}
                        isLoading={false}
                      />
                    </Box>
                  </SimpleGrid>
                ) : (
                  <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                    {multiWayTrades.map((trade) => (
                      <Box key={trade.id} p={4} bg={cardBg} borderRadius="lg" borderWidth="1px" borderColor={borderColor}>
                        <MultiWayTradeUI
                          participants={trade.participants || []}
                          onJoinTrade={() => handleJoinMultiWayTrade(trade)}
                          onViewDetails={() => setSelectedMultiWayTrade(trade)}
                          onDecline={() => handleDeclineMultiWayTrade(trade)}
                          isLoading={multiWayTradeJoining}
                        />
                      </Box>
                    ))}
                  </SimpleGrid>
                )}
              </TabPanel>

              {/* Trade History Tab */}
              <TabPanel>
                <VStack spacing={6} align="stretch">
                  {/* Trade History Grid */}
                  {allCompletedTrades.length === 0 ? (
                    <Fade in={true}>
                      <Box
                        textAlign="center"
                        py={16}
                        bg="green.50"
                        borderRadius="lg"
                        border="2px dashed"
                        borderColor="green.200"
                      >
                        <Icon as={FiRefreshCw} boxSize={16} color="green.300" mb={4} />
                        <Text color="gray.600" fontSize="lg" fontWeight="medium" mb={2}>
                          No completed trades yet
                        </Text>
                        <Text color="gray.500" fontSize="sm">
                          {(unifiedSearch || tradeHistorySearch)
                            ? 'Try adjusting your search'
                            : 'Start trading to see your exchange history here!'}
                        </Text>
                      </Box>
                    </Fade>
                  ) : (
                    <>
                      <VStack spacing={0} align="stretch" borderWidth="1px" borderColor={borderColor} rounded="lg" overflow="hidden">
                        {/* Header Row */}
                        <HStack
                          spacing={4}
                          px={4}
                          py={3}
                          bg="gray.50"
                          borderBottomWidth="1px"
                          borderColor="gray.200"
                          fontSize="xs"
                          fontWeight="semibold"
                          color="gray.600"
                          textTransform="uppercase"
                          h="fit-content"
                        >
                          <Box w="60px" flexShrink={0}>Product</Box>
                          <Box flex={1} minW={{ base: '120px', md: '150px' }}>Your Item</Box>
                          <Box w="40px" display="flex" justifyContent="center" flexShrink={0}>↔</Box>
                          <Box flex={1} minW={{ base: '120px', md: '150px' }}>Received Item</Box>
                          <Box w="120px" flexShrink={0}>Partner</Box>
                          <Box w="100px" flexShrink={0}>Date</Box>
                          <Box w="80px" flexShrink={0} textAlign="center">Action</Box>
                        </HStack>

                        {/* Trade Rows */}
                        {paginatedTradeHistory.map((trade, idx) => {
                          const isIncoming = incoming.some(t => t.id === trade.id)
                          const tradingPartner = isIncoming 
                            ? (trade.buyer_name || 'Anonymous')
                            : (trade.seller_name || 'Anonymous')
                          
                          return (
                            <HStack
                              key={trade.id}
                              spacing={4}
                              px={4}
                              py={3}
                              borderBottomWidth={idx < paginatedTradeHistory.length - 1 ? "1px" : "0px"}
                              borderColor={borderColor}
                              align="center"
                              transition="all 0.2s"
                              _hover={{ bg: 'gray.50' }}
                              h="80px"
                            >
                              {/* Product Thumbnail */}
                              <Box w={{ base: '50px', md: '60px' }} h="60px" flexShrink={0} borderRadius="md" overflow="hidden" borderWidth="1px" borderColor={borderColor}>
                                <ProductThumb
                                  pid={trade.target_product_id}
                                  alt={getProductTitle(trade.target_product_id, trade.product_title)}
                                  size="full"
                                />
                              </Box>

                              {/* Your Item Info */}
                              <VStack align="start" spacing={0} flex={1.2} minW={{ base: '120px', md: '150px' }}>
                                <Text fontSize={{ base: 'xs', md: 'sm' }} fontWeight="semibold" color="gray.800" noOfLines={1}>
                                  {getProductTitle(trade.target_product_id, trade.product_title)}
                                </Text>
                                <Badge colorScheme="blue" fontSize="2xs" w="fit-content">
                                  Your Item
                                </Badge>
                              </VStack>

                              {/* Swap Icon */}
                              <Center w={{ base: '30px', md: '40px' }} flexShrink={0} color="brand.400" fontSize={{ base: 'md', md: 'lg' }}>
                                ↔
                              </Center>

                              {/* Received Item Info */}
                              <VStack align="start" spacing={0} flex={1.2} minW={{ base: '120px', md: '150px' }}>
                                {trade.items && trade.items.length > 0 ? (
                                  <>
                                    <Text fontSize={{ base: 'xs', md: 'sm' }} fontWeight="semibold" color="gray.800" noOfLines={1}>
                                      {getProductTitle(Number(trade.items[0].product_id), trade.items[0].product_title)}
                                    </Text>
                                    <Badge colorScheme="green" fontSize="2xs" w="fit-content">
                                      Received
                                    </Badge>
                                  </>
                                ) : (
                                  <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.500">N/A</Text>
                                )}
                              </VStack>

                              {/* Partner Name */}
                              <VStack align="start" spacing={0} w={{ base: '100px', md: '140px' }} flexShrink={0}>
                                <Text fontSize={{ base: 'xs', md: 'sm' }} fontWeight="medium" color="gray.800" noOfLines={1}>
                                  {tradingPartner}
                                </Text>
                                <Badge colorScheme="gray" fontSize="2xs" w="fit-content">
                                  {isIncoming ? 'Buyer' : 'Seller'}
                                </Badge>
                              </VStack>

                              {/* Date */}
                              <VStack align="start" spacing={0} w={{ base: '90px', md: '110px' }} flexShrink={0}>
                                <Text fontSize={{ base: '2xs', md: 'xs' }} color="gray.600">
                                  {trade.completed_at 
                                    ? new Date(trade.completed_at).toLocaleDateString()
                                    : new Date(trade.updated_at).toLocaleDateString()}
                                </Text>
                                <Text fontSize="2xs" color="gray.500">
                                  {trade.completed_at 
                                    ? new Date(trade.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    : 'N/A'}
                                </Text>
                              </VStack>

                              {/* Action Button */}
                              <VStack align="center" spacing={0} w={{ base: '70px', md: '90px' }} flexShrink={0} justify="center" h="full">
                                <Button
                                  size={{ base: 'xs', md: 'sm' }}
                                  variant="outline"
                                  colorScheme="brand"
                                  w="full"
                                  onClick={() => { setSelectedTrade(trade); setDetailsOpen(true) }}
                                  _hover={{ transform: 'scale(1.02)', shadow: 'sm' }}
                                  transition="all 0.2s"
                                >
                                  View
                                </Button>
                              </VStack>
                            </HStack>
                          )
                        })}
                      </VStack>
                      
                      {/* Pagination */}
                      {tradeHistoryTotalPages > 1 && (
                        <HStack justify="center" spacing={2} mt={6}>
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<ChevronLeftIcon />}
                            onClick={() => setTradeHistoryPage(p => Math.max(1, p - 1))}
                            isDisabled={tradeHistoryPage === 1}
                          >
                            Previous
                          </Button>
                          <Text fontSize="sm" color="gray.600">
                            Page {tradeHistoryPage} of {tradeHistoryTotalPages}
                          </Text>
                          <Button
                            size="sm"
                            variant="outline"
                            rightIcon={<ChevronRightIcon />}
                            onClick={() => setTradeHistoryPage(p => Math.min(tradeHistoryTotalPages, p + 1))}
                            isDisabled={tradeHistoryPage === tradeHistoryTotalPages}
                          >
                            Next
                          </Button>
                        </HStack>
                      )}
                    </>
                  )}
                </VStack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Box>

        {/* Popup Modal System */}
        <PopupModal />

        {/* Offers Modals */}
        <OfferDetailsModal
          trade={selectedTrade}
          isOpen={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          onAccepted={async () => {
            refreshOffersData()
            fetchTradeHistory()
            fetchNotificationCounts()
            
            // If trade option is delivery, show delivery request modal
            if (selectedTrade?.trade_option === 'delivery') {
              // Fetch products for delivery
              try {
                const productsToDeliver: Product[] = []
                // Get target product
                if (selectedTrade.target_product_id) {
                  const targetRes = await api.get(`/api/products/${selectedTrade.target_product_id}`)
                  if (targetRes.data?.data) {
                    productsToDeliver.push(targetRes.data.data)
                  }
                }
                // Get items from trade
                if (selectedTrade.items && selectedTrade.items.length > 0) {
                  for (const item of selectedTrade.items) {
                    try {
                      const itemRes = await api.get(`/api/products/${item.product_id}`)
                      if (itemRes.data?.data) {
                        productsToDeliver.push(itemRes.data.data)
                      }
                    } catch (e) {
                      // Skip if product not found
                    }
                  }
                }
                setProductsForDelivery(productsToDeliver)
                setTradeForDelivery(selectedTrade)
                setDeliveryRequestModalOpen(true)
              } catch (error) {
                console.error('Failed to fetch products for delivery:', error)
              }
            }
          }}
          onDeclined={() => { refreshOffersData(); fetchTradeHistory(); fetchNotificationCounts() }}
        />

        <ViewTradeModal
          trade={selectedTrade}
          isOpen={viewTradeModalOpen}
          onClose={() => setViewTradeModalOpen(false)}
          onStatusUpdate={() => { refreshOffersData(); fetchTradeHistory(); fetchNotificationCounts() }}
          onTradeUpdate={setSelectedTrade}
        />

        <TradeCompletionModal
          trade={selectedTrade}
          isOpen={completionModalOpen}
          onClose={() => setCompletionModalOpen(false)}
          onCompleted={() => { refreshOffersData(); fetchTradeHistory(); fetchNotificationCounts() }}
          currentUserId={user?.id}
        />

        {/* Delivery Request Modal */}
        <DeliveryRequestModal
          isOpen={deliveryRequestModalOpen}
          onClose={() => {
            setDeliveryRequestModalOpen(false)
            setTradeForDelivery(null)
            setProductsForDelivery([])
          }}
          onSuccess={(deliveryId) => {
            setCurrentDeliveryId(deliveryId)
            setDeliveryRequestModalOpen(false)
            setDeliveryTrackingModalOpen(true)
          }}
          tradeId={tradeForDelivery?.id}
          products={productsForDelivery}
        />

        {/* Delivery Tracking Modal */}
        {currentDeliveryId && (
          <DeliveryTracking
            isOpen={deliveryTrackingModalOpen}
            onClose={() => {
              setDeliveryTrackingModalOpen(false)
              setCurrentDeliveryId(null)
            }}
            deliveryId={currentDeliveryId}
          />
        )}

        {/* Cancel Confirmation Modal */}
        <Modal isOpen={cancelModalOpen} onClose={() => setCancelModalOpen(false)} size="sm" isCentered>
          <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
          <ModalContent
            bg="white"
            borderRadius="xl"
            boxShadow="xl"
            mx={4}
          >
            <ModalCloseButton />
            <ModalBody p={6} textAlign="center">
              <VStack spacing={4}>
                <Icon as={FaTimes} color="red.500" boxSize={8} />
                <VStack spacing={2}>
                  <Text fontWeight="bold" fontSize="lg" color="gray.800">
                    Cancel Offer
                  </Text>
                  <Text fontSize="sm" color="gray.600" textAlign="center">
                    Are you sure you want to cancel this offer? This action cannot be undone.
                  </Text>
                  {tradeToCancel && (
                    <Text fontSize="xs" color="gray.500" mt={2}>
                      Product: {getProductTitle(tradeToCancel.target_product_id, tradeToCancel.product_title)}
                    </Text>
                  )}
                </VStack>
                
                <HStack spacing={3} w="full">
                  <Button
                    variant="outline"
                    size="md"
                    flex={1}
                    onClick={() => setCancelModalOpen(false)}
                  >
                    Keep Offer
                  </Button>
                  <Button
                    colorScheme="red"
                    size="md"
                    flex={1}
                    onClick={handleConfirmCancel}
                    leftIcon={<Icon as={FaTimes} />}
                  >
                    Cancel Offer
                  </Button>
                </HStack>
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Decline Confirmation Modal */}
        <Modal isOpen={declineModalOpen} onClose={() => setDeclineModalOpen(false)} size="md" isCentered>
          <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
          <ModalContent
            bg="white"
            borderRadius="xl"
            boxShadow="xl"
            mx={4}
          >
            <ModalCloseButton />
            <ModalBody p={6}>
              <VStack spacing={4} align="stretch">
                <VStack spacing={2} textAlign="center">
                  <Icon as={FaTimes} color="red.500" boxSize={6} />
                  <Text fontWeight="bold" fontSize="lg" color="gray.800">
                    Decline Offer
                  </Text>
                  <Text fontSize="sm" color="gray.600" textAlign="center">
                    Are you sure you want to decline this offer?
                  </Text>
                  {tradeToDecline && (
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      Product: {getProductTitle(tradeToDecline.target_product_id, tradeToDecline.product_title)}
                    </Text>
                  )}
                </VStack>
                
                <VStack spacing={3} align="stretch">
                  <Text fontSize="sm" color="gray.600" fontWeight="medium">
                    Feedback (Optional)
                  </Text>
                  <Textarea
                    value={declineFeedback}
                    onChange={(e) => setDeclineFeedback(e.target.value)}
                    placeholder="Provide a reason for declining this offer (optional)..."
                    resize="none"
                    rows={3}
                    fontSize="sm"
                    _focus={{
                      borderColor: "red.300",
                      boxShadow: "0 0 0 1px rgba(245, 101, 101, 0.3)"
                    }}
                  />
                  <Text fontSize="xs" color="gray.500">
                    This feedback will be shared with the offer sender
                  </Text>
                </VStack>
                
                <HStack spacing={3} w="full">
                  <Button
                    variant="outline"
                    size="md"
                    flex={1}
                    onClick={() => setDeclineModalOpen(false)}
                  >
                    Keep Offer
                  </Button>
                  <Button
                    colorScheme="red"
                    size="md"
                    flex={1}
                    onClick={handleConfirmDecline}
                    leftIcon={<Icon as={FaTimes} />}
                  >
                    Decline Offer
                  </Button>
                </HStack>
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Notifications are handled on their own page at /notifications */}
      </VStack>
    </Container>

    <FloatingTab />
    </Box>
  )
}

export default Dashboard

