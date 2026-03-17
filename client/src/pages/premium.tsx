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
  Switch,
  List,
  ListItem,
  ListIcon,
  Circle,
  useDisclosure,
} from '@chakra-ui/react'
import { FaCrown, FaCheck, FaCheckCircle, FaStar, FaTruck, FaChartLine, FaPercentage, FaShieldAlt, FaInfinity, FaArrowRight } from 'react-icons/fa'
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

  return (
    <Box bg={useColorModeValue('gray.50', 'gray.900')} minH="100vh" pb={20}>
      <Container maxW="container.xl" py={12}>
        <VStack spacing={12} align="stretch">
          
          {/* Hero Section */}
          <VStack spacing={4} textAlign="center">
            <Badge 
              colorScheme="purple" 
              px={4} 
              py={1} 
              borderRadius="full" 
              fontSize="sm" 
              fontWeight="bold"
              textTransform="uppercase"
              letterSpacing="wider"
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
          )}

          {/* Features Grid */}
          <Box pt={8}>
            <VStack spacing={8}>
              <Heading size="lg">Everything you get with Premium</Heading>
              <Grid templateColumns={{ base: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }} gap={8} w="full">
                {premiumFeatures.map((feature, index) => (
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