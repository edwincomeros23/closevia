import React, { useState, useEffect } from 'react'
import {
  VStack,
  HStack,
  Text,
  Box,
  Badge,
  Button,
  Progress,
  Divider,
  Icon,
  Stepper,
  Step,
  StepIndicator,
  StepStatus,
  StepTitle,
  useToast,
} from '@chakra-ui/react'
import { CheckIcon, WarningIcon } from '@chakra-ui/icons'
import { BatchDelivery, Delivery } from '../types'

interface BatchProgressTrackerProps {
  batch: BatchDelivery
  deliveries: Delivery[]
  onUpdateStop?: (stopIndex: number, proofUrl: string) => Promise<void>
}

export const BatchProgressTracker: React.FC<BatchProgressTrackerProps> = ({
  batch,
  deliveries,
  onUpdateStop,
}) => {
  const toast = useToast()
  const [currentStopIndex, setCurrentStopIndex] = useState(0)
  const [completedStops, setCompletedStops] = useState<Set<number>>(new Set())
  const [isUpdating, setIsUpdating] = useState(false)

  // Calculate progress
  const totalStops = batch.optimized_route.length
  const completionPercentage = (completedStops.size / totalStops) * 100

  // Get ordered deliveries based on optimized route
  const orderedDeliveries = batch.optimized_route
    .map((id) => deliveries.find((d) => d.id === id))
    .filter(Boolean) as Delivery[]

  const currentDelivery = orderedDeliveries[currentStopIndex]

  const handleCompleteStop = async (proofUrl: string) => {
    if (!onUpdateStop || !currentDelivery) return

    try {
      setIsUpdating(true)
      await onUpdateStop(currentStopIndex, proofUrl)

      const newCompleted = new Set(completedStops)
      newCompleted.add(currentStopIndex)
      setCompletedStops(newCompleted)

      if (currentStopIndex < totalStops - 1) {
        setCurrentStopIndex(currentStopIndex + 1)
        toast({
          title: 'Stop completed!',
          description: `Moving to stop ${currentStopIndex + 2} of ${totalStops}`,
          status: 'success',
          duration: 3000,
        })
      } else {
        toast({
          title: 'Batch completed!',
          description: 'All deliveries have been completed',
          status: 'success',
          duration: 5000,
        })
      }
    } catch (error) {
      toast({
        title: 'Error updating stop',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
      })
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <VStack spacing={6} align="stretch" p={6} bg="white" borderRadius="lg" boxShadow="sm">
      {/* Header */}
      <HStack justify="space-between" align="center">
        <VStack align="start" spacing={1}>
          <Text fontSize="lg" fontWeight="bold">
            Batch #{batch.id}
          </Text>
          <Badge colorScheme={batch.status === 'in_progress' ? 'blue' : 'green'}>
            {batch.status.toUpperCase()}
          </Badge>
        </VStack>
        <VStack align="end" spacing={1} fontSize="sm">
          <Text>
            Total distance: <strong>{batch.total_distance_km.toFixed(1)}km</strong>
          </Text>
          <Text>
            Est. time: <strong>{batch.estimated_minutes}min</strong>
          </Text>
        </VStack>
      </HStack>

      <Divider />

      {/* Progress Bar */}
      <VStack align="stretch" spacing={2}>
        <HStack justify="space-between">
          <Text fontSize="sm" fontWeight="bold">
            Progress
          </Text>
          <Text fontSize="sm">
            {completedStops.size} / {totalStops} stops
          </Text>
        </HStack>
        <Progress value={completionPercentage} colorScheme="green" borderRadius="full" h={2} />
      </VStack>

      <Divider />

      {/* Route Steps */}
      <VStack align="stretch" spacing={4}>
        <Text fontSize="sm" fontWeight="bold" color="gray.600">
          Optimized Route
        </Text>

        {orderedDeliveries.map((delivery, index) => (
          <Box
            key={delivery.id}
            p={4}
            borderRadius="md"
            borderLeft="4px solid"
            borderColor={
              index === currentStopIndex
                ? 'blue.500'
                : completedStops.has(index)
                  ? 'green.500'
                  : 'gray.300'
            }
            bg={
              index === currentStopIndex
                ? 'blue.50'
                : completedStops.has(index)
                  ? 'green.50'
                  : 'gray.50'
            }
            cursor={index === currentStopIndex ? 'pointer' : 'default'}
            transition="all 0.2s"
            _hover={{
              boxShadow: index === currentStopIndex ? 'md' : 'none',
            }}
          >
            <HStack justify="space-between" mb={2}>
              <HStack spacing={3} flex={1}>
                <Box
                  w={8}
                  h={8}
                  borderRadius="full"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  bg={
                    completedStops.has(index)
                      ? 'green.500'
                      : index === currentStopIndex
                        ? 'blue.500'
                        : 'gray.300'
                  }
                  color="white"
                  fontWeight="bold"
                >
                  {completedStops.has(index) ? <CheckIcon boxSize={4} /> : index + 1}
                </Box>
                <VStack align="start" spacing={1}>
                  <Text fontWeight="bold" fontSize="sm">
                    Stop {index + 1}: {delivery.pickup_address}
                  </Text>
                  <Text fontSize="xs" color="gray.600">
                    → {delivery.delivery_address}
                  </Text>
                  {index > 0 && (
                    <Text fontSize="xs" color="gray.500">
                      {Math.random() * 2 + 1}km from previous stop
                    </Text>
                  )}
                </VStack>
              </HStack>

              {completedStops.has(index) && (
                <Badge colorScheme="green" h="fit-content">
                  Completed
                </Badge>
              )}
            </HStack>

            {/* Current Stop Actions */}
            {index === currentStopIndex && !completedStops.has(index) && (
              <Box mt={3} pt={3} borderTop="1px solid" borderColor="gray.200">
                <Button
                  size="sm"
                  colorScheme="green"
                  isLoading={isUpdating}
                  onClick={() => handleCompleteStop(`proof_${delivery.id}`)}
                >
                  Mark Completed
                </Button>
              </Box>
            )}
          </Box>
        ))}
      </VStack>

      <Divider />

      {/* Summary */}
      <Box p={4} bg="gray.50" borderRadius="md">
        <VStack align="start" spacing={2} fontSize="sm">
          <HStack justify="space-between" w="full">
            <Text>Rider commission:</Text>
            <Text fontWeight="bold">₱{batch.total_rider_commission.toFixed(2)}</Text>
          </HStack>
          <HStack justify="space-between" w="full">
            <Text>Clovia fee (15%):</Text>
            <Text fontWeight="bold">₱{batch.total_clovia_commission.toFixed(2)}</Text>
          </HStack>
        </VStack>
      </Box>

      {/* Current Delivery Details */}
      {currentDelivery && completedStops.size < totalStops && (
        <Box p={4} bg="blue.50" borderRadius="md">
          <VStack align="start" spacing={3}>
            <Text fontWeight="bold">Next Delivery Details</Text>
            <VStack align="start" fontSize="sm" spacing={1}>
              <Text>
                <strong>Pickup:</strong> {currentDelivery.pickup_address}
              </Text>
              <Text>
                <strong>Delivery:</strong> {currentDelivery.delivery_address}
              </Text>
              <Text>
                <strong>Instructions:</strong> {currentDelivery.special_instructions || 'None'}
              </Text>
              <Text>
                <strong>Cost:</strong> ₱{currentDelivery.total_cost.toFixed(2)}
              </Text>
            </VStack>
          </VStack>
        </Box>
      )}
    </VStack>
  )
}
