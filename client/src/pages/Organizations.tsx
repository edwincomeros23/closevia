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
    <Box bg="#FFFDF1" minH="100vh">
      <Container maxW="6xl" py={{ base: 6, md: 10 }}>
        <VStack align="stretch" spacing={5}>
        <VStack align="stretch" spacing={1}>
          <Heading size="lg">Discover Organizations</Heading>
          <Text color="gray.600">Join topic-focused communities and post with approved members.</Text>
        </VStack>

        <HStack>
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
        {!loading && items.length === 0 ? <Text color="gray.500">No organizations found.</Text> : null}

        <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
          {items.map((org) => (
            <GridItem key={org.id}>
              <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="xl" p={4}>
                <HStack align="start" spacing={3}>
                  <Avatar src={org.logo_url ? getImageUrl(org.logo_url) : undefined} name={org.name} />
                  <VStack align="start" spacing={1} flex={1}>
                    <HStack spacing={2}>
                      <Heading size="sm">{org.name}</Heading>
                      <Badge colorScheme="teal">{org.category || 'Community'}</Badge>
                    </HStack>
                    <Text fontSize="sm" color="gray.500">@{org.slug}</Text>
                    <Text fontSize="sm" color="gray.700" noOfLines={2}>{org.description || 'No description available.'}</Text>
                    <Text fontSize="xs" color="gray.500">Members: {org.member_count || 0}</Text>
                    <Button as={RouterLink} to={`/org/${org.slug}`} size="sm" colorScheme="teal" variant="outline" mt={1}>View Organization</Button>
                  </VStack>
                </HStack>
              </Box>
            </GridItem>
          ))}
        </Grid>
        </VStack>
      </Container>
    </Box>
  )
}

export default Organizations
