import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Input,
  Textarea,
  FormControl,
  FormLabel,
  FormHelperText,
  useToast,
  SimpleGrid,
  useColorModeValue,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Icon,
  Divider,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
} from '@chakra-ui/react'
import { CheckCircleIcon } from '@chakra-ui/icons'
import { FaTruck, FaClock, FaShieldAlt, FaUsers } from 'react-icons/fa'

interface DeliveryOption {
  id: string
  name: string
  description: string
  icon: any
  cost: number
  estimatedDays: string
  features: string[]
  available: boolean
}

const DeliveryUI: React.FC = () => {
  const navigate = useNavigate()
  const toast = useToast()
  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const [selectedDelivery, setSelectedDelivery] = useState<string>('standard')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const deliveryOptions: DeliveryOption[] = [
    {
      id: 'standard',
      name: 'Standard Delivery',
      description: 'Shared batch. Up to 5 items.',
      icon: FaTruck,
      cost: 30,
      estimatedDays: '2-4hrs',
      features: [
        '₱30 flat rate',
        'Shared batch delivery',
        'Up to 5 items grouped',
        'Real-time tracking',
        'Delivery confirmation'
      ],
      available: true,
    },
    {
      id: 'express',
      name: 'Express Delivery',
      description: 'Single-item. Maximum care.',
      icon: FaClock,
      cost: 60,
      estimatedDays: '~1 hour',
      features: [
        '₱60 priority rate',
        'Single-item only',
        'Zero batch compression',
        'Priority handling',
        'Safer guarantee'
      ],
      available: true,
    },
  ]

  const handleSubmit = async () => {
    if (!address.trim()) {
      toast({
        title: 'Missing Address',
        description: 'Please provide a delivery address',
        status: 'warning',
        duration: 3000,
      })
      return
    }

    setIsProcessing(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      toast({
        title: 'Delivery Option Saved',
        description: `${deliveryOptions.find(d => d.id === selectedDelivery)?.name} selected`,
        status: 'success',
        duration: 2000,
      })

      navigate('/checkout')
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save delivery option',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const selectedOption = deliveryOptions.find(d => d.id === selectedDelivery)

  return (
    <Box minH="100vh" bg="#FFFDF1" py={6} px={4}>
      <Box maxW="md" mx="auto">
        <VStack spacing={4} align="stretch">
          {/* Header - Compact */}
          <VStack spacing={1} align="start">
            <Heading size="md" color="brand.500">
              Delivery Option
            </Heading>
            <Text fontSize="sm" color="gray.600">
              Choose how you'd like to receive your items
            </Text>
          </VStack>

          {/* Delivery Options - Compact Cards */}
          <SimpleGrid columns={2} spacing={3}>
            {deliveryOptions.map((option) => (
              <Card
                key={option.id}
                bg={bgColor}
                border="2px solid"
                borderColor={selectedDelivery === option.id ? 'brand.500' : borderColor}
                cursor="pointer"
                transition="all 0.2s"
                _hover={{
                  shadow: 'md',
                  borderColor: 'brand.400',
                }}
                onClick={() => setSelectedDelivery(option.id)}
              >
                <CardBody p={3}>
                  <VStack spacing={2} align="stretch">
                    {/* Icon + Badge Row */}
                    <HStack justify="space-between" align="flex-start">
                      <Box
                        p={2}
                        bg="brand.50"
                        borderRadius="lg"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Icon as={option.icon} boxSize={5} color="brand.500" />
                      </Box>
                      <HStack spacing={1}>
                        {selectedDelivery === option.id && (
                          <Icon as={CheckCircleIcon} boxSize={4} color="green.500" />
                        )}
                        <Badge fontSize="2xs" colorScheme={option.id === 'standard' ? 'blue' : 'purple'}>
                          {option.id === 'standard' ? '💰' : '⭐'}
                        </Badge>
                      </HStack>
                    </HStack>

                    {/* Title + Description */}
                    <VStack spacing={0} align="start">
                      <Text fontWeight="bold" fontSize="sm" color="gray.800">
                        {option.name}
                      </Text>
                      <Text fontSize="xs" color="gray.600">
                        {option.description}
                      </Text>
                    </VStack>

                    {/* Price + Time - Inline */}
                    <HStack justify="space-between" fontSize="xs">
                      <Text color="gray.600">
                        <Text as="span" fontWeight="bold" color="brand.600">₱{option.cost}</Text>
                      </Text>
                      <Text color="gray.600">
                        <Text as="span" fontWeight="bold">{option.estimatedDays}</Text>
                      </Text>
                    </HStack>
                  </VStack>
                </CardBody>
              </Card>
            ))}
          </SimpleGrid>

          {/* Selected Details - Minimal */}
          {selectedOption && (
            <Card bg={bgColor} border="1px" borderColor={borderColor}>
              <CardBody p={4} spacing={3}>
                <VStack spacing={3} align="stretch">
                  {/* Quick Info */}
                  {selectedOption.id === 'standard' && (
                    <HStack spacing={2} fontSize="xs" p={2} bg="blue.50" borderRadius="md">
                      <Icon as={FaUsers} color="blue.600" boxSize={4} flexShrink={0} />
                      <VStack spacing={0} align="start">
                        <Text fontWeight="bold" color="blue.900">Shared batch</Text>
                        <Text color="blue.800">Up to 5 items • Minor risks for fragile items</Text>
                      </VStack>
                    </HStack>
                  )}

                  {selectedOption.id === 'express' && (
                    <HStack spacing={2} fontSize="xs" p={2} bg="purple.50" borderRadius="md">
                      <Icon as={FaShieldAlt} color="purple.600" boxSize={4} flexShrink={0} />
                      <VStack spacing={0} align="start">
                        <Text fontWeight="bold" color="purple.900">Single-item only</Text>
                        <Text color="purple.800">Maximum care • Perfect for fragile items</Text>
                      </VStack>
                    </HStack>
                  )}

                  {/* Address Input */}
                  <FormControl>
                    <FormLabel fontSize="sm" fontWeight="bold">Delivery Address</FormLabel>
                    <Input
                      placeholder="Street address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      size="sm"
                    />
                  </FormControl>

                  {/* Notes Input */}
                  <FormControl>
                    <FormLabel fontSize="sm" fontWeight="bold">
                      {selectedOption.id === 'express' ? 'Handling Notes' : 'Special Instructions'} (Optional)
                    </FormLabel>
                    <Textarea
                      placeholder={selectedOption.id === 'express' ? "Fragility warnings, placement instructions..." : "Any special instructions..."}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      size="sm"
                    />
                    {selectedOption.id === 'express' && (
                      <FormHelperText fontSize="2xs">
                        💡 Include handling requirements
                      </FormHelperText>
                    )}
                  </FormControl>

                  {/* Cost Summary - Inline */}
                  <HStack justify="space-between" bg="gray.50" p={2} borderRadius="md" fontSize="sm">
                    <Text color="gray.600">Total Cost:</Text>
                    <Text fontWeight="bold" color="brand.600">₱{selectedOption.cost}</Text>
                  </HStack>

                  {/* Safety Alert - Compact */}
                  <Alert status={selectedOption.id === 'express' ? 'success' : 'warning'} fontSize="xs" borderRadius="md">
                    <AlertIcon boxSize={3} />
                    <VStack align="start" spacing={0} ml={2}>
                      <AlertTitle fontSize="xs">
                        {selectedOption.id === 'express' ? '✓ Premium Protection' : '⚠️ Standard Handling'}
                      </AlertTitle>
                      <AlertDescription fontSize="2xs">
                        {selectedOption.id === 'express' 
                          ? 'Single-item dedicated care for fragile & high-value items'
                          : 'Shared handling - avoid for fragile items'
                        }
                      </AlertDescription>
                    </VStack>
                  </Alert>

                  {/* Action Buttons */}
                  <HStack spacing={2}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(-1)}
                      flex={1}
                    >
                      Back
                    </Button>
                    <Button
                      colorScheme="brand"
                      size="sm"
                      flex={1}
                      onClick={handleSubmit}
                      isLoading={isProcessing}
                      loadingText="Saving..."
                    >
                      Confirm
                    </Button>
                  </HStack>
                </VStack>
              </CardBody>
            </Card>
          )}
        </VStack>
      </Box>
    </Box>
  )
}

export default DeliveryUI

