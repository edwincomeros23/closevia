import React, { useState, useEffect } from 'react'
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
} from '@chakra-ui/react'
import { FaMapMarkerAlt, FaClock, FaBox, FaMotorcycle, FaCar, FaStar } from 'react-icons/fa'
import { InfoIcon, WarningIcon } from '@chakra-ui/icons'
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

// Map a Delivery API object to our local DeliveryJob interface
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
  const [isRider, setIsRider] = useState<boolean | null>(null)
  const [registering, setRegistering] = useState(false)

  // Check if current user is a registered rider
  const checkRiderStatus = async () => {
    try {
      const response = await api.get('/api/deliveries/rider-status')
      const data = response.data?.data
      setIsRider(data?.is_rider && data?.is_active)
    } catch {
      setIsRider(false)
    }
  }

  const handleRegisterAsRider = async () => {
    setRegistering(true)
    try {
      await api.post('/api/deliveries/register-rider', {
        vehicle_type: 'motorcycle',
        phone: 'N/A',
      })
      toast({
        title: 'Registered as Rider!',
        description: 'You can now claim deliveries.',
        status: 'success',
        duration: 3000,
      })
      setIsRider(true)
      await fetchClaimedDeliveries()
    } catch (error: any) {
      toast({
        title: 'Registration Failed',
        description: error?.response?.data?.error || 'Could not register as rider',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setRegistering(false)
    }
  }

  // Fetch available deliveries from API
  const fetchAvailableDeliveries = async () => {
    try {
      const response = await api.get('/api/deliveries/available')
      const deliveries: Delivery[] = response.data?.data || []
      const jobs = deliveries.map(mapDeliveryToJob)
      setPendingJobs(jobs)
    } catch (error) {
      console.error('Failed to load available deliveries:', error)
    }
  }

  // Fetch rider's claimed deliveries from API
  const fetchClaimedDeliveries = async () => {
    try {
      const response = await api.get('/api/deliveries/my-jobs')
      const deliveries: Delivery[] = response.data?.data || []

      // Group claimed deliveries into batches by delivery type
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
    } catch (error) {
      // Not a rider or no deliveries - that's fine
      console.log('No claimed deliveries:', error)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await checkRiderStatus()
      await Promise.all([fetchAvailableDeliveries(), fetchClaimedDeliveries()])
      setLoading(false)
    }
    loadData()

    // Poll every 15 seconds for updates
    const interval = setInterval(() => {
      fetchAvailableDeliveries()
      fetchClaimedDeliveries()
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  const handleAcceptDelivery = (job: DeliveryJob) => {
    // Check if rider has an active batch that hasn't been completed
    if (claimedBatches.length > 0) {
      const hasActiveBatch = claimedBatches.some(batch => {
        return batch.jobs.some(j => j.status !== 'delivered')
      })

      if (hasActiveBatch) {
        toast({
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
      // Standard: auto-group nearby pending jobs (max 5)
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
      // Claim each job via API
      for (const job of suggestedBatch) {
        await api.post(`/api/deliveries/${job.id}/claim`)
      }

      toast({
        title: selectedJob.deliveryType === 'express' ? 'Express Job Claimed!' : 'Batch Claimed!',
        description: `${suggestedBatch.length} delivery(s) claimed successfully.`,
        status: 'success',
        duration: 3000,
      })

      // Refresh data
      await Promise.all([fetchAvailableDeliveries(), fetchClaimedDeliveries()])

      // Navigate to task stepper for the first delivery
      navigate(`/task-stepper/${suggestedBatch[0].id}`)
    } catch (error: any) {
      const errMsg = error?.response?.data?.error || 'Failed to claim delivery'
      toast({
        title: 'Error',
        description: errMsg,
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
          <Text color="gray.500">Loading deliveries...</Text>
        </VStack>
      </Center>
    )
  }

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

        {/* Rider Registration Banner */}
        {isRider === false && (
          <Card bg="orange.50" border="2px" borderColor="orange.300" w="full">
            <CardBody p={4}>
              <VStack spacing={3}>
                <Icon as={FaMotorcycle} boxSize={8} color="orange.500" />
                <Text fontWeight="bold" fontSize="md" color="orange.800">
                  Register as a Rider
                </Text>
                <Text fontSize="sm" color="gray.600" textAlign="center">
                  You need to register as a rider to claim and deliver orders.
                </Text>
                <Button
                  colorScheme="orange"
                  size="md"
                  w="full"
                  onClick={handleRegisterAsRider}
                  isLoading={registering}
                  loadingText="Registering..."
                  leftIcon={<Icon as={FaMotorcycle} />}
                >
                  Register as Rider
                </Button>
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
                          {/* Header Row */}
                          <HStack justify="space-between" align="start">
                            <VStack align="start" spacing={0} flex={1}>
                              <HStack spacing={2}>
                                <Badge fontSize="2xs" colorScheme={getDeliveryColor(job.deliveryType)}>
                                  {job.deliveryType === 'express' ? 'Express' : 'Standard'}
                                </Badge>
                                {job.isFragile && (
                                  <Badge fontSize="2xs" colorScheme="red">
                                    Fragile
                                  </Badge>
                                )}
                              </HStack>
                              <Text fontWeight="bold" fontSize="sm" color="gray.800">
                                {job.itemType}
                              </Text>
                            </VStack>
                            <Text fontWeight="bold" color="brand.600">
                              P{job.fee}
                            </Text>
                          </HStack>

                          {/* Details Grid */}
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

                          {/* Location details */}
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

                          {/* Accept Button */}
                          <Button
                            size="sm"
                            colorScheme="brand"
                            w="full"
                            onClick={() => handleAcceptDelivery(job)}
                            isDisabled={!isRider || claimedBatches.some(b =>
                              b.jobs.some(j => j.status !== 'delivered')
                            )}
                          >
                            {!isRider ? 'Register as Rider to Claim' : 'Claim Delivery'}
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
                          {/* Batch Header */}
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
                              <Text fontWeight="bold" color="green.600">
                                P{batch.totalEarnings}
                              </Text>
                            </VStack>
                          </HStack>

                          {/* Rider Info */}
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

                          {/* Job List */}
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
          <Button
            flex={1}
            size="sm"
            colorScheme="brand"
            onClick={() => navigate('/rider-queue')}
          >
            Batches
          </Button>
          <Button
            flex={1}
            size="sm"
            colorScheme="brand"
            onClick={() => navigate('/remittance-ledger')}
          >
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
              {/* Summary */}
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

              {/* Job List */}
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

              {/* Batch Lock Warning */}
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
              <Button variant="outline" flex={1} onClick={onClose}>
                Cancel
              </Button>
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
