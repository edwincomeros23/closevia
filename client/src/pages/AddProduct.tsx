import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Input,
  Textarea,
  Switch,
  FormControl,
  FormLabel,
  FormHelperText,
  useToast,
  Progress,
  IconButton,
  Image,
  SimpleGrid,
  useColorModeValue,
  Badge,
  Select,
  Spinner,
  Divider,
} from '@chakra-ui/react'
import { AddIcon, CloseIcon, ArrowForwardIcon, ArrowBackIcon, CheckIcon } from '@chakra-ui/icons'

export interface ProductFormData {
  title: string
  description: string
  price?: number
  condition: string
  category: string
  images: File[]
  video?: File
  premium: boolean
  allow_buying: boolean
  barter_only: boolean
  bidding_type: string
  location: string
  latitude?: number
  longitude?: number

  // AI Generated fields
  item_type?: string
  brand?: string
  authenticity_risks?: string
  estimated_value_min?: number
  estimated_value_max?: number
  tags?: string

  // Trading preferences
  wants?: string
  wanted_categories?: string[]
}

import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { api } from '../services/api'
import FloatingTab from '../components/FloatingTab'
import { prepareImageForUpload } from '../utils/imageConverter'
import { PRODUCT_CATEGORIES } from '../utils/categories'

// ── Constants ────────────────────────────────────────────────────────────────

const CONDITION_OPTIONS = ['New', 'Like New', 'Good', 'Used', 'For Parts']

const PROHIBITED_PATTERNS = [
  /\b(gun|rifle|pistol|shotgun|firearm|ammunition|ammo|bomb|explosive|grenade|rocket|missile|landmine)\b/gi,
  /\b(cocaine|heroin|meth|methamphetamine|fentanyl|lsd|ecstasy|mdma|cannabis|marijuana|weed|drug)\b/gi,
  /\b(machete|sword|blade|knife|sharp weapon)\b/gi,
  /\b(porn|pornography|adult content|sex content|nude|nudes|sex toy)\b/gi,
  /\b(dog|cat|puppy|kitten|animal|pet|livestock|bird|horse|reptile|endangered animal)\b/gi,
  /\b(kidney|liver|organ|heart|lung|body part)\b/gi,
  /\b(counterfeit|fake|stolen|stole|replica)\b/gi,
  /\b(explosives|hazardous|toxic|poison|radioactive|chemical weapon)\b/gi,
  /\b(person|human|slave|slavery|human trafficking)\b/gi,
]

const validateDesiredItems = (text: string): string | null => {
  const t = text.trim().toLowerCase()
  if (!t) return null
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(t)) {
      const match = t.match(pattern)
      return `❌ Prohibited item: "${match?.[0]?.toUpperCase()}". Only list legitimate items.`
    }
  }
  return null
}

// ── Component ────────────────────────────────────────────────────────────────

const AddProduct: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { createProduct } = useProducts()
  const toast = useToast()
  const aiTriggeredRef = useRef(false)

  const [currentStep, setCurrentStep] = useState(1)
  const TOTAL_STEPS = 3

  const [formData, setFormData] = useState<ProductFormData>({
    title: '',
    description: '',
    price: undefined,
    premium: false,
    allow_buying: false,
    barter_only: true,
    location: '',
    condition: '',
    category: '',
    wants: '',
    bidding_type: 'none',
    images: [],
    latitude: undefined,
    longitude: undefined,
    item_type: undefined,
    brand: undefined,
    authenticity_risks: undefined,
    estimated_value_min: undefined,
    estimated_value_max: undefined,
    tags: undefined,
    wanted_categories: [],
  })

  const [uploadedImages, setUploadedImages] = useState<File[]>([])
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([])
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null)
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiDone, setAiDone] = useState(false)

  const [titleLength, setTitleLength] = useState(0)
  const [descriptionLength, setDescriptionLength] = useState(0)
  const [wantedCategories, setWantedCategories] = useState<string[]>([])
  const [wantsError, setWantsError] = useState<string | null>(null)

  const [locationText, setLocationText] = useState<string>('')
  const [locationDetected, setLocationDetected] = useState(false)
  const [isGettingLocation, setIsGettingLocation] = useState(false)

  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const pageBg = '#FFFDF1'

  // ── Location ──────────────────────────────────────────────────────────────

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) return
    setIsGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        setFormData(prev => ({ ...prev, latitude, longitude }))
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          )
          const data = await res.json()
          const addr = data.address || {}
          const parts = [
            addr.hamlet || addr.village || '',
            addr.suburb || addr.neighborhood || '',
            addr.city || addr.town || '',
            addr.county || '',
          ].filter(Boolean)
          const address = parts.join(', ') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
          setLocationText(address)
          setFormData(prev => ({ ...prev, location: address }))
          setLocationDetected(true)
        } catch {
          const fallback = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
          setLocationText(fallback)
          setFormData(prev => ({ ...prev, location: fallback }))
          setLocationDetected(true)
        }
        setIsGettingLocation(false)
      },
      () => {
        setIsGettingLocation(false)
      }
    )
  }, [])

  useEffect(() => {
    detectLocation()
  }, [detectLocation])

  // ── AI Generation ─────────────────────────────────────────────────────────

  const triggerAI = useCallback(async (images: File[]) => {
    if (aiTriggeredRef.current || isGenerating) return
    aiTriggeredRef.current = true
    setIsGenerating(true)

    toast({
      title: '🔍 Analyzing image...',
      description: 'AI is detecting product details automatically.',
      status: 'info',
      duration: 3000,
      isClosable: true,
      position: 'top-right',
    })

    try {
      const fd = new FormData()
      images.slice(0, 3).forEach(f => fd.append('images', f))
      const response = await api.post('/api/products/generate-details', fd)
      const data = response.data
      if (data.success && data.data) {
        const d = data.data
        setFormData(prev => ({
          ...prev,
          title: d.title || prev.title,
          description: d.description || prev.description,
          condition: d.condition || prev.condition || 'Used',
          category: d.category || prev.category || 'General',
          item_type: d.item_type || prev.item_type,
          brand: d.brand || prev.brand,
          authenticity_risks: d.authenticity_risks || prev.authenticity_risks,
          estimated_value_min: d.estimated_value_min ?? prev.estimated_value_min,
          estimated_value_max: d.estimated_value_max ?? prev.estimated_value_max,
          tags: d.tags ? JSON.stringify(d.tags) : prev.tags,
        }))
        if (d.title) setTitleLength(d.title.length)
        if (d.description) setDescriptionLength(d.description.length)
        setAiDone(true)
        toast({
          title: '✨ AI analysis complete!',
          description: 'Product fields have been auto-filled. Review and edit as needed.',
          status: 'success',
          duration: 4000,
          isClosable: true,
          position: 'top-right',
        })
      } else {
        throw new Error(data.error || 'AI generation failed')
      }
    } catch (err: any) {
      aiTriggeredRef.current = false // allow retry
      toast({
        title: 'AI analysis failed',
        description: err?.response?.data?.error || err.message || 'Could not analyze image. You can fill in details manually.',
        status: 'warning',
        duration: 5000,
        isClosable: true,
        position: 'top-right',
      })
    } finally {
      setIsGenerating(false)
    }
  }, [isGenerating, toast])

  // Auto-trigger AI when first image is uploaded (once per upload session)
  useEffect(() => {
    if (uploadedImages.length >= 1 && !aiTriggeredRef.current) {
      triggerAI(uploadedImages)
    }
  }, [uploadedImages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [currentStep])

  // ── Image Handling ────────────────────────────────────────────────────────

  const handleImageUpload = useCallback((files: FileList | null) => {
    if (!files) return
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!validFiles.length) {
      toast({ title: 'Invalid file type', description: 'Please select image files only.', status: 'error', duration: 3000 })
      return
    }

    const processFiles = async () => {
      const processed: File[] = []
      const previews: string[] = []

      for (const file of validFiles.slice(0, 8 - uploadedImages.length)) {
        try {
          const { file: pf } = await prepareImageForUpload(file, 5)
          processed.push(pf)
          const url = await new Promise<string>(resolve => {
            const reader = new FileReader()
            reader.onload = e => resolve(e.target?.result as string)
            reader.readAsDataURL(pf)
          })
          previews.push(url)
        } catch (e: any) {
          toast({ title: `Error processing ${file.name}`, description: e.message, status: 'error', duration: 3000 })
        }
      }

      setUploadedImages(prev => {
        const combined = [...prev, ...processed]
        return combined.slice(0, 8)
      })
      setImagePreviewUrls(prev => [...prev, ...previews].slice(0, 8))
    }
    processFiles()
  }, [uploadedImages.length, toast])

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index))
    setImagePreviewUrls(prev => prev.filter((_, i) => i !== index))
    // Allow re-triggering AI if all images removed
    if (uploadedImages.length <= 1) {
      aiTriggeredRef.current = false
      setAiDone(false)
    }
  }

  const handleVideoUpload = useCallback((files: FileList | null) => {
    if (!files || !files[0]) return
    const file = files[0]
    if (!file.type.startsWith('video/')) {
      toast({ title: 'Invalid file type', status: 'error', duration: 3000 })
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'Video too large', description: 'Max 50MB', status: 'error', duration: 3000 })
      return
    }
    setUploadedVideo(file)
    setVideoPreviewUrl(URL.createObjectURL(file))
  }, [toast])

  const removeVideo = () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl)
    setUploadedVideo(null)
    setVideoPreviewUrl('')
  }

  // ── Field Handlers ────────────────────────────────────────────────────────

  const handleField = (field: keyof ProductFormData, value: any) => {
    if (field === 'title') {
      const len = value?.length || 0
      if (len > 25) return
      setTitleLength(len)
    }
    if (field === 'description') {
      const len = value?.length || 0
      if (len > 800) return
      setDescriptionLength(len)
    }
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // ── Validation ────────────────────────────────────────────────────────────

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1:
        return uploadedImages.length >= 1
      case 2:
        return (
          formData.title.trim().length > 0 &&
          formData.title.trim().length <= 25 &&
          formData.description.trim().length >= 50 &&
          !!formData.condition &&
          !!formData.category &&
          !!formData.location?.trim() &&
          !!(formData.wants?.trim()) &&
          !wantsError
        )
      case 3:
        return true
      default:
        return false
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast({ title: 'Missing name', status: 'warning', duration: 3000 })
      return
    }
    if (formData.description.trim().length < 50) {
      toast({ title: 'Description too short', description: 'Minimum 50 characters', status: 'warning', duration: 3000 })
      return
    }
    if (uploadedImages.length === 0) {
      toast({ title: 'No images', description: 'Please upload at least one photo', status: 'warning', duration: 3000 })
      return
    }

    setIsSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('title', formData.title.trim())
      fd.append('description', formData.description.trim())
      fd.append('price', formData.price?.toString() || '0')
      fd.append('premium', formData.premium ? '1' : '0')
      fd.append('allow_buying', formData.allow_buying ? '1' : '0')
      fd.append('barter_only', formData.barter_only ? '1' : '0')
      fd.append('bidding_type', formData.bidding_type || 'none')
      fd.append('location', formData.location?.trim() || '')
      fd.append('condition', formData.condition || 'Used')
      fd.append('category', formData.category || 'General')

      if (formData.latitude !== undefined && formData.longitude !== undefined) {
        fd.append('latitude', formData.latitude.toString())
        fd.append('longitude', formData.longitude.toString())
      }
      if (formData.item_type) fd.append('item_type', formData.item_type)
      if (formData.brand) fd.append('brand', formData.brand)
      if (formData.authenticity_risks) fd.append('authenticity_risks', formData.authenticity_risks)
      if (formData.estimated_value_min !== undefined) fd.append('estimated_value_min', String(formData.estimated_value_min))
      if (formData.estimated_value_max !== undefined) fd.append('estimated_value_max', String(formData.estimated_value_max))
      if (formData.tags) fd.append('tags', formData.tags)
      if (formData.wants?.trim()) fd.append('wants', formData.wants.trim())
      if (wantedCategories.length > 0) fd.append('wanted_categories', JSON.stringify(wantedCategories))

      uploadedImages.forEach(f => fd.append('images', f))
      if (uploadedVideo) fd.append('video', uploadedVideo)

      await createProduct(fd)
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'products'] })
      toast({ title: 'Product posted! 🎉', status: 'success', duration: 3000 })
      navigate('/dashboard')
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Failed to create product'
      toast({ title: 'Error creating product', description: msg, status: 'error', duration: 6000 })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Step Rendering ────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <VStack spacing={4} align="stretch">
      {/* Compact Header with AI Status - Single Line */}
      <HStack justify="space-between" align="center">
        <VStack spacing={0.5} align="start" flex={1}>
          <Text fontSize="sm" color="gray.600" fontWeight="semibold">📸 Upload Media</Text>
          <Text fontSize="xs" color="gray.500">Min 1 photo. AI analyzes automatically.</Text>
        </VStack>
        {isGenerating && (
          <Badge colorScheme="purple" px={3} py={1.5} borderRadius="md" display="flex" alignItems="center" gap={2} whiteSpace="nowrap">
            <Spinner size="xs" />
            <Text fontSize="xs">Analyzing...</Text>
          </Badge>
        )}
        {!isGenerating && aiDone && (
          <Badge colorScheme="green" px={3} py={1.5} borderRadius="md" fontSize="xs" whiteSpace="nowrap">
            ✓ Auto-filled
          </Badge>
        )}
      </HStack>

      {/* Streamlined Drop Zone - Balanced Height */}
      <Box
        border="2px dashed"
        borderColor={borderColor}
        borderRadius="xl"
        p={5}
        textAlign="center"
        cursor="pointer"
        _hover={{ borderColor: 'brand.400', bg: 'brand.50' }}
        transition="all 0.2s"
        onClick={() => document.getElementById('img-upload')?.click()}
        minH="120px"
      >
        <VStack spacing={2}>
          <AddIcon boxSize={6} color="gray.400" />
          <Text fontSize="sm" fontWeight="semibold" color="gray.600">Click or drag photos</Text>
          <Text fontSize="xs" color="gray.500">JPEG/PNG • max 5MB • up to 8 images</Text>
        </VStack>
      </Box>
      <input id="img-upload" type="file" multiple accept="image/*" style={{ display: 'none' }}
        onChange={e => handleImageUpload(e.target.files)} />

      {/* Horizontal Thumbnail Row - Nice Size */}
      {uploadedImages.length > 0 && (
        <VStack spacing={2} align="stretch">
          <HStack spacing={2} overflowX="auto" pb={1}>
            {uploadedImages.map((_, i) => (
              <Box key={i} position="relative" minW="80px" w="80px" h="80px" flexShrink={0}>
                <Image
                  src={imagePreviewUrls[i]}
                  alt={`Preview ${i + 1}`}
                  borderRadius="lg"
                  objectFit="cover"
                  w="full"
                  h="full"
                  border={i === 0 ? '3px solid' : '1px solid'}
                  borderColor={i === 0 ? 'brand.400' : 'gray.200'}
                  shadow={i === 0 ? 'sm' : 'none'}
                />
                {i === 0 && (
                  <Badge position="absolute" bottom={1} left={1} colorScheme="brand" fontSize="8px" px={2}>
                    Cover
                  </Badge>
                )}
                <IconButton
                  icon={<CloseIcon boxSize={3} />}
                  aria-label="Remove"
                  size="sm"
                  position="absolute"
                  top={-3}
                  right={-3}
                  colorScheme="red"
                  onClick={() => removeImage(i)}
                  borderRadius="full"
                  minW="24px"
                  h="24px"
                />
              </Box>
            ))}
          </HStack>

          {/* Upload Stats & Add Button - Inline */}
          <HStack justify="space-between" align="center">
            <Text fontSize="sm" fontWeight="semibold" color="gray.600">
              {uploadedImages.length}/8 uploaded
            </Text>
            {uploadedImages.length < 8 && (
              <Button
                size="xs"
                variant="ghost"
                colorScheme="brand"
                fontSize="sm"
                h="28px"
                px={3}
                onClick={() => document.getElementById('img-upload')?.click()}
              >
                + Add More
              </Button>
            )}
          </HStack>
        </VStack>
      )}

      {/* Compact Video Upload - Same Row Style */}
      <HStack spacing={3} align="flex-start">
        <Box flex={1}>
          <Text fontWeight="semibold" color="gray.700" fontSize="sm" mb={2}>
            📹 Video <Badge colorScheme="gray" ml={2} fontSize="xs" py={1}>Optional</Badge>
          </Text>
          {!uploadedVideo ? (
            <Box
              border="2px dashed"
              borderColor={borderColor}
              borderRadius="lg"
              p={3}
              textAlign="center"
              cursor="pointer"
              _hover={{ borderColor: 'brand.400' }}
              onClick={() => document.getElementById('vid-upload')?.click()}
              minH="70px"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize="sm" color="gray.600">Click to add video</Text>
            </Box>
          ) : (
            <Box position="relative" borderRadius="lg" overflow="hidden" bg="black" maxH="100px">
              <video src={videoPreviewUrl} controls style={{ width: '100%', maxHeight: '100px', objectFit: 'contain' }} />
              <IconButton icon={<CloseIcon boxSize={3} />} aria-label="Remove video" size="sm"
                position="absolute" top={2} right={2} colorScheme="red" onClick={removeVideo} />
            </Box>
          )}
        </Box>
        <input id="vid-upload" type="file" accept="video/*" style={{ display: 'none' }}
          onChange={e => handleVideoUpload(e.target.files)} />
      </HStack>

      {/* Helper Text */}
      <Text fontSize="xs" color="gray.500" px={2}>
        5–15 seconds • MP4/MOV • up to 50MB
      </Text>
    </VStack>
  )

  const renderStep2 = () => (
    <VStack spacing={5} align="stretch">
      <VStack spacing={1} align="start">
        <Heading size="md" fontSize="lg">✏️ Product Details</Heading>
        <Text fontSize="sm" color="gray.600">
          {aiDone ? 'AI auto-filled these — review and edit as needed.' : 'Fill in your product details.'}
        </Text>
      </VStack>

      {/* AI Re-trigger */}
      {uploadedImages.length > 0 && !isGenerating && (
        <Button
          size="sm"
          variant="outline"
          colorScheme="purple"
          leftIcon={<Text>✨</Text>}
          onClick={() => {
            aiTriggeredRef.current = false
            setAiDone(false)
            triggerAI(uploadedImages)
          }}
          isLoading={isGenerating}
          loadingText="Analyzing..."
          alignSelf="flex-start"
        >
          {aiDone ? 'Re-analyze' : 'Analyze with AI'}
        </Button>
      )}

      {/* ── Product Fields ── */}
      <FormControl isRequired>
        <HStack justify="space-between" align="center" mb={2}>
          <FormLabel mb={0} fontSize="sm" fontWeight="semibold">Product Name</FormLabel>
          {aiDone && <Badge colorScheme="purple" variant="subtle" fontSize="xs">✨ Auto-filled</Badge>}
        </HStack>
        <Input
          placeholder="e.g., Nike Air Force 1"
          value={formData.title}
          onChange={e => handleField('title', e.target.value)}
          maxLength={25}
          size="md"
        />
        <HStack justify="space-between" mt={2}>
          <FormHelperText fontSize="sm">Max 25 characters</FormHelperText>
          <Badge colorScheme={titleLength === 0 ? 'gray' : titleLength <= 25 ? 'green' : 'orange'} fontSize="xs">
            {titleLength}/25
          </Badge>
        </HStack>
      </FormControl>

      <FormControl isRequired>
        <HStack justify="space-between" align="center" mb={2}>
          <FormLabel mb={0} fontSize="sm" fontWeight="semibold">Description</FormLabel>
          <Badge colorScheme={descriptionLength < 50 ? 'red' : descriptionLength <= 800 ? 'green' : 'orange'} fontSize="xs">
            {descriptionLength}/800
          </Badge>
        </HStack>
        <Textarea
          placeholder="Describe your product..."
          value={formData.description}
          onChange={e => handleField('description', e.target.value)}
          rows={4}
          size="md"
        />
        <FormHelperText fontSize="sm" color={descriptionLength < 50 ? 'red.500' : 'gray.600'}>
          {descriptionLength < 50 ? `${50 - descriptionLength} more chars needed` : '✓ Good'}
        </FormHelperText>
      </FormControl>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
        <FormControl isRequired>
          <FormLabel fontSize="sm">Condition</FormLabel>
          <Select
            placeholder="Select condition"
            value={formData.condition}
            onChange={e => handleField('condition', e.target.value)}
            size="md"
          >
            {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </FormControl>

        <FormControl isRequired>
          <FormLabel fontSize="sm">Category</FormLabel>
          <Select
            placeholder="Select category"
            value={formData.category}
            onChange={e => handleField('category', e.target.value)}
            size="md"
          >
            {PRODUCT_CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </Select>
        </FormControl>
      </SimpleGrid>

      {/* AI Extra Fields */}
      {aiDone && (
        <Box p={4} bg="purple.50" borderRadius="lg" borderLeft="4px solid" borderLeftColor="purple.400">
          <Text fontSize="sm" fontWeight="semibold" color="purple.800" mb={3}>✨ AI Insights</Text>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
            <Box>
              <Text fontSize="xs" color="gray.600" fontWeight="semibold">Item Type</Text>
              <Text fontSize="sm" fontWeight="medium" mt={1}>{formData.item_type || '—'}</Text>
            </Box>
            <Box>
              <Text fontSize="xs" color="gray.600" fontWeight="semibold">Brand</Text>
              <Text fontSize="sm" fontWeight="medium" mt={1}>{formData.brand || '—'}</Text>
            </Box>
            <Box>
              <Text fontSize="xs" color="gray.600" fontWeight="semibold">Risk</Text>
              <Badge colorScheme={
                formData.authenticity_risks === 'High' ? 'red' :
                formData.authenticity_risks === 'Medium' ? 'orange' : 'green'
              } fontSize="xs" mt={1}>
                {formData.authenticity_risks || 'Low'}
              </Badge>
            </Box>
            <Box>
              <Text fontSize="xs" color="gray.600" fontWeight="semibold">Est. Value</Text>
              <Text fontSize="sm" fontWeight="medium" mt={1}>
                ₱{(formData.estimated_value_min || 0).toLocaleString()} – ₱{(formData.estimated_value_max || 0).toLocaleString()}
              </Text>
            </Box>
          </SimpleGrid>
          {formData.tags && (
            <Box mt={3}>
              <Text fontSize="xs" color="gray.600" fontWeight="semibold" mb={2}>Tags</Text>
              <HStack flexWrap="wrap" spacing={2}>
                {(() => {
                  try { return JSON.parse(formData.tags!) }
                  catch { return [] }
                })().map((tag: string, i: number) => (
                  <Badge key={i} colorScheme="purple" variant="subtle" fontSize="sm">{tag}</Badge>
                ))}
              </HStack>
            </Box>
          )}
        </Box>
      )}

      {/* ── Location ── */}
      <FormControl isRequired>
        <FormLabel fontSize="sm" fontWeight="semibold">Location</FormLabel>
        {isGettingLocation ? (
          <HStack p={3} bg="yellow.50" borderRadius="md" spacing={3}>
            <Spinner size="sm" color="yellow.600" />
            <Text fontSize="sm" color="yellow.800">Detecting your location...</Text>
          </HStack>
        ) : locationDetected && locationText ? (
          <Box p={3} bg="green.50" borderRadius="md" borderLeft="3px solid" borderLeftColor="green.400">
            <Text fontSize="sm" fontWeight="semibold" color="green.800">✓ Location Detected</Text>
            <Text fontSize="sm" color="gray.700" mt={1}>{locationText}</Text>
          </Box>
        ) : (
          <Box>
            <Box p={3} bg="red.50" borderRadius="md" borderLeft="3px solid" borderLeftColor="red.400" mb={2}>
              <Text fontSize="sm" color="red.700">⚠️ Allow location access</Text>
            </Box>
            <Button size="sm" onClick={detectLocation} isLoading={isGettingLocation}>
              🔄 Detect Location
            </Button>
          </Box>
        )}
        <FormHelperText fontSize="sm">GPS prevents fake locations</FormHelperText>
      </FormControl>

      {/* ── Desired Items ── */}
      <VStack spacing={3} align="stretch" pt={2}>
        <Box>
          <Heading size="sm" fontSize="md" mb={1}>🔄 What I Want</Heading>
          <Text fontSize="sm" color="gray.600">
            Specify items you'd trade for (enables multi-way trading).
          </Text>
        </Box>

        <FormControl isRequired isInvalid={!!wantsError}>
          <FormLabel fontSize="sm">Desired Items</FormLabel>
          <Textarea
            placeholder="e.g., iPhone 12, Gaming Laptop, DSLR Camera"
            value={formData.wants}
            onChange={e => {
              handleField('wants', e.target.value)
              setWantsError(validateDesiredItems(e.target.value))
            }}
            rows={3}
            size="md"
            borderColor={wantsError ? 'red.400' : undefined}
          />
          {wantsError ? (
            <Text fontSize="sm" color="red.600" mt={2}>{wantsError}</Text>
          ) : (
            <FormHelperText fontSize="sm">Separated by commas or new lines</FormHelperText>
          )}
        </FormControl>

        <FormControl>
          <FormLabel fontSize="sm">Desired Categories</FormLabel>
          <Box display="flex" flexWrap="wrap" gap={2}>
            {PRODUCT_CATEGORIES.map(cat => {
              const selected = wantedCategories.includes(cat.value)
              return (
                <Badge
                  key={cat.value}
                  px={3} py={1.5}
                  borderRadius="full"
                  cursor="pointer"
                  fontSize="xs"
                  fontWeight="semibold"
                  bg={selected ? 'brand.500' : 'gray.100'}
                  color={selected ? 'white' : 'gray.600'}
                  borderWidth="1px"
                  borderColor={selected ? 'brand.600' : 'gray.200'}
                  _hover={{ bg: selected ? 'brand.600' : 'gray.200' }}
                  transition="all 0.15s"
                  onClick={() => setWantedCategories(prev =>
                    selected ? prev.filter(c => c !== cat.value) : [...prev, cat.value]
                  )}
                >
                  {cat.label}
                </Badge>
              )
            })}
          </Box>
        </FormControl>
      </VStack>

      {/* ── Barter Option ── */}
      <Box p={4} bg="blue.50" borderRadius="lg" borderLeft="4px solid" borderLeftColor="blue.400">
        <FormControl>
          <HStack justify="space-between">
            <VStack align="start" spacing={0}>
              <FormLabel mb={0} fontWeight="semibold" fontSize="sm">Barter Only</FormLabel>
              <Text fontSize="xs" color="gray.600">Accept exchanges only</Text>
            </VStack>
            <Switch
              isChecked={formData.barter_only}
              onChange={e => handleField('barter_only', e.target.checked)}
              colorScheme="blue"
            />
          </HStack>
        </FormControl>
      </Box>
    </VStack>
  )

  const renderStep3 = () => {
    const tags: string[] = (() => {
      try { return formData.tags ? JSON.parse(formData.tags) : [] }
      catch { return [] }
    })()

    return (
      <VStack spacing={4} align="stretch">
        <VStack spacing={1} align="start">
          <Heading size="md" fontSize="lg">📋 Review & Publish</Heading>
          <Text fontSize="sm" color="gray.600">Confirm your listing before publishing.</Text>
        </VStack>

        {/* Images */}
        <Box p={4} bg="gray.50" borderRadius="lg">
          <Text fontWeight="semibold" fontSize="sm" mb={3} color="gray.700">Media</Text>
          <SimpleGrid columns={4} spacing={2}>
            {imagePreviewUrls.slice(0, 4).map((url, i) => (
              <Box key={i} position="relative" aspectRatio={1}>
                <Image src={url} alt={`Product ${i + 1}`} borderRadius="lg" objectFit="cover" w="full" h="full" />
                {i === 0 && <Badge position="absolute" bottom={1} left={1} colorScheme="brand" fontSize="8px" px={2}>Cover</Badge>}
              </Box>
            ))}
          </SimpleGrid>
          {imagePreviewUrls.length > 4 && (
            <Text fontSize="sm" color="gray.600" mt={2}>+{imagePreviewUrls.length - 4} more image(s)</Text>
          )}
          {uploadedVideo && (
            <Text fontSize="sm" color="gray.600" mt={1}>📹 Video attached</Text>
          )}
        </Box>

        {/* Product Details */}
        <Box p={4} bg="gray.50" borderRadius="lg">
          <Text fontWeight="semibold" fontSize="sm" mb={3} color="gray.700">Product Details</Text>
          <VStack spacing={2} align="stretch">
            {[
              { label: 'Name', value: formData.title },
              { label: 'Condition', value: formData.condition },
              { label: 'Category', value: formData.category },
              { label: 'Item Type', value: formData.item_type || '—' },
              { label: 'Brand', value: formData.brand || '—' },
            ].map(({ label, value }) => (
              <HStack key={label} justify="space-between">
                <Text fontSize="sm" color="gray.600">{label}</Text>
                <Text fontSize="sm" fontWeight="medium">{value}</Text>
              </HStack>
            ))}
            {formData.estimated_value_min !== undefined && (
              <HStack justify="space-between">
                <Text fontSize="sm" color="gray.600">Est. Value</Text>
                <Text fontSize="sm" fontWeight="medium">
                  ₱{(formData.estimated_value_min || 0).toLocaleString()} – ₱{(formData.estimated_value_max || 0).toLocaleString()}
                </Text>
              </HStack>
            )}
          </VStack>
        </Box>

        {/* Description */}
        <Box p={4} bg="gray.50" borderRadius="lg">
          <Text fontWeight="semibold" fontSize="sm" color="gray.700" mb={2}>Description</Text>
          <Text fontSize="sm" noOfLines={3} color="gray.700">{formData.description}</Text>
        </Box>

        {/* Authenticity */}
        {formData.authenticity_risks && (
          <Box p={3} bg={formData.authenticity_risks === 'High' ? 'red.50' : formData.authenticity_risks === 'Medium' ? 'orange.50' : 'green.50'}
            borderRadius="lg" borderLeft="4px solid"
            borderLeftColor={formData.authenticity_risks === 'High' ? 'red.400' : formData.authenticity_risks === 'Medium' ? 'orange.400' : 'green.400'}>
            <HStack spacing={2}>
              <Text fontSize="sm" fontWeight="semibold">Risk:</Text>
              <Badge colorScheme={formData.authenticity_risks === 'High' ? 'red' : formData.authenticity_risks === 'Medium' ? 'orange' : 'green'} fontSize="xs">
                {formData.authenticity_risks}
              </Badge>
            </HStack>
          </Box>
        )}

        {/* Location */}
        <Box p={4} bg="green.50" borderRadius="lg" borderLeft="4px solid" borderLeftColor="green.400">
          <Text fontSize="sm" fontWeight="semibold" color="green.800" mb={2}>📍 Location</Text>
          <Text fontSize="sm" color="gray.700">{formData.location || 'Not detected'}</Text>
        </Box>

        {/* Trade Preferences */}
        <Box p={4} bg="blue.50" borderRadius="lg">
          <Text fontWeight="semibold" fontSize="sm" mb={3} color="gray.700">Trading</Text>
          <VStack spacing={2} align="stretch">
            <Box>
              <Text fontSize="xs" color="gray.600" fontWeight="semibold">Wants</Text>
              <Text fontSize="sm" mt={1}>{formData.wants || '—'}</Text>
            </Box>
            {wantedCategories.length > 0 && (
              <Box>
                <Text fontSize="xs" color="gray.600" fontWeight="semibold" mb={1}>Categories</Text>
                <HStack flexWrap="wrap" spacing={1}>
                  {wantedCategories.map(c => <Badge key={c} colorScheme="brand" fontSize="xs">{c}</Badge>)}
                </HStack>
              </Box>
            )}
            <HStack justify="space-between">
              <Text fontSize="xs" color="gray.600" fontWeight="semibold">Type</Text>
              <Badge colorScheme={formData.barter_only ? 'blue' : 'green'} fontSize="xs">
                {formData.barter_only ? 'Barter Only' : 'Barter + Cash'}
              </Badge>
            </HStack>
          </VStack>
        </Box>

        {/* Ready to post */}
        <Box p={4} bg="brand.50" borderRadius="lg" borderLeft="4px solid" borderLeftColor="brand.400" textAlign="center">
          <HStack justify="center" spacing={2}>
            <CheckIcon color="brand.500" boxSize={4} />
            <Text fontWeight="semibold" fontSize="sm" color="brand.700">Everything looks good! Ready to publish.</Text>
          </HStack>
        </Box>
      </VStack>
    )
  }

  const stepLabels = [
    { number: 1, title: 'Upload Media', icon: '📸' },
    { number: 2, title: 'Details & Preferences', icon: '✏️' },
    { number: 3, title: 'Review & Post', icon: '📋' },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box minH="100vh" bg={pageBg} py={6}>
      <Box p={6} maxW="3xl" mx="auto">
        <VStack spacing={5} align="stretch">
          {/* Compact Header - Single Line with Step Indicator */}
          <HStack justify="space-between" align="center">
            <Box>
              <Heading size="lg" color="brand.500" mb={0.5}>Post a Product</Heading>
              <Text fontSize="sm" color="gray.600">Step {currentStep}/{TOTAL_STEPS}</Text>
            </Box>
            <Badge colorScheme="brand" fontSize="sm" px={3} py={1.5}>
              {stepLabels[currentStep - 1].icon} {stepLabels[currentStep - 1].title}
            </Badge>
          </HStack>

          {/* Compact Step Progress Bar - No Numbered Circles */}
          <Progress
            value={(currentStep / TOTAL_STEPS) * 100}
            colorScheme="brand"
            size="sm"
            borderRadius="full"
          />

          {/* Step Content */}
          <Box bg={bgColor} p={{ base: 6, md: 8 }} borderRadius="xl" shadow="sm" border="1px" borderColor={borderColor}>
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
          </Box>

          {/* Navigation */}
          <HStack justify="space-between" pb={{ base: 20, sm: 0 }} pt={2}>
            <Button
              leftIcon={<ArrowBackIcon />}
              onClick={() => setCurrentStep(s => Math.max(1, s - 1))}
              isDisabled={currentStep === 1}
              variant="outline"
              size="md"
            >
              Back
            </Button>

            {currentStep < TOTAL_STEPS ? (
              <Button
                rightIcon={<ArrowForwardIcon />}
                onClick={() => setCurrentStep(s => s + 1)}
                isDisabled={!canProceed()}
                colorScheme="brand"
                size="md"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                isLoading={isSubmitting}
                loadingText="Posting..."
                colorScheme="brand"
                size="md"
                px={8}
                leftIcon={<CheckIcon />}
              >
                Post Product
              </Button>
            )}
          </HStack>
        </VStack>
      </Box>

      <FloatingTab showAddButton={false} />
    </Box>
  )
}

export default AddProduct
