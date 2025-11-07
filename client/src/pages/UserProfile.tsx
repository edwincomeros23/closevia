import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box,
  Container,
  VStack,
  HStack,
  Heading,
  Text,
  Badge,
  Avatar,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Card,
  CardBody,
  CardHeader,
  Image,
  Wrap,
  WrapItem,
  Spinner,
  Center,
  Tooltip,
} from '@chakra-ui/react'
import { api } from '../services/api'
import { Product, User } from '../types'
import { useProducts } from '../contexts/ProductContext'
import { getFirstImage } from '../utils/imageUtils'

  type PublicUser = Pick<User, 'id' | 'name' | 'verified' | 'created_at'> & {
  avatar_url?: string
  bio?: string
  rating?: number
  rank?: string
  is_organization?: boolean
  org_verified?: boolean
  org_name?: string
  org_logo_url?: string
  department?: string
}

const UserProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string>('')
  const { getUserProducts } = useProducts()

  useEffect(() => {
    const run = async () => {
      if (!id) return
      setLoading(true)
      setError('')
      try {
        // Fetch public user info
        const res = await api.get(`/api/users/${id}`)
        const apiUser = (res.data?.data || res.data) as Partial<PublicUser>
        setUser({
          id: Number(id),
          name: apiUser.name || 'User',
          verified: Boolean(apiUser.verified),
          created_at: (apiUser as any).created_at || new Date().toISOString(),
          avatar_url: (apiUser as any).org_logo_url,
          bio: (apiUser as any).bio || 'No bio provided yet.',
          rating: apiUser.rating ?? 4.6,
          rank: apiUser.rank || 'Rising Trader',
          is_organization: (apiUser as any).is_organization,
          org_verified: (apiUser as any).org_verified,
          org_name: (apiUser as any).org_name,
          org_logo_url: (apiUser as any).org_logo_url,
          department: (apiUser as any).department,
        })

        // Fetch user's products to infer stats and successful trades
        const page1 = await getUserProducts(Number(id), 1)
        setProducts(page1.data || [])
      } catch (e: any) {
        setError(e?.message || 'Failed to load user')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [id, getUserProducts])

  const stats = useMemo(() => {
    const total = products.length
    const active = products.filter(p => p.status === 'available').length
    const completed = products.filter(p => p.status === 'sold' || p.status === 'traded').length
    const rating = user?.rating ?? 4.6
    return { total, active, completed, rating }
  }, [products, user])

  // Mock successful trades gallery using products marked as traded or sold
  const successfulTrades = useMemo(() => {
    const items = products
      .filter(p => p.status === 'traded' || p.status === 'sold')
      .slice(0, 8)
      .map((p, idx) => ({
        id: `${p.id}-${idx}`,
        title: p.title,
        date: new Date(p.updated_at || p.created_at).toLocaleDateString(),
        counterpart: 'Confidential',
        beforeImg: getFirstImage(p.image_urls),
        afterImg: getFirstImage(p.image_urls),
      }))
    return items
  }, [products])

  const badges = useMemo(() => {
    const list: { label: string; color: string }[] = []
    if (stats.completed >= 20) list.push({ label: 'Top Trader', color: 'purple' })
    if (stats.completed >= 5) list.push({ label: 'Trusted Seller', color: 'green' })
    list.push({ label: 'Fast Responder', color: 'blue' })
    return list
  }, [stats])

  if (loading) {
    return (
      <Box bg="#FFFDF1" minH="100vh" w="100%">
        <Center h="50vh">
          <Spinner size="xl" color="brand.500" />
        </Center>
      </Box>
    )
  }

  if (error || !user) {
    return (
      <Box bg="#FFFDF1" minH="100vh" w="100%">
        <Center h="50vh">
          <Text color="red.500">{error || 'User not found'}</Text>
        </Center>
      </Box>
    )
  }

  return (
    <Box bg="#FFFDF1" minH="100vh" w="100%">
      <Container maxW="container.xl" py={8}>
        <VStack spacing={8} align="stretch">
          {/* Header */}
          <Card bg="white" border="1px" borderColor="gray.200" shadow="sm">
            <CardBody>
              <HStack spacing={6} align="start">
                <Avatar size="xl" name={user.name} src={user.avatar_url} bg="brand.500" color="white" />
                <VStack align="start" spacing={2} flex={1}>
                  <HStack spacing={3} flexWrap="wrap">
                    <Heading size="lg" color="gray.800">{user.name}</Heading>
                    {user.is_organization ? (
                      <Badge colorScheme="purple">Organization Verified</Badge>
                    ) : (
                      user.verified && <Badge colorScheme="green">Verified</Badge>
                    )}
                    {Array.isArray((user as any).badges) && (user as any).badges.map((id: number) => {
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
                    {badges.map(b => (
                      <Badge key={b.label} colorScheme={b.color}>{b.label}</Badge>
                    ))}
                  </HStack>
                  <Text color="gray.600">Member since {new Date(user.created_at).toLocaleDateString()}</Text>
                  {user.department && (
                    <Text color="gray.600">Department: {user.department}</Text>
                  )}
                  <Text color="gray.700">{user.bio}</Text>
                </VStack>
              </HStack>
            </CardBody>
          </Card>

          {/* Stats */}
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
            <Stat bg="white" p={4} rounded="md" border="1px" borderColor="gray.200">
              <StatLabel>Total Listings</StatLabel>
              <StatNumber>{stats.total}</StatNumber>
              <StatHelpText>All items</StatHelpText>
            </Stat>
            <Stat bg="white" p={4} rounded="md" border="1px" borderColor="gray.200">
              <StatLabel>Active</StatLabel>
              <StatNumber>{stats.active}</StatNumber>
              <StatHelpText>Available</StatHelpText>
            </Stat>
            <Stat bg="white" p={4} rounded="md" border="1px" borderColor="gray.200">
              <StatLabel>Completed Trades</StatLabel>
              <StatNumber>{stats.completed}</StatNumber>
              <StatHelpText>Sold or traded</StatHelpText>
            </Stat>
            <Stat bg="white" p={4} rounded="md" border="1px" borderColor="gray.200">
              <StatLabel>Rating</StatLabel>
              <StatNumber>{(stats as any).rating || 4.6}</StatNumber>
              <StatHelpText>User feedback</StatHelpText>
            </Stat>
          </SimpleGrid>

          {/* Successful Trades Gallery */}
          <Card bg="white" border="1px" borderColor="gray.200" shadow="sm">
            <CardHeader>
              <Heading size="md" color="gray.800">Successful Trades</Heading>
            </CardHeader>
            <CardBody>
              {successfulTrades.length === 0 ? (
                <Text color="gray.500">No completed trades yet.</Text>
              ) : (
                <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing={4}>
                  {successfulTrades.map(t => (
                    <Box key={t.id} border="1px" borderColor="gray.200" rounded="md" overflow="hidden" bg="gray.50">
                      <Image src={t.beforeImg} alt={t.title} h="140px" w="full" objectFit="cover" />
                      <Box p={3}>
                        <Text fontWeight="semibold" noOfLines={1}>{t.title}</Text>
                        <HStack justify="space-between" mt={1}>
                          <Text fontSize="xs" color="gray.600">{t.date}</Text>
                          <Tooltip label={`Counterpart: ${t.counterpart}`}>
                            <Badge colorScheme="green">Completed</Badge>
                          </Tooltip>
                        </HStack>
                      </Box>
                    </Box>
                  ))}
                </SimpleGrid>
              )}
            </CardBody>
          </Card>

          {/* Recent Listings */}
          <Card bg="white" border="1px" borderColor="gray.200" shadow="sm">
            <CardHeader>
              <Heading size="md" color="gray.800">Recent Listings</Heading>
            </CardHeader>
            <CardBody>
              {products.length === 0 ? (
                <Text color="gray.500">No listings yet.</Text>
              ) : (
                <Wrap spacing={4}>
                  {products.slice(0, 8).map(p => (
                    <WrapItem key={p.id}>
                      <Box
                        as="a"
                        href={`/products/${p.id}`}
                        w={{ base: '160px', md: '200px' }}
                        border="1px" borderColor="gray.200" rounded="md" overflow="hidden" bg="white"
                        _hover={{ boxShadow: 'md', transform: 'translateY(-2px)' }} transition="all 0.2s ease"
                      >
                        <Image src={getFirstImage(p.image_urls)} alt={p.title} h="140px" w="full" objectFit="cover" />
                        <Box p={3}>
                          <Text fontWeight="semibold" noOfLines={1}>{p.title}</Text>
                          <HStack justify="space-between" mt={1}>
                            <Badge colorScheme={p.status === 'available' ? 'green' : p.status === 'traded' ? 'blue' : 'red'}>
                              {p.status}
                            </Badge>
                            <Text fontSize="xs" color="gray.600">{new Date(p.created_at).toLocaleDateString()}</Text>
                          </HStack>
                        </Box>
                      </Box>
                    </WrapItem>
                  ))}
                </Wrap>
              )}
            </CardBody>
          </Card>
        </VStack>
      </Container>
    </Box>
  )
}

export default UserProfile


