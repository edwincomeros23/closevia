import React, { useState, useEffect, useMemo } from 'react'
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
  Skeleton,
  useDisclosure,
  Tag,
  TagLabel,
  TagLeftIcon,
  Progress,
  Divider,
  Collapse,
  FormControl,
  FormLabel,
  Select,
  Input,
  Flex,
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
} from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import { MultiWayTrade, MultiWayTradeParticipant } from '../types'
import { getProductUrl } from '../utils/productUtils'
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
    user3_accepted: 'Accepted',
    active: 'Active',
    pending_user3: 'Awaiting 3rd Party',
    pending: 'Pending',
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
  const isActiveChain =
    multiWayTrade.status === 'active' || multiWayTrade.status === 'user3_accepted'

  const [loading, setLoading] = useState(false)
  const [selectedAction, setSelectedAction] = useState<
    'accept' | 'decline' | 'execute' | 'cancel' | 'reinvite' | null
  >(null)
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [legs, setLegs] = useState<any[]>([])
  const [legForms, setLegForms] = useState<
    Record<number, { method: 'meetup' | 'delivery'; location: string; time: string }>
  >({})
  const [sharedForm, setSharedForm] = useState<{ method: 'meetup' | 'delivery'; location: string; time: string }>({ method: 'meetup', location: '', time: '' })
  const [savingLeg, setSavingLeg] = useState<number | null>(null)
  const [completingLeg, setCompletingLeg] = useState<number | null>(null)
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" isCentered scrollBehavior="inside">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg={cardBg} maxH="90vh" overflowY="auto">
        <ModalHeader borderBottomWidth="1px" borderColor={borderColor}>
          <VStack align="start" spacing={2} w="full">
            <HStack justify="space-between" w="full">
              <Heading size="md">{sortedParticipants.length}-Way Trade Loop</Heading>
            </HStack>

            {/* Expiration countdown */}
            {timeLeft && (
              <HStack spacing={2}>
                <Icon
                  as={FaClock}
                  color={timeLeft === 'Expired' ? 'red.500' : 'orange.400'}
                  boxSize={4}
                />
                <Text fontSize="sm" fontWeight="medium" color={timeLeft === 'Expired' ? 'red.500' : 'orange.600'}>
                  {timeLeft}
                </Text>
                <Badge colorScheme={statusColorScheme(multiWayTrade.status)} px={2} py={0.5} borderRadius="full">
                  {statusLabel(multiWayTrade.status)}
                </Badge>
              </HStack>
            )}

            {/* Progress for handoffs (if applicable) */}
            {isActiveChain && totalLegs > 0 && (
              <Box pt={3} w="full">
                <HStack justify="space-between" mb={1}>
                  <Text fontSize="xs" color="gray.500">Handoffs confirmed: {completedLegs} / {totalLegs}</Text>
                  <Text fontSize="xs" fontWeight="bold" color={healthPct === 100 ? 'green.500' : 'blue.500'}>{healthPct}%</Text>
                </HStack>
                <Progress value={healthPct} size="sm" colorScheme={healthPct === 100 ? 'green' : 'blue'} borderRadius="full" />
              </Box>
            )}
          </VStack>
          <ModalCloseButton position="relative" top={0} right={0} />
        </ModalHeader>

        <ModalBody py={6}>
          <VStack spacing={6} align="stretch">
            {/* Visual Chain Flow */}
            <Box w="full">
              {sortedParticipants.length <= 3 ? (
                /* Circular layout for small loops */
                <Box w="full" minH="320px" position="relative" display="flex" alignItems="center" justifyContent="center">
                  <Box position="absolute" w="full" h="320px">
                    <svg width="100%" height="100%" viewBox="0 0 400 320" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute' }}>
                      {sortedParticipants.map((_, idx) => {
                        const nextIdx = (idx + 1) % sortedParticipants.length
                        const angles = sortedParticipants.length === 3 ? [90, 210, 330] : Array.from({ length: sortedParticipants.length }, (_, i) => (i * 360) / sortedParticipants.length + 90)
                        const angle1 = (angles[idx] * Math.PI) / 180
                        const angle2 = (angles[nextIdx] * Math.PI) / 180
                        const radius = 110
                        const x1 = 200 + radius * Math.cos(angle1)
                        const y1 = 160 + radius * Math.sin(angle1)
                        const x2 = 200 + radius * Math.cos(angle2)
                        const y2 = 160 + radius * Math.sin(angle2)
                        return <line key={`arrow-${idx}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#cbd5e0" strokeWidth="2" markerEnd="url(#arrowhead)" />
                      })}
                      <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                          <polygon points="0 0, 10 3, 0 6" fill="#cbd5e0" />
                        </marker>
                      </defs>
                    </svg>
                  </Box>

                  <Flex position="relative" w="full" h="320px" alignItems="center" justifyContent="center">
                    {sortedParticipants.map((participant, idx) => {
                      const angles = sortedParticipants.length === 3 ? [90, 210, 330] : Array.from({ length: sortedParticipants.length }, (_, i) => (i * 360) / sortedParticipants.length + 90)
                      const angle = (angles[idx] * Math.PI) / 180
                      const radius = 110
                      const x = radius * Math.cos(angle)
                      const y = radius * Math.sin(angle)
                      const isAccepted = ['accepted', 'user3_accepted', 'active', 'multiway_active'].includes(participant.trade_status)

                      return (
                        <Box key={idx} position="absolute" left="50%" top="50%" transform={`translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`} display="flex" flexDirection="column" alignItems="center" gap={3} w="120px">
                          <Box position="relative" borderRadius="full" borderWidth="3px" borderColor={isAccepted ? 'green.400' : 'gray.300'} bg={cardBg} p={2} w="110px" h="110px" display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap={1} shadow="md">
                            <Box position="absolute" top="-12px" right="-12px" borderRadius="full" bg={isAccepted ? 'green.500' : 'gray.400'} w="32px" h="32px" display="flex" alignItems="center" justifyContent="center" color="white" fontSize="18px" fontWeight="bold" shadow="md" borderWidth="2px" borderColor={cardBg}>{isAccepted ? '✓' : '●'}</Box>

                            <Box as="button" onClick={() => navigate(getUserProfileUrl(participant.user_id, participant.user_slug))} cursor="pointer" _hover={{ opacity: 0.8 }} border="none" p={0} bg="transparent">
                              <Avatar name={participant.user_name} size="lg" bg="brand.500" />
                            </Box>

                            <Text fontSize="11px" fontWeight="semibold" textAlign="center" noOfLines={2}>{participant.user_name}</Text>
                          </Box>

                          <Box w="full" textAlign="center">
                            <Text fontSize="9px" fontWeight="bold" color="gray.600" mb={1}>Gives:</Text>

                            {participant.product_image && (
                              <Image src={participant.product_image} alt={participant.product_title} maxH="70px" maxW="full" objectFit="cover" borderRadius="md" mb={1} />
                            )}

                            <Text fontSize="10px" fontWeight="medium" noOfLines={2} color="gray.700">
                              {participant.product_id ? (
                                <Box as="button" onClick={() => navigate(getProductUrl({ id: participant.product_id, slug: participant.product_slug } as any))} cursor="pointer" color="blue.600" _hover={{ textDecoration: 'underline' }} fontWeight="semibold" border="none" p={0} bg="transparent">
                                  {participant.product_title}
                                </Box>
                              ) : (
                                participant.product_title
                              )}
                            </Text>
                          </Box>
                        </Box>
                      )
                    })}
                  </Flex>
                </Box>
              ) : (
                /* Linear flow for longer chains */
                <Box overflowX="auto" pb={4}>
                  <HStack spacing={6} minW="min-content">
                    {sortedParticipants.map((participant, idx) => {
                      const isAccepted = ['accepted', 'user3_accepted', 'active', 'multiway_active'].includes(participant.trade_status)

                      return (
                        <Box key={idx} display="flex" alignItems="flex-start" gap={3} flexShrink={0}>
                          <VStack spacing={2}>
                            <Box position="relative" borderRadius="lg" borderWidth="3px" borderColor={isAccepted ? 'green.400' : 'gray.300'} bg={cardBg} p={2} w="100px" display="flex" flexDirection="column" alignItems="center" gap={2} shadow="md">
                              <Box position="absolute" top="-12px" right="-12px" borderRadius="full" bg={isAccepted ? 'green.500' : 'gray.400'} w="28px" h="28px" display="flex" alignItems="center" justifyContent="center" color="white" fontSize="14px" fontWeight="bold" shadow="md" borderWidth="2px" borderColor={cardBg}>{isAccepted ? '✓' : '●'}</Box>

                              <Box as="button" onClick={() => navigate(getUserProfileUrl(participant.user_id, participant.user_slug))} cursor="pointer" _hover={{ opacity: 0.8 }} border="none" p={0} bg="transparent">
                                <Avatar name={participant.user_name} size="md" bg="brand.500" />
                              </Box>

                              <Text fontSize="10px" fontWeight="semibold" textAlign="center" noOfLines={2}>{participant.user_name}</Text>

                              <Text fontSize="8px" fontWeight="bold" color="gray.600">Gives:</Text>

                              {participant.product_image && (
                                <Image src={participant.product_image} alt={participant.product_title} maxH="45px" maxW="full" objectFit="cover" borderRadius="sm" />
                              )}
                            </Box>

                            <Text fontSize="9px" fontWeight="medium" textAlign="center" noOfLines={2} w="100px">
                              {participant.product_id ? (
                                <Box as="button" onClick={() => navigate(getProductUrl({ id: participant.product_id, slug: participant.product_slug } as any))} cursor="pointer" color="blue.600" _hover={{ textDecoration: 'underline' }} fontWeight="semibold" border="none" p={0} bg="transparent">
                                  {participant.product_title}
                                </Box>
                              ) : (
                                participant.product_title
                              )}
                            </Text>
                          </VStack>

                          {idx < sortedParticipants.length - 1 && <Icon as={FaArrowRight} boxSize={5} color="orange.400" mt={1} />}

                          {idx === sortedParticipants.length - 1 && (
                            <Box ml={2} mt={-4}><Icon as={FaArrowRight} boxSize={5} color="orange.400" transform="rotate(45deg)" /></Box>
                          )}
                        </Box>
                      )
                    })}
                  </HStack>
                </Box>
              )}
            </Box>

            {/* Info Box */}
            <Box bg="blue.50" borderLeftWidth="4px" borderColor="blue.500" p={3} borderRadius="md">
              <Text fontSize="sm" color="blue.900"><strong>Trade Loop:</strong> {sortedParticipants.length}-way exchange. <strong>✓ = Accepted</strong> • <strong>● = Pending</strong></Text>
            </Box>

            {/* Per-leg Handoff Coordination (active chains only) */}
            {legs.length > 0 && (
              <>
                <Divider />
                <Box>
                  <HStack justify="space-between" cursor="pointer" onClick={onLegsToggle} mb={isLegsOpen ? 3 : 0} _hover={{ opacity: 0.8 }}>
                    <Text fontWeight="semibold" fontSize="sm" color="gray.500" textTransform="uppercase" letterSpacing="wide">Shared Coordination ({legs.length} items)</Text>
                    <Icon as={FaChevronDown} transition="transform 0.2s" transform={isLegsOpen ? 'rotate(180deg)' : 'rotate(0deg)'} color="gray.400" />
                  </HStack>

                  <Collapse in={isLegsOpen} animateOpacity>
                    <VStack spacing={4} align="stretch">
                      <Box bg={useColorModeValue('purple.50', 'purple.900')} borderLeftWidth="3px" borderColor="purple.400" p={3} borderRadius="md">
                        <Text fontSize="xs" color={useColorModeValue('purple.800', 'purple.200')}>All participants will meet at the same location and time to execute the multi-way trade. Any participant can propose a shared method below.</Text>
                      </Box>

                      <Box p={4} borderWidth="1px" borderColor={borderColor} borderRadius="lg" bg={legCardBg}>
                        <VStack spacing={3} align="stretch">
                          <FormControl>
                            <FormLabel fontSize="xs" mb={1}>Shared Handoff Method</FormLabel>
                            <Select size="sm" value={sharedForm.method} onChange={(e) => setSharedForm((prev) => ({ ...prev, method: e.target.value as 'meetup' | 'delivery' }))}>
                              <option value="meetup">Meetup in person</option>
                              <option value="delivery">Delivery / shipping</option>
                            </Select>
                          </FormControl>

                          <FormControl>
                            <FormLabel fontSize="xs" mb={1}><HStack spacing={1}><Icon as={FaMapMarkerAlt} /><span>{sharedForm.method === 'delivery' ? 'Delivery Instruction' : 'Meetup Location'}</span></HStack></FormLabel>
                            <Input size="sm" placeholder={sharedForm.method === 'delivery' ? 'e.g. Any special instructions' : 'e.g. SM Mall main entrance'} value={sharedForm.location} onChange={(e) => setSharedForm((prev) => ({ ...prev, location: e.target.value }))} />
                          </FormControl>

                          <FormControl>
                            <FormLabel fontSize="xs" mb={1}><HStack spacing={1}><Icon as={FaClock} /><span>Proposed Date & Time</span></HStack></FormLabel>
                            <Input size="sm" placeholder="e.g. Saturday April 12, 3pm" value={sharedForm.time} onChange={(e) => setSharedForm((prev) => ({ ...prev, time: e.target.value }))} />
                          </FormControl>

                          <HStack justify="flex-end" pt={1}>
                            <Button size="sm" colorScheme="purple" isLoading={savingLeg === -1} onClick={handleSaveSharedHandoff}>Update Shared Handoff</Button>
                          </HStack>
                        </VStack>
                      </Box>
                      
                      <Text mt={4} fontWeight="semibold" fontSize="sm" color="gray.600" textTransform="uppercase" letterSpacing="wide">Confirm Receipts</Text>

                      {legs.map((leg: any) => {
                        const fromName = userNameMap[leg.from_user_id] || `User ${leg.from_user_id}`
                        const toName = userNameMap[leg.to_user_id] || `User ${leg.to_user_id}`
                        const isGiver = currentUserId === leg.from_user_id
                        const isReceiver = currentUserId === leg.to_user_id
                        const isInvolved = isGiver || isReceiver
                        const isDone = leg.status === 'completed' || leg.status === 'cancelled'

                        return (
                          <Box key={leg.id} borderWidth="1px" borderColor={isDone ? 'green.200' : borderColor} borderRadius="lg" overflow="hidden" bg={legCardBg}>
                            <HStack px={4} py={2.5} bg={isDone ? useColorModeValue('green.50', 'green.900') : useColorModeValue('gray.50', 'gray.750')} borderBottomWidth="1px" borderColor={isDone ? 'green.200' : borderColor} justify="space-between">
                              <HStack spacing={2}>
                                <Avatar name={fromName} size="2xs" />
                                <Text fontSize="sm" fontWeight="semibold">{fromName}</Text>
                                <Icon as={FaArrowRight} boxSize={3} color="gray.400" />
                                <Avatar name={toName} size="2xs" />
                                <Text fontSize="sm" fontWeight="semibold">{toName}</Text>
                                {isGiver && <Badge colorScheme="orange" fontSize="2xs">You give</Badge>}
                                {isReceiver && <Badge colorScheme="teal" fontSize="2xs">You receive</Badge>}
                              </HStack>
                              <Badge colorScheme={statusColorScheme(leg.status)} borderRadius="full" px={2}>{statusLabel(leg.status)}</Badge>
                            </HStack>

                            {isDone && (
                              <HStack px={4} py={3} spacing={4} flexWrap="wrap">
                                {leg.handoff_method && (
                                  <HStack spacing={1} fontSize="sm" color="gray.600"><Icon as={leg.handoff_method === 'delivery' ? FaTruck : FaHandshake} /><Text textTransform="capitalize">{leg.handoff_method}</Text></HStack>
                                )}
                                {leg.handoff_location && (
                                  <HStack spacing={1} fontSize="sm" color="gray.600"><Icon as={FaMapMarkerAlt} /><Text>{leg.handoff_location}</Text></HStack>
                                )}
                                {leg.handoff_time && (
                                  <HStack spacing={1} fontSize="sm" color="gray.600"><Icon as={FaClock} /><Text>{leg.handoff_time}</Text></HStack>
                                )}
                                {leg.status === 'completed' && (
                                  <HStack spacing={1} fontSize="sm" color="green.600"><Icon as={FaCheck} /><Text fontWeight="medium">Received</Text></HStack>
                                )}
                              </HStack>
                            )}

                            {!isDone && (
                              <Box px={4} py={3}>
                                {isReceiver && (
                                  <VStack spacing={3} align="stretch">
                                    <Text fontSize="xs" color="gray.600">Once you have met and received the item from <strong>{fromName}</strong>, mark it as received.</Text>
                                    <HStack justify="flex-start" spacing={2} pt={1}>
                                      <Button size="sm" colorScheme="green" leftIcon={<FaCheck />} isLoading={completingLeg === leg.id} onClick={() => handleCompleteLeg(leg.id)}>I Received It</Button>
                                    </HStack>
                                  </VStack>
                                )}
                                {!isReceiver && (
                                  <Text fontSize="xs" color="gray.500" fontStyle="italic">Waiting for {toName} to confirm receipt.</Text>
                                )}
                              </Box>
                            )}
                          </Box>
                        )
                      })}
                    </VStack>
                  </Collapse>
                </Box>
              </>
            )}

            {multiWayTrade.total_value && (
              <>
                <Divider />
                <HStack justify="space-between" bg={sectionBg} p={3} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
                  <Text fontWeight="semibold" fontSize="sm">Estimated Total Value</Text>
                  <Text fontSize="lg" fontWeight="bold" color="green.500">₱{multiWayTrade.total_value.toFixed(2)}</Text>
                </HStack>
              </>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter borderTopWidth="1px" borderColor={borderColor} pt={4}>
          <Stack direction={{ base: 'column', sm: 'row' }} w="full" spacing={2}>
            {isActiveChain ? (
              <>
                <Box flex={1} bg={useColorModeValue('green.50', 'green.900')} borderWidth="1px" borderColor="green.200" borderRadius="md" px={4} py={2} display="flex" alignItems="center">
                  <HStack spacing={2}>
                    <Icon as={FaCheck} color="green.500" boxSize={3} />
                    <Text fontSize="sm" color={useColorModeValue('green.800', 'green.200')} fontWeight="medium">All participants accepted — coordinate handoffs above</Text>
                  </HStack>
                </Box>
                <Button colorScheme="red" variant="outline" size="sm" isDisabled={loading} isLoading={selectedAction === 'cancel' && loading} onClick={handleCancelLoop}>Cancel Loop</Button>
              </>
            ) : (
              <>
                <Button flex={1} variant="ghost" isDisabled={loading} onClick={handleDecline} isLoading={selectedAction === 'decline' && loading} leftIcon={<FaTimes />}>Decline</Button>
                <Button flex={1} colorScheme="green" isDisabled={loading || multiWayTrade.status !== 'active'} isLoading={selectedAction === 'accept' && loading} onClick={handleAccept} leftIcon={<FaCheck />}>Accept Trade</Button>
                {canExecute && (
                  <Button flex={1} colorScheme="brand" isDisabled={loading} isLoading={selectedAction === 'execute' && loading} onClick={handleExecute}>Execute Trade</Button>
                )}
                {canManage && (
                  <>
                    <Button colorScheme="gray" variant="outline" isDisabled={loading} isLoading={selectedAction === 'cancel' && loading} onClick={handleCancelLoop}>Cancel Loop</Button>
                    <Button colorScheme="purple" variant="outline" isDisabled={loading} isLoading={selectedAction === 'reinvite' && loading} onClick={handleReinviteLoop}>Reinvite</Button>
                  </>
                )}
              </>
            )}
          </Stack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default MultiWayTradeModal
