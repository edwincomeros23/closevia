import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  Badge,
  SimpleGrid,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  useToast,
} from '@chakra-ui/react'
import { CheckCircleIcon, WarningIcon } from '@chakra-ui/icons'
import { FaMoneyBillWave, FaCreditCard, FaBank, FaLock } from 'react-icons/fa'

interface RemittanceEntry {
  date: string
  description: string
  batchId: string
  earnings: number
  systemFee: number
  status: 'pending' | 'paid'
}

const RemittanceLedger: React.FC = () => {
  const { batchId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { isOpen, onOpen, onClose } = useDisclosure()
  
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const [ledger] = useState<RemittanceEntry[]>([
    {
      date: '2024-01-15',
      description: 'Batch BGC-001 (4 tasks)',
      batchId: 'batch-001',
      earnings: 450,
      systemFee: 45,
      status: 'paid',
    },
    {
      date: '2024-01-15',
      description: 'Batch Makati-002 (3 tasks)',
      batchId: 'batch-002',
      earnings: 320,
      systemFee: 32,
      status: 'paid',
    },
    {
      date: '2024-01-15',
      description: 'Batch Ortigas-003 (5 tasks)',
      batchId: 'batch-003',
      earnings: 600,
      systemFee: 60,
      status: 'pending',
    },
  ])

  const totalEarnings = ledger.reduce((sum, entry) => sum + entry.earnings, 0)
  const totalFeesDue = ledger.filter(e => e.status === 'pending').reduce((sum, entry) => sum + entry.systemFee, 0)
  const totalPaid = ledger.filter(e => e.status === 'paid').reduce((sum, entry) => sum + entry.systemFee, 0)

  const handleRemitFees = async () => {
    if (!selectedPaymentMethod) {
      toast({
        title: 'Select Payment Method',
        description: 'Choose how you want to pay',
        status: 'warning',
        duration: 2000,
      })
      return
    }

    setIsProcessing(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      toast({
        title: 'Payment Successful! ✅',
        description: `₱${totalFeesDue} remitted via ${selectedPaymentMethod}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      })

      navigate('/rider-queue')
    } catch (error) {
      toast({
        title: 'Payment Failed',
        description: 'Please try again',
        status: 'error',
        duration: 2000,
      })
    } finally {
      setIsProcessing(false)
      onClose()
    }
  }

  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <VStack spacing={6} maxW="md" mx="auto">
        {/* Header */}
        <VStack spacing={2} w="full">
          <Heading size="lg" color="brand.500">
            Earnings & Remittance
          </Heading>
          <Text fontSize="sm" color="gray.600">
            Transparent ledger of your work
          </Text>
        </VStack>

        {/* Summary Cards */}
        <SimpleGrid columns={3} spacing={3} w="full">
          <Card bg="green.50" border="1px" borderColor="green.200">
            <CardBody p={3}>
              <VStack spacing={1} align="center">
                <Text fontSize="xs" color="green.800" fontWeight="bold">
                  Total Earned
                </Text>
                <Text fontSize="lg" fontWeight="bold" color="green.600">
                  ₱{totalEarnings}
                </Text>
              </VStack>
            </CardBody>
          </Card>

          <Card bg="blue.50" border="1px" borderColor="blue.200">
            <CardBody p={3}>
              <VStack spacing={1} align="center">
                <Text fontSize="xs" color="blue.800" fontWeight="bold">
                  Fees Due
                </Text>
                <Text fontSize="lg" fontWeight="bold" color="blue.600">
                  ₱{totalFeesDue}
                </Text>
              </VStack>
            </CardBody>
          </Card>

          <Card bg="purple.50" border="1px" borderColor="purple.200">
            <CardBody p={3}>
              <VStack spacing={1} align="center">
                <Text fontSize="xs" color="purple.800" fontWeight="bold">
                  Already Paid
                </Text>
                <Text fontSize="lg" fontWeight="bold" color="purple.600">
                  ₱{totalPaid}
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
                How Clovia Fees Work
              </Text>
              <Text fontSize="xs" color="blue.800">
                • Clovia takes 10% commission per batch to maintain platform
              </Text>
              <Text fontSize="xs" color="blue.800">
                • You pay fees upfront before claiming new passes
              </Text>
              <Text fontSize="xs" color="blue.800">
                • Riders with unpaid fees cannot claim new batches
              </Text>
            </VStack>
          </CardBody>
        </Card>

        {/* Lock Warning (if fees due) */}
        {totalFeesDue > 0 && (
          <Card bg="orange.50" w="full" border="2px" borderColor="orange.400">
            <CardBody>
              <HStack spacing={2} align="start">
                <WarningIcon color="orange.600" boxSize={5} flexShrink={0} />
                <VStack align="start" spacing={0}>
                  <Text fontWeight="bold" fontSize="sm" color="orange.900">
                    Account Lock Warning
                  </Text>
                  <Text fontSize="xs" color="orange.800">
                    You have ₱{totalFeesDue} in pending fees. Pay now to unlock new batch claims.
                  </Text>
                </VStack>
              </HStack>
            </CardBody>
          </Card>
        )}

        {/* Ledger History */}
        <VStack spacing={3} w="full" align="stretch">
          <Heading size="sm" color="gray.800">
            Transaction History
          </Heading>
          
          {ledger.map((entry, idx) => (
            <Card key={idx} bg="white" border="1px" borderColor="gray.200">
              <CardBody p={3}>
                <VStack spacing={2} align="stretch">
                  {/* Header */}
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={0} flex={1}>
                      <Text fontWeight="bold" fontSize="sm" color="gray.800">
                        {entry.description}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        {entry.date}
                      </Text>
                    </VStack>
                    <Badge colorScheme={entry.status === 'paid' ? 'green' : 'yellow'}>
                      {entry.status === 'paid' ? '✓ Paid' : 'Pending'}
                    </Badge>
                  </HStack>

                  <Divider />

                  {/* Earnings Breakdown */}
                  <HStack justify="space-between" fontSize="sm">
                    <Text color="gray.600">Your Earnings:</Text>
                    <Text fontWeight="bold" color="green.600">
                      +₱{entry.earnings}
                    </Text>
                  </HStack>
                  <HStack justify="space-between" fontSize="sm">
                    <Text color="gray.600">Clovia Fee (10%):</Text>
                    <Text fontWeight="bold" color="red.600">
                      -₱{entry.systemFee}
                    </Text>
                  </HStack>
                  <HStack justify="space-between" fontSize="sm">
                    <Text fontWeight="bold" color="gray.800">Net Earnings:</Text>
                    <Text fontWeight="bold" color="brand.600">
                      ₱{entry.earnings - entry.systemFee}
                    </Text>
                  </HStack>
                </VStack>
              </CardBody>
            </Card>
          ))}
        </VStack>

        {/* Remit Button */}
        {totalFeesDue > 0 && (
          <Button
            w="full"
            colorScheme="brand"
            size="lg"
            onClick={onOpen}
          >
            Pay ₱{totalFeesDue} Fees Now
          </Button>
        )}

        {/* Navigation Buttons */}
        <HStack spacing={2} w="full">
          <Button
            flex={1}
            size="sm"
            variant="outline"
            colorScheme="brand"
            onClick={() => navigate('/rider-queue')}
          >
            📍 Find Batches
          </Button>
          <Button
            flex={1}
            size="sm"
            variant="outline"
            colorScheme="brand"
            onClick={() => navigate('/rider')}
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
          onClick={() => navigate('/rider-queue')}
        >
          ← Back to Queue
        </Button>
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
                      ₱{totalFeesDue}
                    </Text>
                  </HStack>
                </CardBody>
              </Card>

              <VStack spacing={2} align="stretch">
                <Text fontWeight="bold" fontSize="sm">
                  Select Payment Method:
                </Text>

                {/* GCash */}
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
                        <Text fontWeight="bold" fontSize="sm">GCash</Text>
                        <Text fontSize="xs" color="gray.600">Instant transfer to Clovia</Text>
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
                      <FaBank size={24} color={selectedPaymentMethod === 'bank' ? '#0066FF' : '#999'} />
                      <VStack align="start" spacing={0} flex={1}>
                        <Text fontWeight="bold" fontSize="sm">Bank Transfer</Text>
                        <Text fontSize="xs" color="gray.600">1-2 business days</Text>
                      </VStack>
                      {selectedPaymentMethod === 'bank' && <CheckCircleIcon color="green.500" />}
                    </HStack>
                  </CardBody>
                </Card>
              </VStack>
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
