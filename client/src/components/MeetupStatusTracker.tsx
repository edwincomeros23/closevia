import React from 'react'
import {
  Box,
  HStack,
  VStack,
  Text,
  Badge,
  Flex,
  useColorModeValue,
  Tooltip,
  Icon,
  Progress,
} from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { FaCheckCircle, FaClock, FaExclamationCircle } from 'react-icons/fa'

interface MeetupStage {
  name: string
  icon: string
  label: string
  completed: boolean
  active: boolean
}

interface MeetupStatusTrackerProps {
  currentStage: string
  scheduledTime?: string
  scheduledLocation?: string
}

const MotionBox = motion(Box)

const MeetupStatusTracker: React.FC<MeetupStatusTrackerProps> = ({
  currentStage,
  scheduledTime,
  scheduledLocation,
}) => {
  const stages: MeetupStage[] = [
    {
      name: 'negotiating',
      icon: '💬',
      label: 'Negotiating',
      completed: false,
      active: currentStage === 'negotiating',
    },
    {
      name: 'scheduled',
      icon: '✅',
      label: 'Scheduled',
      completed: ['scheduled', 'on_the_way', 'arrived', 'completed'].includes(currentStage),
      active: currentStage === 'scheduled',
    },
    {
      name: 'on_the_way',
      icon: '🚗',
      label: 'On the Way',
      completed: ['on_the_way', 'arrived', 'completed'].includes(currentStage),
      active: currentStage === 'on_the_way',
    },
    {
      name: 'arrived',
      icon: '📍',
      label: 'Arrived',
      completed: ['arrived', 'completed'].includes(currentStage),
      active: currentStage === 'arrived',
    },
    {
      name: 'completed',
      icon: '🎉',
      label: 'Completed',
      completed: currentStage === 'completed',
      active: currentStage === 'completed',
    },
  ]

  const bgGradient = useColorModeValue(
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)'
  )
  const cardBg = useColorModeValue('white', 'gray.800')
  const cardBorder = useColorModeValue('purple.200', 'purple.700')
  const completedBg = useColorModeValue('green.500', 'green.600')
  const activeBg = useColorModeValue('purple.500', 'purple.600')
  const inactiveBg = useColorModeValue('gray.300', 'gray.600')

  const completionPercentage = (stages.filter(s => s.completed).length / stages.length) * 100
  const stageIndex = stages.findIndex(s => s.active)

  return (
    <VStack align="stretch" spacing={4} w="full">
      {/* Main Timeline Card */}
      <MotionBox
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        p={6}
        bg={bgGradient}
        borderRadius="xl"
        color="white"
        shadow="lg"
        position="relative"
        overflow="hidden"
      >
        {/* Animated background gradient */}
        <Box
          position="absolute"
          top="-50%"
          right="-50%"
          w="200%"
          h="200%"
          bg="radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)"
          pointerEvents="none"
        />

        {/* Header */}
        <HStack justify="space-between" mb={6} position="relative" zIndex={2}>
          <HStack spacing={2}>
            <Text fontSize="lg" fontWeight="bold">
              📍 Meetup Progress
            </Text>
          </HStack>
          <Badge
            colorScheme="whiteAlpha"
            variant="solid"
            fontSize="xs"
            px={2}
            py={1}
          >
            {Math.round(completionPercentage)}% Complete
          </Badge>
        </HStack>

        {/* Progress bar */}
        <Box mb={6} position="relative" zIndex={2}>
          <Progress
            value={completionPercentage}
            size="sm"
            colorScheme="whiteAlpha"
            borderRadius="full"
            hasStripe
            isAnimated
          />
        </Box>

        {/* Timeline visualization */}
        <HStack spacing={0} align="center" justify="space-between" position="relative" zIndex={2}>
          {stages.map((stage, idx) => (
            <React.Fragment key={stage.name}>
              <Tooltip label={stage.label} placement="top">
                <MotionBox
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  flex={1}
                  position="relative"
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                >
                  {/* Stage circle */}
                  <Box
                    w="50px"
                    h="50px"
                    borderRadius="full"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    fontSize="24px"
                    fontWeight="bold"
                    bg={stage.active ? activeBg : stage.completed ? completedBg : inactiveBg}
                    color="white"
                    border={stage.active ? '3px solid white' : 'none'}
                    transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                    _hover={{
                      transform: 'scale(1.1)',
                      shadow: '0 0 20px rgba(255,255,255,0.6)',
                    }}
                    mb={2}
                    cursor="pointer"
                  >
                    {stage.icon}
                  </Box>

                  {/* Completion checkmark */}
                  {stage.completed && (
                    <Icon
                      as={FaCheckCircle}
                      position="absolute"
                      top="-2px"
                      right="-2px"
                      color="white"
                      boxSize={5}
                      zIndex={10}
                    />
                  )}

                  {/* Stage label */}
                  <Text
                    fontSize="xs"
                    fontWeight="semibold"
                    textAlign="center"
                    maxW="50px"
                    noOfLines={2}
                    color={stage.active ? 'white' : stage.completed ? 'white' : 'rgba(255,255,255,0.7)'}
                    mt={1}
                  >
                    {stage.label}
                  </Text>
                </MotionBox>
              </Tooltip>

              {/* Connector line */}
              {idx < stages.length - 1 && (
                <Box
                  flex={1}
                  h="3px"
                  bg={stages[idx].completed ? 'white' : 'rgba(255,255,255,0.3)'}
                  mx={1}
                  mb={8}
                  transition="all 0.6s cubic-bezier(0.4, 0, 0.2, 1)"
                />
              )}
            </React.Fragment>
          ))}
        </HStack>
      </MotionBox>

      {/* Current Stage Details Card */}
      {(scheduledTime || scheduledLocation) && currentStage === 'scheduled' && (
        <MotionBox
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          p={4}
          bg={cardBg}
          borderRadius="lg"
          border="2px"
          borderColor={cardBorder}
        >
          <VStack align="start" spacing={3}>
            <HStack spacing={2}>
              <Icon as={FaCheckCircle} color="green.500" />
              <Text fontSize="sm" fontWeight="bold" color="green.700">
                Meetup Confirmed!
              </Text>
            </HStack>

            {scheduledTime && (
              <HStack spacing={3} w="full" p={2} bg="blue.50" borderRadius="md">
                <Icon as={FaClock} color="blue.500" boxSize={5} />
                <VStack align="start" spacing={0}>
                  <Text fontSize="xs" color="gray.500" fontWeight="bold">
                    Scheduled Time
                  </Text>
                  <Text fontSize="sm" fontWeight="semibold">
                    {new Date(scheduledTime).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </VStack>
              </HStack>
            )}

            {scheduledLocation && (
              <HStack spacing={3} w="full" p={2} bg="purple.50" borderRadius="md">
                <Text fontSize="lg">📍</Text>
                <VStack align="start" spacing={0} flex={1}>
                  <Text fontSize="xs" color="gray.500" fontWeight="bold">
                    Meeting Location
                  </Text>
                  <Text fontSize="sm" fontWeight="semibold" noOfLines={2}>
                    {scheduledLocation}
                  </Text>
                </VStack>
              </HStack>
            )}
          </VStack>
        </MotionBox>
      )}

      {/* Status Badge */}
      <Flex justify="center" position="relative">
        <MotionBox
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Badge
            colorScheme={
              currentStage === 'completed'
                ? 'green'
                : currentStage === 'no_show'
                ? 'red'
                : currentStage === 'arrived'
                ? 'blue'
                : currentStage === 'on_the_way'
                ? 'orange'
                : currentStage === 'scheduled'
                ? 'purple'
                : 'gray'
            }
            fontSize="sm"
            px={4}
            py={2}
            borderRadius="full"
            fontWeight="bold"
          >
            {currentStage === 'no_show' && (
              <>
                <Icon as={FaExclamationCircle} mr={1} />
                NO-SHOW REPORTED
              </>
            )}
            {currentStage !== 'no_show' && `${currentStage.replace(/_/g, ' ').toUpperCase()} ✨`}
          </Badge>
        </MotionBox>
      </Flex>
    </VStack>
  )
}

export default MeetupStatusTracker
