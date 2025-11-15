import React, { useEffect, useMemo, useState } from 'react'
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, VStack, HStack, Box, Image, Text, Badge, Button, Divider, Grid, useToast, ModalFooter, AlertDialog, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader, AlertDialogBody, AlertDialogFooter, useDisclosure, Icon, Card, CardBody, useColorModeValue, FormControl, FormLabel, Textarea } from '@chakra-ui/react'
import { FaMapMarkerAlt, FaTruck } from 'react-icons/fa'
import { formatPHP } from '../utils/currency'
import { Trade, Product, TradeAction, TradeOption } from '../types'
import { useProducts } from '../contexts/ProductContext'
import { getFirstImage } from '../utils/imageUtils'
import { getProductUrl } from '../utils/productUtils'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/api'

interface OfferDetailsModalProps {
  trade: Trade | null
  isOpen: boolean
  onClose: () => void
  onAccepted: () => void
  onDeclined: () => void
}

const OfferDetailsModal: React.FC<OfferDetailsModalProps> = ({ trade, isOpen, onClose, onAccepted, onDeclined }) => {
  const toast = useToast()
  const { getProduct } = useProducts()
  const { user } = useAuth()
  const [requested, setRequested] = useState<Product | null>(null)
  const [offered, setOffered] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [counterOpen, setCounterOpen] = useState(false)
  const [userInventory, setUserInventory] = useState<Product[]>([])
  const [selectedCounterIds, setSelectedCounterIds] = useState<number[]>([])
  const [detailedTrade, setDetailedTrade] = useState<Trade | null>(null)
  const [showDebug, setShowDebug] = useState<boolean>(false)
  const [showOptionChangeModal, setShowOptionChangeModal] = useState(false)
  const [requestedOption, setRequestedOption] = useState<TradeOption | null>(null)
  const [requestedDeliveryAddress, setRequestedDeliveryAddress] = useState<string>('')
  const [requestingOptionChange, setRequestingOptionChange] = useState(false)

  // Deep debug logs for data structure analysis
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('🔍 [DEEP DEBUG] FULL TRADE OBJECT:', JSON.stringify(trade, null, 2))
    // eslint-disable-next-line no-console
    console.log('🔍 [DEEP DEBUG] Trade items array:', trade?.items)
    // eslint-disable-next-line no-console
    console.log('🔍 [DEEP DEBUG] Offered array:', offered)
    // eslint-disable-next-line no-console
    console.log('🔍 [DEEP DEBUG] Trade object keys:', trade ? Object.keys(trade as any) : 'null')
  }, [trade])

  // If incoming trade from list lacks items, fetch detailed trade
  useEffect(() => {
    if (!isOpen || !trade) return
    if (!trade.items || trade.items.length === 0) {
      ;(async () => {
        try {
          const res = await api.get(`/api/trades/${trade.id}`)
          const dt: Trade | null = res.data?.data || null
          setDetailedTrade(dt)
          // eslint-disable-next-line no-console
          console.log('🔍 [DEEP DEBUG] Loaded detailed trade:', dt)
        } catch (e) {
          setDetailedTrade(null)
        }
      })()
    } else {
      setDetailedTrade(null)
    }
  }, [isOpen, trade])

  const effectiveTrade = detailedTrade || trade

  // Resilient extraction of buyer-offered items and their product IDs
  const buyerItems = useMemo(() => {
    const items = (effectiveTrade?.items || []) as Array<any>
    return items.filter((i: any) => {
      const offeredBy = (i?.offered_by ?? i?.offeredBy ?? i?.sender ?? i?.from_user_role)
      if (typeof offeredBy === 'string') {
        const v = offeredBy.toLowerCase()
        return v === 'buyer' || v === 'from_buyer' || v === 'sender'
      }
      return false
    })
  }, [effectiveTrade])
  const offeredItemIds = useMemo(() => {
    const ids = buyerItems.map((i: any) => (i?.product_id ?? i?.productId))
    return ids
      .map((x: any) => (typeof x === 'string' ? Number(x) : x))
      .filter((x: any) => typeof x === 'number' && !Number.isNaN(x)) as number[]
  }, [buyerItems])

  useEffect(() => {
    if (!isOpen) return
    // eslint-disable-next-line no-console
    console.log('🔍 [DEEP DEBUG] Derived buyerItems:', buyerItems)
    // eslint-disable-next-line no-console
    console.log('🔍 [DEEP DEBUG] Offered item IDs:', offeredItemIds)
  }, [isOpen, buyerItems, offeredItemIds])

  useEffect(() => {
    if (!isOpen || !effectiveTrade) return
    ;(async () => {
      try {
        setLoading(true)
        const req = await getProduct(effectiveTrade.target_product_id)
        setRequested(req)
        const details: Product[] = []
        for (const pid of offeredItemIds) {
          const p = await getProduct(pid)
          if (p) details.push(p)
        }
        setOffered(details)
      } finally {
        setLoading(false)
      }
    })()
  }, [isOpen, effectiveTrade, getProduct, offeredItemIds])

  const accept = async () => {
    if (!effectiveTrade) return
    try {
      await api.put(`/api/trades/${effectiveTrade.id}`, { action: 'accept' } as TradeAction)
      toast({ title: 'Offer accepted', status: 'success' })
      onAccepted()
      onClose()
    } catch (e: any) {
      toast({ title: 'Failed to accept', description: e?.response?.data?.error || 'Try again', status: 'error' })
    }
  }

  const decline = async () => {
    onDeclineOpen()
  }

  const confirmDecline = async () => {
    if (!effectiveTrade) return
    try {
      await api.put(`/api/trades/${effectiveTrade.id}`, { action: 'decline' } as TradeAction)
      toast({ title: 'Offer declined', status: 'success' })
      onDeclined()
      onClose()
      onDeclineClose()
    } catch (e: any) {
      toast({ title: 'Failed to decline', description: e?.response?.data?.error || 'Try again', status: 'error' })
    }
  }

  const openCounter = async () => {
    if (!effectiveTrade) return
    try {
      // Load sender (User A) active listings
      const res = await api.get(`/api/products/user/${effectiveTrade.buyer_id}?active=true&page=1&limit=50`)
      const list: Product[] = Array.isArray(res.data?.data?.data) ? res.data.data.data : []
      setUserInventory(list)
      // Preselect current offered items
      setSelectedCounterIds(offeredItemIds)
      setCounterOpen(true)
    } catch {
      setUserInventory([])
      setSelectedCounterIds(offeredItemIds)
      setCounterOpen(true)
    }
  }

  const toggleCounter = (id: number) => {
    setSelectedCounterIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const [cashDelta, setCashDelta] = useState<string>('')
  const [counterMsg, setCounterMsg] = useState<string>('')
  const { isOpen: isDeclineOpen, onOpen: onDeclineOpen, onClose: onDeclineClose } = useDisclosure()
  const cancelRef = React.useRef<HTMLButtonElement>(null)

  const submitCounter = async () => {
    if (!effectiveTrade) return
    try {
      await api.put(`/api/trades/${effectiveTrade.id}`, { action: 'counter', counter_offered_product_ids: selectedCounterIds, message: counterMsg, counter_offered_cash_amount: cashDelta ? Number(cashDelta) : undefined } as TradeAction)
      toast({ title: 'Counter offer sent', status: 'success' })
      onAccepted()
      onClose()
    } catch (e: any) {
      toast({ title: 'Failed to counter', description: e?.response?.data?.error || 'Try again', status: 'error' })
    }
  }

  // Option change request functionality
  const canRequestOptionChange = () => {
    if (!effectiveTrade || !user) return false
    // Only allow option change before trade is ongoing (status is pending or accepted, but not active)
    const isPendingOrAccepted = effectiveTrade.status === 'pending' || effectiveTrade.status === 'accepted'
    // Only buyer can request option change (since seller set the initial option)
    const isBuyer = effectiveTrade.buyer_id === user.id
    // Don't allow if there's already a pending change request
    const hasPendingRequest = !!effectiveTrade.option_change_requested
    return isPendingOrAccepted && isBuyer && !hasPendingRequest
  }

  const requestOptionChange = async () => {
    if (!effectiveTrade || !requestedOption) return
    if (requestedOption === 'delivery' && !requestedDeliveryAddress.trim()) {
      toast({ title: 'Delivery address required', description: 'Please provide a delivery address for delivery option.', status: 'warning' })
      return
    }
    try {
      setRequestingOptionChange(true)
      await api.put(`/api/trades/${effectiveTrade.id}`, {
        action: 'request_option_change',
        requested_option: requestedOption,
        delivery_address: requestedOption === 'delivery' ? requestedDeliveryAddress : undefined,
      } as TradeAction)
      toast({ 
        title: 'Option change requested', 
        description: 'The seller will be notified of your request to change the trade option.', 
        status: 'success' 
      })
      setShowOptionChangeModal(false)
      setRequestedOption(null)
      setRequestedDeliveryAddress('')
      onAccepted() // Refresh trade data
    } catch (e: any) {
      toast({ title: 'Failed to request change', description: e?.response?.data?.error || 'Try again', status: 'error' })
    } finally {
      setRequestingOptionChange(false)
    }
  }

  const approveOptionChange = async () => {
    if (!effectiveTrade) return
    try {
      await api.put(`/api/trades/${effectiveTrade.id}`, {
        action: 'approve_option_change',
      } as TradeAction)
      toast({ title: 'Option change approved', description: 'The trade option has been updated.', status: 'success' })
      onAccepted() // Refresh trade data
    } catch (e: any) {
      toast({ title: 'Failed to approve change', description: e?.response?.data?.error || 'Try again', status: 'error' })
    }
  }

  const rejectOptionChange = async () => {
    if (!effectiveTrade) return
    try {
      await api.put(`/api/trades/${effectiveTrade.id}`, {
        action: 'reject_option_change',
      } as TradeAction)
      toast({ title: 'Option change rejected', description: 'The trade will proceed with the original option.', status: 'success' })
      onAccepted() // Refresh trade data
    } catch (e: any) {
      toast({ title: 'Failed to reject change', description: e?.response?.data?.error || 'Try again', status: 'error' })
    }
  }

  const isUserSeller = effectiveTrade && user && effectiveTrade.seller_id === user.id
  const hasPendingOptionChange = !!effectiveTrade?.option_change_requested

  // Resolve image URL robustly from various product shapes
  const resolveImage = (p?: Product | null): string | undefined => {
    if (!p) return undefined
    const maybeImgs: any = (p as any).image_urls ?? (p as any).images ?? null
    if (Array.isArray(maybeImgs) && maybeImgs.length > 0) {
      return getFirstImage(maybeImgs)
    }
    if (typeof maybeImgs === 'string' && maybeImgs.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(maybeImgs)
        if (Array.isArray(parsed) && parsed.length > 0) return getFirstImage(parsed)
      } catch {
        // ignore parse error
      }
    }
    if ((p as any).image_url) return (p as any).image_url
    if ((p as any).imageUrl) return (p as any).imageUrl
    return undefined
  }

  const renderProductCard = (p: Product | null, opts?: { compact?: boolean }) => {
    if (!p) return null
    const compact = !!opts?.compact
    const showPrice = !!p.allow_buying && !p.barter_only && typeof p.price === 'number'
    const imageHeight = compact ? '70px' : '130px'
    const padding = compact ? 2 : 3
    const titleSize = compact ? 'sm' : undefined
    const titleFontWeight = compact ? 'semibold' : 'semibold'
    const priceFontSize = compact ? 'sm' : undefined

    const imgSrc = resolveImage(p)
    if (!imgSrc && compact) {
      // eslint-disable-next-line no-console
      console.log(`OfferDetailsModal: product ${p.id} has no image source`)
    }

    return (
      <Box borderWidth="1px" borderColor="gray.200" rounded="md" overflow="hidden">
        <Image src={imgSrc || ''} alt={p.title} w="full" h={imageHeight} objectFit="cover" fallbackSrc="https://via.placeholder.com/400x300?text=No+Image" />
        <Box p={padding}>
          <HStack justify="space-between">
            <Text fontWeight={titleFontWeight} fontSize={titleSize}>{p.title}</Text>
            {/* Show premium only on full (requested) cards, hide for compact (offered) */}
            {p.premium && !compact && <Badge colorScheme="yellow" fontSize={compact ? 'xs' : undefined}>Premium</Badge>}
          </HStack>

          {/* Hide status / barter badges in compact (offered) mode */}
          {!compact && (
            <HStack spacing={2} mt={1}>
              <Badge colorScheme={p.status === 'available' ? 'green' : 'red'}>{p.status}</Badge>
              {p.barter_only ? <Badge colorScheme="purple">Barter</Badge> : <Badge colorScheme="blue">For Sale</Badge>}
            </HStack>
          )}

          {/* Hide description in compact mode */}
          {!compact && <Text color="gray.600" mt={2} noOfLines={3}>{p.description}</Text>}

          {showPrice && (
            <Text mt={2} fontWeight="bold" fontSize={priceFontSize}>{formatPHP(p.price as number)}</Text>
          )}

          {/* Remove seller info in compact (offered) mode */}
          {!compact && <Text mt={1} fontSize="sm" color="gray.600">Seller: {p.seller_name || `#${p.seller_id}`}</Text>}

          <Button as={'a'} href={getProductUrl(p)} variant="link" colorScheme="brand" mt={2} size={compact ? 'sm' : 'md'}>View listing</Button>
        </Box>
      </Box>
    )
  }

  const disableAccept = (offeredItemIds.length === 0) && (!effectiveTrade?.offered_cash_amount || effectiveTrade.offered_cash_amount === 0)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="5xl" isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader fontSize="md">Offer Details</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <VStack align="stretch" spacing={4}>
            <HStack align="start" spacing={6}>
              <Box flex={1}>
                <Text fontWeight="bold" mb={2}>Requested Item (yours)</Text>
                {renderProductCard(requested)}
              </Box>
              <Box flex={1}>
                <Text fontWeight="bold" mb={2}>Offered Item(s)</Text>
                <Box>
                  <HStack align="start" spacing={3} flexWrap="wrap">
                    {buyerItems.length > 0 ? (
                      buyerItems.map((item: any, idx: number) => {
                          // Find the product details for this item
                          const product = offered.find(p => p.id === (item.product_id ?? item.productId));
                          return (
                            <Box key={item.id || idx} minW="120px" maxW="100px" flex="1 1 180px">
                              {product ? renderProductCard(product, { compact: true }) : (
                                <Box borderWidth="1px" borderColor="gray.200" rounded="md" p={3} bg="gray.50" minW="80px" maxW="100px">
                                  <Text color="gray.500" fontSize="sm">Product not found (ID: {item.product_id ?? item.productId})</Text>
                                </Box>
                              )}
                            </Box>
                          );
                        })
                    ) : (
                      <Text color="gray.500">No offered items found.</Text>
                    )}
                  </HStack>
                </Box>
              </Box>
            </HStack>


            {/* Trade Option Display - Prominent */}
            {effectiveTrade?.trade_option && (
              <Card 
                variant="outline" 
                borderWidth="2px" 
                borderColor={effectiveTrade.trade_option === 'meetup' ? 'blue.400' : 'green.400'}
                bg={effectiveTrade.trade_option === 'meetup' ? 'blue.50' : 'green.50'}
                mb={4}
              >
                <CardBody p={4}>
                  <VStack spacing={3} align="stretch">
                    <HStack spacing={3} align="center">
                      <Box
                        p={2}
                        borderRadius="full"
                        bg={effectiveTrade.trade_option === 'meetup' ? 'blue.500' : 'green.500'}
                        color="white"
                      >
                        <Icon 
                          as={effectiveTrade.trade_option === 'meetup' ? FaMapMarkerAlt : FaTruck} 
                          boxSize={5} 
                        />
                      </Box>
                      <VStack align="start" spacing={1} flex={1}>
                        <Text fontWeight="bold" fontSize="md" color={effectiveTrade.trade_option === 'meetup' ? 'blue.700' : 'green.700'}>
                          Trade Option: {effectiveTrade.trade_option === 'meetup' ? 'Meetup' : 'Delivery'}
                        </Text>
                        {effectiveTrade.trade_option === 'meetup' ? (
                          <Text fontSize="sm" color="gray.600">
                            Items will be exchanged at a meetup location
                          </Text>
                        ) : (
                          <VStack align="start" spacing={0}>
                            <Text fontSize="sm" color="gray.600">
                              Items will be delivered to addresses
                            </Text>
                            {effectiveTrade.delivery_address && (
                              <Text fontSize="xs" color="gray.600" mt={1} fontStyle="italic">
                                Delivery address: {effectiveTrade.delivery_address}
                              </Text>
                            )}
                          </VStack>
                        )}
                      </VStack>
                      <Badge 
                        colorScheme={effectiveTrade.trade_option === 'meetup' ? 'blue' : 'green'}
                        variant="solid"
                        fontSize="sm"
                        px={3}
                        py={1}
                      >
                        {effectiveTrade.trade_option === 'meetup' ? '📍 Meetup' : '🚚 Delivery'}
                      </Badge>
                    </HStack>

                    {/* Pending Option Change Request */}
                    {hasPendingOptionChange && effectiveTrade.option_change_requested && (
                      <Box 
                        p={3} 
                        bg="yellow.50" 
                        borderWidth="1px" 
                        borderColor="yellow.300" 
                        borderRadius="md"
                        mt={2}
                      >
                        <VStack spacing={2} align="start">
                          <HStack spacing={2}>
                            <Badge colorScheme="yellow">Option Change Pending</Badge>
                            <Text fontSize="xs" color="gray.600">
                              Requested by: {effectiveTrade.option_change_requested_by === effectiveTrade.buyer_id ? 'Buyer' : 'Seller'}
                            </Text>
                          </HStack>
                          <Text fontSize="sm" color="gray.700">
                            Requested change to: <strong>{effectiveTrade.option_change_requested === 'meetup' ? 'Meetup' : 'Delivery'}</strong>
                          </Text>
                          {isUserSeller && (
                            <HStack spacing={2} mt={2}>
                              <Button 
                                size="sm" 
                                colorScheme="green" 
                                onClick={approveOptionChange}
                              >
                                Approve
                              </Button>
                              <Button 
                                size="sm" 
                                colorScheme="red" 
                                variant="outline"
                                onClick={rejectOptionChange}
                              >
                                Reject
                              </Button>
                            </HStack>
                          )}
                          {!isUserSeller && (
                            <Text fontSize="xs" color="gray.500" fontStyle="italic">
                              Waiting for seller approval...
                            </Text>
                          )}
                        </VStack>
                      </Box>
                    )}

                    {/* Request Option Change Button (only for buyer, before ongoing) */}
                    {canRequestOptionChange() && !hasPendingOptionChange && (
                      <Button
                        size="sm"
                        variant="outline"
                        colorScheme="blue"
                        onClick={() => setShowOptionChangeModal(true)}
                        mt={2}
                      >
                        Request Option Change
                      </Button>
                    )}
                  </VStack>
                </CardBody>
              </Card>
            )}

            <HStack spacing={3} mt={2} align="center" wrap="wrap">
              {effectiveTrade?.offered_cash_amount ? (
                <Box borderWidth="1px" borderColor="green.200" bg="green.50" rounded="md" p={2} fontSize="sm" color="green.800" minW="120px">
                  <Text fontWeight="semibold" noOfLines={1}>Cash included</Text>
                  <Text noOfLines={1} color="green.700">{formatPHP(Number(effectiveTrade.offered_cash_amount))}</Text>
                </Box>
              ) : null}

              {showDebug && (
                <Box borderWidth="1px" borderColor="purple.200" bg="purple.50" rounded="md" p={2} fontSize="xs" color="purple.800" minW="140px">
                  <Text fontWeight="semibold" mb={1}>Debug</Text>
                  <Text noOfLines={1}>Items: {trade?.items?.length || 0} • Buyer: {buyerItems.length}</Text>
                </Box>
              )}

              {trade?.message && (
                <Box borderWidth="1px" borderColor="gray.200" bg="gray.50" rounded="md" p={3} fontSize="sm" color="gray.800" flex="1 1 60%" minW="260px">
                  <Text fontWeight="semibold" noOfLines={1}>Message</Text>
                  <Text noOfLines={3} color="gray.700">{trade.message}</Text>
                </Box>
              )}
            </HStack>

            <Divider />

            <HStack justify="space-between" align="center">
              <Box>
                <Text fontWeight="semibold">Trade Summary</Text>
                <Text fontSize="sm" color="gray.600">Your Item(s): 1 • Their Item(s): {offeredItemIds.length}</Text>
                <Text fontSize="sm" color="gray.600">Status: {effectiveTrade?.status}</Text>
                <Text fontSize="sm" color="gray.600">Offered on: {effectiveTrade ? new Date(effectiveTrade.created_at).toLocaleString() : ''}</Text>
              </Box>
              <HStack spacing={3}>
                <Button variant="outline" colorScheme="red" onClick={decline}>Decline</Button>
                <Button colorScheme="green" onClick={accept} isDisabled={disableAccept}>Accept</Button>
                {user && (
                  <Button variant="ghost" onClick={openCounter}>Counter Offer</Button>
                )}
              </HStack>
            </HStack>


            <Modal isOpen={counterOpen} onClose={() => setCounterOpen(false)} isCentered size="xl">
              <ModalOverlay />
              <ModalContent maxW="900px">
                <ModalHeader>Request changes to sender's package</ModalHeader>
                <ModalCloseButton onClick={() => setCounterOpen(false)} />
                <ModalBody>
                  <Grid templateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap={3}>
                    {userInventory.map(p => (
                      <Box key={p.id} borderWidth={selectedCounterIds.includes(p.id) ? '2px' : '1px'} borderColor={selectedCounterIds.includes(p.id) ? 'brand.500' : 'gray.200'} rounded="md" overflow="hidden" onClick={() => toggleCounter(p.id)} cursor="pointer" bg={selectedCounterIds.includes(p.id) ? 'brand.50' : 'white'}>
                        <Image src={getFirstImage(p.image_urls)} alt={p.title} w="full" h="100px" objectFit="cover" />
                        <Box p={2}>
                          <Text fontSize="sm" noOfLines={2}>{p.title}</Text>
                        </Box>
                      </Box>
                    ))}
                  </Grid>
                  <HStack mt={4} spacing={3} align="center">
                    <Box flex={1}>
                      <Text fontSize="sm" color="gray.600" mb={1}>Additional cash requested (PHP)</Text>
                      <input type="number" value={cashDelta} onChange={e => setCashDelta(e.target.value)} min={0} step={0.01 as any} style={{ width: '100%', padding: '8px', border: '1px solid #E2E8F0', borderRadius: 6 }} />
                    </Box>
                    <Box flex={2}>
                      <Text fontSize="sm" color="gray.600" mb={1}>Message (optional)</Text>
                      <input value={counterMsg} onChange={e => setCounterMsg(e.target.value)} placeholder="Please add X..." style={{ width: '100%', padding: '8px', border: '1px solid #E2E8F0', borderRadius: 6 }} />
                    </Box>
                  </HStack>
                </ModalBody>
                <ModalFooter>
                  <Button variant="ghost" mr={3} onClick={() => setCounterOpen(false)}>Cancel</Button>
                  <Button colorScheme="brand" onClick={submitCounter}>Send Counter</Button>
                </ModalFooter>
              </ModalContent>
            </Modal>

            {/* Decline Confirmation Dialog */}
            <AlertDialog
              isOpen={isDeclineOpen}
              leastDestructiveRef={cancelRef}
              onClose={onDeclineClose}
              isCentered
            >
              <AlertDialogOverlay>
                <AlertDialogContent>
                  <AlertDialogHeader fontSize="lg" fontWeight="bold">
                    Decline Trade Offer
                  </AlertDialogHeader>
                  <AlertDialogBody>
                    Are you sure you want to decline this trade offer? This action cannot be undone.
                    <br /><br />
                    Consider sending a counter offer instead if you'd like to negotiate different terms.
                  </AlertDialogBody>
                  <AlertDialogFooter>
                    <Button ref={cancelRef} onClick={onDeclineClose}>
                      Cancel
                    </Button>
                    <Button colorScheme="red" onClick={confirmDecline} ml={3}>
                      Decline Offer
                    </Button>
                    <Button colorScheme="blue" onClick={openCounter} ml={3}>
                      Counter Instead
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialogOverlay>
            </AlertDialog>

            {/* Option Change Request Modal */}
            <Modal isOpen={showOptionChangeModal} onClose={() => setShowOptionChangeModal(false)} size="md" isCentered>
              <ModalOverlay />
              <ModalContent>
                <ModalHeader>Request Option Change</ModalHeader>
                <ModalCloseButton />
                <ModalBody pb={6}>
                  <VStack spacing={4} align="stretch">
                    <Text fontSize="sm" color="gray.600">
                      Select an alternative trade option. The seller will need to approve this change.
                    </Text>
                    
                    <FormControl isRequired>
                      <FormLabel fontSize="sm" fontWeight="semibold">
                        New Trade Option
                      </FormLabel>
                      <Grid templateColumns="repeat(2, 1fr)" gap={3}>
                        <Card
                          variant="outline"
                          cursor="pointer"
                          borderWidth={requestedOption === 'meetup' ? '2px' : '1px'}
                          borderColor={requestedOption === 'meetup' ? 'blue.500' : 'gray.200'}
                          bg={requestedOption === 'meetup' ? 'blue.50' : 'white'}
                          onClick={() => setRequestedOption('meetup')}
                          _hover={{ borderColor: 'blue.300', shadow: 'md' }}
                        >
                          <CardBody p={3}>
                            <VStack spacing={2} align="center">
                              <Icon as={FaMapMarkerAlt} boxSize={5} color={requestedOption === 'meetup' ? 'blue.500' : 'gray.400'} />
                              <Text fontSize="sm" fontWeight="semibold">Meetup</Text>
                            </VStack>
                          </CardBody>
                        </Card>

                        <Card
                          variant="outline"
                          cursor="pointer"
                          borderWidth={requestedOption === 'delivery' ? '2px' : '1px'}
                          borderColor={requestedOption === 'delivery' ? 'green.500' : 'gray.200'}
                          bg={requestedOption === 'delivery' ? 'green.50' : 'white'}
                          onClick={() => setRequestedOption('delivery')}
                          _hover={{ borderColor: 'green.300', shadow: 'md' }}
                        >
                          <CardBody p={3}>
                            <VStack spacing={2} align="center">
                              <Icon as={FaTruck} boxSize={5} color={requestedOption === 'delivery' ? 'green.500' : 'gray.400'} />
                              <Text fontSize="sm" fontWeight="semibold">Delivery</Text>
                            </VStack>
                          </CardBody>
                        </Card>
                      </Grid>
                    </FormControl>

                    {requestedOption === 'delivery' && (
                      <FormControl isRequired>
                        <FormLabel fontSize="sm">Delivery Address</FormLabel>
                        <Textarea
                          placeholder="Enter your complete delivery address..."
                          value={requestedDeliveryAddress}
                          onChange={(e) => setRequestedDeliveryAddress(e.target.value)}
                          rows={3}
                          resize="vertical"
                        />
                        <Text fontSize="xs" color="gray.500" mt={1}>
                          This address will be shared with the seller
                        </Text>
                      </FormControl>
                    )}

                    <HStack spacing={3} justify="flex-end" mt={4}>
                      <Button variant="ghost" onClick={() => setShowOptionChangeModal(false)}>
                        Cancel
                      </Button>
                      <Button
                        colorScheme="blue"
                        onClick={requestOptionChange}
                        isLoading={requestingOptionChange}
                        isDisabled={!requestedOption || (requestedOption === 'delivery' && !requestedDeliveryAddress.trim())}
                      >
                        Request Change
                      </Button>
                    </HStack>
                  </VStack>
                </ModalBody>
              </ModalContent>
            </Modal>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

export default OfferDetailsModal


