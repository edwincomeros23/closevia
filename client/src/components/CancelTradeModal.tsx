import React, { useState } from 'react'
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  Select,
  Textarea,
  VStack,
  Alert,
  AlertIcon,
  AlertDescription,
  Text,
  useToast,
} from '@chakra-ui/react'
import { api } from '../services/api'

export const CANCEL_REASONS: { value: string; label: string }[] = [
  { value: 'changed_mind', label: 'Changed my mind' },
  { value: 'unresponsive_party', label: 'Other party is unresponsive' },
  { value: 'better_deal', label: 'Found a better deal' },
  { value: 'safety_concern', label: 'Safety concern' },
  { value: 'no_longer_available', label: 'Product no longer available' },
  { value: 'other', label: 'Other' },
]

interface CancelTradeModalProps {
  isOpen: boolean
  onClose: () => void
  tradeId: number
  isOngoing: boolean
  onCancelled?: () => void
}

const CancelTradeModal: React.FC<CancelTradeModalProps> = ({
  isOpen,
  onClose,
  tradeId,
  isOngoing,
  onCancelled,
}) => {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  const reset = () => {
    setReason('')
    setDetails('')
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    if (!reason) {
      toast({
        title: 'Please select a reason',
        status: 'warning',
        duration: 2500,
      })
      return
    }
    if (reason === 'other' && !details.trim()) {
      toast({
        title: 'Please describe your reason',
        status: 'warning',
        duration: 2500,
      })
      return
    }

    const reasonLabel =
      CANCEL_REASONS.find((r) => r.value === reason)?.label || reason
    const cancellationReason =
      reason === 'other' ? details.trim() : details.trim()
        ? `${reasonLabel}: ${details.trim()}`
        : reasonLabel

    try {
      setSubmitting(true)
      await api.put(`/api/trades/${tradeId}`, {
        action: 'cancel',
        cancellation_reason: cancellationReason,
      })
      toast({
        title: 'Trade cancelled',
        description: isOngoing
          ? 'A strike was added to your account for cancelling an ongoing trade.'
          : 'The trade has been cancelled.',
        status: isOngoing ? 'warning' : 'info',
        duration: 4000,
      })
      reset()
      onCancelled?.()
      onClose()
    } catch (err: any) {
      toast({
        title: 'Failed to cancel trade',
        description: err?.response?.data?.error || 'Please try again.',
        status: 'error',
        duration: 3500,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="md">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent>
        <ModalHeader>Cancel this trade?</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            {isOngoing ? (
              <Alert status="warning" borderRadius="md">
                <AlertIcon />
                <AlertDescription fontSize="sm">
                  This trade is already in progress. Cancelling now will add a
                  strike to your account and reduce your trust score. 3 strikes
                  within 30 days will suspend your account.
                </AlertDescription>
              </Alert>
            ) : (
              <Text fontSize="sm" color="gray.600">
                Cancelling repeatedly can reduce your trust score. Please pick a
                reason so the other party knows what happened.
              </Text>
            )}

            <FormControl isRequired>
              <FormLabel>Reason</FormLabel>
              <Select
                placeholder="-- Select a reason --"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {CANCEL_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired={reason === 'other'}>
              <FormLabel>
                {reason === 'other' ? 'Describe your reason' : 'Details (optional)'}
              </FormLabel>
              <Textarea
                placeholder="Add any context for the other party..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={handleClose} isDisabled={submitting}>
            Keep Trade
          </Button>
          <Button colorScheme="red" onClick={handleSubmit} isLoading={submitting}>
            Cancel Trade
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default CancelTradeModal
