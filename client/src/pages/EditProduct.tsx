import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Box,
  Container,
  VStack,
  HStack,
  Heading,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Button,
  Text,
  Alert,
  AlertIcon,
  Spinner,
  useToast,
  Select,
  Image as ChakraImage,
  Grid,
  FormHelperText,
} from '@chakra-ui/react'
import { ProductUpdate } from '../types'
import { api } from '../services/api'
import { PRODUCT_CATEGORIES } from '../utils/categories'

const EditProduct: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<ProductUpdate>({})
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [originalProduct, setOriginalProduct] = useState<any>(null)
  const [imagePreviews, setImagePreviews] = useState<string[]>([])

  const navigate = useNavigate()
  const toast = useToast()
  const pageBg = '#FFFDF1'

  useEffect(() => {
    if (id) {
      fetchProduct()
    }
  }, [id])

  const fetchProduct = async () => {
    try {
      setFetching(true)
      setError('')
      const response = await api.get(`/api/products/${id}`)
      const resData = response.data

      // Handle different API response structures
      let product: any = null
      if (resData?.data?.product) {
        product = resData.data.product
      } else if (resData?.data?.id) {
        product = resData.data
      } else if (resData?.id) {
        product = resData
      }

      if (!product) {
        setError('Product not found')
        return
      }

      setOriginalProduct(product)

      // Pre-fill form with current values
      setFormData({
        title: product.title || '',
        description: product.description || '',
        price: product.price ?? 0,
        image_urls: product.image_urls || [],
        condition: product.condition || '',
        category: product.category || '',
        location: product.location || '',
        max_items_per_offer: product.max_items_per_offer ?? 0,
      })

      // Load persisted previews for this product
      try {
        const key = `edit_images_${product.id}`
        const raw = localStorage.getItem(key)
        const persisted = raw ? (JSON.parse(raw) as string[]).filter(Boolean) : []

        const serverImages = (product.image_urls || []).filter((u: any) => typeof u === 'string' && !u.startsWith('data:'))

        const combined = [...serverImages, ...persisted.filter((p: string) => !serverImages.includes(p))]
        setImagePreviews(combined)
      } catch (e) {
        const serverImages = (product.image_urls || []).filter((u: any) => typeof u === 'string')
        setImagePreviews(serverImages)
      }
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to fetch product')
    } finally {
      setFetching(false)
    }
  }

  const handleAddImageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const maxFiles = 10
    const incoming: File[] = []
    for (let i = 0; i < files.length && incoming.length < maxFiles; i++) {
      const f = files[i]
      if (!f.type || !f.type.startsWith('image/')) continue
      incoming.push(f)
    }
    if (incoming.length === 0) return

    ;(async () => {
      const readResults: string[] = []
      for (const f of incoming) {
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader()
            fr.onload = () => resolve(fr.result as string)
            fr.onerror = () => reject(new Error('Failed to read file'))
            try {
              fr.readAsDataURL(f)
            } catch (err) {
              reject(err)
            }
          })
          if (dataUrl) readResults.push(dataUrl)
        } catch (err) {
          console.warn('Skipping a file due to read error', err)
        }
      }

      if (readResults.length === 0) {
        toast({
          id: 'editproduct-no-images-added',
          title: 'No images added',
          description: 'Could not read any of the selected files. Try selecting fewer or smaller images.',
          status: 'warning',
          duration: 4000,
          isClosable: true,
        })
        try {
          const el = document.getElementById('edit-image-input') as HTMLInputElement | null
          if (el) el.value = ''
        } catch {}
        return
      }

      const combined = [...imagePreviews, ...readResults]
      const capped = combined.slice(-20)
      setImagePreviews(capped)

      try {
        const pid = originalProduct?.id || (id ? parseInt(id) : 'unknown')
        const key = `edit_images_${pid}`
        const onlyData = capped.filter((u) => typeof u === 'string' && u.startsWith('data:'))
        localStorage.setItem(key, JSON.stringify(onlyData))
      } catch (e) {
        console.warn('Failed to persist image previews', e)
      }

      setFormData((prev) => ({ ...prev, image_urls: capped }))

      try {
        const el = document.getElementById('edit-image-input') as HTMLInputElement | null
        if (el) el.value = ''
      } catch {}
    })()
  }

  const removeImageAt = (index: number) => {
    const next = imagePreviews.filter((_, i) => i !== index)
    setImagePreviews(next)
    try {
      const key = `edit_images_${originalProduct.id}`
      const onlyData = next.filter((u) => typeof u === 'string' && u.startsWith('data:'))
      localStorage.setItem(key, JSON.stringify(onlyData))
    } catch {}
    setFormData((prev) => ({ ...prev, image_urls: next }))
  }

  const handleInputChange = (field: keyof ProductUpdate, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title?.trim()) {
      setError('Please enter a product title')
      return
    }

    if (!formData.description?.trim()) {
      setError('Please enter a product description')
      return
    }

    try {
      setLoading(true)
      setError('')

      // Backend expects multipart form data, not JSON
      const form = new FormData()
      if (formData.title) form.append('title', formData.title)
      if (formData.description) form.append('description', formData.description)
      if (formData.price !== undefined && formData.price !== null) form.append('price', String(formData.price))
      if (formData.condition) form.append('condition', formData.condition)
      if (formData.category) form.append('category', formData.category)
      if (formData.location) form.append('location', formData.location)
      if (formData.max_items_per_offer !== undefined) form.append('max_items_per_offer', String(formData.max_items_per_offer))

      // Add image files from previews that are data URLs (newly uploaded)
      // For existing server URLs, we keep them via image_urls field
      const serverImages = imagePreviews.filter((u) => !u.startsWith('data:'))
      const dataImages = imagePreviews.filter((u) => u.startsWith('data:'))

      // Convert data URLs to File objects and append
      for (const dataUrl of dataImages) {
        try {
          const res = await fetch(dataUrl)
          const blob = await res.blob()
          const file = new File([blob], `image_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
          form.append('images', file)
        } catch (err) {
          console.warn('Failed to convert data URL to file', err)
        }
      }

      // If there are existing server images, append them as image_urls
      if (serverImages.length > 0) {
        form.append('image_urls', JSON.stringify(serverImages))
      }

      await api.put(`/api/products/${id}`, form)
      
      // Invalidate dashboard products cache to ensure consistency
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'products'] })

      toast({
        id: 'editproduct-product-updated',
        title: 'Product updated!',
        description: 'Your product has been successfully updated',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })

      // Clear persisted local previews
      try {
        localStorage.removeItem(`edit_images_${originalProduct.id}`)
      } catch {}

      navigate('/dashboard')
    } catch (error: any) {
      setError(error.response?.data?.error || error.message || 'Failed to update product')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <Box minH="100vh" bg={pageBg} display="flex" alignItems="center" justifyContent="center">
        <Spinner size="xl" color="brand.500" />
      </Box>
    )
  }

  if (error && !originalProduct) {
    return (
      <Box minH="100vh" bg={pageBg} py={8}>
        <Container maxW="container.md">
          <Alert status="error">
            <AlertIcon />
            {error}
          </Alert>
        </Container>
      </Box>
    )
  }

  if (!originalProduct) {
    return (
      <Box minH="100vh" bg={pageBg} py={8}>
        <Container maxW="container.md">
          <Alert status="error">
            <AlertIcon />
            Product not found
          </Alert>
        </Container>
      </Box>
    )
  }

  return (
    <Box minH="100vh" bg={pageBg} py={{ base: 4, md: 8 }}>
      <Container maxW="container.md" px={{ base: 3, md: 6 }}>
        <VStack spacing={{ base: 4, md: 8 }}>
          <Box textAlign="center">
            <Heading size={{ base: 'lg', md: 'xl' }} color="brand.500" mb={1}>
              Edit Product
            </Heading>
            <Text color="gray.600" fontSize={{ base: 'sm', md: 'md' }}>
              Update your product listing
            </Text>
          </Box>

          <Box bg="white" p={{ base: 4, md: 8 }} rounded="lg" shadow="sm" w="full">
            <form onSubmit={handleSubmit}>
              <VStack spacing={{ base: 4, md: 6 }}>
                {error && (
                  <Alert status="error" fontSize="sm" rounded="md">
                    <AlertIcon />
                    {error}
                  </Alert>
                )}

                {/* Title */}
                <FormControl isRequired>
                  <FormLabel fontWeight="600" fontSize={{ base: 'sm', md: 'md' }}>Product Title</FormLabel>
                  <Input
                    value={formData.title || ''}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Enter product title"
                    maxLength={60}
                    size={{ base: 'md', md: 'lg' }}
                  />
                  <FormHelperText fontSize="xs" color={(formData.title?.length || 0) > 50 ? 'orange.500' : 'gray.500'}>
                    {formData.title?.length || 0}/60 characters
                  </FormHelperText>
                </FormControl>

                {/* Description */}
                <FormControl isRequired>
                  <FormLabel fontWeight="600" fontSize={{ base: 'sm', md: 'md' }}>Description</FormLabel>
                  <Textarea
                    value={formData.description || ''}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Describe your product in detail"
                    maxLength={500}
                    size={{ base: 'md', md: 'lg' }}
                    rows={4}
                  />
                  <FormHelperText fontSize="xs" color={(formData.description?.length || 0) > 450 ? 'orange.500' : 'gray.500'}>
                    {formData.description?.length || 0}/500 characters
                  </FormHelperText>
                </FormControl>

                {/* Price */}
                <FormControl>
                  <FormLabel fontWeight="600" fontSize={{ base: 'sm', md: 'md' }}>Price (₱)</FormLabel>
                  <Input
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => handleInputChange('price', parseFloat(e.target.value) || 0)}
                    placeholder="Enter price"
                    size={{ base: 'md', md: 'lg' }}
                    min={0}
                  />
                </FormControl>

                {/* Category & Condition */}
                <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={{ base: 3, md: 4 }} w="full">
                  <FormControl>
                    <FormLabel fontWeight="600" fontSize={{ base: 'sm', md: 'md' }}>Category</FormLabel>
                    <Select
                      value={formData.category || ''}
                      onChange={(e) => handleInputChange('category', e.target.value)}
                      placeholder="Select category"
                      size={{ base: 'md', md: 'lg' }}
                    >
                      {PRODUCT_CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl>
                    <FormLabel fontWeight="600" fontSize={{ base: 'sm', md: 'md' }}>Condition</FormLabel>
                    <Select
                      value={formData.condition || ''}
                      onChange={(e) => handleInputChange('condition', e.target.value)}
                      placeholder="Select condition"
                      size={{ base: 'md', md: 'lg' }}
                    >
                      <option value="New">New</option>
                      <option value="Like-New">Like-New</option>
                      <option value="Used">Used</option>
                      <option value="Fair">Fair</option>
                    </Select>
                  </FormControl>
                </Grid>

                {/* Location */}
                <FormControl>
                  <FormLabel fontWeight="600" fontSize={{ base: 'sm', md: 'md' }}>Location</FormLabel>
                  <Input
                    value={formData.location || ''}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    placeholder="e.g., Cebu City, Philippines"
                    size={{ base: 'md', md: 'lg' }}
                  />
                </FormControl>

                {/* Offer Item Limit */}
                <FormControl>
                  <FormLabel fontWeight="600" fontSize={{ base: 'sm', md: 'md' }}>Offer Item Limit</FormLabel>
                  <Select
                    value={formData.max_items_per_offer ?? 0}
                    onChange={(e) => handleInputChange('max_items_per_offer', parseInt(e.target.value) || 0)}
                    size={{ base: 'md', md: 'lg' }}
                  >
                    <option value={0}>Unlimited Items</option>
                    <option value={1}>1 Item Only</option>
                    <option value={2}>Up to 2 Items</option>
                    <option value={3}>Up to 3 Items</option>
                    <option value={5}>Up to 5 Items</option>
                    <option value={10}>Up to 10 Items</option>
                  </Select>
                  <FormHelperText fontSize="xs" color="gray.500">
                    Maximum items a buyer can offer for this product.
                  </FormHelperText>
                </FormControl>

                {/* Upload Images */}
                <FormControl>
                  <FormLabel fontWeight="600" fontSize={{ base: 'sm', md: 'md' }}>Images</FormLabel>
                  <input
                    id="edit-image-input"
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => handleAddImageFiles(e.target.files)}
                  />
                  <Button
                    size={{ base: 'sm', md: 'md' }}
                    onClick={() => document.getElementById('edit-image-input')?.click()}
                  >
                    Add image
                  </Button>
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    You can add multiple images.
                  </Text>

                  {imagePreviews.length > 0 && (
                    <VStack align="stretch" spacing={2} mt={3}>
                      {imagePreviews.map((url, idx) => (
                        <HStack key={idx} spacing={2} align="center">
                          <ChakraImage
                            src={url}
                            alt={`Preview ${idx + 1}`}
                            boxSize={{ base: '56px', md: '80px' }}
                            minW={{ base: '56px', md: '80px' }}
                            objectFit="cover"
                            borderRadius="6px"
                          />
                          <Text fontSize="xs" color="gray.600" noOfLines={1} flex={1} minW={0}>
                            {url.startsWith('data:') ? 'New image' : 'Uploaded image'}
                          </Text>
                          <Button
                            size="xs"
                            colorScheme="red"
                            variant="ghost"
                            flexShrink={0}
                            onClick={() => removeImageAt(idx)}
                          >
                            Remove
                          </Button>
                        </HStack>
                      ))}
                    </VStack>
                  )}
                </FormControl>

                <Button
                  type="submit"
                  colorScheme="brand"
                  size={{ base: 'md', md: 'lg' }}
                  w="full"
                  isLoading={loading}
                  loadingText="Updating..."
                >
                  Update Product
                </Button>
              </VStack>
            </form>
          </Box>
        </VStack>
      </Container>
    </Box>
  )
}

export default EditProduct
