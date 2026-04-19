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
  Tooltip,
  Tabs,
  TabList,
  TabPanels,
  TabPanel,
  Tab,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
} from '@chakra-ui/react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
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
  FaDesktop,
  FaAccessibleIcon,
  FaEnvelope,
  FaMobile,
  FaHome,
} from 'react-icons/fa'
import { FiSettings, FiSave, FiMapPin } from 'react-icons/fi'

// Fix leaflet icon issues (same as AddProduct)
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Map click handler for home address picker
const HomeMapClickHandler = ({ onSelect }: { onSelect: (lat: number, lng: number) => void }) => {
  const map = useMap()
  useEffect(() => {
    const handler = (e: any) => onSelect(e.latlng.lat, e.latlng.lng)
    map.on('click', handler)
    return () => { map.off('click', handler) }
  }, [map, onSelect])
  return null
}

const HomeMapCenterUpdater = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap()
  useEffect(() => { map.setView([lat, lng], 15, { animate: true }) }, [lat, lng, map])
  return null
}

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
  const [phoneNumber, setPhoneNumber] = useState((user as any)?.phone || '')
  const [phoneVerified, setPhoneVerified] = useState<boolean>((user as any)?.phone_verified || false)
  const [phoneOtpCode, setPhoneOtpCode] = useState('')
  const [phoneVerifyLoading, setPhoneVerifyLoading] = useState(false)
  const [phoneSendLoading, setPhoneSendLoading] = useState(false)
  const [resendPhoneCooldown, setResendPhoneCooldown] = useState(0)
  const [phoneOtpSent, setPhoneOtpSent] = useState(false)
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
  const [deleteConfirmText, setDeleteConfirmText] = useState('')



  // Modals
  const { isOpen: isPasswordModalOpen, onOpen: onPasswordModalOpen, onClose: onPasswordModalClose } = useDisclosure()
  const { isOpen: isPhoneModalOpen, onOpen: onPhoneModalOpen, onClose: onPhoneModalClose } = useDisclosure()
  const { isOpen: isLogoutModalOpen, onOpen: onLogoutModalOpen, onClose: onLogoutModalClose } = useDisclosure()
  const { isOpen: isDeleteAccountOpen, onOpen: onDeleteAccountOpen, onClose: onDeleteAccountClose } = useDisclosure()
  // Home Address state
  const [homeLocation, setHomeLocation] = useState<{ lat: number; lng: number } | null>(() => {
    try {
      const saved = localStorage.getItem('clovia_home_location')
      if (saved) { const p = JSON.parse(saved); if (p?.lat && p?.lng) return p }
    } catch { /* ignore */ }
    if ((user as any)?.home_latitude && (user as any)?.home_longitude) {
      return { lat: (user as any).home_latitude, lng: (user as any).home_longitude }
    }
    return null
  })
  const [homeAddressLabel, setHomeAddressLabel] = useState<string>((user as any)?.home_address || '')
  const [homeSaving, setHomeSaving] = useState(false)
  const [pendingHomeLocation, setPendingHomeLocation] = useState<{ lat: number; lng: number } | null>(null)
  const { isOpen: isHomeMapOpen, onOpen: onHomeMapOpen, onClose: onHomeMapClose } = useDisclosure()
  const [addressSearch, setAddressSearch] = useState('')
  const [searchResults, setSearchResults] = useState<{ display_name: string; lat: string; lon: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)

  const cancelRef = useRef<HTMLButtonElement>(null)
  const logoutCancelRef = useRef<HTMLButtonElement>(null)
  const deleteAccountCancelRef = useRef<HTMLButtonElement>(null)

  // Helper to strip cache busters from URLs (they should only be added in display, not stored)
  const stripCacheBuster = (url: string | null): string | null => {
    if (!url) return null
    // Remove ?t=... or &t=... cache busters
    return url.replace(/[?&]t=\d+/g, '')
  }

  // Refresh user data on component mount.
  useEffect(() => {
    console.log('🗺️ Settings page mounted, refreshing user data...')
    refreshUser()
  }, [refreshUser])

  // Load initial values from user (including home address)
  useEffect(() => {
    if (user) {
      setUsername(user.name || '')
      setEmail(user.email || '')
      setPhoneNumber((user as any)?.phone || '')
      setPhoneVerified((user as any)?.phone_verified || false)
      const cleanPicture = stripCacheBuster((user as any)?.profile_picture)
      setProfileImage(cleanPicture)
      setEmailNotifications((user as any)?.email_notifications_enabled ?? true)
      setPushNotifications((user as any)?.push_notifications_enabled ?? true)
      if ((user as any)?.profile_picture) {
        console.log('📸 Profile picture loaded - Raw:', (user as any)?.profile_picture, 'Cleaned:', cleanPicture)
      }
      const vs = (user as any)?.verification_status as ('not_verified' | 'pending' | 'verified' | 'rejected') | undefined
      if (vs) setVerificationStatus(vs)
      if ((user as any)?.school_name) setSchoolName((user as any).school_name)
      if ((user as any)?.school_email) setSchoolEmail((user as any).school_email)
      if ((user as any)?.school_email && !(user as any)?.school_email_verified_at) setShowSchoolOtpStep(true)
      // Sync home address from user profile
      if ((user as any)?.home_latitude && (user as any)?.home_longitude) {
        setHomeLocation({ lat: (user as any).home_latitude, lng: (user as any).home_longitude })
      }
      if ((user as any)?.home_address) setHomeAddressLabel((user as any).home_address)
    }
  }, [user])

  // Track changes
  useEffect(() => {
    const hasChanges =
      username !== (user?.name || '') ||
      email !== (user?.email || '') ||
      phoneNumber !== ((user as any)?.phone || '') ||
      profileImage !== ((user as any)?.profile_picture || null) ||
      emailNotifications !== ((user as any)?.email_notifications_enabled ?? true) ||
      pushNotifications !== ((user as any)?.push_notifications_enabled ?? true)

    setHasUnsavedChanges(hasChanges)
  }, [
    username,
    email,
    phoneNumber,
    profileImage,
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

  useEffect(() => {
    if (resendPhoneCooldown <= 0) return
    const t = setInterval(() => setResendPhoneCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [resendPhoneCooldown])

  // Handle profile image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    console.log('📸 Image file selected:', { name: file.name, size: file.size, type: file.type })

    // Validate file type
    const supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!supportedImageTypes.includes(file.type.toLowerCase())) {
      toast({
        id: 'invalid-file-type',
        title: 'Invalid file type',
        description: 'Please upload a JPG, PNG, or WEBP image.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        id: 'file-too-large',
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
        id: 'image-uploaded',
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
          id: 'password-changed',
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
          id: 'error-password-change',
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
        id: 'error-password-change-failed',
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

  const validatePhone = (phone: string): boolean => {
    if (!phone.trim()) return true
    return /^\d{10,15}$/.test(phone.trim())
  }

  const getPasswordChangedLabel = (): string => {
    const raw = (user as any)?.password_changed_at
    if (!raw) return 'Password last changed: Not available'
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return 'Password last changed: Not available'
    return `Password last changed: ${parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}`
  }

  const handleStartPhoneVerification = async () => {
    if (!validatePhone(phoneNumber) || !phoneNumber.trim()) {
      toast({
        id: 'settings-invalid-phone-start',
        title: 'Invalid phone number',
        description: 'Use 10 to 15 digits before requesting a code.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    setPhoneSendLoading(true)
    try {
      const resp = await api.post('/api/users/verification/phone/start', { phone: phoneNumber.trim() })
      setPhoneOtpSent(true)
      setResendPhoneCooldown(60)
      toast({
        id: 'settings-phone-code-sent',
        title: 'Code sent',
        description: resp?.data?.message || 'Verification code sent to your phone number.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })
    } catch (err: any) {
      toast({
        id: 'settings-phone-code-send-failed',
        title: 'Could not send code',
        description: err?.response?.data?.error || 'Failed to send verification code',
        status: 'error',
        duration: 4000,
        isClosable: true,
      })
    } finally {
      setPhoneSendLoading(false)
    }
  }

  const handleResendPhoneVerification = async () => {
    if (resendPhoneCooldown > 0) return
    setPhoneSendLoading(true)
    try {
      const resp = await api.post('/api/users/verification/phone/resend')
      setPhoneOtpSent(true)
      setResendPhoneCooldown(60)
      toast({
        id: 'settings-phone-code-resent',
        title: 'Code resent',
        description: resp?.data?.message || 'Verification code resent to your phone number.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })
    } catch (err: any) {
      toast({
        id: 'settings-phone-code-resend-failed',
        title: 'Could not resend code',
        description: err?.response?.data?.error || 'Failed to resend verification code',
        status: 'error',
        duration: 4000,
        isClosable: true,
      })
    } finally {
      setPhoneSendLoading(false)
    }
  }

  const handleVerifyPhoneCode = async () => {
    const code = phoneOtpCode.trim()
    if (code.length !== 6) {
      toast({
        id: 'settings-phone-code-invalid-length',
        title: 'Enter 6-digit code',
        description: 'The verification code must be 6 digits.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    setPhoneVerifyLoading(true)
    try {
      const resp = await api.post('/api/users/verification/phone/verify', { code })
      setPhoneVerified(true)
      setPhoneOtpCode('')
      setPhoneOtpSent(false)
      onPhoneModalClose()
      await refreshUser()
      toast({
        id: 'settings-phone-verified',
        title: 'Phone verified',
        description: resp?.data?.message || 'Your phone number is now verified.',
        status: 'success',
        duration: 4000,
        isClosable: true,
      })
    } catch (err: any) {
      toast({
        id: 'settings-phone-verify-failed',
        title: 'Verification failed',
        description: err?.response?.data?.error || 'Invalid or expired verification code',
        status: 'error',
        duration: 4000,
        isClosable: true,
      })
    } finally {
      setPhoneVerifyLoading(false)
    }
  }

  // Handle save
  const handleSave = async () => {
    // Validate email
    if (!validateEmail(email)) {
      toast({
        id: 'invalid-email',
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
        id: 'username-required',
        title: 'Display name required',
        description: 'Please enter your display name.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    // Validate phone number
    if (!validatePhone(phoneNumber)) {
      toast({
        id: 'invalid-phone',
        title: 'Invalid phone number',
        description: 'Use 10 to 15 digits only.',
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
        await updateProfile({
          name: username,
          email,
          phone: phoneNumber.trim(),
          profile_picture: profileUrlToSave,
        })
        // Update local state with the clean URL (no cache buster)
        if (profileUrlToSave) {
          setProfileImage(profileUrlToSave)
        }
      }

      // Persist settings locally
      const settings = {
        username,
        email,
        phoneNumber,
        profileImage: profileUrlToSave ?? profileImage,
        emailNotifications,
        pushNotifications,
      }
      localStorage.setItem('user_settings', JSON.stringify(settings))

      // Update user profile in backend
      console.log('📸 Calling PUT /api/users/profile with profile_picture:', profileUrlToSave ?? profileImage)
      const resp = await api.put('/api/users/profile', {
        name: username,
        email: email,
        phone: phoneNumber.trim(),
        profile_picture: profileUrlToSave ?? profileImage,
        email_notifications_enabled: emailNotifications,
        push_notifications_enabled: pushNotifications,
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
          id: 'settings-saved',
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
          id: 'error-save-settings',
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
        id: "settings-error",
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
        id: "settings-school-and-email-required",
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
        id: "settings-code-sent",
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
        id: "settings-verification-error",
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
      toast({
        id: "settings-enter-6-digit-code", title: 'Enter 6-digit code', description: 'The code from your email has 6 digits.', status: 'warning', duration: 3000, isClosable: true
      })
      return
    }
    setSchoolEmailVerifyLoading(true)
    try {
      await api.post('/api/users/verification/verify-school-email', { code })
      toast({
        id: "settings-school-email-verified",
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
      toast({
        id: "settings-verification-failed", title: 'Verification failed', description: message, status: 'error', duration: 4000, isClosable: true
      })
    } finally {
      setSchoolEmailVerifyLoading(false)
    }
  }

  const handleResendSchoolEmailCode = async () => {
    if (resendSchoolCooldown > 0) return
    setVerificationLoading(true)
    try {
      await api.post('/api/users/verification/resend-school-email-code')
      toast({
        id: "settings-code-resent", title: 'Code resent', description: 'Check your school email for the new code.', status: 'success', duration: 3000, isClosable: true
      })
      setResendSchoolCooldown(60)
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Could not resend'
      toast({
        id: "settings-resend-failed", title: 'Resend failed', description: message, status: 'error', duration: 4000, isClosable: true
      })
    } finally {
      setVerificationLoading(false)
    }
  }



  // Save home address
  const handleSaveHomeAddress = async (loc: { lat: number; lng: number }) => {
    setHomeSaving(true)
    try {
      // Reverse geocode using Nominatim (free, no API key)
      let addressLabel = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lng}&format=json`,
          { headers: { 'Accept-Language': 'en' } }
        )
        const geoData = await geoRes.json()
        if (geoData?.display_name) {
          // Show only the first 2 parts (e.g. "Street, City")
          const parts = geoData.display_name.split(',')
          addressLabel = parts.slice(0, 3).join(',').trim()
        }
      } catch { /* use coordinate fallback */ }

      // Save to backend
      await api.put('/api/users/profile', {
        home_latitude: loc.lat,
        home_longitude: loc.lng,
        home_address: addressLabel,
      })

      // Persist to localStorage so ProductContext can read it immediately
      localStorage.setItem('clovia_home_location', JSON.stringify({ lat: loc.lat, lng: loc.lng }))

      // Update local state
      setHomeLocation(loc)
      setHomeAddressLabel(addressLabel)
      setPendingHomeLocation(null)
      onHomeMapClose()

      // Notify ProductContext to recalculate distances from new home
      window.dispatchEvent(new CustomEvent('homeAddressChanged', { detail: { lat: loc.lat, lng: loc.lng } }))

      await refreshUser()

      toast({
        id: 'home-address-saved',
        title: 'Home address saved',
        description: `Distance calculations will now use: ${addressLabel}`,
        status: 'success',
        duration: 4000,
        isClosable: true,
      })
    } catch (err: any) {
      toast({
        id: 'home-address-error',
        title: 'Failed to save home address',
        description: err?.response?.data?.error || err?.message || 'Please try again',
        status: 'error',
        duration: 4000,
        isClosable: true,
      })
    } finally {
      setHomeSaving(false)
    }
  }

  // Handle logout — clear tokens/cookies and notify backend if possible
  const handleLogout = async () => {

    // Clear common client-side storage keys
    try {
      const keys = ['token', 'auth_token', 'access_token', 'refresh_token', 'session']
      keys.forEach((k) => {
        try { localStorage.removeItem(k) } catch { }
        try { sessionStorage.removeItem(k) } catch { }
        try { document.cookie = `${k}=; Max-Age=0; path=/;` } catch { }
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
      id: "settings-logged-out",
      title: 'Logged out',
      description: 'You have been successfully logged out.',
      status: 'success',
      duration: 2000,
      isClosable: true,
    })

    // Navigate to login page and close any open logout dialog
    navigate('/login')
    try { onLogoutModalClose() } catch { }
  }

  // Handle account deletion
  const handleDeleteAccount = async () => {
    try {
      await api.delete('/api/users/account')

      // Clear client-side storage
      try {
        const keys = ['token', 'auth_token', 'access_token', 'refresh_token', 'session']
        keys.forEach((k) => {
          try { localStorage.removeItem(k) } catch { }
          try { sessionStorage.removeItem(k) } catch { }
          try { document.cookie = `${k}=; Max-Age=0; path=/;` } catch { }
        })
      } catch (e) {
        // ignore
      }

      // Logout locally
      try {
        logout && logout()
      } catch (e) {
        // ignore
      }

      toast({
        id: "settings-account-deleted",
        title: 'Account deleted',
        description: 'Your account has been permanently deleted.',
        status: 'success',
        duration: 2000,
        isClosable: true,
      })

      // Navigate to login/home
      navigate('/')
      try { onDeleteAccountClose() } catch { }
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Failed to delete account'
      toast({
        id: "settings-error-2",
        title: 'Error',
        description: message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    }
  }

  return (
    <Box minH="100vh" bg={pageBg} pb={{ base: '100px', md: '80px' }}>
      <Container maxW="container.md" py={8}>
        <VStack spacing={6} align="stretch">

          {/* Tabs Container */}
          <Tabs variant="unstyled" isLazy>

            {/* Sticky Header Pill */}
            <Box
              position="sticky"
              top={{ base: '40px', md: '64px' }}
              zIndex={20}
              bg={cardBg}
              borderRadius="2xl"
              p={{ base: 4, md: 5 }}
              border="1px"
              borderColor={borderColor}
              shadow="sm"
              transform="translateY(-20px)"
            >
              {/* Header Title & Actions */}
              <Flex justify="space-between" align="center" mb={4}>
                <HStack spacing={3}>
                  <Icon as={FiSettings} boxSize={5} color={useColorModeValue('brand.500', 'brand.300')} />
                  <Heading size="md" color={useColorModeValue('gray.800', 'white')}>
                    Settings
                  </Heading>
                </HStack>
                <HStack spacing={3}>
                  {saveStatus === 'saved' && (
                    <Badge colorScheme="green" px={3} py={1} borderRadius="full" fontSize="sm">
                      <HStack spacing={1}>
                        <Icon as={FaCheckCircle} />
                        <Text>Saved</Text>
                      </HStack>
                    </Badge>
                  )}
                  {/* Logout Button */}
                  <IconButton
                    aria-label="Logout"
                    icon={<FaSignOutAlt />}
                    size="sm"
                    variant="ghost"
                    colorScheme="orange"
                    onClick={onLogoutModalOpen}
                    title="Logout"
                  />
                </HStack>
              </Flex>

              {/* Horizontal scrollable tab list */}
              <TabList
                w="full"
                overflowX="auto"
                sx={{ '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}
                gap={{ base: 2, md: 3 }}
                display="flex"
                flexWrap="nowrap"
              >
                <Tab
                  flexShrink={0}
                  justifyContent="flex-start"
                  whiteSpace="nowrap"
                  borderRadius={{ base: "full", md: "xl" }}
                  px={{ base: 5, md: 4 }}
                  py={{ base: 2.5, md: 3 }}
                  fontSize="sm"
                  fontWeight="600"
                  color={useColorModeValue('gray.600', 'gray.400')}
                  bg={useColorModeValue('white', 'gray.800')}
                  border="1px solid"
                  borderColor={useColorModeValue('gray.200', 'gray.700')}
                  shadow="sm"
                  _selected={{
                    bg: useColorModeValue('brand.500', 'brand.600'),
                    color: 'white',
                    borderColor: 'transparent',
                    shadow: 'md',
                    transform: 'translateY(-1px)'
                  }}
                  _hover={{ bg: useColorModeValue('gray.50', 'gray.700'), transform: 'translateY(-1px)', shadow: 'md' }}
                  transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                ><Icon as={FaUserCircle} mr={2} boxSize={4} /> Account</Tab>

                {user?.role !== 'admin' && (
                  <Tab
                    flexShrink={0}
                    justifyContent="flex-start"
                    whiteSpace="nowrap"
                    borderRadius={{ base: "full", md: "xl" }}
                    px={{ base: 5, md: 4 }}
                    py={{ base: 2.5, md: 3 }}
                    fontSize="sm"
                    fontWeight="600"
                    color={useColorModeValue('gray.600', 'gray.400')}
                    bg={useColorModeValue('white', 'gray.800')}
                    border="1px solid"
                    borderColor={useColorModeValue('gray.200', 'gray.700')}
                    shadow="sm"
                    _selected={{
                      bg: useColorModeValue('brand.500', 'brand.600'),
                      color: 'white',
                      borderColor: 'transparent',
                      shadow: 'md',
                      transform: 'translateY(-1px)'
                    }}
                    _hover={{ bg: useColorModeValue('gray.50', 'gray.700'), transform: 'translateY(-1px)', shadow: 'md' }}
                    transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                  ><Icon as={FaEnvelope} mr={2} boxSize={4} /> Education</Tab>
                )}

                <Tab
                  flexShrink={0}
                  justifyContent="flex-start"
                  whiteSpace="nowrap"
                  borderRadius={{ base: "full", md: "xl" }}
                  px={{ base: 5, md: 4 }}
                  py={{ base: 2.5, md: 3 }}
                  fontSize="sm"
                  fontWeight="600"
                  color={useColorModeValue('gray.600', 'gray.400')}
                  bg={useColorModeValue('white', 'gray.800')}
                  border="1px solid"
                  borderColor={useColorModeValue('gray.200', 'gray.700')}
                  shadow="sm"
                  _selected={{
                    bg: useColorModeValue('brand.500', 'brand.600'),
                    color: 'white',
                    borderColor: 'transparent',
                    shadow: 'md',
                    transform: 'translateY(-1px)'
                  }}
                  _hover={{ bg: useColorModeValue('gray.50', 'gray.700'), transform: 'translateY(-1px)', shadow: 'md' }}
                  transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                ><Icon as={FaBell} mr={2} boxSize={4} /> Notifications</Tab>

                <Tab
                  flexShrink={0}
                  justifyContent="flex-start"
                  whiteSpace="nowrap"
                  borderRadius={{ base: "full", md: "xl" }}
                  px={{ base: 5, md: 4 }}
                  py={{ base: 2.5, md: 3 }}
                  fontSize="sm"
                  fontWeight="600"
                  color={useColorModeValue('red.600', 'red.400')}
                  bg={useColorModeValue('white', 'gray.800')}
                  border="1px solid"
                  borderColor={useColorModeValue('red.200', 'red.800')}
                  shadow="sm"
                  _selected={{
                    bg: useColorModeValue('red.500', 'red.600'),
                    color: 'white',
                    borderColor: 'transparent',
                    shadow: 'md',
                    transform: 'translateY(-1px)'
                  }}
                  _hover={{ bg: useColorModeValue('red.50', 'red.900'), transform: 'translateY(-1px)', shadow: 'md' }}
                  transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                ><Icon as={FaTrash} mr={2} boxSize={4} /> Danger Zone</Tab>
              </TabList>
            </Box>

            <TabPanels mt={6}>
              {/* Profile/Account Tab */}
              <TabPanel p={0} m={0}>
                <Card
                  bg={cardBg}
                  borderRadius="2xl"
                  overflow="hidden"
                  variant="outline"
                  borderColor={borderColor}
                  shadow="sm"
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
                          <Tooltip label="Blue check means your account is verified." hasArrow>
                            <Box>
                              <VerifiedAvatar
                                key={profileImage || 'no-image'} // Force re-render when image changes
                                size="xl"
                                src={profileImage || undefined}
                                name={username || user?.name || 'User'}
                                bg="brand.500"
                                isVerified={user?.verification_status === 'verified' || user?.verified || false}
                              />
                            </Box>
                          </Tooltip>
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
                              JPG, PNG, or WEBP. Max size 5MB.
                            </Text>
                            <Text fontSize="xs" color={useColorModeValue('gray.500', 'gray.400')}>
                              Avatar check badge indicates verified account status.
                            </Text>
                          </VStack>
                        </HStack>
                      </FormControl>

                      <Divider />

                      {/* Display Name */}
                      <FormControl>
                        <FormLabel>Display Name</FormLabel>
                        <Input
                          value={username}
                          onChange={(e) => {
                            setUsername(e.target.value)
                            setHasUnsavedChanges(true)
                          }}
                          placeholder="Your public display name"
                        />
                      </FormControl>

                      {/* Phone Number */}
                      <FormControl>
                        <HStack justify="space-between" mb={2}>
                          <FormLabel mb={0}>Phone Number</FormLabel>
                          <HStack spacing={2}>
                            {phoneVerified ? (
                              <Badge colorScheme="green" variant="subtle" borderRadius="full" px={2}>
                                <HStack spacing={1}>
                                  <Icon as={FaCheckCircle} boxSize={3} />
                                  <Text fontSize="2xs">Verified</Text>
                                </HStack>
                              </Badge>
                            ) : (
                              <Badge colorScheme="orange" variant="subtle" borderRadius="full" px={2}>
                                <Text fontSize="2xs">Unverified</Text>
                              </Badge>
                            )}
                          </HStack>
                        </HStack>

                        <HStack spacing={2}>
                          <Input
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => {
                              const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 15)
                              setPhoneNumber(digitsOnly)
                              if (phoneVerified && digitsOnly !== ((user as any)?.phone || '')) {
                                setPhoneVerified(false)
                              }
                              setHasUnsavedChanges(true)
                            }}
                            placeholder="e.g. 09171234567"
                          />
                          <Button
                            size="sm"
                            colorScheme="orange"
                            variant="ghost"
                            fontSize="xs"
                            isDisabled={!phoneNumber.trim() || phoneVerified}
                            onClick={() => {
                              setPhoneOtpCode('')
                              setPhoneOtpSent(false)
                              setResendPhoneCooldown(0)
                              onPhoneModalOpen()
                            }}
                          >
                            {phoneVerified ? 'Verified' : 'Verify'}
                          </Button>
                        </HStack>

                        {phoneNumber && !validatePhone(phoneNumber) && (
                          <Text fontSize="xs" color="red.500" mt={1}>
                            Phone number must be 10 to 15 digits.
                          </Text>
                        )}

                        {!phoneVerified && phoneNumber && validatePhone(phoneNumber) && (
                          <Text fontSize="xs" color="orange.500" mt={2}>
                            Add your phone number to strengthen account trust for trades and delivery.
                          </Text>
                        )}
                      </FormControl>

                      {/* Email */}
                      <FormControl>
                        <HStack justify="space-between" mb={2}>
                          <FormLabel mb={0}>Email Address</FormLabel>
                          <HStack spacing={2}>
                            {user?.verified ? (
                              <Badge colorScheme="green" variant="subtle" borderRadius="full" px={2}>
                                <HStack spacing={1}>
                                  <Icon as={FaCheckCircle} boxSize={3} />
                                  <Text fontSize="2xs">Verified</Text>
                                </HStack>
                              </Badge>
                            ) : (
                              <Badge colorScheme="orange" variant="subtle" borderRadius="full" px={2}>
                                <Text fontSize="2xs">Unverified</Text>
                              </Badge>
                            )}
                          </HStack>
                        </HStack>
                        <HStack spacing={2}>
                          <Input
                            type="email"
                            value={email}
                            onChange={(e) => {
                              setEmail(e.target.value)
                              setHasUnsavedChanges(true)
                            }}
                            placeholder="you@example.com"
                          />
                          {!user?.verified && email === user?.email && (
                            <Button
                              size="sm"
                              colorScheme="orange"
                              variant="ghost"
                              fontSize="xs"
                              isLoading={verificationLoading}
                              onClick={async () => {
                                setVerificationLoading(true)
                                try {
                                  await api.post('/api/auth/resend-verification', { email: user?.email })
                                  toast({
                                    title: 'Verification email sent',
                                    description: 'Please check your inbox for the code.',
                                    status: 'info',
                                    duration: 5000,
                                    isClosable: true,
                                  })
                                  // Redirect to verification page
                                  navigate('/verify-email', { state: { email: user?.email } })
                                } catch (err: any) {
                                  toast({
                                    title: 'Error',
                                    description: err.response?.data?.error || 'Failed to send verification email',
                                    status: 'error',
                                    duration: 3000,
                                    isClosable: true,
                                  })
                                } finally {
                                  setVerificationLoading(false)
                                }
                              }}
                            >
                              Verify Now
                            </Button>
                          )}
                        </HStack>
                        {email && !validateEmail(email) && (
                          <Text fontSize="xs" color="red.500" mt={1}>
                            Please enter a valid email address
                          </Text>
                        )}
                        {!user?.verified && (
                          <Text fontSize="xs" color="orange.500" mt={2}>
                            ⚠️ Your email is not verified. Some features may be restricted.
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
                        <Text fontSize="xs" color={useColorModeValue('gray.500', 'gray.400')} mt={1}>
                          {getPasswordChangedLabel()}
                        </Text>
                      </FormControl>

                      <FormControl>
                        <FormLabel>Session</FormLabel>
                        <Button
                          leftIcon={<FaSignOutAlt />}
                          colorScheme="orange"
                          variant="outline"
                          size="sm"
                          onClick={onLogoutModalOpen}
                        >
                          Logout
                        </Button>
                        <Text fontSize="xs" color={useColorModeValue('gray.500', 'gray.400')} mt={2}>
                          Sign out from this device.
                        </Text>
                      </FormControl>

                      <Divider />

                      {/* Home Address — for stable distance calculations */}
                      <Box>
                        <HStack justify="space-between" mb={2} flexWrap="wrap" gap={2}>
                          <HStack spacing={2}>
                            <Icon as={FaHome} color="brand.500" boxSize={4} />
                            <Text fontWeight="600" fontSize="sm">Home Address</Text>
                          </HStack>
                          {homeLocation && (
                            <Badge colorScheme="green" borderRadius="full" px={2} py={0.5} fontSize="2xs">
                              <HStack spacing={1}>
                                <Icon as={FaCheckCircle} boxSize={3} />
                                <Text>Set</Text>
                              </HStack>
                            </Badge>
                          )}
                        </HStack>

                        {!homeLocation && (
                          <Alert status="info" borderRadius="xl" mb={3} fontSize="sm" py={2}>
                            <AlertIcon boxSize={4} />
                            <Box>
                              <AlertTitle fontSize="xs" fontWeight="700">Set your home address</AlertTitle>
                              <AlertDescription fontSize="xs" color="gray.600">
                                Distance badges on listings will use your home as the reference point instead of your live GPS — giving you more stable and meaningful distances.
                              </AlertDescription>
                            </Box>
                          </Alert>
                        )}

                        {homeLocation && homeAddressLabel && (
                          <HStack
                            bg={useColorModeValue('green.50', 'green.900')}
                            borderRadius="xl"
                            px={3} py={2} mb={3}
                            border="1px solid"
                            borderColor={useColorModeValue('green.200', 'green.700')}
                            spacing={2}
                          >
                            <Icon as={FiMapPin} color="green.500" boxSize={4} flexShrink={0} />
                            <Text fontSize="sm" color={useColorModeValue('green.700', 'green.200')} noOfLines={2}>
                              {homeAddressLabel}
                            </Text>
                          </HStack>
                        )}

                        <HStack spacing={2}>
                          <Button
                            id="settings-set-home-address-btn"
                            leftIcon={<FiMapPin />}
                            size="sm"
                            colorScheme="brand"
                            variant={homeLocation ? 'outline' : 'solid'}
                            onClick={() => {
                              setAddressSearch('')
                              setSearchResults([])
                              // Start with existing, then try GPS
                              const initial = homeLocation || { lat: 14.5995, lng: 120.9842 } // Manila fallback
                              setPendingHomeLocation(initial)
                              onHomeMapOpen()
                              // Auto-request GPS to center map
                              if ('geolocation' in navigator) {
                                setGpsLoading(true)
                                navigator.geolocation.getCurrentPosition(
                                  (pos) => {
                                    setPendingHomeLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                                    setGpsLoading(false)
                                  },
                                  () => setGpsLoading(false),
                                  { timeout: 8000 }
                                )
                              }
                            }}
                          >
                            {homeLocation ? 'Update Home Address' : 'Set Home Address'}
                          </Button>
                          {homeLocation && (
                            <Button
                              size="sm"
                              variant="ghost"
                              colorScheme="red"
                              onClick={async () => {
                                try {
                                  await api.put('/api/users/profile', {
                                    home_latitude: null,
                                    home_longitude: null,
                                    home_address: '',
                                  })
                                  localStorage.removeItem('clovia_home_location')
                                  setHomeLocation(null)
                                  setHomeAddressLabel('')
                                  window.dispatchEvent(new CustomEvent('homeAddressChanged', { detail: { lat: null, lng: null } }))
                                  toast({ id: 'home-address-cleared', title: 'Home address removed', status: 'info', duration: 3000, isClosable: true })
                                } catch { /* ignore */ }
                              }}
                            >
                              Clear
                            </Button>
                          )}
                        </HStack>
                        <Text fontSize="xs" color={useColorModeValue('gray.500', 'gray.400')} mt={2}>
                          Tap the map to pin your home. This is used only for calculating listing distances — it's never shown publicly.
                        </Text>
                      </Box>
                    </VStack>
                  </CardBody>
                </Card>
              </TabPanel>

              {/* ── Home Address Map Modal ── */}
              <Modal isOpen={isHomeMapOpen} onClose={() => { onHomeMapClose(); setSearchResults([]); setAddressSearch('') }} size="xl" isCentered scrollBehavior="inside">
                <ModalOverlay backdropFilter="blur(4px)" />
                <ModalContent borderRadius="2xl" overflow="hidden" mx={2} maxH="90vh">
                  <ModalHeader pb={2}>
                    <HStack spacing={2}>
                      <Icon as={FaHome} color="brand.500" />
                      <Text>Set Home Address</Text>
                    </HStack>
                  </ModalHeader>
                  <ModalCloseButton />
                  <ModalBody p={0}>
                    <VStack spacing={0} align="stretch">

                      {/* Search bar + GPS button */}
                      <Box px={4} py={3} borderBottomWidth="1px" borderColor={borderColor}>
                        <HStack spacing={2}>
                          <InputGroup size="sm" flex={1}>
                            <Input
                              placeholder="Search address or place name..."
                              value={addressSearch}
                              onChange={(e) => setAddressSearch(e.target.value)}
                              borderRadius="lg"
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter' && addressSearch.trim().length > 2) {
                                  setSearching(true)
                                  try {
                                    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressSearch)}&format=json&limit=5&countrycodes=ph`, { headers: { 'Accept-Language': 'en' } })
                                    setSearchResults(await res.json())
                                  } catch { /* ignore */ } finally { setSearching(false) }
                                }
                              }}
                            />
                            <InputRightElement>
                              {searching ? <Spinner size="xs" /> : null}
                            </InputRightElement>
                          </InputGroup>
                          <Button
                            size="sm"
                            leftIcon={gpsLoading ? <Spinner size="xs" /> : <Icon as={FiMapPin} />}
                            colorScheme="green"
                            variant="outline"
                            borderRadius="lg"
                            isLoading={gpsLoading}
                            onClick={() => {
                              if (!('geolocation' in navigator)) return
                              setGpsLoading(true)
                              navigator.geolocation.getCurrentPosition(
                                (pos) => {
                                  setPendingHomeLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                                  setGpsLoading(false)
                                  setSearchResults([])
                                },
                                () => {
                                  setGpsLoading(false)
                                  toast({ id: 'gps-error', title: 'Could not get GPS location', status: 'warning', duration: 3000, isClosable: true })
                                },
                                { timeout: 8000, enableHighAccuracy: true }
                              )
                            }}
                          >
                            My Location
                          </Button>

                          <Button
                            size="sm"
                            colorScheme="brand"
                            borderRadius="lg"
                            isLoading={searching}
                            onClick={async () => {
                              if (addressSearch.trim().length < 2) return
                              setSearching(true)
                              try {
                                const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressSearch)}&format=json&limit=5&countrycodes=ph`, { headers: { 'Accept-Language': 'en' } })
                                setSearchResults(await res.json())
                              } catch { /* ignore */ } finally { setSearching(false) }
                            }}
                          >
                            Search
                          </Button>
                        </HStack>

                        {/* Search results dropdown */}
                        {searchResults.length > 0 && (
                          <VStack align="stretch" mt={2} spacing={0} borderRadius="lg" border="1px solid" borderColor={borderColor} overflow="hidden" maxH="180px" overflowY="auto">
                            {searchResults.map((r, i) => (
                              <Box
                                key={i}
                                px={3} py={2}
                                cursor="pointer"
                                bg={useColorModeValue('white', 'gray.800')}
                                _hover={{ bg: useColorModeValue('brand.50', 'gray.700') }}
                                borderBottomWidth={i < searchResults.length - 1 ? '1px' : '0'}
                                borderColor={borderColor}
                                onClick={() => {
                                  setPendingHomeLocation({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) })
                                  setSearchResults([])
                                  setAddressSearch(r.display_name.split(',').slice(0, 3).join(','))
                                }}
                              >
                                <HStack spacing={2}>
                                  <Icon as={FiMapPin} color="brand.500" boxSize={3} flexShrink={0} />
                                  <Text fontSize="xs" noOfLines={2}>{r.display_name}</Text>
                                </HStack>
                              </Box>
                            ))}
                          </VStack>
                        )}
                      </Box>

                      {/* Map */}
                      {pendingHomeLocation && (
                        <Box h="340px" position="relative">
                          <MapContainer
                            center={[pendingHomeLocation.lat, pendingHomeLocation.lng]}
                            zoom={15}
                            style={{ height: '100%', width: '100%' }}
                          >
                            <TileLayer
                              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            />
                            <HomeMapClickHandler onSelect={(lat, lng) => { setPendingHomeLocation({ lat, lng }); setSearchResults([]) }} />
                            <HomeMapCenterUpdater lat={pendingHomeLocation.lat} lng={pendingHomeLocation.lng} />
                            <Marker position={[pendingHomeLocation.lat, pendingHomeLocation.lng]} />
                          </MapContainer>
                        </Box>
                      )}

                      {/* Selected coords */}
                      {pendingHomeLocation && (
                        <Box px={4} py={2} bg={useColorModeValue('gray.50', 'gray.800')}>
                          <HStack spacing={2}>
                            <Icon as={FiMapPin} color="brand.500" boxSize={3} />
                            <Text fontSize="xs" color={useColorModeValue('gray.500', 'gray.400')}>
                              Pinned: {pendingHomeLocation.lat.toFixed(5)}, {pendingHomeLocation.lng.toFixed(5)} · Tap map to adjust
                            </Text>
                          </HStack>
                        </Box>
                      )}
                    </VStack>
                  </ModalBody>
                  <ModalFooter gap={2} pt={3}>
                    <Button variant="ghost" size="sm" onClick={() => { onHomeMapClose(); setSearchResults([]); setAddressSearch('') }} isDisabled={homeSaving}>Cancel</Button>
                    <Button
                      id="settings-confirm-home-address-btn"
                      colorScheme="brand"
                      size="sm"
                      leftIcon={<FaHome />}
                      isLoading={homeSaving}
                      isDisabled={!pendingHomeLocation}
                      onClick={() => pendingHomeLocation && handleSaveHomeAddress(pendingHomeLocation)}
                    >
                      Confirm Home Address
                    </Button>
                  </ModalFooter>
                </ModalContent>
              </Modal>

              {/* School ID Verification Section - hidden for admins */}
              {user?.role !== 'admin' && (
                <TabPanel p={0} m={0}>
                  <Card
                    bg={cardBg}
                    borderRadius="2xl"
                    overflow="hidden"
                    variant="outline"
                    borderColor={borderColor}
                    shadow="sm"
                  >
                    <CardHeader pb={3}>
                      <HStack spacing={3} justify="space-between" flexWrap="wrap" gap={2}>
                        <HStack spacing={3} minW={0}>
                          <Icon as={FaEnvelope} color="brand.500" boxSize={5} flexShrink={0} />
                          <Heading size={{ base: 'sm', md: 'md' }}>School Verification</Heading>
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
                          <Text fontSize="xs" color={useColorModeValue('gray.500', 'gray.400')} mt={1}>
                            Supported schools right now: WMSU only.
                          </Text>
                        </FormControl>

                        <FormControl>
                          <FormLabel>Official School Email</FormLabel>
                          <HStack spacing={2} align="flex-end" flexWrap="wrap">
                            <Input
                              type="email"
                              value={schoolEmail}
                              onChange={(e) => setSchoolEmail(e.target.value)}
                              placeholder="you@wmsu.edu.ph"
                              isDisabled={!!(user as any)?.school_email_verified_at}
                              flex={1}
                              minW="150px"
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
                            <Text>School email verified.</Text>
                          </HStack>
                        )}
                      </VStack>
                    </CardBody>
                  </Card>
                </TabPanel>
              )}

              {/* Notifications Section */}
              <TabPanel p={0} m={0}>
                <Card
                  bg={cardBg}
                  borderRadius="2xl"
                  overflow="hidden"
                  variant="outline"
                  borderColor={borderColor}
                  shadow="sm"
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
                    </VStack>
                  </CardBody>
                </Card>
              </TabPanel>

              {/* Delete Account Section - Subtle but Dangerous */}
              <TabPanel p={0} m={0}>
                <Card
                  bg={useColorModeValue('red.50', 'rgba(245, 75, 85, 0.1)')}
                  borderRadius="2xl"
                  overflow="hidden"
                  variant="outline"
                  borderColor={useColorModeValue('red.200', 'red.700')}
                  shadow="sm"
                >
                  <CardHeader pb={3}>
                    <HStack spacing={3}>
                      <Icon as={FaTrash} color="red.500" boxSize={5} />
                      <Heading size="md" color="red.700">Delete Account</Heading>
                    </HStack>
                  </CardHeader>
                  <CardBody pt={0}>
                    <VStack spacing={4} align="stretch">
                      <Text fontSize="sm" color={useColorModeValue('red.700', 'red.200')}>
                        Permanently delete your account and all associated data. This action cannot be undone.
                      </Text>
                      <Button
                        colorScheme="red"
                        variant="outline"
                        leftIcon={<FaTrash />}
                        onClick={() => {
                          setDeleteConfirmText('')
                          onDeleteAccountOpen()
                        }}
                        w="fit-content"
                        size="sm"
                      >
                        Delete Account
                      </Button>
                    </VStack>
                  </CardBody>
                </Card>
              </TabPanel>
            </TabPanels>
          </Tabs>
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
                      setPhoneNumber((user as any)?.phone || '')
                      setPhoneVerified((user as any)?.phone_verified || false)
                      setProfileImage((user as any)?.profile_picture || null)
                      setEmailNotifications((user as any)?.email_notifications_enabled ?? true)
                      setPushNotifications((user as any)?.push_notifications_enabled ?? true)
                    }
                    setHasUnsavedChanges(false)
                    toast({
                      id: "settings-changes-discarded",
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

      {/* Phone Verification Modal */}
      <Modal
        isOpen={isPhoneModalOpen}
        onClose={() => {
          setPhoneOtpCode('')
          setPhoneOtpSent(false)
          setResendPhoneCooldown(0)
          onPhoneModalClose()
        }}
        size="md"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Verify Phone Number</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel>Phone Number</FormLabel>
                <Input value={phoneNumber} isReadOnly />
                <Text fontSize="xs" color={useColorModeValue('gray.500', 'gray.400')} mt={1}>
                  We will send a 6-digit verification code to this number.
                </Text>
              </FormControl>

              {phoneVerified ? (
                <Badge colorScheme="green" variant="subtle" borderRadius="full" px={3} py={1} w="fit-content">
                  <HStack spacing={1}>
                    <Icon as={FaCheckCircle} boxSize={3} />
                    <Text fontSize="xs">Phone already verified</Text>
                  </HStack>
                </Badge>
              ) : (
                <>
                  <HStack spacing={2}>
                    <Button
                      size="sm"
                      colorScheme="orange"
                      onClick={phoneOtpSent ? handleResendPhoneVerification : handleStartPhoneVerification}
                      isLoading={phoneSendLoading}
                      isDisabled={phoneOtpSent && resendPhoneCooldown > 0}
                    >
                      {phoneOtpSent
                        ? (resendPhoneCooldown > 0 ? `Resend in ${resendPhoneCooldown}s` : 'Resend Code')
                        : 'Send Code'}
                    </Button>
                  </HStack>

                  {phoneOtpSent && (
                    <FormControl>
                      <FormLabel>Verification Code</FormLabel>
                      <Input
                        maxLength={6}
                        value={phoneOtpCode}
                        onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        fontFamily="mono"
                        fontSize="lg"
                        w="140px"
                      />
                    </FormControl>
                  )}
                </>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onPhoneModalClose}>
              Close
            </Button>
            {!phoneVerified && (
              <Button
                colorScheme="green"
                onClick={handleVerifyPhoneCode}
                isLoading={phoneVerifyLoading}
                isDisabled={phoneOtpCode.trim().length !== 6}
              >
                Verify Code
              </Button>
            )}
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

      {/* Delete Account Confirmation Modal */}
      <AlertDialog
        isOpen={isDeleteAccountOpen}
        leastDestructiveRef={deleteAccountCancelRef}
        onClose={onDeleteAccountClose}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Delete Account
            </AlertDialogHeader>
            <AlertDialogBody>
              This will permanently delete your account and all your data. This action cannot be undone.
              <br />
              <br />
              Type <strong>DELETE</strong> to confirm.
              <Input
                mt={3}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
              />
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button
                ref={deleteAccountCancelRef}
                onClick={() => {
                  setDeleteConfirmText('')
                  onDeleteAccountClose()
                }}
              >
                Cancel
              </Button>
              <Button
                colorScheme="red"
                onClick={handleDeleteAccount}
                ml={3}
                isDisabled={deleteConfirmText.trim() !== 'DELETE'}
              >
                Delete Account
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
