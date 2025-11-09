import React, { useEffect, useMemo, useState, useRef } from 'react'
import { Box, Heading, VStack, HStack, Text, Badge, Button, Spinner, Center, useToast, Tabs, TabList, TabPanels, Tab, TabPanel, Select, Image, Link, useColorModeValue, Slide, ScaleFade, Icon, Modal, ModalOverlay, ModalContent, ModalBody, ModalCloseButton, Textarea } from '@chakra-ui/react'
import { FaHandshake, FaTimes, FaMapMarkerAlt, FaTruck } from 'react-icons/fa'
import { api } from '../services/api'
import { Trade, TradeAction } from '../types'
import { getFirstImage } from '../utils/imageUtils'
import OfferDetailsModal from '../components/OfferDetailsModal'
import TradeCompletionModal from '../components/TradeCompletionModal'

const Offers: React.FC = () => {
  const [incoming, setIncoming] = useState<Trade[]>([])
  const [outgoing, setOutgoing] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [completionModalOpen, setCompletionModalOpen] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [tradeToCancel, setTradeToCancel] = useState<Trade | null>(null)
  const [declineModalOpen, setDeclineModalOpen] = useState(false)
  const [tradeToDecline, setTradeToDecline] = useState<Trade | null>(null)
  const [declineFeedback, setDeclineFeedback] = useState('')
  const [activeTab, setActiveTab] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<number | undefined>()
  const [productTitles, setProductTitles] = useState<Map<number, string>>(new Map())
  const toast = useToast()
  
  const bgColor = useColorModeValue('#FEFEFE', 'gray.900')
  const cardBg = useColorModeValue('#FDFDFD', 'gray.800')
  const softAccent = useColorModeValue('#F8F9FA', 'gray.700')

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [incRes, outRes] = await Promise.all([
        api.get('/api/trades', { params: { direction: 'incoming' } }),
        api.get('/api/trades', { params: { direction: 'outgoing' } }),
      ])
      setIncoming(Array.isArray(incRes.data?.data) ? incRes.data.data : [])
      setOutgoing(Array.isArray(outRes.data?.data) ? outRes.data.data : [])
      
      // Fetch product titles for all trades
      await fetchProductTitles([...incRes.data?.data || [], ...outRes.data?.data || []])
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to load offers', status: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const fetchProductTitles = async (trades: Trade[]) => {
    const productIds = new Set<number>()
    
    // Collect all unique product IDs from trades
    trades.forEach(trade => {
      if (trade.target_product_id) {
        productIds.add(trade.target_product_id)
      }
      // Also collect from offered items
      if (trade.items) {
        trade.items.forEach((item: any) => {
          const pid = item.product_id ?? item.productId
          if (pid) {
            productIds.add(Number(pid))
          }
        })
      }
    })

    // Fetch titles for products we don't have yet
    const titlesToFetch = Array.from(productIds).filter(id => !productTitles.has(id))
    
    if (titlesToFetch.length > 0) {
      try {
        const titlePromises = titlesToFetch.map(async (id) => {
          try {
            const response = await api.get(`/api/products/${id}`)
            const title = response.data?.data?.title
            return { id, title: title || 'Unnamed Item' }
          } catch {
            return { id, title: 'Unnamed Item' }
          }
        })
        
        const results = await Promise.all(titlePromises)
        const newTitles = new Map(productTitles)
        results.forEach(({ id, title }) => {
          newTitles.set(id, title)
        })
        setProductTitles(newTitles)
      } catch (error) {
        console.error('Failed to fetch product titles:', error)
      }
    }
  }

  const getProductTitle = (productId: number, fallbackTitle?: string): string => {
    if (fallbackTitle) return fallbackTitle
    return productTitles.get(productId) || 'Unnamed Item'
  }

  useEffect(() => { 
    fetchAll()
    // Get current user ID from localStorage or API
    const userId = localStorage.getItem('userId')
    if (userId) {
      setCurrentUserId(parseInt(userId))
    }
  }, [])

  // Debug: inspect API structure for /api/trades
  useEffect(() => {
    if (!loading) {
      try {
        // eslint-disable-next-line no-console
        console.log('🔍 [TRADE STRUCTURE DEBUG] Incoming trades:', JSON.stringify(incoming.slice(0, 2), null, 2))
        // eslint-disable-next-line no-console
        console.log('🔍 [TRADE STRUCTURE DEBUG] Outgoing trades:', JSON.stringify(outgoing.slice(0, 2), null, 2))
        const sample = incoming[0] || outgoing[0]
        if (sample?.items && sample.items.length > 0) {
          // eslint-disable-next-line no-console
          console.log('🔍 [ITEMS DEBUG] Trade items type:', typeof (sample.items[0] as any))
          // eslint-disable-next-line no-console
          console.log('🔍 [ITEMS DEBUG] First item structure:', sample.items[0])
        }
      } catch {}
    }
  }, [loading, incoming, outgoing])

  const updateTrade = async (id: number, action: TradeAction) => {
    try {
      await api.put(`/api/trades/${id}`, action)
      toast({ title: 'Success', description: 'Offer updated', status: 'success' })
      fetchAll()
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to update offer', status: 'error' })
    }
  }

  const handleCompleteTradeClick = (trade: Trade) => {
    setSelectedTrade(trade)
    setCompletionModalOpen(true)
  }

  const handleCancelTradeClick = (trade: Trade) => {
    setTradeToCancel(trade)
    setCancelModalOpen(true)
  }

  const handleConfirmCancel = async () => {
    if (!tradeToCancel) return
    
    try {
      await updateTrade(tradeToCancel.id, { action: 'cancel' })
      setCancelModalOpen(false)
      setTradeToCancel(null)
      toast({
        title: 'Offer cancelled',
        description: 'The offer has been successfully cancelled',
        status: 'success',
        duration: 3000
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to cancel offer',
        status: 'error'
      })
    }
  }

  const handleDeclineTradeClick = (trade: Trade) => {
    setTradeToDecline(trade)
    setDeclineFeedback('')
    setDeclineModalOpen(true)
  }

  const handleConfirmDecline = async () => {
    if (!tradeToDecline) return
    
    try {
      await updateTrade(tradeToDecline.id, { 
        action: 'decline',
        message: declineFeedback.trim() || undefined
      })
      setDeclineModalOpen(false)
      setTradeToDecline(null)
      setDeclineFeedback('')
      toast({
        title: 'Offer declined',
        description: 'The offer has been successfully declined',
        status: 'success',
        duration: 3000
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to decline offer',
        status: 'error'
      })
    }
  }

  const sortList = (list: Trade[]) => {
    const sorted = [...list]
    sorted.sort((a, b) => {
      const at = new Date(a.created_at).getTime()
      const bt = new Date(b.created_at).getTime()
      return sort === 'newest' ? bt - at : at - bt
    })
    return sorted
  }

  const incomingSorted = useMemo(() => sortList(incoming), [incoming, sort])
  const outgoingSorted = useMemo(() => sortList(outgoing), [outgoing, sort])
  // statuses that should be treated as "history"
  const historyStatuses = ['declined', 'cancelled', 'completed']

  // visible lists for the two main tabs (exclude history items)
  const offersReceivedVisible = incomingSorted.filter(t => !historyStatuses.includes(t.status))
  const offersSentVisible = outgoingSorted.filter(t => !historyStatuses.includes(t.status))

  // Priority ranking: countered first, then pending, then others
  const statusRank = (s?: string) => {
    if (!s) return 3
    const v = s.toLowerCase()
    if (v === 'countered') return 0
    if (v === 'pending') return 1
    return 2
  }

  const compareDatesBySort = (a: Trade, b: Trade) => {
    const at = new Date(a.created_at).getTime()
    const bt = new Date(b.created_at).getTime()
    return sort === 'newest' ? bt - at : at - bt
  }

  const offersReceivedSorted = useMemo(() => {
    return [...offersReceivedVisible].sort((a, b) => {
      const r = statusRank(a.status) - statusRank(b.status)
      if (r !== 0) return r
      return compareDatesBySort(a, b)
    })
  }, [offersReceivedVisible, sort])

  const offersSentSorted = useMemo(() => {
    return [...offersSentVisible].sort((a, b) => {
      const r = statusRank(a.status) - statusRank(b.status)
      if (r !== 0) return r
      return compareDatesBySort(a, b)
    })
  }, [offersSentVisible, sort])

  // history list: combine history-status trades from incoming+outgoing and tag source for UX
  type SourceTrade = Trade & { source: 'Offers Received' | 'Offers Sent' }
  const historyItems: SourceTrade[] = [
    ...incomingSorted.filter(t => historyStatuses.includes(t.status)).map(t => ({ ...t, source: 'Offers Received' as const })),
    ...outgoingSorted.filter(t => historyStatuses.includes(t.status)).map(t => ({ ...t, source: 'Offers Sent' as const })),
  ]

  // Resolve image for an item coming from /api/trades (robust to various shapes)
  const resolveItemImage = (it: any): string | undefined => {
    if (!it) return undefined
    // common single-field
    if (it.product_image_url) return it.product_image_url
    if (it.productImageUrl) return it.productImageUrl
    // combined/title fields might include an array string
    const maybeImgs = it.product_image_urls ?? it.productImages ?? null
    if (Array.isArray(maybeImgs) && maybeImgs.length > 0) return getFirstImage(maybeImgs)
    if (typeof maybeImgs === 'string' && maybeImgs.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(maybeImgs)
        if (Array.isArray(parsed) && parsed.length > 0) return getFirstImage(parsed)
      } catch {}
    }
    return undefined
  }

  // small cache to avoid refetching product details repeatedly
  const productImageCache = useRef<Map<number, string | null>>(new Map())

  // helper component: show thumbnail from existing url or fetch product by id
  const ProductThumb: React.FC<{ pid: number; src?: string; alt?: string }> = ({ pid, src, alt }) => {
    const [img, setImg] = useState<string | null>(src ?? null)

    useEffect(() => {
      let mounted = true
      if (src) {
        setImg(src)
        return
      }
      const cached = productImageCache.current.get(pid)
      if (cached !== undefined) {
        setImg(cached)
        return
      }
      ;(async () => {
        try {
          const res = await api.get(`/api/products/${pid}`)
          const prod = res.data?.data
          const maybeImgs: any = prod?.image_urls ?? prod?.images ?? null
          let resolved: string | undefined
          if (Array.isArray(maybeImgs) && maybeImgs.length > 0) resolved = getFirstImage(maybeImgs)
          else if (typeof maybeImgs === 'string' && maybeImgs.trim().startsWith('[')) {
            try {
              const parsed = JSON.parse(maybeImgs)
              if (Array.isArray(parsed) && parsed.length > 0) resolved = getFirstImage(parsed)
            } catch {}
          } else if (prod?.image_url) resolved = prod.image_url
          else if (prod?.imageUrl) resolved = prod.imageUrl
          if (mounted) {
            productImageCache.current.set(pid, resolved ?? null)
            setImg(resolved ?? null)
          }
        } catch {
          productImageCache.current.set(pid, null)
          if (mounted) setImg(null)
        }
      })()
      return () => { mounted = false }
    }, [pid, src])

    return (
      <Image
        src={img ?? ''}
        alt={alt ?? 'Product Image'}
        boxSize="40px"
        objectFit="cover"
        fallbackSrc="https://via.placeholder.com/40x40?text=?"
      />
    )
  }

  if (loading) {
    return (
      <Center h="50vh"><Spinner size="xl" color="brand.500" /></Center>
    )
  }

  const badgeColor = (status: Trade['status']) => {
    const statusMap: Record<string, { color: string; icon: string }> = {
      'pending': { color: 'yellow', icon: '🕓' },
      'accepted': { color: 'green', icon: '✓' },
      'declined': { color: 'red', icon: '✗' },
      'cancelled': { color: 'gray', icon: '✗' },
      'countered': { color: 'purple', icon: '🔁' },
      'expired': { color: 'gray', icon: '⌛' },
      'completed': { color: 'green', icon: '✓' },
      'active': { color: 'blue', icon: '💬' }
    }
    return statusMap[status.toLowerCase()] || { color: 'gray', icon: '•' }
  }
  
  const getStatusBadge = (status: Trade['status']) => {
    const { color, icon } = badgeColor(status)
    const statusText = status.charAt(0).toUpperCase() + status.slice(1)
    return (
      <Badge 
        colorScheme={color} 
        variant="subtle"
        display="flex"
        alignItems="center"
        gap={1.5}
        px={2.5}
        py={1}
        rounded="full"
        fontSize="xs"
        fontWeight="medium"
        textTransform="none"
        boxShadow="sm"
      >
        <span style={{ fontSize: '0.9em' }}>{icon}</span>
        <span>{statusText}</span>
      </Badge>
    )
  }

  const renderOfferedItems = (t: Trade) => {
    const offered = (t.items || []).filter((i: any) => {
      const ob = (i?.offered_by ?? i?.offeredBy ?? i?.sender ?? i?.from_user_role)
      if (typeof ob === 'string') {
        const v = ob.toLowerCase()
        return v === 'buyer' || v === 'from_buyer' || v === 'sender'
      }
      return false
    })
    if (offered.length === 0) return <Text color="gray.500" fontSize="sm">No items attached</Text>
    return (
      <HStack spacing={2} mt={2} wrap="wrap">
        {offered.map((it: any) => {
          const pid = it.product_id ?? it.productId
          const ptitle = it.product_title ?? it.productTitle
          const pimg = it.product_image_url ?? it.productImageUrl
          const pstatus = it.product_status ?? it.productStatus
          return (
            <HStack key={it.id} spacing={2} borderWidth="1px" borderColor="gray.200" rounded="md" p={2} align="center">
              {/* Use ProductThumb: if pimg exists it's used, otherwise it will fetch product by id */}
              <ProductThumb pid={Number(pid)} src={pimg} alt={getProductTitle(Number(pid), ptitle)} />
              <VStack spacing={0} align="start">
                <Link 
                  href={`/products/${it.product_slug || pid}`} 
                  color="brand.600" 
                  fontSize="sm"
                  onClick={(e) => {
                    e.preventDefault()
                    const slug = it.product_slug || pid
                    window.location.href = `/products/${slug}`
                  }}
                >
                  {getProductTitle(Number(pid), ptitle)}
                </Link>
                <Text fontSize="xs" color="gray.500">{pstatus}</Text>
              </VStack>
            </HStack>
          )
        })}
      </HStack>
    )
  }

  return (
    <Box minH="100vh" bg="#FFFDF1">
      <Box px={8} py={20}>
        <Slide direction="top" in={!loading} style={{ zIndex: 10 }}>
          <HStack justify="space-between" mb={4} pl={24} mt={4}>
            <Heading size="lg" color="brand.500" fontWeight="bold">
              Trade Management
            </Heading>
            <HStack spacing={3} mt={2}>
              <Text fontSize="sm" color="gray.500" fontWeight="medium">Sort:</Text>
              <Select 
                size="sm" 
                value={sort} 
                onChange={e => setSort(e.target.value as any)} 
                w="140px"
                bg={cardBg}
                borderColor="gray.200"
                borderRadius="md"
                _hover={{ 
                  borderColor: "gray.300",
                  transform: "translateY(-1px)",
                  boxShadow: "sm"
                }}
                _focus={{ 
                  borderColor: "blue.300", 
                  boxShadow: "0 0 0 1px rgba(66, 153, 225, 0.3)" 
                }}
                transition="all 0.2s ease"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </Select>
            </HStack>
          </HStack>
        </Slide>

        <Tabs 
          colorScheme="blue" 
          variant="soft-rounded" 
          index={activeTab} 
          onChange={setActiveTab}
          bg={cardBg}
          borderRadius="lg"
          boxShadow="sm"
          border="1px solid"
          borderColor="gray.100"
          overflow="hidden"
        >
          <TabList bg={softAccent} p={3} gap={2}>
            <Tab 
              _selected={{ 
                bg: "blue.500", 
                color: "white",
                transform: "translateY(-1px)",
                boxShadow: "sm"
              }}
              _hover={{ 
                bg: "blue.50",
                transform: "translateY(-1px)"
              }}
              transition="all 0.2s ease"
              fontWeight="medium"
              fontSize="sm"
              borderRadius="md"
              px={4}
              py={2}
            >
              Offers Received 
              <Badge ml={2} colorScheme="blue" variant="subtle" fontSize="xs">
                {incoming.filter(i => i.status === 'pending').length}
              </Badge>
            </Tab>
            <Tab 
              _selected={{ 
                bg: "blue.500", 
                color: "white",
                transform: "translateY(-1px)",
                boxShadow: "sm"
              }}
              _hover={{ 
                bg: "green.50",
                transform: "translateY(-1px)"
              }}
              transition="all 0.2s ease"
              fontWeight="medium"
              fontSize="sm"
              borderRadius="md"
              px={4}
              py={2}
            >
              Offers Sent 
              <Badge ml={2} colorScheme="green" variant="subtle" fontSize="xs">
                {outgoing.filter(i => i.status === 'pending').length}
              </Badge>
            </Tab>
            <Tab 
              _selected={{ 
                bg: "blue.500", 
                color: "white",
                transform: "translateY(-1px)",
                boxShadow: "sm"
              }}
              _hover={{ 
                bg: "orange.50",
                transform: "translateY(-1px)"
              }}
              transition="all 0.2s ease"
              fontWeight="medium"
              fontSize="sm"
              borderRadius="md"
              px={4}
              py={2}
            >
              In Progress
              <Badge ml={2} colorScheme="orange" variant="subtle" fontSize="xs">
                {incomingSorted.concat(outgoingSorted).filter(t => t.status === 'accepted' || t.status === 'active').length}
              </Badge>
            </Tab>
            <Tab 
              _selected={{ 
                bg: "blue.500", 
                color: "white",
                transform: "translateY(-1px)",
                boxShadow: "sm"
              }}
              _hover={{ 
                bg: "gray.50",
                transform: "translateY(-1px)"
              }}
              transition="all 0.2s ease"
              fontWeight="medium"
              fontSize="sm"
              borderRadius="md"
              px={4}
              py={2}
            >
              History
              <Badge ml={2} colorScheme="gray" variant="subtle" fontSize="xs">
                {historyItems.length}
              </Badge>
            </Tab>
          </TabList>
          <TabPanels bg={cardBg} p={5}>
          <TabPanel p={0}>
            <VStack spacing={3} align="stretch">
              {offersReceivedSorted.length === 0 ? (
                <Text color="gray.500" textAlign="center" py={8}>No offers received.</Text>
              ) : offersReceivedSorted.map((t) => (
                <ScaleFade in={true} key={t.id}>
                  <Box
                    bg="white"
                    borderWidth="1px"
                    borderLeftWidth="4px"
                    borderColor={
                      t.status === 'countered' ? 'purple.400' :
                      t.status === 'pending' ? 'yellow.400' :
                      t.status === 'accepted' || t.status === 'active' ? 'green.400' :
                      'gray.200'
                    }
                    rounded="lg"
                    p={6}
                    position="relative"
                    boxShadow="md"
                    _hover={{
                      boxShadow: 'lg',
                      transform: 'translateY(-2px)',
                      borderColor: t.status === 'countered' ? 'purple.500' :
                                 t.status === 'pending' ? 'yellow.500' :
                                 t.status === 'accepted' || t.status === 'active' ? 'green.500' : 'gray.300'
                    }}
                    transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                  >
                  {/* Top-left: Trade type indicator */}
                  <Badge 
                    position="absolute" 
                    top={3} 
                    left={3} 
                    colorScheme="blue"
                    variant="subtle"
                    px={2}
                    py={1}
                    rounded="md"
                    fontSize="xs"
                    textTransform="none"
                    leftIcon={<span>💬</span>}
                  >
                    Received
                  </Badge>

                  {/* Top-right: status */}
                  <Box position="absolute" top={3} right={3}>
                    {getStatusBadge(t.status)}
                  </Box>

                  {/* Main content with extra right padding for actions */}
                  <Box pr={t.status === 'pending' ? "200px" : "180px"} pt={8}>
                    <VStack align="start" spacing={2}>
                      <HStack spacing={2} align="center" flexWrap="wrap">
                        <Text fontWeight="semibold" fontSize="md">{getProductTitle(t.target_product_id, t.product_title)}</Text>
                        {t.trade_option && (
                          <Badge 
                            colorScheme={t.trade_option === 'meetup' ? 'blue' : 'green'}
                            variant="subtle"
                            fontSize="xs"
                            display="flex"
                            alignItems="center"
                            gap={1}
                          >
                            <Icon as={t.trade_option === 'meetup' ? FaMapMarkerAlt : FaTruck} boxSize={2.5} />
                            {t.trade_option === 'meetup' ? 'Meetup' : 'Delivery'}
                          </Badge>
                        )}
                      </HStack>
                      <Text fontSize="sm" color="gray.600">From: <Text as="span" fontWeight="medium">{t.buyer_name || 'Anonymous User'}</Text></Text>
                      <Text fontSize="xs" color="gray.500">{new Date(t.created_at).toLocaleString()}</Text>
                      {renderOfferedItems(t)}
                    </VStack>
                  </Box>

                    {/* Actions positioned bottom-right */}
                    <Box position="absolute" right={4} bottom={4}>
                      <HStack spacing={2}>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => { setSelectedTrade(t); setDetailsOpen(true) }}
                          _hover={{ bg: "gray.100" }}
                        >
                          View
                        </Button>
                        <Button 
                          size="sm" 
                          colorScheme="green" 
                          variant="solid"
                          onClick={() => updateTrade(t.id, { action: 'accept' })} 
                          isDisabled={t.status !== 'pending'}
                          _hover={{ transform: "translateY(-1px)" }}
                        >
                          Accept
                        </Button>
                        <Button 
                          size="sm" 
                          colorScheme="red" 
                          variant="outline" 
                          onClick={() => handleDeclineTradeClick(t)} 
                          isDisabled={t.status !== 'pending'}
                          _hover={{ transform: "translateY(-1px)" }}
                        >
                          Decline
                        </Button>
                      </HStack>
                    </Box>
                  </Box>
                </ScaleFade>
              ))}
            </VStack>
          </TabPanel>
          <TabPanel p={0}>
            <VStack spacing={3} align="stretch">
              {offersSentSorted.length === 0 ? (
                <Text color="gray.500" textAlign="center" py={8}>No offers sent.</Text>
              ) : offersSentSorted.map((t) => (
                <ScaleFade in={true} key={t.id}>
                  <Box 
                    bg="white" 
                    borderWidth="1px"
                    borderLeftWidth="4px"
                    borderColor={
                      t.status === 'countered' ? 'purple.400' :
                      t.status === 'pending' ? 'yellow.400' :
                      t.status === 'accepted' || t.status === 'active' ? 'green.400' :
                      'gray.200'
                    }
                    rounded="lg" 
                    p={6}
                    position="relative"
                    boxShadow="md"
                    _hover={{
                      boxShadow: 'lg',
                      transform: 'translateY(-2px)',
                      borderColor: t.status === 'countered' ? 'purple.500' :
                                 t.status === 'pending' ? 'yellow.500' :
                                 t.status === 'accepted' || t.status === 'active' ? 'green.500' : 'gray.300'
                    }}
                    transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                  >
                    {/* Top-left: Trade type indicator */}
                    <Badge 
                      position="absolute" 
                      top={3} 
                      left={3} 
                      colorScheme="blue"
                      variant="subtle"
                      px={2}
                      py={1}
                      rounded="md"
                      fontSize="xs"
                      textTransform="none"
                      leftIcon={<span>📤</span>}
                    >
                      Sent
                    </Badge>

                    {/* Top-right: status */}
                    <Box 
                      position="absolute" 
                      top={3} 
                      right={3}
                      className="status-badge"
                      transition="transform 0.2s ease-out"
                    >
                      {getStatusBadge(t.status)}
                    </Box>

                    {/* Main content with extra right padding for actions */}
                    <Box pr={t.status === 'pending' ? "200px" : "180px"} pt={8}>
                      <VStack align="start" spacing={2}>
                        <HStack spacing={2} align="center" flexWrap="wrap">
                          <Text fontWeight="semibold" color="gray.800" fontSize="md">{getProductTitle(t.target_product_id, t.product_title)}</Text>
                          {t.trade_option && (
                            <Badge 
                              colorScheme={t.trade_option === 'meetup' ? 'blue' : 'green'}
                              variant="subtle"
                              fontSize="xs"
                              display="flex"
                              alignItems="center"
                              gap={1}
                            >
                              <Icon as={t.trade_option === 'meetup' ? FaMapMarkerAlt : FaTruck} boxSize={2.5} />
                              {t.trade_option === 'meetup' ? 'Meetup' : 'Delivery'}
                            </Badge>
                          )}
                        </HStack>
                        <Text fontSize="sm" color="gray.600">To: <Text as="span" fontWeight="medium">{t.seller_name || 'Anonymous User'}</Text></Text>
                        <Text fontSize="xs" color="gray.500">{new Date(t.created_at).toLocaleString()}</Text>
                        {renderOfferedItems(t)}
                      </VStack>
                    </Box>

                    {/* Bottom-right actions: Cancel button for pending offers */}
                    {t.status === 'pending' && (
                      <Box position="absolute" right={4} bottom={4}>
                        <Button
                          size="sm"
                          colorScheme="red"
                          variant="outline"
                          onClick={() => handleCancelTradeClick(t)}
                          _hover={{ 
                            bg: "red.50",
                            transform: "translateY(-1px)"
                          }}
                          leftIcon={<Icon as={FaTimes} />}
                        >
                          Cancel Offer
                        </Button>
                      </Box>
                    )}
                  </Box>
                </ScaleFade>
              ))}
            </VStack>
          </TabPanel>
          <TabPanel p={0}>
            <VStack spacing={3} align="stretch">
              {incomingSorted.concat(outgoingSorted).filter(t => t.status === 'accepted' || t.status === 'active').length === 0 ? (
                <Text color="gray.500" textAlign="center" py={8}>No trades in progress.</Text>
              ) : incomingSorted.concat(outgoingSorted).filter(t => t.status === 'accepted' || t.status === 'active').map((t) => (
                <ScaleFade in={true} key={t.id}>
                  <Box 
                    bg="white" 
                    borderWidth="1px"
                    borderLeftWidth="4px"
                    borderColor={
                      t.status === 'countered' ? 'purple.400' :
                      t.status === 'pending' ? 'yellow.400' :
                      t.status === 'accepted' || t.status === 'active' ? 'green.400' :
                      'gray.200'
                    }
                    rounded="lg" 
                    p={6}
                    position="relative"
                    boxShadow="md"
                    _hover={{
                      boxShadow: 'lg',
                      transform: 'translateY(-2px)',
                      borderColor: t.status === 'countered' ? 'purple.500' :
                                 t.status === 'pending' ? 'yellow.500' :
                                 t.status === 'accepted' || t.status === 'active' ? 'green.500' : 'gray.300'
                    }}
                    transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                  >
                    {/* Top-left: Trade type indicator */}
                    <Badge 
                      position="absolute" 
                      top={3} 
                      left={3} 
                      colorScheme="blue"
                      variant="subtle"
                      px={2}
                      py={1}
                      rounded="md"
                      fontSize="xs"
                      textTransform="none"
                      leftIcon={<span>🔄</span>}
                    >
                      In Progress
                    </Badge>

                    {/* Top-right: status */}
                    <Box 
                      position="absolute" 
                      top={3} 
                      right={3}
                      className="status-badge"
                      transition="transform 0.2s ease-out"
                    >
                      {getStatusBadge(t.status)}
                    </Box>

                    {/* Main content with extra right padding for actions */}
                    <Box pr={t.status === 'pending' ? "200px" : "180px"} pt={8}>
                      <VStack align="start" spacing={2}>
                        <HStack spacing={2} align="center" flexWrap="wrap">
                          <Text fontWeight="semibold" color="gray.800" fontSize="md">{getProductTitle(t.target_product_id, t.product_title)}</Text>
                          {t.trade_option && (
                            <Badge 
                              colorScheme={t.trade_option === 'meetup' ? 'blue' : 'green'}
                              variant="subtle"
                              fontSize="xs"
                              display="flex"
                              alignItems="center"
                              gap={1}
                            >
                              <Icon as={t.trade_option === 'meetup' ? FaMapMarkerAlt : FaTruck} boxSize={2.5} />
                              {t.trade_option === 'meetup' ? 'Meetup' : 'Delivery'}
                            </Badge>
                          )}
                        </HStack>
                        <Text fontSize="sm" color="gray.600">Buyer: {t.buyer_name || 'Anonymous User'} • Seller: {t.seller_name || 'Anonymous User'}</Text>
                        {renderOfferedItems(t)}
                      </VStack>
                    </Box>

                    {/* Bottom-right actions: Complete button */}
                    <Box position="absolute" right={4} bottom={4}>
                      <Button
                        size="sm"
                        colorScheme="blue"
                        variant="solid"
                        onClick={() => handleCompleteTradeClick(t)}
                        isDisabled={['completed', 'cancelled', 'declined'].includes(t.status)}
                        title="Click to open trade completion modal"
                        _hover={{ transform: "translateY(-1px)" }}
                        leftIcon={<Icon as={FaHandshake} />}
                      >
                        Complete Trade
                      </Button>
                    </Box>
                  </Box>
                </ScaleFade>
              ))}
            </VStack>
          </TabPanel>
          <TabPanel p={0}>
            <VStack spacing={3} align="stretch">
              {historyItems.length === 0 ? (
                <Text color="gray.500" textAlign="center" py={8}>No history yet.</Text>
              ) : historyItems.map((t) => (
                <ScaleFade in={true} key={t.id}>
                  <Box 
                    bg="white" 
                    borderWidth="1px" 
                    borderColor="gray.100" 
                    rounded="lg" 
                    p={5}
                    boxShadow="sm"
                    _hover={{
                      boxShadow: "md",
                      transform: "translateY(-1px)",
                      borderColor: "gray.200"
                    }}
                    transition="all 0.2s ease"
                  >
                    <HStack justify="space-between" align="start">
                      <VStack align="start" spacing={2}>
                        <Text fontWeight="semibold" color="gray.800">{getProductTitle(t.target_product_id, t.product_title)}</Text>
                        <Text fontSize="sm" color="gray.600">Buyer: {t.buyer_name || 'Anonymous User'} • Seller: {t.seller_name || 'Anonymous User'}</Text>
                        {renderOfferedItems(t)}
                        <Text fontSize="xs" color="gray.400" mt={1}>Source: {t.source}</Text>
                      </VStack>
                      <Badge colorScheme={badgeColor(t.status)} variant="subtle">{t.status}</Badge>
                    </HStack>
                  </Box>
                </ScaleFade>
              ))}
            </VStack>
          </TabPanel>
        </TabPanels>
      </Tabs>

        <OfferDetailsModal
          trade={selectedTrade}
          isOpen={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          onAccepted={fetchAll}
          onDeclined={fetchAll}
        />

        <TradeCompletionModal
          trade={selectedTrade}
          isOpen={completionModalOpen}
          onClose={() => setCompletionModalOpen(false)}
          onCompleted={fetchAll}
          currentUserId={currentUserId}
        />

        {/* Cancel Confirmation Modal */}
        <Modal isOpen={cancelModalOpen} onClose={() => setCancelModalOpen(false)} size="sm" isCentered>
          <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
          <ModalContent
            bg="white"
            borderRadius="xl"
            boxShadow="xl"
            mx={4}
          >
            <ModalCloseButton />
            <ModalBody p={6} textAlign="center">
              <VStack spacing={4}>
                <Icon as={FaTimes} color="red.500" boxSize={8} />
                <VStack spacing={2}>
                  <Text fontWeight="bold" fontSize="lg" color="gray.800">
                    Cancel Offer
                  </Text>
                  <Text fontSize="sm" color="gray.600" textAlign="center">
                    Are you sure you want to cancel this offer? This action cannot be undone.
                  </Text>
                  {tradeToCancel && (
                    <Text fontSize="xs" color="gray.500" mt={2}>
                      Product: {getProductTitle(tradeToCancel.target_product_id, tradeToCancel.product_title)}
                    </Text>
                  )}
                </VStack>
                
                <HStack spacing={3} w="full">
                  <Button
                    variant="outline"
                    size="md"
                    flex={1}
                    onClick={() => setCancelModalOpen(false)}
                  >
                    Keep Offer
                  </Button>
                  <Button
                    colorScheme="red"
                    size="md"
                    flex={1}
                    onClick={handleConfirmCancel}
                    leftIcon={<Icon as={FaTimes} />}
                  >
                    Cancel Offer
                  </Button>
                </HStack>
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Decline Confirmation Modal */}
        <Modal isOpen={declineModalOpen} onClose={() => setDeclineModalOpen(false)} size="md" isCentered>
          <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
          <ModalContent
            bg="white"
            borderRadius="xl"
            boxShadow="xl"
            mx={4}
          >
            <ModalCloseButton />
            <ModalBody p={6}>
              <VStack spacing={4} align="stretch">
                <VStack spacing={2} textAlign="center">
                  <Icon as={FaTimes} color="red.500" boxSize={6} />
                  <Text fontWeight="bold" fontSize="lg" color="gray.800">
                    Decline Offer
                  </Text>
                  <Text fontSize="sm" color="gray.600">
                    Are you sure you want to decline this offer?
                  </Text>
                  {tradeToDecline && (
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      Product: {getProductTitle(tradeToDecline.target_product_id, tradeToDecline.product_title)}
                    </Text>
                  )}
                </VStack>
                
                <VStack spacing={3} align="stretch">
                  <Text fontSize="sm" color="gray.600" fontWeight="medium">
                    Feedback (Optional)
                  </Text>
                  <Textarea
                    value={declineFeedback}
                    onChange={(e) => setDeclineFeedback(e.target.value)}
                    placeholder="Provide a reason for declining this offer (optional)..."
                    resize="none"
                    rows={3}
                    fontSize="sm"
                    _focus={{
                      borderColor: "red.300",
                      boxShadow: "0 0 0 1px rgba(245, 101, 101, 0.3)"
                    }}
                  />
                  <Text fontSize="xs" color="gray.500">
                    This feedback will be shared with the offer sender
                  </Text>
                </VStack>
                
                <HStack spacing={3} w="full">
                  <Button
                    variant="outline"
                    size="md"
                    flex={1}
                    onClick={() => setDeclineModalOpen(false)}
                  >
                    Keep Offer
                  </Button>
                  <Button
                    colorScheme="red"
                    size="md"
                    flex={1}
                    onClick={handleConfirmDecline}
                    leftIcon={<Icon as={FaTimes} />}
                  >
                    Decline Offer
                  </Button>
                </HStack>
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>
      </Box>
    </Box>
  )
}

export default Offers
