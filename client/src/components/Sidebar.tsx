import React from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import {
  Box,
  VStack,
  IconButton,
  Tooltip,
  useColorModeValue,
  Image,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerBody,
  DrawerHeader,
  Button,
} from '@chakra-ui/react'
import {
  ViewIcon,
  AddIcon,
  BellIcon,
  InfoIcon,
  SettingsIcon,
  HamburgerIcon,
} from '@chakra-ui/icons'

const Sidebar: React.FC = () => {
  const location = useLocation()
  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const iconColor = useColorModeValue('gray.600', 'gray.300')
  const activeIconColor = useColorModeValue('brand.500', 'brand.300')
  const { isOpen, onOpen, onClose } = useDisclosure()

  const navItems = [
    { icon: InfoIcon, label: 'Home', path: '/' },
    { icon: ViewIcon, label: 'Dashboard', path: '/dashboard' },
    { icon: AddIcon, label: 'Add Product', path: '/add-product' },
    { icon: BellIcon, label: 'Notifications', path: '/notifications' },
    { icon: SettingsIcon, label: 'Settings', path: '/settings' },
  ]
  
  return (
    <>
      {/* Mobile hamburger button - visible only on small screens */}
      <IconButton
        aria-label="Open menu"
        icon={<HamburgerIcon />}
        display={{ base: 'inline-flex', lg: 'none' }}
        position="fixed"
        left={2}
        top={2}
        zIndex={1100}
        onClick={onOpen}
        size="md"
        variant="ghost"
      />

      {/* Drawer for mobile */}
      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>Clovia</DrawerHeader>
          <DrawerBody>
            <VStack spacing={4} align="stretch" mt={4}>
              <Box p={2}>
                <Image
                  src="/logo.svg"
                  alt="Clovia"
                  w="35px"
                  h="35px"
                  objectFit="contain"
                  cursor="pointer"
                  onClick={() => {
                    window.location.href = '/'
                    onClose()
                  }}
                />
              </Box>

              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <Button
                    key={item.path}
                    as={RouterLink}
                    to={item.path}
                    leftIcon={<Icon />}
                    variant="ghost"
                    justifyContent="flex-start"
                    onClick={onClose}
                  >
                    {item.label}
                  </Button>
                )
              })}
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Desktop sidebar - hidden on small screens */}
      <Box
        position="fixed"
        left={0}
        top={0}
        h="100vh"
        w="70px"
        bg={bgColor}
        borderRight="1px"
        borderColor={borderColor}
        zIndex={1000}
        py={4}
        display={{ base: 'none', lg: 'block' }} // hide on small screens
      >
        <VStack spacing={5} align="center">
          {/* Logo/Brand */}
          <Box mb={8} p={2}>
            <Image
              src="/logo.svg"
              alt="Clovia"
              w="35px"
              h="35px"
              objectFit="contain"
              cursor="pointer"
              onClick={() => (window.location.href = '/')}
              _hover={{ opacity: 0.8 }}
              transition="opacity 0.2s"
            />
          </Box>

          {/* Navigation Items */}
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            const Icon = item.icon

            return (
              <Tooltip key={item.path} label={item.label} placement="right" hasArrow>
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
                  transition="all 0.2s"
                />
              </Tooltip>
            )
          })}
        </VStack>
      </Box>
    </>
  )
}

export default Sidebar