import React, { useEffect, useState, useMemo } from 'react'
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, VStack, Grid, Box, Image, Text, FormControl, FormLabel, Input, HStack, Button, useToast, Divider, Badge, Card, CardBody, Icon, useColorModeValue, Textarea, Spinner } from '@chakra-ui/react'
import { FaMapMarkerAlt, FaTruck, FaCheckCircle, FaLocationArrow } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { api } from '../services/api'
import { Product, TradeCreate, TradeOption } from '../types'
import { getFirstImage } from '../utils/imageUtils'

interface TradeModalProps {
  isOpen: boolean
  onClose: () => void
  targetProductId: number | null
}

const TradeModal: React.FC<TradeModalProps> = ({ isOpen, onClose, targetProductId }) => {
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const { showNotification } = useNotification()
  const [userProducts, setUserProducts] = useState<Product[]>([])
  const [targetProduct, setTargetProduct] = useState<Product | null>(null)
  const [selectedOfferIds, setSelectedOfferIds] = useState<number[]>([])
  const [tradeMessage, setTradeMessage] = useState('')
  const [submittingTrade, setSubmittingTrade] = useState(false)
  const [cashAmount, setCashAmount] = useState<string>('')
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false)
  const [tradeOption, setTradeOption] = useState<TradeOption | null>(null)
  const [hasPendingOfferOnTarget, setHasPendingOfferOnTarget] = useState(false)
  const [loadingPendingCheck, setLoadingPendingCheck] = useState(false)
  const [detectingLocation, setDetectingLocation] = useState(false)
  // Delivery location state
  const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [manualAddress, setManualAddress] = useState('')
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const selectedBg = useColorModeValue('brand.50', 'brand.900')
  const selectedBorder = useColorModeValue('brand.500', 'brand.400')

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
    setManualAddress('')
    setDetectingLocation(false)
    // Auto-set delivery option if user has location
    if (user?.latitude && user?.longitude) {
      setTradeOption('delivery')
    }
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
    if (!isOpen) return
    console.log('Selected offer IDs:', selectedOfferIds)
    console.log('Selected products:', selectedProducts)
  }, [isOpen, selectedOfferIds, selectedProducts])

  const toggleOfferSelection = (id: number) => {
    setSelectedOfferIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // Resolved delivery address for payload submission
  const resolvedDeliveryAddress = (): string | undefined => {
    if (user?.latitude && user?.longitude) return `${user.latitude}, ${user.longitude}`
    if (detectedCoords) return `${detectedCoords.lat.toFixed(6)}, ${detectedCoords.lng.toFixed(6)}`
    if (manualAddress.trim()) return manualAddress.trim()
    return undefined
  }

  const hasDeliveryLocation = !!(
    (user?.latitude && user?.longitude) || detectedCoords || manualAddress.trim()
  )

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: 'Geolocation not supported', description: 'Your browser does not support location detection.', status: 'error' })
      return
    }
    setDetectingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDetectedCoords({ lat: position.coords.latitude, lng: position.coords.longitude })
        setDetectingLocation(false)
        toast({ title: '📍 Location detected!', status: 'success', duration: 2000 })
      },
      (error) => {
        setDetectingLocation(false)
        const messages: Record<number, string> = {
          1: 'Location permission denied. Please enter your address manually.',
          2: 'Unable to determine your position. Please enter your address manually.',
          3: 'Location request timed out. Please enter your address manually.',
        }
        toast({ title: 'Location error', description: messages[error.code] || 'Could not detect location.', status: 'warning', duration: 4000 })
      },
      { timeout: 10000 }
    )
  }

  const submitTrade = async () => {
    if (!targetProductId || selectedOfferIds.length === 0) {
      toast({ title: 'Select items', description: 'Please select at least one of your items to offer.', status: 'warning' })
      return
    }
    if (!tradeOption) {
      toast({ title: 'Select trade option', description: 'Please select Meetup or Delivery option.', status: 'warning' })
      return
    }
    if (tradeOption === 'delivery' && !hasDeliveryLocation) {
      toast({ title: 'Delivery location required', description: 'Please detect your location or enter an address to use delivery.', status: 'warning' })
      return
    }

    // Layer 2 validation: Check for pending offer before submission
    if (hasPendingOfferOnTarget) {
      toast({
        title: 'Pending Offer Already Exists',
        description: 'You already have a pending offer on this product. Please wait for the seller to respond to your existing offer before sending another one.',
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
      showNotification('Trade Offer Sent', 'success')
      setSelectedOfferIds([])
      setTradeMessage('')
      setCashAmount('')
      setTradeOption(null)
      setDetectedCoords(null)
      setManualAddress('')
      setShowConfirmModal(false)
      onClose()
    } catch (e: any) {
      const errorMessage = e?.response?.data?.error || 'Failed to send trade'
      toast({ title: 'Failed', description: errorMessage, status: 'error' })
    } finally {
      setSubmittingTrade(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{user ? 'Propose a Trade' : 'Sign in to Continue'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {user ? (
            <VStack spacing={4} align="stretch">
              {/* Target Product Display */}
              {targetProduct && (
                <Card variant="outline" bg={useColorModeValue('blue.50', 'blue.900')} borderColor={useColorModeValue('blue.200', 'blue.700')}>
                  <CardBody p={4}>
                    <VStack spacing={3} align="stretch">
                      <Text fontSize="xs" fontWeight="semibold" color={useColorModeValue('blue.700', 'blue.200')} textTransform="uppercase">
                        Trading For
                      </Text>
                      <HStack spacing={3} align="start">
                        <Image src={getFirstImage(targetProduct.image_urls)} alt={targetProduct.title} w="80px" h="80px" objectFit="cover" rounded="md" loading="lazy" />
                        <VStack spacing={2} align="start" flex={1}>
                          <Text fontWeight="semibold" fontSize="sm">{targetProduct.title}</Text>
                          <Text fontSize="xs" color="gray.500" noOfLines={2}>{targetProduct.description}</Text>
                          {targetProduct.bidding_type && targetProduct.bidding_type !== 'none' && (
                            <HStack spacing={2}>
                              {targetProduct.bidding_type === 'blind' && (
                                <Badge colorScheme="orange" fontSize="xs">
                                  🤐 Blind Bidding
                                </Badge>
                              )}
                              {targetProduct.bidding_type === 'open' && (
                                <Badge colorScheme="green" fontSize="xs">
                                  🏆 Open Bidding
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

              <Divider />

              <Text fontWeight="semibold">Select your items to offer:</Text>
              {/* Scrollable grid: shows 2 full rows + small peek of 3rd; scroll when overflowing */}
              <Box maxH="244px" overflowY="auto" pr={2}>
                <Grid templateColumns="repeat(auto-fill, minmax(100px, 150px))" gap={3} gridAutoRows="120px" justifyContent="start">
                  {userProducts.map((p) => (
                    <Box key={p.id} minH="120px" borderWidth={selectedOfferIds.includes(p.id) ? '2px' : '1px'} borderColor={selectedOfferIds.includes(p.id) ? 'brand.500' : 'gray.200'} rounded="md" overflow="hidden" onClick={() => toggleOfferSelection(p.id)} cursor="pointer" bg={selectedOfferIds.includes(p.id) ? 'brand.50' : 'white'}>
                      <Image src={getFirstImage(p.image_urls)} alt={p.title} w="full" h="50px" objectFit="cover" loading="lazy" />
                      <Box p={2}>
                        <Text fontSize="sm" noOfLines={2}>{p.title}</Text>
                      </Box>
                    </Box>
                  ))}
                </Grid>
              </Box>

              <FormControl>
                <FormLabel fontSize="sm">Message (optional)</FormLabel>
                <Input placeholder="Add a note for the seller" value={tradeMessage} onChange={(e) => setTradeMessage(e.target.value)} />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Offer money (optional, PHP)</FormLabel>
                <Input type="number" placeholder="₱0.00" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} min={0} step="0.01" />
              </FormControl>

              <Divider />

              {/* Trade Option Selection */}
              <FormControl isRequired>
                <FormLabel fontSize="sm" fontWeight="semibold" mb={3}>
                  Trade Fulfillment Option
                </FormLabel>
                <Text fontSize="xs" color="gray.600" mb={3}>
                  Select how you want to complete this trade
                </Text>
                <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                  {/* Meetup Option */}
                  <Card
                    variant="outline"
                    cursor="pointer"
                    borderWidth={tradeOption === 'meetup' ? '2px' : '1px'}
                    borderColor={tradeOption === 'meetup' ? selectedBorder : borderColor}
                    bg={tradeOption === 'meetup' ? selectedBg : cardBg}
                    onClick={() => setTradeOption('meetup')}
                    transition="all 0.2s"
                    _hover={{
                      borderColor: tradeOption === 'meetup' ? selectedBorder : 'brand.300',
                      shadow: 'md',
                      transform: 'translateY(-2px)',
                    }}
                  >
                    <CardBody p={4}>
                      <VStack spacing={3} align="center">
                        <Box
                          p={3}
                          borderRadius="full"
                          bg={tradeOption === 'meetup' ? 'brand.500' : 'gray.100'}
                          color={tradeOption === 'meetup' ? 'white' : 'gray.600'}
                        >
                          <Icon as={FaMapMarkerAlt} boxSize={6} />
                        </Box>
                        <VStack spacing={1} align="center">
                          <Text fontWeight="semibold" fontSize="sm">
                            Meetup
                          </Text>
                          <Text fontSize="xs" color="gray.600" textAlign="center">
                            Meet in person at a safe, public location
                          </Text>
                        </VStack>
                        {tradeOption === 'meetup' && (
                          <Icon as={FaCheckCircle} color="brand.500" boxSize={4} />
                        )}
                      </VStack>
                    </CardBody>
                  </Card>

                  {/* Delivery Option */}
                  <Card
                    variant="outline"
                    cursor="pointer"
                    borderWidth={tradeOption === 'delivery' ? '2px' : '1px'}
                    borderColor={tradeOption === 'delivery' ? selectedBorder : borderColor}
                    bg={tradeOption === 'delivery' ? selectedBg : cardBg}
                    onClick={() => setTradeOption('delivery')}
                    transition="all 0.2s"
                    _hover={{
                      borderColor: tradeOption === 'delivery' ? selectedBorder : 'brand.300',
                      shadow: 'md',
                      transform: 'translateY(-2px)',
                    }}
                  >
                    <CardBody p={4}>
                      <VStack spacing={3} align="center">
                        <Box
                          p={3}
                          borderRadius="full"
                          bg={tradeOption === 'delivery' ? 'brand.500' : 'gray.100'}
                          color={tradeOption === 'delivery' ? 'white' : 'gray.600'}
                        >
                          <Icon as={FaTruck} boxSize={6} />
                        </Box>
                        <VStack spacing={1} align="center">
                          <Text fontWeight="semibold" fontSize="sm">
                            Delivery
                          </Text>
                          <Text fontSize="xs" color="gray.600" textAlign="center">
                            Ship items to each other's addresses
                          </Text>
                        </VStack>
                        {tradeOption === 'delivery' && (
                          <Icon as={FaCheckCircle} color="brand.500" boxSize={4} />
                        )}
                      </VStack>
                    </CardBody>
                  </Card>
                </Grid>

                {/* Delivery Address Display (shown when delivery is selected) */}
                {tradeOption === 'delivery' && (
                  <Box mt={4}>
                    <FormControl>
                      <FormLabel fontSize="sm">Delivery Location</FormLabel>
                      {user?.latitude && user?.longitude ? (
                        <Box p={3} bg="blue.50" borderWidth="1px" borderColor="blue.200" rounded="md" borderLeftWidth="4px" borderLeftColor="blue.500">
                          <Text fontSize="sm" color="blue.900" fontWeight="medium">📍 {user.latitude.toFixed(4)}, {user.longitude.toFixed(4)}</Text>
                          <Text fontSize="xs" color="blue.700" mt={1}>Your predefined delivery location from your profile</Text>
                        </Box>
                      ) : detectedCoords ? (
                        <Box p={3} bg="green.50" borderWidth="1px" borderColor="green.200" rounded="md" borderLeftWidth="4px" borderLeftColor="green.500">
                          <HStack justify="space-between">
                            <Text fontSize="sm" color="green.900" fontWeight="medium">📍 {detectedCoords.lat.toFixed(4)}, {detectedCoords.lng.toFixed(4)}</Text>
                            <Button size="xs" variant="ghost" colorScheme="red" onClick={() => setDetectedCoords(null)}>Clear</Button>
                          </HStack>
                          <Text fontSize="xs" color="green.700" mt={1}>Location detected from your device</Text>
                        </Box>
                      ) : (
                        <>
                          <VStack spacing={3} align="stretch">
                            <Box
                              p={3}
                              bg="yellow.50"
                              borderWidth="1px"
                              borderColor="yellow.200"
                              rounded="md"
                              borderLeftWidth="4px"
                              borderLeftColor="yellow.500"
                            >
                              <Text fontSize="sm" color="yellow.900" fontWeight="medium">
                                ⚠️ Location not set
                              </Text>
                              <Text fontSize="xs" color="yellow.700" mt={1}>
                                Detect your location or enter an address below
                              </Text>
                            </Box>
                            <Button
                              leftIcon={detectingLocation ? <Spinner size="xs" /> : <Icon as={FaLocationArrow} />}
                              size="sm"
                              colorScheme="brand"
                              variant="outline"
                              onClick={handleDetectLocation}
                              isLoading={detectingLocation}
                              loadingText="Detecting..."
                            >
                              Detect My Location
                            </Button>
                            <Text fontSize="xs" color="gray.500" textAlign="center">— or enter address manually —</Text>
                            <Textarea
                              placeholder="e.g., Barangay Maasin, Zamboanga City"
                              value={manualAddress}
                              onChange={(e) => setManualAddress(e.target.value)}
                              size="sm"
                              rows={2}
                              resize="none"
                            />
                          </VStack>
                        </>
                      )}
                    </FormControl>
                  </Box>
                )}
              </FormControl>

              <Divider />

              <HStack justify="flex-end">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button
                  colorScheme="brand"
                  isLoading={submittingTrade}
                  onClick={() => setShowConfirmModal(true)}
                  isDisabled={selectedOfferIds.length === 0 || !tradeOption || (tradeOption === 'delivery' && !hasDeliveryLocation)}
                >
                  Proceed
                </Button>
              </HStack>
            </VStack>
          ) : (
            <VStack spacing={4}>
              <Text color="gray.600">
                You need to be signed in to trade or purchase items.
              </Text>
              <HStack spacing={4} w="full">
                <Button
                  onClick={onClose}
                  as={'a'}
                  href="/login"
                  colorScheme="brand"
                  flex={1}
                >
                  Sign In
                </Button>
                <Button
                  onClick={onClose}
                  as={'a'}
                  href="/register"
                  variant="outline"
                  flex={1}
                >
                  Sign Up
                </Button>
              </HStack>
            </VStack>
          )}
        </ModalBody>
      </ModalContent>

      {/* Confirmation modal shown after clicking Proceed */}
      <Modal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} isCentered size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirm Offer</ModalHeader>
          <ModalCloseButton onClick={() => setShowConfirmModal(false)} />
          <ModalBody pb={6}>
            <VStack spacing={4} align="stretch">
              {/* Warning if pending offer exists on target */}
              {hasPendingOfferOnTarget && (
                <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" rounded="md" p={3}>
                  <HStack spacing={2} mb={1}>
                    <Text fontSize="lg">⚠️</Text>
                    <Text fontSize="sm" fontWeight="bold" color="orange.800">Pending Offer Already Exists</Text>
                  </HStack>
                  <Text fontSize="xs" color="orange.700">
                    You already have a pending offer on this product. Submitting another offer will override your existing one or be rejected by the system.
                  </Text>
                </Box>
              )}
              <Box>
                <Text fontWeight="semibold" mb={2}>Your Offer Summary</Text>
                <Grid templateColumns="repeat(auto-fill, minmax(180px, 220px))" gap={3} justifyContent="start">
                  {selectedProducts.length === 0 && !cashAmount && (
                    <Text color="gray.500" gridColumn="1 / -1">No items selected.</Text>
                  )}
                  {selectedProducts.map((p) => (
                    <Box key={p.id} borderWidth="1px" borderColor="gray.200" rounded="md" overflow="hidden">
                      <Image src={getFirstImage(p.image_urls)} alt={p.title} w="full" h="100px" objectFit="cover" loading="lazy" />
                      <Box p={2}>
                        <HStack justify="space-between">
                          <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{p.title}</Text>
                          {p.premium && <Badge colorScheme="yellow">Premium</Badge>}
                        </HStack>
                        <Text fontSize="xs" color="gray.600" noOfLines={2}>{p.description}</Text>
                      </Box>
                    </Box>
                  ))}
                </Grid>
                {cashAmount && Number(cashAmount) > 0 && (
                  <Text mt={2} fontSize="sm" color="green.700">Cash included: ₱{Number(cashAmount).toFixed(2)}</Text>
                )}

                {/* Labeled message block: show message or a fallback so user sees what's being sent */}
                <Box mt={3} bg="gray.50" borderWidth="1px" borderColor="gray.200" rounded="md" p={3}>
                  <Text fontSize="sm" fontWeight="semibold" mb={2}>Message</Text>
                  <Text fontSize="sm" color="gray.700">{tradeMessage && tradeMessage.trim() ? tradeMessage : 'No message provided'}</Text>
                </Box>

                {/* Trade Option Summary */}
                <Box mt={3} bg="blue.50" borderWidth="1px" borderColor="blue.200" rounded="md" p={3}>
                  <Text fontSize="sm" fontWeight="semibold" mb={2}>Trade Option</Text>
                  <HStack spacing={2}>
                    <Icon
                      as={tradeOption === 'meetup' ? FaMapMarkerAlt : FaTruck}
                      color="blue.600"
                      boxSize={4}
                    />
                    <Text fontSize="sm" color="blue.700" fontWeight="medium">
                      {tradeOption === 'meetup' ? 'Meetup' : 'Delivery'}
                    </Text>
                  </HStack>
                  {tradeOption === 'delivery' && (
                    <Text fontSize="xs" color="blue.600" mt={2}>
                      📍 Location: {
                        user?.latitude && user?.longitude
                          ? `${user.latitude.toFixed(4)}, ${user.longitude.toFixed(4)}`
                          : detectedCoords
                            ? `Detected: ${detectedCoords.lat.toFixed(4)}, ${detectedCoords.lng.toFixed(4)}`
                            : manualAddress.trim()
                              ? manualAddress.trim()
                              : 'Location not set'
                      }
                    </Text>
                  )}
                </Box>
              </Box>
              <HStack justify="flex-end" spacing={3}>
                <Button variant="ghost" onClick={() => setShowConfirmModal(false)}>Back</Button>
                <Button colorScheme="brand" isLoading={submittingTrade} onClick={submitTrade}>Send Offer</Button>
              </HStack>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Modal>
  )
}

export default TradeModal


