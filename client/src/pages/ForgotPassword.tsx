import React, { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box,
  VStack,
  Heading,
  FormControl,
  FormLabel,
  Input,
  Button,
  Text,
  Link,
  Alert,
  AlertIcon,
  useToast,
  Flex,
  Container,
  IconButton,
} from '@chakra-ui/react'
import { ArrowBackIcon } from '@chakra-ui/icons'
import { api } from '../services/api'

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  
  const navigate = useNavigate()
  const toast = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      setError('Please enter your email address')
      return
    }

    try {
      setLoading(true)
      setError('')
      
      const { data } = await api.post('/api/auth/forgot-password', { email })
      
      if (data.success) {
        setSuccess(true)
        toast({
          title: 'OTP Sent',
          description: 'A password reset code has been sent to your email.',
          status: 'success',
          duration: 5000,
          isClosable: true,
        })
        
        // Redirect to reset password page after a short delay
        setTimeout(() => {
          navigate('/reset-password', { state: { email } })
        }, 2000)
      } else {
        setError(data.error || 'Failed to send reset code')
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box bg="#FFFDF1" w="100%" minH="100vh" display="flex" alignItems="center" justifyContent="center">
      <Container maxW="container.sm">
        <IconButton
          aria-label="Go back"
          icon={<ArrowBackIcon />}
          position="absolute"
          top={8}
          left={8}
          variant="ghost"
          colorScheme="teal"
          onClick={() => navigate('/login')}
        />
        
        <VStack spacing={8} w="full">
          <Box textAlign="center">
            <Heading size="xl" color="#2D876D" mb={3}>Forgot Password?</Heading>
            <Text color="#555">Enter your email and we'll send you a 6-digit code to reset your password.</Text>
          </Box>

          <Box w="full" bg="white" p={8} borderRadius="2xl" boxShadow="0 4px 20px rgba(0,0,0,0.08)" border="1px solid" borderColor="gray.100">
            <form onSubmit={handleSubmit}>
              <VStack spacing={6}>
                {error && (
                  <Alert status="error" borderRadius="xl">
                    <AlertIcon />
                    {error}
                  </Alert>
                )}
                
                {success && (
                  <Alert status="success" borderRadius="xl">
                    <AlertIcon />
                    Check your email for the reset code!
                  </Alert>
                )}

                <FormControl isRequired>
                  <FormLabel fontWeight="600">Email Address</FormLabel>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    size="lg"
                    bg="#F5F5F5"
                    _focus={{ borderColor: '#2D876D', bg: 'white' }}
                  />
                </FormControl>

                <Button
                  type="submit"
                  bg="#2D876D"
                  color="white"
                  size="lg"
                  w="full"
                  isLoading={loading}
                  _hover={{ bg: '#25704d' }}
                >
                  Send Reset Code
                </Button>

                <Link as={RouterLink} to="/login" color="#2D876D" fontWeight="600">
                  Back to Login
                </Link>
              </VStack>
            </form>
          </Box>
        </VStack>
      </Container>
    </Box>
  )
}

export default ForgotPassword
