import React, { useState, useEffect, useRef, useMemo } from 'react'
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
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Progress,
  Input,
  InputGroup,
  InputLeftElement,
  FormControl,
  FormLabel,
  Grid,
} from '@chakra-ui/react'
import VerifiedAvatar from './VerifiedAvatar'
import { FaMapMarkerAlt, FaCheckCircle, FaClock, FaHandshake, FaPaperPlane, FaTruck, FaStar, FaStore } from 'react-icons/fa'
import {
  FiMapPin,
  FiPhone,
  FiTruck,
  FiDollarSign,
  FiUpload,
  FiCheck,
  FiClock,
  FiPackage,
} from 'react-icons/fi'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix generic leaflet icon
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

import { Trade, Product, TradeOption, Delivery } from '../types'
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
  onTradeUpdate?: (updatedTrade: Trade) => void
}

interface MeetupLocation {
  name: string
  address: string
  type: 'cafe' | 'mall' | 'public' | 'other'
  lat?: number
  lng?: number
  isPartner?: boolean
}

interface DeliveryState {
  deliveryType: 'standard' | 'express' | 'meetup'
  paymentMethod: 'online' | 'cod' | 'wallet'
  paymentConfirmed: boolean
  buyerConfirmedReceipt: boolean
  sellerConfirmedDelivery: boolean
  deliveryInstructions: string
  senderLocation?: string
  receiverLocation?: string
  assignedRider?: {
    name: string
    phone: string
  }
}

type TradeProgressStage = 'meetup_confirmed' | 'trade_in_progress' | 'completed'

const PROGRESS_STEPS = [
  { id: 'meetup_confirmed', label: 'Meetup Confirmed', icon: FaMapMarkerAlt, description: 'Location confirmed by both parties' },
  { id: 'trade_in_progress', label: 'Trade in Progress', icon: FaClock, description: 'Exchange is happening' },
  { id: 'completed', label: 'Trade Completed', icon: FaCheckCircle, description: 'Trade finished and rated' },
]

interface TradeProgressIndicatorProps {
  trade: Trade | null
}

const TradeProgressIndicator: React.FC<TradeProgressIndicatorProps> = ({ trade }) => {
  const completedBg = useColorModeValue('green.500', 'green.600')
  const activeBg = useColorModeValue('brand.500', 'brand.600')
  const inactiveBg = useColorModeValue('gray.300', 'gray.600')
  const textColor = useColorModeValue('gray.800', 'gray.100')
  const descriptionColor = useColorModeValue('gray.600', 'gray.400')

  const getTradeProgressStage = (): TradeProgressStage => {
    if (trade?.status === 'completed') return 'completed'

    // For delivery trades, mark as trade_in_progress when active
    if (trade?.trade_option === 'delivery' && trade?.status === 'active') {
      return 'trade_in_progress'
    }

    // For meetup trades, only mark as trade_in_progress if BOTH parties confirmed meetup
    const bothConfirmed = (trade as any)?.meetup_confirmed ||
      ((trade as any)?.buyer_meetup_confirmed && (trade as any)?.seller_meetup_confirmed)

    if (bothConfirmed && trade?.status === 'active') {
      return 'trade_in_progress'
    }

    // Default to meetup_confirmed (but this is just the stage name, not actual status)
    // The stepper will show this as inactive/pending until both confirm
    return 'meetup_confirmed'
  }

  const currentStage = getTradeProgressStage()
  const currentStepIndex = PROGRESS_STEPS.findIndex(s => s.id === currentStage)

  // Fix: Only mark steps as 'active' if they are truly reached
  const getStepStatus = (stepIndex: number): 'completed' | 'active' | 'inactive' => {
    // Step 0 logic depends on trade type
    if (stepIndex === 0) {
      if (trade?.trade_option === 'delivery') {
        // For delivery trades, step 0 is active when trade becomes active
        return trade?.status === 'active' ? 'active' : 'inactive'
      } else {
        // For meetup trades, step 0 is active when both parties confirm meetup
        const bothConfirmed = trade?.meetup_confirmed || (trade?.buyer_meetup_confirmed && trade?.seller_meetup_confirmed)
        return bothConfirmed ? 'active' : 'inactive'
      }
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

interface DeliveryTabProps {
  deliveryState: DeliveryState
  setDeliveryState: React.Dispatch<React.SetStateAction<DeliveryState>>
  deliveryOptions: Record<string, { time: string; fee: number; icon: string }>
  paymentMethods: Record<string, { label: string; icon: string; color: string }>
  requestedProduct: Product | null
  trade: Trade | null
  isUserSeller: boolean
  isUserBuyer: boolean
  setIsReviewModalOpen: (open: boolean) => void
  handleConfirmPayment: () => Promise<void>
  handleConfirmDelivery: () => Promise<void>
  saveDeliveryState: (updates: Partial<DeliveryState>) => Promise<void>
  confirmingPayment: boolean
  linkedDelivery: Delivery | null
}

const DeliveryTab: React.FC<DeliveryTabProps> = ({
  deliveryState,
  setDeliveryState,
  deliveryOptions,
  paymentMethods,
  requestedProduct,
  trade,
  isUserSeller,
  isUserBuyer,
  handleConfirmPayment,
  handleConfirmDelivery,
  saveDeliveryState,
  setIsReviewModalOpen,
  confirmingPayment,
  linkedDelivery,
}) => {
  const bothConfirmed = deliveryState.buyerConfirmedReceipt && deliveryState.sellerConfirmedDelivery
  const deliveryCompleted = linkedDelivery?.status === 'delivered'
  const totalCost = (requestedProduct?.price || 0) + deliveryOptions[deliveryState.deliveryType].fee
  const deliveryStatus = linkedDelivery?.status || 'pending'
  const deliveryStatusColor =
    deliveryCompleted ? 'green'
      : deliveryStatus === 'in_transit' ? 'orange'
        : deliveryStatus === 'picked_up' ? 'purple'
          : deliveryStatus === 'claimed' ? 'blue'
            : 'gray'

  const timelineSteps = [
    {
      id: 'setup',
      title: 'Setup',
      detail: `${deliveryOptions[deliveryState.deliveryType].time} • P${deliveryOptions[deliveryState.deliveryType].fee} fee`,
      complete: Boolean(deliveryState.deliveryType),
      current: !deliveryState.paymentConfirmed,
    },
    {
      id: 'payment',
      title: 'Payment',
      detail: `${paymentMethods[deliveryState.paymentMethod].label} • ${deliveryState.paymentConfirmed ? 'Confirmed' : 'Pending'}`,
      complete: deliveryState.paymentConfirmed,
      current: deliveryState.paymentConfirmed && !linkedDelivery,
    },
    {
      id: 'tracking',
      title: 'Delivery Tracking',
      detail: deliveryStatus.replace(/_/g, ' ').toUpperCase(),
      complete: deliveryCompleted,
      current: !!linkedDelivery && !deliveryCompleted,
    },
    {
      id: 'completion',
      title: 'Completion',
      detail: bothConfirmed ? 'Both parties confirmed' : 'Waiting for final confirmations',
      complete: bothConfirmed,
      current: (deliveryCompleted || deliveryState.paymentConfirmed) && !bothConfirmed,
    },
  ]

  return (
    <VStack spacing={4} align="stretch">
      {/* Always-visible delivery tracking first for glanceability */}
      <Card border="2px" borderColor={deliveryCompleted ? 'green.400' : 'blue.400'} borderRadius="lg">
        <CardBody>
          <VStack spacing={4} align="stretch">
            <HStack spacing={3}>
              <Icon as={FiTruck} boxSize={5} color={deliveryCompleted ? 'green.500' : 'blue.500'} />
              <Text fontWeight="bold" fontSize="md">Delivery Tracking</Text>
              <Badge colorScheme={deliveryStatusColor} fontSize="xs" ml="auto">
                {deliveryStatus.replace(/_/g, ' ').toUpperCase()}
              </Badge>
            </HStack>

            <Progress
              value={deliveryCompleted ? 100 : deliveryState.paymentConfirmed ? 50 : deliveryState.deliveryType ? 25 : 0}
              size="sm"
              colorScheme="blue"
              borderRadius="full"
            />

            <VStack align="stretch" spacing={0}>
              {timelineSteps.map((step, idx) => {
                const indicatorBg = step.complete ? 'green.500' : step.current ? 'blue.500' : 'gray.300'
                const lineColor = step.complete ? 'green.300' : 'gray.200'
                const isLast = idx === timelineSteps.length - 1
                return (
                  <HStack key={step.id} align="stretch" spacing={3} py={2}>
                    <VStack spacing={0} minW="14px">
                      <Box w="12px" h="12px" mt={1} borderRadius="full" bg={indicatorBg} />
                      {!isLast && <Box w="2px" flex={1} bg={lineColor} mt={1} />}
                    </VStack>
                    <VStack align="start" spacing={0} flex={1}>
                      <Text fontSize="sm" fontWeight={step.current ? 'bold' : 'semibold'}>{step.title}</Text>
                      <Text fontSize="xs" color="gray.600">{step.detail}</Text>
                    </VStack>
                  </HStack>
                )
              })}
            </VStack>

            <HStack spacing={2} flexWrap="wrap">
              <Badge colorScheme="blue" variant="subtle">Setup: {deliveryState.deliveryType}</Badge>
              <Badge colorScheme={deliveryState.paymentConfirmed ? 'green' : 'yellow'} variant="subtle">
                Payment: {deliveryState.paymentConfirmed ? 'Confirmed' : 'Pending'}
              </Badge>
              <Badge colorScheme="purple" variant="subtle">
                Method: {paymentMethods[deliveryState.paymentMethod].label}
              </Badge>
              <Badge colorScheme="brand" variant="subtle">Total: P{totalCost.toFixed(2)}</Badge>
            </HStack>

            {linkedDelivery?.rider_name ? (
              <Card variant="outline" borderColor="blue.300" bg="blue.50">
                <CardBody p={4}>
                  <VStack spacing={3} align="stretch">
                    <HStack spacing={3}>
                      <Avatar name={linkedDelivery.rider_name} size="md" bg="blue.500" color="white" />
                      <VStack align="start" spacing={0} flex={1}>
                        <Text fontWeight="semibold" fontSize="sm">{linkedDelivery.rider_name}</Text>
                        <Text fontSize="xs" color="gray.600">Assigned Rider</Text>
                      </VStack>
                      {linkedDelivery.rider_rating && (
                        <HStack spacing={1}>
                          <Icon as={FaStar} color="yellow.400" boxSize={3} />
                          <Text fontSize="xs" color="gray.600">{linkedDelivery.rider_rating.toFixed(1)}</Text>
                        </HStack>
                      )}
                    </HStack>
                    {linkedDelivery.rider_vehicle && (
                      <HStack spacing={2}>
                        <Icon as={FiTruck} color="blue.500" boxSize={4} />
                        <Text fontSize="xs" color="gray.700">{linkedDelivery.rider_vehicle}</Text>
                      </HStack>
                    )}
                  </VStack>
                </CardBody>
              </Card>
            ) : (
              <Box p={3} bg="yellow.50" borderRadius="md" borderWidth="1px" borderColor="yellow.200">
                <Text fontSize="sm" color="yellow.700">Waiting for a rider to be assigned...</Text>
              </Box>
            )}
          </VStack>
        </CardBody>
      </Card>

      <Card variant="outline" borderColor="blue.200">
        <CardBody>
          <VStack spacing={3} align="stretch">
            <Text fontWeight="semibold" fontSize="sm">Setup</Text>
            <Grid templateColumns="repeat(3, 1fr)" gap={3}>
              {Object.entries(deliveryOptions).map(([type, option]: [string, any]) => (
                <Card
                  key={`delivery-${type}`}
                  cursor="pointer"
                  borderWidth="2px"
                  borderColor={deliveryState.deliveryType === type ? 'blue.400' : 'gray.200'}
                  bg={deliveryState.deliveryType === type ? 'blue.50' : 'white'}
                  onClick={() => {
                    const newState = type as DeliveryState['deliveryType']
                    setDeliveryState(prev => ({ ...prev, deliveryType: newState }))
                    saveDeliveryState({ deliveryType: newState })
                  }}
                  transition="all 0.2s"
                  _hover={{ borderColor: 'blue.300', shadow: 'md' }}
                >
                  <CardBody p={3} textAlign="center">
                    <Text fontSize="xl" mb={1}>{option.icon}</Text>
                    <Text fontSize="xs" fontWeight="bold">{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
                    <Text fontSize="2xs" color="gray.600">{option.time}</Text>
                    <Badge colorScheme="blue" fontSize="2xs" mt={1}>P{option.fee}</Badge>
                  </CardBody>
                </Card>
              ))}
            </Grid>

            <Box>
              <FormLabel fontWeight="semibold" mb={2} fontSize="sm">Delivery Instructions</FormLabel>
              <Textarea
                value={deliveryState.deliveryInstructions}
                onChange={(e) => setDeliveryState(prev => ({ ...prev, deliveryInstructions: e.target.value }))}
                onBlur={() => saveDeliveryState({ deliveryInstructions: deliveryState.deliveryInstructions })}
                placeholder="e.g., Landmark: Red gate, Leave with guard, Do not leave in rain..."
                size="sm"
                rows={3}
                bg="white"
                borderWidth="1px"
              />
              <Text fontSize="xs" color="gray.500" mt={1}>{deliveryState.deliveryInstructions.length}/200 characters</Text>
            </Box>
          </VStack>
        </CardBody>
      </Card>

      <Card variant="outline" borderColor="green.200">
        <CardBody>
          <VStack spacing={3} align="stretch">
            <Text fontWeight="semibold" fontSize="sm">Payment</Text>
            <VStack spacing={2} align="stretch">
              {Object.entries(paymentMethods).map(([method, details]: [string, any]) => (
                <Card
                  key={`payment-${method}`}
                  cursor={deliveryState.paymentConfirmed ? 'not-allowed' : 'pointer'}
                  borderWidth="2px"
                  borderColor={deliveryState.paymentMethod === method ? 'green.400' : 'gray.200'}
                  bg={deliveryState.paymentMethod === method ? `${details.color}.50` : 'white'}
                  opacity={deliveryState.paymentConfirmed && deliveryState.paymentMethod !== method ? 0.5 : 1}
                  onClick={() => {
                    if (deliveryState.paymentConfirmed) return
                    const newMethod = method as DeliveryState['paymentMethod']
                    setDeliveryState(prev => ({ ...prev, paymentMethod: newMethod }))
                    saveDeliveryState({ paymentMethod: newMethod })
                  }}
                >
                  <CardBody p={3}>
                    <HStack justify="space-between">
                      <HStack spacing={3}>
                        <Text fontSize="lg">{details.icon}</Text>
                        <Text fontWeight="medium" fontSize="sm">{details.label}</Text>
                      </HStack>
                      {deliveryState.paymentMethod === method && <Icon as={FiCheck} color={`${details.color}.500`} boxSize={4} />}
                    </HStack>
                  </CardBody>
                </Card>
              ))}
            </VStack>

            <Button
              colorScheme="green"
              size="md"
              onClick={handleConfirmPayment}
              isDisabled={deliveryState.paymentConfirmed || confirmingPayment || !isUserBuyer}
              isLoading={confirmingPayment}
              loadingText="Confirming..."
              leftIcon={deliveryState.paymentConfirmed ? <FiCheck /> : undefined}
              w="full"
            >
              {deliveryState.paymentConfirmed
                ? `${paymentMethods[deliveryState.paymentMethod].label} Secured`
                : `Confirm ${paymentMethods[deliveryState.paymentMethod].label} Payment`}
            </Button>
          </VStack>
        </CardBody>
      </Card>

      <Card borderWidth="2px" borderColor={bothConfirmed ? 'green.400' : 'gray.200'} bg={bothConfirmed ? 'green.50' : 'white'}>
        <CardBody>
          <VStack spacing={4} align="stretch">
            <Text fontWeight="semibold" fontSize="sm">Completion</Text>

            {!deliveryState.paymentConfirmed && (
              <Box p={3} bg="yellow.50" borderRadius="md" borderLeftWidth="4px" borderLeftColor="yellow.400">
                <Text fontSize="sm" color="yellow.700">Complete payment to continue.</Text>
              </Box>
            )}

            {deliveryCompleted && ((isUserBuyer && !deliveryState.buyerConfirmedReceipt) || (isUserSeller && !deliveryState.sellerConfirmedDelivery)) && (
              <Button colorScheme="blue" onClick={handleConfirmDelivery} leftIcon={<FiCheck />}>
                {isUserBuyer ? 'Confirm Receipt' : 'Confirm Hand-off'}
              </Button>
            )}

            {(deliveryCompleted || (!linkedDelivery && ((deliveryState.paymentConfirmed && deliveryState.deliveryInstructions) || bothConfirmed))) && (
              <Button
                colorScheme="green"
                size="lg"
                onClick={() => setIsReviewModalOpen(true)}
                leftIcon={<FaStar />}
                w="full"
                transition="all 0.2s"
                _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
              >
                Review & Complete Trade
              </Button>
            )}
          </VStack>
        </CardBody>
      </Card>
    </VStack>
  )
}

interface ReviewTabProps {
  trade: Trade | null
  isUserBuyer: boolean
  isUserSeller: boolean
  user: any
  onStatusUpdate: () => void
}

const ReviewTab: React.FC<ReviewTabProps> = ({
  trade,
  isUserBuyer,
  isUserSeller,
  user,
  onStatusUpdate,
}) => {
  const toast = useToast()
  const [rating, setRating] = useState(5)
  const [feedback, setFeedback] = useState('')
  const [proofImage, setProofImage] = useState<string | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [completionStatus, setCompletionStatus] = useState<any>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)

  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  useEffect(() => {
    if (trade) {
      fetchCompletionStatus()
    }
  }, [trade])

  const fetchCompletionStatus = async () => {
    if (!trade) return
    try {
      setLoadingStatus(true)
      const response = await api.get(`/api/trades/${trade.id}`)
      const tradeData = response.data?.data
      setCompletionStatus({
        buyer_completed: !!tradeData?.buyer_completed,
        seller_completed: !!tradeData?.seller_completed,
        buyer_rating: tradeData?.buyer_rating,
        seller_rating: tradeData?.seller_rating,
        buyer_feedback: tradeData?.buyer_feedback,
        seller_feedback: tradeData?.seller_feedback,
      })
    } catch (error) {
      console.error('Failed to fetch completion status:', error)
    } finally {
      setLoadingStatus(false)
    }
  }

  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0]
      setProofFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setProofImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const submitReview = async () => {
    if (!trade || !rating || !feedback.trim()) {
      toast({
        id: "viewtrademodal-missing-information",
        title: 'Missing information',
        description: 'Please provide a rating and feedback.',
        status: 'warning',
      })
      return
    }

    try {
      setSubmitting(true)

      // Upload proof image first if provided
      let uploadedProofUrl: string | undefined
      if (proofFile) {
        const formData = new FormData()
        formData.append('image', proofFile)
        formData.append('type', 'trade_proof')
        const uploadRes = await api.post('/api/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        uploadedProofUrl = uploadRes.data?.data?.url
      }

      await api.put(`/api/trades/${trade.id}/complete`, {
        rating,
        feedback: feedback.trim(),
        proof_url: uploadedProofUrl || undefined,
      })

      toast({
        id: "viewtrademodal-review-submitted",
        title: 'Review submitted',
        description: 'Your review has been submitted successfully.',
        status: 'success',
      })

      // Reset form
      setRating(5)
      setFeedback('')
      setProofImage(null)
      setProofFile(null)

      // Refresh completion status
      await fetchCompletionStatus()
      onStatusUpdate()
    } catch (error: any) {
      console.error('Review submission error:', error)
      toast({
        id: "viewtrademodal-error",
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to submit review',
        status: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingStatus) {
    return <Spinner />
  }

  const userHasCompleted = isUserBuyer ? completionStatus?.buyer_completed : completionStatus?.seller_completed
  const otherPartyCompleted = isUserBuyer ? completionStatus?.seller_completed : completionStatus?.buyer_completed

  return (
    <VStack spacing={6} align="stretch">
      {/* Single Heading */}
      <Text fontWeight="semibold" fontSize="lg">
        Trade Review & Completion
      </Text>

      {/* Review Status Cards */}
      {completionStatus && (
        <SimpleGrid columns={2} spacing={4}>
          <Card bg={completionStatus.buyer_completed ? 'green.50' : 'gray.50'} borderWidth="1px" borderColor={borderColor}>
            <CardBody>
              <VStack spacing={3} textAlign="center">
                <Text fontWeight="semibold" fontSize="sm">Buyer Review</Text>
                <Badge colorScheme={completionStatus.buyer_completed ? 'green' : 'gray'}>
                  {completionStatus.buyer_completed ? '✓ Submitted' : 'Pending'}
                </Badge>
                {completionStatus.buyer_rating && (
                  <VStack spacing={1}>
                    <HStack spacing={0.5} justify="center">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Icon
                          key={`buyer-star-${star}`}
                          as={FaStar}
                          color={star <= completionStatus.buyer_rating ? 'yellow.400' : 'gray.300'}
                          boxSize={4}
                        />
                      ))}
                    </HStack>
                    <Text fontSize="xs" color="gray.600">
                      {completionStatus.buyer_rating}/5
                    </Text>
                  </VStack>
                )}
                {completionStatus.buyer_feedback && (
                  <Text fontSize="xs" color="gray.600" noOfLines={2} fontStyle="italic">
                    "{completionStatus.buyer_feedback}"
                  </Text>
                )}
              </VStack>
            </CardBody>
          </Card>

          <Card bg={completionStatus.seller_completed ? 'green.50' : 'gray.50'} borderWidth="1px" borderColor={borderColor}>
            <CardBody>
              <VStack spacing={3} textAlign="center">
                <Text fontWeight="semibold" fontSize="sm">Seller Review</Text>
                <Badge colorScheme={completionStatus.seller_completed ? 'green' : 'gray'}>
                  {completionStatus.seller_completed ? '✓ Submitted' : 'Pending'}
                </Badge>
                {completionStatus.seller_rating && (
                  <VStack spacing={1}>
                    <HStack spacing={0.5} justify="center">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Icon
                          key={`seller-star-${star}`}
                          as={FaStar}
                          color={star <= completionStatus.seller_rating ? 'yellow.400' : 'gray.300'}
                          boxSize={4}
                        />
                      ))}
                    </HStack>
                    <Text fontSize="xs" color="gray.600">
                      {completionStatus.seller_rating}/5
                    </Text>
                  </VStack>
                )}
                {completionStatus.seller_feedback && (
                  <Text fontSize="xs" color="gray.600" noOfLines={2} fontStyle="italic">
                    "{completionStatus.seller_feedback}"
                  </Text>
                )}
              </VStack>
            </CardBody>
          </Card>
        </SimpleGrid>
      )}

      {/* Review Form - Only show if current user hasn't completed */}
      {!userHasCompleted && (
        <Card borderWidth="2px" borderColor="blue.200" bg={useColorModeValue('blue.50', 'blue.900')}>
          <CardBody>
            <VStack spacing={5} align="stretch">
              <Text fontWeight="semibold" fontSize="md">
                Your Review
              </Text>

              {/* Rating */}
              <FormControl isRequired>
                <FormLabel fontSize="sm" fontWeight="semibold">Rating</FormLabel>
                <HStack spacing={2}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Icon
                      key={star}
                      as={FaStar}
                      color={star <= rating ? 'yellow.400' : 'gray.300'}
                      cursor="pointer"
                      onClick={() => setRating(star)}
                      boxSize={7}
                      transition="all 0.1s"
                      _hover={{ transform: 'scale(1.1)' }}
                    />
                  ))}
                  <Text fontSize="sm" fontWeight="semibold" ml={2}>
                    {rating}/5
                  </Text>
                </HStack>
              </FormControl>

              {/* Feedback */}
              <FormControl isRequired>
                <FormLabel fontSize="sm" fontWeight="semibold">Feedback</FormLabel>
                <Textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Share your experience with this trade..."
                  rows={4}
                  borderColor={borderColor}
                  _focus={{ borderColor: 'brand.500', boxShadow: '0 0 0 1px var(--chakra-colors-brand-500)' }}
                />
                <Text fontSize="xs" color="gray.500" mt={1}>
                  {feedback.length} characters
                </Text>
              </FormControl>

              {/* Proof Image */}
              <FormControl>
                <FormLabel fontSize="sm" fontWeight="semibold">Proof Image (Optional)</FormLabel>
                {proofImage ? (
                  <VStack spacing={3} align="stretch">
                    <Box position="relative" w="full" maxW="200px">
                      <Image
                        src={proofImage}
                        alt="Proof"
                        w="full"
                        maxH="150px"
                        objectFit="cover"
                        borderRadius="md"
                        borderWidth="2px"
                        borderColor="green.300"
                      />
                      <Icon
                        as={FiCheck}
                        position="absolute"
                        top={2}
                        right={2}
                        color="green.500"
                        boxSize={6}
                        bg="white"
                        borderRadius="full"
                        p={1}
                      />
                    </Box>
                    <Button
                      size="sm"
                      variant="outline"
                      colorScheme="blue"
                      onClick={() => document.getElementById('proof-upload-review')?.click()}
                    >
                      Change Image
                    </Button>
                  </VStack>
                ) : (
                  <Button
                    variant="outline"
                    colorScheme="blue"
                    onClick={() => document.getElementById('proof-upload-review')?.click()}
                    leftIcon={<FiUpload />}
                    w="full"
                  >
                    Upload Proof Image
                  </Button>
                )}
                <Input
                  type="file"
                  accept="image/*"
                  display="none"
                  id="proof-upload-review"
                  onChange={handleProofUpload}
                />
              </FormControl>

              {/* Submit Button */}
              <Button
                colorScheme="green"
                size="lg"
                onClick={submitReview}
                isLoading={submitting}
                isDisabled={!rating || !feedback.trim()}
                w="full"
                transition="all 0.2s"
                _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
              >
                Submit Review
              </Button>
            </VStack>
          </CardBody>
        </Card>
      )}

      {/* Both Completed Message */}
      {completionStatus?.buyer_completed && completionStatus?.seller_completed && (
        <Box p={4} bg="green.50" borderRadius="lg" borderWidth="2px" borderColor="green.300" textAlign="center">
          <Icon as={FiCheck} boxSize={8} color="green.500" mb={3} mx="auto" display="block" />
          <Text fontWeight="bold" color="green.700" mb={1} fontSize="lg">
            Trade Completed Successfully! 🎉
          </Text>
          <Text fontSize="sm" color="green.600">
            Both parties have submitted their reviews and feedback. Thank you for using Clovia!
          </Text>
        </Box>
      )}

      {/* One Party Completed Message */}
      {userHasCompleted && !otherPartyCompleted && (
        <Box p={4} bg="blue.50" borderRadius="lg" borderWidth="2px" borderColor="blue.300" textAlign="center">
          <Icon as={FaCheckCircle} boxSize={6} color="blue.500" mb={2} mx="auto" display="block" />
          <Text fontWeight="semibold" color="blue.700" mb={1}>
            Your review has been submitted ✓
          </Text>
          <Text fontSize="sm" color="blue.600">
            Waiting for the other party to complete their review...
          </Text>
        </Box>
      )}
    </VStack>
  )
}

const ViewTradeModal: React.FC<ViewTradeModalProps> = ({
  trade,
  isOpen,
  onClose,
  onStatusUpdate,
  onTradeUpdate,
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
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [confirmingMeetup, setConfirmingMeetup] = useState(false)
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [buyerMeetupConfirmed, setBuyerMeetupConfirmed] = useState(false)
  const [sellerMeetupConfirmed, setSellerMeetupConfirmed] = useState(false)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [deliveryState, setDeliveryState] = useState<DeliveryState>({
    deliveryType: 'standard',
    paymentMethod: 'online',
    paymentConfirmed: false,
    buyerConfirmedReceipt: false,
    sellerConfirmedDelivery: false,
    deliveryInstructions: '',
  })
  const [linkedDelivery, setLinkedDelivery] = useState<Delivery | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const isUserBuyer = !!(trade && user && trade.buyer_id === user.id)
  const isUserSeller = !!(trade && user && trade.seller_id === user.id)
  const tradingPartner = isUserBuyer
    ? trade?.seller_name || `User #${trade?.seller_id}`
    : trade?.buyer_name || `User #${trade?.buyer_id}`

  const suggestedLocations: MeetupLocation[] = [
    { name: 'Meet n Eat', address: 'Gov. Camins Ave, Zamboanga City', type: 'cafe', lat: 6.9150, lng: 122.0630, isPartner: true },
    { name: 'WMSU', address: 'Normal Road, Zamboanga City', type: 'public', lat: 6.9214, lng: 122.0790 },
    { name: 'SM Mindpro', address: 'La Purisima St, Zamboanga City', type: 'mall', lat: 6.9080, lng: 122.0745 },
    { name: 'KCC de Zamboanga', address: 'Gov. Camins Ave, Zamboanga City', type: 'mall', lat: 6.9142, lng: 122.0620 },
    { name: 'Amethyst Eatery', address: 'Zamboanga City', type: 'cafe', lat: 6.9125, lng: 122.0720, isPartner: true },
    { name: 'Paseo del Mar', address: 'Valderosa St, Zamboanga City', type: 'public', lat: 6.9030, lng: 122.0780 },
    { name: 'Local coffee shops', address: 'Various locations in Zamboanga', type: 'cafe', isPartner: true },
  ]

  // Helper compute distance in km using Haversine
  const getDistance = (lat1?: number, lon1?: number, lat2?: number, lon2?: number) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Find nearest location based on user coordinates
  const nearestLocationName = useMemo(() => {
    if (!user?.latitude || !user?.longitude) return 'WMSU'; // Fallback
    let nearest = '';
    let minDistance = Infinity;
    for (const loc of suggestedLocations) {
      const dist = getDistance(user.latitude, user.longitude, loc.lat, loc.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = loc.name;
      }
    }
    return nearest;
  }, [user?.latitude, user?.longitude])

  // Component to update map center
  const MapUpdater = ({ lat, lng }: { lat: number, lng: number }) => {
    const map = useMap()
    useEffect(() => {
      map.setView([lat, lng], 16, { animate: true })
    }, [lat, lng, map])
    return null
  }

  // Save delivery state to backend
  const saveDeliveryState = async (updates: Partial<DeliveryState>) => {
    if (!trade) return

    try {
      const payload: any = { action: 'update_delivery_state' }

      if (updates.deliveryType) payload.delivery_type = updates.deliveryType
      if (updates.paymentMethod) payload.payment_method = updates.paymentMethod
      if (updates.paymentConfirmed !== undefined) payload.payment_confirmed = updates.paymentConfirmed
      if (updates.buyerConfirmedReceipt !== undefined) payload.buyer_confirmed_receipt = updates.buyerConfirmedReceipt
      if (updates.sellerConfirmedDelivery !== undefined) payload.seller_confirmed_delivery = updates.sellerConfirmedDelivery
      if (updates.deliveryInstructions !== undefined) payload.delivery_instructions = updates.deliveryInstructions

      console.log('Sending delivery state payload:', payload, 'to trade:', trade.id)
      const response = await api.put(`/api/trades/${trade.id}`, payload)
      console.log('Delivery state update response:', response)

      // Update local trade state with the new delivery data
      if (trade && onTradeUpdate) {
        const updatedFields = Object.keys(updates).reduce((acc, key) => {
          const value = updates[key as keyof DeliveryState]
          if (value !== undefined) {
            // Map frontend field names to backend field names
            switch (key) {
              case 'deliveryType':
                acc.delivery_type = value as 'standard' | 'express' | 'meetup'
                break
              case 'paymentMethod':
                acc.payment_method = value as 'online' | 'cod' | 'wallet'
                break
              case 'paymentConfirmed':
                acc.payment_confirmed = value as boolean
                break
              case 'buyerConfirmedReceipt':
                acc.buyer_confirmed_receipt = value as boolean
                break
              case 'sellerConfirmedDelivery':
                acc.seller_confirmed_delivery = value as boolean
                break
              case 'deliveryInstructions':
                acc.delivery_instructions = value as string
                break
            }
          }
          return acc
        }, {} as any)

        const updatedTrade: Trade = {
          ...trade,
          ...updatedFields,
          updated_at: new Date().toISOString() // Force re-render
        }

        console.log('Updating trade with delivery fields:', updatedFields)
        console.log('Updated trade object:', updatedTrade)
        onTradeUpdate(updatedTrade)
      }

      // Call onStatusUpdate to refresh any parent state
      onStatusUpdate()
    } catch (error: any) {
      console.error('Failed to save delivery state:', error)
      if (error?.response?.data) {
        console.error('Backend error details:', error.response.data)
      }
      toast({
        id: "viewtrademodal-error-2",
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to save delivery state',
        status: 'error',
        duration: 4000,
        isClosable: true,
      })
    }
  }

  // Load delivery state from trade data when trade changes
  useEffect(() => {
    if (trade && trade.trade_option === 'delivery') {
      console.log('Loading delivery state from trade:', {
        delivery_type: trade.delivery_type,
        payment_method: trade.payment_method,
        payment_confirmed: trade.payment_confirmed,
        buyer_confirmed_receipt: trade.buyer_confirmed_receipt,
        seller_confirmed_delivery: trade.seller_confirmed_delivery
      })

      setDeliveryState(prev => ({
        ...prev,
        deliveryType: (trade.delivery_type as any) || 'standard',
        paymentMethod: (trade.payment_method as any) || 'online',
        paymentConfirmed: trade.payment_confirmed || false,
        buyerConfirmedReceipt: trade.buyer_confirmed_receipt || false,
        sellerConfirmedDelivery: trade.seller_confirmed_delivery || false,
        senderLocation: (trade as any).seller_location || 'Trader location - From product listing',
        receiverLocation: (trade as any).buyer_location || 'Buyer location - From user profile',
        assignedRider: {
          name: 'Wynry Perian (Mock Rider)',
          phone: '09991234567'
        }
      }))

      console.log('Delivery state loaded:', {
        deliveryType: (trade.delivery_type as any) || 'standard',
        paymentMethod: (trade.payment_method as any) || 'online',
        paymentConfirmed: trade.payment_confirmed || false,
        buyerConfirmedReceipt: trade.buyer_confirmed_receipt || false,
        sellerConfirmedDelivery: trade.seller_confirmed_delivery || false,
      })
    }
  }, [trade?.id, trade?.trade_option, trade?.updated_at])

  // Fetch trade messages
  useEffect(() => {
    if (isOpen && trade) {
      fetchMessages({ showLoading: true })
      fetchProducts()
      fetchMeetupStatus()

      // Poll for new messages every 3 seconds without flashing a loader
      messagesPollRef.current = setInterval(() => fetchMessages({ showLoading: false }), 3000)
      return () => {
        if (messagesPollRef.current) {
          clearInterval(messagesPollRef.current)
          messagesPollRef.current = null
        }
      }
    } else {
      setMessages([])
      setNewMessage('')
    }
  }, [isOpen, trade])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fetch linked delivery for delivery trades and poll for updates
  useEffect(() => {
    if (!trade || trade.trade_option !== 'delivery' || !isOpen) {
      setLinkedDelivery(null)
      return
    }
    // Only fetch when trade is active or later
    if (!['active', 'accepted', 'awaiting_confirmation', 'completed', 'auto_completed'].includes(trade.status)) {
      return
    }

    const fetchLinkedDelivery = async () => {
      try {
        const response = await api.get(`/api/trades/${trade.id}/delivery`)
        const data = response.data?.data || null
        setLinkedDelivery(data && data.id ? data : null)
      } catch (e) {
        console.log('No linked delivery found for trade', trade.id)
      }
    }

    fetchLinkedDelivery()
    // Poll every 10 seconds while delivery is in progress
    const interval = setInterval(fetchLinkedDelivery, 10000)
    return () => clearInterval(interval)
  }, [trade?.id, trade?.status, trade?.trade_option, isOpen])

  const fetchMessages = async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading
    if (!trade) return

    try {
      if (showLoading) setLoadingMessages(true)
      const response = await api.get(`/api/trades/${trade.id}/messages`)
      const data = response.data?.data || []
      const safeMessages = Array.isArray(data) ? data : []
      safeMessages.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      setMessages(safeMessages)
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    } finally {
      if (showLoading) setLoadingMessages(false)
    }
  }

  const fetchProducts = async () => {
    if (!trade) return

    try {
      setLoadingProducts(true)
      const requested = await getProduct(trade.target_product_id)
      setRequestedProduct(requested)

      const offeredIds = (trade.items || []).map((item: any) => item.product_id).filter(Boolean)
      const offeredResults = await Promise.all(offeredIds.map((pid: number) => getProduct(pid)))
      setOfferedProducts(offeredResults.filter(Boolean) as Product[])
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoadingProducts(false)
    }
  }

  const fetchMeetupStatus = async () => {
    if (!trade) return

    try {
      const response = await api.get(`/api/trades/${trade.id}`)
      const tradeData = response.data?.data

      // Set confirmation status based on backend data
      setBuyerMeetupConfirmed(!!(tradeData?.buyer_meetup_confirmed || tradeData?.meetup_confirmed_by_buyer))
      setSellerMeetupConfirmed(!!(tradeData?.seller_meetup_confirmed || tradeData?.meetup_confirmed_by_seller))

      // Also set selected location if it exists
      if (tradeData?.meetup_location) {
        setSelectedLocation(tradeData.meetup_location)
      }
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
      await fetchMessages({ showLoading: false })
    } catch (error: any) {
      toast({
        id: "viewtrademodal-error-3",
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to send message',
        status: 'error',
      })
    } finally {
      setSendingMessage(false)
    }
  }

  const confirmMeetup = async () => {
    if (!trade || !selectedLocation || !selectedTime || confirmingMeetup) return

    try {
      setConfirmingMeetup(true)
      await api.put(`/api/trades/${trade.id}`, {
        action: 'confirm_meetup',
        meetup_location: selectedLocation,
        meetup_time: selectedTime,
      })

      // Update local state based on current user role
      if (isUserBuyer) {
        setBuyerMeetupConfirmed(true)
      } else if (isUserSeller) {
        setSellerMeetupConfirmed(true)
      }

      toast({
        id: "viewtrademodal-meetup-location-confirmed",
        title: 'Meetup location confirmed',
        description: 'Waiting for the other party to confirm...',
        status: 'success',
      })

      // Refresh trade data to get updated status
      await fetchMeetupStatus()
      onStatusUpdate()
    } catch (error: any) {
      toast({
        id: "viewtrademodal-error-4",
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to confirm meetup',
        status: 'error',
      })
    } finally {
      setConfirmingMeetup(false)
    }
  }


  if (!trade) return null

  const deliveryOptions = {
    standard: { time: '3-5 business days', fee: 50, icon: '📦' },
    express: { time: '1-2 business days', fee: 150, icon: '⚡' },
    meetup: { time: 'Same day', fee: 0, icon: '🤝' },
  }

  const paymentMethods = {
    cod: { label: 'Cash on Delivery', icon: '💵', color: 'green' },
    upfront: { label: 'Prepayment (GCash/Maya)', icon: '📱', color: 'orange' },
    online: { label: 'Online Payment (Clovia)', icon: '💳', color: 'blue' },
    wallet: { label: 'Clovia Wallet', icon: '💼', color: 'purple' },
  }

  const handleConfirmPayment = async () => {
    try {
      setConfirmingPayment(true)

      // Xendit Online Checkout Pipeline
      if (deliveryState.paymentMethod === 'online') {
        const xenditResponse = await api.post(`/api/payments/trade/${trade?.id}`)
        if (xenditResponse.data?.success && xenditResponse.data?.data?.checkout_url) {
          // Redirect the user securely to Xendit's hosted checkout page
          window.location.href = xenditResponse.data.data.checkout_url
          return // Stop execution, let the redirect happen. Webhook will confirm payment async.
        }
      }

      // Traditional Manual Payment Confirmation (e.g. COD)
      await api.put(`/api/trades/${trade?.id}`, {
        action: 'update_delivery_state',
        payment_confirmed: true,
        payment_method: deliveryState.paymentMethod as any,
      })

      setDeliveryState(prev => ({
        ...prev,
        paymentConfirmed: true,
      }))

      // Update local trade state
      if (trade && onTradeUpdate) {
        const updatedTrade: Trade = {
          ...trade,
          payment_confirmed: true,
          payment_method: deliveryState.paymentMethod as any,
        }
        onTradeUpdate(updatedTrade)
      }

      // Call onStatusUpdate to refresh parent state
      onStatusUpdate()

      toast({
        id: "viewtrademodal-payment-confirmed",
        title: 'Payment confirmed',
        description: 'Your payment has been secured',
        status: 'success',
        duration: 2000,
      })
    } catch (error) {
      toast({
        id: "viewtrademodal-payment-failed",
        title: 'Payment failed',
        description: 'Please try again',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setConfirmingPayment(false)
    }
  }

  const handleConfirmDelivery = async () => {
    try {
      const confirmationPayload: any = {
        action: 'update_delivery_state',
      }

      if (isUserBuyer) {
        confirmationPayload.buyer_confirmed_receipt = true
        setDeliveryState(prev => ({
          ...prev,
          buyerConfirmedReceipt: true,
        }))
      } else {
        confirmationPayload.seller_confirmed_delivery = true
        setDeliveryState(prev => ({
          ...prev,
          sellerConfirmedDelivery: true,
        }))
      }

      // Save confirmation to backend
      await api.put(`/api/trades/${trade?.id}`, confirmationPayload)

      // Update local trade state
      if (trade && onTradeUpdate) {
        const updatedTrade: Trade = {
          ...trade,
          ...(isUserBuyer ? { buyer_confirmed_receipt: true } : { seller_confirmed_delivery: true }),
        }
        onTradeUpdate(updatedTrade)
      }

      // Call onStatusUpdate to refresh parent state
      onStatusUpdate()

      toast({
        id: "viewtrademodal-delivery-confirmed",
        title: 'Delivery confirmed',
        description: 'Thank you for confirming',
        status: 'success',
        duration: 2000,
      })

      // Check if both parties have confirmed (need to get fresh state)
      try {
        const response = await api.get(`/api/trades/${trade?.id}`)
        const freshTrade = response.data?.data
        if (freshTrade?.buyer_confirmed_receipt && freshTrade?.seller_confirmed_delivery) {
          // Both confirmed, complete the trade
          await api.put(`/api/trades/${freshTrade.id}`, {
            action: 'complete',
          })
          onStatusUpdate()
        }
      } catch (error) {
        console.error('Failed to check trade status:', error)
      }
    } catch (error: any) {
      toast({
        id: "viewtrademodal-delivery-confirmation-failed",
        title: 'Delivery confirmation failed',
        description: error?.response?.data?.error || 'Please try again',
        status: 'error',
        duration: 3000,
      })
    }
  }

  return (
    <>
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
                  trade.status === 'active'
                    ? 'green'
                    : trade.status === 'completed'
                      ? 'blue'
                      : trade.status === 'accepted'
                        ? 'orange'
                        : 'yellow'
                }
                variant="subtle"
              >
                {trade.status === 'active'
                  ? 'In Progress'
                  : trade.status === 'completed'
                    ? 'Completed'
                    : trade.status === 'accepted'
                      ? 'Waiting for Meetup'
                      : 'Pending'}
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
                  {trade?.trade_option === 'delivery' ? 'Delivery' : 'Meetup'}
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
                    <TradeProgressIndicator trade={trade} />

                    <Divider />

                    {/* Trade Partner Info */}
                    <Box
                      p={4}
                      bg="gray.50"
                      borderRadius="md"
                      borderWidth="1px"
                      borderColor={borderColor}
                    >
                      <HStack spacing={4}>
                        <VerifiedAvatar
                          name={tradingPartner}
                          size="md"
                          bg={isUserBuyer ? 'green.500' : 'blue.500'}
                          color="white"
                          isVerified={false}
                        />
                        <Box flex={1}>
                          <Text fontWeight="semibold">{tradingPartner}</Text>
                          <Text fontSize="sm" color="gray.600">
                            Trading Partner
                          </Text>
                        </Box>
                        <Text fontSize="xs" color="gray.500">
                          Accepted {new Date((trade as any).created_at).toLocaleDateString()}
                        </Text>
                      </HStack>
                    </Box>

                    <Divider />

                    {/* Products Overview */}
                    <Box>
                      <Text fontWeight="semibold" mb={4} fontSize="md">
                        Trade Items
                      </Text>
                    </Box>

                    {loadingProducts ? (
                      <Spinner />
                    ) : (
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                        <Card variant="outline" borderColor="blue.300">
                          <CardBody>
                            <VStack spacing={3} align="stretch">
                              <HStack>
                                <Badge colorScheme={
                                  trade.status === 'expired' ? 'gray'
                                  : trade.status === 'accepted' || trade.status === 'active' || trade.status === 'completed' || trade.status === 'auto_completed' ? 'green' : 'blue'}>
                                  {trade.status === 'expired' ? 'Expired'
                                    : trade.status === 'accepted' || trade.status === 'active' ? 'Trading'
                                    : trade.status === 'completed' || trade.status === 'auto_completed' ? 'Traded'
                                    : 'Requested'}
                                </Badge>
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
                                <Badge colorScheme={
                                  trade.status === 'expired' ? 'gray'
                                  : trade.status === 'accepted' || trade.status === 'active' || trade.status === 'completed' || trade.status === 'auto_completed' ? 'green' : 'green'}>
                                  {trade.status === 'expired' ? 'Expired'
                                    : trade.status === 'accepted' || trade.status === 'active' ? 'Trading'
                                    : trade.status === 'completed' || trade.status === 'auto_completed' ? 'Traded'
                                    : 'Offered'}
                                </Badge>
                                <Text fontSize="sm" color="gray.600">
                                  ({tradingPartner}'s Item{offeredProducts.length > 1 ? 's' : ''})
                                </Text>
                              </HStack>
                              {offeredProducts.length > 0 ? (
                                <SimpleGrid columns={offeredProducts.length > 1 ? 2 : 1} spacing={2}>
                                  {offeredProducts.map((product) => (
                                    <Box key={`offered-${product.id}`}>
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

                    {/* Delivery Information - Show for delivery trades after payment confirmed */}
                    {trade?.trade_option === 'delivery' && deliveryState.paymentConfirmed && (
                      <>
                        <Divider />
                        <Box>
                          <Text fontWeight="semibold" mb={4} fontSize="md">
                            Delivery Information
                          </Text>
                          <VStack spacing={3} align="stretch">
                            {/* Sender Address */}
                            <Card variant="outline" borderColor="blue.300">
                              <CardBody p={4}>
                                <HStack spacing={3} mb={2}>
                                  <Icon as={FaMapMarkerAlt} color="blue.500" boxSize={5} />
                                  <Text fontWeight="semibold" fontSize="sm">Sender Location</Text>
                                </HStack>
                                <Text fontSize="sm" color="gray.700" ml={8}>
                                  {deliveryState.senderLocation || 'Auto-detecting sender location...'}
                                </Text>
                                {isUserSeller && (
                                  <Text fontSize="xs" color="gray.500" mt={2} ml={8}>
                                    (Your location - from product listing)
                                  </Text>
                                )}
                              </CardBody>
                            </Card>

                            {/* Receiver Address */}
                            <Card variant="outline" borderColor="green.300">
                              <CardBody p={4}>
                                <HStack spacing={3} mb={2}>
                                  <Icon as={FaMapMarkerAlt} color="green.500" boxSize={5} />
                                  <Text fontWeight="semibold" fontSize="sm">Receiver Location</Text>
                                </HStack>
                                <Text fontSize="sm" color="gray.700" ml={8}>
                                  {deliveryState.receiverLocation || 'Auto-detecting receiver location...'}
                                </Text>
                                {isUserBuyer && (
                                  <Text fontSize="xs" color="gray.500" mt={2} ml={8}>
                                    (Your location - from your profile)
                                  </Text>
                                )}
                              </CardBody>
                            </Card>

                            {/* Delivery Instructions */}
                            {deliveryState.deliveryInstructions && (
                              <Card variant="outline" borderColor="purple.300">
                                <CardBody p={4}>
                                  <HStack spacing={3} mb={2}>
                                    <Icon as={FiMapPin} color="purple.500" boxSize={5} />
                                    <Text fontWeight="semibold" fontSize="sm">Special Instructions</Text>
                                  </HStack>
                                  <Text fontSize="sm" color="gray.700" ml={8} fontStyle="italic">
                                    "{deliveryState.deliveryInstructions}"
                                  </Text>
                                </CardBody>
                              </Card>
                            )}

                            {/* Assigned Rider */}
                            <Card variant="outline" borderColor="orange.300" bg="orange.50">
                              <CardBody p={4}>
                                <HStack spacing={3} mb={2}>
                                  <Avatar
                                    name="Wynry Perian"
                                    size="sm"
                                    bg="orange.500"
                                    color="white"
                                  />
                                  <Box flex={1}>
                                    <Text fontWeight="semibold" fontSize="sm">Assigned Rider</Text>
                                    <Text fontSize="sm" color="gray.700">Wynry Perian (Mock Rider)</Text>
                                  </Box>
                                </HStack>
                                <HStack spacing={2} ml={8} mt={2}>
                                  <Icon as={FiPhone} color="orange.500" boxSize={4} />
                                  <Text fontSize="sm" color="gray.700">09991234567</Text>
                                </HStack>
                                <Text fontSize="xs" color="gray.500" mt={2} ml={8}>
                                  🎭 This is a mock rider for demonstration
                                </Text>
                              </CardBody>
                            </Card>
                          </VStack>
                        </Box>
                      </>
                    )}
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
                  {trade?.trade_option === 'delivery' ? (
                    <DeliveryTab
                      deliveryState={deliveryState}
                      setDeliveryState={setDeliveryState}
                      deliveryOptions={deliveryOptions}
                      paymentMethods={paymentMethods}
                      requestedProduct={requestedProduct}
                      trade={trade}
                      isUserSeller={isUserSeller ?? false}
                      isUserBuyer={isUserBuyer ?? false}
                      handleConfirmPayment={handleConfirmPayment}
                      handleConfirmDelivery={handleConfirmDelivery}
                      saveDeliveryState={saveDeliveryState}
                      setIsReviewModalOpen={setIsReviewModalOpen}
                      confirmingPayment={confirmingPayment}
                      linkedDelivery={linkedDelivery}
                    />
                  ) : (
                    <VStack spacing={6} align="stretch">
                      {/* Status Text - Show only if NOT both confirmed */}
                      {!(buyerMeetupConfirmed && sellerMeetupConfirmed) && (
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
                      )}

                      {/* Leave Review Section - Show only if BOTH confirmed */}
                      {(buyerMeetupConfirmed && sellerMeetupConfirmed) && (
                        <Box>
                          <Button
                            colorScheme="green"
                            size="lg"
                            onClick={() => setIsReviewModalOpen(true)}
                            leftIcon={<FaStar />}
                            w="full"
                            transition="all 0.2s"
                            _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
                          >
                            ✓ Leave Review & Complete Trade
                          </Button>
                        </Box>
                      )}

                      {/* Meetup Location Selection */}
                      <Box>
                        <Text fontWeight="semibold" mb={1} fontSize="md">
                          Suggested Meetup Locations
                        </Text>
                        <Text fontSize="sm" color="gray.600" mb={4}>
                          Select a safe, public location. Both parties must confirm to proceed.
                        </Text>

                        {/* Locations Grid */}
                        <Box h="250px" mb={4} borderRadius="md" overflow="hidden" borderWidth="1px" borderColor={borderColor}>
                          <MapContainer 
                            center={[6.9214, 122.0790]} 
                            zoom={14} 
                            style={{ height: '100%', width: '100%' }}
                            // @ts-ignore
                            attributionControl={false}
                          >
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            {selectedLocation && suggestedLocations.find(l => l.name === selectedLocation)?.lat && (
                              <MapUpdater 
                                lat={suggestedLocations.find(l => l.name === selectedLocation)!.lat!} 
                                lng={suggestedLocations.find(l => l.name === selectedLocation)!.lng!} 
                              />
                            )}
                            {suggestedLocations.filter(loc => loc.lat && loc.lng).map((loc, idx) => (
                              <Marker 
                                key={idx} 
                                position={[loc.lat!, loc.lng!]}
                                eventHandlers={{ click: () => setSelectedLocation(loc.name) }}
                              >
                                <Popup>
                                  <b>{loc.name}</b><br/>{loc.address}
                                </Popup>
                              </Marker>
                            ))}
                          </MapContainer>
                        </Box>

                        <VStack spacing={3} align="stretch" maxH="400px" overflowY="auto" pr={2} css={{
                          '&::-webkit-scrollbar': {
                            width: '4px',
                          },
                          '&::-webkit-scrollbar-track': {
                            width: '6px',
                          },
                          '&::-webkit-scrollbar-thumb': {
                            background: 'brand.500',
                            borderRadius: '24px',
                          },
                        }}>
                          {suggestedLocations.map((location, index) => {
                            const isSelected = selectedLocation === location.name
                            const isPartner = location.isPartner
                            const isNearest = location.name === nearestLocationName // Dynamic nearest
                            const textColor = useColorModeValue('gray.800', 'gray.100')

                            // Check if location selection should be locked
                            const isOtherPartyConfirmed = (isUserBuyer && trade.seller_meetup_confirmed) || (isUserSeller && trade.buyer_meetup_confirmed)
                            // We can only change selection if neither has confirmed, or if WE are the only one who confirmed (we can change our mind? Actually if we confirmed, we shouldn't change unless we unconfirm).
                            // Wait, if the other party confirmed, the selection is locked to their choice.
                            const isLocked = isOtherPartyConfirmed && trade.meetup_location !== undefined

                            return (
                              <Card
                                key={`location-${location.name}`}
                                variant="outline"
                                cursor={isLocked ? (isSelected ? "default" : "not-allowed") : "pointer"}
                                opacity={isLocked && !isSelected ? 0.5 : 1}
                                borderWidth={isPartner ? '2px' : isSelected ? '2px' : '1px'}
                                borderColor={isPartner ? 'orange.400' : isSelected ? 'brand.500' : isNearest ? 'blue.300' : borderColor}
                                bg={isSelected ? 'brand.50' : isPartner ? useColorModeValue('orange.50', 'orange.900') : isNearest ? useColorModeValue('blue.50', 'blue.950') : 'white'}
                                onClick={() => {
                                  if (!isLocked) {
                                    setSelectedLocation(location.name)
                                  } else if (!isSelected) {
                                    toast({
                                      id: "location-locked",
                                      title: 'Location Locked',
                                      description: `The other party has already selected ${trade.meetup_location}. You must accept this location or message them to change it.`,
                                      status: 'warning',
                                      duration: 3000,
                                      isClosable: true,
                                    })
                                  }
                                }}
                                transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                                _hover={{
                                  borderColor: isLocked ? undefined : (isPartner ? 'orange.500' : isSelected ? 'brand.600' : 'brand.400'),
                                  shadow: isLocked ? undefined : 'md',
                                  transform: isLocked ? undefined : 'translateY(-2px)',
                                }}
                              >
                                <CardBody>
                                  <HStack spacing={3} justify="space-between">
                                    {/* Location Icon & Info */}
                                    <HStack spacing={3} flex={1}>
                                      <Box
                                        p={2}
                                        bg={isPartner ? useColorModeValue('orange.100', 'orange.800') : useColorModeValue('gray.100', 'gray.700')}
                                        borderRadius="md"
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="center"
                                        flexShrink={0}
                                      >
                                        <Icon
                                          as={isPartner ? FaStore : FaMapMarkerAlt}
                                          color={isPartner ? 'orange.500' : isSelected ? 'brand.500' : isNearest ? 'blue.500' : 'gray.500'}
                                          boxSize={isPartner ? 6 : 5}
                                        />
                                      </Box>

                                      <VStack align="start" spacing={1} flex={1}>
                                        <HStack spacing={2} flexWrap="wrap">
                                          <Text fontWeight="semibold" fontSize="sm" color={textColor}>
                                            {location.name}
                                          </Text>
                                          {isPartner && (
                                            <Badge colorScheme="orange" fontSize="2xs" px={1.5} py={0.5}>
                                              🌟 Partnered Shop
                                            </Badge>
                                          )}
                                          {isNearest && !isPartner && (
                                            <Badge colorScheme="blue" fontSize="2xs" px={1.5} py={0.5}>
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

                      {/* Meetup Time Selection */}
                      <Box>
                        <Text fontWeight="semibold" mb={1} fontSize="md">
                          Choose a Time
                        </Text>
                        <Text fontSize="sm" color="gray.600" mb={4}>
                          Select a time that works for both of you.
                        </Text>

                        {/* Time Picker */}
                        <VStack spacing={3} align="stretch">
                          {/* Time Input */}
                          <FormControl>
                            <FormLabel fontSize="sm" fontWeight="medium" mb={2}>
                              Time (24-hour format)
                            </FormLabel>
                            <InputGroup>
                              <InputLeftElement pointerEvents="none">
                                <Icon as={FiClock} color="gray.400" />
                              </InputLeftElement>
                              <Input
                                type="time"
                                value={selectedTime || ''}
                                onChange={(e) => setSelectedTime(e.target.value)}
                                placeholder="e.g., 14:30"
                                bg="white"
                                borderWidth="1px"
                                borderColor={borderColor}
                                _focus={{
                                  borderColor: 'brand.500',
                                  boxShadow: '0 0 0 1px var(--chakra-colors-brand-500)',
                                }}
                              />
                            </InputGroup>
                          </FormControl>

                          {/* Quick time suggestions */}
                          <Box>
                            <Text fontSize="xs" color="gray.600" mb={2}>
                              Or choose a suggested time:
                            </Text>
                            <HStack spacing={2} flexWrap="wrap">
                              {['09:00', '12:00', '14:00', '16:00', '18:00'].map(time => (
                                <Button
                                  key={time}
                                  size="sm"
                                  variant={selectedTime === time ? 'solid' : 'outline'}
                                  colorScheme={selectedTime === time ? 'brand' : 'gray'}
                                  onClick={() => setSelectedTime(time)}
                                  fontWeight="medium"
                                >
                                  {time}
                                </Button>
                              ))}
                            </HStack>
                          </Box>
                        </VStack>
                      </Box>

                      <Divider />

                      {/* Confirmation Status */}
                      <Box>
                        <Text fontWeight="semibold" mb={4} fontSize="md">
                          Confirmation Status
                        </Text>
                        
                        {/* Selected Details Preview */}
                        {selectedLocation && selectedTime && (
                          <Card variant="outline" mb={4} borderColor="brand.200" bg="brand.50">
                            <CardBody>
                              <VStack align="start" spacing={2}>
                                <HStack spacing={2}>
                                  <Icon as={FaMapMarkerAlt} color="brand.500" boxSize={4} />
                                  <Text fontSize="sm" fontWeight="medium">
                                    <Text as="span" color="gray.600">Location: </Text>
                                    {selectedLocation}
                                  </Text>
                                </HStack>
                                <HStack spacing={2}>
                                  <Icon as={FiClock} color="brand.500" boxSize={4} />
                                  <Text fontSize="sm" fontWeight="medium">
                                    <Text as="span" color="gray.600">Time: </Text>
                                    {selectedTime}
                                  </Text>
                                </HStack>
                              </VStack>
                            </CardBody>
                          </Card>
                        )}

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
                              name={trade.seller_name || 'Trader'}
                              size="md"
                              bg="green.500"
                              color="white"
                            />
                            <VStack spacing={1}>
                              <Text fontSize="xs" fontWeight="semibold" color={useColorModeValue('gray.700', 'gray.200')}>
                                Trader
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
                      {
                        selectedLocation && selectedTime && (
                          <Button
                            colorScheme="green"
                            size="lg"
                            onClick={confirmMeetup}
                            isLoading={confirmingMeetup}
                            leftIcon={<FaCheckCircle />}
                            isDisabled={Boolean(
                              (isUserBuyer && buyerMeetupConfirmed) ||
                              (isUserSeller && sellerMeetupConfirmed)
                            )}
                            w="full"
                            transition="all 0.2s"
                            _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
                          >
                            {isUserBuyer && buyerMeetupConfirmed
                              ? 'You Confirmed ✓'
                              : isUserSeller && sellerMeetupConfirmed
                                ? 'You Confirmed ✓'
                                : 'Confirm Meetup Location & Time'}
                          </Button>
                        )
                      }
                    </VStack >
                  )}
                </TabPanel >
              </TabPanels >
            </Tabs >
          </ModalBody >
        </ModalContent >
      </Modal >


      {/* Review Modal - Appears when both parties confirmed meetup */}
      < Modal isOpen={isReviewModalOpen} onClose={() => setIsReviewModalOpen(false)} size="md" isCentered scrollBehavior="inside" >
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <ModalContent bg={cardBg} borderRadius="xl" boxShadow="xl" maxW="500px" mx={4}>
          <ModalHeader>
            <HStack spacing={3}>
              <Icon as={FaStar} color="yellow.400" />
              <Text>Trade Review & Completion</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <ReviewTab
              trade={trade}
              isUserBuyer={isUserBuyer ?? false}
              isUserSeller={isUserSeller ?? false}
              user={user}
              onStatusUpdate={() => {
                onStatusUpdate()
                setIsReviewModalOpen(false)
              }}
            />
          </ModalBody>
        </ModalContent>
      </Modal >
    </>
  )
}

export default ViewTradeModal

