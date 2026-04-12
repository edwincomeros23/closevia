import React, { useEffect, useState } from 'react'
import {
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'
import { api } from '../services/api'
import { getImageUrl } from '../utils/imageUtils'
import FloatingTab from '../components/FloatingTab'

const Organizations: React.FC = () => {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])

  const fetchOrganizations = async (q = '') => {
    setLoading(true)
    try {
      const res = await api.get('/api/organizations', {
        params: {
          q,
          limit: 50,
        },
      })
      setItems(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrganizations()
  }, [])

  return (
    <Box bg="#FFFDF1" minH="100vh" pb={{ base: '120px', md: 0 }}>
      <Container maxW={{ base: 'full', md: '6xl' }} px={{ base: 4, md: 6 }} py={{ base: 4, md: 10 }}>
        <VStack align="stretch" spacing={4}>
        <VStack align="stretch" spacing={1}>
          <Heading size={{ base: 'md', md: 'lg' }}>Discover Organizations</Heading>
          <Text color="gray.600" fontSize={{ base: 'sm', md: 'md' }}>Join topic-focused communities and post with approved members.</Text>
        </VStack>

        {/* Search and Create - Responsive Layout */}
        <VStack spacing={2} align="stretch" display={{ base: 'flex', md: 'none' }}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                fetchOrganizations(query.trim())
              }
            }}
            placeholder="Search organizations..."
            bg="white"
            size="sm"
          />
          <HStack spacing={2} w="full">
            <Button colorScheme="teal" onClick={() => fetchOrganizations(query.trim())} flex={1} size="sm">Search</Button>
            <Button as={RouterLink} to="/organizations/new" variant="outline" flex={1} size="sm">Create</Button>
          </HStack>
        </VStack>

        {/* Desktop Search Layout */}
        <HStack spacing={2} display={{ base: 'none', md: 'flex' }}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                fetchOrganizations(query.trim())
              }
            }}
            placeholder="Search organizations by name, slug, or category"
            bg="white"
          />
          <Button colorScheme="teal" onClick={() => fetchOrganizations(query.trim())}>Search</Button>
          <Button as={RouterLink} to="/organizations/new" variant="outline">Create</Button>
        </HStack>

        {loading ? <Spinner size="sm" /> : null}
        {!loading && items.length === 0 ? <Text color="gray.500" fontSize={{ base: 'sm', md: 'md' }}>No organizations found.</Text> : null}

        <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={{ base: 3, md: 4 }}>
          {items.map((org) => (
            <GridItem key={org.id}>
              <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius={{ base: 'lg', md: 'xl' }} p={{ base: 3, md: 4 }}>
                <HStack align="start" spacing={3}>
                  <Avatar size={{ base: 'md', md: 'lg' }} src={org.logo_url ? getImageUrl(org.logo_url) : undefined} name={org.name} />
                  <VStack align="start" spacing={1} flex={1} minW={0}>
                    <HStack spacing={2} wrap="wrap">
                      <Heading size={{ base: 'xs', md: 'sm' }} noOfLines={1}>{org.name}</Heading>
                      <Badge colorScheme="teal" fontSize={{ base: '10px', md: 'xs' }}>{org.category || 'Community'}</Badge>
                    </HStack>
                    <Text fontSize={{ base: '11px', md: 'sm' }} color="gray.500">@{org.slug}</Text>
                    <Text fontSize={{ base: '11px', md: 'sm' }} color="gray.700" noOfLines={2}>{org.description || 'No description available.'}</Text>
                    <Text fontSize={{ base: '10px', md: 'xs' }} color="gray.500">Members: {org.member_count || 0}</Text>
                    <Button as={RouterLink} to={`/org/${org.slug}`} size={{ base: 'xs', md: 'sm' }} colorScheme="teal" variant="outline" mt={1} w="full">View Organization</Button>
                  </VStack>
                </HStack>
              </Box>
            </GridItem>
          ))}
        </Grid>
        </VStack>
      </Container>

      {/* Mobile Bottom Navigation */}
      <FloatingTab />
    </Box>
  )
}

export default Organizations
