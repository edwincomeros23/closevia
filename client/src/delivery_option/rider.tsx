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
  Tooltip,
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
} from '@chakra-ui/react'
import { FaMapMarkerAlt, FaClock, FaBox, FaMoneyBillWave, FaCheckCircle, FaCar, FaMotorcycle, FaStar } from 'react-icons/fa'
import { InfoIcon, WarningIcon, CheckCircleIcon } from '@chakra-ui/icons'

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
}

interface Rider {
  id: number
  name: string
  rating: number
  vehicle: string
  eta_pickup: string
  eta_delivery: string
}

const RiderJobs: React.FC = () => {
  const navigate = useNavigate()
  const toast = useToast()
  const { isOpen, onOpen, onClose } = useDisclosure()

  const [pendingJobs, setPendingJobs] = useState<DeliveryJob[]>([
    {
      id: 'job-001',
      tradeId: 'trade-101',
      itemType: 'Electronics',
      deliveryType: 'express',
      distance: '2.1 km',
      distanceKm: 2.1,
      fee: 60,
      pickupWindow: '10:00 - 11:00 AM',
      status: 'pending',
      sender: 'Juan Dela Cruz',
      recipient: 'Maria Santos',
      pickupLocation: '123 Makati Ave',
      dropoffLocation: '456 Paseo de Roxas',
      itemCount: 1,
      isFragile: true,
    },
    {
      id: 'job-002',
      tradeId: 'trade-102',
      itemType: 'Books',
      deliveryType: 'standard',
      distance: '1.8 km',
      distanceKm: 1.8,
      fee: 30,
      pickupWindow: '11:00 - 12:00 PM',
      status: 'pending',
      sender: 'Robert Wong',
      recipient: 'Ana Reyes',
      pickupLocation: '789 BGC',
      dropoffLocation: '321 Ortigas',
      itemCount: 3,
      isFragile: false,
    },
    {
      id: 'job-003',
      tradeId: 'trade-103',
      itemType: 'Clothing',
      deliveryType: 'standard',
      distance: '1.5 km',
      distanceKm: 1.5,
      fee: 30,
      pickupWindow: '11:30 - 12:30 PM',
      status: 'pending',
      sender: 'Lisa Chen',
      recipient: 'Carlos Martinez',
      pickupLocation: '555 Makati Central',
      dropoffLocation: '888 BGC Tower',
      itemCount: 2,
      isFragile: false,
    },
    {
      id: 'job-004',
      tradeId: 'trade-104',
      itemType: 'Artwork',
      deliveryType: 'express',
      distance: '3.2 km',
      distanceKm: 3.2,
      fee: 60,
      pickupWindow: '2:00 - 3:00 PM',
      status: 'pending',
      sender: 'Sofia Reyes',
      recipient: 'David Kim',
      pickupLocation: '999 Pasig Ave',
      dropoffLocation: '222 Taguig Boulevard',
      itemCount: 1,
      isFragile: true,
    },
  ])

  const [claimedBatches, setClaimedBatches] = useState<ClaimedBatch[]>([])
  const [selectedJob, setSelectedJob] = useState<DeliveryJob | null>(null)
  const [suggestedBatch, setSuggestedBatch] = useState<DeliveryJob[]>([])
  
  // Add assigned rider to claimed batches
  const [batchRiders, setBatchRiders] = useState<{ [batchId: string]: Rider }>({})

  const handleAcceptDelivery = (job: DeliveryJob) => {
    // Check if rider has an active batch that hasn't been completed
    if (claimedBatches.length > 0) {
      const hasActiveBatch = claimedBatches.some(batch => {
        const batchJobs = batch.jobs
        const allCompleted = batchJobs.every(j => j.status === 'delivered')
        return !allCompleted
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
      // Express: exclusive single-item
      setSuggestedBatch([job])
    } else {
      // Standard: auto-group nearby jobs (max 5 items)
      const nearbyStandardJobs = pendingJobs.filter(
        j =>
          j.deliveryType === 'standard' &&
          j.status === 'pending' &&
          j.distanceKm <= parseFloat(job.distance) + 1
      )
      setSuggestedBatch(nearbyStandardJobs.slice(0, 5))
    }

    onOpen()
  }

  const handleConfirmBatch = async () => {
    if (!selectedJob || suggestedBatch.length === 0) return

    try {
      // Create batch
      const batchId = `batch-${Date.now()}`
      const totalEarnings = suggestedBatch.reduce((sum, job) => sum + job.fee, 0)
      const totalDistance = `${suggestedBatch.reduce((sum, job) => sum + job.distanceKm, 0).toFixed(1)} km`

      const newBatch: ClaimedBatch = {
        batchId,
        type: selectedJob.deliveryType,
        jobs: suggestedBatch,
        totalEarnings,
        totalDistance,
        createdAt: new Date().toISOString(),
      }

      // Assign a random rider to the batch
      const riders: Rider[] = [
        { id: 1, name: 'John Reyes', rating: 4.9, vehicle: 'Motorcycle', eta_pickup: '5 min', eta_delivery: '20 min' },
        { id: 2, name: 'Maria Santos', rating: 4.8, vehicle: 'Van', eta_pickup: '8 min', eta_delivery: '25 min' },
        { id: 3, name: 'Alex Torres', rating: 4.7, vehicle: 'Car', eta_pickup: '10 min', eta_delivery: '30 min' },
      ]
      
      const assignedRider = riders[Math.floor(Math.random() * riders.length)]
      setBatchRiders(prev => ({ ...prev, [batchId]: assignedRider }))

      setClaimedBatches([...claimedBatches, newBatch])

      // Update job statuses
      setPendingJobs(prevJobs =>
        prevJobs.map(job =>
          suggestedBatch.find(j => j.id === job.id)
            ? { ...job, status: 'claimed', claimedBy: batchId }
            : job
        )
      )

      toast({
        title: selectedJob.deliveryType === 'express' ? '✓ Express Job Claimed!' : '✓ Batch Claimed!',
        description:
          selectedJob.deliveryType === 'express'
            ? `Single-item delivery claimed. Rider: ${assignedRider.name}`
            : `${suggestedBatch.length} job(s) claimed. Rider: ${assignedRider.name}`,
        status: 'success',
        duration: 3000,
      })

      navigate(`/task-stepper/${batchId}`)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to claim delivery',
        status: 'error',
        duration: 2000,
      })
    } finally {
      onClose()
    }
  }

  const getDeliveryIcon = (type: 'standard' | 'express') =>
    type === 'express' ? <FaMotorcycle /> : <FaCar />

  const getDeliveryColor = (type: 'standard' | 'express') =>
    type === 'express' ? 'purple' : 'blue'

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
                                  {job.deliveryType === 'express' ? '⭐ Express' : '💰 Standard'}
                                </Badge>
                                {job.isFragile && (
                                  <Badge fontSize="2xs" colorScheme="red">
                                    🔴 Fragile
                                  </Badge>
                                )}
                              </HStack>
                              <Text fontWeight="bold" fontSize="sm" color="gray.800">
                                {job.itemType}
                              </Text>
                            </VStack>
                            <Text fontWeight="bold" color="brand.600">
                              ₱{job.fee}
                            </Text>
                          </HStack>

                          {/* Details Grid */}
                          <SimpleGrid columns={2} spacing={2} fontSize="xs">
                            <HStack spacing={1}>
                              <Icon as={FaMapMarkerAlt} color="red.500" boxSize={3} />
                              <Text color="gray.600">{job.distance}</Text>
                            </HStack>
                            <HStack spacing={1}>
                              <Icon as={FaClock} color="blue.500" boxSize={3} />
                              <Text color="gray.600">{job.pickupWindow}</Text>
                            </HStack>
                            <HStack spacing={1}>
                              <Icon as={FaBox} color="gray.600" boxSize={3} />
                              <Text color="gray.600">{job.itemCount} item(s)</Text>
                            </HStack>
                            <Text color="gray.600" fontSize="xs">
                              {job.sender}
                            </Text>
                          </SimpleGrid>

                          {/* Accept Button */}
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
                  const rider = batchRiders[batch.batchId]
                  const allCompleted = batch.jobs.every(j => j.status === 'delivered')
                  
                  return (
                    <Card key={batch.batchId} bg={allCompleted ? "gray.50" : "green.50"} border="2px" borderColor={allCompleted ? "gray.200" : "green.200"}>
                      <CardBody p={3}>
                        <VStack spacing={3} align="stretch">
                          {/* Batch Header */}
                          <HStack justify="space-between" align="start">
                            <VStack align="start" spacing={0}>
                              <Badge colorScheme={batch.type === 'express' ? 'purple' : 'blue'}>
                                {batch.type === 'express' ? 'Express' : 'Standard Batch'}
                              </Badge>
                              <Text fontWeight="bold" fontSize="sm">
                                {batch.jobs.length} job(s)
                              </Text>
                            </VStack>
                            <VStack align="end" spacing={0}>
                              <Text fontWeight="bold" color="green.600">
                                ₱{batch.totalEarnings}
                              </Text>
                              <Text fontSize="2xs" color="gray.600">
                                {batch.totalDistance}
                              </Text>
                            </VStack>
                          </HStack>

                          {/* Assigned Rider Info */}
                          {rider && (
                            <Card bg="white" border="1px" borderColor="gray.200">
                              <CardBody p={2}>
                                <VStack spacing={2} align="stretch">
                                  <HStack justify="space-between">
                                    <Text fontSize="xs" fontWeight="bold" color="gray.600">ASSIGNED RIDER</Text>
                                    <Badge colorScheme="green" fontSize="2xs">Confirmed</Badge>
                                  </HStack>
                                  
                                  <HStack justify="space-between" fontSize="sm">
                                    <VStack align="start" spacing={0}>
                                      <Text fontWeight="bold" color="gray.800">{rider.name}</Text>
                                      <Text fontSize="xs" color="gray.600">{rider.vehicle}</Text>
                                    </VStack>
                                    <HStack spacing={1}>
                                      <Icon as={FaStar} color="yellow.400" boxSize={3} />
                                      <Text fontWeight="bold" fontSize="sm">{rider.rating}</Text>
                                    </HStack>
                                  </HStack>

                                  <Divider my={1} />

                                  {/* ETA Info */}
                                  <HStack spacing={3} fontSize="xs">
                                    <VStack spacing={0} align="start">
                                      <Text color="gray.600">Pickup ETA</Text>
                                      <Text fontWeight="bold" color="brand.600">{rider.eta_pickup}</Text>
                                    </VStack>
                                    <Box w="1" h="8" bg="gray.300" />
                                    <VStack spacing={0} align="start">
                                      <Text color="gray.600">Delivery ETA</Text>
                                      <Text fontWeight="bold" color="brand.600">{rider.eta_delivery}</Text>
                                    </VStack>
                                  </HStack>
                                </VStack>
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
                                  {job.sender} → {job.recipient}
                                </Text>
                                <Badge colorScheme={job.status === 'delivered' ? 'green' : 'yellow'} fontSize="2xs">
                                  {job.status === 'delivered' ? '✓ Done' : 'Pending'}
                                </Badge>
                              </HStack>
                            ))}
                          </VStack>

                          <Button
                            size="sm"
                            colorScheme={allCompleted ? "gray" : "green"}
                            variant="solid"
                            w="full"
                            onClick={() => navigate(`/task-stepper/${batch.batchId}`)}
                          >
                            {allCompleted ? '✓ Completed' : 'Continue Delivery'}
                          </Button>
                        </VStack>
                      </CardBody>
                    </Card>
                  )
                })}

                {claimedBatches.length === 0 && (
                  <Text textAlign="center" color="gray.500" py={6}>
                    No claimed batches yet
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
            📍 Batches
          </Button>
          <Button
            flex={1}
            size="sm"
            colorScheme="brand"
            onClick={() => navigate('/remittance-ledger')}
          >
            💰 Earnings
          </Button>
        </HStack>
      </VStack>

      {/* Batch Preview Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="sm" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader fontSize="md">
            {selectedJob?.deliveryType === 'express' ? '✓ Claim Express Job?' : 'Claim Batch?'}
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
                        ₱{suggestedBatch.reduce((sum, j) => sum + j.fee, 0)}
                      </Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text color="gray.600">Distance:</Text>
                      <Text fontWeight="bold">
                        {suggestedBatch.reduce((sum, j) => sum + j.distanceKm, 0).toFixed(1)} km
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
                        {job.itemType} • {job.sender}
                      </Text>
                      <Text fontWeight="bold">₱{job.fee}</Text>
                    </HStack>
                  ))}
                </VStack>
              )}

              {/* Risk Info */}
              {selectedJob?.deliveryType === 'standard' && (
                <HStack spacing={2} p={2} bg="blue.50" borderRadius="md">
                  <InfoIcon boxSize={4} color="blue.600" />
                  <Text fontSize="xs" color="blue.900">
                    Shared batch: slight risk of minor damage from batch handling
                  </Text>
                </HStack>
              )}

              {selectedJob?.deliveryType === 'express' && (
                <HStack spacing={2} p={2} bg="purple.50" borderRadius="md">
                  <InfoIcon boxSize={4} color="purple.600" />
                  <Text fontSize="xs" color="purple.900">
                    Single-item exclusive: minimal risk, dedicated handling
                  </Text>
                </HStack>
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
              <Button colorScheme="brand" flex={1} onClick={handleConfirmBatch}>
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
