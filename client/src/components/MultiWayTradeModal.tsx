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
  InputGroup,
  InputRightElement,
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

  // Fetch chat messages - use first participant's trade_id
  useEffect(() => {
    if (!isOpen || !multiWayTrade.participants || multiWayTrade.participants.length === 0) return
    const fetchMessages = async () => {
      setLoadingMessages(true)
      try {
        const firstParticipant = multiWayTrade.participants[0]
        if (firstParticipant && firstParticipant.trade_id) {
          const res = await api.get(`/api/trades/${firstParticipant.trade_id}/messages`)
          setMessages(Array.isArray(res.data?.data) ? res.data.data : [])
        }
      } catch (error) {
        setMessages([])
      } finally {
        setLoadingMessages(false)
      }
    }
    fetchMessages()
  }, [isOpen, multiWayTrade.participants])

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
    if (!newMessage.trim() || !multiWayTrade.participants || multiWayTrade.participants.length === 0) return
    setSendingMessage(true)
    try {
      const firstParticipant = multiWayTrade.participants[0]
      if (firstParticipant && firstParticipant.trade_id) {
        await api.post(`/api/trades/${firstParticipant.trade_id}/messages`, {
          content: newMessage.trim(),
        })
        setNewMessage('')
        // Refresh messages
        const res = await api.get(`/api/trades/${firstParticipant.trade_id}/messages`)
        setMessages(Array.isArray(res.data?.data) ? res.data.data : [])
      }
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
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" isCentered scrollBehavior="inside">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg={cardBg} maxH="95vh" overflowY="auto">
        <ModalHeader borderBottomWidth="1px" borderColor={borderColor} py={4}>
          <VStack align="start" spacing={3} w="full">
            {/* Title Row with Status Badge and Action Buttons */}
            <HStack justify="space-between" w="full" align="flex-start">
              <VStack align="start" spacing={1} flex={1}>
                <Heading size="lg">{sortedParticipants.length}-Way Trade Loop</Heading>
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

              {/* Top Right: Status Badge + Action Buttons */}
              <HStack spacing={3} align="flex-start">
                <Badge colorScheme={statusColorScheme(multiWayTrade.status)} px={3} py={1.5} borderRadius="md" fontSize="sm" fontWeight="semibold">
                  {statusLabel(multiWayTrade.status).toUpperCase()}
                </Badge>
                <HStack spacing={2}>
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
              </HStack>
            </HStack>

            {/* Progress for handoffs (if applicable) */}
            {isActiveChain && totalLegs > 0 && (
              <Box pt={2} w="full" bg={useColorModeValue('blue.50', 'blue.900')} p={3} borderRadius="md" borderLeftWidth="4px" borderColor="blue.500">
                <HStack justify="space-between" mb={2}>
                  <Text fontSize="sm" fontWeight="semibold" color={useColorModeValue('blue.900', 'blue.100')}>Handoffs Confirmed</Text>
                  <Text fontSize="sm" fontWeight="bold" color={healthPct === 100 ? 'green.500' : 'blue.500'}>{healthPct}%</Text>
                </HStack>
                <HStack justify="space-between" mb={2}>
                  <Text fontSize="xs" color={useColorModeValue('blue.800', 'blue.200')}>{completedLegs} of {totalLegs} items received</Text>
                </HStack>
                <Progress value={healthPct} size="sm" colorScheme={healthPct === 100 ? 'green' : 'blue'} borderRadius="full" />
              </Box>
            )}
          </VStack>
          <ModalCloseButton mt={2} />
        </ModalHeader>

        <ModalBody py={0}>
          <Tabs index={activeTab} onChange={setActiveTab} variant="soft-rounded" colorScheme="brand">
            <TabList px={6} pt={4} mb={0} borderBottomWidth="1px" borderColor={borderColor}>
              <Tab fontSize="sm" fontWeight="medium">Overview</Tab>
              <Tab fontSize="sm" fontWeight="medium">Chat</Tab>
              <Tab fontSize="sm" fontWeight="medium">Multi-Way</Tab>
            </TabList>

            <TabPanels>
              {/* Overview Tab */}
              <TabPanel py={6}>
                <VStack spacing={6} align="stretch">
                  {/* Trade Option Details Box - Similar to Meetup Modal */}
                  <Box bg={useColorModeValue('brand.50', 'brand.900')} borderLeftWidth="4px" borderColor="brand.500" p={4} borderRadius="md">
                    <HStack justify="space-between" mb={3}>
                      <HStack spacing={2}>
                        <Icon as={FaHandshake} boxSize={5} color="brand.500" />
                        <Heading size="sm" color={useColorModeValue('brand.900', 'brand.100')}>Trade Option: Multi-Way Exchange</Heading>
                      </HStack>
                      <Badge colorScheme={statusColorScheme(multiWayTrade.status)} borderRadius="md" fontSize="sm">
                        {statusLabel(multiWayTrade.status)}
                      </Badge>
                    </HStack>
                    <Text fontSize="sm" color={useColorModeValue('brand.800', 'brand.200')} mb={3}>
                      Exchange items at a mutually agreed location between all {sortedParticipants.length} participants
                    </Text>
                    {legs.length > 0 && sharedForm && (
                      <VStack spacing={2} align="start" fontSize="sm" color={useColorModeValue('brand.700', 'brand.300')}>
                        <HStack spacing={2}>
                          <Icon as={sharedForm.method === 'delivery' ? FaTruck : FaHandshake} boxSize={4} color="brand.500" />
                          <Text fontWeight="medium">{sharedForm.method === 'delivery' ? 'Delivery / Shipping' : 'In-Person Meetup'}</Text>
                        </HStack>
                        {sharedForm.location && (
                          <HStack spacing={2} ml={6}>
                            <Icon as={FaMapMarkerAlt} boxSize={3} color="brand.500" />
                            <Text>{sharedForm.location}</Text>
                          </HStack>
                        )}
                        {sharedForm.time && (
                          <HStack spacing={2} ml={6}>
                            <Icon as={FaClock} boxSize={3} color="brand.500" />
                            <Text>{sharedForm.time}</Text>
                          </HStack>
                        )}
                      </VStack>
                    )}
                  </Box>
                  {/* Visual Chain Flow - Simplified */}
                  <Box w="full">
                    {sortedParticipants.length <= 3 ? (
                      /* Circular layout for small loops */
                      <Box w="full" minH="280px" position="relative" display="flex" alignItems="center" justifyContent="center" px={4}>
                        <Box position="absolute" w="full" h="280px">
                          <svg width="100%" height="100%" viewBox="0 0 400 280" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute' }}>
                            {sortedParticipants.map((_, idx) => {
                              const nextIdx = (idx + 1) % sortedParticipants.length
                              const angles = sortedParticipants.length === 3 ? [90, 210, 330] : Array.from({ length: sortedParticipants.length }, (_, i) => (i * 360) / sortedParticipants.length + 90)
                              const angle1 = (angles[idx] * Math.PI) / 180
                              const angle2 = (angles[nextIdx] * Math.PI) / 180
                              const radius = 90
                              const x1 = 200 + radius * Math.cos(angle1)
                              const y1 = 140 + radius * Math.sin(angle1)
                              const x2 = 200 + radius * Math.cos(angle2)
                              const y2 = 140 + radius * Math.sin(angle2)
                              return <line key={`arrow-${idx}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#cbd5e0" strokeWidth="2" markerEnd="url(#arrowhead)" />
                            })}
                            <defs>
                              <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                                <polygon points="0 0, 10 3, 0 6" fill="#cbd5e0" />
                              </marker>
                            </defs>
                          </svg>
                        </Box>

                        <Flex position="relative" w="full" h="280px" alignItems="center" justifyContent="center">
                          {sortedParticipants.map((participant, idx) => {
                            const angles = sortedParticipants.length === 3 ? [90, 210, 330] : Array.from({ length: sortedParticipants.length }, (_, i) => (i * 360) / sortedParticipants.length + 90)
                            const angle = (angles[idx] * Math.PI) / 180
                            const radius = 90
                            const x = radius * Math.cos(angle)
                            const y = radius * Math.sin(angle)
                            const isAccepted = ['accepted', 'user3_accepted', 'active', 'multiway_active'].includes(participant.trade_status)

                            return (
                              <Box key={idx} position="absolute" left="50%" top="50%" transform={`translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`} display="flex" flexDirection="column" alignItems="center" gap={2} w="100px">
                                <Box position="relative" borderRadius="full" borderWidth="3px" borderColor={isAccepted ? 'green.400' : 'gray.300'} bg={cardBg} p={1.5} w="90px" h="90px" display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap={1} shadow="md">
                                  <Box position="absolute" top="-10px" right="-10px" borderRadius="full" bg={isAccepted ? 'green.500' : 'gray.400'} w="28px" h="28px" display="flex" alignItems="center" justifyContent="center" color="white" fontSize="16px" fontWeight="bold" shadow="md" borderWidth="2px" borderColor={cardBg}>{isAccepted ? '✓' : '●'}</Box>

                                  <Avatar name={participant.user_name} size="md" bg="brand.500" cursor="pointer" onClick={() => navigate(getUserProfileUrl(participant.user_id, participant.user_slug))} />

                                  <Text fontSize="10px" fontWeight="semibold" textAlign="center" noOfLines={1}>{participant.user_name}</Text>
                                </Box>

                                <Text fontSize="8px" fontWeight="bold" color="gray.600" textAlign="center">Gives:</Text>
                                {participant.product_image && (
                                  <Image src={participant.product_image} alt={participant.product_title} maxH="50px" maxW="full" objectFit="cover" borderRadius="sm" />
                                )}
                              </Box>
                            )
                          })}
                        </Flex>
                      </Box>
                    ) : (
                      /* Linear flow for longer chains */
                      <Box overflowX="auto" pb={3}>
                        <HStack spacing={4} minW="min-content" px={2}>
                          {sortedParticipants.map((participant, idx) => {
                            const isAccepted = ['accepted', 'user3_accepted', 'active', 'multiway_active'].includes(participant.trade_status)

                            return (
                              <Box key={idx} display="flex" alignItems="flex-start" gap={2} flexShrink={0}>
                                <VStack spacing={1.5}>
                                  <Box position="relative" borderRadius="lg" borderWidth="3px" borderColor={isAccepted ? 'green.400' : 'gray.300'} bg={cardBg} p={1.5} w="85px" display="flex" flexDirection="column" alignItems="center" gap={1}>
                                    <Box position="absolute" top="-10px" right="-10px" borderRadius="full" bg={isAccepted ? 'green.500' : 'gray.400'} w="24px" h="24px" display="flex" alignItems="center" justifyContent="center" color="white" fontSize="12px" fontWeight="bold" shadow="md" borderWidth="2px" borderColor={cardBg}>{isAccepted ? '✓' : '●'}</Box>

                                    <Avatar name={participant.user_name} size="sm" bg="brand.500" cursor="pointer" onClick={() => navigate(getUserProfileUrl(participant.user_id, participant.user_slug))} />

                                    <Text fontSize="9px" fontWeight="semibold" textAlign="center" noOfLines={2}>{participant.user_name}</Text>
                                  </Box>

                                  <Text fontSize="8px" fontWeight="bold" color="gray.600">Gives:</Text>

                                  {participant.product_image && (
                                    <Image src={participant.product_image} alt={participant.product_title} maxH="40px" maxW="full" objectFit="cover" borderRadius="sm" />
                                  )}
                                </VStack>

                                {idx < sortedParticipants.length - 1 && <Icon as={FaArrowRight} boxSize={4} color="orange.400" mt={1} />}

                                {idx === sortedParticipants.length - 1 && (
                                  <Box ml={1} mt={-2}><Icon as={FaArrowRight} boxSize={4} color="orange.400" transform="rotate(45deg)" /></Box>
                                )}
                              </Box>
                            )
                          })}
                        </HStack>
                      </Box>
                    )}
                  </Box>

                  {/* Status Info Box */}
                  <Box bg={useColorModeValue('blue.50', 'blue.900')} borderLeftWidth="4px" borderColor="blue.500" p={3} borderRadius="md">
                    <HStack justify="space-between" mb={2}>
                      <Text fontSize="sm" fontWeight="semibold" color="blue.900">
                        {sortedParticipants.length}-Way Trade Loop
                      </Text>
                      <Badge colorScheme={statusColorScheme(multiWayTrade.status)} borderRadius="full">
                        {statusLabel(multiWayTrade.status)}
                      </Badge>
                    </HStack>
                    <Text fontSize="xs" color="blue.800">
                      <strong>✓ = Accepted</strong> • <strong>● = Pending</strong>
                    </Text>
                  </Box>

                  {/* Handoff Progress */}
                  {isActiveChain && totalLegs > 0 && (
                    <Box borderWidth="1px" borderColor={borderColor} borderRadius="lg" p={3} bg={legCardBg}>
                      <HStack justify="space-between" mb={2}>
                        <Text fontSize="sm" fontWeight="semibold" color="gray.700">Handoffs Confirmed</Text>
                        <Text fontSize="sm" fontWeight="bold" color={healthPct === 100 ? 'green.500' : 'blue.500'}>{healthPct}%</Text>
                      </HStack>
                      <HStack justify="space-between" mb={2}>
                        <Text fontSize="xs" color="gray.600">{completedLegs} of {totalLegs} items received</Text>
                      </HStack>
                      <Progress value={healthPct} size="sm" colorScheme={healthPct === 100 ? 'green' : 'blue'} borderRadius="full" />
                    </Box>
                  )}

                  {/* Shared Coordination Section */}
                  {legs.length > 0 && (
                    <Box borderWidth="1px" borderColor={borderColor} borderRadius="lg" overflow="hidden" bg={legCardBg}>
                      <Box px={4} py={3} bg={useColorModeValue('purple.50', 'purple.900')} borderBottomWidth="1px" borderColor={borderColor}>
                        <HStack justify="space-between">
                          <Text fontSize="sm" fontWeight="semibold" color="purple.700">Shared Coordination</Text>
                          <Badge colorScheme="purple" fontSize="xs">{legs.length} items</Badge>
                        </HStack>
                      </Box>
                      <Box px={4} py={3}>
                        <VStack spacing={3} align="stretch">
                          <Box bg={useColorModeValue('purple.50', 'purple.900')} p={2} borderRadius="md" borderLeftWidth="3px" borderColor="purple.400">
                            <Text fontSize="xs" color={useColorModeValue('purple.700', 'purple.200')}>All participants will meet at the same location and time to execute the multi-way trade.</Text>
                          </Box>

                          {sharedForm.method && (
                            <VStack spacing={2} align="stretch" fontSize="xs" color="gray.600">
                              <HStack>
                                <Icon as={sharedForm.method === 'delivery' ? FaTruck : FaHandshake} boxSize={3} color="purple.500" />
                                <Text fontWeight="medium">{sharedForm.method === 'delivery' ? 'Delivery / Shipping' : 'Meetup In Person'}</Text>
                              </HStack>
                              {sharedForm.location && (
                                <HStack>
                                  <Icon as={FaMapMarkerAlt} boxSize={3} color="purple.500" />
                                  <Text>{sharedForm.location}</Text>
                                </HStack>
                              )}
                              {sharedForm.time && (
                                <HStack>
                                  <Icon as={FaClock} boxSize={3} color="purple.500" />
                                  <Text>{sharedForm.time}</Text>
                                </HStack>
                              )}
                            </VStack>
                          )}
                        </VStack>
                      </Box>
                    </Box>
                  )}

                  {/* Estimated Value */}
                  {multiWayTrade.total_value && (
                    <HStack justify="space-between" bg={sectionBg} p={3} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
                      <Text fontWeight="semibold" fontSize="sm">Estimated Total Value</Text>
                      <Text fontSize="lg" fontWeight="bold" color="green.500">₱{multiWayTrade.total_value.toFixed(2)}</Text>
                    </HStack>
                  )}
                </VStack>
              </TabPanel>

        {/* Chat Tab */}
        <TabPanel px={[0, 2]} py={6}>
          <VStack spacing={3} align="stretch" h={["350px", "450px"]} display="flex" flexDirection="column">
            {/* Messages Area */}
            <Box
              flex={1}
              overflowY="auto"
              p={[2, 3]}
              bg={sectionBg}
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
                  <Text color="gray.500" fontSize="sm" textAlign="center">No messages yet. Start the conversation!</Text>
                </Flex>
              ) : (
                <VStack spacing={3} align="stretch">
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
                          p={3}
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
                          <Text fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-word">
                            {msg.content}
                          </Text>
                          <Text
                            fontSize="xs"
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
              <InputGroup size="sm">
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
                />
                <InputRightElement h="60px" pr={2}>
                  <Button
                    colorScheme="brand"
                    size="sm"
                    onClick={handleSendMessage}
                    isLoading={sendingMessage}
                    isDisabled={!newMessage.trim()}
                    leftIcon={<FaPaperPlane />}
                  >
                    Send
                  </Button>
                </InputRightElement>
              </InputGroup>
            </Box>
          </VStack>
        </TabPanel>

        {/* Multi-Way Tab */}
        <TabPanel py={6}>
          <VStack spacing={6} align="stretch">
            <Box bg={useColorModeValue('purple.50', 'purple.900')} borderLeftWidth="4px" borderColor="purple.500" p={4} borderRadius="md">
              <Text fontSize="sm" color={useColorModeValue('purple.900', 'purple.100')}>
                <strong>Multi-Way Details:</strong> Track all participants, items, and chain coordination for this trade loop.
              </Text>
            </Box>

            <Box>
              <Heading size="sm" mb={3} color="purple.600">Loop Chain Details</Heading>
              <VStack spacing={3} align="stretch">
                {sortedParticipants.map((participant, idx) => (
                  <Box key={idx} p={3} borderWidth="1px" borderColor={borderColor} borderRadius="md" bg={legCardBg}>
                    <HStack justify="space-between" mb={2}>
                      <HStack>
                        <Avatar name={participant.user_name} size="sm" />
                        <VStack spacing={0} align="start">
                          <Text fontSize="sm" fontWeight="semibold">{participant.user_name}</Text>
                          <Text fontSize="xs" color="gray.500">
                            {participant.product_title}
                          </Text>
                        </VStack>
                      </HStack>
                      <Badge colorScheme={statusColorScheme(participant.trade_status)} borderRadius="full">
                        {statusLabel(participant.trade_status)}
                      </Badge>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            </Box>

            {multiWayTrade.total_value && (
              <HStack justify="space-between" bg={sectionBg} p={3} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <Text fontWeight="semibold" fontSize="sm">Estimated Total Value</Text>
              <Text fontSize="lg" fontWeight="bold" color="green.500">₱{multiWayTrade.total_value.toFixed(2)}</Text>
            </HStack>
            )}
          </VStack>
        </TabPanel>
        </TabPanels>
      </Tabs>
    </ModalBody>

    <ModalFooter borderTopWidth="1px" borderColor={borderColor} pt={6} pb={4}>
      <VStack w="full" spacing={3} align="stretch">
        {/* Info Message for Active Chain */}
        {isActiveChain && (
          <Box bg={useColorModeValue('green.50', 'green.900')} borderWidth="1px" borderColor="green.200" borderRadius="md" px={4} py={3} display="flex" alignItems="center">
            <HStack spacing={3} w="full">
              <Icon as={FaCheck} color="green.500" boxSize={5} flexShrink={0} />
              <VStack align="start" spacing={0}>
                <Text fontSize="sm" color={useColorModeValue('green.900', 'green.100')} fontWeight="semibold">All participants accepted</Text>
                <Text fontSize="xs" color={useColorModeValue('green.800', 'green.200')}>Coordinate handoffs and execute the trade above</Text>
              </VStack>
            </HStack>
          </Box>
        )}

        {/* Action Buttons */}
        <HStack w="full" spacing={3} justify="flex-end">
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
              {canManage && (
                <>
                  <Button
                    colorScheme="gray"
                    variant="outline"
                    isDisabled={loading}
                    isLoading={selectedAction === 'cancel' && loading}
                    onClick={handleCancelLoop}
                  >
                    Cancel Loop
                  </Button>
                  <Button
                    colorScheme="purple"
                    variant="outline"
                    isDisabled={loading}
                    isLoading={selectedAction === 'reinvite' && loading}
                    onClick={handleReinviteLoop}
                  >
                    Reinvite
                  </Button>
                </>
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
