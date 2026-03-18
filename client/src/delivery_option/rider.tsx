import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Tag,
  TagLabel,
  Progress,
  Divider,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
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
  Step,
  StepIndicator,
  StepStatus,
  StepIcon,
  StepNumber,
  StepTitle,
  StepDescription,
  StepSeparator,
  Stepper,
  useSteps,
  Textarea,
  useColorModeValue,
} from '@chakra-ui/react'
import { FaMapMarkerAlt, FaClock, FaBox, FaMotorcycle, FaCar, FaStar, FaPhone, FaIdBadge, FaCheckCircle, FaUpload, FaCamera, FaFileAlt } from 'react-icons/fa'
import { InfoIcon, WarningIcon, CheckCircleIcon } from '@chakra-ui/icons'
import { api } from '../services/api'
import { Delivery } from '../types'

interface DeliveryJob {
  id: string
  tradeId: string
  itemType: string
  deliveryType: 'standard' | 'express'
  distance: string
  distanceKm: number
  fee: number
  pickupWindow: string
  status: 'pending' | 'claimed' | 'picked_up' | 'in_transit' | 'delivered'
  sender: string
  recipient: string
  pickupLocation: string
  dropoffLocation: string
  itemCount: number
  isFragile: boolean
  claimedBy?: string
}

interface ClaimedBatch {
  batchId: string
  type: 'standard' | 'express'
  jobs: DeliveryJob[]
  totalEarnings: number
  totalDistance: string
  createdAt: string
  riderName?: string
  riderVehicle?: string
  riderRating?: number
}

interface RiderProfile {
  rider_id: number
  name: string
  vehicle_type: string
  vehicle_plate: string
  phone: string
  rating: number
  created_at: string
  completed_deliveries: number
  is_active: boolean
}

interface RiderApplicationData {
  has_applied: boolean
  rider_id?: number
  status?: string
  full_name?: string
  contact_number?: string
  vehicle_type?: string
  vehicle_plate?: string
  license_image_url?: string
  selfie_image_url?: string
  rejection_reason?: string
  reviewed_at?: string
  created_at?: string
  is_active?: boolean
  name?: string
  phone?: string
  rating?: number
  completed_deliveries?: number
}

const mapDeliveryToJob = (d: Delivery): DeliveryJob => ({
  id: String(d.id),
  tradeId: d.trade_id ? String(d.trade_id) : '',
  itemType: d.items?.[0]?.product_name || 'Item',
  deliveryType: d.delivery_type as 'standard' | 'express',
  distance: '~',
  distanceKm: 0,
  fee: d.total_cost,
  pickupWindow: d.estimated_eta
    ? new Date(d.estimated_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'TBD',
  status: d.status as DeliveryJob['status'],
  sender: d.user_name || 'Unknown',
  recipient: '',
  pickupLocation: d.pickup_address,
  dropoffLocation: d.delivery_address,
  itemCount: d.item_count,
  isFragile: d.is_fragile,
})

// ─── Application Form ───────────────────────────────────────────────
const RiderApplicationForm: React.FC<{
  onSubmitted: () => void
  prefill?: RiderApplicationData
  isResubmit?: boolean
}> = ({ onSubmitted, prefill, isResubmit }) => {
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

  const canSubmit = fullName.trim() && contactNumber.trim() && vehicleType && licenseUrl && ageCheck && licenseCheck && termsCheck

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
        title: isResubmit ? 'Application Resubmitted' : 'Application Submitted',
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
            {isResubmit ? 'Resubmit Application' : 'Apply as a Rider'}
          </Heading>
          <Text fontSize="sm" color="gray.500" textAlign="center">
            Fill out your details and upload your documents to get started
          </Text>
        </VStack>

        {isResubmit && prefill?.rejection_reason && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">Previous application was not approved</AlertTitle>
              <AlertDescription fontSize="xs">{prefill.rejection_reason}</AlertDescription>
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
                />
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
                <FormLabel fontSize="sm">Plate Number</FormLabel>
                <Input
                  value={vehiclePlate}
                  onChange={e => setVehiclePlate(e.target.value)}
                  placeholder="e.g., ABC-1234"
                />
              </FormControl>

              {/* License Upload */}
              <FormControl isRequired>
                <FormLabel fontSize="sm">Driver's License</FormLabel>
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
                    onClick={() => licenseInputRef.current?.click()}
                    isLoading={uploading}
                    loadingText="Uploading..."
                  >
                    <VStack spacing={1}>
                      <Icon as={FaFileAlt} boxSize={6} color="gray.400" />
                      <Text fontSize="xs" color="gray.500">Upload Driver's License</Text>
                    </VStack>
                  </Button>
                )}
              </FormControl>

              {/* Selfie Upload */}
              <FormControl>
                <FormLabel fontSize="sm">Selfie (Optional)</FormLabel>
                <Text fontSize="xs" color="gray.400" mb={2}>For identity matching</Text>
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
          {isResubmit ? 'Resubmit Application' : 'Submit Application'}
        </Button>

        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          Back
        </Button>
      </VStack>
    </Box>
  )
}

// ─── Status Tracker ──────────────────────────────────────────────────
const ApplicationStatusTracker: React.FC<{
  application: RiderApplicationData
  onResubmit: () => void
}> = ({ application, onResubmit }) => {
  const steps = [
    { title: 'Submitted', description: 'Application received' },
    { title: 'Under Review', description: 'Admin reviewing your documents' },
    { title: 'Decision', description: 'Application result' },
  ]

  let activeStep = 0
  if (application.status === 'under_review') activeStep = 1
  if (application.status === 'approved' || application.status === 'rejected') activeStep = 2

  const { activeStep: stepIndex } = useSteps({ index: activeStep, count: steps.length })

  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <VStack spacing={6} maxW="md" mx="auto">
        <VStack spacing={1}>
          <Icon as={FaMotorcycle} boxSize={10} color="brand.500" />
          <Heading size="lg" color="brand.600">Application Status</Heading>
        </VStack>

        <Card w="full" bg="white">
          <CardBody>
            <Stepper index={stepIndex} orientation="vertical" gap={0} h="200px">
              {steps.map((step, index) => (
                <Step key={index}>
                  <StepIndicator>
                    <StepStatus
                      complete={<StepIcon />}
                      incomplete={<StepNumber />}
                      active={<StepNumber />}
                    />
                  </StepIndicator>
                  <Box flexShrink={0}>
                    <StepTitle>{step.title}</StepTitle>
                    <StepDescription>{step.description}</StepDescription>
                  </Box>
                  <StepSeparator />
                </Step>
              ))}
            </Stepper>
          </CardBody>
        </Card>

        {application.status === 'pending' && (
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">Application Pending</AlertTitle>
              <AlertDescription fontSize="xs">
                Your application is waiting to be reviewed. We'll notify you when there's an update.
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {application.status === 'under_review' && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">Under Review</AlertTitle>
              <AlertDescription fontSize="xs">
                An admin is currently reviewing your application and documents.
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {application.status === 'rejected' && (
          <>
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              <Box>
                <AlertTitle fontSize="sm">Application Not Approved</AlertTitle>
                <AlertDescription fontSize="xs">
                  {application.rejection_reason || 'Your application did not meet the requirements.'}
                </AlertDescription>
              </Box>
            </Alert>
            <Button colorScheme="brand" w="full" onClick={onResubmit} leftIcon={<Icon as={FaMotorcycle} />}>
              Resubmit Application
            </Button>
          </>
        )}

        {/* Application Details */}
        <Card w="full" bg="white">
          <CardBody>
            <Text fontWeight="bold" fontSize="sm" mb={3}>Your Application Details</Text>
            <SimpleGrid columns={2} spacing={3} fontSize="sm">
              <Box>
                <Text color="gray.500" fontSize="xs">Full Name</Text>
                <Text fontWeight="semibold">{application.full_name}</Text>
              </Box>
              <Box>
                <Text color="gray.500" fontSize="xs">Contact</Text>
                <Text fontWeight="semibold">{application.contact_number}</Text>
              </Box>
              <Box>
                <Text color="gray.500" fontSize="xs">Vehicle</Text>
                <Text fontWeight="semibold" textTransform="capitalize">{application.vehicle_type}</Text>
              </Box>
              <Box>
                <Text color="gray.500" fontSize="xs">Plate</Text>
                <Text fontWeight="semibold">{application.vehicle_plate || 'N/A'}</Text>
              </Box>
            </SimpleGrid>
            {application.created_at && (
              <Text fontSize="xs" color="gray.400" mt={3}>
                Applied on {new Date(application.created_at).toLocaleDateString()}
              </Text>
            )}
          </CardBody>
        </Card>

        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          Back to Home
        </Button>
      </VStack>
    </Box>
  )
}

// ─── Main Component ──────────────────────────────────────────────────
const RiderJobs: React.FC = () => {
  const navigate = useNavigate()
  const toast = useToast()
  const { isOpen, onOpen, onClose } = useDisclosure()

  const [pendingJobs, setPendingJobs] = useState<DeliveryJob[]>([])
  const [claimedBatches, setClaimedBatches] = useState<ClaimedBatch[]>([])
  const [selectedJob, setSelectedJob] = useState<DeliveryJob | null>(null)
  const [suggestedBatch, setSuggestedBatch] = useState<DeliveryJob[]>([])
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [riderProfile, setRiderProfile] = useState<RiderProfile | null>(null)

  // Application state
  const [appData, setAppData] = useState<RiderApplicationData | null>(null)
  const [appView, setAppView] = useState<'loading' | 'form' | 'status' | 'resubmit' | 'dashboard'>('loading')

  const checkApplicationStatus = async () => {
    try {
      const response = await api.get('/api/deliveries/rider-application')
      const data: RiderApplicationData = response.data?.data
      setAppData(data)

      if (!data?.has_applied) {
        setAppView('form')
      } else if (data.status === 'approved' && data.is_active) {
        setAppView('dashboard')
        setRiderProfile({
          rider_id: data.rider_id || 0,
          name: data.name || data.full_name || '',
          vehicle_type: data.vehicle_type || '',
          vehicle_plate: data.vehicle_plate || '',
          phone: data.phone || data.contact_number || '',
          rating: data.rating || 0,
          created_at: data.created_at || '',
          completed_deliveries: data.completed_deliveries || 0,
          is_active: true,
        })
      } else {
        setAppView('status')
      }
    } catch {
      setAppView('form')
    }
  }

  const fetchAvailableDeliveries = async () => {
    try {
      const response = await api.get('/api/deliveries/available')
      const deliveries: Delivery[] = response.data?.data || []
      setPendingJobs(deliveries.map(mapDeliveryToJob))
    } catch {
      // ignore
    }
  }

  const fetchClaimedDeliveries = async () => {
    try {
      const response = await api.get('/api/deliveries/my-jobs')
      const deliveries: Delivery[] = response.data?.data || []
      const batches: ClaimedBatch[] = deliveries
        .filter(d => d.status !== 'delivered')
        .map(d => ({
          batchId: String(d.id),
          type: d.delivery_type as 'standard' | 'express',
          jobs: [mapDeliveryToJob(d)],
          totalEarnings: d.total_cost,
          totalDistance: '~',
          createdAt: d.claimed_at || d.created_at,
          riderName: d.rider_name,
          riderVehicle: d.rider_vehicle,
          riderRating: d.rider_rating,
        }))
      setClaimedBatches(batches)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await checkApplicationStatus()
      await Promise.all([fetchAvailableDeliveries(), fetchClaimedDeliveries()])
      setLoading(false)
    }
    loadData()

    const interval = setInterval(() => {
      if (appView === 'dashboard') {
        fetchAvailableDeliveries()
        fetchClaimedDeliveries()
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  const handleAcceptDelivery = (job: DeliveryJob) => {
    if (claimedBatches.length > 0) {
      const hasActiveBatch = claimedBatches.some(batch =>
        batch.jobs.some(j => j.status !== 'delivered')
      )
      if (hasActiveBatch) {
        toast({
          id: "rider-active-batch-pending",
          title: 'Active Batch Pending',
          description: 'Complete your current batch before claiming a new one',
          status: 'warning',
          duration: 3000,
          isClosable: true,
        })
        return
      }
    }

    setSelectedJob(job)
    if (job.deliveryType === 'express') {
      setSuggestedBatch([job])
    } else {
      const nearbyStandardJobs = pendingJobs.filter(
        j => j.deliveryType === 'standard' && j.status === 'pending'
      )
      setSuggestedBatch(nearbyStandardJobs.slice(0, 5))
    }
    onOpen()
  }

  const handleConfirmBatch = async () => {
    if (!selectedJob || suggestedBatch.length === 0) return
    setClaiming(true)
    try {
      for (const job of suggestedBatch) {
        await api.post(`/api/deliveries/${job.id}/claim`)
      }
      toast({
        id: "rider-toast-4",
        title: selectedJob.deliveryType === 'express' ? 'Express Job Claimed!' : 'Batch Claimed!',
        description: `${suggestedBatch.length} delivery(s) claimed successfully.`,
        status: 'success',
        duration: 3000,
      })
      await Promise.all([fetchAvailableDeliveries(), fetchClaimedDeliveries()])
      navigate(`/task-stepper/${suggestedBatch[0].id}`)
    } catch (error: any) {
      toast({
        id: "rider-error",
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to claim delivery',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setClaiming(false)
      onClose()
    }
  }

  const getDeliveryColor = (type: 'standard' | 'express') =>
    type === 'express' ? 'purple' : 'blue'

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

  // Show application form
  if (appView === 'form') {
    return (
      <RiderApplicationForm
        onSubmitted={() => {
          checkApplicationStatus()
        }}
      />
    )
  }

  // Show resubmit form (pre-filled after rejection)
  if (appView === 'resubmit' && appData) {
    return (
      <RiderApplicationForm
        onSubmitted={() => {
          checkApplicationStatus()
        }}
        prefill={appData}
        isResubmit
      />
    )
  }

  // Show status tracker for pending/under_review/rejected
  if (appView === 'status' && appData) {
    return (
      <ApplicationStatusTracker
        application={appData}
        onResubmit={() => setAppView('resubmit')}
      />
    )
  }

  // ─── Approved Rider Dashboard ────────────────────────────────────
  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <VStack spacing={4} maxW="md" mx="auto">
        {/* Header */}
        <VStack spacing={1} w="full">
          <Heading size="md" color="brand.500">
            Available Deliveries
          </Heading>
          <Text fontSize="sm" color="gray.600">
            {pendingJobs.filter(j => j.status === 'pending').length} jobs nearby
          </Text>
        </VStack>

        {/* Rider Profile Card */}
        {riderProfile && (
          <Card bg="white" border="2px" borderColor="brand.200" w="full" shadow="sm">
            <CardBody p={4}>
              <VStack spacing={3} align="stretch">
                <HStack spacing={4}>
                  <Avatar
                    name={riderProfile.name}
                    size="lg"
                    bg="brand.500"
                    color="white"
                  />
                  <VStack align="start" spacing={1} flex={1}>
                    <HStack>
                      <Text fontWeight="bold" fontSize="md">{riderProfile.name}</Text>
                      <Badge colorScheme="green" fontSize="2xs">Verified Rider</Badge>
                    </HStack>
                    <HStack spacing={1}>
                      <Icon as={FaStar} color="yellow.400" boxSize={3} />
                      <Text fontSize="sm" fontWeight="semibold" color="gray.700">
                        {riderProfile.rating > 0 ? riderProfile.rating.toFixed(1) : 'No rating yet'}
                      </Text>
                    </HStack>
                  </VStack>
                </HStack>

                <Divider />

                <SimpleGrid columns={2} spacing={3} fontSize="xs">
                  <HStack spacing={2}>
                    <Icon as={FaMotorcycle} color="brand.500" boxSize={4} />
                    <VStack align="start" spacing={0}>
                      <Text color="gray.500">Vehicle</Text>
                      <Text fontWeight="semibold" color="gray.800">
                        {riderProfile.vehicle_type.charAt(0).toUpperCase() + riderProfile.vehicle_type.slice(1)}
                      </Text>
                    </VStack>
                  </HStack>
                  <HStack spacing={2}>
                    <Icon as={FaIdBadge} color="brand.500" boxSize={4} />
                    <VStack align="start" spacing={0}>
                      <Text color="gray.500">Plate</Text>
                      <Text fontWeight="semibold" color="gray.800">
                        {riderProfile.vehicle_plate || 'N/A'}
                      </Text>
                    </VStack>
                  </HStack>
                  <HStack spacing={2}>
                    <Icon as={FaPhone} color="brand.500" boxSize={4} />
                    <VStack align="start" spacing={0}>
                      <Text color="gray.500">Phone</Text>
                      <Text fontWeight="semibold" color="gray.800">
                        {riderProfile.phone || 'N/A'}
                      </Text>
                    </VStack>
                  </HStack>
                  <HStack spacing={2}>
                    <Icon as={FaCheckCircle} color="green.500" boxSize={4} />
                    <VStack align="start" spacing={0}>
                      <Text color="gray.500">Deliveries</Text>
                      <Text fontWeight="semibold" color="gray.800">
                        {riderProfile.completed_deliveries} completed
                      </Text>
                    </VStack>
                  </HStack>
                </SimpleGrid>

                {riderProfile.created_at && (
                  <Text fontSize="2xs" color="gray.400" textAlign="center">
                    Rider since {new Date(riderProfile.created_at).toLocaleDateString()}
                  </Text>
                )}
              </VStack>
            </CardBody>
          </Card>
        )}

        {/* Tabs: Pending vs Claimed */}
        <Tabs variant="soft-rounded" colorScheme="brand" w="full">
          <TabList>
            <Tab fontSize="sm">
              Pending ({pendingJobs.filter(j => j.status === 'pending').length})
            </Tab>
            <Tab fontSize="sm">
              Claimed ({claimedBatches.length})
            </Tab>
          </TabList>

          <TabPanels>
            {/* Pending Jobs */}
            <TabPanel px={0}>
              <VStack spacing={3} align="stretch">
                {pendingJobs
                  .filter(job => job.status === 'pending')
                  .map(job => (
                    <Card key={job.id} bg="white" border="1px" borderColor="gray.200">
                      <CardBody p={3}>
                        <VStack spacing={2} align="stretch">
                          <HStack justify="space-between" align="start">
                            <VStack align="start" spacing={0} flex={1}>
                              <HStack spacing={2}>
                                <Badge fontSize="2xs" colorScheme={getDeliveryColor(job.deliveryType)}>
                                  {job.deliveryType === 'express' ? 'Express' : 'Standard'}
                                </Badge>
                                {job.isFragile && (
                                  <Badge fontSize="2xs" colorScheme="red">Fragile</Badge>
                                )}
                              </HStack>
                              <Text fontWeight="bold" fontSize="sm" color="gray.800">
                                {job.itemType}
                              </Text>
                            </VStack>
                            <Text fontWeight="bold" color="brand.600">P{job.fee}</Text>
                          </HStack>

                          <SimpleGrid columns={2} spacing={2} fontSize="xs">
                            <HStack spacing={1}>
                              <Icon as={FaMapMarkerAlt} color="red.500" boxSize={3} />
                              <Text color="gray.600" noOfLines={1}>{job.pickupLocation}</Text>
                            </HStack>
                            <HStack spacing={1}>
                              <Icon as={FaClock} color="blue.500" boxSize={3} />
                              <Text color="gray.600">{job.pickupWindow}</Text>
                            </HStack>
                            <HStack spacing={1}>
                              <Icon as={FaBox} color="gray.600" boxSize={3} />
                              <Text color="gray.600">{job.itemCount} item(s)</Text>
                            </HStack>
                            <Text color="gray.600" fontSize="xs" noOfLines={1}>
                              {job.sender}
                            </Text>
                          </SimpleGrid>

                          <VStack spacing={1} align="stretch" fontSize="xs">
                            <HStack>
                              <Badge colorScheme="green" fontSize="2xs">FROM</Badge>
                              <Text color="gray.600" noOfLines={1}>{job.pickupLocation}</Text>
                            </HStack>
                            <HStack>
                              <Badge colorScheme="red" fontSize="2xs">TO</Badge>
                              <Text color="gray.600" noOfLines={1}>{job.dropoffLocation}</Text>
                            </HStack>
                          </VStack>

                          <Button
                            size="sm"
                            colorScheme="brand"
                            w="full"
                            onClick={() => handleAcceptDelivery(job)}
                            isDisabled={claimedBatches.some(b =>
                              b.jobs.some(j => j.status !== 'delivered')
                            )}
                          >
                            Claim Delivery
                          </Button>
                        </VStack>
                      </CardBody>
                    </Card>
                  ))}

                {pendingJobs.filter(j => j.status === 'pending').length === 0 && (
                  <Text textAlign="center" color="gray.500" py={6}>
                    No pending deliveries nearby
                  </Text>
                )}
              </VStack>
            </TabPanel>

            {/* Claimed Batches */}
            <TabPanel px={0}>
              <VStack spacing={3} align="stretch">
                {claimedBatches.map(batch => {
                  const allCompleted = batch.jobs.every(j => j.status === 'delivered')
                  return (
                    <Card key={batch.batchId} bg={allCompleted ? 'gray.50' : 'green.50'} border="2px" borderColor={allCompleted ? 'gray.200' : 'green.200'}>
                      <CardBody p={3}>
                        <VStack spacing={3} align="stretch">
                          <HStack justify="space-between" align="start">
                            <VStack align="start" spacing={0}>
                              <Badge colorScheme={batch.type === 'express' ? 'purple' : 'blue'}>
                                {batch.type === 'express' ? 'Express' : 'Standard'}
                              </Badge>
                              <Text fontWeight="bold" fontSize="sm">
                                {batch.jobs.length} job(s)
                              </Text>
                            </VStack>
                            <VStack align="end" spacing={0}>
                              <Text fontWeight="bold" color="green.600">P{batch.totalEarnings}</Text>
                            </VStack>
                          </HStack>

                          {batch.riderName && (
                            <Card bg="white" border="1px" borderColor="gray.200">
                              <CardBody p={2}>
                                <HStack justify="space-between" fontSize="sm">
                                  <VStack align="start" spacing={0}>
                                    <Text fontWeight="bold" color="gray.800">{batch.riderName}</Text>
                                    {batch.riderVehicle && (
                                      <Text fontSize="xs" color="gray.600">{batch.riderVehicle}</Text>
                                    )}
                                  </VStack>
                                  {batch.riderRating && (
                                    <HStack spacing={1}>
                                      <Icon as={FaStar} color="yellow.400" boxSize={3} />
                                      <Text fontWeight="bold" fontSize="sm">{batch.riderRating}</Text>
                                    </HStack>
                                  )}
                                </HStack>
                              </CardBody>
                            </Card>
                          )}

                          <Divider />

                          <VStack spacing={1} align="stretch">
                            {batch.jobs.map((job, idx) => (
                              <HStack key={job.id} spacing={2} fontSize="xs" py={1}>
                                <Badge colorScheme={job.status === 'delivered' ? 'green' : 'gray'} fontSize="2xs">
                                  {idx + 1}
                                </Badge>
                                <Text color="gray.700" flex={1} noOfLines={1}>
                                  {job.pickupLocation} → {job.dropoffLocation}
                                </Text>
                                <Badge colorScheme={job.status === 'delivered' ? 'green' : 'yellow'} fontSize="2xs">
                                  {job.status === 'delivered' ? 'Done' : job.status.replace(/_/g, ' ')}
                                </Badge>
                              </HStack>
                            ))}
                          </VStack>

                          <Button
                            size="sm"
                            colorScheme={allCompleted ? 'gray' : 'green'}
                            variant="solid"
                            w="full"
                            onClick={() => navigate(`/task-stepper/${batch.batchId}`)}
                          >
                            {allCompleted ? 'Completed' : 'Continue Delivery'}
                          </Button>
                        </VStack>
                      </CardBody>
                    </Card>
                  )
                })}

                {claimedBatches.length === 0 && (
                  <Text textAlign="center" color="gray.500" py={6}>
                    No claimed deliveries yet
                  </Text>
                )}
              </VStack>
            </TabPanel>
          </TabPanels>
        </Tabs>

        {/* Navigation Buttons */}
        <HStack spacing={2} w="full" mt={4}>
          <Button flex={1} size="sm" colorScheme="brand" onClick={() => navigate('/rider-queue')}>
            Batches
          </Button>
          <Button flex={1} size="sm" colorScheme="brand" onClick={() => navigate('/remittance-ledger')}>
            Earnings
          </Button>
        </HStack>
      </VStack>

      {/* Batch Preview Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="sm" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader fontSize="md">
            {selectedJob?.deliveryType === 'express' ? 'Claim Express Job?' : 'Claim Batch?'}
          </ModalHeader>
          <ModalBody>
            <VStack spacing={3} align="stretch">
              <Card bg="gray.50">
                <CardBody p={3}>
                  <VStack spacing={2} align="stretch" fontSize="sm">
                    <HStack justify="space-between">
                      <Text color="gray.600">Type:</Text>
                      <Badge colorScheme={getDeliveryColor(selectedJob?.deliveryType || 'standard')}>
                        {selectedJob?.deliveryType === 'express' ? 'Express (Single)' : `Standard (${suggestedBatch.length} jobs)`}
                      </Badge>
                    </HStack>
                    <HStack justify="space-between">
                      <Text color="gray.600">Total Earnings:</Text>
                      <Text fontWeight="bold" color="brand.600">
                        P{suggestedBatch.reduce((sum, j) => sum + j.fee, 0)}
                      </Text>
                    </HStack>
                  </VStack>
                </CardBody>
              </Card>

              {selectedJob?.deliveryType === 'standard' && suggestedBatch.length > 1 && (
                <VStack spacing={1} align="stretch">
                  <Text fontWeight="bold" fontSize="xs" color="gray.700">
                    Jobs in batch (max 5):
                  </Text>
                  {suggestedBatch.map((job, idx) => (
                    <HStack key={job.id} spacing={2} fontSize="2xs" py={1}>
                      <Badge colorScheme="gray">{idx + 1}</Badge>
                      <Text color="gray.600" flex={1} noOfLines={1}>
                        {job.itemType} - {job.sender}
                      </Text>
                      <Text fontWeight="bold">P{job.fee}</Text>
                    </HStack>
                  ))}
                </VStack>
              )}

              <HStack spacing={2} p={2} bg="orange.50" borderRadius="md">
                <WarningIcon boxSize={4} color="orange.600" />
                <Text fontSize="xs" color="orange.900">
                  Cannot claim new batch until current one is completed
                </Text>
              </HStack>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack spacing={2} w="full">
              <Button variant="outline" flex={1} onClick={onClose}>Cancel</Button>
              <Button
                colorScheme="brand"
                flex={1}
                onClick={handleConfirmBatch}
                isLoading={claiming}
                loadingText="Claiming..."
              >
                Confirm Claim
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  )
}

export default RiderJobs
