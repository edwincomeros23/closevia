import React, { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box,
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
  Image,
  Flex,
  Center,
  Divider,
} from '@chakra-ui/react'
import { ViewIcon, ViewOffIcon, ArrowBackIcon } from '@chakra-ui/icons'
import { FaGoogle } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'

const Login: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const { login } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }

    try {
      setLoading(true)
      setError('')
      await login(email, password)
      
      toast({
        title: 'Login successful!',
        description: 'Welcome back to Clovia',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
      
      navigate('/dashboard')
    } catch (error: any) {
      setError(error.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    // TODO: Connect to actual Google OAuth handler
    console.log('Google login clicked')
    toast({
      title: 'Google Login',
      description: 'Google authentication will be connected soon',
      status: 'info',
      duration: 2000,
      isClosable: true,
    })
  }
    
  return (
    <Box 
      bg="#FFFDF1" 
      w="100%" 
      h="100vh" 
      display="flex"
      flexDirection={{ base: 'column', md: 'row' }}
      overflow="hidden"
    >
      {/* Image on the left - full height (desktop only) */}
      <Box
        flex={{ base: '0', md: '1.2' }}
        display={{ base: 'none', md: 'flex' }}
        alignItems="center"
        justifyContent="center"
        h="100%"
        overflow="hidden"
      >
        <Image
          src="/barter.jpg"
          alt="Barter"
          objectFit="cover"
          objectPosition="center"
          w="100%"
          h="100%"
          draggable={false}
          borderTopRightRadius="3xl"
          borderBottomRightRadius="3xl"
        />
      </Box>
 
      {/* Form on the right - centered vertically */}
      <Flex
        flex={{ base: '1', md: '0.8' }}
        alignItems="center"
        justifyContent="center"
        px={{ base: 4, md: 8 }}
        py={{ base: 0, md: 8 }}
        bg="#FFFDF1"
        position="relative"
        h="100%"
        w="100%"
      >
        {/* Back Button - Mobile Only */}
        <IconButton
          aria-label="Go back"
          icon={<ArrowBackIcon />}
          position="absolute"
          top={4}
          left={4}
          display={{ base: 'flex', md: 'none' }}
          variant="ghost"
          onClick={() => navigate(-1)}
          size="md"
          zIndex={10}
        />
        
        {/* Login Form Container */}
        <Box
          w="full"
          maxW={{ base: '100%', md: '420px' }}
          px={{ base: 0, md: 0 }}
        >
          {/* Header */}
          <Box textAlign="center" mb={8}>
            <Heading 
              size="lg" 
              color="brand.500" 
              mb={2}
              fontSize={{ base: '24px', md: '28px' }}
            >
              Welcome Back
            </Heading>
            <Text 
              color="gray.600"
              fontSize={{ base: 'sm', md: 'md' }}
            >
              Sign in to your Clovia account
            </Text>
          </Box>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <VStack spacing={5} w="full">
              {/* Error Alert */}
              {error && (
                <Alert status="error" borderRadius="md">
                  <AlertIcon />
                  {error}
                </Alert>
              )}

              {/* Email Field */}
              <FormControl isRequired>
                <FormLabel fontSize={{ base: 'sm', md: 'md' }}>Email</FormLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  size={{ base: 'md', md: 'lg' }}
                  bg="white"
                  borderColor="gray.200"
                  _focus={{
                    borderColor: 'brand.400',
                    boxShadow: '0 0 0 1px var(--chakra-colors-brand-400)',
                  }}
                />
              </FormControl>

              {/* Password Field */}
              <FormControl isRequired>
                <FormLabel fontSize={{ base: 'sm', md: 'md' }}>Password</FormLabel>
                <InputGroup size={{ base: 'md', md: 'lg' }}>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    bg="white"
                    borderColor="gray.200"
                    _focus={{
                      borderColor: 'brand.400',
                      boxShadow: '0 0 0 1px var(--chakra-colors-brand-400)',
                    }}
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                      variant="ghost"
                      size="sm"
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>

              {/* Sign In Button */}
              <Button
                type="submit"
                colorScheme="brand"
                size={{ base: 'md', md: 'lg' }}
                w="full"
                isLoading={loading}
                loadingText="Signing in..."
                fontSize={{ base: 'sm', md: 'md' }}
              >
                Sign In
              </Button>

              {/* Divider */}
              <HStack w="full" spacing={4}>
                <Divider />
                <Text fontSize="xs" color="gray.500" whiteSpace="nowrap">
                  Or continue with
                </Text>
                <Divider />
              </HStack>

              {/* Google Login Button */}
              <Button
                w="full"
                variant="outline"
                borderColor="gray.300"
                leftIcon={<FaGoogle />}
                onClick={handleGoogleLogin}
                size={{ base: 'md', md: 'lg' }}
                fontSize={{ base: 'sm', md: 'md' }}
                _hover={{
                  bg: 'gray.50',
                  borderColor: 'gray.400',
                }}
                _active={{
                  bg: 'gray.100',
                }}
              >
                Google
              </Button>

              {/* Sign Up Link */}
              <Text 
                textAlign="center"
                fontSize={{ base: 'xs', md: 'sm' }}
              >
                Don't have an account?{' '}
                <Link 
                  as={RouterLink} 
                  to="/register" 
                  color="brand.500"
                  fontWeight="semibold"
                  _hover={{ textDecoration: 'underline' }}
                >
                  Sign up here
                </Link>
              </Text>
            </VStack>
          </form>
        </Box>
      </Flex>
    </Box>
  )
}

export default Login
