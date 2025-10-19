import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  SimpleGrid,
  useToast,
  IconButton,
  Tooltip,
  Card,
  CardBody,
  CardHeader,
  Divider,
} from '@chakra-ui/react'
import { 
  FiHeart, 
  FiEye, 
  FiShoppingCart,
  FiRefreshCw,
  FiArrowLeft,
  FiTrash2
} from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { Product } from '../types'
import { api } from '../services/api'
import { getFirstImage, getImageUrl } from '../utils/imageUtils'
import axios, { AxiosError } from 'axios'

interface SavedProductsResponse {
  status: string;
  data: {
    data: Product[];
    count?: number;
  };
}

const SavedProducts: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  
  // Force redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/login', { state: { from: '/saved-products' } });
    }
  }, [user, navigate]);

  const [savedProducts, setSavedProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<number | null>(null)
  
  const toast = useToast()

  const fetchSavedProducts = async (retryCount = 0) => {
    try {
      setLoading(true)
      setError('')
      
      if (!user) {
        throw new Error('Authentication required')
      }

      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('No authentication token found')
      }

      console.log('Fetching saved products with token:', token.substring(0, 20) + '...')
      
      const response = await api.get<SavedProductsResponse>('/api/users/saved-products', {
        timeout: 8000,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })

      // Log full response for debugging
      console.log('API Response:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data
      })

      // Validate response structure
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response format')
      }

      const products = response.data?.data?.data || []
      
      if (!Array.isArray(products)) {
        throw new Error('Products data is not an array')
      }

      console.log(`Successfully fetched ${products.length} saved products`)
      setSavedProducts(products)

    } catch (err: any) {
      const errorDetails = {
        message: err.message,
        status: err.response?.status,
        statusText: err.response?.statusText,
        responseData: err.response?.data,
        stack: err.stack
      }
      
      console.error('Saved products fetch error details:', errorDetails)

      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.')
        localStorage.removeItem('token') // Clear invalid token
        return
      }

      if (err.response?.status === 500) {
        if (retryCount < 2) {
          console.log(`Retrying request (attempt ${retryCount + 1})...`)
          const delay = Math.pow(2, retryCount) * 1000
          await new Promise(resolve => setTimeout(resolve, delay))
          return fetchSavedProducts(retryCount + 1)
        }
        setError('Server error. Please try again later.')
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to load saved products')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveFromSaved = async (productId: number) => {
    try {
      setRemoving(productId)
      
      if (user) {
        // Use API for logged-in users
        await api.delete(`/api/users/saved-products/${productId}`)
      } 
      
      // Update local state
      setSavedProducts(prev => prev.filter(p => p.id !== productId))
      
      toast({
        title: 'Removed from saved',
        description: 'Product removed from your saved items',
        status: 'info',
        duration: 2000,
        isClosable: true,
      })
    } catch (error: any) {
      console.error('Failed to remove saved product:', error)
      toast({
        title: 'Error',
        description: 'Failed to remove product from saved items',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    } finally {
      setRemoving(null)
    }
  }

  const handleViewProduct = (productId: number) => {
    navigate(`/products/${productId}`)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP' 
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  useEffect(() => {
    if (user) {
      fetchSavedProducts()
    }
  }, [user])

  if (loading) {
    return (
      <Box bg="#FFFDF1" minH="100vh" w="100%">
        <Container maxW="container.xl" py={8}>
          <Center h="50vh">
            <VStack spacing={4}>
              <Spinner size="xl" color="brand.500" />
              <Text color="gray.600">Loading your saved products...</Text>
            </VStack>
          </Center>
        </Container>
      </Box>
    )
  }

  if (error) {
    return (
      <Box bg="#FFFDF1" minH="100vh" w="100%">
        <Container maxW="container.xl" py={8}>
          <Alert status="error" borderRadius="lg">
            <AlertIcon />
            <Box>
              <Text fontWeight="bold">Error loading saved products</Text>
              <Text>{error}</Text>
            </Box>
          </Alert>
          <Button 
            leftIcon={<FiRefreshCw />} 
            onClick={() => fetchSavedProducts()}
            mt={4}
            colorScheme="blue"
          >
            Try Again
          </Button>
        </Container>
      </Box>
    )
  }

  return (
    <Box bg="#FFFDF1" minH="100vh" w="100%">
      <Container maxW="container.xl" py={8}>
        <VStack spacing={6} align="stretch">
          {/* Header */}
          <Flex justify="space-between" align="center">
            <HStack spacing={4}>
              <IconButton
                aria-label="Go back"
                icon={<FiArrowLeft />}
                onClick={() => navigate(-1)}
                variant="ghost"
                size="sm"
              />
              <VStack align="start" spacing={1}>
                <Heading size="lg" color="brand.500">
                  Saved Products
                </Heading>
                <Text color="gray.600">
                  {savedProducts.length} {savedProducts.length === 1 ? 'item' : 'items'} saved
                </Text>
              </VStack>
            </HStack>
            
            <Button 
              leftIcon={<FiRefreshCw />} 
              onClick={() => fetchSavedProducts()}
              colorScheme="blue" 
              variant="outline"
              size="sm"
            >
              Refresh
            </Button>
          </Flex>

          {/* Saved Products Grid */}
          {savedProducts.length === 0 ? (
            <Card>
              <CardBody textAlign="center" py={12}>
                <VStack spacing={4}>
                  <FiHeart size={48} color="#CBD5E0" />
                  <Heading size="md" color="gray.500">
                    No saved products yet
                  </Heading>
                  <Text color="gray.600">
                    Start exploring products and save the ones you like!
                  </Text>
                  <Button 
                    colorScheme="brand" 
                    onClick={() => navigate('/')}
                    leftIcon={<FiEye />}
                  >
                    Browse Products
                  </Button>
                </VStack>
              </CardBody>
            </Card>
          ) : (
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
              {savedProducts.map((product) => (
                <Card key={product.id} bg="white" shadow="sm" overflow="hidden">
                  <Box position="relative">
                    <Image
                      src={getFirstImage(product.image_urls)}
                      alt={product.title}
                      h="200px"
                      w="full"
                      objectFit="cover"
                      fallbackSrc="https://via.placeholder.com/300x200?text=No+Image"
                    />
                    <IconButton
                      aria-label="Remove from saved"
                      icon={<FiTrash2 />}
                      position="absolute"
                      top={2}
                      right={2}
                      size="sm"
                      colorScheme="red"
                      variant="solid"
                      isLoading={removing === product.id}
                      onClick={() => handleRemoveFromSaved(product.id)}
                    />
                  </Box>
                  
                  <CardBody>
                    <VStack spacing={3} align="stretch">
                      <Box>
                        <Heading size="sm" color="brand.500" noOfLines={2}>
                          {product.title}
                        </Heading>
                        <Text color="gray.600" fontSize="sm" noOfLines={2} mt={1}>
                          {product.description}
                        </Text>
                      </Box>

                      <HStack spacing={2} wrap="wrap">
                        {product.premium && (
                          <Badge colorScheme="yellow" size="sm">Premium</Badge>
                        )}
                        <Badge 
                          colorScheme={
                            product.status === 'available' ? 'green' : 
                            product.status === 'locked' ? 'orange' : 'red'
                          }
                          size="sm"
                        >
                          {product.status}
                        </Badge>
                        {product.condition && (
                          <Badge colorScheme="blue" size="sm">{product.condition}</Badge>
                        )}
                        {product.category && (
                          <Badge colorScheme="purple" size="sm">{product.category}</Badge>
                        )}
                      </HStack>

                      <Flex justify="space-between" align="center">
                        <Text fontSize="lg" fontWeight="bold" color="brand.500">
                          {product.price ? formatCurrency(product.price) : 'Barter Only'}
                        </Text>
                        <Text fontSize="sm" color="gray.500">
                          by {product.seller_name}
                        </Text>
                      </Flex>

                      <Divider />

                      <HStack spacing={2}>
                        <Button
                          leftIcon={<FiEye />}
                          colorScheme="blue"
                          variant="outline"
                          size="sm"
                          flex={1}
                          onClick={() => handleViewProduct(product.id)}
                        >
                          View Details
                        </Button>
                        {product.status === 'available' && (
                          <Button
                            leftIcon={<FiShoppingCart />}
                            colorScheme="brand"
                            size="sm"
                            flex={1}
                            onClick={() => handleViewProduct(product.id)}
                          >
                            {product.price ? 'Buy' : 'Trade'}
                          </Button>
                        )}
                      </HStack>

                      <Text fontSize="xs" color="gray.500" textAlign="center">
                        Saved on {formatDate(product.created_at)}
                      </Text>
                    </VStack>
                  </CardBody>
                </Card>
              ))}
            </SimpleGrid>
          )}
        </VStack>
      </Container>
    </Box>
  )
}

export default SavedProducts
