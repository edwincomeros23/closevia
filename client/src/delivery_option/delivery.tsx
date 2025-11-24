import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Input,
  Textarea,
  FormControl,
  FormLabel,
  FormHelperText,
  useToast,
  SimpleGrid,
  useColorModeValue,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Icon,
  Divider,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Spinner,
} from '@chakra-ui/react'
import { CheckCircleIcon } from '@chakra-ui/icons'
import { FaTruck, FaClock, FaShieldAlt, FaUsers, FaLocationArrow } from 'react-icons/fa'
import { api } from '../services/api'
import { DeliveryRequest, Product } from '../types'
import DeliveryTracking from '../components/DeliveryTracking'
import { useAuth } from '../contexts/AuthContext'

interface DeliveryOption {
  id: string
  name: string
  description: string
  icon: any
  cost: number
  estimatedDays: string
  features: string[]
  available: boolean
}

const DeliveryUI: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { user } = useAuth()
  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const [selectedDelivery, setSelectedDelivery] = useState<string>('standard')
  const [pickupAddress, setPickupAddress] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [pickupLatitude, setPickupLatitude] = useState<number | undefined>()
  const [pickupLongitude, setPickupLongitude] = useState<number | undefined>()
  const [deliveryLatitude, setDeliveryLatitude] = useState<number | undefined>()
  const [deliveryLongitude, setDeliveryLongitude] = useState<number | undefined>()
  const [isGettingLocation, setIsGettingLocation] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [deliveryTrackingOpen, setDeliveryTrackingOpen] = useState(false)
  const [currentDeliveryId, setCurrentDeliveryId] = useState<number | null>(null)
  const [tradeId, setTradeId] = useState<number | undefined>()

  const deliveryOptions: DeliveryOption[] = [
    {
      id: 'standard',
      name: 'Standard Delivery',
      description: 'Shared batch. Up to 5 items.',
      icon: FaTruck,
      cost: 30,
      estimatedDays: '2-4hrs',
      features: [
        '₱30 flat rate',
        'Shared batch delivery',
        'Up to 5 items grouped',
        'Real-time tracking',
        'Delivery confirmation'
      ],
      available: true,
    },
    {
      id: 'express',
      name: 'Express Delivery',
      description: 'Single-item. Maximum care.',
      icon: FaClock,
      cost: 60,
      estimatedDays: '~1 hour',
      features: [
        '₱60 priority rate',
        'Single-item only',
        'Zero batch compression',
        'Priority handling',
        'Safer guarantee'
      ],
      available: true,
    },
  ]

  // Get products from location state or fetch from API
  useEffect(() => {
    const fetchProducts = async () => {
      setLoadingProducts(true)
      try {
        // Check if products are passed via location state
        const stateProducts = (location.state as any)?.products as Product[] | undefined
        const stateTradeId = (location.state as any)?.tradeId as number | undefined
        
        if (stateProducts && stateProducts.length > 0) {
          setProducts(stateProducts)
          setTradeId(stateTradeId)
        } else if (user) {
          // If no products in state, try to get user's available products
          const response = await api.get(`/api/products/user/${user.id}?status=available&limit=10`)
          const data = response.data?.data
          const productList: Product[] = Array.isArray(data?.data) ? data.data : []
          setProducts(productList.slice(0, selectedDelivery === 'express' ? 1 : 5))
        }
      } catch (error) {
        console.error('Failed to fetch products:', error)
        toast({
          title: 'Error',
          description: 'Failed to load products',
          status: 'error',
        })
      } finally {
        setLoadingProducts(false)
      }
    }

    fetchProducts()
  }, [location.state, user, selectedDelivery])

  // Auto-detect location when component mounts
  useEffect(() => {
    if (navigator.geolocation) {
      setIsGettingLocation(true)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setPickupLatitude(position.coords.latitude)
          setPickupLongitude(position.coords.longitude)
          setIsGettingLocation(false)
        },
        () => {
          setIsGettingLocation(false)
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
        }
      )
    }
  }, [])

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: 'Location not supported',
        description: 'Your browser does not support geolocation.',
        status: 'warning',
      })
      return
    }

    setIsGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPickupLatitude(position.coords.latitude)
        setPickupLongitude(position.coords.longitude)
        setIsGettingLocation(false)
        toast({
          title: 'Location detected',
          description: 'GPS coordinates have been captured.',
          status: 'success',
          duration: 2000,
        })
      },
      (error) => {
        setIsGettingLocation(false)
        toast({
          title: 'Location access denied',
          description: 'Please enter your address manually.',
          status: 'warning',
        })
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )
  }

  const handleSubmit = async () => {
    if (!deliveryAddress.trim() && !deliveryLongitude) {
      toast({
        title: 'Missing Delivery Address',
        description: 'Please provide a delivery address or allow location access.',
        status: 'warning',
        duration: 3000,
      })
      return
    }

    if (!pickupAddress.trim() && !pickupLatitude) {
      toast({
        title: 'Missing Pickup Location',
        description: 'Please provide a pickup address or allow location access.',
        status: 'warning',
        duration: 3000,
      })
      return
    }

    if (products.length === 0) {
      toast({
        title: 'No Products',
        description: 'Please select products to deliver.',
        status: 'warning',
        duration: 3000,
      })
      return
    }

    // Validate item count
    if (selectedDelivery === 'express' && products.length > 1) {
      toast({
        title: 'Invalid Item Count',
        description: 'Express delivery allows only 1 item.',
        status: 'error',
        duration: 3000,
      })
      return
    }

    if (selectedDelivery === 'standard' && products.length > 5) {
      toast({
        title: 'Invalid Item Count',
        description: 'Standard delivery allows maximum 5 items.',
        status: 'error',
        duration: 3000,
      })
      return
    }

    setIsProcessing(true)
    try {
      const payload: DeliveryRequest = {
        trade_id: tradeId,
        delivery_type: selectedDelivery as 'standard' | 'express',
        pickup_latitude: pickupLatitude,
        pickup_longitude: pickupLongitude,
        pickup_address: pickupAddress || 'GPS Location',
        delivery_latitude: deliveryLatitude,
        delivery_longitude: deliveryLongitude,
        delivery_address: deliveryAddress,
        special_instructions: notes.trim() || undefined,
        product_ids: products.map((p) => p.id),
      }

      const response = await api.post('/api/deliveries', payload)
      const delivery = response.data?.data

      toast({
        title: 'Delivery Request Created',
        description: 'Your delivery has been added to the rider queue.',
        status: 'success',
        duration: 2000,
      })

      // Show tracking modal
      if (delivery?.id) {
        setCurrentDeliveryId(delivery.id)
        setDeliveryTrackingOpen(true)
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to create delivery request',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const selectedOption = deliveryOptions.find(d => d.id === selectedDelivery)

  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <Box maxW="md" mx="auto">
        <VStack spacing={4} align="stretch">
          {/* Header - Compact */}
          <VStack spacing={1} align="start">
            <Heading size="md" color="brand.500">
              Delivery Option
            </Heading>
            <Text fontSize="sm" color="gray.600">
              Choose how you'd like to receive your items
            </Text>
          </VStack>

          {/* Delivery Options - Compact Cards */}
          <SimpleGrid columns={2} spacing={3}>
            {deliveryOptions.map((option) => (
              <Card
                key={option.id}
                bg={bgColor}
                border="2px solid"
                borderColor={selectedDelivery === option.id ? 'brand.500' : borderColor}
                cursor="pointer"
                transition="all 0.2s"
                _hover={{
                  shadow: 'md',
                  borderColor: 'brand.400',
                }}
                onClick={() => setSelectedDelivery(option.id)}
              >
                <CardBody p={3}>
                  <VStack spacing={2} align="stretch">
                    {/* Icon + Badge Row */}
                    <HStack justify="space-between" align="flex-start">
                      <Box
                        p={2}
                        bg="brand.50"
                        borderRadius="lg"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Icon as={option.icon} boxSize={5} color="brand.500" />
                      </Box>
                      <HStack spacing={1}>
                        {selectedDelivery === option.id && (
                          <Icon as={CheckCircleIcon} boxSize={4} color="green.500" />
                        )}
                        <Badge fontSize="2xs" colorScheme={option.id === 'standard' ? 'blue' : 'purple'}>
                          {option.id === 'standard' ? '💰' : '⭐'}
                        </Badge>
                      </HStack>
                    </HStack>

                    {/* Title + Description */}
                    <VStack spacing={0} align="start">
                      <Text fontWeight="bold" fontSize="sm" color="gray.800">
                        {option.name}
                      </Text>
                      <Text fontSize="xs" color="gray.600">
                        {option.description}
                      </Text>
                    </VStack>

                    {/* Price + Time - Inline */}
                    <HStack justify="space-between" fontSize="xs">
                      <Text color="gray.600">
                        <Text as="span" fontWeight="bold" color="brand.600">₱{option.cost}</Text>
                      </Text>
                      <Text color="gray.600">
                        <Text as="span" fontWeight="bold">{option.estimatedDays}</Text>
                      </Text>
                    </HStack>
                  </VStack>
                </CardBody>
              </Card>
            ))}
          </SimpleGrid>

          {/* Selected Details - Minimal */}
          {selectedOption && (
            <Card bg={bgColor} border="1px" borderColor={borderColor}>
              <CardBody p={4}>
                <VStack spacing={3} align="stretch">
                  {/* Quick Info */}
                  {selectedOption.id === 'standard' && (
                    <HStack spacing={2} fontSize="xs" p={2} bg="blue.50" borderRadius="md">
                      <Icon as={FaUsers} color="blue.600" boxSize={4} flexShrink={0} />
                      <VStack spacing={0} align="start">
                        <Text fontWeight="bold" color="blue.900">Shared batch</Text>
                        <Text color="blue.800">Up to 5 items • Minor risks for fragile items</Text>
                      </VStack>
                    </HStack>
                  )}

                  {selectedOption.id === 'express' && (
                    <HStack spacing={2} fontSize="xs" p={2} bg="purple.50" borderRadius="md">
                      <Icon as={FaShieldAlt} color="purple.600" boxSize={4} flexShrink={0} />
                      <VStack spacing={0} align="start">
                        <Text fontWeight="bold" color="purple.900">Single-item only</Text>
                        <Text color="purple.800">Maximum care • Perfect for fragile items</Text>
                      </VStack>
                    </HStack>
                  )}

                  {/* Pickup Location */}
                  <FormControl>
                    <FormLabel fontSize="sm" fontWeight="bold">Pickup Location</FormLabel>
                    <HStack spacing={2} mb={2}>
                      <Button
                        size="xs"
                        leftIcon={<Icon as={FaLocationArrow} />}
                        onClick={getCurrentLocation}
                        isLoading={isGettingLocation}
                        variant="outline"
                        colorScheme="brand"
                      >
                        Use GPS
                      </Button>
                      {pickupLatitude && pickupLongitude && (
                        <Badge colorScheme="green" fontSize="xs">
                          GPS Detected
                        </Badge>
                      )}
                    </HStack>
                    <Textarea
                      placeholder="Enter pickup address (or use GPS location above)"
                      value={pickupAddress}
                      onChange={(e) => setPickupAddress(e.target.value)}
                      rows={2}
                      size="sm"
                    />
                    <FormHelperText fontSize="2xs">
                      GPS coordinates will be used if available, otherwise address will be used
                    </FormHelperText>
                  </FormControl>

                  {/* Delivery Address Input */}
                  <FormControl>
                    <FormLabel fontSize="sm" fontWeight="bold">Delivery Address</FormLabel>
                    <Textarea
                      placeholder="Enter complete delivery address"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      rows={2}
                      size="sm"
                    />
                  </FormControl>

                  {/* Notes Input */}
                  <FormControl>
                    <FormLabel fontSize="sm" fontWeight="bold">
                      {selectedOption.id === 'express' ? 'Handling Notes' : 'Special Instructions'} (Optional)
                    </FormLabel>
                    <Textarea
                      placeholder={selectedOption.id === 'express' ? "Fragility warnings, placement instructions..." : "Any special instructions..."}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      size="sm"
                    />
                    {selectedOption.id === 'express' && (
                      <FormHelperText fontSize="2xs">
                        💡 Include handling requirements
                      </FormHelperText>
                    )}
                  </FormControl>

                  {/* Cost Summary - Inline */}
                  <HStack justify="space-between" bg="gray.50" p={2} borderRadius="md" fontSize="sm">
                    <Text color="gray.600">Total Cost:</Text>
                    <Text fontWeight="bold" color="brand.600">₱{selectedOption.cost}</Text>
                  </HStack>

                  {/* Safety Alert - Compact */}
                  <Alert status={selectedOption.id === 'express' ? 'success' : 'warning'} fontSize="xs" borderRadius="md">
                    <AlertIcon boxSize={3} />
                    <VStack align="start" spacing={0} ml={2}>
                      <AlertTitle fontSize="xs">
                        {selectedOption.id === 'express' ? '✓ Premium Protection' : '⚠️ Standard Handling'}
                      </AlertTitle>
                      <AlertDescription fontSize="2xs">
                        {selectedOption.id === 'express' 
                          ? 'Single-item dedicated care for fragile & high-value items'
                          : 'Shared handling - avoid for fragile items'
                        }
                      </AlertDescription>
                    </VStack>
                  </Alert>

                  {/* Action Buttons */}
                  <HStack spacing={2}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(-1)}
                      flex={1}
                    >
                      Back
                    </Button>
                    <Button
                      colorScheme="brand"
                      size="sm"
                      flex={1}
                      onClick={handleSubmit}
                      isLoading={isProcessing}
                      loadingText="Saving..."
                    >
                      Confirm
                    </Button>
                  </HStack>
                </VStack>
              </CardBody>
            </Card>
          )}
        </VStack>
      </Box>

      {/* Delivery Tracking Modal */}
      {currentDeliveryId && (
        <DeliveryTracking
          isOpen={deliveryTrackingOpen}
          onClose={() => {
            setDeliveryTrackingOpen(false)
            setCurrentDeliveryId(null)
            // Optionally navigate back or to dashboard
            // navigate('/dashboard')
          }}
          deliveryId={currentDeliveryId}
        />
      )}

      {/* Loading Products */}
      {loadingProducts && (
        <Box position="fixed" top="50%" left="50%" transform="translate(-50%, -50%)" zIndex={1000}>
          <VStack spacing={4}>
            <Spinner size="xl" color="brand.500" />
            <Text>Loading products...</Text>
          </VStack>
        </Box>
      )}

      {/* Products Display */}
      {!loadingProducts && products.length > 0 && (
        <Card bg={bgColor} border="1px" borderColor={borderColor} mt={4}>
          <CardBody p={4}>
            <VStack spacing={2} align="stretch" mb={0}>
              <Text fontWeight="semibold" fontSize="sm">
                Items to Deliver ({products.length})
              </Text>
              <VStack align="stretch" spacing={1}>
                {products.map((product) => (
                  <Text key={product.id} fontSize="xs" color="gray.600">
                    • {product.title}
                  </Text>
                ))}
              </VStack>
            </VStack>
          </CardBody>
        </Card>
      )}

      {/* No Products Warning */}
      {!loadingProducts && products.length === 0 && (
        <Alert status="warning" borderRadius="md" mt={4}>
          <AlertIcon />
          <AlertDescription fontSize="sm">
            No products selected. Please navigate from a trade or product page to request delivery.
          </AlertDescription>
        </Alert>
      )}
    </Box>
  )
}

export default DeliveryUI

