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
import { FaMapMarkerAlt, FaCheckCircle, FaClock, FaHandshake, FaPaperPlane, FaTruck, FaStar, FaStore, FaExclamationTriangle } from 'react-icons/fa'
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

const MapUpdater = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap()
  useEffect(() => {
    const timers = [
      setTimeout(() => {
        map.invalidateSize()
        map.setView([lat, lng], 16, { animate: true })
      }, 350),
      setTimeout(() => {
        map.invalidateSize()
        map.setView([lat, lng], 16, { animate: true })
      }, 700),
    ]
    return () => timers.forEach(t => clearTimeout(t))
  }, [lat, lng, map])
  return null
}

const ModalMapFix = () => {
  const map = useMap()
  useEffect(() => {
    // Delays must exceed Chakra modal open animation (~300ms) so the container
    // has its final dimensions before Leaflet measures it.
    const timers = [
      setTimeout(() => map.invalidateSize(), 350),
      setTimeout(() => map.invalidateSize(), 600),
      setTimeout(() => map.invalidateSize(), 1000),
    ]
    return () => timers.forEach(t => clearTimeout(t))
  }, [map])
  return null
}

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

// Dynamic pricing calculation based on distance
const calculateDeliveryFee = (distance: number, type: 'standard' | 'express'): number => {
  const baseFees = {
    standard: 35, // Base fee cheaper than typical shipping (₱50-70)
    express: 80   // Base fee cheaper than typical express (₱150-200)
  }

  const distanceSurcharge = {
    standard: 3, // ₱3 per km for standard
    express: 5   // ₱5 per km for express
  }

  const baseFee = baseFees[type]
  const surcharge = distance > 5 ? (distance - 5) * distanceSurcharge[type] : 0

  return Math.round(baseFee + surcharge)
}

const formatTimePH = (time?: string | null): string => {
  if (!time) return ''

  const parts = time.split(':')
  if (parts.length < 2) return time

  const hour24 = Number.parseInt(parts[0], 10)
  const minute = parts[1]
  if (Number.isNaN(hour24)) return time

  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = ((hour24 + 11) % 12) + 1

  if (minute === '00') return `${hour12} ${suffix}`
  return `${hour12}:${minute} ${suffix}`
}

// Calculate estimated distance between two coordinates (Haversine formula)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371 // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
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
  deliveryType: 'standard' | 'express'
  paymentMethod: 'online' | 'cod' | 'wallet'
  paymentConfirmed: boolean
  buyerConfirmedReceipt: boolean
  sellerConfirmedDelivery: boolean
  deliveryInstructions: string
  senderLocation?: string
  receiverLocation?: string
  distance?: number // Add distance for dynamic pricing
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
  const activeRingColor = useColorModeValue('brand.50', 'brand.950')
  const lineInactiveColor = useColorModeValue('gray.200', 'gray.700')

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
                boxShadow={status === 'active' ? `0 0 0 3px ${activeRingColor}` : 'none'}
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
            const lineColor = status === 'completed' ? completedBg : lineInactiveColor

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
      <Text fontSize="sm" color={descriptionColor} fontWeight="medium" textAlign="center" mt={1}>
        {PROGRESS_STEPS[currentStepIndex]?.description}
      </Text>
    </VStack>
  )
}

interface DeliveryTabProps {
  deliveryState: DeliveryState
  setDeliveryState: React.Dispatch<React.SetStateAction<DeliveryState>>
  deliveryOptions: Record<string, { time: string; fee: number; icon: string; description: string }>
  requestedProduct: Product | null
  trade: Trade | null
  distance: number
  isUserSeller: boolean
  isUserBuyer: boolean
  setIsReviewModalOpen: (open: boolean) => void
  handleConfirmPayment: () => Promise<void>
  handleConfirmDelivery: () => Promise<void>
  saveDeliveryState: (updates: Partial<DeliveryState>) => Promise<void>
  confirmingPayment: boolean
  syncingOnlinePayment: boolean
  linkedDelivery: Delivery | null
}

const DeliveryTab: React.FC<DeliveryTabProps> = ({
  deliveryState,
  setDeliveryState,
  deliveryOptions,
  requestedProduct,
  trade,
  distance,
  isUserSeller,
  isUserBuyer,
  handleConfirmPayment,
  handleConfirmDelivery,
  saveDeliveryState,
  setIsReviewModalOpen,
  confirmingPayment,
  syncingOnlinePayment,
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

  // Auto-confirm COD payment when delivery type is selected
  useEffect(() => {
    if (deliveryState.deliveryType && !deliveryState.paymentConfirmed && !confirmingPayment) {
      handleConfirmPayment()
    }
  }, [deliveryState.deliveryType])

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
      detail: `Cash on Delivery • ${deliveryState.paymentConfirmed ? 'Confirmed' : 'Pending'}`,
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
                Method: Cash on Delivery
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
        <CardBody py={2} px={4}>
          <VStack spacing={2} align="stretch">
            {/* Compact Header with Distance */}
            <HStack justify="space-between" align="center">
              <Text fontSize="sm" fontWeight="semibold">Delivery {distance.toFixed(1)}km</Text>
              <Text fontSize="xs" color="gray.500">Pick one:</Text>
            </HStack>

            {/* Compact Delivery Options - Buttons */}
            <HStack spacing={2}>
              {Object.entries(deliveryOptions).map(([type, option]: [string, any]) => (
                <Button
                  key={`delivery-${type}`}
                  size="sm"
                  colorScheme={deliveryState.deliveryType === type ? 'blue' : 'gray'}
                  variant={deliveryState.deliveryType === type ? 'solid' : 'outline'}
                  onClick={() => {
                    const newState = type as DeliveryState['deliveryType']
                    setDeliveryState(prev => ({ ...prev, deliveryType: newState }))
                    saveDeliveryState({ deliveryType: newState })
                  }}
                  flex={1}
                  fontSize="xs"
                  py={1}
                >
                  <VStack spacing={0}>
                    <Text fontSize="lg">{option.icon}</Text>
                    <Text>{type === 'standard' ? 'Std' : 'Exp'}</Text>
                    <Text>₱{option.fee}</Text>
                  </VStack>
                </Button>
              ))}
            </HStack>

            {/* Instructions - Optional compact textarea */}
            <Box>
              <Textarea
                value={deliveryState.deliveryInstructions}
                onChange={(e) => setDeliveryState(prev => ({ ...prev, deliveryInstructions: e.target.value }))}
                onBlur={() => saveDeliveryState({ deliveryInstructions: deliveryState.deliveryInstructions })}
                placeholder="Delivery notes (optional)"
                size="sm"
                rows={2}
                />
                <Text fontSize="xs" color="gray.500" mt={1}>{deliveryState.deliveryInstructions.length}/200 characters</Text>
              </Box>
            </VStack>
        </CardBody>
      </Card>

      <Card variant="outline" borderColor="green.200">
        <CardBody py={2} px={4}>
          <HStack justify="space-between" align="center">
            <HStack spacing={2}>
              <Text fontSize="lg">💵</Text>
              <VStack align="start" spacing={0}>
                <Text fontSize="sm" fontWeight="semibold">Cash on Delivery</Text>
                <Text fontSize="xs" color="gray.500">Have exact change ready</Text>
              </VStack>
            </HStack>
            <Text fontSize="sm" fontWeight="bold" color="green.600">
              ₱{((requestedProduct?.price || 0) + deliveryOptions[deliveryState.deliveryType].fee).toFixed(2)}
            </Text>
          </HStack>
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
  const meetupInfoBg = useColorModeValue('blue.50', 'blue.900')

  const tradeOption = (trade?.trade_option || 'meetup') as TradeOption
  const proofRequired = tradeOption === 'meetup' || tradeOption === 'delivery'

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

    if (proofRequired && !proofFile) {
      toast({
        id: 'viewtrademodal-proof-required',
        title: 'Proof image required',
        description: 'Please upload a proof image before submitting your review.',
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
        
        // Validate upload succeeded and has URL
        if (!uploadRes.data?.success) {
          throw new Error(uploadRes.data?.error || 'Upload failed: invalid response')
        }
        
        // Extract URL (try both possible response structures for backwards compatibility)
        uploadedProofUrl = uploadRes.data?.data?.url
        
        if (!uploadedProofUrl) {
          throw new Error(uploadRes.data?.error || 'Upload succeeded but no image URL was returned. Please try again.')
        }
      }

      await api.put(`/api/trades/${trade.id}/complete`, {
        rating,
        feedback: feedback.trim(),
        // Backend expects these keys
        transaction_proof_url: uploadedProofUrl || undefined,
        is_camera_photo: true,
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
        description: error?.message || error?.response?.data?.error || 'Failed to submit review',
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
        <Card borderWidth="2px" borderColor="blue.200" bg={meetupInfoBg}>
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
                <FormLabel fontSize="sm" fontWeight="semibold">
                  Proof Image {proofRequired ? '(Required)' : '(Optional)'}
                </FormLabel>
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
                  capture="environment"
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
                isDisabled={!rating || !feedback.trim() || (proofRequired && !proofFile)}
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
  const [syncingOnlinePayment, setSyncingOnlinePayment] = useState(false)
  const [buyerMeetupConfirmed, setBuyerMeetupConfirmed] = useState(false)
  const [sellerMeetupConfirmed, setSellerMeetupConfirmed] = useState(false)
  const [buyerMetConfirmed, setBuyerMetConfirmed] = useState(false)
  const [sellerMetConfirmed, setSellerMetConfirmed] = useState(false)
  // Track each party's meetup selections
  const [buyerMeetupLocation, setBuyerMeetupLocation] = useState<string | null>(null)
  const [buyerMeetupTime, setBuyerMeetupTime] = useState<string | null>(null)
  const [sellerMeetupLocation, setSellerMeetupLocation] = useState<string | null>(null)
  const [sellerMeetupTime, setSellerMeetupTime] = useState<string | null>(null)
  const [confirmingMeetupDone, setConfirmingMeetupDone] = useState(false)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [deliveryState, setDeliveryState] = useState<DeliveryState>({
    deliveryType: 'standard',
    paymentMethod: 'cod',
    paymentConfirmed: false,
    buyerConfirmedReceipt: false,
    sellerConfirmedDelivery: false,
    deliveryInstructions: '',
  })
  const [linkedDelivery, setLinkedDelivery] = useState<Delivery | null>(null)
  const [mapInitKey, setMapInitKey] = useState(0)  // Force map re-render
  const [tabIndex, setTabIndex] = useState(0) // Track current tab index to fix map render issues
  
  // Force map to reinitialize when modal opens or tab changes to Coordination/Map
  useEffect(() => {
    if (isOpen) {
      setMapInitKey(prev => prev + 1)
    }
  }, [isOpen, tabIndex])
  
  // Auto-confirm COD payment when delivery type is selected
  useEffect(() => {
    if (deliveryState.deliveryType && !deliveryState.paymentConfirmed) {
      setDeliveryState(prev => ({
        ...prev,
        paymentConfirmed: true,
        paymentMethod: 'cod',
      }))
    }
  }, [deliveryState.deliveryType, deliveryState.paymentConfirmed])
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previousMessageCountRef = useRef(0)  // Track message count to detect new messages
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const locationTextColor = useColorModeValue('gray.800', 'gray.100')
  const partnerTextColor = useColorModeValue('gray.700', 'gray.200')
  const partnerBg = useColorModeValue('orange.50', 'orange.900')
  const nearestBg = useColorModeValue('blue.50', 'blue.950')
  const partnerIconBg = useColorModeValue('orange.100', 'orange.800')
  const defaultIconBg = useColorModeValue('gray.100', 'gray.700')
  const meetupInfoBg = useColorModeValue('blue.50', 'blue.900')
  const meetupInfoTextColor = useColorModeValue('blue.700', 'blue.200')

  // Be tolerant of ID type mismatches (some auth payloads/localStorage can produce string IDs)
  const currentUserId = user?.id != null ? Number(user.id) : null
  const buyerId = trade?.buyer_id != null ? Number(trade.buyer_id) : null
  const sellerId = trade?.seller_id != null ? Number(trade.seller_id) : null

  const isUserBuyer = !!(trade && currentUserId != null && buyerId != null && buyerId === currentUserId)
  const isUserSeller = !!(trade && currentUserId != null && sellerId != null && sellerId === currentUserId)

  const meetupAgreed = buyerMeetupConfirmed && sellerMeetupConfirmed && buyerMeetupLocation === sellerMeetupLocation && buyerMeetupTime === sellerMeetupTime
  const isMeetupActive = meetupAgreed && trade?.status === 'active'
  const bothMetConfirmed = buyerMetConfirmed && sellerMetConfirmed
  const userMetConfirmed = (isUserBuyer && buyerMetConfirmed) || (isUserSeller && sellerMetConfirmed)

  // Auto-sync online payment status in dev/localhost where webhooks may not arrive.
  useEffect(() => {
    if (!isOpen) return
    if (!trade?.id) return
    if (!isUserBuyer) return
    if (deliveryState.paymentMethod !== 'online') return
    if (deliveryState.paymentConfirmed) return

    let cancelled = false

      ; (async () => {
        try {
          setSyncingOnlinePayment(true)

          const key = `xendit_external_id_trade_${trade.id}`
          const externalId = sessionStorage.getItem(key) || undefined

          for (let i = 0; i < 8 && !cancelled; i++) {
            let r
            try {
              r = await api.post(`/api/payments/trade/${trade.id}/sync`, externalId ? { external_id: externalId } : {})
            } catch (err: any) {
              if (err?.response?.status === 405) {
                r = await api.get(`/api/payments/trade/${trade.id}/sync`, {
                  params: externalId ? { external_id: externalId } : {},
                })
              } else {
                throw err
              }
            }
            if (r.data?.data?.paid) {
              const tradeRes = await api.get(`/api/trades/${trade.id}`)
              const updatedTrade: Trade | undefined = tradeRes.data?.data

              if (updatedTrade) {
                onTradeUpdate?.(updatedTrade)
                setDeliveryState(prev => ({
                  ...prev,
                  paymentConfirmed: !!updatedTrade.payment_confirmed,
                  paymentMethod: (updatedTrade.payment_method as any) || prev.paymentMethod,
                }))
              } else {
                setDeliveryState(prev => ({
                  ...prev,
                  paymentConfirmed: true,
                }))
              }

              onStatusUpdate()
              sessionStorage.removeItem(key)
              return
            }

            await new Promise(res => setTimeout(res, 1500))
          }
        } catch (_) {
          // Silent: user remains locked until webhook/sync succeeds.
        } finally {
          if (!cancelled) setSyncingOnlinePayment(false)
        }
      })()

    return () => {
      cancelled = true
    }
  }, [
    isOpen,
    trade?.id,
    isUserBuyer,
    deliveryState.paymentMethod,
    deliveryState.paymentConfirmed,
    onStatusUpdate,
    onTradeUpdate,
  ])

  // Calculate distance between buyer and seller if both have locations
  const distance = useMemo(() => {
    if (!trade?.buyer_location || !trade?.seller_location) return 10 // Default distance

    const buyerCoords = trade.buyer_location.split(',').map(Number)
    const sellerCoords = trade.seller_location.split(',').map(Number)

    if (buyerCoords.length === 2 && sellerCoords.length === 2) {
      return calculateDistance(buyerCoords[0], buyerCoords[1], sellerCoords[0], sellerCoords[1])
    }
    return 10 // Default fallback
  }, [trade?.buyer_location, trade?.seller_location])

  // Dynamic delivery options based on calculated distance
  const deliveryOptions = useMemo(() => ({
    standard: {
      time: distance < 10 ? '2-3 business days' : distance < 25 ? '3-4 business days' : '4-6 business days',
      fee: calculateDeliveryFee(distance, 'standard'),
      icon: '📦',
      description: `${distance < 5 ? 'Local area' : distance < 15 ? 'Within city' : 'Inter-city'} delivery`
    },
    express: {
      time: distance < 10 ? 'Same day' : distance < 25 ? '1-2 business days' : '2-3 business days',
      fee: calculateDeliveryFee(distance, 'express'),
      icon: '⚡',
      description: `Fast ${distance < 5 ? 'local' : distance < 15 ? 'city-wide' : 'regional'} delivery`
    }
  }), [distance])

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
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
        deliveryInstructions: (trade as any).delivery_instructions || '',
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
      // Reset message count tracker when opening a new trade
      previousMessageCountRef.current = 0
      
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
      
      // Check if there are new messages from the other user
      const previousCount = previousMessageCountRef.current
      const newMessageCount = safeMessages.length
      
      if (newMessageCount > previousCount) {
        // Get the new messages
        const newMessages = safeMessages.slice(previousCount)
        // Check if any new message is from the other user (not the current user)
        const otherUserMessages = newMessages.filter((msg: any) => Number(msg.sender_id) !== currentUserId)
        
        if (otherUserMessages.length > 0) {
          const latestMessage = otherUserMessages[otherUserMessages.length - 1]
          const senderName = latestMessage.sender_name || 'User'
          
          // Show notification for new message from other user
          toast({
            id: `new-message-${trade.id}`,
            title: `New message from ${senderName}`,
            description: latestMessage.content.substring(0, 60) + (latestMessage.content.length > 60 ? '...' : ''),
            status: 'info',
            duration: 4000,
            isClosable: true,
          })
        }
      }
      
      previousMessageCountRef.current = newMessageCount
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

      // Only show items offered by the buyer (offered_by === 'buyer') in the "offered" column.
      // Some trades may store seller counter-offer items with offered_by === 'seller' — keep them separate.
      const buyerItems = (trade.items || []).filter((item: any) => {
        const ob = (item?.offered_by ?? item?.offeredBy ?? '').toLowerCase()
        return !ob || ob === 'buyer' || ob === 'from_buyer' || ob === 'sender'
      })
      const offeredIds = buyerItems.map((item: any) => item.product_id).filter(Boolean)
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

      // Keep the modal header/status badge consistent with the latest backend state.
      // This prevents UI mismatches like "WAITING FOR MEETUP" while showing "You Both Agreed!".
      if (tradeData && onTradeUpdate) {
        onTradeUpdate(tradeData)
      }

      // Set confirmation status based on backend data
      setBuyerMeetupConfirmed(!!(tradeData?.buyer_meetup_confirmed || tradeData?.meetup_confirmed_by_buyer))
      setSellerMeetupConfirmed(!!(tradeData?.seller_meetup_confirmed || tradeData?.meetup_confirmed_by_seller))

      // Set each party's meetup selections
      setBuyerMeetupLocation(tradeData?.buyer_meetup_location || null)
      setBuyerMeetupTime(tradeData?.buyer_meetup_time || null)
      setSellerMeetupLocation(tradeData?.seller_meetup_location || null)
      setSellerMeetupTime(tradeData?.seller_meetup_time || null)

	  // Set met confirmation status
	  setBuyerMetConfirmed(!!tradeData?.buyer_met)
	  setSellerMetConfirmed(!!tradeData?.seller_met)

      // Also set selected location/time if it exists (for display)
      if (tradeData?.meetup_location) {
        setSelectedLocation(tradeData.meetup_location)
      }
      if (tradeData?.meetup_time) {
        setSelectedTime(tradeData.meetup_time)
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
        setBuyerMeetupLocation(selectedLocation)
        setBuyerMeetupTime(selectedTime)
      } else if (isUserSeller) {
        setSellerMeetupConfirmed(true)
        setSellerMeetupLocation(selectedLocation)
        setSellerMeetupTime(selectedTime)
      }

      // Check if selections match the other party
      const otherPartyLocation = isUserBuyer ? sellerMeetupLocation : buyerMeetupLocation
      const otherPartyTime = isUserBuyer ? sellerMeetupTime : buyerMeetupTime
      const otherPartyConfirmed = isUserBuyer ? sellerMeetupConfirmed : buyerMeetupConfirmed

      if (otherPartyConfirmed && otherPartyLocation && otherPartyTime) {
        if (selectedLocation === otherPartyLocation && selectedTime === otherPartyTime) {
          toast({
            id: "viewtrademodal-meetup-agreed",
            title: 'Meetup Agreed!',
            description: 'Both parties have agreed on the same location and time. The trade can now proceed!',
            status: 'success',
            duration: 5000,
          })
        } else {
          toast({
            id: "viewtrademodal-meetup-mismatch",
            title: 'Selection Mismatch',
            description: 'Your selection differs from the other party. Please coordinate to agree on the same location and time.',
            status: 'warning',
            duration: 5000,
          })
        }
      } else {
        toast({
          id: "viewtrademodal-meetup-location-confirmed",
          title: 'Meetup selection submitted',
          description: 'Waiting for the other party to select their preferred location and time...',
          status: 'info',
        })
      }

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

  const confirmMeetupDone = async () => {
    if (!trade || confirmingMeetupDone) return

    try {
      setConfirmingMeetupDone(true)
      await api.put(`/api/trades/${trade.id}`, {
        action: 'confirm_meetup_done',
      })

      if (isUserBuyer) {
        setBuyerMetConfirmed(true)
      } else if (isUserSeller) {
        setSellerMetConfirmed(true)
      }

      toast({
        id: 'viewtrademodal-meetup-done-confirmed',
        title: 'Confirmed',
        description: 'Waiting for the other party to confirm they met too.',
        status: 'success',
        duration: 3000,
      })

      await fetchMeetupStatus()
      onStatusUpdate()
    } catch (error: any) {
      toast({
        id: 'viewtrademodal-meetup-done-failed',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to confirm meetup completion',
        status: 'error',
      })
    } finally {
      setConfirmingMeetupDone(false)
    }
  }


  if (!trade) return null


  const handleConfirmPayment = async () => {
    try {
      setConfirmingPayment(true)

      // Confirm COD payment
      await api.put(`/api/trades/${trade?.id}`, {
        action: 'update_delivery_state',
        payment_confirmed: true,
        payment_method: 'cod',
      })

      setDeliveryState(prev => ({
        ...prev,
        paymentConfirmed: true,
        paymentMethod: 'cod',
      }))

      // Update local trade state
      if (trade && onTradeUpdate) {
        const updatedTrade: Trade = {
          ...trade,
          payment_confirmed: true,
          payment_method: 'cod',
        }
        onTradeUpdate(updatedTrade)
      }

      // Call onStatusUpdate to refresh parent state
      onStatusUpdate()

      toast({
        id: "viewtrademodal-payment-confirmed",
        title: 'Ready for handoff',
        description: 'Ready to receive the item. Have your money ready!',
        status: 'success',
        duration: 2000,
      })
    } catch (error: any) {
      toast({
        id: "viewtrademodal-payment-failed",
        title: 'Confirmation failed',
        description: error?.response?.data?.error || 'Please try again',
        status: 'error',
        duration: 4000,
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
            <Tabs colorScheme="brand" index={tabIndex} onChange={(i) => setTabIndex(i)}>
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

                    {/* Caution Warning */}
                    {trade.trade_option === 'meetup' ? (
                      <Box
                        p={4}
                        bg="orange.50"
                        borderRadius="md"
                        borderWidth="1px"
                        borderColor="orange.200"
                      >
                        <HStack spacing={3} align="start">
                          <Icon as={FaExclamationTriangle} color="orange.500" boxSize={5} mt={0.5} />
                          <VStack align="start" spacing={1}>
                            <Text fontWeight="semibold" fontSize="sm" color="orange.700">
                              Meetup Policy Reminder
                            </Text>
                            <Text fontSize="xs" color="orange.600">
                              • Arriving late or not showing up (no-show) may result in strikes on your account.
                            </Text>
                            <Text fontSize="xs" color="orange.600">
                              • Multiple violations can lead to account suspension or permanent ban.
                            </Text>
                            <Text fontSize="xs" color="orange.600">
                              • Always communicate with your trading partner if you have delays.
                            </Text>
                          </VStack>
                        </HStack>
                      </Box>
                    ) : (
                      <Box
                        p={4}
                        bg="orange.50"
                        borderRadius="md"
                        borderWidth="1px"
                        borderColor="orange.200"
                      >
                        <HStack spacing={3} align="start">
                          <Icon as={FaExclamationTriangle} color="orange.500" boxSize={5} mt={0.5} />
                          <VStack align="start" spacing={1}>
                            <Text fontWeight="semibold" fontSize="sm" color="orange.700">
                              Delivery Policy Reminder
                            </Text>
                            <Text fontSize="xs" color="orange.600">
                              • Sending wrong items or failing to deliver (no-show) may result in strikes.
                            </Text>
                            <Text fontSize="xs" color="orange.600">
                              • Multiple violations can lead to account suspension or permanent ban.
                            </Text>
                            <Text fontSize="xs" color="orange.600">
                              • Ensure items match the trade description before sending.
                            </Text>
                          </VStack>
                        </HStack>
                      </Box>
                    )}

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
                                  ({isUserSeller ? "Your Item" : (isUserBuyer ? tradingPartner + "'s Item" : "Seller's Item")})
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
                                    fallbackSrc="/no-image.svg"
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
                                  ({isUserBuyer ? "Your Item" : (isUserSeller ? tradingPartner + "'s Items" : "Buyer's Items")})
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
                                        fallbackSrc="/no-image.svg"
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
                      requestedProduct={requestedProduct}
                      trade={trade}
                      distance={distance}
                      isUserSeller={isUserSeller ?? false}
                      isUserBuyer={isUserBuyer ?? false}
                      handleConfirmPayment={handleConfirmPayment}
                      handleConfirmDelivery={handleConfirmDelivery}
                      saveDeliveryState={saveDeliveryState}
                      setIsReviewModalOpen={setIsReviewModalOpen}
                      confirmingPayment={confirmingPayment}
                      syncingOnlinePayment={syncingOnlinePayment}
                      linkedDelivery={linkedDelivery}
                    />
                  ) : (
                    <VStack spacing={6} align="stretch">

                      {!meetupAgreed && (
                        <Box
                          p={3}
                          bg={meetupInfoBg}
                          borderLeft="4px"
                          borderColor="brand.500"
                          borderRadius="md"
                        >
                          <Text fontSize="sm" color={meetupInfoTextColor} fontWeight="medium">
                            Current Stage: Waiting for both parties to confirm location
                          </Text>
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
                            key={mapInitKey}
                            center={[6.9214, 122.0790]}
                            zoom={14}
                            style={{ height: '100%', width: '100%' }}
                            // @ts-ignore
                            attributionControl={false}
                          >
                            <ModalMapFix />
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
                                  <b>{loc.name}</b><br />{loc.address}
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
                            // textColor is hoisted below as locationTextColor

                            // Check if location selection should be locked
                            // Lock ONLY if both parties have confirmed (can only negotiate by resetting)
                            const bothParitiesConfirmed = buyerMeetupConfirmed && sellerMeetupConfirmed
                            const isLocked = bothParitiesConfirmed && trade.meetup_location !== undefined

                            return (
                              <Card
                                key={`location-${location.name}`}
                                variant="outline"
                                cursor={isLocked ? (isSelected ? "default" : "not-allowed") : "pointer"}
                                opacity={isLocked && !isSelected ? 0.5 : 1}
                                borderWidth={isPartner ? '2px' : isSelected ? '2px' : '1px'}
                                borderColor={isPartner ? 'orange.400' : isSelected ? 'brand.500' : isNearest ? 'blue.300' : borderColor}
                                bg={isSelected ? 'brand.50' : isPartner ? partnerBg : isNearest ? nearestBg : 'white'}
                                onClick={() => {
                                  if (!isLocked) {
                                    setSelectedLocation(location.name)
                                  } else if (!isSelected) {
                                    toast({
                                      id: "location-locked",
                                      title: 'Location Locked',
                                      description: `Both parties confirmed different locations. Click "Change My Selection" to modify your choice, or message them to negotiate.`,
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
                                        bg={isPartner ? partnerIconBg : defaultIconBg}
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
                                          <Text fontWeight="semibold" fontSize="sm" color={locationTextColor}>
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
                              Time
                            </FormLabel>
                            <InputGroup>
                              <InputLeftElement pointerEvents="none">
                                <Icon as={FiClock} color="gray.400" />
                              </InputLeftElement>
                              <Input
                                type="time"
                                value={selectedTime || ''}
                                onChange={(e) => setSelectedTime(e.target.value)}
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
                                  {formatTimePH(time)}
                                </Button>
                              ))}
                            </HStack>
                          </Box>
                        </VStack>
                      </Box>

                      <Divider />

                      {/* Agreement Status - Simplified UI */}
                      <Box
                        p={4}
                        bg={meetupInfoBg}
                        borderRadius="lg"
                        borderWidth="1px"
                        borderColor="blue.200"
                      >
                        <VStack spacing={4} align="stretch">
                          {/* Header */}
                          <HStack justify="center" spacing={2}>
                            <Icon as={FaHandshake} color="blue.500" boxSize={5} />
                            <Text fontWeight="bold" fontSize="md" color="blue.700">
                              Meetup Agreement
                            </Text>
                          </HStack>

                          {/* Simple Status Display */}
                          {!buyerMeetupConfirmed && !sellerMeetupConfirmed ? (
                            // Neither has submitted
                            <Box textAlign="center" py={2}>
                              <Text fontSize="sm" color="gray.600">
                                Select a location and time above, then click submit.
                              </Text>
                              <Text fontSize="xs" color="gray.500" mt={1}>
                                  {formatTimePH(buyerMeetupTime)}
                              </Text>
                            </Box>
                          ) : buyerMeetupConfirmed && sellerMeetupConfirmed ? (
                            // Both submitted - check if they match
                            buyerMeetupLocation === sellerMeetupLocation && buyerMeetupTime === sellerMeetupTime ? (
                              // MATCH - Success!
                              <VStack spacing={3} align="stretch">
                                <Box
                                  p={4}
                                  bg="green.100"
                                  borderRadius="md"
                                  borderWidth="2px"
                                  borderColor="green.400"
                                  textAlign="center"
                                >
                                  <Icon as={FaCheckCircle} color="green.500" boxSize={8} mb={2} />
                                  <Text fontWeight="bold" color="green.700" fontSize="md">
                                    You Both Agreed!
                                  </Text>
                                  <Text fontSize="sm" color="green.600" mt={1}>
                                    {buyerMeetupLocation}
                                  </Text>
                                  <Text fontSize="sm" color="green.600">
                                    {formatTimePH(buyerMeetupTime)}
                                  </Text>
                                  <Text fontSize="xs" color="green.500" mt={2}>
                                    Meetup agreed. Proceed to confirm you met.
                                  </Text>
                                </Box>

                                {!bothMetConfirmed ? (
                                  <VStack align="stretch" spacing={3}>
                                    <Box
                                      p={3}
                                      bg={meetupInfoBg}
                                      borderLeft="4px"
                                      borderColor="brand.500"
                                      borderRadius="md"
                                    >
                                      <Text fontSize="sm" color={meetupInfoTextColor} fontWeight="medium">
                                        Current Stage: Confirm you met at {buyerMeetupLocation} at {formatTimePH(buyerMeetupTime)}
                                      </Text>
                                    </Box>

                                    <Button
                                      colorScheme="green"
                                      size="lg"
                                      onClick={confirmMeetupDone}
                                      isLoading={confirmingMeetupDone}
                                      leftIcon={<FaCheckCircle />}
                                      w="full"
                                      isDisabled={userMetConfirmed}
                                    >
                                      {userMetConfirmed ? 'Confirmed ✓' : 'Confirm You Met'}
                                    </Button>

                                    {userMetConfirmed && (
                                      <Text fontSize="xs" color="gray.600" textAlign="center">
                                        Waiting for the other party to confirm.
                                      </Text>
                                    )}
                                  </VStack>
                                ) : (
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
                                )}
                              </VStack>
                            ) : (
                              // NO MATCH - Need to coordinate
                              <VStack spacing={3}>
                                <Box
                                  p={3}
                                  bg="orange.100"
                                  borderRadius="md"
                                  borderWidth="2px"
                                  borderColor="orange.400"
                                  textAlign="center"
                                  w="full"
                                >
                                  <Icon as={FaExclamationTriangle} color="orange.500" boxSize={6} mb={2} />
                                  <Text fontWeight="bold" color="orange.700" fontSize="sm">
                                    Different Selections
                                  </Text>
                                  <Text fontSize="xs" color="orange.600" mt={1}>
                                    You and {tradingPartner} picked different options.
                                  </Text>
                                </Box>

                                {/* Show both selections side by side */}
                                <SimpleGrid columns={2} spacing={3} w="full">
                                  <Box p={3} bg="white" borderRadius="md" borderWidth="1px" borderColor="gray.200">
                                    <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={1}>
                                      {isUserBuyer ? 'You picked:' : `${trade.buyer_name} picked:`}
                                    </Text>
                                    <Text fontSize="sm" fontWeight="medium" color="gray.700">
                                      {buyerMeetupLocation}
                                    </Text>
                                    <Text fontSize="xs" color="gray.500">
                                      {formatTimePH(buyerMeetupTime)}
                                    </Text>
                                  </Box>
                                  <Box p={3} bg="white" borderRadius="md" borderWidth="1px" borderColor="gray.200">
                                    <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={1}>
                                      {isUserSeller ? 'You picked:' : `${trade.seller_name} picked:`}
                                    </Text>
                                    <Text fontSize="sm" fontWeight="medium" color="gray.700">
                                      {sellerMeetupLocation}
                                    </Text>
                                    <Text fontSize="xs" color="gray.500">
                                      {formatTimePH(sellerMeetupTime)}
                                    </Text>
                                  </Box>
                                </SimpleGrid>

                                <Text fontSize="xs" color="gray.600" textAlign="center">
                                  Chat with {tradingPartner} and agree on one option, then both resubmit.
                                </Text>
                              </VStack>
                            )
                          ) : (
                            // One submitted, waiting for the other
                            <VStack spacing={3}>
                              <HStack justify="center" spacing={4} py={2}>
                                {/* Your status */}
                                <VStack spacing={1}>
                                  <Box
                                    w={10}
                                    h={10}
                                    borderRadius="full"
                                    bg={(isUserBuyer && buyerMeetupConfirmed) || (isUserSeller && sellerMeetupConfirmed) ? 'green.500' : 'gray.300'}
                                    display="flex"
                                    alignItems="center"
                                    justifyContent="center"
                                  >
                                    {(isUserBuyer && buyerMeetupConfirmed) || (isUserSeller && sellerMeetupConfirmed) ? (
                                      <Icon as={FaCheckCircle} color="white" boxSize={5} />
                                    ) : (
                                      <Icon as={FiClock} color="white" boxSize={5} />
                                    )}
                                  </Box>
                                  <Text fontSize="xs" fontWeight="medium" color="gray.600">You</Text>
                                </VStack>

                                {/* Connection line */}
                                <Box w="40px" h="2px" bg="gray.300" />

                                {/* Partner status */}
                                <VStack spacing={1}>
                                  <Box
                                    w={10}
                                    h={10}
                                    borderRadius="full"
                                    bg={(isUserBuyer && sellerMeetupConfirmed) || (isUserSeller && buyerMeetupConfirmed) ? 'green.500' : 'gray.300'}
                                    display="flex"
                                    alignItems="center"
                                    justifyContent="center"
                                  >
                                    {(isUserBuyer && sellerMeetupConfirmed) || (isUserSeller && buyerMeetupConfirmed) ? (
                                      <Icon as={FaCheckCircle} color="white" boxSize={5} />
                                    ) : (
                                      <Icon as={FiClock} color="white" boxSize={5} />
                                    )}
                                  </Box>
                                  <Text fontSize="xs" fontWeight="medium" color="gray.600">{tradingPartner.split(' ')[0]}</Text>
                                </VStack>
                              </HStack>

                              {/* Status message */}
                              {(isUserBuyer && buyerMeetupConfirmed) || (isUserSeller && sellerMeetupConfirmed) ? (
                                <Box textAlign="center">
                                  <Text fontSize="sm" color="green.600" fontWeight="medium">
                                    You submitted: {isUserBuyer ? buyerMeetupLocation : sellerMeetupLocation} at {formatTimePH(isUserBuyer ? buyerMeetupTime : sellerMeetupTime)}
                                  </Text>
                                  <Text fontSize="xs" color="gray.500" mt={1}>
                                    Waiting for {tradingPartner} to submit their choice...
                                  </Text>
                                </Box>
                              ) : (
                                <Box textAlign="center">
                                  <Text fontSize="sm" color="blue.600" fontWeight="medium">
                                    {tradingPartner} already submitted their choice
                                  </Text>
                                  <Text fontSize="xs" color="gray.500" mt={1}>
                                    Select the same location and time to agree!
                                  </Text>
                                </Box>
                              )}
                            </VStack>
                          )}
                        </VStack>
                      </Box>

                      {/* Submit Button */}
                      {selectedLocation && selectedTime && (
                        <Button
                          colorScheme={
                            (isUserBuyer && buyerMeetupConfirmed) || (isUserSeller && sellerMeetupConfirmed)
                              ? 'gray'
                              : 'green'
                          }
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
                          _hover={
                            !((isUserBuyer && buyerMeetupConfirmed) || (isUserSeller && sellerMeetupConfirmed))
                              ? { transform: 'translateY(-2px)', shadow: 'lg' }
                              : {}
                          }
                        >
                          {(isUserBuyer && buyerMeetupConfirmed) || (isUserSeller && sellerMeetupConfirmed)
                            ? 'Submitted ✓'
                            : `Submit: ${selectedLocation} at ${formatTimePH(selectedTime)}`}
                        </Button>
                      )}

                      {/* Change Selection Button - Only show when mismatch */}
                      {buyerMeetupConfirmed && sellerMeetupConfirmed &&
                        !(buyerMeetupLocation === sellerMeetupLocation && buyerMeetupTime === sellerMeetupTime) && (
                          <Button
                            colorScheme="orange"
                            variant="outline"
                            size="md"
                            onClick={async () => {
                              // Clear local state to allow resubmission
                              if (isUserBuyer) {
                                setBuyerMeetupConfirmed(false)
                              } else {
                                setSellerMeetupConfirmed(false)
                              }
                              // Also clear on backend
                              try {
                                await api.put(`/api/trades/${trade.id}`, {
                                  action: 'reset_meetup_selection',
                                })
                              } catch (e) {
                                console.log('Reset not supported, using local reset')
                              }
                            }}
                            leftIcon={<Icon as={FaExclamationTriangle} />}
                            w="full"
                          >
                            Change My Selection
                          </Button>
                        )}
                    </VStack >
                  )}
                </TabPanel >
              </TabPanels >
            </Tabs >
          </ModalBody >
        </ModalContent >
      </Modal >



      {/* Review Modal */}
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

