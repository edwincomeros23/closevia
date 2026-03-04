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
}

const FloatingTab: React.FC<FloatingTabProps> = ({
  dashboardLink = '/dashboard',
  homeLink = '/home',
  addProductLink = '/add-product',
}) => {
  const { notificationCount } = useRealtime()

  return (
    <>
      {/* Mobile Bottom Navigation Bar - Floating Tab */}
      <Box
        position="fixed"
        bottom="44px"
        left="50%"
        transform="translateX(-50%)"
        display={{ base: 'block', sm: 'none' }}
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
              _hover={{ bg: 'gray.50' }}
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
            px={7}
            color="white"
            _hover={{ bg: 'brand.600' }}
            _active={{ bg: 'brand.700' }}
            position="relative"
            boxShadow="0 4px 12px rgba(49, 151, 149, 0.3)"
          >
            <Icon as={FaHome} boxSize={7} />
          </Button>

          {/* Add Product Button */}
          <Button
            as={RouterLink}
            to={addProductLink}
            variant="ghost"
            h="full"
            flex={1}
            bg="brand.500"
            flexDirection="column"
            gap={1}
            px={7}
            borderRadius="none"
            _hover={{ bg: 'gray.50' }}
          >
            <Icon as={AddIcon} boxSize={6} color="white" />
          </Button>
        </HStack>
      </Box>

      {/* Floating Add Product FAB - Desktop/Tablet */}
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
        display={{ base: 'none', sm: 'flex' }}
        _hover={{ transform: 'scale(1.05)' }}
      />
    </>
  )
}

export default FloatingTab
