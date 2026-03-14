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
  Badge,
  Progress,
  Divider,
} from '@chakra-ui/react'
import { FiCheckCircle, FiAlertTriangle, FiXCircle, FiAward } from 'react-icons/fi'

interface TrustFactor {
  label: string
  status: 'pass' | 'warn' | 'fail'
  points: number
  max: number
}

interface ConductGrade {
  category: string
  avg: number
  count: number
}

interface ConductSummary {
  letter_grade: string
  overall_avg: number
  total_grades: number
  categories: ConductGrade[]
  cancellation_rate: number
  dispute_rate: number
}

interface TradeStats {
  successful: number
  cancelled: number
  pending: number
}

interface TrustScoreCardProps {
  score: number
  trustLevel?: 'trusted' | 'new' | 'risky'
  factors?: TrustFactor[]
  conductSummary?: ConductSummary
  compact?: boolean
  isVerified?: boolean
  listingCount?: number
  tradeCount?: number
  positivePercent?: number
  tradeStats?: TradeStats
  responseTime?: string
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

const gradeColor = (grade: string) => {
  if (grade === 'A+' || grade === 'A') return 'green.500'
  if (grade === 'B+' || grade === 'B') return 'blue.500'
  if (grade === 'C') return 'orange.500'
  return 'red.500'
}

const gradeBg = (grade: string) => {
  if (grade === 'A+' || grade === 'A') return 'green.50'
  if (grade === 'B+' || grade === 'B') return 'blue.50'
  if (grade === 'C') return 'orange.50'
  return 'red.50'
}

const categoryBarColor = (avg: number) => {
  if (avg >= 4.0) return 'green'
  if (avg >= 3.0) return 'yellow'
  if (avg >= 2.0) return 'orange'
  return 'red'
}

const formatResponseTime = (raw?: string): { label: string; colorScheme: string } | null => {
  if (!raw || raw === 'N/A') return null
  const match = raw.match(/^(\d+)(m|h|d)$/)
  if (!match) return null
  const value = parseInt(match[1], 10)
  const unit = match[2]
  const totalMinutes = unit === 'm' ? value : unit === 'h' ? value * 60 : value * 1440
  if (totalMinutes < 1440) return { label: '⚡ Responds within hours', colorScheme: 'green' }
  if (totalMinutes < 4320) return { label: '⚡ Responds within a day', colorScheme: 'blue' }
  return { label: '🐢 Responds in a few days', colorScheme: 'orange' }
}

const TrustScoreCard: React.FC<TrustScoreCardProps> = ({ score, trustLevel, factors, conductSummary, compact, isVerified, listingCount, tradeCount, positivePercent, tradeStats, responseTime }) => {
  const responseInfo = formatResponseTime(responseTime)
  if (compact) {
    const tooltipLines = factors && factors.length > 0
      ? factors.map(f => `${f.status === 'pass' ? '✔' : f.status === 'warn' ? '⚠' : '✘'} ${f.label} (${f.points}/${f.max})`).join('\n')
      : `Trust Score: ${score}/100`
    const conductLine = conductSummary && conductSummary.total_grades > 0
      ? `\nConduct: ${conductSummary.letter_grade} (${conductSummary.overall_avg.toFixed(1)}/5)`
      : ''
    const badgeLines = [
      isVerified ? '✔ Verified' : '',
      typeof listingCount === 'number' ? `📦 ${listingCount} listing${listingCount !== 1 ? 's' : ''}` : '',
      typeof tradeCount === 'number' ? `🔁 ${tradeCount} trade${tradeCount !== 1 ? 's' : ''}` : '',
      typeof positivePercent === 'number' && positivePercent > 0 ? `⭐ ${Math.round(positivePercent)}% positive` : '',
      responseInfo ? responseInfo.label : '',
    ].filter(Boolean).join('\n')
    const badgeSection = badgeLines ? `\n${badgeLines}` : ''
    return (
      <Tooltip
        label={tooltipLines + conductLine + badgeSection}
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
          {conductSummary && conductSummary.total_grades > 0 && (
            <Badge colorScheme={conductSummary.letter_grade.startsWith('A') ? 'green' : conductSummary.letter_grade.startsWith('B') ? 'blue' : conductSummary.letter_grade === 'C' ? 'orange' : 'red'} fontSize="xs">
              {conductSummary.letter_grade}
            </Badge>
          )}
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
      {/* Trust Indicator Badges */}
      <HStack spacing={3} mb={4} flexWrap="wrap">
        {isVerified && (
          <Badge px={2} py={1} borderRadius="full" colorScheme="green" fontSize="xs" fontWeight="medium">
            ✔ Verified
          </Badge>
        )}
        {typeof listingCount === 'number' && (
          <Badge px={2} py={1} borderRadius="full" colorScheme="purple" fontSize="xs" fontWeight="medium">
            📦 {listingCount} listing{listingCount !== 1 ? 's' : ''}
          </Badge>
        )}
        {typeof tradeCount === 'number' && (
          <Badge px={2} py={1} borderRadius="full" colorScheme="blue" fontSize="xs" fontWeight="medium">
            🔁 {tradeCount} trade{tradeCount !== 1 ? 's' : ''}
          </Badge>
        )}
        {typeof positivePercent === 'number' && positivePercent > 0 && (
          <Badge px={2} py={1} borderRadius="full" colorScheme="yellow" fontSize="xs" fontWeight="medium">
            ⭐ {Math.round(positivePercent)}% positive
          </Badge>
        )}
        {responseInfo && (
          <Badge px={2} py={1} borderRadius="full" colorScheme={responseInfo.colorScheme} fontSize="xs" fontWeight="medium">
            {responseInfo.label}
          </Badge>
        )}
      </HStack>

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

      {/* Trade Statistics Section */}
      {tradeStats && (tradeStats.successful > 0 || tradeStats.cancelled > 0 || tradeStats.pending > 0) && (
        <>
          <Divider my={4} />
          <VStack align="stretch" spacing={3}>
            <Text fontSize="sm" fontWeight="bold" color="gray.700">
              Trade Statistics
            </Text>
            <VStack align="stretch" spacing={1}>
              <HStack justify="space-between">
                <HStack spacing={2}>
                  <Text fontSize="sm">✔</Text>
                  <Text fontSize="sm" color="green.600">Successful</Text>
                </HStack>
                <Text fontSize="sm" fontWeight="bold" color="green.600">{tradeStats.successful}</Text>
              </HStack>
              <HStack justify="space-between">
                <HStack spacing={2}>
                  <Text fontSize="sm">❌</Text>
                  <Text fontSize="sm" color="red.500">Cancelled</Text>
                </HStack>
                <Text fontSize="sm" fontWeight="bold" color="red.500">{tradeStats.cancelled}</Text>
              </HStack>
              <HStack justify="space-between">
                <HStack spacing={2}>
                  <Text fontSize="sm">⏳</Text>
                  <Text fontSize="sm" color="orange.500">Pending</Text>
                </HStack>
                <Text fontSize="sm" fontWeight="bold" color="orange.500">{tradeStats.pending}</Text>
              </HStack>
            </VStack>
            {(tradeStats.successful + tradeStats.cancelled) > 0 && (
              <Box bg="gray.50" px={3} py={2} borderRadius="md">
                <HStack justify="space-between">
                  <Text fontSize="sm" fontWeight="medium" color="gray.600">Trade Success Rate</Text>
                  <Text fontSize="sm" fontWeight="bold" color={
                    Math.round((tradeStats.successful / (tradeStats.successful + tradeStats.cancelled)) * 100) >= 75 ? 'green.600' :
                    Math.round((tradeStats.successful / (tradeStats.successful + tradeStats.cancelled)) * 100) >= 50 ? 'orange.500' : 'red.500'
                  }>
                    {Math.round((tradeStats.successful / (tradeStats.successful + tradeStats.cancelled)) * 100)}%
                  </Text>
                </HStack>
              </Box>
            )}
          </VStack>
        </>
      )}

      {/* Conduct Grade Section */}
      {conductSummary && conductSummary.total_grades > 0 && (
        <>
          <Divider my={4} />
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between">
              <HStack spacing={2}>
                <Icon as={FiAward} color={gradeColor(conductSummary.letter_grade)} boxSize={5} />
                <Text fontSize="sm" fontWeight="bold" color="gray.700">
                  Conduct Grade
                </Text>
              </HStack>
              <Badge
                px={3}
                py={1}
                borderRadius="md"
                fontSize="md"
                fontWeight="bold"
                color={gradeColor(conductSummary.letter_grade)}
                bg={gradeBg(conductSummary.letter_grade)}
              >
                {conductSummary.letter_grade}
              </Badge>
            </HStack>

            {conductSummary.categories.map((cat, i) => (
              <Box key={i}>
                <HStack justify="space-between" mb={1}>
                  <Text fontSize="xs" color="gray.600">{cat.category}</Text>
                  <Text fontSize="xs" color="gray.500" fontWeight="medium">
                    {cat.avg.toFixed(1)}/5
                  </Text>
                </HStack>
                <Progress
                  value={(cat.avg / 5) * 100}
                  size="sm"
                  borderRadius="full"
                  colorScheme={categoryBarColor(cat.avg)}
                />
              </Box>
            ))}

            <HStack justify="space-between" pt={1}>
              <Tooltip label="Percentage of trades cancelled" hasArrow>
                <Text fontSize="xs" color="gray.500">
                  Cancellation: {(conductSummary.cancellation_rate * 100).toFixed(0)}%
                </Text>
              </Tooltip>
              <Tooltip label="Percentage of trades with disputes" hasArrow>
                <Text fontSize="xs" color="gray.500">
                  Disputes: {(conductSummary.dispute_rate * 100).toFixed(0)}%
                </Text>
              </Tooltip>
            </HStack>

            <Text fontSize="xs" color="gray.400" textAlign="center">
              Based on {conductSummary.total_grades} trade {conductSummary.total_grades === 1 ? 'grade' : 'grades'}
            </Text>
          </VStack>
        </>
      )}
    </Box>
  )
}

export default TrustScoreCard
