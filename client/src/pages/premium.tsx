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
import { FaCrown, FaCheck, FaCheckCircle, FaStar, FaTruck, FaChartLine, FaPercentage, FaShieldAlt, FaInfinity, FaArrowRight, FaLock, FaLink, FaUser, FaBox, FaRocket, FaBolt, FaTimes, FaQuestionCircle, FaGift, FaChevronDown, FaChevronUp } from 'react-icons/fa'
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
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const hoverBg = useColorModeValue('gray.50', 'gray.700')

  const isPremiumUser = user?.is_premium === true

  useEffect(() => {
    if (isPremiumUser) {
      fetchLoops()
      const interval = setInterval(fetchLoops, 30000)
      return () => clearInterval(interval)
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

  const premiumFeatures = [
    {
      title: 'Unlimited Trade Offers',
      description: 'Make as many trade proposals as you want without limits.',
      icon: FaInfinity,
      color: 'blue.500'
    },
    {
      title: 'Priority Listing',
      description: 'Your products appear at the top of search results and home feed.',
      icon: FaChartLine,
      color: 'orange.500'
    },
    {
      title: 'Can Sell (Buyout)',
      description: 'Enable the buyout option for your products to accept direct payments.',
      icon: FaCheckCircle,
      color: 'green.500'
    },
    {
      title: 'Express Delivery Access',
      description: 'Get priority booking and faster shipping for all your trades.',
      icon: FaTruck,
      color: 'teal.500'
    },
    {
      title: 'Lower Platform Fees',
      description: 'Enjoy reduced transaction fees on all completed buyout sales.',
      icon: FaPercentage,
      color: 'red.500'
    },
    {
      title: 'Verified Badge',
      description: 'Build trust with a premium verified badge on your profile.',
      icon: FaShieldAlt,
      color: 'purple.500'
    }
  ]

  const comparisonFeatures = [
    { feature: 'Basic Trading', free: true, premium: true },
    { feature: 'Product Listings', free: '10 max', premium: 'Unlimited' },
    { feature: 'Trade Requests', free: true, premium: true },
    { feature: 'Messaging', free: true, premium: true },
    { feature: 'Multi-Way Trading', free: false, premium: true },
    { feature: 'Priority Listing', free: false, premium: true },
    { feature: 'Verified Badge', free: false, premium: true },
    { feature: 'Lower Platform Fees', free: false, premium: true },
    { feature: 'Buyout Option', free: false, premium: true },
    { feature: 'Express Delivery', free: false, premium: true },
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
          <Heading size="md" mb={6}>Core Premium Benefits</Heading>
          <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
            {premiumFeatures.map((feature, idx) => (
              <Card key={idx} bg={cardBg} borderColor={borderColor} borderWidth="1px">
                <CardBody p={4}>
                  <HStack spacing={4}>
                    <Circle size="40px" bg={`${feature.color.split('.')[0]}.50`} color={feature.color}>
                      <Icon as={feature.icon} />
                    </Circle>
                    <VStack align="start" spacing={0}>
                      <Text fontWeight="bold">{feature.title}</Text>
                      <Text fontSize="sm" color="gray.600">{feature.description}</Text>
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
    <Box bg={useColorModeValue('gray.50', 'gray.900')} minH="100vh" pb={20}>
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
                        {premiumFeatures.map((f, i) => (
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

              {/* Comparison & FAQ */}
              <Tabs isFitted variant="soft-rounded" colorScheme="purple">
                <TabList mb="1em">
                  <Tab>Comparison</Tab>
                  <Tab>FAQ</Tab>
                </TabList>
                <TabPanels>
                  <TabPanel>
                    <TableContainer bg={cardBg} borderRadius="xl" border="1px" borderColor={borderColor}>
                      <Table variant="simple">
                        <Thead>
                          <Tr>
                            <Th>Feature</Th>
                            <Th>Free</Th>
                            <Th color="purple.500">Premium</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {comparisonFeatures.map((item, idx) => (
                            <Tr key={idx}>
                              <Td fontWeight="medium">{item.feature}</Td>
                              <Td>{typeof item.free === 'boolean' ? (item.free ? <Icon as={FaCheck} color="green.500" /> : <Icon as={FaTimes} color="red.400" />) : item.free}</Td>
                              <Td>{typeof item.premium === 'boolean' ? (item.premium ? <Icon as={FaCheck} color="green.500" /> : <Icon as={FaTimes} color="red.400" />) : <Badge colorScheme="purple" variant="subtle">{item.premium}</Badge>}</Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </TableContainer>
                  </TabPanel>
                  <TabPanel>
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