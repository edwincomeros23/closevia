import React, { useState } from 'react'
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom'
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
  Container,
  IconButton,
  InputGroup,
  InputRightElement,
} from '@chakra-ui/react'
import { ArrowBackIcon, ViewIcon, ViewOffIcon } from '@chakra-ui/icons'
import { api } from '../services/api'

const ResetPassword: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()

  const [email, setEmail] = useState(location.state?.email || '')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (code.length !== 6) {
      setError('Please enter a valid 6-digit code')
      return
    }

    try {
      setLoading(true)
      setError('')
      
      const { data } = await api.post('/api/auth/reset-password', {
        email,
        code,
        newPassword
      })
      
      if (data.success) {
        toast({
          title: 'Success!',
          description: 'Your password has been reset. You can now login.',
          status: 'success',
          duration: 5000,
          isClosable: true,
        })
        navigate('/login')
      } else {
        setError(data.error || 'Failed to reset password')
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
          onClick={() => navigate('/forgot-password')}
        />
        
        <VStack spacing={8} w="full">
          <Box textAlign="center">
            <Heading size="xl" color="#2D876D" mb={3}>Reset Password</Heading>
            <Text color="#555">Enter the code sent to your email and your new password.</Text>
          </Box>

          <Box w="full" bg="white" p={8} borderRadius="2xl" boxShadow="0 4px 20px rgba(0,0,0,0.08)" border="1px solid" borderColor="gray.100">
            <form onSubmit={handleSubmit}>
              <VStack spacing={5}>
                {error && (
                  <Alert status="error" borderRadius="xl">
                    <AlertIcon />
                    {error}
                  </Alert>
                )}

                <FormControl isRequired>
                  <FormLabel fontWeight="600">Email Address</FormLabel>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    bg="#F5F5F5"
                    _focus={{ borderColor: '#2D876D', bg: 'white' }}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel fontWeight="600">6-Digit Reset Code</FormLabel>
                  <Input
                    type="text"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    textAlign="center"
                    fontSize="2xl"
                    letterSpacing="8px"
                    fontWeight="bold"
                    bg="#F5F5F5"
                    _focus={{ borderColor: '#2D876D', bg: 'white' }}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel fontWeight="600">New Password</FormLabel>
                  <InputGroup>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      bg="#F5F5F5"
                      _focus={{ borderColor: '#2D876D', bg: 'white' }}
                    />
                    <InputRightElement>
                      <IconButton
                        aria-label={showPassword ? 'Hide' : 'Show'}
                        icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                        variant="ghost"
                        onClick={() => setShowPassword(!showPassword)}
                      />
                    </InputRightElement>
                  </InputGroup>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel fontWeight="600">Confirm New Password</FormLabel>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
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
                  Reset Password
                </Button>
              </VStack>
            </form>
          </Box>
        </VStack>
      </Container>
    </Box>
  )
}

export default ResetPassword
