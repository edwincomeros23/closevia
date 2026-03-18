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
  useColorModeValue,
  Flex,
  Stack,
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
  List,
  ListItem,
  ListIcon,
  useDisclosure,
  Circle,
} from '@chakra-ui/react'
import { FaLock, FaCrown, FaLink, FaArrowRight, FaCheck, FaUser, FaBox, FaStar, FaRocket, FaShieldAlt, FaBolt, FaCheckCircle, FaTimes, FaQuestionCircle, FaGift, FaInfinity, FaChevronDown, FaChevronUp, FaChartLine } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import { TradeLoop, MultiWayTrade } from '../types'
import { fetchTradeLoops, fetchMultiWayTrade } from '../services/tradeService'
import MultiWayTradeModal from '../components/MultiWayTradeModal'
import { api } from '../services/api'

const Premium: React.FC = () => {
  const { user } = useAuth()
  const toast = useToast()
  const { isOpen, onOpen, onClose } = useDisclosure()
  
  const [loops, setLoops] = useState<TradeLoop[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLoop, setSelectedLoop] = useState<MultiWayTrade | null>(null)
  const [isYearly, setIsYearly] = useState(false)
  const [upgrading, setUpgrading] = useState(false)

  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const hoverBg = useColorModeValue('gray.50', 'gray.700')

  const isPremiumUser = user?.is_premium === true

  useEffect(() => {
    if (isPremiumUser) {
      fetchLoops()
    }
  }, [isPremiumUser])

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

  const handleCloseModal = () => {
    onClose()
    setSelectedLoop(null)
    // Refresh loops when modal closes
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
        {/* Subscription Status Card */}
        <Card bg="green.50" borderWidth="2px" borderColor="green.300">
          <CardBody>
            <Flex justify="space-between" align="center" wrap="wrap" gap={4} py={2}>
              <HStack spacing={4}>
                <Icon as={FaCheckCircle} fontSize="2xl" color="green.500" />
                <VStack align="start" spacing={0}>
                  <Heading size="md" color="green.800">Premium Active</Heading>
                  <Text color="green.600" fontSize="sm">Lifetime membership - All features unlocked</Text>
                </VStack>
              </HStack>
              <Badge colorScheme="green" fontSize="md" px={4} py={1} borderRadius="full">Active</Badge>
            </Flex>
          </CardBody>
        </Card>

        {/* Your Benefits Grid */}
        <Box>
          <Heading size="md" mb={4}>Your Premium Benefits</Heading>
          <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
            <Card bg={cardBg} borderColor="purple.200" borderWidth="1px">
              <CardBody>
                <HStack spacing={3} mb={2}>
                  <Icon as={FaRocket} fontSize="xl" color="purple.500" />
                  <Heading size="sm">Boosted Listings</Heading>
                </HStack>
                <Text fontSize="sm" color="gray.600">Your products get priority visibility in search results and feeds</Text>
              </CardBody>
            </Card>
            <Card bg={cardBg} borderColor="purple.200" borderWidth="1px">
              <CardBody>
                <HStack spacing={3} mb={2}>
                  <Icon as={FaLink} fontSize="xl" color="green.500" />
                  <Heading size="sm">Multi-Way Trading</Heading>
                </HStack>
                <Text fontSize="sm" color="gray.600">Access advanced trading loops and chains with multiple users</Text>
              </CardBody>
            </Card>
            <Card bg={cardBg} borderColor="purple.200" borderWidth="1px">
              <CardBody>
                <HStack spacing={3} mb={2}>
                  <Icon as={FaCrown} fontSize="xl" color="yellow.500" />
                  <Heading size="sm">Premium Badge</Heading>
                </HStack>
                <Text fontSize="sm" color="gray.600">Stand out with an exclusive premium badge on your profile</Text>
              </CardBody>
            </Card>
            <Card bg={cardBg} borderColor="purple.200" borderWidth="1px">
              <CardBody>
                <HStack spacing={3} mb={2}>
                  <Icon as={FaShieldAlt} fontSize="xl" color="blue.500" />
                  <Heading size="sm">Priority Support</Heading>
                </HStack>
                <Text fontSize="sm" color="gray.600">Get faster responses from our support team</Text>
              </CardBody>
            </Card>
          </Grid>
        </Box>

        <Divider />

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
                      </Flex>

                      {/* Loop visualization */}
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
                              {edgeIdx < loop.edges.length - 1 && (
                                <Icon as={FaArrowRight} color="brand.500" fontSize="lg" />
                              )}
                              {edgeIdx === loop.edges.length - 1 && (
                                <Icon as={FaArrowRight} color="brand.500" fontSize="lg" />
                              )}
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

                      <Divider />

                      <Flex justify="space-between" align="center">
                        <Text fontSize="sm" color="gray.600">
                          Click to view details and participate
                        </Text>
                        <Button
                          size="sm"
                          colorScheme="brand"
                          rightIcon={<FaArrowRight />}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSelectLoop(loop)
                          }}
                        >
                          View Details
                        </Button>
                      </Flex>
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

        {/* Detailed Feature Breakdown */}
        <Box>
          <Heading size="lg" mb={2} textAlign="center">Premium Features in Detail</Heading>
          <Text color="gray.500" textAlign="center" mb={6}>Everything you need to trade smarter</Text>
          <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={6}>
            {/* Multi-Way Trading Detail */}
            <Card bg={cardBg} borderColor={borderColor} borderWidth="1px" overflow="hidden">
              <Box h="4px" bg="linear-gradient(90deg, #48BB78, #38A169)" />
              <CardBody>
                <VStack align="start" spacing={4}>
                  <HStack spacing={3}>
                    <Box bg="green.100" p={3} borderRadius="xl">
                      <Icon as={FaLink} fontSize="2xl" color="green.500" />
                    </Box>
                    <VStack align="start" spacing={0}>
                      <Heading size="md">Multi-Way Trading</Heading>
                      <Badge colorScheme="green" variant="subtle">Most Popular</Badge>
                    </VStack>
                  </HStack>
                  <Text color="gray.600">
                    Participate in advanced trading loops where multiple users exchange items simultaneously.
                    Perfect for when direct trades aren't available.
                  </Text>
                  <List spacing={2}>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">3-way, 4-way, and larger trading chains</Text>
                    </ListItem>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Automatic loop detection algorithm</Text>
                    </ListItem>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Secure simultaneous exchanges</Text>
                    </ListItem>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Real-time loop notifications</Text>
                    </ListItem>
                  </List>
                </VStack>
              </CardBody>
            </Card>

            {/* Boosted Listings Detail */}
            <Card bg={cardBg} borderColor={borderColor} borderWidth="1px" overflow="hidden">
              <Box h="4px" bg="linear-gradient(90deg, #9F7AEA, #805AD5)" />
              <CardBody>
                <VStack align="start" spacing={4}>
                  <HStack spacing={3}>
                    <Box bg="purple.100" p={3} borderRadius="xl">
                      <Icon as={FaRocket} fontSize="2xl" color="purple.500" />
                    </Box>
                    <VStack align="start" spacing={0}>
                      <Heading size="md">Boosted Listings</Heading>
                      <Badge colorScheme="purple" variant="subtle">High Impact</Badge>
                    </VStack>
                  </HStack>
                  <Text color="gray.600">
                    Get your products seen first. Premium listings appear at the top of search results
                    and the main feed, increasing your chances of successful trades.
                  </Text>
                  <List spacing={2}>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Priority placement in search results</Text>
                    </ListItem>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Featured in homepage feed</Text>
                    </ListItem>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Unlimited product listings</Text>
                    </ListItem>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Category spotlight opportunities</Text>
                    </ListItem>
                  </List>
                </VStack>
              </CardBody>
            </Card>

            {/* Premium Badge Detail */}
            <Card bg={cardBg} borderColor={borderColor} borderWidth="1px" overflow="hidden">
              <Box h="4px" bg="linear-gradient(90deg, #ECC94B, #D69E2E)" />
              <CardBody>
                <VStack align="start" spacing={4}>
                  <HStack spacing={3}>
                    <Box bg="yellow.100" p={3} borderRadius="xl">
                      <Icon as={FaCrown} fontSize="2xl" color="yellow.500" />
                    </Box>
                    <VStack align="start" spacing={0}>
                      <Heading size="md">Premium Badge</Heading>
                      <Badge colorScheme="yellow" variant="subtle">Trust Signal</Badge>
                    </VStack>
                  </HStack>
                  <Text color="gray.600">
                    Stand out from the crowd with an exclusive premium badge displayed on your
                    profile and all your listings, signaling trust and commitment.
                  </Text>
                  <List spacing={2}>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Exclusive crown badge on profile</Text>
                    </ListItem>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Premium indicator on all listings</Text>
                    </ListItem>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Increased trust from other traders</Text>
                    </ListItem>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Special profile highlight</Text>
                    </ListItem>
                  </List>
                </VStack>
              </CardBody>
            </Card>

            {/* Priority Support Detail */}
            <Card bg={cardBg} borderColor={borderColor} borderWidth="1px" overflow="hidden">
              <Box h="4px" bg="linear-gradient(90deg, #4299E1, #3182CE)" />
              <CardBody>
                <VStack align="start" spacing={4}>
                  <HStack spacing={3}>
                    <Box bg="blue.100" p={3} borderRadius="xl">
                      <Icon as={FaShieldAlt} fontSize="2xl" color="blue.500" />
                    </Box>
                    <VStack align="start" spacing={0}>
                      <Heading size="md">Priority Support</Heading>
                      <Badge colorScheme="blue" variant="subtle">VIP Service</Badge>
                    </VStack>
                  </HStack>
                  <Text color="gray.600">
                    Get the help you need, when you need it. Premium members receive priority
                    support with faster response times and dedicated assistance.
                  </Text>
                  <List spacing={2}>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Priority ticket handling</Text>
                    </ListItem>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Faster response times</Text>
                    </ListItem>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Dedicated support channel</Text>
                    </ListItem>
                    <ListItem display="flex" alignItems="center">
                      <ListIcon as={FaCheck} color="green.500" />
                      <Text fontSize="sm">Early access to new features</Text>
                    </ListItem>
                  </List>
                </VStack>
              </CardBody>
            </Card>
          </Grid>
        </Box>

        {/* FAQ Section */}
        <Box>
          <Heading size="lg" mb={2} textAlign="center">
            <Icon as={FaQuestionCircle} mr={2} color="purple.500" />
            Frequently Asked Questions
          </Heading>
          <Text color="gray.500" textAlign="center" mb={6}>Got questions? We've got answers</Text>
          <VStack spacing={3} align="stretch" maxW="700px" mx="auto">
            {faqItems.map((faq, idx) => (
              <Card
                key={idx}
                bg={expandedFaq === idx ? hoverBg : cardBg}
                borderColor={expandedFaq === idx ? 'purple.300' : borderColor}
                borderWidth="1px"
                cursor="pointer"
                onClick={() => toggleFaq(idx)}
                transition="all 0.2s"
                _hover={{ borderColor: 'purple.300' }}
              >
                <CardBody py={4}>
                  <Flex justify="space-between" align="center">
                    <Text fontWeight="semibold" color={expandedFaq === idx ? 'purple.600' : 'inherit'}>
                      {faq.question}
                    </Text>
                    <Icon
                      as={expandedFaq === idx ? FaChevronUp : FaChevronDown}
                      color={expandedFaq === idx ? 'purple.500' : 'gray.400'}
                    />
                  </Flex>
                  <Collapse in={expandedFaq === idx} animateOpacity>
                    <Text mt={3} color="gray.600" fontSize="sm">
                      {faq.answer}
                    </Text>
                  </Collapse>
                </CardBody>
              </Card>
            ))}
          </VStack>
        </Box>

        {/* Final CTA */}
        <Card bg="purple.50" borderWidth="2px" borderColor="purple.200">
          <CardBody py={8}>
            <VStack spacing={4} align="center">
              <Heading size="lg" color="purple.800" textAlign="center">
                Ready to Upgrade Your Trading?
              </Heading>
              <Text color="purple.600" textAlign="center" maxW="500px">
                Join thousands of premium traders and unlock the full Clovia experience today.
              </Text>
              <Button
                colorScheme="purple"
                size="lg"
                px={12}
                leftIcon={<FaCrown />}
                isLoading={upgrading}
                onClick={handleUpgrade}
                _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
                transition="all 0.2s"
              >
                Upgrade to Premium - P499
              </Button>
              <Text fontSize="xs" color="gray.500" textAlign="center">
                One-time payment · Lifetime access · No hidden fees
              </Text>
            </VStack>
          </CardBody>
        </Card>
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

                    <Divider />

                    <List spacing={3} w="full">
                      {premiumFeatures.map((f: typeof premiumFeatures[0], i: number) => (
                        <ListItem key={i} display="flex" alignItems="center" fontSize="sm">
                          <ListIcon as={FaCheckCircle} color="purple.500" />
                          <Text fontWeight="medium">{f.title}</Text>
                        </ListItem>
                      ))}
                    </List>

                    <Button
                      w="full"
                      size="lg"
                      colorScheme="purple"
                      borderRadius="xl"
                      h="60px"
                      fontSize="lg"
                      leftIcon={<FaCrown />}
                      isLoading={upgrading}
                      onClick={handleUpgrade}
                      boxShadow="0 4px 14px 0 rgba(128, 90, 213, 0.39)"
                      _hover={{
                        transform: 'translateY(-2px)',
                        boxShadow: '0 6px 20px rgba(128, 90, 213, 0.43)',
                      }}
                    >
                      Subscribe Now
                    </Button>
                    <Text fontSize="xs" color="gray.500">
                      Secure payment via Xendit. Cancel anytime.
                    </Text>
                  </VStack>
                </CardBody>
              </Card>
            </Center>
          )}

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
                    </CardBody>
                  </Card>
                ))}
              </Grid>
            </VStack>
        </Box>

        {/* If already premium - Show Multi-way Trading Loops */}
        {isPremiumUser && (
            <VStack spacing={6} align="stretch" pt={8} borderTopWidth="1px">
              <HStack justify="space-between">
                <VStack align="start" spacing={1}>
                  <Heading size="lg" color="purple.600">Your Premium Dashboard</Heading>
                  <Text color="gray.600">Detecting multi-way trade opportunities for your items...</Text>
                </VStack>
                <Badge colorScheme="purple" variant="solid" p={2} borderRadius="md" >
                  <HStack spacing={1}>
                    <Icon as={FaCrown} />
                    <Text>PREMIUM ACTIVE</Text>
                  </HStack>
                </Badge>
              </HStack>

              <Box>
                {loading && loops.length === 0 ? (
                  <Center py={12}><Spinner color="purple.500" size="xl" /></Center>
                ) : loops.length === 0 ? (
                  <Card variant="outline" borderRadius="xl" borderStyle="dashed">
                    <CardBody py={12}>
                      <VStack spacing={4}>
                        <Icon as={FaChartLine} fontSize="4xl" color="gray.300" />
                        <Text fontWeight="medium" color="gray.500">No trading loops detected for your items yet. Keep posting!</Text>
                      </VStack>
                    </CardBody>
                  </Card>
                ) : (
                  <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={6}>
                    {loops.map((loop, idx) => (
                      <Card 
                        key={idx} 
                        variant="outline" 
                        borderRadius="xl" 
                        overflow="hidden"
                        _hover={{ shadow: 'lg', transform: 'translateY(-2px)', borderColor: 'purple.300' }}
                        transition="all 0.2s"
                        cursor="pointer"
                        onClick={() => {
                          const loopId = `loop_${loop.edges.map(e => e.trade_id).join('_')}`
                          fetchMultiWayTrade(loopId).then(data => {
                            setSelectedLoop(data)
                            onOpen()
                          })
                        }}
                      >
                        <Box bg="purple.50" p={4} borderBottomWidth="1px">
                          <HStack justify="space-between">
                            <Badge colorScheme="purple">{loop.loop_length}-Way Loop</Badge>
                            <Text fontSize="xs" fontWeight="bold" color="purple.600">ACTIVE OPPORTUNITY</Text>
                          </HStack>
                        </Box>
                        <CardBody p={4}>
                          <VStack align="stretch" spacing={4}>
                            <Flex align="center" justify="space-between" px={2}>
                              {loop.edges.map((edge, eIdx) => (
                                <React.Fragment key={eIdx}>
                                  <VStack spacing={0}>
                                    <Text fontSize="xs" color="gray.500">P{eIdx + 1}</Text>
                                    <Circle size="30px" bg="purple.500" color="white" fontWeight="bold" fontSize="xs">
                                      {edge.from_user}
                                    </Circle>
                                  </VStack>
                                  {eIdx < loop.edges.length - 1 && <Icon as={FaArrowRight} color="purple.300" />}
                                </React.Fragment>
                              ))}
                              <Icon as={FaArrowRight} color="purple.300" />
                              <Circle size="30px" bg="purple.500" color="white" fontWeight="bold" fontSize="xs">
                                {loop.edges[0].from_user}
                              </Circle>
                            </Flex>
                            <Divider />
                            <Button size="sm" variant="ghost" colorScheme="purple">View details & Join</Button>
                          </VStack>
                        </CardBody>
                      </Card>
                    ))}
                  </Grid>
                )}
              </Box>
            </VStack>
          )}
        </VStack>
      </Container>

      {/* Multi-Way Trade Modal */}
      {selectedLoop && (
        <MultiWayTradeModal
          isOpen={isOpen}
          onClose={onClose}
          multiWayTrade={selectedLoop}
          onTradeCompleted={fetchLoops}
        />
      )}
    </Box>
  )
}

export default Premium