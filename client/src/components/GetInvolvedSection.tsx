import React from 'react'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Container,
  SimpleGrid,
  Button,
  Input,
  Icon,
} from '@chakra-ui/react'
import { FaArrowRight, FaEnvelope, FaUsers, FaHandshake, FaInstagram, FaLinkedin, FaTwitter } from 'react-icons/fa6'

const GetInvolvedSection: React.FC = () => {
  const involvement = [
    {
      icon: FaUsers,
      title: 'Join Community',
      description: 'Become part of our eco-conscious trading network',
      action: 'Get Started',
      color: 'green.300',
    },
    {
      icon: FaHandshake,
      title: 'Partner With Us',
      description: 'Explore business and collaboration opportunities',
      action: 'Learn More',
      color: 'emerald.300',
    },
    {
      icon: FaEnvelope,
      title: 'Stay Updated',
      description: 'Get news and opportunities delivered to your inbox',
      action: 'Subscribe',
      color: 'teal.300',
    },
  ]

  const socialLinks = [
    { icon: FaInstagram, label: 'Instagram', color: 'pink.300' },
    { icon: FaLinkedin, label: 'LinkedIn', color: 'blue.300' },
    { icon: FaTwitter, label: 'Twitter', color: 'sky.300' },
  ]

  return (
    <Box position="relative" zIndex={2} bg="rgba(0, 0, 0, 0.6)" backdropFilter="blur(10px)" py={{ base: 12, md: 24 }}>
      <Container maxW={{ base: '100%', md: '4xl', lg: '5xl', xl: '6xl' }} px={{ base: 4, md: 8, lg: 10, xl: 12 }}>
        <VStack spacing={{ base: 8, md: 16 }} align="stretch">
          {/* Header */}
          <VStack spacing={4} textAlign="center">
            <Heading as="h2" size="xl" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="900" color="white">
              Join the Movement
            </Heading>
            <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.200" maxW="2xl" mx="auto">
              Multiple ways to get involved and support our mission for a sustainable future
            </Text>
          </VStack>

          {/* Call to Action Grid */}
          <SimpleGrid columns={{ base: 1, md: 3 }} gap={6}>
            {involvement.map((item, idx) => (
              <Box
                key={idx}
                p={6}
                bg="rgba(74, 222, 128, 0.08)"
                border="1px solid rgba(74, 222, 128, 0.2)"
                borderRadius="lg"
                _hover={{
                  bg: 'rgba(74, 222, 128, 0.15)',
                  borderColor: 'rgba(74, 222, 128, 0.4)',
                  transform: 'translateY(-4px)',
                }}
                transition="all 0.3s ease"
              >
                <VStack spacing={4} align="stretch">
                  <Icon as={item.icon} fontSize="2xl" color={item.color} />
                  <VStack spacing={2} align="flex-start">
                    <Heading as="h3" size="sm" color="white">
                      {item.title}
                    </Heading>
                    <Text fontSize="sm" color="gray.300">
                      {item.description}
                    </Text>
                  </VStack>
                  <Button
                    size="sm"
                    bg={item.color}
                    color="black"
                    fontWeight="700"
                    _hover={{ opacity: 0.9 }}
                    rightIcon={<FaArrowRight />}
                  >
                    {item.action}
                  </Button>
                </VStack>
              </Box>
            ))}
          </SimpleGrid>

          {/* Newsletter Signup */}
          <Box
            p={8}
            bg="linear-gradient(135deg, rgba(74, 222, 128, 0.12) 0%, rgba(34, 197, 94, 0.08) 100%)"
            border="1px solid rgba(74, 222, 128, 0.3)"
            borderRadius="lg"
          >
            <VStack spacing={4}>
              <VStack spacing={2} textAlign="center">
                <Heading as="h3" size="md" color="white">
                  Stay in the Loop
                </Heading>
                <Text fontSize="sm" color="gray.200">
                  Get updates on new features, community events, and sustainability tips
                </Text>
              </VStack>
              <HStack width="100%" spacing={2}>
                <Input
                  placeholder="Enter your email"
                  bg="rgba(0, 0, 0, 0.3)"
                  border="1px solid rgba(74, 222, 128, 0.2)"
                  color="white"
                  _placeholder={{ color: 'gray.500' }}
                  _focus={{
                    borderColor: 'green.300',
                    boxShadow: '0 0 0 1px rgba(74, 222, 128, 0.3)',
                  }}
                />
                <Button bg="green.300" color="black" fontWeight="700" _hover={{ opacity: 0.9 }}>
                  Subscribe
                </Button>
              </HStack>
            </VStack>
          </Box>

          {/* Quick Links */}
          <Box
            p={6}
            bg="rgba(74, 222, 128, 0.05)"
            border="1px solid rgba(74, 222, 128, 0.15)"
            borderRadius="lg"
          >
            <VStack spacing={4}>
              <Heading as="h3" size="sm" color="white" textAlign="center">
                Quick Links
              </Heading>
              <SimpleGrid columns={{ base: 2, md: 4 }} gap={3} width="100%">
                {['About', 'Careers', 'Contact', 'Blog'].map((link, idx) => (
                  <Button
                    key={idx}
                    size="sm"
                    variant="outline"
                    borderColor="rgba(74, 222, 128, 0.3)"
                    color="gray.200"
                    _hover={{
                      bg: 'rgba(74, 222, 128, 0.1)',
                      borderColor: 'green.300',
                      color: 'white',
                    }}
                  >
                    {link}
                  </Button>
                ))}
              </SimpleGrid>
            </VStack>
          </Box>

          {/* Social Links */}
          <Box textAlign="center">
            <VStack spacing={3}>
              <Text color="gray.300" fontSize="sm">
                Follow us and join the conversation
              </Text>
              <HStack spacing={4} justify="center">
                {socialLinks.map((social, idx) => (
                  <Box
                    key={idx}
                    as="button"
                    p={3}
                    bg="rgba(74, 222, 128, 0.1)"
                    border="1px solid rgba(74, 222, 128, 0.2)"
                    borderRadius="full"
                    _hover={{
                      bg: 'rgba(74, 222, 128, 0.2)',
                      transform: 'scale(1.1)',
                    }}
                    transition="all 0.3s ease"
                    title={social.label}
                  >
                    <Icon as={social.icon} fontSize="xl" color={social.color} />
                  </Box>
                ))}
              </HStack>
            </VStack>
          </Box>

          {/* Final CTA */}
          <Box
            p={8}
            bg="linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(74, 222, 128, 0.08) 100%)"
            border="2px solid rgba(34, 197, 94, 0.3)"
            borderRadius="lg"
            textAlign="center"
          >
            <VStack spacing={4}>
              <Heading as="h3" size="md" color="green.300">
                Ready to Make a Difference?
              </Heading>
              <Text color="gray.100" fontSize="sm" lineHeight="1.6">
                Every action counts. Whether you're trading your first item, partnering with us, or spreading the word, you're part of the solution. Together, we're building a circular economy that works for people and the planet.
              </Text>
              <Button size="lg" bg="green.300" color="black" fontWeight="900" _hover={{ opacity: 0.9 }}>
                Start Your Sustainable Journey Today
              </Button>
            </VStack>
          </Box>

          {/* Footer Info */}
          <Box textAlign="center" pt={4} borderTop="1px solid rgba(74, 222, 128, 0.1)">
            <Text fontSize="xs" color="gray.500">
              Questions? Email us at <Text as="span" color="green.300">hello@ecode.com</Text> or call our support team
            </Text>
          </Box>
        </VStack>
      </Container>
    </Box>
  )
}

export default GetInvolvedSection
