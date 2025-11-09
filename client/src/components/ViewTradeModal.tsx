import React, { useState, useEffect, useRef } from 'react'
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  VStack,
  HStack,
  Box,
  Text,
  Button,
  Badge,
  Avatar,
  Divider,
  useToast,
  Spinner,
  Textarea,
  Icon,
  Flex,
  SimpleGrid,
  Image,
  Card,
  CardBody,
  useColorModeValue,
  InputGroup,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Progress,
} from '@chakra-ui/react'
import { FaMapMarkerAlt, FaCheckCircle, FaClock, FaHandshake, FaPaperPlane, FaTruck } from 'react-icons/fa'
import { Trade, Product, TradeOption } from '../types'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { getFirstImage } from '../utils/imageUtils'

interface TradeMessage {
  id: number
  trade_id: number
  sender_id: number
  content: string
  created_at: string
  sender_name?: string
}

interface ViewTradeModalProps {
  trade: Trade | null
  isOpen: boolean
  onClose: () => void
  onStatusUpdate: () => void
}

interface MeetupLocation {
  name: string
  address: string
  type: 'cafe' | 'mall' | 'public' | 'other'
}

type TradeProgressStage = 'meetup_confirmed' | 'trade_in_progress' | 'completed'

const PROGRESS_STEPS = [
  { id: 'meetup_confirmed', label: 'Meetup Confirmed', icon: FaMapMarkerAlt, description: 'Location confirmed by both parties' },
  { id: 'trade_in_progress', label: 'Trade in Progress', icon: FaClock, description: 'Exchange is happening' },
  { id: 'completed', label: 'Trade Completed', icon: FaCheckCircle, description: 'Trade finished and rated' },
]

const ViewTradeModal: React.FC<ViewTradeModalProps> = ({
  trade,
  isOpen,
  onClose,
  onStatusUpdate,
}) => {
  const { user } = useAuth()
  const { getProduct } = useProducts()
  const toast = useToast()
  const [messages, setMessages] = useState<TradeMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [requestedProduct, setRequestedProduct] = useState<Product | null>(null)
  const [offeredProducts, setOfferedProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [confirmingMeetup, setConfirmingMeetup] = useState(false)
  const [buyerMeetupConfirmed, setBuyerMeetupConfirmed] = useState(false)
  const [sellerMeetupConfirmed, setSellerMeetupConfirmed] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const isUserBuyer = trade && user && trade.buyer_id === user.id
  const isUserSeller = trade && user && trade.seller_id === user.id
  const tradingPartner = isUserBuyer
    ? trade?.seller_name || `User #${trade?.seller_id}`
    : trade?.buyer_name || `User #${trade?.buyer_id}`

  // Suggested meetup locations (based on user locations)
  const suggestedLocations: MeetupLocation[] = [
    { name: 'SM Mall of Asia', address: 'Seaside Boulevard, Pasay', type: 'mall' },
    { name: 'Greenbelt Mall', address: 'Ayala Center, Makati', type: 'mall' },
    { name: 'Starbucks Coffee', address: 'Various locations', type: 'cafe' },
    { name: 'Robinsons Place', address: 'EDSA, Quezon City', type: 'mall' },
    { name: 'Public Park', address: 'Rizal Park, Manila', type: 'public' },
  ]

  // Fetch trade messages
  useEffect(() => {
    if (isOpen && trade) {
      fetchMessages()
      fetchProducts()
      fetchMeetupStatus()
      
      // Poll for new messages every 3 seconds
      const interval = setInterval(fetchMessages, 3000)
      return () => clearInterval(interval)
    } else {
      setMessages([])
      setNewMessage('')
    }
  }, [isOpen, trade])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchMessages = async () => {
    if (!trade) return
    
    try {
      setLoadingMessages(true)
      const response = await api.get(`/api/trades/${trade.id}/messages`)
      const data = response.data?.data || []
      setMessages(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    } finally {
      setLoadingMessages(false)
    }
  }

  const fetchProducts = async () => {
    if (!trade) return
    
    try {
      setLoadingProducts(true)
      const requested = await getProduct(trade.target_product_id)
      setRequestedProduct(requested)

      const offered: Product[] = []
      for (const item of trade.items || []) {
        const pid = item.product_id
        const product = await getProduct(pid)
        if (product) offered.push(product)
      }
      setOfferedProducts(offered)
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoadingProducts(false)
    }
  }

  const fetchMeetupStatus = async () => {
    if (!trade) return
    
    try {
      // Check if meetup is confirmed (this would come from backend)
      // For now, we'll check the trade status
      // In a real implementation, you'd have meetup_confirmed fields
      const response = await api.get(`/api/trades/${trade.id}`)
      const tradeData = response.data?.data
      
      // Check if both parties confirmed meetup (would need backend support)
      // For now, we'll use a placeholder
      setBuyerMeetupConfirmed(false)
      setSellerMeetupConfirmed(false)
    } catch (error) {
      console.error('Failed to fetch meetup status:', error)
    }
  }

  const sendMessage = async () => {
    if (!trade || !newMessage.trim() || sendingMessage) return

    try {
      setSendingMessage(true)
      await api.post(`/api/trades/${trade.id}/messages`, {
        content: newMessage.trim(),
      })
      setNewMessage('')
      await fetchMessages()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to send message',
        status: 'error',
      })
    } finally {
      setSendingMessage(false)
    }
  }

  const confirmMeetup = async () => {
    if (!trade || !selectedLocation || confirmingMeetup) return

    try {
      setConfirmingMeetup(true)
      // This would call a backend endpoint to confirm meetup
      // For now, we'll simulate it
      await api.put(`/api/trades/${trade.id}`, {
        action: 'confirm_meetup',
        meetup_location: selectedLocation,
      })
      
      if (isUserBuyer) {
        setBuyerMeetupConfirmed(true)
      } else {
        setSellerMeetupConfirmed(true)
      }

      toast({
        title: 'Meetup location confirmed',
        description: 'Waiting for the other party to confirm...',
        status: 'success',
      })

      await fetchMeetupStatus()
      onStatusUpdate()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to confirm meetup',
        status: 'error',
      })
    } finally {
      setConfirmingMeetup(false)
    }
  }

  const getTradeProgressStage = (): TradeProgressStage => {
    if (trade?.status === 'completed') return 'completed'
    
    // Only mark as trade_in_progress if BOTH parties confirmed meetup
    const bothConfirmed = trade?.meetup_confirmed || (trade?.buyer_meetup_confirmed && trade?.seller_meetup_confirmed)
    if (bothConfirmed) {
      return 'trade_in_progress'
    }
    
    // Default to meetup_confirmed (but this is just the stage name, not actual status)
    // The stepper will show this as inactive/pending until both confirm
    return 'meetup_confirmed'
  }

  const TradeProgressIndicator: React.FC = () => {
    const completedBg = useColorModeValue('green.500', 'green.600')
    const activeBg = useColorModeValue('brand.500', 'brand.600')
    const inactiveBg = useColorModeValue('gray.300', 'gray.600')
    const textColor = useColorModeValue('gray.800', 'gray.100')
    const descriptionColor = useColorModeValue('gray.600', 'gray.400')

    const currentStage = getTradeProgressStage()
    const currentStepIndex = PROGRESS_STEPS.findIndex(s => s.id === currentStage)

    // Fix: Only mark steps as 'active' if they are truly reached
    // Step 0 (Meetup Confirmed) should stay 'inactive' until both parties confirm
    const getStepStatus = (stepIndex: number): 'completed' | 'active' | 'inactive' => {
      // Step 0 is ONLY active when both parties have confirmed
      if (stepIndex === 0) {
        const bothConfirmed = trade?.meetup_confirmed || (trade?.buyer_meetup_confirmed && trade?.seller_meetup_confirmed)
        if (bothConfirmed) return 'active'
        return 'inactive'
      }
      
      // Other steps follow normal progression
      if (stepIndex < currentStepIndex) return 'completed'
      if (stepIndex === currentStepIndex) return 'active'
      return 'inactive'
    }

    const getStepBg = (status: 'completed' | 'active' | 'inactive') => {
      switch (status) {
        case 'completed': return completedBg
        case 'active': return activeBg
        case 'inactive': return inactiveBg
      }
    }

    return (
      <VStack spacing={3} w="full" align="stretch">
        {/* Steps - Horizontal Layout */}
        <HStack spacing={0} w="full" align="center" justify="space-between" position="relative">
          {PROGRESS_STEPS.map((step, index) => {
            const status = getStepStatus(index)
            const stepBg = getStepBg(status)

            return (
              <Box key={step.id} flex={1} display="flex" flexDirection="column" alignItems="center" position="relative" zIndex={index + 1}>
                {/* Step Circle */}
                <Box
                  w="36px"
                  h="36px"
                  borderRadius="full"
                  bg={stepBg}
                  color="white"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                  boxShadow={status === 'active' ? `0 0 0 3px ${useColorModeValue('brand.50', 'brand.950')}` : 'none'}
                  flexShrink={0}
                >
                  <Icon as={step.icon} boxSize="4" />
                </Box>

                {/* Step Label */}
                <Text
                  mt={3}
                  fontSize="xs"
                  fontWeight={status === 'active' ? 'semibold' : 'medium'}
                  color={status === 'completed' ? 'green.600' : status === 'active' ? 'brand.600' : descriptionColor}
                  textAlign="center"
                  maxW="70px"
                  transition="all 0.2s"
                  noOfLines={2}
                >
                  {step.label}
                </Text>
              </Box>
            )
          })}

          {/* Connecting Lines - Centered */}
          <Box position="absolute" top="50%" transform="translateY(-50%)" left="0" right="0" h="1.5px" display="flex" pointerEvents="none" zIndex={0}>
            {PROGRESS_STEPS.map((step, index) => {
              if (index === PROGRESS_STEPS.length - 1) return null
              
              const status = getStepStatus(index)
              const lineColor = status === 'completed' ? completedBg : useColorModeValue('gray.200', 'gray.700')

              return (
                <Box
                  key={`line-${index}`}
                  flex={1}
                  h="1.5px"
                  bg={lineColor}
                  transition="background-color 0.6s cubic-bezier(0.4, 0, 0.2, 1)"
                  mx={0}
                />
              )
            })}
          </Box>
        </HStack>

        {/* Current Stage Description */}
        <Text fontSize="sm" color={textColor} fontWeight="medium" textAlign="center" mt={1}>
          {PROGRESS_STEPS[currentStepIndex]?.description}
        </Text>
      </VStack>
    )
  }

  if (!trade) return null

  const bothConfirmedMeetup = buyerMeetupConfirmed && sellerMeetupConfirmed

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" isCentered>
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent
        bg={cardBg}
        borderRadius="xl"
        boxShadow="xl"
        maxH="90vh"
        display="flex"
        flexDirection="column"
      >
        <ModalHeader>
          <HStack spacing={3}>
            <Icon as={FaHandshake} color="brand.500" />
            <Text>Trade Details</Text>
            <Badge
              colorScheme={
                trade.status === 'accepted' || trade.status === 'active'
                  ? 'green'
                  : trade.status === 'completed'
                  ? 'blue'
                  : 'yellow'
              }
              variant="subtle"
            >
              {trade.status === 'accepted' || trade.status === 'active'
                ? 'In Progress'
                : trade.status === 'completed'
                ? 'Completed'
                : 'Pending Completion'}
            </Badge>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody overflowY="auto" flex={1} p={6}>
          <Tabs colorScheme="brand" defaultIndex={0}>
            <TabList>
              <Tab>Overview</Tab>
              <Tab>
                Chat
                {messages.length > 0 && (
                  <Badge ml={2} colorScheme="blue" borderRadius="full" fontSize="xs">
                    {messages.length}
                  </Badge>
                )}
              </Tab>
              <Tab>
                {trade?.trade_option === 'meetup' ? 'Meetup' : 'Delivery'}
              </Tab>
            </TabList>

            <TabPanels>
              {/* Overview Tab */}
              <TabPanel px={0}>
                <VStack spacing={6} align="stretch">
                  {/* Trade Option Display - Locked for Ongoing Trades */}
                  {trade?.trade_option && (
                    <Card 
                      variant="outline" 
                      borderWidth="2px" 
                      borderColor={trade.trade_option === 'meetup' ? 'blue.400' : 'green.400'}
                      bg={trade.trade_option === 'meetup' ? 'blue.50' : 'green.50'}
                    >
                      <CardBody p={4}>
                        <HStack spacing={3} align="center" justify="space-between">
                          <HStack spacing={3} align="center">
                            <Box
                              p={2}
                              borderRadius="full"
                              bg={trade.trade_option === 'meetup' ? 'blue.500' : 'green.500'}
                              color="white"
                            >
                              <Icon 
                                as={trade.trade_option === 'meetup' ? FaMapMarkerAlt : FaTruck} 
                                boxSize={5} 
                              />
                            </Box>
                            <VStack align="start" spacing={1}>
                              <Text fontWeight="bold" fontSize="md" color={trade.trade_option === 'meetup' ? 'blue.700' : 'green.700'}>
                                Trade Option: {trade.trade_option === 'meetup' ? 'Meetup' : 'Delivery'}
                              </Text>
                              {trade.trade_option === 'meetup' ? (
                                <Text fontSize="sm" color="gray.600">
                                  Exchange items at a meetup location
                                </Text>
                              ) : (
                                <VStack align="start" spacing={0}>
                                  <Text fontSize="sm" color="gray.600">
                                    Items will be delivered to addresses
                                  </Text>
                                  {trade.delivery_address && (
                                    <Text fontSize="xs" color="gray.600" mt={1} fontStyle="italic">
                                      Address: {trade.delivery_address}
                                    </Text>
                                  )}
                                </VStack>
                              )}
                            </VStack>
                          </HStack>
                          <Badge 
                            colorScheme={trade.trade_option === 'meetup' ? 'blue' : 'green'}
                            variant="solid"
                            fontSize="sm"
                            px={3}
                            py={1}
                          >
                            {trade.trade_option === 'meetup' ? '📍 Meetup' : '🚚 Delivery'}
                          </Badge>
                        </HStack>
                        {(trade.status === 'accepted' || trade.status === 'active') && (
                          <Box mt={3} pt={3} borderTopWidth="1px" borderColor="gray.200">
                            <Text fontSize="xs" color="gray.500" fontStyle="italic">
                              🔒 Trade option is locked - no further changes allowed
                            </Text>
                          </Box>
                        )}
                      </CardBody>
                    </Card>
                  )}

                  {/* Trade Progress Indicator */}
                  <TradeProgressIndicator />

                  <Divider />

                  {/* Products Overview */}
                  <Box>
                    <Text fontWeight="semibold" mb={4} fontSize="md">
                      Trade Items
                    </Text>
                    {loadingProducts ? (
                      <Spinner />
                    ) : (
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                        <Card variant="outline" borderColor="blue.300">
                          <CardBody>
                            <VStack spacing={3} align="stretch">
                              <HStack>
                                <Badge colorScheme="blue">Requested</Badge>
                                <Text fontSize="sm" color="gray.600">
                                  (Your Item)
                                </Text>
                              </HStack>
                              {requestedProduct ? (
                                <>
                                  <Image
                                    src={getFirstImage(requestedProduct.image_urls)}
                                    alt={requestedProduct.title}
                                    w="full"
                                    h="150px"
                                    objectFit="cover"
                                    borderRadius="md"
                                    fallbackSrc="https://via.placeholder.com/300x200?text=No+Image"
                                  />
                                  <Text fontWeight="semibold">{requestedProduct.title}</Text>
                                  <Text fontSize="sm" color="gray.600" noOfLines={2}>
                                    {requestedProduct.description}
                                  </Text>
                                </>
                              ) : (
                                <Text color="gray.500">Loading...</Text>
                              )}
                            </VStack>
                          </CardBody>
                        </Card>

                        <Card variant="outline" borderColor="green.300">
                          <CardBody>
                            <VStack spacing={3} align="stretch">
                              <HStack>
                                <Badge colorScheme="green">Offered</Badge>
                                <Text fontSize="sm" color="gray.600">
                                  ({tradingPartner}'s Item{offeredProducts.length > 1 ? 's' : ''})
                                </Text>
                              </HStack>
                              {offeredProducts.length > 0 ? (
                                <SimpleGrid columns={offeredProducts.length > 1 ? 2 : 1} spacing={2}>
                                  {offeredProducts.map((product) => (
                                    <Box key={product.id}>
                                      <Image
                                        src={getFirstImage(product.image_urls)}
                                        alt={product.title}
                                        w="full"
                                        h="150px"
                                        objectFit="cover"
                                        borderRadius="md"
                                        fallbackSrc="https://via.placeholder.com/300x200?text=No+Image"
                                      />
                                      <Text fontSize="sm" fontWeight="medium" mt={2} noOfLines={1}>
                                        {product.title}
                                      </Text>
                                    </Box>
                                  ))}
                                </SimpleGrid>
                              ) : (
                                <Text color="gray.500">Loading...</Text>
                              )}
                            </VStack>
                          </CardBody>
                        </Card>
                      </SimpleGrid>
                    )}
                  </Box>

                  {/* Trade Partner Info */}
                  <Box
                    p={4}
                    bg="gray.50"
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor={borderColor}
                  >
                    <HStack spacing={4}>
                      <Avatar
                        name={tradingPartner}
                        size="md"
                        bg={isUserBuyer ? 'green.500' : 'blue.500'}
                        color="white"
                      />
                      <Box flex={1}>
                        <Text fontWeight="semibold">{tradingPartner}</Text>
                        <Text fontSize="sm" color="gray.600">
                          Trading Partner
                        </Text>
                      </Box>
                      <Text fontSize="xs" color="gray.500">
                        Accepted {new Date(trade.created_at).toLocaleDateString()}
                      </Text>
                    </HStack>
                  </Box>
                </VStack>
              </TabPanel>

              {/* Chat Tab */}
              <TabPanel px={0}>
                <VStack spacing={4} align="stretch" h="500px" display="flex" flexDirection="column">
                  {/* Messages Area */}
                  <Box
                    flex={1}
                    overflowY="auto"
                    p={4}
                    bg="gray.50"
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor={borderColor}
                  >
                    {loadingMessages ? (
                      <Flex justify="center" align="center" h="full">
                        <Spinner />
                      </Flex>
                    ) : messages.length === 0 ? (
                      <Flex justify="center" align="center" h="full" direction="column">
                        <Icon as={FaPaperPlane} boxSize={8} color="gray.400" mb={2} />
                        <Text color="gray.500">No messages yet. Start the conversation!</Text>
                      </Flex>
                    ) : (
                      <VStack spacing={3} align="stretch">
                        {messages.map((msg) => {
                          const isOwnMessage = msg.sender_id === user?.id
                          return (
                            <HStack
                              key={msg.id}
                              justify={isOwnMessage ? 'flex-end' : 'flex-start'}
                              align="flex-start"
                              spacing={2}
                            >
                              {!isOwnMessage && (
                                <Avatar
                                  name={msg.sender_name || 'User'}
                                  size="sm"
                                  bg="brand.500"
                                  color="white"
                                />
                              )}
                              <Box
                                maxW="70%"
                                p={3}
                                borderRadius="lg"
                                bg={isOwnMessage ? 'brand.500' : 'white'}
                                color={isOwnMessage ? 'white' : 'gray.800'}
                                borderWidth={isOwnMessage ? 0 : '1px'}
                                borderColor={borderColor}
                              >
                                <Text fontSize="sm">{msg.content}</Text>
                                <Text
                                  fontSize="xs"
                                  color={isOwnMessage ? 'brand.100' : 'gray.500'}
                                  mt={1}
                                >
                                  {new Date(msg.created_at).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </Text>
                              </Box>
                              {isOwnMessage && (
                                <Avatar
                                  name={user?.name || 'You'}
                                  size="sm"
                                  bg="brand.500"
                                  color="white"
                                />
                              )}
                            </HStack>
                          )
                        })}
                        <div ref={messagesEndRef} />
                      </VStack>
                    )}
                  </Box>

                  {/* Message Input */}
                  <HStack spacing={2}>
                    <InputGroup>
                      <Textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your message..."
                        resize="none"
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            sendMessage()
                          }
                        }}
                      />
                    </InputGroup>
                    <Button
                      colorScheme="brand"
                      onClick={sendMessage}
                      isLoading={sendingMessage}
                      leftIcon={<FaPaperPlane />}
                      isDisabled={!newMessage.trim()}
                    >
                      Send
                    </Button>
                  </HStack>
                </VStack>
              </TabPanel>

              {/* Meetup/Delivery Tab */}
              <TabPanel px={0}>
                <VStack spacing={6} align="stretch">
                  {trade?.trade_option === 'delivery' ? (
                    /* Delivery Option View */
                    <VStack spacing={4} align="stretch">
                      <Card variant="outline" borderColor="green.300">
                        <CardBody p={6}>
                          <VStack spacing={4} align="stretch">
                            <HStack spacing={3} align="center">
                              <Icon as={FaTruck} boxSize={6} color="green.500" />
                              <Text fontWeight="bold" fontSize="lg" color="green.700">
                                Delivery Trade
                              </Text>
                            </HStack>
                            <Divider />
                            {trade.delivery_address && (
                              <Box p={4} bg="gray.50" borderRadius="md">
                                <Text fontSize="sm" fontWeight="semibold" mb={2} color="gray.700">
                                  Delivery Address
                                </Text>
                                <Text fontSize="sm" color="gray.600">
                                  {trade.delivery_address}
                                </Text>
                              </Box>
                            )}
                            {trade.delivery_estimated_time && (
                              <Box p={4} bg="blue.50" borderRadius="md">
                                <Text fontSize="sm" fontWeight="semibold" mb={2} color="blue.700">
                                  Estimated Delivery Time
                                </Text>
                                <Text fontSize="sm" color="blue.600">
                                  {trade.delivery_estimated_time}
                                </Text>
                              </Box>
                            )}
                            <Text fontSize="sm" color="gray.600">
                              Both parties should coordinate shipping and provide tracking information when available.
                            </Text>
                          </VStack>
                        </CardBody>
                      </Card>
                    </VStack>
                  ) : bothConfirmedMeetup ? (
                    /* Meetup Confirmed View */
                    <VStack spacing={4}>
                      <Box
                        p={6}
                        bg="green.50"
                        borderWidth="2px"
                        borderColor="green.200"
                        borderRadius="lg"
                        textAlign="center"
                        w="full"
                      >
                        <Icon as={FaCheckCircle} boxSize={8} color="green.500" mb={3} />
                        <Text fontWeight="bold" fontSize="lg" color="green.700" mb={2}>
                          Meetup Confirmed!
                        </Text>
                        <Text color="green.600" fontSize="sm">
                          Both parties have confirmed the meetup location. You can now proceed with the
                          trade.
                        </Text>
                        {selectedLocation && (
                          <Box mt={4} p={3} bg="white" borderRadius="md">
                            <HStack justify="center" spacing={2}>
                              <Icon as={FaMapMarkerAlt} color="green.500" />
                              <Text fontWeight="medium">{selectedLocation}</Text>
                            </HStack>
                          </Box>
                        )}
                      </Box>
                      <Text fontSize="sm" color="gray.600" textAlign="center">
                        Once you complete the trade, you can mark it as completed in the completion modal.
                      </Text>
                    </VStack>
                  ) : (
                    <VStack spacing={6} align="stretch">
                      {/* Status Text */}
                      <Box
                        p={3}
                        bg={useColorModeValue('blue.50', 'blue.900')}
                        borderLeft="4px"
                        borderColor="brand.500"
                        borderRadius="md"
                      >
                        <Text fontSize="sm" color={useColorModeValue('blue.700', 'blue.200')} fontWeight="medium">
                          Current Stage: Waiting for both parties to confirm location
                        </Text>
                      </Box>

                      {/* Meetup Location Selection */}
                      <Box>
                        <Text fontWeight="semibold" mb={1} fontSize="md">
                          Suggested Meetup Locations
                        </Text>
                        <Text fontSize="sm" color="gray.600" mb={4}>
                          Select a safe, public location. Both parties must confirm to proceed.
                        </Text>

                        {/* Locations Grid */}
                        <VStack spacing={3} align="stretch">
                          {suggestedLocations.map((location, index) => {
                            const isSelected = selectedLocation === location.name
                            const isNearest = index === 0
                            const textColor = useColorModeValue('gray.800', 'gray.100')

                            return (
                              <Card
                                key={location.name}
                                variant="outline"
                                cursor="pointer"
                                borderWidth={isSelected ? '2px' : '1px'}
                                borderColor={isSelected ? 'brand.500' : isNearest ? 'orange.300' : borderColor}
                                bg={isSelected ? 'brand.50' : isNearest ? useColorModeValue('orange.50', 'orange.950') : 'white'}
                                onClick={() => setSelectedLocation(location.name)}
                                transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                                _hover={{
                                  borderColor: isSelected ? 'brand.600' : 'brand.400',
                                  shadow: 'md',
                                  transform: 'translateY(-2px)',
                                }}
                              >
                                <CardBody>
                                  <HStack spacing={3} justify="space-between">
                                    {/* Location Icon & Info */}
                                    <HStack spacing={3} flex={1}>
                                      <Box
                                        p={2}
                                        bg={useColorModeValue('gray.100', 'gray.700')}
                                        borderRadius="md"
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="center"
                                        flexShrink={0}
                                      >
                                        <Icon
                                          as={FaMapMarkerAlt}
                                          color={isSelected ? 'brand.500' : isNearest ? 'orange.500' : 'gray.500'}
                                          boxSize={5}
                                        />
                                      </Box>

                                      <VStack align="start" spacing={1} flex={1}>
                                        <HStack spacing={2}>
                                          <Text fontWeight="semibold" fontSize="sm" color={textColor}>
                                            {location.name}
                                          </Text>
                                          {isNearest && (
                                            <Badge colorScheme="orange" fontSize="2xs" px={1.5} py={0.5}>
                                              Nearest
                                            </Badge>
                                          )}
                                        </HStack>
                                        <Text fontSize="xs" color="gray.600">
                                          {location.address}
                                        </Text>
                                        <Badge
                                          colorScheme={
                                            location.type === 'cafe'
                                              ? 'orange'
                                              : location.type === 'mall'
                                              ? 'blue'
                                              : 'green'
                                          }
                                          variant="subtle"
                                          fontSize="2xs"
                                          px={1.5}
                                          py={0.5}
                                          w="fit-content"
                                        >
                                          {location.type}
                                        </Badge>
                                      </VStack>
                                    </HStack>

                                    {/* Selection Indicator */}
                                    {isSelected && (
                                      <Box
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="center"
                                        flexShrink={0}
                                        animation="scaleIn 0.3s ease-out"
                                        sx={{
                                          '@keyframes scaleIn': {
                                            from: { transform: 'scale(0.5)', opacity: 0 },
                                            to: { transform: 'scale(1)', opacity: 1 },
                                          },
                                        }}
                                      >
                                        <Icon as={FaCheckCircle} color="brand.500" boxSize={6} />
                                      </Box>
                                    )}
                                  </HStack>
                                </CardBody>
                              </Card>
                            )
                          })}
                        </VStack>
                      </Box>

                      <Divider />

                      {/* Confirmation Status */}
                      <Box>
                        <Text fontWeight="semibold" mb={4} fontSize="md">
                          Confirmation Status
                        </Text>
                        <HStack spacing={6} justify="center" align="center">
                          <VStack spacing={2}>
                            <Avatar
                              name={trade.buyer_name || 'Buyer'}
                              size="md"
                              bg="blue.500"
                              color="white"
                            />
                            <VStack spacing={1}>
                              <Text fontSize="xs" fontWeight="semibold" color={useColorModeValue('gray.700', 'gray.200')}>
                                Buyer
                              </Text>
                              <Badge
                                colorScheme={buyerMeetupConfirmed ? 'green' : 'gray'}
                                variant="subtle"
                                fontSize="xs"
                                px={2}
                                py={1}
                              >
                                {buyerMeetupConfirmed ? '✓ Confirmed' : 'Pending'}
                              </Badge>
                            </VStack>
                          </VStack>

                          <Box h="12" w="0.5px" bg={borderColor} />

                          <VStack spacing={2}>
                            <Avatar
                              name={trade.seller_name || 'Seller'}
                              size="md"
                              bg="green.500"
                              color="white"
                            />
                            <VStack spacing={1}>
                              <Text fontSize="xs" fontWeight="semibold" color={useColorModeValue('gray.700', 'gray.200')}>
                                Seller
                              </Text>
                              <Badge
                                colorScheme={sellerMeetupConfirmed ? 'green' : 'gray'}
                                variant="subtle"
                                fontSize="xs"
                                px={2}
                                py={1}
                              >
                                {sellerMeetupConfirmed ? '✓ Confirmed' : 'Pending'}
                              </Badge>
                            </VStack>
                          </VStack>
                        </HStack>
                      </Box>

                      {/* Confirm Button */}
                      {selectedLocation && (
                        <Button
                          colorScheme="green"
                          size="lg"
                          onClick={confirmMeetup}
                          isLoading={confirmingMeetup}
                          leftIcon={<FaCheckCircle />}
                          isDisabled={
                            (isUserBuyer && buyerMeetupConfirmed) ||
                            (isUserSeller && sellerMeetupConfirmed)
                          }
                          w="full"
                          transition="all 0.2s"
                          _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
                        >
                          {isUserBuyer && buyerMeetupConfirmed
                            ? 'You Confirmed ✓'
                            : isUserSeller && sellerMeetupConfirmed
                            ? 'You Confirmed ✓'
                            : 'Confirm Meetup Location'}
                        </Button>
                      )}
                    </VStack>
                  )}
                </VStack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

export default ViewTradeModal

