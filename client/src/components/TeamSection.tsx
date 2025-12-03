import React from 'react'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Container,
  SimpleGrid,
  Badge,
} from '@chakra-ui/react'

const TeamSection: React.FC = () => {
  const team = [
    {
      name: 'Shah Rukh Khan D. Biao',
      role: 'Project Manager',
      bio: 'Leading the vision and strategy for ECODE\'s sustainable mission',
      avatar: '👨‍💼',
      specialties: ['Strategy', 'Project Management', 'Leadership'],
    },
    {
      name: 'Wynry Perian',
      role: 'QA',
      bio: 'Ensuring quality and excellence across all ECODE platforms',
      avatar: '👩‍💼',
      specialties: ['Quality Assurance', 'Testing', 'User Experience'],
    },
    {
      name: 'Francis Francisco',
      role: 'Programmer',
      bio: 'Building robust backend systems for sustainable trading',
      avatar: '👨‍💻',
      specialties: ['Backend Development', 'Architecture', 'Database'],
    },
    {
      name: 'RJ Toribio',
      role: 'Programmer',
      bio: 'Creating seamless frontend experiences for our community',
      avatar: '👨‍💻',
      specialties: ['Frontend Development', 'UI/UX', 'Performance'],
    },
    {
      name: 'Edwin Comeros',
      role: 'Programmer',
      bio: 'Full-stack developer committed to building tech for sustainability',
      avatar: '👨‍💻',
      specialties: ['Full-Stack', 'Integration', 'Innovation'],
    },
  ]

  const partners = [
    'GreenTech Alliance',
    'Circular Economy Initiative',
    'Global Sustainability Fund',
    'EcoFirst NGO',
  ]

  return (
    <Box position="relative" zIndex={2} bg="rgba(0, 0, 0, 0.5)" backdropFilter="blur(10px)" py={{ base: 12, md: 24 }}>
      <Container maxW="4xl" px={{ base: 4, md: 8 }}>
        <VStack spacing={{ base: 8, md: 16 }} align="stretch">
          <VStack spacing={4} textAlign="center">
            <Heading as="h2" size="xl" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="900" color="white">
              Our Team & Partners
            </Heading>
            <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.200" maxW="2xl" mx="auto">
              Dedicated individuals united by a mission to create positive environmental change
            </Text>
          </VStack>

          {/* Team Members */}
          <Box>
            <Heading as="h3" size="md" color="white" mb={8} textAlign="center">
              Core Team
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={6}>
              {team.map((member, idx) => (
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
                  <HStack spacing={4} align="flex-start">
                    <Box fontSize="4xl">{member.avatar}</Box>
                    <VStack spacing={2} align="stretch" flex={1}>
                      <VStack spacing={0} align="flex-start">
                        <Heading as="h4" size="sm" color="white">
                          {member.name}
                        </Heading>
                        <Text fontSize="sm" color="green.300" fontWeight="600">
                          {member.role}
                        </Text>
                      </VStack>
                      <Text fontSize="xs" color="gray.300">
                        {member.bio}
                      </Text>
                      <HStack spacing={2} flexWrap="wrap" mt={2}>
                        {member.specialties.map((specialty, s) => (
                          <Badge key={s} size="sm" bg="rgba(74, 222, 128, 0.2)" color="green.200" variant="outline">
                            {specialty}
                          </Badge>
                        ))}
                      </HStack>
                    </VStack>
                  </HStack>
                </Box>
              ))}
            </SimpleGrid>
          </Box>

          {/* Partners Section */}
          <Box
            p={8}
            bg="linear-gradient(135deg, rgba(74, 222, 128, 0.08) 0%, rgba(0, 0, 0, 0.3) 100%)"
            border="1px solid rgba(74, 222, 128, 0.2)"
            borderRadius="lg"
          >
            <VStack spacing={4}>
              <Heading as="h3" size="md" color="white">
                Strategic Partners
              </Heading>
              <SimpleGrid columns={{ base: 2, md: 4 }} gap={3} width="100%">
                {partners.map((partner, idx) => (
                  <Box
                    key={idx}
                    p={3}
                    bg="rgba(74, 222, 128, 0.05)"
                    border="1px solid rgba(74, 222, 128, 0.15)"
                    borderRadius="md"
                    textAlign="center"
                    fontSize="xs"
                    color="gray.300"
                    fontWeight="500"
                  >
                    {partner}
                  </Box>
                ))}
              </SimpleGrid>
              <Text fontSize="xs" color="gray.400" textAlign="center" mt={2}>
                Collaborating with organizations committed to environmental sustainability
              </Text>
            </VStack>
          </Box>

          {/* Careers CTA */}
          <Box
            p={6}
            bg="rgba(34, 197, 94, 0.1)"
            border="1px solid rgba(34, 197, 94, 0.3)"
            borderRadius="lg"
            textAlign="center"
          >
            <VStack spacing={2}>
              <Heading as="h4" size="sm" color="white">
                Join Our Mission
              </Heading>
              <Text fontSize="sm" color="gray.200">
                We're always looking for passionate individuals to help shape the future of sustainable trading
              </Text>
            </VStack>
          </Box>
        </VStack>
      </Container>
    </Box>
  )
}

export default TeamSection
