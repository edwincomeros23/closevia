import React, { useState, useEffect } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Container,
  VStack,
  HStack,
  Input,
  Heading,
  Text,
  Badge,
  Alert,
  AlertIcon,
  Card,
  CardBody,
  CardHeader,
  Button,
  useToast,
  useColorModeValue,
  Flex,
  Image as ChakraImage,
  IconButton,
  Skeleton,
  SkeletonText,
} from '@chakra-ui/react'
import { ChevronLeftIcon, ChevronRightIcon, AddIcon } from '@chakra-ui/icons'
import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { useRealtime } from '../contexts/RealtimeContext'
import { getFirstImage } from '../utils/imageUtils'
import { formatPHP } from '../utils/currency'
import { getProductUrl } from '../utils/productUtils'
import { api } from '../services/api'
import FloatingTab from '../components/FloatingTab'

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
  const { refreshCounts } = useRealtime()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [query, setQuery] = useState('')
  const [paginationStartPage, setPaginationStartPage] = useState(1)
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
      const endpoint = user?.role === 'admin' ? '/api/notifications?type=report' : '/api/notifications'
      const cacheKey = `clovia_notifications_cache_${user?.role || 'user'}`

      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed)) {
            setNotifications(parsed)
          }
        }
      } catch {
        // ignore cache parsing errors
      }

      fetchNotifications(endpoint, cacheKey)
    } else {
      setInitialLoading(false)
    }
  }, [user])

  const fetchNotifications = async (endpointArg?: string, cacheKeyArg?: string) => {
    const endpoint = endpointArg || (user?.role === 'admin' ? '/api/notifications?type=report' : '/api/notifications')
    const cacheKey = cacheKeyArg || `clovia_notifications_cache_${user?.role || 'user'}`

    try {
      if (notifications.length === 0) {
        setLoading(true)
      }
      setError('')
      const response = await api.get(endpoint)
      const list: Notification[] = Array.isArray(response.data?.data) ? response.data.data : []
      setNotifications(list)
      try {
        localStorage.setItem(cacheKey, JSON.stringify(list))
      } catch {
        // ignore cache write errors
      }
    } catch (error: any) {
      setError(error.message || 'Failed to fetch notifications')
      toast({
        id: "notifications-error",
        title: 'Error',
        description: 'Failed to load notifications',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    } finally {
      setLoading(false)
      setInitialLoading(false)
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
      refreshCounts()
    } catch (error: any) {
      toast({
        id: "notifications-error-2",
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
      refreshCounts()
      toast({
        id: "notifications-success",
        title: 'Success',
        description: 'All notifications marked as read',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
    } catch (error: any) {
      toast({
        id: "notifications-error-3",
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
        return '�'
      case 'trade_update':
        return '🔄'
      case 'trade_loop':
        return '🔁'
      case 'similar_item':
        return '💡'
      case 'popular_item':
        return '🔥'
      case 'report':
        return '🚨'
      case 'system':
        return '⚙️'
      case 'trade_loop':
        return '🔄'
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
        return 'cyan'
      case 'trade_update':
        return 'orange'
      case 'trade_loop':
        return 'purple'
      case 'similar_item':
        return 'teal'
      case 'popular_item':
        return 'red'
      case 'report':
        return 'red'
      case 'system':
        return 'purple'
      case 'trade_loop':
        return 'purple'
      default:
        return 'gray'
    }
  }

  if (loading && initialLoading && notifications.length === 0) {
    return (
      <Box minH="100vh" bg={pageBg} py={8}>
        <Container maxW="container.md" py={0}>
          <VStack spacing={6} align="stretch">
            <Flex align="center" justify="space-between" flexWrap="wrap">
              <VStack align="start" spacing={1} minW={0}>
                <Skeleton height="28px" width="180px" />
                <Skeleton height="16px" width="120px" />
              </VStack>
              <HStack spacing={3} mt={{ base: 3, md: 0 }}>
                <Skeleton height="32px" width={{ base: '140px', md: '240px' }} />
              </HStack>
            </Flex>

            <VStack spacing={4} align="stretch">
              {[1, 2, 3].map((n) => (
                <Card key={n} bg={bgColor} border="1px" borderColor={borderColor} shadow="sm">
                  <CardHeader pb={2}>
                    <HStack justify="space-between" align="start">
                      <HStack spacing={3} align="start" flex={1}>
                        <Skeleton height="32px" width="32px" borderRadius="md" />
                        <VStack align="start" spacing={2} flex={1}>
                          <Skeleton height="16px" width="120px" />
                          <Skeleton height="14px" width="70px" />
                        </VStack>
                      </HStack>
                      <Skeleton height="14px" width="84px" />
                    </HStack>
                  </CardHeader>
                  <CardBody pt={0}>
                    <SkeletonText noOfLines={2} spacing="2" mb={4} />
                    <Skeleton height="30px" width="110px" borderRadius="md" />
                  </CardBody>
                </Card>
              ))}
            </VStack>
          </VStack>
        </Container>
        <FloatingTab />
      </Box>
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

  // Pagination controls: show 3 pages at a time
  const paginationWindowSize = 3
  const maxStartPage = Math.max(1, totalPages - paginationWindowSize + 1)
  const visiblePages = Array.from(
    { length: Math.min(paginationWindowSize, totalPages) },
    (_, i) => paginationStartPage + i
  )

  const handlePreviousPagination = () => {
    setPaginationStartPage(prev => Math.max(1, prev - 1))
  }

  const handleNextPagination = () => {
    setPaginationStartPage(prev => Math.min(maxStartPage, prev + 1))
  }

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
                {user?.role === 'admin' ? 'User Reports' : 'Notifications'}
              </Heading>
              <Text color="gray.600" fontSize="sm" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                {unreadCount > 0 ? `${unreadCount} unread${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
              </Text>
            </VStack>

            <HStack spacing={3} align="center" mt={{ base: 3, md: 0 }} flexWrap="wrap">
              <Input
                placeholder="Search..."
                size="sm"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setCurrentPage(1); setPaginationStartPage(1) }}
                w={{ base: '140px', md: '240px' }}
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
                            <ChakraImage src={getFirstImage(p.image_urls)} alt={p.title} width="100%" height="100%" objectFit="cover" borderRadius="6px" />
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
                              <Button size="sm" variant="outline" onClick={() => {
                                window.location.href = getProductUrl(p)
                              }}>View</Button>
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
                    {user?.role === 'admin' ? 'No user reports yet' : 'No notifications yet'}
                  </Text>
                  <Text color="gray.400">
                    {user?.role === 'admin'
                      ? "You'll be notified here when a user reports another user."
                      : "We'll notify you about orders, messages, and important updates here."}
                  </Text>
                </Box>
              )
            ) : (
              paginated.map((notification) => {
                // Determine redirect path based on notification type/data
                let redirectPath = null;
                if (notification.type === 'trade_offer' || notification.type === 'trade_update') {
                  // Example: redirect to offers/buyout or trade details
                  if (notification.data && notification.data.trade_id) {
                    redirectPath = `/offers/buyout/${notification.data.trade_id}`;
                  } else {
                    redirectPath = '/offers/buyout';
                  }
                } else if (notification.type === 'similar_item' || notification.type === 'popular_item') {
                  // For product notifications, redirect to browse/search
                  redirectPath = '/browse';
                } else if (notification.type === 'trade_loop') {
                  // For trade loops, go to dashboard multi-way tab
                  redirectPath = '/dashboard?tab=2';
                } else if (notification.type === 'trade_loop') {
                  redirectPath = '/dashboard?tab=2';
                }
                // Add more types as needed

                const handleNotificationClick = async () => {
                  if (!notification.read) {
                    await markAsRead(notification.id);
                  }
                  if (redirectPath) {
                    navigate(redirectPath);
                  }
                };

                const getNotificationTitle = (type: string) => {
                  const titleMap: Record<string, string> = {
                    'trade_offer': '📬 Trade Offer',
                    'trade_update': '🔄 Trade Update',
                    'trade_loop': '🔁 Trade Loop Found',
                    'similar_item': '💡 Item Match',
                    'popular_item': '🔥 Trending Item',
                    'report': '⚠️ Report',
                    'system': '⚙️ System',
                  };
                  return titleMap[type] || type.replace('_', ' ').toUpperCase();
                };

                return (
                  <Card
                    key={notification.id}
                    bg={bgColor}
                    border="1px"
                    borderColor={borderColor}
                    shadow="sm"
                    opacity={notification.read ? 0.7 : 1}
                    transition="all 0.2s"
                    _hover={{ shadow: 'md', cursor: redirectPath ? 'pointer' : 'default' }}
                    onClick={redirectPath ? handleNotificationClick : undefined}
                  >
                    <CardHeader pb={2}>
                      <HStack justify="space-between" align="start" flexWrap="wrap" gap={2}>
                        <HStack spacing={3} align="start" minW={0} flex={1}>
                          <VStack align="start" spacing={1} minW={0}>
                            <HStack spacing={2} flexWrap="wrap">
                              <Text fontWeight="semibold" fontSize={{ base: 'sm', md: 'md' }} noOfLines={1}>
                                {getNotificationTitle(notification.type)}
                              </Text>
                              {!notification.read && (
                                <Badge colorScheme="red" size="sm">
                                  New
                                </Badge>
                              )}
                            </HStack>
                            <Badge colorScheme={getNotificationColor(notification.type)} size="sm">
                              {notification.type.replace('_', ' ')}
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

                      {redirectPath && (
                        <HStack spacing={2}>
                          {!notification.read ? (
                            <Button
                              size="sm"
                              variant="solid"
                              colorScheme="blue"
                              onClick={e => { e.stopPropagation(); handleNotificationClick(); }}
                            >
                              View & Mark as Read
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              colorScheme="blue"
                              onClick={e => { e.stopPropagation(); handleNotificationClick(); }}
                            >
                              View
                            </Button>
                          )}
                        </HStack>
                      )}

                      {!redirectPath && (
                        <>
                          {!notification.read ? (
                            <Button
                              size="sm"
                              variant="solid"
                              colorScheme="blue"
                              onClick={e => { e.stopPropagation(); markAsRead(notification.id); }}
                            >
                              Mark as Read
                            </Button>
                          ) : (
                            <Badge colorScheme="green" variant="subtle" px={2} py={1} borderRadius="full" fontSize="xs">
                              ✓ Read
                            </Badge>
                          )}
                        </>
                      )}
                    </CardBody>
                  </Card>
                );
              })
            )}

            {/* Pagination Controls are rendered below the Container for spacing */}
          </VStack>
        </VStack>
      </Container>

    <FloatingTab />
    </Box>
  )
}

export default Notifications
