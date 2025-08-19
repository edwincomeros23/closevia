import React, { useState, useEffect, useCallback } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import {
  Box,
  Heading,
  Input,
  Select,
  HStack,
  VStack,
  Text,
  Button,
  Image,
  Badge,
  Flex,
  Spinner,
  Center,
  useToast,
  IconButton,
  Tooltip,
  Grid,
  GridItem,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  InputGroup,
  InputLeftElement,
} from '@chakra-ui/react'
import { 
  SearchIcon, 
  RepeatIcon, 
  StarIcon, 
  ViewIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@chakra-ui/icons'
import { FaUserCircle } from 'react-icons/fa'
import { useProducts } from '../contexts/ProductContext'
import { useAuth } from '../contexts/AuthContext'
import { SearchFilters } from '../types'
import { getFirstImage } from '../utils/imageUtils'

// Custom debounce hook
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

const Home: React.FC = () => {
  const { products, loading, error, searchProducts } = useProducts()
  const { user } = useAuth()
  const location = useLocation()
  const { isOpen, onOpen, onClose } = useDisclosure()
  
  // Search state management
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<SearchFilters>({
    keyword: '',
    min_price: undefined,
    max_price: undefined,
    premium: undefined,
    status: 'available', // default to available so home shows items
    barter_only: undefined, // Show all by default
    location: '',
    page: 1,
    limit: 20, // Load more products
  })
  const [hasSearched, setHasSearched] = useState(false)
  
  // Debounce search term for smooth UX
  const debouncedSearchTerm = useDebounce(searchTerm, 400)
  
  const toast = useToast()

  // Load products immediately on component mount
  useEffect(() => {
  // Always fetch latest 10 available products on mount (default feed)
  searchProducts({ ...filters, status: 'available', limit: 10, page: 1 })
  setHasSearched(false)
  // empty deps intentional — only once on mount
  }, [])

  // Refetch when navigating back to Home route to ensure newest items appear
  useEffect(() => {
    if (location.pathname === '/') {
      searchProducts({ ...filters, status: 'available', limit: 10, page: 1 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // Refetch on tab/window focus to keep feed fresh
  useEffect(() => {
    const handleFocus = () => {
      if (window.location.pathname === '/') {
        searchProducts({ ...filters, status: 'available', limit: 10, page: 1 })
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update filters when debounced search term changes
  useEffect(() => {
    if (debouncedSearchTerm.trim() === '') return
    setFilters(prev => ({ ...prev, keyword: debouncedSearchTerm, page: 1 }))
    setHasSearched(true)
  }, [debouncedSearchTerm])

  // Search when filters change — only run when hasSearched is true
  useEffect(() => {
    if (!hasSearched) return

    // perform the search once, then reset the flag
    searchProducts(filters)
    setHasSearched(false)

    // intentionally exclude searchProducts from deps to avoid loops if it's not stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, hasSearched])

  const handleSearch = () => {
    setFilters(prev => ({ ...prev, keyword: searchTerm, page: 1 }))
    setHasSearched(true)
  }

  // Trigger search on Enter key
  const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // change: mark filter changes as user-initiated so the effect runs
  const handleFilterChange = (key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
    setHasSearched(true)
  }

  const handleTradeClick = (productId: number) => {
    if (!user) {
      onOpen() // Show login modal
    } else {
      // Proceed with trade
      toast({
        title: 'Trade initiated!',
        description: 'Contact the seller to arrange the trade.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
    }
  }

  const handleBuyClick = (productId: number) => {
    if (!user) {
      onOpen() // Show login modal
    } else {
      // Proceed with purchase
      toast({
        title: 'Purchase initiated!',
        description: 'Contact the seller to complete the purchase.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
    }
  }

  const clearFilters = () => {
    setSearchTerm('')
    setFilters({
      keyword: '',
      min_price: undefined,
      max_price: undefined,
      premium: undefined,
      status: 'available',
      barter_only: undefined,
      location: '',
      page: 1,
      limit: 20,
    })
    setHasSearched(false)
  }

  // Pinterest-style masonry grid
  const renderProductCard = (product: any) => (
    <Box
      key={product.id}
      bg="white"
      rounded="2xl"
      shadow="sm"
      overflow="hidden"
      transition="all 0.3s ease"
      display="inline-block"
      w="full"
      mb={6}
      sx={{ breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', pageBreakInside: 'avoid' }}
      _hover={{ 
        shadow: 'lg', 
        transform: 'translateY(-4px)',
        cursor: 'pointer'
      }}
      onClick={() => window.location.href = `/products/${product.id}`}
    >
      {/* Product Image */}
      <Box position="relative">
        <Image
          src={getFirstImage(product.image_urls)}
          alt={product.title}
          w="full"
          h="auto"
          objectFit="cover"
          loading="lazy"
          fallbackSrc="https://via.placeholder.com/300x400?text=No+Image"
        />
        
        {/* Premium Badge */}
        {product.premium && (
          <Badge
            position="absolute"
            top={2}
            right={2}
            colorScheme="yellow"
            variant="solid"
            borderRadius="full"
            px={2}
          >
            <StarIcon mr={1} />
            Premium
          </Badge>
        )}
        
        {/* Trade/Buy Badge */}
        <Badge
          position="absolute"
          top={2}
          left={2}
          colorScheme={product.allow_buying && product.price && !product.barter_only ? "blue" : "green"}
          variant="solid"
          borderRadius="full"
          px={2}
        >
          {product.allow_buying && product.price && !product.barter_only ? "Buy Available" : "Barter Only"}
        </Badge>
        
        {/* Status Badge */}
        {product.status === 'sold' && (
          <Badge
            position="absolute"
            bottom={2}
            right={2}
            colorScheme="red"
            variant="solid"
            borderRadius="full"
            px={2}
          >
            Sold
          </Badge>
        )}
      </Box>

      {/* Product Info */}
      <Box p={4}>
        <Heading size="sm" noOfLines={2} mb={2} color="gray.800">
          {product.title}
        </Heading>
        
        <Text color="gray.600" noOfLines={2} mb={3} fontSize="sm">
          {product.description || 'No description available'}
        </Text>
        
        {/* Price and Seller Info */}
        <Flex justify="space-between" align="center" mb={3}>
          {product.allow_buying && product.price && !product.barter_only ? (
            <Text fontSize="lg" fontWeight="bold" color="brand.500">
              ${product.price.toFixed(2)}
            </Text>
          ) : (
            <Text fontSize="sm" color="green.600" fontWeight="medium">
              Barter Only
            </Text>
          )}
          
          <Text fontSize="xs" color="gray.500">
            by {product.seller_name || 'Unknown'}
          </Text>
        </Flex>

        {/* Action Buttons */}
        <HStack spacing={2}>
          <Button
            size="sm"
            variant="outline"
            colorScheme="brand"
            flex={1}
            onClick={(e) => {
              e.stopPropagation()
              handleTradeClick(product.id)
            }}
            isDisabled={product.status === 'sold'}
          >
            {product.status === 'sold' ? 'Sold' : 'Trade'}
          </Button>
          
          {product.allow_buying && product.price && !product.barter_only && (
            <Button
              size="sm"
              colorScheme="brand"
              flex={1}
              onClick={(e) => {
                e.stopPropagation()
                handleBuyClick(product.id)
              }}
              isDisabled={product.status === 'sold'}
            >
              {product.status === 'sold' ? 'Sold' : 'Buy'}
            </Button>
          )}
        </HStack>
      </Box>
    </Box>
  )

  return (
    <Box minH="100vh" bg="#ffffff">
      {/* Sticky Search Header */}
      <Box
        position="sticky"
        top={0}
        zIndex={100}
        bg="white"
        borderColor="gray.200"
        px={8}
        py={4}
      >
        <VStack spacing={4}>
          {/* Main Search Bar */}
          <HStack w="full" maxW="6xl" mx="auto" spacing={4}>
            <InputGroup size="lg">
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Search products, categories, or keywords..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                bg="white"
                border="2px"
                borderColor="gray.200"
                _focus={{
                  borderColor: "brand.500",
                  boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)"
                }}
              />
            </InputGroup>

            {/* Profile button (replaces stray object) */}
            <IconButton
              as={RouterLink}
              to="/profile"
              aria-label="Profile"
              icon={<FaUserCircle />}
              variant="ghost"
              size="lg"
            />

            <Button
              leftIcon={<SearchIcon />}
              colorScheme="brand"
              size="lg"
              onClick={handleSearch}
              px={8}
            >
              Search
            </Button>
            
            <IconButton
              aria-label="Toggle filters"
              icon={showFilters ? <ChevronUpIcon /> : <ChevronDownIcon />}
              variant="outline"
              size="lg"
              onClick={() => setShowFilters(!showFilters)}
            />
          </HStack>

          {/* Expandable Filters */}
          {showFilters && (
            <Box w="full" maxW="4xl" mx="auto" bg="gray.50" p={4} rounded="lg">
              <Grid templateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={4}>
                <FormControl>
                  <FormLabel fontSize="sm" color="gray.600">Price Range</FormLabel>
                  <HStack>
                    <Input
                      placeholder="Min"
                      type="number"
                      value={filters.min_price || ''}
                      onChange={(e) => handleFilterChange('min_price', e.target.value ? Number(e.target.value) : undefined)}
                      size="sm"
                    />
                    <Text fontSize="sm" color="gray.500">-</Text>
                    <Input
                      placeholder="Max"
                      type="number"
                      value={filters.max_price || ''}
                      onChange={(e) => handleFilterChange('max_price', e.target.value ? Number(e.target.value) : undefined)}
                      size="sm"
                    />
                  </HStack>
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" color="gray.600">Location</FormLabel>
                  <Input
                    placeholder="Enter location"
                    value={filters.location || ''}
                    onChange={(e) => handleFilterChange('location', e.target.value)}
                    size="sm"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" color="gray.600">Listing Type</FormLabel>
                  <Select
                    value={filters.premium === undefined ? '' : filters.premium.toString()}
                    onChange={(e) => handleFilterChange('premium', e.target.value === '' ? undefined : e.target.value === 'true')}
                    size="sm"
                  >
                    <option value="">All listings</option>
                    <option value="true">Premium only</option>
                    <option value="false">Regular only</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" color="gray.600">Trade Type</FormLabel>
                  <Select
                    value={filters.barter_only === undefined ? '' : filters.barter_only.toString()}
                    onChange={(e) => handleFilterChange('barter_only', e.target.value === '' ? undefined : e.target.value === 'true')}
                    size="sm"
                  >
                    <option value="">All options</option>
                    <option value="true">Barter only</option>
                    <option value="false">Buy available</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" color="gray.600">Status</FormLabel>
                  <Select
                    value={filters.status || ''}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    size="sm"
                  >
                    <option value="available">Available</option>
                    <option value="sold">Sold</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" color="gray.600">&nbsp;</FormLabel>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearFilters}
                    w="full"
                  >
                    Clear Filters
                  </Button>
                </FormControl>
              </Grid>
            </Box>
          )}
        </VStack>
      </Box>

      {/* Main Content */}
      <Box px={8} py={6}>
        {/* Loading State */}
        {loading && !products.length && (
          <Center h="50vh">
            <VStack spacing={4}>
              <Spinner size="xl" color="brand.500" />
              <Text color="gray.600">Loading products...</Text>
            </VStack>
          </Center>
        )}

        {/* Error Display */}
        {error && (
          <Box bg="red.50" border="1px" borderColor="red.200" rounded="lg" p={6} maxW="4xl" mx="auto">
            <VStack spacing={4} align="stretch">
              <Text color="red.800" fontWeight="semibold">
                Error loading products
              </Text>
              <Text color="red.700" fontSize="sm">
                {error}
              </Text>
              <Button
                size="sm"
                colorScheme="red"
                variant="outline"
                onClick={() => searchProducts(filters)}
              >
                Retry
              </Button>
            </VStack>
          </Box>
        )}

        {/* Products Grid - Pinterest Style */}
        {!loading && products.length > 0 && (
          <Box maxW="25xl" mx="auto" mt={-6}>
            <Box
              sx={{
                columnCount: { base: 2, sm: 2, md: 2, lg: 3, xl: 4 },
                columnGap: '1rem',
              }}
            >
              {products.map(renderProductCard)}
            </Box>
          </Box>
        )}

        {/* Empty State (single, correct location) */}
        {!loading && products.length === 0 && (
          <Box textAlign="center" py={16} maxW="2xl" mx="auto">
            <VStack spacing={6}>
              <Box fontSize="6xl" color="gray.300">
                📦
              </Box>
              <VStack spacing={2}>
                <Heading size="lg" color="gray.700">
                  No products found
                </Heading>
                <Text color="gray.500" fontSize="lg">
                  {filters.keyword || filters.min_price || filters.max_price || filters.premium !== undefined || filters.status !== 'available' 
                    ? "Try adjusting your search criteria or clearing filters to see all products."
                    : "No products are currently available. Check back later!"
                  }
                </Text>
              </VStack>
              <Button
                size="lg"
                colorScheme="brand"
                onClick={clearFilters}
              >
                {filters.keyword || filters.min_price || filters.max_price || filters.premium !== undefined || filters.status !== 'available' 
                  ? "Clear All Filters"
                  : "Refresh Page"
                }
              </Button>
            </VStack>
          </Box>
        )}
      </Box>

      {/* Login Modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Sign in to Continue</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={4}>
              <Text color="gray.600">
                You need to be signed in to trade or purchase items.
              </Text>
              <HStack spacing={4} w="full">
                <Button
                  as={RouterLink}
                  to="/login"
                  colorScheme="brand"
                  flex={1}
                  onClick={onClose}
                >
                  Sign In
                </Button>
                <Button
                  as={RouterLink}
                  to="/register"
                  variant="outline"
                  flex={1}
                  onClick={onClose}
                >
                  Sign Up
                </Button>
              </HStack>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  )
}

export default Home