import React from 'react'
import { Box, Button, HStack, VStack, Text, CloseButton, Icon } from '@chakra-ui/react'
import { FiDownload, FiSmartphone } from 'react-icons/fi'
import { isRunningStandalone } from '../serviceWorkerRegistration'

interface AppDownloadBannerProps {
  position?: 'top' | 'bottom'
  variant?: 'banner' | 'card'
}

const AppDownloadBanner: React.FC<AppDownloadBannerProps> = ({
  position = 'top',
  variant = 'banner',
}) => {
  const [dismissed, setDismissed] = React.useState(false)
  const [isAndroid, setIsAndroid] = React.useState(false)

  React.useEffect(() => {
    // Hide if already running as standalone app or native app
    if (isRunningStandalone()) {
      setDismissed(true)
      return
    }

    // Check if app was dismissed before
    const isDismissed = localStorage.getItem('app-download-banner-dismissed')
    if (isDismissed) {
      setDismissed(true)
      return
    }

    // Detect Android
    const userAgent = navigator.userAgent.toLowerCase()
    setIsAndroid(/android/.test(userAgent))
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('app-download-banner-dismissed', 'true')
  }

  const handleDownloadAPK = () => {
    window.location.href = '/clovia.apk'
  }

  if (dismissed) {
    return null
  }

  const positionProps = position === 'top' 
    ? { top: 0, left: 0, right: 0 }
    : { bottom: 4, left: 4, right: 4 }

  if (variant === 'card') {
    return (
      <Box
        position={position === 'bottom' ? 'fixed' : 'relative'}
        {...positionProps}
        bg="linear-gradient(135deg, #319795 0%, #2c7a7b 100%)"
        borderRadius={position === 'top' ? '0' : '12px'}
        p={4}
        mb={position === 'bottom' ? 0 : 4}
        color="white"
        boxShadow="lg"
        zIndex={40}
      >
        <HStack justify="space-between" align="flex-start" spacing={4}>
          <VStack align="start" spacing={2} flex={1}>
            <HStack spacing={2}>
              <Icon as={FiSmartphone} boxSize={5} />
              <Text fontWeight="bold" fontSize="lg">
                Get the Real App
              </Text>
            </HStack>
            <Text fontSize="sm" opacity={0.9}>
              {isAndroid 
                ? 'Download the native Android app for the best experience - offline support, push notifications, and more!'
                : 'Download the app to access it like a native app - works offline, faster, and more reliable!'}
            </Text>
          </VStack>
          <CloseButton 
            onClick={handleDismiss}
            size="lg"
            _hover={{ bg: 'rgba(255,255,255,0.2)' }}
            flexShrink={0}
          />
        </HStack>
        
        <HStack spacing={3} mt={4}>
          {isAndroid && (
            <Button
              size="sm"
              bg="white"
              color="teal.600"
              fontWeight="bold"
              leftIcon={<FiDownload />}
              onClick={handleDownloadAPK}
              _hover={{ bg: 'gray.100' }}
            >
              Download APK (2 MB)
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            borderColor="white"
            color="white"
            _hover={{ bg: 'rgba(255,255,255,0.1)' }}
            onClick={handleDismiss}
          >
            Maybe Later
          </Button>
        </HStack>
      </Box>
    )
  }

  // Default banner variant
  return (
    <Box
      bg="linear-gradient(135deg, #319795 0%, #2c7a7b 100%)"
      color="white"
      p={3}
      borderRadius="8px"
      mb={4}
      position="relative"
    >
      <HStack justify="space-between" align="center" spacing={4}>
        <HStack spacing={2} flex={1}>
          <Icon as={FiSmartphone} />
          <VStack align="start" spacing={0}>
            <Text fontWeight="bold" fontSize="sm">Download the app</Text>
            <Text fontSize="xs" opacity={0.85}>
              {isAndroid 
                ? 'Get native app features - offline, faster, push notifications'
                : 'Install as app for full screen experience'}
            </Text>
          </VStack>
        </HStack>

        <HStack spacing={2} flexShrink={0}>
          {isAndroid && (
            <Button
              size="xs"
              bg="white"
              color="teal.600"
              fontWeight="bold"
              leftIcon={<FiDownload />}
              onClick={handleDownloadAPK}
              _hover={{ bg: 'gray.100' }}
            >
              APK
            </Button>
          )}
          <CloseButton 
            size="sm"
            onClick={handleDismiss}
            _hover={{ bg: 'rgba(255,255,255,0.2)' }}
          />
        </HStack>
      </HStack>
    </Box>
  )
}

export default AppDownloadBanner
