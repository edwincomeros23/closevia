import React, { useMemo, useState } from 'react'
import {
  Box,
  VStack,
  HStack,
  Card,
  CardBody,
  Avatar,
  Text,
  Badge,
  Button,
  Icon,
  Heading,
  Flex,
  SimpleGrid,
  Image,
  Center,
  Divider,
  useColorModeValue,
  Progress,
  Tooltip,
  Collapse,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react'
import { FaArrowRight, FaCheckCircle, FaUsers, FaLightbulb, FaShieldAlt, FaTrophy, FaChevronDown } from 'react-icons/fa'

// Animation for arrow flow using inline CSS
const arrowFlowStyle = `
  @keyframes arrowFlow {
    0% { transform: translateX(-4px); opacity: 0.6; }
    50% { transform: translateX(4px); opacity: 1; }
    100% { transform: translateX(-4px); opacity: 0.6; }
  }
`

interface TradeParticipant {
  id: number
  user_name: string
  user_avatar?: string
  product_id: number
  product_title: string
  product_image?: string
  wants_product_id?: number
  wants_user_id?: number
}

interface MultiWayTradeUIProps {
  participants: TradeParticipant[]
  onJoinTrade?: () => void
  onViewDetails?: () => void
  onDecline?: (searchAgain?: boolean) => void
  isLoading?: boolean
  isChain?: boolean // Added to distinguish between loop and chain
  yourGive?: string
  yourGet?: string
  chainLabel?: string
}

const MultiWayTradeUI: React.FC<MultiWayTradeUIProps> = ({
  participants,
  onJoinTrade,
  onViewDetails,
  onDecline,
  isLoading = false,
  isChain = false,
  yourGive,
  yourGet,
  chainLabel,
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const loopBg = useColorModeValue('blue.50', 'blue.900')
  const loopBorderColor = useColorModeValue('blue.200', 'blue.700')
  const arrowColor = useColorModeValue('blue.500', 'blue.400')

  // Validate participants count
  const validParticipants = useMemo(() => {
    if (!Array.isArray(participants) || participants.length < 3) {
      return []
    }
    // Cap at 5 participants
    return participants.slice(0, 5)
  }, [participants])

  if (validParticipants.length === 0) {
    return null
  }

  const loopLength = validParticipants.length
  const isComplete = loopLength >= 3

  // Get participant's avatar or fallback
  const getAvatarColor = (index: number) => {
    const colors = ['blue', 'green', 'purple', 'orange', 'pink']
    return colors[index % colors.length]
  }

  return (
    <VStack spacing={3} align="stretch" w="full">
      {/* Main Message - Collapsed View */}
      <Box
        p={4}
        bg={loopBg}
        borderRadius="lg"
        borderWidth="2px"
        borderColor={loopBorderColor}
        cursor="pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        transition="all 0.2s"
        _hover={{ shadow: 'md' }}
      >
        <HStack justify="space-between" align="center">
          <VStack align="start" spacing={1} flex={1}>
            <Text fontSize="sm" fontWeight="bold" color={useColorModeValue('blue.900', 'blue.100')}>
              {isChain 
                ? `Active Multi-Way Trade Match Found!` 
                : `Your "${validParticipants[0].product_title}" has found a trade loop`}
            </Text>
            <Text fontSize="xs" color={useColorModeValue('blue.800', 'blue.200')} noOfLines={1}>
              You give: {yourGive || 'Item in your trade offer'}
            </Text>
            <Text fontSize="xs" color={useColorModeValue('blue.800', 'blue.200')} noOfLines={1}>
              You get: {yourGet || 'Matched item from the loop'}
            </Text>
            <Text fontSize="xs" color={useColorModeValue('blue.700', 'blue.300')} noOfLines={1}>
              Chain: {chainLabel || 'Participants connected in a closed loop'}
            </Text>
            <HStack spacing={1}>
              <Badge colorScheme="purple" fontSize="10px">NEW</Badge>
              <Text fontSize="xs" color={useColorModeValue('blue.700', 'blue.200')}>
                {loopLength} participants ready to trade
              </Text>
            </HStack>
          </VStack>
          <Icon
            as={FaChevronDown}
            color={arrowColor}
            transition="transform 0.2s"
            transform={isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}
            boxSize={5}
          />
        </HStack>
      </Box>

      {/* Expanded View - Participant Details */}
      <Collapse in={isExpanded} animateOpacity>
        <VStack spacing={3} align="stretch">
          {/* Status Badge */}
          <HStack spacing={2}>
            <Badge
              colorScheme="green"
              px={3}
              py={1}
              borderRadius="full"
              fontSize="xs"
              fontWeight="bold"
              display="flex"
              alignItems="center"
              gap={1}
            >
              <Icon as={FaCheckCircle} boxSize={3} />
              {loopLength}-Way Loop Ready
            </Badge>
            <Badge colorScheme="blue" variant="subtle" fontSize="xs">
              Waiting for all participants to confirm
            </Badge>
          </HStack>

          {/* Participant Cards */}
          <Box
            overflowX={{ base: 'auto', md: 'visible' }}
            overflowY="visible"
            pb={2}
          >
            <HStack
              spacing={3}
              justify="space-between"
              align="flex-start"
              w="full"
              minW={loopLength > 3 ? `${loopLength * 110}px` : 'auto'}
            >
              {validParticipants.map((participant, index) => {
                const avatarColor = getAvatarColor(index)

                return (
                  <VStack key={`participant-${participant.id}`} spacing={1} minW="100px">
                    {/* Participant Card */}
                    <Card
                      variant="outline"
                      w="full"
                      borderWidth="2px"
                      borderColor={borderColor}
                      transition="all 0.3s"
                      _hover={{
                        shadow: 'md',
                        borderColor: arrowColor,
                        bg: useColorModeValue('blue.50', 'blue.900'),
                      }}
                    >
                      <CardBody p={2}>
                        {/* Avatar */}
                        <Avatar
                          name={participant.user_name}
                          size="xs"
                          bg={`${avatarColor}.500`}
                          color="white"
                          mx="auto"
                          mb={1}
                        />

                        {/* User Name */}
                        <Text fontSize="2xs" fontWeight="bold" textAlign="center" noOfLines={1}>
                          {participant.user_name}
                        </Text>

                        {/* Product Title */}
                        <Text fontSize="2xs" color="gray.600" textAlign="center" noOfLines={2} mt={1}>
                          {participant.product_title}
                        </Text>
                      </CardBody>
                    </Card>
                  </VStack>
                )
              })}
            </HStack>
          </Box>

          {/* Action Buttons */}
          <VStack spacing={2} w="full">
            <Button
              colorScheme="green"
              size="sm"
              onClick={onOpen}
              isLoading={isLoading}
              loadingText="Accepting..."
              w="full"
              fontWeight="bold"
            >
              {isChain ? 'Accept Multi-Way Match' : 'Join Loop'}
            </Button>
            
            <HStack spacing={2} w="full">
              <Button
                colorScheme="red"
                variant="outline"
                size="sm"
                onClick={() => onDecline?.(false)}
                flex={1}
                fontWeight="bold"
              >
                Decline
              </Button>
              {isChain && (
                <Button
                  colorScheme="brand"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDecline?.(true)}
                  flex={1}
                  fontSize="xs"
                  fontWeight="bold"
                  leftIcon={<Icon as={FaLightbulb} />}
                >
                  Find Next Match
                </Button>
              )}
            </HStack>
          </VStack>

          {/* Trust Indicators */}
          <HStack spacing={2} fontSize="2xs" color="gray.600" justify="center">
            <Icon as={FaShieldAlt} color="green.500" boxSize={3} />
            <Text>Verified participants • Secure trade</Text>
          </HStack>
        </VStack>
      </Collapse>

      {/* Join Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered>
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <ModalContent>
          <ModalHeader>
            <VStack align="start" spacing={1}>
              <Heading size="md" color={useColorModeValue('gray.800', 'gray.100')}>
                Join Trade Loop
              </Heading>
              <Text fontSize="sm" color="gray.600">
                You're about to join a {loopLength}-way trade loop
              </Text>
            </VStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* Your Item Info */}
              <Box
                p={3}
                bg={useColorModeValue('blue.50', 'blue.900')}
                borderRadius="lg"
                borderLeftWidth="4px"
                borderLeftColor="blue.400"
              >
                <Text fontSize="xs" fontWeight="bold" color="blue.800" mb={2}>
                  You give:
                </Text>
                <Text fontSize="sm" fontWeight="semibold" color={useColorModeValue('gray.800', 'gray.100')}>
                  {yourGive || validParticipants[0].product_title}
                </Text>
                <Text fontSize="xs" fontWeight="bold" color="blue.800" mt={3} mb={2}>
                  You get:
                </Text>
                <Text fontSize="sm" fontWeight="semibold" color={useColorModeValue('gray.800', 'gray.100')}>
                  {yourGet || 'Matched item from this loop'}
                </Text>
                <Text fontSize="xs" fontWeight="bold" color="blue.800" mt={3} mb={2}>
                  Chain:
                </Text>
                <Text fontSize="xs" color={useColorModeValue('blue.800', 'blue.200')}>
                  {chainLabel || 'Participants connected in a closed loop'}
                </Text>
              </Box>

              {/* Participants in Loop */}
              <Box>
                <Text fontSize="xs" fontWeight="bold" color="gray.600" mb={2}>
                  Participants in this loop:
                </Text>
                <VStack spacing={2} align="stretch">
                  {validParticipants.map((participant, index) => {
                    const avatarColor = getAvatarColor(index)
                    return (
                      <HStack key={`modal-participant-${participant.id}`} spacing={2} p={2} bg={useColorModeValue('gray.50', 'gray.700')} borderRadius="md">
                        <Avatar
                          name={participant.user_name}
                          size="sm"
                          bg={`${avatarColor}.500`}
                          color="white"
                        />
                        <VStack align="start" spacing={0}>
                          <Text fontSize="sm" fontWeight="semibold">
                            {participant.user_name}
                          </Text>
                          <Text fontSize="xs" color="gray.600">
                            {participant.product_title}
                          </Text>
                        </VStack>
                      </HStack>
                    )
                  })}
                </VStack>
              </Box>

              {/* Confirmation Message */}
              <Box
                p={3}
                bg={useColorModeValue('green.50', 'green.900')}
                borderRadius="lg"
                borderLeftWidth="4px"
                borderLeftColor="green.400"
              >
                <Text fontSize="xs" color={useColorModeValue('green.700', 'green.200')}>
                  <strong>By joining,</strong> your confirmation is recorded and the loop executes only after all participants confirm. You can cancel anytime before execution.
                </Text>
              </Box>
            </VStack>
          </ModalBody>

          <ModalFooter gap={2}>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="green"
              onClick={() => {
                onJoinTrade?.()
                onClose()
              }}
              isLoading={isLoading}
              loadingText="Joining..."
            >
              Confirm & Join
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  )
}

export default MultiWayTradeUI
