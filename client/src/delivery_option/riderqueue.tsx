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
  Progress,
  Tag,
  TagLabel,
} from '@chakra-ui/react'
import { FaMapMarkerAlt, FaClock, FaBox, FaWifi } from 'react-icons/fa'
import { InfoIcon, WarningIcon } from '@chakra-ui/icons'
import { api } from '../services/api'
import { Delivery } from '../types'

const RiderQueue: React.FC = () => {
  const navigate = useNavigate()
  const toast = useToast()
  const [isOnline, setIsOnline] = useState(true)
  const [loading, setLoading] = useState(true)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [claiming, setClaiming] = useState<number | null>(null)

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

  const fetchAvailableDeliveries = async () => {
    try {
      const response = await api.get('/api/deliveries/available')
      setDeliveries(response.data?.data || [])
    } catch (error) {
      console.error('Failed to load deliveries:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAvailableDeliveries()
    const interval = setInterval(fetchAvailableDeliveries, 15000)
    return () => clearInterval(interval)
  }, [])

  const handleClaimDelivery = async (deliveryId: number) => {
    setClaiming(deliveryId)
    try {
      await api.post(`/api/deliveries/${deliveryId}/claim`)
      toast({
        title: 'Delivery Claimed!',
        description: 'Navigate to the task stepper to start.',
        status: 'success',
        duration: 3000,
      })
      navigate(`/task-stepper/${deliveryId}`)
    } catch (error: any) {
      const errMsg = error?.response?.data?.error || 'Failed to claim delivery'
      toast({
        title: 'Error',
        description: errMsg,
        status: 'error',
        duration: 3000,
      })
    } finally {
      setClaiming(null)
    }
  }

  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <VStack spacing={6} align="stretch" maxW="md" mx="auto">
        {/* Header with Connection Status */}
        <HStack justify="space-between" align="center">
          <VStack align="start" spacing={0}>
            <Heading size="lg" color="brand.500">
              Available Deliveries
            </Heading>
            <Text fontSize="sm" color="gray.600">
              {deliveries.length} deliveries available
            </Text>
          </VStack>
          <HStack spacing={1} px={3} py={2} bg={isOnline ? 'green.50' : 'red.50'} borderRadius="lg">
            <Icon as={isOnline ? FaWifi : WarningIcon} color={isOnline ? 'green.600' : 'red.600'} />
            <Text fontSize="xs" fontWeight="bold" color={isOnline ? 'green.700' : 'red.700'}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </HStack>
        </HStack>

        {/* Loading State */}
        {loading && (
          <Center py={12}>
            <VStack spacing={3} textAlign="center">
              <Spinner size="lg" color="brand.500" />
              <Text color="gray.600">Loading available deliveries...</Text>
            </VStack>
          </Center>
        )}

        {/* Deliveries List */}
        {!loading && (
          <VStack spacing={4} align="stretch">
            {deliveries.map((d) => (
              <Card
                key={d.id}
                bg="white"
                border="1px"
                borderColor="gray.200"
                transition="all 0.2s"
                _hover={{ shadow: 'md', borderColor: 'brand.400' }}
              >
                <CardBody>
                  <VStack spacing={4} align="stretch">
                    {/* Top Row */}
                    <HStack justify="space-between" align="start">
                      <VStack align="start" spacing={1}>
                        <HStack spacing={2}>
                          <Badge colorScheme={d.delivery_type === 'express' ? 'purple' : 'blue'} fontSize="xs">
                            {d.delivery_type === 'express' ? 'Express' : 'Standard'}
                          </Badge>
                          {d.is_fragile && (
                            <Badge colorScheme="red" fontSize="xs">Fragile</Badge>
                          )}
                          {d.trade_id && (
                            <Badge colorScheme="green" fontSize="xs">Trade #{d.trade_id}</Badge>
                          )}
                        </HStack>
                        <Text fontWeight="bold" fontSize="sm" color="gray.800">
                          {d.item_count} item(s) - {d.items?.[0]?.product_name || 'Delivery'}
                        </Text>
                      </VStack>
                      <VStack align="end" spacing={0}>
                        <Text fontWeight="bold" fontSize="lg" color="brand.600">
                          P{d.total_cost}
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          earnings
                        </Text>
                      </VStack>
                    </HStack>

                    {/* Pickup & Delivery Addresses */}
                    <VStack spacing={2} align="stretch" fontSize="sm">
                      <HStack spacing={2}>
                        <Badge colorScheme="blue" fontSize="2xs">FROM</Badge>
                        <Text color="gray.700" noOfLines={1}>{d.pickup_address}</Text>
                      </HStack>
                      <HStack spacing={2}>
                        <Badge colorScheme="green" fontSize="2xs">TO</Badge>
                        <Text color="gray.700" noOfLines={1}>{d.delivery_address}</Text>
                      </HStack>
                    </VStack>

                    {/* Stats */}
                    <HStack spacing={4} fontSize="sm">
                      <HStack spacing={1}>
                        <Icon as={FaBox} color="gray.600" boxSize={4} />
                        <Text color="gray.700">{d.item_count} items</Text>
                      </HStack>
                      {d.user_name && (
                        <HStack spacing={1}>
                          <Text fontSize="xs" color="gray.500">Sender: {d.user_name}</Text>
                        </HStack>
                      )}
                    </HStack>

                    {/* Claim Button */}
                    <Button
                      w="full"
                      colorScheme="brand"
                      size="md"
                      onClick={() => handleClaimDelivery(d.id)}
                      isDisabled={!isOnline || claiming !== null}
                      isLoading={claiming === d.id}
                      loadingText="Claiming..."
                    >
                      {isOnline ? 'Claim Delivery' : 'Offline - Reconnect to claim'}
                    </Button>
                  </VStack>
                </CardBody>
              </Card>
            ))}
          </VStack>
        )}

        {/* Empty State */}
        {!loading && deliveries.length === 0 && (
          <Center py={12}>
            <VStack spacing={3} textAlign="center">
              <Text color="gray.600">No available deliveries right now.</Text>
              <Text fontSize="sm" color="gray.400">Check back soon or refresh.</Text>
              <Button size="sm" colorScheme="brand" variant="outline" onClick={fetchAvailableDeliveries}>
                Refresh
              </Button>
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
            My Jobs
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

export default RiderQueue
