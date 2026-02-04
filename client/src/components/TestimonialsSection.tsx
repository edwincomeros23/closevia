import React from 'react'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Container,
  SimpleGrid,
  Icon,
} from '@chakra-ui/react'
import { FaStar } from 'react-icons/fa6'

const TestimonialsSection: React.FC = () => {
  const testimonials = [
    {
      quote: 'ECODE changed how I shop. I now actively trade items instead of buying new, and I feel great about my impact!',
      author: 'Emma Rodriguez',
      role: 'Fashion Enthusiast & ECODE User',
      rating: 5,
      color: 'green.300',
    },
    {
      quote: 'As a small business, partnering with ECODE helped us reach eco-conscious customers we never could before.',
      author: 'David Kim',
      role: 'Sustainable Brand Owner',
      rating: 5,
      color: 'emerald.300',
    },
    {
      quote: 'The community here is inspiring. Everyone is genuinely committed to making a difference together.',
      author: 'Lisa Johnson',
      role: 'Community Coordinator',
      rating: 5,
      color: 'teal.300',
    },
    {
      quote: 'Trading through ECODE saved me money AND helped the planet. It\'s a win-win situation!',
      author: 'Alex Chen',
      role: 'Student & Sustainability Advocate',
      rating: 5,
      color: 'lime.300',
    },
  ]

  const CaseStudies = () => (
    <Box
      p={8}
      bg="linear-gradient(135deg, rgba(74, 222, 128, 0.08) 0%, rgba(0, 0, 0, 0.3) 100%)"
      border="1px solid rgba(74, 222, 128, 0.2)"
      borderRadius="lg"
    >
      <VStack spacing={6} align="stretch">
        <Heading as="h3" size="md" color="white" textAlign="center">
          Success Stories
        </Heading>

        <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
          <Box p={4} bg="rgba(74, 222, 128, 0.08)" borderRadius="md" border="1px solid rgba(74, 222, 128, 0.15)">
            <VStack spacing={2} align="flex-start">
              <Heading as="h4" size="sm" color="green.300">
                📱 Tech Equipment Circular Loop
              </Heading>
              <Text fontSize="xs" color="gray.300">
                Diverted 500 electronic devices from landfill while connecting tech enthusiasts with quality secondhand gear.
              </Text>
              <Text fontSize="xs" color="gray.400" fontWeight="600">
                Result: 3 tons of e-waste prevented
              </Text>
            </VStack>
          </Box>

          <Box p={4} bg="rgba(74, 222, 128, 0.08)" borderRadius="md" border="1px solid rgba(74, 222, 128, 0.15)">
            <VStack spacing={2} align="flex-start">
              <Heading as="h4" size="sm" color="emerald.300">
                👗 Fashion Forward Sustainability
              </Heading>
              <Text fontSize="xs" color="gray.300">
                1,000+ clothing items traded, reducing fast fashion waste and promoting conscious consumption.
              </Text>
              <Text fontSize="xs" color="gray.400" fontWeight="600">
                Result: 50 tons of textile waste avoided
              </Text>
            </VStack>
          </Box>
        </SimpleGrid>
      </VStack>
    </Box>
  )

  return (
    <Box position="relative" zIndex={2} bg="rgba(0, 0, 0, 0.6)" backdropFilter="blur(10px)" py={{ base: 12, md: 24 }}>
      <Container maxW={{ base: '100%', md: '4xl', lg: '5xl', xl: '6xl' }} px={{ base: 4, md: 8, lg: 10, xl: 12 }}>
        <VStack spacing={{ base: 8, md: 16 }} align="stretch">
          <VStack spacing={4} textAlign="center">
            <Heading as="h2" size="xl" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="900" color="white">
              What Our Community Says
            </Heading>
            <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.200" maxW="2xl" mx="auto">
              Real stories from people making a real difference through sustainable trading
            </Text>
          </VStack>

          {/* Testimonials Grid */}
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
            {testimonials.map((testimonial, idx) => (
              <Box
                key={idx}
                p={6}
                bg="rgba(74, 222, 128, 0.08)"
                border="1px solid rgba(74, 222, 128, 0.2)"
                borderRadius="lg"
                _hover={{
                  bg: 'rgba(74, 222, 128, 0.12)',
                  borderColor: 'rgba(74, 222, 128, 0.4)',
                  transform: 'translateY(-4px)',
                }}
                transition="all 0.3s ease"
              >
                <VStack spacing={3} align="flex-start">
                  {/* Stars */}
                  <HStack spacing={1}>
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Icon key={i} as={FaStar} fontSize="sm" color={testimonial.color} />
                    ))}
                  </HStack>

                  {/* Quote */}
                  <Text fontSize="sm" color="gray.100" fontStyle="italic" lineHeight="1.6">
                    "{testimonial.quote}"
                  </Text>

                  {/* Author */}
                  <VStack spacing={0} align="flex-start" width="100%" pt={2} borderTop="1px solid rgba(74, 222, 128, 0.1)">
                    <Text fontWeight="700" color={testimonial.color} fontSize="sm">
                      {testimonial.author}
                    </Text>
                    <Text fontSize="xs" color="gray.400">
                      {testimonial.role}
                    </Text>
                  </VStack>
                </VStack>
              </Box>
            ))}
          </SimpleGrid>

          {/* Case Studies */}
          <CaseStudies />

          {/* Impact Statement */}
          <Box
            p={6}
            bg="linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(74, 222, 128, 0.05) 100%)"
            border="1px solid rgba(34, 197, 94, 0.2)"
            borderRadius="lg"
            textAlign="center"
          >
            <Text color="gray.100" fontSize="sm" lineHeight="1.8">
              Join thousands of community members who have discovered that sustainability isn't just good for the planet—it's deeply rewarding personally. Your story could inspire the next million.
            </Text>
          </Box>
        </VStack>
      </Container>
    </Box>
  )
}

export default TestimonialsSection
