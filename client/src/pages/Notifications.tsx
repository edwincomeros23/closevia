import React, { useState, useEffect } from 'react'
import {
  Box,
  Container,
  VStack,
  HStack,
  Input,
  Heading,
  Text,
  Badge,
  Spinner,
  Center,
  Alert,
  AlertIcon,
  Card,
  CardBody,
  CardHeader,
  Button,
  useToast,
  useColorModeValue,
  Flex,
} from '@chakra-ui/react'
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons'
import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { getFirstImage } from '../utils/imageUtils'
import { formatPHP } from '../utils/currency'
import { api } from '../services/api'

interface Notification {
  id: number
  user_id: number
  message: string
  type: string
  read: boolean
  created_at: string
  data?: any
}

const Notifications: React.FC = () => {
  const { user } = useAuth()
  const { products } = useProducts()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [query, setQuery] = useState('')
  const itemsPerPage = 5
  const toast = useToast()
  // dev helper: when true, show multiple pages for testing even if there are no notifications
  const DEV_SHOW_PAGES_ALWAYS = true
  
  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  // page background color (applies to entire viewport behind the container)
  const pageBg = '#FFFDF1'

  useEffect(() => {
    if (user) {
      fetchNotifications()
    }
  }, [user])

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      setCurrentPage(1)
      setError('')
      const response = await api.get('/api/notifications')
      const list: Notification[] = Array.isArray(response.data?.data) ? response.data.data : []
      setNotifications(list)
    } catch (error: any) {
      setError(error.message || 'Failed to fetch notifications')
      toast({
        title: 'Error',
        description: 'Failed to load notifications',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notificationId: number) => {
    try {
      await api.put(`/api/notifications/${notificationId}/read`)
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId ? { ...notif, read: true } : notif
        )
      )
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to mark notification as read',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    }
  }

  const markAllAsRead = async () => {
    try {
      await api.put('/api/notifications/read-all')
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, read: true }))
      )
      toast({
        title: 'Success',
        description: 'All notifications marked as read',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to mark all notifications as read',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order':
        return '📦'
      case 'product':
        return '🛍️'
      case 'trade_offer':
        return '🔄'
      case 'trade_update':
        return '🔁'
      case 'system':
        return '🔔'
      default:
        return '📢'
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'order':
        return 'blue'
      case 'product':
        return 'green'
      case 'trade_offer':
        return 'purple'
      case 'trade_update':
        return 'orange'
      case 'system':
        return 'purple'
      default:
        return 'gray'
    }
  }

  if (loading) {
    return (
      <Center h="50vh">
        <Spinner size="xl" color="brand.500" />
      </Center>
    )
  }

  if (error) {
    return (
      <Container maxW="container.md" py={8}>
        <Alert status="error">
          <AlertIcon />
          {error}
        </Alert>
      </Container>
    )
  }

  // apply a simple case-insensitive filter by message or type
  const filtered = notifications.filter(n => {
    if (!query) return true
    const q = query.toLowerCase()
    if ((n.message || '').toLowerCase().includes(q)) return true
    if ((n.type || '').toLowerCase().includes(q)) return true

    // match against product titles from product context
    try {
      // find product IDs whose titles match the query
      const matchingProductIds = new Set<number>()
      for (const p of (products || [])) {
        if (p && p.title && typeof p.title === 'string' && p.title.toLowerCase().includes(q)) {
          matchingProductIds.add(p.id)
        }
      }

      // check if notification data contains a product_id or embedded product that matches
      const data = n.data as any
      if (data) {
        if (typeof data.product_id === 'number' && matchingProductIds.has(data.product_id)) return true
        if (data.product && typeof data.product.id === 'number' && matchingProductIds.has(data.product.id)) return true
        if (data.product && typeof data.product.title === 'string' && data.product.title.toLowerCase().includes(q)) return true
      }
    } catch (err) {
      // ignore product matching errors
    }

    return false
  })

  const unreadCount = filtered.filter(n => !n.read).length
  const totalPagesInitial = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const totalPages = (DEV_SHOW_PAGES_ALWAYS && totalPagesInitial === 1) ? 5 : totalPagesInitial
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  // If the query looks like a product search, prepare matching products to show in the empty state
  const matchingProducts = (query && products && products.length > 0)
    ? products.filter((p: any) => p && p.title && p.title.toLowerCase().includes(query.toLowerCase()))
    : []

  return (
    // outer Box sets the viewport background color requested
    <Box minH="100vh" bg={pageBg} py={8}>
      <Container maxW="container.md" py={0}>
        <VStack spacing={6} align="stretch">
          {/* Header + Actions in one row: title + compact subtext on left, actions on right */}
          <Flex align="center" justify="space-between" flexWrap="wrap">
            <VStack align="start" spacing={1} minW={0}>
              <Heading size="md" color="brand.500" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                Notifications
              </Heading>
              <Text color="gray.600" fontSize="sm" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                {unreadCount > 0 ? `${unreadCount} unread${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
              </Text>
            </VStack>

            <HStack spacing={3} align="center" mt={{ base: 3, md: 0 }}>
              <Input
                placeholder="Search products or notifications..."
                size="sm"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setCurrentPage(1) }}
                w={{ base: '160px', md: '240px' }}
                bg={useColorModeValue('gray.50', 'gray.700')}
              />
              {unreadCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  colorScheme="brand"
                  onClick={markAllAsRead}
                >
                  Mark All as Read
                </Button>
              )}
            </HStack>
          </Flex>

          

          {/* Notifications List */}
          <VStack spacing={4} align="stretch">
            {paginated.length === 0 ? (
              matchingProducts.length > 0 ? (
                <VStack spacing={4} align="stretch">
                  {matchingProducts.map((p: any) => (
                    <Card key={p.id} bg={bgColor} border="1px" borderColor={borderColor} shadow="sm">
                      <CardBody>
                        <HStack spacing={4} align="center">
                          <Box boxSize="72px">
                            <img src={getFirstImage(p.image_urls)} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} />
                          </Box>
                          <VStack align="start" spacing={1} flex={1}>
                            <Heading size="sm">{p.title}</Heading>
                            <Text fontSize="sm" color="gray.600" noOfLines={2}>{p.description}</Text>
                            <HStack>
                              {p.allow_buying && p.price ? (
                                <Text fontWeight="bold" color="brand.500">{formatPHP(p.price)}</Text>
                              ) : (
                                <Badge colorScheme="green">Barter</Badge>
                              )}
                              <Button size="sm" variant="outline" onClick={() => window.location.href = `/products/${p.id}`}>View</Button>
                            </HStack>
                          </VStack>
                        </HStack>
                      </CardBody>
                    </Card>
                  ))}
                </VStack>
              ) : (
                <Box textAlign="center" py={12}>
                  <Text fontSize="lg" color="gray.500" mb={4}>
                    No notifications yet
                  </Text>
                  <Text color="gray.400">
                    We'll notify you about orders, messages, and important updates here.
                  </Text>
                </Box>
              )
            ) : (
              paginated.map((notification) => (
                <Card
                  key={notification.id}
                  bg={bgColor}
                  border="1px"
                  borderColor={borderColor}
                  shadow="sm"
                  opacity={notification.read ? 0.7 : 1}
                  transition="all 0.2s"
                  _hover={{ shadow: 'md' }}
                >
                  <CardHeader pb={2}>
                    <HStack justify="space-between" align="start">
                      <HStack spacing={3} align="start">
                        <Text fontSize="2xl">
                          {getNotificationIcon(notification.type)}
                        </Text>
                        <VStack align="start" spacing={1}>
                          <HStack spacing={2}>
                            <Text fontWeight="semibold" fontSize="md">
                              {notification.type.replace('_', ' ').toUpperCase()}
                            </Text>
                            {!notification.read && (
                              <Badge colorScheme="red" size="sm">
                                New
                              </Badge>
                            )}
                          </HStack>
                          <Badge colorScheme={getNotificationColor(notification.type)} size="sm">
                            {notification.type}
                          </Badge>
                        </VStack>
                      </HStack>
                      <Text fontSize="sm" color="gray.500">
                        {new Date(notification.created_at).toLocaleDateString()}
                      </Text>
                    </HStack>
                  </CardHeader>
                  
                  <CardBody pt={0}>
                    <Text color="gray.700" mb={4}>{notification.message}</Text>
                    
                    {!notification.read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        colorScheme="brand"
                        onClick={() => markAsRead(notification.id)}
                      >
                        Mark as Read
                      </Button>
                    )}
                  </CardBody>
                </Card>
              ))
            )}

            {/* Pagination Controls are rendered below the Container for spacing */}
          </VStack>
        </VStack>
      </Container>

      {/* Lower pagination placed after content so it appears further down the page */}
      {/* Floating pagination bar anchored bottom-right */}
      <HStack
        position="fixed"
        bottom={{ base: 6, md: 10 }}
        left="50%"
        transform="translateX(-50%)"
        bg="white"
        boxShadow="md"
        borderRadius="md"
        px={3}
        py={2}
        spacing={2}
        zIndex={50}
      >
        <Button size="sm" variant="outline" leftIcon={<ChevronLeftIcon />} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} isDisabled={currentPage === 1}>Previous</Button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
          <Button key={p} size="sm" variant={p === currentPage ? 'solid' : 'outline'} onClick={() => setCurrentPage(p)}>{p}</Button>
        ))}
        <Button size="sm" variant="outline" rightIcon={<ChevronRightIcon />} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} isDisabled={currentPage === totalPages}>Next</Button>
      </HStack>
    </Box>
  )
}

export default Notifications
