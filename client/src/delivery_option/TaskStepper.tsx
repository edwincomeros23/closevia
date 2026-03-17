import React, { useState, useEffect } from 'react'
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
} from '@chakra-ui/react'
import { CheckCircleIcon, WarningIcon } from '@chakra-ui/icons'
import { FaMapMarkerAlt, FaQrcode, FaCamera, FaPhone, FaSync } from 'react-icons/fa'
import { api } from '../services/api'
import { Delivery } from '../types'

// The status progression for a delivery
const STATUS_PROGRESSION: Array<Delivery['status']> = ['claimed', 'picked_up', 'in_transit', 'delivered']

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
}

const TaskStepper: React.FC = () => {
  const { batchId } = useParams() // This is actually the delivery ID
  const navigate = useNavigate()
  const toast = useToast()

  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [qrScanned, setQrScanned] = useState(false)
  const [photoCaptured, setPhotoCaptured] = useState(false)
  const [deliveryNotes, setDeliveryNotes] = useState('')

  // Fetch delivery data from API
  const fetchDelivery = async () => {
    if (!batchId) return
    try {
      const response = await api.get(`/api/deliveries/${batchId}`)
      setDelivery(response.data?.data || null)
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

  // Build task steps from the delivery data
  const buildTasks = (): Task[] => {
    if (!delivery) return []

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

  const handleQrScan = () => {
    setQrScanned(true)
    toast({
        id: "taskstepper-qr-scanned",
      title: 'QR Scanned',
      description: 'Task verified at location',
      status: 'success',
      duration: 2000,
    })
  }

  const handleCapturePhoto = () => {
    setPhotoCaptured(true)
    toast({
        id: "taskstepper-photo-saved",
      title: 'Photo Saved',
      description: 'Proof captured',
      status: 'success',
      duration: 2000,
    })
  }

  const handleCompleteTask = async () => {
    if (!delivery) return

    const nextStatus = getNextStatus()
    if (!nextStatus) {
      toast({
        id: "taskstepper-already-completed", title: 'Already completed', status: 'info', duration: 2000 })
      return
    }

    // For the final delivery step, require QR scan or notes
    if (nextStatus === 'delivered' && !qrScanned && !deliveryNotes) {
      toast({
        id: "taskstepper-missing-confirmation",
        title: 'Missing Confirmation',
        description: 'Scan QR or add delivery notes',
        status: 'warning',
        duration: 2000,
      })
      return
    }

    setUpdating(true)
    try {
      await api.put(`/api/deliveries/${delivery.id}/status`, { status: nextStatus })

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
      setDeliveryNotes('')

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
                      <Text fontWeight="bold" fontSize="sm" color="gray.800">
                        {task.type === 'pickup' ? 'Pickup' : 'Delivery'}
                      </Text>
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
                          <Button
                            colorScheme={photoCaptured ? 'green' : 'brand'}
                            leftIcon={<Icon as={FaCamera} />}
                            onClick={handleCapturePhoto}
                            w="full"
                          >
                            {photoCaptured ? 'Photo Saved' : 'Capture Photo'}
                          </Button>
                          <Text fontSize="xs" color="gray.600" textAlign="center">
                            Take photo proof for records
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
