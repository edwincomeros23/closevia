import React, { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Container,
  Grid,
  GridItem,
  Heading,
  HStack,
  Image,
  Skeleton,
  Text,
  VStack,
} from '@chakra-ui/react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { api } from '../services/api'
import { getImageUrl } from '../utils/imageUtils'
import { getProductUrl } from '../utils/productUtils'

const OrganizationProducts: React.FC = () => {
  const { handle } = useParams<{ handle: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [organization, setOrganization] = useState<any | null>(null)
  const [products, setProducts] = useState<any[]>([])

  useEffect(() => {
    const loadData = async () => {
      if (!handle) return
      setLoading(true)
      setError('')
      try {
        let orgData: any = null
        try {
          const orgRes = await api.get(`/api/organizations/${handle}`)
          orgData = orgRes.data?.data
        } catch {
          const legacyRes = await api.get(`/api/users/organizations/${handle}`)
          const legacy = legacyRes.data?.data
          orgData = legacy
            ? {
                name: legacy.org_name || legacy.name,
                slug: legacy.org_handle || handle,
                category: legacy.org_category || '',
                description: legacy.bio || '',
                logo_url: legacy.org_logo_url || legacy.profile_picture || '',
                cover_url: legacy.org_cover_url || legacy.background_image || '',
              }
            : null
        }

        if (!orgData) {
          setError('Organization not found')
          setProducts([])
          setOrganization(null)
          return
        }

        setOrganization(orgData)

        const category = String(orgData.category || '').trim()
        if (!category) {
          setProducts([])
          return
        }

        const productsRes = await api.get('/api/products', {
          params: {
            category,
            limit: 60,
            page: 1,
          },
        })

        const raw = Array.isArray(productsRes.data?.data?.data)
          ? productsRes.data.data.data
          : Array.isArray(productsRes.data?.data)
            ? productsRes.data.data
            : []

        const normalized = raw.filter((p: any) => String(p?.category || '').toLowerCase() === category.toLowerCase())
        setProducts(normalized)
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Failed to load organization products')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [handle])

  const title = useMemo(() => organization?.name || handle || 'Organization', [organization, handle])

  return (
    <Box bg="#FFFDF1" minH="100vh">
      <Container maxW="6xl" py={{ base: 6, md: 10 }}>
        <VStack align="stretch" spacing={5}>
          <HStack justify="space-between" align="start" wrap="wrap">
            <VStack align="start" spacing={1}>
              <Heading size="lg">{title} Products</Heading>
              <Text color="gray.600">Products posted by users related to this organization category.</Text>
            </VStack>
            <HStack>
              <Button as={RouterLink} to={handle ? `/org/${handle}` : '/organizations'} variant="outline" size="sm">Organization Page</Button>
              <Button as={RouterLink} to="/organizations" variant="ghost" size="sm">All Organizations</Button>
            </HStack>
          </HStack>

          {organization?.category ? <Badge alignSelf="start" colorScheme="teal" borderRadius="full" px={3} py={1}>{organization.category}</Badge> : null}

          {loading ? (
            <Grid templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }} gap={3}>
              {Array.from({ length: 8 }).map((_, i) => (
                <GridItem key={i}>
                  <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="hidden">
                    <Skeleton h="140px" />
                    <Box p={3}>
                      <Skeleton h="16px" mb={2} />
                      <Skeleton h="14px" w="70%" />
                    </Box>
                  </Box>
                </GridItem>
              ))}
            </Grid>
          ) : null}

          {!loading && error ? <Text color="red.500">{error}</Text> : null}

          {!loading && !error && products.length === 0 ? (
            <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={5}>
              <Text color="gray.600">No related products found yet for this organization category.</Text>
            </Box>
          ) : null}

          {!loading && !error ? (
            <Grid templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }} gap={3}>
              {products.map((product) => {
                const firstImage = Array.isArray(product.image_urls) ? product.image_urls[0] : ''
                return (
                  <GridItem key={product.id}>
                    <Box as={RouterLink} to={getProductUrl(product)} display="block" bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="hidden" _hover={{ shadow: 'md', transform: 'translateY(-2px)' }} transition="all .15s">
                      <Box h="140px" bg="gray.100">
                        <Image src={getImageUrl(firstImage)} alt={product.title} w="full" h="full" objectFit="cover" />
                      </Box>
                      <Box p={3}>
                        <Text fontSize="sm" fontWeight="600" noOfLines={2}>{product.title}</Text>
                        <Text fontSize="xs" color="gray.500" mt={1}>by {product.seller_name || 'Seller'}</Text>
                        <Text fontSize="sm" color="teal.600" fontWeight="700" mt={1}>
                          {Number(product.price) > 0 ? `PHP ${Number(product.price).toLocaleString()}` : 'Price not listed'}
                        </Text>
                      </Box>
                    </Box>
                  </GridItem>
                )
              })}
            </Grid>
          ) : null}
        </VStack>
      </Container>
    </Box>
  )
}

export default OrganizationProducts
