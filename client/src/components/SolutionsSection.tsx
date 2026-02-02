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
  Button,
} from '@chakra-ui/react'
import { FaRecycle, FaLeaf, FaWater, FaTree } from 'react-icons/fa6'

const SolutionsSection: React.FC = () => {
  const solutions = [
    {
      icon: FaRecycle,
      title: 'Circular Trading Platform',
      description: 'A seamless marketplace where students exchange products, extending lifecycles and reducing waste significantly.',
      color: 'green.300',
    },
    {
      icon: FaLeaf,
      title: 'Eco-Education',
      description: 'Empowering communities through awareness campaigns and educational content about sustainable living practices.',
      color: 'emerald.300',
    },
    {
      icon: FaWater,
      title: 'Carbon Reduction',
      description: 'Every trade prevents manufacturing emissions and reduces transportation impacts through local community exchanges.',
      color: 'teal.300',
    },
    {
      icon: FaTree,
      title: 'Community Building',
      description: 'Creating networks of eco-conscious individuals united by shared values of sustainability and mutual support.',
      color: 'lime.300',
    },
  ]

  return (
    <Box position="relative" zIndex={2} bg="rgba(0, 0, 0, 0.5)" backdropFilter="blur(10px)" py={{ base: 12, md: 24 }}>
      <Container maxW={{ base: '100%', md: '4xl', lg: '5xl', xl: '6xl' }} px={{ base: 4, md: 8, lg: 10, xl: 12 }}>
        <VStack spacing={{ base: 8, md: 16 }} align="stretch">
          <VStack spacing={4} textAlign="center">
            <Heading as="h2" size="xl" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="900" color="white">
              Solutions & What We Do
            </Heading>
            <Text fontSize={{ base: 'sm', md: 'lg' }} color="gray.200" maxW="2xl" mx="auto">
              ECODE combines technology, education, and community to create tangible environmental impact
            </Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} gap={{ base: 4, md: 8 }}>
            {solutions.map((solution, idx) => (
              <Box
                key={idx}
                p={{ base: 5, md: 8 }}
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
                <VStack spacing={4} align="start">
                  <Icon as={solution.icon} fontSize={{ base: 'xl', md: '2xl' }} color={solution.color} />
                  <Heading as="h3" size={{ base: 'sm', md: 'md' }} color="white">
                    {solution.title}
                  </Heading>
                  <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.300" lineHeight="1.6">
                    {solution.description}
                  </Text>
                </VStack>
              </Box>
            ))}
          </SimpleGrid>
        </VStack>
      </Container>
    </Box>
  )
}

export default SolutionsSection
