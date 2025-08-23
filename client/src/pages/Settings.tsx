import React, { useState, useEffect } from 'react'
import {
  Box,
  Container,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Card,
  CardBody,
  FormControl,
  FormLabel,
  Input,
  Switch,
  Select,
  Divider,
  useToast,
  useColorMode,
  useBreakpointValue,
} from '@chakra-ui/react'

const SettingsPage: React.FC = () => {
  const toast = useToast()
  const { colorMode, toggleColorMode } = useColorMode()
  // page background color (applies to entire viewport)
  const pageBg = '#FFFDF1'

  // form state
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [darkMode, setDarkMode] = useState(colorMode === 'dark')
  const [language, setLanguage] = useState('en')
  const [emailNotifications, setEmailNotifications] = useState(true)
  const isMobile = useBreakpointValue({ base: true, md: false })

  useEffect(() => {
    // load existing values (replace with real data hook if available)
    setUsername('') // placeholder initial value
    setEmail('') // placeholder initial value
  }, [])

  useEffect(() => {
    // sync with Chakra color mode when toggled locally
    if (darkMode !== (colorMode === 'dark')) {
      toggleColorMode()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode])

  const handleSave = () => {
    // simple validation
    if (!username.trim() || !email.trim()) {
      toast({
        title: 'Missing required fields',
        description: 'Please provide both username and email.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    // Persist settings (replace with API call)
    toast({
      title: 'Settings saved',
      description: 'Your preferences have been updated.',
      status: 'success',
      duration: 3000,
      isClosable: true,
    })
  }

  return (
    <Box minH="100vh" bg={pageBg} py={6}>
      <Container maxW="container.md" py={0}>
        <VStack spacing={6} align="stretch">
          <Box>
            <Heading size="lg" mb={1}>
              Settings
            </Heading>
            <Text color="gray.600" fontSize="sm">
              Manage your account, preferences, and notification settings.
            </Text>
          </Box>

          {/* Account */}
          <Card
            borderRadius="lg"
            overflow="hidden"
            variant="outline"
            _hover={{ boxShadow: 'md', transform: 'translateY(-2px)' }}
            transition="all 150ms ease"
          >
            <CardBody>
              <Heading size="sm" mb={4}>
                Account
              </Heading>

              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FormLabel>Username</FormLabel>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Your display name"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Email</FormLabel>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </FormControl>

                <HStack spacing={3} justify="flex-start" pt={1}>
                  <Button size={isMobile ? 'md' : 'sm'} variant="outline" onClick={() => toast({
                    title: 'Change password',
                    description: 'Redirect to change password flow (not implemented).',
                    status: 'info',
                    duration: 3000,
                    isClosable: true,
                  })}>
                    Change Password
                  </Button>
                  <Text color="gray.500" fontSize="sm">
                    Keep your account secure by updating passwords regularly.
                  </Text>
                </HStack>
              </VStack>
            </CardBody>
          </Card>

          {/* Preferences */}
          <Card
            borderRadius="lg"
            overflow="hidden"
            variant="outline"
            _hover={{ boxShadow: 'md', transform: 'translateY(-2px)' }}
            transition="all 150ms ease"
          >
            <CardBody>
              <Heading size="sm" mb={4}>
                Preferences
              </Heading>

              <VStack spacing={4} align="stretch">
                <HStack justify="space-between">
                  <Box>
                    <FormLabel mb={0}>Dark Mode</FormLabel>
                    <Text color="gray.500" fontSize="sm">Toggle theme</Text>
                  </Box>
                  <Switch
                    isChecked={darkMode}
                    onChange={(e) => setDarkMode(e.target.checked)}
                    aria-label="Toggle dark mode"
                  />
                </HStack>

                <FormControl>
                  <FormLabel>Language</FormLabel>
                  <Select value={language} onChange={(e) => setLanguage(e.target.value)} maxW="220px">
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                  </Select>
                </FormControl>
              </VStack>
            </CardBody>
          </Card>

          {/* Notifications */}
          <Card
            borderRadius="lg"
            overflow="hidden"
            variant="outline"
            _hover={{ boxShadow: 'md', transform: 'translateY(-2px)' }}
            transition="all 150ms ease"
          >
            <CardBody>
              <Heading size="sm" mb={4}>
                Notifications
              </Heading>

              <VStack spacing={4} align="stretch">
                <HStack justify="space-between">
                  <Box>
                    <FormLabel mb={0}>Email Notifications</FormLabel>
                    <Text color="gray.500" fontSize="sm">Receive updates and offers via email</Text>
                  </Box>
                  <Switch
                    isChecked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    aria-label="Toggle email notifications"
                  />
                </HStack>
              </VStack>
            </CardBody>
          </Card>

          <Divider />

          <Button
            colorScheme="brand"
            size="lg"
            onClick={handleSave}
            width="100%"
            borderRadius="lg"
            boxShadow="sm"
            _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
            transition="all 150ms ease"
          >
            Save Changes
          </Button>
        </VStack>
      </Container>
    </Box>
  )
}

export default SettingsPage