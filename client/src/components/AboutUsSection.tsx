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
  Divider,
} from '@chakra-ui/react'
import { FaLeaf, FaRecycle, FaGlobe, FaLightbulb, FaUsers, FaHeart } from 'react-icons/fa6'

const AboutUsSection: React.FC = () => {
  return (
    <Box position="relative" zIndex={2} bg="rgba(0, 0, 0, 0.6)" backdropFilter="blur(10px)" py={{ base: 12, md: 24, lg: 28 }}>
      <Container maxW={{ base: '100%', md: '4xl', lg: '5xl', xl: '6xl' }} px={{ base: 4, md: 8, lg: 10, xl: 12 }}>
        <VStack spacing={{ base: 8, md: 16 }} align="stretch">
          {/* Main About Section */}
          <VStack spacing={8} align="center" textAlign="center">
            <VStack spacing={4}>
              <Heading
                as="h2"
                size="xl"
                fontSize={{ base: '2xl', md: '3xl' }}
                fontWeight="900"
                color="white"
              >
                About ECODE
              </Heading>
              <Text
                fontSize={{ base: 'md', md: 'lg' }}
                color="gray.200"
                lineHeight="1.8"
                maxW="2xl"
              >
                ECODE was founded on a simple yet powerful belief: sustainable living shouldn't be complicated or expensive. We saw a world where billions of usable items end up in landfills while students struggle to afford what they need. That's where we stepped in.
              </Text>
            </VStack>

            <Divider borderColor="rgba(74, 222, 128, 0.2)" maxW="200px" />

            {/* Mission, Vision, Impact Row */}
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={8} w="full" mt={8}>
              {/* Mission */}
              <Box
                p={6}
                bg="rgba(74, 222, 128, 0.1)"
                border="1px solid rgba(74, 222, 128, 0.2)"
                borderRadius="lg"
                backdropFilter="blur(10px)"
                _hover={{
                  bg: 'rgba(74, 222, 128, 0.15)',
                  borderColor: 'rgba(74, 222, 128, 0.4)',
                  transform: 'translateY(-4px)',
                }}
                transition="all 0.3s ease"
              >
                <VStack spacing={3} align="center">
                  <Heading as="h3" size="sm" color="white">
                    Our Mission
                  </Heading>
                  <Text fontSize="sm" color="gray.300" lineHeight="1.6">
                    Revolutionize student trading through sustainable practices, reducing waste while making eco-friendly living accessible to all.
                  </Text>
                </VStack>
              </Box>

              {/* Vision */}
              <Box
                p={6}
                bg="rgba(74, 222, 128, 0.1)"
                border="1px solid rgba(74, 222, 128, 0.2)"
                borderRadius="lg"
                backdropFilter="blur(10px)"
                _hover={{
                  bg: 'rgba(74, 222, 128, 0.15)',
                  borderColor: 'rgba(74, 222, 128, 0.4)',
                  transform: 'translateY(-4px)',
                }}
                transition="all 0.3s ease"
              >
                <VStack spacing={3} align="center">
                  <Heading as="h3" size="sm" color="white">
                    Our Vision
                  </Heading>
                  <Text fontSize="sm" color="gray.300" lineHeight="1.6">
                    A world where sustainable consumption is the norm, communities thrive through shared resources, and environmental responsibility becomes daily habit.
                  </Text>
                </VStack>
              </Box>

              {/* Impact */}
              <Box
                p={6}
                bg="rgba(74, 222, 128, 0.1)"
                border="1px solid rgba(74, 222, 128, 0.2)"
                borderRadius="lg"
                backdropFilter="blur(10px)"
                _hover={{
                  bg: 'rgba(74, 222, 128, 0.15)',
                  borderColor: 'rgba(74, 222, 128, 0.4)',
                  transform: 'translateY(-4px)',
                }}
                transition="all 0.3s ease"
              >
                <VStack spacing={3} align="center">
                  <Heading as="h3" size="sm" color="white">
                    Our Impact
                  </Heading>
                  <Text fontSize="sm" color="gray.300" lineHeight="1.6">
                    Empowering thousands of students to make eco-conscious choices, reducing landfill waste, and creating positive environmental change daily.
                  </Text>
                </VStack>
              </Box>
            </SimpleGrid>
          </VStack>

          {/* Why We Started */}
          <VStack spacing={6} align="stretch">
            <VStack spacing={2} textAlign="center">
              <Heading as="h3" size="lg" fontSize={{ base: 'xl', md: '2xl' }} color="white">
                Why We Started ECODE
              </Heading>
            </VStack>

            <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
              {/* Problem 1 */}
              <Box p={6} bg="rgba(74, 222, 128, 0.05)" borderRadius="lg">
                <HStack spacing={4} align="start">
                  <Icon as={FaRecycle} fontSize="xl" color="green.300" flexShrink={0} />
                  <VStack spacing={2} align="start">
                    <Heading as="h4" size="sm" color="white">
                      The Waste Crisis
                    </Heading>
                    <Text fontSize="sm" color="gray.300" lineHeight="1.6">
                      Billions of usable items are discarded annually. We enable a circular economy where products get a second life instead of ending up in landfills.
                    </Text>
                  </VStack>
                </HStack>
              </Box>

              {/* Problem 2 */}
              <Box p={6} bg="rgba(74, 222, 128, 0.05)" borderRadius="lg">
                <HStack spacing={4} align="start">
                  <Icon as={FaLightbulb} fontSize="xl" color="emerald.300" flexShrink={0} />
                  <VStack spacing={2} align="start">
                    <Heading as="h4" size="sm" color="white">
                      Affordability Gap
                    </Heading>
                    <Text fontSize="sm" color="gray.300" lineHeight="1.6">
                      Students struggle with limited budgets for essential items. ECODE makes quality products accessible through sustainable, affordable trading.
                    </Text>
                  </VStack>
                </HStack>
              </Box>

              {/* Problem 3 */}
              <Box p={6} bg="rgba(74, 222, 128, 0.05)" borderRadius="lg">
                <HStack spacing={4} align="start">
                  <Icon as={FaGlobe} fontSize="xl" color="teal.300" flexShrink={0} />
                  <VStack spacing={2} align="start">
                    <Heading as="h4" size="sm" color="white">
                      Climate Impact
                    </Heading>
                    <Text fontSize="sm" color="gray.300" lineHeight="1.6">
                      Manufacturing and transportation create massive carbon footprints. Reusing products extends lifecycles and significantly reduces emissions.
                    </Text>
                  </VStack>
                </HStack>
              </Box>

              {/* Problem 4 */}
              <Box p={6} bg="rgba(74, 222, 128, 0.05)" borderRadius="lg">
                <HStack spacing={4} align="start">
                  <Icon as={FaUsers} fontSize="xl" color="green.300" flexShrink={0} />
                  <VStack spacing={2} align="start">
                    <Heading as="h4" size="sm" color="white">
                      Community Connection
                    </Heading>
                    <Text fontSize="sm" color="gray.300" lineHeight="1.6">
                      We build communities united by sustainability values. Every trade strengthens connections and collective environmental responsibility.
                    </Text>
                  </VStack>
                </HStack>
              </Box>
            </SimpleGrid>
          </VStack>

          {/* Core Values */}
          <VStack spacing={6} align="center" textAlign="center">
            <Heading as="h3" size="lg" fontSize={{ base: 'xl', md: '2xl' }} color="white">
              Our Core Values
            </Heading>

            <HStack spacing={6} justify="center" flexWrap="wrap">
              {[
                { icon: FaLeaf, label: 'Sustainability', color: 'green.300' },
                { icon: FaLightbulb, label: 'Innovation', color: 'emerald.300' },
                { icon: FaUsers, label: 'Community', color: 'teal.300' },
              ].map((value, idx) => (
                <VStack key={idx} spacing={2}>
                  <Icon as={value.icon} fontSize="2xl" color={value.color} />
                  <Text fontSize="sm" fontWeight="600" color="gray.100">
                    {value.label}
                  </Text>
                </VStack>
              ))}
            </HStack>
          </VStack>

          {/* Closing Statement */}
          <VStack spacing={4} align="center" textAlign="center" pt={4}>
            <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.200" lineHeight="1.8" maxW="2xl">
              At ECODE, we believe that true environmental change doesn't require sacrifice—it requires reimagining how we consume, trade, and value our resources. Together, we're building a greener future, one sustainable trade at a time.
            </Text>
          </VStack>
        </VStack>
      </Container>
    </Box>
  )
}

export default AboutUsSection
