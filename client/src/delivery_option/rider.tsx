import React, { useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Card,
  CardBody,
  Badge,
  Icon,
  SimpleGrid,
  useToast,
  Divider,
  Spinner,
  Center,
  Avatar,
  FormControl,
  FormLabel,
  Input,
  Select,
  Checkbox,
  Image,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useColorModeValue,
} from '@chakra-ui/react'
import {
  FaMotorcycle,
  FaCar,
  FaStar,
  FaPhone,
  FaIdBadge,
  FaCheckCircle,
  FaCamera,
  FaFileAlt,
  FaLock,
  FaClock,
  FaTimesCircle,
  FaRedo,
  FaBicycle,
  FaTruck,
  FaWallet,
} from 'react-icons/fa'
import { CheckCircleIcon, WarningIcon } from '@chakra-ui/icons'
import { api } from '../services/api'
import { useRiderState, RiderState } from '../hooks/useRiderState'

// ─────────────────────────────────────────────────────────────────────────────
// APPLICATION FORM - Task 1
// ─────────────────────────────────────────────────────────────────────────────
interface ApplicationFormProps {
  onSubmitted: () => void
  prefill?: {
    full_name?: string
    contact_number?: string
    vehicle_type?: string
    vehicle_plate?: string
    license_image_url?: string
    selfie_image_url?: string
  }
  rejectionReason?: string
}

const RiderApplicationForm: React.FC<ApplicationFormProps> = ({ onSubmitted, prefill, rejectionReason }) => {
  const toast = useToast()
  const licenseInputRef = useRef<HTMLInputElement>(null)
  const selfieInputRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState(prefill?.full_name || '')
  const [contactNumber, setContactNumber] = useState(prefill?.contact_number || '')
  const [vehicleType, setVehicleType] = useState(prefill?.vehicle_type || 'motorcycle')
  const [vehiclePlate, setVehiclePlate] = useState(prefill?.vehicle_plate || '')
  const [licenseUrl, setLicenseUrl] = useState(prefill?.license_image_url || '')
  const [selfieUrl, setSelfieUrl] = useState(prefill?.selfie_image_url || '')
  const [licensePreview, setLicensePreview] = useState(prefill?.license_image_url || '')
  const [selfiePreview, setSelfiePreview] = useState(prefill?.selfie_image_url || '')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [ageCheck, setAgeCheck] = useState(false)
  const [licenseCheck, setLicenseCheck] = useState(false)
  const [termsCheck, setTermsCheck] = useState(false)

  const handleImageUpload = async (file: File, type: 'license' | 'selfie') => {
    // Validate file before upload
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please upload an image file', status: 'error', duration: 3000 })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please upload an image under 10MB', status: 'error', duration: 3000 })
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      formData.append('type', 'rider-documents')
      const res = await api.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const url = res.data?.data?.url || res.data?.url
      if (!url) throw new Error('No URL returned')
      if (type === 'license') {
        setLicenseUrl(url)
        setLicensePreview(URL.createObjectURL(file))
      } else {
        setSelfieUrl(url)
        setSelfiePreview(URL.createObjectURL(file))
      }
      toast({ title: 'Image uploaded', status: 'success', duration: 2000 })
    } catch {
      toast({ title: 'Upload failed', description: 'Please try again', status: 'error', duration: 3000 })
    } finally {
      setUploading(false)
    }
  }

  // Validation: all required fields must be filled and checkboxes ticked
  const isContactValid = contactNumber.replace(/\D/g, '').length === 11
  const canSubmit =
    fullName.trim().length >= 2 &&
    isContactValid &&
    vehicleType &&
    licenseUrl && // License is required and must be uploaded
    ageCheck &&
    licenseCheck &&
    termsCheck

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await api.post('/api/deliveries/apply-rider', {
        full_name: fullName.trim(),
        contact_number: contactNumber.trim(),
        vehicle_type: vehicleType,
        vehicle_plate: vehiclePlate.trim(),
        license_image_url: licenseUrl,
        selfie_image_url: selfieUrl,
      })
      toast({
        title: rejectionReason ? 'Application Resubmitted' : 'Application Submitted',
        description: 'We will review your application and notify you.',
        status: 'success',
        duration: 4000,
      })
      onSubmitted()
    } catch (err: any) {
      toast({
        title: 'Submission Failed',
        description: err?.response?.data?.error || 'Could not submit application',
        status: 'error',
        duration: 4000,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const cardBg = useColorModeValue('white', 'gray.700')

  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <VStack spacing={6} maxW="md" mx="auto">
        <VStack spacing={1}>
          <Icon as={FaMotorcycle} boxSize={10} color="brand.500" />
          <Heading size="lg" color="brand.600">
            {rejectionReason ? 'Resubmit Application' : 'Apply as a Rider'}
          </Heading>
          <Text fontSize="sm" color="gray.500" textAlign="center">
            Fill out your details and upload your documents to get started
          </Text>
        </VStack>

        {rejectionReason && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">Previous application was not approved</AlertTitle>
              <AlertDescription fontSize="xs">{rejectionReason}</AlertDescription>
            </Box>
          </Alert>
        )}

        <Card w="full" bg={cardBg}>
          <CardBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Full Name</FormLabel>
                <Input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  isInvalid={fullName.length > 0 && fullName.trim().length < 2}
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel fontSize="sm">Contact Number</FormLabel>
                <Input
                  value={contactNumber}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '')
                    if (val.length <= 11) setContactNumber(val)
                  }}
                  placeholder="09XXXXXXXXX"
                  type="tel"
                  maxLength={11}
                  isInvalid={contactNumber.length > 0 && !isContactValid}
                />
                {contactNumber.length > 0 && !isContactValid && (
                  <Text fontSize="xs" color="red.500" mt={1}>Must be exactly 11 digits</Text>
                )}
              </FormControl>

              <FormControl isRequired>
                <FormLabel fontSize="sm">Vehicle Type</FormLabel>
                <Select value={vehicleType} onChange={e => setVehicleType(e.target.value)}>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="bicycle">Bicycle</option>
                  <option value="car">Car</option>
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Plate Number (if applicable)</FormLabel>
                <Input
                  value={vehiclePlate}
                  onChange={e => setVehiclePlate(e.target.value)}
                  placeholder="e.g., ABC-1234"
                />
              </FormControl>

              {/* License Upload - Required */}
              <FormControl isRequired>
                <FormLabel fontSize="sm">Driver's License Photo</FormLabel>
                <input
                  type="file"
                  accept="image/*"
                  ref={licenseInputRef}
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleImageUpload(file, 'license')
                  }}
                />
                {licensePreview ? (
                  <Box position="relative" borderRadius="md" overflow="hidden" border="2px" borderColor="green.300">
                    <Image src={licensePreview} alt="License" maxH="180px" w="full" objectFit="cover" />
                    <Badge position="absolute" top={2} left={2} colorScheme="green" fontSize="xs">
                      <Icon as={FaCheckCircle} mr={1} /> Uploaded
                    </Badge>
                    <Button
                      size="xs"
                      position="absolute"
                      bottom={2}
                      right={2}
                      colorScheme="brand"
                      onClick={() => licenseInputRef.current?.click()}
                      isLoading={uploading}
                    >
                      Change
                    </Button>
                  </Box>
                ) : (
                  <Button
                    w="full"
                    h="100px"
                    variant="outline"
                    borderStyle="dashed"
                    borderWidth="2px"
                    borderColor={licenseUrl ? 'green.300' : 'gray.300'}
                    onClick={() => licenseInputRef.current?.click()}
                    isLoading={uploading}
                    loadingText="Uploading..."
                  >
                    <VStack spacing={1}>
                      <Icon as={FaFileAlt} boxSize={6} color="gray.400" />
                      <Text fontSize="xs" color="gray.500">Upload Driver's License</Text>
                      <Text fontSize="2xs" color="red.400">Required</Text>
                    </VStack>
                  </Button>
                )}
              </FormControl>

              {/* Selfie Upload - Optional */}
              <FormControl>
                <FormLabel fontSize="sm">Selfie (Optional)</FormLabel>
                <Text fontSize="xs" color="gray.400" mb={2}>For identity verification</Text>
                <input
                  type="file"
                  accept="image/*"
                  ref={selfieInputRef}
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleImageUpload(file, 'selfie')
                  }}
                />
                {selfiePreview ? (
                  <Box position="relative" borderRadius="md" overflow="hidden" border="2px" borderColor="green.300">
                    <Image src={selfiePreview} alt="Selfie" maxH="180px" w="full" objectFit="cover" />
                    <Button
                      size="xs"
                      position="absolute"
                      bottom={2}
                      right={2}
                      colorScheme="brand"
                      onClick={() => selfieInputRef.current?.click()}
                      isLoading={uploading}
                    >
                      Change
                    </Button>
                  </Box>
                ) : (
                  <Button
                    w="full"
                    h="80px"
                    variant="outline"
                    borderStyle="dashed"
                    borderWidth="2px"
                    onClick={() => selfieInputRef.current?.click()}
                    isLoading={uploading}
                    loadingText="Uploading..."
                  >
                    <VStack spacing={1}>
                      <Icon as={FaCamera} boxSize={5} color="gray.400" />
                      <Text fontSize="xs" color="gray.500">Upload Selfie</Text>
                    </VStack>
                  </Button>
                )}
              </FormControl>
            </VStack>
          </CardBody>
        </Card>

        {/* Requirements Checklist */}
        <Card w="full" bg="blue.50" border="1px" borderColor="blue.200">
          <CardBody>
            <Text fontWeight="bold" fontSize="sm" mb={3} color="blue.800">Requirements Checklist</Text>
            <VStack align="start" spacing={2}>
              <Checkbox isChecked={ageCheck} onChange={e => setAgeCheck(e.target.checked)} colorScheme="brand" size="sm">
                I am at least 18 years old
              </Checkbox>
              <Checkbox isChecked={licenseCheck} onChange={e => setLicenseCheck(e.target.checked)} colorScheme="brand" size="sm">
                I have a valid driver's license
              </Checkbox>
              <Checkbox isChecked={termsCheck} onChange={e => setTermsCheck(e.target.checked)} colorScheme="brand" size="sm">
                I agree to Clovia's rider terms and conditions
              </Checkbox>
            </VStack>
          </CardBody>
        </Card>

        <Button
          colorScheme="brand"
          size="lg"
          w="full"
          onClick={handleSubmit}
          isLoading={submitting}
          loadingText="Submitting..."
          isDisabled={!canSubmit}
          leftIcon={<Icon as={FaMotorcycle} />}
        >
          {rejectionReason ? 'Resubmit Application' : 'Submit Application'}
        </Button>

        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          Back
        </Button>
      </VStack>
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PENDING SCREEN - Task 3
// ─────────────────────────────────────────────────────────────────────────────
const PendingScreen: React.FC = () => {
  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <Center minH="80vh">
        <VStack spacing={6} maxW="md" mx="auto" textAlign="center">
          <Box
            w="100px"
            h="100px"
            borderRadius="full"
            bg="yellow.100"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Icon as={FaClock} boxSize={12} color="yellow.500" />
          </Box>

          <VStack spacing={2}>
            <Heading size="lg" color="gray.800">Application Under Review</Heading>
            <Text fontSize="md" color="gray.600" maxW="sm">
              We are reviewing your documents. This usually takes 24-48 hours.
            </Text>
          </VStack>

          <Card w="full" bg="yellow.50" border="1px" borderColor="yellow.200">
            <CardBody>
              <VStack spacing={3}>
                <HStack spacing={2}>
                  <Icon as={FaCheckCircle} color="green.500" />
                  <Text fontSize="sm" color="gray.700">Application submitted</Text>
                </HStack>
                <HStack spacing={2}>
                  <Spinner size="sm" color="yellow.500" />
                  <Text fontSize="sm" color="gray.700">Documents under review</Text>
                </HStack>
                <HStack spacing={2} opacity={0.5}>
                  <Icon as={FaCheckCircle} color="gray.400" />
                  <Text fontSize="sm" color="gray.500">Verification complete</Text>
                </HStack>
              </VStack>
            </CardBody>
          </Card>

          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Text fontSize="sm">You'll receive a notification once your application is processed.</Text>
          </Alert>

          <Text fontSize="xs" color="gray.400">
            Please do not submit multiple applications. Contact support if you have urgent concerns.
          </Text>
        </VStack>
      </Center>
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// REJECTED SCREEN
// ─────────────────────────────────────────────────────────────────────────────
interface RejectedScreenProps {
  rejectionReason: string
  onReapply: () => void
}

const RejectedScreen: React.FC<RejectedScreenProps> = ({ rejectionReason, onReapply }) => {
  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <Center minH="80vh">
        <VStack spacing={6} maxW="md" mx="auto" textAlign="center">
          <Box
            w="100px"
            h="100px"
            borderRadius="full"
            bg="red.100"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Icon as={FaTimesCircle} boxSize={12} color="red.500" />
          </Box>

          <VStack spacing={2}>
            <Heading size="lg" color="gray.800">Application Not Approved</Heading>
            <Text fontSize="md" color="gray.600" maxW="sm">
              Unfortunately, your rider application was not approved.
            </Text>
          </VStack>

          <Card w="full" bg="red.50" border="1px" borderColor="red.200">
            <CardBody>
              <VStack spacing={2} align="start">
                <Text fontWeight="bold" fontSize="sm" color="red.700">Reason:</Text>
                <Text fontSize="sm" color="gray.700">{rejectionReason}</Text>
              </VStack>
            </CardBody>
          </Card>

          <Button
            colorScheme="brand"
            size="lg"
            w="full"
            onClick={onReapply}
            leftIcon={<Icon as={FaRedo} />}
          >
            Reapply
          </Button>

          <Text fontSize="xs" color="gray.400">
            Please address the issues mentioned above before reapplying.
          </Text>
        </VStack>
      </Center>
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCKED SCREEN
// ─────────────────────────────────────────────────────────────────────────────
const LockedScreen: React.FC = () => {
  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <Center minH="80vh">
        <VStack spacing={6} maxW="md" mx="auto" textAlign="center">
          <Box
            w="100px"
            h="100px"
            borderRadius="full"
            bg="gray.200"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Icon as={FaLock} boxSize={12} color="gray.500" />
          </Box>

          <VStack spacing={2}>
            <Heading size="lg" color="gray.800">Account Suspended</Heading>
            <Text fontSize="md" color="gray.600" maxW="sm">
              Your rider account has been suspended. Please contact support for assistance.
            </Text>
          </VStack>

          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <Text fontSize="sm">Contact support@clovia.com for more information.</Text>
          </Alert>
        </VStack>
      </Center>
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WELCOME SCREEN - Task 5 (First Login)
// ─────────────────────────────────────────────────────────────────────────────
interface WelcomeScreenProps {
  fullName: string
  freeSlots: number
  onContinue: () => void
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ fullName, freeSlots, onContinue }) => {
  const navigate = useNavigate()

  const handleContinue = async () => {
    await onContinue()
    navigate('/rider-home')
  }

  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <Center minH="80vh">
        <VStack spacing={6} maxW="md" mx="auto" textAlign="center">
          <Box
            w="120px"
            h="120px"
            borderRadius="full"
            bg="green.100"
            display="flex"
            alignItems="center"
            justifyContent="center"
            animation="pulse 2s infinite"
          >
            <Icon as={CheckCircleIcon} boxSize={16} color="green.500" />
          </Box>

          <VStack spacing={2}>
            <Heading size="xl" color="brand.600">Welcome, {fullName}!</Heading>
            <Text fontSize="lg" color="gray.700">
              You are now a verified Clovia rider!
            </Text>
          </VStack>

          <Card w="full" bg="green.50" border="2px" borderColor="green.300">
            <CardBody>
              <VStack spacing={3}>
                <Icon as={FaTruck} boxSize={8} color="green.500" />
                <Text fontWeight="bold" fontSize="lg" color="green.700">
                  You have {freeSlots} free delivery slots!
                </Text>
                <Text fontSize="sm" color="gray.600">
                  Start earning by claiming available deliveries in your area.
                </Text>
              </VStack>
            </CardBody>
          </Card>

          <SimpleGrid columns={3} spacing={4} w="full">
            <Card bg="white" p={3}>
              <VStack spacing={1}>
                <Icon as={FaTruck} color="brand.500" boxSize={5} />
                <Text fontSize="xs" color="gray.600">Claim Jobs</Text>
              </VStack>
            </Card>
            <Card bg="white" p={3}>
              <VStack spacing={1}>
                <Icon as={FaWallet} color="brand.500" boxSize={5} />
                <Text fontSize="xs" color="gray.600">Earn Money</Text>
              </VStack>
            </Card>
            <Card bg="white" p={3}>
              <VStack spacing={1}>
                <Icon as={FaStar} color="brand.500" boxSize={5} />
                <Text fontSize="xs" color="gray.600">Build Rating</Text>
              </VStack>
            </Card>
          </SimpleGrid>

          <Button
            colorScheme="brand"
            size="lg"
            w="full"
            onClick={handleContinue}
            leftIcon={<Icon as={FaMotorcycle} />}
          >
            Start Delivering
          </Button>
        </VStack>
      </Center>
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RIDER DASHBOARD (Ready/Working states)
// ─────────────────────────────────────────────────────────────────────────────
interface RiderDashboardProps {
  state: RiderState
  fullName: string
  rating: number
  completedDeliveries: number
}

const RiderDashboard: React.FC<RiderDashboardProps> = ({ state, fullName, rating, completedDeliveries }) => {
  const navigate = useNavigate()

  const getVehicleIcon = (type?: string) => {
    switch (type) {
      case 'car': return FaCar
      case 'bicycle': return FaBicycle
      default: return FaMotorcycle
    }
  }

  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <VStack spacing={4} maxW="md" mx="auto">
        {/* Header */}
        <VStack spacing={1} w="full">
          <Heading size="md" color="brand.500">Rider Dashboard</Heading>
          <Text fontSize="sm" color="gray.600">
            {state === 'WORKING' ? 'You have active deliveries' : 'Ready to claim deliveries'}
          </Text>
        </VStack>

        {/* Profile Card */}
        <Card bg="white" border="2px" borderColor="brand.200" w="full" shadow="sm">
          <CardBody p={4}>
            <VStack spacing={3} align="stretch">
              <HStack spacing={4}>
                <Avatar name={fullName} size="lg" bg="brand.500" color="white" />
                <VStack align="start" spacing={1} flex={1}>
                  <HStack>
                    <Text fontWeight="bold" fontSize="md">{fullName}</Text>
                    <Badge colorScheme="green" fontSize="2xs">Verified</Badge>
                  </HStack>
                  <HStack spacing={1}>
                    <Icon as={FaStar} color="yellow.400" boxSize={3} />
                    <Text fontSize="sm" fontWeight="semibold" color="gray.700">
                      {rating > 0 ? rating.toFixed(1) : 'No rating yet'}
                    </Text>
                  </HStack>
                </VStack>
              </HStack>

              <Divider />

              <SimpleGrid columns={2} spacing={3} fontSize="xs">
                <HStack spacing={2}>
                  <Icon as={FaCheckCircle} color="green.500" boxSize={4} />
                  <VStack align="start" spacing={0}>
                    <Text color="gray.500">Deliveries</Text>
                    <Text fontWeight="semibold" color="gray.800">
                      {completedDeliveries} completed
                    </Text>
                  </VStack>
                </HStack>
                <HStack spacing={2}>
                  <Icon as={state === 'WORKING' ? FaTruck : FaCheckCircle} color={state === 'WORKING' ? 'orange.500' : 'green.500'} boxSize={4} />
                  <VStack align="start" spacing={0}>
                    <Text color="gray.500">Status</Text>
                    <Text fontWeight="semibold" color="gray.800">
                      {state === 'WORKING' ? 'On Delivery' : 'Available'}
                    </Text>
                  </VStack>
                </HStack>
              </SimpleGrid>
            </VStack>
          </CardBody>
        </Card>

        {/* Quick Actions */}
        <SimpleGrid columns={2} spacing={3} w="full">
          <Button
            h="80px"
            colorScheme="brand"
            onClick={() => navigate('/rider-home')}
            flexDirection="column"
          >
            <Icon as={FaTruck} boxSize={6} mb={1} />
            <Text fontSize="sm">Available Jobs</Text>
          </Button>
          <Button
            h="80px"
            colorScheme="brand"
            variant="outline"
            onClick={() => navigate('/remittance-ledger')}
            flexDirection="column"
          >
            <Icon as={FaWallet} boxSize={6} mb={1} />
            <Text fontSize="sm">Earnings</Text>
          </Button>
        </SimpleGrid>

        <Button
          size="sm"
          variant="ghost"
          colorScheme="brand"
          onClick={() => navigate('/rider?apply=1')}
          leftIcon={<Icon as={FaIdBadge} />}
        >
          Open Rider Application Form
        </Button>

        {state === 'WORKING' && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <Text fontSize="sm">You have active deliveries. Complete them to claim more jobs.</Text>
          </Alert>
        )}
      </VStack>
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RIDER PAGE - State Router
// ─────────────────────────────────────────────────────────────────────────────
const RiderPage: React.FC = () => {
  const location = useLocation()
  const { riderState, loading, refetch, markFirstLoginComplete } = useRiderState()
  const [showApplicationForm, setShowApplicationForm] = useState(false)
  const forceApply = new URLSearchParams(location.search).get('apply') === '1'

  // Loading state
  if (loading) {
    return (
      <Center minH="100vh" bg="#FFFDF1">
        <VStack spacing={3}>
          <Spinner size="lg" color="brand.500" />
          <Text color="gray.500">Loading...</Text>
        </VStack>
      </Center>
    )
  }

  // Error or no state - show application form
  if (!riderState) {
    return <RiderApplicationForm onSubmitted={refetch} />
  }

  const { state, full_name, rejection_reason, show_welcome, free_delivery_slots, completed_deliveries, rating } = riderState

  // State-based routing
  switch (state) {
    case 'NOT_APPLIED':
      return <RiderApplicationForm onSubmitted={refetch} />

    case 'PENDING_APPROVAL':
      return <PendingScreen />

    case 'REJECTED':
      if (showApplicationForm) {
        return (
          <RiderApplicationForm
            onSubmitted={() => {
              setShowApplicationForm(false)
              refetch()
            }}
            rejectionReason={rejection_reason}
          />
        )
      }
      return (
        <RejectedScreen
          rejectionReason={rejection_reason || 'No reason provided'}
          onReapply={() => setShowApplicationForm(true)}
        />
      )

    case 'LOCKED':
      return <LockedScreen />

    case 'READY':
    case 'WORKING':
      if (forceApply) {
        return <RiderApplicationForm onSubmitted={refetch} />
      }
      // Show welcome screen on first login after approval
      if (show_welcome) {
        return (
          <WelcomeScreen
            fullName={full_name || 'Rider'}
            freeSlots={free_delivery_slots}
            onContinue={markFirstLoginComplete}
          />
        )
      }
      return (
        <RiderDashboard
          state={state}
          fullName={full_name || 'Rider'}
          rating={rating}
          completedDeliveries={completed_deliveries}
        />
      )

    default:
      return <RiderApplicationForm onSubmitted={refetch} />
  }
}

export default RiderPage
