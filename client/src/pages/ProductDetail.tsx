import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
} from '@chakra-ui/react'
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
  
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => {
    if (id) {
      fetchProduct()
    }
  }, [id])

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
                    <Heading size="lg" color="brand.500" mb={0}>
                      {product.title}
                    </Heading>
                    <Text
                      fontSize={{ base: 'xl', md: '3xl' }}
                      fontWeight="extrabold"
                      color="brand.500"
                      textAlign="right"
                    >
                      ₱{product.price ? product.price.toFixed(2) : '0.00'}
                    </Text>
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
                      <Text color="gray.600" fontSize="lg">
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
                      <>
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
                        <Text fontSize="sm" color="gray.500" textAlign="center">
                          Secure transaction • Fast delivery • Buyer protection
                        </Text>
                      </>
                    ) : (
                      <Box textAlign="center" py={2} >
                        <Button
                          colorScheme="green"
                          size="lg"
                          w="full"
                          mb={-10}
                          onClick={openTrade}
                        >
                          Trade Offer
                        </Button>
                      </Box>
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
              <Text fontWeight="bold">{product.seller_name}</Text>
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
      </Container>
    </Box>
   )
}

export default ProductDetail
