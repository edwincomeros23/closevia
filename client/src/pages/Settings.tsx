import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  Container,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  Switch,
  Select,
  Divider,
  useToast,
  useColorMode,
  useColorModeValue,
  useBreakpointValue,
  Avatar,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  Badge,
  Flex,
  Icon,
  Spinner,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  PopoverCloseButton,
} from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { getImageUrl } from '../utils/imageUtils'
import VerifiedAvatar from '../components/VerifiedAvatar'
import FloatingTab from '../components/FloatingTab'
import { 
  FaUserCircle, 
  FaBell, 
  FaPalette, 
  FaLock, 
  FaSignOutAlt, 
  FaTrash, 
  FaEye, 
  FaEyeSlash,
  FaUpload,
  FaCheckCircle,
  FaGlobe,
  FaClock,
  FaDesktop,
  FaAccessibleIcon,
  FaEnvelope,
  FaMobile,
  FaExchangeAlt,
  FaHandshake,
} from 'react-icons/fa'
import { FiSettings, FiSave } from 'react-icons/fi'

const SettingsPage: React.FC = () => {
  const toast = useToast()
  const navigate = useNavigate()
  const { user, logout, updateProfile, refreshUser } = useAuth()
  const { colorMode, toggleColorMode } = useColorMode()
  const pageBg = useColorModeValue('#FFFDF1', 'gray.900')
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const schoolOtpBoxBg = useColorModeValue('gray.50', 'gray.700')
  const isMobile = useBreakpointValue({ base: true, md: false })

  // Account State
  const [username, setUsername] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [profileImage, setProfileImage] = useState<string | null>((user as any)?.profile_picture || null)
  const [uploadingImage, setUploadingImage] = useState(false)

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordErrors, setPasswordErrors] = useState<string[]>([])

  // Helper function to load initial font size from localStorage
  const initializeFontSize = () => {
    try {
      const saved = localStorage.getItem('user_settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.fontSize) {
          return parsed.fontSize
        }
      }
    } catch (e) {
      // ignore
    }
    return 'medium'
  }

  // Preferences State
  const [darkMode, setDarkMode] = useState(colorMode === 'dark')
  const [language, setLanguage] = useState('en')
  const [dashboardLayout, setDashboardLayout] = useState('default')
  const [fontSize, setFontSize] = useState(initializeFontSize)
  const [highContrast, setHighContrast] = useState(false)

  // Apply font size to document for live preview
  useEffect(() => {
    const applyFontSize = (size: string) => {
      const root = document.documentElement
      switch (size) {
        case 'small':
          root.style.fontSize = '14px'
          break
        case 'large':
          root.style.fontSize = '18px'
          break
        case 'extra-large':
          root.style.fontSize = '20px'
          break
        default:
          root.style.fontSize = '16px' // medium
      }
    }

    applyFontSize(fontSize)
    // Also persist to localStorage whenever font size changes
    try {
      const saved = localStorage.getItem('user_settings')
      const settings = saved ? JSON.parse(saved) : {}
      settings.fontSize = fontSize
      localStorage.setItem('user_settings', JSON.stringify(settings))
    } catch (e) {
      // ignore
    }
  }, [fontSize])

  // Load saved dark mode setting on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('user_settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.darkMode !== undefined) {
          const isDark = parsed.darkMode
          setDarkMode(isDark)
          // Apply to Chakra if not already in that mode
          if ((colorMode === 'dark') !== isDark) {
            toggleColorMode()
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }, [colorMode, toggleColorMode])

  // Notifications State
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(true)
  // School ID / COR verification state
  const [verificationStatus, setVerificationStatus] = useState<'not_verified' | 'pending' | 'verified' | 'rejected'>('not_verified')
  const [schoolName, setSchoolName] = useState<string>('')
  const [schoolEmail, setSchoolEmail] = useState<string>('')
  const [verificationLoading, setVerificationLoading] = useState(false)
  const [idUploadLoading, setIdUploadLoading] = useState(false)
  const [verificationReason, setVerificationReason] = useState<string | null>(null)
  const [documentType, setDocumentType] = useState<'id' | 'cor'>('id')
  // School email OTP step (code sent to .edu email)
  const [schoolEmailCode, setSchoolEmailCode] = useState('')
  const [schoolEmailVerifyLoading, setSchoolEmailVerifyLoading] = useState(false)
  const [resendSchoolCooldown, setResendSchoolCooldown] = useState(0)
  const [showSchoolOtpStep, setShowSchoolOtpStep] = useState(false)

  // UI State
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [changingPassword, setChangingPassword] = useState(false)

  // Danger Zone UI state (confirmation input)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const isDeleteValidated = deleteConfirmInput.trim() !== '' && deleteConfirmInput === (user?.name || '')
  
  // Modals
  const { isOpen: isPasswordModalOpen, onOpen: onPasswordModalOpen, onClose: onPasswordModalClose } = useDisclosure()
  const { isOpen: isLogoutModalOpen, onOpen: onLogoutModalOpen, onClose: onLogoutModalClose } = useDisclosure()
  const { isOpen: isDeleteModalOpen, onOpen: onDeleteModalOpen, onClose: onDeleteModalClose } = useDisclosure()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const logoutCancelRef = useRef<HTMLButtonElement>(null)
  const deleteCancelRef = useRef<HTMLButtonElement>(null)

  // Helper to strip cache busters from URLs (they should only be added in display, not stored)
  const stripCacheBuster = (url: string | null): string | null => {
    if (!url) return null
    // Remove ?t=... or &t=... cache busters
    return url.replace(/[?&]t=\d+/g, '')
  }

  // Load initial values from user
  useEffect(() => {
    if (user) {
      setUsername(user.name || '')
      setEmail(user.email || '')
      // Strip any cache busters that might have been saved
      const cleanPicture = stripCacheBuster((user as any)?.profile_picture)
      setProfileImage(cleanPicture)
      // Load language preference from user object
      const userLanguage = (user as any)?.language_preference || 'en'
      setLanguage(userLanguage)
      if ((user as any)?.profile_picture) {
        console.log('📸 Profile picture loaded - Raw:', (user as any)?.profile_picture, 'Cleaned:', cleanPicture)
      }
      // Initialize verification state from user when available
      const vs = (user as any)?.verification_status as ('not_verified' | 'pending' | 'verified' | 'rejected') | undefined
      if (vs) setVerificationStatus(vs)
      if ((user as any)?.school_name) setSchoolName((user as any).school_name)
      if ((user as any)?.school_email) setSchoolEmail((user as any).school_email)
      // Show OTP step if they have school email set but not yet verified
      if ((user as any)?.school_email && !(user as any)?.school_email_verified_at) setShowSchoolOtpStep(true)
    }
  }, [user])

  // Sync dark mode to Chakra colorMode when user toggles switch
  useEffect(() => {
    if (darkMode !== (colorMode === 'dark')) {
      toggleColorMode()
    }
  }, [darkMode, colorMode, toggleColorMode])

  // Ensure high contrast remains disabled (defensive)
  useEffect(() => {
    if (highContrast) {
      setHighContrast(false)
    }
  }, []) // run once on mount

  // Track changes
  useEffect(() => {
    const hasChanges =
      username !== (user?.name || '') ||
      email !== (user?.email || '') ||
      profileImage !== ((user as any)?.profile_picture || null) ||
      darkMode !== (colorMode === 'dark') ||
      language !== ((user as any)?.language_preference || 'en') ||
      dashboardLayout !== 'default' ||
      fontSize !== initializeFontSize() ||
      highContrast !== false ||
      emailNotifications !== true ||
      pushNotifications !== true

    setHasUnsavedChanges(hasChanges)
  }, [
    username,
    email,
    profileImage,
    darkMode,
    colorMode,
    language,
    dashboardLayout,
    fontSize,
    highContrast,
    emailNotifications,
    pushNotifications,
    user
  ])

  // Auto-save indicator
  useEffect(() => {
    if (saveStatus === 'saved') {
      const timer = setTimeout(() => {
        setSaveStatus('idle')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [saveStatus])

  // Handle profile image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    console.log('📸 Image file selected:', { name: file.name, size: file.size, type: file.type })

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 5MB.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    setUploadingImage(true)
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      console.log('📸 Image converted to data URL, length:', dataUrl.length)
      console.log('📸 Data URL preview (first 100 chars):', dataUrl.substring(0, 100))
      setProfileImage(dataUrl)
      setUploadingImage(false)
      setHasUnsavedChanges(true)
      toast({
        title: 'Image uploaded',
        description: 'Profile picture updated. Click Save to apply changes.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
    }
    reader.readAsDataURL(file)
  }

  // Validate password
  const validatePassword = (password: string): string[] => {
    const errors: string[] = []
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long')
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter')
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter')
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number')
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character')
    }
    return errors
  }

  // Handle password change
  const handlePasswordChange = async () => {
    setPasswordErrors([])

    // Validate new password
    const errors = validatePassword(newPassword)
    if (errors.length > 0) {
      setPasswordErrors(errors)
      return
    }

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      setPasswordErrors(['New passwords do not match'])
      return
    }

    // Check if current password is provided
    if (!currentPassword) {
      setPasswordErrors(['Please enter your current password'])
      return
    }

    setChangingPassword(true)
    try {
      const resp = await api.post('/api/users/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      })
      if (resp.data && resp.data.success) {
        // Refresh context user so changes persist across pages
        try {
          await refreshUser()
        } catch (e) {
          // non-fatal: we already updated backend; silently continue
          console.warn('Failed to refresh user after profile update', e)
        }
        toast({
          title: 'Password changed',
          description: 'Your password has been updated successfully.',
          status: 'success',
          duration: 3000,
          isClosable: true,
        })
        // Reset form
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setPasswordErrors([])
        onPasswordModalClose()
      } else {
        toast({
          title: 'Error',
          description: resp.data?.error || 'Failed to change password',
          status: 'error',
          duration: 3000,
          isClosable: true,
        })
      }
    } catch (err: any) {
      const message = err?.response?.data?.error || err.message || 'Failed to change password'
      toast({
        title: 'Error',
        description: message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    } finally {
      setChangingPassword(false)
    }
  }

  // Validate email
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Handle save
  const handleSave = async () => {
    // Validate email
    if (!validateEmail(email)) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    // Validate username
    if (!username.trim()) {
      toast({
        title: 'Username required',
        description: 'Please enter a username.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    setIsSaving(true)
    setSaveStatus('saving')

    try {
      // If profileImage is a data URL (client-side uploaded), upload it to server first
      let profileUrlToSave: string | undefined = undefined
      if (profileImage && profileImage.startsWith('data:')) {
        setUploadingImage(true)
        try {
          console.log('📸 Uploading profile picture from data URL')
          const blob = await (await fetch(profileImage)).blob()
          console.log('📸 Blob created:', { size: blob.size, type: blob.type })
          const form = new FormData()
          form.append('image', blob, 'profile.jpg')
          const uploadRes = await api.post('/api/users/profile-picture', form)
          // API returns { Success: true, Data: url, Message: "Uploaded" }
          profileUrlToSave = uploadRes.data?.Data || uploadRes.data?.data || uploadRes.data
          console.log('📸 Profile picture uploaded successfully, URL:', profileUrlToSave)
          console.log('📸 Full upload response:', uploadRes.data)
          console.log('📸 Response structure - Data field:', uploadRes.data?.Data)
          console.log('📸 Response structure - data field:', uploadRes.data?.data)
        } catch (uploadErr: any) {
          console.error('❌ Profile image upload failed', uploadErr)
          const serverMsg = uploadErr?.response?.data?.error || uploadErr?.response?.data || uploadErr?.message
          throw new Error(serverMsg || 'Failed to upload profile image')
        } finally {
          setUploadingImage(false)
        }
      } else if (profileImage) {
        // Already a URL (e.g., /uploads/...), use as-is
        profileUrlToSave = profileImage
      }

      // Update server-side profile (name/email/profile_picture)
      console.log('📸 Saving profile with picture URL:', profileUrlToSave)
      
      // DON'T save cache busters to the database - they're only for display
      if (updateProfile) {
        await updateProfile({ name: username, email, profile_picture: profileUrlToSave })
        // Update local state with the clean URL (no cache buster)
        if (profileUrlToSave) {
          setProfileImage(profileUrlToSave)
        }
      }

      // Persist preferences locally (without cache buster)
      const settings = {
        username,
        email,
        profileImage: profileUrlToSave ?? profileImage,
        darkMode,
        language,
        dashboardLayout,
        fontSize,
        highContrast,
        emailNotifications,
        pushNotifications,
      }
      localStorage.setItem('user_settings', JSON.stringify(settings))

      // Update user profile in backend (without cache buster)
      console.log('📸 Calling PUT /api/users/profile with profile_picture:', profileUrlToSave ?? profileImage)
      const resp = await api.put('/api/users/profile', {
        name: username,
        email: email,
        profile_picture: profileUrlToSave ?? profileImage,
        language_preference: language,
      })

      if (resp.data && resp.data.success) {
        console.log('📸 Profile updated successfully on backend, response:', resp.data)
        
        // Refresh context user so changes persist across pages
        try {
          await refreshUser()
          console.log('📸 User context refreshed after profile update')
          // Update local state from refreshed user data
          if (user) {
            setProfileImage((user as any)?.profile_picture || null)
          }
        } catch (e) {
          console.warn('Failed to refresh user after profile update', e)
        }

        setIsSaving(false)
        setSaveStatus('saved')
        setHasUnsavedChanges(false)

        toast({
          title: 'Settings saved',
          description: 'Your preferences have been updated successfully.',
          status: 'success',
          duration: 3000,
          isClosable: true,
        })
      } else {
        setIsSaving(false)
        setSaveStatus('error')
        toast({
          title: 'Error',
          description: resp.data?.error || 'Failed to update profile',
          status: 'error',
          duration: 3000,
          isClosable: true,
        })
      }
    } catch (err: any) {
      setIsSaving(false)
      setSaveStatus('error')
      toast({
        title: 'Error',
        description: err?.response?.data?.error || err?.message || 'Failed to save settings',
        status: 'error',
        duration: 4000,
        isClosable: true,
      })
    }
  }

  const handleStartVerification = async () => {
    if (!schoolName || !schoolEmail) {
      toast({
        title: 'School and email required',
        description: 'Please select your school and enter your official school email.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }
    setVerificationLoading(true)
    try {
      await api.post('/api/users/verification/start', {
        school_name: schoolName,
        school_email: schoolEmail,
      })
      toast({
        title: 'Code sent',
        description: 'Enter the 6-digit code we sent to your school email.',
        status: 'success',
        duration: 4000,
        isClosable: true,
      })
      setResendSchoolCooldown(60)
      setShowSchoolOtpStep(true)
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Failed to send code'
      toast({
        title: 'Verification error',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      })
    } finally {
      setVerificationLoading(false)
    }
  }

  // Resend cooldown timer for school email code
  useEffect(() => {
    if (resendSchoolCooldown <= 0) return
    const t = setInterval(() => setResendSchoolCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [resendSchoolCooldown])

  const handleVerifySchoolEmailCode = async () => {
    const code = schoolEmailCode.trim()
    if (code.length !== 6) {
      toast({ title: 'Enter 6-digit code', description: 'The code from your email has 6 digits.', status: 'warning', duration: 3000, isClosable: true })
      return
    }
    setSchoolEmailVerifyLoading(true)
    try {
      await api.post('/api/users/verification/verify-school-email', { code })
      toast({
        title: 'School email verified',
        description: 'You can now upload your school ID or COR.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
      setSchoolEmailCode('')
      setShowSchoolOtpStep(false)
      await refreshUser()
      setVerificationStatus('not_verified')
      setVerificationReason(null)
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Invalid or expired code'
      toast({ title: 'Verification failed', description: message, status: 'error', duration: 4000, isClosable: true })
    } finally {
      setSchoolEmailVerifyLoading(false)
    }
  }

  const handleResendSchoolEmailCode = async () => {
    if (resendSchoolCooldown > 0) return
    setVerificationLoading(true)
    try {
      await api.post('/api/users/verification/resend-school-email-code')
      toast({ title: 'Code resent', description: 'Check your school email for the new code.', status: 'success', duration: 3000, isClosable: true })
      setResendSchoolCooldown(60)
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Could not resend'
      toast({ title: 'Resend failed', description: message, status: 'error', duration: 4000, isClosable: true })
    } finally {
      setVerificationLoading(false)
    }
  }

  const handleUploadSchoolID = async (file: File | null) => {
    if (!file) return

    // Basic client-side validation for ID/COR upload
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a clear image of your school ID or COR.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 5MB.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }
    if (!schoolName || !schoolEmail) {
      toast({
        title: 'Email verification required',
        description: 'Please verify your school email before uploading your ID.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }
    setIdUploadLoading(true)
    try {
      const form = new FormData()
      form.append('id_image', file)
      form.append('document_type', documentType)
      await api.post('/api/users/verification/upload-id', form)
      toast({
        title: 'ID submitted',
        description: 'Your school ID has been submitted for review.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
      await refreshUser()
      setVerificationStatus('pending')
      setVerificationReason(null)
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Failed to upload school ID'
      toast({
        title: 'Upload error',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      })
    } finally {
      setIdUploadLoading(false)
    }
  }

  // Handle logout — clear tokens/cookies and notify backend if possible
  const handleLogout = async () => {
    // Clear common client-side storage keys
    try {
      const keys = ['token', 'auth_token', 'access_token', 'refresh_token', 'session']
      keys.forEach((k) => {
        try { localStorage.removeItem(k) } catch {}
        try { sessionStorage.removeItem(k) } catch {}
        try { document.cookie = `${k}=; Max-Age=0; path=/;` } catch {}
      })
    } catch (e) {
      // ignore
    }

    // Server-side logout endpoint not implemented in all backends.
    // Skip calling `/api/logout` to avoid 404 noise in the browser console.
    // If you have a server-side logout endpoint, re-enable this call.

    // Call context logout if available to clear auth state
    try {
      logout && logout()
    } catch (e) {
      // ignore
    }

    toast({
      title: 'Logged out',
      description: 'You have been successfully logged out.',
      status: 'success',
      duration: 2000,
      isClosable: true,
    })

    // Navigate to login page and close any open logout dialog
    navigate('/login')
    try { onLogoutModalClose() } catch {}
  }
 
  // Handle delete account
  const handleDeleteAccount = () => {
    // Simulate account deletion (frontend only)
    toast({
      title: 'Account deleted',
      description: 'Your account has been deleted. (Frontend simulation only)',
      status: 'info',
      duration: 5000,
      isClosable: true,
    })
    logout()
    navigate('/login')
    onDeleteModalClose()
  }

  return (
    <Box minH="100vh" bg={pageBg} py={6} position="relative" pb={{ base: '100px', md: '80px' }}>
      <Container maxW="container.lg" py={0}>
        <VStack spacing={6} align="stretch">
          {/* Header */}
          <Flex justify="space-between" align="center" flexWrap="wrap" gap={4}>
            <Box>
              <Heading size="lg" mb={1} color={useColorModeValue('gray.800', 'white')}>
                Settings
              </Heading>
              <Text color={useColorModeValue('gray.600', 'gray.400')} fontSize="sm">
                Manage your account, preferences, and notification settings.
              </Text>
            </Box>
            <HStack spacing={3}>
              {saveStatus === 'saved' && (
                <Badge colorScheme="green" px={3} py={1} borderRadius="full" fontSize="sm">
                  <HStack spacing={1}>
                    <Icon as={FaCheckCircle} />
                    <Text>Saved</Text>
                  </HStack>
                </Badge>
              )}
              {/* Moved logout to header: small logout icon button */}
              <IconButton
                aria-label="Logout"
                icon={<FaSignOutAlt />}
                size="sm"
                variant="outline"
                colorScheme="orange"
                onClick={onLogoutModalOpen}
                title="Logout"
              />
            </HStack>
          </Flex>

          {/* Account Section */}
          <Card
            bg={cardBg}
            borderRadius="lg"
            overflow="hidden"
            variant="outline"
            borderColor={borderColor}
            _hover={{ boxShadow: 'md' }}
            transition="all 0.2s"
          >
            <CardHeader pb={3}>
              <HStack spacing={3}>
                <Icon as={FaUserCircle} color="brand.500" boxSize={5} />
                <Heading size="md">Account</Heading>
              </HStack>
            </CardHeader>
            <CardBody pt={0}>
              <VStack spacing={6} align="stretch">
                {/* Profile Picture */}
                <FormControl>
                  <FormLabel>Profile Picture</FormLabel>
                  <HStack spacing={4}>
                    <VerifiedAvatar
                      key={profileImage || 'no-image'} // Force re-render when image changes
                      size="xl"
                      src={profileImage || undefined}
                      name={username || user?.name || 'User'}
                      bg="brand.500"
                      isVerified={user?.verification_status === 'verified' || user?.verified || false}
                    />
                    <VStack align="start" spacing={2}>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        display="none"
                        id="profile-image-upload"
                      />
                      <Button
                        as="label"
                        htmlFor="profile-image-upload"
                        leftIcon={<FaUpload />}
                        variant="outline"
                        size="sm"
                        cursor="pointer"
                        isLoading={uploadingImage}
                        loadingText="Uploading..."
                      >
                        Upload Photo
                      </Button>
                      <Text fontSize="xs" color={useColorModeValue('gray.500', 'gray.400')}>
                        JPG, PNG or GIF. Max size 5MB.
                      </Text>
                    </VStack>
                  </HStack>
                </FormControl>

                <Divider />

                {/* Username */}
                <FormControl>
                  <FormLabel>Username</FormLabel>
                  <Input
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value)
                      setHasUnsavedChanges(true)
                    }}
                    placeholder="Your display name"
                  />
                </FormControl>

                {/* Email */}
                <FormControl>
                  <FormLabel>Email Address</FormLabel>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setHasUnsavedChanges(true)
                    }}
                    placeholder="you@example.com"
                  />
                  {email && !validateEmail(email) && (
                    <Text fontSize="xs" color="red.500" mt={1}>
                      Please enter a valid email address
                    </Text>
                  )}
                </FormControl>

                <Divider />

                {/* Change Password */}
                <FormControl>
                  <FormLabel>Password</FormLabel>
                  <Button
                    leftIcon={<FaLock />}
                    variant="outline"
                    size="sm"
                    onClick={onPasswordModalOpen}
                  >
                    Change Password
                  </Button>
                  <Text fontSize="xs" color={useColorModeValue('gray.500', 'gray.400')} mt={2}>
                    Keep your account secure by updating your password regularly.
                  </Text>
                </FormControl>
              </VStack>
            </CardBody>
          </Card>

          {/* School ID Verification Section */}
          <Card
            bg={cardBg}
            borderRadius="lg"
            overflow="hidden"
            variant="outline"
            borderColor={borderColor}
            _hover={{ boxShadow: 'md' }}
            transition="all 0.2s"
          >
            <CardHeader pb={3}>
              <HStack spacing={3} justify="space-between">
                <HStack spacing={3}>
                  <Icon as={FaEnvelope} color="brand.500" boxSize={5} />
                  <Heading size="md">School Verification (Optional)</Heading>
                </HStack>
                <Badge
                  colorScheme={
                    verificationStatus === 'verified'
                      ? 'green'
                      : verificationStatus === 'pending'
                      ? 'orange'
                      : verificationStatus === 'rejected'
                      ? 'red'
                      : 'gray'
                  }
                  borderRadius="full"
                  px={3}
                  py={1}
                  fontSize="xs"
                >
                  {verificationStatus === 'verified'
                    ? 'Verified Student'
                    : verificationStatus === 'pending'
                    ? 'Pending Review'
                    : verificationStatus === 'rejected'
                    ? 'Rejected'
                    : 'Not Verified'}
                </Badge>
              </HStack>
            </CardHeader>
            <CardBody pt={0}>
              <VStack spacing={4} align="stretch">
                <Text fontSize="sm" color={useColorModeValue('gray.600', 'gray.300')}>
                  Verifying your school ID helps other students trust your listings and trades.
                  This is optional – you can continue using Clovia without verification.
                </Text>

                <FormControl>
                  <FormLabel>School</FormLabel>
                  <Select
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    maxW="300px"
                  >
                    <option value="">Select your school</option>
                    <option value="WMSU">Western Mindanao State University (WMSU)</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>Official School Email</FormLabel>
                  <HStack spacing={2} align="flex-end">
                    <Input
                      type="email"
                      value={schoolEmail}
                      onChange={(e) => setSchoolEmail(e.target.value)}
                      placeholder="you@wmsu.edu.ph"
                      isDisabled={!!(user as any)?.school_email_verified_at}
                    />
                    <Button
                      size="sm"
                      colorScheme="brand"
                      onClick={showSchoolOtpStep ? handleResendSchoolEmailCode : handleStartVerification}
                      isLoading={verificationLoading}
                      isDisabled={!!(user as any)?.school_email_verified_at || (showSchoolOtpStep && resendSchoolCooldown > 0)}
                    >
                      {showSchoolOtpStep ? (resendSchoolCooldown > 0 ? `Resend in ${resendSchoolCooldown}s` : 'Resend Code') : 'Send Code'}
                    </Button>
                  </HStack>
                  <Text fontSize="xs" color={useColorModeValue('gray.500', 'gray.400')} mt={1}>
                    Only official school emails from approved schools (currently WMSU). We'll send a verification code to confirm it's your email.
                  </Text>
                </FormControl>

                {showSchoolOtpStep && !(user as any)?.school_email_verified_at && (
                  <Box p={4} bg={schoolOtpBoxBg} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
                    <Text fontSize="sm" fontWeight="medium" mb={3}>Enter the 6-digit code we sent to your school email</Text>
                    <HStack spacing={2} align="flex-end" flexWrap="wrap">
                      <Input
                        maxLength={6}
                        value={schoolEmailCode}
                        onChange={(e) => setSchoolEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        fontFamily="mono"
                        fontSize="lg"
                        w="120px"
                      />
                      <Button
                        size="sm"
                        colorScheme="green"
                        onClick={handleVerifySchoolEmailCode}
                        isLoading={schoolEmailVerifyLoading}
                        isDisabled={schoolEmailCode.trim().length !== 6}
                      >
                        Verify Code
                      </Button>
                    </HStack>
                  </Box>
                )}

                {(user as any)?.school_email_verified_at && (
                  <HStack color="green.600" fontSize="sm">
                    <Icon as={FaCheckCircle} />
                    <Text>School email verified. You can upload your ID or COR below.</Text>
                  </HStack>
                )}

                <Divider />

                <FormControl isDisabled={verificationStatus === 'pending' || !(user as any)?.school_email_verified_at}>
                  <FormLabel>Upload School ID or COR (front)</FormLabel>
                  <HStack spacing={3} align="center">
                    <Input
                      type="file"
                      accept="image/*"
                      id="school-id-upload"
                      display="none"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null
                        if (file) {
                          handleUploadSchoolID(file)
                          // Reset input so the same file can be re-selected if needed
                          e.target.value = ''
                        }
                      }}
                    />
                    <Select
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value as 'id' | 'cor')}
                      maxW="160px"
                      size="sm"
                    >
                      <option value="id">School ID</option>
                      <option value="cor">COR</option>
                    </Select>
                    <Button
                      as="label"
                      htmlFor="school-id-upload"
                      leftIcon={<FaUpload />}
                      variant="outline"
                      size="sm"
                      isLoading={idUploadLoading}
                      loadingText="Uploading..."
                    >
                      Upload ID Image
                    </Button>
                    {verificationStatus === 'pending' && (
                      <HStack spacing={1}>
                        <Spinner size="sm" color="orange.400" />
                        <Text fontSize="xs" color={useColorModeValue('orange.600', 'orange.300')}>
                          Under review by admin
                        </Text>
                      </HStack>
                    )}
                  </HStack>
                  <Text fontSize="xs" color={useColorModeValue('gray.500', 'gray.400')} mt={1}>
                    Upload a clear photo of your school ID or COR showing your full name, school name, and student details.
                  </Text>
                  {verificationStatus === 'rejected' && verificationReason && (
                    <Box mt={2}>
                      <Text fontSize="xs" color="red.500" fontWeight="semibold">
                        Rejection reason:
                      </Text>
                      <Text fontSize="xs" color="red.500">
                        {verificationReason}
                      </Text>
                    </Box>
                  )}
                </FormControl>
              </VStack>
            </CardBody>
          </Card>

          {/* Preferences Section */}
          <Card
            bg={cardBg}
            borderRadius="lg"
            overflow="hidden"
            variant="outline"
            borderColor={borderColor}
            _hover={{ boxShadow: 'md' }}
            transition="all 0.2s"
          >
            <CardHeader pb={3}>
              <HStack spacing={3}>
                <Icon as={FaPalette} color="brand.500" boxSize={5} />
                <Heading size="md">Preferences</Heading>
              </HStack>
            </CardHeader>
            <CardBody pt={0}>
              <VStack spacing={6} align="stretch">
                {/* Dark Mode */}
                <Flex justify="space-between" align="center">
                  <Box>
                    <FormLabel mb={1}>Dark Mode</FormLabel>
                    <Text fontSize="sm" color={useColorModeValue('gray.500', 'gray.400')}>
                      Switch between light and dark theme
                    </Text>
                  </Box>
                  <Switch
                    isChecked={darkMode}
                    onChange={(e) => {
                      setDarkMode(e.target.checked)
                      setHasUnsavedChanges(true)
                    }}
                    colorScheme="brand"
                    size="lg"
                    isDisabled
                    title="Dark mode is locked"
                  />
                </Flex>

                <Divider />

                {/* Language */}
                <FormControl>
                  <FormLabel>
                    <HStack spacing={2}>
                      <Icon as={FaGlobe} />
                      <Text>Language</Text>
                    </HStack>
                  </FormLabel>
                  <Select
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value)
                      setHasUnsavedChanges(true)
                    }}
                    maxW="300px"
                    title="Select language"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="it">Italiano</option>
                    <option value="pt">Português</option>
                    <option value="zh">中文</option>
                    <option value="ja">日本語</option>
                  </Select>
                </FormControl>

                {/* Dashboard Layout */}
                <FormControl>
                  <FormLabel>
                    <HStack spacing={2}>
                      <Icon as={FaDesktop} />
                      <Text>Default Dashboard Layout</Text>
                    </HStack>
                  </FormLabel>
                  <Select
                    value={dashboardLayout}
                    onChange={(e) => {
                      setDashboardLayout(e.target.value)
                      setHasUnsavedChanges(true)
                    }}
                    maxW="300px"
                    title="Select dashboard layout"
                  >
                    <option value="default">Default</option>
                    <option value="compact">Compact</option>
                    <option value="spacious">Spacious</option>
                    <option value="grid">Grid View</option>
                  </Select>
                </FormControl>

                <Divider />

                {/* Accessibility */}
                <Box>
                  <FormLabel mb={3}>
                    <HStack spacing={2}>
                      <Icon as={FaAccessibleIcon} />
                      <Text>Accessibility</Text>
                    </HStack>
                  </FormLabel>
                  <VStack spacing={4} align="stretch" pl={4}>
                    <FormControl>
                      <FormLabel fontSize="sm">Font Size</FormLabel>
                      <Select
                        value={fontSize}
                        onChange={(e) => {
                          setFontSize(e.target.value)
                          setHasUnsavedChanges(true)
                        }}
                        maxW="200px"
                        title="Select font size"
                      >
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                        <option value="extra-large">Extra Large</option>
                      </Select>
                    </FormControl>
                    <Flex justify="space-between" align="center">
                      <Box>
                        <FormLabel mb={1} fontSize="sm">High Contrast Mode</FormLabel>
                        <Text fontSize="xs" color={useColorModeValue('gray.500', 'gray.400')}>
                          Increase contrast for better visibility
                        </Text>
                      </Box>
                      <Switch
                        isChecked={false}
                        isDisabled
                        colorScheme="brand"
                        title="High contrast mode is disabled"
                      />
                    </Flex>
                  </VStack>
                </Box>
              </VStack>
            </CardBody>
          </Card>

          {/* Notifications Section */}
          <Card
            bg={cardBg}
            borderRadius="lg"
            overflow="hidden"
            variant="outline"
            borderColor={borderColor}
            _hover={{ boxShadow: 'md' }}
            transition="all 0.2s"
          >
            <CardHeader pb={3}>
              <HStack spacing={3}>
                <Icon as={FaBell} color="brand.500" boxSize={5} />
                <Heading size="md">Notifications</Heading>
              </HStack>
            </CardHeader>
            <CardBody pt={0}>
              <VStack spacing={6} align="stretch">
                {/* Email Notifications */}
                <Flex justify="space-between" align="center">
                  <Box>
                    <FormLabel mb={1}>
                      <HStack spacing={2}>
                        <Icon as={FaEnvelope} />
                        <Text>Email Notifications</Text>
                      </HStack>
                    </FormLabel>
                    <Text fontSize="sm" color={useColorModeValue('gray.500', 'gray.400')}>
                      Receive updates and offers via email
                    </Text>
                  </Box>
                  <Switch
                    isChecked={emailNotifications}
                    onChange={(e) => {
                      setEmailNotifications(e.target.checked)
                      setHasUnsavedChanges(true)
                    }}
                    colorScheme="brand"
                    size="lg"
                  />
                </Flex>

                {/* Push Notifications */}
                <Flex justify="space-between" align="center">
                  <Box>
                    <FormLabel mb={1}>
                      <HStack spacing={2}>
                        <Icon as={FaMobile} />
                        <Text>Push Notifications</Text>
                      </HStack>
                    </FormLabel>
                    <Text fontSize="sm" color={useColorModeValue('gray.500', 'gray.400')}>
                      Receive in-app and browser notifications
                    </Text>
                  </Box>
                  <Switch
                    isChecked={pushNotifications}
                    onChange={(e) => {
                      setPushNotifications(e.target.checked)
                      setHasUnsavedChanges(true)
                    }}
                    colorScheme="brand"
                    size="lg"
                  />
                </Flex>

                <Divider />

                {/* Trade & offer notifications removed per request */}

                
              </VStack>
            </CardBody>
          </Card>

          {/* Danger Zone — enhanced UI */}
          <Card
            bg={cardBg}
            borderRadius="lg"
            overflow="hidden"
            variant="outline"
            borderColor="red.300"
            _hover={{ boxShadow: 'md' }}
            transition="all 0.2s"
          >
            <CardHeader
              pb={3}
              bgGradient="linear(to-r, red.50, rgba(255,240,240,0))"
            >
              <HStack spacing={3} justify="space-between" w="full">
                <HStack spacing={3}>
                  <Icon as={FaTrash} color="red.500" boxSize={5} />
                  <Heading size="md" color="red.600">Danger Zone</Heading>
                  <Badge colorScheme="red">Danger</Badge>
                </HStack>
                <Text fontSize="sm" color="red.600" fontWeight="semibold">
                  Irreversible actions below
                </Text>
              </HStack>
            </CardHeader>
            <CardBody pt={4}>
             <VStack spacing={6} align="stretch">
 
                 {/* Delete Account with explicit confirmation */}
                 <Box>
                   <Heading size="sm" mb={2} color="red.600">Delete Account</Heading>
                   <Text fontSize="sm" color={useColorModeValue('gray.600', 'gray.400')} mb={3}>
                     Permanently delete your account and all associated data. This action cannot be undone.
                   </Text>
                   <Text fontSize="xs" color="red.500" mb={2}>
                     Click Delete to open a confirmation popout. You will need to type your username to enable deletion.
                   </Text>
                   <Popover placement="right" isLazy>
                     <PopoverTrigger>
                       <Button leftIcon={<FaTrash />} colorScheme="red" variant="outline" size="sm">
                         Delete Account
                       </Button>
                     </PopoverTrigger>
                     <PopoverContent>
                       <PopoverArrow />
                       <PopoverHeader fontWeight="bold" color="red.600">Confirm Deletion</PopoverHeader>
                       <PopoverCloseButton />
                       <PopoverBody>
                         <VStack align="stretch" spacing={3}>
                           <Text fontSize="sm" color={useColorModeValue('gray.700', 'gray.200')}>
                             This action is irreversible. To confirm, type your exact username below:
                           </Text>
                           <Input
                             placeholder={user?.name ? `Type "${user?.name}"` : 'Type your username'}
                             value={deleteConfirmInput}
                             onChange={(e) => setDeleteConfirmInput(e.target.value)}
                           />
                         </VStack>
                       </PopoverBody>
                       <PopoverFooter display="flex" justifyContent="flex-end">
                         <Button
                           variant="outline"
                           mr={2}
                           size="sm"
                           onClick={() => {
                             setDeleteConfirmInput('')
                           }}
                         >
                           Clear
                         </Button>
                         <Button
                           colorScheme="red"
                           size="sm"
                           isDisabled={!isDeleteValidated}
                           onClick={() => {
                             handleDeleteAccount()
                           }}
                         >
                           Confirm Delete
                         </Button>
                       </PopoverFooter>
                     </PopoverContent>
                   </Popover>
                 </Box>
               </VStack>
            </CardBody>
          </Card>
        </VStack>
      </Container>
 
      {/* Sticky Save Button */}
      {hasUnsavedChanges && (
        <Box
          position="fixed"
          bottom={0}
          left={0}
          right={0}
          bg={cardBg}
          borderTopWidth="1px"
          borderColor={borderColor}
          boxShadow="lg"
          py={4}
          px={4}
          zIndex={1000}
        >
          <Container maxW="container.lg">
            <Flex justify="space-between" align="center" flexWrap="wrap" gap={4}>
              <Text color={useColorModeValue('gray.600', 'gray.300')} fontSize="sm">
                You have unsaved changes
              </Text>
              <HStack spacing={3}>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Reset to original values
                    if (user) {
                      setUsername(user.name || '')
                      setEmail(user.email || '')
                      setProfileImage((user as any)?.profile_picture || null)
                      setLanguage((user as any)?.language_preference || 'en')
                    }
                    setDarkMode(colorMode === 'dark')
                    setEmailNotifications(true)
                    setPushNotifications(true)
                    setHasUnsavedChanges(false)
                    toast({
                      title: 'Changes discarded',
                      description: 'Your changes have been reset.',
                      status: 'info',
                      duration: 2000,
                      isClosable: true,
                    })
                  }}
                >
                  Discard
                </Button>
                <Button
                  colorScheme="brand"
                  leftIcon={isSaving ? <Spinner size="sm" /> : <FiSave />}
                  onClick={handleSave}
                  isLoading={isSaving}
                  loadingText="Saving..."
                >
                  Save Changes
                </Button>
              </HStack>
            </Flex>
          </Container>
        </Box>
      )}

      {/* Password Change Modal */}
      <Modal isOpen={isPasswordModalOpen} onClose={onPasswordModalClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Change Password</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel>Current Password</FormLabel>
                <InputGroup>
                  <Input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                      icon={showCurrentPassword ? <FaEyeSlash /> : <FaEye />}
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>

              <FormControl>
                <FormLabel>New Password</FormLabel>
                <InputGroup>
                  <Input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      setPasswordErrors(validatePassword(e.target.value))
                    }}
                    placeholder="Enter new password"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      icon={showNewPassword ? <FaEyeSlash /> : <FaEye />}
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    />
                  </InputRightElement>
                </InputGroup>
                {passwordErrors.length > 0 && (
                  <VStack align="start" spacing={1} mt={2}>
                    {passwordErrors.map((error, index) => (
                      <Text key={index} fontSize="xs" color="red.500">
                        • {error}
                      </Text>
                    ))}
                  </VStack>
                )}
              </FormControl>

              <FormControl>
                <FormLabel>Confirm New Password</FormLabel>
                <InputGroup>
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      icon={showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    />
                  </InputRightElement>
                </InputGroup>
                {confirmPassword && newPassword !== confirmPassword && (
                  <Text fontSize="xs" color="red.500" mt={1}>
                    Passwords do not match
                  </Text>
                )}
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onPasswordModalClose}>
              Cancel
            </Button>
            <Button colorScheme="brand" onClick={handlePasswordChange} isLoading={changingPassword} loadingText="Changing...">
              Change Password
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Logout Confirmation Modal */}
      <AlertDialog
        isOpen={isLogoutModalOpen}
        leastDestructiveRef={logoutCancelRef}
        onClose={onLogoutModalClose}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Logout
            </AlertDialogHeader>
            <AlertDialogBody>
              Are you sure you want to logout? You will need to login again to access your account.
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={logoutCancelRef} onClick={onLogoutModalClose}>
                Cancel
              </Button>
              <Button colorScheme="orange" onClick={handleLogout} ml={3}>
                Logout
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      <FloatingTab />
    </Box>
  )
}

export default SettingsPage
