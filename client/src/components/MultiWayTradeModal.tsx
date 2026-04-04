import React, { useState, useEffect } from 'react'
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
  Grid,
  Icon,
  Spinner,
  useToast,
  Card,
  CardBody,
  Heading,
  Avatar,
  useColorModeValue,
  Flex,
  Stack,
  Progress,
  Select,
  Input,
  FormLabel,
  FormControl,
  Collapse,
  useDisclosure,
} from '@chakra-ui/react'
import { FaArrowRight, FaCheck, FaTimes, FaBox, FaClock, FaMapMarkerAlt, FaChevronDown } from 'react-icons/fa'
import { MultiWayTrade, MultiWayTradeParticipant } from '../types'
import {
  acceptMultiWayTrade,
  declineMultiWayTrade,
  executeMultiWayTrade,
  cancelTradeLoop,
  reinviteTradeLoop,
  getChainLegs,
  updateLegHandoff,
} from '../services/tradeService'

interface MultiWayTradeModalProps {
  isOpen: boolean
  onClose: () => void
  multiWayTrade: MultiWayTrade
  onTradeCompleted?: () => void
  canManage?: boolean
}

/** Format ms remaining as "Xh Ym" or "Expired" */
function formatTimeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${m}m remaining`
}

const MultiWayTradeModal: React.FC<MultiWayTradeModalProps> = ({
  isOpen,
  onClose,
  multiWayTrade,
  onTradeCompleted,
  canManage = false,
}) => {
  const [loading, setLoading] = useState(false)
  const [selectedAction, setSelectedAction] = useState<'accept' | 'decline' | 'execute' | 'cancel' | 'reinvite' | null>(null)
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [legs, setLegs] = useState<any[]>([])
  const [legForms, setLegForms] = useState<Record<number, { method: 'meetup' | 'delivery'; location: string; time: string }>>({})
  const [savingLeg, setSavingLeg] = useState<number | null>(null)
  const { isOpen: isLegsOpen, onToggle: onLegsToggle } = useDisclosure({ defaultIsOpen: false })
  const toast = useToast()

  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const participantBg = useColorModeValue('blue.50', 'blue.900')
  const participantBorder = useColorModeValue('blue.200', 'blue.700')

  // Countdown timer
  useEffect(() => {
    if (!multiWayTrade.expires_at) return
    const tick = () => setTimeLeft(formatTimeLeft(multiWayTrade.expires_at!))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [multiWayTrade.expires_at])

  // Fetch legs when the chain is active/accepted
  useEffect(() => {
    if (!isOpen) return
    const chainId = multiWayTrade.loop_id
    if (!chainId || !['active', 'user3_accepted'].includes(multiWayTrade.status as string)) return
    getChainLegs(chainId)
      .then((data) => {
        const legList: any[] = data?.legs || []
        setLegs(legList)
        // Seed form state from existing values
        const forms: Record<number, { method: 'meetup' | 'delivery'; location: string; time: string }> = {}
        legList.forEach((leg: any) => {
          forms[leg.id] = {
            method: leg.handoff_method || 'meetup',
            location: leg.handoff_location || '',
            time: leg.handoff_time || '',
          }
        })
        setLegForms(forms)
      })
      .catch(() => {/* non-critical, legs section simply won't render */})
  }, [isOpen, multiWayTrade.loop_id, multiWayTrade.status])

  const handleSaveLegHandoff = async (legId: number) => {
    const form = legForms[legId]
    if (!form) return
    setSavingLeg(legId)
    try {
      await updateLegHandoff(legId, form.method, form.location, form.time)
      toast({ id: `leg-${legId}-saved`, title: 'Handoff saved', status: 'success', duration: 2000 })
    } catch {
      toast({ id: `leg-${legId}-err`, title: 'Failed to save handoff', status: 'error', duration: 3000 })
    } finally {
      setSavingLeg(null)
    }
  }

  const handleAccept = async () => {
    try {
      setLoading(true)
      setSelectedAction('accept')
      await acceptMultiWayTrade(multiWayTrade.loop_id)
      toast({
        id: "multiwaytrademodal-success",
        title: 'Success',
        description: 'You accepted this multi-way trade opportunity',
        status: 'success',
      })
      onTradeCompleted?.()
      onClose()
    } catch (error: any) {
      toast({
        id: "multiwaytrademodal-error",
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
      toast({
        id: "multiwaytrademodal-declined",
        title: 'Declined',
        description: 'You declined this multi-way trade',
        status: 'info',
      })
      onClose()
    } catch (error: any) {
      toast({
        id: "multiwaytrademodal-error-2",
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
      toast({
        id: "multiwaytrademodal-success-2",
        title: 'Success',
        description: 'Multi-way trade executed successfully!',
        status: 'success',
      })
      onTradeCompleted?.()
      onClose()
    } catch (error: any) {
      toast({
        id: "multiwaytrademodal-error-3",
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
      toast({
        id: "multiwaytrademodal-cancel-success",
        title: 'Loop cancelled',
        description: 'This multi-way loop has been cancelled.',
        status: 'info',
      })
      onTradeCompleted?.()
      onClose()
    } catch (error: any) {
      toast({
        id: "multiwaytrademodal-cancel-error",
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
      toast({
        id: "multiwaytrademodal-reinvite-success",
        title: 'Loop reinvited',
        description: 'Participants can hop in again.',
        status: 'success',
      })
      onTradeCompleted?.()
      onClose()
    } catch (error: any) {
      toast({
        id: "multiwaytrademodal-reinvite-error",
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to reinvite loop',
        status: 'error',
      })
    } finally {
      setLoading(false)
      setSelectedAction(null)
    }
  }

  const statusColorScheme = (status: string) => {
    switch (status) {
      case 'pending': return 'yellow'
      case 'accepted': return 'green'
      case 'declined': return 'red'
      case 'completed': return 'cyan'
      case 'in_progress': return 'blue'
      case 'disputed': return 'orange'
      default: return 'gray'
    }
  }

  const sortedParticipants = [...multiWayTrade.participants].sort(
    (a, b) => a.position_in_loop - b.position_in_loop
  )

  // Chain health indicator — computed from edges
  const completedLegs = multiWayTrade.edges.filter(e => e.status === 'completed').length
  const totalLegs = multiWayTrade.edges.length
  const healthPct = totalLegs > 0 ? Math.round((completedLegs / totalLegs) * 100) : 0

  // Show Execute button only when the overall trade is active AND every participant has accepted.
  const canExecute = multiWayTrade.status === 'active' && sortedParticipants.every(p => p.trade_status === 'accepted')

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" isCentered scrollBehavior="inside">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg={cardBg} maxH="90vh" overflowY="auto">
        <ModalHeader borderBottomWidth="1px" borderColor={borderColor}>
          <VStack align="start" spacing={2}>
            <HStack justify="space-between" w="full">
              <Heading size="md">
                {sortedParticipants.length}-Way Trade Chain
              </Heading>
              <Badge colorScheme={statusColorScheme(multiWayTrade.status)}>
                {multiWayTrade.status}
              </Badge>
            </HStack>

            {/* Chain health indicator */}
            {totalLegs > 0 && (
              <Box w="full">
                <HStack justify="space-between" mb={1}>
                  <Text fontSize="xs" color="gray.600">
                    {completedLegs} of {totalLegs} legs complete
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

            {/* Expiration countdown */}
            {timeLeft && (
              <HStack spacing={1}>
                <Icon as={FaClock} color={timeLeft === 'Expired' ? 'red.500' : 'orange.400'} boxSize={3} />
                <Text fontSize="xs" color={timeLeft === 'Expired' ? 'red.500' : 'orange.600'} fontWeight="medium">
                  {timeLeft}
                </Text>
              </HStack>
            )}
          </VStack>
        </ModalHeader>

        <ModalCloseButton />

        <ModalBody py={6}>
          <VStack spacing={6} align="stretch">
            {/* Trade Chain Visualization */}
            <Box>
              <Heading size="sm" mb={4}>
                Trade Flow
              </Heading>
              <VStack spacing={3} align="start" pl={4}>
                {multiWayTrade.edges.map((edge, idx) => (
                  <Box key={idx} w="full">
                    <HStack spacing={2} mb={2}>
                      <Badge colorScheme="blue" variant="subtle">
                        Trade {idx + 1}
                      </Badge>
                      <Text fontSize="sm" fontWeight="medium">
                        {edge.from_user_name} offers to {edge.to_user_name}
                      </Text>
                    </HStack>
                    <HStack spacing={3} pl={4}>
                      <Icon as={FaBox} color="orange.500" />
                      <Text fontSize="sm" color="gray.600">
                        {edge.product_title}
                      </Text>
                      <Badge size="sm" colorScheme={statusColorScheme(edge.status || 'pending')}>
                        {edge.status || 'pending'}
                      </Badge>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            </Box>

            <Divider />

            {/* Participants Details */}
            <Box>
              <Heading size="sm" mb={4}>
                Participants ({sortedParticipants.length})
              </Heading>
              <Grid
                templateColumns={{ base: '1fr', md: '1fr 1fr' }}
                gap={4}
              >
                {sortedParticipants.map((participant, idx) => (
                  <Card
                    key={idx}
                    bg={participantBg}
                    borderColor={participantBorder}
                    borderWidth="1px"
                  >
                    <CardBody>
                      <VStack align="start" spacing={3}>
                        <HStack spacing={2}>
                          <Badge colorScheme="purple">
                            Position {participant.position_in_loop + 1}
                          </Badge>
                          <Badge colorScheme={statusColorScheme(participant.trade_status)}>
                            {participant.trade_status}
                          </Badge>
                        </HStack>
                        <HStack spacing={3} w="full">
                          <Avatar name={participant.user_name} size="sm" bg="brand.500" />
                          <VStack align="start" spacing={0}>
                            <Text fontWeight="semibold">{participant.user_name}</Text>
                            <Text fontSize="xs" color="gray.600">
                              User ID: {participant.user_id}
                            </Text>
                          </VStack>
                        </HStack>
                        <Box w="full">
                          <HStack spacing={2} mb={2}>
                            <Icon as={FaBox} fontSize="sm" />
                            <Text fontSize="sm" fontWeight="medium">Product:</Text>
                          </HStack>
                          <Box pl={6} borderLeftWidth="2px" borderColor="brand.200">
                            {participant.product_image && (
                              <Image
                                src={participant.product_image}
                                alt={participant.product_title}
                                maxH="80px"
                                objectFit="cover"
                                borderRadius="md"
                                mb={2}
                              />
                            )}
                            <Text fontSize="sm" fontWeight="semibold">
                              {participant.product_title}
                            </Text>
                            <Text fontSize="xs" color="gray.600">
                              Product ID: {participant.product_id}
                            </Text>
                          </Box>
                        </Box>
                        <Box w="full" fontSize="xs" color="gray.500">
                          Trade ID: <Badge fontSize="xs">{participant.trade_id}</Badge>
                        </Box>
                      </VStack>
                    </CardBody>
                  </Card>
                ))}
              </Grid>
            </Box>

            {/* Per-leg handoff configuration (only for active/accepted chains) */}
            {legs.length > 0 && (
              <>
                <Divider />
                <Box>
                  <HStack
                    justify="space-between"
                    cursor="pointer"
                    onClick={onLegsToggle}
                    mb={isLegsOpen ? 4 : 0}
                  >
                    <Heading size="sm">
                      Arrange Handoffs ({legs.length} legs)
                    </Heading>
                    <Icon
                      as={FaChevronDown}
                      transition="transform 0.2s"
                      transform={isLegsOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
                    />
                  </HStack>
                  <Collapse in={isLegsOpen} animateOpacity>
                    <VStack spacing={4} align="stretch">
                      {legs.map((leg: any) => (
                        <Box
                          key={leg.id}
                          p={4}
                          borderWidth="1px"
                          borderColor={borderColor}
                          borderRadius="md"
                        >
                          <HStack justify="space-between" mb={3}>
                            <Text fontSize="sm" fontWeight="semibold">
                              Leg {leg.leg_index + 1}: User {leg.from_user_id} → User {leg.to_user_id}
                            </Text>
                            <Badge colorScheme={statusColorScheme(leg.status)}>
                              {leg.status}
                            </Badge>
                          </HStack>
                          {leg.status !== 'completed' && leg.status !== 'cancelled' && (
                            <VStack spacing={3} align="stretch">
                              <FormControl>
                                <FormLabel fontSize="xs">Handoff method</FormLabel>
                                <Select
                                  size="sm"
                                  value={legForms[leg.id]?.method || 'meetup'}
                                  onChange={(e) =>
                                    setLegForms(prev => ({
                                      ...prev,
                                      [leg.id]: { ...prev[leg.id], method: e.target.value as 'meetup' | 'delivery' },
                                    }))
                                  }
                                >
                                  <option value="meetup">Meetup</option>
                                  <option value="delivery">Delivery</option>
                                </Select>
                              </FormControl>
                              <FormControl>
                                <FormLabel fontSize="xs">
                                  <HStack spacing={1}>
                                    <Icon as={FaMapMarkerAlt} />
                                    <span>Location / address</span>
                                  </HStack>
                                </FormLabel>
                                <Input
                                  size="sm"
                                  placeholder={legForms[leg.id]?.method === 'delivery' ? 'Delivery address' : 'Meetup spot'}
                                  value={legForms[leg.id]?.location || ''}
                                  onChange={(e) =>
                                    setLegForms(prev => ({
                                      ...prev,
                                      [leg.id]: { ...prev[leg.id], location: e.target.value },
                                    }))
                                  }
                                />
                              </FormControl>
                              <FormControl>
                                <FormLabel fontSize="xs">
                                  <HStack spacing={1}>
                                    <Icon as={FaClock} />
                                    <span>Date / time</span>
                                  </HStack>
                                </FormLabel>
                                <Input
                                  size="sm"
                                  placeholder="e.g. Saturday 3pm"
                                  value={legForms[leg.id]?.time || ''}
                                  onChange={(e) =>
                                    setLegForms(prev => ({
                                      ...prev,
                                      [leg.id]: { ...prev[leg.id], time: e.target.value },
                                    }))
                                  }
                                />
                              </FormControl>
                              <Button
                                size="xs"
                                colorScheme="blue"
                                alignSelf="flex-end"
                                isLoading={savingLeg === leg.id}
                                onClick={() => handleSaveLegHandoff(leg.id)}
                              >
                                Save
                              </Button>
                            </VStack>
                          )}
                          {(leg.handoff_location || leg.handoff_time) && leg.status === 'completed' && (
                            <VStack align="start" spacing={1} fontSize="xs" color="gray.600">
                              {leg.handoff_location && <Text>📍 {leg.handoff_location}</Text>}
                              {leg.handoff_time && <Text>🕐 {leg.handoff_time}</Text>}
                            </VStack>
                          )}
                        </Box>
                      ))}
                    </VStack>
                  </Collapse>
                </Box>
              </>
            )}

            {multiWayTrade.total_value && (
              <>
                <Divider />
                <HStack justify="space-between" bg={useColorModeValue('gray.50', 'gray.700')} p={3} borderRadius="md">
                  <Text fontWeight="semibold">Estimated Total Value:</Text>
                  <Text fontSize="lg" fontWeight="bold" color="green.500">
                    ₱{multiWayTrade.total_value.toFixed(2)}
                  </Text>
                </HStack>
              </>
            )}

            <Box bg="blue.50" borderLeftWidth="4px" borderColor="blue.500" p={3} borderRadius="md">
              <Text fontSize="sm" color="blue.900">
                <strong>How it works:</strong> Once all participants accept, the trades will be automatically synchronized and completed. Everyone gets the product they wanted in this chain!
              </Text>
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter borderTopWidth="1px" borderColor={borderColor} gap={3}>
          <Stack direction={{ base: 'column', sm: 'row' }} w="full" spacing={2}>
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
                  flex={1}
                  colorScheme="gray"
                  variant="outline"
                  isDisabled={loading}
                  isLoading={selectedAction === 'cancel' && loading}
                  onClick={handleCancelLoop}
                >
                  Cancel Loop
                </Button>
                <Button
                  flex={1}
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
          </Stack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default MultiWayTradeModal
