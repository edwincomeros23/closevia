import React, { useState } from 'react'
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Input,
  Textarea,
  Select,
  FormControl,
  FormLabel,
  FormHelperText,
  Badge,
  Icon,
  Progress,
  useToast,
  Checkbox,
  InputGroup,
  InputLeftAddon,
  Grid,
  RadioGroup,
  Radio,
} from '@chakra-ui/react'
import { ArrowBackIcon, ArrowForwardIcon } from '@chakra-ui/icons'
import { FILTER_CATEGORIES } from '../utils/categories'

interface ProductDetails {
  title: string
  description: string
  price: number
  category: string
  condition: string
  location: string
  allowBuying: boolean
  barterOnly: boolean
}

interface ProductUploadStep2Props {
  onNext: (details: ProductDetails) => void
  onBack: () => void
  initialData?: ProductDetails
  isLoading?: boolean
}

const ProductUploadStep2: React.FC<ProductUploadStep2Props> = ({
  onNext,
  onBack,
  initialData,
  isLoading = false,
}) => {
  const [details, setDetails] = useState<ProductDetails>(
    initialData || {
      title: '',
      description: '',
      price: 0,
      category: 'General',
      condition: 'Used',
      location: '',
      allowBuying: true,
      barterOnly: false,
    }
  )
  const toast = useToast()

  const conditions = ['New', 'Like New', 'Good', 'Used', 'For Parts']

  const handleChange = (field: keyof ProductDetails, value: any) => {
    setDetails((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleNext = () => {
    // Validation
    if (!details.title.trim()) {
      toast({
        title: 'Title required',
        description: 'Please enter a product title',
        status: 'error',
        duration: 3,
        isClosable: true,
      })
      return
    }

    if (!details.description.trim()) {
      toast({
        title: 'Description required',
        description: 'Please describe your product',
        status: 'error',
        duration: 3,
        isClosable: true,
      })
      return
    }

    if (details.price <= 0 && details.allowBuying) {
      toast({
        title: 'Invalid price',
        description: 'Please enter a valid price',
        status: 'error',
        duration: 3,
        isClosable: true,
      })
      return
    }

    onNext(details)
  }

  return (
    <Box w="full" minH="100vh" bg="gray.50" pb={24}>
      {/* Progress Indicator */}
      <Box bg="white" borderBottomWidth="1px" borderColor="gray.200" sticky top={0} zIndex={10}>
        <VStack spacing={0} maxW="container.md" mx="auto" p={{ base: 4, md: 6 }}>
          <HStack w="full" justify="space-between" mb={4}>
            <Text fontSize="sm" fontWeight="600" color="gray.600">
              Step 2 of 3
            </Text>
            <Text fontSize="sm" color="gray.500">
              Details & Preferences
            </Text>
          </HStack>

          <Progress value={66} size="sm" w="full" colorScheme="brand" rounded="full" hasStripe />
        </VStack>
      </Box>

      {/* Main Content */}
      <VStack spacing={6} maxW="container.md" mx="auto" p={{ base: 4, md: 6 }} align="stretch">
        {/* Title */}
        <FormControl isRequired>
          <FormLabel fontWeight="600">Product Title</FormLabel>
          <Input
            placeholder="e.g., Nike Air Force 1 White Sneakers"
            value={details.title}
            onChange={(e) => handleChange('title', e.target.value)}
            maxLength={60}
            size="lg"
          />
          <FormHelperText color={details.title.length > 50 ? 'orange.500' : 'gray.500'}>
            {details.title.length}/60 characters
          </FormHelperText>
        </FormControl>

        {/* Description */}
        <FormControl isRequired>
          <FormLabel fontWeight="600">Description</FormLabel>
          <Textarea
            placeholder="Describe your product: condition, features, any defects..."
            value={details.description}
            onChange={(e) => handleChange('description', e.target.value)}
            maxLength={500}
            minH="120px"
            size="md"
          />
          <FormHelperText color={details.description.length > 450 ? 'orange.500' : 'gray.500'}>
            {details.description.length}/500 characters
          </FormHelperText>
        </FormControl>

        {/* Category & Condition */}
        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
          <FormControl isRequired>
            <FormLabel fontWeight="600">Category</FormLabel>
            <Select
              value={details.category}
              onChange={(e) => handleChange('category', e.target.value)}
              size="lg"
            >
              {FILTER_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </Select>
          </FormControl>

          <FormControl isRequired>
            <FormLabel fontWeight="600">Condition</FormLabel>
            <Select
              value={details.condition}
              onChange={(e) => handleChange('condition', e.target.value)}
              size="lg"
            >
              {conditions.map((cond) => (
                <option key={cond} value={cond}>
                  {cond}
                </option>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* Location */}
        <FormControl>
          <FormLabel fontWeight="600">Location</FormLabel>
          <Input
            placeholder="e.g., Cebu City, Philippines"
            value={details.location}
            onChange={(e) => handleChange('location', e.target.value)}
            size="lg"
          />
          <FormHelperText>Used to calculate distance for nearby buyers</FormHelperText>
        </FormControl>

        {/* Pricing Section */}
        <VStack spacing={3} align="stretch" bg="green.50" p={4} rounded="lg" borderWidth="1px" borderColor="green.200">
          <HStack justify="space-between">
            <Text fontWeight="600" color="gray.900">
              Selling Options
            </Text>
            <Badge colorScheme="green" fontSize="xs">
              Recommended
            </Badge>
          </HStack>

          {/* Allow Buying */}
          <FormControl display="flex" alignItems="center">
            <Checkbox
              isChecked={details.allowBuying}
              onChange={(e) => handleChange('allowBuying', e.target.checked)}
              mr={3}
            />
            <FormLabel mb={0} cursor="pointer" fontWeight="500">
              Allow direct purchase (buying)
            </FormLabel>
          </FormControl>

          {/* Price Input */}
          {details.allowBuying && (
            <InputGroup size="lg">
              <InputLeftAddon fontWeight="600" bg="green.100">
                ₱
              </InputLeftAddon>
              <Input
                type="number"
                placeholder="Enter price"
                value={details.price || ''}
                onChange={(e) => handleChange('price', parseFloat(e.target.value) || 0)}
                min={0}
              />
            </InputGroup>
          )}

          {/* Barter Only */}
          <FormControl display="flex" alignItems="center" pt={2} borderTopWidth="1px" borderColor="green.200">
            <Checkbox
              isChecked={details.barterOnly}
              onChange={(e) => handleChange('barterOnly', e.target.checked)}
              mr={3}
            />
            <FormLabel mb={0} cursor="pointer" fontWeight="500">
              Open to trading/bartering only
            </FormLabel>
          </FormControl>

          {details.barterOnly && (
            <Text fontSize="xs" color="gray.600" bg="white" p={2} rounded="sm">
              ✓ Your product will be available for trade offers. Price is optional for reference only.
            </Text>
          )}
        </VStack>

        {/* AI Suggestions (if available) */}
        <Box bg="blue.50" p={4} rounded="lg" borderWidth="1px" borderColor="blue.200">
          <Text fontSize="sm" fontWeight="600" color="blue.900" mb={2}>
            💡 AI Suggestions
          </Text>
          <VStack align="start" spacing={1} fontSize="sm" color="blue.800">
            <Text>✓ Great description - buyers will appreciate the detail</Text>
            <Text>✓ Consider adding condition details for higher trustworthiness</Text>
            <Text>✓ Pricing looks competitive for this category</Text>
          </VStack>
        </Box>
      </VStack>

      {/* Bottom Navigation */}
      <Box
        position="fixed"
        bottom={0}
        left={0}
        right={0}
        bg="white"
        borderTopWidth="1px"
        borderColor="gray.200"
        p={4}
        maxW="container.md"
        mx="auto"
        w="full"
      >
        <HStack spacing={3}>
          <Button
            leftIcon={<ArrowBackIcon />}
            w="full"
            variant="ghost"
            onClick={onBack}
            isDisabled={isLoading}
          >
            Back
          </Button>

          <Button
            rightIcon={<ArrowForwardIcon />}
            colorScheme="brand"
            w="full"
            onClick={handleNext}
            isLoading={isLoading}
          >
            Review
          </Button>
        </HStack>
      </Box>
    </Box>
  )
}

export default ProductUploadStep2
