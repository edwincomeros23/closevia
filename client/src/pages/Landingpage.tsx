import "@fontsource/prata/400.css";   // regular

import React from 'react'
import {
  Box, Container, VStack, Heading, Text, Button,
  Flex, HStack, Image, IconButton, useDisclosure,
  Drawer, DrawerBody, DrawerHeader, DrawerOverlay,
  DrawerContent, DrawerCloseButton, Link, Stack
} from '@chakra-ui/react'
import { HamburgerIcon } from '@chakra-ui/icons'
import { useNavigate } from 'react-router-dom'
import '@fontsource/prata'

const Navbar = ({ navigate }: { navigate: ReturnType<typeof useNavigate> }) => {
  const { isOpen, onOpen, onClose } = useDisclosure()

  const NavLink = ({ children }: { children: string }) => (
    <Link
      px={2}
      py={1}
      color="white"
      _hover={{ textDecoration: 'none', color: 'brand.200' }}
      href={`#${children.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {children}
    </Link>
  )

  return (
    <Box position="fixed" top={0} left={0} right={0} zIndex={3}>
      <Flex
        as="nav"
        h={{ base: '64px', md: '72px', lg: '80px' }}
        align="center"
        justify="space-between"
        padding={{ base: '0 1rem', md: '0 2rem', lg: '0 3rem', xl: '0 4rem' }}
        maxW={{ xl: '1920px' }}
        mx="auto"
      >
        {/* Left Links - Desktop */}
        <HStack spacing={{ md: 6, lg: 8 }} display={{ base: 'none', md: 'flex' }}>
          <NavLink>Home</NavLink>
          <NavLink>How It Works</NavLink>
          <NavLink>Features</NavLink>
        </HStack>

        {/* Center Logo */}
        <HStack spacing={2} position="absolute" left="50%" transform="translateX(-50%)" align="center">
          <Image
            src="/Group 224.png"
            alt="Clovia Logo"
            h={{ base: '40px', md: '46px', lg: '50px' }}
            objectFit="contain"
          />
        </HStack>

        {/* Right Links - Desktop */}
        <HStack spacing={{ md: 6, lg: 8 }} display={{ base: 'none', md: 'flex' }}>
          <NavLink>Testimonials</NavLink>
          <NavLink>FAQs</NavLink>
          <NavLink>About Us</NavLink>
          <Image
            src="/logoimage.png"
            alt="Logo"
            h="35px"
            objectFit="contain"
            cursor="pointer"
            _hover={{
              transform: 'scale(1.05)',
              transition: 'all 0.2s ease',
            }}
            onClick={() => navigate('/company')}
          />
          <Button
            colorScheme="brand"
            size="md"
            borderRadius="full"
            px={6}
            _hover={{
              transform: 'translateY(-2px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            Trade Now
          </Button>
        </HStack>

        {/* Mobile Menu Button */}
        <IconButton
          display={{ base: 'flex', md: 'none' }}
          aria-label="Open menu"
          icon={<HamburgerIcon />}
          onClick={onOpen}
          variant="ghost"
          color="white"
        />

        {/* ECODE Logo - Mobile Right */}
        <Image
          src="/logoimage.png"
          alt="ECODE Logo"
          h="35px"
          objectFit="contain"
          display={{ base: 'block', md: 'none' }}
          ml="auto"
          mr={2}
        />

        {/* Mobile Drawer */}
        <Drawer isOpen={isOpen} placement="right" onClose={onClose}>
          <DrawerOverlay />
          <DrawerContent>
            <DrawerCloseButton />
            <DrawerHeader display="flex" alignItems="center" justifyContent="space-between" gap={2}>
              <Box>Menu</Box>
              <Image
                src="/logoimage.png"
                alt="ECODE Logo"
                h="28px"
                objectFit="contain"
                cursor="pointer"
                _hover={{
                  transform: 'scale(1.05)',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => {
                  navigate('/company')
                  onClose()
                }}
              />
            </DrawerHeader>
            <DrawerBody>
              <Stack spacing={4}>
                <Link href="#home">Home</Link>
                <Link href="#how-it-works">How It Works</Link>
                <Link href="#features">Features</Link>
                <Link href="#testimonials">Testimonials</Link>
                <Link href="#faqs">FAQs</Link>
                <Link href="#about-us">About Us</Link>
                <Button colorScheme="brand" w="full">
                  Trade Now
                </Button>
              </Stack>
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      </Flex>
    </Box>
  )
}

const LandingPage: React.FC = () => {
  const navigate = useNavigate()

  const handleGetStarted = () => {
    localStorage.setItem('has_visited', 'true')
    navigate('/home')
  }

  return (
    <Box
      minH="100vh"
      w="100vw"
      bgImage="/bgphoto.jpg"
      bgSize="cover"
      bgPosition="center"
      bgRepeat="no-repeat"
      position="relative"
      overflow="hidden"
    >
      <Box
        position="absolute"
        top="0"
        left="0"
        right="0"
        bottom="0"
        bg="rgba(0, 0, 0, 0.3)"
        zIndex={1}
      />
      
      <Navbar navigate={navigate} />
      
      {/* Main content - desktop: larger container and typography */}
      <Container
        maxW={{ base: 'container.sm', md: 'container.md', lg: 'container.lg', xl: 'container.xl', '2xl': '1400px' }}
        px={{ base: 4, md: 6, lg: 8, xl: 10 }}
        position="relative"
        zIndex={2}
        textAlign="center"
        height="100vh"
        display="flex"
        alignItems="center"
      >
        <VStack 
          spacing={{ base: 2, md: 3, lg: 5, xl: 6 }} 
          align="center"
          maxW={{ base: '90%', md: '800px', lg: '900px', xl: '1000px' }}
          mx="auto"
          mt={{ base: 16, md: 20, lg: 24 }}
        >
          <Heading 
            as="h1" 
            size={{ base: 'xl', md: '2xl', lg: '3xl', xl: '4xl' }}
            color="white" 
            fontWeight="bold"
            lineHeight="1.2"
            fontFamily="Prata, serif"
          >
            Trade what you have, find what you need
            all within your COMMUNITY
          </Heading>
          
          <Text 
            fontSize={{ base: 'md', md: 'lg', lg: 'xl', xl: 'xl' }}
            color="white" 
            textShadow="1px 1px 4px rgba(0,0,0,0.7)"
            maxW={{ base: '100%', md: '600px', lg: '700px' }}
            lineHeight="1.6"
            px={{ base: 2, md: 0 }}
          >
            Your one-stop platform for seamless item exchanges. Discover, trade, and connect with others in your community.
          </Text>

          <Image
            src="/Group 9.svg"
            alt="Group 9 Image"
            maxW={{ base: '300px', md: '400px', lg: '700px', xl: '900px', '2xl': '1000px' }}
            w="100%"
            objectFit="contain"
            mt={{ base: 4, md: -6, lg: -4 }}
          />
          
          <Button
            size={{ base: 'sm', md: 'md', lg: 'lg', xl: 'lg' }}
            colorScheme="brand"
            onClick={handleGetStarted}
            px={{ base: 4, md: 6, lg: 8, xl: 10 }}
            py={{ base: 2, md: 3, lg: 4 }}
            fontSize={{ base: 'sm', md: 'md', lg: 'lg', xl: 'lg' }}
            fontWeight="bold"
            borderRadius="full"
            bg="brand.500"
            color="white"
            position="absolute"
            bottom={{ base: '10%', md: '12%', lg: '10%' }}
            left="50%"
            transform="translateX(-50%)"
            _hover={{
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              bg: 'brand.600'
            }}
            transition="all 0.3s ease"
            minW={{ base: '150px', md: '180px', lg: '200px' }}
            h={{ base: '35px', md: '40px', lg: '45px', xl: '48px' }}
          >
            Get Started
          </Button>
        </VStack>
      </Container>
    </Box>
  )
}

export default LandingPage