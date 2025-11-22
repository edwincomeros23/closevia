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
  Spinner,
  Center,
  useToast,
  Tooltip,
  Flex,
  Progress,
  Tag,
  TagLabel,
} from '@chakra-ui/react'
import { FaMapMarkerAlt, FaClock, FaBox, FaMoneyBillWave, FaStar, FaWifi, FaWifiSlash } from 'react-icons/fa'
import { InfoIcon, WarningIcon } from '@chakra-ui/icons'

interface BatchCluster {
  id: string
  taskCount: number
  sizePoints: number
  maxCapacity: number
  estimatedEarnings: number
  requiredPass: string
  passValidity: string
  distance: string
  estimatedTime: string
  zone: string
  isHighDemand: boolean
  pickupCount: number
  deliveryCount: number
  systemFee: number
}

const RiderQueue: React.FC = () => {
  const navigate = useNavigate()
  const toast = useToast()
  const [isOnline, setIsOnline] = useState(true)
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null)
  const [batches, setBatches] = useState<BatchCluster[]>([
    {
      id: 'batch-001',
      taskCount: 4,
      sizePoints: 7,
      maxCapacity: 12,
      estimatedEarnings: 450,
      requiredPass: 'Standard',
      passValidity: '25 days left',
      distance: '2.3 km',
      estimatedTime: '28 min',
      zone: 'BGC',
      isHighDemand: true,
      pickupCount: 2,
      deliveryCount: 2,
      systemFee: 45,
    },
    {
      id: 'batch-002',
      taskCount: 3,
      sizePoints: 5,
      maxCapacity: 12,
      estimatedEarnings: 320,
      requiredPass: 'Standard',
      passValidity: '15 days left',
      distance: '1.8 km',
      estimatedTime: '22 min',
      zone: 'Makati',
      isHighDemand: false,
      pickupCount: 1,
      deliveryCount: 2,
      systemFee: 32,
    },
    {
      id: 'batch-003',
      taskCount: 5,
      sizePoints: 9,
      maxCapacity: 12,
      estimatedEarnings: 600,
      requiredPass: 'Premium',
      passValidity: '40 days left',
      distance: '3.1 km',
      estimatedTime: '35 min',
      zone: 'Ortigas',
      isHighDemand: true,
      pickupCount: 2,
      deliveryCount: 3,
      systemFee: 60,
    },
  ])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleClaimBatch = (batchId: string) => {
    const batch = batches.find(b => b.id === batchId)
    if (batch) {
      navigate(`/rider/batch-preview/${batchId}`, { state: { batch } })
    }
  }

  const capacityPercentage = (sizePoints: number, maxCapacity: number) => {
    return Math.round((sizePoints / maxCapacity) * 100)
  }

  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <VStack spacing={6} align="stretch" maxW="md" mx="auto">
        {/* Header with Connection Status */}
        <HStack justify="space-between" align="center">
          <VStack align="start" spacing={0}>
            <Heading size="lg" color="brand.500">
              Available Batches
            </Heading>
            <Text fontSize="sm" color="gray.600">
              Near you, ready to claim
            </Text>
          </VStack>
          <HStack spacing={1} px={3} py={2} bg={isOnline ? 'green.50' : 'red.50'} borderRadius="lg">
            <Icon as={isOnline ? FaWifi : FaWifiSlash} color={isOnline ? 'green.600' : 'red.600'} />
            <Text fontSize="xs" fontWeight="bold" color={isOnline ? 'green.700' : 'red.700'}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </HStack>
        </HStack>

        {/* Filter/Sort Bar */}
        <HStack spacing={2} justify="space-between">
          <Badge colorScheme="purple" px={3} py={1.5}>
            📍 BGC • 2.3 km away
          </Badge>
          <Button size="sm" variant="outline" colorScheme="brand">
            Filter
          </Button>
        </HStack>

        {/* Batches List */}
        <VStack spacing={4} align="stretch">
          {batches.map((batch) => (
            <Card
              key={batch.id}
              bg="white"
              border="1px"
              borderColor="gray.200"
              cursor="pointer"
              transition="all 0.2s"
              _hover={{ shadow: 'md', borderColor: 'brand.400' }}
              onClick={() => setSelectedBatch(batch.id)}
            >
              <CardBody spacing={4}>
                {/* Top Row: Zone + High Demand Badge */}
                <HStack justify="space-between" align="start">
                  <VStack align="start" spacing={1}>
                    <HStack spacing={2}>
                      <Text fontWeight="bold" fontSize="md" color="gray.800">
                        {batch.taskCount} tasks
                      </Text>
                      {batch.isHighDemand && (
                        <Badge colorScheme="orange" fontSize="xs">
                          🔥 High Demand
                        </Badge>
                      )}
                    </HStack>
                    <Text fontSize="sm" color="gray.600">
                      {batch.zone} zone
                    </Text>
                  </VStack>
                  <VStack align="end" spacing={0}>
                    <Text fontWeight="bold" fontSize="lg" color="brand.600">
                      ₱{batch.estimatedEarnings}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      your earn
                    </Text>
                  </VStack>
                </HStack>

                {/* Capacity Progress */}
                <VStack spacing={1} align="stretch">
                  <HStack justify="space-between" fontSize="xs">
                    <HStack spacing={1}>
                      <Icon as={FaBox} boxSize={3} color="gray.600" />
                      <Text color="gray.600">
                        Capacity: {batch.sizePoints}/{batch.maxCapacity} points
                      </Text>
                      <Tooltip label="Small item=1pt, Medium=2pts, Large=3pts. Your van holds 12pts max." placement="top">
                        <InfoIcon boxSize={3} color="blue.500" cursor="help" />
                      </Tooltip>
                    </HStack>
                  </HStack>
                  <Progress
                    value={capacityPercentage(batch.sizePoints, batch.maxCapacity)}
                    colorScheme="brand"
                    borderRadius="full"
                    h="6px"
                  />
                </VStack>

                {/* Distance + Time */}
                <HStack spacing={4} fontSize="sm">
                  <HStack spacing={1}>
                    <Icon as={FaMapMarkerAlt} color="red.500" boxSize={4} />
                    <Text color="gray.700">{batch.distance}</Text>
                  </HStack>
                  <HStack spacing={1}>
                    <Icon as={FaClock} color="blue.500" boxSize={4} />
                    <Text color="gray.700">~{batch.estimatedTime}</Text>
                  </HStack>
                </HStack>

                {/* Pickups + Deliveries */}
                <HStack spacing={3} fontSize="xs" color="gray.600">
                  <Tag size="sm" colorScheme="blue" variant="subtle">
                    <TagLabel>📍 {batch.pickupCount} pickup(s)</TagLabel>
                  </Tag>
                  <Tag size="sm" colorScheme="green" variant="subtle">
                    <TagLabel>✓ {batch.deliveryCount} delivery(s)</TagLabel>
                  </Tag>
                </HStack>

                {/* Required Pass */}
                <HStack spacing={2} bg="yellow.50" p={2} borderRadius="md">
                  <Icon as={WarningIcon} boxSize={4} color="yellow.600" />
                  <VStack align="start" spacing={0} fontSize="xs">
                    <Text fontWeight="bold" color="yellow.900">
                      {batch.requiredPass} Pass needed
                    </Text>
                    <Text color="yellow.800">{batch.passValidity}</Text>
                  </VStack>
                </HStack>

                {/* Claim Button */}
                <Button
                  w="full"
                  colorScheme="brand"
                  size="md"
                  onClick={() => handleClaimBatch(batch.id)}
                  isDisabled={!isOnline}
                >
                  {isOnline ? 'Claim batch (15m lock)' : 'Offline - Reconnect to claim'}
                </Button>
              </CardBody>
            </Card>
          ))}
        </VStack>

        {/* Empty State */}
        {batches.length === 0 && (
          <Center py={12}>
            <VStack spacing={3} textAlign="center">
              <Spinner size="lg" color="brand.500" />
              <Text color="gray.600">Looking for batches near you...</Text>
            </VStack>
          </Center>
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
            📋 My Jobs
          </Button>
          <Button
            flex={1}
            size="sm"
            variant="outline"
            colorScheme="brand"
            onClick={() => navigate('/remittance-ledger')}
          >
            💰 Remittance
          </Button>
        </HStack>
      </VStack>
    </Box>
  )
}

export default RiderQueue
