import React, { useState, useEffect } from 'react'
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack,
  HStack,
  Text,
  Button,
  Avatar,
  Box,
  Textarea,
  useToast,
  Spinner,
  Badge,
  Divider,
  Icon,
  Flex,
  Progress,
  Checkbox
} from '@chakra-ui/react'
import { keyframes } from '@emotion/react'
import { FaStar, FaHeart, FaThumbsUp, FaCheck, FaHandshake } from 'react-icons/fa'
import { Trade } from '../types'
import { api } from '../services/api'

interface TradeCompletionModalProps {
  trade: Trade | null
  isOpen: boolean
  onClose: () => void
  onCompleted: () => void
  currentUserId?: number
}

interface CompletionStatus {
  buyer_completed: boolean
  seller_completed: boolean
  buyer_rating?: number
  seller_rating?: number
  buyer_feedback?: string
  seller_feedback?: string
}

const fadeInAnimation = keyframes`
  0% { opacity: 0; transform: translateY(-10px); }
  100% { opacity: 1; transform: translateY(0); }
`

const TradeCompletionModal: React.FC<TradeCompletionModalProps> = ({
  trade,
  isOpen,
  onClose,
  onCompleted,
  currentUserId
}) => {
  const [status, setStatus] = useState<CompletionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [rating, setRating] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [policyAgreed, setPolicyAgreed] = useState(false)
  const [showFinishButton, setShowFinishButton] = useState(false)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const toast = useToast()

  const isUserBuyer = trade && currentUserId === trade.buyer_id
  const isUserSeller = trade && currentUserId === trade.seller_id

  useEffect(() => {
    if (trade && isOpen) {
      fetchCompletionStatus()
    }
  }, [trade, isOpen])

  const fetchCompletionStatus = async () => {
    if (!trade) return
    
    try {
      setLoading(true)
      const response = await api.get(`/api/trades/${trade.id}/completion-status`)
      setStatus(response.data.data)
      
      // Check if current user has already submitted
      if (isUserBuyer && response.data.data.buyer_completed) {
        setHasSubmitted(true)
        setRating(response.data.data.buyer_rating || 0)
        setFeedback(response.data.data.buyer_feedback || '')
      } else if (isUserSeller && response.data.data.seller_completed) {
        setHasSubmitted(true)
        setRating(response.data.data.seller_rating || 0)
        setFeedback(response.data.data.seller_feedback || '')
      }
      
      // Check if both completed for celebration
      if (response.data.data.buyer_completed && response.data.data.seller_completed) {
        setShowCelebration(true)
        setShowFinishButton(true)
      }
    } catch (error) {
      console.error('Failed to fetch completion status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitCompletion = () => {
    if (!trade) return
    setShowConfirmationModal(true)
  }

  const handleConfirmCompletion = async () => {
    if (!trade) return
    
    try {
      setSubmitting(true)
      setShowConfirmationModal(false)
      
      console.log('Submitting trade completion:', {
        tradeId: trade.id,
        rating,
        feedback: feedback.trim()
      })
      await api.put(`/api/trades/${trade.id}/complete`, {
        rating,
        feedback: feedback.trim()
      })
      
      setHasSubmitted(true)
      toast({
        title: 'Trade completion submitted!',
        description: 'Waiting for the other party to confirm...',
        status: 'success',
        duration: 3000
      })
      
      // Refresh status
      await fetchCompletionStatus()
      onCompleted()
      
      // Check if both parties completed after this submission
      const updatedRes = await api.get(`/api/trades/${trade.id}/completion-status`)
      if (updatedRes.data.data.buyer_completed && updatedRes.data.data.seller_completed) {
        setShowFinishButton(true)
      }
    } catch (error: any) {
      console.error('Trade completion error:', error)
      console.error('Error response:', error?.response?.data)
      console.error('Error status:', error?.response?.status)
      toast({
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to submit completion',
        status: 'error'
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleFinishTrade = () => {
    onClose()
    onCompleted()
  }

  const renderRatingStars = (currentRating: number, onRate?: (rating: number) => void) => (
    <HStack spacing={1}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          as={FaStar}
          color={star <= currentRating ? 'yellow.400' : 'gray.300'}
          cursor={onRate ? 'pointer' : 'default'}
          onClick={() => onRate?.(star)}
          _hover={onRate ? { transform: 'scale(1.1)' } : {}}
          transition="all 0.2s"
        />
      ))}
    </HStack>
  )

  const renderUserProfile = (
    name: string,
    userId: number,
    isCurrentUser: boolean,
    hasCompleted: boolean,
    userRating?: number
  ) => (
    <VStack spacing={3} flex={1} align="center">
      <Box position="relative">
        <Avatar
          size="xl"
          name={name}
          bg={isCurrentUser ? 'brand.500' : 'gray.500'}
          color="white"
        />
        {hasCompleted && (
          <Box
            position="absolute"
            bottom={0}
            right={0}
            bg="green.500"
            borderRadius="full"
            p={1}
          >
            <Icon as={FaCheck} color="white" boxSize={3} />
          </Box>
        )}
      </Box>
      
      <VStack spacing={1} align="center">
        <Text fontWeight="bold" fontSize="lg">
          {name} {isCurrentUser && '(You)'}
        </Text>
        <Badge
          colorScheme={hasCompleted ? 'green' : 'yellow'}
          variant="solid"
          px={3}
          py={1}
          borderRadius="full"
        >
          {hasCompleted ? 'Confirmed' : 'Pending'}
        </Badge>
        {userRating && userRating > 0 && (
          <HStack>
            <Text fontSize="sm" color="gray.600">Rating:</Text>
            {renderRatingStars(userRating)}
          </HStack>
        )}
      </VStack>
    </VStack>
  )

  const bothCompleted = status?.buyer_completed && status?.seller_completed

  if (!trade) return null

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent
        bg="white"
        borderRadius="xl"
        boxShadow="xl"
        mx={4}
        mt={0}
      >
        
        <ModalCloseButton color="white" />
        
        <ModalBody p={6}>
          {loading ? (
            <Flex justify="center" py={8}>
              <Spinner size="lg" color="brand.500" />
            </Flex>
          ) : (
            <VStack spacing={6}>
              {/* Progress Indicator */}
              <Box w="full">
                <Text fontSize="sm" color="gray.600" mb={2} textAlign="center">
                  Completion Progress
                </Text>
                <Progress
                  value={
                    status?.buyer_completed && status?.seller_completed ? 100 :
                    (status?.buyer_completed || status?.seller_completed) ? 50 : 0
                  }
                  colorScheme="green"
                  borderRadius="full"
                  bg="gray.100"
                />
              </Box>

              {/* User Profiles */}
              <HStack spacing={8} w="full" justify="center">
                {renderUserProfile(
                  trade.buyer_name || `User #${trade.buyer_id}`,
                  trade.buyer_id,
                  !!isUserBuyer,
                  !!(status?.buyer_completed),
                  status?.buyer_rating
                )}
                
                <Box>
                  <Icon
                    as={FaHandshake}
                    color={bothCompleted ? 'green.500' : 'gray.400'}
                    boxSize={8}
                  />
                </Box>
                
                {renderUserProfile(
                  trade.seller_name || `User #${trade.seller_id}`,
                  trade.seller_id,
                  !!isUserSeller,
                  !!(status?.seller_completed),
                  status?.seller_rating
                )}
              </HStack>

              <Divider />

              {/* Completion Form or Status */}
              {bothCompleted ? (
                <VStack spacing={4} w="full">
                  <Box
                    bg="green.50"
                    border="1px solid"
                    borderColor="green.200"
                    borderRadius="md"
                    p={4}
                    w="full"
                    textAlign="center"
                    animation={`${fadeInAnimation} 0.3s ease-out`}
                  >
                    <Icon as={FaCheck} color="green.500" boxSize={5} mb={2} />
                    <Text fontWeight="semibold" color="green.700" fontSize="md">
                      Trade Successfully Completed
                    </Text>
                    <Text color="green.600" fontSize="sm" mt={1}>
                      Both parties have confirmed completion
                    </Text>
                  </Box>
                  
                  {/* Finish Button */}
                  {showFinishButton && (
                    <Button
                      colorScheme="blue"
                      size="lg"
                      w="full"
                      onClick={handleFinishTrade}
                      leftIcon={<FaCheck />}
                    >
                      Finish
                    </Button>
                  )}
                  
                  {/* Show feedback if available */}
                  {(status?.buyer_feedback || status?.seller_feedback) && (
                    <VStack spacing={3} w="full">
                      <Text fontWeight="semibold">Feedback:</Text>
                      {status?.buyer_feedback && (
                        <Box bg="gray.50" p={3} borderRadius="md" w="full">
                          <Text fontSize="sm" fontWeight="medium" color="gray.700">
                            From {trade.buyer_name || `User #${trade.buyer_id}`}:
                          </Text>
                          <Text fontSize="sm" color="gray.600" mt={1}>
                            "{status.buyer_feedback}"
                          </Text>
                        </Box>
                      )}
                      {status?.seller_feedback && (
                        <Box bg="gray.50" p={3} borderRadius="md" w="full">
                          <Text fontSize="sm" fontWeight="medium" color="gray.700">
                            From {trade.seller_name || `User #${trade.seller_id}`}:
                          </Text>
                          <Text fontSize="sm" color="gray.600" mt={1}>
                            "{status.seller_feedback}"
                          </Text>
                        </Box>
                      )}
                    </VStack>
                  )}
                </VStack>
              ) : hasSubmitted ? (
                <Box
                  bg="blue.50"
                  border="2px solid"
                  borderColor="blue.200"
                  borderRadius="lg"
                  p={4}
                  w="full"
                  textAlign="center"
                >
                  <Spinner size="md" color="blue.500" mb={2} />
                  <Text fontWeight="bold" color="blue.700">
                    Waiting for confirmation...
                  </Text>
                  <Text color="blue.600" fontSize="sm" mt={1}>
                    You've confirmed the trade. Waiting for the other party to confirm.
                  </Text>
                </Box>
              ) : (
                <VStack spacing={4} w="full">
                  <Text fontWeight="semibold" textAlign="center">
                    Please rate your experience and confirm completion
                  </Text>
                  
                  <VStack spacing={3}>
                    <Text fontSize="sm" color="gray.600">Rate this trade:</Text>
                    {renderRatingStars(rating, setRating)}
                  </VStack>
                  
                  <VStack spacing={2} w="full">
                    <Text fontSize="sm" color="gray.600">
                      Leave feedback (optional):
                    </Text>
                    <Textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Share your experience with this trade..."
                      resize="none"
                      rows={3}
                    />
                  </VStack>
                  
                  <Button
                    colorScheme="green"
                    size="lg"
                    w="full"
                    onClick={handleSubmitCompletion}
                    isLoading={submitting}
                    loadingText="Confirming..."
                    leftIcon={<FaCheck />}
                    isDisabled={rating === 0 || !policyAgreed}
                  >
                    Confirm Trade Completion
                  </Button>
                  
                  <HStack spacing={3} justify="center" align="start">
                    <Checkbox 
                      isChecked={policyAgreed} 
                      onChange={(e) => setPolicyAgreed(e.target.checked)}
                      colorScheme="green"
                      size="sm"
                    />
                    <Text fontSize="xs" color="gray.500" textAlign="left" flex={1}>
                      By confirming, you acknowledge that the trade has been completed successfully
                    </Text>
                  </HStack>
                </VStack>
              )}
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>

    {/* Compact Confirmation Modal */}
    <Modal isOpen={showConfirmationModal} onClose={() => setShowConfirmationModal(false)} size="sm" isCentered>
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent
        bg="white"
        borderRadius="xl"
        boxShadow="xl"
        mx={4}
      >
        <ModalBody p={6} textAlign="center">
          <VStack spacing={4}>
            <Icon as={FaHandshake} color="blue.500" boxSize={8} />
            <VStack spacing={2}>
              <Text fontWeight="bold" fontSize="lg" color="gray.800">
                Confirm Trade Completion
              </Text>
              <Text fontSize="sm" color="gray.600" textAlign="center">
                Are you sure you want to mark this trade as completed? This action cannot be undone.
              </Text>
            </VStack>
            
            <HStack spacing={3} w="full">
              <Button
                variant="outline"
                size="md"
                flex={1}
                onClick={() => setShowConfirmationModal(false)}
                isDisabled={submitting}
              >
                Cancel
              </Button>
              <Button
                colorScheme="green"
                size="md"
                flex={1}
                onClick={handleConfirmCompletion}
                isLoading={submitting}
                loadingText="Confirming..."
                leftIcon={<FaCheck />}
              >
                Confirm
              </Button>
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
    </>
  )
}

export default TradeCompletionModal
