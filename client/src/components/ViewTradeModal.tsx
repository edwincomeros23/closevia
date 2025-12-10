import React, { useState, useEffect, useRef } from 'react'
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
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Input,
  InputGroup,
  InputLeftElement,
  FormLabel as Label,
  FormControl,
  FormLabel,
  Grid,
} from '@chakra-ui/react'
import { FaMapMarkerAlt, FaCheckCircle, FaClock, FaHandshake, FaPaperPlane, FaTruck, FaStar } from 'react-icons/fa'
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
import { Trade, Product, TradeOption } from '../types'
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
}

interface MeetupLocation {
  name: string
  address: string
  type: 'cafe' | 'mall' | 'public' | 'other'
}

interface DeliveryState {
  deliveryType: 'standard' | 'express' | 'meetup'
  paymentMethod: 'gcash' | 'cod' | 'wallet'
  paymentConfirmed: boolean
  proofOfDelivery: string | null
  buyerConfirmedReceipt: boolean
  sellerConfirmedDelivery: boolean
  expandedSections: {
    options: boolean
    payment: boolean
    details: boolean
    proof: boolean
    completion: boolean
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
  toggleSection: (section: keyof DeliveryState['expandedSections']) => void
  handleProofUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleConfirmPayment: () => Promise<void>
  handleConfirmDelivery: () => Promise<void>
  saveDeliveryState: (updates: Partial<DeliveryState>) => Promise<void>
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
  toggleSection,
  handleProofUpload,
  handleConfirmPayment,
  handleConfirmDelivery,
  saveDeliveryState,
}) => {
  const bothConfirmed = deliveryState.buyerConfirmedReceipt && deliveryState.sellerConfirmedDelivery
  const totalCost = (requestedProduct?.price || 0) + deliveryOptions[deliveryState.deliveryType].fee

  return (
    <VStack spacing={4} align="stretch">
      {/* Delivery Progress Indicator */}
      <Box
        p={4}
        bg={useColorModeValue('blue.50', 'blue.900')}
        borderRadius="lg"
        borderLeftWidth="4px"
        borderLeftColor="blue.500"
      >
        <HStack spacing={3} mb={2}>
          <Icon as={FaTruck} color="blue.500" boxSize={5} />
          <Text fontWeight="semibold" color={useColorModeValue('blue.700', 'blue.200')}>
            Trade Progress
          </Text>
        </HStack>
        <Progress
          value={
            bothConfirmed ? 100 : deliveryState.paymentConfirmed ? 50 : deliveryState.deliveryType ? 25 : 0
          }
          size="sm"
          colorScheme="blue"
          borderRadius="full"
        />
        <Text fontSize="xs" color={useColorModeValue('blue.600', 'blue.300')} mt={2}>
          {bothConfirmed
            ? '✓ Delivery Complete'
            : deliveryState.paymentConfirmed
            ? 'Payment Confirmed - Awaiting Delivery'
            : 'Setup in Progress'}
        </Text>
      </Box>

      {/* 1. DELIVERY OPTIONS */}
      <Accordion allowToggle>
        <AccordionItem
          border="2px"
          borderColor={deliveryState.expandedSections.options ? 'blue.400' : 'gray.200'}
          borderRadius="lg"
          bg={deliveryState.expandedSections.options ? 'blue.50' : 'white'}
          overflow="hidden"
        >
          <AccordionButton
            onClick={() => toggleSection('options')}
            _hover={{ bg: deliveryState.expandedSections.options ? 'blue.100' : 'gray.50' }}
            py={4}
          >
            <HStack spacing={3} flex={1}>
              <Icon as={FiTruck} boxSize={5} color="blue.500" />
              <VStack align="start" spacing={0}>
                <Text fontWeight="semibold">Delivery Options</Text>
                <Text fontSize="xs" color="gray.500">
                  {deliveryOptions[deliveryState.deliveryType].time} •
                  ₱{deliveryOptions[deliveryState.deliveryType].fee} fee
                </Text>
              </VStack>
            </HStack>
            <AccordionIcon />
          </AccordionButton>

          <AccordionPanel pb={4} pt={4}>
            <VStack spacing={3} align="stretch">
              <Text fontSize="sm" color="gray.600">
                Select your preferred delivery speed and cost:
              </Text>

              <Grid templateColumns="repeat(3, 1fr)" gap={3}>
                {Object.entries(deliveryOptions).map(([type, option]: [string, any]) => (
                  <Card
                    key={`delivery-${type}`}
                    cursor="pointer"
                    borderWidth="2px"
                    borderColor={
                      deliveryState.deliveryType === type ? 'blue.400' : 'gray.200'
                    }
                    bg={deliveryState.deliveryType === type ? 'blue.50' : 'white'}
                    onClick={() => {
                      const newState = type as DeliveryState['deliveryType']
                      setDeliveryState(prev => ({
                        ...prev,
                        deliveryType: newState,
                      }))
                      saveDeliveryState({ deliveryType: newState })
                    }}
                    transition="all 0.2s"
                    _hover={{
                      borderColor: 'blue.300',
                      shadow: 'md',
                    }}
                  >
                    <CardBody p={4} textAlign="center">
                      <Text fontSize="2xl" mb={2}>
                        {option.icon}
                      </Text>
                      <Text fontSize="xs" fontWeight="bold" mb={1} color="gray.700">
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                      <Text fontSize="xs" color="gray.600" mb={2}>
                        {option.time}
                      </Text>
                      <Badge colorScheme="blue" fontSize="xs">
                        ₱{option.fee}
                      </Badge>
                      {deliveryState.deliveryType === type && (
                        <Icon as={FiCheck} color="blue.500" boxSize={5} mt={2} />
                      )}
                    </CardBody>
                  </Card>
                ))}
              </Grid>

              {trade?.status === 'active' && (
                <Button
                  size="sm"
                  variant="outline"
                  colorScheme="blue"
                  leftIcon={<FiClock />}
                  w="full"
                >
                  Track Delivery
                </Button>
              )}
            </VStack>
          </AccordionPanel>
        </AccordionItem>

        {/* 2. PAYMENT METHOD */}
        <AccordionItem
          border="2px"
          borderColor={deliveryState.expandedSections.payment ? 'green.400' : 'gray.200'}
          borderRadius="lg"
          bg={deliveryState.expandedSections.payment ? 'green.50' : 'white'}
          overflow="hidden"
          mt={3}
        >
          <AccordionButton
            onClick={() => toggleSection('payment')}
            _hover={{ bg: deliveryState.expandedSections.payment ? 'green.100' : 'gray.50' }}
            py={4}
          >
            <HStack spacing={3} flex={1}>
              <Icon as={FiDollarSign} boxSize={5} color="green.500" />
              <VStack align="start" spacing={0}>
                <Text fontWeight="semibold">Payment Method</Text>
                <Text fontSize="xs" color="gray.500">
                  {paymentMethods[deliveryState.paymentMethod].label} •
                  {deliveryState.paymentConfirmed ? ' ✓ Confirmed' : ' Pending'}
                </Text>
              </VStack>
            </HStack>
            <Badge
              colorScheme={deliveryState.paymentConfirmed ? 'green' : 'yellow'}
              variant="subtle"
              fontSize="xs"
            >
              {deliveryState.paymentConfirmed ? 'Paid' : 'Pending'}
            </Badge>
            <AccordionIcon />
          </AccordionButton>

          <AccordionPanel pb={4} pt={4}>
            <VStack spacing={4} align="stretch">
              <Text fontSize="sm" color="gray.600">
                Choose your payment method:
              </Text>

              <VStack spacing={2} align="stretch">
                {Object.entries(paymentMethods).map(([method, details]: [string, any]) => (
                  <Card
                    key={`payment-${method}`}
                    cursor="pointer"
                    borderWidth="2px"
                    borderColor={
                      deliveryState.paymentMethod === method ? 'green.400' : 'gray.200'
                    }
                    bg={
                      deliveryState.paymentMethod === method
                        ? `${details.color}.50`
                        : 'white'
                    }
                    onClick={() => {
                      const newMethod = method as DeliveryState['paymentMethod']
                      setDeliveryState(prev => ({
                        ...prev,
                        paymentMethod: newMethod,
                      }))
                      saveDeliveryState({ paymentMethod: newMethod })
                    }}
                    transition="all 0.2s"
                    _hover={{
                      borderColor: `${details.color}.300`,
                      shadow: 'md',
                    }}
                  >
                    <CardBody>
                      <HStack spacing={3} justify="space-between">
                        <HStack spacing={3}>
                          <Text fontSize="xl">{details.icon}</Text>
                          <Text fontWeight="medium" fontSize="sm">
                            {details.label}
                          </Text>
                        </HStack>
                        {deliveryState.paymentMethod === method && (
                          <Icon as={FiCheck} color={`${details.color}.500`} boxSize={5} />
                        )}
                      </HStack>
                    </CardBody>
                  </Card>
                ))}
              </VStack>

              <Divider />

              <Box p={4} bg="gray.50" borderRadius="md">
                <HStack justify="space-between" mb={2}>
                  <Text fontSize="sm" fontWeight="semibold">
                    Payment Amount:
                  </Text>
                  <Text fontSize="lg" fontWeight="bold" color="brand.500">
                    ₱{totalCost.toFixed(2)}
                  </Text>
                </HStack>
                <HStack justify="space-between" mb={3} fontSize="xs" color="gray.600">
                  <Text>Product + Delivery Fee:</Text>
                  <Text>
                    ₱{(requestedProduct?.price || 0).toFixed(2)} + ₱
                    {deliveryOptions[deliveryState.deliveryType].fee}
                  </Text>
                </HStack>
              </Box>

              <Button
                colorScheme="green"
                size="md"
                onClick={handleConfirmPayment}
                isDisabled={deliveryState.paymentConfirmed}
                leftIcon={deliveryState.paymentConfirmed ? <FiCheck /> : undefined}
                w="full"
              >
                {deliveryState.paymentConfirmed ? '✓ Payment Confirmed' : 'Confirm Payment'}
              </Button>
            </VStack>
          </AccordionPanel>
        </AccordionItem>

        {/* 3. DELIVERY DETAILS */}
        <AccordionItem
          border="2px"
          borderColor={deliveryState.expandedSections.details ? 'purple.400' : 'gray.200'}
          borderRadius="lg"
          bg={deliveryState.expandedSections.details ? 'purple.50' : 'white'}
          overflow="hidden"
          mt={3}
        >
          <AccordionButton
            onClick={() => toggleSection('details')}
            _hover={{ bg: deliveryState.expandedSections.details ? 'purple.100' : 'gray.50' }}
            py={4}
          >
            <HStack spacing={3} flex={1}>
              <Icon as={FiMapPin} boxSize={5} color="purple.500" />
              <Text fontWeight="semibold">Delivery Details</Text>
            </HStack>
            <AccordionIcon />
          </AccordionButton>

          <AccordionPanel pb={4} pt={4}>
            <VStack spacing={5} align="stretch">
              {/* Map Preview */}
              <Box
                w="full"
                h="150px"
                bg="gray.100"
                borderRadius="lg"
                display="flex"
                alignItems="center"
                justifyContent="center"
                borderWidth="2px"
                borderColor="gray.200"
                borderStyle="dashed"
              >
                <VStack spacing={2}>
                  <Icon as={FiMapPin} boxSize={6} color="gray.400" />
                  <Text fontSize="xs" color="gray.500">
                    Static map preview
                  </Text>
                </VStack>
              </Box>

              {/* Sender Address */}
              <Box>
                <Label fontWeight="semibold" mb={2} display="flex" alignItems="center" gap={2}>
                  <Icon as={FaMapMarkerAlt} color="blue.500" />
                  Sender Address
                </Label>
                <Input
                  placeholder="123 Main Street, Manila"
                  value={trade?.delivery_address || ''}
                  isReadOnly
                  size="sm"
                  mb={2}
                  bg="gray.50"
                />
                <InputGroup>
                  <InputLeftElement pointerEvents="none">
                    <Icon as={FiPhone} color="gray.400" />
                  </InputLeftElement>
                  <Input
                    placeholder="+63 912 345 6789"
                    size="sm"
                    bg="gray.50"
                  />
                </InputGroup>
              </Box>

              <Divider />

              {/* Receiver Address */}
              <Box>
                <Label fontWeight="semibold" mb={2} display="flex" alignItems="center" gap={2}>
                  <Icon as={FaMapMarkerAlt} color="green.500" />
                  Receiver Address
                </Label>
                <Input
                  placeholder="Receiver's full address"
                  size="sm"
                  mb={2}
                  bg="white"
                  borderWidth="1px"
                />
                <InputGroup>
                  <InputLeftElement pointerEvents="none">
                    <Icon as={FiPhone} color="gray.400" />
                  </InputLeftElement>
                  <Input
                    placeholder="Receiver's contact number"
                    size="sm"
                    bg="white"
                    borderWidth="1px"
                  />
                </InputGroup>
              </Box>

              <Divider />

              {/* Delivery Notes */}
              <Box>
                <Label fontWeight="semibold" mb={2}>
                  Delivery Instructions (Optional)
                </Label>
                <Textarea
                  placeholder="e.g., Leave at the gate, Ring doorbell twice, Do not leave in rain..."
                  size="sm"
                  rows={3}
                  bg="white"
                  borderWidth="1px"
                />
              </Box>
            </VStack>
          </AccordionPanel>
        </AccordionItem>

        {/* 4. PROOF OF DELIVERY */}
        <AccordionItem
          border="2px"
          borderColor={deliveryState.expandedSections.proof ? 'orange.400' : 'gray.200'}
          borderRadius="lg"
          bg={deliveryState.expandedSections.proof ? 'orange.50' : 'white'}
          overflow="hidden"
          mt={3}
          isDisabled={!deliveryState.paymentConfirmed}
        >
          <AccordionButton
            onClick={() => toggleSection('proof')}
            _hover={{ bg: deliveryState.expandedSections.proof ? 'orange.100' : 'gray.50' }}
            py={4}
            opacity={deliveryState.paymentConfirmed ? 1 : 0.5}
          >
            <HStack spacing={3} flex={1}>
              <Icon as={FiPackage} boxSize={5} color="orange.500" />
              <VStack align="start" spacing={0}>
                <Text fontWeight="semibold">Proof of Delivery</Text>
                <Text fontSize="xs" color="gray.500">
                  {deliveryState.proofOfDelivery ? '✓ Photo uploaded' : 'Upload delivery photo'}
                </Text>
              </VStack>
            </HStack>
            <AccordionIcon />
          </AccordionButton>

          <AccordionPanel pb={4} pt={4}>
            <VStack spacing={4} align="stretch">
              {!deliveryState.paymentConfirmed && (
                <Box p={3} bg="yellow.50" borderRadius="md" borderLeftWidth="4px" borderLeftColor="yellow.400">
                  <Text fontSize="sm" color="yellow.700">
                    🔒 Complete payment first to upload proof of delivery
                  </Text>
                </Box>
              )}

              {deliveryState.proofOfDelivery ? (
                <Box>
                  <Image
                    src={deliveryState.proofOfDelivery}
                    alt="Proof of delivery"
                    w="full"
                    h="250px"
                    objectFit="cover"
                    borderRadius="lg"
                    mb={3}
                  />
                  <HStack spacing={2} justify="space-between" mb={3}>
                    <Text fontSize="sm" color="gray.600">
                      ✓ Delivered on {new Date().toLocaleDateString()}
                    </Text>
                    <Badge colorScheme="green">Confirmed</Badge>
                  </HStack>
                  <Input
                    type="file"
                    accept="image/*"
                    size="sm"
                    display="none"
                    id="proof-upload"
                    onChange={handleProofUpload}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    colorScheme="orange"
                    w="full"
                    onClick={() => document.getElementById('proof-upload')?.click()}
                    leftIcon={<FiUpload />}
                  >
                    Replace Photo
                  </Button>
                </Box>
              ) : (
                <Box
                  p={6}
                  border="2px dashed"
                  borderColor="orange.300"
                  borderRadius="lg"
                  textAlign="center"
                  cursor="pointer"
                  bg="orange.50"
                  transition="all 0.2s"
                  _hover={{ borderColor: 'orange.400', bg: 'orange.100' }}
                  onClick={() => document.getElementById('proof-upload')?.click()}
                >
                  <VStack spacing={2}>
                    <Icon as={FiUpload} boxSize={8} color="orange.500" />
                    <Text fontWeight="medium" color="orange.700">
                      Click to upload delivery photo
                    </Text>
                    <Text fontSize="xs" color="orange.600">
                      or drag and drop
                    </Text>
                    <Text fontSize="2xs" color="gray.500">
                      PNG, JPG up to 10MB
                    </Text>
                  </VStack>
                  <Input
                    type="file"
                    accept="image/*"
                    size="sm"
                    display="none"
                    id="proof-upload"
                    onChange={handleProofUpload}
                  />
                </Box>
              )}

              {isUserSeller && (
                <Box p={3} bg="blue.50" borderRadius="md" borderLeftWidth="4px" borderLeftColor="blue.400">
                  <Text fontSize="sm" color="blue.700">
                    📸 This photo will be visible to the buyer as proof of delivery
                  </Text>
                </Box>
              )}
            </VStack>
          </AccordionPanel>
        </AccordionItem>

        {/* 5. TRADE COMPLETION */}
        <AccordionItem
          border="2px"
          borderColor={deliveryState.expandedSections.completion ? 'green.400' : 'gray.200'}
          borderRadius="lg"
          bg={bothConfirmed ? 'green.50' : deliveryState.expandedSections.completion ? 'green.50' : 'white'}
          overflow="hidden"
          mt={3}
          isDisabled={!deliveryState.paymentConfirmed || !deliveryState.proofOfDelivery}
        >
          <AccordionButton
            onClick={() => toggleSection('completion')}
            _hover={{ bg: deliveryState.expandedSections.completion ? 'green.100' : 'gray.50' }}
            py={4}
            opacity={deliveryState.paymentConfirmed && deliveryState.proofOfDelivery ? 1 : 0.5}
          >
            <HStack spacing={3} flex={1}>
              <Icon as={FiCheck} boxSize={5} color={bothConfirmed ? 'green.500' : 'green.400'} />
              <VStack align="start" spacing={0}>
                <Text fontWeight="semibold">Trade Completion</Text>
                <Text fontSize="xs" color="gray.500">
                  {bothConfirmed ? '✓ Both parties confirmed' : 'Awaiting confirmation'}
                </Text>
              </VStack>
            </HStack>
            <AccordionIcon />
          </AccordionButton>

          <AccordionPanel pb={4} pt={4}>
            <VStack spacing={5} align="stretch">
              {!deliveryState.paymentConfirmed || !deliveryState.proofOfDelivery ? (
                <Box p={3} bg="yellow.50" borderRadius="md" borderLeftWidth="4px" borderLeftColor="yellow.400">
                  <Text fontSize="sm" color="yellow.700">
                    ⏳ Complete payment and upload proof to finalize delivery
                  </Text>
                </Box>
              ) : null}

              {/* Confirmation Status */}
              <SimpleGrid columns={2} spacing={4}>
                <Card
                  bg={deliveryState.buyerConfirmedReceipt ? 'green.50' : 'gray.50'}
                  borderWidth="2px"
                  borderColor={deliveryState.buyerConfirmedReceipt ? 'green.400' : 'gray.200'}
                >
                  <CardBody>
                    <VStack spacing={2} textAlign="center">
                      <Avatar
                        name={trade?.buyer_name || 'Buyer'}
                        size="md"
                        bg="blue.500"
                        color="white"
                      />
                      <Text fontWeight="semibold" fontSize="sm">
                        Buyer
                      </Text>
                      <Badge
                        colorScheme={deliveryState.buyerConfirmedReceipt ? 'green' : 'gray'}
                        variant="subtle"
                      >
                        {deliveryState.buyerConfirmedReceipt ? '✓ Confirmed' : 'Pending'}
                      </Badge>
                    </VStack>
                  </CardBody>
                </Card>

                <Card
                  bg={deliveryState.sellerConfirmedDelivery ? 'green.50' : 'gray.50'}
                  borderWidth="2px"
                  borderColor={deliveryState.sellerConfirmedDelivery ? 'green.400' : 'gray.200'}
                >
                  <CardBody>
                    <VStack spacing={2} textAlign="center">
                      <Avatar
                        name={trade?.seller_name || 'Seller'}
                        size="md"
                        bg="green.500"
                        color="white"
                      />
                      <Text fontWeight="semibold" fontSize="sm">
                        Seller
                      </Text>
                      <Badge
                        colorScheme={deliveryState.sellerConfirmedDelivery ? 'green' : 'gray'}
                        variant="subtle"
                      >
                        {deliveryState.sellerConfirmedDelivery ? '✓ Confirmed' : 'Pending'}
                      </Badge>
                    </VStack>
                  </CardBody>
                </Card>
              </SimpleGrid>

              <Divider />

              {/* Transaction Summary */}
              <Card bg="gray.50" variant="outline">
                <CardBody>
                  <VStack spacing={3} align="stretch">
                    <Text fontWeight="semibold" fontSize="sm">
                      Transaction Summary
                    </Text>
                    <HStack justify="space-between" fontSize="sm">
                      <Text color="gray.600">Product:</Text>
                      <Text fontWeight="medium">{requestedProduct?.title}</Text>
                    </HStack>
                    <HStack justify="space-between" fontSize="sm">
                      <Text color="gray.600">Delivery Fee:</Text>
                      <Text>₱{deliveryOptions[deliveryState.deliveryType].fee}</Text>
                    </HStack>
                    <HStack justify="space-between" fontSize="sm">
                      <Text color="gray.600">Payment Method:</Text>
                      <Badge colorScheme="blue" fontSize="xs">
                        {paymentMethods[deliveryState.paymentMethod].label}
                      </Badge>
                    </HStack>
                    <Divider />
                    <HStack justify="space-between" fontWeight="bold" fontSize="md">
                      <Text>Total:</Text>
                      <Text color="brand.500">₱{totalCost.toFixed(2)}</Text>
                    </HStack>
                  </VStack>
                </CardBody>
              </Card>

              {/* Confirm Button */}
              <Button
                colorScheme="green"
                size="lg"
                onClick={handleConfirmDelivery}
                isDisabled={Boolean(
                  !deliveryState.paymentConfirmed ||
                  !deliveryState.proofOfDelivery ||
                  (isUserBuyer && deliveryState.buyerConfirmedReceipt) ||
                  (isUserSeller && deliveryState.sellerConfirmedDelivery)
                )}
                leftIcon={
                  (isUserBuyer && deliveryState.buyerConfirmedReceipt) ||
                  (isUserSeller && deliveryState.sellerConfirmedDelivery) ? (
                    <FiCheck />
                  ) : undefined
                }
                w="full"
                transition="all 0.2s"
                _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
              >
                {(isUserBuyer && deliveryState.buyerConfirmedReceipt) ||
                (isUserSeller && deliveryState.sellerConfirmedDelivery)
                  ? '✓ You Confirmed Receipt'
                  : isUserBuyer
                  ? 'Confirm Receipt'
                  : 'Confirm Delivery Sent'}
              </Button>

              {bothConfirmed && (
                <Box p={4} bg="green.50" borderRadius="lg" borderWidth="2px" borderColor="green.200" textAlign="center">
                  <Icon as={FiCheck} boxSize={8} color="green.500" mb={2} mx="auto" display="block" />
                  <Text fontWeight="bold" color="green.700" mb={1}>
                    Trade Complete!
                  </Text>
                  <Text fontSize="sm" color="green.600">
                    Both parties have confirmed delivery. You can now leave feedback.
                  </Text>
                </Box>
              )}
            </VStack>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
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
      const reader = new FileReader()
      reader.onloadend = () => {
        setProofImage(reader.result as string)
      }
      reader.readAsDataURL(e.target.files[0])
    }
  }

  const submitReview = async () => {
    if (!trade || !rating || !feedback.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please provide a rating and feedback.',
        status: 'warning',
      })
      return
    }

    try {
      setSubmitting(true)
      await api.put(`/api/trades/${trade.id}/complete`, {
        rating,
        feedback: feedback.trim(),
        proof_url: proofImage || undefined,
      })

      toast({
        title: 'Review submitted',
        description: 'Your review has been submitted successfully.',
        status: 'success',
      })

      // Reset form
      setRating(5)
      setFeedback('')
      setProofImage(null)

      // Refresh completion status
      await fetchCompletionStatus()
      onStatusUpdate()
    } catch (error: any) {
      console.error('Review submission error:', error)
      toast({
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
                    <Box position="relative" w="full" maxW="250px">
                      <Image
                        src={proofImage}
                        alt="Proof"
                        w="full"
                        maxH="200px"
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
  const [confirmingMeetup, setConfirmingMeetup] = useState(false)
  const [buyerMeetupConfirmed, setBuyerMeetupConfirmed] = useState(false)
  const [sellerMeetupConfirmed, setSellerMeetupConfirmed] = useState(false)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [deliveryState, setDeliveryState] = useState<DeliveryState>({
    deliveryType: 'standard',
    paymentMethod: 'gcash',
    paymentConfirmed: false,
    proofOfDelivery: null,
    buyerConfirmedReceipt: false,
    sellerConfirmedDelivery: false,
    expandedSections: {
      options: true,
      payment: false,
      details: false,
      proof: false,
      completion: false,
    },
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const isUserBuyer = !!(trade && user && trade.buyer_id === user.id)
  const isUserSeller = !!(trade && user && trade.seller_id === user.id)
  const tradingPartner = isUserBuyer
    ? trade?.seller_name || `User #${trade?.seller_id}`
    : trade?.buyer_name || `User #${trade?.buyer_id}`

  // Suggested meetup locations (based on user locations)
  const suggestedLocations: MeetupLocation[] = [
    { name: 'SM Mall of Asia', address: 'Seaside Boulevard, Pasay', type: 'mall' },
    { name: 'Greenbelt Mall', address: 'Ayala Center, Makati', type: 'mall' },
    { name: 'Starbucks Coffee', address: 'Various locations', type: 'cafe' },
    { name: 'Robinsons Place', address: 'EDSA, Quezon City', type: 'mall' },
    { name: 'Public Park', address: 'Rizal Park, Manila', type: 'public' },
  ]

  // Save delivery state to backend
  const saveDeliveryState = async (updates: Partial<DeliveryState>) => {
    if (!trade) return
    
    try {
      const payload: any = { action: 'update_delivery_state' }
      
      if (updates.deliveryType) payload.delivery_type = updates.deliveryType
      if (updates.paymentMethod) payload.payment_method = updates.paymentMethod
      if (updates.paymentConfirmed !== undefined) payload.payment_confirmed = updates.paymentConfirmed
      if (updates.proofOfDelivery !== undefined) payload.proof_of_delivery = updates.proofOfDelivery
      if (updates.buyerConfirmedReceipt !== undefined) payload.buyer_confirmed_receipt = updates.buyerConfirmedReceipt
      if (updates.sellerConfirmedDelivery !== undefined) payload.seller_confirmed_delivery = updates.sellerConfirmedDelivery
      
      await api.put(`/api/trades/${trade.id}`, payload)
    } catch (error) {
      console.error('Failed to save delivery state:', error)
    }
  }

  // Load delivery state from trade data when trade changes
  useEffect(() => {
    if (trade && trade.trade_option === 'delivery') {
      setDeliveryState(prev => ({
        ...prev,
        deliveryType: (trade.delivery_type as any) || 'standard',
        paymentMethod: (trade.payment_method as any) || 'gcash',
        paymentConfirmed: trade.payment_confirmed || false,
        proofOfDelivery: trade.proof_of_delivery || null,
        buyerConfirmedReceipt: trade.buyer_confirmed_receipt || false,
        sellerConfirmedDelivery: trade.seller_confirmed_delivery || false,
      }))
    }
  }, [trade?.id, trade?.trade_option])

  // Fetch trade messages
  useEffect(() => {
    if (isOpen && trade) {
      fetchMessages()
      fetchProducts()
      fetchMeetupStatus()
      
      // Poll for new messages every 3 seconds
      const interval = setInterval(fetchMessages, 3000)
      return () => clearInterval(interval)
    } else {
      setMessages([])
      setNewMessage('')
    }
  }, [isOpen, trade])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchMessages = async () => {
    if (!trade) return
    
    try {
      setLoadingMessages(true)
      const response = await api.get(`/api/trades/${trade.id}/messages`)
      const data = response.data?.data || []
      setMessages(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    } finally {
      setLoadingMessages(false)
    }
  }

  const fetchProducts = async () => {
    if (!trade) return
    
    try {
      setLoadingProducts(true)
      const requested = await getProduct(trade.target_product_id)
      setRequestedProduct(requested)

      const offered: Product[] = []
      for (const item of trade.items || []) {
        const pid = item.product_id
        const product = await getProduct(pid)
        if (product) offered.push(product)
      }
      setOfferedProducts(offered)
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
      await fetchMessages()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to send message',
        status: 'error',
      })
    } finally {
      setSendingMessage(false)
    }
  }

  const confirmMeetup = async () => {
    if (!trade || !selectedLocation || confirmingMeetup) return

    try {
      setConfirmingMeetup(true)
      await api.put(`/api/trades/${trade.id}`, {
        action: 'confirm_meetup',
        meetup_location: selectedLocation,
      })

      // Update local state based on current user role
      if (isUserBuyer) {
        setBuyerMeetupConfirmed(true)
      } else if (isUserSeller) {
        setSellerMeetupConfirmed(true)
      }

      toast({
        title: 'Meetup location confirmed',
        description: 'Waiting for the other party to confirm...',
        status: 'success',
      })

      // Refresh trade data to get updated status
      await fetchMeetupStatus()
      onStatusUpdate()
    } catch (error: any) {
      toast({
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
    gcash: { label: 'GCash', icon: '💳', color: 'blue' },
    cod: { label: 'Cash on Delivery', icon: '💵', color: 'green' },
    wallet: { label: 'In-app Wallet', icon: '👛', color: 'purple' },
  }

  const toggleSection = (section: keyof typeof deliveryState.expandedSections) => {
    setDeliveryState(prev => ({
      ...prev,
      expandedSections: {
        ...prev.expandedSections,
        [section]: !prev.expandedSections[section],
      },
    }))
  }

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const reader = new FileReader()
      reader.onloadend = async () => {
        const proofData = reader.result as string
        setDeliveryState(prev => ({
          ...prev,
          proofOfDelivery: proofData,
        }))
        
        // Save proof of delivery to backend
        try {
          await api.put(`/api/trades/${trade?.id}`, {
            action: 'update_delivery_state',
            proof_of_delivery: proofData,
          })
          toast({
            title: 'Proof of delivery uploaded',
            status: 'success',
            duration: 2000,
          })
        } catch (error) {
          toast({
            title: 'Failed to save proof',
            description: 'Please try again',
            status: 'error',
            duration: 2000,
          })
        }
      }
      reader.readAsDataURL(e.target.files[0])
    }
  }

  const handleConfirmPayment = async () => {
    try {
      // Save payment confirmation to backend
      await api.put(`/api/trades/${trade?.id}`, {
        action: 'update_delivery_state',
        payment_confirmed: true,
        payment_method: deliveryState.paymentMethod,
      })
      
      setDeliveryState(prev => ({
        ...prev,
        paymentConfirmed: true,
      }))
      toast({
        title: 'Payment confirmed',
        description: 'Your payment has been secured',
        status: 'success',
        duration: 2000,
      })
    } catch (error) {
      toast({
        title: 'Payment failed',
        description: 'Please try again',
        status: 'error',
        duration: 3000,
      })
    }
  }

  const handleConfirmDelivery = async () => {
    if (!deliveryState.proofOfDelivery && isUserSeller) {
      toast({
        title: 'Proof required',
        description: 'Please upload delivery proof before confirming',
        status: 'warning',
        duration: 3000,
      })
      return
    }

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

      toast({
        title: 'Delivery confirmed',
        description: 'Thank you for confirming',
        status: 'success',
        duration: 2000,
      })

      // Check if both parties have confirmed (need to get fresh state)
      try {
        const response = await api.get(`/api/trades/${trade?.id}`)
        const updatedTrade = response.data?.data
        if (updatedTrade?.buyer_confirmed_receipt && updatedTrade?.seller_confirmed_delivery) {
          // Both confirmed, complete the trade
          await api.put(`/api/trades/${trade?.id}`, {
            action: 'complete',
          })
          onStatusUpdate()
        }
      } catch (error) {
        console.error('Failed to check trade status:', error)
      }
    } catch (error: any) {
      toast({
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

                  {/* Products Overview */}
                  <Box>
                    <Text fontWeight="semibold" mb={4} fontSize="md">
                      Trade Items
                    </Text>
                    {loadingProducts ? (
                      <Spinner />
                    ) : (
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                        <Card variant="outline" borderColor="blue.300">
                          <CardBody>
                            <VStack spacing={3} align="stretch">
                              <HStack>
                                <Badge colorScheme="blue">Requested</Badge>
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
                                <Badge colorScheme="green">Offered</Badge>
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
                  </Box>

                  {/* Trade Partner Info */}
                  <Box
                    p={4}
                    bg="gray.50"
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor={borderColor}
                  >
                    <HStack spacing={4}>
                      <Avatar
                        name={tradingPartner}
                        size="md"
                        bg={isUserBuyer ? 'green.500' : 'blue.500'}
                        color="white"
                      />
                      <Box flex={1}>
                        <Text fontWeight="semibold">{tradingPartner}</Text>
                        <Text fontSize="sm" color="gray.600">
                          Trading Partner
                        </Text>
                      </Box>
                      <Text fontSize="xs" color="gray.500">
                        Accepted {new Date(trade.created_at).toLocaleDateString()}
                      </Text>
                    </HStack>
                  </Box>
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
                    toggleSection={toggleSection}
                    handleProofUpload={handleProofUpload}
                    handleConfirmPayment={handleConfirmPayment}
                    handleConfirmDelivery={handleConfirmDelivery}
                    saveDeliveryState={saveDeliveryState}
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
                      <VStack spacing={3} align="stretch">
                        {suggestedLocations.map((location, index) => {
                          const isSelected = selectedLocation === location.name
                          const isNearest = index === 0
                          const textColor = useColorModeValue('gray.800', 'gray.100')

                          return (
                            <Card
                              key={`location-${location.name}`}
                              variant="outline"
                              cursor="pointer"
                              borderWidth={isSelected ? '2px' : '1px'}
                              borderColor={isSelected ? 'brand.500' : isNearest ? 'orange.300' : borderColor}
                              bg={isSelected ? 'brand.50' : isNearest ? useColorModeValue('orange.50', 'orange.950') : 'white'}
                              onClick={() => setSelectedLocation(location.name)}
                              transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                              _hover={{
                                borderColor: isSelected ? 'brand.600' : 'brand.400',
                                shadow: 'md',
                                transform: 'translateY(-2px)',
                              }}
                            >
                              <CardBody>
                                <HStack spacing={3} justify="space-between">
                                  {/* Location Icon & Info */}
                                  <HStack spacing={3} flex={1}>
                                    <Box
                                      p={2}
                                      bg={useColorModeValue('gray.100', 'gray.700')}
                                      borderRadius="md"
                                      display="flex"
                                      alignItems="center"
                                      justifyContent="center"
                                      flexShrink={0}
                                    >
                                      <Icon
                                        as={FaMapMarkerAlt}
                                        color={isSelected ? 'brand.500' : isNearest ? 'orange.500' : 'gray.500'}
                                        boxSize={5}
                                      />
                                    </Box>

                                    <VStack align="start" spacing={1} flex={1}>
                                      <HStack spacing={2}>
                                        <Text fontWeight="semibold" fontSize="sm" color={textColor}>
                                          {location.name}
                                        </Text>
                                        {isNearest && (
                                          <Badge colorScheme="orange" fontSize="2xs" px={1.5} py={0.5}>
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

                    <Divider />

                    {/* Confirmation Status */}
                    <Box>
                      <Text fontWeight="semibold" mb={4} fontSize="md">
                        Confirmation Status
                      </Text>
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
                            name={trade.seller_name || 'Seller'}
                            size="md"
                            bg="green.500"
                            color="white"
                          />
                          <VStack spacing={1}>
                            <Text fontSize="xs" fontWeight="semibold" color={useColorModeValue('gray.700', 'gray.200')}>
                              Seller
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
                    {selectedLocation && (
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
                          : 'Confirm Meetup Location'}
                      </Button>
                    )}
                  </VStack>
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>
      </ModalContent>
    </Modal>

    {/* Review Modal - Appears when both parties confirmed meetup */}
    <Modal isOpen={isReviewModalOpen} onClose={() => setIsReviewModalOpen(false)} size="2xl" isCentered>
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent bg={cardBg} borderRadius="xl" boxShadow="xl">
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
    </Modal>
    </>
  )
}

export default ViewTradeModal

