import React, { useMemo, useCallback } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Box,
  VStack,
  IconButton,
  Tooltip,
  useColorModeValue,
  useColorMode,
  Image,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerBody,
  DrawerHeader,
  Button,
  Divider,
  Avatar,
} from '@chakra-ui/react'
import {
  AddIcon,
  BellIcon,
  SettingsIcon,
  RepeatIcon,
} from '@chakra-ui/icons'
import { useMobileNav } from '../contexts/MobileNavContext'
import { Badge as CBadge } from '@chakra-ui/react'
import { useRealtime } from '../contexts/RealtimeContext'
import { useAuth } from '../contexts/AuthContext'
import { FaHome, FaPlus, FaStar } from 'react-icons/fa'
import { FiGrid, FiHeart, FiLogOut, FiUser, FiBell, FiSettings } from 'react-icons/fi'
import { getImageUrl } from '../utils/imageUtils'
import VerifiedAvatar from './VerifiedAvatar'

const Sidebar: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { colorMode } = useColorMode()
  const logo = colorMode === 'dark' ? '/logo1.svg' : '/logo.svg'
  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const iconColor = useColorModeValue('gray.600', 'gray.300')
  const activeIconColor = useColorModeValue('brand.500', 'brand.300')
  const { isOpen, onOpen, onClose } = useMobileNav()
  const { notificationCount } = useRealtime()
  const { user, logout } = useAuth()

  // Memoize callback handlers to prevent unnecessary re-renders
  const handleLogoClick = useCallback(() => {
    navigate('/landing')
    onClose()
  }, [navigate, onClose])

  const handleCompanyClick = useCallback(() => {
    navigate('/company')
    onClose()
  }, [navigate, onClose])

  const handleProfileClick = useCallback(() => {
    onClose()
  }, [onClose])

  const handleLogout = useCallback(async () => {
    onClose()
    await logout()
    navigate('/login')
  }, [onClose, logout, navigate])

  // Memoize desktop navigation items to prevent recalculation
  const desktopNavItems = useMemo(() => {
    const items = [
      { icon: FaHome, label: 'Home', path: '/home' },
    ]
    if (user) {
      if (user?.role === 'admin') {
        items.push({ icon: FaStar, label: 'Admin', path: '/admin' })
      }
      items.push(
        { icon: FiGrid, label: 'Dashboard', path: '/dashboard' },
        { icon: FaPlus, label: 'Add Product', path: '/add-product' },
        { icon: FiHeart, label: 'Saved', path: '/saved-products' },
        { icon: FiBell, label: 'Notifications', path: '/notifications' }
      )
    }
    return items
  }, [user])

  // Memoize mobile navigation items to prevent recalculation
  const mobileNavItems = useMemo(() => {
    if (user) {
      const items: { icon: any; label: string; path: string }[] = []
      if (user?.role === 'admin') {
        items.push({ icon: FaStar, label: 'Admin', path: '/admin' })
      }
      items.push(
        { icon: FiHeart, label: 'Saved', path: '/saved-products' },
        { icon: FiBell, label: 'Notifications', path: '/notifications' },
        { icon: FiSettings, label: 'Settings', path: '/settings' },
      )
      return items
    }
    return [
      { icon: FaHome, label: 'Home', path: '/home' },
      { icon: FiUser, label: 'Login', path: '/login' },
    ]
  }, [user])

  return (
    <>
      {/* Drawer for mobile */}
      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent display="flex" flexDirection="column" h="100%">
          <DrawerCloseButton position="absolute" right={3} top={3} zIndex={10} />

          {/* Clean Header - Just Logo */}
          <DrawerHeader borderBottom="2px solid" borderColor={borderColor} py={4}>
            <Box display="flex" alignItems="center" gap={2}>
              <Image
                src={logo}
                alt="Clovia"
                w="40px"
                h="40px"
                objectFit="contain"
                cursor="pointer"
                loading="lazy"
                onClick={handleLogoClick}
                _hover={{ opacity: 0.8 }}
              />
              <Box fontWeight="bold" fontSize="lg">Clovia</Box>
            </Box>
          </DrawerHeader>

          {/* Main Content Area */}
          <DrawerBody flex={1} overflowY="auto" pb={user ? 4 : 4} px={0}>
            <VStack spacing={0} align="stretch">

              {/* User Profile Card - Only when logged in */}
              {user && (
                <Box
                  bg={useColorModeValue('brand.50', 'gray.700')}
                  p={4}
                  mb={4}
                  borderRadius="lg"
                  mx={4}
                  mt={4}
                >
                  <Box display="flex" alignItems="center" gap={3} mb={3}>
                    <VerifiedAvatar
                      size="lg"
                      name={user.name || 'User'}
                      src={getImageUrl(user.profile_picture)}
                      isVerified={user?.verification_status === 'verified' || user?.verified || false}
                    />
                    <Box flex={1}>
                      <Box fontWeight="bold" fontSize="md" noOfLines={1}>{user.name}</Box>
                      <Box fontSize="xs" color="gray.500" noOfLines={1}>{user.email}</Box>
                    </Box>
                  </Box>
                  <Button
                    as={RouterLink}
                    to={`/users/${(user as any).slug || user.id}`}
                    size="sm"
                    w="full"
                    colorScheme="brand"
                    variant="outline"
                    onClick={handleProfileClick}
                  >
                    View Profile
                  </Button>
                </Box>
              )}

              {/* ECODE Branding */}
              <Box
                px={4}
                py={2}
                mb={3}
                display="flex"
                alignItems="center"
                gap={2}
                cursor="pointer"
                onClick={handleCompanyClick}
                _hover={{ opacity: 0.8 }}
                justifyContent="flex-start"
              >
                <Image
                  src="/logoimage.png"
                  alt="ECODE"
                  h="24px"
                  objectFit="contain"
                  loading="lazy"
                />
                <Box fontSize="xs" color="gray.500">Powered by ECODE</Box>
              </Box>

              {/* Menu Items */}
              <Divider my={2} />
              <VStack spacing={1} align="stretch" px={4}>
                {mobileNavItems.map((item: any) => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.path
                  const profileIcon = item.isProfile && user?.profile_picture
                    ? <VerifiedAvatar size="xs" name={user.name || 'User'} src={getImageUrl(user.profile_picture)} isVerified={user?.verification_status === 'verified' || user?.verified || false} />
                    : <Icon size={20} />

                  return (
                    <Button
                      key={item.path}
                      as={RouterLink}
                      to={item.path}
                      leftIcon={profileIcon}
                      variant="ghost"
                      justifyContent="flex-start"
                      onClick={onClose}
                      bg={isActive ? 'brand.50' : 'transparent'}
                      color={isActive ? 'brand.600' : 'inherit'}
                      fontWeight={isActive ? '600' : '400'}
                      minH="48px"
                      w="full"
                      transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                      _hover={{
                        bg: 'gray.100',
                        transform: 'translateX(4px)',
                      }}
                      _active={{
                        transform: 'scale(0.98)',
                        bg: 'gray.200',
                      }}
                      _focus={{
                        boxShadow: '0 0 0 3px rgba(66, 153, 225, 0.1)',
                      }}
                    >
                      {item.label}
                    </Button>
                  )
                })}
              </VStack>
            </VStack>
          </DrawerBody>

          {/* Fixed Logout Button at Bottom - only when logged in */}
          {user && (
            <Box p={4} borderTop="2px solid" borderColor={borderColor}>
              <Button
                w="full"
                colorScheme="red"
                variant="solid"
                leftIcon={<FiLogOut />}
                onClick={handleLogout}
                size="md"
                minH="48px"
                transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                _hover={{
                  transform: 'translateY(-2px)',
                  boxShadow: 'md',
                }}
                _active={{
                  transform: 'scale(0.98)',
                }}
              >
                Logout
              </Button>
            </Box>
          )}
        </DrawerContent>
      </Drawer>

      {/* Desktop sidebar - hidden on small screens */}
      <Box
        position="fixed"
        left={0}
        top={0}
        h="100vh"
        w="70px"
        borderRight="1px"
        borderColor={borderColor}
        zIndex={1000}
        py={16}
        bg="white"
        display={{ base: 'none', lg: 'block' }} // hide on small screens
      >
        <Box h="100%" display="flex" flexDirection="column" justifyContent="space-between" alignItems="center">
          <VStack spacing={5} align="center" mt={2}>
            {/* Logo/Brand Section */}
            <Box mb={2} p={2} display="flex" flexDirection="column" alignItems="center" gap={2}>
              <Image
                src={logo}
                alt="Clovia"
                w="35px"
                h="35px"
                objectFit="contain"
                cursor="pointer"
                onClick={handleLogoClick}
                _hover={{ opacity: 0.8 }}
                transition="opacity 0.2s"
              />
              {/* <Image
                src="/logoimage.png"
                alt="ECODE"
                h="30px"
                objectFit="contain"
                cursor="pointer"
                _hover={{ opacity: 0.8 }}
                onClick={() => navigate('/company')}
                transition="opacity 0.2s"
              /> */}
            </Box>

            {/* Navigation Items (exclude Settings) */}
            {desktopNavItems.map((item) => {
              const isActive = location.pathname === item.path
              const Icon = item.icon
              return (
                <Tooltip key={item.path} label={item.label} placement="right" hasArrow>
                  <Box position="relative" display="inline-block">
                    <IconButton
                      as={RouterLink}
                      to={item.path}
                      aria-label={item.label}
                      icon={<Icon />}
                      variant="ghost"
                      size="lg"
                      color={isActive ? activeIconColor : iconColor}
                      bg={isActive ? 'brand.50' : 'transparent'}
                      _hover={{
                        bg: isActive ? 'brand.100' : 'gray.100',
                        color: isActive ? activeIconColor : 'gray.700',
                      }}
                      _active={{
                        bg: isActive ? 'brand.200' : 'gray.200',
                      }}
                      borderRadius="xl"
                      transition="all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)"
                    />
                    {(item.label === 'Notifications' && notificationCount > 0) && (
                      <CBadge position="absolute" right={0} top={0} transform="translate(30%, -30%)" colorScheme="red" borderRadius="full">{notificationCount}</CBadge>
                    )}
                  </Box>
                </Tooltip>
              )
            })}
          </VStack>

          {/* Settings at the bottom - only when logged in */}
          {user && (
            <Box mb={4}>
              <Tooltip label="Settings" placement="right" hasArrow>
                <IconButton
                  as={RouterLink}
                  to="/settings"
                  aria-label="Settings"
                  icon={<SettingsIcon />}
                  variant="ghost"
                  size="lg"
                  color={location.pathname === '/settings' ? activeIconColor : iconColor}
                  bg={location.pathname === '/settings' ? 'brand.50' : 'transparent'}
                  _hover={{ bg: location.pathname === '/settings' ? 'brand.100' : 'gray.100' }}
                  borderRadius="xl"
                  transition="all 0.2s"
                />
              </Tooltip>
            </Box>
          )}
        </Box>
      </Box>
    </>
  )
}

export default Sidebar