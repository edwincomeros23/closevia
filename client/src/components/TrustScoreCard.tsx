import React from 'react'
import {
  Box,
  Text,
  HStack,
  VStack,
  Icon,
  CircularProgress,
  CircularProgressLabel,
  Tooltip,
} from '@chakra-ui/react'
import { FiCheckCircle, FiAlertTriangle, FiXCircle } from 'react-icons/fi'

interface TrustFactor {
  label: string
  status: 'pass' | 'warn' | 'fail'
  points: number
  max: number
}

interface TrustScoreCardProps {
  score: number
  trustLevel?: 'trusted' | 'new' | 'risky'
  factors?: TrustFactor[]
  compact?: boolean
}

const statusConfig = {
  pass: { icon: FiCheckCircle, color: 'green.500', bg: 'green.50' },
  warn: { icon: FiAlertTriangle, color: 'orange.500', bg: 'orange.50' },
  fail: { icon: FiXCircle, color: 'red.500', bg: 'red.50' },
}

const levelColor = (level?: string) => {
  if (level === 'trusted') return 'green.500'
  if (level === 'new') return 'yellow.500'
  return 'red.500'
}

const levelTrackColor = (level?: string) => {
  if (level === 'trusted') return 'green.100'
  if (level === 'new') return 'yellow.100'
  return 'red.100'
}

const TrustScoreCard: React.FC<TrustScoreCardProps> = ({ score, trustLevel, factors, compact }) => {
  if (compact) {
    return (
      <Tooltip
        label={
          factors && factors.length > 0
            ? factors.map(f => `${f.status === 'pass' ? '✔' : f.status === 'warn' ? '⚠' : '✘'} ${f.label} (${f.points}/${f.max})`).join('\n')
            : `Trust Score: ${score}/100`
        }
        whiteSpace="pre-line"
        placement="top"
        hasArrow
      >
        <HStack spacing={2} cursor="default">
          <CircularProgress
            value={score}
            size="40px"
            thickness="10px"
            color={levelColor(trustLevel)}
            trackColor={levelTrackColor(trustLevel)}
          >
            <CircularProgressLabel fontSize="xs" fontWeight="bold">
              {score}
            </CircularProgressLabel>
          </CircularProgress>
          <Text fontSize="xs" color="gray.600" fontWeight="medium">
            Trust
          </Text>
        </HStack>
      </Tooltip>
    )
  }

  return (
    <Box
      bg="white"
      border="1px"
      borderColor="gray.200"
      borderRadius="xl"
      p={5}
      shadow="sm"
      w="100%"
    >
      <HStack spacing={5} align="start">
        {/* Circular Score */}
        <VStack spacing={1}>
          <CircularProgress
            value={score}
            size="80px"
            thickness="8px"
            color={levelColor(trustLevel)}
            trackColor={levelTrackColor(trustLevel)}
          >
            <CircularProgressLabel>
              <Text fontSize="xl" fontWeight="bold" color={levelColor(trustLevel)}>
                {score}
              </Text>
            </CircularProgressLabel>
          </CircularProgress>
          <Text fontSize="xs" color="gray.500" fontWeight="medium">
            / 100
          </Text>
        </VStack>

        {/* Factor Breakdown */}
        <VStack align="stretch" spacing={2} flex={1}>
          <Text fontSize="sm" fontWeight="bold" color="gray.700" mb={1}>
            Trust Score
          </Text>
          {factors && factors.length > 0 ? (
            factors.map((f, i) => {
              const cfg = statusConfig[f.status]
              return (
                <HStack key={i} spacing={2} py={0.5}>
                  <Icon as={cfg.icon} color={cfg.color} boxSize={4} flexShrink={0} />
                  <Text fontSize="sm" color="gray.700" flex={1}>
                    {f.label}
                  </Text>
                  <Text fontSize="xs" color="gray.400" fontWeight="medium" flexShrink={0}>
                    {f.points}/{f.max}
                  </Text>
                </HStack>
              )
            })
          ) : (
            <Text fontSize="sm" color="gray.400">No data available</Text>
          )}
        </VStack>
      </HStack>
    </Box>
  )
}

export default TrustScoreCard
