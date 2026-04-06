import React, { useEffect, useState, useMemo } from 'react'
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, VStack, Grid, Box, Image, Text, FormControl, FormLabel, Input, HStack, Button, useToast, Badge, Card, CardBody, Icon, useColorModeValue, Textarea, Spinner, Flex, Link } from '@chakra-ui/react'
import { FaMapMarkerAlt, FaTruck, FaLocationArrow, FaBoxOpen } from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { api } from '../services/api'
import { Product, TradeCreate, TradeOption } from '../types'
import { getFirstImage } from '../utils/imageUtils'
import { reverseGeocodeToAddress, formatCoordinates } from '../utils/locationUtils'
import { useInvalidateDashboard, DASHBOARD_QUERY_KEYS } from '../hooks/useDashboard'

interface TradeModalProps {
  isOpen: boolean
  onClose: () => void
  targetProductId: number | null
}

const TradeModal: React.FC<TradeModalProps> = ({ isOpen, onClose, targetProductId }) => {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { showNotification } = useNotification()
  const queryClient = useQueryClient()
  const { invalidateOffers, invalidateDashboard } = useInvalidateDashboard()
  const [userProducts, setUserProducts] = useState<Product[]>([])
  const [targetProduct, setTargetProduct] = useState<Product | null>(null)
  const [selectedOfferIds, setSelectedOfferIds] = useState<number[]>([])
  const [tradeMessage, setTradeMessage] = useState('')
  const [submittingTrade, setSubmittingTrade] = useState(false)
  const [cashAmount, setCashAmount] = useState<string>('')
  const [tradeOption, setTradeOption] = useState<TradeOption | null>(null)
  const [hasPendingOfferOnTarget, setHasPendingOfferOnTarget] = useState(false)
  const [loadingPendingCheck, setLoadingPendingCheck] = useState(false)
  const [detectingLocation, setDetectingLocation] = useState(false)
  // Delivery location state
  const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [detectedLocationLabel, setDetectedLocationLabel] = useState('')
  const [profileLocationLabel, setProfileLocationLabel] = useState('')
  const [manualAddress, setManualAddress] = useState('')
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const selectedBg = '#E1F5EE'
  const selectedBorder = '#1D9E75'
  const selectedTextColor = '#1D9E75'
  const mutedTextColor = useColorModeValue('gray.600', 'gray.400')

  const selectedProducts = useMemo(() => userProducts.filter(p => selectedOfferIds.includes(p.id)), [userProducts, selectedOfferIds])

  // Fetch target product details
  useEffect(() => {
    if (!isOpen || !targetProductId) {
      setTargetProduct(null)
      return
    }
    ; (async () => {
      try {
        const res = await api.get(`/api/products/${targetProductId}`)
        const product = res.data?.data?.product || res.data?.data
        setTargetProduct(product)
      } catch (_) {
        setTargetProduct(null)
      }
    })()
  }, [isOpen, targetProductId])

  useEffect(() => {
    if (!isOpen) return
    setSelectedOfferIds([])
    setTradeMessage('')
    setCashAmount('')
    setTradeOption(null)
    setHasPendingOfferOnTarget(false)
    setDetectedCoords(null)
    setDetectedLocationLabel('')
    setProfileLocationLabel('')
    setManualAddress('')
    setDetectingLocation(false)
    if (user && targetProductId) {
      ; (async () => {
        try {
          // Fetch user's pending trades to check for existing offer on this product
          setLoadingPendingCheck(true)
          const pendingRes = await api.get(`/api/trades?direction=outgoing&status=pending&limit=100`)
          const trades = Array.isArray(pendingRes.data?.data) ? pendingRes.data.data : []
          const hasPending = trades.some((trade: any) => trade.target_product_id === targetProductId)
          setHasPendingOfferOnTarget(hasPending)

          // Fetch user products
          const res = await api.get(`/api/products/user/${user.id}?page=1&limit=50`)
          const data = res.data?.data
          const list: Product[] = Array.isArray(data?.data) ? data.data : []
          // Filter out sold products from trade proposals
          const availableProducts = list.filter(product => product.status === 'available')
          setUserProducts(availableProducts)
        } catch (_) {
          setUserProducts([])
        } finally {
          setLoadingPendingCheck(false)
        }
      })()
    } else {
      setUserProducts([])
    }
  }, [isOpen, user, targetProductId])

  useEffect(() => {
    if (!isOpen || !user?.latitude || !user?.longitude) return

    let cancelled = false
    ;(async () => {
      const address = await reverseGeocodeToAddress(user.latitude as number, user.longitude as number)
      if (!cancelled) {
        setProfileLocationLabel(address)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, user?.latitude, user?.longitude])

  useEffect(() => {
    if (!isOpen) return
    console.log('Selected offer IDs:', selectedOfferIds)
    console.log('Selected products:', selectedProducts)
  }, [isOpen, selectedOfferIds, selectedProducts])

  const toggleOfferSelection = (id: number) => {
    setSelectedOfferIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id)
      }
      
      // Check limit
      const limit = targetProduct?.max_items_per_offer || 0
      if (limit > 0 && prev.length >= limit) {
        toast({
          id: 'trademodal-selection-limit',
          title: 'Selection Limit Reached',
          description: `You can only select up to ${limit} items for this trade.`,
          status: 'warning',
          duration: 3000,
          isClosable: true,
        })
        return prev
      }
      
      return [...prev, id]
    })
  }

  // Resolved delivery address for payload submission
  const resolvedDeliveryAddress = (): string | undefined => {
    if (detectedLocationLabel.trim()) return detectedLocationLabel.trim()
    if (detectedCoords) return formatCoordinates(detectedCoords.lat, detectedCoords.lng)
    if (profileLocationLabel.trim()) return profileLocationLabel.trim()
    if (user?.latitude && user?.longitude) return formatCoordinates(user.latitude, user.longitude)
    if (manualAddress.trim()) return manualAddress.trim()
    return undefined
  }

  const hasDeliveryLocation = !!(
    (user?.latitude && user?.longitude) || detectedCoords || manualAddress.trim()
  )

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      toast({
        id: "trademodal-geolocation-not-supported", title: 'Geolocation not supported', description: 'Your browser does not support location detection.', status: 'error' })
      return
    }
    setDetectingLocation(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        setDetectedCoords({ lat, lng })
        const address = await reverseGeocodeToAddress(lat, lng)
        setDetectedLocationLabel(address)
        setDetectingLocation(false)
        toast({
        id: "trademodal-location-detected", title: 'Location detected!', description: address, status: 'success', duration: 2500 })
      },
      (error) => {
        setDetectingLocation(false)
        const messages: Record<number, string> = {
          1: 'Location permission denied. Please enter your address manually.',
          2: 'Unable to determine your position. Please enter your address manually.',
          3: 'Location request timed out. Please enter your address manually.',
        }
        toast({
        id: "trademodal-location-error", title: 'Location error', description: messages[error.code] || 'Could not detect location.', status: 'warning', duration: 4000 })
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const submitTrade = async () => {
    if (!targetProductId || selectedOfferIds.length === 0) {
      toast({
        id: "trademodal-select-items", title: 'Select items', description: 'Please select at least one of your items to offer.', status: 'warning' })
      return
    }
    if (tradeOption === 'delivery' && !hasDeliveryLocation) {
      toast({
        id: "trademodal-delivery-location-required", title: 'Delivery location required', description: 'Please detect your location or enter an address for delivery.', status: 'warning' })
      return
    }
    if (!tradeOption) {
      toast({
        id: "trademodal-select-option", title: 'Select method', description: 'Please select Meetup or Delivery.', status: 'warning' })
      return
    }

    // Layer 2 validation: Check for pending offer before submission
    if (hasPendingOfferOnTarget) {
      toast({
        id: "trademodal-pending-offer-already-exists",
        title: 'Pending Offer Already Exists',
        description: 'You already have a pending offer on this product. Please wait for the trader to respond to your existing offer before sending another one.',
        status: 'warning',
        duration: 4000,
        isClosable: true
      })
      return
    }

    try {
      setSubmittingTrade(true)
      const payload: TradeCreate = {
        target_product_id: targetProductId,
        offered_product_ids: selectedOfferIds,
        message: tradeMessage,
        offered_cash_amount: cashAmount ? Number(cashAmount) : undefined,
        trade_option: tradeOption,
        delivery_address: tradeOption === 'delivery' ? resolvedDeliveryAddress() : undefined,
      }
      console.log('Submitting trade payload:', payload)
      await api.post('/api/trades', payload)

      // Invalidate dashboard cache so sent offers show immediately
      invalidateOffers()
      invalidateDashboard()
      await queryClient.refetchQueries({ queryKey: DASHBOARD_QUERY_KEYS.sentOffers })

      showNotification('Trade Offer Sent', 'success')
      setSelectedOfferIds([])
      setTradeMessage('')
      setCashAmount('')
      setTradeOption(null)
      setDetectedCoords(null)
      setManualAddress('')
      onClose()
    } catch (e: any) {
      const errorMessage = e?.response?.data?.error || 'Failed to send trade'
      toast({
        id: "trademodal-failed", title: 'Failed', description: errorMessage, status: 'error' })
    } finally {
      setSubmittingTrade(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="sm">
      <ModalOverlay />
      <ModalContent maxW="400px">
        <ModalHeader fontSize="lg" fontWeight="semibold">{user ? 'Propose a Trade' : 'Sign in to Continue'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {user ? (
            <VStack spacing={3} align="stretch">
              {/* Target Product Display */}
              {targetProduct && (
                <Card variant="outline" bg={useColorModeValue('blue.50', 'blue.900')} borderColor={useColorModeValue('blue.200', 'blue.700')}>
                  <CardBody p={3}>
                    <VStack spacing={2} align="stretch">
                      <Text fontSize="10px" fontWeight="bold" color={useColorModeValue('blue.700', 'blue.200')} textTransform="uppercase" letterSpacing="0.5px">
                        Trading For
                      </Text>
                      <HStack spacing={2} align="start">
                        <Image src={getFirstImage(targetProduct.image_urls)} alt={targetProduct.title} w="60px" h="60px" objectFit="cover" rounded="md" loading="lazy" />
                        <VStack spacing={1} align="start" flex={1}>
                          <Text fontWeight="600" fontSize="12px" wordBreak="break-word">{targetProduct.title}</Text>
                          <Text fontSize="10px" color="gray.500" noOfLines={2} wordBreak="break-word">{targetProduct.description}</Text>
                          {targetProduct.bidding_type && targetProduct.bidding_type !== 'none' && (
                            <HStack spacing={1}>
                              {targetProduct.bidding_type === 'blind' && (
                                <Badge colorScheme="orange" fontSize="9px">
                                  Blind Bidding
                                </Badge>
                              )}
                              {targetProduct.bidding_type === 'open' && (
                                <Badge colorScheme="green" fontSize="9px">
                                  Open Bidding
                                </Badge>
                              )}
                            </HStack>
                          )}
                        </VStack>
                      </HStack>
                    </VStack>
                  </CardBody>
                </Card>
              )}

              {/* Item Selection */}
              <VStack align="start" spacing={1} w="full">
                <Text fontWeight="600" fontSize="11px" textTransform="uppercase" color={mutedTextColor} letterSpacing="0.5px">
                  Select your items to offer:
                  {targetProduct?.max_items_per_offer ? (
                    <Badge ml={2} colorScheme="brand" variant="subtle" fontSize="9px">
                      Max {targetProduct.max_items_per_offer}
                    </Badge>
                  ) : null}
                </Text>
                {selectedOfferIds.length > 0 && (
                  <Text fontSize="9px" color={selectedTextColor} fontWeight="bold">
                    {selectedOfferIds.length} {targetProduct?.max_items_per_offer ? `/ ${targetProduct.max_items_per_offer}` : ''} selected
                  </Text>
                )}
              </VStack>

              {/* Scrollable grid: shows 2 full rows + small peek of 3rd; scroll when overflowing */}
              <Box maxH="200px" overflowY="auto" pr={2}>
                {userProducts.length === 0 ? (
                  <Flex direction="column" align="center" justify="center" h="140px" gap={2} p={4} bg="gray.50" borderRadius="md" borderWidth="1px" borderColor={borderColor}>
                    <Icon as={FaBoxOpen} boxSize={8} color="gray.400" />
                    <VStack spacing={1} textAlign="center">
                      <Text fontWeight="600" fontSize="11px" color="gray.700">
                        No items available to trade
                      </Text>
                      <Button
                        size="xs"
                        colorScheme="brand"
                        onClick={() => {
                          onClose()
                          navigate('/dashboard?tab=my-items')
                        }}
                      >
                        Add Item
                      </Button>
                    </VStack>
                  </Flex>
                ) : (
                  <Grid templateColumns="repeat(auto-fill, minmax(90px, 1fr))" gap={2} gridAutoRows="110px" justifyContent="start">
                    {userProducts.map((p) => (
                      <Box key={p.id} minH="110px" borderWidth={selectedOfferIds.includes(p.id) ? '2px' : '0.5px'} borderColor={selectedOfferIds.includes(p.id) ? selectedBorder : borderColor} rounded="md" overflow="hidden" onClick={() => toggleOfferSelection(p.id)} cursor="pointer" bg={selectedOfferIds.includes(p.id) ? selectedBg : 'white'}>
                        <Image src={getFirstImage(p.image_urls)} alt={p.title} w="full" h="45px" objectFit="cover" loading="lazy" />
                        <Box p={1.5}>
                          <Text fontSize="10px" noOfLines={2} wordBreak="break-word" fontWeight={selectedOfferIds.includes(p.id) ? '600' : '500'} color={selectedOfferIds.includes(p.id) ? selectedTextColor : 'inherit'}>{p.title}</Text>
                        </Box>
                      </Box>
                    ))}
                  </Grid>
                )}
              </Box>

              {/* Message Input */}
              <FormControl>
                <FormLabel fontSize="11px" fontWeight="bold" textTransform="uppercase" color={mutedTextColor} letterSpacing="0.5px" mb={1}>
                  Message (optional)
                </FormLabel>
                <Input 
                  placeholder="Add a note for the trader" 
                  value={tradeMessage} 
                  onChange={(e) => setTradeMessage(e.target.value)} 
                  fontSize="11px"
                  py={2}
                />
              </FormControl>

              {/* Cash Amount Input */}
              <FormControl>
                <FormLabel fontSize="11px" fontWeight="bold" textTransform="uppercase" color={mutedTextColor} letterSpacing="0.5px" mb={1}>
                  Offer money (optional, PHP)
                </FormLabel>
                <Input 
                  type="number" 
                  placeholder="₱0.00" 
                  value={cashAmount} 
                  onChange={(e) => setCashAmount(e.target.value)} 
                  min={0} 
                  step="0.01"
                  fontSize="11px"
                  py={2}
                />
              </FormControl>

              {/* Trade Method */}
              <FormControl isRequired>
                <FormLabel fontSize="11px" fontWeight="bold" textTransform="uppercase" color={mutedTextColor} letterSpacing="0.5px" mb={2}>
                  Trade Method
                </FormLabel>
                <HStack spacing={2} mb={3}>
                  <Button
                    flex={1}
                    size="sm"
                    height="36px"
                    variant={tradeOption === 'meetup' ? 'solid' : 'outline'}
                    bg={tradeOption === 'meetup' ? selectedBorder : 'transparent'}
                    color={tradeOption === 'meetup' ? 'white' : 'inherit'}
                    borderColor={tradeOption === 'meetup' ? selectedBorder : borderColor}
                    _hover={{ bg: tradeOption === 'meetup' ? '#158A63' : undefined }}
                    onClick={() => setTradeOption('meetup')}
                    leftIcon={<Icon as={FaMapMarkerAlt} boxSize={4} />}
                    fontSize="11px"
                    fontWeight="600"
                  >
                    Meetup
                  </Button>
                  <Button
                    flex={1}
                    size="sm"
                    height="36px"
                    variant={tradeOption === 'delivery' ? 'solid' : 'outline'}
                    bg={tradeOption === 'delivery' ? selectedBorder : 'transparent'}
                    color={tradeOption === 'delivery' ? 'white' : 'inherit'}
                    borderColor={tradeOption === 'delivery' ? selectedBorder : borderColor}
                    _hover={{ bg: tradeOption === 'delivery' ? '#158A63' : undefined }}
                    onClick={() => setTradeOption('delivery')}
                    leftIcon={<Icon as={FaTruck} boxSize={4} />}
                    fontSize="11px"
                    fontWeight="600"
                  >
                    Delivery
                  </Button>
                </HStack>
                {tradeOption === 'delivery' && (
                  <VStack spacing={2} align="stretch">
                    {/* Location Display */}
                    {detectedCoords ? (
                      <Box p={2.5} bg={useColorModeValue('gray.50', 'gray.700')} borderWidth="1px" borderColor={useColorModeValue('gray.200', 'gray.600')} rounded="md">
                        <HStack justify="space-between" align="center" spacing={2}>
                          <HStack spacing={2} flex={1} minW={0}>
                            <Icon as={FaMapMarkerAlt} boxSize={4} color={selectedBorder} flexShrink={0} />
                            <VStack spacing={0} align="start" minW={0} flex={1}>
                              <Text fontSize="11px" fontWeight="600" noOfLines={1}>
                                {detectedLocationLabel || formatCoordinates(detectedCoords.lat, detectedCoords.lng)}
                              </Text>
                              <Text fontSize="9px" color={mutedTextColor} noOfLines={1}>
                                Detected from device
                              </Text>
                            </VStack>
                          </HStack>
                          <Link
                            fontSize="9px"
                            fontWeight="600"
                            color={selectedBorder}
                            onClick={() => {
                              setDetectedCoords(null)
                              setDetectedLocationLabel('')
                            }}
                            textDecoration="none"
                            _hover={{ textDecoration: 'underline' }}
                            flexShrink={0}
                          >
                            Clear
                          </Link>
                        </HStack>
                      </Box>
                    ) : user?.latitude && user?.longitude ? (
                      <Box p={2.5} bg={useColorModeValue('gray.50', 'gray.700')} borderWidth="1px" borderColor={useColorModeValue('gray.200', 'gray.600')} rounded="md">
                        <HStack justify="space-between" align="center" spacing={2}>
                          <HStack spacing={2} flex={1} minW={0}>
                            <Icon as={FaMapMarkerAlt} boxSize={4} color={selectedBorder} flexShrink={0} />
                            <VStack spacing={0} align="start" minW={0} flex={1}>
                              <Text fontSize="11px" fontWeight="600" noOfLines={1}>
                                {profileLocationLabel || formatCoordinates(user.latitude, user.longitude)}
                              </Text>
                              <Text fontSize="9px" color={mutedTextColor} noOfLines={1}>
                                From your profile
                              </Text>
                            </VStack>
                          </HStack>
                        </HStack>
                      </Box>
                    ) : (
                      <Box p={2.5} bg={useColorModeValue('gray.50', 'gray.700')} borderWidth="1px" borderColor={useColorModeValue('gray.200', 'gray.600')} rounded="md">
                        <Text fontSize="11px" fontWeight="600" color={mutedTextColor}>No location set</Text>
                      </Box>
                    )}

                    {/* Detect/Update Location Button */}
                    <Button
                      size="sm"
                      variant="outline"
                      w="full"
                      fontSize="11px"
                      height="32px"
                      isLoading={detectingLocation}
                      loadingText="Detecting..."
                      onClick={handleDetectLocation}
                      borderColor={selectedBorder}
                      color={selectedBorder}
                      _hover={{ bg: selectedBg }}
                      leftIcon={detectingLocation ? <Spinner size="xs" /> : <Icon as={FaLocationArrow} boxSize={3.5} />}
                    >
                      📍 Detect my location
                    </Button>

                    {/* Manual Address Entry (only show if no auto-detected location) */}
                    {!detectedCoords && !(user?.latitude && user?.longitude) && (
                      <>
                        <Text fontSize="9px" color={mutedTextColor} textAlign="center">
                          — or enter address —
                        </Text>
                        <Textarea
                          placeholder="e.g., Barangay Maasin, Zamboanga City"
                          value={manualAddress}
                          onChange={(e) => setManualAddress(e.target.value)}
                          size="sm"
                          rows={2}
                          fontSize="11px"
                          resize="none"
                        />
                      </>
                    )}
                  </VStack>
                )}
              </FormControl>

              {/* Action Buttons */}
              <HStack justify="flex-end" spacing={3} pt={1}>
                <Button 
                  variant="ghost" 
                  onClick={onClose}
                  fontSize="11px"
                  height="36px"
                >
                  Cancel
                </Button>
                <Button
                  bg={selectedBorder}
                  color="white"
                  isLoading={submittingTrade}
                  onClick={submitTrade}
                  isDisabled={selectedOfferIds.length === 0 || !tradeOption || (tradeOption === 'delivery' && !hasDeliveryLocation)}
                  fontSize="11px"
                  fontWeight="600"
                  height="36px"
                  flex="2"
                  _hover={{ bg: '#158A63' }}
                  _active={{ bg: '#0F5A42' }}
                >
                  Confirm
                </Button>
              </HStack>
            </VStack>
          ) : (
            <VStack spacing={4}>
              <Text color="gray.600" fontSize="12px">
                You need to be signed in to trade or purchase items.
              </Text>
              <HStack spacing={3} w="full">
                <Button
                  onClick={onClose}
                  as={'a'}
                  href="/login"
                  colorScheme="brand"
                  flex={1}
                  size="sm"
                >
                  Sign In
                </Button>
                <Button
                  onClick={onClose}
                  as={'a'}
                  href="/register"
                  variant="outline"
                  flex={1}
                  size="sm"
                >
                  Sign Up
                </Button>
              </HStack>
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

export default TradeModal
