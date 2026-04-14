import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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
import OptimizedImage from './OptimizedImage'
import CancelTradeModal from './CancelTradeModal'
import { FaMapMarkerAlt, FaCheckCircle, FaClock, FaHandshake, FaPaperPlane, FaTruck, FaStar, FaStore, FaExclamationTriangle, FaCheck } from 'react-icons/fa'
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
import { getFirstImage, getImageUrl } from '../utils/imageUtils'

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
  distance?: number // Add distance for dynamic pricing
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

  const steps = useMemo(() => {
    if (trade?.trade_option !== 'delivery') return PROGRESS_STEPS

    // Delivery trades should not display meetup terminology.
    return PROGRESS_STEPS.map((s) => {
      if (s.id !== 'meetup_confirmed') return s
      return {
        ...s,
        label: 'Delivery Confirmed',
        icon: FaTruck,
        description: 'Delivery option confirmed for both parties',
      }
    })
  }, [trade?.trade_option])

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
  const currentStepIndex = steps.findIndex(s => s.id === currentStage)

  // Fix: Only mark steps as 'active' if they are truly reached
  const getStepStatus = (stepIndex: number): 'completed' | 'active' | 'inactive' => {
    // Step 0 logic depends on trade type
    if (stepIndex === 0) {
      if (trade?.trade_option === 'delivery') {
        // For delivery trades, step 0 represents confirming delivery method.
        // Mark it active on acceptance, and completed once trade is active.
        if (trade?.status === 'active' || trade?.status === 'completed') return 'completed'
        return trade?.status === 'accepted' ? 'active' : 'inactive'
      } else {
        // For meetup trades, step 0 is active when both parties confirm meetup
        const bothConfirmed = trade?.meetup_confirmed || (trade?.buyer_meetup_confirmed && trade?.seller_meetup_confirmed)
        if (!bothConfirmed) return 'inactive'
        return trade?.status === 'active' || trade?.status === 'completed' ? 'completed' : 'active'
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
        {steps.map((step, index) => {
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
          {steps.map((step, index) => {
            if (index === steps.length - 1) return null

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
        {steps[currentStepIndex]?.description}
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
  linkedDeliveries: Delivery[]
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
  linkedDeliveries,
}) => {
  const isSwapTrade = !!trade && Array.isArray(trade.items) && trade.items.some(i => i.offered_by === 'buyer')
  const bothConfirmed = deliveryState.buyerConfirmedReceipt && deliveryState.sellerConfirmedDelivery
  const allLegsDelivered = linkedDeliveries.length > 0
    ? linkedDeliveries.every(d => d.status === 'delivered')
    : linkedDelivery?.status === 'delivered'
  const deliveryCompleted = allLegsDelivered
  const deliveryFee = deliveryOptions[deliveryState.deliveryType].fee
  const deliverySteps = [
    { status: 'pending', label: 'Pending' },
    { status: 'claimed', label: 'Claimed' },
    { status: 'picked_up', label: 'Picked Up' },
    { status: 'in_transit', label: 'In Transit' },
    { status: 'delivered', label: 'Delivered' },
  ] as const

  const deliveryStatus = ((linkedDelivery?.status || (deliveryCompleted ? 'delivered' : 'pending')) as (typeof deliverySteps)[number]['status'])
  const deliveryStepIndexRaw = deliverySteps.findIndex(s => s.status === deliveryStatus)
  const deliveryStepIndex = deliveryStepIndexRaw >= 0 ? deliveryStepIndexRaw : 0
  const deliveryProgress = ((deliveryStepIndex + 1) / deliverySteps.length) * 100
  const deliveryStatusColorScheme =
    deliveryStatus === 'delivered'
      ? 'green'
      : deliveryStatus === 'in_transit'
        ? 'orange'
        : deliveryStatus === 'picked_up'
          ? 'purple'
          : deliveryStatus === 'claimed'
            ? 'blue'
            : 'gray'

  // Auto-confirm COD payment when delivery type is selected
  useEffect(() => {
    if (deliveryState.deliveryType && !deliveryState.paymentConfirmed && !confirmingPayment) {
      handleConfirmPayment()
    }
  }, [deliveryState.deliveryType])

  return (
    <VStack spacing={4} align="stretch">
      {/* Delivery tracking (same layout as Overview tab) */}
      <Card variant="outline" borderWidth="1px" borderColor="gray.200">
        <CardBody p={4}>
          <VStack spacing={3} align="stretch">
            <HStack spacing={3} align="center">
              <Icon as={FaTruck} color="green.600" />
              <Text fontWeight="bold" fontSize="sm">Delivery Tracking</Text>
              <Badge ml="auto" colorScheme={deliveryStatusColorScheme} fontSize="xs">
                {deliveryStatus.replace(/_/g, ' ').toUpperCase()}
              </Badge>
            </HStack>

            <Progress value={deliveryProgress} size="sm" borderRadius="full" colorScheme={deliveryStatusColorScheme} />

            <Text fontSize="2xs" color="gray.600">
              {isSwapTrade ? 'Swap delivery (2 deliveries)' : 'Single delivery (1 delivery)'}
              {isSwapTrade && linkedDeliveries.length < 2 ? ' • Waiting for return delivery to appear…' : ''}
            </Text>

            <HStack justify="space-between" align="start" spacing={2}>
              {deliverySteps.map((step, idx) => {
                const isActive = idx <= deliveryStepIndex
                return (
                  <VStack key={step.status} spacing={1} flex={1} minW={0}>
                    <Box
                      w="10px"
                      h="10px"
                      borderRadius="full"
                      bg={isActive ? `${deliveryStatusColorScheme}.500` : 'gray.300'}
                    />
                    <Text fontSize="2xs" color={isActive ? 'gray.700' : 'gray.500'} textAlign="center" noOfLines={1}>
                      {step.label}
                    </Text>
                  </VStack>
                )
              })}
            </HStack>

            {/* Back-to-back swap snapshot */}
            {linkedDeliveries.length > 1 && trade && (
              <VStack align="stretch" spacing={1}>
                {(() => {
                  const legToBuyer = linkedDeliveries[0]
                  const legReturnToSeller = linkedDeliveries[1]
                  const line = (label: string, status: Delivery['status']) => (
                    <HStack justify="space-between" spacing={3}>
                      <Text fontSize="2xs" color="gray.600" noOfLines={1}>{label}</Text>
                      <Text fontSize="2xs" color="gray.600" fontWeight="semibold">
                        {String(status).replace(/_/g, ' ').toUpperCase()}
                      </Text>
                    </HStack>
                  )
                  return (
                    <>
                      {line('Delivery to Buyer (Seller → Buyer)', legToBuyer.status)}
                      {line('Return to Seller (Buyer → Seller)', legReturnToSeller.status)}
                    </>
                  )
                })()}
                {deliveryCompleted && (
                  <Text fontSize="2xs" color="green.600" fontWeight="semibold">
                    Both deliveries delivered
                  </Text>
                )}
              </VStack>
            )}

            {linkedDelivery?.rider_name ? (
              <Text fontSize="xs" color="gray.600">
                Rider: <Text as="span" fontWeight="semibold">{linkedDelivery.rider_name}</Text>
              </Text>
            ) : (
              <Text fontSize="xs" color="gray.600">Waiting for a rider to claim this delivery.</Text>
            )}
          </VStack>
        </CardBody>
      </Card>

      <Card variant="outline" borderColor="blue.200">
        <CardBody py={[2, 3]} px={[3, 4]}>
          <VStack spacing={3} align="stretch">
            {/* Compact Header with Distance */}
            <HStack justify="space-between" align="center" flexWrap="wrap">
              <Text fontSize={["sm", "md"]} fontWeight="semibold">Delivery {distance.toFixed(1)}km</Text>
              <Text fontSize={["xs", "sm"]} color="gray.500">Pick one:</Text>
            </HStack>

            {/* Compact Delivery Options - Buttons with Mobile Responsiveness */}
            <SimpleGrid columns={[2, 2]} spacing={2} w="100%">
              {Object.entries(deliveryOptions).map(([type, option]: [string, any]) => (
                <Button
                  key={`delivery-${type}`}
                  colorScheme={deliveryState.deliveryType === type ? 'blue' : 'gray'}
                  variant={deliveryState.deliveryType === type ? 'solid' : 'outline'}
                  onClick={() => {
                    const newState = type as DeliveryState['deliveryType']
                    setDeliveryState(prev => ({ ...prev, deliveryType: newState }))
                    saveDeliveryState({ deliveryType: newState })
                  }}
                  w="100%"
                  py={3}
                  px={3}
                  h="auto"
                  minH="56px"
                >
                  <HStack w="full" justify="space-between" spacing={3} minW={0}>
                    <HStack spacing={2} minW={0}>
                      <Text fontSize={["lg", "xl"]} lineHeight="1">{option.icon}</Text>
                      <Text fontSize={["sm", "md"]} fontWeight="semibold" noOfLines={1}>
                        {type === 'standard' ? 'Standard' : 'Express'}
                      </Text>
                    </HStack>
                    <Text fontSize={["sm", "md"]} fontWeight="bold" flexShrink={0}>
                      ₱{option.fee}
                    </Text>
                  </HStack>
                </Button>
              ))}
            </SimpleGrid>

            {/* Instructions - Optional compact textarea */}
            <Box w="100%">
              <Textarea
                value={deliveryState.deliveryInstructions}
                onChange={(e) => setDeliveryState(prev => ({ ...prev, deliveryInstructions: e.target.value }))}
                onBlur={() => saveDeliveryState({ deliveryInstructions: deliveryState.deliveryInstructions })}
                placeholder="Delivery notes (optional)"
                size="sm"
                rows={2}
                fontSize={["xs", "sm"]}
                />
                <Text fontSize="xs" color="gray.500" mt={1}>{deliveryState.deliveryInstructions.length}/200 characters</Text>
              </Box>
            </VStack>
        </CardBody>
      </Card>

      <Card variant="outline" borderColor="green.200">
        <CardBody py={[2, 3]} px={[3, 4]}>
          <HStack justify="space-between" align={["start", "center"]} spacing={2} flexDir={["column", "row"]}>
            <HStack spacing={2} align="start">
              <Text fontSize={["lg", "2xl"]}>💵</Text>
              <VStack align="start" spacing={0}>
                <Text fontSize="sm" fontWeight="semibold">Delivery Fee (Cash on Delivery)</Text>
                <Text fontSize="xs" color="gray.500">This is the rider fee only</Text>
              </VStack>
            </HStack>
            <Text fontSize="sm" fontWeight="bold" color="green.600">
              ₱{deliveryFee.toFixed(2)}
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
    <VStack spacing={5} align="stretch">
      {/* Review Status Cards - Compact Layout */}
      {completionStatus && (
        <SimpleGrid columns={2} spacing={3}>
          <Box p={3} bg={completionStatus.buyer_completed ? 'green.50' : 'gray.50'} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
            <VStack spacing={2}>
              <HStack justify="space-between" w="full">
                <Text fontWeight="semibold" fontSize="sm">Buyer Review</Text>
                <Icon
                  as={completionStatus.buyer_completed ? FaCheck : FaClock}
                  color={completionStatus.buyer_completed ? 'green.500' : 'gray.400'}
                  boxSize={4}
                />
              </HStack>
              {completionStatus.buyer_rating && (
                <HStack spacing={1} w="full" justify="space-between">
                  <HStack spacing={0.5}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Icon
                        key={`buyer-star-${star}`}
                        as={FaStar}
                        color={star <= completionStatus.buyer_rating ? 'yellow.400' : 'gray.300'}
                        boxSize={3}
                      />
                    ))}
                  </HStack>
                  <Text fontSize="xs" color="gray.600" fontWeight="semibold">
                    {completionStatus.buyer_rating}/5
                  </Text>
                </HStack>
              )}
              {completionStatus.buyer_feedback && (
                <Text fontSize="xs" color="gray.600" noOfLines={1} fontStyle="italic" w="full">
                  "{completionStatus.buyer_feedback}"
                </Text>
              )}
            </VStack>
          </Box>

          <Box p={3} bg={completionStatus.seller_completed ? 'green.50' : 'gray.50'} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
            <VStack spacing={2}>
              <HStack justify="space-between" w="full">
                <Text fontWeight="semibold" fontSize="sm">Seller Review</Text>
                <Icon
                  as={completionStatus.seller_completed ? FaCheck : FaClock}
                  color={completionStatus.seller_completed ? 'green.500' : 'gray.400'}
                  boxSize={4}
                />
              </HStack>
              {completionStatus.seller_rating && (
                <HStack spacing={1} w="full" justify="space-between">
                  <HStack spacing={0.5}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Icon
                        key={`seller-star-${star}`}
                        as={FaStar}
                        color={star <= completionStatus.seller_rating ? 'yellow.400' : 'gray.300'}
                        boxSize={3}
                      />
                    ))}
                  </HStack>
                  <Text fontSize="xs" color="gray.600" fontWeight="semibold">
                    {completionStatus.seller_rating}/5
                  </Text>
                </HStack>
              )}
              {completionStatus.seller_feedback && (
                <Text fontSize="xs" color="gray.600" noOfLines={1} fontStyle="italic" w="full">
                  "{completionStatus.seller_feedback}"
                </Text>
              )}
            </VStack>
          </Box>
        </SimpleGrid>
      )}

      {/* Review Form - Only show if current user hasn't completed */}
      {!userHasCompleted && (
        <Box borderWidth="2px" borderColor="blue.200" bg={meetupInfoBg} p={4} borderRadius="md">
          <VStack spacing={4} align="stretch">
            <Text fontWeight="semibold" fontSize="sm">
              Your Review
            </Text>

            {/* Rating */}
            <FormControl isRequired>
              <FormLabel fontSize="xs" fontWeight="semibold">Rating</FormLabel>
              <HStack spacing={2}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Icon
                    key={star}
                    as={FaStar}
                    color={star <= rating ? 'yellow.400' : 'gray.300'}
                    cursor="pointer"
                    onClick={() => setRating(star)}
                    boxSize={6}
                    transition="all 0.1s"
                    _hover={{ transform: 'scale(1.1)' }}
                  />
                ))}
                <Text fontSize="xs" fontWeight="semibold" ml={2}>
                  {rating}/5
                </Text>
              </HStack>
            </FormControl>

            {/* Feedback */}
            <FormControl isRequired>
              <FormLabel fontSize="xs" fontWeight="semibold">Feedback</FormLabel>
              <Textarea
                autoFocus
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Share your experience with this trade..."
                rows={3}
                fontSize="sm"
                borderColor={borderColor}
                _focus={{ borderColor: 'brand.500', boxShadow: '0 0 0 1px var(--chakra-colors-brand-500)' }}
              />
              <Text fontSize="xs" color="gray.500" mt={1}>
                {feedback.length} characters
              </Text>
            </FormControl>

            {/* Proof Image */}
            <FormControl>
              <FormLabel fontSize="xs" fontWeight="semibold">
                Proof Image {proofRequired ? '(Required)' : '(Optional)'}
              </FormLabel>
              {proofImage ? (
                <VStack spacing={2} align="stretch">
                  <Box position="relative" w="full" maxW="150px">
                    <Image
                      src={proofImage}
                      alt="Proof"
                      w="full"
                      maxH="120px"
                      objectFit="cover"
                      borderRadius="md"
                      borderWidth="2px"
                      borderColor="green.300"
                    />
                    <Icon
                      as={FiCheck}
                      position="absolute"
                      top={1}
                      right={1}
                      color="green.500"
                      boxSize={5}
                      bg="white"
                      borderRadius="full"
                      p={0.5}
                    />
                  </Box>
                  <Button
                    size="xs"
                    variant="outline"
                    colorScheme="blue"
                    onClick={() => document.getElementById('proof-upload-review')?.click()}
                  >
                    Change Image
                  </Button>
                </VStack>
              ) : (
                <Button
                  size="sm"
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
              size="md"
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
        </Box>
      )}

      {/* Both Completed Message */}
      {completionStatus?.buyer_completed && completionStatus?.seller_completed && (
        <Box p={3} bg="green.50" borderRadius="md" borderWidth="2px" borderColor="green.300" textAlign="center">
          <Icon as={FiCheck} boxSize={6} color="green.500" mb={2} mx="auto" display="block" />
          <Text fontWeight="bold" color="green.700" mb={1} fontSize="sm">
            Trade Completed Successfully! 🎉
          </Text>
          <Text fontSize="xs" color="green.600">
            Both parties have submitted their reviews. Thank you for using Clovia!
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
  const navigate = useNavigate()
  const [messages, setMessages] = useState<TradeMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [requestedProduct, setRequestedProduct] = useState<Product | null>(null)
  const [offeredProducts, setOfferedProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [searchedLocations, setSearchedLocations] = useState<MeetupLocation[]>([])
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResults, setPlaceResults] = useState<Array<{ name: string; address: string; latitude: number; longitude: number }>>([])
  const [placeSearching, setPlaceSearching] = useState(false)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [confirmingMeetup, setConfirmingMeetup] = useState(false)
  const [resettingMeetup, setResettingMeetup] = useState(false)
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
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [deliveryState, setDeliveryState] = useState<DeliveryState>({
    deliveryType: 'standard',
    paymentMethod: 'cod',
    paymentConfirmed: false,
    buyerConfirmedReceipt: false,
    sellerConfirmedDelivery: false,
    deliveryInstructions: '',
  })
  const [linkedDelivery, setLinkedDelivery] = useState<Delivery | null>(null)
  const [linkedDeliveries, setLinkedDeliveries] = useState<Delivery[]>([])
  const [userAvatarById, setUserAvatarById] = useState<Record<number, string>>({})
  const fetchedAvatarUserIdsRef = useRef<Set<number>>(new Set())
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
  const messagesRequestSeqRef = useRef(0)
  const shownMessageNotificationsRef = useRef<Set<string>>(new Set())  // Track which message IDs have shown notifications
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

  const resolveAvatarSrc = (raw?: string | null): string | undefined => {
    if (!raw) return undefined
    // Normalize relative paths to backend URL; keep full URLs as-is.
    return getImageUrl(raw)
  }

  // Fetch buyer/seller public profile to get profile pictures for avatars.
  useEffect(() => {
    if (!isOpen) return
    if (!trade?.buyer_id || !trade?.seller_id) return

    let cancelled = false

    const fetchAvatarForUser = async (id: number) => {
      if (!id) return
      if (fetchedAvatarUserIdsRef.current.has(id)) return
      fetchedAvatarUserIdsRef.current.add(id)

      try {
        const res = await api.get(`/api/users/${id}`)
        const payload = res.data?.data || res.data
        const apiUser = (payload?.user || payload) as any
        const rawPic = apiUser?.profile_picture || apiUser?.avatar_url || apiUser?.org_logo_url || apiUser?.logo_url
        if (!rawPic) return

        if (!cancelled) {
          setUserAvatarById(prev => ({ ...prev, [id]: rawPic }))
        }
      } catch (_) {
        // Best-effort: keep initials fallback.
      }
    }

    fetchAvatarForUser(Number(trade.buyer_id))
    fetchAvatarForUser(Number(trade.seller_id))

    return () => {
      cancelled = true
    }
  }, [isOpen, trade?.buyer_id, trade?.seller_id])

  // Debounced place search (Google Places / Nominatim via backend)
  useEffect(() => {
    const q = placeQuery.trim()
    if (q.length < 2) {
      setPlaceResults([])
      setPlaceSearching(false)
      return
    }
    setPlaceSearching(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q })
        if (user?.latitude && user?.longitude) {
          params.set('lat', String(user.latitude))
          params.set('lng', String(user.longitude))
        }
        const res = await api.get(`/api/places/search?${params.toString()}`)
        if (!cancelled) {
          setPlaceResults(res.data?.results || [])
        }
      } catch {
        if (!cancelled) setPlaceResults([])
      } finally {
        if (!cancelled) setPlaceSearching(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [placeQuery, user?.latitude, user?.longitude])

  const defaultLocations: MeetupLocation[] = [
    { name: 'Meet n Eat', address: 'Gov. Camins Ave, Zamboanga City', type: 'cafe', lat: 6.9150, lng: 122.0630, isPartner: true },
    { name: 'WMSU', address: 'Normal Road, Zamboanga City', type: 'public', lat: 6.9214, lng: 122.0790 },
    { name: 'SM Mindpro', address: 'La Purisima St, Zamboanga City', type: 'mall', lat: 6.9080, lng: 122.0745 },
    { name: 'KCC de Zamboanga', address: 'Gov. Camins Ave, Zamboanga City', type: 'mall', lat: 6.9142, lng: 122.0620 },
    { name: 'Amethyst Eatery', address: 'Zamboanga City', type: 'cafe', lat: 6.9125, lng: 122.0720, isPartner: true },
    { name: 'Paseo del Mar', address: 'Valderosa St, Zamboanga City', type: 'public', lat: 6.9030, lng: 122.0780 },
    { name: 'Local coffee shops', address: 'Various locations in Zamboanga', type: 'cafe', isPartner: true },
  ]
  const suggestedLocations: MeetupLocation[] = useMemo(
    () => [...searchedLocations, ...defaultLocations],
    [searchedLocations],
  )

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
    // Always stop polling when the modal is closed
    if (!isOpen) {
      if (messagesPollRef.current) {
        clearInterval(messagesPollRef.current)
        messagesPollRef.current = null
      }

      previousMessageCountRef.current = 0
      setMessages([])
      setNewMessage('')
      shownMessageNotificationsRef.current.clear()
      return
    }

    // Keep current UI as-is until we have a stable trade id
    if (!trade?.id) return

    // Reset message count tracker when opening a new trade id
    previousMessageCountRef.current = 0
    shownMessageNotificationsRef.current.clear()

    fetchMessages({ showLoading: true })
    fetchProducts()
    fetchMeetupStatus()

    // Ensure we never stack multiple polling intervals
    if (messagesPollRef.current) {
      clearInterval(messagesPollRef.current)
      messagesPollRef.current = null
    }

    // Poll for new messages every 3 seconds without flashing a loader
    messagesPollRef.current = setInterval(() => fetchMessages({ showLoading: false }), 3000)
    return () => {
      if (messagesPollRef.current) {
        clearInterval(messagesPollRef.current)
        messagesPollRef.current = null
      }
    }
  }, [isOpen, trade?.id])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fetch linked delivery for delivery trades and poll for updates
  useEffect(() => {
    if (!trade || trade.trade_option !== 'delivery' || !isOpen) {
      setLinkedDelivery(null)
      setLinkedDeliveries([])
      return
    }
    // Only fetch when trade is active or later
    if (!['active', 'accepted', 'awaiting_confirmation', 'completed', 'auto_completed'].includes(trade.status)) {
      return
    }

    const fetchLinkedDelivery = async () => {
      try {
      let deliveries: Delivery[] = []
      try {
        const response = await api.get(`/api/trades/${trade.id}/deliveries`)
        const data = response.data?.data
        deliveries = Array.isArray(data) ? data : []
      } catch (e) {
        // Fallback handled below
      }

      // Fallback: older endpoint (also triggers backend auto-create for missing deliveries)
      if (!deliveries || deliveries.length === 0) {
        try {
          const r = await api.get(`/api/trades/${trade.id}/delivery`)
          const single: Delivery | null = r.data?.data && (r.data.data as any).id ? (r.data.data as Delivery) : null
          if (single) {
            setLinkedDelivery(single)
            setLinkedDeliveries([single])
            return
          }
        } catch (_) {
          // Ignore; we'll clear state below.
        }

        setLinkedDelivery(null)
        setLinkedDeliveries([])
        return
      }

      setLinkedDeliveries(deliveries)
      const active = deliveries.find(d => d.status !== 'delivered') || deliveries[deliveries.length - 1] || null
      setLinkedDelivery(active && (active as any).id ? active : null)
      } catch (e) {
      console.log('No linked delivery found for trade', trade.id)
      setLinkedDelivery(null)
      setLinkedDeliveries([])
      }
    }

    fetchLinkedDelivery()
    // Poll every 10 seconds while delivery is in progress
    const interval = setInterval(fetchLinkedDelivery, 10000)
    return () => clearInterval(interval)
  }, [trade?.id, trade?.status, trade?.trade_option, isOpen])

  const fetchMessages = async (options?: { showLoading?: boolean }) => {
    // Avoid spinner flicker on refresh when we already have messages.
    const showLoading = !!options?.showLoading && messages.length === 0
    if (!trade) return

    const requestSeq = ++messagesRequestSeqRef.current

    try {
      if (showLoading) setLoadingMessages(true)
      
      const response = await Promise.race([
        api.get(`/api/trades/${trade.id}/messages`),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 10000)
        )
      ]) as any
      
      const data = response.data?.data || []
      const safeMessages = Array.isArray(data) ? data : []
      safeMessages.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

      // Ignore stale/out-of-order responses (common on mobile networks)
      if (requestSeq !== messagesRequestSeqRef.current) return
      
      // Check if there are new messages from the other user
      const previousCount = previousMessageCountRef.current
      const newMessageCount = safeMessages.length
      
      // Only show notification if this is NOT the initial load and there are actually new messages
      if (previousCount > 0 && newMessageCount > previousCount) {
        // Get the new messages (only the ones we haven't seen yet)
        const newMessages = safeMessages.slice(previousCount)
        // Check if any new message is from the other user (not the current user)
        const otherUserMessages = newMessages.filter((msg: any) => Number(msg.sender_id) !== currentUserId)
        
        if (otherUserMessages.length > 0) {
          const latestMessage = otherUserMessages[otherUserMessages.length - 1]
          const senderName = latestMessage.sender_name || 'User'
          const messageId = String(latestMessage.id || `msg-${Date.now()}`)
          
          // Only show notification if we haven't already shown one for this message
          if (!shownMessageNotificationsRef.current.has(messageId)) {
            shownMessageNotificationsRef.current.add(messageId)
            
            // Show notification for new message from other user at the top
            const toastId = `new-message-${messageId}`
            toast({
              id: toastId,
              title: `New message from ${senderName}`,
              description: latestMessage.content.substring(0, 60) + (latestMessage.content.length > 60 ? '...' : ''),
              status: 'info',
              duration: 3000,
              isClosable: true,
              position: 'top' as const,
            })
          }
        }
      }
      
      // Never allow the tracker to move backwards (prevents duplicate toasts)
      previousMessageCountRef.current = Math.max(previousCount, newMessageCount)
      setMessages(safeMessages)
    } catch (error: any) {
      console.error('Failed to fetch messages:', error)
    } finally {
      // Only the most recent request is allowed to clear the loading state.
      if (showLoading && requestSeq === messagesRequestSeqRef.current) setLoadingMessages(false)
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
      // Refresh trade data to ensure UI reflects actual backend state
      await fetchMeetupStatus()
    } finally {
      setConfirmingMeetup(false)
    }
  }

  const resetMeetupSelection = async () => {
    if (!trade) return

    try {
      setResettingMeetup(true)
      
      // Call backend to reset
      await api.put(`/api/trades/${trade.id}`, {
        action: 'reset_meetup_selection',
      })

      // Clear local state immediately so UI is responsive
      if (isUserBuyer) {
        setBuyerMeetupConfirmed(false)
      } else {
        setSellerMeetupConfirmed(false)
      }
      
      // Clear selected location and time to allow new selection
      setSelectedLocation(null)
      setSelectedTime(null)

      toast({
        id: 'viewtrademodal-reset-selection',
        title: 'Selection Reset',
        description: 'Your meetup selection has been cleared. You can now select new options.',
        status: 'info',
        duration: 3000,
      })

      // Refresh meetup status
      await fetchMeetupStatus()
    } catch (error: any) {
      console.error('Failed to reset meetup selection:', error)
      toast({
        id: 'viewtrademodal-reset-error',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to reset selection',
        status: 'error',
      })
    } finally {
      setResettingMeetup(false)
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


  const isDeliveryTrade = trade.trade_option === 'delivery'


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
      <Modal isOpen={isOpen} onClose={onClose} size={["sm", "md", "lg", "6xl"]} isCentered scrollBehavior="inside">
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <ModalContent
          bg={cardBg}
          borderRadius={["md", "lg", "xl"]}
          boxShadow="xl"
          maxH="90vh"
          mx={[2, 4]}
          display="flex"
          flexDirection="column"
        >
          <ModalHeader>
            <HStack spacing={2} fontSize={["sm", "md"]}>
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
                fontSize={["xs", "sm"]}
              >
                {trade.status === 'active'
                  ? 'In Progress'
                  : trade.status === 'completed'
                    ? 'Completed'
                    : trade.status === 'accepted'
                      ? 'Waiting for Meetup'
                      : 'Pending'}
              </Badge>
              {['pending', 'accepted', 'active', 'awaiting_confirmation'].includes(trade.status) && (
                <Button
                  size="xs"
                  colorScheme="red"
                  variant="outline"
                  ml={2}
                  leftIcon={<Icon as={FaExclamationTriangle} />}
                  onClick={() => setIsCancelModalOpen(true)}
                >
                  Cancel Trade
                </Button>
              )}
            </HStack>
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody overflowY="auto" flex={1} p={[3, 4, 6]}>
            <Tabs colorScheme="brand" index={tabIndex} onChange={(i) => setTabIndex(i)}>
              <TabList fontSize={["sm", "md"]}>
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
                <TabPanel px={[0, 2]}>
                  <VStack spacing={[4, 6]} align="stretch">
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


                    {/* Trade Progress Indicator (meetup only) */}
                    {!isDeliveryTrade && <TradeProgressIndicator trade={trade} />}

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
                      cursor="pointer"
                      _hover={{ bg: 'gray.100' }}
                      onClick={() => navigate(`/users/${isUserBuyer ? trade?.seller_id : trade?.buyer_id}`)}
                    >
                      <HStack spacing={4}>
                        <VerifiedAvatar
                          name={tradingPartner}
                          src={resolveAvatarSrc(userAvatarById[Number(isUserBuyer ? trade?.seller_id : trade?.buyer_id)])}
                          size="md"
                          bg={isUserBuyer ? 'green.500' : 'blue.500'}
                          color="white"
                          isVerified={false}
                        />
                        <Box flex={1}>
                          <Text fontWeight="semibold" _hover={{ textDecoration: 'underline' }}>
                            {tradingPartner}
                          </Text>
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
                                  <OptimizedImage
                                    src={getFirstImage(requestedProduct.image_urls)}
                                    alt={requestedProduct.title}
                                    displayWidth="full"
                                    displayHeight="150px"
                                    objectFit="cover"
                                    borderRadius="md"
                                    fallbackSrc="/no-image.svg"
                                    width={300}
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
                                      <OptimizedImage
                                        src={getFirstImage(product.image_urls)}
                                        alt={product.title}
                                        displayWidth="full"
                                        displayHeight="150px"
                                        objectFit="cover"
                                        borderRadius="md"
                                        fallbackSrc="/no-image.svg"
                                        width={250}
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
                            {(() => {
                              // Deliveries are returned ordered by creation time (first delivery, then return delivery).
                              // Prefer the ordered list for leg selection to avoid relying on legacy user_id semantics.
                              const activeLeg = linkedDelivery
                              const orderedLegs = Array.isArray(linkedDeliveries) ? linkedDeliveries : []
                              const leg1 = orderedLegs[0] || activeLeg || null
                              const leg2 = orderedLegs[1] || null
                              const isSwap = Array.isArray(trade?.items) && trade.items.some(i => i.offered_by === 'buyer')

                              const leg1Pickup = leg1?.pickup_address || ''
                              const leg1Drop = leg1?.delivery_address || trade?.delivery_address || ''
                              const leg2Pickup = leg2?.pickup_address || ''
                              const leg2Drop = leg2?.delivery_address || ''

                              const renderAddressPair = (opts: {
                                senderTitle: string
                                receiverTitle: string
                                senderAddress: string
                                receiverAddress: string
                                showSenderNote?: boolean
                                senderNote?: string
                                showReceiverNote?: boolean
                                receiverNote?: string
                              }) => (
                                <>
                                  <Card variant="outline" borderColor="blue.300">
                                    <CardBody p={4}>
                                      <HStack spacing={3} mb={2}>
                                        <Icon as={FaMapMarkerAlt} color="blue.500" boxSize={5} />
                                        <Text fontWeight="semibold" fontSize="sm">{opts.senderTitle}</Text>
                                      </HStack>
                                      <Text fontSize="sm" color="gray.700" ml={8}>
                                        {opts.senderAddress || 'Waiting for delivery to be created...'}
                                      </Text>
                                      {opts.showSenderNote && opts.senderNote && (
                                        <Text fontSize="xs" color="gray.500" mt={2} ml={8}>
                                          {opts.senderNote}
                                        </Text>
                                      )}
                                    </CardBody>
                                  </Card>

                                  <Card variant="outline" borderColor="green.300">
                                    <CardBody p={4}>
                                      <HStack spacing={3} mb={2}>
                                        <Icon as={FaMapMarkerAlt} color="green.500" boxSize={5} />
                                        <Text fontWeight="semibold" fontSize="sm">{opts.receiverTitle}</Text>
                                      </HStack>
                                      <Text fontSize="sm" color="gray.700" ml={8}>
                                        {opts.receiverAddress || 'Waiting for delivery to be created...'}
                                      </Text>
                                      {opts.showReceiverNote && opts.receiverNote && (
                                        <Text fontSize="xs" color="gray.500" mt={2} ml={8}>
                                          {opts.receiverNote}
                                        </Text>
                                      )}
                                    </CardBody>
                                  </Card>
                                </>
                              )

                              return (
                                <>
                                  {isSwap ? (
                                    <>
                                      {renderAddressPair({
                                        senderTitle: 'Delivery to Buyer — Pickup Location (Seller → Buyer)',
                                        receiverTitle: 'Delivery to Buyer — Drop-off Location (Seller → Buyer)',
                                        senderAddress: leg1Pickup,
                                        receiverAddress: leg1Drop,
                                        showSenderNote: isUserSeller,
                                        senderNote: '(Your pickup address)',
                                        showReceiverNote: isUserBuyer,
                                        receiverNote: '(Your delivery address)',
                                      })}

                                      {renderAddressPair({
                                        senderTitle: 'Return to Seller — Pickup Location (Buyer → Seller)',
                                        receiverTitle: 'Return to Seller — Drop-off Location (Buyer → Seller)',
                                        senderAddress: leg2Pickup,
                                        receiverAddress: leg2Drop,
                                        showSenderNote: isUserBuyer,
                                        senderNote: '(Your pickup address)',
                                        showReceiverNote: isUserSeller,
                                        receiverNote: '(Your delivery address)',
                                      })}
                                    </>
                                  ) : (
                                    renderAddressPair({
                                      senderTitle: 'Sender Location',
                                      receiverTitle: 'Receiver Location',
                                      senderAddress: leg1Pickup,
                                      receiverAddress: leg1Drop,
                                      showSenderNote: isUserSeller,
                                      senderNote: '(Your pickup address)',
                                      showReceiverNote: isUserBuyer,
                                      receiverNote: '(Your delivery address)',
                                    })
                                  )}

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
                                    name={linkedDelivery?.rider_name || 'Rider'}
                                    size="sm"
                                    bg="orange.500"
                                    color="white"
                                  />
                                  <Box flex={1} minW={0}>
                                    <Text fontWeight="semibold" fontSize="sm">Assigned Rider</Text>
                                    <Text fontSize="sm" color="gray.700" noOfLines={1}>
                                      {linkedDelivery?.rider_name || 'Waiting for a rider to claim this delivery'}
                                    </Text>
                                  </Box>
                                  {linkedDelivery?.rider_rating != null && (
                                    <HStack spacing={1} flexShrink={0}>
                                      <Icon as={FaStar} color="yellow.400" boxSize={3} />
                                      <Text fontSize="xs" color="gray.600">{linkedDelivery.rider_rating.toFixed(1)}</Text>
                                    </HStack>
                                  )}
                                </HStack>

                                {linkedDelivery?.rider_vehicle && (
                                  <HStack spacing={2} ml={8} mt={2}>
                                    <Icon as={FiTruck} color="orange.500" boxSize={4} />
                                    <Text fontSize="sm" color="gray.700" noOfLines={1}>{linkedDelivery.rider_vehicle}</Text>
                                  </HStack>
                                )}

                                {linkedDelivery?.rider_phone && (
                                  <HStack spacing={2} ml={8} mt={2}>
                                    <Icon as={FiPhone} color="orange.500" boxSize={4} />
                                    <Text fontSize="sm" color="gray.700">{linkedDelivery.rider_phone}</Text>
                                  </HStack>
                                )}
                              </CardBody>
                            </Card>
                                </>
                              )
                            })()}
                          </VStack>
                        </Box>
                      </>
                    )}
                  </VStack>
                </TabPanel>


                {/* Chat Tab */}
                <TabPanel px={[0, 2]}>
                  <VStack spacing={3} align="stretch" h={["300px", "400px", "500px"]} display="flex" flexDirection="column">
                    {/* Messages Area */}
                    <Box
                      flex={1}
                      overflowY="auto"
                      p={[2, 3, 4]}
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
                            const senderAvatarSrc = isOwnMessage
                              ? resolveAvatarSrc((user as any)?.profile_picture)
                              : resolveAvatarSrc(userAvatarById[Number(msg.sender_id)])
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
                                    src={senderAvatarSrc}
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
                                    src={senderAvatarSrc}
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
                <TabPanel px={[0, 2]}>
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
                      linkedDeliveries={linkedDeliveries}
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
                        <Text fontSize="sm" color="gray.600" mb={3}>
                          Select a safe, public location. Both parties must confirm to proceed.
                        </Text>

                        {/* Place search (Google Maps) */}
                        <Box mb={4} position="relative" zIndex={1500}>
                          <InputGroup size="sm">
                            <InputLeftElement pointerEvents="none">
                              <Icon as={FaMapMarkerAlt} color="gray.400" />
                            </InputLeftElement>
                            <Input
                              placeholder='Search any place in PH (e.g. "claret jollibee")'
                              value={placeQuery}
                              onChange={(e) => setPlaceQuery(e.target.value)}
                              pr={placeSearching ? '2rem' : undefined}
                            />
                            {placeSearching && (
                              <Box position="absolute" right={2} top="50%" transform="translateY(-50%)" zIndex={2}>
                                <Spinner size="xs" />
                              </Box>
                            )}
                          </InputGroup>
                          {placeResults.length > 0 && (
                            <Box
                              position="absolute"
                              top="100%"
                              left={0}
                              right={0}
                              zIndex={1500}
                              bg="white"
                              borderWidth="1px"
                              borderColor={borderColor}
                              borderRadius="md"
                              boxShadow="lg"
                              maxH="240px"
                              overflowY="auto"
                              mt={1}
                            >
                              {placeResults.map((r, idx) => (
                                <Box
                                  key={`${r.name}-${idx}`}
                                  px={3}
                                  py={2}
                                  cursor="pointer"
                                  _hover={{ bg: 'brand.50' }}
                                  borderBottomWidth={idx < placeResults.length - 1 ? '1px' : 0}
                                  borderColor="gray.100"
                                  onClick={() => {
                                    const loc: MeetupLocation = {
                                      name: r.name,
                                      address: r.address,
                                      type: 'other',
                                      lat: r.latitude,
                                      lng: r.longitude,
                                    }
                                    setSearchedLocations((prev) => {
                                      if (prev.find((p) => p.name === loc.name)) return prev
                                      return [loc, ...prev].slice(0, 5)
                                    })
                                    setSelectedLocation(loc.name)
                                    setPlaceResults([])
                                    setPlaceQuery('')
                                  }}
                                >
                                  <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
                                    {r.name}
                                  </Text>
                                  <Text fontSize="xs" color="gray.500" noOfLines={1}>
                                    {r.address}
                                  </Text>
                                </Box>
                              ))}
                            </Box>
                          )}
                        </Box>

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
                            onClick={resetMeetupSelection}
                            isLoading={resettingMeetup}
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



      {/* Cancel Trade Modal */}
      {trade && (
        <CancelTradeModal
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          tradeId={trade.id}
          isOngoing={['accepted', 'active', 'awaiting_confirmation'].includes(trade.status)}
          onCancelled={() => {
            onStatusUpdate()
            onClose()
          }}
        />
      )}

      {/* Review Modal */}
      <Modal isOpen={isReviewModalOpen} onClose={() => setIsReviewModalOpen(false)} size={["xs", "sm", "md"]} isCentered scrollBehavior="inside">
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <ModalContent bg={cardBg} borderRadius={["md", "lg", "xl"]} boxShadow="xl" maxW={["90vw", "500px"]} mx={[2, 4]}>
          <ModalHeader>
            <HStack spacing={2} fontSize={["sm", "md"]}>
              <Icon as={FaStar} color="yellow.400" />
              <Text>Trade Review & Completion</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody py={[4, 6]} px={[3, 6]}>
            <ReviewTab
              trade={trade}
              isUserBuyer={isUserBuyer ?? false}
              isUserSeller={isUserSeller ?? false}
              user={user}
              onStatusUpdate={() => {
                onStatusUpdate()
                // Keep modal open so user can see completion status
              }}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  )
}

export default ViewTradeModal

