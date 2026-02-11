import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Heading,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  useColorModeValue,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Spinner,
  Alert,
  AlertIcon,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Icon,
  Button,
  HStack,
  VStack,
  Progress,
  useToast,
  Collapse,
  AlertTitle,
  AlertDescription,
  Grid,
  GridItem,
} from '@chakra-ui/react';
import {
  FiUsers,
  FiStar,
  FiDollarSign,
  FiShoppingBag,
  FiShoppingCart,
  FiShield,
  FiPackage,
  FiClock,
  FiRefreshCw,
  FiServer,
} from 'react-icons/fi';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { api } from '../services/api';
import { mockAdminStats, simulateApiDelay } from '../utils/mockData';
import { enhancedApiCall, checkConnectionStatus } from '../utils/apiUtils';
import ConnectionStatus from '../components/ConnectionStatus';
import ErrorBoundary from '../components/ErrorBoundary';

interface AdminStats {
  // Core Metrics
  total_users: number;
  premium_users: number;
  total_income: number;
  active_listings: number;
  total_trades: number;

  // Daily Metrics
  new_users_today: number;
  new_listings_today: number;

  // User Management
  verified_users: number;
  pending_approvals: number;
  reports_filed: number;
  suspended_users: number;

  // System Metrics
  storage_usage_mb: number;
  revenue_breakdown: Array<{
    period: string;
    amount: number;
  }>;
  recent_activity: Array<{
    action: string;
    count: number;
    latest: string;
  }>;

  // Metadata
  last_updated: string;
}

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{
    online: boolean;
    apiReachable: boolean;
  }>({
    online: navigator.onLine,
    apiReachable: true,
  });
  const [isUsingMockData, setIsUsingMockData] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showConnectionAlert, setShowConnectionAlert] = useState(false);

  const toast = useToast();
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const cardBg = useColorModeValue('white', 'gray.700');

  // Check connection status
  const checkConnection = useCallback(async () => {
    try {
      const status = await checkConnectionStatus();
      setConnectionStatus({
        online: !!status.online,
        apiReachable: !!status.apiReachable,
      });
      setShowConnectionAlert(!status.online || !status.apiReachable);
    } catch (error) {
      console.error('Failed to check connection:', error);
    }
  }, []);

  // Fetch admin stats with fallback to mock data
  const fetchAdminStats = useCallback(async (useMockDataFallback = false) => {
    try {
      setLoading(true);
      setError(null);
      setIsUsingMockData(false);

      console.log('Fetching admin stats...');

      if (useMockDataFallback) {
        // Use mock data
        await simulateApiDelay(500); // Simulate API delay
        setStats(mockAdminStats);
        setIsUsingMockData(true);
        toast({
          title: 'Using Demo Data',
          description: 'Showing mock data while API is unavailable',
          status: 'info',
          duration: 5000,
          isClosable: true,
        });
        return;
      }

      // Try to fetch real data
      const response = await enhancedApiCall<{ success: boolean; data: AdminStats; error?: string }>('/api/admin/stats', {
        retryConfig: { maxRetries: 2 },
        useMockData: true,
      });

      console.log('Admin stats response:', response);

      if (response.success) {
        // If API returned success but no payload, fall back to demo data
        if (!response.data) {
          console.warn('Admin stats success but no data present, falling back to mock data');
          await simulateApiDelay(300);
          setStats(mockAdminStats);
          setIsUsingMockData(true);
          toast({
            title: 'Using Demo Data',
            description: 'Showing mock data due to missing API payload',
            status: 'info',
            duration: 5000,
            isClosable: true,
          });
        } else {
          // Use the API data directly since we simplified the structure
          setStats(response.data);
          setIsUsingMockData(false);
        }
      } else {
        throw new Error(response.error || 'Failed to fetch admin statistics');
      }
    } catch (err: any) {
      console.error('Error fetching admin stats:', err);

      if (err.message === 'API_UNREACHABLE_MOCK_DATA_AVAILABLE') {
        // API is unreachable, use mock data
        await fetchAdminStats(true);
        return;
      }

      setError(err.message || 'Error fetching admin statistics');
      setRetryCount(prev => prev + 1);

      toast({
        title: 'Error',
        description: err.message || 'Failed to load dashboard data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Handle retry with exponential backoff
  const handleRetry = useCallback(async () => {
    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));
    await fetchAdminStats();
  }, [fetchAdminStats, retryCount]);

  // Handle manual refresh
  const handleRefresh = useCallback(async () => {
    setRetryCount(0);
    await fetchAdminStats();
  }, [fetchAdminStats]);

  useEffect(() => {
    checkConnection();
    fetchAdminStats();

    // Check connection every 30 seconds
    const connectionInterval = setInterval(checkConnection, 30000);

    return () => clearInterval(connectionInterval);
  }, [checkConnection, fetchAdminStats]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'approved':
      case 'resolved':
        return 'green';
      case 'active':
      case 'pending':
        return 'yellow';
      case 'cancelled':
      case 'rejected':
        return 'red';
      default:
        return 'gray';
    }
  };


  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount);
  };



  // Loading state
  if (loading) {
    return (
      <Container maxW="container.xl" py={8}>
        <VStack spacing={6} minH="400px" justify="center">
          <Spinner size="xl" color="blue.500" />
          <Text fontSize="lg" color="gray.600">
            Loading admin dashboard...
          </Text>
          <Progress size="sm" isIndeterminate colorScheme="blue" w="200px" />
          <Text fontSize="sm" color="gray.500">
            This may take a few moments
          </Text>
        </VStack>
      </Container>
    );
  }

  // Error state
  if (error) {
    return (
      <Container maxW="container.xl" py={8}>
        <VStack spacing={6}>
          <Alert status="error" borderRadius="lg">
            <AlertIcon />
            <Box>
              <AlertTitle>Error loading dashboard</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Box>
          </Alert>

          <VStack spacing={4}>
            <Button
              leftIcon={<FiRefreshCw />}
              onClick={handleRetry}
              colorScheme="blue"
              size="lg"
            >
              Retry ({retryCount + 1}/3)
            </Button>

            <Button
              leftIcon={<FiServer />}
              onClick={() => fetchAdminStats(true)}
              variant="outline"
              size="lg"
            >
              Use Demo Data
            </Button>
          </VStack>
        </VStack>
      </Container>
    );
  }

  // No data state
  if (!stats) {
    return (
      <Container maxW="container.xl" py={8}>
        <Alert status="warning" borderRadius="lg">
          <AlertIcon />
          <Box>
            <AlertTitle>No data available</AlertTitle>
            <AlertDescription>
              Unable to load dashboard statistics. Please try refreshing the page.
            </AlertDescription>
          </Box>
        </Alert>
      </Container>
    );
  }

  return (
    <ErrorBoundary>
      <Container maxW="container.xl" py={8}>
        {/* Connection Status */}
        <ConnectionStatus showDetails={false} />

        {/* Connection Alert */}
        <Collapse in={showConnectionAlert}>
          <Alert status="warning" mb={6} borderRadius="lg">
            <AlertIcon />
            <Box>
              <AlertTitle>Connection Issues</AlertTitle>
              <AlertDescription>
                {!connectionStatus.online
                  ? 'You are currently offline. Some features may be limited.'
                  : 'API server is unreachable. Using demo data.'
                }
              </AlertDescription>
            </Box>
          </Alert>
        </Collapse>

        {/* Header */}
        <Flex justify="space-between" align="center" mb={8}>
          <VStack align="start" spacing={2}>
            <Heading color="blue.600">
              Admin Dashboard
            </Heading>
            {isUsingMockData && (
              <Badge colorScheme="orange" variant="subtle">
                Demo Mode - Using Mock Data
              </Badge>
            )}
            {stats?.last_updated && (
              <Text fontSize="sm" color="gray.500">
                Last updated: {new Date(stats.last_updated).toLocaleString()}
              </Text>
            )}
          </VStack>

          <HStack spacing={3}>
            <Button
              leftIcon={<FiRefreshCw />}
              onClick={handleRefresh}
              colorScheme="blue"
              variant="outline"
              isLoading={loading}
            >
              Refresh
            </Button>

            {!connectionStatus.apiReachable && (
              <Button
                leftIcon={<FiServer />}
                onClick={() => fetchAdminStats(true)}
                variant="ghost"
                colorScheme="orange"
              >
                Use Demo Data
              </Button>
            )}
          </HStack>
        </Flex>

        {/* Core Metrics Grid */}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6} mb={8}>
          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <Flex align="center" mb={2}>
                  <Icon as={FiUsers} color="blue.500" mr={2} />
                  <StatLabel color="gray.600">Total Users</StatLabel>
                </Flex>
                <StatNumber color="blue.600" fontSize="2xl">
                  {stats.total_users?.toLocaleString() || 0}
                </StatNumber>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <Flex align="center" mb={2}>
                  <Icon as={FiStar} color="yellow.500" mr={2} />
                  <StatLabel color="gray.600">Premium Users</StatLabel>
                </Flex>
                <StatNumber color="yellow.600" fontSize="2xl">
                  {stats.premium_users?.toLocaleString() || 0}
                </StatNumber>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <Flex align="center" mb={2}>
                  <Icon as={FiDollarSign} color="green.500" mr={2} />
                  <StatLabel color="gray.600">Total Income</StatLabel>
                </Flex>
                <StatNumber color="green.600" fontSize="2xl">
                  {formatCurrency(stats.total_income || 0)}
                </StatNumber>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <Flex align="center" mb={2}>
                  <Icon as={FiShoppingBag} color="purple.500" mr={2} />
                  <StatLabel color="gray.600">Active Listings</StatLabel>
                </Flex>
                <StatNumber color="purple.600" fontSize="2xl">
                  {stats.active_listings?.toLocaleString() || 0}
                </StatNumber>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <Flex align="center" mb={2}>
                  <Icon as={FiShoppingCart} color="teal.500" mr={2} />
                  <StatLabel color="gray.600">Total Trades</StatLabel>
                </Flex>
                <StatNumber color="teal.600" fontSize="2xl">
                  {stats.total_trades?.toLocaleString() || 0}
                </StatNumber>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <Flex align="center" mb={2}>
                  <Icon as={FiUsers} color="orange.500" mr={2} />
                  <StatLabel color="gray.600">New Users Today</StatLabel>
                </Flex>
                <StatNumber color="orange.600" fontSize="2xl">
                  {stats.new_users_today?.toLocaleString() || 0}
                </StatNumber>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <Flex align="center" mb={2}>
                  <Icon as={FiPackage} color="pink.500" mr={2} />
                  <StatLabel color="gray.600">New Listings Today</StatLabel>
                </Flex>
                <StatNumber color="pink.600" fontSize="2xl">
                  {stats.new_listings_today?.toLocaleString() || 0}
                </StatNumber>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <Flex align="center" mb={2}>
                  <Icon as={FiShield} color="cyan.500" mr={2} />
                  <StatLabel color="gray.600">Verified Users</StatLabel>
                </Flex>
                <StatNumber color="cyan.600" fontSize="2xl">
                  {stats.verified_users?.toLocaleString() || 0}
                </StatNumber>
              </Stat>
            </CardBody>
          </Card>
        </SimpleGrid>

        {/* Charts Section */}
        <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap={8} mb={8}>
          {/* Revenue Trends Chart */}
          <GridItem colSpan={{ base: 1, lg: 2 }}>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader>
                <Heading size="md" color="blue.600">
                  Revenue Trends (Last 4 Weeks)
                </Heading>
              </CardHeader>
              <CardBody>
                {stats.revenue_breakdown && stats.revenue_breakdown.length > 0 ? (
                  <Box h="300px">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={[...stats.revenue_breakdown].reverse()}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3182CE" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#3182CE" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis
                          dataKey="period"
                          stroke="#718096"
                          style={{ fontSize: '12px' }}
                        />
                        <YAxis
                          stroke="#718096"
                          style={{ fontSize: '12px' }}
                          tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            padding: '12px'
                          }}
                          formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                        />
                        <Area
                          type="monotone"
                          dataKey="amount"
                          stroke="#3182CE"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorRevenue)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                ) : (
                  <Flex h="300px" align="center" justify="center">
                    <Text color="gray.500">No revenue data available</Text>
                  </Flex>
                )}
              </CardBody>
            </Card>
          </GridItem>

          {/* User Metrics Comparison Chart */}
          <GridItem>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader>
                <Heading size="md" color="blue.600">
                  User Metrics Overview
                </Heading>
              </CardHeader>
              <CardBody>
                <Box h="300px">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'Total Users', value: stats.total_users || 0, fill: '#3182CE' },
                        { name: 'Premium', value: stats.premium_users || 0, fill: '#D69E2E' },
                        { name: 'Verified', value: stats.verified_users || 0, fill: '#38B2AC' },
                      ]}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis
                        dataKey="name"
                        stroke="#718096"
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke="#718096"
                        style={{ fontSize: '12px' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          padding: '12px'
                        }}
                        formatter={(value: number) => [value.toLocaleString(), 'Count']}
                      />
                      <Bar dataKey="value" fill="#3182CE" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardBody>
            </Card>
          </GridItem>

          {/* Activity Trends Chart */}
          <GridItem>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader>
                <Heading size="md" color="blue.600">
                  Daily Activity Metrics
                </Heading>
              </CardHeader>
              <CardBody>
                <Box h="300px">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'New Users', value: stats.new_users_today || 0, fill: '#ED8936' },
                        { name: 'New Listings', value: stats.new_listings_today || 0, fill: '#D53F8C' },
                        { name: 'Trades', value: stats.total_trades || 0, fill: '#38B2AC' },
                      ]}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis
                        dataKey="name"
                        stroke="#718096"
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke="#718096"
                        style={{ fontSize: '12px' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          padding: '12px'
                        }}
                        formatter={(value: number) => [value.toLocaleString(), 'Count']}
                      />
                      <Bar dataKey="value" fill="#ED8936" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>

        {/* User Management & System Metrics */}
        <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap={8} mb={8}>
          {/* User Management */}
          <GridItem>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader>
                <Heading size="md" color="blue.600">
                  User Management
                </Heading>
              </CardHeader>
              <CardBody>
                <VStack spacing={4} align="stretch">
                  <HStack justify="space-between">
                    <Text fontWeight="medium">Pending Approvals</Text>
                    <Badge colorScheme="yellow" fontSize="md" px={3} py={1}>
                      {stats.pending_approvals?.toLocaleString() || 0}
                    </Badge>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontWeight="medium">Reports Filed</Text>
                    <Badge colorScheme="red" fontSize="md" px={3} py={1}>
                      {stats.reports_filed?.toLocaleString() || 0}
                    </Badge>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontWeight="medium">Suspended/Banned Users</Text>
                    <Badge colorScheme="gray" fontSize="md" px={3} py={1}>
                      {stats.suspended_users?.toLocaleString() || 0}
                    </Badge>
                  </HStack>
                </VStack>
              </CardBody>
            </Card>
          </GridItem>

          {/* System Metrics */}
          <GridItem>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader>
                <Heading size="md" color="blue.600">
                  System Metrics
                </Heading>
              </CardHeader>
              <CardBody>
                <VStack spacing={4} align="stretch">
                  <HStack justify="space-between">
                    <Text fontWeight="medium">Storage Usage</Text>
                    <Text fontSize="lg" fontWeight="bold" color="purple.500">
                      {(stats.storage_usage_mb || 0).toFixed(1)} MB
                    </Text>
                  </HStack>
                </VStack>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>

        {/* Revenue Breakdown & Recent Activity */}
        <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap={8}>
          {/* Revenue Breakdown */}
          <GridItem>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader>
                <Heading size="md" color="blue.600">
                  Revenue Breakdown (Last 4 Weeks)
                </Heading>
              </CardHeader>
              <CardBody>
                <VStack spacing={3} align="stretch">
                  {stats.revenue_breakdown && stats.revenue_breakdown.length > 0 ? (
                    stats.revenue_breakdown.map((period, index) => (
                      <HStack key={index} justify="space-between" p={3} bg="gray.50" borderRadius="md">
                        <Text fontWeight="medium">{period.period}</Text>
                        <Text fontSize="lg" fontWeight="bold" color="green.500">
                          {formatCurrency(period.amount)}
                        </Text>
                      </HStack>
                    ))
                  ) : (
                    <Text color="gray.500" textAlign="center">No revenue data available</Text>
                  )}
                </VStack>
              </CardBody>
            </Card>
          </GridItem>

          {/* Recent Activity */}
          <GridItem>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader>
                <Heading size="md" color="blue.600">
                  Recent Activity (Last 24h)
                </Heading>
              </CardHeader>
              <CardBody>
                <VStack spacing={3} align="stretch">
                  {stats.recent_activity && stats.recent_activity.length > 0 ? (
                    stats.recent_activity.map((activity, index) => (
                      <HStack key={index} justify="space-between" p={3} bg="gray.50" borderRadius="md">
                        <VStack align="start" spacing={1}>
                          <Text fontWeight="medium">{activity.action}</Text>
                          <Text fontSize="sm" color="gray.600">
                            {new Date(activity.latest).toLocaleString()}
                          </Text>
                        </VStack>
                        <Badge colorScheme="blue" fontSize="md" px={3} py={1}>
                          {activity.count}
                        </Badge>
                      </HStack>
                    ))
                  ) : (
                    <Text color="gray.500" textAlign="center">No recent activity</Text>
                  )}
                </VStack>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
      </Container>
    </ErrorBoundary>
  );
};

export default AdminDashboard;
