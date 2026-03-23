import React, { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Container,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  HStack,
  Image,
  Input,
  Select,
  Stack,
  Text,
  Textarea,
  useToast,
  VStack,
} from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { getImageUrl } from '../utils/imageUtils'

const ORG_CATEGORIES = [
  'Student Org',
  'Club',
  'Department',
  'Research Group',
  'Community Initiative',
  'Academic Council',
]

const sanitizeHandle = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

const CreateOrganization: React.FC = () => {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [orgName, setOrgName] = useState(user?.org_name || '')
  const [orgHandle, setOrgHandle] = useState(user?.org_handle || '')
  const [orgLogoUrl, setOrgLogoUrl] = useState(user?.org_logo_url || '')
  const [orgCoverUrl, setOrgCoverUrl] = useState((user as any)?.org_cover_url || '')
  const [bio, setBio] = useState(user?.bio || '')
  const [orgCategory, setOrgCategory] = useState((user as any)?.org_category || '')
  const [orgWebsite, setOrgWebsite] = useState((user as any)?.org_website || '')
  const [orgLocation, setOrgLocation] = useState((user as any)?.org_location || '')
  const [orgContactEmail, setOrgContactEmail] = useState((user as any)?.org_contact_email || '')
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)

  const previewName = useMemo(() => orgName || 'Your Organization Name', [orgName])
  const previewHandle = useMemo(() => sanitizeHandle(orgHandle || orgName), [orgHandle, orgName])

  const uploadImage = async (file: File, kind: 'profile' | 'organization-cover') => {
    const formData = new FormData()
    formData.append('image', file)
    formData.append('type', kind)

    const res = await api.post('/api/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    })

    const url = res.data?.data?.url
    if (!url) {
      throw new Error('Upload failed: missing file URL')
    }
    return url as string
  }

  const onLogoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingLogo(true)
    try {
      const url = await uploadImage(file, 'profile')
      setOrgLogoUrl(url)
      toast({ title: 'Logo uploaded', status: 'success', duration: 2000 })
    } catch (error: any) {
      toast({ title: 'Logo upload failed', description: error?.message || 'Please try again', status: 'error' })
    } finally {
      setUploadingLogo(false)
    }
  }

  const onCoverFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingCover(true)
    try {
      const url = await uploadImage(file, 'organization-cover')
      setOrgCoverUrl(url)
      toast({ title: 'Cover uploaded', status: 'success', duration: 2000 })
    } catch (error: any) {
      toast({ title: 'Cover upload failed', description: error?.message || 'Please try again', status: 'error' })
    } finally {
      setUploadingCover(false)
    }
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!orgName.trim()) {
      toast({ title: 'Organization name is required', status: 'warning', duration: 2500 })
      return
    }
    if (!sanitizeHandle(orgHandle || orgName)) {
      toast({ title: 'Organization handle is required', status: 'warning', duration: 2500 })
      return
    }
    if (!orgCategory.trim()) {
      toast({ title: 'Category is required', status: 'warning', duration: 2500 })
      return
    }

    setSaving(true)
    try {
      const normalizedHandle = sanitizeHandle(orgHandle || orgName)
      await api.post('/api/users/organization', {
        org_name: orgName.trim(),
        org_handle: normalizedHandle,
        org_logo_url: orgLogoUrl.trim(),
        org_cover_url: orgCoverUrl.trim(),
        bio: bio.trim(),
        org_category: orgCategory,
        org_website: orgWebsite.trim(),
        org_location: orgLocation.trim(),
        org_contact_email: orgContactEmail.trim(),
      })

      await refreshUser()
      toast({
        title: user?.is_organization ? 'Organization updated' : 'Organization created',
        description: `@${normalizedHandle} is now live.`,
        status: 'success',
        duration: 2500,
      })
      navigate(`/org/${normalizedHandle}`)
    } catch (error: any) {
      toast({
        title: 'Failed to save organization',
        description: error?.response?.data?.error || error?.message || 'Please check your fields and try again.',
        status: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container maxW="7xl" py={{ base: 6, md: 10 }}>
      <VStack align="stretch" spacing={2} mb={6}>
        <Heading size="lg">{user?.is_organization ? 'Update Organization' : 'Create Organization'}</Heading>
        <Text color="gray.600">
          Build your organization profile like a dedicated public page. Changes are saved to your account.
        </Text>
      </VStack>

      <Grid templateColumns={{ base: '1fr', lg: '1.1fr 0.9fr' }} gap={6} alignItems="start">
        <GridItem>
          <Box as="form" bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="xl" p={{ base: 4, md: 6 }} onSubmit={onSubmit}>
            <Stack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Organization Name</FormLabel>
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Eco Student Council" />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Handle / Username</FormLabel>
                <Input
                  value={orgHandle}
                  onChange={(e) => setOrgHandle(sanitizeHandle(e.target.value))}
                  placeholder="org-name"
                />
                <Text fontSize="xs" color="gray.500" mt={1}>Profile URL: /org/{sanitizeHandle(orgHandle || orgName || 'org-name')}</Text>
              </FormControl>

              <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
                <FormControl>
                  <FormLabel>Logo / Avatar URL</FormLabel>
                  <Input value={orgLogoUrl} onChange={(e) => setOrgLogoUrl(e.target.value)} placeholder="https://..." />
                </FormControl>
                <FormControl>
                  <FormLabel>Upload Logo</FormLabel>
                  <Input type="file" accept="image/*" p={1} onChange={onLogoFileChange} isDisabled={uploadingLogo} />
                </FormControl>
              </Grid>

              <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
                <FormControl>
                  <FormLabel>Cover Photo URL</FormLabel>
                  <Input value={orgCoverUrl} onChange={(e) => setOrgCoverUrl(e.target.value)} placeholder="https://..." />
                </FormControl>
                <FormControl>
                  <FormLabel>Upload Cover</FormLabel>
                  <Input type="file" accept="image/*" p={1} onChange={onCoverFileChange} isDisabled={uploadingCover} />
                </FormControl>
              </Grid>

              <FormControl>
                <FormLabel>About / Description</FormLabel>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="What your organization does..." />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Category</FormLabel>
                <Select value={orgCategory} onChange={(e) => setOrgCategory(e.target.value)} placeholder="Select category">
                  {ORG_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </Select>
              </FormControl>

              <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
                <FormControl>
                  <FormLabel>Website</FormLabel>
                  <Input value={orgWebsite} onChange={(e) => setOrgWebsite(e.target.value)} placeholder="https://example.org" />
                </FormControl>
                <FormControl>
                  <FormLabel>Location</FormLabel>
                  <Input value={orgLocation} onChange={(e) => setOrgLocation(e.target.value)} placeholder="Campus / City" />
                </FormControl>
              </Grid>

              <FormControl>
                <FormLabel>Contact Email</FormLabel>
                <Input value={orgContactEmail} onChange={(e) => setOrgContactEmail(e.target.value)} placeholder="contact@org.edu" />
              </FormControl>

              <HStack pt={2} spacing={3}>
                <Button type="submit" colorScheme="teal" isLoading={saving}>
                  {user?.is_organization ? 'Save Organization' : 'Create Organization'}
                </Button>
                <Button variant="ghost" onClick={() => navigate('/dashboard')}>Cancel</Button>
              </HStack>
            </Stack>
          </Box>
        </GridItem>

        <GridItem>
          <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="xl" overflow="hidden" position="sticky" top={{ lg: '24px' }}>
            <Box h="140px" bg="gray.100" position="relative">
              <Image src={getImageUrl(orgCoverUrl || undefined)} alt="Organization cover preview" w="full" h="full" objectFit="cover" />
            </Box>
            <Box p={5} mt="-38px" position="relative">
              <Box w="76px" h="76px" borderRadius="full" overflow="hidden" border="4px solid" borderColor="white" bg="gray.100" mb={3}>
                <Image src={getImageUrl(orgLogoUrl || undefined)} alt="Organization logo preview" w="full" h="full" objectFit="cover" />
              </Box>
              <Heading size="md" mb={1}>{previewName}</Heading>
              <Text color="gray.500" fontSize="sm" mb={2}>@{previewHandle || 'org-name'}</Text>
              <Text fontSize="sm" color="teal.700" mb={3}>{orgCategory || 'Category'}</Text>
              <Text fontSize="sm" color="gray.700" noOfLines={4} mb={3}>
                {bio || 'Your organization description will appear here as you type.'}
              </Text>
              <VStack align="stretch" spacing={1} fontSize="sm" color="gray.600">
                {orgLocation ? <Text>Location: {orgLocation}</Text> : null}
                {orgWebsite ? <Text>Website: {orgWebsite}</Text> : null}
                {orgContactEmail ? <Text>Contact: {orgContactEmail}</Text> : null}
              </VStack>
            </Box>
          </Box>
        </GridItem>
      </Grid>
    </Container>
  )
}

export default CreateOrganization
