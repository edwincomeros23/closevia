import React from 'react'
import { Box, Button, HStack, Text } from '@chakra-ui/react'
import { canShowInstallPrompt, initializeInstallPrompt, isRunningStandalone, promptInstall } from '../serviceWorkerRegistration'

const InstallAppPrompt: React.FC = () => {
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
      }
    } finally {
      setInstalling(false)
    }
  }

  if (!visible) {
    return null
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
