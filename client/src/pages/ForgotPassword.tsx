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
  PinInput,
  PinInputField,
  Container,
} from '@chakra-ui/react'
import { ViewIcon, ViewOffIcon, ArrowBackIcon } from '@chakra-ui/icons'
import { api } from '../services/api'

const ForgotPassword: React.FC = () => {
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const navigate = useNavigate()
  const toast = useToast()

  // Cooldown timer
  React.useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email) {
      setError('Please enter your email address')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email })
      setStep(2)
      setCooldown(60)
      toast({
        title: 'Code Sent',
        description: 'If an account with that email exists, a reset code has been sent.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to send reset code'
      if (err.response?.status === 429) {
        setCooldown(60)
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleResendCode = async () => {
    if (cooldown > 0) return
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email })
      setCooldown(60)
      toast({
        title: 'Code Resent',
        description: 'A new reset code has been sent to your email.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resend code')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!code || code.length < 6) {
      setError('Please enter the 6-digit code')
      return
    }
    if (!newPassword) {
      setError('Please enter a new password')
      return
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', {
        email,
        code,
        new_password: newPassword,
      })
      toast({
        title: 'Password Reset Successful',
        description: 'You can now log in with your new password.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })
      navigate('/login')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box minH="100vh" bg="#FFFDF1" display="flex" alignItems="center" justifyContent="center" px={4}>
      <Box
        w="full"
        maxW="440px"
        bg="white"
        borderRadius={{ base: '24px', md: '16px' }}
        p={{ base: 6, md: 8 }}
        boxShadow="0 4px 20px rgba(0, 0, 0, 0.08)"
        border="1px solid"
        borderColor="gray.100"
      >
        {/* Header */}
        <VStack spacing={3} mb={6}>
          <HStack w="full" justify="flex-start">
            <IconButton
              as={RouterLink}
              to="/login"
              aria-label="Back to login"
              icon={<ArrowBackIcon />}
              variant="ghost"
              size="sm"
              color="#2D876D"
            />
          </HStack>

          <Heading
            size="lg"
            color="#2D876D"
            fontSize={{ base: '24px', md: '28px' }}
            fontWeight="700"
            letterSpacing="-0.5px"
            textAlign="center"
          >
            {step === 1 ? 'Forgot Password?' : 'Reset Password'}
          </Heading>
          <Text color="#555" fontSize={{ base: '13px', md: '14px' }} textAlign="center">
            {step === 1
              ? "Enter your email and we'll send you a reset code."
              : 'Enter the code sent to your email and choose a new password.'}
          </Text>
        </VStack>

        {/* Error */}
        {error && (
          <Alert status="error" borderRadius="12px" bg="#FFEBEE" mb={4}>
            <AlertIcon color="#C62828" />
            <Text color="#B71C1C" fontSize="sm">{error}</Text>
          </Alert>
        )}

        {step === 1 ? (
          /* Step 1: Email Input */
          <form onSubmit={handleSendCode}>
            <VStack spacing={5}>
              <FormControl isRequired>
                <FormLabel fontSize="14px" fontWeight="600" color="#333">Email</FormLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  bg="#F7F7F5"
                  border="2px solid"
                  borderColor="transparent"
                  borderRadius="12px"
                  height="48px"
                  fontSize="15px"
                  _hover={{ borderColor: '#2D876D' }}
                  _focus={{ borderColor: '#2D876D', bg: 'white', boxShadow: '0 0 0 1px #2D876D' }}
                />
              </FormControl>

              <Button
                type="submit"
                bg="#2D876D"
                color="white"
                size="lg"
                w="full"
                isLoading={loading}
                loadingText="Sending..."
                fontSize="15px"
                fontWeight="600"
                height="48px"
                borderRadius="12px"
                _hover={{ bg: '#25704d', transform: 'translateY(-2px)', boxShadow: '0 8px 16px rgba(45, 135, 109, 0.3)' }}
                _active={{ transform: 'translateY(0)' }}
                transition="all 0.3s ease"
              >
                Send Reset Code
              </Button>
            </VStack>
          </form>
        ) : (
          /* Step 2: OTP + New Password */
          <form onSubmit={handleResetPassword}>
            <VStack spacing={5}>
              {/* OTP Input */}
              <FormControl isRequired>
                <FormLabel fontSize="14px" fontWeight="600" color="#333" textAlign="center">
                  Enter 6-digit code
                </FormLabel>
                <HStack justify="center">
                  <PinInput
                    otp
                    size="lg"
                    value={code}
                    onChange={(val) => setCode(val)}
                  >
                    <PinInputField bg="#F7F7F5" borderRadius="12px" borderColor="gray.200" _focus={{ borderColor: '#2D876D', boxShadow: '0 0 0 1px #2D876D' }} />
                    <PinInputField bg="#F7F7F5" borderRadius="12px" borderColor="gray.200" _focus={{ borderColor: '#2D876D', boxShadow: '0 0 0 1px #2D876D' }} />
                    <PinInputField bg="#F7F7F5" borderRadius="12px" borderColor="gray.200" _focus={{ borderColor: '#2D876D', boxShadow: '0 0 0 1px #2D876D' }} />
                    <PinInputField bg="#F7F7F5" borderRadius="12px" borderColor="gray.200" _focus={{ borderColor: '#2D876D', boxShadow: '0 0 0 1px #2D876D' }} />
                    <PinInputField bg="#F7F7F5" borderRadius="12px" borderColor="gray.200" _focus={{ borderColor: '#2D876D', boxShadow: '0 0 0 1px #2D876D' }} />
                    <PinInputField bg="#F7F7F5" borderRadius="12px" borderColor="gray.200" _focus={{ borderColor: '#2D876D', boxShadow: '0 0 0 1px #2D876D' }} />
                  </PinInput>
                </HStack>
                <Text fontSize="xs" color="gray.500" textAlign="center" mt={2}>
                  Sent to {email}
                </Text>
              </FormControl>

              {/* Resend Code */}
              <Button
                variant="link"
                size="sm"
                color="#2D876D"
                onClick={handleResendCode}
                isDisabled={cooldown > 0}
                fontWeight="500"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Button>

              {/* New Password */}
              <FormControl isRequired>
                <FormLabel fontSize="14px" fontWeight="600" color="#333">New Password</FormLabel>
                <InputGroup>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    bg="#F7F7F5"
                    border="2px solid"
                    borderColor="transparent"
                    borderRadius="12px"
                    height="48px"
                    fontSize="15px"
                    _hover={{ borderColor: '#2D876D' }}
                    _focus={{ borderColor: '#2D876D', bg: 'white', boxShadow: '0 0 0 1px #2D876D' }}
                  />
                  <InputRightElement h="full">
                    <IconButton
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword(!showPassword)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>

              {/* Confirm Password */}
              <FormControl isRequired>
                <FormLabel fontSize="14px" fontWeight="600" color="#333">Confirm Password</FormLabel>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  bg="#F7F7F5"
                  border="2px solid"
                  borderColor="transparent"
                  borderRadius="12px"
                  height="48px"
                  fontSize="15px"
                  _hover={{ borderColor: '#2D876D' }}
                  _focus={{ borderColor: '#2D876D', bg: 'white', boxShadow: '0 0 0 1px #2D876D' }}
                />
              </FormControl>

              <Button
                type="submit"
                bg="#2D876D"
                color="white"
                size="lg"
                w="full"
                isLoading={loading}
                loadingText="Resetting..."
                fontSize="15px"
                fontWeight="600"
                height="48px"
                borderRadius="12px"
                _hover={{ bg: '#25704d', transform: 'translateY(-2px)', boxShadow: '0 8px 16px rgba(45, 135, 109, 0.3)' }}
                _active={{ transform: 'translateY(0)' }}
                transition="all 0.3s ease"
              >
                Reset Password
              </Button>
            </VStack>
          </form>
        )}

        {/* Back to login link */}
        <Text textAlign="center" mt={6} fontSize="14px" color="#666">
          Remember your password?{' '}
          <Link as={RouterLink} to="/login" color="#2D876D" fontWeight="600">
            Sign In
          </Link>
        </Text>
      </Box>
    </Box>
  )
}

export default ForgotPassword
