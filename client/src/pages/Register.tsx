import React, { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box,
  Container,
  VStack,
  HStack,
  Heading,
  FormControl,
  FormLabel,
  Input,
  Button,
  Text,
  Link,
  Alert,
  AlertIcon,
  InputGroup,
  InputRightElement,
  IconButton,
  useToast,
  SimpleGrid,
  FormErrorMessage,
  FormHelperText,
  Flex,
} from '@chakra-ui/react'
import { ViewIcon, ViewOffIcon, ArrowBackIcon } from '@chakra-ui/icons'
import { useAuth } from '../contexts/AuthContext'

const Register: React.FC = () => {
  const [firstName, setFirstName] = useState('')
  const [middleInitial, setMiddleInitial] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isOrganization, setIsOrganization] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [orgLogoUrl, setOrgLogoUrl] = useState('')
  const [department, setDepartment] = useState('')
  const [bio, setBio] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const { register } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const validateFields = () => {
    const errors: Record<string, string> = {}
    const isWmsuEmail = email && email.toLowerCase().endsWith('@wmsu.edu.ph')

    if (!isOrganization) {
      if (!firstName) errors.firstName = 'First name is required'
      if (!lastName) errors.lastName = 'Last name is required'
      if (!email) errors.email = 'Email is required'
      else if (!email.includes('@')) errors.email = 'Please enter a valid email address'
      
      // Department required ONLY for WMSU emails
      if (isWmsuEmail && !department) {
        errors.department = 'Department/College is required for WMSU students'
      }
      
      // Phone number validation: max 11 digits, numeric only
      if (phoneNumber && !/^\d+$/.test(phoneNumber)) {
        errors.phone = 'Phone number must contain only digits'
      }
      if (phoneNumber && phoneNumber.length > 11) {
        errors.phone = 'Phone number must be 11 digits or less'
      }
    } else {
      if (!orgName) errors.orgName = 'Organization name is required'
      if (!email) errors.email = 'Email is required'
      else if (!email.includes('@')) errors.email = 'Please enter a valid email address'
    }

    if (!password) {
      errors.password = 'Password is required'
    } else {
      const pwdErrors: string[] = []
      if (password.length < 8) pwdErrors.push('at least 8 characters')
      if (!/[A-Z]/.test(password)) pwdErrors.push('one uppercase letter')
      if (!/[a-z]/.test(password)) pwdErrors.push('one lowercase letter')
      if (!/[0-9]/.test(password)) pwdErrors.push('one number')
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) pwdErrors.push('one special character')
      if (pwdErrors.length > 0) {
        errors.password = 'Password must contain: ' + pwdErrors.join(', ')
      }
    }
    if (!confirmPassword) errors.confirmPassword = 'Confirm password is required'
    if (password && confirmPassword && password !== confirmPassword) errors.confirmPassword = 'Passwords do not match'

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validateFields()) {
      return
    }

    // Combine name fields for backend
    const fullName = !isOrganization
      ? (middleInitial
        ? `${firstName} ${middleInitial} ${lastName}`.trim()
        : `${firstName} ${lastName}`.trim())
      : orgName

    try {
      setLoading(true)
      setError('')
      const result = await register({
        name: fullName,
        email,
        password,
        is_organization: isOrganization,
        org_name: isOrganization ? orgName : undefined,
        org_logo_url: isOrganization ? orgLogoUrl : undefined,
        department: !isOrganization ? department : undefined,
        bio: bio || undefined,
      })

      if (result.requiresVerification) {
        toast({
        id: "register-account-created",
          title: 'Account created!',
          description: 'Please check your email for a verification code.',
          status: 'success',
          duration: 4000,
          isClosable: true,
        })
        navigate('/verify-email', { state: { email: result.email } })
      } else {
        // Verification disabled — token returned directly; store it and log the user in
        if (result.token) {
          localStorage.setItem('clovia_token', result.token)
        }
        // Check if WMSU student – show premium badge toast
        const isWmsu = email.toLowerCase().endsWith('@wmsu.edu.ph')
        if (isWmsu) {
          toast({
        id: "register-premium-access-granted",
            title: '🎓 Premium Access Granted!',
            description: 'As a verified WMSU student, you now have free Premium access including Multi-Way Trading Loops!',
            status: 'success',
            duration: 6000,
            isClosable: true,
            position: 'top',
          })
        } else {
          toast({
        id: "register-welcome",
            title: 'Welcome!',
            description: 'Your account has been created.',
            status: 'success',
            duration: 3000,
            isClosable: true,
          })
        }
        navigate('/home')
      }
    } catch (error: any) {
      setError(error.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box bg={{ base: '#E8F5E9', md: '#FFFDF1' }} w="100%" minH="100vh" display="flex" flexDirection="column">
      {/* Mobile: Scrollable container */}
      <Box
        flex={1}
        overflowY="auto"
        py={{ base: 8, md: 8 }}
        px={{ base: 4, md: 20 }}
        position="relative"
        bg={{ base: '#E8F5E9', md: '#FFFDF1' }}
      >
        <Container maxW="container.sm" position="relative" p={0}>
          {/* Back Button - Mobile Only */}
          <IconButton
            aria-label="Go back"
            icon={<ArrowBackIcon />}
            position="absolute"
            top={{ base: -4, md: 0 }}
            left={{ base: -4, md: 'auto' }}
            display={{ base: 'flex', md: 'none' }}
            variant="ghost"
            colorScheme="teal"
            onClick={() => navigate(-1)}
            size="md"
            zIndex={10}
          />

          <VStack spacing={6} align="stretch">
            {/* Decorative Header - Mobile Optimized */}
            <Box textAlign="center" mt={{ base: 8, md: 0 }} mb={{ base: 2, md: 0 }}>
              {/* Nature Illustration - SVG Plants */}
              <Flex justify="center" mb={6} h="100px">
                <svg width="100%" height="100" viewBox="0 0 200 120" fill="none" style={{ maxWidth: '180px' }}>
                  {/* Left plant */}
                  <g>
                    <path d="M 40 100 Q 30 80 35 60 Q 40 40 45 20" stroke="#4CAF50" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <ellipse cx="30" cy="70" rx="8" ry="15" fill="#66BB6A" transform="rotate(-40 30 70)" />
                    <ellipse cx="45" cy="50" rx="8" ry="15" fill="#81C784" transform="rotate(-20 45 50)" />
                    <ellipse cx="50" cy="30" rx="8" ry="15" fill="#66BB6A" transform="rotate(0 50 30)" />
                    <circle cx="40" cy="95" r="4" fill="#2D876D" />
                  </g>
                  {/* Center plant - Main */}
                  <g>
                    <path d="M 100 100 L 100 20" stroke="#2D876D" strokeWidth="4" fill="none" />
                    <ellipse cx="75" cy="60" rx="12" ry="20" fill="#4CAF50" transform="rotate(-45 75 60)" />
                    <ellipse cx="125" cy="65" rx="12" ry="20" fill="#4CAF50" transform="rotate(45 125 65)" />
                    <ellipse cx="70" cy="40" rx="12" ry="20" fill="#66BB6A" transform="rotate(-50 70 40)" />
                    <ellipse cx="130" cy="35" rx="12" ry="20" fill="#66BB6A" transform="rotate(50 130 35)" />
                    <ellipse cx="85" cy="25" rx="10" ry="18" fill="#81C784" transform="rotate(-35 85 25)" />
                    <ellipse cx="115" cy="25" rx="10" ry="18" fill="#81C784" transform="rotate(35 115 25)" />
                    <circle cx="100" cy="95" r="5" fill="#2D876D" />
                  </g>
                  {/* Right plant */}
                  <g>
                    <path d="M 160 100 Q 170 80 165 60 Q 160 40 155 20" stroke="#4CAF50" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <ellipse cx="170" cy="70" rx="8" ry="15" fill="#66BB6A" transform="rotate(40 170 70)" />
                    <ellipse cx="155" cy="50" rx="8" ry="15" fill="#81C784" transform="rotate(20 155 50)" />
                    <ellipse cx="150" cy="30" rx="8" ry="15" fill="#66BB6A" transform="rotate(0 150 30)" />
                    <circle cx="160" cy="95" r="4" fill="#2D876D" />
                  </g>
                  {/* Decorative flowers */}
                  <circle cx="55" cy="35" r="3" fill="#FFD54F" />
                  <circle cx="145" cy="40" r="3" fill="#FFD54F" />
                  <circle cx="75" cy="15" r="2.5" fill="#FFEB3B" />
                </svg>
              </Flex>

              <Heading
                size="lg"
                color="#2D876D"
                mb={2}
                fontSize={{ base: '28px', md: '32px' }}
                fontWeight="700"
                letterSpacing="-0.5px"
              >
                Create Account
              </Heading>
              <Text
                color="#555"
                fontSize={{ base: '14px', md: '16px' }}
                fontWeight="500"
              >
                Join Clovia to start trading
              </Text>
            </Box>

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
              <form onSubmit={handleSubmit}>
                <VStack spacing={5}>
                  {error && (
                    <Alert status="error" borderRadius="12px" bg="#FFEBEE" borderLeft="4px solid" borderColor="#C62828">
                      <AlertIcon color="#C62828" />
                      <Box ml={2}>
                        <Text fontWeight="600" color="#B71C1C" fontSize="sm">{error}</Text>
                      </Box>
                    </Alert>
                  )}

                  {/* Account Type Selector - Segmented Control */}
                  <FormControl>
                    <FormLabel fontSize="13px" fontWeight="600" mb="12px" color="#333">Account Type</FormLabel>
                    <HStack
                      spacing={2}
                      bg="#F0F0F0"
                      borderRadius="12px"
                      p={1.5}
                      w="full"
                      transition="all 0.2s"
                    >
                      <Button
                        flex={1}
                        variant={isOrganization ? 'ghost' : 'solid'}
                        bg={isOrganization ? 'transparent' : '#2D876D'}
                        color={isOrganization ? '#666' : 'white'}
                        size="sm"
                        onClick={() => {
                          setIsOrganization(false)
                          setFieldErrors({})
                        }}
                        borderRadius="10px"
                        fontWeight="600"
                        fontSize="14px"
                        height="40px"
                        transition="all 0.3s"
                        _hover={{
                          bg: isOrganization ? '#F5F5F5' : '#25704d',
                        }}
                      >
                        Individual
                      </Button>
                      <Button
                        flex={1}
                        variant={isOrganization ? 'solid' : 'ghost'}
                        bg={isOrganization ? '#2D876D' : 'transparent'}
                        color={isOrganization ? 'white' : '#666'}
                        size="sm"
                        onClick={() => {
                          setIsOrganization(true)
                          setFieldErrors({})
                        }}
                        borderRadius="10px"
                        fontWeight="600"
                        fontSize="14px"
                        height="40px"
                        transition="all 0.3s"
                        _hover={{
                          bg: isOrganization ? '#25704d' : '#F5F5F5',
                        }}
                      >
                        Organization
                      </Button>
                    </HStack>
                  </FormControl>

                  {/* INDIVIDUAL ACCOUNT FIELDS */}
                  {!isOrganization && (
                    <>
                      {/* Name Fields */}
                      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} w="full">
                        <FormControl isRequired isInvalid={!!fieldErrors.firstName}>
                          <FormLabel fontSize="13px" fontWeight="600" color="#333" mb="8px">First Name</FormLabel>
                          <Input
                            type="text"
                            value={firstName}
                            onChange={(e) => {
                              setFirstName(e.target.value)
                              if (fieldErrors.firstName) setFieldErrors({ ...fieldErrors, firstName: '' })
                            }}
                            placeholder="John"
                            size="lg"
                            bg="#F5F5F5"
                            borderColor={fieldErrors.firstName ? '#ef5350' : '#E0E0E0'}
                            borderWidth="1px"
                            height="44px"
                            fontSize="14px"
                            _focus={{
                              borderColor: fieldErrors.firstName ? '#ef5350' : '#2D876D',
                              boxShadow: fieldErrors.firstName ? '0 0 0 3px rgba(239, 83, 80, 0.1)' : '0 0 0 3px rgba(45, 135, 109, 0.1)',
                              bg: 'white',
                            }}
                            _hover={{
                              borderColor: '#E8E8E8',
                            }}
                            transition="all 0.2s"
                          />
                          {fieldErrors.firstName && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.firstName}</FormErrorMessage>}
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="13px" fontWeight="600" color="#666" mb="8px">M.I.</FormLabel>
                          <Input
                            type="text"
                            value={middleInitial}
                            onChange={(e) => setMiddleInitial(e.target.value)}
                            placeholder="M"
                            size="lg"
                            maxLength={1}
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
                            _hover={{
                              borderColor: '#E8E8E8',
                            }}
                            transition="all 0.2s"
                          />
                        </FormControl>

                        <FormControl isRequired isInvalid={!!fieldErrors.lastName}>
                          <FormLabel fontSize="13px" fontWeight="600" color="#333" mb="8px">Last Name</FormLabel>
                          <Input
                            type="text"
                            value={lastName}
                            onChange={(e) => {
                              setLastName(e.target.value)
                              if (fieldErrors.lastName) setFieldErrors({ ...fieldErrors, lastName: '' })
                            }}
                            placeholder="Doe"
                            size="lg"
                            bg="#F5F5F5"
                            borderColor={fieldErrors.lastName ? '#ef5350' : '#E0E0E0'}
                            borderWidth="1px"
                            height="44px"
                            fontSize="14px"
                            _focus={{
                              borderColor: fieldErrors.lastName ? '#ef5350' : '#2D876D',
                              boxShadow: fieldErrors.lastName ? '0 0 0 3px rgba(239, 83, 80, 0.1)' : '0 0 0 3px rgba(45, 135, 109, 0.1)',
                              bg: 'white',
                            }}
                            _hover={{
                              borderColor: '#E8E8E8',
                            }}
                            transition="all 0.2s"
                          />
                          {fieldErrors.lastName && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.lastName}</FormErrorMessage>}
                        </FormControl>
                      </SimpleGrid>

                      {/* Phone Number - Max 11 digits */}
                      <FormControl isInvalid={!!fieldErrors.phone}>
                        <FormLabel fontSize="13px" fontWeight="600" color="#666" mb="8px">
                          Phone Number
                          <Text as="span" fontSize="11px" color="gray.500" ml={2} fontWeight="400">
                            ({phoneNumber.length}/11 digits)
                          </Text>
                        </FormLabel>
                        <Input
                          type="tel"
                          inputMode="numeric"
                          value={phoneNumber}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 11)
                            setPhoneNumber(value)
                            if (fieldErrors.phone) setFieldErrors({ ...fieldErrors, phone: '' })
                          }}
                          placeholder="09XX-XXX-XXXX (11 digits)"
                          maxLength={11}
                          size="lg"
                          bg={fieldErrors.phone ? '#FFF5F5' : '#F5F5F5'}
                          borderColor={fieldErrors.phone ? '#ef5350' : '#E0E0E0'}
                          borderWidth="1px"
                          height="44px"
                          fontSize="14px"
                          _focus={{
                            borderColor: fieldErrors.phone ? '#ef5350' : '#2D876D',
                            boxShadow: fieldErrors.phone ? '0 0 0 3px rgba(239, 83, 80, 0.1)' : '0 0 0 3px rgba(45, 135, 109, 0.1)',
                            bg: 'white',
                          }}
                          _hover={{
                            borderColor: '#E8E8E8',
                          }}
                          transition="all 0.2s"
                        />
                        {fieldErrors.phone && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.phone}</FormErrorMessage>}
                      </FormControl>

                      {/* Email for Individual */}
                      <FormControl isRequired isInvalid={!!fieldErrors.email}>
                        <FormLabel fontSize="13px" fontWeight="600" color="#333" mb="8px">Email</FormLabel>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value)
                            if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: '' })
                          }}
                          placeholder="your.email@example.com"
                          size="lg"
                          bg="#F5F5F5"
                          borderColor={fieldErrors.email ? '#ef5350' : '#E0E0E0'}
                          borderWidth="1px"
                          height="44px"
                          fontSize="14px"
                          _focus={{
                            borderColor: fieldErrors.email ? '#ef5350' : '#2D876D',
                            boxShadow: fieldErrors.email ? '0 0 0 3px rgba(239, 83, 80, 0.1)' : '0 0 0 3px rgba(45, 135, 109, 0.1)',
                            bg: 'white',
                          }}
                          _hover={{
                            borderColor: '#E8E8E8',
                          }}
                          transition="all 0.2s"
                        />
                        {fieldErrors.email && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.email}</FormErrorMessage>}
                        {!fieldErrors.email && email.toLowerCase().endsWith('@wmsu.edu.ph') && (
                          <FormHelperText fontSize="xs" color="green.600" mt={1}>
                            ✓ WMSU student detected - you'll get free Premium access!
                          </FormHelperText>
                        )}
                        {!fieldErrors.email && !email.toLowerCase().endsWith('@wmsu.edu.ph') && email && (
                          <FormHelperText fontSize="xs" color="gray.500" mt={1}>
                            💡 Tip: WMSU students (@wmsu.edu.ph) get free Premium access
                          </FormHelperText>
                        )}
                      </FormControl>

                      {/* WMSU Department for students */}
                      {email.toLowerCase().endsWith('@wmsu.edu.ph') && (
                        <FormControl isRequired isInvalid={!!fieldErrors.department}>
                          <FormLabel fontSize="13px" fontWeight="600" color="#333" mb="8px">Department / College</FormLabel>
                          <Input
                            value={department}
                            onChange={(e) => {
                              setDepartment(e.target.value)
                              if (fieldErrors.department) setFieldErrors({ ...fieldErrors, department: '' })
                            }}
                            placeholder="e.g., CCS, COE, CTE"
                            size="lg"
                            bg="#F5F5F5"
                            borderColor={fieldErrors.department ? '#ef5350' : '#E0E0E0'}
                            borderWidth="1px"
                            height="44px"
                            fontSize="14px"
                            _focus={{
                              borderColor: fieldErrors.department ? '#ef5350' : '#2D876D',
                              boxShadow: fieldErrors.department ? '0 0 0 3px rgba(239, 83, 80, 0.1)' : '0 0 0 3px rgba(45, 135, 109, 0.1)',
                              bg: 'white',
                            }}
                            _hover={{
                              borderColor: '#E8E8E8',
                            }}
                            transition="all 0.2s"
                          />
                          {fieldErrors.department && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.department}</FormErrorMessage>}
                        </FormControl>
                      )}

                      {/* Bio */}
                      <FormControl>
                        <FormLabel fontSize="13px" fontWeight="600" color="#666" mb="8px">Short Bio (Optional)</FormLabel>
                        <Input
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Tell us about yourself"
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
                          _hover={{
                            borderColor: '#E8E8E8',
                          }}
                          transition="all 0.2s"
                        />
                      </FormControl>
                    </>
                  )}

                  {/* ORGANIZATION ACCOUNT FIELDS */}
                  {isOrganization && (
                    <>
                      {/* Organization Name */}
                      <FormControl isRequired isInvalid={!!fieldErrors.orgName}>
                        <FormLabel fontSize="13px" fontWeight="600" color="#333" mb="8px">Organization Name</FormLabel>
                        <Input
                          value={orgName}
                          onChange={(e) => {
                            setOrgName(e.target.value)
                            if (fieldErrors.orgName) setFieldErrors({ ...fieldErrors, orgName: '' })
                          }}
                          placeholder="e.g., CCS Student Council"
                          size="lg"
                          bg="#F5F5F5"
                          borderColor={fieldErrors.orgName ? '#ef5350' : '#E0E0E0'}
                          borderWidth="1px"
                          height="44px"
                          fontSize="14px"
                          _focus={{
                            borderColor: fieldErrors.orgName ? '#ef5350' : '#2D876D',
                            boxShadow: fieldErrors.orgName ? '0 0 0 3px rgba(239, 83, 80, 0.1)' : '0 0 0 3px rgba(45, 135, 109, 0.1)',
                            bg: 'white',
                          }}
                          _hover={{
                            borderColor: '#E8E8E8',
                          }}
                          transition="all 0.2s"
                        />
                        {fieldErrors.orgName && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.orgName}</FormErrorMessage>}
                      </FormControl>

                      {/* Organization Logo URL */}
                      <FormControl>
                        <FormLabel fontSize="13px" fontWeight="600" color="#666" mb="8px">Logo URL (Optional)</FormLabel>
                        <Input
                          value={orgLogoUrl}
                          onChange={(e) => setOrgLogoUrl(e.target.value)}
                          placeholder="https://..."
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
                          _hover={{
                            borderColor: '#E8E8E8',
                          }}
                          transition="all 0.2s"
                        />
                      </FormControl>

                      {/* Organization Email */}
                      <FormControl isRequired isInvalid={!!fieldErrors.email}>
                        <FormLabel fontSize="13px" fontWeight="600" color="#333" mb="8px">Email</FormLabel>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value)
                            if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: '' })
                          }}
                          placeholder="contact@organization.com"
                          size="lg"
                          bg="#F5F5F5"
                          borderColor={fieldErrors.email ? '#ef5350' : '#E0E0E0'}
                          borderWidth="1px"
                          height="44px"
                          fontSize="14px"
                          _focus={{
                            borderColor: fieldErrors.email ? '#ef5350' : '#2D876D',
                            boxShadow: fieldErrors.email ? '0 0 0 3px rgba(239, 83, 80, 0.1)' : '0 0 0 3px rgba(45, 135, 109, 0.1)',
                            bg: 'white',
                          }}
                          _hover={{
                            borderColor: '#E8E8E8',
                          }}
                          transition="all 0.2s"
                        />
                        {fieldErrors.email && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.email}</FormErrorMessage>}
                      </FormControl>

                      {/* Organization Bio/Description */}
                      <FormControl>
                        <FormLabel fontSize="13px" fontWeight="600" color="#666" mb="8px">About (Optional)</FormLabel>
                        <Input
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Describe your organization"
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
                          _hover={{
                            borderColor: '#E8E8E8',
                          }}
                          transition="all 0.2s"
                        />
                      </FormControl>
                    </>
                  )}

                  {/* Password Field */}
                  <FormControl isRequired isInvalid={!!fieldErrors.password}>
                    <FormLabel fontSize="13px" fontWeight="600" color="#333" mb="8px">Password</FormLabel>
                    <InputGroup size="lg">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: '' })
                        }}
                        placeholder="Create a strong password"
                        bg="#F5F5F5"
                        borderColor={fieldErrors.password ? '#ef5350' : '#E0E0E0'}
                        borderWidth="1px"
                        height="44px"
                        fontSize="14px"
                        _focus={{
                          borderColor: fieldErrors.password ? '#ef5350' : '#2D876D',
                          boxShadow: fieldErrors.password ? '0 0 0 3px rgba(239, 83, 80, 0.1)' : '0 0 0 3px rgba(45, 135, 109, 0.1)',
                          bg: 'white',
                        }}
                        _hover={{
                          borderColor: '#E8E8E8',
                        }}
                        transition="all 0.2s"
                      />
                      <InputRightElement h="44px" pr={2}>
                        <IconButton
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPassword(!showPassword)}
                          color="#666"
                          _hover={{ color: '#2D876D', bg: 'transparent' }}
                        />
                      </InputRightElement>
                    </InputGroup>
                    {fieldErrors.password && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.password}</FormErrorMessage>}
                    {password && !fieldErrors.password && (
                      <Box mt={2} px={1}>
                        {[
                          { test: password.length >= 8, label: 'At least 8 characters' },
                          { test: /[A-Z]/.test(password), label: 'One uppercase letter' },
                          { test: /[a-z]/.test(password), label: 'One lowercase letter' },
                          { test: /[0-9]/.test(password), label: 'One number' },
                          { test: /[!@#$%^&*(),.?":{}|<>]/.test(password), label: 'One special character' },
                        ].map((rule) => (
                          <Text key={rule.label} fontSize="xs" color={rule.test ? 'green.500' : 'gray.400'} lineHeight="1.8">
                            {rule.test ? '\u2713' : '\u2022'} {rule.label}
                          </Text>
                        ))}
                      </Box>
                    )}
                  </FormControl>

                  {/* Confirm Password Field */}
                  <FormControl isRequired isInvalid={!!fieldErrors.confirmPassword}>
                    <FormLabel fontSize="13px" fontWeight="600" color="#333" mb="8px">Confirm Password</FormLabel>
                    <InputGroup size="lg">
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value)
                          if (fieldErrors.confirmPassword) setFieldErrors({ ...fieldErrors, confirmPassword: '' })
                        }}
                        placeholder="Re-enter your password"
                        bg="#F5F5F5"
                        borderColor={fieldErrors.confirmPassword ? '#ef5350' : '#E0E0E0'}
                        borderWidth="1px"
                        height="44px"
                        fontSize="14px"
                        _focus={{
                          borderColor: fieldErrors.confirmPassword ? '#ef5350' : '#2D876D',
                          boxShadow: fieldErrors.confirmPassword ? '0 0 0 3px rgba(239, 83, 80, 0.1)' : '0 0 0 3px rgba(45, 135, 109, 0.1)',
                          bg: 'white',
                        }}
                        _hover={{
                          borderColor: '#E8E8E8',
                        }}
                        transition="all 0.2s"
                      />
                      <InputRightElement h="44px" pr={2}>
                        <IconButton
                          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                          icon={showConfirmPassword ? <ViewOffIcon /> : <ViewIcon />}
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          color="#666"
                          _hover={{ color: '#2D876D', bg: 'transparent' }}
                        />
                      </InputRightElement>
                    </InputGroup>
                    {fieldErrors.confirmPassword && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.confirmPassword}</FormErrorMessage>}
                  </FormControl>

                  {/* Create Account Button */}
                  <Button
                    type="submit"
                    bg="#2D876D"
                    color="white"
                    size="lg"
                    w="full"
                    isLoading={loading}
                    loadingText="Creating account..."
                    mt={4}
                    mb={2}
                    fontWeight="600"
                    fontSize="16px"
                    height="48px"
                    borderRadius="12px"
                    transition="all 0.3s ease"
                    _hover={{
                      bg: '#25704d',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 8px 16px rgba(45, 135, 109, 0.3)',
                    }}
                    _active={{
                      transform: 'translateY(0)',
                    }}
                    isDisabled={loading}
                  >
                    Create Account
                  </Button>

                  {/* Sign In Link */}
                  <Box textAlign="center" w="full" pt={2}>
                    <Text fontSize="14px" color="#666">
                      Already have an account?{' '}
                      <Link
                        as={RouterLink}
                        to="/login"
                        color="#2D876D"
                        fontWeight="600"
                        _hover={{ textDecoration: 'underline', color: '#1f5c47' }}
                      >
                        Sign in
                      </Link>
                    </Text>
                  </Box>
                </VStack>
              </form>
            </Box>
          </VStack>
        </Container>
      </Box>
    </Box>
  )
}

export default Register
