import React, { useState, useEffect } from 'react'
import { Badge, Tooltip, Spinner, HStack, Icon, useColorModeValue } from '@chakra-ui/react'
import { FaMapMarkerAlt } from 'react-icons/fa'
import { api } from '../services/api'
import { DistanceResult } from '../types'

interface ProximityBadgeProps {
  type: 'user' | 'product'
  targetId: number
  showIcon?: boolean
}

const ProximityBadge: React.FC<ProximityBadgeProps> = ({ type, targetId, showIcon = true }) => {
  const [distance, setDistance] = useState<DistanceResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDistance = async () => {
      try {
        setLoading(true)
        // Allow disabling AI proximity calls via environment variable
        if (import.meta.env.VITE_DISABLE_AI === 'true') {
          setError('Proximity disabled')
          setLoading(false)
          return
        }

        const response = await api.get('/api/ai/proximity', {
          params: { type, target_id: targetId }
        })
        if (response.data && response.data.success && response.data.data) {
          setDistance(response.data.data)
        } else {
          setError('Location not available')
        }
      } catch (err: any) {
        // Don't throw; set a friendly error and stop showing the badge
        setError(err?.response?.data?.error || 'Location not available')
        // eslint-disable-next-line no-console
        console.debug('Proximity API error', err?.response?.status, err?.response?.data)
      } finally {
        setLoading(false)
      }
    }

    if (targetId) {
      fetchDistance()
    }
  }, [type, targetId])

  if (loading) {
    return (
      <Badge colorScheme="gray" variant="subtle">
        <Spinner size="xs" mr={1} />
        Calculating...
      </Badge>
    )
  }

  if (error || !distance || distance.distance_km == null) {
    return null // Don't show anything if there's an error or missing data
  }

  const formatDistance = () => {
    const km = distance.distance_km ?? 0
    const m = distance.distance_m ?? 0
    if (km < 1) {
      return `${Math.round(m)}m away`
    } else if (km < 10) {
      return `${km.toFixed(1)}km away`
    } else {
      return `${Math.round(km)}km away`
    }
  }

  const getColorScheme = () => {
    const km = distance.distance_km ?? 0
    if (km < 5) return 'green'
    if (km < 20) return 'blue'
    if (km < 50) return 'orange'
    return 'gray'
  }

  return (
    <Tooltip label={`Distance: ${(distance.distance_km ?? 0).toFixed(2)} km (${(distance.distance_miles ?? 0).toFixed(2)} miles)`}>
      <Badge 
        bg={useColorModeValue('whiteAlpha.900', 'blackAlpha.800')} 
        color={useColorModeValue('brand.600', 'brand.300')}
        variant="solid" 
        fontSize="10px"
        fontWeight="800"
        borderRadius="full"
        px={2.5}
        py={1}
        shadow="sm"
        backdropFilter="blur(8px)"
      >
        <HStack spacing={1}>
          {showIcon && <Icon as={FaMapMarkerAlt} />}
          <span>{formatDistance().toUpperCase()}</span>
        </HStack>
      </Badge>
    </Tooltip>
  )
}

export default ProximityBadge




