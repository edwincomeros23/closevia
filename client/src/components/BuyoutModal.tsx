import React, { useEffect, useState } from 'react'
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, VStack, Box, Image, Text, FormControl, FormLabel, Input, HStack, Button, useToast, Divider, Badge, Card, CardBody, Icon, useColorModeValue, Textarea, Grid } from '@chakra-ui/react'
import { FaMapMarkerAlt, FaTruck, FaCheckCircle, FaMoneyBillWave } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { api } from '../services/api'
import { Product, TradeCreate, TradeOption } from '../types'
import { getFirstImage } from '../utils/imageUtils'

interface BuyoutModalProps {
  isOpen: boolean
  onClose: () => void
  targetProductId: number | null
}

const BuyoutModal: React.FC<BuyoutModalProps> = ({ isOpen, onClose, targetProductId }) => {
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const { showNotification } = useNotification()
  const [targetProduct, setTargetProduct] = useState<Product | null>(null)
  
  const [tradeMessage, setTradeMessage] = useState('')
  const [submittingTrade, setSubmittingTrade] = useState(false)
  const [cashAmount, setCashAmount] = useState<string>('')
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false)
  const [tradeOption, setTradeOption] = useState<TradeOption | null>(null)
  
  const [hasPendingOfferOnTarget, setHasPendingOfferOnTarget] = useState(false)
  const [loadingPendingCheck, setLoadingPendingCheck] = useState(false)
  const [detectingLocation, setDetectingLocation] = useState(false)
  
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const selectedBg = useColorModeValue('brand.50', 'brand.900')
  const selectedBorder = useColorModeValue('brand.500', 'brand.400')

  // Fetch target product details
  useEffect(() => {
    if (!isOpen || !targetProductId) {
      setTargetProduct(null)
      return
    }
    ;(async () => {
      try {
        const res = await api.get(`/api/products/${targetProductId}`)
        const product = res.data?.data?.product || res.data?.data
        setTargetProduct(product)
        if (product && product.price) {
            setCashAmount(product.price.toString())
        }
      } catch (_) {
        setTargetProduct(null)
      }
    })()
  }, [isOpen, targetProductId])

  useEffect(() => {
    if (!isOpen) return
    setTradeMessage('')
    setCashAmount(targetProduct && targetProduct.price ? targetProduct.price.toString() : '')
    setTradeOption(null)
    setHasPendingOfferOnTarget(false)
    
    // Auto-set delivery option if user has location
    if (user?.latitude && user?.longitude) {
      setTradeOption('delivery')
    }
    
    if (user && targetProductId) {
      ;(async () => {
        try {
          // Fetch user's pending trades to check for existing offer on this product
          setLoadingPendingCheck(true)
          const pendingRes = await api.get(`/api/trades?direction=outgoing&status=pending&limit=100`)
          const trades = Array.isArray(pendingRes.data?.data) ? pendingRes.data.data : []
          const hasPending = trades.some((trade: any) => trade.target_product_id === targetProductId)
          setHasPendingOfferOnTarget(hasPending)
        } catch (_) {
          // Ignore
        } finally {
          setLoadingPendingCheck(false)
        }
      })()
    }
  }, [isOpen, user, targetProductId, targetProduct])

  const submitTrade = async () => {
    if (!targetProductId) return
    
    if (!cashAmount || Number(cashAmount) <= 0) {
      toast({ title: 'Invalid amount', description: 'Please enter a valid cash amount to offer.', status: 'warning' })
      return
    }
    
    if (!tradeOption) {
      toast({ title: 'Select fulfillment option', description: 'Please select Meetup or Delivery option.', status: 'warning' })
      return
    }
    
    // Layer 2 validation: Check for pending offer before submission
    if (hasPendingOfferOnTarget) {
      toast({ 
        title: 'Pending Offer Already Exists', 
        description: 'You already have a pending offer on this product. Please wait for the seller to respond before sending another one.', 
        status: 'warning',
        duration: 4000,
        isClosable: true 
      })
      return
    }
    
    try {
      setSubmittingTrade(true)
      // Use user's coordinates for delivery if available
      const deliveryAddress = user?.latitude && user?.longitude 
        ? `${user.latitude}, ${user.longitude}`
        : undefined
      
      const payload: TradeCreate = {
        target_product_id: targetProductId,
        offered_product_ids: [],
        message: tradeMessage,
        offered_cash_amount: Number(cashAmount),
        trade_option: tradeOption,
        delivery_address: tradeOption === 'delivery' ? deliveryAddress : undefined,
      }
      
      console.log('Submitting buyout payload:', payload)
      await api.post('/api/trades', payload)
      showNotification('Buyout Offer Sent', 'success')
      setTradeMessage('')
      setCashAmount('')
      setTradeOption(null)
      setShowConfirmModal(false)
      onClose()
    } catch (e: any) {
      const errorMessage = e?.response?.data?.error || 'Failed to send buyout offer'
      toast({ title: 'Failed', description: errorMessage, status: 'error' })
    } finally {
      setSubmittingTrade(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{user ? 'Make a Buyout Offer' : 'Sign in to Continue'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {user ? (
            <VStack spacing={4} align="stretch">
              {/* Target Product Display */}
              {targetProduct && (
                <Card variant="outline" bg={useColorModeValue('green.50', 'green.900')} borderColor={useColorModeValue('green.200', 'green.700')}>
                  <CardBody p={4}>
                    <VStack spacing={3} align="stretch">
                      <HStack justify="space-between">
                        <Text fontSize="xs" fontWeight="semibold" color={useColorModeValue('green.700', 'green.200')} textTransform="uppercase">
                          Buying Out
                        </Text>
                        {targetProduct.price && (
                          <Badge colorScheme="green" fontSize="sm">
                            ₱{targetProduct.price.toFixed(2)}
                          </Badge>
                        )}
                      </HStack>
                      <HStack spacing={3} align="start">
                        <Image src={getFirstImage(targetProduct.image_urls)} alt={targetProduct.title} w="80px" h="80px" objectFit="cover" rounded="md" />
                        <VStack spacing={2} align="start" flex={1}>
                          <Text fontWeight="semibold" fontSize="sm">{targetProduct.title}</Text>
                          <Text fontSize="xs" color="gray.500" noOfLines={2}>{targetProduct.description}</Text>
                        </VStack>
                      </HStack>
                    </VStack>
                  </CardBody>
                </Card>
              )}

              <Divider />

              <FormControl isRequired>
                <FormLabel fontSize="sm">Your Cash Offer (PHP)</FormLabel>
                <HStack>
                  <Text fontWeight="bold" fontSize="lg" color="green.600">₱</Text>
                  <Input type="number" placeholder="0.00" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} min={1} step="0.01" size="lg" fontWeight="bold" />
                </HStack>
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Message to Seller (optional)</FormLabel>
                <Textarea placeholder="Add a note to convince the seller to accept your buyout offer" value={tradeMessage} onChange={(e) => setTradeMessage(e.target.value)} rows={3} />
              </FormControl>

              <Divider />

              {/* Trade Option Selection */}
              <FormControl isRequired>
                <FormLabel fontSize="sm" fontWeight="semibold" mb={3}>
                  Fulfillment Option
                </FormLabel>
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
                        <Box p={3} borderRadius="full" bg={tradeOption === 'meetup' ? 'brand.500' : 'gray.100'} color={tradeOption === 'meetup' ? 'white' : 'gray.600'}>
                          <Icon as={FaMapMarkerAlt} boxSize={6} />
                        </Box>
                        <VStack spacing={1} align="center">
                          <Text fontWeight="semibold" fontSize="sm">Meetup</Text>
                          <Text fontSize="xs" color="gray.600" textAlign="center">Pay in cash during meetup</Text>
                        </VStack>
                        {tradeOption === 'meetup' && <Icon as={FaCheckCircle} color="brand.500" boxSize={4} />}
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
                        <Box p={3} borderRadius="full" bg={tradeOption === 'delivery' ? 'brand.500' : 'gray.100'} color={tradeOption === 'delivery' ? 'white' : 'gray.600'}>
                          <Icon as={FaTruck} boxSize={6} />
                        </Box>
                        <VStack spacing={1} align="center">
                          <Text fontWeight="semibold" fontSize="sm">Delivery</Text>
                          <Text fontSize="xs" color="gray.600" textAlign="center">Ship and pay via app</Text>
                        </VStack>
                        {tradeOption === 'delivery' && <Icon as={FaCheckCircle} color="brand.500" boxSize={4} />}
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
                          <Text fontSize="sm" color="blue.900" fontWeight="medium">
                            📍 {user.latitude.toFixed(4)}, {user.longitude.toFixed(4)}
                          </Text>
                        </Box>
                      ) : (
                        <Box p={3} bg="yellow.50" borderWidth="1px" borderColor="yellow.200" rounded="md" borderLeftWidth="4px" borderLeftColor="yellow.500">
                          <Text fontSize="sm" color="yellow.900" fontWeight="medium">⚠️ Location not set</Text>
                          <Button
                            size="sm" colorScheme="blue" mt={2} isLoading={detectingLocation} loadingText="Detecting..."
                            onClick={async () => {
                              if (!navigator.geolocation) {
                                toast({ title: 'Geolocation not supported', status: 'error', duration: 3000 })
                                return
                              }
                              setDetectingLocation(true)
                              navigator.geolocation.getCurrentPosition(
                                async (position) => {
                                  const { latitude, longitude } = position.coords
                                  try {
                                    await api.put('/api/users/profile', { latitude, longitude })
                                    if (refreshUser) await refreshUser()
                                    toast({ title: 'Location saved!', status: 'success', duration: 3000 })
                                  } catch {
                                    toast({ title: 'Failed to save location', status: 'error', duration: 3000 })
                                  }
                                  setDetectingLocation(false)
                                },
                                () => {
                                  toast({ title: 'Location access denied', status: 'warning', duration: 4000 })
                                  setDetectingLocation(false)
                                },
                                { enableHighAccuracy: true, timeout: 10000 }
                              )
                            }}
                          >
                            📍 Detect My Location
                          </Button>
                        </Box>
                      )}
                    </FormControl>
                  </Box>
                )}
              </FormControl>

              <Divider />

              <HStack justify="flex-end">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button 
                  colorScheme="green" 
                  isLoading={submittingTrade} 
                  onClick={() => setShowConfirmModal(true)} 
                  isDisabled={!cashAmount || Number(cashAmount) <= 0 || !tradeOption}
                  leftIcon={<FaMoneyBillWave />}
                >
                  Confirm Buyout
                </Button>
              </HStack>
            </VStack>
          ) : (
            <VStack spacing={4}>
              <Text color="gray.600">You need to be signed in to purchase items.</Text>
              <HStack spacing={4} w="full">
                <Button onClick={onClose} as={'a'} href="/login" colorScheme="brand" flex={1}>Sign In</Button>
                <Button onClick={onClose} as={'a'} href="/register" variant="outline" flex={1}>Sign Up</Button>
              </HStack>
            </VStack>
          )}
        </ModalBody>
      </ModalContent>

      <Modal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} isCentered size="sm">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirm Buyout Offer</ModalHeader>
          <ModalCloseButton onClick={() => setShowConfirmModal(false)} />
          <ModalBody pb={6}>
            <VStack spacing={4} align="stretch">
              {hasPendingOfferOnTarget && (
                <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" rounded="md" p={3}>
                  <Text fontSize="sm" fontWeight="bold" color="orange.800">⚠️ Pending Offer Already Exists</Text>
                  <Text fontSize="xs" color="orange.700">You already have an active offer on this product.</Text>
                </Box>
              )}
              <Box bg="green.50" borderWidth="1px" borderColor="green.200" rounded="md" p={4} textAlign="center">
                <Text fontSize="sm" color="green.700" mb={1}>You are offering to pay</Text>
                <Text fontSize="3xl" fontWeight="bold" color="green.600">₱{Number(cashAmount).toFixed(2)}</Text>
              </Box>
              
              <Box mt={2}>
                <Text fontSize="sm" fontWeight="semibold">For item:</Text>
                <Text fontSize="md">{targetProduct?.title}</Text>
              </Box>
              
              <HStack justify="flex-end" mt={4} spacing={3}>
                <Button variant="ghost" onClick={() => setShowConfirmModal(false)}>Back</Button>
                <Button colorScheme="green" isLoading={submittingTrade} onClick={submitTrade}>Submit Offer</Button>
              </HStack>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Modal>
  )
}

export default BuyoutModal
