import React, { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Image,
  Link,
  Skeleton,
  Text,
  VStack,
} from '@chakra-ui/react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { api } from '../services/api'
import { getImageUrl } from '../utils/imageUtils'
import { User } from '../types'

const OrganizationProfile: React.FC = () => {
  const { handle } = useParams<{ handle: string }>()
  const [org, setOrg] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchOrganization = async () => {
      if (!handle) return
      setLoading(true)
      setError('')
      try {
        const res = await api.get(`/api/users/organizations/${handle}`)
        setOrg((res.data?.data || null) as User | null)
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Failed to load organization profile')
      } finally {
        setLoading(false)
      }
    }

    fetchOrganization()
  }, [handle])

  if (loading) {
    return (
      <Container maxW="5xl" py={{ base: 6, md: 10 }}>
        <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="2xl" overflow="hidden">
          <Skeleton h={{ base: '150px', md: '220px' }} />

          <Box px={{ base: 4, md: 8 }} pb={{ base: 6, md: 8 }} mt="-48px" position="relative">
            <Skeleton w={{ base: '86px', md: '110px' }} h={{ base: '86px', md: '110px' }} borderRadius="full" mb={4} />

            <VStack align="start" spacing={3}>
              <Skeleton h="30px" w="260px" />
              <Skeleton h="18px" w="160px" />
              <Skeleton h="18px" w="140px" />
              <Skeleton h="16px" w="100%" />
              <Skeleton h="16px" w="85%" />

              <HStack spacing={6} pt={2} flexWrap="wrap">
                <Skeleton h="14px" w="180px" />
                <Skeleton h="14px" w="220px" />
                <Skeleton h="14px" w="120px" />
              </HStack>

              <HStack pt={3} spacing={3}>
                <Skeleton h="40px" w="160px" borderRadius="md" />
                <Skeleton h="40px" w="170px" borderRadius="md" />
              </HStack>
            </VStack>
          </Box>
        </Box>
      </Container>
    )
  }

  if (error || !org) {
    return (
      <Container maxW="4xl" py={10}>
        <Text color="red.500" mb={4}>{error || 'Organization not found'}</Text>
        <Button as={RouterLink} to="/home" variant="outline">Go Home</Button>
      </Container>
    )
  }

  return (
    <Container maxW="5xl" py={{ base: 6, md: 10 }}>
      <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="2xl" overflow="hidden">
        <Box h={{ base: '150px', md: '220px' }} bg="gray.100">
          <Image src={getImageUrl((org as any).org_cover_url || (org as any).background_image)} alt="Organization cover" w="full" h="full" objectFit="cover" />
        </Box>

        <Box px={{ base: 4, md: 8 }} pb={{ base: 6, md: 8 }} mt="-48px" position="relative">
          <Box w={{ base: '86px', md: '110px' }} h={{ base: '86px', md: '110px' }} borderRadius="full" overflow="hidden" border="5px solid" borderColor="white" bg="gray.100" mb={4}>
            <Image src={getImageUrl(org.org_logo_url || org.profile_picture)} alt={org.org_name || org.name} w="full" h="full" objectFit="cover" />
          </Box>

          <VStack align="start" spacing={3}>
            <Heading size="lg">{org.org_name || org.name}</Heading>
            <Text color="gray.500">@{org.org_handle || handle}</Text>
            {(org as any).org_category ? <Text color="teal.600" fontWeight="semibold">{(org as any).org_category}</Text> : null}
            <Text color="gray.700">{org.bio || 'No description yet.'}</Text>

            <HStack spacing={6} pt={2} flexWrap="wrap">
              {(org as any).org_location ? <Text fontSize="sm" color="gray.600">Location: {(org as any).org_location}</Text> : null}
              {(org as any).org_contact_email ? <Text fontSize="sm" color="gray.600">Contact: {(org as any).org_contact_email}</Text> : null}
              {(org as any).org_website ? (
                <Link href={(org as any).org_website} isExternal color="teal.600" fontSize="sm">
                  Visit Website
                </Link>
              ) : null}
            </HStack>

            <HStack pt={3} spacing={3}>
              <Button as={RouterLink} to={`/users/${org.id}`} variant="outline">View Owner Profile</Button>
              <Button colorScheme="teal" variant="solid" isDisabled>
                Follow (Coming Soon)
              </Button>
            </HStack>
          </VStack>
        </Box>
      </Box>
    </Container>
  )
}

export default OrganizationProfile
