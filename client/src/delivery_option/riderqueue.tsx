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
  Spinner,
  Center,
  useToast,
  Alert,
  AlertIcon,
} from '@chakra-ui/react'
import { FaBox, FaWifi, FaMotorcycle, FaLock } from 'react-icons/fa'
import { WarningIcon } from '@chakra-ui/icons'
import { api } from '../services/api'
import { Delivery } from '../types'
import { useRiderState } from '../hooks/useRiderState'

const RiderQueue: React.FC = () => {
  const navigate = useNavigate()
  const toast = useToast()
  const [isOnline, setIsOnline] = useState(true)
  const [loading, setLoading] = useState(true)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [claiming, setClaiming] = useState<number | null>(null)

  // Use rider state to check permissions
  const { riderState, loading: stateLoading } = useRiderState()

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
    // Only fetch deliveries if rider has permission
    if (riderState?.permissions?.can_view_jobs) {
      fetchAvailableDeliveries()
      const interval = setInterval(fetchAvailableDeliveries, 15000)
      return () => clearInterval(interval)
    } else {
      setLoading(false)
    }
  }, [riderState?.permissions?.can_view_jobs])

  const handleClaimDelivery = async (deliveryId: number) => {
    // Double-check claim permission
    if (!riderState?.permissions?.can_claim_jobs) {
      toast({
        title: 'Cannot Claim',
        description: 'Your account is not authorized to claim deliveries.',
        status: 'error',
        duration: 3000,
      })
      return
    }

    setClaiming(deliveryId)
    try {
      await api.post(`/api/deliveries/${deliveryId}/claim`)
      toast({
        id: "riderqueue-delivery-claimed",
        title: 'Delivery Claimed!',
        description: 'Navigate to the task stepper to start.',
        status: 'success',
        duration: 3000,
      })
      navigate(`/task-stepper/${deliveryId}`)
    } catch (error: any) {
      const errMsg = error?.response?.data?.error || 'Failed to claim delivery'
      toast({
        id: "riderqueue-error",
        title: 'Error',
        description: errMsg,
        status: 'error',
        duration: 3000,
      })
    } finally {
      setClaiming(null)
    }
  }

  // Loading state for rider state check
  if (stateLoading) {
    return (
      <Center minH="100vh" bg="#FFFDF1">
        <VStack spacing={3}>
          <Spinner size="lg" color="brand.500" />
          <Text color="gray.500">Checking rider status...</Text>
        </VStack>
      </Center>
    )
  }

  // ─── NAVIGATION BLOCKING ───────────────────────────────────────────────
  // Block access if rider is not in READY or WORKING state
  const canAccessJobs = riderState?.permissions?.can_view_jobs

  if (!canAccessJobs) {
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
              <Icon as={FaLock} boxSize={12} color="red.500" />
            </Box>

            <VStack spacing={2}>
              <Heading size="lg" color="gray.800">Access Restricted</Heading>
              <Text fontSize="md" color="gray.600" maxW="sm">
                {riderState?.state === 'NOT_APPLIED'
                  ? 'You need to apply as a rider to access this page.'
                  : riderState?.state === 'PENDING_APPROVAL'
                  ? 'Your application is still under review.'
                  : riderState?.state === 'REJECTED'
                  ? 'Your application was not approved. Please reapply.'
                  : riderState?.state === 'LOCKED'
                  ? 'Your account has been suspended.'
                  : 'You are not authorized to view available deliveries.'}
              </Text>
            </VStack>

            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <Text fontSize="sm">{riderState?.message || 'Please complete your rider application first.'}</Text>
            </Alert>

            <Button
              colorScheme="brand"
              size="lg"
              onClick={() => navigate('/rider')}
              leftIcon={<Icon as={FaMotorcycle} />}
            >
              {riderState?.state === 'NOT_APPLIED' ? 'Apply as Rider' : 'Go to Rider Page'}
            </Button>
          </VStack>
        </Center>
      </Box>
    )
  }

  // ─── AUTHORIZED VIEW ───────────────────────────────────────────────────
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
                      isDisabled={!isOnline || claiming !== null || !riderState?.permissions?.can_claim_jobs}
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
            Dashboard
          </Button>
          <Button
            flex={1}
            size="sm"
            variant="outline"
            colorScheme="brand"
            onClick={() => navigate('/remittance-ledger')}
            isDisabled={!riderState?.permissions?.can_view_earnings}
          >
            Earnings
          </Button>
        </HStack>
      </VStack>
    </Box>
  )
}

export default RiderQueue
