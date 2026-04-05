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
  Divider,
  Image,
  Icon,
  useToast,
  Heading,
  Avatar,
  useColorModeValue,
  Stack,
  Progress,
  Select,
  Input,
  FormLabel,
  FormControl,
  Collapse,
  useDisclosure,
  Tag,
  TagLabel,
  TagLeftIcon,
} from '@chakra-ui/react'
import {
  FaCheck,
  FaTimes,
  FaBox,
  FaClock,
  FaMapMarkerAlt,
  FaChevronDown,
  FaArrowRight,
  FaTruck,
  FaHandshake,
} from 'react-icons/fa'
import { MultiWayTrade } from '../types'
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
  const [savingLeg, setSavingLeg] = useState<number | null>(null)
  const [completingLeg, setCompletingLeg] = useState<number | null>(null)
  const { isOpen: isLegsOpen, onToggle: onLegsToggle } = useDisclosure({
    defaultIsOpen: isActiveChain,
  })
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

  const canExecute =
    multiWayTrade.status === 'active' &&
    sortedParticipants.every((p) => p.trade_status === 'accepted')

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleSaveLegHandoff = async (legId: number) => {
    const form = legForms[legId]
    if (!form) return
    setSavingLeg(legId)
    try {
      await updateLegHandoff(legId, form.method, form.location, form.time)
      toast({ id: `leg-${legId}-saved`, title: 'Handoff saved', status: 'success', duration: 2000 })
    } catch {
      toast({ id: `leg-${legId}-err`, title: 'Failed to save', status: 'error', duration: 3000 })
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

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" isCentered scrollBehavior="inside">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg={cardBg} maxH="90vh">
        {/* ── Header ── */}
        <ModalHeader borderBottomWidth="1px" borderColor={borderColor} pb={4}>
          <HStack justify="space-between" align="flex-start">
            <VStack align="start" spacing={1}>
              <Heading size="md">{sortedParticipants.length}-Way Trade Chain</Heading>
              <HStack spacing={2} flexWrap="wrap">
                <Badge colorScheme={statusColorScheme(multiWayTrade.status)} px={2} py={0.5} borderRadius="full">
                  {statusLabel(multiWayTrade.status)}
                </Badge>
                {timeLeft && (
                  <Tag size="sm" colorScheme={timeLeft === 'Expired' ? 'red' : 'orange'} variant="subtle">
                    <TagLeftIcon as={FaClock} />
                    <TagLabel>{timeLeft}</TagLabel>
                  </Tag>
                )}
              </HStack>
            </VStack>
            <ModalCloseButton position="relative" top={0} right={0} />
          </HStack>

          {/* Progress bar */}
          {isActiveChain && totalLegs > 0 && (
            <Box mt={3}>
              <HStack justify="space-between" mb={1}>
                <Text fontSize="xs" color="gray.500">
                  Handoffs confirmed: {completedLegs} / {totalLegs}
                </Text>
                <Text fontSize="xs" fontWeight="bold" color={healthPct === 100 ? 'green.500' : 'blue.500'}>
                  {healthPct}%
                </Text>
              </HStack>
              <Progress
                value={healthPct}
                size="sm"
                colorScheme={healthPct === 100 ? 'green' : 'blue'}
                borderRadius="full"
              />
            </Box>
          )}
        </ModalHeader>

        <ModalBody py={5} overflowY="auto">
          <VStack spacing={5} align="stretch">

            {/* ── Trade Flow ── */}
            <Box>
              <Text fontWeight="semibold" fontSize="sm" color="gray.500" mb={3} textTransform="uppercase" letterSpacing="wide">
                Trade Flow
              </Text>
              <VStack spacing={3} align="stretch">
                {multiWayTrade.edges.map((edge, idx) => (
                  <Box
                    key={idx}
                    p={3}
                    borderWidth="1px"
                    borderColor={borderColor}
                    borderRadius="lg"
                    bg={sectionBg}
                  >
                    <HStack spacing={3}>
                      {/* Product image */}
                      {(edge as any).product_image ? (
                        <Image
                          src={(edge as any).product_image}
                          alt={edge.product_title}
                          boxSize="52px"
                          objectFit="cover"
                          borderRadius="md"
                          flexShrink={0}
                        />
                      ) : (
                        <Box
                          boxSize="52px"
                          borderRadius="md"
                          bg="gray.200"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          flexShrink={0}
                        >
                          <Icon as={FaBox} color="gray.400" />
                        </Box>
                      )}

                      {/* Product + participants */}
                      <VStack align="start" spacing={0.5} flex={1} minW={0}>
                        <Text fontWeight="semibold" fontSize="sm" noOfLines={1}>
                          {edge.product_title}
                        </Text>
                        <HStack spacing={1} fontSize="xs" color="gray.500" flexWrap="wrap">
                          <Avatar name={edge.from_user_name} size="2xs" />
                          <Text fontWeight="medium" color="gray.700">{edge.from_user_name}</Text>
                          <Icon as={FaArrowRight} boxSize={2.5} />
                          <Avatar name={edge.to_user_name} size="2xs" />
                          <Text fontWeight="medium" color="gray.700">{edge.to_user_name}</Text>
                        </HStack>
                      </VStack>

                      {/* Status badge */}
                      <Badge
                        colorScheme={statusColorScheme(edge.status || 'pending')}
                        flexShrink={0}
                        borderRadius="full"
                        px={2}
                      >
                        {statusLabel(edge.status || 'pending')}
                      </Badge>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            </Box>

            <Divider />

            {/* ── Participants ── */}
            <Box>
              <Text fontWeight="semibold" fontSize="sm" color="gray.500" mb={3} textTransform="uppercase" letterSpacing="wide">
                Participants ({sortedParticipants.length})
              </Text>
              <VStack spacing={2} align="stretch">
                {sortedParticipants.map((participant, idx) => (
                  <HStack
                    key={idx}
                    p={3}
                    borderWidth="1px"
                    borderColor={borderColor}
                    borderRadius="lg"
                    spacing={3}
                    bg={sectionBg}
                  >
                    <Avatar name={participant.user_name} size="sm" bg="brand.500" color="white" />
                    <VStack align="start" spacing={0} flex={1} minW={0}>
                      <HStack spacing={2}>
                        <Text fontWeight="semibold" fontSize="sm">
                          {participant.user_name}
                        </Text>
                        {participant.user_id === currentUserId && (
                          <Badge colorScheme="purple" fontSize="2xs">You</Badge>
                        )}
                      </HStack>
                      <Text fontSize="xs" color="gray.500" noOfLines={1}>
                        Offering: {participant.product_title}
                      </Text>
                    </VStack>
                    <Badge
                      colorScheme={statusColorScheme(participant.trade_status)}
                      borderRadius="full"
                      px={2}
                      flexShrink={0}
                    >
                      {statusLabel(participant.trade_status)}
                    </Badge>
                  </HStack>
                ))}
              </VStack>
            </Box>

            {/* ── Per-leg Handoff Coordination (active chains only) ── */}
            {legs.length > 0 && (
              <>
                <Divider />
                <Box>
                  <HStack
                    justify="space-between"
                    cursor="pointer"
                    onClick={onLegsToggle}
                    mb={isLegsOpen ? 3 : 0}
                    _hover={{ opacity: 0.8 }}
                  >
                    <Text fontWeight="semibold" fontSize="sm" color="gray.500" textTransform="uppercase" letterSpacing="wide">
                      Arrange Handoffs ({legs.length})
                    </Text>
                    <Icon
                      as={FaChevronDown}
                      transition="transform 0.2s"
                      transform={isLegsOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
                      color="gray.400"
                    />
                  </HStack>

                  <Collapse in={isLegsOpen} animateOpacity>
                    <VStack spacing={4} align="stretch">
                      {/* Instruction note */}
                      <Box
                        bg={useColorModeValue('blue.50', 'blue.900')}
                        borderLeftWidth="3px"
                        borderColor="blue.400"
                        p={3}
                        borderRadius="md"
                      >
                        <Text fontSize="xs" color={useColorModeValue('blue.800', 'blue.200')}>
                          Both parties in each leg can propose a handoff method. Coordinate with each other and save when you agree.
                        </Text>
                      </Box>

                      {legs.map((leg: any) => {
                        const fromName = userNameMap[leg.from_user_id] || `User ${leg.from_user_id}`
                        const toName = userNameMap[leg.to_user_id] || `User ${leg.to_user_id}`
                        const isGiver = currentUserId === leg.from_user_id
                        const isReceiver = currentUserId === leg.to_user_id
                        const isInvolved = isGiver || isReceiver
                        const isDone = leg.status === 'completed' || leg.status === 'cancelled'

                        return (
                          <Box
                            key={leg.id}
                            borderWidth="1px"
                            borderColor={isDone ? 'green.200' : borderColor}
                            borderRadius="lg"
                            overflow="hidden"
                            bg={legCardBg}
                          >
                            {/* Leg header */}
                            <HStack
                              px={4}
                              py={2.5}
                              bg={isDone ? useColorModeValue('green.50', 'green.900') : useColorModeValue('gray.50', 'gray.750')}
                              borderBottomWidth="1px"
                              borderColor={isDone ? 'green.200' : borderColor}
                              justify="space-between"
                            >
                              <HStack spacing={2}>
                                <Avatar name={fromName} size="2xs" />
                                <Text fontSize="sm" fontWeight="semibold">{fromName}</Text>
                                <Icon as={FaArrowRight} boxSize={3} color="gray.400" />
                                <Avatar name={toName} size="2xs" />
                                <Text fontSize="sm" fontWeight="semibold">{toName}</Text>
                                {isGiver && <Badge colorScheme="orange" fontSize="2xs">You give</Badge>}
                                {isReceiver && <Badge colorScheme="teal" fontSize="2xs">You receive</Badge>}
                              </HStack>
                              <Badge colorScheme={statusColorScheme(leg.status)} borderRadius="full" px={2}>
                                {statusLabel(leg.status)}
                              </Badge>
                            </HStack>

                            {/* Completed summary */}
                            {isDone && (
                              <HStack px={4} py={3} spacing={4} flexWrap="wrap">
                                {leg.handoff_method && (
                                  <HStack spacing={1} fontSize="sm" color="gray.600">
                                    <Icon as={leg.handoff_method === 'delivery' ? FaTruck : FaHandshake} />
                                    <Text textTransform="capitalize">{leg.handoff_method}</Text>
                                  </HStack>
                                )}
                                {leg.handoff_location && (
                                  <HStack spacing={1} fontSize="sm" color="gray.600">
                                    <Icon as={FaMapMarkerAlt} />
                                    <Text>{leg.handoff_location}</Text>
                                  </HStack>
                                )}
                                {leg.handoff_time && (
                                  <HStack spacing={1} fontSize="sm" color="gray.600">
                                    <Icon as={FaClock} />
                                    <Text>{leg.handoff_time}</Text>
                                  </HStack>
                                )}
                                {leg.status === 'completed' && (
                                  <HStack spacing={1} fontSize="sm" color="green.600">
                                    <Icon as={FaCheck} />
                                    <Text fontWeight="medium">Received</Text>
                                  </HStack>
                                )}
                              </HStack>
                            )}

                            {/* Handoff form (editable by both parties while pending) */}
                            {!isDone && (
                              <Box px={4} py={3}>
                                {/* Show current saved values as read-only summary if not involved */}
                                {(leg.handoff_location || leg.handoff_time) && !isInvolved && (
                                  <HStack spacing={4} flexWrap="wrap" mb={3} fontSize="sm" color="gray.600">
                                    {leg.handoff_method && (
                                      <HStack spacing={1}>
                                        <Icon as={leg.handoff_method === 'delivery' ? FaTruck : FaHandshake} />
                                        <Text textTransform="capitalize">{leg.handoff_method}</Text>
                                      </HStack>
                                    )}
                                    {leg.handoff_location && (
                                      <HStack spacing={1}>
                                        <Icon as={FaMapMarkerAlt} />
                                        <Text>{leg.handoff_location}</Text>
                                      </HStack>
                                    )}
                                    {leg.handoff_time && (
                                      <HStack spacing={1}>
                                        <Icon as={FaClock} />
                                        <Text>{leg.handoff_time}</Text>
                                      </HStack>
                                    )}
                                  </HStack>
                                )}

                                {/* Edit form — shown to both parties involved in this leg */}
                                {isInvolved && (
                                  <VStack spacing={3} align="stretch">
                                    <FormControl>
                                      <FormLabel fontSize="xs" mb={1}>Handoff method</FormLabel>
                                      <Select
                                        size="sm"
                                        value={legForms[leg.id]?.method || 'meetup'}
                                        onChange={(e) =>
                                          setLegForms((prev) => ({
                                            ...prev,
                                            [leg.id]: {
                                              ...prev[leg.id],
                                              method: e.target.value as 'meetup' | 'delivery',
                                            },
                                          }))
                                        }
                                      >
                                        <option value="meetup">Meetup in person</option>
                                        <option value="delivery">Delivery / shipping</option>
                                      </Select>
                                    </FormControl>

                                    <FormControl>
                                      <FormLabel fontSize="xs" mb={1}>
                                        <HStack spacing={1}>
                                          <Icon as={FaMapMarkerAlt} />
                                          <span>
                                            {legForms[leg.id]?.method === 'delivery'
                                              ? 'Delivery address'
                                              : 'Meetup location'}
                                          </span>
                                        </HStack>
                                      </FormLabel>
                                      <Input
                                        size="sm"
                                        placeholder={
                                          legForms[leg.id]?.method === 'delivery'
                                            ? 'e.g. 123 Main St, City'
                                            : 'e.g. SM Mall main entrance'
                                        }
                                        value={legForms[leg.id]?.location || ''}
                                        onChange={(e) =>
                                          setLegForms((prev) => ({
                                            ...prev,
                                            [leg.id]: { ...prev[leg.id], location: e.target.value },
                                          }))
                                        }
                                      />
                                    </FormControl>

                                    <FormControl>
                                      <FormLabel fontSize="xs" mb={1}>
                                        <HStack spacing={1}>
                                          <Icon as={FaClock} />
                                          <span>Proposed date &amp; time</span>
                                        </HStack>
                                      </FormLabel>
                                      <Input
                                        size="sm"
                                        placeholder="e.g. Saturday April 12, 3pm"
                                        value={legForms[leg.id]?.time || ''}
                                        onChange={(e) =>
                                          setLegForms((prev) => ({
                                            ...prev,
                                            [leg.id]: { ...prev[leg.id], time: e.target.value },
                                          }))
                                        }
                                      />
                                    </FormControl>

                                    <HStack justify="flex-end" spacing={2} pt={1}>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        colorScheme="blue"
                                        isLoading={savingLeg === leg.id}
                                        onClick={() => handleSaveLegHandoff(leg.id)}
                                      >
                                        Save Proposal
                                      </Button>
                                      {isReceiver && (
                                        <Button
                                          size="sm"
                                          colorScheme="green"
                                          leftIcon={<FaCheck />}
                                          isLoading={completingLeg === leg.id}
                                          onClick={() => handleCompleteLeg(leg.id)}
                                        >
                                          I Received It
                                        </Button>
                                      )}
                                    </HStack>
                                  </VStack>
                                )}

                                {/* Waiting message for non-involved viewers */}
                                {!isInvolved && (
                                  <Text fontSize="xs" color="gray.400" fontStyle="italic">
                                    Waiting for {fromName} and {toName} to coordinate.
                                  </Text>
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
                <HStack
                  justify="space-between"
                  bg={sectionBg}
                  p={3}
                  borderRadius="md"
                  borderWidth="1px"
                  borderColor={borderColor}
                >
                  <Text fontWeight="semibold" fontSize="sm">
                    Estimated Total Value
                  </Text>
                  <Text fontSize="lg" fontWeight="bold" color="green.500">
                    ₱{multiWayTrade.total_value.toFixed(2)}
                  </Text>
                </HStack>
              </>
            )}
          </VStack>
        </ModalBody>

        {/* ── Footer ── */}
        <ModalFooter borderTopWidth="1px" borderColor={borderColor} pt={4}>
          <Stack direction={{ base: 'column', sm: 'row' }} w="full" spacing={2}>
            {isActiveChain ? (
              <>
                <Box
                  flex={1}
                  bg={useColorModeValue('green.50', 'green.900')}
                  borderWidth="1px"
                  borderColor="green.200"
                  borderRadius="md"
                  px={4}
                  py={2}
                  display="flex"
                  alignItems="center"
                >
                  <HStack spacing={2}>
                    <Icon as={FaCheck} color="green.500" boxSize={3} />
                    <Text fontSize="sm" color={useColorModeValue('green.800', 'green.200')} fontWeight="medium">
                      All participants accepted — coordinate handoffs above
                    </Text>
                  </HStack>
                </Box>
                <Button
                  colorScheme="red"
                  variant="outline"
                  size="sm"
                  isDisabled={loading}
                  isLoading={selectedAction === 'cancel' && loading}
                  onClick={handleCancelLoop}
                >
                  Cancel Loop
                </Button>
              </>
            ) : (
              <>
                <Button
                  flex={1}
                  variant="ghost"
                  isDisabled={loading}
                  onClick={handleDecline}
                  isLoading={selectedAction === 'decline' && loading}
                  leftIcon={<FaTimes />}
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
                {canExecute && (
                  <Button
                    flex={1}
                    colorScheme="brand"
                    isDisabled={loading}
                    isLoading={selectedAction === 'execute' && loading}
                    onClick={handleExecute}
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
          </Stack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default MultiWayTradeModal
