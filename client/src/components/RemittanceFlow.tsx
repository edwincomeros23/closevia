import React, { useState } from 'react'
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  VStack,
  HStack,
  Text,
  Input,
  Select,
  FormControl,
  FormLabel,
  FormHelperText,
  Box,
  Alert,
  AlertIcon,
  Divider,
  Progress,
  Badge,
  useToast,
} from '@chakra-ui/react'
import { CheckCircleIcon } from '@chakra-ui/icons'
import { RiderSlotLedger } from '../types'

interface RemittanceFlowProps {
  isOpen: boolean
  onClose: () => void
  riderSlotLedger: RiderSlotLedger | null
  batchId?: number
  onSubmit: (amount: number, method: string, reference: string, proofUrl: string) => Promise<void>
}

export const RemittanceFlow: React.FC<RemittanceFlowProps> = ({
  isOpen,
  onClose,
  riderSlotLedger,
  batchId,
  onSubmit,
}) => {
  const toast = useToast()
  const [step, setStep] = useState<'amount' | 'payment' | 'success'>('amount')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const remittanceNeeded = riderSlotLedger?.remittance_owed || 0
  const minAmount = Math.max(1000, remittanceNeeded)
  const amountNum = parseFloat(amount) || 0
  const cloviaFee = amountNum * 0.15
  const riderTakeHome = amountNum - cloviaFee

  const isValidAmount = amountNum >= minAmount && amountNum > 0

  const handleSubmit = async () => {
    if (!isValidAmount || !reference || !proofUrl) {
      toast({
        title: 'Missing information',
        description: 'Please fill in all fields',
        status: 'warning',
        duration: 5000,
      })
      return
    }

    try {
      setIsSubmitting(true)
      await onSubmit(amountNum, paymentMethod, reference, proofUrl)
      setStep('success')
    } catch (error) {
      toast({
        title: 'Error submitting remittance',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setStep('amount')
    setAmount('')
    setPaymentMethod('cash')
    setReference('')
    setProofUrl('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Submit Cash Remittance</ModalHeader>

        <ModalBody>
          <VStack spacing={6} align="stretch">
            {/* Status */}
            {riderSlotLedger && (
              <Alert status={riderSlotLedger.is_locked_for_batching ? 'error' : 'warning'} borderRadius="md">
                <AlertIcon />
                <VStack align="start" spacing={1}>
                  <Text fontWeight="bold">
                    Remittance owed: ₱{riderSlotLedger.remittance_owed.toFixed(2)}
                  </Text>
                  <Text fontSize="sm">
                    Minimum remittance: ₱{minAmount.toFixed(2)} to unlock {riderSlotLedger.free_slots_total} new slots
                  </Text>
                </VStack>
              </Alert>
            )}

            {/* Step 1: Amount */}
            {step === 'amount' && (
              <VStack spacing={4} align="stretch">
                <FormControl isRequired>
                  <FormLabel>Remittance Amount</FormLabel>
                  <Input
                    type="number"
                    placeholder="Enter amount in pesos"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min={minAmount}
                    step="100"
                  />
                  <FormHelperText>
                    Minimum: ₱{minAmount.toFixed(2)}
                  </FormHelperText>
                </FormControl>

                {/* Preview */}
                {amountNum > 0 && (
                  <Box p={4} bg="gray.50" borderRadius="md" borderLeft="4px solid" borderColor="blue.500">
                    <VStack align="start" spacing={2} fontSize="sm">
                      <HStack justify="space-between" w="full">
                        <Text>Remittance amount:</Text>
                        <Text fontWeight="bold">₱{amountNum.toFixed(2)}</Text>
                      </HStack>
                      <HStack justify="space-between" w="full">
                        <Text color="gray.600">Clovia commission (15%):</Text>
                        <Text>₱{cloviaFee.toFixed(2)}</Text>
                      </HStack>
                      <Divider />
                      <HStack justify="space-between" w="full">
                        <Text fontWeight="bold">You receive:</Text>
                        <Text fontWeight="bold" color="green.600">₱{riderTakeHome.toFixed(2)}</Text>
                      </HStack>
                    </VStack>
                  </Box>
                )}

                <Button
                  colorScheme="blue"
                  isDisabled={!isValidAmount}
                  onClick={() => setStep('payment')}
                >
                  Continue to Payment Details
                </Button>
              </VStack>
            )}

            {/* Step 2: Payment Details */}
            {step === 'payment' && (
              <VStack spacing={4} align="stretch">
                {/* Confirm amount */}
                <Box p={3} bg="blue.50" borderRadius="md">
                  <HStack justify="space-between">
                    <Text fontWeight="bold">Remittance amount:</Text>
                    <Text fontSize="lg" fontWeight="bold" color="blue.600">
                      ₱{amountNum.toFixed(2)}
                    </Text>
                  </HStack>
                </Box>

                <FormControl isRequired>
                  <FormLabel>Payment Method</FormLabel>
                  <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="cash">Cash Pickup</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="e_wallet">E-Wallet (GCash/PayMaya)</option>
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Payment Reference</FormLabel>
                  <Input
                    placeholder={
                      paymentMethod === 'bank_transfer'
                        ? 'Bank transfer reference ID'
                        : paymentMethod === 'e_wallet'
                          ? 'GCash/PayMaya transaction ID'
                          : 'Pickup location/time'
                    }
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                  <FormHelperText>
                    {paymentMethod === 'bank_transfer' && 'Reference ID from your bank'}
                    {paymentMethod === 'e_wallet' && 'Transaction ID from GCash/PayMaya'}
                    {paymentMethod === 'cash' && 'How/where you will pick up or drop off cash'}
                  </FormHelperText>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Proof (Photo URL)</FormLabel>
                  <Input
                    placeholder="Upload proof image URL (receipt, screenshot, etc.)"
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                  />
                  <FormHelperText>
                    Upload receipt/screenshot to /api/upload, paste the URL here
                  </FormHelperText>
                </FormControl>

                <HStack justify="space-between" pt={2}>
                  <Button variant="ghost" onClick={() => setStep('amount')}>
                    Back
                  </Button>
                  <Button
                    colorScheme="green"
                    isDisabled={!reference || !proofUrl}
                    isLoading={isSubmitting}
                    onClick={handleSubmit}
                  >
                    Submit Remittance
                  </Button>
                </HStack>
              </VStack>
            )}

            {/* Step 3: Success */}
            {step === 'success' && (
              <VStack spacing={4} textAlign="center" py={4}>
                <CheckCircleIcon boxSize={16} color="green.500" />
                <VStack spacing={2}>
                  <Text fontWeight="bold" fontSize="lg">
                    Remittance Submitted!
                  </Text>
                  <Text color="gray.600">
                    Your remittance of ₱{amountNum.toFixed(2)} has been submitted for verification.
                  </Text>
                </VStack>

                <Box p={4} bg="green.50" borderRadius="md" w="full">
                  <VStack align="start" spacing={2} fontSize="sm">
                    <HStack justify="space-between" w="full">
                      <Text>Amount verified:</Text>
                      <Text fontWeight="bold">₱{amountNum.toFixed(2)}</Text>
                    </HStack>
                    <HStack justify="space-between" w="full">
                      <Text>Your take-home:</Text>
                      <Text fontWeight="bold" color="green.600">₱{riderTakeHome.toFixed(2)}</Text>
                    </HStack>
                    <Divider />
                    <HStack justify="space-between" w="full">
                      <Text>New slots unlocked:</Text>
                      <Badge colorScheme="green">{riderSlotLedger?.free_slots_total}</Badge>
                    </HStack>
                  </VStack>
                </Box>

                <Text fontSize="sm" color="gray.500" textAlign="center">
                  Admin will verify your payment within 24 hours.
                  Your slots will be unlocked upon verification.
                </Text>
              </VStack>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter gap={2}>
          {step !== 'success' ? (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
            </>
          ) : (
            <Button colorScheme="green" onClick={handleClose}>
              Done
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
