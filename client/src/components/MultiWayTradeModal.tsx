import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Button,
  VStack,
  HStack,
  Box,
  Text,
  Badge,
  Image,
  Icon,
  useToast,
  Heading,
  Avatar,
  useColorModeValue,
  Stack,
  Progress,
  useDisclosure,
  Flex,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Spinner,
  Textarea,
  SimpleGrid,
} from '@chakra-ui/react'
import {
  FaArrowRight,
  FaCheck,
  FaTimes,
  FaClock,
  FaBox,
  FaMapMarkerAlt,
  FaChevronDown,
  FaTruck,
  FaHandshake,
  FaPaperPlane,
  FaSmile,
  FaExclamationTriangle,
} from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import { MultiWayTrade, MultiWayTradeParticipant } from '../types'
import { getProductUrl } from '../utils/productUtils'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import {
  acceptMultiWayTrade,
  declineMultiWayTrade,
  executeMultiWayTrade,
  cancelTradeLoop,
  reinviteTradeLoop,
  getChainLegs,
  updateLegHandoff,
  completeLeg,
} from '../services/tradeService'

// Helper to get user profile URL using slug if available, otherwise ID
const getUserProfileUrl = (userId: number, userSlug?: string): string => {
  return `/profile/${userSlug || userId}`
}

interface MultiWayTradeModalProps {
  isOpen: boolean
  onClose: () => void
  multiWayTrade: MultiWayTrade
  onTradeCompleted?: () => void
  canManage?: boolean
  currentUserId?: number
}

interface TradeMessage {
  id: number
  trade_id: number
  sender_id: number
  content: string
  created_at: string
  sender_name?: string
}

/** Format ms remaining as "Xh Ym" or "Expired" */
function formatTimeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${m}m remaining`
}

/** Human-readable label for raw DB status strings */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    user3_accepted: 'Accepted',
    active: 'Active',
    pending_user3: 'Awaiting 3rd Party',
    accepted: 'Accepted',
    declined: 'Declined',
    completed: 'Completed',
    cancelled: 'Cancelled',
    in_progress: 'In Progress',
    multiway_active: 'Active',
    pending_initiator_upgrade: 'Upgrade Required',
  }
  return map[status] || status.replace(/_/g, ' ')
}

function statusColorScheme(status: string): string {
  switch (status) {
    case 'pending':
      return 'yellow'
    case 'confirmed':
      return 'green'
    case 'pending_user3':
    case 'pending_initiator_upgrade':
      return 'yellow'
    case 'accepted':
    case 'user3_accepted':
      return 'green'
    case 'active':
    case 'multiway_active':
    case 'in_progress':
      return 'blue'
    case 'declined':
    case 'cancelled':
      return 'red'
    case 'completed':
      return 'cyan'
    default:
      return 'gray'
  }
}

const MultiWayTradeModal: React.FC<MultiWayTradeModalProps> = ({
  isOpen,
  onClose,
  multiWayTrade,
  onTradeCompleted,
  canManage = false,
  currentUserId,
}) => {
  const { user } = useAuth()
  const isActiveChain =
    multiWayTrade.status === 'confirmed'

  const [loading, setLoading] = useState(false)
  const [selectedAction, setSelectedAction] = useState<
    'accept' | 'decline' | 'execute' | 'cancel' | 'reinvite' | null
  >(null)
  const [activeTab, setActiveTab] = useState(0)
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [legs, setLegs] = useState<any[]>([])
  const [legForms, setLegForms] = useState<
    Record<number, { method: 'meetup' | 'delivery'; location: string; time: string }>
  >({})
  const [sharedForm, setSharedForm] = useState<{ method: 'meetup' | 'delivery'; location: string; time: string }>({ method: 'meetup', location: '', time: '' })
  const [savingLeg, setSavingLeg] = useState<number | null>(null)
  const [completingLeg, setCompletingLeg] = useState<number | null>(null)

  // Chat state
  const [messages, setMessages] = useState<TradeMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { isOpen: isLegsOpen, onToggle: onLegsToggle } = useDisclosure({
    defaultIsOpen: isActiveChain,
  })
  const navigate = useNavigate()
  const toast = useToast()

  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const sectionBg = useColorModeValue('gray.50', 'gray.750')
  const legCardBg = useColorModeValue('white', 'gray.800')

  // Countdown timer
  useEffect(() => {
    if (!multiWayTrade.expires_at) return
    const tick = () => setTimeLeft(formatTimeLeft(multiWayTrade.expires_at!))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [multiWayTrade.expires_at])

  // Fetch legs when chain is active
  useEffect(() => {
    if (!isOpen) return
    const chainId = multiWayTrade.loop_id
    if (!chainId || !['active', 'user3_accepted'].includes(multiWayTrade.status as string)) return
    getChainLegs(chainId)
      .then((data) => {
        const legList: any[] = data?.legs || []
        setLegs(legList)
        const forms: Record<
          number,
          { method: 'meetup' | 'delivery'; location: string; time: string }
        > = {}
        legList.forEach((leg: any) => {
          forms[leg.id] = {
            method: leg.handoff_method || 'meetup',
            location: leg.handoff_location || '',
            time: leg.handoff_time || '',
          }
        })
        setLegForms(forms)
        if (legList.length > 0) {
          setSharedForm({
            method: legList[0].handoff_method || 'meetup',
            location: legList[0].handoff_location || '',
            time: legList[0].handoff_time || '',
          })
        }
      })
      .catch(() => {})
  }, [isOpen, multiWayTrade.loop_id, multiWayTrade.status])

  // Fetch chat messages for loop
  useEffect(() => {
    if (!isOpen || !multiWayTrade.loop_id) return
    const fetchMessages = async () => {
      setLoadingMessages(true)
      try {
        const res = await api.get(`/api/trades/loops/${multiWayTrade.loop_id}/messages`)
        setMessages(Array.isArray(res.data?.data) ? res.data.data : [])
      } catch (error) {
        setMessages([])
      } finally {
        setLoadingMessages(false)
      }
    }
    fetchMessages()
  }, [isOpen, multiWayTrade.loop_id])

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sortedParticipants = useMemo(
    () =>
      [...multiWayTrade.participants].sort(
        (a, b) =>
          ((a as any).position_in_loop ?? (a as any).position ?? 0) -
          ((b as any).position_in_loop ?? (b as any).position ?? 0)
      ),
    [multiWayTrade.participants]
  )

  /** Map userId → userName for quick lookup in leg labels */
  const userNameMap = useMemo(() => {
    const map: Record<number, string> = {}
    sortedParticipants.forEach((p) => {
      map[p.user_id] = p.user_name
    })
    return map
  }, [sortedParticipants])

  const completedLegs = multiWayTrade.edges.filter((e) => e.status === 'completed').length
  const totalLegs = multiWayTrade.edges.length
  const healthPct = totalLegs > 0 ? Math.round((completedLegs / totalLegs) * 100) : 0

  // Show Execute button only when the overall trade is active AND every participant has accepted.
  const canExecute = multiWayTrade.status === 'active' && sortedParticipants.every(p => p.trade_status === 'accepted')

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleSaveSharedHandoff = async () => {
    if (legs.length === 0) return
    const legId = legs[0].id
    setSavingLeg(-1)
    try {
      await updateLegHandoff(legId, sharedForm.method, sharedForm.location, sharedForm.time)
      toast({ id: `shared-handoff-saved`, title: 'Shared Handoff saved', status: 'success', duration: 2000 })
      
      const data = await getChainLegs(multiWayTrade.loop_id)
      setLegs(data?.legs || [])
    } catch {
      toast({ id: `shared-handoff-err`, title: 'Failed to save', status: 'error', duration: 3000 })
    } finally {
      setSavingLeg(null)
    }
  }

  const handleSaveLegHandoff = async (legId: number) => {
    // kept for legacy API compatibility
    const form = legForms[legId]
    if (!form) return
    setSavingLeg(legId)
    try {
      await updateLegHandoff(legId, form.method, form.location, form.time)
    } finally {
      setSavingLeg(null)
    }
  }

  const handleCompleteLeg = async (legId: number) => {
    setCompletingLeg(legId)
    try {
      await completeLeg(legId)
      toast({
        id: `leg-${legId}-complete`,
        title: 'Confirmed!',
        description: 'Handoff marked as received.',
        status: 'success',
        duration: 3000,
      })
      const data = await getChainLegs(multiWayTrade.loop_id)
      setLegs(data?.legs || [])
      onTradeCompleted?.()
    } catch {
      toast({
        id: `leg-${legId}-complete-err`,
        title: 'Failed to confirm',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setCompletingLeg(null)
    }
  }

  const handleAccept = async () => {
    try {
      setLoading(true)
      setSelectedAction('accept')
      await acceptMultiWayTrade(multiWayTrade.loop_id)
      toast({ id: 'mwt-accept', title: 'Trade accepted!', status: 'success' })
      onTradeCompleted?.()
      onClose()
    } catch (error: any) {
      toast({
        id: 'mwt-accept-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to accept trade',
        status: 'error',
      })
    } finally {
      setLoading(false)
      setSelectedAction(null)
    }
  }

  const handleDecline = async () => {
    try {
      setLoading(true)
      setSelectedAction('decline')
      await declineMultiWayTrade(multiWayTrade.loop_id)
      toast({ id: 'mwt-decline', title: 'Trade declined', status: 'info' })
      onClose()
    } catch (error: any) {
      toast({
        id: 'mwt-decline-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to decline trade',
        status: 'error',
      })
    } finally {
      setLoading(false)
      setSelectedAction(null)
    }
  }

  const handleExecute = async () => {
    try {
      setLoading(true)
      setSelectedAction('execute')
      await executeMultiWayTrade(multiWayTrade.loop_id)
      toast({ id: 'mwt-execute', title: 'Trade executed!', status: 'success' })
      onTradeCompleted?.()
      onClose()
    } catch (error: any) {
      toast({
        id: 'mwt-execute-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to execute trade',
        status: 'error',
      })
    } finally {
      setLoading(false)
      setSelectedAction(null)
    }
  }

  const handleCancelLoop = async () => {
    try {
      setLoading(true)
      setSelectedAction('cancel')
      await cancelTradeLoop(multiWayTrade.loop_id)
      toast({ id: 'mwt-cancel', title: 'Loop cancelled', status: 'info' })
      onTradeCompleted?.()
      onClose()
    } catch (error: any) {
      toast({
        id: 'mwt-cancel-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to cancel loop',
        status: 'error',
      })
    } finally {
      setLoading(false)
      setSelectedAction(null)
    }
  }

  const handleReinviteLoop = async () => {
    try {
      setLoading(true)
      setSelectedAction('reinvite')
      await reinviteTradeLoop(multiWayTrade.loop_id)
      toast({ id: 'mwt-reinvite', title: 'Loop reinvited', status: 'success' })
      onTradeCompleted?.()
      onClose()
    } catch (error: any) {
      toast({
        id: 'mwt-reinvite-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to reinvite loop',
        status: 'error',
      })
    } finally {
      setLoading(false)
      setSelectedAction(null)
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !multiWayTrade.loop_id) return
    setSendingMessage(true)
    try {
      await api.post(`/api/trades/loops/${multiWayTrade.loop_id}/messages`, {
        content: newMessage.trim(),
      })
      setNewMessage('')
      // Refresh messages
      const res = await api.get(`/api/trades/loops/${multiWayTrade.loop_id}/messages`)
      setMessages(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch (error: any) {
      toast({
        id: 'mwt-msg-err',
        title: 'Failed to send message',
        description: error?.response?.data?.error || 'Please try again',
        status: 'error',
      })
    } finally {
      setSendingMessage(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={["sm", "md", "lg", "6xl"]} isCentered scrollBehavior="inside">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg={cardBg} minH="70vh" maxH="92vh" display="flex" flexDirection="column" w="full">
        <ModalHeader py={2}>
          <VStack align="start" spacing={2} w="full">
            {/* Title Row with Status Badge and Action Buttons */}
            <HStack justify="space-between" w="full" align="flex-start">
              <VStack align="start" spacing={0.5} flex={1}>
                <Heading size="md">{sortedParticipants.length}-Way Trade Loop</Heading>
                {timeLeft && (
                  <HStack spacing={2}>
                    <Icon
                      as={FaClock}
                      color={timeLeft === 'Expired' ? 'red.500' : 'orange.400'}
                      boxSize={4}
                    />
                    <Text fontSize="sm" color={timeLeft === 'Expired' ? 'red.500' : 'orange.600'}>
                      {timeLeft}
                    </Text>
                  </HStack>
                )}
              </VStack>

              {/* Top Right: Status Badge removed by request */}
            </HStack>

          </VStack>
          <ModalCloseButton mt={2} />
        </ModalHeader>

        <ModalBody py={0} px={0} flex={1} display="flex" flexDirection="column" overflow="hidden" minH={0}>
          <Tabs index={activeTab} onChange={setActiveTab} variant="soft-rounded" colorScheme="brand" display="flex" flexDirection="column" flex={1} overflow="hidden">
            <TabList px={4} pt={2} mb={0} borderBottomWidth="1px" borderColor={borderColor}>
              <Tab fontSize="sm" fontWeight="medium">Overview</Tab>
              <Tab fontSize="sm" fontWeight="medium">Chat</Tab>
            </TabList>

            <TabPanels flex={1} minH={0} overflow="hidden">
              {/* Overview Tab - Restructured Layout */}
              <TabPanel py={3} px={[2, 4]} overflowY="auto" minH={0} flex={1}>
                <VStack spacing={4} align="stretch">
                  {/* Overview Actions */}
                  <HStack spacing={2} justify="flex-end">
                    <Button
                      size="sm"
                      colorScheme="orange"
                      variant="outline"
                      leftIcon={<FaExclamationTriangle />}
                    >
                      Dispute
                    </Button>
                    <Button
                      size="sm"
                      colorScheme="red"
                      variant="outline"
                      leftIcon={<FaTimes />}
                    >
                      Cancel
                    </Button>
                  </HStack>
                  {/* CONFIRMATION PROGRESS */}
                  <Box>
                    <HStack justify="space-between" mb={3}>
                      <Text fontSize="sm" fontWeight="semibold" color={useColorModeValue('gray.700', 'gray.300')}>Confirmation progress</Text>
                      <Text fontSize="sm" fontWeight="bold" color="brand.500">{sortedParticipants.filter(p => ['accepted', 'user3_accepted', 'active', 'multiway_active'].includes(p.trade_status)).length}/{sortedParticipants.length}</Text>
                    </HStack>
                    {/* Step indicators with labels */}
                    {sortedParticipants.length === 2 ? (
                      <VStack spacing={0} align="stretch">
                        <HStack spacing={2} align="flex-end" justify="center">
                          {sortedParticipants.map((p, idx) => {
                            const isAccepted = ['accepted', 'user3_accepted', 'active', 'multiway_active'].includes(p.trade_status)
                            return (
                              <Box key={idx} display="flex" alignItems="center" gap={2}>
                                <Box
                                  w="24px"
                                  h="24px"
                                  borderRadius="full"
                                  bg={isAccepted ? 'green.500' : useColorModeValue('gray.300', 'gray.600')}
                                  display="flex"
                                  alignItems="center"
                                  justifyContent="center"
                                  color="white"
                                  fontSize="12px"
                                  fontWeight="bold"
                                >
                                  {isAccepted ? '✓' : idx + 1}
                                </Box>
                                {idx < sortedParticipants.length - 1 && (
                                  <Icon as={FaArrowRight} boxSize={3} color={useColorModeValue('gray.400', 'gray.500')} />
                                )}
                              </Box>
                            )
                          })}
                        </HStack>
                        <HStack spacing={2} align="flex-start" justify="center" mt={1}>
                          <Text fontSize="11px" color={useColorModeValue('gray.600', 'gray.400')} textAlign="center" minW="60px">Confirm items</Text>
                          <Box w={6} />
                          <Text fontSize="11px" color={useColorModeValue('gray.600', 'gray.400')} textAlign="center" minW="80px">Exchange meetup</Text>
                        </HStack>
                      </VStack>
                    ) : (
                      <HStack spacing={2} align="center" justify="center">
                        {sortedParticipants.map((p, idx) => {
                          const isAccepted = ['accepted', 'user3_accepted', 'active', 'multiway_active'].includes(p.trade_status)
                          return (
                            <Box key={idx} display="flex" alignItems="center" gap={2}>
                              <Box
                                w="24px"
                                h="24px"
                                borderRadius="full"
                                bg={isAccepted ? 'green.500' : useColorModeValue('gray.300', 'gray.600')}
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                color="white"
                                fontSize="12px"
                                fontWeight="bold"
                              >
                                {isAccepted ? '✓' : idx + 1}
                              </Box>
                              {idx < sortedParticipants.length - 1 && (
                                <Icon as={FaArrowRight} boxSize={3} color={useColorModeValue('gray.400', 'gray.500')} />
                              )}
                            </Box>
                          )
                        })}
                      </HStack>
                    )}
                  </Box>

                  {/* TRADE LOOP DIAGRAM - INTERACTIVE ROWS */}
                  <Box borderTopWidth="1px" borderBottomWidth="1px" borderColor={borderColor} py={4} px={2}>
                    <Heading size="xs" mb={3} textTransform="uppercase" fontSize="10px" color={useColorModeValue('gray.600', 'gray.400')} letterSpacing="1px">
                      Trade Exchange
                    </Heading>
                    
                    {sortedParticipants.length === 2 ? (
                      /* Two-way trade: two rows showing bidirectional exchange */
                      <VStack spacing={2} align="stretch">
                        {/* Row 1: Participant 0 gives to Participant 1 */}
                        <HStack spacing={3} justify="center" align="center">
                          {/* Sender Avatar */}
                          <Box display="flex" flexDirection="column" alignItems="center" gap={1} minW="fit-content">
                            <Avatar
                              name={sortedParticipants[0].user_name}
                              size="sm"
                              bg="brand.500"
                              cursor="pointer"
                              title={`View ${sortedParticipants[0].user_name}'s profile`}
                              aria-label={`View ${sortedParticipants[0].user_name}'s profile`}
                              onClick={() => navigate(getUserProfileUrl(sortedParticipants[0].user_id, sortedParticipants[0].user_slug))}
                              transition="all 0.2s"
                              _hover={{ ring: '2px', ringColor: 'brand.600', opacity: 0.85 }}
                            />
                            <Text fontSize="9px" fontWeight="semibold">{sortedParticipants[0].user_name.split(' ')[0]}</Text>
                          </Box>

                          {/* Arrow */}
                          <Icon as={FaArrowRight} boxSize={2.5} color={useColorModeValue('gray.400', 'gray.500')} />

                          {/* Item Pill - Clickable */}
                          <Box
                            display="flex"
                            alignItems="center"
                            gap={1.5}
                            px={2}
                            py={1}
                            borderRadius="full"
                            borderWidth="0.5px"
                            borderColor={useColorModeValue('purple.300', 'purple.500')}
                            bg={useColorModeValue('purple.50', 'purple.900')}
                            cursor="pointer"
                            transition="all 0.2s"
                            onClick={() => navigate(getProductUrl({ ...sortedParticipants[0], id: sortedParticipants[0].product_id }))}
                            title={`View ${sortedParticipants[0].product_title} listing`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                navigate(getProductUrl({ ...sortedParticipants[0], id: sortedParticipants[0].product_id }))
                              }
                            }}
                            _hover={{ bg: useColorModeValue('purple.100', 'purple.800'), borderColor: useColorModeValue('purple.400', 'purple.400') }}
                          >
                            {sortedParticipants[0].product_image && (
                              <Image
                                src={sortedParticipants[0].product_image}
                                alt={sortedParticipants[0].product_title}
                                h="20px"
                                w="20px"
                                borderRadius="sm"
                                objectFit="cover"
                              />
                            )}
                            <Text fontSize="11px" fontWeight="500" color={useColorModeValue('purple.700', 'purple.100')} whiteSpace="nowrap">
                              {sortedParticipants[0].product_title}
                            </Text>
                            <Icon as={FaChevronDown} boxSize={3} color={useColorModeValue('purple.600', 'purple.200')} transform="rotate(-90deg)" />
                          </Box>

                          {/* Arrow */}
                          <Icon as={FaArrowRight} boxSize={2.5} color={useColorModeValue('gray.400', 'gray.500')} />

                          {/* Recipient Avatar */}
                          <Box display="flex" flexDirection="column" alignItems="center" gap={1} minW="fit-content">
                            <Avatar
                              name={sortedParticipants[1].user_name}
                              size="sm"
                              bg="brand.500"
                              cursor="pointer"
                              title={`View ${sortedParticipants[1].user_name}'s profile`}
                              aria-label={`View ${sortedParticipants[1].user_name}'s profile`}
                              onClick={() => navigate(getUserProfileUrl(sortedParticipants[1].user_id, sortedParticipants[1].user_slug))}
                              transition="all 0.2s"
                              _hover={{ ring: '2px', ringColor: 'brand.600', opacity: 0.85 }}
                            />
                            <Text fontSize="9px" fontWeight="semibold">{sortedParticipants[1].user_name.split(' ')[0]}</Text>
                          </Box>
                        </HStack>

                        {/* Row 2: Participant 1 gives to Participant 0 */}
                        <HStack spacing={3} justify="center" align="center">
                          {/* Sender Avatar */}
                          <Box display="flex" flexDirection="column" alignItems="center" gap={1} minW="fit-content">
                            <Avatar
                              name={sortedParticipants[1].user_name}
                              size="sm"
                              bg="brand.500"
                              cursor="pointer"
                              title={`View ${sortedParticipants[1].user_name}'s profile`}
                              aria-label={`View ${sortedParticipants[1].user_name}'s profile`}
                              onClick={() => navigate(getUserProfileUrl(sortedParticipants[1].user_id, sortedParticipants[1].user_slug))}
                              transition="all 0.2s"
                              _hover={{ ring: '2px', ringColor: 'brand.600', opacity: 0.85 }}
                            />
                            <Text fontSize="9px" fontWeight="semibold">{sortedParticipants[1].user_name.split(' ')[0]}</Text>
                          </Box>

                          {/* Arrow */}
                          <Icon as={FaArrowRight} boxSize={2.5} color={useColorModeValue('gray.400', 'gray.500')} />

                          {/* Item Pill - Clickable */}
                          <Box
                            display="flex"
                            alignItems="center"
                            gap={1.5}
                            px={2}
                            py={1}
                            borderRadius="full"
                            borderWidth="0.5px"
                            borderColor={useColorModeValue('blue.300', 'blue.500')}
                            bg={useColorModeValue('blue.50', 'blue.900')}
                            cursor="pointer"
                            transition="all 0.2s"
                            onClick={() => navigate(getProductUrl({ ...sortedParticipants[1], id: sortedParticipants[1].product_id }))}
                            title={`View ${sortedParticipants[1].product_title} listing`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                navigate(getProductUrl({ ...sortedParticipants[1], id: sortedParticipants[1].product_id }))
                              }
                            }}
                            _hover={{ bg: useColorModeValue('blue.100', 'blue.800'), borderColor: useColorModeValue('blue.400', 'blue.400') }}
                          >
                            {sortedParticipants[1].product_image && (
                              <Image
                                src={sortedParticipants[1].product_image}
                                alt={sortedParticipants[1].product_title}
                                h="20px"
                                w="20px"
                                borderRadius="sm"
                                objectFit="cover"
                              />
                            )}
                            <Text fontSize="11px" fontWeight="500" color={useColorModeValue('blue.700', 'blue.100')} whiteSpace="nowrap">
                              {sortedParticipants[1].product_title}
                            </Text>
                            <Icon as={FaChevronDown} boxSize={3} color={useColorModeValue('blue.600', 'blue.200')} transform="rotate(-90deg)" />
                          </Box>

                          {/* Arrow */}
                          <Icon as={FaArrowRight} boxSize={2.5} color={useColorModeValue('gray.400', 'gray.500')} />

                          {/* Recipient Avatar */}
                          <Box display="flex" flexDirection="column" alignItems="center" gap={1} minW="fit-content">
                            <Avatar
                              name={sortedParticipants[0].user_name}
                              size="sm"
                              bg="brand.500"
                              cursor="pointer"
                              title={`View ${sortedParticipants[0].user_name}'s profile`}
                              aria-label={`View ${sortedParticipants[0].user_name}'s profile`}
                              onClick={() => navigate(getUserProfileUrl(sortedParticipants[0].user_id, sortedParticipants[0].user_slug))}
                              transition="all 0.2s"
                              _hover={{ ring: '2px', ringColor: 'brand.600', opacity: 0.85 }}
                            />
                            <Text fontSize="9px" fontWeight="semibold">{sortedParticipants[0].user_name.split(' ')[0]}</Text>
                          </Box>
                        </HStack>
                      </VStack>
                    ) : (
                      /* 3+ way trade: linear chain */
                      <Box overflowX="auto" pb={2}>
                        <HStack spacing={2} minW="min-content" justify="center" px={2}>
                          {sortedParticipants.map((participant, idx) => {
                            const isAccepted = ['accepted', 'user3_accepted', 'active', 'multiway_active'].includes(participant.trade_status)
                            return (
                              <Box key={idx} display="flex" alignItems="center" gap={2} flexShrink={0}>
                                {/* Participant Avatar */}
                                <Box display="flex" flexDirection="column" alignItems="center" gap={1}>
                                  <Box position="relative">
                                    <Avatar
                                      name={participant.user_name}
                                      size="sm"
                                      bg="brand.500"
                                      cursor="pointer"
                                      title={`View ${participant.user_name}'s profile`}
                                      aria-label={`View ${participant.user_name}'s profile`}
                                      onClick={() => navigate(getUserProfileUrl(participant.user_id, participant.user_slug))}
                                      transition="all 0.2s"
                                      _hover={{ ring: '2px', ringColor: 'brand.600', opacity: 0.85 }}
                                    />
                                    <Box position="absolute" bottom="-4px" right="-4px" borderRadius="full" bg={isAccepted ? 'green.500' : 'gray.400'} w="16px" h="16px" display="flex" alignItems="center" justifyContent="center" color="white" fontSize="9px" fontWeight="bold" shadow="md" borderWidth="1px" borderColor="white">
                                      {isAccepted ? '✓' : '●'}
                                    </Box>
                                  </Box>
                                  <Text fontSize="8px" fontWeight="semibold" textAlign="center">{participant.user_name.split(' ')[0]}</Text>
                                </Box>

                                {/* Arrow + Item Pill */}
                                {idx < sortedParticipants.length - 1 && (
                                  <HStack spacing={1} minW="120px">
                                    <Icon as={FaArrowRight} boxSize={2.5} color={useColorModeValue('gray.400', 'gray.500')} />
                                    <Box
                                      display="flex"
                                      alignItems="center"
                                      gap={1}
                                      px={1.5}
                                      py={0.5}
                                      borderRadius="full"
                                      borderWidth="0.5px"
                                      borderColor={useColorModeValue('gray.300', 'gray.600')}
                                      bg={useColorModeValue('gray.100', 'gray.800')}
                                      cursor="pointer"
                                      transition="all 0.2s"
                                      onClick={() => navigate(getProductUrl({ ...participant, id: participant.product_id }))}
                                      title={`View ${participant.product_title} listing`}
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          navigate(getProductUrl({ ...participant, id: participant.product_id }))
                                        }
                                      }}
                                      _hover={{ bg: useColorModeValue('gray.200', 'gray.700'), borderColor: useColorModeValue('gray.400', 'gray.500') }}
                                    >
                                      {participant.product_image && (
                                        <Image
                                          src={participant.product_image}
                                          alt={participant.product_title}
                                          h="16px"
                                          w="16px"
                                          borderRadius="sm"
                                          objectFit="cover"
                                        />
                                      )}
                                      <Text fontSize="10px" fontWeight="500" color={useColorModeValue('gray.700', 'gray.200')} noOfLines={1}>
                                        {participant.product_title}
                                      </Text>
                                      <Icon as={FaChevronDown} boxSize={2.5} color={useColorModeValue('gray.600', 'gray.400')} transform="rotate(-90deg)" />
                                    </Box>
                                  </HStack>
                                )}
                              </Box>
                            )
                          })}
                        </HStack>
                      </Box>
                    )}
                  </Box>

                  {/* INFO CARDS ROW - Only show if we have data */}
                  <SimpleGrid columns={3} spacing={2} w="full">
                    {/* Exchange Type */}
                    <Box borderWidth="1px" borderColor={borderColor} borderRadius="md" p={2.5} bg={useColorModeValue('gray.50', 'gray.800')}>
                      <Text fontSize="10px" fontWeight="semibold" textTransform="uppercase" color={useColorModeValue('gray.600', 'gray.400')} mb={1}>
                        Exchange type
                      </Text>
                      <Text fontSize="xs" fontWeight="semibold" color={useColorModeValue('gray.900', 'gray.100')}>
                        {sharedForm?.method === 'delivery' ? 'Delivery' : 'In-person meetup'}
                      </Text>
                    </Box>

                    {/* Items in Loop */}
                    <Box borderWidth="1px" borderColor={borderColor} borderRadius="md" p={2.5} bg={useColorModeValue('gray.50', 'gray.800')}>
                      <Text fontSize="10px" fontWeight="semibold" textTransform="uppercase" color={useColorModeValue('gray.600', 'gray.400')} mb={1}>
                        Items in loop
                      </Text>
                      <Text fontSize="xs" fontWeight="semibold" color={useColorModeValue('gray.900', 'gray.100')}>
                        {sortedParticipants.length} items
                      </Text>
                    </Box>

                    {/* Expires - Only show if we have a date */}
                    {multiWayTrade.expires_at && (
                      <Box borderWidth="1px" borderColor={borderColor} borderRadius="md" p={2.5} bg={useColorModeValue('gray.50', 'gray.800')}>
                        <Text fontSize="10px" fontWeight="semibold" textTransform="uppercase" color={useColorModeValue('gray.600', 'gray.400')} mb={1}>
                          Expires
                        </Text>
                        <Text fontSize="xs" fontWeight="semibold" color={useColorModeValue('gray.900', 'gray.100')}>
                          {new Date(multiWayTrade.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                      </Box>
                    )}
                  </SimpleGrid>

                  {/* PARTICIPANTS SECTION */}
                  <Box borderTopWidth="1px" borderColor={borderColor} pt={3}>
                    <Heading size="xs" mb={2} textTransform="uppercase" fontSize="10px" color={useColorModeValue('gray.600', 'gray.400')} letterSpacing="1px">
                      Participants
                    </Heading>
                    <VStack spacing={2} align="stretch">
                      {sortedParticipants.map((participant, idx) => {
                        const isAccepted = ['accepted', 'user3_accepted', 'active', 'multiway_active'].includes(participant.trade_status)
                        const isCurrentUser = participant.user_id === user?.id
                        
                        return (
                          <Box key={idx} p={3} borderWidth="1px" borderColor={borderColor} borderRadius="md" bg={useColorModeValue('white', 'gray.800')}>
                            <HStack justify="space-between" align="start">
                              <HStack spacing={2} flex={1}>
                                <Avatar name={participant.user_name} size="sm" cursor="pointer" onClick={() => navigate(getUserProfileUrl(participant.user_id, participant.user_slug))} />
                                <VStack spacing={0} align="start" flex={1} minW={0}>
                                  <Text fontSize="sm" fontWeight="semibold">{participant.user_name} {isCurrentUser && <Text as="span" fontSize="xs" color="gray.500">(you)</Text>}</Text>
                                  <Text fontSize="xs" color="gray.600" noOfLines={1}>Giving: {participant.product_title}</Text>
                                </VStack>
                              </HStack>
                              <VStack spacing={1} align="flex-end">
                                <Badge colorScheme={isAccepted ? 'green' : 'gray'} borderRadius="md" whiteSpace="nowrap">
                                  {isAccepted ? 'Confirmed' : 'Pending'}
                                </Badge>
                                {!isAccepted && canManage && !isCurrentUser && (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    fontSize="xs"
                                    isDisabled={loading}
                                    isLoading={selectedAction === 'reinvite' && loading}
                                    onClick={() => handleReinviteLoop()}
                                  >
                                    Reinvite
                                  </Button>
                                )}
                              </VStack>
                            </HStack>
                          </Box>
                        )
                      })}
                    </VStack>
                  </Box>

                  {/* Estimated Total Value */}
                  {multiWayTrade.total_value && (
                    <HStack justify="space-between" bg={useColorModeValue('green.50', 'green.900')} p={3} borderRadius="md" borderLeftWidth="4px" borderColor="green.500">
                      <Text fontWeight="semibold" fontSize="sm">Estimated Total Value</Text>
                      <Text fontSize="lg" fontWeight="bold" color="green.500">₱{multiWayTrade.total_value.toFixed(2)}</Text>
                    </HStack>
                  )}
                </VStack>
              </TabPanel>

        {/* Chat Tab */}
        <TabPanel px={[2, 4]} py={3} overflow="hidden" minH={0} flex={1}>
          <VStack spacing={2} align="stretch" h="full" display="flex" flexDirection="column" minH={0}>
            {/* Messages Area */}
            <Box
              flex={1}
              overflowY="auto"
              p={[2, 2.5]}
              bg={sectionBg}
              borderRadius="md"
              borderWidth="1px"
              borderColor={borderColor}
              minH={0}
              maxH={{ base: '54vh', md: '60vh' }}
            >
              {loadingMessages ? (
                <Flex justify="center" align="center" h="full">
                  <Spinner />
                </Flex>
              ) : messages.length === 0 ? (
                <Flex justify="center" align="center" h="full" direction="column">
                  <Icon as={FaPaperPlane} boxSize={8} color="gray.400" mb={2} />
                  <Text color="gray.500" fontSize="sm" textAlign="center">No messages yet. Start the conversation!</Text>
                </Flex>
              ) : (
                <VStack spacing={12} align="stretch">
                  {messages.map((msg) => {
                    const isOwnMessage = msg.sender_id === user?.id
                    return (
                      <HStack
                        key={`msg-${msg.id}`}
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
                          p={2.5}
                          borderRadius="lg"
                          bg={isOwnMessage ? 'brand.500' : 'white'}
                          color={isOwnMessage ? 'white' : 'gray.800'}
                          borderWidth={isOwnMessage ? 0 : '1px'}
                          borderColor={borderColor}
                          shadow="sm"
                        >
                          {!isOwnMessage && (
                            <Text fontSize="xs" fontWeight="bold" color={isOwnMessage ? 'white' : 'gray.700'} mb={1}>
                              {msg.sender_name}
                            </Text>
                          )}
                          <Text fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-word">
                            {msg.content}
                          </Text>
                          <Text
                            fontSize="2xs"
                            opacity={0.7}
                            mt={1}
                            textAlign={isOwnMessage ? 'right' : 'left'}
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
                            src={user?.profile_picture}
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
            <Box borderTopWidth="1px" borderColor={borderColor} pt={3}>
              <HStack spacing={2} align="flex-end">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder="Type a message... (Shift+Enter for new line)"
                  minH="60px"
                  maxH="120px"
                  resize="none"
                  isDisabled={sendingMessage}
                  fontSize="sm"
                  borderRadius="md"
                  flex={1}
                />
                <Button
                  colorScheme="brand"
                  onClick={handleSendMessage}
                  isLoading={sendingMessage}
                  isDisabled={!newMessage.trim()}
                  leftIcon={<FaPaperPlane />}
                  h="48px"
                  px={4}
                  flexShrink={0}
                  whiteSpace="nowrap"
                >
                  Send
                </Button>
              </HStack>
            </Box>
          </VStack>
        </TabPanel>

        </TabPanels>
      </Tabs>
    </ModalBody>

    <ModalFooter borderTopWidth="1px" borderColor={borderColor} pt={3} pb={3}>
      <VStack w="full" spacing={2} align="stretch">
        {/* Action Buttons */}
        <HStack w="full" spacing={2} justify="flex-end">
          {!isActiveChain ? (
            <>
              <Button
                flex={1}
                variant="ghost"
                isDisabled={loading}
                onClick={handleDecline}
                isLoading={selectedAction === 'decline' && loading}
                leftIcon={<FaTimes />}
                colorScheme="red"
              >
                Decline
              </Button>
              <Button
                flex={1}
                colorScheme="green"
                isDisabled={loading || multiWayTrade.status !== 'active'}
                isLoading={selectedAction === 'accept' && loading}
                onClick={handleAccept}
                leftIcon={<FaCheck />}
              >
                Accept Trade
              </Button>
            </>
          ) : (
            <>
              {canExecute && (
                <Button
                  flex={1}
                  colorScheme="brand"
                  isDisabled={loading}
                  isLoading={selectedAction === 'execute' && loading}
                  onClick={handleExecute}
                  leftIcon={<FaHandshake />}
                >
                  Execute Trade
                </Button>
              )}
            </>
          )}
        </HStack>
      </VStack>
    </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default MultiWayTradeModal
