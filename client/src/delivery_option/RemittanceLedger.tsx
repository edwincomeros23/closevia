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
  Divider,
  SimpleGrid,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  useToast,
  Spinner,
  Center,
  Badge,
  Image,
  Input
} from '@chakra-ui/react'
import { CheckCircleIcon, WarningIcon, RepeatIcon } from '@chakra-ui/icons'
import { FaMoneyBillWave, FaCreditCard, FaUniversity, FaLock } from 'react-icons/fa'
import { api } from '../services/api'

interface RiderLedger {
  id: number
  rider_id: number
  total_cash_collected: number
  remittance_owed: number
  take_home: number
  free_slots_remaining: number
  total_free_slots_used: number
  last_remittance_at: string | null
  is_locked_for_remittance: boolean
}

type RemittanceLedgerProps = {
  embedded?: boolean
  totalEarnings?: number
}

const RemittanceLedger: React.FC<RemittanceLedgerProps> = ({ embedded = false, totalEarnings }) => {
  const navigate = useNavigate()
  const toast = useToast()
  const { isOpen, onOpen, onClose } = useDisclosure()

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('')
  const [paymentProofUrl, setPaymentProofUrl] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const [ledgerData, setLedgerData] = useState<RiderLedger | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const handleUploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    const formData = new FormData()
    formData.append('image', file)
    try {
      const res = await api.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      if (res.data.success) {
        setPaymentProofUrl(res.data.data.url)
        toast({ title: 'Upload successful', status: 'success', duration: 2000 })
      }
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.response?.data?.error || err.message, status: 'error', duration: 3000 })
    } finally {
      setIsUploading(false)
    }
  }

  const fetchLedger = async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/api/deliveries/rider-ledger')
      if (res.data?.success) {
        setLedgerData(res.data.data)
      }
    } catch (err) {
      console.error(err)
      toast({
        id: "remittance-error",
        title: 'Error loading ledger',
        status: 'error',
        duration: 3000
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchLedger()
  }, [])

  const totalCashCollected = ledgerData?.total_cash_collected || 0
  const totalFeesDue = ledgerData?.remittance_owed || 0
  const computedTotalEarnings = ledgerData?.take_home || 0
  const isLocked = ledgerData?.is_locked_for_remittance || false
  const totalEarningsToDisplay = typeof totalEarnings === 'number' ? totalEarnings : computedTotalEarnings

  const handleRemitFees = async () => {
    if (!selectedPaymentMethod) {
      toast({
        id: "remittanceledger-select-payment-method",
        title: 'Select Payment Method',
        description: 'Choose how you want to pay',
        status: 'warning',
        duration: 2000,
      })
      return
    }

    if (!paymentProofUrl) {
      toast({
        id: "remittanceleader-proof-required",
        title: 'Proof of Payment Required',
        description: 'Please upload the receipt to verify your transfer.',
        status: 'warning',
        duration: 3000,
      })
      return
    }

    setIsProcessing(true)
    try {
      const res = await api.post('/api/deliveries/remittance-payment', {
        amount_paid: totalFeesDue,
        payment_method: selectedPaymentMethod,
        payment_proof_url: paymentProofUrl
      })

      if (res.data.success) {
        toast({
          id: "remittanceledger-payment-successful",
          title: 'Payment Submitted! ✅',
          description: `₱${totalFeesDue} remitted via ${selectedPaymentMethod}. Awaiting admin verification.`,
          status: 'success',
          duration: 4000,
          isClosable: true,
        })
        fetchLedger() // Refresh immediately to show pending status
        onClose()
      }
    } catch (error: any) {
      toast({
        id: "remittanceledger-payment-failed",
        title: 'Payment Failed',
        description: error.response?.data?.error || 'Please try again',
        status: 'error',
        duration: 2000,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <Center py={10} bg={embedded ? 'transparent' : '#FFFDF1'}>
        <Spinner size="xl" color="brand.500" />
      </Center>
    )
  }

  return (
    <Box minH={embedded ? 'auto' : '100vh'} bg="#FFFDF1" py={6} px={4}>
      <VStack spacing={6} maxW="md" mx="auto">
        {/* Header */}
        <HStack w="full" justify="space-between">
          <VStack spacing={1} align="start">
            <Heading size="lg" color="brand.500">
              Rider Ledger
            </Heading>
            <Text fontSize="sm" color="gray.600">
              Live updates of your cash earnings
            </Text>
          </VStack>
          <Button size="sm" variant="ghost" onClick={fetchLedger} leftIcon={<RepeatIcon />}>
            Refresh
          </Button>
        </HStack>

        {/* Summary Cards */}
        <SimpleGrid columns={3} spacing={3} w="full">
          <Card bg="white" border="2px" borderColor="brand.200" shadow="sm">
            <CardBody p={3}>
              <VStack spacing={1} align="center">
                <Text fontSize="xs" color="gray.600" fontWeight="bold" textAlign="center">
                  Total Cash Collected
                </Text>
                <Text fontSize="lg" fontWeight="bold" color="blue.600">
                  ₱{totalCashCollected.toFixed(2)}
                </Text>
              </VStack>
            </CardBody>
          </Card>

          <Card bg="white" border="2px" borderColor="red.200" shadow="sm">
            <CardBody p={3}>
              <VStack spacing={1} align="center">
                <Text fontSize="xs" color="gray.600" fontWeight="bold" textAlign="center">
                  Remittance Owed
                </Text>
                <Text fontSize="lg" fontWeight="bold" color="red.600">
                  ₱{totalFeesDue.toFixed(2)}
                </Text>
              </VStack>
            </CardBody>
          </Card>

          <Card bg="green.50" border="2px" borderColor="green.400" shadow="md">
            <CardBody p={3}>
              <VStack spacing={1} align="center">
                <Text fontSize="xs" color="green.800" fontWeight="bold" textAlign="center">
                  Total Earnings
                </Text>
                <Text fontSize="lg" fontWeight="bold" color="green.600">
                  ₱{totalEarningsToDisplay.toFixed(2)}
                </Text>
              </VStack>
            </CardBody>
          </Card>
        </SimpleGrid>

        {/* How Fees Work */}
        <Card bg="blue.50" w="full" border="1px" borderColor="blue.200">
          <CardBody>
            <VStack spacing={2} align="stretch">
              <Text fontWeight="bold" fontSize="sm" color="blue.900">
                How Cash Collection Works
              </Text>
              <Text fontSize="xs" color="blue.800">
                • Clovia takes a 15% commission per delivery.
              </Text>
              <Text fontSize="xs" color="blue.800">
                • Your ledger updates automatically after completing a job.
              </Text>
              <Text fontSize="xs" color="blue.800">
                • ₱1000 limit: Your account will be locked from claiming new batches until you remit fees.
              </Text>
            </VStack>
          </CardBody>
        </Card>

        {/* Lock Warning (if fees due) */}
        {isLocked && (
          <Card bg="orange.50" w="full" border="2px" borderColor="orange.400">
            <CardBody>
              <HStack spacing={2} align="start">
                <WarningIcon color="orange.600" boxSize={5} flexShrink={0} />
                <VStack align="start" spacing={0}>
                  <Text fontWeight="bold" fontSize="sm" color="orange.900">
                    Account Lock Warning
                  </Text>
                  <Text fontSize="xs" color="orange.800">
                    You have ₱{totalFeesDue.toFixed(2)} in pending fees. Pay now to unlock new batch claims.
                  </Text>
                </VStack>
              </HStack>
            </CardBody>
          </Card>
        )}

        {/* Account Details Box */}
        <Card bg="white" w="full" border="1px" borderColor="gray.200">
          <CardBody>
            <VStack spacing={3} align="stretch">
              <Heading size="sm" color="gray.700">Ledger Details</Heading>
              <Divider />
              <HStack justify="space-between" fontSize="sm">
                <Text color="gray.600">Free Slots Remaining:</Text>
                <Badge colorScheme={ledgerData?.free_slots_remaining ? "green" : "red"}>{ledgerData?.free_slots_remaining}</Badge>
              </HStack>
              <HStack justify="space-between" fontSize="sm">
                <Text color="gray.600">Total Free Slots Used:</Text>
                <Text fontWeight="bold">{ledgerData?.total_free_slots_used}</Text>
              </HStack>
              <HStack justify="space-between" fontSize="sm">
                <Text color="gray.600">Last Remittance:</Text>
                <Text fontWeight="medium">{ledgerData?.last_remittance_at ? new Date(ledgerData.last_remittance_at).toLocaleDateString() : 'Never'}</Text>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* Remit Button */}
        <Button
          w="full"
          colorScheme="brand"
          size="lg"
          onClick={onOpen}
          isDisabled={totalFeesDue <= 0}
        >
          {totalFeesDue > 0 ? `Pay ₱${totalFeesDue.toFixed(2)} Fees Now` : `No Remittance Fees Owed`}
        </Button>

        {!embedded && (
          <>
            {/* Navigation Buttons */}
            <HStack spacing={2} w="full">
              <Button
                flex={1}
                size="sm"
                variant="outline"
                colorScheme="brand"
                onClick={() => navigate('/rider-home')}
              >
                📍 Find Batches
              </Button>
              <Button
                flex={1}
                size="sm"
                variant="outline"
                colorScheme="brand"
                onClick={() => navigate('/rider-home')}
              >
                📋 My Jobs
              </Button>
            </HStack>

            {/* Back to Queue */}
            <Button
              w="full"
              variant="ghost"
              colorScheme="brand"
              fontSize="sm"
              onClick={() => navigate('/rider-home')}
            >
              ← Back to Queue
            </Button>
          </>
        )}
      </VStack>

      {/* Payment Modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered size="sm">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Pay Remittance Fees</ModalHeader>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Card bg="gray.50">
                <CardBody>
                  <HStack justify="space-between">
                    <Text fontWeight="bold">Total Due:</Text>
                    <Text fontWeight="bold" fontSize="lg" color="brand.600">
                      ₱{totalFeesDue.toFixed(2)}
                    </Text>
                  </HStack>
                </CardBody>
              </Card>

              <VStack spacing={2} align="stretch">
                <Text fontWeight="bold" fontSize="sm">
                  Select Payment Method:
                </Text>

                {/* GCash / E-Wallet */}
                <Card
                  bg={selectedPaymentMethod === 'gcash' ? 'blue.50' : 'white'}
                  border="2px"
                  borderColor={selectedPaymentMethod === 'gcash' ? 'blue.400' : 'gray.200'}
                  cursor="pointer"
                  onClick={() => setSelectedPaymentMethod('gcash')}
                >
                  <CardBody p={3}>
                    <HStack spacing={2}>
                      <FaCreditCard size={24} color={selectedPaymentMethod === 'gcash' ? '#0066FF' : '#999'} />
                      <VStack align="start" spacing={0} flex={1}>
                        <Text fontWeight="bold" fontSize="sm">E-Wallet (GCash / PayMaya)</Text>
                        <Text fontSize="xs" color="gray.600">Send to exactly: 0912-345-6789</Text>
                      </VStack>
                      {selectedPaymentMethod === 'gcash' && <CheckCircleIcon color="green.500" />}
                    </HStack>
                  </CardBody>
                </Card>

                {/* Bank Transfer */}
                <Card
                  bg={selectedPaymentMethod === 'bank' ? 'blue.50' : 'white'}
                  border="2px"
                  borderColor={selectedPaymentMethod === 'bank' ? 'blue.400' : 'gray.200'}
                  cursor="pointer"
                  onClick={() => setSelectedPaymentMethod('bank')}
                >
                  <CardBody p={3}>
                    <HStack spacing={2}>
                      <FaUniversity size={24} color={selectedPaymentMethod === 'bank' ? '#0066FF' : '#999'} />
                      <VStack align="start" spacing={0} flex={1}>
                        <Text fontWeight="bold" fontSize="sm">Bank Transfer</Text>
                        <Text fontSize="xs" color="gray.600">BDO Account: 1234-5678-9000</Text>
                      </VStack>
                      {selectedPaymentMethod === 'bank' && <CheckCircleIcon color="green.500" />}
                    </HStack>
                  </CardBody>
                </Card>

              </VStack>

              <Divider />

              {/* Image Upload for Proof */}
              <Box mt={2} px={1}>
                <Text fontWeight="bold" fontSize="sm" mb={2}>Proof of Payment (Required):</Text>
                {paymentProofUrl ? (
                  <VStack spacing={3}>
                    <Image src={paymentProofUrl} alt="Payment Proof" boxSize="150px" objectFit="contain" border="2px dashed" borderColor="gray.300" borderRadius="md" p={1} />
                    <Button size="sm" colorScheme="red" variant="ghost" onClick={() => setPaymentProofUrl('')}>Remove Receipt</Button>
                  </VStack>
                ) : (
                  <Button as="label" w="full" py={6} variant="outline" cursor="pointer" isLoading={isUploading} leftIcon={<FaCreditCard />} borderStyle="dashed" borderWidth="2px" _hover={{ bg: "gray.50" }}>
                    Upload Screenshot of Receipt
                    <input type="file" hidden accept="image/*" onChange={handleUploadProof} />
                  </Button>
                )}
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack spacing={3} w="full">
              <Button variant="outline" w="full" onClick={onClose}>
                Cancel
              </Button>
              <Button
                colorScheme="brand"
                w="full"
                onClick={handleRemitFees}
                isLoading={isProcessing}
                loadingText="Processing..."
              >
                Confirm Payment
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  )
}

export default RemittanceLedger
