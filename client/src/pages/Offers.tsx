import React, { useEffect, useMemo, useState, useRef } from 'react'
import { Box, Heading, VStack, HStack, Text, Badge, Button, Spinner, Center, useToast, Tabs, TabList, TabPanels, Tab, TabPanel, Select, Image, Link, useColorModeValue, Slide, ScaleFade, Icon } from '@chakra-ui/react'
import { FaHandshake } from 'react-icons/fa'
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
  const [activeTab, setActiveTab] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<number | undefined>()
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
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to load offers', status: 'error' })
    } finally {
      setLoading(false)
    }
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
        alt={alt ?? `#${pid}`}
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

  const badgeColor = (status: Trade['status']) => status === 'pending' ? 'yellow' : status === 'accepted' ? 'green' : status === 'declined' ? 'red' : 'purple'

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
              <ProductThumb pid={Number(pid)} src={pimg} alt={ptitle || `#${pid}`} />
              <VStack spacing={0} align="start">
                <Link href={`/products/${pid}`} color="brand.600" fontSize="sm">{ptitle || `#${pid}`}</Link>
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
            <Heading size="md" color="gray.700" fontWeight="semibold">
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
                    borderColor="gray.100"
                    rounded="lg"
                    p={5}
                    position="relative"
                    boxShadow="sm"
                    _hover={{
                      boxShadow: "md",
                      transform: "translateY(-1px)",
                      borderColor: "gray.200"
                    }}
                    transition="all 0.2s ease"
                  >
                  {/* Top-right: status */}
                  <Box position="absolute" top={4} right={4}>
                    <Badge colorScheme={badgeColor(t.status)}>{t.status}</Badge>
                  </Box>

                  {/* Left: details with extra right padding so content doesn't collide with absolute actions */}
                  <Box pr="220px">
                    <VStack align="start" spacing={1}>
                      <Text fontWeight="semibold">{t.product_title || `Product #${t.target_product_id}`}</Text>
                      <Text fontSize="sm" color="gray.600">From: {t.buyer_name || `User #${t.buyer_id}`}</Text>
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
                          onClick={() => updateTrade(t.id, { action: 'decline' })} 
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
                        <Text fontWeight="semibold" color="gray.800">{t.product_title || `Product #${t.target_product_id}`}</Text>
                        <Text fontSize="sm" color="gray.600">To: {t.seller_name || `User #${t.seller_id}`}</Text>
                        <Text fontSize="xs" color="gray.500">{new Date(t.created_at).toLocaleString()}</Text>
                        {renderOfferedItems(t)}
                      </VStack>
                      <Badge colorScheme={badgeColor(t.status)} variant="subtle">{t.status}</Badge>
                    </HStack>
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
                    borderColor="gray.100" 
                    rounded="lg" 
                    p={5} 
                    position="relative"
                    boxShadow="sm"
                    _hover={{
                      boxShadow: "md",
                      transform: "translateY(-1px)",
                      borderColor: "gray.200"
                    }}
                    transition="all 0.2s ease"
                  >
                    {/* Top-right: status */}
                    <Box position="absolute" top={4} right={4}>
                      <Badge colorScheme={badgeColor(t.status)} variant="subtle">{t.status}</Badge>
                    </Box>

                    {/* Left: details */}
                    <Box pr="200px">
                      <VStack align="start" spacing={2}>
                        <Text fontWeight="semibold" color="gray.800">{t.product_title || `Product #${t.target_product_id}`}</Text>
                        <Text fontSize="sm" color="gray.600">Buyer: {t.buyer_name || `#${t.buyer_id}`} • Seller: {t.seller_name || `#${t.seller_id}`}</Text>
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
                        <Text fontWeight="semibold" color="gray.800">{t.product_title || `Product #${t.target_product_id}`}</Text>
                        <Text fontSize="sm" color="gray.600">Buyer: {t.buyer_name || `#${t.buyer_id}`} • Seller: {t.seller_name || `#${t.seller_id}`}</Text>
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
      </Box>
    </Box>
  )
}

export default Offers
