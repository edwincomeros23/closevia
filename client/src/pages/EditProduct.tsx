import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Switch,
  FormHelperText,
  Spinner,
  Center,
  useToast,
  Select,
} from '@chakra-ui/react'
import { useProducts } from '../contexts/ProductContext'
import { ProductUpdate } from '../types'
import { api } from '../services/api'

const EditProduct: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { updateProduct } = useProducts()
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
      const product = response.data.data
      setOriginalProduct(product)
      
  // Pre-fill form with current values
      setFormData({
        title: product.title,
        description: product.description,
        price: product.price,
        image_urls: product.image_urls || [],
        premium: product.premium,
        status: product.status,
        condition: product.condition,
        allow_buying: product.allow_buying,
        barter_only: product.barter_only,
        location: product.location,
      })

      // Load persisted previews for this product
      try {
        const key = `edit_images_${product.id}`
        const raw = localStorage.getItem(key)
        const persisted = raw ? (JSON.parse(raw) as string[]).filter(Boolean) : []

        // product.image_urls may contain server URLs and (rarely) data URLs — prefer server URLs and avoid duplicates
        const serverImages = (product.image_urls || []).filter((u: any) => typeof u === 'string' && !u.startsWith('data:'))

        // Merge preserving order: server images first, then persisted local previews that aren't already present
        const combined = [...serverImages, ...persisted.filter(p => !serverImages.includes(p))]
        setImagePreviews(combined)
      } catch (e) {
        // Fallback: show whatever the server returned (ensure strings)
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

    // Read files sequentially to avoid FileReader concurrency issues and handle per-file errors
    (async () => {
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
          title: 'No images added',
          description: 'Could not read any of the selected files. Try selecting fewer or smaller images.',
          status: 'warning',
          duration: 4000,
          isClosable: true,
        })
        // reset input
        try {
          const el = document.getElementById('edit-image-input') as HTMLInputElement | null
          if (el) el.value = ''
        } catch {}
        return
      }

      // Merge with existing previews but cap total to 20 to avoid huge localStorage
      const combined = [...imagePreviews, ...readResults]
      const capped = combined.slice(-20)
      setImagePreviews(capped)

      try {
        const pid = originalProduct?.id || (id ? parseInt(id) : 'unknown')
        const key = `edit_images_${pid}`
        const onlyData = capped.filter(u => typeof u === 'string' && u.startsWith('data:'))
        localStorage.setItem(key, JSON.stringify(onlyData))
      } catch (e) {
        console.warn('Failed to persist image previews', e)
      }

      setFormData(prev => ({ ...prev, image_urls: capped }))

      // reset the file input so same file can be selected again if needed
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
      const onlyData = next.filter(u => typeof u === 'string' && u.startsWith('data:'))
      localStorage.setItem(key, JSON.stringify(onlyData))
    } catch {}
    setFormData(prev => ({ ...prev, image_urls: next }))
  }

  const handleInputChange = (field: keyof ProductUpdate, value: any) => {
    // Special handling for image_urls: accept a string and convert to array
    if (field === 'image_urls') {
      setFormData(prev => ({ ...prev, image_urls: value ? [value] : [] }))
    } else {
      setFormData(prev => ({ ...prev, [field]: value }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title && !formData.description && !formData.price && 
  (!formData.image_urls || formData.image_urls.length === 0) && formData.premium === undefined && 
  formData.status === undefined) {
      setError('Please make at least one change to update the product')
      return
    }

    if (formData.price !== undefined && formData.price <= 0) {
      setError('Price must be greater than 0')
      return
    }

    try {
      setLoading(true)
      setError('')
      await updateProduct(parseInt(id!), formData)
      
      toast({
        title: 'Product updated!',
        description: 'Your product has been successfully updated',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
      
      navigate('/dashboard')
    } catch (error: any) {
      setError(error.message || 'Failed to update product')
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
    <Box minH="100vh" bg={pageBg} py={8}>
      <Container maxW="container.md">
        <VStack spacing={8}>
          <Box textAlign="center">
            <Heading size="xl" color="brand.500" mb={2}>
              Edit Product
            </Heading>
            <Text color="gray.600">
              Update your product listing
            </Text>
          </Box>

          <Box bg="white" p={8} rounded="lg" shadow="sm" w="full">
            <form onSubmit={handleSubmit}>
              <VStack spacing={6}>
                {error && (
                  <Alert status="error">
                    <AlertIcon />
                    {error}
                  </Alert>
                )}

                <FormControl>
                  <FormLabel>Product Title</FormLabel>
                  <Input
                    value={formData.title || originalProduct.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Enter product title"
                    size="lg"
                  />
                  <FormHelperText>
                    Leave empty to keep current title
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Description</FormLabel>
                  <Textarea
                    value={formData.description || originalProduct.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Describe your product in detail"
                    size="lg"
                    rows={4}
                  />
                  <FormHelperText>
                    Leave empty to keep current description
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Price (PHP)</FormLabel>
                  <NumberInput
                    value={formData.price !== undefined ? formData.price : originalProduct.price}
                    onChange={(value) => handleInputChange('price', parseFloat(value) || 0)}
                    min={0}
                    precision={2}
                    size="lg"
                  >
                    <NumberInputField placeholder="0.00" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <FormHelperText>
                    Leave empty to keep current price
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Condition</FormLabel>
                  <Select
                    value={formData.condition || ''}
                    onChange={(e) => handleInputChange('condition', e.target.value)}
                    placeholder="Select condition"
                    size="lg"
                  >
                    <option value="New">New</option>
                    <option value="Like-New">Like-New</option>
                    <option value="Used">Used</option>
                    <option value="Fair">Fair</option>
                  </Select>
                  <FormHelperText>
                    Leave empty to keep current condition
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Image URL</FormLabel>
                  <Input
                    value={formData.image_urls && formData.image_urls.length > 0 ? formData.image_urls[0] : (originalProduct.image_urls && originalProduct.image_urls[0])}
                    onChange={(e) => handleInputChange('image_urls', e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    size="lg"
                  />
                  <FormHelperText>
                    Leave empty to keep current image
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Upload Images</FormLabel>
                  <input
                    id="edit-image-input"
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => handleAddImageFiles(e.target.files)}
                  />
                  <Button onClick={() => document.getElementById('edit-image-input')?.click()}>Add image</Button>
                  <Text fontSize="sm" color="gray.500">You can add multiple images. Previews are stored locally until you save.</Text>

                  {imagePreviews.length > 0 && (
                    <VStack align="stretch" spacing={2} mt={3}>
                      {imagePreviews.map((url, idx) => (
                        <HStack key={idx} spacing={3} align="center">
                          <img src={url} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }} />
                          <Text fontSize="sm" color="gray.600" noOfLines={1}>{url.startsWith('data:') ? 'Local preview' : url}</Text>
                          <Button size="sm" onClick={() => removeImageAt(idx)}>Remove</Button>
                        </HStack>
                      ))}
                    </VStack>
                  )}
                </FormControl>

                <FormControl display="flex" alignItems="center">
                  <FormLabel htmlFor="premium" mb="0">
                    Premium Listing
                  </FormLabel>
                  <Switch
                    id="premium"
                    isChecked={formData.premium !== undefined ? formData.premium : originalProduct.premium}
                    onChange={(e) => handleInputChange('premium', e.target.checked)}
                    colorScheme="yellow"
                  />
                  <FormHelperText ml={3}>
                    Premium listings get featured placement
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Status</FormLabel>
                  <Select
                    value={formData.status || originalProduct.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    placeholder="Select status"
                    size="lg"
                  >
                    <option value="available">Available</option>
                    <option value="bartered">Bartered</option>
                  </Select>
                  <FormHelperText>
                    Select the current status of your product
                  </FormHelperText>
                </FormControl>

                <Button
                  type="submit"
                  colorScheme="brand"
                  size="lg"
                  w="full"
                  isLoading={loading}
                  loadingText="Updating product..."
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
