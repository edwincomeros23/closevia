import React, { useState, useCallback, useEffect } from 'react'
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
  Center,
  useColorModeValue,
  Badge,
  Select,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Spinner,
  Alert,
  AlertIcon,
} from '@chakra-ui/react'
import { AddIcon, CloseIcon, ArrowForwardIcon, ArrowBackIcon, WarningIcon } from '@chakra-ui/icons'
import { useAuth } from '../contexts/AuthContext'
import { useProducts } from '../contexts/ProductContext'
import { api } from '../services/api'
import { ProductCreate } from '../types'
import FloatingTab from '../components/FloatingTab'
import { prepareImageForUpload, isUnsupportedFormat, getFileTypeDescription } from '../utils/imageConverter'
import { PRODUCT_CATEGORIES } from '../utils/categories'


const AddProduct: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { createProduct } = useProducts()
  const toast = useToast()

  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<ProductCreate & { bidding_type?: string }>({
    title: '',
    description: '',
    price: 0,
    image_urls: [],
    premium: false,
    allow_buying: false,
    barter_only: true,
    location: '',
    condition: '',
    category: '',
    wants: '',
    bidding_type: 'none',

  })

  const [uploadedImages, setUploadedImages] = useState<File[]>([])
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([])
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null)
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [descriptionLength, setDescriptionLength] = useState(0)
  const [titleLength, setTitleLength] = useState(0)
  const [locationCoordinates, setLocationCoordinates] = useState<{ lat: number; lng: number } | null>(null)
  const [isGettingLocation, setIsGettingLocation] = useState(true)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [imageConversionMessages, setImageConversionMessages] = useState<Array<{ file: string; message: string; type: 'info' | 'warning' | 'error' }>>([])
  const [wantsValidationError, setWantsValidationError] = useState<string | null>(null)
  const [wantedCategories, setWantedCategories] = useState<string[]>([])
  const { isOpen: isPremiumModalOpen, onOpen: onOpenPremiumModal, onClose: onClosePremiumModal } = useDisclosure()
  const { isOpen: isLocationModalOpen, onOpen: onOpenLocationModal, onClose: onCloseLocationModal } = useDisclosure()

  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  // page background color (applies to entire viewport)
  const pageBg = '#FFFDF1'

  // Validation function for inappropriate/illegal item names
  const validateDesiredItems = (text: string): string | null => {
    const trimmedText = text.trim().toLowerCase()
    if (!trimmedText) return null

    // List of prohibited keywords and patterns
    const prohibitedPatterns = [
      // Weapons and explosives
      /\b(gun|rifle|pistol|shotgun|firearm|ammunition|ammo|bomb|explosive|explosive device|grenade|rocket|missile|landmine)\b/gi,
      // Drugs and controlled substances
      /\b(cocaine|heroin|meth|methamphetamine|fentanyl|lsd|ecstasy|mdma|cannabis|marijuana|weed|drug)\b/gi,
      // Weapons (blades)
      /\b(machete|sword|blade|knife|sharp weapon)\b/gi,
      // Sexual content
      /\b(porn|pornography|adult content|sex content|nude|nudes|sex toy)\b/gi,
      // Animals (living creatures for inappropriate trading)
      /\b(dog|cat|puppy|kitten|animal|pet|livestock|bird|horse|reptile|endangered animal)\b/gi,
      // Body parts/organs (trafficking)
      /\b(kidney|liver|organ|heart|lung|body part)\b/gi,
      // Counterfeit/stolen goods
      /\b(counterfeit|fake|stolen|stole|replica)\b/gi,
      // Explosives and hazardous materials
      /\b(explosives|hazardous|toxic|poison|radioactive|chemical weapon)\b/gi,
      // Human trafficking
      /\b(person|human|slave|slavery|human trafficking)\b/gi,
    ]

    // Check against each prohibited pattern
    for (const pattern of prohibitedPatterns) {
      if (pattern.test(trimmedText)) {
        const match = trimmedText.match(pattern)
        return `❌ Prohibited item detected: "${match?.[0]?.toUpperCase()}". Please use appropriate item names only.`
      }
    }

    return null
  }

  const steps = [
    { number: 1, title: 'Upload Photos', description: 'Add product images' },
    { number: 2, title: 'Basic Info', description: 'Title and description' },
    { number: 3, title: 'What I Want', description: 'Specify items you want in exchange' },
    { number: 4, title: 'Barter Options', description: 'Set exchange preferences' },
    { number: 5, title: 'Price (Optional)', description: 'If buying is allowed' },
    { number: 6, title: 'Review & Post', description: 'Confirm and publish' },
  ]

  const handleImageUpload = useCallback((files: FileList | null) => {
    if (!files) return

    let newFiles = Array.from(files)
    const validFiles = newFiles.filter(file => file.type.startsWith('image/'))

    if (validFiles.length === 0) {
      toast({
        title: 'Invalid file type',
        description: 'Please select only image files',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    // Process each file for format compatibility
    const processFiles = async () => {
      const messages: Array<{ file: string; message: string; type: 'info' | 'warning' | 'error' }> = []
      const processedFiles: File[] = []
      const previewUrls: string[] = []

      for (const file of validFiles.slice(0, 8 - uploadedImages.length)) {
        try {
          const { file: processedFile, isConverted, warning } = await prepareImageForUpload(file, 5)

          if (isConverted) {
            messages.push({
              file: file.name,
              message: `✓ Converted ${getFileTypeDescription(file)} to JPEG for compatibility`,
              type: 'info',
            })
          }

          if (warning) {
            messages.push({
              file: file.name,
              message: warning,
              type: 'warning',
            })
          }

          // Create preview URL
          const reader = new FileReader()
          reader.onload = (e) => {
            previewUrls.push(e.target?.result as string)
            if (previewUrls.length === processedFiles.length) {
              // All files processed
              setImagePreviewUrls(prev => [...prev, ...previewUrls])
            }
          }
          reader.readAsDataURL(processedFile)

          processedFiles.push(processedFile)
        } catch (error: any) {
          messages.push({
            file: file.name,
            message: `✗ Error: ${error.message}`,
            type: 'error',
          })
        }
      }

      // Update state
      setUploadedImages(prev => {
        const newLength = prev.length + processedFiles.length
        if (newLength > 8) {
          toast({
            title: 'Image limit reached',
            description: `You can upload up to 8 images per product. Uploaded ${newLength} images.`,
            status: 'warning',
            duration: 3000,
            isClosable: true,
          })
          return [...prev, ...processedFiles.slice(0, 8 - prev.length)]
        }
        return [...prev, ...processedFiles]
      })

      // Show messages
      if (messages.length > 0) {
        setImageConversionMessages(messages)

        // Auto-dismiss after 5 seconds if all successful
        const hasErrors = messages.some(m => m.type === 'error')
        if (!hasErrors) {
          setTimeout(() => setImageConversionMessages([]), 5000)
        }
      }
    }

    processFiles()
  }, [uploadedImages.length, toast])

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index))
    setImagePreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  const handleVideoUpload = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]

    if (!file.type.startsWith('video/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select a video file (MP4, MOV, etc.)',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    // 50MB limit
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: 'Video too large',
        description: 'Video must be under 50MB',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    // Validate duration (5-15 seconds)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      if (video.duration < 3 || video.duration > 20) {
        toast({
          title: 'Invalid video length',
          description: 'Video should be between 5-15 seconds long',
          status: 'warning',
          duration: 3000,
          isClosable: true,
        })
      }
      setUploadedVideo(file)
      setVideoPreviewUrl(URL.createObjectURL(file))
    }
    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      setUploadedVideo(file)
      setVideoPreviewUrl(URL.createObjectURL(file))
    }
    video.src = URL.createObjectURL(file)
  }, [toast])

  const removeVideo = () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl)
    setUploadedVideo(null)
    setVideoPreviewUrl('')
  }

  const handleInputChange = (field: keyof ProductCreate, value: any) => {
    if (field === 'title') {
      const length = value?.length || 0
      if (length > 25) {
        toast({
          title: 'Name too long',
          description: `Maximum 25 characters allowed (currently ${length})`,
          status: 'warning',
          duration: 2000,
          isClosable: true,
        })
        return
      }
      setTitleLength(length)
    }
    if (field === 'description') {
      const length = value?.length || 0
      if (length > 800) {
        toast({
          title: 'Description too long',
          description: `Maximum 800 characters allowed (currently ${length})`,
          status: 'warning',
          duration: 2000,
          isClosable: true,
        })
        return
      }
      setDescriptionLength(length)
    }
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleGetCurrentLocation = useCallback(() => {
    setIsGettingLocation(true)
    setLocationError(null)

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser')
      setIsGettingLocation(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        setLocationCoordinates({ lat: latitude, lng: longitude })

        // Reverse geocode to get full address
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          )
          const data = await response.json()
          const address = data.address || {}

          // Build full address: purok, barangay, city, municipality
          const purok = address.hamlet || address.village || ''
          const barangay = address.suburb || address.neighborhood || ''
          const city = address.city || address.town || ''
          const municipality = address.county || ''

          const addressParts = [purok, barangay, city, municipality].filter(Boolean)
          const fullAddress = addressParts.join(', ') || `Location ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`

          handleInputChange('location', fullAddress)
        } catch (error) {
          handleInputChange('location', `Location ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
        }

        setIsGettingLocation(false)
      },
      (error) => {
        let errorMessage = 'Unable to retrieve your location'
        if (error.code === error.PERMISSION_DENIED) {
          errorMessage = 'Location permission denied. Please enable it in your browser settings.'
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMessage = 'Location information is unavailable.'
        } else if (error.code === error.TIMEOUT) {
          errorMessage = 'The request to get user location timed out.'
        }
        setLocationError(errorMessage)
        setIsGettingLocation(false)
      }
    )
  }, [])

  // Auto-load location on component mount
  useEffect(() => {
    handleGetCurrentLocation()
  }, [handleGetCurrentLocation])

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async () => {
    // Validation before submission
    if (!formData.title.trim()) {
      toast({
        title: 'Missing name',
        description: 'Please enter a product name',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    if (!formData.description.trim()) {
      toast({
        title: 'Missing description',
        description: 'Please enter a product description',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    if (formData.description.trim().length < 50) {
      toast({
        title: 'Description too short',
        description: 'Please enter at least 50 characters in the description',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    if (uploadedImages.length === 0) {
      toast({
        title: 'No images',
        description: 'Please upload at least one product image',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    if (formData.allow_buying && (!formData.price || formData.price <= 0)) {
      toast({
        title: 'Invalid price',
        description: 'Please enter a valid price if buying is allowed',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    // Validate desired items (wants field)
    const wantsError = validateDesiredItems(formData.wants || '')
    if (wantsError) {
      toast({
        title: 'Invalid desired items',
        description: wantsError,
        status: 'error',
        duration: 4000,
        isClosable: true,
      })
      setCurrentStep(3)
      return
    }

    // Validate file sizes (5MB per image)
    const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
    for (const file of uploadedImages) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds 5MB limit`,
          status: 'error',
          duration: 3000,
          isClosable: true,
        })
        return
      }
    }

    setIsSubmitting(true)

    try {
      const formDataToSend = new FormData()

      // Append fields in exact order backend expects
      formDataToSend.append('title', formData.title.trim())
      formDataToSend.append('description', formData.description.trim())
      formDataToSend.append('price', String(formData.price || 0))
      formDataToSend.append('premium', formData.premium ? '1' : '0')
      formDataToSend.append('allow_buying', formData.allow_buying ? '1' : '0')
      formDataToSend.append('barter_only', formData.barter_only ? '1' : '0')
      formDataToSend.append('bidding_type', formData.bidding_type || 'none')
      formDataToSend.append('location', formData.location?.trim() || '')
      formDataToSend.append('condition', formData.condition || 'Used')
      formDataToSend.append('category', formData.category || 'General')
      if (formData.wants?.trim()) {
        formDataToSend.append('wants', formData.wants.trim())
      }
      if (wantedCategories.length > 0) {
        formDataToSend.append('wanted_categories', JSON.stringify(wantedCategories))
      }

      // Append each image file
      uploadedImages.forEach((file) => {
        formDataToSend.append('images', file)
      })

      // Append video if uploaded
      if (uploadedVideo) {
        formDataToSend.append('video', uploadedVideo)
      }

      // Log what we're sending
      console.log('=== FORM DATA CONTENTS ===')
      for (let [key, value] of formDataToSend.entries()) {
        if (value instanceof File) {
          console.log(`${key}: File - ${value.name} (${value.size} bytes, ${value.type})`)
        } else {
          console.log(`${key}: ${value}`)
        }
      }
      console.log('========================')

      const response = await createProduct(formDataToSend)
      console.log('Product created successfully:', response)

      toast({
        title: 'Product created!',
        description: 'Your product has been successfully posted',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })

      // Invalidate dashboard products cache so the new product appears immediately
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'products'] })
      navigate('/dashboard')
    } catch (error: any) {
      console.error('=== PRODUCT CREATION ERROR ===')
      console.error('HTTP Status:', error.response?.status)
      console.error('Backend Response:', error.response?.data)
      console.error('Backend Message:', error.response?.data?.error || error.response?.data?.message)
      console.error('Request URL:', error.config?.url)
      console.error('Request Headers:', error.config?.headers)
      console.error('Full Error:', error.message)
      console.error('=============================')

      const errorMessage =
        error.response?.data?.details ||
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        'Failed to create product. Please check the browser console for details.'

      toast({
        title: 'Error creating product',
        description: errorMessage,
        status: 'error',
        duration: 6000,
        isClosable: true,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1: return uploadedImages.length >= 3
      case 2: return formData.title.trim() && formData.description.trim() && titleLength > 0 && titleLength <= 25 && descriptionLength >= 50 && descriptionLength <= 500 && !!formData.condition && !!formData.category && !!formData.location?.trim()
      case 3: return (formData.wants?.trim() || false) && !wantsValidationError // What I Want is required and must be valid
      case 4: return true // Barter options are always valid
      case 5: return !formData.allow_buying || (formData.allow_buying && formData.price && formData.price > 0)
      case 6: return true
      default: return false
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <VStack spacing={6} align="stretch">
            <Text fontSize="lg" color="gray.600" display={{ base: 'none', md: 'block' }}>
              Upload at least 3 photos of your product. First image will be the cover.
            </Text>

            {/* Drag & Drop Area */}
            <Box
              border="2px dashed"
              borderColor={borderColor}
              borderRadius="lg"
              p={4}
              textAlign="center"
              cursor="pointer"
              _hover={{ borderColor: 'brand.500' }}
              onClick={() => document.getElementById('image-upload')?.click()}
            >
              <VStack spacing={2}>
                <AddIcon boxSize={6} color="gray.400" />
                <VStack spacing={0}>
                  <Text fontSize="sm" color="gray.600" fontWeight="medium">
                    Click to upload or drag and drop
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    PNG, JPG up to 5MB (min. 3 images)
                  </Text>
                </VStack>
              </VStack>
            </Box>

            <input
              id="image-upload"
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleImageUpload(e.target.files)}
              style={{ display: 'none' }}
            />

            {/* Image Count Status */}
            <Box>
              <HStack justify="space-between" mb={3}>
                <Text fontWeight="semibold" color="gray.700">
                  Images uploaded: {uploadedImages.length}/8
                </Text>
                {uploadedImages.length === 0 && (
                  <Badge colorScheme="orange">
                    Need {3 - uploadedImages.length} more image(s)
                  </Badge>
                )}
                {uploadedImages.length >= 3 && (
                  <Badge colorScheme="green">
                    Ready to proceed
                  </Badge>
                )}
              </HStack>
            </Box>

            {/* Image Previews */}
            {uploadedImages.length > 0 && (
              <SimpleGrid columns={{ base: 4, md: 4 }} spacing={2}>
                {uploadedImages.map((_, index) => (
                  <Box key={index} position="relative" aspectRatio="1">
                    <Image
                      src={imagePreviewUrls[index]}
                      alt={`Preview ${index + 1}`}
                      borderRadius="md"
                      objectFit="cover"
                      w="full"
                      h="full"
                    />
                    <IconButton
                      icon={<CloseIcon />}
                      aria-label="Remove image"
                      size="xs"
                      position="absolute"
                      top={1}
                      right={1}
                      colorScheme="red"
                      onClick={() => removeImage(index)}
                    />
                  </Box>
                ))}
              </SimpleGrid>
            )}

            {/* Video Upload Section */}
            <Box mt={4}>
              <Text fontWeight="semibold" color="gray.700" mb={2}>
                Product Video (Optional)
              </Text>
              <Text fontSize="xs" color="gray.500" mb={2}>
                Add a short 5-15 second video of your product
              </Text>
              {!uploadedVideo ? (
                <Box
                  border="2px dashed"
                  borderColor={borderColor}
                  borderRadius="lg"
                  p={4}
                  textAlign="center"
                  cursor="pointer"
                  _hover={{ borderColor: 'brand.500' }}
                  onClick={() => document.getElementById('video-upload')?.click()}
                >
                  <VStack spacing={1}>
                    <AddIcon boxSize={5} color="gray.400" />
                    <Text fontSize="sm" color="gray.600">Upload Video</Text>
                    <Text fontSize="xs" color="gray.500">MP4, MOV up to 50MB</Text>
                  </VStack>
                </Box>
              ) : (
                <Box position="relative" borderRadius="lg" overflow="hidden" bg="black" maxH="200px">
                  <video
                    src={videoPreviewUrl}
                    controls
                    style={{ width: '100%', maxHeight: '200px', objectFit: 'contain' }}
                  />
                  <IconButton
                    icon={<CloseIcon />}
                    aria-label="Remove video"
                    size="xs"
                    position="absolute"
                    top={2}
                    right={2}
                    colorScheme="red"
                    onClick={removeVideo}
                  />
                </Box>
              )}
              <input
                id="video-upload"
                type="file"
                accept="video/*"
                onChange={(e) => handleVideoUpload(e.target.files)}
                style={{ display: 'none' }}
              />
            </Box>
          </VStack>
        )

      case 2:
        return (
          <VStack spacing={6} align="stretch">
            <FormControl isRequired>
              <HStack justify="space-between" align="center">
                <FormLabel mb={0}>Product Name</FormLabel>
                <Button
                  size="xs"
                  variant="outline"
                  colorScheme="purple"
                  mb="2"
                  title="Generate product details from images using AI"
                  isLoading={isGenerating}
                  loadingText="Analyzing..."
                  isDisabled={uploadedImages.length < 3 || isGenerating}
                  onClick={async () => {
                    if (uploadedImages.length < 3) {
                      toast({
                        title: 'Insufficient images',
                        description: 'Please upload at least 3 images to use AI generation',
                        status: 'warning',
                        duration: 3000,
                        isClosable: true,
                      })
                      return
                    }
                    setIsGenerating(true)
                    try {
                      const formData = new FormData()
                      uploadedImages.slice(0, 3).forEach((file) => {
                        formData.append('images', file)
                      })
                      const response = await api.post('/api/products/generate-details', formData)
                      const data = response.data
                      if (data.success && data.data) {
                        handleInputChange('title', data.data.title || '')
                        handleInputChange('description', data.data.description || '')
                        handleInputChange('condition', data.data.condition || 'Used')
                        handleInputChange('category', data.data.category || 'General')
                        toast({
                          title: 'AI generation complete!',
                          description: 'Product details have been auto-filled',
                          status: 'success',
                          duration: 3000,
                          isClosable: true,
                        })
                      } else {
                        throw new Error(data.error || 'AI generation failed')
                      }
                    } catch (error: any) {
                      toast({
                        title: 'Generation failed',
                        description: error.message || 'Failed to generate product details',
                        status: 'error',
                        duration: 3000,
                        isClosable: true,
                      })
                    } finally {
                      setIsGenerating(false)
                    }
                  }}
                >
                  ✨ Auto Generate
                </Button>
              </HStack>
              <Input
                placeholder="e.g., iPhone 13 Pro"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                size="lg"
                maxLength={25}
              />
              <HStack justify="space-between" mt={1}>
                <FormHelperText>Be specific (max 25 chars)</FormHelperText>
                <Badge
                  colorScheme={titleLength === 0 ? 'gray' : titleLength <= 25 ? 'green' : 'orange'}
                  fontSize="xs"
                >
                  {titleLength}/25
                </Badge>
              </HStack>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>
                <HStack justify="space-between" w="full">
                  <Text>Description</Text>
                  <Badge
                    colorScheme={
                      descriptionLength < 50 ? 'red' :
                        descriptionLength <= 500 ? 'green' : 'orange'
                    }
                    fontSize="xs"
                  >
                    {descriptionLength}/500 chars
                  </Badge>
                </HStack>
              </FormLabel>
              <Textarea
                placeholder="Describe your product in detail..."
                value={formData.description}
                onChange={(e) => {
                  handleInputChange('description', e.target.value)
                }}
                rows={6}
                size="lg"
                borderColor={
                  descriptionLength < 50 ? 'red.300' :
                    descriptionLength <= 500 ? 'green.300' : 'orange.300'
                }
                _focus={{
                  borderColor:
                    descriptionLength < 50 ? 'red.500' :
                      descriptionLength <= 500 ? 'green.500' : 'orange.500',
                }}
              />
              <Box
                mt={2}
                p={2}
                bg={
                  descriptionLength < 50 ? 'red.50' :
                    descriptionLength <= 500 ? 'green.50' : 'orange.50'
                }
                borderRadius="md"
                borderLeftWidth="4px"
                borderLeftColor={
                  descriptionLength < 50 ? 'red.400' :
                    descriptionLength <= 500 ? 'green.400' : 'orange.400'
                }
              >
                <Text fontSize="sm" color="gray.700">
                  {descriptionLength < 50
                    ? `⚠️ Add at least ${50 - descriptionLength} more characters (minimum 50)`
                    : descriptionLength <= 500
                      ? `✓ Perfect length! ${descriptionLength} characters`
                      : `❌ Description exceeds limit by ${descriptionLength - 500} characters`
                  }
                </Text>
              </Box>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Condition <Text as="span" color="red.500">*</Text></FormLabel>
              <Select
                placeholder="Select condition"
                value={formData.condition}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleInputChange('condition', e.target.value)}
                size="lg"
                borderColor={!formData.condition ? 'red.300' : 'inherit'}
              >
                <option value="New">New</option>
                <option value="Like-New">Like-New</option>
                <option value="Used">Used</option>
                <option value="Fair">Fair</option>
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Category <Text as="span" color="red.500">*</Text></FormLabel>
              <Select
                placeholder="Select category"
                value={formData.category}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleInputChange('category', e.target.value)}
                size="lg"
                borderColor={!formData.category ? 'red.300' : 'inherit'}
              >
                {PRODUCT_CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired isInvalid={!formData.location?.trim() && !isGettingLocation}>
              <FormLabel>Location <Text as="span" color="red.500">*</Text></FormLabel>
              <VStack spacing={2}>
                {isGettingLocation ? (
                  <Box
                    p={3}
                    bg="yellow.50"
                    borderRadius="md"
                    w="full"
                    borderLeft="3px solid"
                    borderLeftColor="yellow.400"
                  >
                    <HStack spacing={2}>
                      <Spinner size="sm" color="yellow.600" />
                      <Text fontSize="sm" color="yellow.800">
                        Detecting your location...
                      </Text>
                    </HStack>
                  </Box>
                ) : locationCoordinates && formData.location ? (
                  <>
                    <Box
                      p={3}
                      bg="green.50"
                      borderRadius="md"
                      w="full"
                      borderLeft="3px solid"
                      borderLeftColor="green.400"
                    >
                      <Text fontSize="sm" color="green.800" fontWeight="semibold" mb={1}>
                        ✓ Location Detected
                      </Text>
                      <Text fontSize="sm" color="gray.700">
                        {formData.location}
                      </Text>
                    </Box>
                    <Button
                      variant="outline"
                      w="full"
                      size="sm"
                      onClick={() => {
                        setLocationCoordinates(null)
                        setLocationError(null)
                        handleInputChange('location', '')
                        handleGetCurrentLocation()
                      }}
                    >
                      Detect Location Again
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      placeholder="e.g., Cebu City, Cebu"
                      value={formData.location}
                      onChange={(e) => handleInputChange('location', e.target.value)}
                      size="lg"
                      borderColor={!formData.location?.trim() ? 'red.300' : 'inherit'}
                    />
                    <Button
                      variant="outline"
                      w="full"
                      size="sm"
                      colorScheme="brand"
                      onClick={() => {
                        setLocationCoordinates(null)
                        setLocationError(null)
                        handleInputChange('location', '')
                        handleGetCurrentLocation()
                      }}
                    >
                      🔄 Try Auto-Detect Again
                    </Button>
                  </>
                )}
                {locationError && (
                  <Box
                    p={2}
                    bg="red.50"
                    borderRadius="md"
                    w="full"
                    borderLeft="3px solid"
                    borderLeftColor="red.400"
                  >
                    <HStack spacing={2}>
                      <WarningIcon color="red.600" boxSize={3} />
                      <Text fontSize="xs" color="red.700">
                        {locationError} — Please type your location manually below.
                      </Text>
                    </HStack>
                  </Box>
                )}
                {!formData.location?.trim() && !isGettingLocation && (
                  <Box
                    p={2}
                    bg="red.50"
                    borderRadius="md"
                    w="full"
                    borderLeftWidth="4px"
                    borderLeftColor="red.400"
                  >
                    <Text fontSize="sm" color="red.700">
                      ⚠️ Location is required to proceed
                    </Text>
                  </Box>
                )}
                <FormHelperText fontSize="xs">
                  Your location helps buyers find nearby items. Auto-detected via GPS or enter manually.
                </FormHelperText>
              </VStack>
            </FormControl>
          </VStack>
        )

      case 3:
        return (
          <VStack spacing={6} align="stretch">
            <Box>
              <Heading size="sm" mb={2} color="gray.700">
                What I Want in Exchange
              </Heading>
              <Text fontSize="sm" color="gray.500" mb={4}>
                Specify the items or categories you're interested in trading for. This helps with multi-way trading loops.
              </Text>
            </Box>

            <FormControl isRequired isInvalid={!!wantsValidationError}>
              <FormLabel fontWeight="semibold">Desired Items</FormLabel>
              <Textarea
                placeholder="e.g., iPhone 12, gaming laptop, DSLR camera, collectible items, electronics..."
                value={formData.wants}
                onChange={(e) => {
                  const newValue = e.target.value
                  setFormData(prev => ({ ...prev, wants: newValue }))
                  // Real-time validation
                  const error = validateDesiredItems(newValue)
                  setWantsValidationError(error)
                }}
                size="lg"
                rows={6}
                bg="white"
                borderWidth="2px"
                borderColor={wantsValidationError ? 'red.500' : 'gray.200'}
                _focus={{ borderColor: wantsValidationError ? 'red.600' : 'brand.500', shadow: 'md' }}
                fontSize="md"
              />
              {wantsValidationError ? (
                <Box mt={2} p={3} bg="red.50" borderRadius="md" borderLeftWidth="4px" borderLeftColor="red.500">
                  <Text fontSize="sm" color="red.700" fontWeight="600">
                    {wantsValidationError}
                  </Text>
                  <Text fontSize="xs" color="red.600" mt={1}>
                    Please remove prohibited items and only list legitimate items you want to trade for.
                  </Text>
                </Box>
              ) : (
                <FormHelperText>
                  <VStack align="start" spacing={1} mt={2}>
                    <Text fontSize="xs" color="gray.600">
                      Be specific about what you're looking for. This enables advanced multi-way trading algorithms.
                    </Text>
                    <Text fontSize="xs" color="green.600" fontWeight="semibold">
                      ✓ Items look good!
                    </Text>
                  </VStack>
                </FormHelperText>
              )}
            </FormControl>

            <FormControl>
              <FormLabel fontWeight="semibold">Desired Categories</FormLabel>
              <Text fontSize="xs" color="gray.500" mb={3}>
                Tap categories you're interested in. This helps match you with relevant trades.
              </Text>
              <Box display="flex" flexWrap="wrap" gap={2}>
                {PRODUCT_CATEGORIES.map((cat) => {
                  const isSelected = wantedCategories.includes(cat.value)
                  return (
                    <Badge
                      key={cat.value}
                      px={3}
                      py={1.5}
                      borderRadius="full"
                      cursor="pointer"
                      fontSize="xs"
                      fontWeight="semibold"
                      bg={isSelected ? 'brand.500' : 'gray.100'}
                      color={isSelected ? 'white' : 'gray.600'}
                      borderWidth="1px"
                      borderColor={isSelected ? 'brand.600' : 'gray.200'}
                      _hover={{ bg: isSelected ? 'brand.600' : 'gray.200' }}
                      transition="all 0.15s"
                      onClick={() => {
                        setWantedCategories(prev =>
                          isSelected
                            ? prev.filter(c => c !== cat.value)
                            : [...prev, cat.value]
                        )
                      }}
                    >
                      {cat.label}
                    </Badge>
                  )
                })}
              </Box>
              {wantedCategories.length > 0 && (
                <Text fontSize="xs" color="green.600" fontWeight="semibold" mt={2}>
                  ✓ {wantedCategories.length} {wantedCategories.length === 1 ? 'category' : 'categories'} selected
                </Text>
              )}
            </FormControl>

            <Box p={4} bg="blue.50" borderRadius="lg" borderLeftWidth="4px" borderLeftColor="blue.400">
              <VStack align="start" spacing={2}>
                <HStack>
                  <Box color="blue.600" fontSize="lg">🔄</Box>
                  <Text fontWeight="semibold" color="blue.800" fontSize="sm">
                    Multi-Way Trading
                  </Text>
                </HStack>
                <Text fontSize="xs" color="blue.700">
                  Your "wants" list and desired categories will be used to find trading loops where multiple users can exchange items in a chain.
                  For example: You want a laptop → Someone has a laptop but wants a camera → Someone has a camera but wants your item.
                </Text>
              </VStack>
            </Box>
          </VStack>
        )

      case 4:
        return (
          <VStack spacing={8} align="stretch">
            <Box>
              <Heading size="sm" mb={2} color="gray.700">
                Exchange Preferences
              </Heading>
              <Text fontSize="sm" color="gray.500">
                Choose how you'd like to exchange your product
              </Text>
            </Box>

            {/* Barter Only - Available to All */}
            <Box
              p={5}
              bg="blue.50"
              borderRadius="lg"
              borderLeft="4px solid"
              borderLeftColor="blue.400"
            >
              <FormControl>
                <HStack justify="space-between" align="start">
                  <VStack align="start" spacing={1} flex={1}>
                    <FormLabel m={0} fontWeight="semibold" color="gray.800">
                      Barter Only
                    </FormLabel>
                    <Text fontSize="sm" color="gray.600">
                      Accept item exchanges and barter.
                    </Text>
                    <Badge colorScheme="blue" variant="subtle" fontSize="xs" mt={2}>
                      Available to All Users
                    </Badge>
                  </VStack>
                  <Switch
                    isChecked={formData.barter_only}
                    onChange={(e) => handleInputChange('barter_only', e.target.checked)}
                    colorScheme="blue"
                  />
                </HStack>
              </FormControl>
            </Box>



            {/* Bidding Type Section */}
            <Box>
              <Heading size="sm" mb={4} color="gray.700">
                Bidding & Offers Type
              </Heading>
              <FormControl>
                <FormLabel fontWeight="semibold" mb={3}>
                  How would you like buyers to interact with this item?
                </FormLabel>
                <VStack spacing={3} align="start">
                  <Box
                    p={3}
                    borderWidth="2px"
                    borderRadius="md"
                    cursor="pointer"
                    borderColor={formData.bidding_type === 'none' ? 'blue.500' : 'gray.200'}
                    bg={formData.bidding_type === 'none' ? 'blue.50' : 'white'}
                    _hover={{ borderColor: 'blue.400' }}
                    onClick={() => handleInputChange('bidding_type', 'none')}
                  >
                    <HStack justify="space-between" w="100%">
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="semibold" color="gray.800">
                          No Bidding
                        </Text>
                        <Text fontSize="sm" color="gray.600">
                          Buyers can only accept/decline your set price or make trade offers
                        </Text>
                      </VStack>
                      <Box>
                        <input
                          type="radio"
                          name="bidding_type"
                          value="none"
                          checked={formData.bidding_type === 'none'}
                          onChange={() => { }}
                        />
                      </Box>
                    </HStack>
                  </Box>

                  <Box
                    p={3}
                    borderWidth="2px"
                    borderRadius="md"
                    cursor="pointer"
                    borderColor={formData.bidding_type === 'blind' ? 'blue.500' : 'gray.200'}
                    bg={formData.bidding_type === 'blind' ? 'blue.50' : 'white'}
                    _hover={{ borderColor: 'blue.400' }}
                    onClick={() => handleInputChange('bidding_type', 'blind')}
                  >
                    <HStack justify="space-between" w="100%">
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="semibold" color="gray.800">
                          Blind Bidding
                        </Text>
                        <Text fontSize="sm" color="gray.600">
                          Buyers submit private offers without seeing others' bids. You choose the best offer
                        </Text>
                      </VStack>
                      <Box>
                        <input
                          type="radio"
                          name="bidding_type"
                          value="blind"
                          checked={formData.bidding_type === 'blind'}
                          onChange={() => { }}
                        />
                      </Box>
                    </HStack>
                  </Box>

                  <Box
                    p={3}
                    borderWidth="2px"
                    borderRadius="md"
                    cursor="pointer"
                    borderColor={formData.bidding_type === 'open' ? 'blue.500' : 'gray.200'}
                    bg={formData.bidding_type === 'open' ? 'blue.50' : 'white'}
                    _hover={{ borderColor: 'blue.400' }}
                    onClick={() => handleInputChange('bidding_type', 'open')}
                  >
                    <HStack justify="space-between" w="100%">
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="semibold" color="gray.800">
                          Open Bidding
                        </Text>
                        <Text fontSize="sm" color="gray.600">
                          Buyers can see all bids and counter-bid. Most competitive option for maximum price discovery
                        </Text>
                      </VStack>
                      <Box>
                        <input
                          type="radio"
                          name="bidding_type"
                          value="open"
                          checked={formData.bidding_type === 'open'}
                          onChange={() => { }}
                        />
                      </Box>
                    </HStack>
                  </Box>
                </VStack>
              </FormControl>
            </Box>

            {/* Premium Features Section */}
            <Box>
              <Heading size="sm" mb={3} color="gray.700">
                Premium Features
              </Heading>

              {!user?.is_premium && (
                <Box
                  p={4}
                  bg="orange.50"
                  borderRadius="lg"
                  borderLeft="4px solid"
                  borderLeftColor="orange.400"
                  mb={4}
                  cursor="pointer"
                  _hover={{ bg: "orange.100", transform: "translateY(-2px)" }}
                  transition="all 0.2s ease"
                  onClick={onOpenPremiumModal}
                >
                  <HStack spacing={2}>
                    <Box fontSize="lg">⭐</Box>
                    <VStack align="start" spacing={0} flex={1}>
                      <Text fontWeight="semibold" color="orange.900" fontSize="sm">
                        Upgrade to Premium
                      </Text>
                      <Text fontSize="xs" color="orange.800">
                        Unlock premium listing and buying features to reach more buyers
                      </Text>
                    </VStack>
                    <Box fontSize="lg" color="orange.600">→</Box>
                  </HStack>
                </Box>
              )}

              {/* Premium Listing */}
              <Box
                p={5}
                bg={user?.is_premium ? "yellow.50" : "gray.50"}
                borderRadius="lg"
                borderLeft="4px solid"
                borderLeftColor={user?.is_premium ? "yellow.400" : "gray.300"}
                opacity={user?.is_premium ? 1 : 0.6}
                mb={3}
              >
                <FormControl isDisabled={!user?.is_premium}>
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={1} flex={1}>
                      <HStack spacing={2}>
                        <FormLabel m={0} fontWeight="semibold" color="gray.800">
                          Premium Listing
                        </FormLabel>
                        <Badge colorScheme="yellow" variant="solid" fontSize="xs">
                          ⭐ Premium
                        </Badge>
                      </HStack>
                      <Text fontSize="sm" color={user?.is_premium ? "gray.600" : "gray.500"}>
                        {user?.is_premium
                          ? 'Feature your product at the top of search results for maximum visibility'
                          : 'Feature your product at the top of search results'
                        }
                      </Text>
                      {user?.is_premium && (
                        <Badge colorScheme="purple" variant="subtle" fontSize="xs" mt={2}>
                          Up to 20 premium listings
                        </Badge>
                      )}
                    </VStack>
                    <Switch
                      isChecked={formData.premium}
                      onChange={(e) => handleInputChange('premium', e.target.checked)}
                      colorScheme="yellow"
                      isDisabled={!user?.is_premium}
                    />
                  </HStack>
                </FormControl>
              </Box>

              {/* Allow Buying */}
              <Box
                p={5}
                bg={user?.is_premium ? "green.50" : "gray.50"}
                borderRadius="lg"
                borderLeft="4px solid"
                borderLeftColor={user?.is_premium ? "green.400" : "gray.300"}
                opacity={user?.is_premium ? 1 : 0.6}
              >
                <FormControl isDisabled={!user?.is_premium}>
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={1} flex={1}>
                      <HStack spacing={2}>
                        <FormLabel m={0} fontWeight="semibold" color="gray.800">
                          Allow Buying
                        </FormLabel>
                        <Badge colorScheme="green" variant="solid" fontSize="xs">
                          💰 Premium
                        </Badge>
                      </HStack>
                      <Text fontSize="sm" color={user?.is_premium ? "gray.600" : "gray.500"}>
                        {user?.is_premium
                          ? 'Accept cash only offers'
                          : 'Accept cash only offers'
                        }
                      </Text>
                      {user?.is_premium && (
                        <Badge colorScheme="purple" variant="subtle" fontSize="xs" mt={2}>
                          Accept both barter & cash transactions
                        </Badge>
                      )}
                    </VStack>
                    <Switch
                      isChecked={formData.allow_buying}
                      onChange={(e) => {
                        handleInputChange('allow_buying', e.target.checked)
                        if (!e.target.checked) {
                          handleInputChange('price', undefined)
                        }
                      }}
                      colorScheme="green"
                      isDisabled={!user?.is_premium}
                    />
                  </HStack>
                </FormControl>
              </Box>
            </Box>
          </VStack>
        )

      case 6:
        return (
          <VStack spacing={6} align="stretch">
            {formData.allow_buying ? (
              <FormControl isRequired>
                <FormLabel>Price (PHP)</FormLabel>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formData.price || ''}
                  onChange={(e) => handleInputChange('price', e.target.value ? Number(e.target.value) : 0)}
                  size="lg"
                  min="0"
                  step="0.01"
                />
                <FormHelperText>Set a fair price for your product</FormHelperText>
              </FormControl>
            ) : (
              <Center py={8}>
                <VStack spacing={4}>
                  <Badge colorScheme="green" variant="solid" size="lg">
                    Barter Only
                  </Badge>
                  <Text color="gray.600">
                    This product will only accept item exchanges. Price set to ₱0.00
                  </Text>
                </VStack>
              </Center>
            )}
          </VStack>
        )

      case 5:
        return (
          <VStack spacing={6} align="stretch">
            <Text fontSize="lg" color="gray.600">
              Review your product details before posting
            </Text>

            <Box bg="gray.50" p={6} borderRadius="lg">
              <VStack spacing={4} align="stretch">
                <HStack justify="space-between">
                  <Text fontWeight="semibold">Title:</Text>
                  <Text>{formData.title}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="semibold">Images:</Text>
                  <Text>{uploadedImages.length} photo(s)</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="semibold">Video:</Text>
                  <Text>{uploadedVideo ? '1 video attached' : 'None'}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="semibold">Premium:</Text>
                  <Badge colorScheme={formData.premium ? 'yellow' : 'gray'}>
                    {formData.premium ? 'Yes' : 'No'}
                  </Badge>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="semibold">Buying:</Text>
                  <Badge colorScheme={formData.allow_buying ? 'blue' : 'green'}>
                    {formData.allow_buying ? 'Allowed' : 'Barter Only'}
                  </Badge>
                </HStack>
                {formData.allow_buying && formData.price && (
                  <HStack justify="space-between">
                    <Text fontWeight="semibold">Price:</Text>
                    <Text color="brand.500" fontWeight="bold">
                      ₱{formData.price.toFixed(2)}
                    </Text>
                  </HStack>
                )}
              </VStack>
            </Box>
          </VStack>
        )

      default:
        return null
    }
  }

  return (
    // outer Box sets the viewport background color requested
    <Box minH="100vh" bg={pageBg} py={8}>
      <Box p={8} maxW="4xl" mx="auto">
        <VStack spacing={8} align="stretch">
          {/* Header */}
          <Box textAlign="center">
            <Heading size="xl" color="brand.500" mb={2}>
              Add New Products
            </Heading>
            <Text color="gray.600">
              Step {currentStep} of {steps.length}: {steps[currentStep - 1].title}
            </Text>
          </Box>

          {/* Progress Bar */}
          <Box>
            <Progress
              value={(currentStep / steps.length) * 100}
              colorScheme="brand"
              size="lg"
              borderRadius="full"
            />
          </Box>

          {/* Step Content */}
          <Box bg={bgColor} p={8} borderRadius="lg" shadow="sm" border="1px" borderColor={borderColor}>
            {renderStepContent()}
          </Box>

          {/* Navigation */}
          <HStack justify="space-between" pb={{ base: 20, sm: 0 }}>
            <Button
              leftIcon={<ArrowBackIcon />}
              onClick={prevStep}
              isDisabled={currentStep === 1}
              variant="outline"
            >
              Previous
            </Button>

            {currentStep < steps.length ? (
              <Button
                rightIcon={<ArrowForwardIcon />}
                onClick={nextStep}
                isDisabled={!canProceed()}
                colorScheme="brand"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                isLoading={isSubmitting}
                loadingText="Posting..."
                colorScheme="brand"
                size="lg"
                px={8}
              >
                Post Product
              </Button>
            )}
          </HStack>
        </VStack>
      </Box>

      {/* Premium Upgrade Modal */}
      <Modal isOpen={isPremiumModalOpen} onClose={onClosePremiumModal} isCentered size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack spacing={2}>
              <Box fontSize="2xl">✨</Box>
              <Box>
                <Heading size="md">Upgrade to Premium</Heading>
              </Box>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={4} align="stretch">
              <Box>
                <Text color="gray.700" fontSize="sm">
                  Unlock powerful AI tools and premium features to maximize your trading potential.
                </Text>
              </Box>

              {/* Pricing Box */}
              <Box
                p={4}
                bg="gradient.500"
                borderRadius="lg"
                textAlign="center"
                bgGradient="linear(to-br, purple.400, pink.400)"
              >
                <VStack spacing={1}>
                  <Text fontSize="sm" color="white" fontWeight="semibold">
                    Annual Membership
                  </Text>
                  <HStack justify="center" spacing={1}>
                    <Text fontSize="3xl" fontWeight="bold" color="white">
                      ₱299
                    </Text>
                    <Text fontSize="sm" color="whiteAlpha.900">
                      /year
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color="whiteAlpha.800">
                    That's just ₱25/month!
                  </Text>
                </VStack>
              </Box>

              {/* Features List */}
              <Box
                p={4}
                bg="purple.50"
                borderRadius="lg"
              >
                <VStack align="start" spacing={3}>
                  <Text fontWeight="bold" color="purple.900" fontSize="sm">
                    Premium Features Included:
                  </Text>

                  <HStack spacing={2} align="start">
                    <Box color="purple.600" fontWeight="bold">✓</Box>
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="semibold" color="gray.800">AI-Powered Title Generation</Text>
                      <Text fontSize="xs" color="gray.600">Auto-generate perfect titles from descriptions</Text>
                    </VStack>
                  </HStack>

                  <HStack spacing={2} align="start">
                    <Box color="purple.600" fontWeight="bold">✓</Box>
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="semibold" color="gray.800">Featured Listings</Text>
                      <Text fontSize="xs" color="gray.600">Up to 20 products featured at top of search</Text>
                    </VStack>
                  </HStack>

                  <HStack spacing={2} align="start">
                    <Box color="purple.600" fontWeight="bold">✓</Box>
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="semibold" color="gray.800">Accept Cash Offers</Text>
                      <Text fontSize="xs" color="gray.600">Enable buying functionality on your products</Text>
                    </VStack>
                  </HStack>

                  <HStack spacing={2} align="start">
                    <Box color="purple.600" fontWeight="bold">✓</Box>
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="semibold" color="gray.800">Priority Support</Text>
                      <Text fontSize="xs" color="gray.600">Get help faster with dedicated support</Text>
                    </VStack>
                  </HStack>

                  <HStack spacing={2} align="start">
                    <Box color="purple.600" fontWeight="bold">✓</Box>
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="semibold" color="gray.800">Analytics Dashboard</Text>
                      <Text fontSize="xs" color="gray.600">Track views, offers, and performance metrics</Text>
                    </VStack>
                  </HStack>

                  <HStack spacing={2} align="start">
                    <Box color="purple.600" fontWeight="bold">✓</Box>
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="semibold" color="gray.800">Bulk Product Upload</Text>
                      <Text fontSize="xs" color="gray.600">List multiple products at once</Text>
                    </VStack>
                  </HStack>

                  <HStack spacing={2} align="start">
                    <Box color="purple.600" fontWeight="bold">✓</Box>
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="semibold" color="gray.800">Badge & Verification</Text>
                      <Text fontSize="xs" color="gray.600">Stand out with a premium member badge</Text>
                    </VStack>
                  </HStack>
                </VStack>
              </Box>

              {/* CTA Buttons */}
              <VStack spacing={2}>
                <Button
                  colorScheme="purple"
                  size="lg"
                  w="full"
                  fontWeight="bold"
                  onClick={() => {
                    onClosePremiumModal()
                    navigate('/premium')
                  }}
                >
                  Upgrade Now
                </Button>
                <Button
                  variant="outline"
                  w="full"
                  onClick={onClosePremiumModal}
                >
                  Maybe Later
                </Button>
              </VStack>

              <Text fontSize="xs" color="gray.500" textAlign="center">
                Secure payment • Auto-renewable • Cancel anytime
              </Text>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Location Map Modal */}
      <Modal isOpen={isLocationModalOpen} onClose={onCloseLocationModal} isCentered size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack spacing={2}>
              <Box fontSize="2xl">📍</Box>
              <Box>
                <Heading size="md">Product Location</Heading>
              </Box>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={4} align="stretch">
              <Box>
                <Text fontSize="sm" color="gray.600" mb={2}>
                  Your product location has been set. Buyers will see this location when viewing your product.
                </Text>
              </Box>

              {/* Map Preview */}
              {locationCoordinates && (
                <Box
                  w="full"
                  h="300px"
                  borderRadius="lg"
                  overflow="hidden"
                  border="1px"
                  borderColor="gray.200"
                >
                  <iframe
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${locationCoordinates.lng - 0.01},${locationCoordinates.lat - 0.01},${locationCoordinates.lng + 0.01},${locationCoordinates.lat + 0.01}&layer=mapnik&marker=${locationCoordinates.lat},${locationCoordinates.lng}`}
                    style={{ borderRadius: '8px' }}
                  />
                </Box>
              )}

              {/* Location Details */}
              <Box p={4} bg="blue.50" borderRadius="lg" borderLeft="3px solid" borderLeftColor="blue.400">
                <VStack align="start" spacing={2}>
                  <Text fontWeight="semibold" color="blue.900" fontSize="sm">
                    Location Details
                  </Text>
                  <Text fontSize="sm" color="gray.700">
                    <strong>Address:</strong> {formData.location}
                  </Text>
                  <Text fontSize="xs" color="gray.600">
                    ✓ Location confirmed via GPS
                  </Text>
                </VStack>
              </Box>

              {/* CTA Buttons */}
              <VStack spacing={2}>
                <Button
                  colorScheme="brand"
                  w="full"
                  onClick={onCloseLocationModal}
                >
                  Confirm Location
                </Button>
                <Button
                  variant="outline"
                  w="full"
                  onClick={() => {
                    setLocationCoordinates(null)
                    setLocationError(null)
                    onCloseLocationModal()
                  }}
                >
                  Select Different Location
                </Button>
              </VStack>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      <FloatingTab showAddButton={false} />
    </Box>
  )
}

export default AddProduct
