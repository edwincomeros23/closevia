import React from 'react'
import {
  Box, Container, VStack, Heading, Text, Button,
  Flex, HStack, Image, IconButton, useDisclosure,
  Drawer, DrawerBody, DrawerHeader, DrawerOverlay,
  DrawerContent, DrawerCloseButton, Link, Stack,
  SimpleGrid, Icon, Avatar,
} from '@chakra-ui/react'
import { HamburgerIcon } from '@chakra-ui/icons'
import { useNavigate } from 'react-router-dom'

import { FiArrowRight, FiPhone, FiPlay, FiStar, FiRefreshCw, FiShield } from 'react-icons/fi'
import { FaLeaf, FaHandshake, FaBoxOpen } from 'react-icons/fa'

/* ─── color tokens (aligned with homepage teal/cream theme) ─── */
const C = {
  dark: '#1d4e4f',       // brand.800 - dark teal for hero overlay & dark sections
  mid: '#285e61',        // brand.700 - medium teal for alternate sections
  card: '#2c7a7b',       // brand.600 - card backgrounds in dark sections
  accent: '#319795',     // brand.500 - primary accent (teal, same as homepage)
  accentLight: '#38b2ac', // brand.400 - hover state for accent
  cream: '#FFFDF1',      // same cream background as homepage
  white: '#FFFFFF',
  textMuted: '#b2f5ea',  // brand.100 - muted text on dark backgrounds
  textDark: '#285e61',   // brand.700 - text on light backgrounds
}

/* ─── Navbar ─── */
const Navbar = ({ navigate, onGetStarted }: { navigate: ReturnType<typeof useNavigate>; onGetStarted: () => void }) => {
  const { isOpen, onOpen, onClose } = useDisclosure()

  const navItems = ['Home', 'About', 'How It Works', 'Features', 'Contact Us']

  return (
    <Box position="fixed" top={0} left={0} right={0} zIndex={50} bg={C.dark} borderBottom="1px solid" borderColor="whiteAlpha.100">
      <Flex
        as="nav"
        h={{ base: '64px', md: '72px' }}
        align="center"
        justify="space-between"
        px={{ base: 4, md: 8, lg: 12 }}
        maxW="1400px"
        mx="auto"
      >
        {/* Logo */}
        <HStack spacing={2}>
          <Icon as={FaLeaf} color={C.accentLight} boxSize={6} />
          <Text fontSize="xl" fontWeight="bold" color={C.white}>
            Clovia<Text as="span" color={C.accentLight}>PH</Text>
          </Text>
        </HStack>

        {/* Desktop Nav */}
        <HStack spacing={8} display={{ base: 'none', md: 'flex' }}>
          {navItems.map((item) => (
            <Link
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
              color={C.textMuted}
              fontSize="sm"
              fontWeight="medium"
              _hover={{ color: C.accentLight, textDecoration: 'none' }}
              transition="color 0.2s"
            >
              {item}
            </Link>
          ))}
        </HStack>

        {/* CTA */}
        <HStack spacing={4}>
          <Button
            display={{ base: 'none', md: 'flex' }}
            bg={C.accent}
            color={C.white}
            size="sm"
            borderRadius="full"
            px={6}
            fontWeight="bold"
            _hover={{ bg: C.accentLight, transform: 'translateY(-1px)' }}
            transition="all 0.2s"
            onClick={onGetStarted}
          >
            Sign Up Now
          </Button>
          <IconButton
            display={{ base: 'flex', md: 'none' }}
            aria-label="Menu"
            icon={<HamburgerIcon />}
            onClick={onOpen}
            variant="ghost"
            color={C.white}
            _hover={{ bg: 'whiteAlpha.100' }}
          />
        </HStack>

        {/* Mobile Drawer */}
        <Drawer isOpen={isOpen} placement="right" onClose={onClose}>
          <DrawerOverlay />
          <DrawerContent bg={C.dark}>
            <DrawerCloseButton color={C.white} />
            <DrawerHeader>
              <HStack spacing={2}>
                <Icon as={FaLeaf} color={C.accentLight} boxSize={5} />
                <Text color={C.white}>CloviaPH</Text>
              </HStack>
            </DrawerHeader>
            <DrawerBody>
              <Stack spacing={4}>
                {navItems.map((item) => (
                  <Link
                    key={item}
                    href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                    color={C.textMuted}
                    _hover={{ color: C.accentLight }}
                    onClick={onClose}
                  >
                    {item}
                  </Link>
                ))}
                <Button bg={C.accent} color={C.white} w="full" borderRadius="full" onClick={() => { onClose(); onGetStarted() }}>
                  Sign Up Now
                </Button>
              </Stack>
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      </Flex>
    </Box>
  )
}

/* ─── Stat Counter Card ─── */
const StatCard = ({ value, label }: { value: string; label: string }) => (
  <VStack spacing={0}>
    <Text fontSize={{ base: '2xl', md: '3xl' }} fontWeight="bold" color={C.accentLight}>
      {value}
    </Text>
    <Text fontSize="xs" color={C.textMuted} textTransform="uppercase" letterSpacing="wider">
      {label}
    </Text>
  </VStack>
)

/* ─── Service Card ─── */
const ServiceCard = ({ icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) => (
  <VStack
    bg={C.card}
    borderRadius="xl"
    p={6}
    spacing={4}
    align="center"
    textAlign="center"
    border="1px solid"
    borderColor="whiteAlpha.100"
    _hover={{ borderColor: C.accentLight, transform: 'translateY(-4px)' }}
    transition="all 0.3s"
  >
    <Flex
      w={14}
      h={14}
      borderRadius="full"
      bg="whiteAlpha.100"
      align="center"
      justify="center"
    >
      <Icon as={icon} boxSize={6} color={C.accentLight} />
    </Flex>
    <Text fontSize="lg" color={C.white} fontWeight="semibold">{title}</Text>
    <Text fontSize="sm" color={C.textMuted} lineHeight="1.7">{desc}</Text>
    <HStack color={C.accentLight} fontSize="sm" cursor="pointer" _hover={{ gap: 3 }} transition="all 0.2s" spacing={1}>
      <Text fontWeight="medium">Learn More</Text>
      <Icon as={FiArrowRight} />
    </HStack>
  </VStack>
)

/* ─── Product Card ─── */
const LandingProductCard = ({ image, name, desc }: { image: string; name: string; desc: string }) => (
  <Box
    borderRadius="xl"
    overflow="hidden"
    position="relative"
    role="group"
    cursor="pointer"
  >
    <Image
      src={image}
      alt={name}
      w="full"
      h={{ base: '220px', md: '260px' }}
      objectFit="cover"
      transition="transform 0.4s"
      _groupHover={{ transform: 'scale(1.05)' }}
    />
    {/* Rating badge */}
    <HStack
      position="absolute"
      top={3}
      left={3}
      bg="whiteAlpha.900"
      borderRadius="full"
      px={2}
      py={1}
      spacing={1}
    >
      {[...Array(5)].map((_, i) => (
        <Icon key={i} as={FiStar} boxSize={3} color={C.accent} fill={C.accent} />
      ))}
      <Text fontSize="xs" fontWeight="bold" ml={1}>(5/5)</Text>
    </HStack>
    {/* Plus button */}
    <Flex
      position="absolute"
      top={3}
      right={3}
      w={8}
      h={8}
      borderRadius="full"
      bg={C.accent}
      color={C.white}
      align="center"
      justify="center"
      fontWeight="bold"
      fontSize="lg"
      _groupHover={{ bg: C.accentLight }}
      transition="all 0.2s"
    >
      +
    </Flex>
    {/* Info overlay */}
    <Box
      position="absolute"
      bottom={0}
      left={0}
      right={0}
      bgGradient="linear(to-t, blackAlpha.800, transparent)"
      p={4}
      pt={12}
    >
      <Text color={C.white} fontWeight="semibold" fontSize="md">{name}</Text>
      <Text fontSize="xs" color="whiteAlpha.800" noOfLines={2}>{desc}</Text>
    </Box>
  </Box>
)

/* ═══════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════ */
const LandingPage: React.FC = () => {
  const navigate = useNavigate()
  const handleGetStarted = () => {
    navigate('/home')
  }

  return (
    <Box bg={C.dark} color={C.white} overflowX="hidden">
      <Navbar navigate={navigate} onGetStarted={handleGetStarted} />

      {/* ══════════ HERO SECTION ══════════ */}
      <Box
        id="home"
        position="relative"
        minH="100vh"
        pt={{ base: '100px', md: '120px' }}
        pb={{ base: 12, md: 0 }}
        overflow="hidden"
      >
        {/* BG image with overlay */}
        <Box position="absolute" inset={0} zIndex={0}>
          <Image src="/bgphoto.jpg" alt="" w="full" h="full" objectFit="cover" />
          <Box position="absolute" inset={0} bg="linear-gradient(to bottom, rgba(29,78,79,0.88) 0%, rgba(29,78,79,0.72) 50%, rgba(29,78,79,0.95) 100%)" />
        </Box>

        <Container maxW="1200px" position="relative" zIndex={1}>
          <Flex
            direction="column"
            align="center"
            textAlign="center"
            minH={{ base: 'auto', md: 'calc(100vh - 120px)' }}
            justify="center"
          >
            <Heading
              as="h1"
              fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }}
              fontWeight="bold"
              lineHeight="1.15"
              mb={4}
              maxW="700px"
            >
              Trade Smarter For{' '}
              <Text as="span" color={C.accentLight}>Every</Text>{' '}
              Community.
            </Heading>

            {/* Decorative line */}
            <Box w="80px" h="3px" bg={C.accent} borderRadius="full" mb={6} />

            <Text
              fontSize={{ base: 'sm', md: 'md' }}
              color={C.textMuted}
              maxW="550px"
              lineHeight="1.8"
              mb={8}
            >
              Your one-stop platform for seamless item exchanges. Discover, trade,
              and connect with others in your community — effortlessly.
            </Text>

            <HStack spacing={4} mb={10} flexWrap="wrap" justify="center">
              <Button
                bg="transparent"
                border="1px solid"
                borderColor="whiteAlpha.400"
                color={C.white}
                borderRadius="full"
                px={6}
                size="md"
                leftIcon={<Icon as={FiPlay} />}
                _hover={{ borderColor: C.accentLight, color: C.accentLight }}
                transition="all 0.2s"
              >
                Watch Our Video
              </Button>
              <HStack spacing={3} color={C.textMuted}>
                <Flex w={10} h={10} borderRadius="full" bg={C.accent} align="center" justify="center">
                  <Icon as={FiPhone} color={C.white} boxSize={4} />
                </Flex>
                <VStack align="start" spacing={0}>
                  <Text fontSize="xs" color={C.textMuted}>Call Us Now:</Text>
                  <Text fontSize="sm" color={C.white} fontWeight="semibold">+123-456-7890</Text>
                </VStack>
              </HStack>
            </HStack>
          </Flex>
        </Container>
      </Box>

      {/* ══════════ FEATURED / TESTIMONIAL SECTION ══════════ */}
      <Box bg={C.mid} py={{ base: 12, md: 20 }}>
        <Container maxW="1200px">
          <Flex
            direction={{ base: 'column', lg: 'row' }}
            gap={8}
            align="stretch"
          >
            {/* Left - Testimonial Card */}
            <Box flex={1} position="relative">
              <Box
                borderRadius="2xl"
                overflow="hidden"
                bg={C.card}
                p={6}
                h="full"
                border="1px solid"
                borderColor="whiteAlpha.100"
              >
                {/* Rating */}
                <HStack mb={3} spacing={1}>
                  <Box bg={C.accent} borderRadius="full" px={2} py={0.5}>
                    <HStack spacing={0.5}>
                      {[...Array(5)].map((_, i) => (
                        <Icon key={i} as={FiStar} boxSize={3} color={C.white} fill={C.white} />
                      ))}
                    </HStack>
                  </Box>
                  <Text fontSize="xs" color={C.textMuted}>(5/5)</Text>
                </HStack>

                <Text fontSize="sm" color={C.textMuted} lineHeight="1.8" mb={6}>
                  "CloviaPH transformed how I trade items in my campus. The process
                  is seamless, secure, and I've connected with amazing people in
                  my community. Highly recommended!"
                </Text>

                <HStack spacing={3}>
                  <Avatar size="sm" name="Estelle Darcy" bg={C.accent} color={C.white} />
                  <VStack align="start" spacing={0}>
                    <Text fontSize="sm" fontWeight="bold" color={C.white}>Estelle Darcy</Text>
                    <Text fontSize="xs" color={C.textMuted}>Verified Trader</Text>
                  </VStack>
                </HStack>

                {/* Floating badges */}
                <HStack position="absolute" top={4} right={4} spacing={2}>
                  <Box bg="whiteAlpha.200" borderRadius="lg" px={3} py={1.5}>
                    <Text fontSize="xs" color={C.accentLight}>Quick Payment</Text>
                  </Box>
                </HStack>
                <HStack position="absolute" bottom={20} right={4} spacing={2}>
                  <Box bg="whiteAlpha.200" borderRadius="lg" px={3} py={1.5}>
                    <Text fontSize="xs" color={C.accentLight}>Safe Trades</Text>
                  </Box>
                </HStack>
                <Box position="absolute" right={4} bottom={6} bg="whiteAlpha.200" borderRadius="lg" px={3} py={1.5}>
                  <Text fontSize="xs" color={C.accentLight}>24/7 Support</Text>
                </Box>
              </Box>
            </Box>

            {/* Right - Large image */}
            <Box flex={1.2} borderRadius="2xl" overflow="hidden" minH={{ base: '300px', md: '400px' }}>
              <Image
                src="/bgphoto.jpg"
                alt="Community trading"
                w="full"
                h="full"
                objectFit="cover"
              />
            </Box>
          </Flex>
        </Container>
      </Box>

      {/* ══════════ ABOUT / EXPERIENCE SECTION ══════════ */}
      <Box id="about" py={{ base: 12, md: 20 }} bg={C.cream} color={C.textDark}>
        <Container maxW="1200px">
          <Flex direction={{ base: 'column', lg: 'row' }} gap={10} align="center">
            {/* Left - Image with overlay badge */}
            <Box flex={1} position="relative">
              <Image
                src="/barter.jpg"
                alt="Trading community"
                borderRadius="2xl"
                w="full"
                h={{ base: '300px', md: '420px' }}
                objectFit="cover"
              />
              {/* Location badge */}
              <HStack
                position="absolute"
                top={4}
                left={4}
                bg="white"
                borderRadius="full"
                px={3}
                py={1.5}
                boxShadow="lg"
                spacing={2}
              >
                <Box w={2} h={2} borderRadius="full" bg="green.500" />
                <Text fontSize="xs" fontWeight="semibold" color={C.textDark}>Community Marketplace</Text>
              </HStack>
              {/* Experience badge */}
              <Box
                position="absolute"
                bottom={6}
                left={6}
                bg={C.accent}
                borderRadius="xl"
                p={4}
                textAlign="center"
                boxShadow="xl"
              >
                <Text fontSize="3xl" fontWeight="bold" color={C.white}>
                  25+
                </Text>
                <Text fontSize="xs" color={C.white} fontWeight="semibold">
                  Universities<br />Connected
                </Text>
              </Box>
            </Box>

            {/* Right - text */}
            <VStack flex={1} align="start" spacing={5}>
              <Heading fontSize={{ base: '2xl', md: '4xl' }} lineHeight="1.2">
                Where Trades Find{' '}
                <Text as="span" color={C.accent}>Their People.</Text>
              </Heading>
              <Text fontSize="sm" color="gray.600" lineHeight="1.8">
                CloviaPH is revolutionizing the way students and communities exchange goods.
                Our platform makes it easy to discover items you need and trade what you
                no longer use — all within a trusted, local network. Whether it's textbooks,
                electronics, or everyday essentials, we bring people together through
                seamless, secure bartering.
              </Text>
              <Button
                bg={C.accent}
                color={C.white}
                borderRadius="full"
                px={8}
                size="md"
                fontWeight="bold"
                rightIcon={<Icon as={FiArrowRight} />}
                _hover={{ bg: C.accentLight, transform: 'translateY(-1px)' }}
                transition="all 0.2s"
                onClick={handleGetStarted}
              >
                Learn More
              </Button>
            </VStack>
          </Flex>
        </Container>
      </Box>

      {/* ══════════ BEST PRODUCTS SECTION ══════════ */}
      <Box id="features" py={{ base: 12, md: 20 }} bg={C.dark}>
        <Container maxW="1200px">
          <VStack spacing={3} mb={10} textAlign="center">
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>
              Our Best Traded{' '}<Text as="span" color={C.accentLight}>Items</Text>
            </Heading>
            <Text fontSize="sm" color={C.textMuted} maxW="600px">
              Popular items being exchanged in our community right now. From tech gadgets to study
              essentials, find what you need.
            </Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={6}>
            <LandingProductCard
              image="/Wireless Earbuds for Students.jpg"
              name="Wireless Earbuds"
              desc="Premium wireless earbuds, perfect for study sessions and commuting."
            />
            <LandingProductCard
              image="/Student Backpack - Water Resistant.webp"
              name="Student Backpack"
              desc="Water-resistant backpack ideal for campus life."
            />
            <LandingProductCard
              image="/Portable Power Bank 20000mAh.webp"
              name="Power Bank 20000mAh"
              desc="Stay charged all day with this portable power bank."
            />
          </SimpleGrid>
        </Container>
      </Box>

      {/* ══════════ PARTNER LOGOS STRIP ══════════ */}
      <Box bg={C.cream} py={8}>
        <Container maxW="1200px">
          <Flex
            justify="space-between"
            align="center"
            flexWrap="wrap"
            gap={6}
            opacity={0.5}
          >
            {['ECODE', 'CloviaPH', 'TradeHub', 'SwapNet', 'EcoTrade', 'BarterCo'].map((name) => (
              <Text
                key={name}
                fontSize={{ base: 'md', md: 'lg' }}
                fontWeight="bold"
                color={C.textDark}
                letterSpacing="wider"
              >
                {name}
              </Text>
            ))}
          </Flex>
        </Container>
      </Box>

      {/* ══════════ SERVICES SECTION ══════════ */}
      <Box id="how-it-works" py={{ base: 12, md: 20 }} bg={C.dark}>
        <Container maxW="1200px">
          <VStack spacing={3} mb={12} textAlign="center">
            <Heading fontSize={{ base: '2xl', md: '4xl' }}>
              Service We{' '}<Text as="span" color={C.accentLight}>Provide</Text>
            </Heading>
            <Text fontSize="sm" color={C.textMuted} maxW="600px">
              Everything you need for a safe and seamless trading experience, all in one place.
            </Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={6}>
            <ServiceCard
              icon={FiRefreshCw}
              title="Easy Trading"
              desc="List your items and find trades in your community with just a few taps."
            />
            <ServiceCard
              icon={FiShield}
              title="Secure Deals"
              desc="Every trade is protected with our verification and review system."
            />
            <ServiceCard
              icon={FaBoxOpen}
              title="Item Discovery"
              desc="Browse and discover items from people near you — from textbooks to tech."
            />
            <ServiceCard
              icon={FaHandshake}
              title="Community Trust"
              desc="Build your reputation through ratings, reviews, and verified trades."
            />
          </SimpleGrid>
        </Container>
      </Box>

      {/* ══════════ STATS / ACHIEVEMENTS SECTION ══════════ */}
      <Box id="contact-us" bg={C.mid} py={{ base: 12, md: 16 }}>
        <Container maxW="1200px">
          <Flex
            direction={{ base: 'column', md: 'row' }}
            align="center"
            justify="space-between"
            gap={8}
          >
            <VStack align={{ base: 'center', md: 'start' }} spacing={2} flex={1}>
              <Heading fontSize={{ base: '2xl', md: '3xl' }} lineHeight="1.2">
                We Achieved{' '}<Text as="span" color={C.accentLight}>Best</Text>
                <br />From Trading
              </Heading>
            </VStack>

            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={8} flex={2}>
              <StatCard value="256k+" label="Happy Traders" />
              <StatCard value="98%" label="Satisfaction" />
              <StatCard value="308+" label="Item Categories" />
              <StatCard value="20+" label="Communities" />
            </SimpleGrid>
          </Flex>
        </Container>
      </Box>

      {/* ══════════ CTA / FOOTER ══════════ */}
      <Box bg={C.dark} py={{ base: 12, md: 16 }} borderTop="1px solid" borderColor="whiteAlpha.100">
        <Container maxW="1200px">
          <VStack spacing={6} textAlign="center">
            <Heading fontSize={{ base: 'xl', md: '3xl' }}>
              Ready to Start{' '}<Text as="span" color={C.accentLight}>Trading?</Text>
            </Heading>
            <Text fontSize="sm" color={C.textMuted} maxW="500px">
              Join thousands of community members already trading on CloviaPH.
              Sign up today and discover a smarter way to exchange.
            </Text>
            <HStack spacing={4}>
              <Button
                bg={C.accent}
                color={C.white}
                borderRadius="full"
                px={8}
                size="lg"
                fontWeight="bold"
                _hover={{ bg: C.accentLight, transform: 'translateY(-2px)' }}
                transition="all 0.2s"
                onClick={handleGetStarted}
              >
                Get Started
              </Button>
              <Button
                variant="outline"
                borderColor="whiteAlpha.300"
                color={C.white}
                borderRadius="full"
                px={8}
                size="lg"
                _hover={{ borderColor: C.accentLight, color: C.accentLight }}
                transition="all 0.2s"
                onClick={() => navigate('/company')}
              >
                About Us
              </Button>
            </HStack>
          </VStack>

          {/* Footer bar */}
          <Flex
            mt={16}
            pt={8}
            borderTop="1px solid"
            borderColor="whiteAlpha.100"
            direction={{ base: 'column', md: 'row' }}
            justify="space-between"
            align="center"
            gap={4}
          >
            <HStack spacing={2}>
              <Icon as={FaLeaf} color={C.accentLight} boxSize={5} />
              <Text fontSize="lg" color={C.white}>
                Clovia<Text as="span" color={C.accentLight}>PH</Text>
              </Text>
            </HStack>
            <Text fontSize="xs" color={C.textMuted}>
              © 2026 CloviaPH. All rights reserved.
            </Text>
            <HStack spacing={6}>
              {['Privacy', 'Terms', 'Contact'].map((item) => (
                <Link key={item} fontSize="xs" color={C.textMuted} _hover={{ color: C.accentLight }}>
                  {item}
                </Link>
              ))}
            </HStack>
          </Flex>
        </Container>
      </Box>
    </Box>
  )
}

export default LandingPage
