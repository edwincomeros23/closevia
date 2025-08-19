import React from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box,
  Flex,
  Text,
  Button,
  HStack,
  Link,
  useColorModeValue,
  useDisclosure,
  IconButton,
  VStack,
  CloseButton,
  Badge,
} from '@chakra-ui/react'
import { HamburgerIcon } from '@chakra-ui/icons'
import { useAuth } from '../contexts/AuthContext'

const Navbar: React.FC = () => {
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const bg = useColorModeValue('white', 'gray.800')
  const color = useColorModeValue('gray.600', 'white')

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const NavLink = ({ children, to }: { children: React.ReactNode; to: string }) => (
    <Link
      as={RouterLink}
      px={2}
      py={1}
      rounded={'md'}
      _hover={{
        textDecoration: 'none',
        bg: useColorModeValue('gray.200', 'gray.700'),
      }}
      to={to}
    >
      {children}
    </Link>
  )

  return (
    <Box bg={bg} px={4} shadow="sm" position="fixed" top={0} left={0} right={0} zIndex={1000}>
      <Flex h={16} alignItems={'center'} justifyContent={'space-between'}>
        <IconButton
          size={'md'}
          icon={isOpen ? <CloseButton /> : <HamburgerIcon />}
          aria-label={'Open Menu'}
          display={{ md: 'none' }}
          onClick={isOpen ? onClose : onOpen}
        />

        <HStack spacing={8} alignItems={'center'}>
          <Box>
            <Link as={RouterLink} to="/" _hover={{ textDecoration: 'none' }}>
              <Text fontSize="xl" fontWeight="bold" color="brand.500">
                Clovia
              </Text>
            </Link>
          </Box>
          <HStack as={'nav'} spacing={4} display={{ base: 'none', md: 'flex' }}>
            <NavLink to="/">Home</NavLink>
            {user && (
              <>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/add-product">Add Product</NavLink>
              </>
            )}
          </HStack>
        </HStack>

        <Flex alignItems={'center'}>
          {user ? (
            <HStack spacing={4}>
              <Badge colorScheme="green" variant="subtle">
                {user.name}
              </Badge>
              <Button
                variant={'outline'}
                colorScheme={'brand'}
                size={'sm'}
                onClick={handleLogout}
              >
                Logout
              </Button>
            </HStack>
          ) : (
            <HStack spacing={4}>
              <Button as={RouterLink} to="/login" variant={'ghost'} colorScheme={'brand'}>
                Login
              </Button>
              <Button as={RouterLink} to="/register" colorScheme={'brand'}>
                Register
              </Button>
            </HStack>
          )}
        </Flex>
      </Flex>

      {/* Mobile menu */}
      {isOpen ? (
        <Box pb={4} display={{ md: 'none' }}>
          <VStack as={'nav'} spacing={4}>
            <NavLink to="/">Home</NavLink>
            {user && (
              <>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/add-product">Add Product</NavLink>
              </>
            )}
          </VStack>
        </Box>
      ) : null}
    </Box>
  )
}

export default Navbar
