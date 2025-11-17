import React, { useState, useEffect } from 'react'
import { Alert, AlertIcon, AlertTitle, AlertDescription, VStack, HStack, Text, Box } from '@chakra-ui/react'
import { api } from '../services/api'
import { CounterfeitReport } from '../types'

interface CounterfeitWarningProps {
  productId: number
  compact?: boolean
}

const CounterfeitWarning: React.FC<CounterfeitWarningProps> = ({ productId, compact = false }) => {
  const [report, setReport] = useState<CounterfeitReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true)
        const response = await api.get(`/api/ai/counterfeit/${productId}`)
        if (response.data.success && response.data.data.is_suspicious) {
          setReport(response.data.data)
        }
      } catch (err) {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }

    if (productId) {
      fetchReport()
    }
  }, [productId])

  if (loading || !report) {
    return null
  }

  if (compact) {
    return (
      <Alert status="warning" size="sm" borderRadius="md">
        <AlertIcon />
        <Text fontSize="xs">Suspicious listing detected ({Math.round(report.confidence * 100)}% confidence)</Text>
      </Alert>
    )
  }

  return (
    <Alert status="warning" borderRadius="md" flexDirection="column" alignItems="flex-start">
      <HStack>
        <AlertIcon />
        <AlertTitle>Suspicious Listing Detected</AlertTitle>
      </HStack>
      <AlertDescription mt={2} w="full">
        <VStack align="start" spacing={2}>
          <Text fontSize="sm">
            This listing has been flagged as potentially suspicious ({Math.round(report.confidence * 100)}% confidence).
          </Text>
          {report.flags && report.flags.length > 0 && (
            <Box>
              <Text fontWeight="semibold" fontSize="xs" mb={1}>Reasons:</Text>
              <VStack align="start" spacing={1}>
                {report.flags.map((flag, idx) => (
                  <Text key={idx} fontSize="xs" color="orange.700">• {flag}</Text>
                ))}
              </VStack>
            </Box>
          )}
          <Text fontSize="xs" color="gray.600" fontStyle="italic">
            Please exercise caution when proceeding with this transaction.
          </Text>
        </VStack>
      </AlertDescription>
    </Alert>
  )
}

export default CounterfeitWarning

