import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Input,
  Select,
  Textarea,
  useToast,
  Icon,
  Center,
  Spinner,
  Container,
  Flex,
  Badge,
  Divider,
  Checkbox,
  IconButton,
  Image,
  SimpleGrid,
} from '@chakra-ui/react'
import { ArrowBackIcon, CheckIcon, ChevronRightIcon } from '@chakra-ui/icons'
import { useNavigate } from 'react-router-dom'
import { FaMotorcycle, FaBicycle, FaCar, FaUpload, FaIdCard, FaCamera, FaShieldAlt, FaCheckCircle } from 'react-icons/fa'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// STEP INDICATOR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const StepIndicator: React.FC<{ currentStep: number; totalSteps: number; labels: string[] }> = ({
  currentStep,
  totalSteps,
  labels,
}) => (
  <HStack spacing={0} w="full" justify="center" px={4}>
    {Array.from({ length: totalSteps }).map((_, i) => {
      const stepNum = i + 1
      const isComplete = currentStep > stepNum
      const isActive = currentStep === stepNum
      return (
        <React.Fragment key={i}>
          <VStack spacing={1} flex={1} maxW="120px">
            <Flex
              w="36px"
              h="36px"
              borderRadius="full"
              align="center"
              justify="center"
              bg={isComplete ? '#2D876D' : isActive ? '#2D876D' : 'gray.200'}
              color={isComplete || isActive ? 'white' : 'gray.500'}
              fontWeight="bold"
              fontSize="sm"
              transition="all 0.3s ease"
              boxShadow={isActive ? '0 0 0 4px rgba(45, 135, 109, 0.2)' : 'none'}
            >
              {isComplete ? <CheckIcon boxSize={4} /> : stepNum}
            </Flex>
            <Text
              fontSize="2xs"
              fontWeight={isActive ? '700' : '500'}
              color={isActive ? '#2D876D' : isComplete ? 'gray.700' : 'gray.400'}
              textAlign="center"
              lineHeight="1.2"
              transition="all 0.3s"
            >
              {labels[i]}
            </Text>
          </VStack>
          {i < totalSteps - 1 && (
            <Box flex={1} h="2px" bg={isComplete ? '#2D876D' : 'gray.200'} mt="-18px" transition="all 0.4s" />
          )}
        </React.Fragment>
      )
    })}
  </HStack>
)

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLE TYPE CARD
// ─────────────────────────────────────────────────────────────────────────────
const VehicleCard: React.FC<{
  type: string
  label: string
  icon: any
  selected: boolean
  onClick: () => void
}> = ({ type, label, icon, selected, onClick }) => (
  <Box
    as="button"
    type="button"
    onClick={onClick}
    p={4}
    borderRadius="16px"
    border="2px solid"
    borderColor={selected ? '#2D876D' : 'gray.200'}
    bg={selected ? 'rgba(45, 135, 109, 0.06)' : 'white'}
    transition="all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)"
    _hover={{
      borderColor: selected ? '#2D876D' : 'gray.300',
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    }}
    _active={{ transform: 'scale(0.97)' }}
    textAlign="center"
  >
    <VStack spacing={2}>
      <Icon
        as={icon}
        boxSize={8}
        color={selected ? '#2D876D' : 'gray.400'}
        transition="all 0.2s"
      />
      <Text
        fontSize="sm"
        fontWeight={selected ? '700' : '500'}
        color={selected ? '#2D876D' : 'gray.600'}
      >
        {label}
      </Text>
      {selected && (
        <Badge
          colorScheme="green"
          fontSize="2xs"
          borderRadius="full"
          px={2}
        >
          Selected
        </Badge>
      )}
    </VStack>
  </Box>
)

// ─────────────────────────────────────────────────────────────────────────────
// FILE UPLOAD CARD
// ─────────────────────────────────────────────────────────────────────────────
const FileUploadCard: React.FC<{
  label: string
  icon: any
  description: string
  file: File | null
  preview: string | null
  onFileSelect: (file: File) => void
  error?: string
}> = ({ label, icon, description, file, preview, onFileSelect, error }) => {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <Box
      p={4}
      borderRadius="16px"
      border="2px dashed"
      borderColor={error ? '#ef5350' : file ? '#2D876D' : 'gray.200'}
      bg={file ? 'rgba(45, 135, 109, 0.04)' : 'gray.50'}
      cursor="pointer"
      onClick={() => inputRef.current?.click()}
      transition="all 0.2s"
      _hover={{
        borderColor: error ? '#ef5350' : '#2D876D',
        bg: file ? 'rgba(45, 135, 109, 0.06)' : 'gray.100',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFileSelect(f)
        }}
      />
      {preview ? (
        <VStack spacing={2}>
          <Image
            src={preview}
            alt={label}
            maxH="120px"
            borderRadius="12px"
            objectFit="cover"
          />
          <HStack spacing={1}>
            <Icon as={FaCheckCircle} color="#2D876D" boxSize={3} />
            <Text fontSize="xs" color="#2D876D" fontWeight="600">
              {file?.name || 'Uploaded'}
            </Text>
          </HStack>
          <Text fontSize="2xs" color="gray.400">Click to change</Text>
        </VStack>
      ) : (
        <VStack spacing={2} py={4}>
          <Icon as={icon} boxSize={8} color={error ? '#ef5350' : 'gray.400'} />
          <Text fontSize="sm" fontWeight="600" color={error ? '#ef5350' : 'gray.600'}>
            {label}
          </Text>
          <Text fontSize="xs" color="gray.400" textAlign="center">
            {description}
          </Text>
          <Button size="xs" variant="outline" colorScheme="green" leftIcon={<Icon as={FaUpload} />}>
            Choose File
          </Button>
        </VStack>
      )}
      {error && (
        <Text fontSize="xs" color="#ef5350" mt={1} textAlign="center">
          {error}
        </Text>
      )}
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RIDER APPLICATION PAGE
// ─────────────────────────────────────────────────────────────────────────────
const RiderApplication: React.FC = () => {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [tncAccepted, setTncAccepted] = useState(false)

  // Form data
  const [formData, setFormData] = useState({
    full_name: '',
    contact_number: '',
    vehicle_type: 'motorcycle',
    vehicle_plate: '',
    vehicle_color: '',
    address: '',
    emergency_contact: '',
  })

  // File uploads
  const [licenseFile, setLicenseFile] = useState<File | null>(null)
  const [licensePreview, setLicensePreview] = useState<string | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)
  const [orcrFile, setOrcrFile] = useState<File | null>(null)
  const [orcrPreview, setOrcrPreview] = useState<string | null>(null)
  const [motorOwnerFile, setMotorOwnerFile] = useState<File | null>(null)
  const [motorOwnerPreview, setMotorOwnerPreview] = useState<string | null>(null)

  // Pre-fill name from user context
  useEffect(() => {
    if (user?.name && !formData.full_name) {
      setFormData(prev => ({ ...prev, full_name: user.name }))
    }
  }, [user])

  // Check if already applied
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await api.get('/api/deliveries/rider-application')
        if (res.data?.data?.has_applied) {
          const status = res.data.data.status
          if (status === 'pending' || status === 'under_review') {
            toast({
              id: 'rider-app-pending',
              title: 'Application pending',
              description: 'You already have a pending rider application.',
              status: 'info',
              duration: 4000,
            })
            navigate('/rider-home')
          } else if (status === 'approved') {
            toast({
              id: 'rider-app-approved',
              title: 'Already approved',
              description: 'You are already an approved rider!',
              status: 'success',
              duration: 3000,
            })
            navigate('/rider-home')
          }
        }
      } catch (err) {
        console.error('Failed to check rider application status:', err)
      } finally {
        setChecking(false)
      }
    }
    checkStatus()
  }, [navigate, toast])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleFileSelect = (type: 'license' | 'selfie' | 'orcr' | 'motor_owner', file: File) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (type === 'license') {
        setLicenseFile(file)
        setLicensePreview(reader.result as string)
        if (fieldErrors.license) setFieldErrors(prev => ({ ...prev, license: '' }))
      } else if (type === 'selfie') {
        setSelfieFile(file)
        setSelfiePreview(reader.result as string)
        if (fieldErrors.selfie) setFieldErrors(prev => ({ ...prev, selfie: '' }))
      } else if (type === 'orcr') {
        setOrcrFile(file)
        setOrcrPreview(reader.result as string)
        if (fieldErrors.orcr) setFieldErrors(prev => ({ ...prev, orcr: '' }))
      } else if (type === 'motor_owner') {
        setMotorOwnerFile(file)
        setMotorOwnerPreview(reader.result as string)
        if (fieldErrors.motor_owner) setFieldErrors(prev => ({ ...prev, motor_owner: '' }))
      }
    }
    reader.readAsDataURL(file)
  }

  // ─── VALIDATION ────────────────────────────────────────────────────────────
  const validateStep1 = (): boolean => {
    const errors: Record<string, string> = {}
    if (!formData.full_name.trim()) errors.full_name = 'Full name is required'
    const digits = formData.contact_number.replace(/\D/g, '')
    if (!digits) errors.contact_number = 'Contact number is required'
    else if (digits.length !== 11) errors.contact_number = 'Must be exactly 11 digits (e.g. 09171234567)'
    else if (!digits.startsWith('09')) errors.contact_number = 'Must start with 09'

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const validateStep2 = (): boolean => {
    const errors: Record<string, string> = {}
    if (!licenseFile) errors.license = "Please upload your driver's license"
    if (!orcrFile) errors.orcr = "Please upload the OR/CR papers of the vehicle"
    if (!motorOwnerFile) errors.motor_owner = "Please upload a photo of you with your vehicle (visible plate & color)"

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const validateStep3 = (): boolean => {
    const errors: Record<string, string> = {}
    if (!tncAccepted) errors.tnc = 'You must agree to the terms to continue'

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2)
    else if (step === 2 && validateStep2()) setStep(3)
  }

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
    else navigate('/home')
  }

  // ─── SUBMIT ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validateStep3()) return

    setLoading(true)
    try {
      // Upload images first if we have files
      let licenseUrl = ''
      let selfieUrl = ''
      let orcrUrl = ''
      let motorOwnerUrl = ''

      const uploadImage = async (file: File) => {
        const formDataUpload = new FormData()
        formDataUpload.append('image', file)
        const uploadRes = await api.post('/api/upload', formDataUpload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        return uploadRes.data?.url || uploadRes.data?.data?.url || ''
      }

      if (licenseFile) licenseUrl = await uploadImage(licenseFile)
      if (selfieFile) selfieUrl = await uploadImage(selfieFile)
      if (orcrFile) orcrUrl = await uploadImage(orcrFile)
      if (motorOwnerFile) motorOwnerUrl = await uploadImage(motorOwnerFile)

      const digits = formData.contact_number.replace(/\D/g, '')

      await api.post('/api/deliveries/apply-rider', {
        full_name: formData.full_name.trim(),
        contact_number: digits,
        vehicle_type: formData.vehicle_type,
        vehicle_plate: formData.vehicle_plate.trim(),
        vehicle_color: formData.vehicle_color.trim(),
        license_image_url: licenseUrl,
        selfie_image_url: selfieUrl,
        orcr_image_url: orcrUrl,
        motor_owner_image_url: motorOwnerUrl,
        address: formData.address.trim(),
        emergency_contact: formData.emergency_contact.trim(),
      })

      toast({
        id: 'rider-app-submitted',
        title: '🎉 Application Submitted!',
        description: "Your rider application is under review. We'll notify you once approved.",
        status: 'success',
        duration: 5000,
        isClosable: true,
      })
      navigate('/rider-home')
    } catch (err: any) {
      toast({
        id: 'rider-app-error',
        title: 'Submission Failed',
        description: err.response?.data?.error || 'Failed to submit application. Please try again.',
        status: 'error',
        duration: 4000,
      })
    } finally {
      setLoading(false)
    }
  }

  // ─── LOADING STATE ─────────────────────────────────────────────────────────
  if (checking) {
    return (
      <Center minH="100vh" bg="#FFFDF1">
        <VStack spacing={3}>
          <Spinner size="lg" color="brand.500" thickness="3px" />
          <Text fontSize="sm" color="gray.500">Checking application status…</Text>
        </VStack>
      </Center>
    )
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <Box minH="100vh" bg={{ base: '#E8F5E9', md: '#FFFDF1' }} display="flex" flexDirection="column">
      <Box flex={1} overflowY="auto" py={{ base: 6, md: 8 }} px={{ base: 4, md: 20 }} position="relative">
        <Container maxW="container.sm" position="relative" p={0}>
          {/* Back Button */}
          <IconButton
            aria-label="Go back"
            icon={<ArrowBackIcon />}
            position="absolute"
            top={{ base: -2, md: 0 }}
            left={{ base: -2, md: -12 }}
            variant="ghost"
            colorScheme="teal"
            onClick={handleBack}
            size="md"
            zIndex={10}
          />

          <VStack spacing={6} align="stretch">
            {/* Hero Section */}
            <Box textAlign="center" mt={{ base: 8, md: 0 }} mb={2}>
              {/* Motorcycle SVG Illustration */}
              <Flex justify="center" mb={4} h="90px">
                <svg width="100%" height="90" viewBox="0 0 240 100" fill="none" style={{ maxWidth: '220px' }}>
                  {/* Road */}
                  <rect x="0" y="80" width="240" height="4" rx="2" fill="#E0E0E0" />
                  <rect x="30" y="81" width="20" height="2" rx="1" fill="#BDBDBD" />
                  <rect x="70" y="81" width="20" height="2" rx="1" fill="#BDBDBD" />
                  <rect x="110" y="81" width="20" height="2" rx="1" fill="#BDBDBD" />
                  <rect x="150" y="81" width="20" height="2" rx="1" fill="#BDBDBD" />
                  <rect x="190" y="81" width="20" height="2" rx="1" fill="#BDBDBD" />
                  {/* Motorcycle body */}
                  <g transform="translate(60, 20)">
                    {/* Back wheel */}
                    <circle cx="20" cy="55" r="14" stroke="#2D876D" strokeWidth="3" fill="none" />
                    <circle cx="20" cy="55" r="4" fill="#2D876D" />
                    {/* Front wheel */}
                    <circle cx="100" cy="55" r="14" stroke="#2D876D" strokeWidth="3" fill="none" />
                    <circle cx="100" cy="55" r="4" fill="#2D876D" />
                    {/* Frame */}
                    <path d="M 20 55 L 45 25 L 75 25 L 100 55" stroke="#333" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    {/* Seat */}
                    <path d="M 35 25 Q 50 15 65 25" stroke="#444" strokeWidth="4" fill="none" strokeLinecap="round" />
                    {/* Handle bars */}
                    <line x1="75" y1="25" x2="85" y2="15" stroke="#333" strokeWidth="3" strokeLinecap="round" />
                    <line x1="80" y1="12" x2="90" y2="18" stroke="#333" strokeWidth="2.5" strokeLinecap="round" />
                    {/* Headlight */}
                    <circle cx="100" cy="40" r="4" fill="#FFD54F" />
                    {/* Exhaust */}
                    <path d="M 20 48 L 8 48 L 5 52" stroke="#999" strokeWidth="2" strokeLinecap="round" />
                    {/* Speed lines */}
                    <line x1="-15" y1="35" x2="-5" y2="35" stroke="#2D876D" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />
                    <line x1="-20" y1="45" x2="-8" y2="45" stroke="#2D876D" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
                    <line x1="-12" y1="55" x2="-3" y2="55" stroke="#2D876D" strokeWidth="1.5" opacity="0.3" strokeLinecap="round" />
                  </g>
                  {/* Decorative */}
                  <circle cx="30" cy="30" r="3" fill="#66BB6A" opacity="0.6" />
                  <circle cx="210" cy="25" r="4" fill="#81C784" opacity="0.5" />
                  <circle cx="220" cy="60" r="2.5" fill="#66BB6A" opacity="0.4" />
                </svg>
              </Flex>

              <Heading
                size="lg"
                color="#2D876D"
                mb={2}
                fontSize={{ base: '26px', md: '30px' }}
                fontWeight="700"
                letterSpacing="-0.5px"
              >
                Rider Application
              </Heading>
              <Text color="#555" fontSize={{ base: '13px', md: '15px' }} fontWeight="500">
                Join CloviaPH's rider fleet and start earning!
              </Text>
            </Box>

            {/* Step Indicator */}
            <StepIndicator
              currentStep={step}
              totalSteps={3}
              labels={['Personal Info', 'Documents', 'Review & Submit']}
            />

            {/* Form Card */}
            <Box
              w="full"
              bg="white"
              borderRadius={{ base: '24px', md: '16px' }}
              p={{ base: 6, md: 8 }}
              boxShadow={{ base: 'none', md: '0 4px 20px rgba(0, 0, 0, 0.08)' }}
              border={{ base: 'none', md: '1px solid' }}
              borderColor={{ base: 'transparent', md: 'gray.100' }}
            >
              {/* ─── STEP 1: PERSONAL INFORMATION ─────────────────────────── */}
              {step === 1 && (
                <VStack spacing={5} align="stretch">
                  <HStack spacing={2} mb={1}>
                    <Icon as={FaMotorcycle} color="#2D876D" boxSize={5} />
                    <Heading size="sm" color="gray.800">Personal Information</Heading>
                  </HStack>

                  <FormControl isRequired isInvalid={!!fieldErrors.full_name}>
                    <FormLabel fontSize="13px" fontWeight="600" color="#333" mb="8px">
                      Full Name
                    </FormLabel>
                    <Input
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      placeholder="Juan Dela Cruz"
                      size="lg"
                      bg="#F5F5F5"
                      borderColor={fieldErrors.full_name ? '#ef5350' : '#E0E0E0'}
                      borderWidth="1px"
                      height="44px"
                      fontSize="14px"
                      _focus={{
                        borderColor: fieldErrors.full_name ? '#ef5350' : '#2D876D',
                        boxShadow: fieldErrors.full_name ? '0 0 0 3px rgba(239, 83, 80, 0.1)' : '0 0 0 3px rgba(45, 135, 109, 0.1)',
                        bg: 'white',
                      }}
                      _hover={{ borderColor: '#E8E8E8' }}
                      transition="all 0.2s"
                    />
                    {fieldErrors.full_name && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.full_name}</FormErrorMessage>}
                  </FormControl>

                  <FormControl isRequired isInvalid={!!fieldErrors.contact_number}>
                    <FormLabel fontSize="13px" fontWeight="600" color="#333" mb="8px">
                      Contact Number
                      <Text as="span" fontSize="11px" color="gray.500" ml={2} fontWeight="400">
                        ({formData.contact_number.replace(/\D/g, '').length}/11 digits)
                      </Text>
                    </FormLabel>
                    <Input
                      name="contact_number"
                      value={formData.contact_number}
                      onChange={(e) => {
                        let value = e.target.value.replace(/\D/g, '')
                        if (value.length > 11) value = value.slice(0, 11)
                        setFormData(prev => ({ ...prev, contact_number: value }))
                        if (fieldErrors.contact_number) setFieldErrors(prev => ({ ...prev, contact_number: '' }))
                      }}
                      placeholder="09171234567"
                      inputMode="numeric"
                      maxLength={11}
                      size="lg"
                      bg="#F5F5F5"
                      borderColor={fieldErrors.contact_number ? '#ef5350' : '#E0E0E0'}
                      borderWidth="1px"
                      height="44px"
                      fontSize="14px"
                      _focus={{
                        borderColor: fieldErrors.contact_number ? '#ef5350' : '#2D876D',
                        boxShadow: fieldErrors.contact_number ? '0 0 0 3px rgba(239, 83, 80, 0.1)' : '0 0 0 3px rgba(45, 135, 109, 0.1)',
                        bg: 'white',
                      }}
                      _hover={{ borderColor: '#E8E8E8' }}
                      transition="all 0.2s"
                    />
                    {fieldErrors.contact_number && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.contact_number}</FormErrorMessage>}
                  </FormControl>

                  {/* Vehicle Type Selector */}
                  <FormControl isRequired>
                    <FormLabel fontSize="13px" fontWeight="600" color="#333" mb="8px">
                      Vehicle Type
                    </FormLabel>
                    <SimpleGrid columns={3} spacing={3}>
                      <VehicleCard
                        type="motorcycle"
                        label="Motorcycle"
                        icon={FaMotorcycle}
                        selected={formData.vehicle_type === 'motorcycle'}
                        onClick={() => setFormData(prev => ({ ...prev, vehicle_type: 'motorcycle' }))}
                      />
                      <VehicleCard
                        type="bicycle"
                        label="Bicycle"
                        icon={FaBicycle}
                        selected={formData.vehicle_type === 'bicycle'}
                        onClick={() => setFormData(prev => ({ ...prev, vehicle_type: 'bicycle' }))}
                      />
                      <VehicleCard
                        type="car"
                        label="Car"
                        icon={FaCar}
                        selected={formData.vehicle_type === 'car'}
                        onClick={() => setFormData(prev => ({ ...prev, vehicle_type: 'car' }))}
                      />
                    </SimpleGrid>
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="13px" fontWeight="600" color="#666" mb="8px">
                      Vehicle Plate Number
                      <Text as="span" fontSize="11px" color="gray.400" ml={2} fontWeight="400">
                        (if applicable)
                      </Text>
                    </FormLabel>
                    <Input
                      name="vehicle_plate"
                      value={formData.vehicle_plate}
                      onChange={handleChange}
                      placeholder="ABC 123"
                      size="lg"
                      bg="#F5F5F5"
                      borderColor="#E0E0E0"
                      borderWidth="1px"
                      height="44px"
                      fontSize="14px"
                      _focus={{
                        borderColor: '#2D876D',
                        boxShadow: '0 0 0 3px rgba(45, 135, 109, 0.1)',
                        bg: 'white',
                      }}
                      _hover={{ borderColor: '#E8E8E8' }}
                      transition="all 0.2s"
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="13px" fontWeight="600" color="#666" mb="8px">
                      Vehicle Color
                      <Text as="span" fontSize="11px" color="gray.400" ml={2} fontWeight="400">
                        (required)
                      </Text>
                    </FormLabel>
                    <Input
                      name="vehicle_color"
                      value={formData.vehicle_color}
                      onChange={handleChange}
                      placeholder="e.g. Matte Black"
                      size="lg"
                      bg="#F5F5F5"
                      borderColor="#E0E0E0"
                      borderWidth="1px"
                      height="44px"
                      fontSize="14px"
                      _focus={{
                        borderColor: '#2D876D',
                        boxShadow: '0 0 0 3px rgba(45, 135, 109, 0.1)',
                        bg: 'white',
                      }}
                      _hover={{ borderColor: '#E8E8E8' }}
                      transition="all 0.2s"
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="13px" fontWeight="600" color="#666" mb="8px">
                      Home Address
                      <Text as="span" fontSize="11px" color="gray.400" ml={2} fontWeight="400">
                        (optional)
                      </Text>
                    </FormLabel>
                    <Textarea
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="Your home or operating area address"
                      size="sm"
                      bg="#F5F5F5"
                      borderColor="#E0E0E0"
                      borderWidth="1px"
                      fontSize="14px"
                      borderRadius="12px"
                      rows={2}
                      resize="none"
                      _focus={{
                        borderColor: '#2D876D',
                        boxShadow: '0 0 0 3px rgba(45, 135, 109, 0.1)',
                        bg: 'white',
                      }}
                      _hover={{ borderColor: '#E8E8E8' }}
                      transition="all 0.2s"
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="13px" fontWeight="600" color="#666" mb="8px">
                      Emergency Contact
                      <Text as="span" fontSize="11px" color="gray.400" ml={2} fontWeight="400">
                        (optional)
                      </Text>
                    </FormLabel>
                    <Input
                      name="emergency_contact"
                      value={formData.emergency_contact}
                      onChange={handleChange}
                      placeholder="Name & phone number of emergency contact"
                      size="lg"
                      bg="#F5F5F5"
                      borderColor="#E0E0E0"
                      borderWidth="1px"
                      height="44px"
                      fontSize="14px"
                      _focus={{
                        borderColor: '#2D876D',
                        boxShadow: '0 0 0 3px rgba(45, 135, 109, 0.1)',
                        bg: 'white',
                      }}
                      _hover={{ borderColor: '#E8E8E8' }}
                      transition="all 0.2s"
                    />
                  </FormControl>

                  <Button
                    bg="#2D876D"
                    color="white"
                    size="lg"
                    w="full"
                    onClick={handleNext}
                    mt={2}
                    fontWeight="600"
                    fontSize="16px"
                    height="48px"
                    borderRadius="12px"
                    rightIcon={<ChevronRightIcon boxSize={5} />}
                    transition="all 0.3s ease"
                    _hover={{
                      bg: '#25704d',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 8px 16px rgba(45, 135, 109, 0.3)',
                    }}
                    _active={{ transform: 'translateY(0)' }}
                  >
                    Continue to Documents
                  </Button>
                </VStack>
              )}

              {/* ─── STEP 2: DOCUMENT UPLOAD ──────────────────────────────── */}
              {step === 2 && (
                <VStack spacing={5} align="stretch">
                  <HStack spacing={2} mb={1}>
                    <Icon as={FaIdCard} color="#2D876D" boxSize={5} />
                    <Heading size="sm" color="gray.800">Upload Documents</Heading>
                  </HStack>

                  <Box bg="blue.50" p={3} borderRadius="12px" border="1px" borderColor="blue.100">
                    <HStack spacing={2}>
                      <Icon as={FaShieldAlt} color="blue.500" boxSize={4} />
                      <Text fontSize="xs" color="blue.700" fontWeight="500">
                        Your documents are securely stored and only reviewed by our admin team for verification.
                      </Text>
                    </HStack>
                  </Box>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                    <FileUploadCard
                      label="Driver's License"
                      icon={FaIdCard}
                      description="Clear photo of your valid driver's license (front side)"
                      file={licenseFile}
                      preview={licensePreview}
                      onFileSelect={(f) => handleFileSelect('license', f)}
                      error={fieldErrors.license}
                    />

                    <FileUploadCard
                      label="Selfie with ID"
                      icon={FaIdCard}
                      description="Take a selfie while holding your driver's license"
                      file={selfieFile}
                      preview={selfiePreview}
                      onFileSelect={(f) => handleFileSelect('selfie', f)}
                      error={fieldErrors.selfie}
                    />

                    <FileUploadCard
                      label="OR/CR Document"
                      icon={FaUpload}
                      description="Clear photo of your official receipt & certificate of registration"
                      file={orcrFile}
                      preview={orcrPreview}
                      onFileSelect={(f) => handleFileSelect('orcr', f)}
                      error={fieldErrors.orcr}
                    />

                    <FileUploadCard
                      label="Owner with Motor"
                      icon={FaCamera}
                      description="Photo of you with your vehicle (ensure plate and color are visible)"
                      file={motorOwnerFile}
                      preview={motorOwnerPreview}
                      onFileSelect={(f) => handleFileSelect('motor_owner', f)}
                      error={fieldErrors.motor_owner}
                    />
                  </SimpleGrid>

                  <HStack spacing={3} mt={2}>
                    <Button
                      variant="outline"
                      size="lg"
                      flex={1}
                      onClick={handleBack}
                      fontWeight="600"
                      height="48px"
                      borderRadius="12px"
                      borderColor="gray.300"
                      color="gray.600"
                      _hover={{ bg: 'gray.50' }}
                    >
                      Back
                    </Button>
                    <Button
                      bg="#2D876D"
                      color="white"
                      size="lg"
                      flex={2}
                      onClick={handleNext}
                      fontWeight="600"
                      fontSize="16px"
                      height="48px"
                      borderRadius="12px"
                      rightIcon={<ChevronRightIcon boxSize={5} />}
                      transition="all 0.3s ease"
                      _hover={{
                        bg: '#25704d',
                        transform: 'translateY(-2px)',
                        boxShadow: '0 8px 16px rgba(45, 135, 109, 0.3)',
                      }}
                      _active={{ transform: 'translateY(0)' }}
                    >
                      Review Application
                    </Button>
                  </HStack>
                </VStack>
              )}

              {/* ─── STEP 3: REVIEW & SUBMIT ──────────────────────────────── */}
              {step === 3 && (
                <VStack spacing={5} align="stretch">
                  <HStack spacing={2} mb={1}>
                    <Icon as={FaCheckCircle} color="#2D876D" boxSize={5} />
                    <Heading size="sm" color="gray.800">Review & Submit</Heading>
                  </HStack>

                  {/* Summary Card */}
                  <Box bg="gray.50" p={5} borderRadius="16px" border="1px" borderColor="gray.100">
                    <VStack spacing={3} align="stretch">
                      <HStack justify="space-between">
                        <Text fontSize="sm" color="gray.500" fontWeight="500">Full Name</Text>
                        <Text fontSize="sm" fontWeight="600" color="gray.800">{formData.full_name}</Text>
                      </HStack>
                      <Divider />
                      <HStack justify="space-between">
                        <Text fontSize="sm" color="gray.500" fontWeight="500">Contact</Text>
                        <Text fontSize="sm" fontWeight="600" color="gray.800">{formData.contact_number}</Text>
                      </HStack>
                      <Divider />
                      <HStack justify="space-between">
                        <Text fontSize="sm" color="gray.500" fontWeight="500">Vehicle</Text>
                        <HStack spacing={2}>
                          <Icon
                            as={formData.vehicle_type === 'motorcycle' ? FaMotorcycle : formData.vehicle_type === 'bicycle' ? FaBicycle : FaCar}
                            color="#2D876D"
                            boxSize={4}
                          />
                          <Text fontSize="sm" fontWeight="600" color="gray.800" textTransform="capitalize">
                            {formData.vehicle_type}
                          </Text>
                        </HStack>
                      </HStack>
                      {formData.vehicle_plate && (
                        <>
                          <Divider />
                          <HStack justify="space-between">
                            <Text fontSize="sm" color="gray.500" fontWeight="500">Plate No.</Text>
                            <Text fontSize="sm" fontWeight="600" color="gray.800">{formData.vehicle_plate}</Text>
                          </HStack>
                        </>
                      )}
                      {formData.vehicle_color && (
                        <>
                          <Divider />
                          <HStack justify="space-between">
                            <Text fontSize="sm" color="gray.500" fontWeight="500">Color</Text>
                            <Text fontSize="sm" fontWeight="600" color="gray.800">{formData.vehicle_color}</Text>
                          </HStack>
                        </>
                      )}
                      {formData.address && (
                        <>
                          <Divider />
                          <HStack justify="space-between" align="start">
                            <Text fontSize="sm" color="gray.500" fontWeight="500">Address</Text>
                            <Text fontSize="sm" fontWeight="600" color="gray.800" textAlign="right" maxW="60%">
                              {formData.address}
                            </Text>
                          </HStack>
                        </>
                      )}
                      <Divider />
                      <HStack justify="space-between">
                        <Text fontSize="sm" color="gray.500" fontWeight="500">Documents</Text>
                        <HStack spacing={2}>
                        {licenseFile && (
                          <Badge colorScheme="green" fontSize="2xs" borderRadius="full" px={2}>✓ License</Badge>
                        )}
                        {selfieFile && (
                          <Badge colorScheme="green" fontSize="2xs" borderRadius="full" px={2}>✓ Selfie</Badge>
                        )}
                        {orcrFile && (
                          <Badge colorScheme="green" fontSize="2xs" borderRadius="full" px={2}>✓ ORCR</Badge>
                        )}
                        {motorOwnerFile && (
                          <Badge colorScheme="green" fontSize="2xs" borderRadius="full" px={2}>✓ Owner+Motor</Badge>
                        )}
                      </HStack>
                      </HStack>
                    </VStack>
                  </Box>

                  {/* Preview uploaded documents */}
                  <SimpleGrid columns={2} spacing={3}>
                    {licensePreview && (
                      <Box borderRadius="12px" overflow="hidden" border="1px" borderColor="gray.200">
                        <Image src={licensePreview} alt="License" w="full" h="100px" objectFit="cover" />
                        <Text fontSize="2xs" textAlign="center" py={1} bg="gray.50" color="gray.500">
                          Driver's License
                        </Text>
                      </Box>
                    )}
                    {selfiePreview && (
                      <Box borderRadius="12px" overflow="hidden" border="1px" borderColor="gray.200">
                        <Image src={selfiePreview} alt="Selfie" w="full" h="100px" objectFit="cover" />
                        <Text fontSize="2xs" textAlign="center" py={1} bg="gray.50" color="gray.500">
                          Selfie with ID
                        </Text>
                      </Box>
                    )}
                  </SimpleGrid>

                  {/* Terms & Conditions */}
                  <FormControl isRequired isInvalid={!!fieldErrors.tnc}>
                    <Checkbox
                      isChecked={tncAccepted}
                      onChange={(e) => {
                        setTncAccepted(e.target.checked)
                        if (fieldErrors.tnc) setFieldErrors(prev => ({ ...prev, tnc: '' }))
                      }}
                      colorScheme="teal"
                      alignItems="flex-start"
                    >
                      <Text fontSize="xs" color="#444" mt="-2px">
                        I confirm that all information provided is accurate. I agree to CloviaPH's Rider Terms of Service, 
                        including the responsibilities of safe delivery, proper handling of items, and cash remittance obligations. 
                        I understand that riders are independent service providers and Clovia is not liable for accidents, 
                        damages, or disputes arising from delivery activities.
                      </Text>
                    </Checkbox>
                    {fieldErrors.tnc && (
                      <FormErrorMessage fontSize="xs" mt={1}>
                        {fieldErrors.tnc}
                      </FormErrorMessage>
                    )}
                  </FormControl>

                  <HStack spacing={3} mt={2}>
                    <Button
                      variant="outline"
                      size="lg"
                      flex={1}
                      onClick={handleBack}
                      fontWeight="600"
                      height="48px"
                      borderRadius="12px"
                      borderColor="gray.300"
                      color="gray.600"
                      _hover={{ bg: 'gray.50' }}
                      isDisabled={loading}
                    >
                      Back
                    </Button>
                    <Button
                      bg="#2D876D"
                      color="white"
                      size="lg"
                      flex={2}
                      onClick={handleSubmit}
                      isLoading={loading}
                      loadingText="Submitting…"
                      fontWeight="600"
                      fontSize="16px"
                      height="48px"
                      borderRadius="12px"
                      leftIcon={<Icon as={FaMotorcycle} />}
                      transition="all 0.3s ease"
                      _hover={{
                        bg: '#25704d',
                        transform: 'translateY(-2px)',
                        boxShadow: '0 8px 16px rgba(45, 135, 109, 0.3)',
                      }}
                      _active={{ transform: 'translateY(0)' }}
                    >
                      Submit Application
                    </Button>
                  </HStack>
                </VStack>
              )}
            </Box>

            {/* Footer info */}
            <Text fontSize="xs" color="gray.400" textAlign="center" pb={4}>
              Applications are typically reviewed within 24-48 hours.
            </Text>
          </VStack>
        </Container>
      </Box>
    </Box>
  )
}

export default RiderApplication
