import React, { useState, useEffect } from 'react'
import {
  Box,
  VStack,
  HStack,
  Container,
  Heading,
  Text,
  Button,
  Card,
  CardBody,
  Badge,
  Spinner,
  Center,
  useToast,
  Icon,
  Grid,
  Divider,
  Switch,
  List,
  ListItem,
  ListIcon,
  Circle,
  useDisclosure,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Collapse,
  Flex,
  Stack,
  useColorModeValue,
} from '@chakra-ui/react'
import { FaLock, FaCrown, FaLink, FaArrowRight, FaCheck, FaUser, FaBox, FaStar, FaRocket, FaShieldAlt, FaBolt, FaCheckCircle, FaTimes, FaQuestionCircle, FaGift, FaInfinity, FaChevronDown, FaChevronUp, FaChartLine, FaTruck, FaHandshake, FaPercentage } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import { TradeLoop, MultiWayTrade } from '../types'
import { fetchTradeLoops, fetchMultiWayTrade } from '../services/tradeService'
import MultiWayTradeModal from '../components/MultiWayTradeModal'
import { api } from '../services/api'

const Premium: React.FC = () => {
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const { isOpen, onOpen, onClose } = useDisclosure()
  
  const [loops, setLoops] = useState<TradeLoop[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLoop, setSelectedLoop] = useState<MultiWayTrade | null>(null)
  const [isYearly, setIsYearly] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const hoverBg = useColorModeValue('gray.50', 'gray.700')

  const isPremiumUser = user?.is_premium === true

  useEffect(() => {
    // Refresh user profile on mount to capture any recent premium upgrades
    refreshUser()

    // Check if user was redirected from payment (Xendit)
    const params = new URLSearchParams(window.location.search)
    const isFromPayment = params.has('utm_source') || window.location.href.includes('premium')

    if (isFromPayment) {
      // Webhook might still be processing, refresh multiple times
      const refreshAttempts = [1000, 2000, 3000, 5000] // Refresh at 1s, 2s, 3s, 5s
      const timers = refreshAttempts.map(delay =>
        setTimeout(() => {
          console.log(`Refreshing premium status (${delay}ms after redirect)`)
          refreshUser()
        }, delay)
      )
      return () => timers.forEach(timer => clearTimeout(timer))
    }

    if (isPremiumUser) {
      fetchLoops()
      const interval = setInterval(fetchLoops, 30000)
      return () => clearInterval(interval)
    }
  }, [isPremiumUser, refreshUser])

  const fetchLoops = async () => {
    try {
      setLoading(true)
      const data = await fetchTradeLoops()
      setLoops(data)
    } catch (error: any) {
      // Silently fail or log
    } finally {
      setLoading(false)
    }
  }

  const handleSelectLoop = async (loop: TradeLoop) => {
    if (!isPremiumUser) {
      toast({
        id: "premium-premium-feature",
        title: 'Premium Feature',
        description: 'Multi-way trading is available to premium members only',
        status: 'info',
      })
      return
    }

    try {
      setLoading(true)
      const loopId = `loop_${loop.edges.map(e => e.trade_id).join('_')}`
      const multiWayTrade = await fetchMultiWayTrade(loopId)
      setSelectedLoop(multiWayTrade)
      onOpen()
    } catch (error: any) {
      toast({
        id: "premium-error-2",
        title: 'Error',
        description: 'Failed to load trade loop details',
        status: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCloseModal = () => {
    onClose()
    setSelectedLoop(null)
    fetchLoops()
  }

  const handleSelectLoop = (loop: TradeLoop) => {
    const loopId = `loop_${loop.edges.map(e => e.trade_id).join('_')}`
    fetchMultiWayTrade(loopId).then(data => {
      setSelectedLoop(data)
      onOpen()
    })
  }

  const renderPremiumFeature = () => {
    return (
      <VStack spacing={8} align="stretch">
        <Card bg="green.50" borderWidth="2px" borderColor="green.300">
          <CardBody>
            <Flex justify="space-between" align="center" wrap="wrap" gap={4} py={2}>
              <HStack spacing={4}>
                <Icon as={FaCheckCircle} fontSize="2xl" color="green.500" />
                <VStack align="start" spacing={0}>
                  <Heading size="md" color="green.800">Premium Active</Heading>
                  <Text color="green.600" fontSize="sm">Full access - All features unlocked</Text>
                </VStack>
              </HStack>
              <Badge colorScheme="green" fontSize="md" px={4} py={1} borderRadius="full">Active</Badge>
            </Flex>
          </CardBody>
        </Card>

        {/* Multi-Way Trading Section */}
        <Box>
          <Heading size="md" mb={4} display="flex" alignItems="center" gap={2}>
            <Icon as={FaLink} color="green.500" />
            Multi-Way Trading Loops
          </Heading>
          <Text fontSize="sm" color="gray.600" mb={4}>
            Participate in trading chains where multiple users exchange products simultaneously. Find the perfect trading loop and complete transactions with confidence.
          </Text>

          {loading && loops.length === 0 ? (
            <Center py={8}>
              <Spinner size="lg" color="brand.500" />
            </Center>
          ) : loops.length === 0 ? (
            <Card bg={cardBg} borderColor={borderColor} borderWidth="1px">
              <CardBody>
                <HStack spacing={3} justify="center" py={8}>
                  <Icon as={FaLink} fontSize="2xl" color="gray.400" />
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="semibold" color="gray.600">
                      No multi-way trades available
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      Create more trade offers to unlock trading loops
                    </Text>
                  </VStack>
                </HStack>
              </CardBody>
            </Card>
          ) : (
            <VStack spacing={4} align="stretch">
              {loops.map((loop, idx) => (
                <Card
                  key={idx}
                  bg={cardBg}
                  borderColor={borderColor}
                  borderWidth="1px"
                  _hover={{ bg: hoverBg, cursor: 'pointer', borderColor: 'brand.500', boxShadow: 'md' }}
                  transition="all 0.2s"
                  onClick={() => handleSelectLoop(loop)}
                >
                  <CardBody>
                    <VStack spacing={3} align="stretch">
                      <Flex justify="space-between" align="start">
                        <HStack spacing={2}>
                          <Badge colorScheme="green" variant="solid">
                            {loop.loop_length}-Way Trade
                          </Badge>
                          <Badge colorScheme="blue" variant="outline">
                            {loop.participants.length} participants
                          </Badge>
                          <Badge colorScheme="purple" variant="subtle">
                            <HStack spacing={1}>
                              <Icon as={FaCrown} fontSize="sm" />
                              <Text>Premium</Text>
                            </HStack>
                          </Badge>
                        </HStack>
                        <Button
                          size="sm"
                          variant="ghost"
                          colorScheme="brand"
                          rightIcon={<FaArrowRight />}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSelectLoop(loop)
                          }}
                        >
                          Details
                        </Button>
                      </Flex>

                      <Box overflowX="auto" py={2}>
                        <Flex align="center" gap={2} minW="fit-content" px={2}>
                          {loop.edges.map((edge, edgeIdx) => (
                            <React.Fragment key={edgeIdx}>
                              <VStack spacing={1} align="center" minW="120px">
                                <Badge colorScheme="gray" variant="outline" fontSize="xs">
                                  User {edge.from_user}
                                </Badge>
                                <Text fontSize="xs" color="gray.600" textAlign="center">
                                  {edge.product_title?.substring(0, 15)}...
                                </Text>
                              </VStack>
                              <Icon as={FaArrowRight} color="brand.500" fontSize="lg" />
                            </React.Fragment>
                          ))}
                          <VStack spacing={1} align="center" minW="120px">
                            <Badge colorScheme="gray" variant="outline" fontSize="xs">
                              User {loop.edges[0].from_user}
                            </Badge>
                            <Text fontSize="xs" color="gray.600" textAlign="center">
                              Completes loop
                            </Text>
                          </VStack>
                        </Flex>
                      </Box>
                    </VStack>
                  </CardBody>
                </Card>
              ))}
            </VStack>
          )}
        </Box>
      </VStack>
    )
  }

  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index)
  }

  const premiumFeatures = [
    {
      icon: FaInfinity,
      title: 'Unlimited Listings',
      description: 'Post as many products as you want without limits',
      color: 'purple.500'
    },
    {
      icon: FaBolt,
      title: 'Fast-Track Trading',
      description: 'Your listings get priority visibility in search results',
      color: 'orange.500'
    },
    {
      icon: FaShieldAlt,
      title: 'Verified Seller Badge',
      description: 'Increase buyer confidence with your premium status',
      color: 'blue.500'
    },
    {
      icon: FaRocket,
      title: 'Boosted Listings',
      description: 'Appear at the top of category searches and trending',
      color: 'green.500'
    },
    {
      icon: FaLink,
      title: 'Multi-Way Trading',
      description: 'Participate in complex trading chains and loops',
      color: 'pink.500'
    },
    {
      icon: FaCrown,
      title: 'Priority Support',
      description: 'Get faster response times from our support team',
      color: 'yellow.500'
    }
  ]

  const faqItems = [
    {
      question: 'Is this a one-time payment or subscription?',
      answer: 'Premium is a one-time lifetime payment of P499. No recurring charges or hidden fees. Pay once and enjoy all premium features forever.'
    },
    {
      question: 'What is Multi-Way Trading?',
      answer: 'Multi-Way Trading allows you to participate in trading chains where multiple users exchange products simultaneously. For example, User A gives to User B, who gives to User C, who gives back to User A - completing a trading loop.'
    },
    {
      question: 'How does Boosted Listings work?',
      answer: 'Your products will appear higher in search results and the main feed. Premium listings are prioritized over regular listings, giving you more visibility and faster trades.'
    },
    {
      question: 'Can I get a refund?',
      answer: 'Due to the digital nature of premium features, refunds are handled on a case-by-case basis. Contact our support team if you have any concerns.'
    },
    {
      question: 'Will I lose my premium if the app updates?',
      answer: 'No! Your premium status is tied to your account and will remain active through all updates. You may even get access to new premium features as we add them.'
    }
  ]

  const comparisonFeatures = [
    { feature: 'Basic Trading', free: true, premium: true },
    { feature: 'Product Listings', free: '10 max', premium: 'Unlimited' },
    { feature: 'Trade Requests', free: true, premium: true },
    { feature: 'Messaging', free: true, premium: true },
    { feature: 'Multi-Way Trading', free: false, premium: true },
    { feature: 'Boosted Listings', free: false, premium: true },
    { feature: 'Premium Badge', free: false, premium: true },
    { feature: 'Priority Support', free: false, premium: true },
    { feature: 'Early Access Features', free: false, premium: true },
    { feature: 'Search Priority', free: 'Standard', premium: 'Top Results' },
  ]

  const handleUpgrade = async () => {
    try {
      setUpgrading(true)
      const plan = isYearly ? 'yearly' : 'monthly'
      const { data } = await api.post('/api/payments/subscription', { plan })
      if (data?.success && data?.data?.checkout_url) {
        window.location.href = data.data.checkout_url
      } else {
        throw new Error('Failed to create payment session')
      }
    } catch (error: any) {
      toast({
        id: 'premium-upgrade-error',
        title: 'Upgrade Failed',
        description: error.response?.data?.error || error.message || 'Something went wrong',
        status: 'error',
      })
    } finally {
      setUpgrading(false)
    }
  }

  const renderLockedContent = () => {
    return (
      <VStack spacing={10} align="stretch">
        {/* Plan Hero Card */}
        <Card
          bg="linear-gradient(135deg, #9F7AEA 0%, #805AD5 50%, #6B46C1 100%)"
          borderWidth="0"
          overflow="hidden"
          position="relative"
        >
          <Box
            position="absolute"
            top="-50px"
            right="-50px"
            w="200px"
            h="200px"
            bg="whiteAlpha.100"
            borderRadius="full"
          />
          <Box
            position="absolute"
            bottom="-30px"
            left="-30px"
            w="150px"
            h="150px"
            bg="whiteAlpha.100"
            borderRadius="full"
          />
          <CardBody py={12} position="relative">
            <VStack spacing={5} align="center">
              <Badge colorScheme="yellow" fontSize="sm" px={3} py={1} borderRadius="full">
                <HStack spacing={1}>
                  <Icon as={FaGift} />
                  <Text>LIFETIME ACCESS</Text>
                </HStack>
              </Badge>
              <Icon as={FaCrown} fontSize="6xl" color="yellow.300" />
              <Heading size="2xl" color="white" textAlign="center">Clovia Premium</Heading>
              <Text color="whiteAlpha.900" fontSize="lg" textAlign="center" maxW="500px">
                Unlock the full potential of your trading experience with exclusive features and priority access
              </Text>
              <HStack align="baseline" spacing={1} mt={2}>
                <Text fontSize="xl" color="whiteAlpha.800" textDecoration="line-through">P999</Text>
                <Text fontSize="5xl" fontWeight="bold" color="white">P499</Text>
                <VStack spacing={0} align="start">
                  <Text fontSize="lg" color="whiteAlpha.800">one-time</Text>
                  <Badge colorScheme="green" fontSize="xs">50% OFF</Badge>
                </VStack>
              </HStack>
              <Button
                colorScheme="yellow"
                color="purple.800"
                size="lg"
                px={10}
                leftIcon={<FaCrown />}
                isLoading={upgrading}
                onClick={handleUpgrade}
                _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }}
                transition="all 0.2s"
              >
                Get Premium Now
              </Button>
              <HStack spacing={4} color="whiteAlpha.800" fontSize="sm">
                <HStack spacing={1}>
                  <Icon as={FaInfinity} />
                  <Text>Lifetime access</Text>
                </HStack>
                <HStack spacing={1}>
                  <Icon as={FaShieldAlt} />
                  <Text>Secure payment</Text>
                </HStack>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* Plan Comparison Table */}
        <Box>
          <Heading size="lg" mb={2} textAlign="center">Free vs Premium</Heading>
          <Text color="gray.500" textAlign="center" mb={6}>See what you're missing out on</Text>
          <TableContainer>
            <Table variant="simple" bg={cardBg} borderRadius="lg" overflow="hidden" boxShadow="sm">
              <Thead bg={hoverBg}>
                <Tr>
                  <Th>Feature</Th>
                  <Th textAlign="center">Free</Th>
                  <Th textAlign="center" color="purple.500">Premium</Th>
                </Tr>
              </Thead>
              <Tbody>
                {comparisonFeatures.map((item, idx) => (
                  <Tr key={idx} _hover={{ bg: hoverBg }}>
                    <Td fontWeight="medium">{item.feature}</Td>
                    <Td textAlign="center">
                      {typeof item.free === 'boolean' ? (
                        item.free ? (
                          <Icon as={FaCheck} color="green.500" />
                        ) : (
                          <Icon as={FaTimes} color="red.400" />
                        )
                      ) : (
                        <Text fontSize="sm" color="gray.600">{item.free}</Text>
                      )}
                    </Td>
                    <Td textAlign="center">
                      {typeof item.premium === 'boolean' ? (
                        item.premium ? (
                          <Icon as={FaCheck} color="green.500" />
                        ) : (
                          <Icon as={FaTimes} color="red.400" />
                        )
                      ) : (
                        <Badge colorScheme="purple" variant="subtle">{item.premium}</Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </Box>

        {/* Benefits Grid */}
        <Box>
          <Heading size="md" mb={6}>Pro Features Included</Heading>
          <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
            {proFeatures.map((feature: any, idx: number) => (
              <Card key={idx} bg={cardBg} borderColor={borderColor} borderWidth="1px">
                <CardBody p={4}>
                  <HStack spacing={4}>
                    <Circle size="40px" bg="purple.50" color="purple.500">
                      <Icon as={feature.icon} />
                    </Circle>
                    <VStack align="start" spacing={0}>
                      <Text fontWeight="bold" fontSize="sm">{feature.title}</Text>
                    </VStack>
                  </HStack>
                </CardBody>
              </Card>
            ))}
          </Grid>
        </Box>
      </VStack>
    )
  }

  return (
    <Box>
      <Container maxW="container.xl" py={12}>
        <VStack spacing={12} align="stretch">
          <VStack spacing={4} textAlign="center">
            <Badge 
              colorScheme="purple" 
              px={4} 
              py={1} 
              borderRadius="full" 
              fontSize="sm" 
              fontWeight="bold"
            >
              Clovia Premium
            </Badge>
            <Heading size="2xl" fontWeight="extrabold">
              Level up your trading game
            </Heading>
            <Text fontSize="lg" color="gray.500" maxW="2xl">
              Unlock the full potential of Clovia with our premium features designed to help you trade faster, safer, and smarter.
            </Text>

            {!isPremiumUser && (
              <HStack spacing={4} pt={4}>
                <Text fontWeight="medium" color={!isYearly ? 'gray.800' : 'gray.500'}>Monthly</Text>
                <Switch 
                  colorScheme="purple" 
                  size="lg" 
                  isChecked={isYearly}
                  onChange={(e) => setIsYearly(e.target.checked)}
                />
                <HStack spacing={2}>
                  <Text fontWeight="medium" color={isYearly ? 'gray.800' : 'gray.500'}>Yearly</Text>
                  <Badge colorScheme="green" variant="subtle" borderRadius="full" px={2}>75% OFF</Badge>
                </HStack>
              </HStack>
            )}
          </VStack>

          {isPremiumUser ? (
            renderPremiumFeature()
          ) : (
            <VStack spacing={12} align="stretch">
              <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr 1fr' }} gap={8} display="flex" flexDirection={{ base: "column", lg: "row" }} alignItems="stretch">
                {/* Free Tier */}
                <Card 
                  flex={1}
                  borderRadius="2xl" 
                  boxShadow="lg" 
                  borderWidth="1px" 
                  borderColor={borderColor}
                  overflow="hidden"
                  bg={cardBg}
                >
                  <Box bg="gray.400" h="8px" />
                  <CardBody p={8} display="flex" flexDirection="column">
                    <VStack spacing={6} align="start" flex={1}>
                      <VStack spacing={1} align="start">
                        <Text fontSize="md" color="gray.500" fontWeight="bold">Free</Text>
                        <Text fontSize="lg" fontWeight="semibold" color="gray.800">Basic</Text>
                        <HStack align="baseline">
                          <Text fontSize="4xl" fontWeight="extrabold">₱0</Text>
                          <Text color="gray.500">/month</Text>
                        </HStack>
                      </VStack>

                      <Divider />

                      <Box w="full">
                        {renderFeatureList(freeFeatures)}
                      </Box>
                    </VStack>
                    <Button
                      w="full"
                      mt={8}
                      size="lg"
                      variant="outline"
                      colorScheme="gray"
                      isDisabled={true}
                    >
                      Current Plan
                    </Button>
                  </CardBody>
                </Card>

                {/* Plus Tier */}
                <Card 
                  flex={1}
                  borderRadius="2xl" 
                  boxShadow="2xl" 
                  borderWidth="2px" 
                  borderColor="purple.400"
                  overflow="hidden"
                  bg={cardBg}
                  position="relative"
                  transform={{ lg: "scale(1.05)" }}
                  zIndex={1}
                >
                  <Box bg="purple.500" h="8px" />
                  <Badge 
                    position="absolute" 
                    top={4} 
                    right={4} 
                    colorScheme="purple" 
                    variant="solid" 
                    borderRadius="full" 
                    px={3}
                  >
                    Most popular
                  </Badge>
                  <CardBody p={8} display="flex" flexDirection="column">
                    <VStack spacing={6} align="start" flex={1}>
                      <VStack spacing={1} align="start">
                        <Text fontSize="md" color="purple.500" fontWeight="bold">Plus</Text>
                        <HStack align="baseline">
                          <Text fontSize="4xl" fontWeight="extrabold">₱{isYearly ? '699' : '79'}</Text>
                          <Text color="gray.500">/{isYearly ? 'year' : 'month'}</Text>
                        </HStack>
                        {isYearly && <Text fontSize="sm" color="gray.500">or ₱58/mo billled yearly</Text>}
                        {isYearly && <Text fontSize="xs" color="green.500" fontWeight="bold">save 26%</Text>}
                      </VStack>

                    <List spacing={3} w="full">
                      {premiumFeatures.map((f: typeof premiumFeatures[0], i: number) => (
                        <ListItem key={i} display="flex" alignItems="center" fontSize="sm">
                          <ListIcon as={FaCheckCircle} color="purple.500" />
                          <Text fontWeight="medium">{f.title}</Text>
                        </ListItem>
                      ))}
                    </List>

                      <Box w="full">
                        {renderFeatureList(plusFeatures)}
                      </Box>
                    </VStack>
                    <Button
                      w="full"
                      mt={8}
                      size="lg"
                      colorScheme="purple"
                      isLoading={upgrading}
                      onClick={() => handleUpgrade('plus')}
                      leftIcon={<FaCrown />}
                    >
                      Upgrade to Plus
                    </Button>
                  </CardBody>
                </Card>

        {/* Features Grid */}
        <Box pt={8}>
            <VStack spacing={8}>
              <Heading size="lg">Everything you get with Premium</Heading>
              <Grid templateColumns={{ base: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }} gap={8} w="full">
                {premiumFeatures.map((feature: typeof premiumFeatures[0], index: number) => (
                  <Card key={index} variant="outline" borderRadius="xl" _hover={{ shadow: 'md', borderColor: 'purple.200' }} transition="all 0.2s">
                    <CardBody p={6}>
                      <VStack align="start" spacing={4}>
                        <Circle size="48px" bg={`${feature.color.split('.')[0]}.50`} color={feature.color}>
                          <Icon as={feature.icon} fontSize="20px" />
                        </Circle>
                        <VStack align="start" spacing={1}>
                          <Text fontWeight="bold" fontSize="lg">{feature.title}</Text>
                          <Text fontSize="sm" color="gray.600">{feature.description}</Text>
                        </VStack>
                      </VStack>

                      <Divider />

                      <Box w="full">
                        {renderFeatureList(proFeatures)}
                      </Box>
                    </VStack>
                    <Button
                      w="full"
                      mt={8}
                      size="lg"
                      colorScheme="orange"
                      isLoading={upgrading}
                      onClick={() => handleUpgrade('pro')}
                      leftIcon={<FaStar />}
                    >
                      Go Pro
                    </Button>
                  </CardBody>
                </Card>
              </Grid>

              {/* Comparison & FAQ */}
              <Tabs isFitted variant="soft-rounded" colorScheme="purple">
                <TabList mb="1em">
                  <Tab>Feature Comparison</Tab>
                  <Tab>FAQ</Tab>
                </TabList>
                <TabPanels>
                  <TabPanel p={0}>
                    <TableContainer bg={cardBg} borderRadius="xl" border="1px" borderColor={borderColor}>
                      <Table variant="simple" size="sm">
                        <Thead>
                          <Tr>
                            <Th>Feature</Th>
                            <Th>Free</Th>
                            <Th color="purple.500">Plus</Th>
                            <Th color="orange.500">Pro</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {comparisonFeatures.map((item: any, idx) => (
                            <Tr key={idx}>
                              <Td fontWeight="medium" py={4}>{item.feature}</Td>
                              <Td py={4}>{typeof item.free === 'boolean' ? (item.free ? <Icon as={FaCheck} color="green.500" /> : <Icon as={FaTimes} color="red.400" />) : item.free}</Td>
                              <Td py={4}>{typeof item.plus === 'boolean' ? (item.plus ? <Icon as={FaCheck} color="green.500" /> : <Icon as={FaTimes} color="red.400" />) : <Badge colorScheme="purple" variant="subtle">{item.plus}</Badge>}</Td>
                              <Td py={4}>{typeof item.pro === 'boolean' ? (item.pro ? <Icon as={FaCheck} color="green.500" /> : <Icon as={FaTimes} color="red.400" />) : <Badge colorScheme="orange" variant="subtle">{item.pro}</Badge>}</Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </TableContainer>
                  </TabPanel>
                  <TabPanel p={0}>
                    <VStack spacing={4} align="stretch">
                      {faqItems.map((faq, idx) => (
                        <Card key={idx} variant="outline" borderRadius="xl">
                          <CardBody p={4}>
                            <Flex justify="space-between" align="center" cursor="pointer" onClick={() => toggleFaq(idx)}>
                              <Text fontWeight="bold">{faq.question}</Text>
                              <Icon as={expandedFaq === idx ? FaChevronUp : FaChevronDown} />
                            </Flex>
                            <Collapse in={expandedFaq === idx}>
                              <Text mt={4} color="gray.600" fontSize="sm">{faq.answer}</Text>
                            </Collapse>
                          </CardBody>
                        </Card>
                      ))}
                    </VStack>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </VStack>
          )}
        </VStack>
      </Container>
      
      {selectedLoop && (
        <MultiWayTradeModal
          isOpen={isOpen}
          onClose={handleCloseModal}
          multiWayTrade={selectedLoop}
        />
      )}
    </Box>
  )
}

export default Premium