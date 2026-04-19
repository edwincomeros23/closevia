import React, { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  HStack,
  Button,
  IconButton,
  Icon,
  VStack,
} from '@chakra-ui/react'
import {
  AddIcon,
  HamburgerIcon,
} from '@chakra-ui/icons'
import { FaHome, FaBell } from 'react-icons/fa'
import { FiShoppingBag } from 'react-icons/fi'
import { Badge as CBadge } from '@chakra-ui/react'
import { useRealtime } from '../contexts/RealtimeContext'
import { useMobileNav } from '../contexts/MobileNavContext'
import { useNavigate } from 'react-router-dom'

interface FloatingTabProps {
  dashboardLink?: string
  homeLink?: string
  addProductLink?: string
  showAddButton?: boolean
}

const FloatingTab: React.FC<FloatingTabProps> = ({
  dashboardLink = '/dashboard',
  homeLink = '/home',
  addProductLink = '/add-product',
  showAddButton = true,
}) => {
  const { notificationCount, offerCount } = useRealtime()
  const { onOpen: openMobileNav } = useMobileNav()
  const navigate = useNavigate()

  return (
    <>
      {/* Mobile Bottom Navigation Bar - Floating Tab */}
      <Box
        position="fixed"
        bottom="env(safe-area-inset-bottom, 16px)"
        mb={8}
        left="50%"
        transform="translateX(-50%)"
        display={{ base: 'block', md: 'none' }}
        zIndex={200}
        boxShadow="0 8px 32px rgba(0,0,0,0.12)"
        borderRadius="full"
        overflow="hidden"
      >
        <HStack
          spacing={0}
          h="64px"
          justify="space-between"
          align="center"
          bg="rgba(255, 255, 255, 0.95)"
          backdropFilter="blur(20px)"
          border="1px solid rgba(255, 255, 255, 0.4)"
          px={2}
          py={2}
        >
          {/* Home Button */}
          <IconButton
            as={RouterLink}
            to={homeLink}
            aria-label="Home"
            icon={<FaHome />}
            h="full"
            w="56px"
            flexShrink={0}
            bg="transparent"
            color="brand.500"
            borderRadius="full"
            variant="ghost"
            fontSize="20px"
            transition="all 0.3s ease"
            _hover={{
              bg: 'rgba(49, 151, 149, 0.1)',
              color: 'brand.600',
              transform: 'scale(1.1)',
            }}
            _active={{
              bg: 'rgba(49, 151, 149, 0.2)',
              transform: 'scale(0.95)',
            }}
          />

          {/* Dashboard Button */}
          <Box position="relative">
            <IconButton
              as={RouterLink}
              to={dashboardLink}
              aria-label="Dashboard"
              icon={<FiShoppingBag />}
              h="full"
              w="56px"
              flexShrink={0}
              bg="transparent"
              color="brand.500"
              borderRadius="full"
              variant="ghost"
              fontSize="20px"
              transition="all 0.3s ease"
              _hover={{
                bg: 'rgba(49, 151, 149, 0.1)',
                color: 'brand.600',
                transform: 'scale(1.1)',
              }}
              _active={{
                bg: 'rgba(49, 151, 149, 0.2)',
                transform: 'scale(0.95)',
              }}
            />
            {offerCount > 0 && (
              <CBadge
                position="absolute"
                top="-4px"
                right="-4px"
                colorScheme="red"
                borderRadius="full"
                fontSize="0.7em"
                px={1}
                zIndex={1}
              >
                {offerCount}
              </CBadge>
            )}
          </Box>

          {/* Add Product Button - LARGE CIRCULAR CENTER */}
          {showAddButton && (
            <Button
              as={RouterLink}
              to={addProductLink}
              h="72px"
              w="72px"
              flexShrink={0}
              bg="linear(to-br, brand.500, teal.400)"
              color="white"
              borderRadius="full"
              boxShadow="0 6px 24px rgba(49, 151, 149, 0.4)"
              transition="all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
              display="flex"
              alignItems="center"
              justifyContent="center"
              _hover={{
                transform: 'translateY(-4px) scale(1.08)',
                boxShadow: '0 12px 32px rgba(49, 151, 149, 0.5)',
                bg: 'linear(to-br, brand.600, teal.500)',
              }}
              _active={{
                transform: 'translateY(-2px) scale(1.02)',
                boxShadow: '0 8px 24px rgba(49, 151, 149, 0.4)',
              }}
              position="relative"
            >
              <Icon as={AddIcon} boxSize={10} color="green.500" strokeWidth="3" />
            </Button>
          )}

          {/* Notification Button */}
          <Box position="relative">
            <IconButton
              aria-label="Notifications"
              icon={<FaBell />}
              h="full"
              w="56px"
              flexShrink={0}
              bg="transparent"
              color="brand.500"
              borderRadius="full"
              variant="ghost"
              fontSize="20px"
              transition="all 0.3s ease"
              _hover={{
                bg: 'rgba(49, 151, 149, 0.1)',
                color: 'brand.600',
                transform: 'scale(1.1)',
              }}
              _active={{
                bg: 'rgba(49, 151, 149, 0.2)',
                transform: 'scale(0.95)',
              }}
              onClick={() => navigate('/notifications')}
            />
            {notificationCount > 0 && (
              <CBadge
                position="absolute"
                top="-4px"
                right="-4px"
                colorScheme="red"
                borderRadius="full"
                fontSize="0.7em"
                px={1}
                zIndex={1}
              >
                {notificationCount}
              </CBadge>
            )}
          </Box>

          {/* Hamburger Menu Button */}
          <IconButton
            aria-label="Menu"
            icon={<HamburgerIcon />}
            h="full"
            w="56px"
            flexShrink={0}
            bg="transparent"
            color="brand.500"
            borderRadius="full"
            variant="ghost"
            fontSize="20px"
            transition="all 0.3s ease"
            _hover={{
              bg: 'rgba(49, 151, 149, 0.1)',
              color: 'brand.600',
              transform: 'scale(1.1)',
            }}
            _active={{
              bg: 'rgba(49, 151, 149, 0.2)',
              transform: 'scale(0.95)',
            }}
            onClick={openMobileNav}
          />
        </HStack>
      </Box>

      {/* Floating Add Product FAB - Desktop/Tablet */}
      {showAddButton && (
        <IconButton
          as={RouterLink}
          to={addProductLink}
          aria-label="Add product"
          icon={<AddIcon />}
          position="fixed"
          bottom={12}
          right={6}
          h={14}
          w={14}
          bgGradient="linear(to-br, brand.500, teal.400)"
          color="white"
          borderRadius="full"
          zIndex={200}
          boxShadow="lg"
          display={{ base: 'none', md: 'flex' }}
          transition="all 0.2s ease"
          _hover={{
            transform: 'translateY(-2px) scale(1.05)',
            boxShadow: '0 14px 24px rgba(0, 0, 0, 0.2)',
            bgGradient: 'linear(to-br, brand.600, teal.500)',
          }}
          _active={{
            transform: 'translateY(0) scale(1.01)',
          }}
        />
      )}
    </>
  )
}

export default FloatingTab
