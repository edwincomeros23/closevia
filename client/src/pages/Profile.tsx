import React, { useState, useEffect } from 'react'
import {
  Box,
  Container,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Spinner,
  Center,
  Alert,
  AlertIcon,
  Card,
  CardBody,
  CardHeader,
  Badge,
  Avatar,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  useToast,
  useColorModeValue,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  useDisclosure,
} from '@chakra-ui/react'
import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { api } from '../services/api'
import { Product } from '../types'
import { formatPHP } from '../utils/currency'

interface UserStats {
  totalProducts: number
  activeProducts: number
  soldProducts: number
  totalOrders: number
  memberSince: string
}

const Profile: React.FC = () => {
  const { user, logout } = useAuth()
  const { getUserProducts } = useProducts()
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [userProducts, setUserProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [editForm, setEditForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
  })
  
  const toast = useToast()
  const { isOpen, onOpen, onClose } = useDisclosure()
  
  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  useEffect(() => {
    if (user) {
      fetchUserData()
    }
  }, [user])

  const fetchUserData = async () => {
    try {
      setLoading(true)
      setError('')
      
      // Fetch user's products
      const productsResponse = await getUserProducts(user!.id, 1)
      const products = productsResponse.data || []
      setUserProducts(products)
      
      // Calculate stats
      const activeProducts = products.filter(p => p.status === 'available').length
      const soldProducts = products.filter(p => p.status === 'sold').length
      const tradedProducts = products.filter(p => p.status === 'traded').length
      
      // Mock stats since we don't have orders in the current implementation
      const stats: UserStats = {
        totalProducts: products.length,
        activeProducts,
        soldProducts: soldProducts + tradedProducts, // Combine sold and traded for display
        totalOrders: 0, // Would come from orders API
        memberSince: user!.created_at,
      }
      
      setUserStats(stats)
    } catch (error: any) {
      setError(error.message || 'Failed to fetch user data')
      toast({
        title: 'Error',
        description: 'Failed to load profile data',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEditProfile = () => {
    setEditForm({
      name: user?.name || '',
      email: user?.email || '',
    })
    onOpen()
  }

  const handleSaveProfile = async () => {
    try {
      toast({
        title: 'Success',
        description: 'Profile updated successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
      onClose()
      // Refresh user data
      window.location.reload()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to update profile',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    }
  }

  const handleLogout = () => {
    logout()
    toast({
      title: 'Logged out',
      description: 'You have been successfully logged out',
      status: 'info',
      duration: 3000,
      isClosable: true,
    })
  }

  if (loading) {
    return (
      <Box bg="#FFFDF1" minH="100vh" w="100%">
        <Center h="50vh">
          <Spinner size="xl" color="brand.500" />
        </Center>
      </Box>
    )
  }

  if (error) {
    return (
      <Box bg="#FFFDF1" minH="100vh" w="100%">
        <Container maxW="container.md" py={8}>
          <Alert status="error">
            <AlertIcon />
            {error}
          </Alert>
        </Container>
      </Box>
    )
  }

  if (!user) {
    return (
      <Box bg="#FFFDF1" minH="100vh" w="100%">
        <Container maxW="container.md" py={8}>
          <Alert status="warning">
            <AlertIcon />
            Please log in to view your profile
          </Alert>
        </Container>
      </Box>
    )
  }

  return (
    <Box bg="#FFFDF1" minH="100vh" w="100%">
      <Container maxW="container.lg" py={8}>
        <VStack spacing={8} align="stretch">
          {/* Profile Header */}
          <Card bg={bgColor} border="1px" borderColor={borderColor} shadow="sm">
            <CardBody>
              <HStack spacing={6} align="start">
                <Avatar
                  size="xl"
                  name={user.name}
                  src={user.org_logo_url}
                  bg="brand.500"
                  color="white"
                />
                <VStack align="start" spacing={2} flex={1}>
                  <HStack justify="space-between" w="full">
                    <VStack align="start" spacing={1}>
                      <HStack spacing={3} flexWrap="wrap">
                        <Heading size="lg">{user.name}</Heading>
                        {user.is_organization && (
                          <Badge colorScheme="purple">Organization Verified</Badge>
                        )}
                        {user.verified && !user.is_organization && (
                          <Badge colorScheme="green">Verified</Badge>
                        )}
                        {Array.isArray(user.badges) && user.badges.map((id) => {
                          const map: Record<number, {label: string; color: string}> = {
                            1: { label: 'Top Trader', color: 'purple' },
                            2: { label: 'Fast Responder', color: 'blue' },
                            3: { label: 'Trusted Seller', color: 'green' },
                            4: { label: 'Campus Verified', color: 'teal' },
                          }
                          const meta = map[id] || { label: `Badge #${id}`, color: 'gray' }
                          return (
                            <Badge key={id} colorScheme={meta.color}>{meta.label}</Badge>
                          )
                        })}
                      </HStack>
                      <Text color="gray.600">{user.email}</Text>
                      {user.department && (
                        <Text color="gray.600">Department: {user.department}</Text>
                      )}
                      {user.bio && (
                        <Text color="gray.700">{user.bio}</Text>
                      )}
                      <HStack spacing={2}>
                        {/* badges moved near name */}
                        <Text fontSize="sm" color="gray.500">
                          Member since {new Date(user.created_at).toLocaleDateString()}
                        </Text>
                      </HStack>
                    </VStack>
                    <VStack spacing={2}>
                      <Button
                        size="sm"
                        variant="outline"
                        colorScheme="brand"
                        onClick={handleEditProfile}
                      >
                        Edit Profile
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        colorScheme="red"
                        onClick={handleLogout}
                      >
                        Logout
                      </Button>
                    </VStack>
                  </HStack>
                </VStack>
              </HStack>
            </CardBody>
          </Card>
 
          {/* Stats */}
          {userStats && (
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
              <Stat>
                <StatLabel>Total Products</StatLabel>
                <StatNumber>{userStats.totalProducts}</StatNumber>
                <StatHelpText>Listed items</StatHelpText>
              </Stat>
              <Stat>
                <StatLabel>Active Listings</StatLabel>
                <StatNumber>{userStats.activeProducts}</StatNumber>
                <StatHelpText>Available for sale</StatHelpText>
              </Stat>
              <Stat>
                <StatLabel>Sold Items</StatLabel>
                <StatNumber>{userStats.soldProducts}</StatNumber>
                <StatHelpText>Completed sales</StatHelpText>
              </Stat>
              <Stat>
                <StatLabel>Total Orders</StatLabel>
                <StatNumber>{userStats.totalOrders}</StatNumber>
                <StatHelpText>Purchases made</StatHelpText>
              </Stat>
            </SimpleGrid>
          )}
 
          {/* Recent Products */}
          <Card bg={bgColor} border="1px" borderColor={borderColor} shadow="sm">
            <CardHeader>
              <Heading size="md">Recent Products</Heading>
            </CardHeader>
            <CardBody>
              {userProducts.length === 0 ? (
                <Box textAlign="center" py={8}>
                  <Text color="gray.500" mb={4}>
                    You haven't listed any products yet
                  </Text>
                  <Button colorScheme="brand" onClick={() => window.location.href = '/add-product'}>
                    List Your First Product
                  </Button>
                </Box>
              ) : (
                <VStack spacing={4} align="stretch">
                  {userProducts.slice(0, 5).map((product) => (
                    <Box
                      key={product.id}
                      p={4}
                      border="1px"
                      borderColor={borderColor}
                      borderRadius="md"
                      _hover={{ bg: 'gray.50' }}
                      cursor="pointer"
                      onClick={() => window.location.href = `/products/${product.id}`}
                    >
                      <HStack justify="space-between">
                        <VStack align="start" spacing={1}>
                          <Text fontWeight="semibold">{product.title}</Text>
                          <Text fontSize="sm" color="gray.600">
                            {product.price ? formatPHP(product.price) : 'Barter only'}
                          </Text>
                        </VStack>
                        <Badge
                          colorScheme={
                            product.status === 'available' 
                              ? 'green' 
                              : product.status === 'traded' 
                              ? 'blue' 
                              : 'red'
                          }
                        >
                          {product.status}
                        </Badge>
                      </HStack>
                    </Box>
                  ))}
                  {userProducts.length > 5 && (
                    <Button
                      variant="outline"
                      colorScheme="brand"
                      onClick={() => window.location.href = '/dashboard'}
                    >
                      View All Products
                    </Button>
                  )}
                </VStack>
              )}
            </CardBody>
          </Card>
        </VStack>
 
        {/* Edit Profile Modal */}
        <Modal isOpen={isOpen} onClose={onClose}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Edit Profile</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack spacing={4}>
                <FormControl>
                  <FormLabel>Name</FormLabel>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Email</FormLabel>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                  />
                </FormControl>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={onClose}>
                Cancel
              </Button>
              <Button colorScheme="brand" onClick={handleSaveProfile}>
                Save Changes
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Container>
    </Box>
   )
 }
 
 export default Profile
