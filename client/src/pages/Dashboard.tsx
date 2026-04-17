import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
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
  Textarea,
  Link,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  ScaleFade,
  Fade,
  Tooltip,
  useColorModeValue,
  useBreakpointValue,
  Checkbox,
  Skeleton,
} from '@chakra-ui/react'
import { AddIcon, EditIcon, DeleteIcon, SettingsIcon, WarningIcon, ChevronLeftIcon, ChevronRightIcon, CheckIcon, CloseIcon, SearchIcon, ViewIcon, StarIcon } from '@chakra-ui/icons'
import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { useRealtime } from '../contexts/RealtimeContext'
import { Product, Order, Trade, TradeAction, TradeItem } from '../types'
import FloatingTab from '../components/FloatingTab'
import { api } from '../services/api'
import { FaCrown, FaHandshake, FaTimes, FaCheckCircle, FaClock, FaHistory, FaShoppingBag, FaExchangeAlt, FaComments, FaMapMarkerAlt, FaTruck, FaMoneyBillWave, FaArrowUp, FaRegLightbulb, FaRocket } from 'react-icons/fa'
import { FiShoppingBag, FiRefreshCw, FiMessageCircle, FiGrid, FiList, FiSend, FiInbox, FiArchive, FiSliders } from 'react-icons/fi'
import { formatPHP } from '../utils/currency'
import { getFirstImage } from '../utils/imageUtils'
import { PRODUCT_CATEGORIES } from '../utils/categories'
import VerifiedAvatar from '../components/VerifiedAvatar'
import OfferDetailsModal from '../components/OfferDetailsModal'
import ImageZoomModal from '../components/ImageZoomModal'
import TradeCompletionModal from '../components/TradeCompletionModal'
import ViewTradeModal from '../components/ViewTradeModal'
import DeliveryRequestModal from '../components/DeliveryRequestModal'
import { SuggestedTradesModal } from '../components/SuggestedTradesModal'
import TradeModal from '../components/TradeModal'
import DeliveryTracking from '../components/DeliveryTracking'
import MultiWayTradeUI from '../components/MultiWayTradeUI'
import MultiWayTradeModal from '../components/MultiWayTradeModal'
import DisputeReportModal from '../components/DisputeReportModal'
import { fetchMultiWayTrade, fetchLoopQuota, hopIntoMultiwayChain } from '../services/tradeService'
import {
  useDashboardProducts,
  useDashboardOrders,
  useDashboardCounts,
  useSentOffers,
  useReceivedOffers,
  useOngoingTrades,
  useArchivedTrades,
  useTradeHistory,
  usePrefetchDashboard,
  useInvalidateDashboard,
} from '../hooks/useDashboard'

const Dashboard: React.FC = () => {
  const { user, loading, isAuthenticated, restoreAuthentication } = useAuth()
  const { deleteProduct, updateProduct } = useProducts()
  const { refreshCounts, setRefreshCallback } = useRealtime()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Use React Query hooks for cached data
  const { data: userProducts = [], isLoading: productsLoading, isFetched: productsFetched } = useDashboardProducts(user?.id)
  const actualUserProducts = Array.isArray(userProducts) ? userProducts : []
  const { data: orders = [], isFetched: ordersFetched } = useDashboardOrders()
  const { data: counts = { unread_notifications: 0, pending_offers: 0 }, isFetched: countsFetched } = useDashboardCounts()
  const { data: sentOffersData = [], isFetched: sentFetched } = useSentOffers()
  const { data: receivedOffersData = [], isFetched: receivedFetched } = useReceivedOffers()
  const { data: ongoingTradesData = [], isFetched: ongoingFetched } = useOngoingTrades()
  const { data: archivedTradesData = [] } = useArchivedTrades()
  const { data: tradeHistoryData = [], isFetched: historyFetched } = useTradeHistory()

  // Unified initial loading: true until all critical queries have fetched at least once
  // Once set to false, stays false (via ref) so background refetches never re-trigger loading
  const hasInitiallyLoaded = useRef(false)
  const allFetched = productsFetched && countsFetched && sentFetched && receivedFetched && ongoingFetched
  if (allFetched) hasInitiallyLoaded.current = true
  const initialLoading = !hasInitiallyLoaded.current && !allFetched

  const { prefetchDashboardData } = usePrefetchDashboard(user?.id)
  const { invalidateDashboard, invalidateProducts, invalidateOffers } = useInvalidateDashboard()

  // Derived state from cached data
  const inventoryProducts = useMemo(
    () => actualUserProducts.filter(p => p.status !== 'traded' && p.status !== 'sold'),
    [actualUserProducts]
  )
  const hasListedProducts = actualUserProducts.length > 0

  // Buyout offers - filter from receivedOffers where items are empty and cash is present
  const buyoutOffers = useMemo(() => {
    return (receivedOffersData || []).filter(t =>
      (!t.items || t.items.length === 0) &&
      (t.offered_cash_amount && t.offered_cash_amount > 0) &&
      (t.status === 'pending' || t.status === 'countered')
    )
  }, [receivedOffersData])

  // Combined loading states
  const offersLoading = !sentOffersData && !receivedOffersData && !ongoingTradesData

  // Initialize from URL ?tab= param immediately so the correct tab is active on first render
  const [activeTab, setActiveTab] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('tab')
    return p ? parseInt(p, 10) || 0 : 0
  })
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [boosting, setBoosting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [tradedCurrentPage, setTradedCurrentPage] = useState(1)
  const itemsPerPage = 12
  const [popupOpen, setPopupOpen] = useState(false)
  const [popupConfig, setPopupConfig] = useState<any>(null)
  // Notification counts from cached data
  const unreadNotifications = counts?.unread_notifications || 0
  const unreadOffers = counts?.pending_offers || 0
  const toast = useToast()

  // Product filters
  const [productFilter, setProductFilter] = useState<'all' | 'available' | 'locked'>('all')
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('all')
  const [productSearch, setProductSearch] = useState('')
  const [productSort, setProductSort] = useState<'newest' | 'oldest'>('newest')
  const [productViewMode, setProductViewMode] = useState<'grid' | 'list'>('list')
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set())

  // Unified search - searches across all content
  const [unifiedSearch, setUnifiedSearch] = useState('')
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false)
  // notifications state (handled on /notifications page)
  // dev helper: when true, show multiple pages for testing even if there are no notifications
  const DEV_SHOW_PAGES_ALWAYS = true

  // Offers data from React Query hooks (replacing local state)
  const incoming = receivedOffersData // received offers
  const outgoing = sentOffersData // sent offers
  const tradeHistory = tradeHistoryData

  // Loading states from React Query
  const sentLoading = false // React Query handles this internally
  const receivedLoading = false
  const ongoingLoading = false
  const tradeHistoryLoading = false
  const [offersSort, setOffersSort] = useState<'newest' | 'oldest'>('newest')
  const [offersSubTab, setOffersSubTab] = useState(2) // 0: Buyout, 1: Sent, 2: Received, 3: Ongoing, 4: Archive
  const [offersPage, setOffersPage] = useState(1)
  const [offersSearch, setOffersSearch] = useState('')
  const [offersStatusFilter, setOffersStatusFilter] = useState<string>('all')
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [viewTradeModalOpen, setViewTradeModalOpen] = useState(false)
  const [disputeReportModalOpen, setDisputeReportModalOpen] = useState(false)
  const [tradeToDispute, setTradeToDispute] = useState<Trade | null>(null)
  const [completionModalOpen, setCompletionModalOpen] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [tradeToCancel, setTradeToCancel] = useState<Trade | null>(null)
  const [declineModalOpen, setDeclineModalOpen] = useState(false)
  const [tradeToDecline, setTradeToDecline] = useState<Trade | null>(null)
  const [declineFeedback, setDeclineFeedback] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processModalOpen, setProcessModalOpen] = useState(false)
  const [productTitles, setProductTitles] = useState<Map<number, string>>(new Map())
  const productImageCache = useRef<Map<number, string | null>>(new Map())
  const notificationCountsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const multiwayAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const multiwayAlertCountRef = useRef(0)
  const activeTabRef = useRef(0)

  // Delivery modals state
  const [deliveryRequestModalOpen, setDeliveryRequestModalOpen] = useState(false)
  const [deliveryTrackingModalOpen, setDeliveryTrackingModalOpen] = useState(false)
  const [tradeForDelivery, setTradeForDelivery] = useState<Trade | null>(null)
  const [productsForDelivery, setProductsForDelivery] = useState<Product[]>([])
  const [currentDeliveryId, setCurrentDeliveryId] = useState<number | null>(null)

  // Multi-way trade state
  const [multiWayTrades, setMultiWayTrades] = useState<any[]>([])
  const [multiWayTradesLoading, setMultiWayTradesLoading] = useState(false)
  const [discoverableLoops, setDiscoverableLoops] = useState<any[]>([])
  const [discoverableLoading, setDiscoverableLoading] = useState(false)
  const [hoppingInto, setHoppingInto] = useState<string | null>(null)
  const [selectedMultiWayTrade, setSelectedMultiWayTrade] = useState<any>(null)
  const [multiWayTradeJoining, setMultiWayTradeJoining] = useState(false)
  const [showPremiumModal, setShowPremiumModal] = useState(false)
  const [multiWayManagerOpen, setMultiWayManagerOpen] = useState(false)
  const [multiWayManagerLoading, setMultiWayManagerLoading] = useState(false)
  const [loopQuota, setLoopQuota] = useState<null | { unlimited: boolean; period: string; used: number; limit: number }>(null)
  const prevMultiWayLoopIds = useRef<Set<string>>(new Set())
  const multiWayTradeDetailsCache = useRef<Map<string, { data: any; fetchedAt: number }>>(new Map())
  const preloadingPromises = useRef<Map<string, Promise<any>>>(new Map())

  const [isZoomOpen, setIsZoomOpen] = useState(false)
  const [zoomImageUrl, setZoomImageUrl] = useState('')
  const [zoomAltText, setZoomAltText] = useState('')

  // View mode states for different tabs
  const defaultOffersViewMode = useBreakpointValue({ base: 'list', md: 'grid' }) as 'grid' | 'list'
  const [offersViewMode, setOffersViewMode] = useState<'grid' | 'list'>('list')
  const [multiWayTradesViewMode, setMultiWayTradesViewMode] = useState<'grid' | 'list'>('grid')
  const [tradeHistoryViewMode, setTradeHistoryViewMode] = useState<'grid' | 'list'>('list')

  // Color mode values
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  // Set offers view mode based on screen size
  useEffect(() => {
    if (defaultOffersViewMode) {
      setOffersViewMode(defaultOffersViewMode)
    }
  }, [defaultOffersViewMode])

  // Set products view mode based on screen size
  const defaultProductViewMode = useBreakpointValue({ base: 'list', md: 'grid' }) as 'grid' | 'list'
  useEffect(() => {
    if (defaultProductViewMode) {
      setProductViewMode(defaultProductViewMode)
    }
  }, [defaultProductViewMode])

  useEffect(() => {
    const handleScroll = () => {
      setIsHeaderScrolled(window.scrollY > 6)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (user && user?.id) {
      prefetchDashboardData()
    }
  }, [user?.id, prefetchDashboardData])

  useEffect(() => {
    if (!loading && isAuthenticated && user && !user.is_premium) {
      const hasShown = sessionStorage.getItem('clovia_premium_up_shown')
      if (!hasShown) {
        // Delay slightly for better UX after dashboard load
        const timer = setTimeout(() => {
          setShowPremiumModal(true)
          sessionStorage.setItem('clovia_premium_up_shown', 'true')
        }, 3000)
        return () => clearTimeout(timer)
      }
    }
  }, [isAuthenticated, user, loading])

  // Check if user is authenticated, redirect to login if not
  // Only redirect if not loading (to prevent race conditions after login)
  useEffect(() => {
    if (loading || isAuthenticated) return

    const storedToken = localStorage.getItem('clovia_token')
    if (storedToken) {
      // Token exists but AuthContext may still be restoring user/profile.
      // Avoid bouncing back to /login; attempt restore once and wait.
      restoreAuthentication().catch(() => { })
      return
    }

    console.log('Dashboard: Not authenticated, redirecting to login')
    navigate('/login', { replace: true })
  }, [isAuthenticated, loading, navigate, restoreAuthentication])

  // Fetch multi-way trades when tab is selected
  useEffect(() => {
    if (user && (activeTab === 1 || activeTab === 2 || activeTab === 3)) {
      fetchMultiWayTrades()
      if (activeTab === 3) fetchDiscoverableLoops()
    }
  }, [user, activeTab])

  // Clear summary cache when multiWayTrades updates to prevent stale data
  useEffect(() => {
    summaryCache.current.clear()
  }, [multiWayTrades])

  // Change tab based on URL param
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam) {
      const tabIndex = parseInt(tabParam, 10)
      if (!isNaN(tabIndex)) {
        setActiveTab(tabIndex)
      }
    }
  }, [searchParams])

  // Handle return from Xendit payment redirect
  useEffect(() => {
    const tradeIdParam = searchParams.get('trade_id')
    const paymentStatus = searchParams.get('payment')
    const xenditExternalIDParam = searchParams.get('xendit_external_id')
    if (!tradeIdParam) return

    const tradeId = parseInt(tradeIdParam, 10)
    if (isNaN(tradeId)) return

    const storedExternalID = sessionStorage.getItem(`xendit_external_id_trade_${tradeId}`)
    const xenditExternalID = xenditExternalIDParam || storedExternalID || undefined

    ;(async () => {
      const toastKey = `xendit_return_toast_${tradeId}`
      if (paymentStatus === 'failed') {
        if (!sessionStorage.getItem(toastKey)) {
          sessionStorage.setItem(toastKey, '1')
          toast({
            title: 'Payment Failed',
            description: 'Your payment was not completed. Please try again.',
            status: 'error',
            duration: 5000,
          })
        }
      } else {
        if (!sessionStorage.getItem(toastKey)) {
          sessionStorage.setItem(toastKey, '1')
          toast({
            title: 'Payment Successful!',
            description: 'Syncing payment status... this can take a few seconds.',
            status: 'success',
            duration: 5000,
          })
        }

        // Fallback sync for localhost/dev (webhooks can�t reach localhost)
        // Payment status can take a moment to finalize, so retry a few times.
        try {
          for (let i = 0; i < 5; i++) {
            let r
            try {
              r = await api.post(`/api/payments/trade/${tradeId}/sync`, {
                external_id: xenditExternalID,
              })
            } catch (err: any) {
              if (err?.response?.status === 405) {
                r = await api.get(`/api/payments/trade/${tradeId}/sync`, {
                  params: { external_id: xenditExternalID },
                })
              } else {
                throw err
              }
            }
            if (r.data?.data?.paid) break
            await new Promise(res => setTimeout(res, 1500))
          }
        } catch (_) {
          // Best-effort; we�ll still fetch the trade below
        }
      }

      // Handle tab parameter
      const tabParam = searchParams.get('tab')
      if (tabParam) {
        const tabIndex = parseInt(tabParam, 10)
        if (!isNaN(tabIndex)) {
          setActiveTab(tabIndex)
        }
      }

      // Switch to the Offers tab (tab index 1)
      setActiveTab(1)

      // Fetch the trade fresh (so payment_confirmed updates immediately)
      try {
        const res = await api.get(`/api/trades/${tradeId}`)
        const tradeData = res.data?.data
        if (tradeData) {
          setSelectedTrade(tradeData)
          setViewTradeModalOpen(true)
        }
      } catch (_) {
        // Fallback to local list
        const allTrades = [...ongoingTradesData, ...sentOffersData, ...receivedOffersData]
        const matchedTrade = allTrades.find(t => t.id === tradeId)
        if (matchedTrade) {
          setSelectedTrade(matchedTrade)
          setViewTradeModalOpen(true)
        }
      }

      // Clean up URL params
      navigate('/dashboard', { replace: true })
    })()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, ongoingTradesData, sentOffersData, receivedOffersData])

  // Computed dashboard stats - optimized to minimize recalculations
  const dashboardStats = useMemo(() => {
    const totalProducts = inventoryProducts.length
    const activeProducts = inventoryProducts.filter(p => p.status === 'available').length
    const activeTrades = (ongoingTradesData || []).length
    const newOffers = (incoming || []).length // All incoming trades are already filtered to pending
    const completedTrades = (tradeHistory || []).length
    return {
      totalProducts,
      activeProducts,
      activeTrades,
      newOffers,
      completedTrades
    }
  }, [inventoryProducts, incoming, ongoingTradesData, tradeHistory])

  // Get product title helper (needs to be defined before use)
  const getProductTitle = (productId: number, fallbackTitle?: string): string => {
    if (fallbackTitle) return fallbackTitle
    return productTitles.get(productId) || 'Unnamed Item'
  }

  const getTradeReceivedTitle = useCallback((trade: Trade): string => {
    if (trade.items && trade.items.length > 0) {
      return getProductTitle(Number(trade.items[0].product_id), trade.items[0].product_title)
    }
    if (trade.offered_cash_amount && trade.offered_cash_amount > 0) {
      return `Cash ${formatPHP(trade.offered_cash_amount)}`
    }
    return 'N/A'
  }, [getProductTitle])

  const getTradePartnerInfo = useCallback((trade: Trade) => {
    const isYouBuyer = trade.buyer_id === user?.id
    // Determine if this is a buyout (no items, only cash) vs regular trade
    const isBuyout = (!trade.items || trade.items.length === 0) && 
                     (trade.offered_cash_amount && trade.offered_cash_amount > 0)
    const role = isBuyout 
      ? (isYouBuyer ? 'Seller' : 'Buyer')
      : (isYouBuyer ? 'Trader 2' : 'Trader 1')
    return {
      name: isYouBuyer ? (trade.seller_name || 'Anonymous') : (trade.buyer_name || 'Anonymous'),
      role,
      direction: isYouBuyer ? 'You initiated this trade' : 'They initiated this trade',
    }
  }, [user?.id])

  const getTradeWhere = useCallback((trade: Trade): string => {
    if (trade.trade_option === 'delivery') {
      return trade.delivery_address || 'Delivery location not set'
    }
    if (trade.trade_option === 'meetup') {
      return trade.meetup_location || 'Meetup location not set'
    }
    return trade.meetup_location || trade.delivery_address || 'Location not set'
  }, [])

  const getTradeWhen = useCallback((trade: Trade) => {
    const source = trade.completed_at || trade.updated_at || trade.created_at
    const dt = new Date(source)
    if (Number.isNaN(dt.getTime())) {
      return { date: 'Date unavailable', time: '' }
    }
    return {
      date: dt.toLocaleDateString(),
      time: dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  }, [])

  // Unified search filter - applies to all content types
  const applyUnifiedSearch = useCallback((items: any[], searchTerm: string, type: 'product' | 'trade') => {
    if (!searchTerm.trim()) return items

    const searchLower = searchTerm.toLowerCase().trim()
    if (searchLower.length === 0) return items

    return items.filter((item: any) => {
      if (type === 'product') {
        const title = item.title?.toLowerCase() || ''
        const description = item.description?.toLowerCase() || ''
        const category = item.category?.toLowerCase() || ''
        const sellerName = item.seller_name?.toLowerCase() || ''
        return title.includes(searchLower) ||
          description.includes(searchLower) ||
          category.includes(searchLower) ||
          sellerName.includes(searchLower)
      } else {
        // For trades/offers - cache product title to avoid repeated calls
        const productTitle = getProductTitle(item.target_product_id, item.product_title).toLowerCase()
        const buyerName = (item.buyer_name || '').toLowerCase()
        const sellerName = (item.seller_name || '').toLowerCase()
        return productTitle.includes(searchLower) ||
          buyerName.includes(searchLower) ||
          sellerName.includes(searchLower)
      }
    })
  }, [getProductTitle])

  // Filtered products - optimized with better memoization
  const filteredProducts = useMemo(() => {
    let filtered = inventoryProducts

    // Status filter - optimize by avoiding unnecessary filtering
    if (productFilter === 'all') {
      // Hide locked products by default (they are in active trades)
      filtered = inventoryProducts.filter(p => p.status !== 'locked')
    } else {
      filtered = inventoryProducts.filter(p => p.status === productFilter)
    }

    // Category filter
    if (productCategoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === productCategoryFilter)
    }

    // Apply unified search (fallback to productSearch for backward compatibility)
    const searchTerm = unifiedSearch || productSearch
    if (searchTerm.trim()) {
      filtered = applyUnifiedSearch(filtered, searchTerm, 'product')
    }

    return filtered
  }, [inventoryProducts, productFilter, productCategoryFilter, unifiedSearch, productSearch, applyUnifiedSearch])

  // Debounced cache invalidation for notification counts
  const invalidateCountsDebounced = useCallback(() => {
    // Clear existing timeout
    if (notificationCountsTimeout.current) {
      clearTimeout(notificationCountsTimeout.current)
    }
    // Schedule cache invalidation with 500ms delay
    notificationCountsTimeout.current = setTimeout(() => {
      invalidateDashboard()
    }, 500)
  }, [invalidateDashboard])

  // Cache product images and titles when data changes
  useEffect(() => {
    if (sentOffersData.length > 0) {
      cacheProductImages(sentOffersData)
      fetchProductTitles(sentOffersData)
    }
  }, [sentOffersData])

  useEffect(() => {
    if (receivedOffersData.length > 0) {
      cacheProductImages(receivedOffersData)
      fetchProductTitles(receivedOffersData)
    }
  }, [receivedOffersData])

  useEffect(() => {
    if (ongoingTradesData.length > 0) {
      cacheProductImages(ongoingTradesData)
      fetchProductTitles(ongoingTradesData)
    }
  }, [ongoingTradesData])

  useEffect(() => {
    if (tradeHistoryData.length > 0) {
      cacheProductImages(tradeHistoryData)
      fetchProductTitles(tradeHistoryData)
    }
  }, [tradeHistoryData])

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

  // Trade history is now handled by React Query hook

  // Refresh offers data by invalidating cache (React Query will refetch automatically)
  const refreshOffersData = useCallback(() => {
    invalidateOffers()
  }, [invalidateOffers])

  // React Query automatically manages data fetching and caching
  // No need for manual loading state management

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
      } catch { }
    }
    return undefined
  }

  const resolveParticipantImage = (participant: any): string | undefined => {
    const resolved = resolveItemImage(participant)
    if (resolved) return resolved
    const pid = Number(participant?.product_id || 0)
    if (!pid) return undefined
    const cached = productImageCache.current.get(pid)
    return cached || undefined
  }

  const getMultiWayTradeSummary = useCallback((trade: any) => {
    const participants = Array.isArray(trade?.participants) ? trade.participants : []
    const edges = Array.isArray(trade?.edges) ? trade.edges : []
    const summaryText = typeof trade?.summary === 'string' ? trade.summary : ''
    const currentUserID = Number(user?.id || 0)

    const giveGetMatch = summaryText.match(/You give\s+(.*?),\s*you get\s+(.*?)(?:\.|$)/i)
    const summaryGive = giveGetMatch?.[1]?.trim()
    const summaryGet = giveGetMatch?.[2]?.trim()
    const summaryChain = summaryText.match(/Chain:\s*(.*)$/i)?.[1]?.trim()

    const participantIndex = participants.findIndex((p: any) => Number(p?.id) === currentUserID)
    const yourParticipant = participantIndex >= 0 ? participants[participantIndex] : null
    const nextParticipant = participantIndex >= 0 && participants.length > 0
      ? participants[(participantIndex + 1) % participants.length]
      : null

    const yourIncomingEdge = edges.find((e: any) => Number(e?.from_user) === currentUserID)
    const yourOutgoingEdge = edges.find((e: any) => Number(e?.to_user) === currentUserID)

    const yourGive =
      summaryGive ||
      yourOutgoingEdge?.product_title ||
      yourParticipant?.product_title ||
      'Your listed item'

    const yourGet =
      summaryGet ||
      yourIncomingEdge?.product_title ||
      nextParticipant?.product_title ||
      'Matched item from the loop'

    const chainLabel = summaryChain || (
      participants.length > 1
        ? `${participants.map((p: any) => p?.user_name || `User ${p?.id}`).join(' -> ')} -> ${participants[0]?.user_name || `User ${participants[0]?.id}`}`
        : 'Waiting for participant chain details'
    )

    return { yourGive, yourGet, chainLabel }
  }, [user?.id])

  // Cache summary results per trade ID to avoid recalculation
  const summaryCache = useRef<Map<string, any>>(new Map())
  const getSummary = useCallback((trade: any) => {
    const key = String(trade?.id || trade?.loop_id || trade?.chain_id || '')
    if (!summaryCache.current.has(key)) {
      summaryCache.current.set(key, getMultiWayTradeSummary(trade))
    }
    return summaryCache.current.get(key)
  }, [getMultiWayTradeSummary])

  // Memoize chain size computation
  const chainSizeCache = useRef<Map<string, number>>(new Map())
  const getChainSize = useCallback((trade: any) => {
    const key = String(trade?.id || trade?.loop_id || trade?.chain_id || '')
    if (!chainSizeCache.current.has(key)) {
      const participants = Array.isArray(trade?.participants) ? trade.participants.length : 0
      if (participants > 0) {
        chainSizeCache.current.set(key, participants)
        return participants
      }
      const edges = Array.isArray(trade?.edges) ? trade.edges.length : 0
      chainSizeCache.current.set(key, edges)
      return edges
    }
    return chainSizeCache.current.get(key) || 0
  }, [])

  const filteredMultiWayTrades = useMemo(() => {
    return (multiWayTrades || []).filter((trade: any) => {
      const size = getChainSize(trade)
      return size >= 3 && size <= 5
    })
  }, [multiWayTrades, getChainSize])

  const tradeMatchTrades = useMemo(() => {
    return (multiWayTrades || []).filter((trade: any) => getChainSize(trade) === 2)
  }, [multiWayTrades, getChainSize])

  // Group loops into "Needs Your Action" and "Waiting on Others"
  const groupedMultiWayTrades = useMemo(() => {
    const needsAction: any[] = []
    const waitingOnOthers: any[] = []
    const autoSearchResults: any[] = []
    
    for (const trade of filteredMultiWayTrades) {
      // Determine if user needs to take action
      const status = trade?.status || ''
      const canJoin = trade?.can_join === true
      const canDecline = trade?.can_decline === true

      if (status === 'pending' && (canJoin || canDecline)) {
        needsAction.push(trade)
      } else if (status === 'pending' && !canJoin && !canDecline) {
        waitingOnOthers.push(trade)
      } else if (status === 'confirmed') {
        continue
      }
    }
    
    return { needsAction, waitingOnOthers, autoSearchResults }
  }, [filteredMultiWayTrades])

  const groupedTradeMatchTrades = useMemo(() => {
    const needsAction: any[] = []
    const waitingOnOthers: any[] = []
    const autoSearchResults: any[] = []

    for (const trade of tradeMatchTrades) {
      const status = trade?.status || ''
      const canJoin = trade?.can_join === true
      const canDecline = trade?.can_decline === true

      if (status === 'pending' && (canJoin || canDecline)) {
        needsAction.push(trade)
      } else if (status === 'pending' && !canJoin && !canDecline) {
        waitingOnOthers.push(trade)
      } else if (status === 'confirmed') {
        continue
      }
    }

    return { needsAction, waitingOnOthers, autoSearchResults }
  }, [tradeMatchTrades])

  const multiWayIndicatorCount = groupedMultiWayTrades.needsAction.length + groupedMultiWayTrades.waitingOnOthers.length
  const tradeMatchIndicatorCount = groupedTradeMatchTrades.needsAction.length + groupedTradeMatchTrades.waitingOnOthers.length

  // Get loop details from cache or fetch
  const getOrFetchMultiWayLoopDetails = useCallback(async (loopId: string, cardData?: any) => {
    const cache = multiWayTradeDetailsCache.current
    const cacheKey = String(loopId)
    
    // Check if already cached and current
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)!
      const cacheAge = Date.now() - cached.fetchedAt
      const cardStatus = cardData?.status
      const cachedStatus = cached.data?.status
      
      // Use cache if less than 5 minutes old OR status hasn't changed
      if (cacheAge < 300000 || cardStatus === cachedStatus) {
        return cached.data
      }
    }
    
    // If already fetching, return the existing promise
    if (preloadingPromises.current.has(cacheKey)) {
      return preloadingPromises.current.get(cacheKey)
    }
    
    // Fetch and cache
    const fetchPromise = fetchMultiWayTrade(cacheKey)
      .then(data => {
        cache.set(cacheKey, { data, fetchedAt: Date.now() })
        preloadingPromises.current.delete(cacheKey)
        return data
      })
      .catch(err => {
        preloadingPromises.current.delete(cacheKey)
        throw err
      })
    
    preloadingPromises.current.set(cacheKey, fetchPromise)
    return fetchPromise
  }, [])

  // Memoized handler for viewing trade details
  const handleViewMultiWayTradeDetails = useCallback(async (trade: any) => {
    try {
      setMultiWayManagerLoading(true)
      const loopId = String(trade?.chain_id || trade?.loop_id || trade?.id || '')
      const details = await getOrFetchMultiWayLoopDetails(loopId, trade)
      setSelectedMultiWayTrade(details)
      setMultiWayManagerOpen(true)
    } catch (e) {
      console.error('Failed to load loop details:', e)
      toast({
        id: 'error-load-loop-details',
        title: 'Error',
        description: 'Failed to load trade loop details.',
        status: 'error',
      })
    } finally {
      setMultiWayManagerLoading(false)
    }
  }, [getOrFetchMultiWayLoopDetails, toast])

  const fetchMultiWayTrades = async () => {
    try {
      setMultiWayTradesLoading(true)
      const response = await api.get('/api/trades/loops', {
        params: { user_id: user?.id }
      })
      const newTrades = response.data?.data || []
      setMultiWayTrades(newTrades)
      
      // Preload details for all trades in background
      preloadMultiWayLoopDetails(newTrades)
      
      // Store new trade IDs for later comparison
      prevMultiWayLoopIds.current = new Set((newTrades || []).map((t: any) => String(t.loop_id || t.chain_id || t.id))) as Set<string>

      // Free tier monthly quota indicator (used for upsells + disabling where needed).
      try {
        const quota = await fetchLoopQuota()
        setLoopQuota(quota)
      } catch (quotaErr) {
        console.error('Failed to fetch loop quota:', quotaErr)
      }
    } catch (error: any) {
      console.error('Failed to fetch multi-way trades:', error)
      const msg = error?.response?.data?.error || 'Failed to load multi-way trades'
      toast({ id: 'error-load-multi-way-trades', title: 'Error', description: msg, status: 'error' })
      setMultiWayTrades([])
    } finally {
      setMultiWayTradesLoading(false)
    }
  }

  const fetchDiscoverableLoops = async () => {
    setDiscoverableLoading(true)
    setDiscoverableLoops([])
    setDiscoverableLoading(false)
  }

  // Preload all loop details in parallel
  const preloadMultiWayLoopDetails = useCallback(async (loops: any[]) => {
    if (!loops || loops.length === 0) return
    
    const loadsToFetch = loops.map(async (loop) => {
      const loopId = String(loop?.chain_id || loop?.loop_id || loop?.id || '')
      if (!loopId) return
      
      try {
        await getOrFetchMultiWayLoopDetails(loopId, loop)
      } catch (error) {
        console.error(`Failed to preload loop ${loopId}:`, error)
        // Non-critical - modal can still open with partial data
      }
    })
    
    // Don't wait for all - just start them in parallel
    Promise.allSettled(loadsToFetch).catch(() => {
      // Ignore errors from parallel preloading
    })
  }, [getOrFetchMultiWayLoopDetails])

  // Keep activeTabRef in sync so the multiwayAlert callback can read it without stale closures
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  // Notify about new visible loops (only those that actually appear in UI)
  useEffect(() => {
    const visibleLoops = [
      ...groupedMultiWayTrades.needsAction,
      ...groupedMultiWayTrades.waitingOnOthers,
      ...groupedTradeMatchTrades.needsAction,
      ...groupedTradeMatchTrades.waitingOnOthers,
    ]
    const visibleIds = new Set(visibleLoops.map((t: any) => String(t.loop_id || t.chain_id || t.id)))
    const prevIds = prevMultiWayLoopIds.current
    
    let newCount = 0
    for (const id of visibleIds) {
      if (!prevIds.has(id)) {
        newCount++
      }
    }
    
    if (newCount > 0) {
      toast({
        id: 'new-loops-batch',
        title: newCount > 1 ? 'Loops Found!' : 'New Trade Loop Found!',
        description: newCount > 1
          ? `You have ${newCount} new multi-way trade options available. Check below to review them.`
          : 'A new multi-way trade opportunity is available. Check the Multi-Way section to join.',
        status: 'info',
        duration: 6000,
        isClosable: true,
      })
    }
    
    prevMultiWayLoopIds.current = visibleIds
  }, [
    groupedMultiWayTrades.needsAction,
    groupedMultiWayTrades.waitingOnOthers,
    groupedTradeMatchTrades.needsAction,
    groupedTradeMatchTrades.waitingOnOthers,
    toast,
  ])

  // Register refresh callbacks for all tabs with RealtimeContext
  useEffect(() => {
    setRefreshCallback('products', () => {
      invalidateProducts()
    })
    setRefreshCallback('sentOffers', () => {
      invalidateOffers()
    })
    setRefreshCallback('receivedOffers', () => {
      invalidateOffers()
    })
    setRefreshCallback('ongoingTrades', () => {
      invalidateOffers()
    })
    setRefreshCallback('multiway', () => {
      fetchMultiWayTrades()
      fetchDiscoverableLoops()
      invalidateOffers()
    })
    setRefreshCallback('history', () => {
      invalidateDashboard()
    })
    setRefreshCallback('multiwayAlert', () => {
      multiwayAlertCountRef.current += 1
      if (multiwayAlertTimerRef.current) clearTimeout(multiwayAlertTimerRef.current)
      multiwayAlertTimerRef.current = setTimeout(() => {
        // Only show toast when user is on the Multi-Way or Trade Match tab
        if (activeTabRef.current !== 2 && activeTabRef.current !== 3) {
          multiwayAlertCountRef.current = 0
          return
        }
        const count = multiwayAlertCountRef.current
        multiwayAlertCountRef.current = 0
        toast({
          id: 'multiway-loop-alert',
          title: 'Multiway Loop Found!',
          description: count > 1
            ? 'You have a lot of options! Check the loops below.'
            : 'A new multiway trading opportunity is available.',
          status: 'success',
          duration: 5000,
          isClosable: true,
          position: 'top-right',
        })
      }, 1500)
    })
  }, [setRefreshCallback, invalidateProducts, invalidateOffers, invalidateDashboard, toast])

  const handleHopIntoDiscoverable = async (trade: any) => {
    const chainId = String(trade?.chain_id || '')
    const productId = trade?.you_give_id
    if (!chainId || !productId) {
      toast({ id: 'hop-in-missing', title: 'Error', description: 'Missing chain or product info', status: 'error' })
      return
    }
    try {
      setHoppingInto(chainId)
      await hopIntoMultiwayChain(chainId, productId)
      toast({
        id: `hop-in-success-${chainId}`,
        title: 'Request sent!',
        description: 'The participants will be notified. Check back to see if they accept.',
        status: 'success',
        duration: 5000,
      })
      // Optimistically remove from discoverable list, refresh in background
      setDiscoverableLoops(prev => prev.filter((l: any) => String(l?.chain_id) !== chainId))
      fetchDiscoverableLoops()
      fetchMultiWayTrades()
      invalidateOffers()
    } catch (error: any) {
      toast({
        id: `hop-in-error-${chainId}`,
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to join trade loop',
        status: 'error',
      })
    } finally {
      setHoppingInto(null)
    }
  }

  const handleJoinMultiWayTrade = async (trade: any) => {
    try {
      setMultiWayTradeJoining(true)
      const tradeIdString = String(trade?.chain_id || trade?.loop_id || trade?.id || '')
      console.log('[Dashboard] Hop In clicked', {
        tradeIdString,
        tradeChainId: trade?.chain_id,
        tradeLoopId: trade?.loop_id,
        tradeId: trade?.id,
        userId: user?.id,
      })
      
      if (!tradeIdString) {
        throw new Error('Invalid loop ID. Please refresh and try again.')
      }

      await api.post(`/api/trades/loops/${tradeIdString}/accept`, {
        user_id: user?.id,
      })
      
      toast({
        id: 'success-joined-trade-loop',
        title: 'Success',
        description: 'You joined the trade loop!',
        status: 'success',
        duration: 3000,
      })
      setSelectedMultiWayTrade(null)
      // Optimistically update the trade in-place, then refresh in background
      const joinedId = tradeIdString
      setMultiWayTrades(prev => prev.map(t => {
        const id = String(t?.chain_id || t?.loop_id || t?.id || '')
        if (id === joinedId) return { ...t, can_join: false, can_decline: false }
        return t
      }))
      fetchMultiWayTrades()
      invalidateOffers()
      invalidateProducts()
    } catch (error: any) {
      toast({
        id: 'error-join-trade',
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.message || 'Failed to join trade',
        status: 'error',
      })
    } finally {
      setMultiWayTradeJoining(false)
    }
  }

  const handleDeclineMultiWayTrade = async (trade: any, searchAgain: boolean = false) => {
    try {
      const tradeIdString = String(trade?.chain_id || trade?.loop_id || trade?.id || '')
      console.log('[Dashboard] Decline clicked', {
        tradeIdString,
        tradeChainId: trade?.chain_id,
        tradeLoopId: trade?.loop_id,
        tradeId: trade?.id,
        searchAgain,
        userId: user?.id,
      })

      if (!tradeIdString) {
        throw new Error('Invalid loop ID. Please refresh and try again.')
      }
      
      await api.post(`/api/trades/loops/${tradeIdString}/decline`, {
        reason: 'Not interested'
      })
      
      toast({
        id: 'declined',
        title: 'Declined',
        description: 'You declined this multi-way trade',
        status: 'info',
        duration: 2000,
      })
      setSelectedMultiWayTrade(null)
      // Optimistically remove declined trade from list, then refresh in background
      setMultiWayTrades(prev => prev.filter(t => {
        const id = String(t?.chain_id || t?.loop_id || t?.id || '')
        return id !== tradeIdString
      }))
      fetchMultiWayTrades()
      fetchDiscoverableLoops()
    } catch (error: any) {
      toast({
        id: 'error-decline-trade',
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.message || 'Failed to decline trade',
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
        h={isLarge ? "180px" : size}
        objectFit={isLarge ? "contain" : "cover"}
        borderRadius={isLarge ? "0" : "md"}
        loading="lazy"
        bg={isLarge ? "gray.100" : "transparent"}
        fallbackSrc={"/no-image.svg"}
      />
    )
  }

  const updateTrade = useCallback(async (id: number, action: TradeAction) => {
    try {
      await api.put(`/api/trades/${id}`, action)
      toast({ id: 'success-offer-updated', title: 'Success', description: 'Offer updated', status: 'success' })
      // Invalidate cache to refresh data
      invalidateOffers()
      invalidateDashboard()
    } catch (e: any) {
      toast({ id: 'error-update-offer', title: 'Error', description: e?.response?.data?.error || 'Failed to update offer', status: 'error' })
    }
  }, [invalidateOffers, invalidateDashboard])

  const handleCompleteTradeClick = useCallback((trade: Trade) => {
    // Check if meetup is confirmed before allowing completion
    const meetupConfirmed = trade.meetup_confirmed || (trade.buyer_meetup_confirmed && trade.seller_meetup_confirmed)

    if (!meetupConfirmed && (trade.status === 'accepted' || trade.status === 'active')) {
      toast({
        id: 'meetup-required',
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
  }, [toast])

  const handleCancelTradeClick = useCallback((trade: Trade) => {
    setTradeToCancel(trade)
    setCancelModalOpen(true)
  }, [])

  const handleConfirmCancel = async () => {
    if (!tradeToCancel) return

    setIsProcessing(true)
    setProcessModalOpen(true)
    setCancelModalOpen(false)

    try {
      await updateTrade(tradeToCancel.id, { action: 'cancel' })
      setTradeToCancel(null)
      setTimeout(() => {
        setProcessModalOpen(false)
        setIsProcessing(false)
        toast({
          id: 'success-offer-cancelled',
          title: 'Success',
          description: 'Offer cancelled successfully',
          status: 'success',
          duration: 3000
        })
      }, 1000)
    } catch (error: any) {
      setProcessModalOpen(false)
      setIsProcessing(false)
      toast({
        id: 'error-cancel-offer',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to cancel offer',
        status: 'error'
      })
    }
  }

  const handleDeclineTradeClick = useCallback((trade: Trade) => {
    setTradeToDecline(trade)
    setSelectedTrade(trade) // Keep both in sync for the two modals
    setDeclineFeedback('')
    setDeclineModalOpen(true)
  }, [])

  const handleConfirmDecline = async () => {
    if (!tradeToDecline) return

    setIsProcessing(true)
    setProcessModalOpen(true)
    setDeclineModalOpen(false)

    try {
      await updateTrade(tradeToDecline.id, {
        action: 'decline',
        message: declineFeedback.trim() || undefined
      })
      setTradeToDecline(null)
      setDeclineFeedback('')
      setTimeout(() => {
        setProcessModalOpen(false)
        setIsProcessing(false)
        toast({
          id: 'success-offer-declined',
          title: 'Success',
          description: 'Offer declined successfully',
          status: 'success',
          duration: 3000
        })
      }, 1000)
    } catch (error: any) {
      setProcessModalOpen(false)
      setIsProcessing(false)
      toast({
        id: 'error-decline-offer',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to decline offer',
        status: 'error'
      })
    }
  }

  const handleConvertToMultiWay = async () => {
    if (!tradeToDecline) {
      setDeclineModalOpen(false)
      return
    }

    setIsProcessing(true)
    setDeclineModalOpen(false)

    try {
      const response = await api.put(`/api/trades/${tradeToDecline.id}`, { action: 'convert_to_multiway' })
      const matched = response.data?.data?.matched === true

      setTradeToDecline(null)
      setDeclineFeedback('')
      invalidateOffers()

      if (matched) {
        toast({
          id: 'success-convert-multiway',
          title: 'Loop Found!',
          description: 'A 3-way trade loop was found! Check the Multi-Way tab to review and accept.',
          status: 'success',
          duration: 6000
        })
      } else {
        toast({
          id: 'success-convert-multiway',
          title: 'Searching for Loops',
          description: "No match yet, but we're now actively searching for a 3-way trade loop for you.",
          status: 'info',
          duration: 5000
        })
      }

      // Switch to Multi-Way tab and always refresh multiway data
      setActiveTab(3)
      fetchMultiWayTrades()
      setIsProcessing(false)
    } catch (error: any) {
      setIsProcessing(false)

      const errorMsg = error?.response?.data?.error || 'Failed to convert to multi-way'

      // Soft upsell for non-premium users creating loops.
      if (errorMsg.includes('premium') || error?.response?.status === 403) {
        toast({
          id: 'error-convert-multiway-premium',
          title: 'Pro members can initiate',
          description: "You're a great match to start a loop here. Pro members can initiate. Upgrade to unlock.",
          status: 'warning',
          duration: 5000
        })
      } else {
        toast({
          id: 'error-convert-multiway',
          title: 'Error',
          description: errorMsg,
          status: 'error'
        })
      }
    }
  }

  const historyStatuses = ['declined', 'cancelled', 'completed', 'auto_completed', 'expired']

  // Computed stats for offers (excluding completed - those go to Trade History)
  const offersStats = useMemo(() => {
    const buyout = (buyoutOffers || []).length
    const sentPending = (outgoing || []).filter(t => t.status === 'pending' || t.status === 'pending_multiway').length
    const receivedPending = (incoming || []).filter(t => (t.status === 'pending' || t.status === 'pending_multiway') && (!t.items || t.items.length > 0 || !t.offered_cash_amount)).length // Exclude cash-only
    const ongoingMultiway = (multiWayTrades || []).filter((t: any) =>
      t?.status === 'pending_user3' || t?.status === 'user3_accepted' || t?.status === 'multiway_active'
    ).length
    
    // Deduplicate: status='multiway_active' trades are present in both ongoingTradesData and multiWayTrades
    const standardActiveCount = (ongoingTradesData || []).filter(t => t.status !== 'multiway_active').length
    const ongoing = standardActiveCount + ongoingMultiway;
    return {
      buyout,
      sentPending,
      receivedPending,
      ongoing,
      totalPending: sentPending + receivedPending + buyout
    }
  }, [buyoutOffers, incoming, outgoing, ongoingTradesData, multiWayTrades])

  // Completed trades count for Trade History tab
  const completedTradesCount = useMemo(() => {
    return tradeHistory.length
  }, [tradeHistory])

  // Filter and search logic - optimized to avoid unnecessary operations
  const filterTrades = useCallback((trades: Trade[], searchTerm: string, statusFilter: string) => {
    let filtered = trades

    // Use unified search if available, otherwise use provided searchTerm
    const effectiveSearch = unifiedSearch || searchTerm

    // Search filter - only if there's a search term
    if (effectiveSearch?.trim()) {
      filtered = applyUnifiedSearch(filtered, effectiveSearch, 'trade')
    }

    // Status filter - only if not 'all'
    if (statusFilter !== 'all') {
      filtered = filtered.filter(trade => trade.status === statusFilter)
    }

    return filtered
  }, [unifiedSearch, applyUnifiedSearch])

  // Get trades for each sub-tab (excluding completed - those go to Trade History)
  // Optimized to only sort when rendering, not during filter
  const buyoutOffersTab = useMemo(() => {
    const filtered = filterTrades(buyoutOffers, offersSearch, offersStatusFilter)
    // Sort inline to avoid extra function call
    if (filtered.length > 1) {
      filtered.sort((a, b) => {
        const at = new Date(a.created_at).getTime()
        const bt = new Date(b.created_at).getTime()
        return offersSort === 'newest' ? bt - at : at - bt
      })
    }
    return filtered
  }, [buyoutOffers, offersSearch, offersStatusFilter, offersSort, filterTrades])

  const sentOffers = useMemo(() => {
    const active = (outgoing || []).filter(t => t.status === 'pending' || t.status === 'pending_multiway') // Include multiway matches
    const filtered = filterTrades(active, offersSearch, offersStatusFilter)
    // Sort inline to avoid extra function call
    if (filtered.length > 1) {
      filtered.sort((a, b) => {
        const at = new Date(a.created_at).getTime()
        const bt = new Date(b.created_at).getTime()
        return offersSort === 'newest' ? bt - at : at - bt
      })
    }
    return filtered
  }, [outgoing, offersSearch, offersStatusFilter, offersSort, filterTrades])

  const handleViewDetails = useCallback((trade: Trade) => {
    setSelectedTrade(trade)
    setDetailsOpen(true)
  }, [])

  const handleViewOngoingTrade = useCallback(async (trade: Trade) => {
    let freshTrade: Trade | undefined
    try {
      const res = await api.get(`/api/trades/${trade.id}`)
      freshTrade = res.data?.data
    } catch {
      // Non-fatal: fall back to existing trade object
    }

    setSelectedTrade(freshTrade || trade)
    setDetailsOpen(false)
    setViewTradeModalOpen(true)
  }, [])

  const handleAcceptTrade = useCallback(async (trade: Trade) => {
    try {
      // Accept the offer, then open Trade Details for both parties
      await updateTrade(trade.id, { action: 'accept' })

      let freshTrade: Trade | undefined
      try {
        const res = await api.get(`/api/trades/${trade.id}`)
        freshTrade = res.data?.data
      } catch {
        // Non-fatal: fall back to existing trade object
      }

      setSelectedTrade(freshTrade || trade)
      setCompletionModalOpen(false)
      setViewTradeModalOpen(true)
    } catch {
      // updateTrade already toasts on error
    }
  }, [updateTrade])

  const receivedOffers = useMemo(() => {
    const active = (incoming || []).filter(t => t.status === 'pending' || t.status === 'pending_multiway') // Include multiway matches
    const filtered = filterTrades(active, offersSearch, offersStatusFilter)
    // Sort inline to avoid extra function call
    if (filtered.length > 1) {
      filtered.sort((a, b) => {
        const at = new Date(a.created_at).getTime()
        const bt = new Date(b.created_at).getTime()
        return offersSort === 'newest' ? bt - at : at - bt
      })
    }
    return filtered
  }, [incoming, offersSearch, offersStatusFilter, offersSort, filterTrades])

  const pendingMultiWayTrades = useMemo(() => {
    const sent = (outgoing || []).filter(t => t.status === 'pending_multiway')
    const received = (incoming || []).filter(t => t.status === 'pending_multiway')
    const all = [...sent, ...received]
    // Deduplicate by target_product_id � same product may appear in multiple chains
    const unique = Array.from(new Map(all.map(t => [t.target_product_id, t])).values())
    
    // Exclude trades that already have an accepted/active multiway chain
    const acceptedChainTradeIds = new Set(
      (multiWayTrades || [])
        .filter((mt: any) => ['user3_accepted', 'active', 'multiway_active'].includes(mt?.status))
        .flatMap((mt: any) => {
          const participants = mt?.participants || []
          return participants.map((p: any) => p?.trade_id).filter(Boolean)
        })
    )
    // Also check by chain_id pattern: chain_{tradeID}_...
    const acceptedOriginalTradeIds = new Set(
      (multiWayTrades || [])
        .filter((mt: any) => ['user3_accepted', 'active', 'multiway_active'].includes(mt?.status))
        .map((mt: any) => {
          const cid = String(mt?.chain_id || '')
          const parts = cid.split('_')
          return parts.length >= 2 ? Number(parts[1]) : 0
        })
        .filter((id: number) => id > 0)
    )
    
    // FIX: Collect product IDs that are already involved in active/pending trades
    // These products should NOT appear in multiway suggestions
    const productsInActiveTrades = new Set<number>()
    const activeTradeStatuses = ['pending', 'pending_multiway', 'accepted', 'active', 'multiway_active']
    
    // Get target products from active trades
    ;[...sentOffers, ...receivedOffers, ...(ongoingTradesData || [])].forEach((t: Trade) => {
      if (activeTradeStatuses.includes(t.status)) {
        productsInActiveTrades.add(t.target_product_id)
        // Also add offered product IDs
        if (t.items && Array.isArray(t.items)) {
          t.items.forEach((item: TradeItem) => {
            productsInActiveTrades.add(item.product_id)
          })
        }
      }
    })
    
    return unique.filter(t => 
      !acceptedChainTradeIds.has(t.id) && 
      !acceptedOriginalTradeIds.has(t.id) &&
      !productsInActiveTrades.has(t.target_product_id)
    )
  }, [outgoing, incoming, multiWayTrades, sentOffers, receivedOffers, ongoingTradesData])

  const ongoingTrades = useMemo(() => {
    // Filter out multiway_active trades AND any trade that also appears in multiWayTrades
    // (trades with 'active' status can exist in both sources, causing duplication)
    const multiWayIds = new Set((multiWayTrades || []).map((t: any) => t.id).filter(Boolean))
    const standardOnly = (ongoingTradesData || []).filter(t =>
      t.status !== 'multiway_active' && !multiWayIds.has(t.id)
    )
    const filtered = filterTrades(standardOnly, offersSearch, offersStatusFilter)
    // Sort inline to avoid extra function call
    if (filtered.length > 1) {
      filtered.sort((a, b) => {
        const at = new Date(a.created_at).getTime()
        const bt = new Date(b.created_at).getTime()
        return offersSort === 'newest' ? bt - at : at - bt
      })
    }
    return filtered
  }, [ongoingTradesData, multiWayTrades, offersSearch, offersStatusFilter, offersSort, filterTrades])

  // Accepted multiway trades that should appear in the ongoing trades section
  // ONLY show trades when ALL participants have accepted (status='active' or 'multiway_active')
  // Do NOT show 'user3_accepted' status - that means only User 3 has responded
  const ongoingMultiWayTrades = useMemo(() => {
    return (multiWayTrades || []).filter((t: any) =>
      t?.status === 'pending_user3' || t?.status === 'user3_accepted' || t?.status === 'active' || t?.status === 'multiway_active' || t?.status === 'confirmed'
    )
  }, [multiWayTrades])

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
      case 0: return buyoutOffersTab
      case 1: return sentOffers
      case 2: return receivedOffers
      case 3: return ongoingTrades
      default: return []
    }
  }, [offersSubTab, buyoutOffersTab, sentOffers, receivedOffers, ongoingTrades])
  const offersPerPage = 9
  const totalPages = Math.ceil(currentTabTrades.length / offersPerPage)
  const paginatedTrades = useMemo(() => {
    const start = (offersPage - 1) * offersPerPage
    return currentTabTrades.slice(start, start + offersPerPage)
  }, [currentTabTrades, offersPage])

  const handleImageZoom = (e: React.MouseEvent, url: string, alt: string) => {
    e.stopPropagation()
    setZoomImageUrl(url)
    setZoomAltText(alt)
    setIsZoomOpen(true)
  }

  const badgeColor = (status: Trade['status']) => {
    const statusMap: Record<string, { color: string; icon: string }> = {
      'pending': { color: 'yellow', icon: '??' },
      'pending_multiway': { color: 'purple', icon: '??' },
      'accepted': { color: 'green', icon: '?' },
      'declined': { color: 'red', icon: '?' },
      'cancelled': { color: 'gray', icon: '?' },
      'countered': { color: 'purple', icon: '??' },
      'expired': { color: 'gray', icon: '?' },
      'completed': { color: 'green', icon: '?' },
      'active': { color: 'blue', icon: '??' }
    }
    return statusMap[status.toLowerCase()] || { color: 'gray', icon: '�' }
  }

  const getStatusBadge = (status: Trade['status']) => {
    const { color, icon } = badgeColor(status)
    let statusText = status.charAt(0).toUpperCase() + status.slice(1)
    if (status === 'pending_multiway') statusText = 'Multiway Match'
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

  const [findTradesProduct, setFindTradesProduct] = useState<Product | null>(null)
  const [isFindTradesOpen, setIsFindTradesOpen] = useState(false)

  const handleFindTradesClick = (product: Product) => {
    setFindTradesProduct(product)
    setIsFindTradesOpen(true)
  }

  const [isTradeModalOpen, setTradeModalOpen] = useState(false)
  const [tradeTargetProductId, setTradeTargetProductId] = useState<number | null>(null)

  const handleTradeClick = (targetProduct: Product) => {
    setTradeTargetProductId(targetProduct.id)
    setTradeModalOpen(true)
  }

  const handleBoostProductClick = async (product: Product) => {
    // Check if user is premium
    if (!user?.is_premium || user?.premium_tier === 'free') {
      showPopup({
        type: 'warning',
        title: '⭐ Premium Feature',
        message: 'Boost Listing is a Premium-only feature. Upgrade now to boost your listings to the top of the feed for 3 hours!',
        confirmText: 'Upgrade to Premium',
        cancelText: 'Cancel',
        onConfirm: () => {
          closePopup()
          navigate('/premium')
        },
        onCancel: () => closePopup(),
        icon: FaCrown,
        confirmColorScheme: 'brand'
      })
      return
    }

    // Show confirmation dialog with details
    showPopup({
      type: 'info',
      title: `🚀 Boost "${product.title}"?`,
      message: `Your listing will appear at the top of the feed for 3 hours and get maximum visibility to other traders. You can boost this product again in 24 hours.`,
      confirmText: 'Boost for 3 Hours',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          setBoosting(true)
          showPopup({
            type: 'loading',
            title: 'Boosting Listing...',
            message: 'Your product is being boosted to the top of the feed.',
            icon: FaArrowUp,
            confirmColorScheme: 'blue'
          })

          const response = await api.post(`/api/products/boost/${product.id}`)

          if (response.data?.success) {
            showPopup({
              type: 'success',
              title: '🎉 Boost Successful!',
              message: response.data.message || `"${product.title}" is now boosted! It will appear at the top of the feed for the next 3 hours.`,
              confirmText: 'Awesome',
              onConfirm: () => closePopup(),
              icon: FaCheckCircle,
              confirmColorScheme: 'green'
            })
            invalidateDashboard()
          } else {
            throw new Error(response.data?.error || 'Failed to boost product')
          }
        } catch (error: any) {
          showPopup({
            type: 'error',
            title: 'Boost Failed',
            message: error.response?.data?.error || error.message || 'An error occurred while boosting the product',
            confirmText: 'Okay',
            onConfirm: () => closePopup(),
            icon: FaTimes,
            confirmColorScheme: 'red'
          })
        } finally {
          setBoosting(false)
        }
      },
      onCancel: () => closePopup(),
      icon: FaRocket,
      confirmColorScheme: 'orange'
    })
  }

  const handleDeleteProductClick = (product: Product) => {
    if (product.status === 'locked') {
      toast({ id: 'cannot-delete-locked', title: 'Cannot delete', description: 'Locked products cannot be deleted. Please unlock it first.', status: 'warning', duration: 3000, isClosable: true })
      return
    }
    showPopup({
      type: 'warning',
      title: 'Delete Product',
      message: `Are you sure you want to delete "${product.title}"? All offers and related data for this item will be permanently removed.`,
      confirmText: 'Delete Product',
      cancelText: 'Cancel',
      onConfirm: () => handleConfirmDelete(product),
      onCancel: () => closePopup(),
      icon: WarningIcon,
      confirmColorScheme: 'red'
    })
  }

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedProductIds)
    if (ids.length === 0) return

    // Filter out locked products
    const lockedIds = ids.filter(id => {
      const product = filteredProducts.find(p => p.id === id)
      return product?.status === 'locked'
    })
    const deletableIds = ids.filter(id => {
      const product = filteredProducts.find(p => p.id === id)
      return product?.status !== 'locked'
    })

    if (deletableIds.length === 0) {
      toast({ id: 'cannot-delete-selected-locked', title: 'Cannot delete', description: 'Selected products are locked. Locked products cannot be deleted.', status: 'warning', duration: 3000, isClosable: true })
      return
    }

    const warningMsg = lockedIds.length > 0 ? ` (${lockedIds.length} locked item(s) skipped)` : ''

    showPopup({
      type: 'warning',
      title: 'Delete Selected Products',
      message: `Are you sure you want to delete ${deletableIds.length} product(s)?${warningMsg} This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          setDeleting(true)
          for (const id of deletableIds) {
            await deleteProduct(id)
          }
          invalidateProducts()
          invalidateOffers()
          setSelectedProductIds(new Set())
          closePopup()
          toast({ id: 'deleted', title: 'Deleted', description: `${deletableIds.length} product(s) deleted`, status: 'success', duration: 3000, isClosable: true })
        } catch (e: any) {
          toast({ id: 'error-delete-products', title: 'Error', description: e?.message || 'Failed to delete some products', status: 'error', duration: 3000, isClosable: true })
        } finally {
          setDeleting(false)
        }
      },
      onCancel: () => closePopup(),
      icon: WarningIcon,
      confirmColorScheme: 'red'
    })
  }

  const handleBatchLock = async () => {
    const ids = Array.from(selectedProductIds)
    if (ids.length === 0) return
    const productsToLock = filteredProducts.filter(p => ids.includes(p.id) && p.status === 'available')
    const productsToUnlock = filteredProducts.filter(p => ids.includes(p.id) && p.status === 'locked')
    if (productsToLock.length === 0 && productsToUnlock.length === 0) {
      toast({ id: 'no-action', title: 'No action', description: 'Selected items are not available or locked', status: 'info', duration: 2000, isClosable: true })
      return
    }
    try {
      setDeleting(true)
      for (const p of productsToLock) {
        await updateProduct(p.id, { status: 'locked' })
      }
      for (const p of productsToUnlock) {
        await updateProduct(p.id, { status: 'available' })
      }
      invalidateProducts()
      setSelectedProductIds(new Set())
      const locked = productsToLock.length
      const unlocked = productsToUnlock.length
      const msg = [locked && `${locked} locked`, unlocked && `${unlocked} unlocked`].filter(Boolean).join(', ')
      toast({ id: 'updated', title: 'Updated', description: msg, status: 'success', duration: 3000, isClosable: true })
    } catch (e: any) {
      toast({ id: 'error-update-products', title: 'Error', description: e?.message || 'Failed to update products', status: 'error', duration: 3000, isClosable: true })
    } finally {
      setDeleting(false)
    }
  }

  const toggleProductSelection = (id: number) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllProducts = () => {
    const paginated = getPaginatedItems(
      [...filteredProducts].sort((a, b) => {
        const aDate = new Date(a.created_at).getTime()
        const bDate = new Date(b.created_at).getTime()
        return productSort === 'newest' ? bDate - aDate : aDate - bDate
      }),
      currentPage
    )
    const selectableIds = paginated.filter(p => p.status === 'available' || p.status === 'locked').map(p => p.id)
    setSelectedProductIds(prev => {
      const allSelected = selectableIds.length > 0 && selectableIds.every(id => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        selectableIds.forEach(id => next.delete(id))
        return next
      }
      return new Set([...prev, ...selectableIds])
    })
  }

  const handleConfirmDelete = async (product: Product) => {
    if (!product) {
      return
    }

    try {
      setDeleting(true)
      await deleteProduct(product.id)
      // Invalidate products cache to refresh data
      invalidateProducts()
      invalidateOffers() // Also invalidate offers since deleting a product affects trades

      // Update popup content without closing/reopening to avoid animation race conditions
      setPopupConfig({
        type: 'success',
        title: 'Product Deleted',
        message: `"${product.title}" has been successfully deleted along with all associated offers.`,
        confirmText: 'OK',
        onConfirm: () => closePopup(),
        icon: CheckIcon,
        confirmColorScheme: 'green'
      })
    } catch (error: any) {
      console.error('Delete error:', error)
      // Update popup content without closing/reopening
      setPopupConfig({
        type: 'error',
        title: 'Delete Failed',
        message: error.message || 'Failed to delete the product. Please try again.',
        confirmText: 'OK',
        onConfirm: () => closePopup(),
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

  const closePopup = () => {
    setPopupOpen(false)
    setPopupConfig(null)
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

  const getProductOffersCount = React.useCallback((productId: number) => {
    return [...incoming, ...outgoing].filter(t => t.target_product_id === productId && t.status !== 'declined' && t.status !== 'cancelled').length
  }, [incoming, outgoing])

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

  // Reusable Product Card Component - memoized for performance
  const ProductCard = React.memo(({ product, showActions = true }: { product: Product, showActions?: boolean }) => {
    const normalizedStatus = String(product.status || '').toLowerCase().trim()
    const isAvailable = normalizedStatus === 'available'
    const isLocked = normalizedStatus === 'locked'
    // Never show actions for traded/sold items
    const shouldShowActions = showActions && normalizedStatus !== 'traded' && normalizedStatus !== 'sold'
    const offersCount = React.useMemo(() => getProductOffersCount(product.id), [product.id, getProductOffersCount])
    const viewsCount = product.view_count || 0

    const isStagnant = React.useMemo(() => {
      const daysOld = (new Date().getTime() - new Date(product.created_at).getTime()) / (1000 * 3600 * 24)
      return viewsCount === 0 && offersCount === 0 && daysOld > 3
    }, [product.created_at, viewsCount, offersCount])

    const isBoostable = React.useMemo(() => {
      if (!product.boosted_at) return true
      const hoursSinceBoost = (new Date().getTime() - new Date(product.boosted_at).getTime()) / (1000 * 3600)
      return hoursSinceBoost >= 24
    }, [product.boosted_at])

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
          <Box position="relative" w="full" h="120px" overflow="hidden" bg="gray.100" borderRadius="lg">
            <Image
              src={getFirstImage(product.image_urls)}
              alt={product.title}
              w="full"
              h="full"
              objectFit="cover"
              loading="lazy"
              fallbackSrc="/no-image.svg"
              cursor="pointer"
              onClick={() => navigate(`/products/${product.id}`)}
            />
            {/* Boost button overlay - top right */}
            {isStagnant && isBoostable && shouldShowActions && (
              <Tooltip label="Boost this listing" placement="left" hasArrow>
                <Button
                  position="absolute"
                  top={2}
                  right={2}
                  size="xs"
                  colorScheme="blue"
                  variant="solid"
                  fontSize="10px"
                  px={2}
                  py={1}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleBoostProductClick(product)
                  }}
                  fontWeight="bold"
                  boxShadow="md"
                  _hover={{ transform: 'scale(1.05)', boxShadow: 'lg' }}
                  transition="all 0.2s"
                  zIndex={2}
                >
                  Boost
                </Button>
              </Tooltip>
            )}
          </Box>
          <CardHeader pb={2}>
            <Flex justify="space-between" align="start">
              <Heading size="sm" noOfLines={2} flex={1} mr={2} wordBreak="break-word">
                {product.title}
              </Heading>
              <HStack spacing={2} flexShrink={0}>
                {product.premium && (
                  <Badge colorScheme="yellow" variant="solid" fontSize="xs">
                    Premium
                  </Badge>
                )}
                {shouldShowActions && (
                  <IconButton
                    as={RouterLink}
                    to={`/edit-product/${product.id}`}
                    aria-label="Edit"
                    icon={<EditIcon />}
                    variant="ghost"
                    colorScheme="brand"
                    size="sm"
                  />
                )}
              </HStack>
            </Flex>
            <Text color="gray.600" noOfLines={2} fontSize="sm" wordBreak="break-word">
              {product.description}
            </Text>
            {/* Wishlist Count Badge */}
            {product && product.wishlist_count && product.wishlist_count > 0 && (
              <Flex mt={2} align="center" gap={1}>
                <Badge
                  colorScheme="pink"
                  variant="subtle"
                  borderRadius="full"
                  px={2}
                  py={0.5}
                  fontSize="xs"
                >
                  ?? {product.wishlist_count} {product.wishlist_count === 1 ? 'person wants' : 'people want'}
                </Badge>
              </Flex>
            )}
          </CardHeader>
          <CardBody pt={0}>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between" align="center">
                <Text fontSize="md" fontWeight="semibold" color="brand.500">
                  {product.allow_buying && !product.barter_only && product.price
                    ? formatPHP(product.price)
                    : product.desired_price
                    ? `Desired: ${formatPHP(product.desired_price)}`
                    : ''}
                </Text>
              </HStack>
              <HStack spacing={2} align="center" flexWrap="wrap">
                <Badge
                  colorScheme={isAvailable ? 'green' : normalizedStatus === 'sold' ? 'red' : isLocked ? 'orange' : 'blue'}
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
                {isAvailable && (
                  <Button
                    size="sm"
                    colorScheme="yellow"
                    variant="outline"
                    leftIcon={<Icon as={FaRegLightbulb} boxSize={3} />}
                    onClick={() => handleFindTradesClick(product)}
                    fontSize="sm"
                    flex={1}
                    whiteSpace="nowrap"
                    _hover={{ transform: 'scale(1.02)' }}
                    transition="all 0.2s"
                  >
                    Find Trades
                  </Button>
                )}
                <Tooltip
                  label={isLocked ? 'Cannot delete locked products' : ''}
                  isDisabled={!isLocked}
                  hasArrow
                >
                  <Button
                    leftIcon={<DeleteIcon />}
                    variant="outline"
                    colorScheme="red"
                    size="sm"
                    flex={1}
                    onClick={() => handleDeleteProductClick(product)}
                    isDisabled={isLocked}
                    whiteSpace="nowrap"
                    _hover={{ transform: 'scale(1.02)' }}
                    transition="all 0.2s"
                  >
                    Delete
                  </Button>
                </Tooltip>
              </HStack>
            </CardFooter>
          )}
        </Card>
      </ScaleFade>
    )
  })

  // Product List Row - compact row layout for list view
  const ProductListRow = React.memo(({
    product,
    showActions,
    isSelected,
    onToggleSelect,
    onDelete,
    offersCount,
    viewsCount = 0,
  }: {
    product: Product
    showActions: boolean
    isSelected: boolean
    onToggleSelect: () => void
    onDelete: () => void
    offersCount: number
    viewsCount?: number
  }) => {
    const normalizedStatus = String(product.status || '').toLowerCase().trim()
    const isAvailable = normalizedStatus === 'available'
    const isLocked = normalizedStatus === 'locked'
    const statusColor = isAvailable ? 'green' : isLocked ? 'orange' : normalizedStatus === 'sold' ? 'red' : 'blue'
    return (
      <Box
        p={3}
        borderBottom="1px"
        borderColor={borderColor}
        _hover={{ bg: 'gray.50' }}
      >
        <Flex
          align="center"
          gap={{ base: 2, md: 4 }}
          minW={0}
        >
          {showActions && (isAvailable || isLocked) && (
            <Checkbox
              isChecked={isSelected}
              onChange={onToggleSelect}
              flexShrink={0}
              aria-label={`Select ${product.title}`}
            />
          )}
          <Box
            w="60px"
            h="60px"
            flexShrink={0}
            borderRadius="md"
            overflow="hidden"
            bg="gray.100"
          >
            <Image
              src={getFirstImage(product.image_urls)}
              alt={product.title}
              w="full"
              h="full"
              objectFit="cover"
              fallbackSrc="/no-image.svg"
            />
          </Box>
          <VStack align="start" spacing={0} flex={1} minW={0}>
            <Text fontWeight="semibold" noOfLines={1} fontSize={{ base: 'sm', md: 'md' }}>
              {product.title}
            </Text>
            <HStack spacing={2} flexWrap="wrap" mt={1}>
              <Badge colorScheme={statusColor} variant="subtle" fontSize="2xs" px={1.5} py={0.5}>
                {product.status}
              </Badge>
              <HStack spacing={3} fontSize="xs" color="gray.500">
                <HStack spacing={1}>
                  <Icon as={ViewIcon} boxSize={3} />
                  <Text>{viewsCount} views</Text>
                </HStack>
                <HStack spacing={1}>
                  <Icon as={FaHandshake} boxSize={3} />
                  <Text>{offersCount} offers</Text>
                </HStack>
              </HStack>
            </HStack>
          </VStack>
          {/* Desktop: show actions inline */}
          <HStack spacing={1} flexShrink={0} display={{ base: 'none', md: 'flex' }}>
            {(() => {
              const daysOld = (new Date().getTime() - new Date(product.created_at).getTime()) / (1000 * 3600 * 24)
              const isStag = viewsCount === 0 && offersCount === 0 && daysOld > 3
              const isBoost = !product.boosted_at || ((new Date().getTime() - new Date(product.boosted_at).getTime()) / (1000 * 3600)) >= 24
              const shouldAct = showActions && product.status !== 'traded' && product.status !== 'sold'

              if (isStag && isBoost && shouldAct) {
                return (
                  <Button
                    size="sm"
                    colorScheme="blue"
                    variant="ghost"
                    leftIcon={<Icon as={FaArrowUp} boxSize={3} />}
                    onClick={() => handleBoostProductClick(product)}
                    fontSize="sm"
                    px={3}
                    mr={1}
                  >
                    Boost
                  </Button>
                )
              }
              return null
            })()}
            {showActions && (
              <>
                {isAvailable && (
                  <Button
                    size="sm"
                    colorScheme="yellow"
                    variant="outline"
                    leftIcon={<Icon as={FaRegLightbulb} boxSize={3} />}
                    onClick={() => handleFindTradesClick(product)}
                    fontSize="sm"
                    px={3}
                    whiteSpace="nowrap"
                  >
                    Find Trades
                  </Button>
                )}
                <Button
                  as={RouterLink}
                  to={`/edit-product/${product.id}`}
                  leftIcon={<EditIcon />}
                  variant="outline"
                  colorScheme="brand"
                  size="sm"
                  fontSize="sm"
                  px={3}
                >
                  Edit
                </Button>
                <Tooltip
                  label={product.status === 'locked' ? 'Cannot delete locked products' : ''}
                  isDisabled={product.status !== 'locked'}
                  hasArrow
                >
                  <IconButton
                    aria-label="Delete"
                    icon={<DeleteIcon />}
                    variant="outline"
                    colorScheme="red"
                    size="sm"
                    isDisabled={product.status === 'locked'}
                    onClick={onDelete}
                  />
                </Tooltip>
              </>
            )}
          </HStack>
        </Flex>
        {/* Mobile: show actions on a separate row below */}
        {showActions && (
          <HStack spacing={1} mt={2} display={{ base: 'flex', md: 'none' }} justify="flex-end" flexWrap="wrap">
            {(() => {
              const daysOld = (new Date().getTime() - new Date(product.created_at).getTime()) / (1000 * 3600 * 24)
              const isStag = viewsCount === 0 && offersCount === 0 && daysOld > 3
              const isBoost = !product.boosted_at || ((new Date().getTime() - new Date(product.boosted_at).getTime()) / (1000 * 3600)) >= 24
              const shouldAct = product.status !== 'traded' && product.status !== 'sold'

              if (isStag && isBoost && shouldAct) {
                return (
                  <Button
                    size="xs"
                    colorScheme="blue"
                    variant="ghost"
                    leftIcon={<Icon as={FaArrowUp} boxSize={3} />}
                    onClick={() => handleBoostProductClick(product)}
                    fontSize="xs"
                  >
                    Boost
                  </Button>
                )
              }
              return null
            })()}
            {isAvailable && (
              <Button
                size="xs"
                colorScheme="yellow"
                variant="outline"
                leftIcon={<Icon as={FaRegLightbulb} boxSize={3} />}
                onClick={() => handleFindTradesClick(product)}
                fontSize="xs"
                whiteSpace="nowrap"
              >
                Find Trades
              </Button>
            )}
            <Button
              as={RouterLink}
              to={`/edit-product/${product.id}`}
              leftIcon={<EditIcon />}
              variant="outline"
              colorScheme="brand"
              size="xs"
              fontSize="xs"
            >
              Edit
            </Button>
            <Tooltip
              label={product.status === 'locked' ? 'Cannot delete locked products' : ''}
              isDisabled={product.status !== 'locked'}
              hasArrow
            >
              <IconButton
                aria-label="Delete"
                icon={<DeleteIcon />}
                variant="outline"
                colorScheme="red"
                size="xs"
                isDisabled={product.status === 'locked'}
                onClick={onDelete}
              />
            </Tooltip>
          </HStack>
        )}
      </Box>
    )
  })

  // Offer List Row - compact row layout for offers list view
  const OfferListRow = React.memo(({
    trade,
    isIncoming,
    onView,
    onAccept,
    onDecline,
    onCancel,
  }: {
    trade: Trade
    isIncoming: boolean
    onView: (t: Trade) => void
    onAccept?: (t: Trade) => void
    onDecline?: (t: Trade) => void
    onCancel?: (t: Trade) => void
  }) => {
    const statusColor = badgeColor(trade.status).color
    const userName = isIncoming ? (trade.seller_name || 'Anonymous') : (trade.buyer_name || 'Anonymous')

    return (
      <Box
        p={3}
        borderBottom="1px"
        borderColor={borderColor}
        _hover={{ bg: 'gray.50' }}
      >
        <Flex
          align="center"
          gap={{ base: 2, md: 4 }}
          minW={0}
        >
          <Box
            w="60px"
            h="60px"
            flexShrink={0}
            borderRadius="md"
            overflow="hidden"
            bg="gray.100"
          >
            <ProductThumb
              pid={trade.target_product_id}
              alt={getProductTitle(trade.target_product_id, trade.product_title)}
              size="100%"
            />
          </Box>
          <VStack align="start" spacing={0} flex={1} minW={0}>
            <Text fontWeight="semibold" noOfLines={1} fontSize={{ base: 'sm', md: 'md' }}>
              {getProductTitle(trade.target_product_id, trade.product_title)}
            </Text>
            <HStack spacing={2} mt={1} flexWrap="wrap">
              <Badge colorScheme={statusColor} variant="subtle" fontSize="2xs" px={1.5} py={0.5}>
                {trade.status}
              </Badge>
              <Text fontSize="xs" color="gray.600" noOfLines={1}>from {userName}</Text>
              {trade.created_at && (
                <Text fontSize="xs" color="gray.500">
                  {getTimeAgo(trade.created_at)}
                </Text>
              )}
            </HStack>
          </VStack>
          {/* Desktop: inline actions */}
          <HStack spacing={1} flexShrink={0} display={{ base: 'none', md: 'flex' }}>
            <Button
              size="sm"
              variant="outline"
              colorScheme="brand"
              fontSize="sm"
              px={3}
              onClick={() => onView(trade)}
            >
              View
            </Button>
            {isIncoming && (trade.status === 'pending' || trade.status === 'pending_multiway') && onAccept && onDecline && (
              <>
                <Button
                  size="sm"
                  colorScheme="green"
                  variant="solid"
                  fontSize="sm"
                  px={3}
                  onClick={() => onAccept(trade)}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  colorScheme="red"
                  variant="outline"
                  fontSize="sm"
                  px={3}
                  onClick={() => onDecline(trade)}
                >
                  Decline
                </Button>
              </>
            )}
            {!isIncoming && (trade.status === 'pending' || trade.status === 'pending_multiway') && onCancel && (
              <Button
                size="sm"
                colorScheme="red"
                variant="outline"
                fontSize="sm"
                px={3}
                onClick={() => onCancel(trade)}
              >
                Cancel
              </Button>
            )}
          </HStack>
        </Flex>
        {/* Mobile: actions on separate row */}
        <HStack spacing={1} mt={2} display={{ base: 'flex', md: 'none' }} justify="flex-end">
          <Button
            size="xs"
            variant="outline"
            colorScheme="brand"
            fontSize="xs"
            onClick={() => onView(trade)}
          >
            View
          </Button>
          {isIncoming && (trade.status === 'pending' || trade.status === 'pending_multiway') && onAccept && onDecline && (
            <>
              <Button
                size="xs"
                colorScheme="green"
                variant="solid"
                fontSize="xs"
                onClick={() => onAccept(trade)}
              >
                Accept
              </Button>
              <Button
                size="xs"
                colorScheme="red"
                variant="outline"
                fontSize="xs"
                onClick={() => onDecline(trade)}
              >
                Decline
              </Button>
            </>
          )}
          {!isIncoming && (trade.status === 'pending' || trade.status === 'pending_multiway') && onCancel && (
            <Button
              size="xs"
              colorScheme="red"
              variant="outline"
              fontSize="xs"
              onClick={() => onCancel(trade)}
            >
              Cancel
            </Button>
          )}
        </HStack>
      </Box>
    )
  })

  // Enhanced Ongoing Trade Card Component - memoized for performance
  const OngoingTradeCard: React.FC<{
    trade: Trade
    isIncoming: boolean
    onView: (t: Trade) => void
    onComplete?: (t: Trade) => void
  }> = React.memo(({ trade, isIncoming, onView, onComplete }) => {
    const userName = isIncoming ? (trade.seller_name || 'Anonymous User') : (trade.buyer_name || 'Anonymous User')

    // Trade items are the buyer-offered products (most trades).
    // Show them as �Their Items� when you are the seller (incoming),
    // and as �Your Items� when you are the buyer (outgoing).
    const offeredItems = (trade.items || []).filter((i: any) => {
      const ob = (i?.offered_by ?? i?.offeredBy ?? '').toLowerCase()
      // If unknown, keep it (better than showing empty)
      if (!ob) return true
      return ob === 'buyer' || ob === 'from_buyer' || ob === 'sender'
    })

    const leftLabel = isIncoming ? 'Your Item' : 'Their Item'
    const rightLabel = isIncoming ? 'Their Items' : 'Your Items'

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
    const borderColor = trade.trade_option === 'delivery' ? 'blue.400' : 'orange.400'

    return (
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
          borderLeftColor={borderColor}
          role="article"
        >
          <Box position="relative" w="full" h={{ base: '120px', md: '140px' }} display="flex" gap={1} p={1} bg="gray.50" flexWrap="nowrap" alignContent="flex-start" overflow="hidden">
            {/* Your Item - Always flex=1 */}
            <Box flex={1} position="relative" borderRadius="md" overflow="hidden" borderWidth="2px" borderColor="blue.300" minW="0">
              <ProductThumb
                pid={trade.target_product_id}
                alt={getProductTitle(trade.target_product_id, trade.product_title)}
                size="100%"
              />
              <Badge position="absolute" top={1} left={1} colorScheme="blue" fontSize="2xs" px={1} py={0.5}>
                {leftLabel}
              </Badge>
            </Box>

            {/* Their Items - Always flex=1 */}
            <Box flex={1} display="flex" gap={1} minW="0">
              {offeredItems.length > 0 ? (
                <>
                  {offeredItems.slice(0, 3).map((item: any, idx: number) => (
                    <Box
                      key={item.id || idx}
                      flex={1}
                      position="relative"
                      borderRadius="md"
                      overflow="hidden"
                      borderWidth="2px"
                      borderColor="green.300"
                      minW="0"
                      h="100%"
                    >
                      <ProductThumb
                        pid={Number(item.product_id)}
                        src={item.product_image_url}
                        alt={getProductTitle(Number(item.product_id), item.product_title)}
                        size="100%"
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
                    {rightLabel}{offeredItems.length > 1 ? 's' : ''}
                  </Badge>
                </>
              ) : (
                <Box flex={1} position="relative" borderRadius="md" overflow="hidden" borderWidth="2px" borderColor="gray.300" minW="0">
                  <Box w="full" h="full" bg="gray.200" display="flex" alignItems="center" justifyContent="center">
                    <Text fontSize="xs" color="gray.500">No items</Text>
                  </Box>
                  <Badge position="absolute" top={1} right={1} colorScheme="gray" fontSize="2xs" px={1} py={0.5}>
                    {rightLabel}
                  </Badge>
                </Box>
              )}
            </Box>
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
              onClick={() => onView(trade)}
              leftIcon={<Icon as={ViewIcon} />}
              _hover={{ transform: 'scale(1.02)', shadow: 'md' }}
              transition="all 0.2s"
            >
              View Trade
            </Button>
          </CardFooter>
        </Card>
    )
  })

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

  // Offer Card Component
  const OfferCard: React.FC<{
    trade: Trade
    isIncoming: boolean
    onView: (t: Trade) => void
    onAccept?: (t: Trade) => void
    onDecline?: (t: Trade) => void
    onCancel?: (t: Trade) => void
    onComplete?: (t: Trade) => void
  }> = React.memo(({ trade, isIncoming, onView, onAccept, onDecline, onCancel, onComplete }) => {
    const userName = isIncoming ? (trade.buyer_name || 'Anonymous User') : (trade.seller_name || 'Anonymous User')

    const handleViewClick = useCallback(() => onView(trade), [onView, trade])
    const handleAcceptClick = useCallback(() => onAccept?.(trade), [onAccept, trade])
    const handleDeclineClick = useCallback(() => onDecline?.(trade), [onDecline, trade])
    const handleCancelClick = useCallback(() => onCancel?.(trade), [onCancel, trade])
    const handleCompleteClick = useCallback(() => onComplete?.(trade), [onComplete, trade])

    return (
      <Box
        minH="240px"
        bg="white"
        borderWidth="1px"
        borderColor="gray.200"
        borderLeftWidth="4px"
        borderLeftColor={
          trade.status === 'countered' ? 'purple.400' :
            trade.status === 'pending' ? 'yellow.400' :
              trade.status === 'accepted' || trade.status === 'active' ? 'green.400' :
                'gray.200'
        }
        rounded="lg"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        _hover={{
          shadow: "md",
          transform: "translateY(-2px)",
          transition: "all 0.2s ease"
        }}
        transition="all 0.2s ease"
        role="article"
        aria-label={`Offer for ${getProductTitle(trade.target_product_id, trade.product_title)}`}
      >
        {/* Image Section - Fixed Height */}
        <Box
          position="relative"
          w="full"
          h="100px"
          overflow="hidden"
          bg="gray.100"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <ProductThumb
            pid={trade.target_product_id}
            src={trade.product_image_url}
            alt={getProductTitle(trade.target_product_id, trade.product_title)}
            size="full"
          />
        </Box>

        {/* Info Section */}
        <Box p={2} flex="1" display="flex" flexDirection="column" justifyContent="space-between">
          <Box>
            <Heading size="xs" noOfLines={1} fontSize="13px" lineHeight="1.3" mb={1} fontWeight="600">
              {getProductTitle(trade.target_product_id, trade.product_title)}
            </Heading>
            <HStack spacing={0.5} fontSize="10px">
              <Avatar
                name={userName}
                size="xs"
                bg={isIncoming ? 'blue.500' : 'green.500'}
                color="white"
              />
              <Text fontSize="xs" color="gray.600" noOfLines={1} flex={1}>
                {userName}
              </Text>
            </HStack>
          </Box>
          <Box py={1.5} px={3}>
            <VStack spacing={1.5} align="stretch">
              <Text fontSize="xs" color="gray.500">
                {new Date(trade.created_at).toLocaleDateString()}
              </Text>
              {renderOfferedItems(trade)}
            </VStack>
          </Box>
          <Box pt={1.5} pb={2} px={3}>
            <HStack spacing={1.5} w="full" flexWrap="wrap">
              <Button
                size="sm"
                variant="outline"
                colorScheme="brand"
                flex={1}
                minW="50px"
                fontSize="xs"
                onClick={handleViewClick}
                _hover={{ bg: 'brand.50', transform: 'scale(1.02)' }}
                transition="all 0.2s"
              >
                View
              </Button>
              {isIncoming && (trade.status === 'pending' || trade.status === 'pending_multiway') && onAccept && onDecline && (
                <>
                  <Button
                    size="sm"
                    colorScheme="green"
                    flex={1}
                    minW="50px"
                    fontSize="xs"
                    onClick={handleAcceptClick}
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
                    minW="50px"
                    fontSize="xs"
                    onClick={handleDeclineClick}
                    _hover={{ transform: 'scale(1.02)' }}
                    transition="all 0.2s"
                  >
                    Decline
                  </Button>
                </>
              )}
              {!isIncoming && (trade.status === 'pending' || trade.status === 'pending_multiway') && onCancel && (
                <Button
                  size="sm"
                  colorScheme="red"
                  variant="outline"
                  flex={1}
                  minW="50px"
                  fontSize="xs"
                  onClick={() => onCancel && onCancel(trade)}
                  leftIcon={<Icon as={FaTimes} boxSize={3} />}
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
                  minW="50px"
                  fontSize="xs"
                  onClick={() => onComplete && onComplete(trade)}
                  leftIcon={<Icon as={FaHandshake} boxSize={3} />}
                  _hover={{ transform: 'scale(1.02)' }}
                  transition="all 0.2s"
                >
                  Complete
                </Button>
              )}
            </HStack>
          </Box>
        </Box>
      </Box>
    )
  })


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
      <Modal isOpen={popupOpen} onClose={closePopup} size="sm" isCentered closeOnOverlayClick={false} closeOnEsc={false}>
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
                    onClick={(e) => {
                      e.stopPropagation()
                      popupConfig.onCancel?.()
                    }}
                    isDisabled={deleting}
                  >
                    {popupConfig.cancelText}
                  </Button>
                )}
                <Button
                  colorScheme={popupConfig.confirmColorScheme || getColorScheme()}
                  size="md"
                  flex={1}
                  onClick={(e) => {
                    e.stopPropagation()
                    popupConfig.onConfirm?.()
                  }}
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

  if (loading || initialLoading) {
    return (
      <Box bg="#FFFDF1" minH="100vh" w="100%">
        <Container maxW="container.xl" py={{ base: 3, md: 8 }} px={{ base: 3, md: 6 }}>
          <VStack spacing={{ base: 3, md: 6 }} align="stretch">
            <Box>
              <Skeleton height="28px" width="220px" mb={2} />
              <Skeleton height="16px" width="280px" />
            </Box>

            <HStack spacing={3}>
              <Skeleton height="42px" flex={1} borderRadius="md" />
              <Skeleton height="42px" width="96px" borderRadius="md" />
            </HStack>

            <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4}>
              {[1, 2, 3, 4].map((n) => (
                <Card key={n} bg={cardBg} border="1px" borderColor={borderColor} borderRadius="xl">
                  <CardBody>
                    <Skeleton height="18px" width="70%" mb={3} />
                    <Skeleton height="24px" width="50%" mb={2} />
                    <Skeleton height="14px" width="60%" />
                  </CardBody>
                </Card>
              ))}
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, sm: 2, xl: 3 }} spacing={{ base: 3, md: 4 }}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <ProductCardSkeleton key={n} />
              ))}
            </SimpleGrid>
          </VStack>
        </Container>
      </Box>
    )
  }

  // Early return if no user (in case redirect hasn't processed yet)
  if (!user) {
    return null
  }

  const dashboardSubtitleByTab: Record<number, string> = {
    0: 'Manage your listings and keep them trade-ready.',
    1: 'Review your offers and respond quickly to pending actions.',
    2: 'Review mutual matches where both traders liked each other.',
    3: 'Track multi-way matches and loop opportunities for your listings.',
    4: 'Review your completed and archived trade history.',
  }
  const activeSubtitle = dashboardSubtitleByTab[activeTab] || 'Manage your products, trades, and offers.'

  const handleMobileToggleView = () => {
    if (activeTab === 0) {
      setProductViewMode(m => m === 'grid' ? 'list' : 'grid')
      return
    }
    if (activeTab === 1) {
      setOffersViewMode(m => m === 'grid' ? 'list' : 'grid')
      return
    }
    if (activeTab === 2 || activeTab === 3) {
      setMultiWayTradesViewMode(m => m === 'grid' ? 'list' : 'grid')
      return
    }
    setTradeHistoryViewMode(m => m === 'grid' ? 'list' : 'grid')
  }

  const handleMobileCycleFilter = () => {
    if (activeTab === 0) {
      const filters: Array<'all' | 'available' | 'locked'> = ['all', 'available', 'locked']
      const currentIndex = filters.indexOf(productFilter)
      setProductFilter(filters[(currentIndex + 1) % filters.length])
      setCurrentPage(1)
      return
    }
    if (activeTab === 1) {
      const statuses = ['all', 'pending', 'accepted', 'active', 'countered']
      const currentIndex = statuses.indexOf(offersStatusFilter)
      setOffersStatusFilter(statuses[(currentIndex + 1) % statuses.length])
      setOffersPage(1)
      return
    }
    if (activeTab === 2 || activeTab === 3) {
      return
    }
  }

  const handleMobileSetSort = (mode: 'newest' | 'oldest') => {
    if (activeTab === 0) {
      setProductSort(mode)
      setCurrentPage(1)
      return
    }
    if (activeTab === 1 || activeTab === 2 || activeTab === 3) {
      setOffersSort(mode)
      return
    }
    setTradeHistorySort(mode)
    setTradeHistoryPage(1)
  }

  const activeViewMode = activeTab === 0
    ? productViewMode
    : activeTab === 1
      ? offersViewMode
      : activeTab === 2 || activeTab === 3
        ? multiWayTradesViewMode
        : tradeHistoryViewMode

  const activeSortMode = activeTab === 0
    ? productSort
    : activeTab === 1 || activeTab === 2 || activeTab === 3
      ? offersSort
      : tradeHistorySort

  return (
    <Box bg="#FFFDF1" minH="100vh" w="100%">
      <Container maxW="container.xl" py={{ base: 3, md: 8 }} px={{ base: 3, md: 6 }}>
        <VStack spacing={{ base: 3, md: 6 }} align="stretch">
          {/* Sticky header: search bar + view toggle stay visible when scrolling long product lists */}
          <Box
            position="sticky"
            top={0}
            zIndex={20}
            bg="#FFFDF1"
            py={2}
            mt={-2}
            mb={-2}
            boxShadow={isHeaderScrolled ? 'sm' : 'none'}
            transition="box-shadow 0.2s ease"
          >
            <VStack spacing={{ base: 2, md: 4 }} align="stretch">
              <Flex
                align="center"
                justify="space-between"
                gap={{ base: 2, md: 4 }}
                flexWrap="nowrap"
                display={{ base: 'flex', md: 'flex' }}
              >
                {/* Left: Welcome Message */}
                <Box minW="fit-content" display={{ base: 'none', md: 'block' }}>
                  <Heading size="md" color="brand.500" mb={1}>
                    Welcome, <Box as="span" textTransform="capitalize">{user?.name}</Box>!
                  </Heading>
                  <Text color="gray.600" fontSize="sm">
                    {activeSubtitle}
                  </Text>
                </Box>

                {/* Center: Unified Search Bar */}
                <InputGroup
                  flex={{ base: '1 1 auto', sm: '0 0 64%', md: '1 1 350px' }}
                  maxW={{ base: '65%', sm: '70%', md: '800px' }}
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
                    size={{ base: 'sm', md: 'md' }}
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
                              setActiveTab(4)
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
                 label={`${dashboardStats.totalProducts} total � ${dashboardStats.activeProducts} active � ${actualUserProducts.filter(p => p.premium).length} premium`}
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
                 label={`${dashboardStats.activeTrades} active trades � ${completedTradesCount} completed`}
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

                {/* View Type Toggle - Desktop */}
                <HStack
                  spacing={{ base: 2, md: 1 }}
                  flexShrink={0}
                  display={{ base: 'none', md: 'flex' }}
                >
                  {activeTab === 0 && (
                    <Tooltip label={productViewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'} hasArrow>
                      <Button
                        size="sm"
                        variant={productViewMode === 'list' ? 'solid' : 'ghost'}
                        colorScheme="brand"
                        leftIcon={<Icon as={productViewMode === 'grid' ? FiList : FiGrid} />}
                        onClick={() => setProductViewMode(m => m === 'grid' ? 'list' : 'grid')}
                      >
                        View
                      </Button>
                    </Tooltip>
                  )}

                  {activeTab === 1 && (
                    <Tooltip label={offersViewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'} hasArrow>
                      <Button
                        size="sm"
                        variant={offersViewMode === 'list' ? 'solid' : 'ghost'}
                        colorScheme="brand"
                        leftIcon={<Icon as={offersViewMode === 'grid' ? FiList : FiGrid} />}
                        onClick={() => setOffersViewMode(m => m === 'grid' ? 'list' : 'grid')}
                      >
                        View
                      </Button>
                    </Tooltip>
                  )}

                  {(activeTab === 2 || activeTab === 3) && (
                    <Tooltip label={multiWayTradesViewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'} hasArrow>
                      <Button
                        size="sm"
                        variant={multiWayTradesViewMode === 'list' ? 'solid' : 'ghost'}
                        colorScheme="brand"
                        leftIcon={<Icon as={multiWayTradesViewMode === 'grid' ? FiList : FiGrid} />}
                        onClick={() => setMultiWayTradesViewMode(m => m === 'grid' ? 'list' : 'grid')}
                      >
                        View
                      </Button>
                    </Tooltip>
                  )}

                  {activeTab === 4 && (
                    <Tooltip label={tradeHistoryViewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'} hasArrow>
                      <Button
                        size="sm"
                        variant={tradeHistoryViewMode === 'list' ? 'solid' : 'ghost'}
                        colorScheme="brand"
                        leftIcon={<Icon as={tradeHistoryViewMode === 'grid' ? FiList : FiGrid} />}
                        onClick={() => setTradeHistoryViewMode(m => m === 'grid' ? 'list' : 'grid')}
                      >
                        View
                      </Button>
                    </Tooltip>
                  )}
                </HStack>

                {/* Mobile controls: Search stays left; Controls + Bell + Avatar on the right */}
                <HStack spacing={2} flexShrink={0} display={{ base: 'flex', md: 'none' }}>
                  <Menu placement="bottom-end" closeOnSelect>
                    <MenuButton
                      as={IconButton}
                      aria-label="Open controls"
                      icon={<Icon as={FiSliders} boxSize={5.5} />}
                      size="sm"
                      variant="outline"
                      color="#3D9E8C"
                      borderColor="#3D9E8C"
                      _hover={{ bg: 'teal.50' }}
                      _active={{ bg: 'teal.100' }}
                    />
                    <MenuList bg="white" borderRadius="md" boxShadow="md" minW="220px">
                      <MenuItem icon={<Icon as={activeViewMode === 'grid' ? FiGrid : FiList} />} onClick={handleMobileToggleView}>
                        {activeViewMode === 'grid' ? 'Grid view' : 'List view'} <Text as="span" ml={2}>?</Text>
                      </MenuItem>
                    </MenuList>
                  </Menu>

                  <Box
                    border="2px solid"
                    borderColor="#3D9E8C"
                    borderRadius="full"
                    p="1px"
                    cursor="pointer"
                    onClick={() => navigate(`/users/${(user as any)?.slug || user?.id}`)}
                  >
                    <VerifiedAvatar
                      name={user?.name || 'User'}
                      src={user?.profile_picture || undefined}
                      size="sm"
                      bg="brand.500"
                      color="white"
                      _hover={{ opacity: 0.8 }}
                      isVerified={user?.verified || (user as any)?.verification_status === 'verified' || false}
                    />
                  </Box>
                </HStack>
              </Flex>

            </VStack>
          </Box>

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
              py={{ base: 1, md: 2 }}
            >
              <Flex justify="space-between" align="center" px={{ base: 2, md: 4 }} gap={{ base: 1, md: 4 }} flexWrap={{ base: 'nowrap', md: 'nowrap' }}>
                <Tabs index={activeTab} onChange={setActiveTab} variant="line" colorScheme="brand" flex={1} minW={0}>
                  <TabList
                    overflowX={{ base: 'auto', md: 'visible' }}
                    display="flex"
                    flexWrap="nowrap"
                    justifyContent={{ base: 'space-around', md: 'flex-start' }}
                    sx={{
                      '&::-webkit-scrollbar': { display: 'none' },
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                      '& > button': {
                        fontSize: { base: '0.7rem', sm: '0.8rem', md: '1rem' },
                        whiteSpace: 'nowrap',
                        minW: { base: 'auto', md: 'auto' },
                        px: { base: '8px', sm: '12px', md: '16px' },
                        py: { base: '6px', sm: '10px', md: '12px' },
                        flex: { base: 1, md: 'initial' },
                        justifyContent: 'center',
                        borderBottomWidth: '3px',
                        borderBottomColor: 'transparent',
                      }
                    }}>
                    <Tab
                      _selected={{
                        color: 'green.500',
                        borderColor: 'green.500',
                        borderBottomWidth: '3px',
                        fontWeight: 'semibold'
                      }}
                      transition="all 0.2s"
                    >
                      <HStack spacing={1}>
                        <Icon as={FiShoppingBag} boxSize={{ base: 4, md: 5 }} />
                        <Text fontSize={{ base: 'xs', sm: 'sm', md: 'md' }} display={{ base: 'none', sm: 'block' }}>Products</Text>
                        {inventoryProducts.filter(p => p.status !== 'locked').length > 0 && (
                          <Badge colorScheme="green" borderRadius="full" fontSize="2xs" display={{ base: 'none', sm: 'inline-flex' }}>
                            {inventoryProducts.filter(p => p.status !== 'locked').length}
                          </Badge>
                        )}
                      </HStack>
                    </Tab>
                    <Tab
                      position="relative"
                      _selected={{
                        color: 'green.500',
                        borderColor: 'green.500',
                        borderBottomWidth: '3px',
                        fontWeight: 'semibold'
                      }}
                      transition="all 0.2s"
                    >
                      <HStack spacing={1}>
                        <Icon as={FiMessageCircle} boxSize={{ base: 4, md: 5 }} />
                        <Text fontSize={{ base: 'xs', sm: 'sm', md: 'md' }} display={{ base: 'none', sm: 'block' }}>Offers</Text>
                        {unreadOffers > 0 && (
                          <Badge colorScheme="red" borderRadius="full" fontSize="2xs">
                            {unreadOffers > 99 ? '99+' : unreadOffers}
                          </Badge>
                        )}
                        {(sentOffers.length + receivedOffers.length + ongoingTrades.length) > 0 && (
                          <Badge
                            colorScheme="orange"
                            borderRadius="full"
                            fontSize="2xs"
                          >
                            {sentOffers.length + receivedOffers.length + ongoingTrades.length}
                          </Badge>
                        )}
                      </HStack>
                    </Tab>
                    <Tab
                      _selected={{
                        color: 'green.500',
                        borderColor: 'green.500',
                        borderBottomWidth: '3px',
                        fontWeight: 'semibold'
                      }}
                      transition="all 0.2s"
                    >
                      <HStack spacing={1}>
                        <Icon as={FaHandshake} boxSize={{ base: 4, md: 5 }} />
                        <Text fontSize={{ base: 'xs', sm: 'sm', md: 'md' }} display={{ base: 'none', sm: 'block' }}>Trade Match</Text>
                        {tradeMatchIndicatorCount > 0 && (
                          <Badge colorScheme="blue" borderRadius="full" fontSize="2xs">
                            {tradeMatchIndicatorCount}
                          </Badge>
                        )}
                      </HStack>
                    </Tab>
                    <Tab
                      _selected={{
                        color: 'green.500',
                        borderColor: 'green.500',
                        borderBottomWidth: '3px',
                        fontWeight: 'semibold'
                      }}
                      transition="all 0.2s"
                    >
                      <HStack spacing={1}>
                        <Icon as={FaExchangeAlt} boxSize={{ base: 4, md: 5 }} />
                        <Text fontSize={{ base: 'xs', sm: 'sm', md: 'md' }} display={{ base: 'none', sm: 'block' }}>Multi-Way</Text>
                        <Text fontSize={{ base: 'xs', sm: 'sm', md: 'md' }} display="none">Trade</Text>
                        {multiWayIndicatorCount > 0 && (
                          <Badge colorScheme="purple" borderRadius="full" fontSize="2xs">
                            {multiWayIndicatorCount}
                          </Badge>
                        )}
                      </HStack>
                    </Tab>
                    <Tab
                      _selected={{
                        color: 'green.500',
                        borderColor: 'green.500',
                        borderBottomWidth: '3px',
                        fontWeight: 'semibold'
                      }}
                      transition="all 0.2s"
                    >
                      <HStack spacing={1}>
                        <Icon as={FiRefreshCw} boxSize={{ base: 4, md: 5 }} />
                        <Text fontSize={{ base: 'xs', sm: 'sm', md: 'md' }} display={{ base: 'none', sm: 'block' }}>History</Text>
                        {completedTradesCount > 0 && (
                          <Badge colorScheme="green" borderRadius="full" fontSize="2xs" display={{ base: 'none', sm: 'inline-flex' }}>
                            {completedTradesCount}
                          </Badge>
                        )}
                      </HStack>
                    </Tab>
                  </TabList>
                </Tabs>
              </Flex>
            </Box>

            <Tabs index={activeTab} onChange={setActiveTab}>
              <TabPanels>
                {/* Products Tab */}
                <TabPanel px={{ base: 2, md: 4 }} py={{ base: 3, md: 4 }}>
                  <VStack spacing={6} align="stretch">

                    {/* Products Grid or List - Apply Sort */}
                    {productsLoading && !hasInitiallyLoaded.current ? (
                      <Fade in={true}>
                        {productViewMode === 'grid' ? (
                          <SimpleGrid columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 4 }} spacing={{ base: 3, md: 4 }}>
                            {Array.from({ length: 8 }).map((_, i) => (
                              <ProductCardSkeleton key={i} />
                            ))}
                          </SimpleGrid>
                        ) : (
                          <Box border="1px" borderColor={borderColor} borderRadius="lg" overflow="hidden">
                            {Array.from({ length: 6 }).map((_, i) => (
                              <Flex key={i} p={3} borderBottom={i < 5 ? '1px' : 'none'} borderColor={borderColor} align="center" gap={4}>
                                <Box w="60px" h="60px" bg="gray.200" borderRadius="md" />
                                <VStack align="start" spacing={1} flex={1}>
                                  <Box h="16px" bg="gray.200" borderRadius="md" w="60%" />
                                  <Box h="12px" bg="gray.200" borderRadius="md" w="40%" />
                                </VStack>
                              </Flex>
                            ))}
                          </Box>
                        )}
                      </Fade>
                    ) : filteredProducts.length === 0 ? (
                      <Fade in={true}>
                        <Box
                          textAlign="center"
                          py={{ base: 10, md: 16 }}
                          bg="green.50"
                          borderRadius="lg"
                          border="2px dashed"
                          borderColor="green.200"
                        >
                          <Icon as={FiShoppingBag} boxSize={{ base: 12, md: 16 }} color="green.300" mb={4} />
                          <Text color="gray.600" fontSize={{ base: 'md', md: 'lg' }} fontWeight="medium" mb={2}>
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
                    ) : productViewMode === 'list' ? (
                      <>
                        <Box border="1px" borderColor={borderColor} borderRadius="lg" overflow="hidden" bg={cardBg}>
                          {/* Select All header row - only in list view */}
                          <Flex
                            align="center"
                            gap={{ base: 2, md: 4 }}
                            p={3}
                            borderBottom="1px"
                            borderColor={borderColor}
                            bg="gray.50"
                          >
                            <Checkbox
                              isChecked={getPaginatedItems(
                                [...filteredProducts].sort((a, b) => {
                                  const aDate = new Date(a.created_at).getTime()
                                  const bDate = new Date(b.created_at).getTime()
                                  return productSort === 'newest' ? bDate - aDate : aDate - bDate
                                }),
                                currentPage
                              ).filter(p => p.status === 'available' || p.status === 'locked').every(p => selectedProductIds.has(p.id))}
                              isIndeterminate={
                                getPaginatedItems(
                                  [...filteredProducts].sort((a, b) => {
                                    const aDate = new Date(a.created_at).getTime()
                                    const bDate = new Date(b.created_at).getTime()
                                    return productSort === 'newest' ? bDate - aDate : aDate - bDate
                                  }),
                                  currentPage
                                ).filter(p => p.status === 'available' || p.status === 'locked').some(p => selectedProductIds.has(p.id)) &&
                                !getPaginatedItems(
                                  [...filteredProducts].sort((a, b) => {
                                    const aDate = new Date(a.created_at).getTime()
                                    const bDate = new Date(b.created_at).getTime()
                                    return productSort === 'newest' ? bDate - aDate : aDate - bDate
                                  }),
                                  currentPage
                                ).filter(p => p.status === 'available' || p.status === 'locked').every(p => selectedProductIds.has(p.id))
                              }
                              onChange={toggleSelectAllProducts}
                              flexShrink={0}
                            />
                            <Text fontSize="sm" color="gray.600" fontWeight="medium">
                              Select all on page
                            </Text>
                          </Flex>
                          {getPaginatedItems(
                            [...filteredProducts].sort((a, b) => {
                              const aDate = new Date(a.created_at).getTime()
                              const bDate = new Date(b.created_at).getTime()
                              return productSort === 'newest' ? bDate - aDate : aDate - bDate
                            }),
                            currentPage
                          ).map((product) => (
                            <ProductListRow
                              key={product.id}
                              product={product}
                              showActions={true}
                              isSelected={selectedProductIds.has(product.id)}
                              onToggleSelect={() => toggleProductSelection(product.id)}
                              onDelete={() => handleDeleteProductClick(product)}
                              offersCount={getProductOffersCount(product.id)}
                            />
                          ))}
                        </Box>
                        <PaginationControls
                          currentPage={currentPage}
                          totalPages={getTotalPages(filteredProducts)}
                          onPageChange={setCurrentPage}
                          itemsCount={filteredProducts.length}
                        />
                      </>
                    ) : (
                      <>
                        <SimpleGrid columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 4 }} spacing={{ base: 3, md: 4 }}>
                          {getPaginatedItems(
                            [...filteredProducts].sort((a, b) => {
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
                <TabPanel px={{ base: 2, md: 4 }} py={{ base: 1, md: 2 }}>
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
                        flexWrap="nowrap"
                        overflowX={{ base: 'auto', md: 'visible' }}
                        justifyContent={{ base: 'flex-start', md: 'flex-start' }}
                        w="100%"
                        sx={{
                          '&::-webkit-scrollbar': { display: 'none' },
                          scrollbarWidth: 'none',
                          msOverflowStyle: 'none',
                          gap: { base: '6px', md: '8px' },
                          '& > button': {
                            px: { base: '10px', md: '14px' },
                            py: { base: '5px', md: '6px' },
                            minW: 'fit-content',
                            flex: 'none',
                            fontSize: { base: 'xs', md: 'sm' },
                          }
                        }}
                      >
                        <Tab
                          fontSize={{ base: 'xs', md: 'sm' }}
                          borderWidth="1px"
                          borderColor="orange.200"
                          bg="orange.50"
                          _selected={{ bg: 'orange.100', borderColor: 'orange.400', color: 'orange.700' }}
                        >
                          <HStack spacing={1.5}>
                            <Icon as={FaMoneyBillWave} boxSize={3.5} />
                            <Box display={{ base: 'none', md: 'inline' }}>Buyout Offers</Box>
                            <Box display={{ base: 'inline', md: 'none' }}>Buyout</Box>
                          </HStack>
                          {offersStats.buyout > 0 && (
                            <Badge ml={2} colorScheme="orange" borderRadius="full" fontSize="xs">
                              {offersStats.buyout}
                            </Badge>
                          )}
                        </Tab>
                        <Tab
                          fontSize={{ base: 'xs', md: 'sm' }}
                          borderWidth="1px"
                          borderColor="yellow.200"
                          bg="yellow.50"
                          _selected={{ bg: 'yellow.100', borderColor: 'yellow.400', color: 'yellow.700' }}
                        >
                          <HStack spacing={1.5}>
                            <Icon as={FiSend} boxSize={3.5} />
                            <Box display={{ base: 'none', md: 'inline' }}>Sent Offers</Box>
                            <Box display={{ base: 'inline', md: 'none' }}>Sent</Box>
                          </HStack>
                          {offersStats.sentPending > 0 && (
                            <Badge ml={2} colorScheme="yellow" borderRadius="full" fontSize="xs">
                              {offersStats.sentPending}
                            </Badge>
                          )}
                        </Tab>
                        <Tab
                          fontSize={{ base: 'xs', md: 'sm' }}
                          borderWidth="1px"
                          borderColor="blue.200"
                          bg="blue.50"
                          _selected={{ bg: 'blue.100', borderColor: 'blue.400', color: 'blue.700' }}
                        >
                          <HStack spacing={1.5}>
                            <Icon as={FiInbox} boxSize={3.5} />
                            <Box display={{ base: 'none', md: 'inline' }}>Received Offers</Box>
                            <Box display={{ base: 'inline', md: 'none' }}>Received</Box>
                          </HStack>
                          {offersStats.receivedPending > 0 && (
                            <Badge ml={2} colorScheme="blue" borderRadius="full" fontSize="xs">
                              {offersStats.receivedPending}
                            </Badge>
                          )}
                          {offersStats.receivedPending > 0 && (
                            <Badge ml={2} colorScheme="red" variant="solid" fontSize="2xs">Action</Badge>
                          )}
                        </Tab>
                        <Tab
                          fontSize={{ base: 'xs', md: 'sm' }}
                          borderWidth="1px"
                          borderColor="green.200"
                          bg="green.50"
                          _selected={{ bg: 'green.100', borderColor: 'green.400', color: 'green.700' }}
                        >
                          <HStack spacing={1.5}>
                            <Icon as={FaClock} boxSize={3.5} />
                            <Box display={{ base: 'none', md: 'inline' }}>Ongoing Trades</Box>
                            <Box display={{ base: 'inline', md: 'none' }}>Ongoing</Box>
                          </HStack>
                          {(ongoingTrades.length + ongoingMultiWayTrades.length) > 0 && (
                            <Badge ml={2} colorScheme="green" borderRadius="full" fontSize="xs">
                              {ongoingTrades.length + ongoingMultiWayTrades.length}
                            </Badge>
                          )}
                          {(ongoingTrades.length + ongoingMultiWayTrades.length) > 0 && (
                            <Badge ml={2} colorScheme="red" variant="solid" fontSize="2xs">Action</Badge>
                          )}
                        </Tab>
                        <Tab
                          fontSize={{ base: '10px', md: 'sm' }}
                          borderWidth="1px"
                          borderColor="gray.200"
                          bg="gray.50"
                          _selected={{ bg: 'gray.100', borderColor: 'gray.400', color: 'gray.700' }}
                        >
                          <HStack spacing={1.5}>
                            <Icon as={FiArchive} boxSize={3.5} />
                            <Box display={{ base: 'none', md: 'inline' }}>Archive</Box>
                            <Box display={{ base: 'inline', md: 'none' }}>Archive</Box>
                          </HStack>
                          {archivedTradesData.length > 0 && (
                            <Badge ml={2} colorScheme="red" borderRadius="full" fontSize="xs">
                              {archivedTradesData.length}
                            </Badge>
                          )}
                        </Tab>
                      </TabList>

                      <TabPanels>
                        {/* Buyout Offers */}
                        <TabPanel px={0}>
                          {offersLoading ? (
                            <SimpleGrid columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 4 }} spacing={{ base: 3, md: 4 }}>
                              {Array.from({ length: 8 }).map((_, i) => (
                                <ProductCardSkeleton key={i} />
                              ))}
                            </SimpleGrid>
                          ) : buyoutOffersTab.length === 0 ? (
                            <Fade in={true}>
                              <Box
                                textAlign="center"
                                py={12}
                                bg="orange.50"
                                borderRadius="lg"
                                border="2px dashed"
                                borderColor="orange.200"
                              >
                                <Icon as={FaMoneyBillWave} boxSize={16} color="orange.300" mb={4} />
                                <Text color="gray.600" fontSize="lg" fontWeight="medium" mb={2}>
                                  {(unifiedSearch || offersSearch) || offersStatusFilter !== 'all'
                                    ? 'No buyout offers match your search/filters.'
                                    : 'No buyout offers'}
                                </Text>
                                <Text color="gray.500" fontSize="sm">
                                  {(unifiedSearch || offersSearch) || offersStatusFilter !== 'all'
                                    ? 'Try adjusting your search or filters.'
                                    : 'Direct buyout offers from other users will appear here!'}
                                </Text>
                              </Box>
                            </Fade>
                          ) : offersViewMode === 'list' ? (
                            <>
                              <Box border="1px" borderColor={borderColor} borderRadius="lg" overflow="hidden" bg={cardBg}>
                                {paginatedTrades.map((trade, idx) => (
                                  <OfferListRow
                                    key={trade.id}
                                    trade={trade}
                                    isIncoming={true}
                                    onView={handleViewDetails}
                                    onAccept={handleAcceptTrade}
                                    onDecline={handleDeclineTradeClick}
                                  />
                                ))}
                              </Box>
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
                          ) : (
                            <>
                              <SimpleGrid columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 4 }} spacing={{ base: 3, md: 4 }} mb={6}>
                                {paginatedTrades.map((trade) => {
                                  const isIncoming = true
                                  return (
                                    <OfferCard
                                      key={trade.id}
                                      trade={trade}
                                      isIncoming={isIncoming}
                                      onView={handleViewDetails}
                                      onAccept={handleAcceptTrade}
                                      onDecline={handleDeclineTradeClick}
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

                        {/* Sent Offers */}
                        <TabPanel px={0}>
                          {offersLoading ? (
                            <SimpleGrid columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 4 }} spacing={{ base: 3, md: 4 }}>
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
                          ) : offersViewMode === 'list' ? (
                            <>
                              <Box border="1px" borderColor={borderColor} borderRadius="lg" overflow="hidden" bg={cardBg}>
                                {paginatedTrades.map((trade, idx) => (
                                  <OfferListRow
                                    key={trade.id}
                                    trade={trade}
                                    isIncoming={false}
                                    onView={handleViewDetails}
                                    onCancel={handleCancelTradeClick}
                                  />
                                ))}
                              </Box>
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
                          ) : (
                            <>
                              <SimpleGrid columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 4 }} spacing={{ base: 3, md: 4 }} mb={6}>
                                {paginatedTrades.map((trade) => {
                                  const isIncoming = false
                                  return (
                                    <OfferCard

                                      key={trade.id}
                                      trade={trade}
                                      isIncoming={isIncoming}
                                      onView={handleViewDetails}
                                      onCancel={handleCancelTradeClick}
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
                            <SimpleGrid columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 4 }} spacing={{ base: 3, md: 4 }}>
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
                          ) : offersViewMode === 'list' ? (
                            <>
                              <Box border="1px" borderColor={borderColor} borderRadius="lg" overflow="hidden" bg={cardBg}>
                                {paginatedTrades.map((trade) => (
                                  <OfferListRow
                                    key={trade.id}
                                    trade={trade}
                                    isIncoming={true}
                                    onView={handleViewDetails}
                                    onAccept={handleAcceptTrade}
                                    onDecline={handleDeclineTradeClick}
                                  />
                                ))}
                              </Box>
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
                          ) : (
                            <>
                              <SimpleGrid columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 4 }} spacing={{ base: 3, md: 4 }} mb={6}>
                                {paginatedTrades.map((trade) => {
                                  const isIncoming = true
                                  return (
                                    <OfferCard
                                      key={trade.id}
                                      trade={trade}
                                      isIncoming={isIncoming}
                                      onView={handleViewDetails}
                                      onAccept={handleAcceptTrade}
                                      onDecline={handleDeclineTradeClick}
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
                            <SimpleGrid columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 4 }} spacing={{ base: 3, md: 4 }}>
                              {Array.from({ length: 8 }).map((_, i) => (
                                <ProductCardSkeleton key={i} />
                              ))}
                            </SimpleGrid>
                          ) : ongoingTrades.length === 0 && ongoingMultiWayTrades.length === 0 ? (
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
                          ) : offersViewMode === 'list' ? (
                            <>
                              <Box border="1px" borderColor={borderColor} borderRadius="lg" overflow="hidden" bg={cardBg}>
                                <Box
                                  px={4}
                                  py={3}
                                  bg="gray.50"
                                  borderBottomWidth="1px"
                                  borderColor="gray.200"
                                  fontSize="xs"
                                  fontWeight="semibold"
                                  color="gray.600"
                                  textTransform="uppercase"
                                  display={{ base: 'none', md: 'block' }}
                                >
                                  Product � Partner � Status � Action
                                </Box>
                                {paginatedTrades.map((trade) => {
                                  const isIncoming = incoming.some((t: Trade) => t.id === trade.id)
                                  const userName = isIncoming ? (trade.seller_name || 'Anonymous') : (trade.buyer_name || 'Anonymous')
                                  return (
                                    <Flex
                                      key={trade.id}
                                      align="center"
                                      gap={{ base: 2, md: 4 }}
                                      p={3}
                                      borderBottom="1px"
                                      borderColor={borderColor}
                                      _hover={{ bg: 'gray.50' }}
                                      minW={0}
                                      flexWrap="wrap"
                                    >
                                      <Box
                                        w="60px"
                                        h="60px"
                                        flexShrink={0}
                                        borderRadius="md"
                                        overflow="hidden"
                                        bg="gray.100"
                                      >
                                        <ProductThumb
                                          pid={trade.target_product_id}
                                          alt={getProductTitle(trade.target_product_id, trade.product_title)}
                                          size="100%"
                                        />
                                      </Box>
                                      <VStack align="start" spacing={0} flex={1} minW={0}>
                                        <Text fontWeight="semibold" noOfLines={1} fontSize={{ base: 'sm', md: 'md' }}>
                                          {getProductTitle(trade.target_product_id, trade.product_title)}
                                        </Text>
                                        <Text fontSize="xs" color="gray.600">{userName}</Text>
                                      </VStack>
                                      <Badge colorScheme="green" variant="subtle" fontSize="2xs" px={2} py={1}>
                                        Active
                                      </Badge>
                                      <Button
                                        size="sm"
                                        colorScheme="brand"
                                        variant="outline"
                                        fontSize={{ base: 'xs', md: 'sm' }}
                                        px={{ base: 2, md: 3 }}
                                        onClick={() => handleViewDetails(trade)}
                                      >
                                        View
                                      </Button>
                                    </Flex>
                                  )
                                })}
                              </Box>
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
                          ) : (
                            <>
                              <SimpleGrid columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 4 }} spacing={{ base: 3, md: 4 }} mb={6}>
                                {paginatedTrades.map((trade) => {
                                  const isIncoming = incoming.some((t: Trade) => t.id === trade.id)
                                  return (
                                    <OngoingTradeCard
                                      key={trade.id}
                                      trade={trade}
                                      isIncoming={isIncoming}
                                      onView={handleViewOngoingTrade}
                                      onComplete={handleCompleteTradeClick}
                                    />
                                  )
                                })}
                                {/* Multi-Way Loop Trades in same grid */}
                                {ongoingMultiWayTrades.map((trade: any) => {
                                  const participants = Array.isArray(trade?.participants) ? trade.participants : []
                                  if (participants.length < 2) return null
                                  const summary = getMultiWayTradeSummary(trade)
                                  
                                  const currentUserID = Number(user?.id || 0)
                                  const yourParticipantIndex = participants.findIndex((p: any) => Number(p?.id || p?.user_id) === currentUserID)
                                  
                                  const yourParticipant = yourParticipantIndex >= 0 ? participants[yourParticipantIndex] : null;
                                  const nextParticipant = yourParticipantIndex >= 0 && participants.length > 0
                                      ? participants[(yourParticipantIndex + 1) % participants.length]
                                      : participants[0];

                                  const desiredCategory = nextParticipant?.wanted_categories 
                                      ? (Array.isArray(nextParticipant.wanted_categories) ? nextParticipant.wanted_categories.join(', ') : nextParticipant.wanted_categories)
                                      : 'Any'
                                  const desiredItems = nextParticipant?.desired_product || 'Open to offers'
                                  const matchScore = trade.match_score || trade.score || 0
                                  
                                  const yourProductImage = resolveParticipantImage(yourParticipant)
                                  const incomingProductImage = resolveParticipantImage(nextParticipant)
                                  
                                  return (
                                    <Card
                                      key={trade.id || trade.loop_id || trade.chain_id}
                                      variant="outline"
                                      h="100%"
                                      display="flex"
                                      flexDirection="column"
                                      _hover={{
                                        shadow: 'lg',
                                        transform: 'translateY(-4px)',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        borderColor: 'purple.400',
                                      }}
                                      transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                                      borderLeftWidth="4px"
                                      borderLeftColor="purple.400"
                                      role="article"
                                    >
                                      <Box position="relative" w="full" h={{ base: '120px', md: '140px' }} display="flex" gap={1} p={1} bg="gray.50" flexWrap="nowrap" alignContent="flex-start" overflow="hidden">
                                        {/* Your Item */}
                                        <Box flex={1} position="relative" borderRadius="md" overflow="hidden" borderWidth="2px" borderColor="blue.300" minW="0">
                                          {yourProductImage ? (
                                            <Image src={yourProductImage} alt="Your Item" objectFit="cover" w="100%" h="100%" fallback={
                                              <Box w="100%" h="100%" bg="gray.200" />
                                            } />
                                          ) : (
                                            <Box w="100%" h="100%" bg="gray.200" display="flex" alignItems="center" justifyContent="center">
                                              <Text fontSize="xs" color="gray.600" fontWeight="semibold">Your Item</Text>
                                            </Box>
                                          )}
                                          <Badge position="absolute" top={1} left={1} colorScheme="blue" fontSize="2xs" px={1} py={0.5}>
                                            Your Item
                                          </Badge>
                                        </Box>

                                        {/* Their Items */}
                                        <Box flex={1} position="relative" borderRadius="md" overflow="hidden" borderWidth="2px" borderColor="green.300" minW="0">
                                          {incomingProductImage ? (
                                            <Image src={incomingProductImage} alt="Their Item" objectFit="cover" w="100%" h="100%" fallback={
                                              <Box w="100%" h="100%" bg="gray.200" />
                                            }/>
                                          ) : (
                                            <Box w="100%" h="100%" bg="gray.200" display="flex" alignItems="center" justifyContent="center">
                                              <Text fontSize="xs" color="gray.600" fontWeight="semibold">Multi-Way</Text>
                                            </Box>
                                          )}
                                          <Badge position="absolute" top={1} right={1} colorScheme="green" fontSize="2xs" px={1} py={0.5}>
                                            Multi-Way
                                          </Badge>
                                        </Box>
                                      </Box>

                                      <CardHeader pb={2} flex={1}>
                                        <VStack spacing={2} align="stretch">
                                          <Flex justify="space-between" align="start">
                                            <HStack spacing={2}>
                                              <Badge colorScheme="purple" variant="subtle" fontSize="xs" px={2} py={1} borderRadius="full">
                                                Active Loop
                                              </Badge>
                                              <Badge colorScheme="purple" variant="solid" fontSize="xs" px={2} py={1} borderRadius="full">
                                                Multi-Way
                                              </Badge>
                                            </HStack>
                                            {matchScore > 0 && (
                                              <Badge colorScheme="purple" fontSize="2xs">
                                                {matchScore}% Match
                                              </Badge>
                                            )}
                                          </Flex>

                                          <HStack spacing={2} align="center" flexWrap="wrap" mt={2}>
                                            <Heading size="sm" noOfLines={2} lineHeight="1.3">
                                              {summary.yourGive}
                                            </Heading>
                                            <Text fontSize="xs" color="gray.500">→</Text>
                                            <Heading size="sm" noOfLines={2} lineHeight="1.3">
                                              {summary.yourGet}
                                            </Heading>
                                          </HStack>

                                          <HStack spacing={1} mt={1}>
                                            {nextParticipant && (
                                              <>
                                                <Avatar
                                                  name={nextParticipant.user_name || 'User'}
                                                  size="sm"
                                                  bg="purple.500"
                                                  color="white"
                                                />
                                                <Box flex={1} minW={0}>
                                                  <Text fontSize="xs" fontWeight="medium" color="gray.800" noOfLines={1}>
                                                    {nextParticipant.user_name || 'Unknown User'}
                                                  </Text>
                                                  <Text fontSize="2xs" color="gray.500">
                                                    {desiredItems}
                                                  </Text>
                                                </Box>
                                              </>
                                            )}
                                          </HStack>
                                        </VStack>
                                      </CardHeader>

                                      <CardFooter pt={0} pb={3}>
                                        <Button
                                          size="sm"
                                          colorScheme="brand"
                                          w="full"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleViewMultiWayTradeDetails(trade)
                                          }}
                                          leftIcon={<Icon as={ViewIcon} />}
                                          _hover={{ transform: 'scale(1.02)', shadow: 'md' }}
                                          transition="all 0.2s"
                                        >
                                          View Trade
                                        </Button>
                                      </CardFooter>
                                    </Card>
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

                        {/* Archive (Expired Trades) */}
                        <TabPanel px={0}>
                          {archivedTradesData.length === 0 ? (
                            <Box textAlign="center" py={8}>
                              <Icon as={FaClock} boxSize={12} color="gray.300" mb={4} />
                              <Text color="gray.500" fontSize="lg" fontWeight="medium" mb={2}>No archived trades</Text>
                              <Text color="gray.400" fontSize="sm">Trades that expire after 7 days of inactivity will appear here.</Text>
                            </Box>
                          ) : (
                            <VStack spacing={3} align="stretch">
                              {archivedTradesData.map((trade) => {
                                const isIncoming = incoming.some((t: Trade) => t.id === trade.id)
                                return (
                                  <Box
                                    key={trade.id}
                                    p={4}
                                    bg={cardBg}
                                    borderRadius="lg"
                                    borderWidth="1px"
                                    borderColor="red.100"
                                    _hover={{ boxShadow: 'md', transform: 'translateY(-1px)', borderColor: 'red.200' }}
                                    transition="all 0.2s ease"
                                    cursor="pointer"
                                    onClick={() => { setSelectedTrade(trade); setViewTradeModalOpen(true) }}
                                  >
                                    <HStack justify="space-between" align="start">
                                      <VStack align="start" spacing={1}>
                                        <Text fontWeight="semibold" fontSize="sm" color="gray.800">
                                          {trade.product_title || `Trade #${trade.id}`}
                                        </Text>
                                        <Text fontSize="xs" color="gray.500">
                                          {isIncoming ? 'From' : 'To'}: {isIncoming ? (trade.buyer_name || 'Anonymous') : (trade.seller_name || 'Anonymous')}
                                        </Text>
                                        <Text fontSize="xs" color="red.400">
                                          ? Expired due to 7 days of inactivity
                                        </Text>
                                      </VStack>
                                      <Badge colorScheme="gray" variant="subtle" fontSize="xs" px={2} py={1} borderRadius="full">
                                        ? Expired
                                      </Badge>
                                    </HStack>
                                  </Box>
                                )
                              })}
                            </VStack>
                          )}
                        </TabPanel>

                      </TabPanels>
                    </Tabs>
                  </VStack>
                </TabPanel>

                {/* Trade Match Tab */}
                <TabPanel px={{ base: 2, md: 4 }} py={{ base: 3, md: 4 }}>
                  <VStack spacing={6} align="stretch">
                    <Box p={3} bg="blue.50" border="1px solid" borderColor="blue.200" borderRadius="lg">
                      <VStack align="start" spacing={1}>
                        <Text fontSize="xs" color="blue.800">
                          Mutual likes mean both traders are interested in each other's items. Confirm to proceed.
                        </Text>
                      </VStack>
                    </Box>

                    {multiWayTradesLoading ? (
                      <Center py={12}>
                        <Spinner size="lg" color="brand.500" />
                      </Center>
                    ) : tradeMatchTrades.length === 0 ? (
                      <Box textAlign="center" py={12}>
                        <Icon as={FaHandshake} boxSize={16} color="blue.300" mb={4} />
                        <Text color="gray.600" fontSize="lg" fontWeight="medium" mb={2}>
                          No trade matches yet
                        </Text>
                        <Text color="gray.500" fontSize="sm">
                          Like items in Find Trades. When someone likes back, it will appear here.
                        </Text>
                      </Box>
                    ) : (
                      <VStack align="stretch" spacing={6}>
                        {groupedTradeMatchTrades.needsAction.length > 0 && (
                          <Box>
                            <Heading size="sm" mb={3} color="blue.600">
                              Needs Your Action
                            </Heading>
                            <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
                              {groupedTradeMatchTrades.needsAction.map((trade) => {
                                const summary = getSummary(trade)
                                const participants = trade.participants || []
                                const firstParticipantImage = resolveParticipantImage(participants[0])

                                return (
                                  <Card
                                    key={trade.id || trade.loop_id || trade.chain_id}
                                    variant="outline"
                                    h="100%"
                                    display="flex"
                                    flexDirection="column"
                                    _hover={{
                                      shadow: 'lg',
                                      transform: 'translateY(-4px)',
                                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                      borderColor: 'blue.500',
                                    }}
                                    transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                                    borderLeftWidth="4px"
                                    borderLeftColor="blue.400"
                                    borderColor="blue.200"
                                    cursor="pointer"
                                    onClick={() => handleViewMultiWayTradeDetails(trade)}
                                  >
                                    <Box position="relative" w="full" h={{ base: '120px', md: '140px' }} display="flex" gap={1} p={1} bg="gray.50" flexWrap="nowrap" alignContent="flex-start" overflow="hidden">
                                      {firstParticipantImage ? (
                                        <Image src={firstParticipantImage} alt="Item" w="full" h="full" objectFit="cover" />
                                      ) : (
                                        <Box w="full" h="full" bg="gray.200" display="flex" alignItems="center" justifyContent="center">
                                          <Text fontSize="xs" color="gray.500">Item</Text>
                                        </Box>
                                      )}
                                    </Box>

                                    <CardHeader pb={2} flex={1}>
                                      <Badge colorScheme="blue" variant="subtle" fontSize="xs" px={2} py={1} borderRadius="full" mb={2}>
                                        Your Action
                                      </Badge>
                                      <Heading size="sm" noOfLines={2}>
                                        {summary.yourGive}
                                      </Heading>
                                      <Text fontSize="xs" color="gray.500" mt={2}>
                                        → {summary.yourGet}
                                      </Text>
                                    </CardHeader>

                                    <CardFooter pt={0} pb={3}>
                                      <HStack w="full" spacing={2}>
                                        <Button size="sm" colorScheme="green" flex={1} onClick={(e) => { e.stopPropagation(); handleJoinMultiWayTrade(trade) }} isLoading={multiWayTradeJoining}>
                                          Accept
                                        </Button>
                                        <Button size="sm" colorScheme="red" variant="outline" flex={1} onClick={(e) => { e.stopPropagation(); handleDeclineMultiWayTrade(trade, false) }}>
                                          Decline
                                        </Button>
                                      </HStack>
                                    </CardFooter>
                                  </Card>
                                )
                              })}
                            </SimpleGrid>
                          </Box>
                        )}

                        {groupedTradeMatchTrades.waitingOnOthers.length > 0 && (
                          <Box>
                            <Heading size="sm" mb={3} color="orange.600">
                              Waiting on Others
                            </Heading>
                            <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
                              {groupedTradeMatchTrades.waitingOnOthers.map((trade) => {
                                const summary = getSummary(trade)

                                return (
                                  <Card
                                    key={trade.id || trade.loop_id || trade.chain_id}
                                    variant="outline"
                                    h="100%"
                                    display="flex"
                                    flexDirection="column"
                                    _hover={{
                                      shadow: 'lg',
                                      transform: 'translateY(-4px)',
                                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                      borderColor: 'orange.500',
                                    }}
                                    transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                                    borderLeftWidth="4px"
                                    borderLeftColor="orange.400"
                                    borderColor="orange.200"
                                    cursor="pointer"
                                    onClick={() => handleViewMultiWayTradeDetails(trade)}
                                  >
                                    <CardHeader pb={2} flex={1}>
                                      <Badge colorScheme="orange" variant="subtle" fontSize="xs" px={2} py={1} borderRadius="full" mb={2}>
                                        Waiting...
                                      </Badge>
                                      <Heading size="sm" noOfLines={2}>
                                        {summary.yourGive} → {summary.yourGet}
                                      </Heading>
                                    </CardHeader>

                                    <CardFooter pt={0} pb={3}>
                                      <Button size="sm" colorScheme="orange" w="full" onClick={(e) => { e.stopPropagation(); handleViewMultiWayTradeDetails(trade) }}>
                                        View Trade
                                      </Button>
                                    </CardFooter>
                                  </Card>
                                )
                              })}
                            </SimpleGrid>
                          </Box>
                        )}
                      </VStack>
                    )}
                  </VStack>
                </TabPanel>

                {/* Multi-Way Trades Tab */}
                <TabPanel px={{ base: 2, md: 4 }} py={{ base: 3, md: 4 }}>
                  <VStack spacing={6} align="stretch">
                    <Box p={3} bg="blue.50" border="1px solid" borderColor="blue.200" borderRadius="lg">
                              <VStack align="start" spacing={1}>
                                <Text fontSize="xs" color="blue.800">
                                  Tip: Add desired items to your listings so loop matches can be found faster.
                                </Text>
                                {!user?.is_premium && (
                                  <Text fontSize="xs" color="blue.900" fontWeight="semibold">
                                    Matches here are based on your listings. Starting a new loop search is a Premium feature.
                                  </Text>
                                )}
                              </VStack>
                            </Box>

                            {!user?.is_premium && loopQuota && !loopQuota.unlimited && (
                    <VStack align="stretch" spacing={2} mb={4}>
                      <Box p={3} bg="purple.50" border="1px solid" borderColor="purple.200" borderRadius="lg">
                        <Text fontSize="sm" color="purple.800" fontWeight="bold">
                          {loopQuota.used} of {loopQuota.limit} free loop matches used this month
                        </Text>
                      </Box>
                      {loopQuota.used >= loopQuota.limit && (
                        <Box p={3} bg="red.50" border="1px solid" borderColor="red.200" borderRadius="lg">
                          <Text fontSize="xs" color="red.700">
                            You have used all free loop matches this month. Upgrade to Pro for unlimited matches.
                          </Text>
                        </Box>
                      )}
                    </VStack>
                            )}

                            {!user?.is_premium && (multiWayTrades || []).some((t: any) => t?.loop_type === 'detected_loop' && t?.pro_nudge) && (
                              <Box p={3} bg="yellow.50" border="1px solid" borderColor="yellow.200" borderRadius="lg" mb={4}>
                                <Text fontSize="xs" color="yellow.800" fontWeight="bold">
                                  You're a great match to start a loop here � Pro members can initiate. Upgrade to unlock.
                                </Text>
                              </Box>
                            )}

                            {/* Open Loops You Can Hop Into */}
                            {discoverableLoading ? (
                              <Center py={6}>
                                <Spinner size="md" color="teal.400" />
                              </Center>
                            ) : discoverableLoops.length > 0 && (
                              <Box mb={6}>
                              <Heading size="sm" mb={3} color="teal.600" display="flex" alignItems="center" gap={2}>
                                <Icon as={FaExchangeAlt} /> Open Loops You Can Join
                              </Heading>
                              <SimpleGrid columns={{ base: 1, sm: 2, md: 2, lg: 3 }} spacing={{ base: 3, md: 4 }}>
                                {discoverableLoops.map((loop: any) => (
                                  <Box
                                    key={`discoverable-${loop.chain_id}`}
                                    p={4}
                                    bg="teal.50"
                                    borderRadius="lg"
                                    borderWidth="2px"
                                    borderColor="teal.200"
                                    position="relative"
                                  >
                                    <Badge colorScheme="teal" mb={2} fontSize="10px">OPEN LOOP</Badge>
                                    {loop.match_score && (
                                      <Badge colorScheme="green" ml={2} mb={2} fontSize="10px">
                                        {loop.match_score}% match
                                      </Badge>
                                    )}
                                    <VStack align="start" spacing={1} mb={3}>
                                      <Text fontSize="xs" color="gray.500">You give</Text>
                                      <Text fontSize="sm" fontWeight="semibold" color="teal.700" noOfLines={2}>
                                        {loop.you_give_title}
                                      </Text>
                                      <Text fontSize="xs" color="gray.500" mt={1}>You get</Text>
                                      <Text fontSize="sm" fontWeight="semibold" noOfLines={2}>
                                        {loop.you_get_title}
                                      </Text>
                                      <Text fontSize="xs" color="gray.400" mt={1}>
                                        {loop.user1_name} → {loop.user2_name} → You
                                      </Text>
                                    </VStack>
                                    <Button
                                      size="sm"
                                      colorScheme="teal"
                                      width="full"
                                      isLoading={hoppingInto === loop.chain_id}
                                      isDisabled={!!hoppingInto}
                                      onClick={() => handleHopIntoDiscoverable(loop)}
                                    >
                                      Hop In
                                    </Button>
                                  </Box>
                                ))}
                              </SimpleGrid>
                            </Box>
                          )}

                            {multiWayTradesLoading ? (
                              <Center py={12}>
                                <Spinner size="lg" color="brand.500" />
                              </Center>
                            ) : pendingMultiWayTrades.length === 0 && filteredMultiWayTrades.length === 0 && discoverableLoops.length === 0 ? (
                              <Box textAlign="center" py={12}>
                                <Icon as={FaExchangeAlt} boxSize={16} color="purple.300" mb={4} />
                                <Text color="gray.600" fontSize="lg" fontWeight="medium" mb={2}>
                                  No loop matches yet
                                </Text>
                                <Text color="gray.500" fontSize="sm">
                                  Like items in Find Trades to start a loop. We will notify you when someone likes back.
                                </Text>
                              </Box>
                            ) : (
                              <VStack align="stretch" spacing={6}>
                                {groupedMultiWayTrades.needsAction.length > 0 && (
                                  <Box>
                                    <Heading size="sm" mb={3} color="blue.600">
                                      Needs Your Action
                                    </Heading>
                                    <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
                                      {groupedMultiWayTrades.needsAction.map((trade) => {
                                        const summary = getSummary(trade)
                                        const participants = trade.participants || []
                                        const firstParticipantImage = resolveParticipantImage(participants[0])
                                        
                                        return (
                                          <Card
                                            key={trade.id || trade.loop_id || trade.chain_id}
                                            variant="outline"
                                            h="100%"
                                            display="flex"
                                            flexDirection="column"
                                            _hover={{
                                              shadow: 'lg',
                                              transform: 'translateY(-4px)',
                                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                              borderColor: 'blue.500',
                                            }}
                                            transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                                            borderLeftWidth="4px"
                                            borderLeftColor="blue.400"
                                            borderColor="blue.200"
                                            cursor="pointer"
                                            onClick={() => handleViewMultiWayTradeDetails(trade)}
                                          >
                                            <Box position="relative" w="full" h={{ base: '120px', md: '140px' }} display="flex" gap={1} p={1} bg="gray.50" flexWrap="nowrap" alignContent="flex-start" overflow="hidden">
                                              {firstParticipantImage ? (
                                                <Image src={firstParticipantImage} alt="Item" w="full" h="full" objectFit="cover" />
                                              ) : (
                                                <Box w="full" h="full" bg="gray.200" display="flex" alignItems="center" justifyContent="center">
                                                  <Text fontSize="xs" color="gray.500">Item</Text>
                                                </Box>
                                              )}
                                            </Box>

                                            <CardHeader pb={2} flex={1}>
                                              <Badge colorScheme="blue" variant="subtle" fontSize="xs" px={2} py={1} borderRadius="full" mb={2}>
                                                Your Action
                                              </Badge>
                                              <Heading size="sm" noOfLines={2}>
                                                {summary.yourGive}
                                              </Heading>
                                              <Text fontSize="xs" color="gray.500" mt={2}>
                                                → {summary.yourGet}
                                              </Text>
                                            </CardHeader>

                                            <CardFooter pt={0} pb={3}>
                                              <HStack w="full" spacing={2}>
                                                <Button size="sm" colorScheme="green" flex={1} onClick={(e) => { e.stopPropagation(); handleJoinMultiWayTrade(trade) }} isLoading={multiWayTradeJoining}>
                                                  Accept
                                                </Button>
                                                <Button size="sm" colorScheme="red" variant="outline" flex={1} onClick={(e) => { e.stopPropagation(); handleDeclineMultiWayTrade(trade, false) }}>
                                                  Decline
                                                </Button>
                                              </HStack>
                                            </CardFooter>
                                          </Card>
                                        )
                                      })}
                                    </SimpleGrid>
                                  </Box>
                                )}

                                {groupedMultiWayTrades.waitingOnOthers.length > 0 && (
                                  <Box>
                                    <Heading size="sm" mb={3} color="orange.600">
                                      Waiting on Others
                                    </Heading>
                                    <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
                                      {groupedMultiWayTrades.waitingOnOthers.map((trade) => {
                                        const summary = getSummary(trade)
                                        const participants = trade.participants || []
                                        
                                        return (
                                          <Card
                                            key={trade.id || trade.loop_id || trade.chain_id}
                                            variant="outline"
                                            h="100%"
                                            display="flex"
                                            flexDirection="column"
                                            _hover={{
                                              shadow: 'lg',
                                              transform: 'translateY(-4px)',
                                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                              borderColor: 'orange.500',
                                            }}
                                            transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                                            borderLeftWidth="4px"
                                            borderLeftColor="orange.400"
                                            borderColor="orange.200"
                                            cursor="pointer"
                                            onClick={() => handleViewMultiWayTradeDetails(trade)}
                                          >
                                            <CardHeader pb={2} flex={1}>
                                              <Badge colorScheme="orange" variant="subtle" fontSize="xs" px={2} py={1} borderRadius="full" mb={2}>
                                                Waiting...
                                              </Badge>
                                              <Heading size="sm" noOfLines={2}>
                                                {summary.yourGive} → {summary.yourGet}
                                              </Heading>
                                            </CardHeader>

                                            <CardFooter pt={0} pb={3}>
                                              <Button size="sm" colorScheme="orange" w="full" onClick={(e) => { e.stopPropagation(); handleViewMultiWayTradeDetails(trade) }}>
                                                View Trade
                                              </Button>
                                            </CardFooter>
                                          </Card>
                                        )
                                      })}
                                    </SimpleGrid>
                                  </Box>
                                )}

                                {groupedMultiWayTrades.autoSearchResults.length > 0 && (
                                  <Box>
                                    <Heading size="sm" mb={3} color="purple.600">
                                      Auto Search Results
                                    </Heading>
                                    <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
                                      {groupedMultiWayTrades.autoSearchResults.map((trade) => {
                                        const summary = getSummary(trade)
                                        const matchScore = trade.match_score || trade.score || 0

                                        return (
                                          <Box
                                            key={trade.id || trade.loop_id || trade.chain_id}
                                            p={4}
                                            bg={cardBg}
                                            borderRadius="lg"
                                            borderWidth="1px"
                                            borderColor="purple.200"
                                            cursor="pointer"
                                            transition="all 0.2s"
                                            _hover={{ borderColor: 'purple.400', transform: 'translateY(-2px)', shadow: 'md' }}
                                            onClick={() => handleViewMultiWayTradeDetails(trade)}
                                          >
                                            <VStack align="stretch" spacing={3}>
                                              <HStack justify="space-between">
                                                <Badge colorScheme="purple" variant="subtle">Auto Match</Badge>
                                                {matchScore > 0 && (
                                                  <Badge colorScheme={matchScore > 80 ? 'green' : 'orange'}>
                                                    {matchScore}% Match
                                                  </Badge>
                                                )}
                                              </HStack>
                                              
                                              <Box w="full" textAlign="center" py={2}>
                                                <Text fontSize="xs" color="gray.600">
                                                  {trade.participants?.length >= 3
                                                    ? trade.participants.map((p: any) => p.product_title).join(' → ')
                                                    : `${summary.yourGive} → ${summary.yourGet}`}
                                                </Text>
                                              </Box>
                                              
                                              <Button size="sm" colorScheme="purple" w="full" onClick={(e) => { e.stopPropagation(); handleViewMultiWayTradeDetails(trade) }}>
                                                Review & Start
                                              </Button>
                                            </VStack>
                                          </Box>
                                        )
                                      })}
                                    </SimpleGrid>
                                  </Box>
                                )}
                              </VStack>
                            )}
                        </VStack>
                </TabPanel>

                {/* Trade History Tab */}
                <TabPanel px={{ base: 2, md: 4 }} py={{ base: 3, md: 4 }}>
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
                    ) : tradeHistoryViewMode === 'list' ? (
                      <>
                        {/* List View for Trade History */}
                        <Box border="1px" borderColor={borderColor} borderRadius="lg" overflow="hidden" bg={cardBg}>
                          <Box
                            px={4}
                            py={3}
                            bg="gray.50"
                            borderBottomWidth="1px"
                            borderColor="gray.200"
                            fontSize="xs"
                            fontWeight="semibold"
                            color="gray.600"
                            textTransform="uppercase"
                            display={{ base: 'none', md: 'flex' }}
                          >
                            What � Who � Where � When � Action
                          </Box>
                          {paginatedTradeHistory.map((trade, idx) => {
                            const partner = getTradePartnerInfo(trade)
                            const where = getTradeWhere(trade)
                            const when = getTradeWhen(trade)
                            const gaveTitle = getProductTitle(trade.target_product_id, trade.product_title)
                            const receivedTitle = getTradeReceivedTitle(trade)

                            return (
                              <Flex
                                key={trade.id}
                                align="center"
                                gap={{ base: 2, md: 4 }}
                                p={3}
                                borderBottom={idx < paginatedTradeHistory.length - 1 ? '1px' : 'none'}
                                borderColor={borderColor}
                                _hover={{ bg: 'gray.50' }}
                                minW={0}
                                flexWrap="wrap"
                              >
                                <Box
                                  w="60px"
                                  h="60px"
                                  flexShrink={0}
                                  borderRadius="md"
                                  overflow="hidden"
                                  bg="gray.100"
                                >
                                  <ProductThumb
                                    pid={trade.target_product_id}
                                    src={trade.product_image_url}
                                    alt={getProductTitle(trade.target_product_id, trade.product_title)}
                                    size="100%"
                                  />
                                </Box>
                                <VStack align="start" spacing={1} flex={1} minW={0}>
                                  <Text fontWeight="semibold" noOfLines={1} fontSize={{ base: 'sm', md: 'md' }}>
                                    {gaveTitle}
                                  </Text>
                                  <Text fontSize="xs" color="gray.600" noOfLines={1}>
                                    Received: {receivedTitle}
                                  </Text>
                                  <HStack spacing={2} flexWrap="wrap">
                                    <Badge colorScheme="blue" fontSize="2xs" px={1.5}>WHO: {partner.name}</Badge>
                                    <Badge colorScheme="purple" fontSize="2xs" px={1.5}>WHERE: {where}</Badge>
                                    <Badge colorScheme="green" fontSize="2xs" px={1.5}>WHEN: {when.date}</Badge>
                                  </HStack>
                                </VStack>
                                <VStack align="end" spacing={0} flexShrink={0}>
                                  <Text fontSize="xs" color="gray.600">{when.date}</Text>
                                  <Text fontSize="2xs" color="gray.500">{when.time || 'N/A'}</Text>
                                </VStack>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  colorScheme="brand"
                                  fontSize={{ base: 'xs', md: 'sm' }}
                                  px={{ base: 2, md: 3 }}
                                  onClick={() => { setSelectedTrade(trade); setDetailsOpen(true) }}
                                >
                                  View
                                </Button>
                              </Flex>
                            )
                          })}
                        </Box>
                        <PaginationControls
                          currentPage={tradeHistoryPage}
                          totalPages={tradeHistoryTotalPages}
                          onPageChange={setTradeHistoryPage}
                          itemsCount={allCompletedTrades.length}
                        />
                      </>
                    ) : (
                      <>
                        {/* Desktop Table View */}
                        <VStack spacing={0} align="stretch" borderWidth="1px" borderColor={borderColor} rounded="lg" overflow="hidden" display={{ base: 'none', md: 'flex' }}>
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
                            <Box flex={1} minW={{ base: '120px', md: '150px' }}>WHAT: You Gave</Box>
                            <Box w="40px" display="flex" justifyContent="center" flexShrink={0}>?</Box>
                            <Box flex={1} minW={{ base: '120px', md: '150px' }}>WHAT: You Received</Box>
                            <Box w="120px" flexShrink={0}>WHO</Box>
                            <Box w="140px" flexShrink={0}>WHERE</Box>
                            <Box w="100px" flexShrink={0}>WHEN</Box>
                            <Box w="80px" flexShrink={0} textAlign="center">Action</Box>
                          </HStack>
                          {/* Trade Rows */}
                          {paginatedTradeHistory.map((trade, idx) => {
                            const partner = getTradePartnerInfo(trade)
                            const where = getTradeWhere(trade)
                            const when = getTradeWhen(trade)

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
                                    src={trade.product_image_url}
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
                                  ?
                                </Center>

                                {/* Received Item Info */}
                                <VStack align="start" spacing={0} flex={1.2} minW={{ base: '120px', md: '150px' }}>
                                  <Text fontSize={{ base: 'xs', md: 'sm' }} fontWeight="semibold" color="gray.800" noOfLines={1}>
                                    {getTradeReceivedTitle(trade)}
                                  </Text>
                                  <Badge colorScheme="green" fontSize="2xs" w="fit-content">
                                    Received
                                  </Badge>
                                </VStack>

                                {/* Partner Name */}
                                <VStack align="start" spacing={0} w={{ base: '100px', md: '140px' }} flexShrink={0}>
                                  <Text fontSize={{ base: 'xs', md: 'sm' }} fontWeight="medium" color="gray.800" noOfLines={1}>
                                    {partner.name}
                                  </Text>
                                  <Badge colorScheme="gray" fontSize="2xs" w="fit-content">
                                    {partner.role}
                                  </Badge>
                                </VStack>

                                {/* Location */}
                                <Text fontSize="xs" color="gray.700" w={{ base: '120px', md: '160px' }} noOfLines={2} flexShrink={0}>
                                  {where}
                                </Text>

                                {/* Date */}
                                <VStack align="start" spacing={0} w={{ base: '90px', md: '110px' }} flexShrink={0}>
                                  <Text fontSize={{ base: '2xs', md: 'xs' }} color="gray.600">{when.date}</Text>
                                  <Text fontSize="2xs" color="gray.500">
                                    {when.time || 'N/A'}
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

                        {/* Mobile Card View */}
                        <VStack spacing={4} align="stretch" display={{ base: 'flex', md: 'none' }}>
                          {paginatedTradeHistory.map((trade) => {
                            const partner = getTradePartnerInfo(trade)
                            const where = getTradeWhere(trade)
                            const when = getTradeWhen(trade)

                            return (
                              <Box
                                key={trade.id}
                                p={4}
                                bg="white"
                                borderWidth="1px"
                                borderColor={borderColor}
                                borderRadius="lg"
                                transition="all 0.2s"
                                _hover={{ shadow: 'md' }}
                              >
                                <VStack align="stretch" spacing={3}>
                                  {/* Header with product thumbnail and partner */}
                                  <HStack spacing={3} justify="space-between">
                                    <Box w="50px" h="50px" flexShrink={0} borderRadius="md" overflow="hidden" borderWidth="1px" borderColor={borderColor}>
                                      <ProductThumb
                                        pid={trade.target_product_id}
                                        src={trade.product_image_url}
                                        alt={getProductTitle(trade.target_product_id, trade.product_title)}
                                        size="full"
                                      />
                                    </Box>
                                    <VStack align="start" spacing={0} flex={1}>
                                      <Text fontSize="xs" fontWeight="semibold" color="gray.600">WHO</Text>
                                      <Text fontSize="sm" fontWeight="medium" color="gray.800" noOfLines={1}>
                                        {partner.name}
                                      </Text>
                                      <Text fontSize="2xs" color="gray.500">{partner.direction}</Text>
                                    </VStack>
                                  </HStack>

                                  <SimpleGrid columns={2} spacing={2}>
                                    <Box bg="gray.50" p={2} borderRadius="md">
                                      <Text fontSize="2xs" color="gray.500" textTransform="uppercase">Where</Text>
                                      <Text fontSize="xs" color="gray.700" noOfLines={2}>{where}</Text>
                                    </Box>
                                    <Box bg="gray.50" p={2} borderRadius="md">
                                      <Text fontSize="2xs" color="gray.500" textTransform="uppercase">When</Text>
                                      <Text fontSize="xs" color="gray.700">{when.date}</Text>
                                      <Text fontSize="2xs" color="gray.500">{when.time || 'N/A'}</Text>
                                    </Box>
                                  </SimpleGrid>

                                  {/* Trade details */}
                                  <Box bg="gray.50" p={3} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
                                    <VStack align="stretch" spacing={2}>
                                      <VStack align="start" spacing={1}>
                                        <Text fontSize="xs" fontWeight="semibold" color="gray.600" textTransform="uppercase">
                                          What: You Gave
                                        </Text>
                                        <Text fontSize="sm" color="gray.800">
                                          {getProductTitle(trade.target_product_id, trade.product_title)}
                                        </Text>
                                      </VStack>

                                      <HStack justify="center">
                                        <Text fontSize="md" color="brand.400">?</Text>
                                      </HStack>

                                      <VStack align="start" spacing={1}>
                                        <Text fontSize="xs" fontWeight="semibold" color="gray.600" textTransform="uppercase">
                                          What: You Received
                                        </Text>
                                        <Text fontSize="sm" color="gray.800">
                                          {getTradeReceivedTitle(trade)}
                                        </Text>
                                      </VStack>
                                    </VStack>
                                  </Box>

                                  {/* Action button */}
                                  <Button
                                    size="sm"
                                    colorScheme="brand"
                                    variant="outline"
                                    w="full"
                                    onClick={() => { setSelectedTrade(trade); setDetailsOpen(true) }}
                                  >
                                    View Details
                                  </Button>
                                </VStack>
                              </Box>
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
              invalidateOffers()
              invalidateDashboard()

              // After accepting, show Trade Details (chat/meetup/delivery) for both parties
              if (selectedTrade) {
                try {
                  const res = await api.get(`/api/trades/${selectedTrade.id}`)
                  const freshTrade = res.data?.data
                  if (freshTrade) setSelectedTrade(freshTrade)
                } catch {
                  // Non-fatal
                }
                setViewTradeModalOpen(true)
              }
            }}
            onDeclined={() => { invalidateOffers(); invalidateDashboard() }}
          />

          <ViewTradeModal
            trade={selectedTrade}
            isOpen={viewTradeModalOpen}
            onClose={() => setViewTradeModalOpen(false)}
            onStatusUpdate={() => { invalidateOffers(); invalidateDashboard() }}
            onTradeUpdate={setSelectedTrade}
          />

          <DisputeReportModal
            isOpen={disputeReportModalOpen}
            onClose={() => setDisputeReportModalOpen(false)}
            tradeId={tradeToDispute?.id || null}
            otherPartyName={tradeToDispute ? (tradeToDispute.buyer_id === user?.id ? tradeToDispute.seller_name : tradeToDispute.buyer_name) : 'the other party'}
          />

          {/* Multi-way Loop Manager (Pro) */}
          {selectedMultiWayTrade && (
            <MultiWayTradeModal
              isOpen={multiWayManagerOpen}
              onClose={() => {
                setMultiWayManagerOpen(false)
                setSelectedMultiWayTrade(null)
              }}
              multiWayTrade={selectedMultiWayTrade}
              canManage={Boolean(user?.is_premium) && !selectedMultiWayTrade?.is_chain}
              currentUserId={user?.id}
              onTradeCompleted={() => {
                void fetchMultiWayTrades()
                invalidateOffers()
                invalidateProducts()
              }}
            />
          )}

          <TradeCompletionModal
            trade={selectedTrade}
            isOpen={completionModalOpen}
            onClose={() => setCompletionModalOpen(false)}
            onCompleted={() => { invalidateOffers(); invalidateDashboard() }}
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

          {/* Processing Modal - Shows while accepting/declining/canceling */}
          <Modal isOpen={processModalOpen} onClose={() => { }} size="sm" isCentered closeOnEsc={false} closeOnOverlayClick={false}>
            <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
            <ModalContent
              bg="white"
              borderRadius="xl"
              boxShadow="xl"
              mx={4}
            >
              <ModalBody p={8} textAlign="center">
                <VStack spacing={4}>
                  <Spinner
                    size="lg"
                    color="brand.500"
                    thickness="4px"
                  />
                  <VStack spacing={2}>
                    <Text fontWeight="semibold" fontSize="md" color="gray.800">
                      Processing...
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      Please wait while we process your request
                    </Text>
                  </VStack>
                </VStack>
              </ModalBody>
            </ModalContent>
          </Modal>

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
                      isDisabled={isProcessing}
                      isLoading={isProcessing}
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
                    colorScheme="green"
                    variant="outline"
                    size="md"
                    flex={1}
                    onClick={handleConvertToMultiWay}
                    isDisabled={isProcessing}
                  >
                    Convert to Multi-Way
                  </Button>
                    <Button
                      colorScheme="red"
                      size="md"
                      flex={1}
                      onClick={handleConfirmDecline}
                      leftIcon={<Icon as={FaTimes} />}
                      isDisabled={isProcessing}
                      isLoading={isProcessing}
                    >
                      Decline Offer
                    </Button>
                  </HStack>
                </VStack>
              </ModalBody>
            </ModalContent>
          </Modal>

          {/* Notifications are handled on their own page at /notifications */}
          {/* Bottom spacer so content isn't hidden behind FloatingTab on mobile */}
          <Box display={{ base: 'block', sm: 'none' }} h="80px" flexShrink={0} />
        </VStack>
      </Container>

      <FloatingTab showAddButton={actualUserProducts.length > 0} />


      <SuggestedTradesModal
        isOpen={isFindTradesOpen}
        onClose={() => setIsFindTradesOpen(false)}
        product={findTradesProduct}
        onTradeClick={(p) => handleTradeClick(p)}
      />

      <TradeModal
        isOpen={isTradeModalOpen}
        onClose={() => setTradeModalOpen(false)}
        targetProductId={tradeTargetProductId}
      />

      <ImageZoomModal
        isOpen={isZoomOpen}
        onClose={() => setIsZoomOpen(false)}
        imageUrl={zoomImageUrl}
        altText={zoomAltText}
      />

      {/* Premium Opportunity Modal */}
      <Modal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} isCentered size="md">
        <ModalOverlay backdropFilter="blur(8px)" />
        <ModalContent borderRadius="2xl" overflow="hidden" boxShadow="2xl">
          <ModalBody p={0}>
            <Box position="relative">
              <Box bg="purple.600" h="140px" display="flex" alignItems="center" justifyContent="center">
                <Icon as={FaCrown} color="yellow.400" fontSize="60px" filter="drop-shadow(0 0 10px rgba(236, 201, 75, 0.4))" />
              </Box>
              <ModalCloseButton color="white" top={4} right={4} />
              
              <VStack spacing={6} p={8} textAlign="center">
                <VStack spacing={2}>
                  <Heading size="lg" fontWeight="extrabold">Level Up to Premium!</Heading>
                  <Text color="gray.500" fontSize="md">
                    Unlock exclusive features like unlimited trade offers, priority listing, and verified badge.
                  </Text>
                </VStack>

                <SimpleGrid columns={2} spacing={3} w="full">
                  {[
                    'Unlimited Offers',
                    'Priority Listing',
                    'Can Sell (Buyout)',
                    'Express Delivery',
                    'Lower Fees',
                    'Verified Badge'
                  ].map((f, i) => (
                    <HStack key={i} spacing={2}>
                      <Icon as={CheckIcon} color="green.500" boxSize={3} />
                      <Text fontSize="xs" fontWeight="bold" color="gray.600">{f}</Text>
                    </HStack>
                  ))}
                </SimpleGrid>

                <VStack spacing={3} w="full">
                  <Button 
                    colorScheme="purple" 
                    w="full" 
                    size="lg" 
                    h="56px"
                    fontSize="lg"
                    borderRadius="xl"
                    leftIcon={<FaCrown />}
                    onClick={() => {
                      setShowPremiumModal(false)
                      navigate('/premium')
                    }}
                    _hover={{ transform: 'translateY(-2px)', boxShadow: 'lg' }}
                  >
                    Take Me There
                  </Button>
                  <Button 
                    variant="ghost" 
                    w="full"
                    onClick={() => setShowPremiumModal(false)}
                  >
                    Maybe Later
                  </Button>
                </VStack>
              </VStack>
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  )
}

export default Dashboard
