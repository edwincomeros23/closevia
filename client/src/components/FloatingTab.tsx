import React from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  HStack,
  Button,
  IconButton,
  Icon,
} from '@chakra-ui/react'
import {
  AddIcon,
} from '@chakra-ui/icons'
import { FaHome } from 'react-icons/fa'
import { FiShoppingBag } from 'react-icons/fi'
import { Badge as CBadge } from '@chakra-ui/react'
import { useRealtime } from '../contexts/RealtimeContext'

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
  const { notificationCount } = useRealtime()

  return (
    <>
      {/* Mobile Bottom Navigation Bar - Floating Tab */}
      <Box
        position="fixed"
        bottom="env(safe-area-inset-bottom, 16px)"
        mb={12}
        left="50%"
        transform="translateX(-50%)"
        display={{ base: 'block', md: 'none' }}
        zIndex={200}
        boxShadow="0 4px 20px rgba(0,0,0,0.15)"
        borderRadius="full"
        overflow="hidden"
      >
        <HStack
          spacing={0}
          h="48px"
          justify="space-around"
          align="center"
          bg="rgba(255, 255, 255, 0.2)"
          backdropFilter="blur(10px)"
          border="1px solid rgba(255, 255, 255, 0.3)"
        >
          {/* Dashboard Button */}
          <Box position="relative" h="full" flex={1}>
            <Button
              as={RouterLink}
              to={dashboardLink}
              variant="ghost"
              h="full"
              w="full"
              bg="brand.500"
              flexDirection="column"
              gap={1}
              borderRadius="none"
              transition="all 0.2s ease"
              _hover={{
                bg: 'brand.600',
                transform: 'translateY(-1px)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.24)',
              }}
              _active={{
                bg: 'brand.700',
                transform: 'translateY(0)',
              }}
            >
              <Icon as={FiShoppingBag} boxSize={6} color="white" />
            </Button>
            {notificationCount > 0 && (
              <CBadge
                position="absolute"
                top="4px"
                right="calc(50% - 16px)"
                colorScheme="red"
                borderRadius="full"
                fontSize="0.6em"
                px={1.5}
                zIndex={1}
              >
                {notificationCount}
              </CBadge>
            )}
          </Box>

          {/* Home Button (Primary/Center) */}
          <Button
            as={RouterLink}
            to={homeLink}
            h="full"
            flex={1}
            flexDirection="column"
            gap={1}
            borderRadius="none"
            bg="brand.500"
            px={4}
            color="white"
            transition="all 0.2s ease"
            _hover={{
              bg: 'brand.600',
              transform: 'translateY(-1px)',
              boxShadow: '0 8px 20px rgba(49, 151, 149, 0.35)',
            }}
            _active={{
              bg: 'brand.700',
              transform: 'translateY(0)',
            }}
            position="relative"
            boxShadow="0 4px 12px rgba(49, 151, 149, 0.3)"
          >
            <Icon as={FaHome} boxSize={7} />
          </Button>

          {/* Add Product Button */}
          {showAddButton && (
            <Button
              as={RouterLink}
              to={addProductLink}
              variant="ghost"
              h="full"
              flex={1}
              bg="brand.500"
              flexDirection="column"
              gap={1}
              px={4}
              borderRadius="none"
              transition="all 0.2s ease"
              _hover={{
                bg: 'brand.600',
                transform: 'translateY(-1px)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.24)',
              }}
              _active={{
                bg: 'brand.700',
                transform: 'translateY(0)',
              }}
            >
              <Icon as={AddIcon} boxSize={6} color="white" />
            </Button>
          )}
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
