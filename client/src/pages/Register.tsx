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
    
    if (!isOrganization) {
      if (!firstName) errors.firstName = 'First name is required'
      if (!lastName) errors.lastName = 'Last name is required'
      if (!email) errors.email = 'Email is required'
      if (email && !email.toLowerCase().endsWith('@wmsu.edu.ph')) {
        errors.email = 'WMSU students must use @wmsu.edu.ph email'
      }
      if (email.toLowerCase().endsWith('@wmsu.edu.ph') && !department) {
        errors.department = 'Department/College is required for WMSU students'
      }
    } else {
      if (!orgName) errors.orgName = 'Organization name is required'
      if (!email) errors.email = 'Email is required'
    }
    
    if (!password) errors.password = 'Password is required'
    if (password && password.length < 6) errors.password = 'Password must be at least 6 characters'
    if (!confirmPassword) errors.confirmPassword = 'Confirm password is required'
    if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match'
    
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
      await register({
        name: fullName,
        email,
        password,
        is_organization: isOrganization,
        org_name: isOrganization ? orgName : undefined,
        org_logo_url: isOrganization ? orgLogoUrl : undefined,
        department: !isOrganization ? department : undefined,
        bio: bio || undefined,
        // profile_picture NOT included - will be added via Settings page
      })
      
      toast({
        title: 'Registration successful!',
        description: 'Welcome to Clovia',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
      
      navigate('/dashboard')
    } catch (error: any) {
      setError(error.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box bg="#FFFDF1" w="100%" minH="100vh" display="flex" flexDirection="column">
      {/* Mobile: Scrollable container */}
      <Box 
        flex={1}
        overflowY="auto"
        py={{ base: 12, md: 8 }}
        px={{ base: 4, md: 8 }}
        position="relative"
      >
        <Container maxW="container.sm" position="relative" p={0}>
          {/* Back Button - Mobile Only */}
          <IconButton
            aria-label="Go back"
            icon={<ArrowBackIcon />}
            position="absolute"
            top={{ base: -8, md: 0 }}
            left={{ base: -4, md: 'auto' }}
            display={{ base: 'flex', md: 'none' }}
            variant="ghost"
            onClick={() => navigate(-1)}
            size="md"
            zIndex={10}
          />
          
          <VStack spacing={8} align="stretch">
            <Box textAlign="center" mt={{ base: 6, md: 0 }}>
              <Heading 
                size="lg" 
                color="brand.500" 
                mb={2}
                fontSize={{ base: '24px', md: '28px' }}
              >
                Join Clovia
              </Heading>
              <Text 
                color="gray.600"
                fontSize={{ base: 'sm', md: 'md' }}
              >
                Create your account to start buying and selling
              </Text>
            </Box>

            <Box w="full">
              <form onSubmit={handleSubmit}>
                <VStack spacing={5}>
                  {error && (
                    <Alert status="error" borderRadius="lg" bg="red.50" borderLeft="4px solid" borderColor="red.500">
                      <AlertIcon color="red.500" />
                      <Box ml={2}>
                        <Text fontWeight="600" color="red.700">{error}</Text>
                      </Box>
                    </Alert>
                  )}

                  {/* Account Type Selector - Segmented Control */}
                  <FormControl>
                    <FormLabel fontSize="sm" fontWeight="600" mb={3} color="gray.700">Account Type</FormLabel>
                    <HStack 
                      spacing={0}
                      bg="gray.100"
                      borderRadius="lg"
                      p={1}
                      w="full"
                      transition="all 0.2s"
                    >
                      <Button
                        flex={1}
                        variant={isOrganization ? 'ghost' : 'solid'}
                        colorScheme={isOrganization ? 'gray' : 'brand'}
                        size="sm"
                        onClick={() => {
                          setIsOrganization(false)
                          setFieldErrors({})
                        }}
                        borderRadius="md"
                        fontWeight="600"
                        transition="all 0.3s"
                        _hover={{ transform: 'translateY(-1px)' }}
                      >
                        Individual
                      </Button>
                      <Button
                        flex={1}
                        variant={isOrganization ? 'solid' : 'ghost'}
                        colorScheme={isOrganization ? 'brand' : 'gray'}
                        size="sm"
                        onClick={() => {
                          setIsOrganization(true)
                          setFieldErrors({})
                        }}
                        borderRadius="md"
                        fontWeight="600"
                        transition="all 0.3s"
                        _hover={{ transform: 'translateY(-1px)' }}
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
                          <FormLabel fontSize="sm" fontWeight="600" color="gray.700">First Name</FormLabel>
                          <Input
                            type="text"
                            value={firstName}
                            onChange={(e) => {
                              setFirstName(e.target.value)
                              if (fieldErrors.firstName) setFieldErrors({...fieldErrors, firstName: ''})
                            }}
                            placeholder="John"
                            size="lg"
                            bg="white"
                            borderColor={fieldErrors.firstName ? 'red.300' : 'gray.200'}
                            _focus={{
                              borderColor: fieldErrors.firstName ? 'red.500' : 'brand.400',
                              boxShadow: fieldErrors.firstName ? '0 0 0 1px var(--chakra-colors-red-500)' : '0 0 0 1px var(--chakra-colors-brand-400)',
                            }}
                            transition="all 0.2s"
                          />
                          {fieldErrors.firstName && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.firstName}</FormErrorMessage>}
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="sm" fontWeight="medium">Middle Initial</FormLabel>
                          <Input
                            type="text"
                            value={middleInitial}
                            onChange={(e) => setMiddleInitial(e.target.value)}
                            placeholder="M.I."
                            size="lg"
                            maxLength={1}
                            bg="white"
                            borderColor="gray.200"
                            _focus={{
                              borderColor: 'brand.400',
                              boxShadow: '0 0 0 1px var(--chakra-colors-brand-400)',
                            }}
                          />
                        </FormControl>

                        <FormControl isRequired isInvalid={!!fieldErrors.lastName}>
                          <FormLabel fontSize="sm" fontWeight="600" color="gray.700">Last Name</FormLabel>
                          <Input
                            type="text"
                            value={lastName}
                            onChange={(e) => {
                              setLastName(e.target.value)
                              if (fieldErrors.lastName) setFieldErrors({...fieldErrors, lastName: ''})
                            }}
                            placeholder="Doe"
                            size="lg"
                            bg="white"
                            borderColor={fieldErrors.lastName ? 'red.300' : 'gray.200'}
                            _focus={{
                              borderColor: fieldErrors.lastName ? 'red.500' : 'brand.400',
                              boxShadow: fieldErrors.lastName ? '0 0 0 1px var(--chakra-colors-red-500)' : '0 0 0 1px var(--chakra-colors-brand-400)',
                            }}
                            transition="all 0.2s"
                          />
                          {fieldErrors.lastName && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.lastName}</FormErrorMessage>}
                        </FormControl>
                      </SimpleGrid>

                      {/* Phone Number */}
                      <FormControl>
                        <FormLabel fontSize="sm" fontWeight="medium">Phone Number</FormLabel>
                        <Input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="Enter your phone number"
                          size="lg"
                          bg="white"
                          borderColor="gray.200"
                          _focus={{
                            borderColor: 'brand.400',
                            boxShadow: '0 0 0 1px var(--chakra-colors-brand-400)',
                          }}
                        />
                      </FormControl>

                      {/* Email for Individual */}
                      <FormControl isRequired isInvalid={!!fieldErrors.email}>
                        <FormLabel fontSize="sm" fontWeight="600" color="gray.700">Email</FormLabel>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value)
                            if (fieldErrors.email) setFieldErrors({...fieldErrors, email: ''})
                          }}
                          placeholder="name@wmsu.edu.ph"
                          size="lg"
                          bg="white"
                          borderColor={fieldErrors.email ? 'red.300' : 'gray.200'}
                          _focus={{
                            borderColor: fieldErrors.email ? 'red.500' : 'brand.400',
                            boxShadow: fieldErrors.email ? '0 0 0 1px var(--chakra-colors-red-500)' : '0 0 0 1px var(--chakra-colors-brand-400)',
                          }}
                          transition="all 0.2s"
                        />
                        {fieldErrors.email && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.email}</FormErrorMessage>}
                      </FormControl>

                      {/* WMSU Department for students */}
                      {email.toLowerCase().endsWith('@wmsu.edu.ph') && (
                        <FormControl isRequired isInvalid={!!fieldErrors.department}>
                          <FormLabel fontSize="sm" fontWeight="600" color="gray.700">Department / College</FormLabel>
                          <Input 
                            value={department} 
                            onChange={(e) => {
                              setDepartment(e.target.value)
                              if (fieldErrors.department) setFieldErrors({...fieldErrors, department: ''})
                            }} 
                            placeholder="e.g., CCS, COE, CTE" 
                            size="lg"
                            bg="white"
                            borderColor={fieldErrors.department ? 'red.300' : 'gray.200'}
                            _focus={{
                              borderColor: fieldErrors.department ? 'red.500' : 'brand.400',
                              boxShadow: fieldErrors.department ? '0 0 0 1px var(--chakra-colors-red-500)' : '0 0 0 1px var(--chakra-colors-brand-400)',
                            }}
                            transition="all 0.2s"
                          />
                          {fieldErrors.department && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.department}</FormErrorMessage>}
                        </FormControl>
                      )}

                      {/* Bio */}
                      <FormControl>
                        <FormLabel fontSize="sm" fontWeight="medium">Short Bio</FormLabel>
                        <Input 
                          value={bio} 
                          onChange={(e) => setBio(e.target.value)} 
                          placeholder="Tell us about yourself" 
                          size="lg"
                          bg="white"
                          borderColor="gray.200"
                          _focus={{
                            borderColor: 'brand.400',
                            boxShadow: '0 0 0 1px var(--chakra-colors-brand-400)',
                          }}
                        />
                      </FormControl>
                    </>
                  )}

                  {/* ORGANIZATION ACCOUNT FIELDS */}
                  {isOrganization && (
                    <>
                      {/* Organization Name */}
                      <FormControl isRequired isInvalid={!!fieldErrors.orgName}>
                        <FormLabel fontSize="sm" fontWeight="600" color="gray.700">Organization Name</FormLabel>
                        <Input 
                          value={orgName} 
                          onChange={(e) => {
                            setOrgName(e.target.value)
                            if (fieldErrors.orgName) setFieldErrors({...fieldErrors, orgName: ''})
                          }} 
                          placeholder="e.g., CCS Student Council" 
                          size="lg"
                          bg="white"
                          borderColor={fieldErrors.orgName ? 'red.300' : 'gray.200'}
                          _focus={{
                            borderColor: fieldErrors.orgName ? 'red.500' : 'brand.400',
                            boxShadow: fieldErrors.orgName ? '0 0 0 1px var(--chakra-colors-red-500)' : '0 0 0 1px var(--chakra-colors-brand-400)',
                          }}
                          transition="all 0.2s"
                        />
                        {fieldErrors.orgName && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.orgName}</FormErrorMessage>}
                      </FormControl>

                      {/* Organization Logo URL */}
                      <FormControl>
                        <FormLabel fontSize="sm" fontWeight="medium">Organization Logo URL</FormLabel>
                        <Input 
                          value={orgLogoUrl} 
                          onChange={(e) => setOrgLogoUrl(e.target.value)} 
                          placeholder="https://..." 
                          size="lg"
                          bg="white"
                          borderColor="gray.200"
                          _focus={{
                            borderColor: 'brand.400',
                            boxShadow: '0 0 0 1px var(--chakra-colors-brand-400)',
                          }}
                        />
                      </FormControl>

                      {/* Organization Email */}
                      <FormControl isRequired isInvalid={!!fieldErrors.email}>
                        <FormLabel fontSize="sm" fontWeight="600" color="gray.700">Email</FormLabel>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value)
                            if (fieldErrors.email) setFieldErrors({...fieldErrors, email: ''})
                          }}
                          placeholder="contact@organization.com"
                          size="lg"
                          bg="white"
                          borderColor={fieldErrors.email ? 'red.300' : 'gray.200'}
                          _focus={{
                            borderColor: fieldErrors.email ? 'red.500' : 'brand.400',
                            boxShadow: fieldErrors.email ? '0 0 0 1px var(--chakra-colors-red-500)' : '0 0 0 1px var(--chakra-colors-brand-400)',
                          }}
                          transition="all 0.2s"
                        />
                        {fieldErrors.email && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.email}</FormErrorMessage>}
                      </FormControl>

                      {/* Organization Bio/Description */}
                      <FormControl>
                        <FormLabel fontSize="sm" fontWeight="medium">About Organization</FormLabel>
                        <Input 
                          value={bio} 
                          onChange={(e) => setBio(e.target.value)} 
                          placeholder="Describe your organization" 
                          size="lg"
                          bg="white"
                          borderColor="gray.200"
                          _focus={{
                            borderColor: 'brand.400',
                            boxShadow: '0 0 0 1px var(--chakra-colors-brand-400)',
                          }}
                        />
                      </FormControl>
                    </>
                  )}

                <FormControl isRequired isInvalid={!!fieldErrors.password}>
                  <FormLabel fontSize="sm" fontWeight="600" color="gray.700">Password</FormLabel>
                  <InputGroup size="lg">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (fieldErrors.password) setFieldErrors({...fieldErrors, password: ''})
                      }}
                      placeholder="Minimum 6 characters"
                      bg="white"
                      borderColor={fieldErrors.password ? 'red.300' : 'gray.200'}
                      _focus={{
                        borderColor: fieldErrors.password ? 'red.500' : 'brand.400',
                        boxShadow: fieldErrors.password ? '0 0 0 1px var(--chakra-colors-red-500)' : '0 0 0 1px var(--chakra-colors-brand-400)',
                      }}
                      transition="all 0.2s"
                    />
                    <InputRightElement>
                      <IconButton
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                        variant="ghost"
                        onClick={() => setShowPassword(!showPassword)}
                        _hover={{ bg: 'gray.100' }}
                      />
                    </InputRightElement>
                  </InputGroup>
                  {fieldErrors.password && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.password}</FormErrorMessage>}
                </FormControl>

                <FormControl isRequired isInvalid={!!fieldErrors.confirmPassword}>
                  <FormLabel fontSize="sm" fontWeight="600" color="gray.700">Confirm Password</FormLabel>
                  <InputGroup size="lg">
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        if (fieldErrors.confirmPassword) setFieldErrors({...fieldErrors, confirmPassword: ''})
                      }}
                      placeholder="Re-enter your password"
                      bg="white"
                      borderColor={fieldErrors.confirmPassword ? 'red.300' : 'gray.200'}
                      _focus={{
                        borderColor: fieldErrors.confirmPassword ? 'red.500' : 'brand.400',
                        boxShadow: fieldErrors.confirmPassword ? '0 0 0 1px var(--chakra-colors-red-500)' : '0 0 0 1px var(--chakra-colors-brand-400)',
                      }}
                      transition="all 0.2s"
                    />
                    <InputRightElement>
                      <IconButton
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        icon={showConfirmPassword ? <ViewOffIcon /> : <ViewIcon />}
                        variant="ghost"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        _hover={{ bg: 'gray.100' }}
                      />
                    </InputRightElement>
                  </InputGroup>
                  {fieldErrors.confirmPassword && <FormErrorMessage fontSize="xs" mt={1}>{fieldErrors.confirmPassword}</FormErrorMessage>}
                </FormControl>

                <Button
                  type="submit"
                  colorScheme="brand"
                  size="lg"
                  w="full"
                  isLoading={loading}
                  loadingText="Creating account..."
                  mt={6}
                  mb={4}
                  fontWeight="600"
                  transition="all 0.3s"
                  _hover={{
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 12px rgba(0, 0, 0, 0.15)',
                  }}
                  _active={{
                    transform: 'translateY(0)',
                  }}
                  isDisabled={loading}
                >
                  Create Account
                </Button>

                <Text textAlign="center" fontSize="sm" color="gray.600">
                  Already have an account?{' '}
                  <Link as={RouterLink} to="/login" color="brand.500" fontWeight="600" _hover={{ textDecoration: 'underline' }}>
                    Sign in here
                  </Link>
                </Text>
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
