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
  Stat,
  StatLabel,
  StatNumber,
} from '@chakra-ui/react'
import { FaLeaf, FaUsers, FaRecycle, FaTrophy } from 'react-icons/fa6'

const ImpactSection: React.FC = () => {
  const stats = [
    {
      icon: FaRecycle,
      label: 'Products Exchanged',
      value: '1k tons',
      description: 'Items given a second life',
      color: 'green.300',
    },
    {
      icon: FaLeaf,
      label: 'Tons of Waste Diverted',
      value: '10',
      description: 'From landfills annually',
      color: 'emerald.300',
    },
    {
      icon: FaUsers,
      label: 'Active Community Members',
      value: '30',
      description: 'Eco-conscious traders',
      color: 'teal.300',
    },
    {
      icon: FaTrophy,
      label: 'CO₂ Emissions Reduced',
      value: '1k tons',
      description: 'Through sustainable trading',
      color: 'lime.300',
    },
  ]

  return (
    <Box position="relative" zIndex={2} bg="rgba(0, 0, 0, 0.6)" backdropFilter="blur(10px)" py={{ base: 12, md: 24 }}>
      <Container maxW="4xl" px={{ base: 4, md: 8 }}>
        <VStack spacing={{ base: 8, md: 16 }} align="stretch">
          <VStack spacing={4} textAlign="center">
            <Heading as="h2" size="xl" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="900" color="white">
              Our Impact Matters
            </Heading>
            <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.200" maxW="2xl" mx="auto">
              Real numbers showing how ECODE is making a measurable difference for our planet
            </Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} gap={{ base: 4, md: 6 }}>
            {stats.map((stat, idx) => (
              <Box
                key={idx}
                p={6}
                bg="rgba(74, 222, 128, 0.1)"
                border="1px solid rgba(74, 222, 128, 0.2)"
                borderRadius="lg"
                textAlign="center"
                _hover={{
                  bg: 'rgba(74, 222, 128, 0.15)',
                  borderColor: 'rgba(74, 222, 128, 0.4)',
                  transform: 'translateY(-4px)',
                }}
                transition="all 0.3s ease"
              >
                <VStack spacing={3}>
                  <Icon as={stat.icon} fontSize="2xl" color={stat.color} />
                  <Stat textAlign="center">
                    <StatNumber 
                      fontSize={idx === 3 ? { base: 'sm', md: 'md' } : { base: 'lg', md: 'xl' }} 
                      fontWeight="900" 
                      color={stat.color}
                    >
                      {stat.value}
                    </StatNumber>
                    <StatLabel fontSize="xs" color="gray.300">
                      {stat.label}
                    </StatLabel>
                  </Stat>
                  <Text fontSize="xs" color="gray.400">
                    {stat.description}
                  </Text>
                </VStack>
              </Box>
            ))}
          </SimpleGrid>

          {/* Impact Story */}
          <Box
            p={8}
            bg="linear-gradient(135deg, rgba(74, 222, 128, 0.1) 0%, rgba(0, 0, 0, 0.3) 100%)"
            border="1px solid rgba(74, 222, 128, 0.2)"
            borderRadius="lg"
            textAlign="center"
          >
            <VStack spacing={4}>
              <Heading as="h3" size="md" color="white">
                The Real Impact
              </Heading>
              <Text fontSize="sm" color="gray.200" lineHeight="1.8">
                Every sustainable trade on ECODE prevents new manufacturing, reduces carbon emissions, keeps waste from landfills, and empowers our community to make eco-conscious choices. Together, we're not just trading products—we're trading a better future for our planet.
              </Text>
            </VStack>
          </Box>
        </VStack>
      </Container>
    </Box>
  )
}

export default ImpactSection
