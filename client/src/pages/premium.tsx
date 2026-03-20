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
  Divider,
  Switch,
  List,
  ListItem,
  ListIcon,
  useDisclosure,
  Flex,
  SimpleGrid,
  useColorModeValue,
  Collapse,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
} from '@chakra-ui/react'
import {
  FaCrown, FaLink, FaArrowRight, FaCheck, FaRocket,
  FaShieldAlt, FaBolt, FaCheckCircle, FaTimes,
  FaInfinity, FaChevronDown, FaChevronUp,
  FaChartLine, FaTruck, FaHandshake, FaPercentage,
  FaEye, FaStar, FaStore, FaHeadset, FaBoxes,
  FaRedoAlt, FaSearch, FaUserShield, FaImage
} from 'react-icons/fa'
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
  const [upgrading, setUpgrading] = useState<string | null>(null) // 'plus' | 'pro' | null
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const hoverBg = useColorModeValue('gray.50', 'gray.700')
  const subtleBg = useColorModeValue('gray.50', 'gray.900')
  const mutedText = useColorModeValue('gray.500', 'gray.400')

  const isPremiumUser = user?.is_premium === true
  const currentTier = user?.premium_tier || 'free'

  useEffect(() => {
    refreshUser()

    const params = new URLSearchParams(window.location.search)
    const isFromPayment = params.has('utm_source') || window.location.href.includes('premium')

    if (isFromPayment) {
      const refreshAttempts = [1000, 2000, 3000, 5000]
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
      // Silently fail
    } finally {
      setLoading(false)
    }
  }

  const handleSelectLoop = async (loop: TradeLoop) => {
    if (!isPremiumUser) {
      toast({
        id: 'premium-premium-feature',
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
        id: 'premium-error-2',
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
      setUpgrading(tier)
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
      setUpgrading(null)
    }
  }

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index)
  }

  // ─── Feature Section Component ───
  const FeatureSection = ({ title, features, color = 'green' }: { title: string; features: { text: string; icon: any; muted?: boolean; bold?: boolean }[]; color?: string }) => (
    <Box>
      <Text fontWeight="bold" fontSize="xs" textTransform="uppercase" letterSpacing="wider" color={mutedText} mb={3}>
        {title}
      </Text>
      <List spacing={2}>
        {features.map((f, i) => (
          <ListItem key={i} display="flex" alignItems="center" fontSize="sm" color={f.muted ? mutedText : undefined}>
            <ListIcon as={f.icon} color={f.muted ? 'gray.400' : `${color}.400`} />
            <Text fontWeight={f.bold ? 'semibold' : undefined}>{f.text}</Text>
          </ListItem>
        ))}
      </List>
    </Box>
  )

  // ─── Feature Definitions ───
  const freeFeatures = {
    listings: [
      { text: '10 active listings', icon: FaBoxes },
      { text: 'No boosts included', icon: FaRocket, muted: true },
    ],
    trading: [
      { text: 'Browse and trade freely', icon: FaHandshake },
      { text: 'Standard delivery only', icon: FaTruck },
      { text: 'Standard match feed', icon: FaSearch },
    ],
    insights: [
      { text: 'See total profile views only', icon: FaEye },
      { text: 'AI price range shown', icon: FaChartLine },
    ],
  }

  const plusFeatures = {
    listings: [
      { text: '30 active listings', icon: FaBoxes, bold: true },
      { text: '3 boosted listings — pinned higher in the feed', icon: FaRocket, bold: true },
      { text: 'Relist in one tap — no retyping, instant repost', icon: FaRedoAlt, bold: true },
    ],
    trading: [
      { text: 'Express delivery access', icon: FaTruck, bold: true },
      { text: '10% off all delivery fees', icon: FaPercentage, bold: true },
      { text: 'Priority matches — good trades reach you first', icon: FaBolt, bold: true },
      { text: 'Trade dispute reviewed first', icon: FaShieldAlt, bold: true },
    ],
    insights: [
      { text: 'Who viewed your profile — see actual usernames', icon: FaEye, bold: true },
      { text: 'Item popularity breakdown — views, saves, feed rank', icon: FaChartLine, bold: true },
      { text: 'AI price confidence — see what data backs the estimate', icon: FaStar, bold: true },
    ],
    profile: [
      { text: 'Plus badge on profile and listings', icon: FaUserShield, bold: true },
    ],
  }

  const proFeatures = {
    listings: [
      { text: 'Unlimited listings', icon: FaInfinity, bold: true },
      { text: '10 boosted listings — always pinned', icon: FaRocket, bold: true },
      { text: 'Bundle listing — group items into one trade', icon: FaBoxes, bold: true },
      { text: 'Relist in one tap — instant repost', icon: FaRedoAlt, bold: true },
    ],
    trading: [
      { text: 'Express delivery access', icon: FaTruck, bold: true },
      { text: '20% off all delivery fees', icon: FaPercentage, bold: true },
      { text: 'First to see new nearby items', icon: FaSearch, bold: true },
      { text: 'Top of match queue — shown first to matching buyers', icon: FaBolt, bold: true },
      { text: 'Trade dispute reviewed first', icon: FaShieldAlt, bold: true },
      { text: 'Multi-way trading — complex trade chains', icon: FaLink, bold: true },
    ],
    insights: [
      { text: 'Full trade analytics — volume, best items, trends', icon: FaChartLine, bold: true },
      { text: 'Who viewed your profile — full history', icon: FaEye, bold: true },
      { text: 'AI price confidence + market data', icon: FaStar, bold: true },
    ],
    profile: [
      { text: 'Store page — your own shop link on Alegre', icon: FaStore, bold: true },
      { text: 'Featured on homepage banner rotation', icon: FaImage, bold: true },
      { text: 'Verified Pro badge on all listings', icon: FaUserShield, bold: true },
      { text: 'Priority support', icon: FaHeadset, bold: true },
    ],
  }

  const comparisonFeatures = [
    { feature: 'Active Listings', free: '10', plus: '30', pro: 'Unlimited' },
    { feature: 'Boosted Listings', free: '—', plus: '3', pro: '10 always pinned' },
    { feature: 'Bundle Listings', free: '—', plus: '—', pro: '✓' },
    { feature: 'Relist in One Tap', free: '—', plus: '✓', pro: '✓' },
    { feature: 'Express Delivery', free: '—', plus: '✓', pro: '✓' },
    { feature: 'Delivery Fee Discount', free: '—', plus: '10%', pro: '20%' },
    { feature: 'Priority Matches', free: '—', plus: '✓', pro: 'Top of queue' },
    { feature: 'Multi-Way Trading', free: '—', plus: '—', pro: '✓' },
    { feature: 'Trade Dispute Priority', free: '—', plus: '✓', pro: '✓' },
    { feature: 'Profile Views', free: 'Total only', plus: 'Usernames', pro: 'Full history' },
    { feature: 'Trade Analytics', free: '—', plus: 'Popularity', pro: 'Full analytics' },
    { feature: 'AI Price Confidence', free: 'Range only', plus: 'Data-backed', pro: '+ market data' },
    { feature: 'Store Page', free: '—', plus: '—', pro: '✓' },
    { feature: 'Homepage Feature', free: '—', plus: '—', pro: '✓' },
    { feature: 'Badge', free: '—', plus: 'Plus badge', pro: 'Verified Pro' },
    { feature: 'Priority Support', free: '—', plus: '—', pro: '✓' },
  ]

  const faqItems = [
    {
      question: 'How does the subscription work?',
      answer: 'Plus is ₱79/month or ₱699/year (save 26%). Pro is ₱120/month or ₱1,099/year (save 24%). Cancel anytime from your account settings.'
    },
    {
      question: 'What is Multi-Way Trading?',
      answer: 'When someone declines your trade, they can convert it to a multi-way trade. The system finds a third user who wants what you have and has what the second user wants — creating a 3-way (or more) trade chain. This is a Pro-exclusive feature.'
    },
    {
      question: 'What is the Store Page (Alegre)?',
      answer: 'Pro members get their own Alegre store page — a personalized shop link where all your listings are showcased. Great for power sellers who want to build a brand on the platform.'
    },
    {
      question: 'Do WMSU students get premium for free?',
      answer: 'Yes! Students who register and verify with a @wmsu.edu.ph email address automatically receive Plus access at no cost.'
    },
    {
      question: 'Can I upgrade from Plus to Pro?',
      answer: 'Yes! You can upgrade from Plus to Pro anytime. The price difference will be prorated based on your remaining billing period.'
    },
    {
      question: 'Can I get a refund?',
      answer: 'Due to the digital nature of premium features, refunds are handled on a case-by-case basis. Contact our support team if you have any concerns.'
    },
    {
      question: 'Will I lose features if I cancel?',
      answer: 'Your premium features remain active until the end of your billing period. After that, you\'ll revert to the free tier but keep all your data and listings (listings beyond 10 will be hidden, not deleted).'
    },
  ]

  // ─── Cell Renderer ───
  const renderCell = (value: string, color: string) => {
    if (value === '—') return <Icon as={FaTimes} color="gray.300" />
    if (value === '✓') return <Icon as={FaCheck} color={`${color}.400`} />
    return <Text fontSize="sm" fontWeight="medium" color={`${color}.600`}>{value}</Text>
  }

  // ─── Render: Premium Active State ───
  const renderPremiumActive = () => (
    <VStack spacing={8} align="stretch">
      <Card bg={currentTier === 'pro' ? 'purple.50' : 'blue.50'} borderWidth="2px" borderColor={currentTier === 'pro' ? 'purple.300' : 'blue.300'}>
        <CardBody>
          <Flex justify="space-between" align="center" wrap="wrap" gap={4} py={2}>
            <HStack spacing={4}>
              <Icon as={FaCheckCircle} fontSize="2xl" color={currentTier === 'pro' ? 'purple.500' : 'blue.500'} />
              <VStack align="start" spacing={0}>
                <Heading size="md" color={currentTier === 'pro' ? 'purple.800' : 'blue.800'}>
                  {currentTier === 'pro' ? 'Pro' : 'Plus'} Active
                </Heading>
                <Text color={currentTier === 'pro' ? 'purple.600' : 'blue.600'} fontSize="sm">
                  {currentTier === 'pro' ? 'Full access — All features unlocked' : 'Enhanced features — Upgrade to Pro for more'}
                </Text>
              </VStack>
            </HStack>
            <HStack spacing={3}>
              {currentTier === 'plus' && (
                <Button
                  size="sm"
                  colorScheme="purple"
                  variant="solid"
                  leftIcon={<FaCrown />}
                  onClick={() => handleUpgrade('pro')}
                  isLoading={upgrading === 'pro'}
                >
                  Upgrade to Pro
                </Button>
              )}
              <Badge colorScheme={currentTier === 'pro' ? 'purple' : 'blue'} fontSize="md" px={4} py={1} borderRadius="full">
                {currentTier === 'pro' ? 'Pro' : 'Plus'}
              </Badge>
            </HStack>
          </Flex>
        </CardBody>
      </Card>

      {/* Your features summary */}
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
        <Card bg={cardBg} borderWidth="1px" borderColor={borderColor}>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <FeatureSection
                title="Listings"
                features={currentTier === 'pro' ? proFeatures.listings : plusFeatures.listings}
                color={currentTier === 'pro' ? 'purple' : 'blue'}
              />
              <Divider />
              <FeatureSection
                title="Profile"
                features={currentTier === 'pro' ? proFeatures.profile : plusFeatures.profile}
                color={currentTier === 'pro' ? 'purple' : 'blue'}
              />
            </VStack>
          </CardBody>
        </Card>
        <Card bg={cardBg} borderWidth="1px" borderColor={borderColor}>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <FeatureSection
                title="Trading"
                features={currentTier === 'pro' ? proFeatures.trading : plusFeatures.trading}
                color={currentTier === 'pro' ? 'purple' : 'blue'}
              />
              <Divider />
              <FeatureSection
                title="Insights"
                features={currentTier === 'pro' ? proFeatures.insights : plusFeatures.insights}
                color={currentTier === 'pro' ? 'purple' : 'blue'}
              />
            </VStack>
          </CardBody>
        </Card>
      </SimpleGrid>

      {/* Multi-Way Trading Section (Pro only) */}
      {currentTier === 'pro' && (
        <Box>
          <Heading size="md" mb={4} display="flex" alignItems="center" gap={2}>
            <Icon as={FaLink} color="purple.500" />
            Multi-Way Trading Loops
          </Heading>
          <Text fontSize="sm" color={mutedText} mb={4}>
            Participate in trading chains where multiple users exchange products simultaneously.
            When a trade is declined, it can be converted to a multi-way trade — the system finds
            users who can complete the chain.
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
                    <Text fontWeight="semibold" color="gray.600">No multi-way trades available</Text>
                    <Text fontSize="sm" color={mutedText}>Create more trade offers to unlock trading loops</Text>
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
                          <Badge colorScheme="purple" variant="solid">{loop.loop_length}-Way Trade</Badge>
                          <Badge colorScheme="blue" variant="outline">{loop.participants.length} participants</Badge>
                          <Badge colorScheme="purple" variant="subtle">
                            <HStack spacing={1}><Icon as={FaCrown} fontSize="sm" /><Text>Pro</Text></HStack>
                          </Badge>
                        </HStack>
                        <Button
                          size="sm" variant="ghost" colorScheme="brand" rightIcon={<FaArrowRight />}
                          onClick={(e) => { e.stopPropagation(); handleSelectLoop(loop) }}
                        >
                          Details
                        </Button>
                      </Flex>
                      <Box overflowX="auto" py={2}>
                        <Flex align="center" gap={2} minW="fit-content" px={2}>
                          {loop.edges.map((edge, edgeIdx) => (
                            <React.Fragment key={edgeIdx}>
                              <VStack spacing={1} align="center" minW="120px">
                                <Badge colorScheme="gray" variant="outline" fontSize="xs">User {edge.from_user}</Badge>
                                <Text fontSize="xs" color={mutedText} textAlign="center">{edge.product_title?.substring(0, 15)}...</Text>
                              </VStack>
                              <Icon as={FaArrowRight} color="brand.500" fontSize="lg" />
                            </React.Fragment>
                          ))}
                          <VStack spacing={1} align="center" minW="120px">
                            <Badge colorScheme="gray" variant="outline" fontSize="xs">User {loop.edges[0].from_user}</Badge>
                            <Text fontSize="xs" color={mutedText} textAlign="center">Completes loop</Text>
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
      )}
    </VStack>
  )

  // ─── Render: Non-premium (Locked) Content ───
  const renderLockedContent = () => (
    <VStack spacing={10} align="stretch">
      {/* 3-Tier Pricing Cards */}
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} alignItems="start">
        {/* ── Free Tier ── */}
        <Card bg={cardBg} borderWidth="1px" borderColor={borderColor} overflow="hidden">
          <CardBody>
            <VStack spacing={5} align="stretch">
              <VStack spacing={1} align="start">
                <Text fontWeight="bold" fontSize="lg">Free</Text>
                <Text fontWeight="bold" fontSize="sm" color={mutedText}>Basic</Text>
              </VStack>
              <HStack align="baseline" spacing={1}>
                <Text fontSize="4xl" fontWeight="extrabold">₱0</Text>
                <Text color={mutedText}>/ month</Text>
              </HStack>
              <Text fontSize="sm" color={mutedText}>—</Text>
              <Divider />
              <FeatureSection title="Listings" features={freeFeatures.listings} color="gray" />
              <Divider />
              <FeatureSection title="Trading" features={freeFeatures.trading} color="gray" />
              <Divider />
              <FeatureSection title="Insights" features={freeFeatures.insights} color="gray" />
              <Button variant="outline" colorScheme="gray" size="lg" isDisabled>
                Current Plan
              </Button>
            </VStack>
          </CardBody>
        </Card>

        {/* ── Plus Tier ── */}
        <Card
          bg={cardBg}
          borderWidth="2px"
          borderColor="blue.400"
          overflow="hidden"
          position="relative"
          shadow="lg"
        >
          <Box position="absolute" top={0} left={0} right={0} h="4px" bg="linear-gradient(90deg, #3182CE, #63B3ED)" />
          <Badge
            position="absolute" top={3} right={3} colorScheme="blue" variant="solid"
            borderRadius="full" px={3} py={1} fontSize="xs"
          >
            MOST POPULAR
          </Badge>
          <CardBody>
            <VStack spacing={5} align="stretch">
              <VStack spacing={1} align="start">
                <HStack spacing={2}>
                  <Icon as={FaStar} color="blue.400" />
                  <Text fontWeight="bold" fontSize="lg">Plus</Text>
                </HStack>
              </VStack>
              <VStack align="start" spacing={0}>
                <HStack align="baseline" spacing={1}>
                  <Text fontSize="4xl" fontWeight="extrabold" color="blue.600">
                    {isYearly ? '₱699' : '₱79'}
                  </Text>
                  <Text color={mutedText}>/ {isYearly ? 'year' : 'month'}</Text>
                </HStack>
                {isYearly ? (
                  <HStack spacing={2}>
                    <Text fontSize="sm" color={mutedText} textDecoration="line-through">₱948/yr</Text>
                    <Badge colorScheme="green" variant="subtle" borderRadius="full" fontSize="xs">save 26%</Badge>
                  </HStack>
                ) : (
                  <Text fontSize="sm" color={mutedText}>
                    or ₱699/year{' '}
                    <Text as="span" color="green.500" fontWeight="bold">save 26%</Text>
                  </Text>
                )}
              </VStack>
              <Divider />
              <FeatureSection title="Listings" features={plusFeatures.listings} color="blue" />
              <Divider />
              <FeatureSection title="Trading" features={plusFeatures.trading} color="blue" />
              <Divider />
              <FeatureSection title="Insights" features={plusFeatures.insights} color="blue" />
              <Divider />
              <FeatureSection title="Profile" features={plusFeatures.profile} color="blue" />
              <Button
                colorScheme="blue" size="lg" leftIcon={<FaStar />}
                isLoading={upgrading === 'plus'} onClick={() => handleUpgrade('plus')}
                _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }} transition="all 0.2s"
              >
                Get Plus
              </Button>
            </VStack>
          </CardBody>
        </Card>

        {/* ── Pro Tier ── */}
        <Card
          bg={cardBg}
          borderWidth="2px"
          borderColor="purple.400"
          overflow="hidden"
          position="relative"
          shadow="lg"
        >
          <Box position="absolute" top={0} left={0} right={0} h="4px" bg="linear-gradient(90deg, #9F7AEA, #805AD5, #6B46C1)" />
          <Badge
            position="absolute" top={3} right={3} colorScheme="purple" variant="solid"
            borderRadius="full" px={3} py={1} fontSize="xs"
          >
            POWER SELLER
          </Badge>
          <CardBody>
            <VStack spacing={5} align="stretch">
              <VStack spacing={1} align="start">
                <HStack spacing={2}>
                  <Icon as={FaCrown} color="purple.400" />
                  <Text fontWeight="bold" fontSize="lg">Pro</Text>
                </HStack>
              </VStack>
              <VStack align="start" spacing={0}>
                <HStack align="baseline" spacing={1}>
                  <Text fontSize="4xl" fontWeight="extrabold" color="purple.600">
                    {isYearly ? '₱1,099' : '₱120'}
                  </Text>
                  <Text color={mutedText}>/ {isYearly ? 'year' : 'month'}</Text>
                </HStack>
                {isYearly ? (
                  <HStack spacing={2}>
                    <Text fontSize="sm" color={mutedText} textDecoration="line-through">₱1,440/yr</Text>
                    <Badge colorScheme="green" variant="subtle" borderRadius="full" fontSize="xs">save 24%</Badge>
                  </HStack>
                ) : (
                  <Text fontSize="sm" color={mutedText}>
                    or ₱1,099/year{' '}
                    <Text as="span" color="green.500" fontWeight="bold">save 24%</Text>
                  </Text>
                )}
              </VStack>
              <Divider />
              <FeatureSection title="Listings" features={proFeatures.listings} color="purple" />
              <Divider />
              <FeatureSection title="Trading" features={proFeatures.trading} color="purple" />
              <Divider />
              <FeatureSection title="Insights" features={proFeatures.insights} color="purple" />
              <Divider />
              <FeatureSection title="Profile" features={proFeatures.profile} color="purple" />
              <Button
                colorScheme="purple" size="lg" leftIcon={<FaCrown />}
                isLoading={upgrading === 'pro'} onClick={() => handleUpgrade('pro')}
                _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }} transition="all 0.2s"
              >
                Get Pro
              </Button>
            </VStack>
          </CardBody>
        </Card>
      </SimpleGrid>

      {/* Comparison Table */}
      <Box>
        <Heading size="md" mb={6} textAlign="center">Feature Comparison</Heading>
        <Card bg={cardBg} borderWidth="1px" borderColor={borderColor} overflow="hidden">
          <TableContainer>
            <Table variant="simple" size="sm">
              <Thead bg={subtleBg}>
                <Tr>
                  <Th>Feature</Th>
                  <Th textAlign="center">Free</Th>
                  <Th textAlign="center" color="blue.600">Plus</Th>
                  <Th textAlign="center" color="purple.600">Pro</Th>
                </Tr>
              </Thead>
              <Tbody>
                {comparisonFeatures.map((row, i) => (
                  <Tr key={i} _hover={{ bg: hoverBg }}>
                    <Td fontSize="sm" fontWeight="medium">{row.feature}</Td>
                    <Td textAlign="center">{renderCell(row.free, 'gray')}</Td>
                    <Td textAlign="center">{renderCell(row.plus, 'blue')}</Td>
                    <Td textAlign="center">{renderCell(row.pro, 'purple')}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </Card>
      </Box>

      {/* FAQ */}
      <Box>
        <Heading size="md" mb={6} textAlign="center">Frequently Asked Questions</Heading>
        <VStack spacing={3} align="stretch">
          {faqItems.map((faq, i) => (
            <Card
              key={i} bg={cardBg} borderWidth="1px" borderColor={borderColor}
              cursor="pointer" onClick={() => toggleFaq(i)}
              _hover={{ borderColor: 'purple.300' }} transition="all 0.2s"
            >
              <CardBody py={4}>
                <Flex justify="space-between" align="center">
                  <Text fontWeight="semibold" fontSize="sm">{faq.question}</Text>
                  <Icon as={expandedFaq === i ? FaChevronUp : FaChevronDown} color={mutedText} fontSize="sm" />
                </Flex>
                <Collapse in={expandedFaq === i} animateOpacity>
                  <Text fontSize="sm" color={mutedText} mt={3} lineHeight="tall">{faq.answer}</Text>
                </Collapse>
              </CardBody>
            </Card>
          ))}
        </VStack>
      </Box>
    </VStack>
  )

  return (
    <Box>
      <Container maxW="container.xl" py={12}>
        <VStack spacing={12} align="stretch">
          <VStack spacing={4} textAlign="center">
            <Badge colorScheme="purple" px={4} py={1} borderRadius="full" fontSize="sm" fontWeight="bold">
              Clovia Premium
            </Badge>
            <Heading size="2xl" fontWeight="extrabold">
              Level up your trading game
            </Heading>
            <Text fontSize="lg" color={mutedText} maxW="2xl">
              Unlock the full potential of Clovia with premium features designed to help you trade faster, safer, and smarter.
            </Text>

            {!isPremiumUser && (
              <HStack spacing={4} pt={4}>
                <Text fontWeight="medium" color={!isYearly ? 'gray.800' : mutedText}>Monthly</Text>
                <Switch
                  colorScheme="purple" size="lg" isChecked={isYearly}
                  onChange={(e) => setIsYearly(e.target.checked)}
                />
                <HStack spacing={2}>
                  <Text fontWeight="medium" color={isYearly ? 'gray.800' : mutedText}>Yearly</Text>
                  <Badge colorScheme="green" variant="subtle" borderRadius="full" px={2}>save up to 26%</Badge>
                </HStack>
              </HStack>
            )}
          </VStack>

          {isPremiumUser ? renderPremiumActive() : renderLockedContent()}
        </VStack>
      </Container>

      {selectedLoop && (
        <MultiWayTradeModal isOpen={isOpen} onClose={handleCloseModal} multiWayTrade={selectedLoop} />
      )}
    </Box>
  )
}

export default Premium