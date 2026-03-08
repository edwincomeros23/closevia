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
  InputGroup,
  Textarea,
  Switch,
  Checkbox,
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
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Skeleton,
  SkeletonText,
} from '@chakra-ui/react'
import { AddIcon, CloseIcon, ArrowForwardIcon, ArrowBackIcon, CheckIcon } from '@chakra-ui/icons'
import { MdEdit } from 'react-icons/md'

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
const MAX_DAILY_AI_REQUESTS = 100

// ── Daily Budget Helpers ──────────────────────────────────────────────────

const getDailyRequestKey = (): string => {
  const today = new Date().toISOString().split('T')[0]
  return `ai_requests_${today}`
}

const getCurrentDailyCount = (): number => {
  const key = getDailyRequestKey()
  const stored = localStorage.getItem(key)
  return stored ? parseInt(stored, 10) : 0
}

const incrementDailyCount = (): void => {
  const key = getDailyRequestKey()
  const current = getCurrentDailyCount()
  localStorage.setItem(key, String(current + 1))
}

const canMakeAIRequest = (): boolean => {
  return getCurrentDailyCount() < MAX_DAILY_AI_REQUESTS
}

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
    tags: '[]',
    wanted_categories: [],
  })

  const [uploadedImages, setUploadedImages] = useState<File[]>([])
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([])
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null)
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiDone, setAiDone] = useState(false)
  
  // AI Analysis blocking/warning state
  const [aiBlockingError, setAiBlockingError] = useState<string | null>(null) // Blocks form submission
  const [aiWarnings, setAiWarnings] = useState<string[]>([]) // Just warnings

  const [titleLength, setTitleLength] = useState(0)
  const [descriptionLength, setDescriptionLength] = useState(0)
  const [wantedCategories, setWantedCategories] = useState<string[]>([])
  const [wantsError, setWantsError] = useState<string | null>(null)
  const [showCategoryMore, setShowCategoryMore] = useState(false)
  const [expandTradePrefs, setExpandTradePrefs] = useState(false)

  const [locationText, setLocationText] = useState<string>('')
  const [locationDetected, setLocationDetected] = useState(false)
  const [isGettingLocation, setIsGettingLocation] = useState(false)
  const [nameFieldFocused, setNameFieldFocused] = useState(false)
  const [descriptionFieldFocused, setDescriptionFieldFocused] = useState(false)
  const [expandProductDetails, setExpandProductDetails] = useState(false)

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
    // Check daily request limit
    if (!canMakeAIRequest()) {
      toast({
        title: '⏱️ Daily limit reached',
        description: 'AI analysis limit reached for today. Try again tomorrow.',
        status: 'warning',
        duration: 5000,
        isClosable: true,
        position: 'top-right',
      })
      return
    }

    if (aiTriggeredRef.current || isGenerating) return
    aiTriggeredRef.current = true
    setIsGenerating(true)

    toast({
      title: '🔍 Analyzing images...',
      description: 'AI is scanning all photos for product details and checking image quality.',
      status: 'info',
      duration: 3000,
      isClosable: true,
      position: 'top-right',
    })

    try {
      // Send all images in a batch (single API request)
      const fd = new FormData()
      images.forEach(f => fd.append('images', f))
      
      const response = await api.post('/api/products/generate-details', fd)
      const data = response.data
      if (data.success && data.data) {
        const d = data.data
        
        // SAFETY CHECK: Handle top-level prohibition first (most critical)
        if (d.prohibited) {
          // Increment daily counter ONLY for safety check rejections (still count as a request)
          incrementDailyCount()
          
          setIsGenerating(false)
          aiTriggeredRef.current = false
          
          // Clear the uploaded images since they contain prohibited content
          setUploadedImages([])
          setImagePreviewUrls([])
          
          // Show prominent error message
          toast({
            title: '❌ Cannot list this item',
            description: d.reason || 'This item cannot be listed for trading.',
            status: 'error',
            duration: 8000,
            isClosable: true,
            position: 'top-right',
          })
          
          // Set blocking error to show it on Step 1
          setAiBlockingError(d.reason || 'This item cannot be listed for trading.')
          
          // Stay on Step 1 - do NOT navigate to Step 2
          return
        }
        
        // Increment daily counter for successful analysis
        incrementDailyCount()
        
        const warnings: string[] = []
        
        // Check for secondary blocking issues (older field structure)
        if (d.is_prohibited) {
          setAiBlockingError(d.prohibited_reason || 'This item cannot be listed for trading.')
          setIsGenerating(false)
          toast({
            title: '❌ Item cannot be listed',
            description: d.prohibited_reason || 'This item cannot be listed for trading.',
            status: 'error',
            duration: 5000,
            isClosable: true,
            position: 'top-right',
          })
          return
        }
        
        // Check for person warning
        if (d.contains_person) {
          warnings.push(d.person_warning || 'This photo contains a person. Please retake without people in frame.')
        }
        
        // Check for suspicious image warning
        if (d.is_suspicious_image) {
          const reason = d.suspicious_reason || 'This looks like a screenshot or stock photo'
          warnings.push(`⚠️ ${reason}: Original product photos work better and get better engagement!`)
        }
        
        // Check for quality warning
        if (d.is_blurry_or_dark) {
          warnings.push(d.quality_warning || 'This photo is too dark or blurry. Better lighting and focus will help buyers see your item clearly.')
        }
        
        setAiWarnings(warnings)
        
        // Fill form with AI data
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
        
        if (warnings.length > 0) {
          toast({
            title: '⚠️ AI completed with notes',
            description: warnings[0],
            status: 'warning',
            duration: 5000,
            isClosable: true,
            position: 'top-right',
          })
        } else {
          toast({
            title: '✨ AI analysis complete!',
            description: 'Product fields have been auto-filled. Review and edit as needed.',
            status: 'success',
            duration: 4000,
            isClosable: true,
            position: 'top-right',
          })
        }
      } else {
        throw new Error(data.error || 'AI generation failed')
      }
    } catch (err: any) {
      aiTriggeredRef.current = false // allow retry
      // Only increment daily counter on failures if we haven't already
      // (safety rejections already increment above)
      incrementDailyCount()
      
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

  // ── Effects ───────────────────────────────────────────────────────────────

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
      
      // Clear AI errors when new images are uploaded
      setAiBlockingError(null)
      setAiWarnings([])
      aiTriggeredRef.current = false
      setAiDone(false)
    }
    processFiles()
  }, [uploadedImages.length, toast])

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index))
    setImagePreviewUrls(prev => prev.filter((_, i) => i !== index))
    // Clear AI errors and allow re-triggering when images are removed
    setAiBlockingError(null)
    setAiWarnings([])
    aiTriggeredRef.current = false
    setAiDone(false)
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
    // If there's a blocking AI error, cannot proceed
    if (aiBlockingError) {
      return false
    }
    
    // Cannot proceed if daily AI request limit reached on step 1
    if (currentStep === 1 && uploadedImages.length >= 1 && !canMakeAIRequest()) {
      return false
    }
    
    switch (currentStep) {
      case 1:
        // Just need at least 1 image - always enabled for navigation
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
      fd.append('tags', formData.tags || '[]')
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

      {/* Safety Rejection Alert - Prominent */}
      {aiBlockingError && (
        <Alert
          status="error"
          variant="solid"
          flexDirection="column"
          alignItems="flex-start"
          justifyContent="flex-start"
          textAlign="left"
          borderRadius="lg"
          py={4}
          px={4}
          bg="red.600"
          color="white"
        >
          <HStack align="flex-start" w="full" mb={2}>
            <AlertIcon boxSize={6} mt={0} />
            <Text fontSize="sm" fontWeight="bold">Item Cannot Be Listed</Text>
          </HStack>
          <Text fontSize="sm" ml={8}>{aiBlockingError}</Text>
          <Text fontSize="xs" ml={8} mt={2} opacity={0.9}>
            Please upload a different photo and try again.
          </Text>
        </Alert>
      )}

      {/* Streamlined Drop Zone - Balanced Height, Mobile Responsive */}
      <Box
        border="2px dashed"
        borderColor={borderColor}
        borderRadius="xl"
        p={{ base: 4, sm: 5 }}
        textAlign="center"
        cursor="pointer"
        _hover={{ borderColor: 'brand.400', bg: 'brand.50' }}
        transition="all 0.2s"
        onClick={() => document.getElementById('img-upload')?.click()}
        minH={{ base: '100px', sm: '120px' }}
      >
        <VStack spacing={2}>
          <AddIcon boxSize={6} color="gray.400" />
          <Text fontSize="sm" fontWeight="semibold" color="gray.600">Click or drag photos</Text>
          <Text fontSize="xs" color="gray.500">JPEG/PNG • max 5MB • up to 8 images</Text>
        </VStack>
      </Box>
      <input id="img-upload" type="file" multiple accept="image/*" style={{ display: 'none' }}
        onChange={e => handleImageUpload(e.target.files)} />

      {/* Horizontal Thumbnail Row - Nice Size, Scrollable on Mobile */}
      {uploadedImages.length > 0 && (
        <VStack spacing={2} align="stretch">
          <HStack spacing={{ base: 1.5, sm: 2 }} overflowX="auto" pb={1}>
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
          <HStack justify="space-between" align="center" w="full">
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
      
      {/* AI Analysis Status - Loading, Errors, & Warnings */}
      {isGenerating && (
        <VStack spacing={2} align="stretch" w="full" bg="blue.50" p={4} borderRadius="lg" border="1px solid" borderColor="blue.200">
          <HStack spacing={2}>
            <Spinner size="sm" color="blue.500" />
            <Text fontSize="sm" fontWeight="semibold" color="blue.700">
              🔍 Analyzing images...
            </Text>
          </HStack>
          <Text fontSize="xs" color="blue.600">
            AI is checking image quality, detecting prohibited items, and extracting product details...
          </Text>
        </VStack>
      )}
      
      {aiBlockingError && (
        <Alert status="error" borderRadius="lg" variant="left-accent">
          <AlertIcon />
          <Box flex="1">
            <AlertTitle fontSize="sm" fontWeight="semibold">Cannot list this item</AlertTitle>
            <AlertDescription fontSize="sm" mt={1}>
              {aiBlockingError}
            </AlertDescription>
          </Box>
        </Alert>
      )}
      
      {aiWarnings.length > 0 && (
        <VStack spacing={2} align="stretch" w="full">
          {aiWarnings.map((warning, idx) => (
            <Alert key={idx} status="warning" borderRadius="lg" variant="left-accent">
              <AlertIcon />
              <Box flex="1">
                <AlertDescription fontSize="sm">
                  {warning}
                </AlertDescription>
              </Box>
            </Alert>
          ))}
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
    <VStack spacing={2} align="stretch">
      {/* ──────── AI SUMMARY CARD (Collapsed by default) ──────── */}
      <Box
        bg="white"
        borderRadius="lg"
        borderWidth="1px"
        borderColor="gray.200"
        p={2.5}
        cursor="pointer"
        onClick={() => setExpandProductDetails(!expandProductDetails)}
        transition="all 0.2s"
        _hover={{ borderColor: "brand.300", shadow: "sm" }}
      >
        {/* Collapsed View */}
        {!expandProductDetails ? (
          <HStack justify="space-between" align="center" spacing={2}>
            {/* AI Badges or Loading Skeleton */}
            {isGenerating && !aiDone ? (
              <HStack spacing={2} flex={1} minW={0}>
                <Skeleton height="20px" width="60px" borderRadius="md" />
                <Skeleton height="20px" width="80px" borderRadius="md" />
                <Skeleton height="20px" width="70px" borderRadius="md" />
              </HStack>
            ) : aiDone ? (
              <HStack spacing={1} flex={1} minW={0}>
                <Text fontSize="8px" fontWeight="bold" color="purple.600">✨</Text>
                <Badge fontSize="7px" colorScheme="purple" py={0.5} noOfLines={1}>
                  {formData.item_type || '—'}
                </Badge>
                <Badge fontSize="7px" colorScheme="gray" py={0.5} noOfLines={1}>
                  {formData.brand || '—'}
                </Badge>
                <Badge
                  fontSize="7px"
                  colorScheme={
                    formData.authenticity_risks === 'High' ? 'red' :
                    formData.authenticity_risks === 'Medium' ? 'orange' : 'green'
                  }
                  py={0.5}
                  noOfLines={1}
                >
                  {formData.authenticity_risks || 'Low'}
                </Badge>
              </HStack>
            ) : (
              <Text fontSize="xs" color="gray.600" flex={1}>
                {formData.title || 'Enter product details...'}
              </Text>
            )}
            {/* Dropdown Arrow */}
            <Text
              fontSize="lg"
              color="gray.500"
              transform={expandProductDetails ? "rotate(180deg)" : "rotate(0deg)"}
              transition="transform 0.2s"
              flexShrink={0}
            >
              ▼
            </Text>
          </HStack>
        ) : (
          /* Expanded View */
          <VStack spacing={2} align="stretch">
            {/* Close/Collapse hint - clicking these closes the dropdown */}
            <HStack justify="space-between" align="center" onClick={() => setExpandProductDetails(false)}>
              <Text fontSize="xs" fontWeight="bold" color="gray.700">Edit Details</Text>
              <Text fontSize="lg" color="gray.500" cursor="pointer">▲</Text>
            </HStack>

            {/* AI Analyzing Indicator */}
            {isGenerating && !aiDone && (
              <Alert
                status="info"
                fontSize="xs"
                borderRadius="md"
                bg="blue.50"
                borderColor="blue.200"
                borderWidth="1px"
              >
                <Spinner size="xs" mr={2} color="blue.500" />
                <Text color="blue.700">AI is analyzing your photos...</Text>
              </Alert>
            )}

            {/* Product Name */}
            <FormControl isRequired>
              <FormLabel fontSize="xs" fontWeight="bold" color="gray.600">Product Name</FormLabel>
              <Input
                placeholder="e.g., Nike Air Force 1"
                value={formData.title}
                onChange={e => {
                  handleField('title', e.target.value)
                  setTitleLength(e.target.value.length)
                }}
                onFocus={() => setNameFieldFocused(true)}
                onBlur={() => setNameFieldFocused(false)}
                maxLength={25}
                onClick={e => e.stopPropagation()}
                size="sm"
                h="32px"
              />
              {nameFieldFocused && (
                <Badge colorScheme={titleLength <= 25 ? 'green' : 'orange'} fontSize="9px" mt={1}>
                  {titleLength}/25
                </Badge>
              )}
            </FormControl>

            {/* Product Description */}
            <FormControl isRequired>
              <FormLabel fontSize="xs" fontWeight="bold" color="gray.600">Description</FormLabel>
              <Textarea
                placeholder="Describe your product..."
                value={formData.description}
                onChange={e => {
                  handleField('description', e.target.value)
                  setDescriptionLength(e.target.value.length)
                }}
                onFocus={() => setDescriptionFieldFocused(true)}
                onBlur={() => setDescriptionFieldFocused(false)}
                onClick={e => e.stopPropagation()}
                rows={2}
                size="sm"
              />
              {descriptionFieldFocused && (
                <HStack justify="space-between" mt={1}>
                  <Text fontSize="9px" color={descriptionLength < 50 ? 'red.500' : 'gray.500'}>
                    {descriptionLength < 50 ? `${50 - descriptionLength} more chars` : '✓ Min met'}
                  </Text>
                  <Badge colorScheme={descriptionLength < 50 ? 'red' : 'green'} fontSize="9px">
                    {descriptionLength}/800
                  </Badge>
                </HStack>
              )}
            </FormControl>

            {/* Condition + Category - Responsive */}
            <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={2}>
              <FormControl isRequired>
                <FormLabel fontSize="xs" fontWeight="bold" color="gray.600">Condition</FormLabel>
                <Select
                  placeholder="Select"
                  value={formData.condition}
                  onChange={e => handleField('condition', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  size="sm"
                  h="32px"
                >
                  {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </FormControl>

              <FormControl isRequired>
                <FormLabel fontSize="xs" fontWeight="bold" color="gray.600">Category</FormLabel>
                <Select
                  placeholder="Select"
                  value={formData.category}
                  onChange={e => handleField('category', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  size="sm"
                  h="32px"
                >
                  {PRODUCT_CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </Select>
              </FormControl>
            </SimpleGrid>
          </VStack>
        )}
      </Box>

      {/* ──────── LOCATION BAR (Simple, subtle) ──────── */}
      <Box bg="gray.100" p={2} borderRadius="md">
        {isGettingLocation ? (
          <HStack spacing={2}>
            <Spinner size="sm" color="blue.600" />
            <Text fontSize="xs" color="gray.600">Detecting location...</Text>
          </HStack>
        ) : locationDetected && locationText ? (
          <HStack justify="space-between" align="center" spacing={2}>
            <Text fontSize="xs" color="gray.700">
              📍 {locationText}
            </Text>
            <Button
              size="xs"
              variant="ghost"
              fontSize="9px"
              h="auto"
              py={1}
              onClick={detectLocation}
              isLoading={isGettingLocation}
              _hover={{ bg: "gray.200" }}
            >
              Wrong Location?
            </Button>
          </HStack>
        ) : (
          <HStack spacing={2}>
            <Text fontSize="xs" color="red.600">⚠️ Location access needed</Text>
            <Button size="xs" onClick={detectLocation} isLoading={isGettingLocation} fontSize="9px">
              Enable
            </Button>
          </HStack>
        )}
      </Box>

      {/* ──────── WHAT I WANT (Main Focus) ──────── */}
      <VStack spacing={1.5} align="stretch">
        <Heading fontSize="sm" fontWeight="bold" color="gray.800">
          🔄 What I Want in Exchange
        </Heading>

        {/* Desired Items */}
        <FormControl isRequired isInvalid={!!wantsError}>
          <Textarea
            placeholder="List specific items you're looking for..."
            value={formData.wants}
            onChange={e => {
              handleField('wants', e.target.value)
              setWantsError(validateDesiredItems(e.target.value))
            }}
            rows={3}
            size="sm"
          />
          {wantsError && <Text fontSize="xs" color="red.500" mt={1}>{wantsError}</Text>}
        </FormControl>

        {/* Categories - Horizontally Scrollable on Mobile */}
        <FormControl>
          <FormLabel fontSize="xs" fontWeight="bold" color="gray.600">Categories</FormLabel>
          <Box
            display={{ base: "flex", sm: "grid" }}
            gridTemplateColumns={{ sm: "repeat(auto-fill, minmax(90px, 1fr))" }}
            flexWrap={{ base: "nowrap", sm: "wrap" }}
            overflowX={{ base: "auto", sm: "visible" }}
            gap={1}
            p={1.5}
            bg="white"
            borderRadius="md"
            border="1px"
            borderColor="gray.300"
            maxH={{ base: "none", sm: showCategoryMore ? "none" : "80px" }}
            overflow={{ base: "auto", sm: "hidden" }}
            pb={{ base: 1, sm: 0 }}
            transition="max-height 0.3s"
          >
            {PRODUCT_CATEGORIES.map(cat => {
              const selected = wantedCategories.includes(cat.value)
              return (
                <Badge
                  key={cat.value}
                  px={2}
                  py={1.5}
                  borderRadius="full"
                  cursor="pointer"
                  fontSize="xs"
                  fontWeight="medium"
                  bg={selected ? 'brand.500' : 'gray.100'}
                  color={selected ? 'white' : 'gray.700'}
                  _hover={{ bg: selected ? 'brand.600' : 'gray.200' }}
                  transition="all 0.15s"
                  onClick={() => setWantedCategories(prev =>
                    selected ? prev.filter(c => c !== cat.value) : [...prev, cat.value]
                  )}
                  justifyContent="center"
                  minW={{ base: "max-content", sm: "auto" }}
                  whiteSpace={{ base: "nowrap", sm: "normal" }}
                >
                  {cat.label}
                </Badge>
              )
            })}
          </Box>
          {!showCategoryMore && PRODUCT_CATEGORIES.length > 12 && (
            <Button
              size="xs"
              variant="ghost"
              fontSize="xs"
              mt={1}
              onClick={() => setShowCategoryMore(true)}
              colorScheme="gray"
              w="full"
              display={{ base: "none", sm: "block" }}
            >
              + {PRODUCT_CATEGORIES.length - 12} More Categories
            </Button>
          )}
          {showCategoryMore && (
            <Button
              size="xs"
              variant="ghost"
              fontSize="xs"
              mt={1}
              onClick={() => setShowCategoryMore(false)}
              colorScheme="gray"
              w="full"
              display={{ base: "none", sm: "block" }}
            >
              - Show Less
            </Button>
          )}
        </FormControl>
      </VStack>
    </VStack>
  )

  const renderStep3 = () => {
    const tags: string[] = (() => {
      try { return formData.tags ? JSON.parse(formData.tags) : [] }
      catch { return [] }
    })()

    const listingDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    return (
      <VStack spacing={4} align="stretch">
        {/* ──────── PRODUCT IMAGES GALLERY ──────── */}
        <Box>
          {imagePreviewUrls.length > 0 ? (
            <SimpleGrid columns={{ base: 5, sm: 6 }} spacing={0.5}>
              {imagePreviewUrls.map((url, idx) => (
                <Box
                  key={idx}
                  position="relative"
                  paddingBottom="100%"
                  bg="gray.100"
                  borderRadius="xs"
                  overflow="hidden"
                >
                  <Image
                    src={url}
                    alt={`Product ${idx + 1}`}
                    position="absolute"
                    top={0}
                    left={0}
                    w="full"
                    h="full"
                    objectFit="cover"
                  />
                </Box>
              ))}
            </SimpleGrid>
          ) : (
            <Box
              w="full"
              h="150px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
              color="white"
              borderRadius="lg"
            >
              <VStack spacing={2}>
                <Text fontSize="3xl">📚</Text>
                <Text fontSize="sm" fontWeight="medium">Product Images</Text>
              </VStack>
            </Box>
          )}
        </Box>

        {/* ──────── TITLE ──────── */}
        <Box>
          <Heading fontSize="2xl" fontWeight="bold" color="gray.900" mb={2}>
            {formData.title}
          </Heading>

          {/* Metadata Ribbon */}
          <HStack
            spacing={1.5}
            p={2.5}
            bg="gray.100"
            borderRadius="lg"
            flexWrap="wrap"
            fontSize="xs"
            color="gray.700"
            fontWeight="medium"
          >
            <Text>✨ {formData.item_type || 'Item'}</Text>
            <Text>•</Text>
            <Text>{formData.brand || 'Unknown Brand'}</Text>
            <Text>•</Text>
            <Badge
              colorScheme={
                formData.authenticity_risks === 'High' ? 'red' :
                formData.authenticity_risks === 'Medium' ? 'orange' : 'green'
              }
              fontSize="xs"
              variant="subtle"
            >
              {formData.authenticity_risks || 'Low'} Risk
            </Badge>
            <Text>•</Text>
            <Text>{formData.condition}</Text>
            <Text>•</Text>
            <Text color="gray.600" fontSize="xs">Listed {listingDate}</Text>
          </HStack>
        </Box>

        {/* ──────── ESTIMATED VALUE (Prominent) ──────── */}
        <Box
          p={4}
          bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
          borderRadius="xl"
          textAlign="center"
          color="white"
        >
          <Text fontSize="xs" fontWeight="medium" opacity={0.9} mb={1}>
            Estimated Value
          </Text>
          {isGenerating && !aiDone ? (
            <Skeleton height="40px" borderRadius="md" />
          ) : (
            <Heading fontSize="3xl" fontWeight="bold">
              ₱{(formData.estimated_value_min || 0).toLocaleString()} – ₱{(formData.estimated_value_max || 0).toLocaleString()}
            </Heading>
          )}
          <Text fontSize="xs" opacity={0.85} mt={2}>
            {isGenerating && !aiDone ? 'Analyzing your product...' : 'Based on AI analysis of product condition and market data'}
          </Text>
        </Box>

        {/* ──────── DESCRIPTION ──────── */}
        <Box>
          <Heading fontSize="sm" fontWeight="bold" color="gray.800" mb={2}>
            About this item
          </Heading>
          <Text
            fontSize="sm"
            color="gray.700"
            lineHeight={1.7}
            whiteSpace="pre-wrap"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {formData.description}
          </Text>
        </Box>

        {/* ──────── KEY DETAILS GRID - Responsive ──────── */}
        <Box
          p={3}
          bg="gray.50"
          borderRadius="lg"
          display="grid"
          gridTemplateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }}
          gap={3}
        >
          <Box>
            <Text fontSize="xs" color="gray.600" fontWeight="bold" mb={1}>Condition</Text>
            <Text fontSize="sm" fontWeight="medium">{formData.condition}</Text>
          </Box>
          <Box>
            <Text fontSize="xs" color="gray.600" fontWeight="bold" mb={1}>Category</Text>
            <Text fontSize="sm" fontWeight="medium">{formData.category}</Text>
          </Box>
          {formData.authenticity_risks && (
            <Box>
              <Text fontSize="xs" color="gray.600" fontWeight="bold" mb={1}>Authenticity Risk</Text>
              <Badge
                colorScheme={
                  formData.authenticity_risks === 'High' ? 'red' :
                  formData.authenticity_risks === 'Medium' ? 'orange' : 'green'
                }
                fontSize="xs"
              >
                {formData.authenticity_risks}
              </Badge>
            </Box>
          )}
          <Box>
            <Text fontSize="xs" color="gray.600" fontWeight="bold" mb={1}>Location</Text>
            <Text fontSize="sm" fontWeight="medium">📍 {formData.location || 'Not detected'}</Text>
          </Box>
        </Box>

        {/* ──────── TRADING SECTION ──────── */}
        {(formData.wants || wantedCategories.length > 0) && (
          <Box p={3} bg="blue.50" borderRadius="lg" borderLeft="3px solid" borderLeftColor="blue.400">
            <Text fontSize="xs" fontWeight="bold" color="blue.900" mb={2}>
              🔄 Open to Trading For
            </Text>
            {formData.wants && (
              <Text fontSize="sm" color="gray.700" mb={2}>
                {formData.wants}
              </Text>
            )}
            {wantedCategories.length > 0 && (
              <HStack flexWrap="wrap" spacing={1}>
                {wantedCategories.map(cat => (
                  <Badge key={cat} fontSize="xs" colorScheme="blue" variant="subtle">
                    {cat}
                  </Badge>
                ))}
              </HStack>
            )}
          </Box>
        )}

        {/* ──────── READY INDICATOR ──────── */}
        <Box p={3} bg="green.50" borderRadius="lg" textAlign="center" borderLeft="3px solid" borderLeftColor="green.400">
          <HStack justify="center" spacing={2}>
            <CheckIcon color="green.600" boxSize={4} />
            <Text fontWeight="semibold" fontSize="sm" color="green.800">
              Everything looks great! Ready to publish.
            </Text>
          </HStack>
        </Box>
      </VStack>
    )
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  const handleNextClick = useCallback(() => {
    // If on step 1 with images, navigate to step 2 first
    if (currentStep === 1 && uploadedImages.length > 0) {
      // Move to step 2 immediately (instant, snappy navigation)
      setCurrentStep(2)
      // Then trigger AI analysis in the background
      setTimeout(() => {
        triggerAI(uploadedImages)
      }, 0)
      return
    }
    // Otherwise, proceed to next step
    setCurrentStep(s => s + 1)
  }, [currentStep, uploadedImages, triggerAI])

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

          {/* Navigation - Mobile Friendly Button Sizing */}
          <HStack justify="space-between" pb={{ base: 20, sm: 0 }} pt={2} spacing={{ base: 2, sm: 3 }}>
            <Button
              leftIcon={<ArrowBackIcon />}
              onClick={() => setCurrentStep(s => Math.max(1, s - 1))}
              isDisabled={currentStep === 1}
              variant="outline"
              size={{ base: "sm", sm: "md" }}
              fontSize={{ base: "xs", sm: "sm" }}
              minH={{ base: "36px", sm: "40px" }}
            >
              Back
            </Button>

            {currentStep < TOTAL_STEPS ? (
              <Button
                rightIcon={isGenerating ? <Spinner size="sm" /> : <ArrowForwardIcon />}
                onClick={handleNextClick}
                isDisabled={!canProceed()}
                isLoading={isGenerating && currentStep === 1}
                loadingText={isGenerating ? 'Analyzing...' : 'Next'}
                colorScheme="brand"
                size={{ base: "sm", sm: "md" }}
                fontSize={{ base: "xs", sm: "sm" }}
                minH={{ base: "36px", sm: "40px" }}
              >
                {!isGenerating && !canMakeAIRequest() && currentStep === 1 ? 'Limit Reached' : 'Next'}
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                isLoading={isSubmitting}
                loadingText="Posting..."
                colorScheme="brand"
                size={{ base: "sm", sm: "md" }}
                fontSize={{ base: "xs", sm: "sm" }}
                minH={{ base: "36px", sm: "40px" }}
                px={{ base: 4, sm: 8 }}
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
