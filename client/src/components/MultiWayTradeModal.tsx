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
  Image,
  Icon,
  useToast,
  Heading,
  Avatar,
  useColorModeValue,
  Flex,
  Stack,
  Skeleton,
  useDisclosure,
} from '@chakra-ui/react'
import { FaArrowRight, FaCheck, FaTimes, FaClock } from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import { MultiWayTrade, MultiWayTradeParticipant } from '../types'
import { getProductUrl } from '../utils/productUtils'
import {
  acceptMultiWayTrade,
  declineMultiWayTrade,
  executeMultiWayTrade,
  cancelTradeLoop,
  reinviteTradeLoop,
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
  const navigate = useNavigate()
  const toast = useToast()

  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  // Countdown timer
  useEffect(() => {
    if (!multiWayTrade.expires_at) return
    const tick = () => setTimeLeft(formatTimeLeft(multiWayTrade.expires_at!))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [multiWayTrade.expires_at])

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

  const sortedParticipants = [...multiWayTrade.participants].sort(
    (a, b) => ((a as any).position_in_loop ?? (a as any).position ?? 0) - ((b as any).position_in_loop ?? (b as any).position ?? 0)
  )

  // Show Execute button only when the overall trade is active AND every participant has accepted.
  const canExecute = multiWayTrade.status === 'active' && sortedParticipants.every(p => p.trade_status === 'accepted')

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" isCentered scrollBehavior="inside">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg={cardBg} maxH="90vh" overflowY="auto">
        <ModalHeader borderBottomWidth="1px" borderColor={borderColor}>
          <VStack align="start" spacing={2} w="full">
            <HStack justify="space-between" w="full">
              <Heading size="md">
                {sortedParticipants.length}-Way Trade Loop
              </Heading>
            </HStack>

            {/* Expiration countdown - simple and clean */}
            {timeLeft && (
              <HStack spacing={2}>
                <Icon
                  as={FaClock}
                  color={timeLeft === 'Expired' ? 'red.500' : 'orange.400'}
                  boxSize={4}
                />
                <Text
                  fontSize="sm"
                  fontWeight="medium"
                  color={timeLeft === 'Expired' ? 'red.500' : 'orange.600'}
                >
                  {timeLeft}
                </Text>
              </HStack>
            )}
          </VStack>
        </ModalHeader>

        <ModalCloseButton />

        <ModalBody py={6}>
          <VStack spacing={8} align="stretch">
            {/* Visual Chain Flow - Circular/Linear Layout */}
            <Box w="full">
              {sortedParticipants.length <= 3 ? (
                /* Circular layout for 3-way trades */
                <Box w="full" minH="380px" position="relative" display="flex" alignItems="center" justifyContent="center">
                  {/* SVG Canvas for arrows */}
                  <Box position="absolute" w="full" h="380px">
                    <svg width="100%" height="100%" viewBox="0 0 400 380" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute' }}>
                      {/* Arrows forming the loop */}
                      {sortedParticipants.map((_, idx) => {
                        const nextIdx = (idx + 1) % sortedParticipants.length
                        const angles = sortedParticipants.length === 3
                          ? [90, 210, 330]
                          : Array.from({ length: sortedParticipants.length }, (_, i) => (i * 360) / sortedParticipants.length + 90)
                        const angle1 = (angles[idx] * Math.PI) / 180
                        const angle2 = (angles[nextIdx] * Math.PI) / 180
                        const radius = 120
                        const x1 = 200 + radius * Math.cos(angle1)
                        const y1 = 175 + radius * Math.sin(angle1)
                        const x2 = 200 + radius * Math.cos(angle2)
                        const y2 = 175 + radius * Math.sin(angle2)
                        return (
                          <line key={`arrow-${idx}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#cbd5e0" strokeWidth="2" markerEnd="url(#arrowhead)" />
                        )
                      })}
                      <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                          <polygon points="0 0, 10 3, 0 6" fill="#cbd5e0" />
                        </marker>
                      </defs>
                    </svg>
                  </Box>

                  {/* Participant Nodes */}
                  <Flex position="relative" w="full" h="380px" alignItems="center" justifyContent="center">
                    {sortedParticipants.map((participant, idx) => {
                      const angles = sortedParticipants.length === 3
                        ? [90, 210, 330]
                        : Array.from({ length: sortedParticipants.length }, (_, i) => (i * 360) / sortedParticipants.length + 90)
                      const angle = (angles[idx] * Math.PI) / 180
                      const radius = 120
                      const x = radius * Math.cos(angle)
                      const y = radius * Math.sin(angle)
                      const isAccepted = ['accepted', 'user3_accepted', 'active', 'multiway_active'].includes(participant.trade_status)
                      
                      return (
                        <Box
                          key={idx}
                          position="absolute"
                          left="50%"
                          top="50%"
                          transform={`translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`}
                          display="flex"
                          flexDirection="column"
                          alignItems="center"
                          gap={3}
                          w="120px"
                        >
                          {/* Node Container */}
                          <Box
                            position="relative"
                            borderRadius="full"
                            borderWidth="3px"
                            borderColor={isAccepted ? 'green.400' : 'gray.300'}
                            bg={cardBg}
                            p={2}
                            w="110px"
                            h="110px"
                            display="flex"
                            flexDirection="column"
                            alignItems="center"
                            justifyContent="center"
                            gap={1}
                            shadow="md"
                          >
                            {/* Status Indicator */}
                            <Box
                              position="absolute"
                              top="-12px"
                              right="-12px"
                              borderRadius="full"
                              bg={isAccepted ? 'green.500' : 'gray.400'}
                              w="32px"
                              h="32px"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              color="white"
                              fontSize="18px"
                              fontWeight="bold"
                              shadow="md"
                              borderWidth="2px"
                              borderColor={cardBg}
                            >
                              {isAccepted ? '✓' : '●'}
                            </Box>

                            {/* Avatar - Clickable to open profile */}
                            <Box
                              as="button"
                              onClick={() => navigate(getUserProfileUrl(participant.user_id, participant.user_slug))}
                              cursor="pointer"
                              _hover={{ opacity: 0.8 }}
                              border="none"
                              p={0}
                              bg="transparent"
                            >
                              <Avatar
                                name={participant.user_name}
                                size="lg"
                                bg="brand.500"
                              />
                            </Box>

                            {/* Name */}
                            <Text fontSize="11px" fontWeight="semibold" textAlign="center" noOfLines={2}>
                              {participant.user_name}
                            </Text>
                          </Box>

                          {/* Product Info Below Node */}
                          <Box w="full" textAlign="center">
                            {/* "Gives:" label */}
                            <Text fontSize="9px" fontWeight="bold" color="gray.600" mb={1}>
                              Gives:
                            </Text>
                            
                            {participant.product_image && (
                              <Image
                                src={participant.product_image}
                                alt={participant.product_title}
                                maxH="70px"
                                maxW="full"
                                objectFit="cover"
                                borderRadius="md"
                                mb={1}
                              />
                            )}
                            <Text fontSize="10px" fontWeight="medium" noOfLines={2} color="gray.700">
                              {participant.product_id ? (
                                <Box
                                  as="button"
                                  onClick={() => navigate(getProductUrl({ id: participant.product_id, slug: participant.product_slug } as any))}
                                  cursor="pointer"
                                  color="blue.600"
                                  _hover={{ textDecoration: 'underline' }}
                                  fontWeight="semibold"
                                  border="none"
                                  p={0}
                                  bg="transparent"
                                >
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
                          {/* Participant Node */}
                          <VStack spacing={2}>
                            <Box
                              position="relative"
                              borderRadius="lg"
                              borderWidth="3px"
                              borderColor={isAccepted ? 'green.400' : 'gray.300'}
                              bg={cardBg}
                              p={2}
                              w="100px"
                              display="flex"
                              flexDirection="column"
                              alignItems="center"
                              gap={2}
                              shadow="md"
                            >
                              {/* Status Indicator */}
                              <Box
                                position="absolute"
                                top="-12px"
                                right="-12px"
                                borderRadius="full"
                                bg={isAccepted ? 'green.500' : 'gray.400'}
                                w="28px"
                                h="28px"
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                color="white"
                                fontSize="14px"
                                fontWeight="bold"
                                shadow="md"
                                borderWidth="2px"
                                borderColor={cardBg}
                              >
                                {isAccepted ? '✓' : '●'}
                              </Box>

                              {/* Avatar - Clickable to open profile */}
                              <Box
                                as="button"
                                onClick={() => navigate(getUserProfileUrl(participant.user_id, participant.user_slug))}
                                cursor="pointer"
                                _hover={{ opacity: 0.8 }}
                                border="none"
                                p={0}
                                bg="transparent"
                              >
                                <Avatar
                                  name={participant.user_name}
                                  size="md"
                                  bg="brand.500"
                                />
                              </Box>

                              {/* Name */}
                              <Text fontSize="10px" fontWeight="semibold" textAlign="center" noOfLines={2}>
                                {participant.user_name}
                              </Text>

                              {/* "Gives:" label */}
                              <Text fontSize="8px" fontWeight="bold" color="gray.600">
                                Gives:
                              </Text>

                              {/* Product */}
                              {participant.product_image && (
                                <Image
                                  src={participant.product_image}
                                  alt={participant.product_title}
                                  maxH="45px"
                                  maxW="full"
                                  objectFit="cover"
                                  borderRadius="sm"
                                />
                              )}
                            </Box>

                            {/* Clickable product name */}
                            <Text fontSize="9px" fontWeight="medium" textAlign="center" noOfLines={2} w="100px">
                              {participant.product_id ? (
                                <Box
                                  as="button"
                                  onClick={() => navigate(getProductUrl({ id: participant.product_id, slug: participant.product_slug } as any))}
                                  cursor="pointer"
                                  color="blue.600"
                                  _hover={{ textDecoration: 'underline' }}
                                  fontWeight="semibold"
                                  border="none"
                                  p={0}
                                  bg="transparent"
                                >
                                  {participant.product_title}
                                </Box>
                              ) : (
                                participant.product_title
                              )}
                            </Text>
                          </VStack>

                          {/* Arrow to next */}
                          {idx < sortedParticipants.length - 1 && (
                            <Icon as={FaArrowRight} boxSize={5} color="orange.400" mt={1} />
                          )}

                          {/* Loop closure for last participant */}
                          {idx === sortedParticipants.length - 1 && (
                            <Box ml={2} mt={-4}>
                              <Icon as={FaArrowRight} boxSize={5} color="orange.400" transform="rotate(45deg)" />
                            </Box>
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
              <Text fontSize="sm" color="blue.900">
                <strong>Trade Loop:</strong> {sortedParticipants.length}-way exchange. <strong>✓ = Accepted</strong> • <strong>● = Pending</strong>
              </Text>
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter borderTopWidth="1px" borderColor={borderColor} gap={3}>
          <Stack direction={{ base: 'column', sm: 'row' }} w="full" spacing={2}>
            {multiWayTrade.status === 'user3_accepted' ? (
              <>
                <Badge colorScheme="green" fontSize="sm" px={4} py={2} borderRadius="md" textAlign="center" flex={1}>
                  All participants have accepted
                </Badge>
                {canManage && (
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
                )}
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
              </>
            )}
          </Stack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default MultiWayTradeModal
