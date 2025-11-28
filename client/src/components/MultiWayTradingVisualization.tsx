import React, { useState } from 'react'
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Avatar,
  Card,
  CardBody,
  Button,
  SimpleGrid,
  Icon,
  Heading,
  Progress,
  Divider,
  Center,
  Flex,
  useColorModeValue,
} from '@chakra-ui/react'
import { FaUsers, FaCheckCircle, FaClock, FaHandshake, FaArrowRight } from 'react-icons/fa'
import { CheckIcon, ArrowForwardIcon } from '@chakra-ui/icons'

interface TradeParticipant {
  id: number
  name: string
  initials: string
  color: string
  item: string
  itemImage: string
}

interface MultiWayLoop {
  participants: TradeParticipant[]
  completionPercentage: number
  stage: 'matching' | 'confirmed' | 'in_progress' | 'completed'
}

const MultiWayTradingVisualization: React.FC = () => {
  const [activeLoop, setActiveLoop] = useState<MultiWayLoop>({
    participants: [
      { id: 1, name: 'Sarah', initials: 'S', color: 'blue', item: 'iPhone 13', itemImage: '📱' },
      { id: 2, name: 'Mike', initials: 'M', color: 'green', item: 'MacBook Pro', itemImage: '💻' },
      { id: 3, name: 'Alex', initials: 'A', color: 'purple', item: 'AirPods Max', itemImage: '🎧' },
      { id: 4, name: 'Jordan', initials: 'J', color: 'orange', item: 'iPad Air', itemImage: '📲' },
    ],
    completionPercentage: 60,
    stage: 'in_progress',
  })

  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const textColor = useColorModeValue('gray.800', 'gray.100')

  const getStageInfo = () => {
    switch (activeLoop.stage) {
      case 'matching':
        return { label: 'Finding Matches', color: 'blue', icon: FaUsers, description: 'AI is searching for compatible trades...' }
      case 'confirmed':
        return { label: 'All Confirmed', color: 'green', icon: FaCheckCircle, description: 'All participants confirmed their trades' }
      case 'in_progress':
        return { label: 'Trades Happening', color: 'orange', icon: FaClock, description: 'Trades are currently in progress' }
      case 'completed':
        return { label: 'Loop Completed', color: 'green', icon: FaCheckCircle, description: 'All trades successfully completed!' }
    }
  }

  const stageInfo = getStageInfo()

  return (
    <VStack spacing={8} align="stretch">
      {/* Header */}
      <VStack spacing={2} align="stretch" textAlign="center">
        <Heading size="lg" color={textColor}>
          4-Way Trading Loop in Action
        </Heading>
        <Text color="gray.500" fontSize="sm">
          Watch how multiple users trade items simultaneously through smart matching
        </Text>
      </VStack>

      {/* Main Visualization Container */}
      <Card bg={bgColor} borderWidth="2px" borderColor={borderColor} variant="outline">
        <CardBody p={8}>
          <VStack spacing={8} align="stretch">
            {/* Trading Loop Circle - Central Hub */}
            <Box position="relative" h="400px" w="100%" display="flex" alignItems="center" justifyContent="center">
              {/* Background Circle */}
              <Box
                position="absolute"
                w="300px"
                h="300px"
                borderRadius="full"
                borderWidth="3px"
                borderColor={borderColor}
                borderStyle="dashed"
              />

              {/* Center Logo */}
              <VStack spacing={2} zIndex={10} position="relative" textAlign="center">
                <Icon as={FaHandshake} boxSize={12} color="brand.500" />
                <Text fontWeight="bold" fontSize="md">
                  Trade Loop
                </Text>
              </VStack>

              {/* Participants in Circle */}
              {activeLoop.participants.map((participant, index) => {
                const angle = (index / activeLoop.participants.length) * 360
                const radius = 150
                const x = Math.cos((angle * Math.PI) / 180) * radius
                const y = Math.sin((angle * Math.PI) / 180) * radius

                return (
                  <Box
                    key={participant.id}
                    position="absolute"
                    transform={`translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`}
                    left="50%"
                    top="50%"
                    zIndex={5}
                  >
                    <VStack spacing={2} align="center">
                      {/* Avatar */}
                      <Avatar
                        name={participant.name}
                        bg={`${participant.color}.500`}
                        color="white"
                        size="lg"
                        boxShadow="lg"
                      />

                      {/* Participant Info */}
                      <VStack spacing={0} align="center" bg={bgColor} p={2} borderRadius="lg" borderWidth="1px" borderColor={borderColor}>
                        <Text fontSize="xs" fontWeight="bold" color={textColor}>
                          {participant.name}
                        </Text>
                        <Text fontSize="2xs" color="gray.500">
                          {participant.item}
                        </Text>
                      </VStack>

                      {/* Item Emoji */}
                      <Text fontSize="2xl">{participant.itemImage}</Text>
                    </VStack>
                  </Box>
                )
              })}

              {/* Arrow Connections */}
              {activeLoop.participants.map((_, index) => {
                const currentAngle = (index / activeLoop.participants.length) * 360
                const nextAngle = (((index + 1) % activeLoop.participants.length) / activeLoop.participants.length) * 360

                const radius = 150
                const x1 = Math.cos((currentAngle * Math.PI) / 180) * radius
                const y1 = Math.sin((currentAngle * Math.PI) / 180) * radius
                const x2 = Math.cos((nextAngle * Math.PI) / 180) * radius
                const y2 = Math.sin((nextAngle * Math.PI) / 180) * radius

                return (
                  <Box
                    key={`arrow-${index}`}
                    position="absolute"
                    left="50%"
                    top="50%"
                    w="100%"
                    h="100%"
                  >
                    <svg
                      style={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        left: '-50%',
                        top: '-50%',
                      }}
                      viewBox="-200 -200 400 400"
                    >
                      <defs>
                        <marker
                          id={`arrowhead-${index}`}
                          markerWidth="10"
                          markerHeight="10"
                          refX="9"
                          refY="3"
                          orient="auto"
                        >
                          <polygon points="0 0, 10 3, 0 6" fill="#48BB78" />
                        </marker>
                      </defs>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#48BB78"
                        strokeWidth="2"
                        markerEnd={`url(#arrowhead-${index})`}
                        strokeDasharray="5,5"
                        opacity="0.6"
                      />
                    </svg>
                  </Box>
                )
              })}
            </Box>

            <Divider />

            {/* Stage Status */}
            <VStack spacing={3} align="stretch" bg="gray.50" p={4} borderRadius="lg">
              <HStack spacing={3}>
                <Icon as={stageInfo.icon} boxSize={6} color={`${stageInfo.color}.500`} />
                <VStack align="start" spacing={0} flex={1}>
                  <Text fontWeight="bold" color={textColor}>
                    {stageInfo.label}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    {stageInfo.description}
                  </Text>
                </VStack>
                <Badge colorScheme={stageInfo.color} fontSize="xs" px={3} py={1}>
                  {activeLoop.completionPercentage}%
                </Badge>
              </HStack>

              {/* Progress Bar */}
              <Box>
                <Flex justify="space-between" mb={2}>
                  <Text fontSize="xs" color="gray.600" fontWeight="medium">
                    Trade Progress
                  </Text>
                  <Text fontSize="xs" color="gray.600" fontWeight="medium">
                    {activeLoop.completionPercentage}%
                  </Text>
                </Flex>
                <Progress
                  value={activeLoop.completionPercentage}
                  size="sm"
                  colorScheme={stageInfo.color}
                  borderRadius="full"
                  hasStripe
                  isAnimated
                />
              </Box>
            </VStack>

            <Divider />

            {/* How It Works - Step by Step */}
            <VStack spacing={4} align="stretch">
              <Heading size="md" color={textColor}>
                How the Loop Works
              </Heading>

              <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3}>
                {[
                  {
                    number: '1',
                    title: 'Users List Items',
                    description: 'Each participant lists what they have and what they want',
                    icon: '📋',
                  },
                  {
                    number: '2',
                    title: 'AI Finds Matches',
                    description: 'Our algorithm identifies compatible trade chains',
                    icon: '🤖',
                  },
                  {
                    number: '3',
                    title: 'Confirm & Schedule',
                    description: 'Everyone confirms and picks a meetup/delivery time',
                    icon: '✅',
                  },
                  {
                    number: '4',
                    title: 'Simultaneous Exchange',
                    description: 'All trades happen at the same time',
                    icon: '🔄',
                  },
                ].map((step, idx) => (
                  <Card key={idx} variant="outline" borderColor={borderColor}>
                    <CardBody p={4}>
                      <VStack spacing={2} align="center" textAlign="center">
                        <Text fontSize="2xl">{step.icon}</Text>
                        <Badge colorScheme="brand" fontSize="xs">
                          Step {step.number}
                        </Badge>
                        <Text fontWeight="bold" fontSize="sm" color={textColor}>
                          {step.title}
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          {step.description}
                        </Text>
                      </VStack>
                    </CardBody>
                  </Card>
                ))}
              </SimpleGrid>
            </VStack>

            <Divider />

            {/* Benefits */}
            <VStack spacing={4} align="stretch">
              <Heading size="md" color={textColor}>
                Why Multi-Way Trading?
              </Heading>

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                {[
                  {
                    title: 'Better Matches',
                    description: 'Find exactly what you want even if no one has a direct 1-1 trade',
                    stat: '5x',
                  },
                  {
                    title: 'Faster Trades',
                    description: 'Stop waiting - execute multiple trades simultaneously',
                    stat: '3x',
                  },
                  {
                    title: 'Community Value',
                    description: 'More items circulate, everyone gets better deals',
                    stat: '100%',
                  },
                  {
                    title: 'Trust & Safety',
                    description: 'All participants verified and committed to the trade',
                    stat: '99%',
                  },
                ].map((benefit, idx) => (
                  <HStack key={idx} spacing={4} p={4} bg="gray.50" borderRadius="lg" align="start">
                    <VStack spacing={1} align="center" minW="60px">
                      <Text fontSize="2xl" fontWeight="bold" color="brand.500">
                        {benefit.stat}
                      </Text>
                      <Divider orientation="horizontal" w="40px" />
                    </VStack>
                    <VStack align="start" spacing={1}>
                      <Text fontWeight="bold" fontSize="sm" color={textColor}>
                        {benefit.title}
                      </Text>
                      <Text fontSize="xs" color="gray.600">
                        {benefit.description}
                      </Text>
                    </VStack>
                  </HStack>
                ))}
              </SimpleGrid>
            </VStack>

            <Divider />

            {/* Trade Example Timeline */}
            <VStack spacing={4} align="stretch">
              <Heading size="md" color={textColor}>
                Example: Sarah's Trade Loop
              </Heading>

              <VStack spacing={2} align="stretch">
                {[
                  { time: '2:00 PM', event: 'Loop Created', status: 'completed', emoji: '✨' },
                  { time: '2:15 PM', event: 'All Confirmed', status: 'completed', emoji: '✅' },
                  { time: '2:30 PM', event: 'Trade in Progress', status: 'in_progress', emoji: '🔄' },
                  { time: '2:45 PM', event: 'All Delivered', status: 'upcoming', emoji: '📦' },
                  { time: '3:00 PM', event: 'Loop Complete', status: 'upcoming', emoji: '🎉' },
                ].map((item, idx) => (
                  <HStack key={idx} spacing={4} p={3} bg={item.status === 'upcoming' ? 'gray.50' : 'green.50'} borderRadius="lg">
                    <Text fontSize="2xl">{item.emoji}</Text>
                    <VStack align="start" spacing={0} flex={1}>
                      <Text fontWeight="bold" fontSize="sm" color={textColor}>
                        {item.event}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        {item.time}
                      </Text>
                    </VStack>
                    {item.status === 'completed' && (
                      <Icon as={CheckIcon} color="green.500" boxSize={5} />
                    )}
                    {item.status === 'in_progress' && (
                      <Badge colorScheme="orange" fontSize="xs">
                        Now
                      </Badge>
                    )}
                  </HStack>
                ))}
              </VStack>
            </VStack>

            <Divider />

            {/* Call to Action */}
            <Center>
              <Button
                colorScheme="brand"
                size="lg"
                leftIcon={<Icon as={FaUsers} />}
                px={8}
              >
                Start a 4-Way Trade Loop
              </Button>
            </Center>
          </VStack>
        </CardBody>
      </Card>

      {/* Key Stats */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
        {[
          { label: 'Active Loops', value: '12', trend: '+3 today' },
          { label: 'Successful Trades', value: '48', trend: '+8 this week' },
          { label: 'Avg. Loop Size', value: '4.2', trend: 'users' },
          { label: 'Success Rate', value: '98%', trend: 'verified' },
        ].map((stat, idx) => (
          <Card key={idx} variant="outline">
            <CardBody p={4} textAlign="center">
              <Text fontSize="2xl" fontWeight="bold" color="brand.500" mb={1}>
                {stat.value}
              </Text>
              <Text fontSize="sm" fontWeight="medium" color={textColor} mb={1}>
                {stat.label}
              </Text>
              <Text fontSize="xs" color="gray.500">
                {stat.trend}
              </Text>
            </CardBody>
          </Card>
        ))}
      </SimpleGrid>
    </VStack>
  )
}

export default MultiWayTradingVisualization
