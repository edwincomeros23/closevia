import React from 'react'
import { Box, Button, HStack, Text, VStack } from '@chakra-ui/react'
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

  React.useEffect(() => {
    if (isRunningStandalone()) {
      setVisible(false)
      return
    }

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

  if (!visible) {
    return null
  }

  if (variant === 'mobile-menu') {
    return (
      <Button
        colorScheme="teal"
        variant="ghost"
        justifyContent="flex-start"
        onClick={handleInstall}
        isLoading={installing}
        loadingText="Installing"
        minH="48px"
        w="full"
      >
        Install App
      </Button>
    )
  }

  if (variant === 'profile-menu') {
    return (
      <Button
        size="sm"
        w="full"
        variant="ghost"
        justifyContent="flex-start"
        onClick={handleInstall}
        isLoading={installing}
        loadingText="Installing"
        whiteSpace="normal"
        h="auto"
        py={2}
        textAlign="left"
      >
        <VStack align="start" spacing={0}>
          <Text fontSize="sm" fontWeight="medium">Install Clovia</Text>
          <Text fontSize="xs" color="gray.500">for a full-screen app experience.</Text>
        </VStack>
      </Button>
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
      p={3}
      zIndex={1400}
    >
      <HStack justify="space-between" align="center">
        <Text fontSize="sm" color="gray.700" fontWeight="medium">
          Install Clovia for a full-screen app experience.
        </Text>
        <Button
          colorScheme="teal"
          size="sm"
          onClick={handleInstall}
          isLoading={installing}
          loadingText="Installing"
        >
          Install App
        </Button>
      </HStack>
    </Box>
  )
}

export default InstallAppPrompt
