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
  FiBookmark
} from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { Product } from '../types'
import { api } from '../services/api'
import { getFirstImage, getImageUrl } from '../utils/imageUtils';
import TradeModal from '../components/TradeModal'
import axios from 'axios';

const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { getProduct } = useProducts()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [purchasing, setPurchasing] = useState(false)
  const [isTradeOpen, setIsTradeOpen] = useState(false)
  const [tradeTargetProductId, setTradeTargetProductId] = useState<number | null>(null)
  const [selectedImage, setSelectedImage] = useState<string>('')
  const [isSaved, setIsSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  const navigate = useNavigate()
  const toast = useToast()
  const { isOpen: isShareOpen, onOpen: onShareOpen, onClose: onShareClose } = useDisclosure()

  useEffect(() => {
    if (id) {
      fetchProduct()
    }
  }, [id])

  useEffect(() => {
    if (product && user) {
      checkWishlistStatus();
    }
    if (product) {
        setWishlistCount(product.wishlist_count || 0);
    }
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
      const productData = await getProduct(parseInt(id!))
      if (productData) {
        setProduct(productData)
        if (productData.image_urls && productData.image_urls.length > 0) {
          setSelectedImage(getImageUrl(productData.image_urls[0]))
        }
      } else {
        setError('Product not found')
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'An unexpected error occurred');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async () => {
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

    try {
      setPurchasing(true)
      const response = await api.post('/api/orders', {
        product_id: product.id,
      })
      
      toast({
        title: 'Order placed successfully!',
        description: 'Your order has been created and is pending confirmation',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })
      
      // Redirect to dashboard to view the order
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

  const copyToClipboard = async () => {
    const url = window.location.href
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
    const url = encodeURIComponent(window.location.href)
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

  return (
    <Box bg="#FFFDF1" minH="100vh" w="100%">
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
            <Box p={8}>
              <VStack spacing={6} align="stretch">
                <Box>
                  {/* Title on the left, Price on the right (noticeable) */}
                  <Flex justify="space-between" align="center">
                    <HStack>
                      <Heading size="lg" color="brand.500" mb={0}>
                        {product.title}
                      </Heading>
                      <Text color="gray.500">({wishlistCount} wants)</Text>
                    </HStack>
                    <Text
                      fontSize={{ base: 'xl', md: '3xl' }}
                      fontWeight="extrabold"
                      color="brand.500"
                      textAlign="right"
                    >
                      ₱{product.price ? product.price.toFixed(2) : '0.00'}
                    </Text>
                  </Flex>

                  {/* Save/Watch and Share buttons */}
                  <Flex justify="space-between" align="center" mt={4}>
                    <HStack spacing={2}>
                      <Tooltip label={isSaved ? "Remove from saved" : "Save to watchlist"}>
                        <IconButton
                          aria-label={isSaved ? "Remove from saved" : "Save to watchlist"}
                          icon={<FiHeart />}
                          colorScheme={isSaved ? "red" : "gray"}
                          variant={isSaved ? "solid" : "outline"}
                          color={isSaved ? "white" : "red.500"}
                          isLoading={isSaving}
                          onClick={handleSaveToggle}
                          size="md"
                        />
                      </Tooltip>
                      <Text fontSize="sm" color="gray.600">
                        {isSaved ? "Saved" : "Save"}
                      </Text>
                    </HStack>

                    <HStack spacing={2}>
                      <Tooltip label="Share this product">
                        <IconButton
                          aria-label="Share product"
                          icon={<FiShare2 />}
                          colorScheme="blue"
                          variant="outline"
                          onClick={handleShare}
                          size="md"
                        />
                      </Tooltip>
                      <Text fontSize="sm" color="gray.600">
                        Share
                      </Text>
                    </HStack>
                  </Flex>

                  {/* Premium + Status badges aligned together with gap 2 */}
                  <HStack spacing={2} mt={2} align="center">
                    {product.premium && (
                      <Badge colorScheme="yellow" px={2}>
                        Premium Listing
                      </Badge>
                    )}
                    <Badge
                      colorScheme={
                        product.status === 'available'
                          ? 'green'
                          : product.status === 'locked'
                          ? 'orange'
                          : 'red'
                      }
                    >
                      {product.status}
                    </Badge>
                    {product.condition && (
                      <Badge colorScheme="blue">{product.condition}</Badge>
                    )}
                    {product.category && (
                      <Badge colorScheme="purple">{product.category}</Badge>
                    )}
                  </HStack>
                  {product.suggested_value && product.suggested_value > 0 && (
                  <Text mt={2} color="gray.600" fontSize="sm">
                    Suggested Value: {product.suggested_value} points
                  </Text>
                  )}

                  {/* Consolidated seller + dates block for better UX (responsive) */}
                  <Flex
                    mt={3}
                    w="full"
                    justify="space-between"
                    align="center"
                    flexDir={{ base: 'column', md: 'row' }}
                  >
                    <Box mb={{ base: 2, md: 0 }}>
                      <Text
                        as={RouterLink}
                        to={`/users/${product.seller_id}`}
                        color="blue.600"
                        fontSize="lg"
                        _hover={{ textDecoration: 'underline' }}
                      >
                        Listed by {product.seller_name}
                      </Text>
                    </Box>

                    <VStack spacing={0} align={{ base: 'flex-start', md: 'flex-end' }}>
                      <Text fontSize="sm" color="gray.500">
                        Listed: {new Date(product.created_at).toLocaleDateString()}
                      </Text>
                      <Text fontSize="sm" color="gray.500">
                        Last updated: {new Date(product.updated_at).toLocaleDateString()}
                      </Text>
                    </VStack>
                  </Flex>
                </Box>

                <Divider />

                <Box>
                  <Heading size="md" mb={3}>
                    Description
                  </Heading>
                  <Text color="gray.700" lineHeight="tall">
                    {product.description}
                  </Text>
                </Box>

                <Divider />

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

                {/* Action Buttons */}
                {!isOwner && product.status === 'available' && (
                  <VStack spacing={4} mt={-10} pb={-10} >
                    {product.allow_buying && product.price && !product.barter_only ? (
                      <HStack spacing={4} w="full">
                        <Button
                          colorScheme="brand"
                          size="lg"
                          w="full"
                          onClick={handlePurchase}
                          isLoading={purchasing}
                          loadingText="Processing..."
                        >
                          Buy Now - ₱{product.price.toFixed(2)}
                        </Button>
                        <Button
                          variant={isWishlisted ? "solid" : "outline"}
                          colorScheme="pink"
                          size="lg"
                          onClick={handleWishlist}
                        >
                          {isWishlisted ? "Wanted" : "Want"}
                        </Button>
                      </HStack>
                    ) : (
                      <HStack spacing={4} w="full">
                        <Button
                          colorScheme="green"
                          size="lg"
                          w="full"
                          onClick={openTrade}
                        >
                          Trade Offer
                        </Button>
                        <Button
                          variant={isWishlisted ? "solid" : "outline"}
                          colorScheme="pink"
                          size="lg"
                          onClick={handleWishlist}
                        >
                          {isWishlisted ? "Wanted" : "Want"}
                        </Button>
                      </HStack>
                    )}
                  </VStack>
                )}

                {isOwner && (
                  <VStack spacing={4} mt={-16}>
                    <HStack spacing={4} w="full">
                      <Button
                        variant="outline"
                        colorScheme="brand"
                        size="lg"
                        flex={1}
                        onClick={() => navigate(`/edit-product/${product.id}`)}
                      >
                        Edit Product
                      </Button>
                      <Button
                        variant="outline"
                        colorScheme="brand"
                        size="lg"
                        flex={1}
                        onClick={() => navigate('/dashboard')}
                      >
                        View Dashboard
                      </Button>
                    </HStack>
                  </VStack>
                )}

                {product.status === 'sold' && (
                  <Box textAlign="center" py={4}>
                    <Text color="red.500" fontWeight="bold">
                      This product has been sold
                    </Text>
                  </Box>
                )}
                {product.status === 'locked' && (
                  <Box textAlign="center" py={4}>
                    <Text color="orange.500" fontWeight="bold">
                      This item is currently reserved in a trade.
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
          <HStack spacing={4}>
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
                Member since {new Date().getFullYear()}
              </Text>
            </Box>
            <Button
              variant="outline"
              colorScheme="brand"
              size="sm"
              onClick={() => navigate(`/products?seller_id=${product.seller_id}`)}
            >
              View All Products
            </Button>
          </HStack>
        </Box>
      </VStack>
      <TradeModal isOpen={isTradeOpen} onClose={() => setIsTradeOpen(false)} targetProductId={tradeTargetProductId} />
      
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
                    value={window.location.href}
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
      </Container>
    </Box>
   )
}

export default ProductDetail
