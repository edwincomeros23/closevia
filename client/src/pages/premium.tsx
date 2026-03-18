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
  useDisclosure,
  Circle,
} from '@chakra-ui/react'
import { FaLock, FaCrown, FaLink, FaArrowRight, FaCheck, FaUser, FaBox, FaStar, FaRocket, FaShieldAlt, FaBolt, FaCheckCircle, FaTimes, FaQuestionCircle, FaGift, FaInfinity, FaChevronDown, FaChevronUp, FaChartLine } from 'react-icons/fa'
import { FaCrown, FaCheck, FaCheckCircle, FaStar, FaTruck, FaChartLine, FaPercentage, FaShieldAlt, FaInfinity, FaArrowRight, FaLock, FaLink, FaUser, FaBox, FaRocket, FaBolt, FaTimes, FaQuestionCircle, FaGift, FaChevronDown, FaChevronUp, FaHandshake } from 'react-icons/fa'
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

  const handleUpgrade = async (tier: 'plus' | 'pro') => {
    try {
      setUpgrading(true)
      const plan = isYearly ? 'yearly' : 'monthly'
      const { data } = await api.post('/api/payments/subscription', { tier, plan })
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

  interface Feature {
    title: string;
    icon: any;
    category?: string;
  }

  const freeFeatures: Feature[] = [
    { title: '10 active listings', icon: FaBox, category: 'Listings' },
    { title: 'No boosts included', icon: FaTimes, category: 'Listings' },
    { title: 'Browse and trade freely', icon: FaHandshake, category: 'Trading' },
    { title: 'Standard delivery only', icon: FaTruck, category: 'Trading' },
    { title: 'Standard match feed', icon: FaStar, category: 'Trading' },
    { title: 'See total profile views only', icon: FaUser, category: 'Insights' },
    { title: 'AI price range shown', icon: FaBolt, category: 'Insights' },
  ]

  const plusFeatures: Feature[] = [
    { title: '30 active listings', icon: FaBox, category: 'Listings' },
    { title: '3 boosted listings', icon: FaRocket, category: 'Listings' },
    { title: 'Relist in one tap', icon: FaBolt, category: 'Listings' },
    { title: 'Express delivery access', icon: FaTruck, category: 'Trading' },
    { title: '10% off all delivery fees', icon: FaPercentage, category: 'Trading' },
    { title: 'Priority matches', icon: FaArrowRight, category: 'Trading' },
    { title: 'Trade dispute reviewed first', icon: FaShieldAlt, category: 'Trading' },
    { title: 'Who viewed your profile (actual usernames)', icon: FaUser, category: 'Insights' },
    { title: 'Item popularity breakdown', icon: FaChartLine, category: 'Insights' },
    { title: 'AI price confidence', icon: FaCheckCircle, category: 'Insights' },
    { title: 'Plus badge on profile', icon: FaCrown, category: 'Profile' },
    { title: 'Power seller', icon: FaStar, category: 'Profile' },
  ]

  const proFeatures: Feature[] = [
    { title: 'Unlimited listings', icon: FaInfinity, category: 'Listings' },
    { title: '10 boosted listings always pinned', icon: FaRocket, category: 'Listings' },
    { title: 'Bundle listing', icon: FaStar, category: 'Listings' },
    { title: 'Relist in one tap', icon: FaBolt, category: 'Listings' },
    { title: 'Express delivery access', icon: FaTruck, category: 'Trading' },
    { title: '20% off all delivery fees', icon: FaPercentage, category: 'Trading' },
    { title: 'First to see new nearby items', icon: FaStar, category: 'Trading' },
    { title: 'Top of match queue', icon: FaArrowRight, category: 'Trading' },
    { title: 'Trade dispute reviewed first', icon: FaShieldAlt, category: 'Trading' },
    { title: 'Full trade analytics', icon: FaChartLine, category: 'Insights' },
    { title: 'Who viewed your profile (full history)', icon: FaUser, category: 'Insights' },
    { title: 'AI price confidence + market data', icon: FaCheckCircle, category: 'Insights' },
    { title: 'Store page (own shop link)', icon: FaLink, category: 'Profile' },
    { title: 'Featured on homepage banner', icon: FaStar, category: 'Profile' },
    { title: 'Verified Pro badge', icon: FaCrown, category: 'Profile' },
    { title: 'Priority support', icon: FaBolt, category: 'Profile' },
  ]

  const renderFeatureList = (features: Feature[]) => {
    const categories = Array.from(new Set(features.map(f => f.category)));
    return categories.map(cat => (
      <VStack key={cat} align="start" w="full" spacing={2} mb={4}>
        <Text fontSize="xs" fontWeight="bold" color="gray.400" textTransform="uppercase" letterSpacing="wider">
          {cat}
        </Text>
        <List spacing={2} w="full">
          {features.filter(f => f.category === cat).map((f, i) => (
            <ListItem key={i} display="flex" alignItems="start" fontSize="sm">
              <ListIcon as={f.icon === FaTimes ? FaTimes : FaCheckCircle} color={f.icon === FaTimes ? "red.400" : "purple.500"} mt={1} />
              <Text color={f.icon === FaTimes ? "gray.400" : "gray.700"}>{f.title}</Text>
            </ListItem>
          ))}
        </List>
        <Divider />
      </VStack>
    ));
  }

  const comparisonFeatures = [
    { feature: 'Listings Limit', free: '10', plus: '30', pro: 'Unlimited' },
    { feature: 'Boosted Listings', free: 'None', plus: '3', pro: '10' },
    { feature: 'Relist in one tap', free: false, plus: true, pro: true },
    { feature: 'Express Delivery', free: false, plus: true, pro: true },
    { feature: 'Delivery Discount', free: 'None', plus: '10%', pro: '20%' },
    { feature: 'Priority Match Feed', free: 'Standard', plus: 'Priority', pro: 'Top Queue' },
    { feature: 'AI Price Analysis', free: 'Range Only', plus: 'Confidence Score', pro: 'Full Market Data' },
    { feature: 'Profile Views', free: 'Total Only', plus: 'Actual Usernames', pro: 'Full History' },
    { feature: 'Badge', free: 'None', plus: 'Plus Badge', pro: 'Verified Pro Badge' },
    { feature: 'Store Page', free: false, plus: false, pro: true },
    { feature: 'Trade Dispute Priority', free: 'Standard', plus: 'First Review', pro: 'First Review' },
    { feature: 'Priority Support', free: false, plus: false, pro: true },
  ]

  const faqItems = [
    {
      question: 'Is this a monthly or yearly subscription?',
      answer: `You can choose between a student-friendly monthly plan for P99 or a yearly plan for P299 (which gives you 75% off equivalent monthly cost).`
    },
    {
      question: 'What is Multi-Way Trading?',
      answer: 'Multi-Way Trading allows you to participate in trading chains where multiple users exchange products simultaneously. For example, User A gives to User B, who gives to User C, who gives back to User A - completing a trading loop.'
    },
    {
      question: 'How does Priority Listing work?',
      answer: 'Your products will appear higher in search results and the main feed. Premium listings are prioritized over regular listings, giving you more visibility and faster trades.'
    },
    {
      question: 'Can I cancel my subscription?',
      answer: 'Yes, you can cancel your subscription at any time from your account settings. You will continue to have premium access until the end of your current billing period.'
    },
    {
      question: 'What is the "Verified Badge"?',
      answer: 'The verified badge builds trust by signaling to other users that you are a premium, verified member of the community, which typically leads to faster and more reliable trades.'
    }
  ]

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index)
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

        <Divider />

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
        <VStack spacing={8} align="stretch">
          {/* Pricing Card (if not premium) */}
        {!isPremiumUser && (
          <Center>
              <Card 
                maxW="400px" 
                w="full" 
                borderRadius="2xl" 
                boxShadow="2xl" 
                borderWidth="2px" 
                borderColor="purple.400"
                overflow="hidden"
              >
                <Box bg="purple.500" h="8px" />
                <CardBody p={8}>
                  <VStack spacing={6}>
                    <VStack spacing={1}>
                      <Text fontSize="sm" color="gray.500" fontWeight="bold">PREMIUM PLAN</Text>
                      <HStack align="baseline">
                        <Text fontSize="5xl" fontWeight="extrabold">₱{isYearly ? '299' : '99'}</Text>
                        <Text color="gray.500">/{isYearly ? 'year' : 'month'}</Text>
                      </HStack>
                    </VStack>
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

                      <Divider />

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

                {/* Pro Tier */}
                <Card 
                  flex={1}
                  borderRadius="2xl" 
                  boxShadow="lg" 
                  borderWidth="1px" 
                  borderColor={borderColor}
                  overflow="hidden"
                  bg={cardBg}
                >
                  <Box bg="orange.400" h="8px" />
                  <CardBody p={8} display="flex" flexDirection="column">
                    <VStack spacing={6} align="start" flex={1}>
                      <VStack spacing={1} align="start">
                        <Text fontSize="md" color="orange.400" fontWeight="bold">Pro</Text>
                        <HStack align="baseline">
                          <Text fontSize="4xl" fontWeight="extrabold">₱{isYearly ? '1099' : '120'}</Text>
                          <Text color="gray.500">/{isYearly ? 'year' : 'month'}</Text>
                        </HStack>
                        {isYearly && <Text fontSize="sm" color="gray.500">or ₱91/mo billled yearly</Text>}
                        {isYearly && <Text fontSize="xs" color="green.500" fontWeight="bold">save 24%</Text>}
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