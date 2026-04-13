import React from 'react'
import { Box, Button, HStack, Text, VStack, Icon } from '@chakra-ui/react'
import { FiDownload, FiSmartphone } from 'react-icons/fi'
import { canShowInstallPrompt, initializeInstallPrompt, isRunningStandalone, promptInstall } from '../serviceWorkerRegistration'

interface InstallAppPromptProps {
  variant?: 'floating' | 'mobile-menu' | 'profile-menu'
  onInstalled?: () => void
}

const InstallAppPrompt: React.FC<InstallAppPromptProps> = ({
  variant = 'floating',
  onInstalled,
}) => {
  const [visible, setVisible] = React.useState(false)
  const [installing, setInstalling] = React.useState(false)
  const [isAndroid, setIsAndroid] = React.useState(false)

  React.useEffect(() => {
    if (isRunningStandalone()) {
      setVisible(false)
      return
    }

    // Detect Android
    const userAgent = navigator.userAgent.toLowerCase()
    setIsAndroid(/android/.test(userAgent))

    const cleanup = initializeInstallPrompt((isAvailable) => {
      setVisible(isAvailable)
    })

    setVisible(canShowInstallPrompt())

    return cleanup
  }, [])

  const handleInstall = async () => {
    setInstalling(true)
    try {
      const accepted = await promptInstall()
      if (accepted) {
        setVisible(false)
        onInstalled?.()
      }
    } finally {
      setInstalling(false)
    }
  }

  const handleDownloadAPK = () => {
    window.location.href = '/clovia.apk'
  }

  if (!visible) {
    return null
  }

  if (variant === 'mobile-menu') {
    return (
      <VStack align="stretch" spacing={2} w="full">
        {isAndroid && (
          <Button
            colorScheme="teal"
            variant="ghost"
            justifyContent="flex-start"
            onClick={handleDownloadAPK}
            leftIcon={<FiDownload />}
            minH="48px"
            w="full"
          >
            Download APK (2 MB)
          </Button>
        )}
        <Button
          colorScheme="teal"
          variant="ghost"
          justifyContent="flex-start"
          onClick={handleInstall}
          isLoading={installing}
          loadingText="Installing"
          leftIcon={<FiSmartphone />}
          minH="48px"
          w="full"
        >
          Install Web App
        </Button>
      </VStack>
    )
  }

  if (variant === 'profile-menu') {
    return (
      <VStack align="stretch" spacing={1} w="full">
        {isAndroid && (
          <Button
            size="sm"
            w="full"
            variant="ghost"
            justifyContent="flex-start"
            onClick={handleDownloadAPK}
            leftIcon={<FiDownload />}
            whiteSpace="normal"
            h="auto"
            py={2}
            textAlign="left"
          >
            <VStack align="start" spacing={0}>
              <Text fontSize="sm" fontWeight="medium">Download APK</Text>
              <Text fontSize="xs" color="gray.500">Native app (2 MB)</Text>
            </VStack>
          </Button>
        )}
        <Button
          size="sm"
          w="full"
          variant="ghost"
          justifyContent="flex-start"
          onClick={handleInstall}
          isLoading={installing}
          loadingText="Installing"
          leftIcon={<FiSmartphone />}
          whiteSpace="normal"
          h="auto"
          py={2}
          textAlign="left"
        >
          <VStack align="start" spacing={0}>
            <Text fontSize="sm" fontWeight="medium">Install Clovia</Text>
            <Text fontSize="xs" color="gray.500">as web app</Text>
          </VStack>
        </Button>
      </VStack>
    )
  }

  return (
    <Box
      position="fixed"
      left={4}
      right={4}
      bottom={4}
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="12px"
      boxShadow="lg"
      p={4}
      zIndex={1400}
    >
      <VStack align="stretch" spacing={3}>
        <HStack spacing={2}>
          <Icon as={FiSmartphone} boxSize={5} color="teal.600" />
          <VStack align="start" spacing={0} flex={1}>
            <Text fontSize="sm" fontWeight="bold" color="gray.800">
              Get the Clovia App
            </Text>
            <Text fontSize="xs" color="gray.500">
              {isAndroid ? 'Download now for the best experience' : 'Install as app for full-screen'}
            </Text>
          </VStack>
        </HStack>

        <HStack spacing={2}>
          {isAndroid && (
            <Button
              size="sm"
              colorScheme="teal"
              leftIcon={<FiDownload />}
              onClick={handleDownloadAPK}
              flex={1}
            >
              APK (2 MB)
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            colorScheme="teal"
            onClick={handleInstall}
            isLoading={installing}
            loadingText="Installing"
            flex={1}
          >
            Install Web
          </Button>
        </HStack>
      </VStack>
    </Box>
  )
}
}

export default InstallAppPrompt
