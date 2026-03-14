import React, { useState, useEffect } from 'react'
import {
  Button,
  HStack,
  VStack,
  Text,
  Spinner,
  Icon,
  useToast,
  Box,
  Badge,
  Tooltip,
} from '@chakra-ui/react'
import { CheckIcon, CloseIcon } from '@chakra-ui/icons'
import { useAuth } from '../contexts/AuthContext'
import { useTradeCompletion } from '../hooks/useTradeCompletion'

interface TradeCompletionStatusProps {
  tradeId: number
  initialBuyerCompleted?: boolean
  initialSellerCompleted?: boolean
  initialStatus?: 'active' | 'completed'
  buyerId: number
  sellerId: number
  onTradeCompleted?: () => void
}

const TradeCompletionStatus: React.FC<TradeCompletionStatusProps> = ({
  tradeId,
  initialBuyerCompleted = false,
  initialSellerCompleted = false,
  initialStatus = 'active',
  buyerId,
  sellerId,
  onTradeCompleted,
}) => {
  const { user } = useAuth()
  const toast = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [buyerCompleted, setBuyerCompleted] = useState(initialBuyerCompleted)
  const [sellerCompleted, setSellerCompleted] = useState(initialSellerCompleted)
  const [tradeStatus, setTradeStatus] = useState<'active' | 'completed'>(initialStatus)
  const [isPolling, setIsPolling] = useState(false)

  const { completeTrade, pollTradeStatus, startPolling, stopPolling } = useTradeCompletion({
    tradeId,
    onStatusChange: (state) => {
      setBuyerCompleted(state.buyerCompleted)
      setSellerCompleted(state.sellerCompleted)
      setTradeStatus(state.status)

      // Stop polling when both completed
      if (state.buyerCompleted && state.sellerCompleted) {
        stopPolling()
        setIsPolling(false)
        onTradeCompleted?.()
      }
    },
  })

  const isCurrentUserBuyer = user?.id === buyerId
  const isCurrentUserSeller = user?.id === sellerId
  const currentUserCompleted = isCurrentUserBuyer ? buyerCompleted : sellerCompleted
  const otherUserCompleted = isCurrentUserBuyer ? sellerCompleted : buyerCompleted
  const otherUserName = isCurrentUserBuyer ? 'Trader' : 'Buyer'

  const handleCompleteClick = async () => {
    setIsSubmitting(true)
    try {
      await completeTrade()
      
      // Start polling to see when other user completes
      setIsPolling(true)
      startPolling(2000) // Poll every 2 seconds

      toast({
        title: 'Trade Marked Complete',
        description: `You've marked this trade as complete. Waiting for ${otherUserName} to confirm...`,
        status: 'info',
        duration: 3000,
        isClosable: true,
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to complete trade',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // If trade is already completed, don't show completion section
  if (tradeStatus === 'completed') {
    return (
      <Box
        bg="green.50"
        border="2px"
        borderColor="green.500"
        borderRadius="lg"
        p={4}
        textAlign="center"
      >
        <HStack justify="center" spacing={2}>
          <Icon as={CheckIcon} boxSize={5} color="green.500" />
          <VStack spacing={0} align="start">
            <Text fontWeight="bold" color="green.700">
              Trade Completed
            </Text>
            <Text fontSize="sm" color="green.600">
              Both parties have confirmed the trade
            </Text>
          </VStack>
        </HStack>
      </Box>
    )
  }

  return (
    <Box bg="white" border="1px" borderColor="gray.200" borderRadius="lg" p={4}>
      <VStack spacing={4} align="stretch">
        {/* Status Display */}
        <Box>
          <Text fontSize="sm" fontWeight="bold" mb={2} color="gray.700">
            Trade Completion Status
          </Text>
          <HStack spacing={4}>
            {/* Your Status */}
            <VStack spacing={1} flex={1}>
              <Text fontSize="xs" color="gray.600">
                Your Status
              </Text>
              <HStack>
                {currentUserCompleted ? (
                  <>
                    <Icon as={CheckIcon} boxSize={5} color="green.500" />
                    <Text fontWeight="bold" color="green.600">
                      Completed
                    </Text>
                  </>
                ) : (
                  <>
                    <Icon as={CloseIcon} boxSize={4} color="gray.400" />
                    <Text fontWeight="bold" color="gray.500">
                      Pending
                    </Text>
                  </>
                )}
              </HStack>
            </VStack>

            {/* Other User Status */}
            <VStack spacing={1} flex={1}>
              <Text fontSize="xs" color="gray.600">
                {otherUserName}'s Status
              </Text>
              <HStack>
                {otherUserCompleted ? (
                  <>
                    <Icon as={CheckIcon} boxSize={5} color="green.500" />
                    <Text fontWeight="bold" color="green.600">
                      Completed
                    </Text>
                  </>
                ) : (
                  <>
                    <Spinner size="sm" color="blue.500" />
                    <Text fontWeight="bold" color="blue.600">
                      Waiting...
                    </Text>
                  </>
                )}
              </HStack>
            </VStack>
          </HStack>
        </Box>

        {/* Action Button */}
        {!currentUserCompleted ? (
          <Tooltip label="Confirm that you've completed your part of the trade">
            <Button
              colorScheme="brand"
              size="lg"
              w="full"
              onClick={handleCompleteClick}
              isLoading={isSubmitting}
              loadingText="Marking Complete..."
            >
              ✓ Mark Trade as Complete
            </Button>
          </Tooltip>
        ) : (
          <Button
            isDisabled
            size="lg"
            w="full"
            colorScheme="green"
            leftIcon={<CheckIcon />}
          >
            ✓ You've Completed This Trade
          </Button>
        )}

        {/* Polling Indicator */}
        {isPolling && !otherUserCompleted && (
          <HStack justify="center" spacing={2}>
            <Spinner size="sm" color="blue.500" />
            <Text fontSize="sm" color="gray.600">
              Waiting for {otherUserName} to confirm...
            </Text>
          </HStack>
        )}

        {/* Info */}
        <Text fontSize="xs" color="gray.500" textAlign="center">
          This trade will be finalized once both parties confirm completion
        </Text>
      </VStack>
    </Box>
  )
}

export default TradeCompletionStatus
