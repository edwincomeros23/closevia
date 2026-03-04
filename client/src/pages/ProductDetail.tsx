import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Container,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Image,
  Badge,
  Flex,
  Spinner,
  Center,
  Alert,
  AlertIcon,
  Divider,
  SimpleGrid,
  useToast,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Input,
  Tooltip,
  Grid,
  Avatar,
  ButtonGroup,
} from '@chakra-ui/react'
import {
  FiHeart,
  FiShare2,
  FiCopy,
  FiFacebook,
  FiTwitter,
  FiInstagram,
  FiMail,
  FiMessageCircle,
  FiBookmark,
  FiCalendar,
  FiTrendingUp,
  FiTrendingDown,
  FiFlag,
} from 'react-icons/fi'
import { FaHandshake } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { Product, User } from '../types'
import { api } from '../services/api'
import { getFirstImage, getImageUrl } from '../utils/imageUtils';
import { getProductUrl } from '../utils/productUtils'
import TradeModal from '../components/TradeModal'
import CounterfeitWarning from '../components/CounterfeitWarning'
import ProximityBadge from '../components/ProximityBadge'
import ResponseMetricsBadge from '../components/ResponseMetricsBadge'
import FloatingTab from '../components/FloatingTab'
import axios from 'axios';
import { CloseIcon } from '@chakra-ui/icons'

const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { getProduct, getUserProducts } = useProducts()
  const [product, setProduct] = useState<Product | null>(null)
  const [sellerProducts, setSellerProducts] = useState<Product[]>([])
  const [sellerStats, setSellerStats] = useState<any | null>(null)
  const [sellerProfile, setSellerProfile] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [purchasing, setPurchasing] = useState(false)
  const [isTradeOpen, setIsTradeOpen] = useState(false)
  const [tradeTargetProductId, setTradeTargetProductId] = useState<number | null>(null)
  const [selectedImage, setSelectedImage] = useState<string>('')
  const [isSaved, setIsSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [wishlistCount, setWishlistCount] = useState<number>(0)
  const [isWishlisted, setIsWishlisted] = useState<boolean>(false)
  const [votes, setVotes] = useState<{ under: number; over: number }>({ under: 0, over: 0 })
  const [userVote, setUserVote] = useState<string>('')
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [offersForProduct, setOffersForProduct] = useState<any[]>([])
  const [loadingOffers, setLoadingOffers] = useState(false)
  const [offersModalOpen, setOffersModalOpen] = useState(false)
  const [offersSortBy, setOffersSortBy] = useState<'newest' | 'oldest' | 'accepted'>('accepted')
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportDescription, setReportDescription] = useState('')
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const [hasPendingOfferOnProduct, setHasPendingOfferOnProduct] = useState(false)
  const [loadingPendingOffer, setLoadingPendingOffer] = useState(false)
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false)

  const navigate = useNavigate()
  const toast = useToast()
  const { isOpen: isShareOpen, onOpen: onShareOpen, onClose: onShareClose } = useDisclosure()

  useEffect(() => {
    if (id) {
      fetchProduct()
    }
  }, [id])

  // Fetch seller's other products (for Seller Products section)
  useEffect(() => {
    const loadSellerProducts = async () => {
      if (!product) return
      try {
        const resp = await getUserProducts(product.seller_id, 1)
        setSellerProducts(resp?.data || [])
      } catch (err) {
        // ignore errors for this non-critical UX enhancement
        setSellerProducts([])
      }
    }
    loadSellerProducts()
  }, [product, getUserProducts])

  // Fetch seller's statistics
  useEffect(() => {
    const loadSellerStats = async () => {
      if (!product) return
      try {
        // Use the axios `api` client so requests go to the configured backend
        // The backend API in this project is prefixed with /api
        const resp = await api.get(`/api/users/${product.seller_id}/stats`)
        if (resp && resp.data) {
          setSellerStats(resp.data.data)
        }
      } catch (err) {
        // Treat 404 (endpoint missing) as non-fatal and use safe defaults
        if (axios.isAxiosError(err)) {
          const status = err.response?.status
          // eslint-disable-next-line no-console
          console.debug('Seller stats request failed', { status, url: err.config?.url })
          if (status === 404) {
            // Provide sensible defaults so UI shows N/A instead of failing
            setSellerStats({ avg_rating: null, positive_percent: null, total_trades: 0, avg_response_time: null })
            return
          }
          // For other statuses, log details for debugging
          // eslint-disable-next-line no-console
          console.error('Failed to fetch seller stats:', JSON.stringify({
            message: err.message,
            status: err.response?.status,
            url: err.config?.url,
            data: err.response?.data,
          }))
        } else {
          // eslint-disable-next-line no-console
          console.error('Failed to fetch seller stats (non-Axios error):', err)
        }
        // Fallback defaults to keep UI stable
        setSellerStats({ avg_rating: null, positive_percent: null, total_trades: 0, avg_response_time: null })
      }
    }
    loadSellerStats()
  }, [product])

  // Load seller profile (to display uploaded profile picture)
  useEffect(() => {
    const loadSellerProfile = async () => {
      if (!product) return
      try {
        const resp = await api.get(`/api/users/${product.seller_id}`)
        // Debug: log the raw response for troubleshooting missing profile_picture
        console.log('🔍 Seller profile response:', resp?.data)
        const userData = resp.data?.data as User | undefined
        console.log('🔍 User data extracted:', userData)
        console.log('🔍 Profile picture value:', userData?.profile_picture)
        console.log('🔍 Profile picture type:', typeof userData?.profile_picture)

        if (userData) {
          // Normalize profile picture URL if it exists and is not empty
          const profilePic = userData.profile_picture
          if (profilePic && typeof profilePic === 'string' && profilePic.trim() !== '' && profilePic !== 'undefined') {
            try {
              const normalizedUrl = getImageUrl(profilePic)
              console.log('✅ Profile picture URL:', profilePic, '-> Normalized:', normalizedUrl)
              userData.profile_picture = normalizedUrl
            } catch (e) {
              console.error('❌ Failed to normalize profile picture URL:', e)
              userData.profile_picture = undefined
            }
          } else {
            console.log('⚠️ No valid profile picture found for user:', product.seller_id, '- Value:', profilePic, '- Type:', typeof profilePic)
            userData.profile_picture = undefined
          }
        }
        console.log('🔍 Final seller profile state:', userData)
        setSellerProfile(userData || null)
      } catch (err) {
        console.error('❌ Failed to load seller profile', err)
        setSellerProfile(null)
      }
    }
    loadSellerProfile()
  }, [product])

  useEffect(() => {
    if (product && user) {
      checkWishlistStatus();
    }
    if (product) {
      setWishlistCount(product.wishlist_count || 0);
    }
  }, [product, user]);

  // Check if user has a pending offer on this product
  useEffect(() => {
    if (!product || !user) {
      setHasPendingOfferOnProduct(false)
      return
    }

    const checkPendingOffer = async () => {
      try {
        setLoadingPendingOffer(true)
        // Fetch user's outgoing pending trades
        const response = await api.get(`/api/trades?direction=outgoing&status=pending&limit=100`)
        const trades = Array.isArray(response.data?.data) ? response.data.data : []

        // Check if any pending trade matches current product ID
        const hasPending = trades.some((trade: any) => trade.target_product_id === product.id)
        setHasPendingOfferOnProduct(hasPending)
      } catch (error) {
        console.error('Failed to check pending offers:', error)
        setHasPendingOfferOnProduct(false)
      } finally {
        setLoadingPendingOffer(false)
      }
    }

    checkPendingOffer()
  }, [product, user]);

  const checkWishlistStatus = async () => {
    if (!product || !user) return;
    try {
      const response = await api.get(`/api/products/${product.id}/wishlist/status`);
      if (response.data.success) {
        setIsWishlisted(response.data.data.is_wishlisted);
      }
    } catch (error) {
      // Handle error
    }
  };

  const handleWishlist = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to wishlist this product",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      navigate("/login");
      return;
    }

    if (!product) return;

    try {
      if (isWishlisted) {
        await api.delete(`/api/products/${product.id}/wishlist`);
        setWishlistCount(wishlistCount - 1);
        setIsWishlisted(false);
        toast({
          title: "Removed from wishlist",
          status: "success",
          duration: 2000,
          isClosable: true,
        });
      } else {
        await api.post(`/api/products/${product.id}/wishlist`);
        setWishlistCount(wishlistCount + 1);
        setIsWishlisted(true);
        toast({
          title: "Added to wishlist",
          status: "success",
          duration: 2000,
          isClosable: true,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const fetchProduct = async () => {
    try {
      setLoading(true)
      setError('')

      const identifier = id!
      // Direct API call so we can read vote counts and user_vote in the response
      const productId = parseInt(identifier)
      if (!isNaN(productId) && identifier === productId.toString()) {
        // numeric ID - fetch and possibly redirect
        const response = await api.get(`/api/products/${productId}`)
        const data = response.data?.data
        if (data?.product) {
          const p = data.product as Product
          setProduct(p)
          setVotes(data.votes || { under: 0, over: 0 })
          setUserVote(data.user_vote || '')
          if (p.slug) {
            navigate(`/products/${p.slug}`, { replace: true })
            return
          }
          if (p.image_urls && p.image_urls.length > 0) setSelectedImage(getImageUrl(p.image_urls[0]))
        } else if (data) {
          const p = data as Product
          setProduct(p)
          setVotes({ under: 0, over: 0 })
          setUserVote('')
          if (p.image_urls && p.image_urls.length > 0) setSelectedImage(getImageUrl(p.image_urls[0]))
        } else {
          setError('Product not found')
        }
      } else {
        const response = await api.get(`/api/products/${identifier}`)
        const data = response.data?.data
        if (data?.product) {
          const p = data.product as Product
          setProduct(p)
          setVotes(data.votes || { under: 0, over: 0 })
          setUserVote(data.user_vote || '')
          if (p.image_urls && p.image_urls.length > 0) setSelectedImage(getImageUrl(p.image_urls[0]))
        } else if (data) {
          const p = data as Product
          setProduct(p)
          setVotes({ under: 0, over: 0 })
          setUserVote('')
          if (p.image_urls && p.image_urls.length > 0) setSelectedImage(getImageUrl(p.image_urls[0]))
        } else {
          setError('Product not found')
        }
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status
        if (status === 403) {
          setError('This item is no longer available')
        } else if (status === 404) {
          setError('Product not found')
        } else {
          setError(err.response?.data?.error || 'An unexpected error occurred')
        }
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = () => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please log in to purchase this product',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      navigate('/login')
      return
    }
    if (!product) return
    setIsBuyModalOpen(true)
  }

  const confirmPurchase = async () => {
    if (!product) return
    try {
      setPurchasing(true)
      await api.post('/api/orders', {
        product_id: product.id,
      })
      setIsBuyModalOpen(false)
      toast({
        title: 'Order placed successfully!',
        description: 'Your order has been created and is pending seller confirmation.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })
      navigate('/dashboard')
    } catch (err: unknown) {
      let description = 'Failed to place order';
      if (axios.isAxiosError(err)) {
        description = err.response?.data?.error || description;
      } else if (err instanceof Error) {
        description = err.message;
      }
      toast({
        title: 'Purchase failed',
        description,
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setPurchasing(false)
    }
  }

  const handleSubmitReport = async () => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please log in to report this trader',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      navigate('/login')
      return
    }

    if (!product) return

    if (!reportReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please select a reason for your report',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    if (reportDescription.trim().length < 10) {
      toast({
        title: 'Description too short',
        description: 'Please provide at least 10 characters of description',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    try {
      setIsSubmittingReport(true)
      await api.post('/api/reports', {
        reported_user_id: product.seller_id,
        product_id: product.id,
        reason: reportReason,
        description: reportDescription,
      })

      toast({
        title: 'Report submitted',
        description: 'Thank you for helping keep Clovia safe. We will review your report.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })

      // Reset and close modal
      setReportReason('')
      setReportDescription('')
      setIsReportOpen(false)
    } catch (err: unknown) {
      let description = 'Failed to submit report';
      if (axios.isAxiosError(err)) {
        description = err.response?.data?.error || description;
      } else if (err instanceof Error) {
        description = err.message;
      }
      toast({
        title: 'Report failed',
        description,
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setIsSubmittingReport(false)
    }
  }

  const openTrade = () => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please log in to propose a trade',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      navigate('/login')
      return
    }
    if (product) {
      setTradeTargetProductId(product.id)
      setIsTradeOpen(true)
    }
  }

  // Check if product is saved on component mount
  useEffect(() => {
    if (product && user) {
      checkSavedStatus()
    } else if (product && !user) {
      // Check localStorage for guest users
      const savedProducts = JSON.parse(localStorage.getItem('savedProducts') || '[]')
      setIsSaved(savedProducts.includes(product.id))
    }
  }, [product, user])

  const checkSavedStatus = async () => {
    if (!product || !user) return

    try {
      const response = await api.get(`/api/users/saved-products/${product.id}`)
      setIsSaved(response.data.data.isSaved)
    } catch (error) {
      console.log('API check failed, using localStorage fallback:', error)
      // If API fails, check localStorage as fallback
      const savedProducts = JSON.parse(localStorage.getItem('savedProducts') || '[]')
      setIsSaved(savedProducts.includes(product.id))
    }
  }

  const handleSaveToggle = async () => {
    if (!product) return

    if (!user) {
      // For guest users, use localStorage
      const savedProducts = JSON.parse(localStorage.getItem('savedProducts') || '[]')
      if (isSaved) {
        const updatedSaved = savedProducts.filter((id: number) => id !== product.id)
        localStorage.setItem('savedProducts', JSON.stringify(updatedSaved))
        setIsSaved(false)
        toast({
          title: 'Removed from saved',
          description: 'Product removed from your saved items',
          status: 'info',
          duration: 2000,
          isClosable: true,
        })
      } else {
        savedProducts.push(product.id)
        localStorage.setItem('savedProducts', JSON.stringify(savedProducts))
        setIsSaved(true)
        toast({
          title: 'Saved to watchlist',
          description: 'Product added to your saved items',
          status: 'success',
          duration: 2000,
          isClosable: true,
        })
      }
      return
    }

    // For logged-in users, use API
    try {
      setIsSaving(true)
      if (isSaved) {
        await api.delete(`/api/users/saved-products/${product.id}`)
        setIsSaved(false)
        toast({
          title: 'Removed from saved',
          description: 'Product removed from your saved items',
          status: 'info',
          duration: 2000,
          isClosable: true,
        })
      } else {
        await api.post(`/api/users/saved-products`, { product_id: product.id })
        setIsSaved(true)
        toast({
          title: 'Saved to watchlist',
          description: 'Product added to your saved items',
          status: 'success',
          duration: 2000,
          isClosable: true,
        })
      }
    } catch (error: any) {
      console.error('Save/unsave error:', error)
      let errorMessage = 'Failed to update saved status'

      if (error.response?.data?.error) {
        errorMessage = error.response.data.error
      } else if (error.response?.status === 404) {
        errorMessage = 'Product not found'
      } else if (error.response?.status === 401) {
        errorMessage = 'Please log in to save products'
      } else if (error.response?.status === 409) {
        errorMessage = 'Product already saved'
      }

      toast({
        title: 'Error',
        description: errorMessage,
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleShare = () => {
    onShareOpen()
  }

  const handleVote = async (voteType: 'under' | 'over') => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please log in to vote on price',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      navigate('/login')
      return
    }
    if (!product) return
    try {
      const response = await api.post(`/api/products/${product.id}/vote`, { vote: voteType })
      const data = response.data?.data
      setVotes(data?.votes || { under: 0, over: 0 })
      setUserVote(data?.user_vote || voteType)
      toast({
        title: 'Vote recorded',
        status: 'success',
        duration: 2000,
        isClosable: true,
      })
    } catch (err: unknown) {
      let description = 'Failed to submit vote'
      if (axios.isAxiosError(err)) {
        description = err.response?.data?.error || description
      } else if (err instanceof Error) {
        description = err.message
      }
      toast({
        title: 'Error',
        description,
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    }
  }

  const copyToClipboard = async () => {
    // Use slug-based URL if available, otherwise use current URL
    const url = product?.slug
      ? `${window.location.origin}/products/${product.slug}`
      : window.location.href
    try {
      await navigator.clipboard.writeText(url)
      toast({
        title: 'Link copied!',
        description: 'Product link copied to clipboard',
        status: 'success',
        duration: 2000,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: 'Copy failed',
        description: 'Failed to copy link to clipboard',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    }
  }

  const shareToSocial = (platform: string) => {
    // Use slug-based URL if available
    const productUrl = product?.slug
      ? `${window.location.origin}/products/${product.slug}`
      : window.location.href
    const url = encodeURIComponent(productUrl)
    const title = encodeURIComponent(product?.title || 'Check out this product')
    const description = encodeURIComponent(product?.description || '')

    let shareUrl = ''
    switch (platform) {
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`
        break
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?url=${url}&text=${title}`
        break
      case 'instagram':
        // Instagram doesn't support direct URL sharing, so we'll copy the link
        copyToClipboard()
        toast({
          title: 'Instagram sharing',
          description: 'Link copied! Paste it in your Instagram story or post',
          status: 'info',
          duration: 3000,
          isClosable: true,
        })
        return
      case 'email':
        shareUrl = `mailto:?subject=${title}&body=${description}%0A%0A${url}`
        break
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${title}%20${url}`
        break
    }

    if (shareUrl) {
      window.open(shareUrl, '_blank', 'width=600,height=400')
    }
  }

  const handleViewOffers = async () => {
    try {
      setLoadingOffers(true)
      const response = await api.get(`/api/trades?target_product_id=${product?.id}`)
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
    } else {
      ranked.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }

    return ranked
  }

  if (loading) {
    return (
      <Box bg="#FFFDF1" minH="100vh" w="100%">
        <Center h="50vh">
          <Spinner size="xl" color="brand.500" />
        </Center>
      </Box>
    )
  }

  if (error || !product) {
    return (
      <Box bg="#FFFDF1" minH="100vh" w="100%">
        <Container maxW="container.md" py={8}>
          <Alert status="error">
            <AlertIcon />
            {error || 'Product not found'}
          </Alert>
        </Container>
      </Box>
    )
  }

  const isOwner = user && user.id === product.seller_id
  const isUnavailable = product.status === 'traded' || product.status === 'sold' || product.status === 'locked'
  const canTradeOrPurchase = !isOwner && product.status === 'available'

  const totalVotes = votes.under + votes.over
  let priceFeedbackLabel = 'No community price feedback yet'
  let priceFeedbackColor: string = 'gray.500'

  if (totalVotes > 0) {
    if (votes.under > votes.over) {
      priceFeedbackLabel = 'Community thinks this is underpriced'
      priceFeedbackColor = 'green.500'
    } else if (votes.over > votes.under) {
      priceFeedbackLabel = 'Community thinks this is overpriced'
      priceFeedbackColor = 'orange.500'
    } else {
      priceFeedbackLabel = 'Community thinks this price is fair'
      priceFeedbackColor = 'blue.500'
    }
  }

  return (
    <Box bg="#FFFDF1" minH="100vh" w="100%" pb={{ base: 20, lg: 6 }}>
      <Container maxW="container.xl" py={8}>
        <VStack spacing={8} align="stretch">
          <Box bg="white" rounded="lg" shadow="sm" overflow="hidden">
            {/* Product Header */}
            <Box textAlign="center">
            </Box>

            {/* Product Content */}

            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={0}>
              {/* Product Image Gallery */}
              <VStack spacing={4} align="stretch">
                <Box position="relative" h="400px" bg="gray.100" rounded="md">
                  <Image
                    src={selectedImage || getFirstImage(product.image_urls)}
                    alt={product.title}
                    w="full"
                    h="full"
                    objectFit="contain"
                    fallbackSrc="https://via.placeholder.com/600x400?text=No+Image"
                  />
                  <HStack position="absolute" top={3} left={3} spacing={2}>
                    {product.premium && (
                      <Badge colorScheme="orange" px={2} py={1} fontSize="sm">
                        Premium Listing
                      </Badge>
                    )}
                    <Badge
                      colorScheme={
                        product.status === 'available'
                          ? 'teal'
                          : product.status === 'locked'
                            ? 'orange'
                            : 'red'
                      }
                      px={2}
                      py={1}
                      fontSize="sm"
                    >
                      {product.status}
                    </Badge>
                    {product.id && user && <ProximityBadge type="product" targetId={product.id} />}
                  </HStack>
                </Box>
                {product.image_urls && product.image_urls.length > 1 && (
                  <HStack spacing={2} overflowX="auto">
                    {product.image_urls.map((url, index) => (
                      <Box
                        key={index}
                        as="button"
                        w="80px"
                        h="80px"
                        p={1}
                        border="2px solid"
                        borderColor={selectedImage === getImageUrl(url) ? 'brand.500' : 'transparent'}
                        rounded="md"
                        onClick={() => setSelectedImage(getImageUrl(url))}
                      >
                        <Image
                          src={getImageUrl(url)}
                          alt={`Thumbnail ${index + 1}`}
                          w="full"
                          h="full"
                          objectFit="cover"
                          fallbackSrc="https://via.placeholder.com/80x80"
                        />
                      </Box>
                    ))}
                  </HStack>
                )}
              </VStack>

              {/* Product Details */}
              <Box
                p={{ base: 4, md: 6, lg: 8 }}
                display="flex"
                flexDirection="column"
                bg="white"
                borderRadius="8px"
                borderWidth="1px"
                borderColor="gray.100"
              >
                <VStack spacing={6} align="stretch" flex={1}>
                  {/* Counterfeit Warning */}
                  {product && <CounterfeitWarning productId={product.id} />}

                  <Box>
                    {/* Title and price on same horizontal axis */}
                    <Flex justify="space-between" align="center" gap={3} flexWrap="wrap">
                      <Heading size="lg" color="gray.800" mb={0} flex={1} minW={0}>
                        {product.title.charAt(0).toUpperCase() + product.title.slice(1)}
                      </Heading>
                      <Text
                        fontSize={{ base: 'xl', md: '2xl' }}
                        fontWeight="extrabold"
                        color="gray.800"
                        whiteSpace="nowrap"
                      >
                        ₱{product.price ? product.price.toFixed(2) : '0.00'}
                      </Text>
                    </Flex>
                    {/* Wants, Popularity, and metadata (condition/category) on same line */}
                    <HStack spacing={2} mt={2} flexWrap="wrap" align="center">
                      <Badge
                        colorScheme="pink"
                        variant="subtle"
                        borderRadius="8px"
                        px={2}
                        py={0.5}
                        fontSize="xs"
                      >
                        <HStack spacing={1}>
                          <FiHeart />
                          <Text as="span">{wishlistCount} wants</Text>
                        </HStack>
                      </Badge>
                      <Badge
                        colorScheme="gray"
                        variant="subtle"
                        borderRadius="8px"
                        px={2}
                        py={0.5}
                        fontSize="xs"
                      >
                        <HStack spacing={1}>
                          <FiTrendingUp />
                          <Text as="span">Popularity</Text>
                        </HStack>
                      </Badge>
                      {product.condition && (
                        <Badge colorScheme="blue" variant="subtle" borderRadius="8px" px={2} py={0.5} fontSize="xs">
                          {product.condition}
                        </Badge>
                      )}
                      {product.category && (
                        <Badge colorScheme="purple" variant="subtle" borderRadius="8px" px={2} py={0.5} fontSize="xs">
                          {product.category}
                        </Badge>
                      )}
                      {product.bidding_type && product.bidding_type !== 'none' && (
                        <Badge
                          colorScheme="gray"
                          variant="subtle"
                          borderRadius="8px"
                          px={2}
                          py={0.5}
                          fontSize="xs"
                        >
                          {product.bidding_type === 'blind' ? 'Blind Bidding' : 'Open Bidding'}
                        </Badge>
                      )}
                      {(product.want_count && product.want_count > 0) ? (
                        <Badge
                          colorScheme="red"
                          variant="subtle"
                          borderRadius="8px"
                          px={2}
                          py={0.5}
                          fontSize="xs"
                        >
                          <HStack spacing={1}>
                            <FiHeart />
                            <Text as="span">{product.want_count} {product.want_count === 1 ? 'user wants' : 'users want'} this</Text>
                          </HStack>
                        </Badge>
                      ) : null}
                      <Text fontSize="xs" color="gray.500">
                        · Listed {new Date(product.created_at).toLocaleDateString()}
                      </Text>
                    </HStack>
                    {product.suggested_value != null && product.suggested_value > 0 && (
                      <Text mt={1} fontSize="xs" color="gray.500">
                        Trade points: {product.suggested_value}
                      </Text>
                    )}

                    {/* Action row: Love, Share, Flag on left; Price Feedback on far right (under price) */}
                    <Flex justify="space-between" align="center" mt={4} flexWrap="wrap" gap={2}>
                      <HStack spacing={1}>
                        <Tooltip label={isSaved ? "Remove from saved" : "Save to watchlist"}>
                          <IconButton
                            aria-label={isSaved ? "Remove from saved" : "Save"}
                            icon={<FiHeart />}
                            size="sm"
                            variant={isSaved ? "solid" : "outline"}
                            colorScheme="red"
                            borderRadius="8px"
                            isLoading={isSaving}
                            onClick={handleSaveToggle}
                            _hover={isSaved ? { bg: 'red.600' } : { bg: 'red.50', borderColor: 'red.400' }}
                            _active={{ transform: 'scale(0.98)' }}
                            transition="all 0.15s"
                          />
                        </Tooltip>
                        <Tooltip label="Share">
                          <IconButton
                            aria-label="Share"
                            icon={<FiShare2 />}
                            size="sm"
                            variant="outline"
                            colorScheme="blue"
                            borderRadius="8px"
                            borderColor="blue.300"
                            color="blue.500"
                            onClick={handleShare}
                            _hover={{ bg: 'blue.50', borderColor: 'blue.400' }}
                            _active={{ transform: 'scale(0.98)' }}
                            transition="all 0.15s"
                          />
                        </Tooltip>
                        {!isOwner && (
                          <Tooltip label="Report">
                            <IconButton
                              aria-label="Report"
                              icon={<FiFlag />}
                              size="sm"
                              variant="solid"
                              colorScheme="red"
                              borderRadius="8px"
                              bg="red.600"
                              color="white"
                              onClick={() => setIsReportOpen(true)}
                              _hover={{ bg: 'red.700' }}
                              _active={{ transform: 'scale(0.98)' }}
                              transition="all 0.15s"
                            />
                          </Tooltip>
                        )}
                      </HStack>
                      <VStack align="flex-end" spacing={0}>
                        <ButtonGroup
                          isAttached
                          size="sm"
                          borderRadius="8px"
                          overflow="hidden"
                          borderWidth="1px"
                          borderColor="gray.200"
                          bg="white"
                        >
                          <Tooltip label={`Underpriced (${votes.under})`}>
                            <IconButton
                              aria-label="Underpriced"
                              icon={<FiTrendingDown />}
                              variant={userVote === 'under' ? 'solid' : 'ghost'}
                              colorScheme={userVote === 'under' ? 'green' : 'gray'}
                              borderRadius={0}
                              borderRightWidth="1px"
                              borderRightColor="gray.200"
                              onClick={() => handleVote('under')}
                              isDisabled={Boolean(product.price === null || product.price === undefined || isOwner)}
                              _hover={{ bg: userVote === 'under' ? undefined : 'gray.50' }}
                              _active={{ transform: 'scale(0.98)' }}
                              transition="all 0.15s"
                            />
                          </Tooltip>
                          <Tooltip label={`Overpriced (${votes.over})`}>
                            <IconButton
                              aria-label="Overpriced"
                              icon={<FiTrendingUp />}
                              variant={userVote === 'over' ? 'solid' : 'ghost'}
                              colorScheme={userVote === 'over' ? 'orange' : 'gray'}
                              borderRadius={0}
                              onClick={() => handleVote('over')}
                              isDisabled={Boolean(product.price === null || product.price === undefined || isOwner)}
                              _hover={{ bg: userVote === 'over' ? undefined : 'gray.50' }}
                              _active={{ transform: 'scale(0.98)' }}
                              transition="all 0.15s"
                            />
                          </Tooltip>
                        </ButtonGroup>
                        <Text fontSize="xs" color={priceFeedbackColor} mt={1} fontWeight="medium">
                          {priceFeedbackLabel}
                        </Text>
                      </VStack>
                    </Flex>

                    {/* Consolidated seller + dates block for better UX (responsive) */}
                    <Flex
                      w="full"
                      justify="space-between"
                      align="center"
                      flexDir={{ base: 'column', md: 'row' }}
                    >
                    </Flex>
                  </Box>

                  <Divider borderColor="gray.200" />

                  <Box
                    p={4}
                    borderRadius="8px"
                    bg="gray.50"
                    borderWidth="1px"
                    borderColor="gray.100"
                  >
                    <Heading size="sm" mb={3} color="gray.800" fontWeight="600">
                      Description
                    </Heading>
                    <Text
                      color="gray.700"
                      lineHeight="tall"
                      fontSize="sm"
                      whiteSpace="pre-line"
                      noOfLines={isDescriptionExpanded ? undefined : 6}
                    >
                      {product.description}
                    </Text>
                    {product.description && product.description.length > 260 && (
                      <Button
                        mt={2}
                        size="xs"
                        variant="ghost"
                        color="gray.600"
                        fontWeight="500"
                        _hover={{ bg: 'gray.100' }}
                        onClick={() => setIsDescriptionExpanded(prev => !prev)}
                      >
                        {isDescriptionExpanded ? 'Show less' : 'Show more'}
                      </Button>
                    )}
                  </Box>



                  <Box>
                    <VStack spacing={2} align="stretch">
                      <Flex justify="space-between">
                      </Flex>
                      {/* <Flex justify="space-between">
                      <Text color="gray.600">Listed:</Text>
                      <Text>{new Date(product.created_at).toLocaleDateString()}</Text>
                    </Flex>
                    <Flex justify="space-between">
                      <Text color="gray.600">Last Updated:</Text>
                      <Text>{new Date(product.updated_at).toLocaleDateString()}</Text>
                    </Flex> */}
                    </VStack>
                  </Box>
                </VStack>

                {/* Action Buttons: full-width primary + compact Offers icon square */}
                <VStack spacing={4} mt={8} pt={6}>
                  {!isOwner && product.status === 'available' && (
                    <VStack spacing={3} w="full">
                      {product.allow_buying && product.price && !product.barter_only ? (
                        <HStack w="full" spacing={2} align="stretch">
                          <Button
                            flex={1}
                            size="lg"
                            borderRadius="8px"
                            bg="gray.800"
                            color="white"
                            _hover={{ bg: 'gray.700' }}
                            _active={{ transform: 'scale(0.98)' }}
                            transition="all 0.15s"
                            onClick={handlePurchase}
                            isLoading={purchasing}
                            loadingText="Processing..."
                          >
                            Buy Now - ₱{product.price.toFixed(2)}
                          </Button>
                          <Tooltip label={`Offers (${(product as any).offer_count || 0})`}>
                            <IconButton
                              aria-label="View offers"
                              icon={<FaHandshake />}
                              w="48px"
                              h="48px"
                              minW="48px"
                              borderRadius="8px"
                              variant="outline"
                              borderColor="gray.200"
                              color="gray.700"
                              bg="white"
                              onClick={handleViewOffers}
                              _hover={{ bg: 'gray.50', borderColor: 'gray.300' }}
                              _active={{ transform: 'scale(0.98)' }}
                              transition="all 0.15s"
                            />
                          </Tooltip>
                        </HStack>
                      ) : (
                        <HStack w="full" spacing={2} align="stretch">
                          <Tooltip label={hasPendingOfferOnProduct ? "You already have a pending offer on this product" : "Propose a trade"}>
                            <Button
                              flex={1}
                              size="lg"
                              borderRadius="8px"
                              colorScheme={hasPendingOfferOnProduct ? "gray" : "green"}
                              _active={{ transform: 'scale(0.98)' }}
                              transition="all 0.15s"
                              onClick={openTrade}
                              isDisabled={hasPendingOfferOnProduct}
                              opacity={hasPendingOfferOnProduct ? 0.6 : 1}
                            >
                              {hasPendingOfferOnProduct ? "Pending Offer Sent" : "Trade Offer"}
                            </Button>
                          </Tooltip>
                          <Tooltip label={`Offers (${(product as any).offer_count || 0})`}>
                            <IconButton
                              aria-label="View offers"
                              icon={<FaHandshake />}
                              w="48px"
                              h="48px"
                              minW="48px"
                              borderRadius="8px"
                              variant="outline"
                              borderColor="gray.200"
                              color="gray.700"
                              bg="white"
                              onClick={handleViewOffers}
                              _hover={{ bg: 'gray.50', borderColor: 'gray.300' }}
                              _active={{ transform: 'scale(0.98)' }}
                              transition="all 0.15s"
                            />
                          </Tooltip>
                        </HStack>
                      )}
                    </VStack>
                  )}

                  {isOwner && (
                    <HStack spacing={4} w="full">
                      <Button
                        variant="outline"
                        colorScheme="gray"
                        size="lg"
                        flex={1}
                        borderRadius="8px"
                        borderColor="gray.200"
                        onClick={() => navigate(`/edit-product/${product.id}`)}
                      >
                        Edit Product
                      </Button>
                      <Button
                        variant="outline"
                        colorScheme="gray"
                        size="lg"
                        flex={1}
                        borderRadius="8px"
                        borderColor="gray.200"
                        onClick={() => navigate('/dashboard')}
                      >
                        View Dashboard
                      </Button>
                    </HStack>
                  )}

                  {/* Unavailable Status Messages */}
                  {isUnavailable && !isOwner && (
                    <Alert status="warning" borderRadius="md">
                      <AlertIcon />
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="bold">
                          {product.status === 'traded'
                            ? 'This item has already been traded and is no longer available'
                            : product.status === 'sold'
                              ? 'This product has been sold'
                              : 'This item is currently reserved in a trade'}
                        </Text>
                        <Text fontSize="sm" color="gray.600">
                          Only the original owner can view this item.
                        </Text>
                      </VStack>
                    </Alert>
                  )}
                  {product.status === 'sold' && isOwner && (
                    <Box textAlign="center" py={4} w="full">
                      <Text color="red.500" fontWeight="bold">
                        This product has been sold
                      </Text>
                    </Box>
                  )}
                  {product.status === 'locked' && isOwner && (
                    <Box textAlign="center" py={4} w="full">
                      <Text color="orange.500" fontWeight="bold">
                        This item is currently reserved in a trade.
                      </Text>
                    </Box>
                  )}
                  {product.status === 'traded' && isOwner && (
                    <Box textAlign="center" py={4} w="full">
                      <Text color="green.500" fontWeight="bold">
                        This item has been successfully traded.
                      </Text>
                    </Box>
                  )}
                </VStack>
              </Box>
            </SimpleGrid>
          </Box>

          {/* Seller Information */}
          <Box bg="white" p={6} rounded="lg" shadow="sm">
            <Heading size="md" mb={4}>
              About the Seller
            </Heading>
            <Flex justify="space-between" align="stretch" gap={6}>
              <HStack spacing={4} flex={1}>
                <Avatar
                  size="lg"
                  src={sellerProfile?.profile_picture}
                  name={product.seller_name}
                  bg="red.500"
                  color="white"
                />
                <Box>
                  <Text
                    as={RouterLink}
                    to={`/users/${product.seller_id}`}
                    fontWeight="bold"
                    color="blue.600"
                    _hover={{ textDecoration: 'underline' }}
                  >
                    {product.seller_name}
                  </Text>
                  <Text color="gray.600" fontSize="sm">
                    Member since {sellerStats?.member_since_year ?? new Date().getFullYear()}
                  </Text>
                  <HStack spacing={2} mt={2}>
                    {product.seller_id && <ResponseMetricsBadge userId={product.seller_id} />}
                    {product.seller_id && user && <ProximityBadge type="user" targetId={product.seller_id} />}
                  </HStack>
                </Box>
              </HStack>

              {/* Seller Stats */}
              <SimpleGrid columns={{ base: 2, md: 4 }} spacing={{ base: 3, md: 4 }} flex={1} alignItems="start" mt={-6}>
                <VStack spacing={1} align="center">
                  <Text fontSize={{ base: 'lg', md: 'xl', lg: '2xl' }} fontWeight="bold" color="brand.500">
                    {sellerStats?.avg_rating?.toFixed(1) ?? 'N/A'}
                  </Text>
                  <Text fontSize={{ base: '2xs', md: 'xs', lg: 'sm' }} color="gray.600" textAlign="center">
                    Rating
                  </Text>
                </VStack>
                <VStack spacing={1} align="center">
                  <Text fontSize={{ base: 'lg', md: 'xl', lg: '2xl' }} fontWeight="bold" color="green.500">
                    {sellerStats?.positive_percent?.toFixed(0) ?? 'N/A'}%
                  </Text>
                  <Text fontSize={{ base: '2xs', md: 'xs', lg: 'sm' }} color="gray.600" textAlign="center">
                    Positive
                  </Text>
                </VStack>
                <VStack spacing={1} align="center">
                  <Text fontSize={{ base: 'lg', md: 'xl', lg: '2xl' }} fontWeight="bold" color="blue.500">
                    {sellerStats?.total_trades ?? 0}
                  </Text>
                  <Text fontSize={{ base: '2xs', md: 'xs', lg: 'sm' }} color="gray.600" textAlign="center">
                    Trades
                  </Text>
                </VStack>
                <VStack spacing={1} align="center">
                  <Text fontSize={{ base: 'lg', md: 'xl', lg: '2xl' }} fontWeight="bold" color="purple.500">
                    {sellerStats?.avg_response_time ?? 'N/A'}
                  </Text>
                  <Text fontSize={{ base: '2xs', md: 'xs', lg: 'sm' }} color="gray.600" textAlign="center">
                    Avg Response
                  </Text>
                </VStack>
              </SimpleGrid>
            </Flex>
          </Box>

          {/* Seller Products Section */}
          <Box bg="white" p={6} rounded="lg" shadow="sm">
            <Heading size="md" mb={6}>
              Seller Products
            </Heading>
            <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing={4}>
              {sellerProducts && sellerProducts.length > 0 ? (
                sellerProducts.map((p) => (
                  <Box
                    key={p.id}
                    borderWidth="1px"
                    borderRadius="lg"
                    overflow="hidden"
                    bg="white"
                    _hover={{ shadow: 'md', cursor: 'pointer' }}
                    transition="all 0.3s"
                    onClick={() => navigate(getProductUrl(p))}
                  >
                    <Box h="200px" bg="gray.200" position="relative" overflow="hidden">
                      <Image
                        src={getFirstImage(p.image_urls)}
                        alt={p.title}
                        w="full"
                        h="full"
                        objectFit="cover"
                        fallbackSrc="/images/placeholder.jpg"
                      />
                      <Badge position="absolute" top={2} right={2} colorScheme={p.status === 'available' ? 'teal' : p.status === 'sold' ? 'red' : 'orange'} fontSize="xs">
                        {p.status}
                      </Badge>
                    </Box>
                    <Box p={3}>
                      <HStack justify="space-between" mb={2}>
                        <Heading size="sm" noOfLines={1}>{p.title}</Heading>
                        {p.premium && (
                          <Badge colorScheme="orange" fontSize="xs">Premium</Badge>
                        )}
                      </HStack>
                      <Text fontSize="xs" color="gray.600" mb={2} noOfLines={2}>
                        {p.description}
                      </Text>
                      <Text fontSize="sm" fontWeight="bold" color="brand.500">
                        ₱{p.price ? p.price.toFixed(2) : '0.00'}
                      </Text>
                      {p.barter_only && (
                        <Badge colorScheme="cyan" mt={2} fontSize="xs">Barter Only</Badge>
                      )}
                    </Box>
                  </Box>
                ))
              ) : (
                <Box p={4} w="full">
                  <Text color="gray.600">No other products from this seller.</Text>
                </Box>
              )}
            </SimpleGrid>
          </Box>
        </VStack>
        <TradeModal isOpen={isTradeOpen} onClose={() => setIsTradeOpen(false)} targetProductId={tradeTargetProductId} />

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
              ) : (() => {
                const isBlind = product?.bidding_type === 'blind'
                const showAll = !isBlind || isOwner
                const allOffers = getRankedOffers()
                const visibleOffers = showAll ? allOffers : allOffers.filter((o: any) => user && o.buyer_id === user.id)

                if (allOffers.length === 0) {
                  return (
                    <Box textAlign="center" py={8}>
                      <Text color="gray.600">No offers yet</Text>
                    </Box>
                  )
                }

                return (
                  <VStack spacing={3} align="stretch">
                    {!showAll && (
                      <Box textAlign="center" p={3} bg="orange.50" rounded="md" borderWidth="1px" borderColor="orange.200">
                        <HStack justify="center" spacing={2} mb={1}>
                          <Text fontSize="lg">🤐</Text>
                          <Text fontSize="sm" color="orange.800" fontWeight="bold">Blind Bidding Active</Text>
                        </HStack>
                        <Text fontSize="xs" color="orange.800">
                          Offers are hidden. You can only view your own offers.
                        </Text>
                      </Box>
                    )}

                    {!showAll && visibleOffers.length === 0 && (
                      <Box textAlign="center" py={8}>
                        <Text color="gray.500">You haven't made an offer yet.</Text>
                      </Box>
                    )}

                    {visibleOffers.map((offer: any, index: number) => (
                      <Box
                        key={offer.id}
                        p={4}
                        borderWidth="2px"
                        borderColor={showAll && index === 0 ? 'gold' : offer.status === 'accepted' ? 'green.400' : 'gray.200'}
                        rounded="lg"
                        bg={showAll && index === 0 ? 'yellow.50' : offer.status === 'accepted' ? 'green.50' : 'white'}
                        position="relative"
                      >
                        {/* Rank Badge - Only show if showing all */}
                        {showAll && (
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
                        )}

                        <HStack justify="space-between" mb={2} mt={showAll ? 2 : 0}>
                          <HStack>
                            {showAll && index === 0 && (
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
                              {item.product_title?.substring(0, 20) || `Item ${idx + 1}`}
                            </Badge>
                          ))}
                        </HStack>
                      </Box>
                    ))}
                  </VStack>
                )
              })()}
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Share Modal */}
        <Modal isOpen={isShareOpen} onClose={onShareClose} size="md">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Share this product</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={6}>
              <VStack spacing={4} align="stretch">
                {/* Copy Link */}
                <Box>
                  <Text fontWeight="medium" mb={2}>Copy Link</Text>
                  <HStack>
                    <Input
                      value={product?.slug ? `${window.location.origin}/products/${product.slug}` : window.location.href}
                      readOnly
                      size="sm"
                      bg="gray.50"
                    />
                    <Button
                      leftIcon={<FiCopy />}
                      onClick={copyToClipboard}
                      size="sm"
                      colorScheme="blue"
                    >
                      Copy
                    </Button>
                  </HStack>
                </Box>

                <Divider />

                {/* Social Media Sharing */}
                <Box>
                  <Text fontWeight="medium" mb={3}>Share on Social Media</Text>
                  <SimpleGrid columns={2} spacing={3}>
                    <Button
                      leftIcon={<FiFacebook />}
                      colorScheme="blue"
                      variant="outline"
                      onClick={() => shareToSocial('facebook')}
                      size="sm"
                    >
                      Facebook
                    </Button>
                    <Button
                      leftIcon={<FiTwitter />}
                      colorScheme="blue"
                      variant="outline"
                      onClick={() => shareToSocial('twitter')}
                      size="sm"
                    >
                      Twitter
                    </Button>
                    <Button
                      leftIcon={<FiInstagram />}
                      colorScheme="pink"
                      variant="outline"
                      onClick={() => shareToSocial('instagram')}
                      size="sm"
                    >
                      Instagram
                    </Button>
                    <Button
                      leftIcon={<FiMessageCircle />}
                      colorScheme="green"
                      variant="outline"
                      onClick={() => shareToSocial('whatsapp')}
                      size="sm"
                    >
                      WhatsApp
                    </Button>
                    <Button
                      leftIcon={<FiMail />}
                      colorScheme="gray"
                      variant="outline"
                      onClick={() => shareToSocial('email')}
                      size="sm"
                      gridColumn="span 2"
                    >
                      Email
                    </Button>
                  </SimpleGrid>
                </Box>
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Report Modal for submitting trader reports */}
        <Modal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} size="md">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Report Trader for Policy Violation</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack spacing={4}>
                <Box w="full">
                  <Text fontWeight="medium" mb={2}>Reason for Report</Text>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e0',
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value="">Select a reason...</option>
                    <option value="inappropriate">Inappropriate Behavior</option>
                    <option value="counterfeit">Counterfeit Items</option>
                    <option value="spam">Spam</option>
                    <option value="scam">Scam/Fraud</option>
                  </select>
                </Box>

                <Box w="full">
                  <Text fontWeight="medium" mb={2}>Description</Text>
                  <textarea
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="Please provide details about your report (minimum 10 characters)"
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e0',
                      fontFamily: 'inherit',
                      minHeight: '100px',
                      resize: 'vertical',
                    }}
                  />
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    {reportDescription.length} characters
                  </Text>
                </Box>
              </VStack>
            </ModalBody>
            <Box p={4} borderTop="1px solid" borderColor="gray.200">
              <HStack spacing={3}>
                <Button
                  flex={1}
                  variant="outline"
                  onClick={() => setIsReportOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  flex={1}
                  colorScheme="red"
                  onClick={handleSubmitReport}
                  isLoading={isSubmittingReport}
                  loadingText="Submitting..."
                >
                  Submit Report
                </Button>
              </HStack>
            </Box>
          </ModalContent>
        </Modal>
      </Container>

      {/* Buy Confirmation Modal */}
      <Modal isOpen={isBuyModalOpen} onClose={() => setIsBuyModalOpen(false)} isCentered size="sm">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent borderRadius="16px" overflow="hidden">
          <ModalHeader
            bgGradient="linear(to-r, gray.800, gray.700)"
            color="white"
            py={4}
            px={6}
            fontSize="lg"
          >
            Confirm Purchase
          </ModalHeader>
          <ModalCloseButton color="white" />
          <ModalBody py={6} px={6}>
            <VStack spacing={4} align="stretch">
              {product && (
                <HStack spacing={4} p={3} bg="gray.50" borderRadius="12px" borderWidth="1px" borderColor="gray.100">
                  {product.image_urls && product.image_urls.length > 0 && (
                    <Image
                      src={getImageUrl(product.image_urls[0])}
                      alt={product.title}
                      w="60px"
                      h="60px"
                      objectFit="cover"
                      borderRadius="8px"
                      fallbackSrc="https://via.placeholder.com/60x60?text=?"
                    />
                  )}
                  <VStack align="start" spacing={0} flex={1} minW={0}>
                    <Text fontWeight="600" fontSize="sm" noOfLines={2} color="gray.800">
                      {product.title}
                    </Text>
                    <Text fontWeight="800" fontSize="xl" color="gray.800" mt={1}>
                      ₱{product.price?.toFixed(2) ?? '0.00'}
                    </Text>
                  </VStack>
                </HStack>
              )}
              <VStack align="stretch" spacing={1}>
                <HStack justify="space-between">
                  <Text fontSize="sm" color="gray.600">Seller</Text>
                  <Text fontSize="sm" fontWeight="500">{product?.seller_name ?? 'Unknown'}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="sm" color="gray.600">Status</Text>
                  <Badge colorScheme="green" borderRadius="6px" px={2}>Available</Badge>
                </HStack>
              </VStack>
              <Alert status="info" borderRadius="10px" fontSize="sm">
                <AlertIcon />
                The seller will confirm your order. You will be notified once it is accepted.
              </Alert>
            </VStack>
          </ModalBody>
          <Box px={6} py={4} borderTop="1px" borderColor="gray.100">
            <HStack spacing={3}>
              <Button
                flex={1}
                variant="outline"
                borderRadius="10px"
                onClick={() => setIsBuyModalOpen(false)}
                isDisabled={purchasing}
              >
                Cancel
              </Button>
              <Button
                flex={2}
                bg="gray.800"
                color="white"
                borderRadius="10px"
                _hover={{ bg: 'gray.700' }}
                onClick={confirmPurchase}
                isLoading={purchasing}
                loadingText="Placing Order..."
                leftIcon={<FiBookmark />}
              >
                Confirm ₱{product?.price?.toFixed(2) ?? '0.00'}
              </Button>
            </HStack>
          </Box>
        </ModalContent>
      </Modal>

      <FloatingTab />
    </Box>
  )
}

export default ProductDetail
