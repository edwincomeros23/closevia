import React, { useState } from 'react'
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack,
  Button,
  FormControl,
  FormLabel,
  Textarea,
  Select,
  useToast,
  Spinner,
  HStack,
  Text,
  Box,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useColorModeValue,
} from '@chakra-ui/react'
import { api } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'

interface DisputeReportModalProps {
  isOpen: boolean
  onClose: () => void
  tradeId: number | null
  otherPartyName?: string
}

type DisputeCategory = 'item_not_as_described' | 'no_show' | 'rider_damage' | 'safety' | 'harassment'

const DisputeReportModal: React.FC<DisputeReportModalProps> = ({
  isOpen,
  onClose,
  tradeId,
  otherPartyName = 'the other party',
}) => {
  const toast = useToast()
  const { showNotification } = useNotification()

  const [category, setCategory] = useState<DisputeCategory>('item_not_as_described')
  const [description, setDescription] = useState('')
  const [evidenceImageUrl, setEvidenceImageUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string>('')

  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const mutedText = useColorModeValue('gray.600', 'gray.400')

  const categoryDescriptions: Record<DisputeCategory, string> = {
    item_not_as_described: 'Item differs from listing (condition, completeness, specs, or function)',
    no_show: 'The other party did not show up for the agreed meetup',
    rider_damage: 'Item was damaged during delivery',
    safety: 'Safety or harassment concerns',
    harassment: 'Harassment or abusive behavior',
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmitDispute = async () => {
    // Validation
    if (!tradeId) {
      toast({ title: 'Error', description: 'Trade ID is missing', status: 'error' })
      return
    }

    if (!category) {
      toast({ title: 'Error', description: 'Please select a dispute category', status: 'error' })
      return
    }

    if (description.trim().length < 20) {
      toast({
        title: 'Error',
        description: 'Description must be at least 20 characters',
        status: 'error',
      })
      return
    }

    if (!photoFile && !evidenceImageUrl) {
      toast({
        title: 'Error',
        description: 'Please upload at least one photo as evidence',
        status: 'error',
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Upload photo if selected
      let uploadedPhotoUrl = evidenceImageUrl
      if (photoFile) {
        const formData = new FormData()
        formData.append('image', photoFile)

        const uploadRes = await api.post('/api/upload', formData)

        uploadedPhotoUrl = uploadRes.data?.url || uploadRes.data?.data?.url || ''
        if (!uploadedPhotoUrl) {
          throw new Error('Photo upload failed')
        }
      }

      // File dispute
      const response = await api.post('/api/disputes', {
        trade_id: tradeId,
        category,
        description,
        evidence_image_url: uploadedPhotoUrl,
      })

      if (response.data?.success) {
        showNotification('Dispute filed successfully', 'success')
        toast({
          title: 'Dispute Filed',
          description: `Your dispute has been filed. ${otherPartyName} has 48 hours to respond.`,
          status: 'success',
          duration: 5000,
        })

        // Reset form
        setCategory('item_not_as_described')
        setDescription('')
        setEvidenceImageUrl('')
        setPhotoFile(null)
        setPhotoPreview('')

        onClose()
      } else {
        throw new Error(response.data?.error || 'Failed to file dispute')
      }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to file dispute'
      toast({
        title: 'Error',
        description: errorMessage,
        status: 'error',
        duration: 5000,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg" isCentered>
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg={bgColor}>
        <ModalHeader fontSize="lg" fontWeight="bold">
          Report a Dispute
        </ModalHeader>
        <ModalCloseButton isDisabled={isSubmitting} />

        <ModalBody pb={6}>
          <VStack spacing={6} align="stretch">
            {/* Warning Alert */}
            <Alert status="warning" borderRadius="md">
              <AlertIcon />
              <VStack align="flex-start" spacing={0}>
                <AlertTitle>Important</AlertTitle>
                <AlertDescription>
                  Filing a dispute will freeze this trade and pause the 7-day archive timer. {otherPartyName} will
                  have 48 hours to respond. Both parties will be notified.
                </AlertDescription>
              </VStack>
            </Alert>

            {/* Category Selection */}
            <FormControl isRequired>
              <FormLabel fontWeight="bold">Dispute Category</FormLabel>
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value as DisputeCategory)}
                isDisabled={isSubmitting}
                borderColor={borderColor}
              >
                <option value="item_not_as_described">Item Not As Described</option>
                <option value="no_show">No-Show at Meetup</option>
                <option value="rider_damage">Item Damaged During Delivery</option>
                <option value="safety">Safety Concern</option>
                <option value="harassment">Harassment or Abuse</option>
              </Select>
              <Text fontSize="sm" color={mutedText} mt={2}>
                {categoryDescriptions[category]}
              </Text>
            </FormControl>

            {/* Description */}
            <FormControl isRequired>
              <FormLabel fontWeight="bold">Description (min. 20 characters)</FormLabel>
              <Textarea
                placeholder="Please provide a clear, factual description of the issue..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                isDisabled={isSubmitting}
                minH="120px"
                borderColor={borderColor}
              />
              <Text fontSize="xs" color={mutedText} mt={2}>
                {description.length} / 1000 characters
              </Text>
            </FormControl>

            {/* Photo Evidence */}
            <FormControl isRequired>
              <FormLabel fontWeight="bold">Evidence Photo (Required)</FormLabel>
              <Box
                borderWidth="2px"
                borderStyle="dashed"
                borderColor={borderColor}
                borderRadius="md"
                p={4}
                textAlign="center"
                bg={useColorModeValue('gray.50', 'gray.900')}
                _hover={{ borderColor: '#1D9E75' }}
                cursor={isSubmitting ? 'not-allowed' : 'pointer'}
                as="label"
                opacity={isSubmitting ? 0.6 : 1}
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" style={{ maxHeight: '200px', borderRadius: '4px' }} />
                ) : (
                  <VStack spacing={2}>
                    <Text fontSize="sm" fontWeight="bold">
                      Click to upload or drag and drop
                    </Text>
                    <Text fontSize="xs" color={mutedText}>
                      JPG, PNG or WebP
                    </Text>
                  </VStack>
                )}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handlePhotoSelect}
                  disabled={isSubmitting}
                />
              </Box>
              <Text fontSize="xs" color={mutedText} mt={2}>
                Upload a clear photo showing the issue (handoff photo + current condition)
              </Text>
            </FormControl>

            {/* Action Buttons */}
            <HStack spacing={3} justifyContent="flex-end" pt={4}>
              <Button onClick={handleClose} isDisabled={isSubmitting} variant="outline">
                Cancel
              </Button>
              <Button
                onClick={handleSubmitDispute}
                isLoading={isSubmitting}
                loadingText="Filing..."
                bg="#1D9E75"
                color="white"
                _hover={{ bg: '#158C68' }}
                isDisabled={isSubmitting}
              >
                File Dispute
              </Button>
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

export default DisputeReportModal
