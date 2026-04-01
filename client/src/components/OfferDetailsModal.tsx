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
  }, [trade])

  // Build instant placeholder products from trade data to avoid blink
  const buildPlaceholderProduct = (id: number, title?: string, imageUrl?: string): Product => ({
    id,
    title: title || `Product #${id}`,
    description: '',
    status: 'available',
    seller_id: 0,
    image_urls: imageUrl ? [imageUrl] : [],
    created_at: '',
    updated_at: '',
  } as Product)

  // If incoming trade from list lacks items, fetch detailed trade
  useEffect(() => {
    if (!isOpen || !trade) return
    if (!trade.items || trade.items.length === 0) {
      ;(async () => {
        try {
          const res = await api.get(`/api/trades/${trade.id}`)
          const dt: Trade | null = res.data?.data || null
          setDetailedTrade(dt)
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
    // eslint-disable-next-line no-console
    console.log('🔍 [MODAL] Extracting buyer items from trade items:', items)
    const filtered = items.filter((i: any) => {
      // Log each item's offered_by value
      const offeredBy = (i?.offered_by ?? i?.offeredBy ?? i?.sender ?? i?.from_user_role)
      // eslint-disable-next-line no-console
      console.log(`  Item ${i.id}: offered_by=${offeredBy}`)
      if (typeof offeredBy === 'string') {
        const v = offeredBy.toLowerCase().trim()
        return v === 'buyer' || v === 'from_buyer' || v === 'sender'
      }
      return false
    })
    // eslint-disable-next-line no-console
    console.log('🔍 [MODAL] Filtered buyer items count:', filtered.length)
    return filtered
  }, [effectiveTrade])
  const offeredItemIds = useMemo(() => {
    const ids = buyerItems.map((i: any) => {
      const pid = (i?.product_id ?? i?.productId)
      return typeof pid === 'string' ? Number(pid) : pid
    })
    const filtered = ids
      .filter((x: any) => typeof x === 'number' && !Number.isNaN(x)) as number[]
    // eslint-disable-next-line no-console
    console.log('🔍 [MODAL] Offered item IDs:', filtered)
    return filtered
  }, [buyerItems])

  // Immediately set placeholder data from trade object (no API call needed)
  useEffect(() => {
    if (!isOpen || !effectiveTrade) return

    // Instant placeholder for requested (target) product
    const tradeAny = effectiveTrade as any
    const targetImg = tradeAny.product_image_url || tradeAny.productImageUrl || ''
    const targetTitle = effectiveTrade.product_title || ''
    if (effectiveTrade.target_product_id) {
      setRequested(prev => prev?.id === effectiveTrade.target_product_id ? prev :
        buildPlaceholderProduct(effectiveTrade.target_product_id, targetTitle, targetImg)
      )
    }

    // Instant placeholders for offered items
    if (buyerItems.length > 0) {
      const placeholders = buyerItems.map((item: any) => {
        const pid = item.product_id ?? item.productId
        const pTitle = item.product_title ?? item.productTitle ?? ''
        const pImg = item.product_image_url ?? item.productImageUrl ?? ''
        return buildPlaceholderProduct(Number(pid), pTitle, pImg)
      }).filter((p: Product) => p.id > 0)
      if (placeholders.length > 0) {
        setOffered(placeholders)
      }
    }
  }, [isOpen, effectiveTrade, buyerItems])

  // Then fetch full product details in background (upgrades placeholder data)
  useEffect(() => {
    if (!isOpen || !effectiveTrade) return
    ;(async () => {
      try {
        setLoading(true)
        // eslint-disable-next-line no-console
        console.log('🔍 [MODAL] Loading product details for trade', effectiveTrade.id)
        // eslint-disable-next-line no-console
        console.log('🔍 [MODAL] Target product ID:', effectiveTrade.target_product_id)
        // eslint-disable-next-line no-console
        console.log('🔍 [MODAL] Offered item IDs:', offeredItemIds)
        const req = await getProduct(effectiveTrade.target_product_id)
        // eslint-disable-next-line no-console
        console.log('🔍 [MODAL] Loaded requested product:', req)
        setRequested(req)
        const details: Product[] = []
        for (const pid of offeredItemIds) {
          // eslint-disable-next-line no-console
          console.log(`🔍 [MODAL] Loading product ${pid}`)
          const p = await getProduct(pid)
          // eslint-disable-next-line no-console
          console.log(`🔍 [MODAL] Loaded product ${pid}:`, p)
          if (p) details.push(p)
        }
        // eslint-disable-next-line no-console
        console.log('🔍 [MODAL] Final loaded products:', details.length)
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
      toast({
        id: "offerdetailsmodal-offer-accepted", title: 'Offer accepted', status: 'success' })
      onAccepted()
      onClose()
    } catch (e: any) {
      toast({
        id: "offerdetailsmodal-failed-to-accept", title: 'Failed to accept', description: e?.response?.data?.error || 'Try again', status: 'error' })
    }
  }

  const decline = async () => {
    onDeclineOpen()
  }

  const confirmDecline = async () => {
    if (!effectiveTrade) return
    try {
      await api.put(`/api/trades/${effectiveTrade.id}`, { action: 'decline' } as TradeAction)
      toast({
        id: "offerdetailsmodal-offer-declined", title: 'Offer declined', status: 'success' })
      onDeclined()
      onClose()
      onDeclineClose()
    } catch (e: any) {
      toast({
        id: "offerdetailsmodal-failed-to-decline", title: 'Failed to decline', description: e?.response?.data?.error || 'Try again', status: 'error' })
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
    setSelectedCounterIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id)
      }
      
      const limit = requested?.max_items_per_offer || 0
      if (limit > 0 && prev.length >= limit) {
        toast({
          id: 'offerdetailsmodal-selection-limit',
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

  const [cashDelta, setCashDelta] = useState<string>('')
  const [counterMsg, setCounterMsg] = useState<string>('')
  const { isOpen: isDeclineOpen, onOpen: onDeclineOpen, onClose: onDeclineClose } = useDisclosure()
  const cancelRef = React.useRef<HTMLButtonElement>(null)

  const submitCounter = async () => {
    if (!effectiveTrade) return
    try {
      await api.put(`/api/trades/${effectiveTrade.id}`, { action: 'counter', counter_offered_product_ids: selectedCounterIds, message: counterMsg, counter_offered_cash_amount: cashDelta ? Number(cashDelta) : undefined } as TradeAction)
      toast({
        id: "offerdetailsmodal-counter-offer-sent", title: 'Counter offer sent', status: 'success' })
      onAccepted()
      onClose()
    } catch (e: any) {
      toast({
        id: "offerdetailsmodal-failed-to-counter", title: 'Failed to counter', description: e?.response?.data?.error || 'Try again', status: 'error' })
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
      toast({
        id: "offerdetailsmodal-delivery-address-required", title: 'Delivery address required', description: 'Please provide a delivery address for delivery option.', status: 'warning' })
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
        id: "offerdetailsmodal-option-change-requested", 
        title: 'Option change requested', 
        description: 'The trader will be notified of your request to change the trade option.', 
        status: 'success' 
      })
      setShowOptionChangeModal(false)
      setRequestedOption(null)
      setRequestedDeliveryAddress('')
      onAccepted() // Refresh trade data
    } catch (e: any) {
      toast({
        id: "offerdetailsmodal-failed-to-request-change", title: 'Failed to request change', description: e?.response?.data?.error || 'Try again', status: 'error' })
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
      toast({
        id: "offerdetailsmodal-option-change-approved", title: 'Option change approved', description: 'The trade option has been updated.', status: 'success' })
      onAccepted() // Refresh trade data
    } catch (e: any) {
      toast({
        id: "offerdetailsmodal-failed-to-approve-change", title: 'Failed to approve change', description: e?.response?.data?.error || 'Try again', status: 'error' })
    }
  }

  const rejectOptionChange = async () => {
    if (!effectiveTrade) return
    try {
      await api.put(`/api/trades/${effectiveTrade.id}`, {
        action: 'reject_option_change',
      } as TradeAction)
      toast({
        id: "offerdetailsmodal-option-change-rejected", title: 'Option change rejected', description: 'The trade will proceed with the original option.', status: 'success' })
      onAccepted() // Refresh trade data
    } catch (e: any) {
      toast({
        id: "offerdetailsmodal-failed-to-reject-change", title: 'Failed to reject change', description: e?.response?.data?.error || 'Try again', status: 'error' })
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
    const imageHeight = compact ? '80px' : '150px'
    const padding = compact ? 2 : 3
    const titleSize = compact ? 'sm' : 'md'
    const titleFontWeight = compact ? 'semibold' : 'semibold'
    const priceFontSize = compact ? 'sm' : 'md'

    const imgSrc = resolveImage(p)
    if (!imgSrc) {
      // eslint-disable-next-line no-console
      console.log(`OfferDetailsModal: product ${p.id} (${p.title}) has no image source`)
    }

    return (
      <Box borderWidth="1px" borderColor="gray.200" rounded="md" overflow="hidden" bg="white" height="100%">
        <Image 
          src={imgSrc || ''} 
          alt={p.title} 
          w="full" 
          h={imageHeight} 
          objectFit="cover" 
          fallbackSrc="https://via.placeholder.com/400x300?text=No+Image" 
          bg="gray.100"
        />
        <Box p={padding}>
          <HStack justify="space-between">
            <Text fontWeight={titleFontWeight} fontSize={titleSize}>{p.title}</Text>
            {/* Show premium only on full (requested) cards, hide for compact (offered) */}
            {p.premium && !compact && <Badge colorScheme="yellow" fontSize={compact ? 'xs' : undefined}>Premium</Badge>}
          </HStack>

          {/* Hide status / barter badges in compact (offered) mode */}
          {!compact && (
            <HStack spacing={2} mt={1}>
              <Badge colorScheme={p.status === 'available' ? 'green' : 'red'} fontSize="2xs">{p.status}</Badge>
              {p.barter_only ? <Badge colorScheme="purple" fontSize="2xs">Barter</Badge> : <Badge colorScheme="blue" fontSize="2xs">For Sale</Badge>}
            </HStack>
          )}

          {!compact && p.description && <Text color="gray.600" mt={1} fontSize="xs" noOfLines={2}>{p.description}</Text>}

          {showPrice && (
            <Text mt={1} fontWeight="bold" fontSize="sm" color="brand.600">{formatPHP(p.price as number)}</Text>
          )}

          {!compact && <Text mt={1} fontSize="xs" color="gray.500">Seller: {p.seller_name || `#${p.seller_id}`}</Text>}

          <Button as={'a'} href={getProductUrl(p)} variant="link" colorScheme="brand" mt={1} size="sm" fontSize="xs">View listing</Button>
        </Box>
      </Box>
    )
  }

  const disableAccept = (offeredItemIds.length === 0) && (!effectiveTrade?.offered_cash_amount || effectiveTrade.offered_cash_amount === 0)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={{ base: 'full', md: 'lg' }} isCentered>
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent maxH="90vh" display="flex" flexDirection="column" bg="white" borderRadius="lg" boxShadow="lg">
        {/* Compact Header */}
        <Box bg="white" borderBottomWidth="1px" borderColor="gray.200" p={4}>
          <HStack justify="space-between" align="center">
            <VStack align="start" spacing={0}>
              <Text fontSize="lg" fontWeight="bold" color="gray.900">Offer Details</Text>
              <Badge 
                colorScheme={
                  effectiveTrade?.status === 'pending' ? 'yellow' : 
                  effectiveTrade?.status === 'accepted' ? 'green' : 
                  effectiveTrade?.status === 'declined' ? 'red' : 'gray'
                } 
                fontSize="xs"
              >
                {effectiveTrade?.status ? effectiveTrade.status.toUpperCase() : 'UNKNOWN'}
              </Badge>
            </VStack>
            <ModalCloseButton position="static" />
          </HStack>
        </Box>

        {/* Scrollable Content */}
        <ModalBody p={4} overflowY="auto" flex={1}>
          <VStack align="stretch" spacing={4}>
            {/* Items Comparison - Compact */}
            <Box>
              <Text fontSize="sm" fontWeight="bold" color="gray.700" mb={2}>Items</Text>
              <Grid templateColumns={{ base: '1fr', md: '0.8fr 1fr' }} gap={3}>
                {/* Your Requested Item */}
                <Box borderWidth="1px" borderColor="gray.200" borderRadius="md" overflow="hidden" bg="gray.50">
                  {loading ? (
                    <Box p={3} textAlign="center">
                      <Text fontSize="xs" color="gray.500">Loading...</Text>
                    </Box>
                  ) : (
                    renderProductCard(requested, { compact: true })
                  )}
                </Box>

                {/* Their Offered Items */}
                <Box>
                  {buyerItems.length > 0 ? (
                    <VStack spacing={2} align="stretch">
                      {buyerItems.map((item: any, idx: number) => {
                        const product = offered.find(p => p.id === (item.product_id ?? item.productId));
                        
                        if (!product) {
                          const itemImg = item.product_image_url || item.productImageUrl || item.image || ''
                          const itemTitle = item.product_title || item.productTitle || 'Unknown Item'
                          return (
                            <Box key={item.id || idx} borderWidth="1px" borderColor="gray.200" borderRadius="md" overflow="hidden" display="flex" h="80px">
                              <Image 
                                src={itemImg} 
                                alt={itemTitle} 
                                w="80px" 
                                h="80px" 
                                objectFit="cover" 
                                fallbackSrc="https://via.placeholder.com/80x80?text=No+Image" 
                              />
                              <Box p={2} flex={1} display="flex" flexDir="column" justifyContent="center">
                                <Text fontWeight="semibold" fontSize="xs" noOfLines={2}>{itemTitle}</Text>
                              </Box>
                            </Box>
                          )
                        }
                        
                        return (
                          <Box key={item.id || idx} borderWidth="1px" borderColor="gray.200" borderRadius="md" overflow="hidden" display="flex" h="80px">
                            <Image 
                              src={resolveImage(product)} 
                              alt={product.title} 
                              w="80px" 
                              h="80px" 
                              objectFit="cover" 
                              fallbackSrc="https://via.placeholder.com/80x80?text=No+Image"
                            />
                            <Box p={2} flex={1} display="flex" flexDir="column" justifyContent="center">
                              <Text fontWeight="semibold" fontSize="xs" noOfLines={2}>{product.title}</Text>
                            </Box>
                          </Box>
                        );
                      })}
                    </VStack>
                  ) : (
                    <Box p={3} bg="gray.50" borderRadius="md" textAlign="center">
                      <Text fontSize="xs" color="gray.500">No items offered</Text>
                    </Box>
                  )}
                </Box>
              </Grid>
            </Box>
            {trade?.message && (
              <Box p={3} bg="gray.50" borderRadius="md" borderWidth="1px" borderColor="gray.200">
                <Text fontSize="xs" fontWeight="bold" color="gray.700" mb={1}>Message</Text>
                <Text fontSize="xs" color="gray.700" lineHeight="1.5" noOfLines={2}>
                  {trade.message}
                </Text>
              </Box>
            )}

            {/* Trade Method */}
            {effectiveTrade?.trade_option && (
              <Box borderRadius="md" bg="brand.50" p={3} borderWidth="1px" borderColor="brand.200">
                <HStack spacing={2}>
                  <Icon as={effectiveTrade.trade_option === 'meetup' ? FaMapMarkerAlt : FaTruck} boxSize={4} color="brand.600" flexShrink={0} />
                  <VStack align="start" spacing={0} flex={1}>
                    <Text fontWeight="semibold" fontSize="sm" color="brand.900">
                      {effectiveTrade.trade_option === 'meetup' ? 'Meetup' : 'Delivery'}
                    </Text>
                    {effectiveTrade.trade_option === 'delivery' && effectiveTrade.delivery_address && (
                      <Text fontSize="xs" color="gray.700">{effectiveTrade.delivery_address}</Text>
                    )}
                    {effectiveTrade.trade_option === 'delivery' && (effectiveTrade as any).delivery_fee !== undefined && (
                      <Text fontSize="xs" color="green.700" fontWeight="semibold">
                        Delivery Fee: {formatPHP((effectiveTrade as any).delivery_fee)}
                      </Text>
                    )}
                  </VStack>
                </HStack>

                {/* Pending Change */}
                {hasPendingOptionChange && effectiveTrade.option_change_requested && (
                  <Box mt={2} pt={2} borderTopWidth="1px" borderColor="brand.200">
                    <Text fontSize="xs" fontWeight="bold" color="brand.700" mb={1}>
                      ⏳ Pending: {effectiveTrade.option_change_requested === 'meetup' ? 'Meetup' : 'Delivery'}
                    </Text>
                    {isUserSeller ? (
                      <HStack spacing={2} mt={2}>
                        <Button size="xs" colorScheme="green" onClick={approveOptionChange}>Approve</Button>
                        <Button size="xs" colorScheme="red" variant="outline" onClick={rejectOptionChange}>Reject</Button>
                      </HStack>
                    ) : (
                      <Text fontSize="xs" color="gray.600" fontStyle="italic">Waiting for seller...</Text>
                    )}
                  </Box>
                )}

                {canRequestOptionChange() && !hasPendingOptionChange && (
                  <Button size="xs" variant="outline" colorScheme="brand" onClick={() => setShowOptionChangeModal(true)} w="full" mt={2}>
                    Request Change
                  </Button>
                )}
              </Box>
            )}
          </VStack>
        </ModalBody>

        {/* Footer */}
        <Box borderTopWidth="1px" borderColor="gray.200" p={3} bg="white">
          <HStack spacing={2} justify="flex-end">
            {/* Action buttons can go here if needed */}
          </HStack>
        </Box>

        {/* Counter Modal */}
        <Modal isOpen={counterOpen} onClose={() => setCounterOpen(false)} isCentered size="md">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader fontSize="sm">
              Counter Offer
              {requested?.max_items_per_offer ? (
                <Badge ml={2} colorScheme="brand" variant="subtle" verticalAlign="middle">
                  Max {requested.max_items_per_offer} items
                </Badge>
              ) : null}
            </ModalHeader>
            <ModalCloseButton size="sm" />
            <ModalBody fontSize="sm">
              {selectedCounterIds.length > 0 && (
                <Text fontSize="xs" color="brand.500" fontWeight="bold" mb={2}>
                  {selectedCounterIds.length} {requested?.max_items_per_offer ? `/ ${requested.max_items_per_offer}` : ''} items selected
                </Text>
              )}
              <Grid templateColumns="repeat(auto-fill, minmax(90px, 1fr))" gap={2}>
                {userInventory.map(p => (
                  <Box key={p.id} borderWidth={selectedCounterIds.includes(p.id) ? '2px' : '1px'} borderColor={selectedCounterIds.includes(p.id) ? 'brand.500' : 'gray.200'} rounded="md" overflow="hidden" onClick={() => toggleCounter(p.id)} cursor="pointer" bg={selectedCounterIds.includes(p.id) ? 'brand.50' : 'white'}>
                    <Image src={getFirstImage(p.image_urls)} alt={p.title} w="full" h="60px" objectFit="cover" loading="lazy" />
                    <Box p={1}>
                      <Text fontSize="xs" noOfLines={1}>{p.title}</Text>
                    </Box>
                  </Box>
                ))}
              </Grid>
              <VStack spacing={2} mt={4}>
                <FormControl size="sm">
                  <FormLabel fontSize="xs">Add Cash</FormLabel>
                  <input type="number" value={cashDelta} onChange={e => setCashDelta(e.target.value)} min={0} step="100" style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #E2E8F0', borderRadius: '4px' }} />
                </FormControl>
                <FormControl size="sm">
                  <FormLabel fontSize="xs">Message</FormLabel>
                  <input value={counterMsg} onChange={e => setCounterMsg(e.target.value)} placeholder="Optional..." style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #E2E8F0', borderRadius: '4px' }} />
                </FormControl>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button size="sm" variant="ghost" mr={2} onClick={() => setCounterOpen(false)}>Cancel</Button>
              <Button size="sm" colorScheme="brand" onClick={submitCounter}>Send</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Decline Dialog */}
        <AlertDialog isOpen={isDeclineOpen} leastDestructiveRef={cancelRef} onClose={onDeclineClose} isCentered>
          <AlertDialogOverlay>
            <AlertDialogContent>
              <AlertDialogHeader fontSize="sm">Decline Offer?</AlertDialogHeader>
              <AlertDialogBody fontSize="xs">
                You can send a counter offer instead to negotiate.
              </AlertDialogBody>
              <AlertDialogFooter>
                <Button ref={cancelRef} size="sm" onClick={onDeclineClose}>Cancel</Button>
                <Button size="sm" colorScheme="red" onClick={confirmDecline} ml={2}>Decline</Button>
                <Button size="sm" colorScheme="brand" variant="outline" onClick={openCounter} ml={2}>Counter</Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogOverlay>
        </AlertDialog>

        {/* Option Change Modal */}
        <Modal isOpen={showOptionChangeModal} onClose={() => setShowOptionChangeModal(false)} size="sm" isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader fontSize="sm">Trade Method</ModalHeader>
            <ModalCloseButton size="sm" />
            <ModalBody fontSize="sm">
              <Grid templateColumns="repeat(2, 1fr)" gap={2} mb={4}>
                <Card variant="outline" cursor="pointer" borderWidth={requestedOption === 'meetup' ? '2px' : '1px'} borderColor={requestedOption === 'meetup' ? 'brand.500' : 'gray.200'} bg={requestedOption === 'meetup' ? 'brand.50' : 'white'} onClick={() => setRequestedOption('meetup')}>
                  <CardBody p={2}>
                    <VStack spacing={1} align="center">
                      <Icon as={FaMapMarkerAlt} boxSize={4} color={requestedOption === 'meetup' ? 'brand.600' : 'gray.400'} />
                      <Text fontSize="xs" fontWeight="semibold">Meetup</Text>
                    </VStack>
                  </CardBody>
                </Card>
                <Card variant="outline" cursor="pointer" borderWidth={requestedOption === 'delivery' ? '2px' : '1px'} borderColor={requestedOption === 'delivery' ? 'brand.500' : 'gray.200'} bg={requestedOption === 'delivery' ? 'brand.50' : 'white'} onClick={() => setRequestedOption('delivery')}>
                  <CardBody p={2}>
                    <VStack spacing={1} align="center">
                      <Icon as={FaTruck} boxSize={4} color={requestedOption === 'delivery' ? 'brand.600' : 'gray.400'} />
                      <Text fontSize="xs" fontWeight="semibold">Delivery</Text>
                    </VStack>
                  </CardBody>
                </Card>
              </Grid>
              {requestedOption === 'delivery' && (
                <FormControl isRequired mb={3}>
                  <FormLabel fontSize="xs">Address</FormLabel>
                  <Textarea placeholder="Your address..." value={requestedDeliveryAddress} onChange={(e) => setRequestedDeliveryAddress(e.target.value)} rows={2} size="sm" />
                </FormControl>
              )}
            </ModalBody>
            <ModalFooter>
              <Button size="sm" variant="ghost" mr={2} onClick={() => setShowOptionChangeModal(false)}>Cancel</Button>
              <Button size="sm" colorScheme="brand" onClick={requestOptionChange} isLoading={requestingOptionChange} isDisabled={!requestedOption || (requestedOption === 'delivery' && !requestedDeliveryAddress.trim())}>Request</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </ModalContent>
    </Modal>
  )
}

export default OfferDetailsModal


