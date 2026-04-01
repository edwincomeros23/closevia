import React, { useState } from 'react'
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Icon,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  CloseButton,
} from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { FaExclamationTriangle, FaCheckCircle, FaInfoCircle } from 'react-icons/fa'
import { api } from '../services/api'

interface ActionButton {
  label: string
  action: string
  variant?: 'primary' | 'secondary' | 'danger'
}

interface MeetupSystemMessageProps {
  messageType: string
  title: string
  description: string
  actions?: ActionButton[]
  tradeID: number
  onActionComplete?: (action: string) => void
}

const MotionBox = motion(Box)

const MeetupSystemMessage: React.FC<MeetupSystemMessageProps> = ({
  messageType,
  title,
  description,
  actions = [],
  tradeID,
  onActionComplete,
}) => {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const getMessageGradient = (type: string) => {
    const gradients: Record<string, string> = {
      negotiation_prompt: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      proposal_received: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      scheduled_confirmation: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      pre_meetup_reminder: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      heading_out: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
      user_arrived: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
      completion_prompt: 'linear-gradient(135deg, #ff9a56 0%, #ff6a88 100%)',
      trade_completed: 'linear-gradient(135deg, #13547a 0%, #80d0c7 100%)',
      no_show_reported: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)',
      issue_reported: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    }
    return gradients[type] || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  }

  const getMessageIcon = (type: string) => {
    const icons: Record<string, string> = {
      negotiation_prompt: '💬',
      proposal_received: '📍',
      proposal_mismatch: '❓',
      scheduled_confirmation: '✅',
      pre_meetup_reminder: '🔔',
      heading_out: '🚗',
      user_arrived: '✅',
      both_arrived: '✨',
      both_heading_out: '🚗',
      completion_prompt: '💯',
      completion_confirmed_partial: '⏳',
      trade_completed: '🎉',
      no_show_reported: '⚠️',
      issue_reported: '🚨',
    }
    return icons[type] || '📢'
  }

  const handleAction = async (action: string) => {
    setLoading(action)
    setError(null)
    try {
      let endpoint = ''
      let payload = { trade_id: tradeID }

      switch (action) {
        case 'propose_time':
          onActionComplete?.(action)
          setLoading(null)
          return

        case 'confirm_match':
          endpoint = `/api/trades/${tradeID}/meetup/confirm`
          break

        case 'heading_out':
          endpoint = `/api/trades/${tradeID}/meetup/heading-out`
          break

        case 'arrived':
          endpoint = `/api/trades/${tradeID}/meetup/arrived`
          break

        case 'confirm_completion':
          endpoint = `/api/trades/${tradeID}/meetup/confirm-completion`
          break

        case 'report_no_show':
          onActionComplete?.(action)
          setLoading(null)
          return

        case 'contact_support':
          window.open('/support', '_blank')
          setLoading(null)
          return

        default:
          setError('Unknown action type')
          setLoading(null)
          return
      }

      const response = await api.post(endpoint, payload)

      if (response.data.success) {
        toast({
          title: '✅ Success',
          description: response.data.data?.message || 'Action completed successfully',
          status: 'success',
          duration: 3000,
          isClosable: true,
          position: 'top-right',
        })
        onActionComplete?.(action)
      } else {
        throw new Error(response.data.error || 'Request failed')
      }
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        'Failed to complete action. Please try again.'

      setError(errorMessage)
      toast({
        title: '❌ Error',
        description: errorMessage,
        status: 'error',
        duration: 4000,
        isClosable: true,
        position: 'top-right',
      })
    } finally {
      setLoading(null)
    }
  }

  const getButtonColorScheme = (variant?: string) => {
    switch (variant) {
      case 'danger':
        return 'red'
      case 'secondary':
        return 'gray'
      default:
        return 'green'
    }
  }

  return (
    <MotionBox
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      bg={getMessageGradient(messageType)}
      color="white"
      p={5}
      borderRadius="lg"
      shadow="lg"
      mb={4}
      position="relative"
      overflow="hidden"
    >
      {/* Animated background effect */}
      <Box
        position="absolute"
        top="-50%"
        right="-50%"
        w="200%"
        h="200%"
        bg="radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)"
        pointerEvents="none"
      />

      {/* Content */}
      <VStack align="start" spacing={3} position="relative" zIndex={1}>
        {/* Header */}
        <HStack spacing={2} align="start" w="full">
          <Text fontSize="28px">{getMessageIcon(messageType)}</Text>
          <VStack align="start" spacing={0} flex={1}>
            <Text fontSize="xs" fontWeight="bold" opacity={0.9} textTransform="uppercase" letterSpacing="wider">
              {messageType.replace(/_/g, ' ')}
            </Text>
            <Text fontSize="lg" fontWeight="bold">
              {title}
            </Text>
          </VStack>
        </HStack>

        {/* Description */}
        <Text fontSize="sm" opacity={0.95} lineHeight="1.6" pl={10}>
          {description}
        </Text>

        {/* Error Alert */}
        {error && (
          <Alert
            status="error"
            variant="subtle"
            flexDirection="column"
            alignItems="flex-start"
            borderRadius="md"
            mt={2}
            bg="rgba(255,255,255,0.1)"
            color="white"
          >
            <HStack spacing={2} align="start" w="full">
              <AlertIcon as={FaExclamationTriangle} mt={0.5} />
              <VStack align="start" spacing={1} flex={1}>
                <AlertTitle>Action failed</AlertTitle>
                <AlertDescription fontSize="sm">{error}</AlertDescription>
              </VStack>
              <CloseButton size="sm" onClick={() => setError(null)} />
            </HStack>
          </Alert>
        )}

        {/* Action Buttons */}
        {actions.length > 0 && (
          <HStack spacing={2} flexWrap="wrap" pt={2} w="full">
            {actions.map((btn, idx) => (
              <Button
                key={idx}
                size="sm"
                colorScheme={getButtonColorScheme(btn.variant)}
                variant={btn.variant === 'secondary' ? 'outline' : 'solid'}
                onClick={() => handleAction(btn.action)}
                isLoading={loading === btn.action}
                loadingText="Processing..."
                fontSize="xs"
                fontWeight="semibold"
                _hover={{
                  transform: 'translateY(-2px)',
                  shadow: 'md',
                }}
                _active={{
                  transform: 'translateY(0px)',
                }}
                transition="all 0.2s"
                isDisabled={loading !== null}
              >
                {btn.label}
              </Button>
            ))}
          </HStack>
        )}

        {/* Loading spinner for async operations */}
        {loading && (
          <HStack spacing={2} pt={2}>
            <Spinner size="sm" color="white" />
            <Text fontSize="xs" opacity={0.8}>
              Processing your action...
            </Text>
          </HStack>
        )}
      </VStack>
    </MotionBox>
  )
}

export default MeetupSystemMessage
