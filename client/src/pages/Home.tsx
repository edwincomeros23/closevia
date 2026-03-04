import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Box,
  Heading,
  Input,
  Select,
  HStack,
  VStack,
  Text,
  Button,
  Image,
  Badge,
  Flex,
  Spinner,
  Center,
  useToast,
  IconButton,
  Grid,
  useDisclosure,
  InputGroup,
  InputLeftElement,
  FormControl,
  FormLabel,
  Tooltip,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  Divider,
  Icon,
  Avatar,
} from '@chakra-ui/react'
import {
  SearchIcon,
  RepeatIcon,
  StarIcon,
  ViewIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  AddIcon,
  HamburgerIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CloseIcon,
} from '@chakra-ui/icons'
import { FaUserCircle, FaHandshake, FaHome } from 'react-icons/fa'
import { FiShoppingBag } from 'react-icons/fi'
import { FILTER_CATEGORIES } from '../utils/categories'
import { useProducts } from '../contexts/ProductContext'
import { useAuth } from '../contexts/AuthContext'
import { SearchFilters } from '../types'
import { getFirstImage, getImageUrl } from '../utils/imageUtils'
import { formatPHP } from '../utils/currency'
import { getProductUrl } from '../utils/productUtils'
import { useMobileNav } from '../contexts/MobileNavContext'
import { api } from '../services/api'
import TradeModal from '../components/TradeModal'
import { useRealtime } from '../contexts/RealtimeContext' // added import
import FloatingTab from '../components/FloatingTab'
import { useStudentAdInjection, StudentAdCard } from '../components/StudentAdInjector'

// Custom debounce hook
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

const Home: React.FC = () => {
  const { products, loading, error, searchProducts, loadMore, hasMore, isLoadingMore } = useProducts()
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { onOpen: openMobileNav } = useMobileNav()
  const { isOpen: isLogoutModalOpen, onOpen: onOpenLogoutModal, onClose: onCloseLogoutModal } = useDisclosure()
  const { offerCount } = useRealtime() // added realtime usage

  // Search state management
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<SearchFilters>({
    keyword: '',
    min_price: undefined,
    max_price: undefined,
    premium: undefined,
    status: 'available', // default to available so home shows items
    barter_only: undefined, // Show all by default
    location: '',
    page: 1,
    limit: 20, // Load more products
  })
  const [hasSearched, setHasSearched] = useState(false)

  // Debounce search term for smooth UX
  const debouncedSearchTerm = useDebounce(searchTerm, 400)

  const toast = useToast()

  // Category pills - shared config
  const categories = FILTER_CATEGORIES
  const [selectedCategory, setSelectedCategory] = useState<string>('All')

  const handleCategorySelect = (categoryValue: string) => {
    setSelectedCategory(categoryValue)
    if (categoryValue === 'All') {
      setSearchTerm('')
      setFilters(prev => ({ ...prev, keyword: '', category: '', page: 1 }))
      setHasSearched(true)
      return
    }
    setSearchTerm('')
    setFilters(prev => ({ ...prev, keyword: '', category: categoryValue, page: 1 }))
    setHasSearched(true)
  }

  // Load products on component mount or when navigating back to /home
  useEffect(() => {
    // Reset category and search state to defaults on mount
    setSelectedCategory('All')
    setSearchTerm('')
    // Fetch the default "All" feed every time the Home page mounts
    console.log('🔍 Fetching initial products with status: available, limit: 20')
    searchProducts({ status: 'available', limit: 20, page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Infinite scroll: IntersectionObserver for sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!sentinelRef.current) return
    const el = sentinelRef.current
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry.isIntersecting) {
        if (!loading && !isLoadingMore && hasMore) {
          loadMore()
        }
      }
    }, { root: null, rootMargin: '200px', threshold: 0 })
    observer.observe(el)
    return () => observer.unobserve(el)
  }, [sentinelRef, loading, isLoadingMore, hasMore, loadMore])

  // DISABLED: Do NOT refetch on tab/window focus to keep persistent cache
  // The cached products will remain on screen even when switching tabs
  useEffect(() => {
    // Window focus events disabled to maintain persistent data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update filters when debounced search term changes
  useEffect(() => {
    if (debouncedSearchTerm.trim() === '') {
      // Search was cleared — reset to show all products
      setFilters(prev => {
        // Only trigger refetch if there was a keyword before
        if (prev.keyword) {
          return { ...prev, keyword: '', page: 1 }
        }
        return prev
      })
      setHasSearched(true)
      return
    }
    setFilters(prev => ({ ...prev, keyword: debouncedSearchTerm, page: 1 }))
    setHasSearched(true)
  }, [debouncedSearchTerm])

  // Search when filters change — only run when hasSearched is true
  useEffect(() => {
    if (!hasSearched) return

    // perform the search once, then reset the flag
    searchProducts(filters)
    setHasSearched(false)

    // intentionally exclude searchProducts from deps to avoid loops if it's not stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, hasSearched])

  const handleSearch = () => {
    setSelectedCategory('All')
    setFilters(prev => ({ ...prev, keyword: searchTerm, category: '', page: 1 }))
    setHasSearched(true)
  }

  // Trigger search on Enter key
  const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // change: mark filter changes as user-initiated so the effect runs
  const handleFilterChange = (key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
    setHasSearched(true)
  }

  // Trade modal state
  const [tradeTargetProductId, setTradeTargetProductId] = useState<number | null>(null)
  const [selectedProductForOffers, setSelectedProductForOffers] = useState<number | null>(null)
  const [offersModalOpen, setOffersModalOpen] = useState(false)
  const [offersForProduct, setOffersForProduct] = useState<any[]>([])
  const [loadingOffers, setLoadingOffers] = useState(false)

  // Slider state: cycles public/1.jpg, public/2.jpg, public/3.jpg every 3s
  const sliderImages = ['/1.jpg', '/2.jpg', '/3.jpg']
  const [slideIndex, setSlideIndex] = useState(0)
  const sliderIntervalRef = useRef<number | null>(null)
  const resumeTimeoutRef = useRef<number | null>(null)
  const touchStartX = useRef<number | null>(null)

  const startAuto = () => {
    // Auto-advance disabled to prevent dizziness
    // Slider now only changes on user interaction (swipe/click)
  }

  const stopAuto = () => {
    if (sliderIntervalRef.current) {
      window.clearInterval(sliderIntervalRef.current)
      sliderIntervalRef.current = null
    }
  }

  const scheduleResume = (delay = 2000) => {
    // Resume logic disabled - slider stays on user-selected slide
    stopAuto()
  }

  useEffect(() => {
    // Auto-start disabled - slider stays on initial image
    return () => {
      stopAuto()
      if (resumeTimeoutRef.current) window.clearTimeout(resumeTimeoutRef.current)
    }
  }, [])

  const goNext = () => {
    setSlideIndex(i => (i + 1) % sliderImages.length)
    scheduleResume(2000)
  }

  const goPrev = () => {
    setSlideIndex(i => (i - 1 + sliderImages.length) % sliderImages.length)
    scheduleResume(2000)
  }

  const onWheelSlide = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 10) return
    if (e.deltaY > 0) goNext()
    else goPrev()
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return
    const endX = e.changedTouches[0]?.clientX ?? 0
    const diff = touchStartX.current - endX
    if (Math.abs(diff) > 40) {
      if (diff > 0) goNext()
      else goPrev()
    }
    touchStartX.current = null
  }

  const openTradeModal = async (productId: number) => {
    setTradeTargetProductId(productId)
    onOpen()
  }

  const handleTradeClick = (productId: number) => {
    if (!user) {
      onOpen() // Show login modal
    } else {
      openTradeModal(productId)
    }
  }

  const handleBuyClick = (productId: number) => {
    if (!user) {
      onOpen() // Show login modal
    } else {
      // Proceed with purchase
      toast({
        title: 'Purchase initiated!',
        description: 'Contact the seller to complete the purchase.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
    }
  }

  const handleViewOffers = async (productId: number) => {
    try {
      setLoadingOffers(true)
      setSelectedProductForOffers(productId)
      const response = await api.get(`/api/trades?target_product_id=${productId}`)
      setOffersForProduct(response.data?.data || [])
      setOffersModalOpen(true)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load offers for this product',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    } finally {
      setLoadingOffers(false)
    }
  }

  const clearFilters = () => {
    setSearchTerm('')
    setSelectedCategory('All')
    setFilters({
      keyword: '',
      category: '',
      min_price: undefined,
      max_price: undefined,
      premium: undefined,
      status: 'available',
      barter_only: undefined,
      location: '',
      page: 1,
      limit: 20,
    })
    setHasSearched(false)
  }

  const handleLogout = () => {
    logout()
    onCloseLogoutModal()
    navigate('/login')
  }

  // Add state for offer sorting
  const [offersSortBy, setOffersSortBy] = useState<'newest' | 'oldest' | 'accepted'>('accepted')

  const getRankedOffers = () => {
    const ranked = [...offersForProduct]

    if (offersSortBy === 'accepted') {
      ranked.sort((a, b) => {
        const statusOrder = { 'accepted': 0, 'active': 1, 'pending': 2, 'declined': 3, 'cancelled': 3 }
        const aOrder = statusOrder[a.status as keyof typeof statusOrder] ?? 4
        const bOrder = statusOrder[b.status as keyof typeof statusOrder] ?? 4
        return aOrder - bOrder
      })
    } else if (offersSortBy === 'newest') {
      ranked.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    } else if (offersSortBy === 'oldest') {
      ranked.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }

    return ranked
  }

  // Product card with square image and fixed info area for uniform height
  const renderProductCard = (product: any) => {
    const sellerAvatar = product.seller_profile_picture
      ? getImageUrl(product.seller_profile_picture)
      : undefined
    const sellerAvatarSrc = sellerAvatar

    return (
      <Box
        key={product.id}
        bg="white"
        rounded="lg"
        shadow="sm"
        borderWidth="1px"
        borderColor="gray.100"
    <Box
      key={product.id}
      bg="white"
      rounded="lg"
      shadow="sm"
      borderWidth="1px"
      borderColor="gray.100"
      overflow="hidden"
      transition="all 0.2s ease"
      w="full"
      maxW={{ base: "100%", md: "250px" }}
      h="full"
      display="flex"
      flexDirection="column"
      mx="auto"
      _hover={{ boxShadow: 'md', transform: 'translateY(-2px)', cursor: 'pointer' }}
      onClick={() => navigate(getProductUrl(product))}
      sx={{
        '@media (max-width: 850px)': {
          width: '100%',
          minWidth: 0,
          maxWidth: '100%',
        },
      }}
    >
      {/* Square Product Image - Fixed aspect ratio, object-fit: cover for uniform thumbnails */}
      <Box
        position="relative"
        w="full"
        maxW={{ base: "100%", md: "250px" }}
        maxH={{ base: "100%", md: "250px" }}
        aspectRatio={1}
        overflow="hidden"
        transition="all 0.2s ease"
        w="full"
        maxW={{ base: "290px", md: "250px" }}
        h="full"
        display="flex"
        flexDirection="column"
        mx="auto"
        _hover={{ boxShadow: 'md', transform: 'translateY(-2px)', cursor: 'pointer' }}
        onClick={() => navigate(getProductUrl(product))}
      >
        {/* Square Product Image - Responsive Aspect Ratio */}
        <Box
          position="relative"
          w="full"
          maxW={{ base: "270px", md: "250px" }}
          maxH={{ base: "280px", md: "250px" }}
          aspectRatio={1}
          overflow="hidden"
          mx="auto"
        >
          <Image
            src={getFirstImage(product.image_urls)}
            alt={product.title}
            position="absolute"
            top={0}
            left={0}
            w="100%"
            h="100%"
            objectFit="cover"
            loading="lazy"
            fallbackSrc="https://via.placeholder.com/600x600?text=No+Image"
          />

          {/* Premium Badge */}
          {product.premium && (
            <Badge
              position="absolute"
              top={2}
              right={2}
              colorScheme="yellow"
              variant="solid"
              borderRadius="full"
              px={2}
            >
              <StarIcon mr={0} />

            </Badge>
          )}

          {/* Trade/Buy Badge */}
        sx={{
          '@media (max-width: 850px)': {
            height: '180px',
            width: '100%',
            maxHeight: '180px',
            minHeight: '180px',
            overflow: 'hidden',
          },
        }}
      >
        <Image
          src={getFirstImage(product.image_urls)}
          alt={product.title}
          position="absolute"
          top={0}
          left={0}
          w="100%"
          h="100%"
          objectFit="cover"
          loading="lazy"
          fallbackSrc="https://via.placeholder.com/600x600?text=No+Image"
          sx={{
            '@media (max-width: 850px)': {
              objectFit: 'cover',
              width: '100%',
              height: '100%',
            },
          }}
        />

        {/* Premium Badge */}
        {product.premium && (
          <Badge
            position="absolute"
            top={2}
            left={2}
            colorScheme={product.allow_buying && product.price && !product.barter_only ? "blue" : "green"}
            variant="solid"
            borderRadius="full"
            px={1.5}
            py={0.5}
            fontSize="2xs"
            px={2}
            sx={{ '@media (max-width: 850px)': { transform: 'scale(0.75)', transformOrigin: 'top right' } }}
          >
            {product.allow_buying && product.price && !product.barter_only ? "Buy Available" : "Barter Only"}
          </Badge>

          {/* Status Badge */}
          {product.status === 'sold' && (
            <Badge
              position="absolute"
              bottom={2}
              right={2}
              colorScheme="red"
              variant="solid"
              borderRadius="full"
              px={2}
            >
              Sold
            </Badge>
          )}
        {/* Trade/Buy Badge - Category */}
        <Badge
          position="absolute"
          top={2}
          left={2}
          colorScheme={product.allow_buying && product.price && !product.barter_only ? "blue" : "green"}
          variant="solid"
          borderRadius="full"
          px={1.5}
          py={0.5}
          fontSize="2xs"
          sx={{ '@media (max-width: 850px)': { transform: 'scale(0.75)', transformOrigin: 'top left' } }}
        >
          {product.allow_buying && product.price && !product.barter_only ? "Buy Available" : "Barter Only"}
        </Badge>

          {/* Location Badge - New */}
          <Badge
            position="absolute"
            bottom={2}
            left={2}
            colorScheme="gray"
            variant="solid"
            borderRadius="full"
            px={2}
            bg="blackAlpha.600"
            color="white"
            fontSize="xs"
            sx={{ '@media (max-width: 480px)': { transform: 'scale(0.8)', transformOrigin: 'bottom right' } }}
          >
            <Text as="span" mr={1}>📍</Text>
            {product.distance || 'Nearby'}
          </Badge>

          {/* Condition Badge for Image Section */}
        {/* Location Badge - New */}
        <Badge
          position="absolute"
          bottom={2}
          left={2}
          colorScheme="gray"
          variant="solid"
          borderRadius="full"
          px={2}
          bg="blackAlpha.600"
          color="white"
          fontSize="xs"
          sx={{ '@media (max-width: 850px)': { transform: 'scale(0.75)', transformOrigin: 'bottom left' } }}
        >
          <Text as="span" mr={1}>📍</Text>
          {product.distance || '1.2km'}
        </Badge>

        {/* Condition Badge for Image Section */}
        <Badge
          position="absolute"
          bottom={2}
          right={2}
          fontSize="3xs"
          colorScheme="blue"
          variant="subtle"
          borderWidth="0"
          display={{ base: 'inline-flex', md: 'none' }}
          px={1.5}
          py={0.5}
          height="fit-content"
          sx={{ '@media (max-width: 850px)': { transform: 'scale(0.75)', transformOrigin: 'bottom right' } }}
        >
          {product.condition || 'Used'}
        </Badge>
      </Box>

      {/* Product Info (Flexible height) */}
      <Box
        p={4}
        display="flex"
        flexDirection="column"
        flex={1}
        overflow="hidden"
        sx={{ '@media (max-width: 480px)': { padding: '4px' } }}
      >
        <Flex justify="space-between" align="center" mb={2} display={{ base: 'none', md: 'flex' }}>
          <HStack spacing={2}>
            <Avatar
              as={RouterLink}
              to={`/users/${product.seller_id}`}
              size="sm"
              src={sellerAvatarSrc}
              name={product.seller_name || 'U'}
              bg="brand.500"
              flexShrink={0}
              cursor="pointer"
              _hover={{ opacity: 0.8 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            />
            <Text fontSize="sm" color="black" fontWeight="medium" noOfLines={1}>
              {product.seller_name || 'Unknown'}
            </Text>
          </HStack>
          <Badge
            position="absolute"
            bottom={2}
            right={2}
            fontSize="3xs"
            colorScheme="blue"
            variant="subtle"
            borderWidth="0"
            display={{ base: 'inline-flex', md: 'none' }}
            px={1.5}
            py={0.5}
            height="fit-content"
          >
            {product.condition || 'Used'}
          </Badge>
        </Box>

        {/* Product Info (Flexible height) */}
        <Box p={4} display="flex" flexDirection="column" flex={1} overflow="hidden">
          <Flex justify="space-between" align="center" mb={2} display={{ base: 'none', md: 'flex' }}>
            <HStack spacing={2}>
              <Avatar
                as={RouterLink}
                to={`/users/${product.seller_id}`}
                size="sm"
                src={sellerAvatarSrc}
                name={product.seller_name || 'U'}
                bg="brand.500"
                flexShrink={0}
                cursor="pointer"
                _hover={{ opacity: 0.8 }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              />
              <Text fontSize="sm" color="black" fontWeight="medium" noOfLines={1}>
                {product.seller_name || 'Unknown'}
              </Text>
            </HStack>
        </Flex>

        <Heading
          size="sm"
          noOfLines={2}
          mb={2}
          color="gray.800"
          flexShrink={0}
          textAlign="left"
          sx={{ '@media (max-width: 850px)': { fontSize: '13px', lineHeight: '1.3', marginBottom: '4px' } }}
        >
          {product.title}
        </Heading>

        <Text
          color="gray.600"
          noOfLines={{ base: 1, md: 2 }}
          mb={2}
          fontSize="sm"
          flexShrink={0}
          textAlign="left"
          sx={{ '@media (max-width: 850px)': { fontSize: '12px', marginBottom: '4px' } }}
        >
          {product.description
            ? product.description
              .split(' ')
              .slice(0, product.description.split(' ').length > 15 ? 8 : 15)
              .join(' ') + (product.description.split(' ').length > 15 ? '...' : '')
            : 'No description available'
          }
        </Text>

        {/* Wishlist Count Badge */}
        {product.wishlist_count > 0 && (
          <Flex mb={2} align="center" gap={1}>
            <Badge
              fontSize={{ base: 'xs', md: '2xs' }}
              colorScheme="blue"
              flexShrink={0}
              borderWidth="1px"
            >
              {product.condition || 'Used'}
            </Badge>
          </Flex>

          <Heading size="sm" noOfLines={2} mb={2} color="gray.800" flexShrink={0}>
            {product.title}
          </Heading>

          <Text
            color="gray.600"
            noOfLines={{ base: 1, md: 2 }}
            mb={2}
            fontSize="sm"
            flexShrink={0}
          >
            {product.description
              ? product.description
                .split(' ')
                .slice(0, product.description.split(' ').length > 15 ? 8 : 15)
                .join(' ') + (product.description.split(' ').length > 15 ? '...' : '')
              : 'No description available'
            }
          </Text>

          {/* Wishlist Count Badge */}
          {product.wishlist_count > 0 && (
            <Flex mb={2} align="center" gap={1}>
              <Badge
                colorScheme="pink"
                variant="subtle"
                borderRadius="full"
                px={2}
                py={0.5}
                fontSize="xs"
              >
                ❤️ {product.wishlist_count} {product.wishlist_count === 1 ? 'person wants' : 'people want'}
              </Badge>
            </Flex>
          )}

          {/* Action Buttons */}
          <HStack spacing={2} mt="auto">
            <Button
              size="sm"
              variant="outline"
              colorScheme="brand"
              flex={1}
              onClick={(e) => {
                e.stopPropagation()
                handleTradeClick(product.id)
              }}
              isDisabled={product.status === 'sold'}
            >
              {product.status === 'sold' ? 'Sold' : 'Trade'}
            </Button>

            {product.allow_buying && product.price && !product.barter_only && (
              <Button
                size="sm"
                colorScheme="brand"
                flex={1}
                onClick={(e) => {
                  e.stopPropagation()
                  handleBuyClick(product.id)
                }}
                isDisabled={product.status === 'sold'}
              >
                {product.status === 'sold' ? 'Sold' : 'Buy'}
              </Button>
            )}

            {/* New: View Offers Button */}
            <Tooltip label={`View offers (${product.offer_count || 0})`} placement="top">
              <IconButton
                aria-label="View offers"
                icon={<FaHandshake />}
                size="sm"
                variant="outline"
                colorScheme="blue"
                onClick={(e) => {
                  e.stopPropagation()
                  handleViewOffers(product.id)
                }}
                isDisabled={product.status === 'sold'}
              />
            </Tooltip>
          </HStack>
        </Box>
      </Box>
    )
  }

  // Component to render product grid with git pull --no-edit injections
  const ProductGridWithAds: React.FC<{ products: any[]; user: any }> = ({ products, user }) => {
    const filteredProducts = products.filter(
      (p) => p.status === 'available' && p.seller_id !== user?.id // Hide own products — can't trade with yourself
    )

    console.log('📦 ProductGridWithAds - Total products from API:', products.length)
    console.log('📦 ProductGridWithAds - Current user ID:', user?.id)
    console.log('📦 ProductGridWithAds - Filtered products (available):', filteredProducts.length)
    if (products.length > 0) {
      console.log('📦 Sample product data:', products[0])
    }

    // Use the ad injection hook
    const { shouldInsertAdAt, getAdForPosition, getAdIndexAt } = useStudentAdInjection(
      filteredProducts.length,
      undefined, // Use default ads
      { min: 3, max: 6 } // Insertion interval
    )

    // Build the combined list with ads
    const itemsWithAds: Array<{ type: 'product' | 'ad'; data: any; index: number }> = []

    filteredProducts.forEach((product, idx) => {
      itemsWithAds.push({
        type: 'product',
        data: product,
        index: idx,
      })

      // Check if ad should be inserted after this product
      if (shouldInsertAdAt(idx + 1)) {
        const ad = getAdForPosition(getAdIndexAt(idx + 1))
        if (ad) {
          itemsWithAds.push({
            type: 'ad',
            data: ad,
            index: idx + 1,
          })
        }
      }
    })

    return (
      <Grid
        templateColumns={{
          base: 'repeat(2, 1fr)',
          md: 'repeat(3, 1fr)',
          lg: 'repeat(4, 1fr)',
          xl: 'repeat(5, 1fr)',
          '2xl': 'repeat(5, 1fr)',
        }}
        gap={{ base: 2, md: 4, lg: 4, xl: 5 }}
        alignItems="start"
        justifyContent="center"
        mx="auto"
        sx={{
          '@media (max-width: 850px)': {
            gridTemplateColumns: '1fr 1fr !important',
            gap: '10px',
          },
        }}
      >
        {itemsWithAds.map((item, displayIndex) =>
          item.type === 'product' ? (
            <Box key={`product-${item.data.id}`} sx={{ '@media (max-width: 850px)': { minWidth: 0, maxWidth: 'none' } }}>
              {renderProductCard(item.data)}
            </Box>
          ) : (
            <Box key={`ad-${item.data.id}`}>
              <StudentAdCard ad={item.data} />
            </Box>
          )
        )}
      </Grid>
    )
  }

  return (
    <Box minH="100vh" bg="#FFFDF1">
      {/* Sticky Search Header - desktop: centered max-width */}
      <Box
        position="sticky"
        top={0}
        zIndex={100}
        bg="#FFFDF1"
        borderColor="gray.200"
        px={{ base: 3, md: 6, lg: 8, xl: 10 }}
        py={{ base: 3, md: 4 }}
      >
        <VStack
          spacing={4}
          w="full"
          maxW={{ lg: '1600px', xl: '1620px', '2xl': '1920px' }}
          mx={{ base: 'auto', lg: 0 }}
        >
          {/* Main Search Bar */}
          <HStack w="full" spacing={3} wrap="wrap" ml={{ base: 0, md: -14 }}>
            <InputGroup size="lg" flex={1} minW={{ base: 0, md: 'auto' }}>
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Search products, categories, or keywords..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                bg="white"
                border="2px"
                borderColor="gray.200"
                _focus={{
                  borderColor: "brand.500",
                  boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)"
                }}
              />
            </InputGroup>

            {/* Toggle Filters icon (mobile inline, right side) */}
            <IconButton
              aria-label="Toggle filters"
              icon={showFilters ? <ChevronUpIcon /> : <ChevronDownIcon />}
              variant="outline"
              size={{ base: 'md', md: 'lg' }}
              onClick={() => setShowFilters(!showFilters)}
              display={{ base: 'inline-flex', md: 'none' }}
            />

            {/* Mobile hamburger to open nav drawer (after filters icon) */}
            <IconButton
              aria-label="Open navigation"
              icon={<HamburgerIcon />}
              display={{ base: 'inline-flex', md: 'none' }}
              size={{ base: 'md', md: 'lg' }}
              variant="ghost"
              onClick={openMobileNav}
            />

            {/* Hidden on mobile to keep header compact: Search button (desktop only) */}
            <Button
              leftIcon={<SearchIcon />}
              colorScheme="brand"
              size="lg"
              onClick={handleSearch}
              px={8}
              display={{ base: 'none', md: 'inline-flex' }}
            >
              Search
            </Button>

            {/* Desktop filters toggle at the end to keep desktop layout */}
            <IconButton
              aria-label="Toggle filters"
              icon={showFilters ? <ChevronUpIcon /> : <ChevronDownIcon />}
              variant="outline"
              size="lg"
              onClick={() => setShowFilters(!showFilters)}
              display={{ base: 'none', md: 'inline-flex' }}
            />

            {/* Profile button (desktop only) with Popover */}
            {user && (
              <Popover placement="bottom-end" trigger="hover">
                <PopoverTrigger>
                  <Box
                    as="button"
                    cursor="pointer"
                    display={{ base: 'none', md: 'inline-flex' }}
                    alignItems="center"
                    justifyContent="center"
                    borderRadius="full"
                    _hover={{ opacity: 0.8, transform: 'scale(1.05)' }}
                    transition="all 0.2s"
                    onClick={() => navigate(`/users/${user.id}`)}
                  >
                    <Avatar
                      size="sm"
                      name={user.name || 'User'}
                      src={user.profile_picture ? getImageUrl(user.profile_picture) : undefined}
                      bg="teal.500"
                      color="white"
                    />
                  </Box>
                </PopoverTrigger>
                <PopoverContent w="72" shadow="lg">
                  <PopoverBody p={4}>
                    <VStack align="stretch" spacing={3}>
                      {/* User Info */}
                      <Box>
                        <Text fontWeight="semibold" fontSize="sm" color="gray.800">
                          {user.name || 'User'}
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          {user.email}
                        </Text>
                        {user && (user as any).is_premium && (
                          <Badge colorScheme="yellow" fontSize="xs" mt={2}>
                            ⭐ Premium Member
                          </Badge>
                        )}
                      </Box>
                      <Divider />
                      {/* Action Buttons */}
                      <Button
                        as={RouterLink}
                        to="/settings"
                        size="sm"
                        variant="outline"
                        w="full"
                        fontSize="sm"
                      >
                        Settings
                      </Button>
                      <Button
                        as={RouterLink}
                        to="/dashboard"
                        size="sm"
                        variant="outline"
                        w="full"
                        fontSize="sm"
                      >
                        Dashboard
                      </Button>
                      <Divider />
                      <Button
                        size="sm"
                        colorScheme="red"
                        variant="outline"
                        w="full"
                        fontSize="sm"
                        onClick={onOpenLogoutModal}
                      >
                        Logout
                      </Button>
                    </VStack>
                  </PopoverBody>
                </PopoverContent>
              </Popover>
            )}

            {!user && (
              <Box
                as={RouterLink}
                to="/login"
                display={{ base: 'none', md: 'inline-flex' }}
                alignItems="center"
                justifyContent="center"
                borderRadius="full"
                cursor="pointer"
                _hover={{ opacity: 0.8, transform: 'scale(1.05)' }}
                transition="all 0.2s"
              >
                <Avatar size="sm" bg="gray.400" />
              </Box>
            )}
          </HStack>

          {/* Expandable Filters */}
          {showFilters && (
            <Box
              position="absolute"
              top="100%"
              left={0}
              right={0}
              w="full"
              bg="white"
              p={4}
              rounded="lg"
              shadow="md"
              zIndex={50}
              maxW={{ base: "100%", md: "6xl" }}
              mx={0}
              transform="none"
            >
              <Grid templateColumns="repeat(auto-fit, minmax(150px, 1fr))" gap={3}>
                <FormControl>
                  <FormLabel fontSize="sm" color="gray.600">Price Range</FormLabel>
                  <HStack>
                    <Input
                      placeholder="Min"
                      type="number"
                      value={filters.min_price || ''}
                      onChange={(e) => handleFilterChange('min_price', e.target.value ? Number(e.target.value) : undefined)}
                      size="sm"
                    />
                    <Text fontSize="sm" color="gray.500">-</Text>
                    <Input
                      placeholder="Max"
                      type="number"
                      value={filters.max_price || ''}
                      onChange={(e) => handleFilterChange('max_price', e.target.value ? Number(e.target.value) : undefined)}
                      size="sm"
                    />
                  </HStack>
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" color="gray.600">Location</FormLabel>
                  <Input
                    placeholder="Enter location"
                    value={filters.location || ''}
                    onChange={(e) => handleFilterChange('location', e.target.value)}
                    size="sm"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" color="gray.600">Listing Type</FormLabel>
                  <Select
                    aria-label="Listing type"
                    title="Listing type"
                    value={filters.premium === undefined ? '' : filters.premium.toString()}
                    onChange={(e) => handleFilterChange('premium', e.target.value === '' ? undefined : e.target.value === 'true')}
                    size="sm"
                  >
                    <option value="">All listings</option>
                    <option value="true">Premium only</option>
                    <option value="false">Regular only</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" color="gray.600">Trade Type</FormLabel>
                  <Select
                    aria-label="Trade type"
                    title="Trade type"
                    value={filters.barter_only === undefined ? '' : filters.barter_only.toString()}
                    onChange={(e) => handleFilterChange('barter_only', e.target.value === '' ? undefined : e.target.value === 'true')}
                    size="sm"
                  >
                    <option value="">All options</option>
                    <option value="true">Barter only</option>
                    <option value="false">Buy available</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" color="gray.600">Status</FormLabel>
                  <Select
                    aria-label="Listing status"
                    title="Listing status"
                    value={filters.status || ''}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    size="sm"
                  >
                    <option value="available">Available</option>
                    <option value="sold">Sold</option>
                    <option value="traded">Traded</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" color="gray.600">&nbsp;</FormLabel>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={clearFilters}
                    w="full"
                  >
                    Clear Filters
                  </Button>
                </FormControl>
              </Grid>
            </Box>
          )}
        </VStack>
      </Box>
      {/* slider / visual box - fully responsive from mobile to 2xl */}
      <Box
        maxW={{ base: 'calc(100% - 32px)', sm: 'calc(100% - 24px)', md: '100%', lg: '1050px', xl: '1100px', '2xl': '1466px' }}
        mx={{ base: 'auto', lg: 0 }}
        mb={8}
        px={{ base: 2, sm: 3, md: 4, lg: 6 }}
      >
        <Box
          position="relative"
          overflow="hidden"
          h={{ base: 24, sm: 28, md: 32, lg: 40, xl: 44, '2xl': 48 }}
          rounded="lg"
          border="1px"
          borderColor="gray.200"
          bg="gray.50"
          onWheel={onWheelSlide}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {sliderImages.map((src, idx) => (
            <Image
              key={src}
              src={src}
              alt={`slide-${idx + 1}`}
              position="absolute"
              top={0}
              left={0}
              w="100%"
              h="100%"
              objectFit="cover"
              transition="opacity 600ms ease"
              opacity={idx === slideIndex ? 1 : 0}
              zIndex={idx === slideIndex ? 2 : 1}
              loading="eager"
              draggable={false}
              pointerEvents="none"
            />
          ))}

          {/* Prev / Next controls (tablet+). Mobile users swipe instead. */}
          <IconButton
            type="button"
            aria-label="Previous slide"
            icon={<ArrowLeftIcon />}
            position="absolute"
            left={{ base: 2, md: 3, lg: 4 }}
            top="50%"
            transform="translateY(-50%)"
            zIndex={10}
            size={{ base: 'xs', md: 'sm', lg: 'md' }}
            colorScheme="blackAlpha"
            variant="ghost"
            display={{ base: 'none', sm: 'flex' }}
            pointerEvents="auto"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              goPrev()
            }}
          />

          <IconButton
            type="button"
            aria-label="Next slide"
            icon={<ArrowRightIcon />}
            position="absolute"
            right={{ base: 2, md: 3, lg: 4 }}
            top="50%"
            transform="translateY(-50%)"
            zIndex={10}
            size={{ base: 'xs', md: 'sm', lg: 'md' }}
            colorScheme="blackAlpha"
            variant="ghost"
            display={{ base: 'none', sm: 'flex' }}
            pointerEvents="auto"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              goNext()
            }}
          />

          {/* Dots - responsive sizing */}
          <HStack spacing={{ base: 1.5, md: 2 }} position="absolute" bottom={{ base: 2, md: 3, lg: 4 }} left="50%" transform="translateX(-50%)" zIndex={10} pointerEvents="auto">
            {sliderImages.map((_, i) => (
              <Box
                key={i}
                as="button"
                w={i === slideIndex ? { base: 2.5, md: 3 } : { base: 2, md: 2.5 }}
                h={i === slideIndex ? { base: 2.5, md: 3 } : { base: 2, md: 2.5 }}
                bg={i === slideIndex ? 'brand.500' : 'gray.300'}
                borderRadius="full"
                transition="all 0.3s ease"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setSlideIndex(i); scheduleResume(2000) }}
              />
            ))}
          </HStack>
        </Box>
      </Box>
      {/* Horizontal category pills - desktop: centered max-width */}
      <Box
        px={{ base: 3, md: 6, lg: 8, xl: 10 }}
        bg="linear-gradient(135deg, #FFFDF1 0%, #FFFCF0 100%)"
        borderBottomColor="gray.100"
      >
        <Box
          w="full"
          maxW={{ lg: '1600px', xl: '1620px', '2xl': '1920px' }}
          mx={{ base: 'auto', lg: 0 }}
        >
          <HStack
            spacing={{ base: 2.5, md: 3 }}
            overflowX="auto"
            whiteSpace="nowrap"
            align="center"
            pb={{ base: 2, md: 0 }}
            sx={{
              '::-webkit-scrollbar': {
                display: 'none',
                height: '0px',
              },
              msOverflowStyle: 'none',
              scrollbarWidth: 'none',
              '&': {
                scrollBehavior: 'smooth',
              }
            }}
          >
            {categories.map((category) => {
              const isSelected = selectedCategory === category.value
              const IconComponent = category.icon

              return (
                <Box
                  key={category.value}
                  flexShrink={0}
                  as="button"
                  onClick={() => handleCategorySelect(category.value)}
                  cursor="pointer"
                  transition="all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
                  _active={{
                    transform: 'scale(0.95)',
                  }}
                >
                  <Box
                    display="flex"
                    alignItems="center"
                    gap={{ base: 1.5, md: 2 }}
                    px={{ base: 3, md: 5 }}
                    py={{ base: 2, md: 3 }}
                    rounded="full"
                    bg={isSelected ? (category.value === 'All' ? 'brand.600' : category.color) : 'white'}
                    color={isSelected ? 'white' : 'gray.700'}
                    fontWeight={isSelected ? '600' : '500'}
                    fontSize={{ base: 'xs', md: 'sm' }}
                    border="2px solid"
                    borderColor={isSelected ? category.accentColor : 'gray.200'}
                    boxShadow="0 2px 4px rgba(0, 0, 0, 0.05)"
                    transition="all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
                    position="relative"
                    overflow="hidden"
                    _before={{
                      content: '""',
                      position: 'absolute',
                      inset: 0,
                      bg: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                      transition: 'background 0.3s ease',
                    }}
                    _hover={{
                      transform: 'translateY(-0.5px)',
                      boxShadow: '0 6px 12px rgba(0, 0, 0, 0.1)',
                      borderColor: category.accentColor,
                      bg: isSelected ? (category.value === 'All' ? 'brand.600' : category.color) : category.lightColor,
                    }}
                    _focusVisible={{
                      outline: '2px solid',
                      outlineColor: category.accentColor,
                      outlineOffset: '2px',
                    }}
                  >
                    <Icon
                      as={IconComponent}
                      w={{ base: 3.5, md: 4 }}
                      h={{ base: 3.5, md: 4 }}
                      transition="all 0.3s ease"
                      transform={isSelected ? 'scale(1.1)' : 'scale(1)'}
                      opacity={isSelected ? 1 : 0.7}
                    />
                    <Text
                      as="span"
                      transition="all 0.3s ease"
                      display={{ base: category.value === 'All' ? 'inline' : 'none', md: 'inline' }}
                    >
                      {category.label}
                    </Text>
                  </Box>
                </Box>
              )
            })}
          </HStack>
        </Box>
      </Box>
      {/* Main Content - desktop: centered max-width */}
      <Box
        px={{ base: 3, md: 6, lg: 8, xl: 10 }}
        py={8}
        sx={{ '@media (max-width: 850px)': { paddingLeft: '12px', paddingRight: '12px' } }}
        maxW={{ lg: '1600px', xl: '1620px', '2xl': '1920px' }}
        mx={{ base: 'auto', lg: 0 }}
        w="full"
      >
        {/* Loading State */}
        {loading && !products.length && (
          <Center h="50vh">
            <VStack spacing={4}>
              <Spinner size="xl" color="brand.500" />
              <Text color="gray.600">Loading products...</Text>
            </VStack>
          </Center>
        )}

        {/* Error Display */}
        {error && (
          <Box bg="red.50" border="1px" borderColor="red.200" rounded="lg" p={6} maxW="4xl" mx="auto">
            <VStack spacing={4} align="stretch">
              <Text color="red.800" fontWeight="semibold">
                Error loading products
              </Text>
              <Text color="red.700" fontSize="sm">
                {error}
              </Text>
              <Button
                size="sm"
                colorScheme="red"
                variant="outline"
                onClick={() => searchProducts(filters)}
              >
                Retry
              </Button>
            </VStack>
          </Box>
        )}

        {/* Products Grid - desktop: no extra maxW (parent constrains), 2xl: 6 cols */}
        {!loading && products.length > 0 && (
          <Box
            w="full"
            mx="auto"
            px={{ base: 2, md: 4, lg: 0 }}
            pb={{ base: 20, md: 0 }}
            minH={{ base: '1200px', md: '1600px' }}
            ml={-10}
          >
            <ProductGridWithAds products={products} user={user} />
     {/* Products Grid - desktop: no extra maxW (parent constrains), 2xl: 6 cols */}
     {!loading && products.length > 0 && (
  <Box
    w="full"
    mx="auto"
    px={{ base: 2, md: 4, lg: 0 }}
    pb={{ base: 20, md: 0 }}
    minH={{ base: '1200px', md: '1600px' }}
    ml={-10}
    sx={{ '@media (max-width: 850px)': { paddingLeft: '12px', paddingRight: '12px', marginLeft: 0 } }}
  >
    <ProductGridWithAds products={products} user={user} />

            {/* Sentinel for infinite scroll */}
            <Box ref={sentinelRef} h="1px" />

            {/* Subtle loading indicator for loading more */}
            {isLoadingMore && (
              <Center py={6}>
                <Spinner size="md" color="brand.500" />
              </Center>
            )}
          </Box>
        )}

        {/* Empty State (single, correct location) */}
        {!loading && products.length === 0 && (
          <Box textAlign="center" py={16} maxW="2xl" mx="auto">
            <VStack spacing={6}>
              <Box fontSize="6xl" color="gray.300">
                📦
              </Box>
              <VStack spacing={2}>
                <Heading size="lg" color="gray.700">
                  No products found
                </Heading>
                <Text color="gray.500" fontSize="lg">
                  {filters.keyword || filters.min_price || filters.max_price || filters.premium !== undefined || filters.status !== 'available'
                    ? "Try adjusting your search criteria or clearing filters to see all products."
                    : "No products are currently available. Check back later!"
                  }
                </Text>
              </VStack>
              <Button
                size="lg"
                colorScheme="brand"
                onClick={clearFilters}
              >
                {filters.keyword || filters.min_price || filters.max_price || filters.premium !== undefined || filters.status !== 'available'
                  ? "Clear All Filters"
                  : "Refresh Page"
                }
              </Button>
            </VStack>
          </Box>
        )}
      </Box>

      <TradeModal isOpen={isOpen} onClose={onClose} targetProductId={tradeTargetProductId} />

      {/* Logout Confirmation Modal */}
      <Modal isOpen={isLogoutModalOpen} onClose={onCloseLogoutModal} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirm Logout</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>Are you sure you want to logout?</Text>
          </ModalBody>
          <Box p={4} display="flex" gap={3} justifyContent="flex-end">
            <Button variant="outline" onClick={onCloseLogoutModal}>
              Cancel
            </Button>
            <Button colorScheme="red" onClick={handleLogout}>
              Logout
            </Button>
          </Box>
        </ModalContent>
      </Modal>

      {/* Offers Modal - Simplified with Ranking */}
      <Modal isOpen={offersModalOpen} onClose={() => setOffersModalOpen(false)} size="2xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack justify="space-between" w="full">
              <Heading size="md" color="brand.600">
                Offers ({offersForProduct.length})
              </Heading>
              <IconButton
                aria-label="Close"
                icon={<CloseIcon />}
                variant="ghost"
                onClick={() => setOffersModalOpen(false)}
              />
            </HStack>
          </ModalHeader>

          <ModalBody pb={6}>
            {loadingOffers ? (
              <Center py={8}>
                <Spinner color="brand.500" />
              </Center>
            ) : getRankedOffers().length === 0 ? (
              <Box textAlign="center" py={8}>
                <Text color="gray.600">No offers yet</Text>
              </Box>
            ) : (
              <VStack spacing={3} align="stretch">
                {getRankedOffers().map((offer: any, index: number) => (
                  <Box
                    key={offer.id}
                    p={4}
                    borderWidth="2px"
                    borderColor={index === 0 ? 'gold' : offer.status === 'accepted' ? 'green.400' : 'gray.200'}
                    rounded="lg"
                    bg={index === 0 ? 'yellow.50' : offer.status === 'accepted' ? 'green.50' : 'white'}
                    position="relative"
                  >
                    {/* Rank Badge */}
                    <Badge
                      position="absolute"
                      top={-3}
                      left={4}
                      colorScheme={index === 0 ? 'yellow' : index === 1 ? 'gray' : index === 2 ? 'orange' : 'gray'}
                      fontSize="xs"
                      px={2}
                      py={1}
                    >
                      #{index + 1}
                    </Badge>

                    <HStack justify="space-between" mb={2} mt={2}>
                      <HStack>
                        {index === 0 && (
                          <Text fontSize="lg">🏆</Text>
                        )}
                        <Text fontWeight="bold" fontSize="sm">
                          {offer.buyer_name || 'Anonymous'}
                        </Text>
                      </HStack>
                      <Badge
                        colorScheme={
                          offer.status === 'accepted' ? 'green' :
                            offer.status === 'pending' ? 'yellow' : 'gray'
                        }
                        fontSize="xs"
                      >
                        {offer.status.toUpperCase()}
                      </Badge>
                    </HStack>

                    <Text fontSize="sm" color="gray.600" mb={2}>
                      {offer.items?.length || 0} item(s) offered
                    </Text>

                    <HStack spacing={2} flexWrap="wrap">
                      {offer.items && offer.items.map((item: any, idx: number) => (
                        <Badge key={idx} colorScheme="blue" variant="outline" fontSize="xs">
                          {item.product_title?.substring(0, 15) || `Item ${idx + 1}`}
                        </Badge>
                      ))}
                    </HStack>
                  </Box>
                ))}
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      <Box mb={{ base: 5, md: 0 }}>
        <FloatingTab />
      </Box>
    </Box>
  )
}

export default Home

{/*}
import React from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const App = () => {
  return (
    <DotLottieReact
      src="path/to/animation.lottie"
      loop
      autoplay
    />
  );
};
*/}