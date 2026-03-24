import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Card,
  CardBody,
  Icon,
  Badge,
  Divider,
  Textarea,
  useToast,
  Progress,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Spinner,
  Center,
  Image,
  IconButton,
  Alert,
  AlertIcon,
} from '@chakra-ui/react'
import { CheckCircleIcon, WarningIcon, CloseIcon } from '@chakra-ui/icons'
import { FaMapMarkerAlt, FaQrcode, FaCamera, FaPhone, FaSync, FaRedo, FaMoneyBillWave } from 'react-icons/fa'
import { api } from '../services/api'
import { Delivery, DeliveryStop } from '../types'

// The status progression for a delivery
const STATUS_PROGRESSION: Array<Delivery['status']> = ['claimed', 'picked_up', 'in_transit', 'delivered']

// Task 17: Format peso amount
const formatPeso = (amount: number): string => {
  return `₱${amount.toFixed(2)}`
}

interface Task {
  id: string
  type: 'pickup' | 'delivery'
  status: 'pending' | 'in-progress' | 'completed'
  recipientName: string
  address: string
  contact: string
  itemCount: number
  notes: string
  timestamp?: string
  // Task 17: Fee amount for this stop
  feeAmount?: number
  stopId?: number
  stopStatus?: DeliveryStop['status']
  feeCollected?: boolean
}

const TaskStepper: React.FC = () => {
  const { batchId } = useParams() // This is actually the delivery ID
  const navigate = useNavigate()
  const toast = useToast()

  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [stops, setStops] = useState<DeliveryStop[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [qrScanned, setQrScanned] = useState(false)
  const [photoCaptured, setPhotoCaptured] = useState(false)
  const [deliveryNotes, setDeliveryNotes] = useState('')
  // Phase 3 - Task 15 & 16: Store QR and photo data for backend submission
  const [scannedQRCode, setScannedQRCode] = useState('')
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState('')
  // Task 16: Real camera capture states
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Task 17: Fee collection states
  const [feeCollected, setFeeCollected] = useState(false)
  const [collectingFee, setCollectingFee] = useState(false)

  // Fetch delivery data and stops from API
  const fetchDelivery = async () => {
    if (!batchId) return
    try {
      const response = await api.get(`/api/deliveries/${batchId}`)
      const deliveryData = response.data?.data || null
      setDelivery(deliveryData)

      // Fetch stops for this delivery
      if (deliveryData) {
        try {
          const stopsResponse = await api.get(`/api/deliveries/${batchId}/stops`)
          setStops(stopsResponse.data?.data || [])
        } catch (stopsErr) {
          console.log('No stops found, using legacy flow')
          setStops([])
        }
      }
    } catch (error) {
      console.error('Failed to fetch delivery:', error)
      toast({
        id: "taskstepper-error",
        title: 'Error',
        description: 'Failed to load delivery details',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDelivery()
  }, [batchId])

  // Build task steps from the delivery data and stops
  const buildTasks = (): Task[] => {
    if (!delivery) return []

    // If we have stops from API, use them (Task 17)
    if (stops.length > 0) {
      return stops.map(stop => ({
        id: stop.stop_type === 'pickup' ? 'pickup' : 'deliver',
        type: stop.stop_type,
        status: stop.status === 'completed' ? 'completed'
          : stop.status !== 'pending' ? 'in-progress'
          : 'pending',
        recipientName: stop.contact_name || (stop.stop_type === 'pickup' ? 'Seller' : 'Buyer'),
        address: stop.address,
        contact: stop.contact_phone || '',
        itemCount: delivery.item_count,
        notes: delivery.special_instructions || '',
        timestamp: stop.completed_at
          ? new Date(stop.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '',
        // Task 17: Fee data
        feeAmount: stop.fee_amount,
        stopId: stop.id,
        stopStatus: stop.status,
        feeCollected: stop.status === 'fee_collected' || stop.status === 'completed',
      }))
    }

    // Fallback to legacy task building (without stops)
    const tasks: Task[] = [
      {
        id: 'pickup',
        type: 'pickup',
        status: delivery.picked_up_at ? 'completed'
          : delivery.status === 'claimed' ? 'in-progress'
          : 'pending',
        recipientName: delivery.user_name || 'Seller',
        address: delivery.pickup_address,
        contact: '',
        itemCount: delivery.item_count,
        notes: delivery.special_instructions || '',
        timestamp: delivery.picked_up_at
          ? new Date(delivery.picked_up_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '',
      },
      {
        id: 'deliver',
        type: 'delivery',
        status: delivery.delivered_at ? 'completed'
          : delivery.status === 'in_transit' ? 'in-progress'
          : 'pending',
        recipientName: 'Buyer',
        address: delivery.delivery_address,
        contact: '',
        itemCount: delivery.item_count,
        notes: delivery.special_instructions || '',
        timestamp: delivery.delivered_at
          ? new Date(delivery.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '',
      },
    ]

    return tasks
  }

  const tasks = buildTasks()
  const currentTaskIndex = tasks.findIndex(t => t.status === 'in-progress')
  const activeIndex = currentTaskIndex >= 0 ? currentTaskIndex : tasks.findIndex(t => t.status === 'pending')
  const currentTask = activeIndex >= 0 ? tasks[activeIndex] : null
  const completedCount = tasks.filter(t => t.status === 'completed').length
  const totalTasks = tasks.length
  const allDone = delivery?.status === 'delivered'

  // Get the next status in the progression
  const getNextStatus = (): Delivery['status'] | null => {
    if (!delivery) return null
    const currentIdx = STATUS_PROGRESSION.indexOf(delivery.status as any)
    if (currentIdx < 0 || currentIdx >= STATUS_PROGRESSION.length - 1) return null
    return STATUS_PROGRESSION[currentIdx + 1]
  }

  const handleQrScan = async () => {
    // Simulate QR scanning - in production this would use a camera
    const scannedCode = `DELIVERY-${delivery?.id}-${Date.now()}`
    setQrScanned(true)
    toast({
        id: "taskstepper-qr-scanned",
      title: 'QR Scanned',
      description: 'Task verified at location',
      status: 'success',
      duration: 2000,
    })
    // Store QR code for submission
    setScannedQRCode(scannedCode)
  }

  // Task 16: Open camera for photo capture
  const handleCapturePhoto = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  // Task 16: Handle file selection from camera
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        id: "taskstepper-invalid-file",
        title: 'Invalid File',
        description: 'Please capture an image file',
        status: 'error',
        duration: 3000,
      })
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        id: "taskstepper-file-too-large",
        title: 'File Too Large',
        description: 'Photo must be smaller than 10MB',
        status: 'error',
        duration: 3000,
      })
      return
    }

    // Create preview
    const previewUrl = URL.createObjectURL(file)
    setPhotoPreview(previewUrl)

    // Upload the photo
    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      formData.append('type', 'delivery_proof')

      const response = await api.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      const uploadedUrl = response.data?.data?.url
      if (uploadedUrl) {
        setCapturedPhotoUrl(uploadedUrl)
        setPhotoCaptured(true)
        toast({
          id: "taskstepper-photo-uploaded",
          title: 'Photo Uploaded',
          description: 'Delivery proof captured successfully',
          status: 'success',
          duration: 2000,
        })
      } else {
        throw new Error('No URL returned from upload')
      }
    } catch (error: any) {
      console.error('Photo upload failed:', error)
      // Clear preview on error
      setPhotoPreview(null)
      URL.revokeObjectURL(previewUrl)
      toast({
        id: "taskstepper-upload-failed",
        title: 'Upload Failed',
        description: error?.response?.data?.error || 'Failed to upload photo. Please try again.',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setUploadingPhoto(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Task 16: Remove captured photo
  const handleRemovePhoto = () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview)
    }
    setPhotoPreview(null)
    setCapturedPhotoUrl('')
    setPhotoCaptured(false)
  }

  // Task 17: Collect fee at current stop
  const handleCollectFee = async (stopId: number, feeAmount: number) => {
    if (!delivery) return
    setCollectingFee(true)

    try {
      await api.post(`/api/deliveries/${delivery.id}/stops/${stopId}/action`, {
        action: 'collect_fee'
      })

      setFeeCollected(true)
      toast({
        id: "taskstepper-fee-collected",
        title: 'Fee Collected',
        description: `${formatPeso(feeAmount)} collected successfully`,
        status: 'success',
        duration: 2000,
      })

      // Refresh delivery and stops data
      await fetchDelivery()
    } catch (error: any) {
      console.error('Fee collection failed:', error)
      toast({
        id: "taskstepper-fee-error",
        title: 'Collection Failed',
        description: error?.response?.data?.error || 'Failed to record fee collection',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setCollectingFee(false)
    }
  }

  // Task 17: Complete stop with photo (for delivery stops)
  const handleCompleteStop = async (stopId: number, requirePhoto: boolean) => {
    if (!delivery) return

    // For delivery stops, require photo proof
    if (requirePhoto && !photoCaptured && !capturedPhotoUrl) {
      toast({
        id: "taskstepper-missing-photo",
        title: 'Photo Required',
        description: 'Please capture a photo proof to complete delivery',
        status: 'warning',
        duration: 3000,
      })
      return
    }

    setUpdating(true)
    try {
      await api.post(`/api/deliveries/${delivery.id}/stops/${stopId}/action`, {
        action: 'complete',
        photo_url: capturedPhotoUrl || undefined
      })

      toast({
        id: "taskstepper-stop-completed",
        title: 'Stop Completed',
        description: 'Moving to next step',
        status: 'success',
        duration: 2000,
      })

      // Reset states
      setPhotoCaptured(false)
      setCapturedPhotoUrl('')
      setFeeCollected(false)
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview)
        setPhotoPreview(null)
      }

      // Refresh data
      await fetchDelivery()
    } catch (error: any) {
      console.error('Complete stop failed:', error)
      toast({
        id: "taskstepper-complete-error",
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to complete stop',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setUpdating(false)
    }
  }

  const handleCompleteTask = async () => {
    if (!delivery) return

    const nextStatus = getNextStatus()
    if (!nextStatus) {
      toast({
        id: "taskstepper-already-completed", title: 'Already completed', status: 'info', duration: 2000 })
      return
    }

    // For the final delivery step, require photo proof (Task 16)
    if (nextStatus === 'delivered' && !photoCaptured && !capturedPhotoUrl) {
      toast({
        id: "taskstepper-missing-photo",
        title: 'Photo Required',
        description: 'Please capture a photo proof to complete delivery',
        status: 'warning',
        duration: 3000,
      })
      return
    }

    setUpdating(true)
    try {
      // Build update payload with QR and photo data
      const payload: Record<string, any> = { status: nextStatus }

      // Include QR code if scanned
      if (qrScanned && scannedQRCode) {
        payload.qr_code = scannedQRCode
      }

      // Include photo URL if captured (required for delivery step)
      if (photoCaptured && capturedPhotoUrl) {
        payload.photo_url = capturedPhotoUrl
      }

      await api.put(`/api/deliveries/${delivery.id}/status`, payload)

      toast({
        id: "taskstepper-toast-6",
        title: nextStatus === 'delivered' ? 'Delivery Complete!' : 'Status Updated',
        description: nextStatus === 'delivered'
          ? 'All items delivered. The trade can now be completed.'
          : `Status updated to: ${nextStatus.replace(/_/g, ' ')}`,
        status: 'success',
        duration: 3000,
      })

      // Reset verification state
      setQrScanned(false)
      setPhotoCaptured(false)
      setScannedQRCode('')
      setCapturedPhotoUrl('')
      setDeliveryNotes('')
      // Clear photo preview
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview)
        setPhotoPreview(null)
      }

      // Refresh delivery data
      await fetchDelivery()

      if (nextStatus === 'delivered') {
        // Give a moment for the user to see success, then navigate
        setTimeout(() => navigate('/rider'), 2000)
      }
    } catch (error: any) {
      const errMsg = error?.response?.data?.error || 'Failed to update delivery status'
      toast({
        id: "taskstepper-error-2",
        title: 'Error',
        description: errMsg,
        status: 'error',
        duration: 3000,
      })
    } finally {
      setUpdating(false)
    }
  }

  // Get the label for the complete button based on current status
  const getButtonLabel = (): string => {
    const nextStatus = getNextStatus()
    switch (nextStatus) {
      case 'picked_up': return 'Confirm Pickup'
      case 'in_transit': return 'Start Delivery'
      case 'delivered': return 'Confirm Delivered'
      default: return 'Complete'
    }
  }

  if (loading) {
    return (
      <Center minH="100vh" bg="#FFFDF1">
        <VStack spacing={3}>
          <Spinner size="lg" color="brand.500" />
          <Text color="gray.500">Loading delivery...</Text>
        </VStack>
      </Center>
    )
  }

  if (!delivery) {
    return (
      <Center minH="100vh" bg="#FFFDF1">
        <VStack spacing={3}>
          <Text color="gray.500">Delivery not found</Text>
          <Button colorScheme="brand" onClick={() => navigate('/rider')}>
            Back to Jobs
          </Button>
        </VStack>
      </Center>
    )
  }

  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <VStack spacing={6} maxW="md" mx="auto">
        {/* Progress Bar */}
        <VStack spacing={2} w="full">
          <HStack justify="space-between" w="full">
            <Heading size="sm" color="gray.800">
              Delivery #{delivery.id}
            </Heading>
            <Badge colorScheme={allDone ? 'green' : 'blue'} fontSize="sm">
              {delivery.status.replace(/_/g, ' ').toUpperCase()}
            </Badge>
          </HStack>
          <Progress
            value={(completedCount / totalTasks) * 100}
            colorScheme="green"
            w="full"
            borderRadius="full"
            h="8px"
          />
          <Text fontSize="xs" color="gray.500">
            {completedCount}/{totalTasks} steps completed
          </Text>
        </VStack>

        {/* Task Stepper Timeline */}
        <Card bg="white" w="full" border="1px" borderColor="gray.200">
          <CardBody p={4}>
            <VStack spacing={0} align="stretch">
              {tasks.map((task, index) => (
                <VStack key={task.id} spacing={0} align="stretch" pb={index < tasks.length - 1 ? 4 : 0}>
                  <HStack
                    spacing={3}
                    p={2}
                    bg={index === activeIndex ? 'brand.50' : 'transparent'}
                    borderRadius="md"
                    opacity={task.status !== 'pending' || index === activeIndex ? 1 : 0.5}
                  >
                    <Box
                      w="8"
                      h="8"
                      borderRadius="full"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      bg={
                        task.status === 'completed' ? 'green.100' :
                        task.status === 'in-progress' ? 'blue.100' :
                        'gray.100'
                      }
                      flexShrink={0}
                    >
                      <Icon
                        as={task.status === 'completed' ? CheckCircleIcon : WarningIcon}
                        color={
                          task.status === 'completed' ? 'green.600' :
                          task.status === 'in-progress' ? 'blue.600' :
                          'gray.400'
                        }
                        boxSize={5}
                      />
                    </Box>

                    <VStack align="start" spacing={0} flex={1}>
                      <HStack>
                        <Text fontWeight="bold" fontSize="sm" color="gray.800">
                          {task.type === 'pickup' ? 'Pickup' : 'Delivery'}
                        </Text>
                        {/* Task 17: Show fee amount in timeline */}
                        {task.feeAmount !== undefined && task.feeAmount > 0 && (
                          <Badge colorScheme={task.feeCollected ? 'green' : 'orange'} fontSize="xs">
                            {formatPeso(task.feeAmount)}
                          </Badge>
                        )}
                      </HStack>
                      <Text fontSize="xs" color="gray.600" noOfLines={1}>
                        {task.address}
                      </Text>
                    </VStack>

                    {task.timestamp && (
                      <Badge colorScheme="green" fontSize="xs">
                        {task.timestamp}
                      </Badge>
                    )}
                  </HStack>

                  {index < tasks.length - 1 && (
                    <Box h="20px" w="0.5" bg="gray.300" ml="4" my={2} />
                  )}
                </VStack>
              ))}
            </VStack>
          </CardBody>
        </Card>

        {/* Current Task Details */}
        {currentTask && !allDone && (
          <Card bg="white" w="full" border="2px" borderColor="blue.400">
            <CardBody>
              <VStack spacing={4} align="stretch">
                <HStack justify="space-between">
                  <VStack align="start" spacing={0}>
                    <Badge colorScheme="blue" fontSize="sm">
                      Current Step
                    </Badge>
                    <Text fontWeight="bold" fontSize="lg" color="gray.800">
                      {currentTask.type === 'pickup' ? 'Pickup Items' : 'Deliver Items'}
                    </Text>
                  </VStack>
                </HStack>

                {/* Task 17: PROMINENT FEE DISPLAY */}
                {currentTask.feeAmount !== undefined && currentTask.feeAmount > 0 && (
                  <Alert
                    status={currentTask.feeCollected ? 'success' : 'warning'}
                    variant="solid"
                    borderRadius="md"
                    flexDirection="column"
                    alignItems="center"
                    justifyContent="center"
                    textAlign="center"
                    py={4}
                  >
                    <Icon as={FaMoneyBillWave} boxSize={8} mb={2} />
                    <Text fontWeight="bold" fontSize="2xl">
                      {formatPeso(currentTask.feeAmount)}
                    </Text>
                    <Text fontSize="sm" mt={1}>
                      {currentTask.feeCollected
                        ? 'Fee Collected ✓'
                        : currentTask.type === 'pickup'
                          ? 'Collect from SENDER'
                          : 'Collect from RECEIVER'}
                    </Text>
                  </Alert>
                )}

                <Divider />

                {/* Details */}
                <VStack spacing={2} align="stretch" bg="gray.50" p={3} borderRadius="md">
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="gray.600">Person:</Text>
                    <Text fontWeight="bold" fontSize="sm" color="gray.800">
                      {currentTask.recipientName}
                    </Text>
                  </HStack>
                  <HStack justify="space-between" align="start">
                    <Text fontSize="sm" color="gray.600">Address:</Text>
                    <Text fontWeight="bold" fontSize="sm" color="gray.800" textAlign="right" maxW="60%">
                      {currentTask.address}
                    </Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="gray.600">Items:</Text>
                    <Badge colorScheme="purple">{currentTask.itemCount}</Badge>
                  </HStack>
                  {currentTask.notes && (
                    <HStack justify="space-between">
                      <Text fontSize="sm" color="gray.600">Notes:</Text>
                      <Text fontSize="sm" color="gray.700" fontStyle="italic">
                        "{currentTask.notes}"
                      </Text>
                    </HStack>
                  )}
                </VStack>

                {/* Action Buttons */}
                <HStack spacing={2}>
                  <Button
                    flex={1}
                    size="sm"
                    colorScheme="brand"
                    variant="outline"
                    leftIcon={<Icon as={FaPhone} />}
                  >
                    Call
                  </Button>
                  <Button
                    flex={1}
                    size="sm"
                    colorScheme="brand"
                    variant="outline"
                    leftIcon={<Icon as={FaMapMarkerAlt} />}
                  >
                    Map
                  </Button>
                </HStack>

                {/* Task 17: FEE COLLECTION BUTTON - must collect before completing */}
                {currentTask.stopId && currentTask.feeAmount !== undefined && currentTask.feeAmount > 0 && !currentTask.feeCollected && (
                  <>
                    <Divider />
                    <Button
                      w="full"
                      size="lg"
                      colorScheme="orange"
                      leftIcon={<Icon as={FaMoneyBillWave} />}
                      onClick={() => handleCollectFee(currentTask.stopId!, currentTask.feeAmount!)}
                      isLoading={collectingFee}
                      loadingText="Recording..."
                    >
                      Collect {formatPeso(currentTask.feeAmount)} Cash
                    </Button>
                    <Text fontSize="xs" color="gray.500" textAlign="center">
                      Tap after receiving cash payment from {currentTask.type === 'pickup' ? 'sender' : 'receiver'}
                    </Text>
                  </>
                )}

                <Divider />

                {/* Verification Tabs - only for delivery step */}
                {currentTask.type === 'delivery' && (
                  <Tabs variant="soft-rounded" colorScheme="brand" size="sm">
                    <TabList>
                      <Tab>QR Scan</Tab>
                      <Tab>Photo</Tab>
                      <Tab>Confirm</Tab>
                    </TabList>
                    <TabPanels>
                      <TabPanel>
                        <VStack spacing={3} align="stretch">
                          <Button
                            colorScheme={qrScanned ? 'green' : 'brand'}
                            leftIcon={<Icon as={FaQrcode} />}
                            onClick={handleQrScan}
                            w="full"
                          >
                            {qrScanned ? 'QR Scanned' : 'Scan QR Code'}
                          </Button>
                          <Text fontSize="xs" color="gray.600" textAlign="center">
                            Point camera at task QR for verification
                          </Text>
                        </VStack>
                      </TabPanel>

                      <TabPanel>
                        <VStack spacing={3} align="stretch">
                          {/* Hidden file input for camera capture */}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                          />

                          {/* Photo preview or capture button */}
                          {photoPreview ? (
                            <Box position="relative">
                              <Image
                                src={photoPreview}
                                alt="Delivery proof"
                                borderRadius="md"
                                maxH="200px"
                                w="full"
                                objectFit="cover"
                                border="2px"
                                borderColor={photoCaptured ? 'green.400' : 'gray.200'}
                              />
                              {uploadingPhoto && (
                                <Center
                                  position="absolute"
                                  top={0}
                                  left={0}
                                  right={0}
                                  bottom={0}
                                  bg="blackAlpha.600"
                                  borderRadius="md"
                                >
                                  <VStack>
                                    <Spinner color="white" size="lg" />
                                    <Text color="white" fontSize="sm">Uploading...</Text>
                                  </VStack>
                                </Center>
                              )}
                              {photoCaptured && (
                                <Badge
                                  position="absolute"
                                  top={2}
                                  left={2}
                                  colorScheme="green"
                                  fontSize="xs"
                                >
                                  <Icon as={CheckCircleIcon} mr={1} />
                                  Uploaded
                                </Badge>
                              )}
                              <IconButton
                                aria-label="Remove photo"
                                icon={<CloseIcon />}
                                size="sm"
                                colorScheme="red"
                                position="absolute"
                                top={2}
                                right={2}
                                onClick={handleRemovePhoto}
                                isDisabled={uploadingPhoto}
                              />
                            </Box>
                          ) : (
                            <Button
                              colorScheme="brand"
                              leftIcon={<Icon as={FaCamera} />}
                              onClick={handleCapturePhoto}
                              w="full"
                              size="lg"
                              isLoading={uploadingPhoto}
                              loadingText="Opening camera..."
                            >
                              Open Camera
                            </Button>
                          )}

                          {/* Retake button when photo exists */}
                          {photoPreview && !uploadingPhoto && (
                            <Button
                              colorScheme="brand"
                              variant="outline"
                              leftIcon={<Icon as={FaRedo} />}
                              onClick={handleCapturePhoto}
                              w="full"
                              size="sm"
                            >
                              Retake Photo
                            </Button>
                          )}

                          <Text fontSize="xs" color="gray.600" textAlign="center">
                            {photoCaptured
                              ? 'Photo proof captured and saved'
                              : 'Take a clear photo of the delivered items as proof'}
                          </Text>
                        </VStack>
                      </TabPanel>

                      <TabPanel>
                        <VStack spacing={3} align="stretch">
                          <Textarea
                            placeholder="Add delivery notes..."
                            value={deliveryNotes}
                            onChange={(e) => setDeliveryNotes(e.target.value)}
                            size="sm"
                            rows={3}
                          />
                        </VStack>
                      </TabPanel>
                    </TabPanels>
                  </Tabs>
                )}

                <Divider />

                {/* Complete Button */}
                {currentTask.stopId ? (
                  // Task 17: Stop-based completion with fee enforcement
                  <>
                    <Button
                      w="full"
                      colorScheme="green"
                      size="lg"
                      onClick={() => handleCompleteStop(currentTask.stopId!, currentTask.type === 'delivery')}
                      isLoading={updating}
                      loadingText="Completing..."
                      isDisabled={
                        // Must collect fee first (if fee exists)
                        (currentTask.feeAmount !== undefined && currentTask.feeAmount > 0 && !currentTask.feeCollected) ||
                        // For delivery stops, must have photo
                        (currentTask.type === 'delivery' && !photoCaptured && !capturedPhotoUrl)
                      }
                    >
                      {currentTask.type === 'pickup' ? 'Complete Pickup' : 'Complete Delivery'}
                    </Button>
                    {/* Show why button is disabled */}
                    {currentTask.feeAmount !== undefined && currentTask.feeAmount > 0 && !currentTask.feeCollected && (
                      <Text fontSize="xs" color="orange.600" textAlign="center">
                        ⚠️ Collect {formatPeso(currentTask.feeAmount)} fee first
                      </Text>
                    )}
                    {currentTask.type === 'delivery' && currentTask.feeCollected && !photoCaptured && !capturedPhotoUrl && (
                      <Text fontSize="xs" color="orange.600" textAlign="center">
                        ⚠️ Take photo proof to complete
                      </Text>
                    )}
                  </>
                ) : (
                  // Legacy flow without stops
                  <Button
                    w="full"
                    colorScheme="green"
                    size="lg"
                    onClick={handleCompleteTask}
                    isLoading={updating}
                    loadingText="Updating..."
                    isDisabled={currentTask.type === 'delivery' && getNextStatus() === 'delivered' && !qrScanned && !deliveryNotes}
                  >
                    {getButtonLabel()}
                  </Button>
                )}
              </VStack>
            </CardBody>
          </Card>
        )}

        {/* All Done */}
        {allDone && (
          <Card bg="green.50" w="full" border="2px" borderColor="green.400">
            <CardBody>
              <VStack spacing={3}>
                <Icon as={CheckCircleIcon} color="green.500" boxSize={10} />
                <Text fontWeight="bold" fontSize="lg" color="green.700">
                  Delivery Complete!
                </Text>
                <Text fontSize="sm" color="gray.600" textAlign="center">
                  All items have been delivered. The trade participants can now review and complete the trade.
                </Text>
              </VStack>
            </CardBody>
          </Card>
        )}

        {/* Navigation Buttons */}
        <HStack spacing={2} w="full">
          <Button
            flex={1}
            size="sm"
            variant="outline"
            colorScheme="brand"
            onClick={() => navigate('/rider')}
          >
            Back to Jobs
          </Button>
          <Button
            flex={1}
            size="sm"
            variant="outline"
            colorScheme="brand"
            onClick={() => navigate('/remittance-ledger')}
          >
            Remittance
          </Button>
        </HStack>
      </VStack>
    </Box>
  )
}

export default TaskStepper
