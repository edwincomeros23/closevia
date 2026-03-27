import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
    Box,
    Container,
    VStack,
    Heading,
    Text,
    HStack,
    Input,
    Button,
    Alert,
    AlertIcon,
    Link,
    PinInput,
    PinInputField,
    useToast,
    Icon,
} from '@chakra-ui/react'
import { EmailIcon, CheckCircleIcon } from '@chakra-ui/icons'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const RESEND_COOLDOWN_SECONDS = 60
const OTP_EXPIRY_SECONDS = 10 * 60 // 10 minutes

const VerifyEmail: React.FC = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const toast = useToast()
    const { login } = useAuth()

    const email: string = (location.state as any)?.email || ''

    const [otp, setOtp] = useState('')
    const [loading, setLoading] = useState(false)
    const [resending, setResending] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS)
    const [canResend, setCanResend] = useState(false)
    const [expirySeconds, setExpirySeconds] = useState(OTP_EXPIRY_SECONDS)

    // Redirect if no email in state
    useEffect(() => {
        if (!email) {
            navigate('/register')
        }
    }, [email, navigate])

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown <= 0) {
            setCanResend(true)
            return
        }
        const timer = setInterval(() => {
            setResendCooldown((s) => {
                if (s <= 1) {
                    setCanResend(true)
                    clearInterval(timer)
                    return 0
                }
                return s - 1
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [resendCooldown])

    // OTP expiry countdown
    useEffect(() => {
        if (expirySeconds <= 0 || success) return
        const timer = setInterval(() => {
            setExpirySeconds((s) => Math.max(0, s - 1))
        }, 1000)
        return () => clearInterval(timer)
    }, [expirySeconds, success])

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60)
        const s = sec % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    const handleVerify = async (codeOverride?: string) => {
        const code = codeOverride ?? otp
        if (code.length !== 6) {
            setError('Please enter all 6 digits')
            return
        }
        setError('')
        setLoading(true)
        try {
            const response = await api.post('/api/auth/verify-email', { email, code })
            if (response.data.success) {
                const { token } = response.data.data
                // Store token and update auth state
                localStorage.setItem('clovia_token', token)
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`
                setSuccess(true)
                toast({
        id: "verifyemail-email-verified",
                    title: '✅ Email verified!',
                    description: 'Welcome to Clovia!',
                    status: 'success',
                    duration: 3000,
                    isClosable: true,
                })
                setTimeout(() => navigate('/home'), 1500)
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Verification failed. Try again.')
        } finally {
            setLoading(false)
        }
    }

    const handleResend = async () => {
        if (!canResend) return
        setResending(true)
        setError('')
        try {
            await api.post('/api/auth/resend-verification', { email })
            setCanResend(false)
            setResendCooldown(RESEND_COOLDOWN_SECONDS)
            setExpirySeconds(OTP_EXPIRY_SECONDS)
            setOtp('')
            toast({
        id: "verifyemail-code-resent",
                title: 'Code resent!',
                description: 'A new verification code has been sent to your email.',
                status: 'info',
                duration: 3000,
                isClosable: true,
            })
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to resend code.')
        } finally {
            setResending(false)
        }
    }

    const maskedEmail = email
        ? email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + b.replace(/./g, '*') + c)
        : ''

    return (
        <Box bg="#FFFDF1" minH="100vh" display="flex" alignItems="center" justifyContent="center" px={4}>
            <Container maxW="440px">
                <VStack spacing={8}>
                    {/* Icon + Heading */}
                    <VStack spacing={3} textAlign="center">
                        <Box
                            w="72px"
                            h="72px"
                            bg="brand.50"
                            borderRadius="full"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            boxShadow="0 0 0 8px rgba(107,158,120,0.1)"
                        >
                            {success
                                ? <CheckCircleIcon boxSize={8} color="brand.500" />
                                : <EmailIcon boxSize={8} color="brand.500" />
                            }
                        </Box>
                        <Heading size="lg" color="gray.800" fontWeight="700">
                            {success ? 'Verified!' : 'Check your email'}
                        </Heading>
                        <Text color="gray.500" fontSize="sm" maxW="320px">
                            {success
                                ? 'Your email has been verified. Redirecting you to Home...'
                                : <>We sent a 6-digit code to <Text as="span" fontWeight="600" color="gray.700">{maskedEmail}</Text>. Enter it below.</>
                            }
                        </Text>
                    </VStack>

                    {/* OTP Card */}
                    {!success && (
                        <Box
                            w="full"
                            bg="white"
                            borderRadius="2xl"
                            boxShadow="0 4px 24px rgba(0,0,0,0.06)"
                            p={8}
                        >
                            <VStack spacing={6}>
                                {error && (
                                    <Alert status="error" borderRadius="lg" fontSize="sm">
                                        <AlertIcon />
                                        {error}
                                    </Alert>
                                )}

                                {/* 6-box PIN input */}
                                <VStack spacing={2} w="full">
                                    <HStack spacing={3} justify="center">
                                        <PinInput
                                            otp
                                            size="lg"
                                            value={otp}
                                            onChange={(value) => {
                                                setOtp(value)
                                                if (error) setError('')
                                            }}
                                            onComplete={(value) => handleVerify(value)}
                                            isDisabled={loading}
                                        >
                                            {[...Array(6)].map((_, i) => (
                                                <PinInputField
                                                    key={i}
                                                    w="46px"
                                                    h="54px"
                                                    fontSize="xl"
                                                    fontWeight="700"
                                                    borderColor="gray.200"
                                                    _focus={{
                                                        borderColor: 'brand.400',
                                                        boxShadow: '0 0 0 1px var(--chakra-colors-brand-400)',
                                                    }}
                                                    bg="gray.50"
                                                    borderRadius="lg"
                                                    textAlign="center"
                                                />
                                            ))}
                                        </PinInput>
                                    </HStack>

                                    {/* Expiry countdown */}
                                    <Text fontSize="xs" color={expirySeconds < 60 ? 'red.400' : 'gray.400'}>
                                        {expirySeconds > 0
                                            ? `Code expires in ${formatTime(expirySeconds)}`
                                            : '⚠️ Code expired — please request a new one'
                                        }
                                    </Text>
                                </VStack>

                                {/* Verify Button */}
                                <Button
                                    colorScheme="brand"
                                    size="lg"
                                    w="full"
                                    isLoading={loading}
                                    loadingText="Verifying..."
                                    onClick={() => handleVerify()}
                                    isDisabled={otp.length !== 6 || expirySeconds === 0}
                                    fontWeight="600"
                                    borderRadius="xl"
                                    _hover={{ transform: 'translateY(-1px)', boxShadow: 'lg' }}
                                    transition="all 0.2s"
                                >
                                    Verify Email
                                </Button>

                                {/* Resend */}
                                <HStack spacing={1} fontSize="sm" color="gray.500" justify="center">
                                    <Text>Didn't receive it?</Text>
                                    {canResend ? (
                                        <Link
                                            color="brand.500"
                                            fontWeight="600"
                                            onClick={handleResend}
                                            cursor={resending ? 'not-allowed' : 'pointer'}
                                            opacity={resending ? 0.6 : 1}
                                            _hover={{ textDecoration: 'underline' }}
                                        >
                                            {resending ? 'Sending...' : 'Resend code'}
                                        </Link>
                                    ) : (
                                        <Text color="gray.400">
                                            Resend in {resendCooldown}s
                                        </Text>
                                    )}
                                </HStack>
                            </VStack>
                        </Box>
                    )}

                    {/* Back to login */}
                    {!success && (
                        <Text fontSize="sm" color="gray.400">
                            Wrong email?{' '}
                            <Link
                                color="brand.500"
                                fontWeight="600"
                                onClick={() => navigate('/register')}
                                _hover={{ textDecoration: 'underline' }}
                            >
                                Go back
                            </Link>
                        </Text>
                    )}
                </VStack>
            </Container>
        </Box>
    )
}

export default VerifyEmail
