import React, { useState, useEffect } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box,
  Container,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  SimpleGrid,
  Card,
  CardBody,
  CardHeader,
  CardFooter,
  Badge,
  Image,
  Flex,
  Spinner,
  Center,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  useToast,
  IconButton,
  Avatar,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  Icon,
  Stack,
} from '@chakra-ui/react'
import { AddIcon, EditIcon, DeleteIcon, BellIcon, SettingsIcon, WarningIcon, ChevronLeftIcon, ChevronRightIcon, CheckIcon, CloseIcon } from '@chakra-ui/icons'
import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { Product, Order } from '../types'
import { api } from '../services/api'
import { FaHandshake } from 'react-icons/fa'
import { formatPHP } from '../utils/currency'
import { getFirstImage } from '../utils/imageUtils'

const Dashboard: React.FC = () => {
  const { user } = useAuth()
  const { getUserProducts, deleteProduct } = useProducts()
  const navigate = useNavigate()
  const [userProducts, setUserProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [tradedItems, setTradedItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [tradedCurrentPage, setTradedCurrentPage] = useState(1)
  const itemsPerPage = 12
  const [popupOpen, setPopupOpen] = useState(false)
  const [popupConfig, setPopupConfig] = useState<any>(null)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [unreadOffers, setUnreadOffers] = useState(0)
  const toast = useToast()

  useEffect(() => {
    if (user) {
      fetchUserData()
    }
  }, [user])

  const fetchUserData = async () => {
    if (!user) return
    
    setLoading(true)
    try {
      // Fetch user products
      const productsResponse = await getUserProducts(user.id)
      const allProducts = productsResponse.data
      
      // Separate available and traded items
      const availableProducts = allProducts.filter(p => p.status === 'available')
      const tradedProducts = allProducts.filter(p => p.status === 'traded' || p.status === 'sold')
      
      setUserProducts(availableProducts)
      setTradedItems(tradedProducts)

      // Fetch user orders
      const ordersResponse = await api.get('/api/orders?type=bought')
      setOrders(ordersResponse.data.data.data)

      // Fetch notification counts
      await fetchNotificationCounts()
    } catch (error) {
      console.error('Failed to fetch user data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchNotificationCounts = async () => {
    try {
      // Fetch unread notifications count
      const notificationsResponse = await api.get('/api/notifications?unread=true')
      setUnreadNotifications(notificationsResponse.data.data?.length || 0)

      // Fetch pending offers count
      const offersResponse = await api.get('/api/trades?direction=incoming')
      const pendingOffers = offersResponse.data.data?.filter((offer: any) => offer.status === 'pending') || []
      setUnreadOffers(pendingOffers.length)
    } catch (error) {
      console.error('Failed to fetch notification counts:', error)
    }
  }

  const showPopup = (config: any) => {
    setPopupConfig(config)
    setPopupOpen(true)
  }

  const handleDeleteProductClick = (product: Product) => {
    setProductToDelete(product)
    showPopup({
      type: 'warning',
      title: 'Delete Product',
      message: `Are you sure you want to delete "${product.title}"? All offers and related data for this item will be permanently removed.`,
      confirmText: 'Delete Product',
      cancelText: 'Cancel',
      onConfirm: () => handleConfirmDelete(),
      onCancel: () => setPopupOpen(false),
      icon: WarningIcon,
      confirmColorScheme: 'red'
    })
  }

  const handleConfirmDelete = async () => {
    if (!productToDelete) return
    
    try {
      setDeleting(true)
      await deleteProduct(productToDelete.id)
      setUserProducts(prev => prev.filter(p => p.id !== productToDelete.id))
      setTradedItems(prev => prev.filter(p => p.id !== productToDelete.id))
      
      setPopupOpen(false)
      showPopup({
        type: 'success',
        title: 'Product Deleted',
        message: `"${productToDelete.title}" has been successfully deleted along with all associated offers.`,
        confirmText: 'OK',
        onConfirm: () => setPopupOpen(false),
        icon: CheckIcon,
        confirmColorScheme: 'green'
      })
      
      setProductToDelete(null)
      } catch (error: any) {
      setPopupOpen(false)
      showPopup({
        type: 'error',
        title: 'Delete Failed',
        message: error.message || 'Failed to delete the product. Please try again.',
        confirmText: 'OK',
        onConfirm: () => setPopupOpen(false),
        icon: CloseIcon,
        confirmColorScheme: 'red'
      })
    } finally {
      setDeleting(false)
    }
  }

  // Pagination helper functions
  const getPaginatedItems = (items: Product[], currentPage: number) => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return items.slice(startIndex, endIndex)
  }

  const getTotalPages = (items: Product[]) => {
    return Math.ceil(items.length / itemsPerPage)
  }

  const PaginationControls = ({ 
    currentPage, 
    totalPages, 
    onPageChange, 
    itemsCount 
  }: { 
    currentPage: number
    totalPages: number
    onPageChange: (page: number) => void
    itemsCount: number
  }) => {
    if (itemsCount <= itemsPerPage) return null

    return (
      <HStack spacing={2} justify="center" mt={6}>
        <Button
          size="sm"
          variant="outline"
          leftIcon={<ChevronLeftIcon />}
          onClick={() => onPageChange(currentPage - 1)}
          isDisabled={currentPage === 1}
          _hover={{ bg: 'gray.50' }}
        >
          Previous
        </Button>
        
        <HStack spacing={1}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <Button
              key={page}
              size="sm"
              variant={page === currentPage ? 'solid' : 'outline'}
              colorScheme={page === currentPage ? 'brand' : 'gray'}
              onClick={() => onPageChange(page)}
              minW="40px"
              _hover={{ bg: page === currentPage ? 'brand.600' : 'gray.50' }}
            >
              {page}
            </Button>
          ))}
        </HStack>
        
        <Button
          size="sm"
          variant="outline"
          rightIcon={<ChevronRightIcon />}
          onClick={() => onPageChange(currentPage + 1)}
          isDisabled={currentPage === totalPages}
          _hover={{ bg: 'gray.50' }}
        >
          Next
        </Button>
      </HStack>
    )
  }

  // Reusable Product Card Component
  const ProductCard = ({ product, showActions = true }: { product: Product, showActions?: boolean }) => {
    // Never show actions for traded/sold items
    const shouldShowActions = showActions && product.status !== 'traded' && product.status !== 'sold'
    
    return (
    <Card 
      key={product.id}
      variant="outline"
      _hover={{ 
        shadow: "md",
        transform: "translateY(-2px)",
        transition: "all 0.2s ease"
      }}
      transition="all 0.2s ease"
    >
      <Image
        src={getFirstImage(product.image_urls)}
        alt={product.title}
        w="full"
        h="120px"
        borderRadius="lg"
        objectFit="cover"
        loading="lazy"
        fallbackSrc="https://via.placeholder.com/300x200?text=No+Image"
      />
      <CardHeader pb={2}>
        <Flex justify="space-between" align="start">
          <Heading size="sm" noOfLines={2} flex={1} mr={2}>
            {product.title}
          </Heading>
          {product.premium && (
            <Badge colorScheme="yellow" variant="solid" fontSize="xs">
              Premium
            </Badge>
          )}
        </Flex>
        <Text color="gray.600" noOfLines={2} fontSize="sm">
          {product.description}
        </Text>
      </CardHeader>
      <CardBody pt={0}>
        <VStack spacing={2} align="stretch">
          <HStack justify="space-between" align="center">
            <Text fontSize="md" fontWeight="semibold" color="brand.500">
              {product.allow_buying && !product.barter_only && product.price
                ? formatPHP(product.price)
                : ''}
            </Text>
          </HStack>
          <HStack spacing={1} align="center" flexWrap="wrap">
            <Badge
              colorScheme={product.status === 'available' ? 'green' : 'orange'}
              variant="subtle"
              fontSize="2xs"
              px={1.5}
              py={0.5}
              borderRadius="sm"
            >
              {product.status}
            </Badge>
            {product.barter_only && (
              <Badge 
                colorScheme="purple" 
                variant="subtle"
                fontSize="2xs"
                px={1.5}
                py={0.5}
                borderRadius="sm"
              >
                Barter Only
              </Badge>
            )}
          </HStack>
        </VStack>
      </CardBody>
      {shouldShowActions && (
        <CardFooter pt={0}>
          <HStack spacing={2} w="full">
            <Button
              as={RouterLink}
              to={`/edit-product/${product.id}`}
              leftIcon={<EditIcon />}
              variant="outline"
              colorScheme="brand"
              size="sm"
              flex={1}
            >
              Edit
            </Button>
            <Button
              leftIcon={<DeleteIcon />}
              variant="outline"
              colorScheme="red"
              size="sm"
              flex={1}
              onClick={() => handleDeleteProductClick(product)}
            >
              Delete
            </Button>
          </HStack>
        </CardFooter>
      )}
    </Card>
    )
  }

  // Reusable Popup Component
  const PopupModal = () => {
    if (!popupConfig) return null

    const getColorScheme = () => {
      switch (popupConfig.type) {
        case 'success': return 'green'
        case 'warning': return 'orange'
        case 'error': return 'red'
        default: return 'blue'
      }
    }

    const getIconColor = () => {
      switch (popupConfig.type) {
        case 'success': return 'green.500'
        case 'warning': return 'orange.500'
        case 'error': return 'red.500'
        default: return 'blue.500'
      }
    }

    return (
      <Modal isOpen={popupOpen} onClose={() => setPopupOpen(false)} size="sm" isCentered>
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <ModalContent
          bg="white"
          borderRadius="xl"
          boxShadow="xl"
          mx={4}
        >
          <ModalBody p={6} textAlign="center">
            <VStack spacing={4}>
              <Icon as={popupConfig.icon} color={getIconColor()} boxSize={8} />
              <VStack spacing={2}>
                <Text fontWeight="bold" fontSize="lg" color="gray.800">
                  {popupConfig.title}
                </Text>
                <Text fontSize="sm" color="gray.600" textAlign="center">
                  {popupConfig.message}
                </Text>
              </VStack>
              
              <HStack spacing={3} w="full">
                {popupConfig.cancelText && (
                  <Button
                    variant="outline"
                    size="md"
                    flex={1}
                    onClick={popupConfig.onCancel}
                    isDisabled={deleting}
                  >
                    {popupConfig.cancelText}
                  </Button>
                )}
                <Button
                  colorScheme={popupConfig.confirmColorScheme || getColorScheme()}
                  size="md"
                  flex={1}
                  onClick={popupConfig.onConfirm}
                  isLoading={deleting}
                  loadingText="Processing..."
                  leftIcon={popupConfig.type === 'success' ? <CheckIcon /> : undefined}
                >
                  {popupConfig.confirmText}
                </Button>
              </HStack>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    )
  }

  if (loading) {
    return (
      <Center h="50vh">
        <Spinner size="xl" color="brand.500" />
      </Center>
    )
  }

  return (
    <Container maxW="container.xl" py={8} bg="#FFFDF1" minH="100vh">
      <VStack spacing={8} align="stretch">
        {/* Header + Action in one row */}
        <Flex
          align="center"
          justify="space-between"
          rounded="lg"
          flexWrap="wrap"
        >
          <Box textAlign="left" mr={4}>
            <Heading size="md" color="brand.500" mb={2}>
              Welcome, {user?.name}!
            </Heading>
            <Text color="gray.600">
              Manage your products, orders, and profile
            </Text>
          </Box>

          <Box>
            <HStack spacing={3} align="center">
              <Button
                as={RouterLink}
                to="/add-product"
                leftIcon={<AddIcon />}
                size="lg"
              >
                Add New Product
              </Button>

              <Box position="relative">
              <IconButton
                aria-label="Notifications"
                icon={<BellIcon />}
                size="lg"
                variant="ghost"
              />

              <Box position="relative">
              <IconButton
                  aria-label="Offers"
                  icon={<Icon as={FaHandshake} />}
                size="lg"
                variant="ghost"
              />

              <Avatar name={user?.name || 'User'} size="sm" />
            </HStack>
          </Box>
        </Flex>

        {/* Stats */}
        <SimpleGrid columns={{ base: 1, md: 4 }} spacing={6}>
          <Card>
            <CardBody textAlign="center">
              <Stat>
                <StatLabel>Available Items</StatLabel>
                <StatNumber color="green.500">{userProducts.length}</StatNumber>
                <StatHelpText>Active listings</StatHelpText>
              </Stat>
            </CardBody>
          </Card>
          
          <Card>
            <CardBody textAlign="center">
              <Stat>
                <StatLabel>Traded Items</StatLabel>
                <StatNumber color="orange.500">{tradedItems.length}</StatNumber>
                <StatHelpText>Completed exchanges</StatHelpText>
              </Stat>
            </CardBody>
          </Card>
          
          <Card>
            <CardBody textAlign="center">
              <Stat>
                <StatLabel>Premium Listings</StatLabel>
                <StatNumber color="yellow.500">{userProducts.filter(p => p.premium).length}</StatNumber>
                <StatHelpText>Featured products</StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card>
            <CardBody textAlign="center">
              <Stat>
                <StatLabel>Total Items</StatLabel>
                <StatNumber color="blue.500">{userProducts.length + tradedItems.length}</StatNumber>
                <StatHelpText>All products</StatHelpText>
              </Stat>
            </CardBody>
          </Card>
        </SimpleGrid>

        {/* Quick Actions */}

        {/* Tabs */}
        <Box bg="white" rounded="lg" shadow="sm">
          <Tabs index={activeTab} onChange={setActiveTab}>
            <TabList>
              <Tab>My Products</Tab>
              <Tab>My Traded/Bartered Items</Tab>
            </TabList>

            <TabPanels>
              {/* Products Tab */}
              <TabPanel>
                <VStack spacing={6} align="stretch">
                  {/* Available Items Section */}
                  <Box>
                    <HStack justify="space-between" align="center" mb={4}>
                      <Heading size="md" color="green.600">
                        Available Items ({userProducts.length})
                  </Heading>
                      <Badge colorScheme="green" variant="subtle" px={3} py={1}>
                        Active Listings
                      </Badge>
                    </HStack>
                  
                  {userProducts.length === 0 ? (
                      <Box 
                        textAlign="center" 
                        py={8} 
                        bg="green.50" 
                        borderRadius="lg" 
                        border="1px dashed" 
                        borderColor="green.200"
                      >
                      <Text color="gray.500" mb={4}>
                          You don't have any active listings yet.
                      </Text>
                      <Button
                        as={RouterLink}
                        to="/add-product"
                          colorScheme="green"
                        leftIcon={<AddIcon />}
                      >
                        Add Your First Product
                      </Button>
                    </Box>
                  ) : (
                    <SimpleGrid columns={{ base: 1, md: 2, lg: 5 }} spacing={6}>
                      {userProducts.map((product) => (
                        <Card key={product.id}>
                          <Image
                            src={getFirstImage(product.image_urls)}
                            alt={product.title}
                            w="full"
                            h="auto"
                            loading="lazy"
                            fallbackSrc="https://via.placeholder.com/300x200?text=No+Image"
                          />
                          <CardHeader>
                            <Flex justify="space-between" align="start">
                              <Heading size="md" noOfLines={2}>
                                {product.title}
                              </Heading>
                              {product.premium && (
                                <Badge colorScheme="yellow">Premium</Badge>
                              )}
                            </Flex>
                            <Text color="gray.600" noOfLines={2}>
                              {product.description}
                            </Text>
                          </CardHeader>
                          <CardBody pt={0}>
                            <Text fontSize="2xl" fontWeight="bold" color="brand.500">
                              {product.allow_buying && !product.barter_only && product.price
                                ? `₱${product.price.toFixed(2)}`
                                : 'Barter Only'}
                            </Text>
                            <HStack mt={2}>
                              <Badge
                                colorScheme={
                                  product.status === 'available'
                                    ? 'green'
                                    : product.status === 'locked'
                                    ? 'orange'
                                    : 'red'
                                }
                              >
                                {product.status}
                              </Badge>
                              {product.condition && (
                                <Badge colorScheme="blue">{product.condition}</Badge>
                              )}
                              {product.category && (
                                <Badge colorScheme="purple">{product.category}</Badge>
                              )}
                            </HStack>
                            {product.suggested_value && product.suggested_value > 0 && (
                              <Text fontSize="sm" color="gray.600" mt={1}>
                                {product.suggested_value} points
                              </Text>
                            )}
                          </CardBody>
                          <CardFooter>
                            <HStack spacing={2} w="full">
                              <Button
                                as={RouterLink}
                                to={`/edit-product/${product.id}`}
                                leftIcon={<EditIcon />}
                                variant="outline"
                                colorScheme="brand"
                                size="sm"
                                flex={1}
                              >
                                Edit
                              </Button>
                              <Button
                                leftIcon={<DeleteIcon />}
                                variant="outline"
                                colorScheme="red"
                                size="sm"
                                flex={1}
                                onClick={() => handleDeleteProduct(product.id)}
                              >
                                Delete
                              </Button>
                            </HStack>
                          </CardFooter>
                        </Card>
                      ))}
                    </SimpleGrid>
                        <PaginationControls
                          currentPage={currentPage}
                          totalPages={getTotalPages(userProducts)}
                          onPageChange={setCurrentPage}
                          itemsCount={userProducts.length}
                        />
                      </>
                    )}
                  </Box>

                </VStack>
              </TabPanel>

              {/* Traded/Bartered Items Tab */}
              <TabPanel>
                <VStack spacing={6} align="stretch">
                  <Box>
                    <HStack justify="space-between" align="center" mb={4}>
                      <Heading size="md" color="blue.600">
                        My Traded/Bartered Items ({tradedItems.length})
                  </Heading>
                      <Badge colorScheme="blue" variant="subtle" px={3} py={1}>
                        Exchange History
                      </Badge>
                    </HStack>
                    
                    {tradedItems.length === 0 ? (
                      <Box 
                        textAlign="center" 
                        py={12} 
                        bg="blue.50" 
                        borderRadius="lg" 
                        border="1px dashed" 
                        borderColor="blue.200"
                      >
                        <Text color="gray.500" fontSize="lg" mb={2}>
                          No completed trades yet
                        </Text>
                        <Text color="gray.400" fontSize="sm">
                          Start trading to see your exchange history here!
                      </Text>
                    </Box>
                  ) : (
                    <VStack spacing={4} align="stretch">
                      {orders.map((order) => (
                        <Card key={order.id}>
                          <CardBody>
                            <Flex justify="space-between" align="center">
                              <VStack align="start" spacing={2}>
                                <Text fontWeight="bold">
                                  {order.product?.title}
                                </Text>
                                <Text color="gray.600">
                                  ₱{order.product?.price ? order.product.price.toFixed(2) : '0.00'}
                                </Text>
                                <Text fontSize="sm" color="gray.500">
                                  Ordered on {new Date(order.created_at).toLocaleDateString()}
                                </Text>
                              </VStack>
                              <Badge
                                colorScheme={
                                  order.status === 'completed' ? 'green' :
                                  order.status === 'cancelled' ? 'red' : 'yellow'
                                }
                                size="lg"
                              >
                                {order.status}
                              </Badge>
                            </Flex>
                          </CardBody>
                        </Card>
                      ))}
                    </VStack>
                  )}
                </VStack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Box>

        {/* Popup Modal System */}
        <PopupModal />
      </VStack>
    </Container>
  )
}

export default Dashboard
