import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Container,
  Heading,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  useColorModeValue,
  Text,
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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Divider,
  Tooltip,
  Table as ChakraTable,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Avatar,
  Tag,
  IconButton,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  Center,
  Input,
  Textarea,
  Switch,
  Select,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerBody,
  Skeleton,
  SkeletonText,
  useBreakpointValue,
  Image,
  ModalFooter,
  Checkbox,
  FormLabel,
} from '@chakra-ui/react';
import {
  FiUsers,
  FiStar,
  FiDollarSign,
  FiShoppingBag,
  FiShoppingCart,
  FiShield,
  FiPackage,
  FiRefreshCw,
  FiServer,
  FiPrinter,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiCalendar,
  FiMenu,
  FiAlertTriangle,
  FiSettings,
  FiHome,
  FiGrid,
  FiMoreVertical,
  FiBarChart2,
  FiAlertCircle,
} from 'react-icons/fi';
import { FiTrash2, FiEye, FiCheck, FiX, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { FaMotorcycle } from 'react-icons/fa';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../services/api';
import { mockAdminStats } from '../utils/mockData';
import { checkConnectionStatus } from '../utils/apiUtils';
import ConnectionStatus from '../components/ConnectionStatus';
import ErrorBoundary from '../components/ErrorBoundary';
import VerifiedAvatar from '../components/VerifiedAvatar';
import AdvertisementCMS from '../components/AdvertisementCMS';
import { User, Product, Trade, PaginatedResponse, APIResponse } from '../types';

const ADMIN_STATS_CACHE_KEY = 'clovia_admin_stats_cache_v1';
const ADMIN_STATS_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const ADMIN_STATS_REQUEST_TIMEOUT_MS = 12_000;

// â"€â"€â"€ PDF / DOCX imports â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// â"€â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
interface TradeMessage {
  id: number;
  trade_id: number;
  sender_id: number;
  content: string;
  image_url?: string;
  created_at: string;
}

type OverviewDimensions = {
  products: boolean;
  trades: boolean;
  categories: boolean;
};

interface OverviewCategoryRow {
  category: string;
  total: number;
  available: number;
  premium: number;
  last_created_at: string;
}

const OVERVIEW_TABLE_PAGE_SIZE = 10;

interface AdminStats {
  total_users: number;
  premium_users: number;
  total_income: number;
  active_listings: number;
  total_trades: number;
  new_users_today: number;
  new_listings_today: number;
  verified_users: number;
  pending_approvals: number;
  pending_verifications?: number;
  reports_filed: number;
  suspended_users: number;
  storage_usage_mb: number;
  revenue_breakdown: Array<{ period: string; amount: number }>;
  revenue_by_source?: Record<string, number>;
  recent_activity: Array<{ action: string; count: number; latest: string }>;
  last_updated: string;
}

interface DayStats {
  date: string;
  new_users: number;
  new_listings: number;
  completed_trades: number;
  reports_filed: number;
}

interface DayDetail {
  date: string;
  new_users: number;
  new_listings: number;
  completed_trades: number;
  reports_filed: number;
  revenue: number;
  active_listings: number;
}

export interface Campaign {
  id: number;
  title: string;
  description: string;
  image_url: string;
  button_text: string;
  button_link: string;
  start_date: string;
  end_date: string;
  target_users: string;
  frequency: string;
  is_active: boolean;
  created_at: string;
}

// â"€â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// â"€â"€â"€ Calendar Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
interface CalendarProps {
  year: number;
  month: number; // 1-based
  activityMap: Record<string, DayStats>;
  onDayClick: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  calendarLoading: boolean;
  selectedDate: string | null;
}

const UsageCalendar: React.FC<CalendarProps> = ({
  year, month, activityMap, onDayClick, onPrevMonth, onNextMonth, calendarLoading, selectedDate,
}) => {
  const cellBg = useColorModeValue('gray.50', 'gray.700');
  const todayBg = useColorModeValue('blue.50', 'blue.900');
  const selectedBg = useColorModeValue('blue.100', 'blue.800');
  const headerColor = useColorModeValue('gray.500', 'gray.400');
  const textColor = useColorModeValue('gray.800', 'gray.100');

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Box>
      {/* Month navigation */}
      <Flex justify="space-between" align="center" mb={4}>
        <Button size="sm" variant="ghost" onClick={onPrevMonth} leftIcon={<FiChevronLeft />}>
          Prev
        </Button>
        <HStack spacing={2}>
          {calendarLoading && <Spinner size="xs" color="blue.400" />}
          <Text fontWeight="bold" fontSize="lg">
            {MONTH_NAMES[month - 1]} {year}
          </Text>
        </HStack>
        <Button size="sm" variant="ghost" onClick={onNextMonth} rightIcon={<FiChevronRight />}>
          Next
        </Button>
      </Flex>

      {/* Delete Confirmation Alert */}
      <SimpleGrid columns={7} mb={1}>
        {DAY_LABELS.map(d => (
          <Box key={d} textAlign="center" py={1}>
            <Text fontSize="xs" fontWeight="semibold" color={headerColor} textTransform="uppercase">
              {d}
            </Text>
          </Box>
        ))}
      </SimpleGrid>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <SimpleGrid key={wi} columns={7} gap={1} mb={1}>
          {week.map((day, di) => {
            if (!day) return <Box key={di} />;
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasActivity = !!activityMap[dateStr];
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const isFuture = dateStr > todayStr;

            const totalActivity = hasActivity
              ? (activityMap[dateStr].new_users +
                activityMap[dateStr].new_listings +
                activityMap[dateStr].completed_trades)
              : 0;

            const dotColor =
              totalActivity > 10 ? 'green.400' :
                totalActivity > 3 ? 'blue.400' :
                  totalActivity > 0 ? 'orange.400' : 'transparent';

            return (
              <Tooltip
                key={di}
                label={
                  hasActivity
                    ? `${totalActivity} activities`
                    : isFuture ? 'Future date' : 'No activity'
                }
                hasArrow
                placement="top"
              >
                <Box
                  bg={isSelected ? selectedBg : isToday ? todayBg : cellBg}
                  borderRadius="md"
                  p={1}
                  textAlign="center"
                  cursor={isFuture ? 'not-allowed' : 'pointer'}
                  opacity={isFuture ? 0.4 : 1}
                  border="2px solid"
                  borderColor={isSelected ? 'blue.400' : isToday ? 'blue.200' : 'transparent'}
                  _hover={!isFuture ? { borderColor: 'blue.300', transform: 'scale(1.05)' } : {}}
                  transition="all 0.15s"
                  onClick={() => !isFuture && onDayClick(dateStr)}
                  minH="44px"
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize="sm" fontWeight={isToday ? 'bold' : 'normal'} color={textColor}>
                    {day}
                  </Text>
                  <Box w="6px" h="6px" borderRadius="full" bg={dotColor} mt="2px" />
                </Box>
              </Tooltip>
            );
          })}
        </SimpleGrid>
      ))}

      {/* Legend */}
      <HStack spacing={4} mt={3} justify="center" flexWrap="wrap">
        {[
          { color: 'green.400', label: 'High activity (>10)' },
          { color: 'blue.400', label: 'Medium (4â€"10)' },
          { color: 'orange.400', label: 'Low (1â€"3)' },
        ].map(l => (
          <HStack key={l.label} spacing={1}>
            <Box w="8px" h="8px" borderRadius="full" bg={l.color} />
            <Text fontSize="xs" color="gray.500">{l.label}</Text>
          </HStack>
        ))}
      </HStack>
    </Box>
  );
};

// â"€â"€â"€ Main Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const AdminDashboard: React.FC = () => {
  type SectionId = 'overview' | 'moderation' | 'management' | 'system';

  const formatYMD = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getDefaultOverviewDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { start: formatYMD(start), end: formatYMD(end) };
  };
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{ online: boolean; apiReachable: boolean }>({
    online: navigator.onLine,
    apiReachable: true,
  });
  const [isUsingMockData, setIsUsingMockData] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showConnectionAlert, setShowConnectionAlert] = useState(false);
  const didKickoffSecondaryFetchesRef = useRef(false);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1); // 1-based
  const [activityMap, setActivityMap] = useState<Record<string, DayStats>>({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDayDetail, setSelectedDayDetail] = useState<DayDetail | null>(null);
  const [dayDetailLoading, setDayDetailLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);

  // Admin lists state
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersSearchInput, setUsersSearchInput] = useState('');
  const [usersSearch, setUsersSearch] = useState('');
  const usersSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [usersRoleFilter, setUsersRoleFilter] = useState('');
  const [usersIsVerifiedFilter, setUsersIsVerifiedFilter] = useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsPage, setProductsPage] = useState(1);
  const [productsTotalPages, setProductsTotalPages] = useState(1);
  const [productsSearchInput, setProductsSearchInput] = useState('');
  const [productsSearch, setProductsSearch] = useState('');
  const productsSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [productsStatusFilter, setProductsStatusFilter] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set());
  const [isSelectingProducts, setIsSelectingProducts] = useState(false);

  // Overview: quick data explorer (Products / Trades / Categories)
  const defaults = getDefaultOverviewDates();
  const [overviewStartDate, setOverviewStartDate] = useState<string>(defaults.start);
  const [overviewEndDate, setOverviewEndDate] = useState<string>(defaults.end);
  const [overviewDims, setOverviewDims] = useState<OverviewDimensions>({
    products: true,
    trades: false,
    categories: false,
  });
  const [overviewDataLoading, setOverviewDataLoading] = useState(false);
  const [overviewRevenue, setOverviewRevenue] = useState<number | null>(null);
  const [overviewRevenueLoading, setOverviewRevenueLoading] = useState(false);
  const [overviewProductsData, setOverviewProductsData] = useState<Product[]>([]);
  const [overviewProductsPage, setOverviewProductsPage] = useState(1);
  const [overviewProductsTotalPages, setOverviewProductsTotalPages] = useState(1);
  const [overviewProductsTotal, setOverviewProductsTotal] = useState(0);
  const [overviewTradesData, setOverviewTradesData] = useState<Trade[]>([]);
  const [overviewTradesPage, setOverviewTradesPage] = useState(1);
  const [overviewTradesTotalPages, setOverviewTradesTotalPages] = useState(1);
  const [overviewTradesTotal, setOverviewTradesTotal] = useState(0);
  const [overviewCategoriesData, setOverviewCategoriesData] = useState<OverviewCategoryRow[]>([]);

  // Reports state
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsTotalPages, setReportsTotalPages] = useState(1);
  const [reportsStatusFilter, setReportsStatusFilter] = useState('');

  // Multi-way Disputes state
  const [multiwayDisputes, setMultiwayDisputes] = useState<any[]>([]);
  const [multiwayDisputesLoading, setMultiwayDisputesLoading] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [disputeChatLogs, setDisputeChatLogs] = useState<TradeMessage[]>([]);

  // Strike History state
  const [strikeHistoryUser, setStrikeHistoryUser] = useState<User | null>(null);
  const [strikeHistoryData, setStrikeHistoryData] = useState<any[]>([]);
  const [strikeHistoryLoading, setStrikeHistoryLoading] = useState(false);
  const [manualStrikeReason, setManualStrikeReason] = useState('');
  const [manualStrikeChain, setManualStrikeChain] = useState('');
  const [manualStrikeLoading, setManualStrikeLoading] = useState(false);

  // Multi-way matcher debug state
  const [loopDebugTradeID, setLoopDebugTradeID] = useState('');
  const [loopDebugCompareTradeID, setLoopDebugCompareTradeID] = useState('');
  const [loopDebugLoading, setLoopDebugLoading] = useState(false);
  const [loopDebugResult, setLoopDebugResult] = useState<any | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'user' | 'product' | 'campaign'; id: number; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Campaigns state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const { isOpen: isCampaignModalOpen, onOpen: openCampaignModal, onClose: closeCampaignModal } = useDisclosure();
  const [editingCampaign, setEditingCampaign] = useState<Partial<Campaign> | null>(null);
  const [campaignFormLoading, setCampaignFormLoading] = useState(false);

  // Rider application verification state
  type RiderAppItem = {
    id: number;
    user_id: number;
    name: string;
    full_name: string;
    email: string;
    vehicle_type: string;
    vehicle_plate: string;
    contact_number: string;
    status: string;
    license_image_url: string;
    selfie_image_url: string;
    rejection_reason: string;
    reviewed_at: string;
    created_at: string;
    profile_picture: string;
  };
  const [riderApplications, setRiderApplications] = useState<RiderAppItem[]>([]);
  const [riderAppsLoading, setRiderAppsLoading] = useState(false);
  const [riderStatusFilter, setRiderStatusFilter] = useState('');
  const [riderSearchInput, setRiderSearchInput] = useState('');
  const [riderSearchQuery, setRiderSearchQuery] = useState('');
  const riderSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedRiderApp, setSelectedRiderApp] = useState<RiderAppItem | null>(null);
  const [rejectRiderTarget, setRejectRiderTarget] = useState<RiderAppItem | null>(null);
  const [rejectRiderReason, setRejectRiderReason] = useState('');
  const [rejectRiderLoading, setRejectRiderLoading] = useState(false);

  // Task 19/20: Rider free slots config + remittance payment review
  type AdminRemittancePayment = {
    id: number;
    rider_id: number;
    rider_user_id: number;
    rider_name: string;
    rider_email: string;
    amount_paid: number;
    payment_method: string;
    payment_proof_url: string;
    status: string;
    created_at: string;
  };
  const [riderFreeSlotsDefault, setRiderFreeSlotsDefault] = useState<number>(3);
  const [riderRemittanceTaxPerCollection, setRiderRemittanceTaxPerCollection] = useState<number>(2.0);
  const [riderRemittanceLockThreshold, setRiderRemittanceLockThreshold] = useState<number>(50.0);
  const [riderConfigLoading, setRiderConfigLoading] = useState(false);
  const [remittancePayments, setRemittancePayments] = useState<AdminRemittancePayment[]>([]);
  const [remittanceLoading, setRemittanceLoading] = useState(false);
  const [verifyRemittanceLoadingId, setVerifyRemittanceLoadingId] = useState<number | null>(null);

  const { isOpen: isDayModalOpen, onOpen: openDayModal, onClose: closeDayModal } = useDisclosure();
  const {
    isOpen: isDeleteDialogOpen,
    onOpen: openDeleteDialog,
    onClose: closeDeleteDialog,
  } = useDisclosure();
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);

  const toast = useToast();
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const cardBg = useColorModeValue('white', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'gray.100');
  const mutedTextColor = useColorModeValue('#64748b', 'gray.400');
  const hoverBg = useColorModeValue('gray.50', 'gray.700');
  const tableBg = useColorModeValue('gray.50', 'gray.700');
  const headerBg = useColorModeValue('brand.50', 'brand.900');
  const sidebarBg = useColorModeValue('white', 'gray.800');
  const topBarBg = useColorModeValue('white', 'gray.800');
  const mainBg = useColorModeValue('gray.50', 'gray.900');
  const isMobile = useBreakpointValue({ base: true, lg: false });

  const sidebarNav: { id: SectionId; label: string; icon: any; description: string; badge?: number | string }[] = [
    { id: 'overview', label: 'Overview', icon: FiHome, description: 'Metrics & charts' },
    { id: 'moderation', label: 'Moderation Queue', icon: FiAlertTriangle, description: 'Reports & riders', badge: (reports.filter((r: any) => r.status === 'pending').length + riderApplications.filter(r => r.status === 'pending').length) || undefined },
    { id: 'management', label: 'Management', icon: FiGrid, description: 'Users, items & campaigns' },
    { id: 'system', label: 'System', icon: FiSettings, description: 'Metrics & calendar' },
  ];

  // â"€â"€ Connection check â"€â"€
  const checkConnection = useCallback(async () => {
    try {
      const status = await checkConnectionStatus();
      setConnectionStatus({ online: !!status.online, apiReachable: !!status.apiReachable });
      setShowConnectionAlert(!status.online || !status.apiReachable);
    } catch { }
  }, []);

  // â"€â"€ Fetch main stats â"€â"€
  const fetchAdminStats = useCallback(async (
    opts: boolean | { useMockDataFallback?: boolean; background?: boolean } = false
  ) => {
    const options = typeof opts === 'boolean' ? { useMockDataFallback: opts } : opts;
    const useMockDataFallback = !!options.useMockDataFallback;
    const background = !!options.background;

    try {
      if (!background) setLoading(true);
      setError(null);
      setIsUsingMockData(false);

      if (useMockDataFallback) {
        setStats(mockAdminStats);
        setIsUsingMockData(true);
        if (!background) {
          toast({ id: 'using-demo-data', title: 'Using Demo Data', description: 'Showing mock data while API is unavailable', status: 'info', duration: 5000, isClosable: true });
        }
        return;
      }

      const response = await api.get('/api/admin/stats', { timeout: ADMIN_STATS_REQUEST_TIMEOUT_MS });
      const result = response.data;

      if (result.success) {
        if (!result.data) {
          setStats(mockAdminStats);
          setIsUsingMockData(true);
        } else {
          setStats(result.data);
          setIsUsingMockData(false);

          try {
            sessionStorage.setItem(
              ADMIN_STATS_CACHE_KEY,
              JSON.stringify({ ts: Date.now(), data: result.data })
            );
          } catch {
            // ignore cache write errors
          }
        }
      } else {
        throw new Error(result.error || 'Failed to fetch admin statistics');
      }
    } catch (err: any) {
      const status = err?.response?.status as number | undefined;
      const apiMessage = err?.response?.data?.error || err?.message || 'Unable to fetch admin statistics';

      // Auth errors should NOT trigger demo mode.
      if (status === 401 || status === 403) {
        setError('Not authorized');
        setIsUsingMockData(false);
        if (!background) {
          toast({
            id: 'admin-stats-unauthorized',
            title: 'Not authorized',
            description: 'Please sign in with an admin account to view dashboard stats.',
            status: 'error',
            duration: 6000,
            isClosable: true,
          });
        }
        return;
      }

      const shouldFallbackToMock = !err?.response || (typeof status === 'number' && (status >= 500 || status === 429));

      if (shouldFallbackToMock) {
        // Fall back to mock data only when API is unreachable or server is failing.
        setStats(mockAdminStats);
        setIsUsingMockData(true);
        if (!background) {
          setRetryCount(prev => prev + 1);
          toast({
            id: 'admin-stats-demo-fallback',
            title: 'Using demo data',
            description: 'Could not reach server — showing demo data',
            status: 'warning',
            duration: 5000,
            isClosable: true,
          });
        }
      } else {
        setError(String(apiMessage));
        setIsUsingMockData(false);
        if (!background) {
          setRetryCount(prev => prev + 1);
          toast({
            id: 'admin-stats-error',
            title: 'Could not load admin stats',
            description: String(apiMessage),
            status: 'error',
            duration: 6000,
            isClosable: true,
          });
        }
      }
    } finally {
      if (!background) setLoading(false);
    }
  }, [toast]);

  const getEndExclusiveYMD = useCallback((ymd: string): string => {
    const parts = ymd.split('-').map(Number);
    if (parts.length !== 3) return ymd;
    const [y, m, d] = parts;
    if (!y || !m || !d) return ymd;
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 1);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const fetchOverviewProductsPage = useCallback(async (page: number) => {
    const params = new URLSearchParams();
    if (overviewStartDate) params.set('start', overviewStartDate);
    if (overviewEndDate) params.set('end', getEndExclusiveYMD(overviewEndDate));
    params.set('page', String(page));
    params.set('limit', String(OVERVIEW_TABLE_PAGE_SIZE));

    const resp = await api.get<APIResponse<PaginatedResponse<Product>>>(`/api/admin/products?${params.toString()}`);
    if (resp.data?.success) {
      const data = resp.data.data;
      setOverviewProductsData(data?.data || []);
      setOverviewProductsPage(data?.page || page);
      setOverviewProductsTotalPages(data?.total_pages || 1);
      setOverviewProductsTotal(data?.total || 0);
    } else {
      setOverviewProductsData([]);
      setOverviewProductsPage(1);
      setOverviewProductsTotalPages(1);
      setOverviewProductsTotal(0);
    }
  }, [getEndExclusiveYMD, overviewEndDate, overviewStartDate]);

  const fetchOverviewTradesPage = useCallback(async (page: number) => {
    const params = new URLSearchParams();
    if (overviewStartDate) params.set('start', overviewStartDate);
    if (overviewEndDate) params.set('end', getEndExclusiveYMD(overviewEndDate));
    params.set('page', String(page));
    params.set('limit', String(OVERVIEW_TABLE_PAGE_SIZE));

    const resp = await api.get<APIResponse<PaginatedResponse<Trade>>>(`/api/admin/trades?${params.toString()}`);
    if (resp.data?.success) {
      const data = resp.data.data;
      setOverviewTradesData(data?.data || []);
      setOverviewTradesPage(data?.page || page);
      setOverviewTradesTotalPages(data?.total_pages || 1);
      setOverviewTradesTotal(data?.total || 0);
    } else {
      setOverviewTradesData([]);
      setOverviewTradesPage(1);
      setOverviewTradesTotalPages(1);
      setOverviewTradesTotal(0);
    }
  }, [getEndExclusiveYMD, overviewEndDate, overviewStartDate]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!overviewStartDate || !overviewEndDate) {
        setOverviewRevenue(null);
        setOverviewRevenueLoading(false);
        return;
      }

      setOverviewRevenueLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('start', overviewStartDate);
        params.set('end', overviewEndDate); // inclusive for revenue endpoint
        const resp = await api.get<APIResponse<{ revenue: number }>>(`/api/admin/revenue?${params.toString()}`);
        if (cancelled) return;
        if (resp.data?.success) {
          const raw = (resp.data.data as any)?.revenue;
          setOverviewRevenue(typeof raw === 'number' ? raw : Number(raw || 0));
        } else {
          setOverviewRevenue(null);
        }
      } catch {
        if (!cancelled) setOverviewRevenue(null);
      } finally {
        if (!cancelled) setOverviewRevenueLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [overviewEndDate, overviewStartDate]);

  const fetchOverviewDataTables = useCallback(async () => {
    const anySelected = overviewDims.products || overviewDims.trades || overviewDims.categories;
    if (!anySelected) {
      toast({ id: 'overview-no-dimensions', title: 'Select at least one option', status: 'warning', duration: 2500, isClosable: true });
      return;
    }

    setOverviewDataLoading(true);
    try {
      const common = new URLSearchParams();
      if (overviewStartDate) common.set('start', overviewStartDate);
      if (overviewEndDate) common.set('end', getEndExclusiveYMD(overviewEndDate));

      if (overviewDims.products) {
        await fetchOverviewProductsPage(1);
      } else {
        setOverviewProductsData([]);
        setOverviewProductsPage(1);
        setOverviewProductsTotalPages(1);
        setOverviewProductsTotal(0);
      }

      if (overviewDims.trades) {
        await fetchOverviewTradesPage(1);
      } else {
        setOverviewTradesData([]);
        setOverviewTradesPage(1);
        setOverviewTradesTotalPages(1);
        setOverviewTradesTotal(0);
      }

      if (overviewDims.categories) {
        const params = new URLSearchParams(common);
        params.set('limit', '50');
        const resp = await api.get<APIResponse<OverviewCategoryRow[]>>(`/api/admin/categories?${params.toString()}`);
        if (resp.data?.success && Array.isArray(resp.data.data)) setOverviewCategoriesData(resp.data.data);
        else setOverviewCategoriesData([]);
      } else {
        setOverviewCategoriesData([]);
      }
    } catch (err: any) {
      toast({
        id: 'overview-data-fetch-failed',
        title: 'Failed to fetch data',
        description: err?.response?.data?.error || err.message || 'Unable to fetch data',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setOverviewDataLoading(false);
    }
  }, [fetchOverviewProductsPage, fetchOverviewTradesPage, getEndExclusiveYMD, overviewDims, overviewEndDate, overviewStartDate, toast]);

  // Auto-fetch overview tables when options/date range change
  useEffect(() => {
    const anySelected = overviewDims.products || overviewDims.trades || overviewDims.categories;

    if (!anySelected) {
      setOverviewProductsData([]);
      setOverviewProductsPage(1);
      setOverviewProductsTotalPages(1);
      setOverviewProductsTotal(0);

      setOverviewTradesData([]);
      setOverviewTradesPage(1);
      setOverviewTradesTotalPages(1);
      setOverviewTradesTotal(0);

      setOverviewCategoriesData([]);
      return;
    }

    const t = setTimeout(() => {
      // Safe: we only call this when at least one option is selected.
      fetchOverviewDataTables();
    }, 200);

    return () => clearTimeout(t);
  }, [fetchOverviewDataTables, overviewDims, overviewEndDate, overviewStartDate]);

  // â"€â"€ Fetch calendar daily stats â"€â"€
  const fetchDailyStats = useCallback(async (year: number, month: number) => {
    setCalendarLoading(true);
    try {
      const response = await api.get(`/api/admin/daily-stats?year=${year}&month=${month}`);
      if (response.data?.success && Array.isArray(response.data.data)) {
        const map: Record<string, DayStats> = {};
        (response.data.data as DayStats[]).forEach(d => { map[d.date] = d; });
        setActivityMap(map);
      }
    } catch {
      // silently fail â€" calendar is supplementary
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  // â"€â"€ Fetch stats for a specific day â"€â"€
  const fetchDayDetail = useCallback(async (date: string) => {
    setDayDetailLoading(true);
    setSelectedDayDetail(null);
    try {
      const response = await api.get(`/api/admin/stats-by-date?date=${date}`);
      if (response.data?.success) {
        setSelectedDayDetail(response.data.data as DayDetail);
      }
    } catch {
      toast({ id: 'could-not-load-day-data', title: 'Could not load day data', status: 'warning', duration: 3000, isClosable: true });
    } finally {
      setDayDetailLoading(false);
    }
  }, [toast]);

  const handleDayClick = useCallback((date: string) => {
    setSelectedDate(date);
    fetchDayDetail(date);
    openDayModal();
  }, [fetchDayDetail, openDayModal]);

  const handlePrevMonth = useCallback(() => {
    setCalYear(y => calMonth === 1 ? y - 1 : y);
    setCalMonth(m => m === 1 ? 12 : m - 1);
  }, [calMonth]);

  const handleNextMonth = useCallback(() => {
    setCalYear(y => calMonth === 12 ? y + 1 : y);
    setCalMonth(m => m === 12 ? 1 : m + 1);
  }, [calMonth]);

  const handleRetry = useCallback(async () => {
    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));
    await fetchAdminStats();
  }, [fetchAdminStats, retryCount]);

  const handleRefresh = useCallback(async () => {
    setRetryCount(0);
    await fetchAdminStats();
  }, [fetchAdminStats]);

  const handleExportRevenue = useCallback(async () => {
    if (!stats) {
      toast({ id: 'overview-export-no-stats', title: 'Stats are still loading', status: 'info', duration: 2500, isClosable: true });
      return;
    }

    const totalIncome = Number(stats.total_income || 0);
    const revenueBySourceEntries = stats.revenue_by_source ? Object.entries(stats.revenue_by_source) : [];
    const hasAnyRevenue = totalIncome > 0 || revenueBySourceEntries.some(([, v]) => Number(v || 0) !== 0);

    if (!hasAnyRevenue) {
      toast({ id: 'overview-export-no-revenue', title: 'No revenue data available', status: 'warning', duration: 2500, isClosable: true });
      return;
    }

    setExportLoading(true);
    try {
      const formatPhpPdf = (amount: number) => {
        const n = Number(amount || 0);
        return `PHP ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      };

      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const now = new Date();
      const title = 'Clovia Admin — Revenue Report';
      const generated = now.toLocaleString('en-PH');

      const pageW = pdf.internal.pageSize.getWidth();
      const usableW = pageW - 28;

      // Header band
      pdf.setFillColor(49, 130, 206);
      pdf.rect(0, 0, pageW, 22, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(title, pageW / 2, 13, { align: 'center' });

      pdf.setTextColor(60);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Generated: ${generated}`, 14, 30);

      // Total income
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(30);
      pdf.text('Total Income', 14, 40);
      pdf.setFontSize(16);
      pdf.text(formatPhpPdf(totalIncome), 14, 48);

      // Revenue by Source
      pdf.setFontSize(12);
      pdf.text('Revenue by Source', 14, 60);

      const sourceRows = revenueBySourceEntries.length > 0
        ? revenueBySourceEntries.map(([source, amount]) => {
          const label = String(source || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          return [label, formatPhpPdf(Number(amount || 0))];
        })
        : [['No revenue sources', '']];

      autoTable(pdf, {
        startY: 64,
        head: [['Source', 'Amount (PHP)']],
        body: sourceRows,
        theme: 'striped',
        tableWidth: usableW,
        headStyles: { fillColor: [49, 130, 206], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { fontSize: 10, overflow: 'linebreak' },
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      });

      const filename = `clovia-revenue-${now.toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);

      toast({ id: 'overview-exported-revenue-pdf', title: 'Revenue PDF downloaded', status: 'success', duration: 2500, isClosable: true });
    } catch (e: any) {
      toast({
        id: 'overview-export-failed',
        title: 'Export failed',
        description: e?.message || 'Unable to export revenue PDF',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setExportLoading(false);
    }
  }, [stats, toast]);

  const handleBackfillLedgers = useCallback(async () => {
    try {
      setBackfillLoading(true);
      const res = await api.post('/api/admin/backfill-ledgers');
      toast({
        title: 'Legacy Legders Successfully Synced!',
        description: res.data.message || 'Rider ledgers updated perfectly.',
        status: 'success',
        duration: 6000,
        isClosable: true,
      });
    } catch (err: any) {
      toast({
        title: 'Backfill Failed',
        description: err.response?.data?.error || err.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setBackfillLoading(false);
    }
  }, [toast]);

  const fetchRiderConfig = useCallback(async () => {
    try {
      setRiderConfigLoading(true);
      const res = await api.get('/api/admin/rider-config');
      if (res.data?.success && res.data?.data) {
        setRiderFreeSlotsDefault(Number(res.data.data.rider_free_slots_default) || 3);
        setRiderRemittanceTaxPerCollection(Number(res.data.data.rider_remittance_tax_per_collection) || 2.0);
        setRiderRemittanceLockThreshold(Number(res.data.data.rider_remittance_lock_threshold) || 50.0);
      }
    } catch {
      // keep defaults
    } finally {
      setRiderConfigLoading(false);
    }
  }, []);

  const saveRiderConfig = useCallback(async () => {
    try {
      setRiderConfigLoading(true);
      const res = await api.put('/api/admin/rider-config', {
        rider_free_slots_default: Number(riderFreeSlotsDefault),
        rider_remittance_tax_per_collection: Number(riderRemittanceTaxPerCollection),
        rider_remittance_lock_threshold: Number(riderRemittanceLockThreshold),
      });
      if (res.data?.success) {
        toast({ title: 'Saved', description: 'Rider configuration updated.', status: 'success', duration: 2500 });
      } else {
        toast({ title: 'Save failed', description: res.data?.error || 'Could not update setting', status: 'error', duration: 3000 });
      }
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.response?.data?.error || err?.message || 'Could not update setting', status: 'error', duration: 3000 });
    } finally {
      setRiderConfigLoading(false);
    }
  }, [riderFreeSlotsDefault, riderRemittanceTaxPerCollection, riderRemittanceLockThreshold, toast]);

  const fetchRemittancePayments = useCallback(async () => {
    try {
      setRemittanceLoading(true);
      const res = await api.get('/api/admin/remittance-payments?status=pending');
      if (res.data?.success && Array.isArray(res.data.data)) {
        setRemittancePayments(res.data.data);
      } else {
        setRemittancePayments([]);
      }
    } catch {
      setRemittancePayments([]);
    } finally {
      setRemittanceLoading(false);
    }
  }, []);

  const approveRemittancePayment = useCallback(async (paymentId: number) => {
    try {
      setVerifyRemittanceLoadingId(paymentId);
      const res = await api.post(`/api/admin/remittance-payments/${paymentId}/verify`, { approve: true });
      if (res.data?.success) {
        toast({ title: 'Payment verified', description: 'Rider unlocked and slots refilled.', status: 'success', duration: 3000 });
        setRemittancePayments(prev => prev.filter(p => p.id !== paymentId));
      } else {
        toast({ title: 'Verify failed', description: res.data?.error || 'Could not verify payment', status: 'error', duration: 3000 });
      }
    } catch (err: any) {
      toast({ title: 'Verify failed', description: err?.response?.data?.error || err?.message || 'Could not verify payment', status: 'error', duration: 3000 });
    } finally {
      setVerifyRemittanceLoadingId(null);
    }
  }, [toast]);

  // â"€â"€ Fetch reports for admin â"€â"€
  const fetchAdminReports = useCallback(
    async (page = 1, status = '') => {
      try {
        setReportsLoading(true);
        const params = new URLSearchParams({ page: String(page), limit: '10' });
        if (status) params.append('status', status);
        const response = await api.get(`/api/admin/reports?${params.toString()}`);
        if (response.data.success && response.data.data) {
          const data = response.data.data;
          setReports(Array.isArray(data.data) ? data.data : []);
          setReportsPage(data.page || page);
          setReportsTotalPages(data.total_pages || 1);
        } else {
          setReports([]);
        }
      } catch (err: any) {
        toast({
          id: "admindashboard-failed-to-load-reports",
          title: 'Failed to load reports',
          description: err?.response?.data?.error || err.message || 'Unable to fetch reports',
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
        setReports([]);
      } finally {
        setReportsLoading(false);
      }
    },
    [toast],
  );

  // â"€â"€ Update report status â"€â"€
  const handleUpdateReportStatus = useCallback(async (reportId: number, newStatus: string) => {
    try {
      await api.put(`/api/admin/reports/${reportId}/status`, { status: newStatus });
      toast({
        id: "admindashboard-report-updated", title: 'Report updated', status: 'success', duration: 2000, isClosable: true
      });
      fetchAdminReports(reportsPage, reportsStatusFilter);
    } catch (err: any) {
      toast({
        id: "admindashboard-failed-to-update-report",
        title: 'Failed to update report',
        description: err?.response?.data?.error || 'Update failed',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [reportsPage, reportsStatusFilter, fetchAdminReports, toast]);

  // â"€â"€ Fetch Multiway Disputes â"€â"€
  const fetchMultiwayDisputes = useCallback(async () => {
    try {
      setMultiwayDisputesLoading(true);
      const response = await api.get(`/api/admin/multiway-disputes`);
      if (response.data.success) {
        setMultiwayDisputes(Array.isArray(response.data.data) ? response.data.data : []);
      }
    } catch (err: any) {
      console.error('Failed to load multiway disputes', err);
    } finally {
      setMultiwayDisputesLoading(false);
    }
  }, []);

  const openDisputeDetails = async (dispute: any) => {
    setSelectedDispute(dispute);
    try {
      // Attempt to load chat logs for the specific leg
      const res = await api.get(`/api/trades/${dispute.leg_id}/messages`);
      if (res.data.success) {
        setDisputeChatLogs(Array.isArray(res.data.data) ? res.data.data : []);
      }
    } catch (err) {
      console.error('Failed to fetch chat logs for dispute');
    }
  };

  const resolveDispute = async (id: number, resolution: string, targetUid?: number) => {
    try {
      await api.put(`/api/admin/multiway-disputes/${id}/resolve`, {
        status: 'resolved',
        resolution,
        adminNotes: 'Resolved by Admin'
      });
      if (targetUid) {
        await api.post(`/api/admin/users/${targetUid}/suspend`, { reason: 'Dispute resolved against you' });
      }
      toast({ title: 'Dispute Resolved', status: 'success' });
      fetchMultiwayDisputes();
      setSelectedDispute(null);
    } catch (err: any) {
      toast({ title: 'Failed to resolve dispute', description: err.message, status: 'error' });
    }
  };

  const handleRunLoopDebug = useCallback(async () => {
    const tradeID = Number(loopDebugTradeID);
    if (!Number.isFinite(tradeID) || tradeID <= 0) {
      toast({
        id: 'loop-debug-invalid-trade-id',
        title: 'Invalid trade ID',
        description: 'Enter a valid primary trade ID.',
        status: 'warning',
        duration: 2500,
        isClosable: true,
      });
      return;
    }

    const compareID = loopDebugCompareTradeID.trim() ? Number(loopDebugCompareTradeID) : 0;
    if (loopDebugCompareTradeID.trim() && (!Number.isFinite(compareID) || compareID <= 0)) {
      toast({
        id: 'loop-debug-invalid-compare-id',
        title: 'Invalid compare trade ID',
        description: 'Enter a valid comparison trade ID or leave it blank.',
        status: 'warning',
        duration: 2500,
        isClosable: true,
      });
      return;
    }

    try {
      setLoopDebugLoading(true);
      const params = new URLSearchParams({ trade_id: String(tradeID) });
      if (compareID > 0) {
        params.append('compare_trade_id', String(compareID));
      }
      const response = await api.get(`/api/trades/loops/debug/match?${params.toString()}`);
      if (response.data?.success) {
        setLoopDebugResult(response.data.data || null);
      } else {
        setLoopDebugResult(null);
        toast({
          id: 'loop-debug-no-data',
          title: 'No debug data returned',
          status: 'warning',
          duration: 2500,
          isClosable: true,
        });
      }
    } catch (err: any) {
      setLoopDebugResult(null);
      toast({
        id: 'loop-debug-request-failed',
        title: 'Failed to run matcher debug',
        description: err?.response?.data?.error || err.message || 'Request failed',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setLoopDebugLoading(false);
    }
  }, [loopDebugTradeID, loopDebugCompareTradeID, toast]);

  // â"€â"€ Debounced search handlers â"€â"€
  const handleUsersSearch = useCallback((searchValue: string) => {
    setUsersSearchInput(searchValue);
    if (usersSearchDebounceRef.current) {
      clearTimeout(usersSearchDebounceRef.current);
    }
    usersSearchDebounceRef.current = setTimeout(() => {
      setUsersSearch(searchValue);
    }, 500);
  }, []);

  const handleProductsSearch = useCallback((searchValue: string) => {
    setProductsSearchInput(searchValue);
    if (productsSearchDebounceRef.current) {
      clearTimeout(productsSearchDebounceRef.current);
    }
    productsSearchDebounceRef.current = setTimeout(() => {
      setProductsSearch(searchValue);
    }, 500);
  }, []);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (usersSearchDebounceRef.current) clearTimeout(usersSearchDebounceRef.current);
      if (productsSearchDebounceRef.current) clearTimeout(productsSearchDebounceRef.current);
    };
  }, []);

  // Trigger fetch when debounced users search changes
  useEffect(() => {
    fetchAdminUsers(1, usersSearch, usersRoleFilter, usersIsVerifiedFilter);
  }, [usersSearch]);

  // Trigger fetch when debounced products search changes
  useEffect(() => {
    fetchAdminProducts(1, productsSearch);
  }, [productsSearch]);

  // â"€â"€ Fetch users for admin list â"€â"€
  const fetchAdminUsers = useCallback(
    async (page = 1, search = usersSearch, role = usersRoleFilter, verified = usersIsVerifiedFilter) => {
      try {
        setUsersLoading(true);
        const params = new URLSearchParams({ page: String(page), limit: '10' });
        if (search) params.append('search', search);
        if (role) params.append('role', role);
        if (verified) params.append('verified', verified);

        const response = await api.get<APIResponse<PaginatedResponse<User>>>(`/api/admin/users?${params.toString()}`);
        if (response.data.success && response.data.data) {
          const data = response.data.data as PaginatedResponse<User>;
          setUsers(data.data || []);
          setUsersPage(data.page || page);
          setUsersTotalPages(data.total_pages || 1);
        } else {
          setUsers([]);
        }
      } catch (err: any) {
        toast({
          id: "admindashboard-failed-to-load-users",
          title: 'Failed to load users',
          description: err?.response?.data?.error || err.message || 'Unable to fetch users',
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
        setUsers([]);
      } finally {
        setUsersLoading(false);
      }
    },
    [toast],
  );

  // â"€â"€ User management action handlers â"€â"€
  const handleToggleSuspend = useCallback(async (user: User) => {
    const isSuspended = user.role === 'suspended';
    const action = isSuspended ? 'unsuspend' : 'suspend';
    const confirmed = window.confirm(`${isSuspended ? 'Unsuspend' : 'Suspend'} ${user.name}?`);
    if (!confirmed) return;

    try {
      setUsersLoading(true);
      const endpoint = isSuspended ? `/api/admin/users/${user.id}/unsuspend` : `/api/admin/users/${user.id}/suspend`;
      await api.put(endpoint);
      toast({
        title: `User ${isSuspended ? 'unsuspended' : 'suspended'}`,
        status: 'success',
        duration: 3000,
      });
      fetchAdminUsers(usersPage);
    } catch (err: any) {
      toast({
        title: `Failed to ${action} user`,
        description: err?.response?.data?.error || 'Error',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setUsersLoading(false);
    }
  }, [usersPage, fetchAdminUsers, toast]);

  const handleToggleBan = useCallback(async (user: User) => {
    const isBanned = user.role === 'banned';
    const action = isBanned ? 'unban' : 'ban';
    const confirmed = window.confirm(`${isBanned ? 'Unban' : 'Ban'} ${user.name}?`);
    if (!confirmed) return;

    try {
      setUsersLoading(true);
      const endpoint = isBanned ? `/api/admin/users/${user.id}/unban` : `/api/admin/users/${user.id}/ban`;
      await api.put(endpoint);
      toast({
        title: `User ${isBanned ? 'unbanned' : 'banned'}`,
        status: 'success',
        duration: 3000,
      });
      fetchAdminUsers(usersPage);
    } catch (err: any) {
      toast({
        title: `Failed to ${action} user`,
        description: err?.response?.data?.error || 'Error',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setUsersLoading(false);
    }
  }, [usersPage, fetchAdminUsers, toast]);

  const askDeleteUser = useCallback((user: User) => {
    setDeleteTarget({ type: 'user', id: user.id, name: user.name });
    openDeleteDialog();
  }, [openDeleteDialog]);

  // â"€â"€ Fetch products for admin list â"€â"€
  const fetchAdminProducts = useCallback(
    async (page = 1, search = productsSearch, status = productsStatusFilter) => {
      try {
        setProductsLoading(true);
        const params = new URLSearchParams({ page: String(page), limit: '10' });
        if (search) params.append('search', search);
        if (status) params.append('status', status);

        const response = await api.get<APIResponse<PaginatedResponse<Product>>>(`/api/admin/products?${params.toString()}`);
        if (response.data.success && response.data.data) {
          const data = response.data.data as PaginatedResponse<Product>;
          setProducts(data.data || []);
          setProductsPage(data.page || page);
          setProductsTotalPages(data.total_pages || 1);
        } else {
          setProducts([]);
        }
      } catch (err: any) {
        toast({
          id: "admindashboard-failed-to-load-items",
          title: 'Failed to load items',
          description: err?.response?.data?.error || err.message || 'Unable to fetch items',
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
        setProducts([]);
      } finally {
        setProductsLoading(false);
      }
    },
    [toast],
  );

  // Bulk product handlers
  const handleBulkDeleteProducts = useCallback(async () => {
    if (selectedProductIds.size === 0) return;
    
    const confirmed = window.confirm(`Delete ${selectedProductIds.size} item(s)? This cannot be undone.`);
    if (!confirmed) return;

    try {
      setIsSelectingProducts(true);
      let successCount = 0;
      let failCount = 0;

      for (const productId of selectedProductIds) {
        try {
          await api.delete(`/api/admin/products/${productId}`);
          successCount++;
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: `Deleted ${successCount} item${successCount !== 1 ? 's' : ''}`,
          status: 'success',
          duration: 3000,
        });
        setSelectedProductIds(new Set());
        fetchAdminProducts(productsPage);
      }
      
      if (failCount > 0) {
        toast({
          title: `Failed to delete ${failCount} item${failCount !== 1 ? 's' : ''}`,
          status: 'error',
          duration: 3000,
        });
      }
    } catch (err: any) {
      toast({
        title: 'Bulk delete failed',
        description: err.message,
        status: 'error',
        duration: 3000,
      });
    } finally {
      setIsSelectingProducts(false);
    }
  }, [selectedProductIds, toast, fetchAdminProducts, productsPage]);

  const handleBulkSuspendProducts = useCallback(async () => {
    if (selectedProductIds.size === 0) return;

    try {
      setIsSelectingProducts(true);
      let successCount = 0;

      for (const productId of selectedProductIds) {
        try {
          await api.put(`/api/admin/products/${productId}/suspend`);
          successCount++;
        } catch {
          // Continue with next item
        }
      }

      if (successCount > 0) {
        toast({
          title: `Suspended ${successCount} item${successCount !== 1 ? 's' : ''}`,
          status: 'success',
          duration: 3000,
        });
        setSelectedProductIds(new Set());
        fetchAdminProducts(productsPage);
      }
    } catch (err: any) {
      toast({
        title: 'Bulk suspend failed',
        description: err.message,
        status: 'error',
        duration: 3000,
      });
    } finally {
      setIsSelectingProducts(false);
    }
  }, [selectedProductIds, toast, fetchAdminProducts, productsPage]);

  const handleBulkUnsuspendProducts = useCallback(async () => {
    if (selectedProductIds.size === 0) return;

    try {
      setIsSelectingProducts(true);
      let successCount = 0;

      for (const productId of selectedProductIds) {
        try {
          await api.put(`/api/admin/products/${productId}/unsuspend`);
          successCount++;
        } catch {
          // Continue with next item
        }
      }

      if (successCount > 0) {
        toast({
          title: `Unsuspended ${successCount} item${successCount !== 1 ? 's' : ''}`,
          status: 'success',
          duration: 3000,
        });
        setSelectedProductIds(new Set());
        fetchAdminProducts(productsPage);
      }
    } catch (err: any) {
      toast({
        title: 'Bulk unsuspend failed',
        description: err.message,
        status: 'error',
        duration: 3000,
      });
    } finally {
      setIsSelectingProducts(false);
    }
  }, [selectedProductIds, toast, fetchAdminProducts, productsPage]);

  // â"€â"€ Fetch campaigns for admin list â"€â"€
  const fetchAdminCampaigns = useCallback(async () => {
    try {
      setCampaignsLoading(true);
      const response = await api.get('/api/admin/campaigns');
      if (response.data?.success) {
        setCampaigns(response.data.data || []);
      }
    } catch (err: any) {
      toast({
        id: "admindashboard-failed-to-load-campaigns",
        title: 'Failed to load campaigns',
        description: err?.response?.data?.error || err.message || 'Unable to fetch campaigns',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setCampaignsLoading(false);
    }
  }, [toast]);

  // â"€â"€ Save campaign (Create/Update) â"€â"€
  const handleSaveCampaign = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign?.title) {
      toast({
        id: "admindashboard-title-is-required", title: 'Title is required', status: 'warning', duration: 2000
      });
      return;
    }

    // Convert empty strings to null/undefined for optional dates to avoid parse errors
    const payload = { ...editingCampaign };
    if (payload.start_date === '') payload.start_date = undefined as any;
    if (payload.end_date === '') payload.end_date = undefined as any;

    // Convert string to date format expected by Go if they exist
    if (payload.start_date) {
      payload.start_date = new Date(payload.start_date).toISOString() as any;
    }
    if (payload.end_date) {
      payload.end_date = new Date(payload.end_date).toISOString() as any;
    }

    try {
      setCampaignFormLoading(true);
      if (editingCampaign.id) {
        // Update
        await api.put(`/api/admin/campaigns/${editingCampaign.id}`, payload);
        toast({
          id: "admindashboard-campaign-updated", title: 'Campaign updated', status: 'success', duration: 3000
        });
      } else {
        // Create
        await api.post('/api/admin/campaigns', Object.assign({
          target_users: 'all',
          frequency: 'once_per_user',
          is_active: true,
        }, payload));
        toast({
          id: "admindashboard-campaign-created", title: 'Campaign created', status: 'success', duration: 3000
        });
      }
      closeCampaignModal();
      setEditingCampaign(null);
      fetchAdminCampaigns();
    } catch (err: any) {
      toast({
        id: "admindashboard-save-failed",
        title: 'Save failed',
        description: err?.response?.data?.error || 'Could not save campaign',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setCampaignFormLoading(false);
    }
  }, [editingCampaign, toast, closeCampaignModal, fetchAdminCampaigns]);

  const askDeleteCampaign = useCallback((camp: Campaign) => {
    setDeleteTarget({ type: 'campaign', id: camp.id, name: camp.title });
    openDeleteDialog();
  }, [openDeleteDialog]);

  // â"€â"€ Toggle campaign active status â"€â"€
  const handleToggleCampaignStatus = useCallback(async (camp: Campaign) => {
    try {
      await api.put(`/api/admin/campaigns/${camp.id}`, { is_active: !camp.is_active });
      toast({
        id: "admindashboard-campaign-camp-is-active", title: `Campaign ${!camp.is_active ? 'activated' : 'deactivated'}`, status: 'success', duration: 2000
      });
      fetchAdminCampaigns();
    } catch (err: any) {
      toast({
        id: "admindashboard-status-update-failed", title: 'Status update failed', status: 'error', duration: 3000
      });
    }
  }, [toast, fetchAdminCampaigns]);



  // Debounced search handler
  const handleRiderSearch = useCallback((searchValue: string) => {
    setRiderSearchInput(searchValue);
    
    // Clear previous timeout
    if (riderSearchDebounceRef.current) {
      clearTimeout(riderSearchDebounceRef.current);
    }
    
    // Set new timeout for debounced search
    riderSearchDebounceRef.current = setTimeout(() => {
      setRiderSearchQuery(searchValue);
    }, 500);
  }, []);

  // ── Fetch rider applications ──
  const fetchRiderApplications = useCallback(async (silent = false) => {
    try {
      if (!silent) setRiderAppsLoading(true);
      const params = new URLSearchParams();
      if (riderStatusFilter) params.set('status', riderStatusFilter);
      if (riderSearchQuery) params.set('search', riderSearchQuery);
      const response = await api.get(`/api/admin/rider-applications?${params}`);
      if (response.data?.success && Array.isArray(response.data.data)) {
        setRiderApplications(response.data.data);
      } else {
        setRiderApplications([]);
      }
    } catch {
      setRiderApplications([]);
    } finally {
      setRiderAppsLoading(false);
    }
  }, [riderStatusFilter, riderSearchQuery]);

  const handleApproveRider = useCallback(async (riderId: number) => {
    try {
      await api.post(`/api/admin/rider-applications/${riderId}/approve`);
      setRiderApplications(prev => prev.map(r => r.id === riderId ? { ...r, status: 'approved' } : r));
      toast({ title: 'Rider approved', status: 'success', duration: 3000 });
    } catch (err: any) {
      toast({ title: 'Failed to approve', description: err?.response?.data?.error || 'Error', status: 'error', duration: 3000 });
    }
  }, [fetchRiderApplications, toast]);

  const handleMarkRiderUnderReview = useCallback(async (riderId: number) => {
    try {
      await api.post(`/api/admin/rider-applications/${riderId}/review`);
      setRiderApplications(prev => prev.map(r => r.id === riderId ? { ...r, status: 'under_review' } : r));
      toast({ title: 'Marked as under review', status: 'info', duration: 3000 });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.response?.data?.error || 'Error', status: 'error', duration: 3000 });
    }
  }, [fetchRiderApplications, toast]);

  const handleConfirmRejectRider = useCallback(async () => {
    if (!rejectRiderTarget || !rejectRiderReason.trim()) return;
    setRejectRiderLoading(true);
    try {
      await api.post(`/api/admin/rider-applications/${rejectRiderTarget.id}/reject`, { reason: rejectRiderReason.trim() });
      setRiderApplications(prev => prev.map(r => r.id === rejectRiderTarget.id ? { ...r, status: 'rejected', rejection_reason: rejectRiderReason.trim() } : r));
      toast({ title: 'Rider application rejected', status: 'info', duration: 3000 });
      setRejectRiderTarget(null);
      setRejectRiderReason('');
    } catch (err: any) {
      toast({ title: 'Failed to reject', description: err?.response?.data?.error || 'Error', status: 'error', duration: 3000 });
    } finally {
      setRejectRiderLoading(false);
    }
  }, [rejectRiderTarget, rejectRiderReason, fetchRiderApplications, toast]);



  // â"€â"€ Open Strike History â"€â"€
  const openStrikeHistory = useCallback(async (user: User) => {
    setStrikeHistoryUser(user);
    setStrikeHistoryLoading(true);
    setStrikeHistoryData([]);
    try {
      const response = await api.get(`/api/admin/users/${user.id}/strikes`);
      if (response.data?.success) {
        setStrikeHistoryData(Array.isArray(response.data.data) ? response.data.data : []);
      }
    } catch (err: any) {
      toast({ title: 'Failed to load strike history', status: 'error' });
    } finally {
      setStrikeHistoryLoading(false);
    }
  }, [toast]);

  // â"€â"€ Delete handlers â"€â"€
  const askDeleteProduct = useCallback((product: Product) => {
    setDeleteTarget({
      type: 'product',
      id: product.id,
      name: product.title || `Item #${product.id}`,
    });
    openDeleteDialog();
  }, [openDeleteDialog]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      if (deleteTarget.type === 'user') {
        await api.delete(`/api/admin/users/${deleteTarget.id}`);
        setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
        toast({
          id: "admindashboard-user-deleted",
          title: 'User deleted',
          description: 'The user and related data have been removed.',
          status: 'success',
          duration: 4000,
          isClosable: true,
        });
      } else if (deleteTarget.type === 'product') {
        await api.delete(`/api/admin/products/${deleteTarget.id}`);
        setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
        toast({
          id: "admindashboard-item-deleted",
          title: 'Item deleted',
          description: 'The item has been removed from the marketplace.',
          status: 'success',
          duration: 4000,
          isClosable: true,
        });
      } else if (deleteTarget.type === 'campaign') {
        await api.delete(`/api/admin/campaigns/${deleteTarget.id}`);
        setCampaigns(prev => prev.filter(c => c.id !== deleteTarget.id));
        toast({
          id: "admindashboard-campaign-deleted",
          title: 'Campaign deleted',
          status: 'success',
          duration: 3000,
        });
      }
    } catch (err: any) {
      toast({
        id: "admindashboard-deletion-failed",
        title: 'Deletion failed',
        description: err?.response?.data?.error || err.message || 'Unable to delete record',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setDeleteLoading(false);
      closeDeleteDialog();
      setDeleteTarget(null);
    }
  }, [deleteTarget, toast, closeDeleteDialog]);

  useEffect(() => {
    // Warm-start from cache (instant render), then refresh stats in background.
    try {
      const raw = sessionStorage.getItem(ADMIN_STATS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { ts?: number; data?: AdminStats };
        if (parsed?.data && typeof parsed.ts === 'number' && Date.now() - parsed.ts < ADMIN_STATS_CACHE_TTL_MS) {
          setStats(parsed.data);
          setIsUsingMockData(false);
          setError(null);
          setLoading(false);
          fetchAdminStats({ background: true });
        } else {
          fetchAdminStats();
        }
      } else {
        fetchAdminStats();
      }
    } catch {
      fetchAdminStats();
    }

    // Connection check doesn't need to be in the mount effect but we'll keep it there for simplicity
    checkConnection();
    const connectionInterval = setInterval(checkConnection, 30000);
    return () => clearInterval(connectionInterval);
    // Empty dependency array prevents re-runs when filter functions change
  }, []);

  // Once core stats are available, load secondary admin data (lists/queues) in the background.
  useEffect(() => {
    if (!stats || didKickoffSecondaryFetchesRef.current) return;
    didKickoffSecondaryFetchesRef.current = true;
    Promise.allSettled([
      fetchAdminUsers(1),
      fetchAdminProducts(1),
      fetchAdminReports(1),
      fetchAdminCampaigns(),
      fetchRiderApplications(),
      fetchRiderConfig(),
      fetchRemittancePayments(),
      fetchMultiwayDisputes(),
    ]);
  }, [
    stats,
    fetchAdminUsers,
    fetchAdminProducts,
    fetchAdminReports,
    fetchAdminCampaigns,
    fetchRiderApplications,
    fetchRiderConfig,
    fetchRemittancePayments,
    fetchMultiwayDisputes,
  ]);

  // Separate effect for rider filter changes - doesn't trigger full dashboard refresh
  useEffect(() => {
    fetchRiderApplications();
  }, [riderStatusFilter, riderSearchQuery, fetchRiderApplications]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (riderSearchDebounceRef.current) {
        clearTimeout(riderSearchDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchDailyStats(calYear, calMonth);
  }, [calYear, calMonth, fetchDailyStats]);

  // â"€â"€ Loading / Error / No-data states â"€â"€


  // â"€â"€ Sidebar / SPA state â"€â"€

  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const { isOpen: isSidebarOpen, onOpen: openSidebar, onClose: closeSidebar } = useDisclosure();

  // â"€â"€ Report action moderation state â"€â"€
  const [moderationTarget, setModerationTarget] = useState<{ report: any; action: string } | null>(null);
  const [moderationLoading, setModerationLoading] = useState(false);
  const cancelModerationRef = useRef<HTMLButtonElement | null>(null);

  const handleModerationAction = useCallback(async () => {
    if (!moderationTarget) return;
    const { report, action } = moderationTarget;
    const statusMap: Record<string, string> = {
      'Warn User': 'reviewed',
      'Delete Listing': 'resolved',
      'Suspend Account': 'resolved',
      'Mark Resolved': 'resolved',
      'Dismiss': 'dismissed',
    };
    const newStatus = statusMap[action] || 'reviewed';
    try {
      setModerationLoading(true);
      await api.put(`/api/admin/reports/${report.id}/status`, { status: newStatus });
      toast({
        id: "admindashboard-action-applied-action",
        title: `Action applied: ${action}`,
        description: `Report #${report.id} has been updated.`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      fetchAdminReports(reportsPage, reportsStatusFilter);
    } catch (err: any) {
      toast({
        id: "admindashboard-action-failed-2", title: 'Action failed', description: err?.response?.data?.error || 'Could not apply action', status: 'error', duration: 3000, isClosable: true
      });
    } finally {
      setModerationLoading(false);
      setModerationTarget(null);
    }
  }, [moderationTarget, fetchAdminReports, reportsPage, reportsStatusFilter, toast]);



  if (loading) {
    return (
      <Container maxW="container.xl" py={8}>
        <VStack spacing={6} minH="400px" justify="center">
          <Spinner size="xl" color="blue.500" />
          <Text fontSize="lg" color="gray.600">Loading admin dashboard...</Text>
          <Progress size="sm" isIndeterminate colorScheme="blue" w="200px" />
          <Text fontSize="sm" color="gray.500">This may take a few moments</Text>
        </VStack>
      </Container>
    );
  }

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
            <Button leftIcon={<FiRefreshCw />} onClick={handleRetry} colorScheme="blue" size="lg">
              Retry ({retryCount + 1}/3)
            </Button>
            <Button leftIcon={<FiServer />} onClick={() => fetchAdminStats(true)} variant="outline" size="lg">
              Use Demo Data
            </Button>
          </VStack>
        </VStack>
      </Container>
    );
  }

  if (!stats) {
    return (
      <Container maxW="container.xl" py={8}>
        <Alert status="warning" borderRadius="lg">
          <AlertIcon />
          <Box>
            <AlertTitle>No data available</AlertTitle>
            <AlertDescription>Unable to load dashboard statistics. Please try refreshing the page.</AlertDescription>
          </Box>
        </Alert>
      </Container>
    );
  }
  // â"€â"€ Main render â"€â"€


  // â"€â"€ Sidebar nav item component â"€â"€
  const SidebarNavItem = ({ item }: { item: typeof sidebarNav[0] }) => {
    const isActive = activeSection === item.id;
    return (
      <Box
        as="button"
        w="full"
        textAlign="left"
        px={4}
        py={3}
        borderRadius="lg"
        bg={isActive ? 'brand.50' : 'transparent'}
        borderLeft="4px solid"
        borderColor={isActive ? 'brand.500' : 'transparent'}
        color={isActive ? 'brand.700' : mutedTextColor}
        _hover={{ bg: isActive ? 'brand.50' : hoverBg, color: isActive ? 'brand.700' : textColor }}
        transition="all 0.2s"
        onClick={() => { setActiveSection(item.id); closeSidebar(); }}
      >
        <HStack spacing={3}>
          <Icon as={item.icon} boxSize={5} />
          <VStack spacing={0} align="start" flex={1}>
            <HStack spacing={2}>
              <Text fontWeight={isActive ? '700' : '500'} fontSize="sm">{item.label}</Text>
              {item.badge ? (
                <Badge colorScheme="red" borderRadius="full" px={2} fontSize="xs">{item.badge}</Badge>
              ) : null}
            </HStack>
            <Text fontSize="xs" color={isActive ? 'brand.500' : 'gray.400'}>{item.description}</Text>
          </VStack>
        </HStack>
      </Box>
    );
  };

  // â"€â"€ Sidebar content â"€â"€
  const SidebarContent = () => (
    <VStack spacing={1} align="stretch" p={4} ml={20} h="full">
      <Box px={4} pb={4} borderBottom="1px solid" borderColor={borderColor} mb={2}>
        <HStack spacing={2}>
          <Box w={8} h={8} bg="brand.500" borderRadius="lg" display="flex" alignItems="center" justifyContent="center">
            <Icon as={FiShield} color="white" boxSize={4} />
          </Box>
          <VStack spacing={0} align="start">
            <Text fontWeight="800" fontSize="sm" color={textColor}>Clovia Admin</Text>
            <Text fontSize="xs" color={mutedTextColor}>Control Panel</Text>
          </VStack>
        </HStack>
      </Box>
      {sidebarNav.map(item => <SidebarNavItem key={item.id} item={item} />)}
    </VStack>
  );

  // â"€â"€ Metric card with hover lift â"€â"€
  const MetricCard = ({ icon, color, label, value, raw }: { icon: any; color: string; label: string; value: any; raw?: boolean }) => (
    <Card
      bg={cardBg}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="xl"
      transition="all 0.2s ease"
      _hover={{ transform: 'translateY(-3px)', boxShadow: 'lg', borderColor: `${color}.200` }}
      cursor="default"
    >
      <CardBody>
        <Flex align="center" mb={3}>
          <Box w={9} h={9} bg={`${color}.50`} borderRadius="lg" display="flex" alignItems="center" justifyContent="center" mr={3}>
            <Icon as={icon} color={`${color}.500`} boxSize={5} />
          </Box>
          <Text fontSize="sm" color={mutedTextColor} fontWeight="500">{label}</Text>
        </Flex>
        <Text fontWeight="800" fontSize="2xl" color={textColor}>{raw ? value : (value as number)?.toLocaleString() ?? 0}</Text>
      </CardBody>
    </Card>
  );

  // â"€â"€ Chart Skeleton â"€â"€
  const ChartSkeleton = () => (
    <Box h="300px" p={4}>
      <Skeleton height="20px" width="200px" mb={6} />
      <VStack spacing={3} align="stretch">
        {[80, 55, 70, 45, 90, 60].map((w, i) => (
          <HStack key={i} spacing={3} align="center">
            <Skeleton height="28px" width={`${w}%`} borderRadius="md" />
          </HStack>
        ))}
      </VStack>
    </Box>
  );

  // â"€â"€ SECTION: Overview â"€â"€
  const OverviewSection = () => (
    <VStack spacing={8} pr={20} align="stretch">
      {/* Data explorer (fetch products / trades / categories) */}
      <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl">
        <CardHeader pb={2}>
          <HStack>
            <Icon as={FiGrid} color="brand.500" />
            <Heading size="sm" color={textColor}>Data Explorer</Heading>
          </HStack>
        </CardHeader>
        <CardBody pt={2}>
          <Flex gap={3} wrap="wrap" align="center" justify="space-between">
            <HStack spacing={3} wrap="wrap">
              <HStack spacing={2}>
                <Icon as={FiCalendar} color={mutedTextColor} />
                <Tooltip
                  hasArrow
                  placement="top"
                  label={
                    overviewRevenueLoading
                      ? 'Revenue: loading...'
                      : overviewRevenue === null
                        ? 'Select start and end dates to view revenue'
                        : `Revenue: ${formatCurrency(overviewRevenue || 0)}`
                  }
                >
                  <HStack spacing={2}>
                    <Input
                      type="date"
                      size="sm"
                      value={overviewStartDate}
                      onChange={(e) => setOverviewStartDate(e.target.value)}
                      w={{ base: 'full', sm: '170px' }}
                    />
                    <Text fontSize="sm" color={mutedTextColor} fontWeight="600">to</Text>
                    <Input
                      type="date"
                      size="sm"
                      value={overviewEndDate}
                      onChange={(e) => setOverviewEndDate(e.target.value)}
                      w={{ base: 'full', sm: '170px' }}
                    />
                  </HStack>
                </Tooltip>
              </HStack>

              <HStack spacing={4} wrap="wrap">
                <Text fontSize="sm" color={mutedTextColor} fontWeight="600">Options:</Text>
                <Checkbox isChecked={overviewDims.products} onChange={(e) => setOverviewDims(prev => ({ ...prev, products: e.target.checked }))}>
                  Products
                </Checkbox>
                <Checkbox isChecked={overviewDims.trades} onChange={(e) => setOverviewDims(prev => ({ ...prev, trades: e.target.checked }))}>
                  Trades
                </Checkbox>
                <Checkbox isChecked={overviewDims.categories} onChange={(e) => setOverviewDims(prev => ({ ...prev, categories: e.target.checked }))}>
                  Categories
                </Checkbox>
              </HStack>
            </HStack>

            <HStack spacing={2}>
              <Button
                size="sm"
                leftIcon={<FiPrinter />}
                colorScheme="brand"
                variant="outline"
                onClick={handleExportRevenue}
                isLoading={exportLoading}
                loadingText="Preparing…"
              >
                Export
              </Button>
            </HStack>
          </Flex>

          {overviewDataLoading ? (
            <Center py={8}><Spinner color="brand.500" /></Center>
          ) : (
            <VStack align="stretch" spacing={6} mt={4}>
              {overviewDims.products && (
                <Box>
                  <HStack mb={2} justify="space-between">
                    <Text fontWeight="700" fontSize="sm" color={textColor}>Products</Text>
                    <Text fontSize="xs" color={mutedTextColor}>
                      {overviewProductsTotal ? `${overviewProductsTotal.toLocaleString()} total` : `${overviewProductsData.length} rows`} 
                      {overviewProductsTotalPages > 1 ? ` • Page ${overviewProductsPage}/${overviewProductsTotalPages}` : ''}
                    </Text>
                  </HStack>
                  {overviewProductsData.length === 0 ? (
                    <Text fontSize="sm" color={mutedTextColor}>No products found for the selected range.</Text>
                  ) : (
                    <Box overflowX="auto" w="full">
                      <ChakraTable variant="simple" size="sm" style={{ tableLayout: 'fixed', width: '100%', minWidth: '680px' }}>
                        <Thead bg={headerBg}>
                          <Tr>
                            <Th w="64px" px={2} color={mutedTextColor}>#</Th>
                            <Th px={2} color={mutedTextColor}>Title</Th>
                            <Th w="110px" px={2} color={mutedTextColor}>Status</Th>
                            <Th w="180px" px={2} color={mutedTextColor}>Seller</Th>
                            <Th w="120px" px={2} color={mutedTextColor}>Created</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {overviewProductsData.map((p) => (
                            <Tr key={p.id} _hover={{ bg: hoverBg }}>
                              <Td px={2} fontSize="xs" color={mutedTextColor} fontWeight="700">#{p.id}</Td>
                              <Td px={2}>
                                <Text fontSize="sm" fontWeight="600" noOfLines={1}>{p.title}</Text>
                              </Td>
                              <Td px={2}>
                                <Badge borderRadius="full" px={2} fontSize="2xs" textTransform="capitalize" colorScheme={p.status === 'available' ? 'green' : p.status === 'locked' ? 'orange' : 'gray'}>
                                  {p.status}
                                </Badge>
                              </Td>
                              <Td px={2}>
                                <Text fontSize="sm" noOfLines={1}>{p.seller_name || `User #${p.seller_id}`}</Text>
                              </Td>
                              <Td px={2} fontSize="sm" color={mutedTextColor}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'}</Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </ChakraTable>
                    </Box>
                  )}

                  {overviewProductsTotalPages > 1 && (
                    <Flex mt={3} justify="flex-end">
                      <HStack spacing={2}>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => fetchOverviewProductsPage(Math.max(1, overviewProductsPage - 1))}
                          isDisabled={overviewDataLoading || overviewProductsPage <= 1}
                        >
                          Prev
                        </Button>
                        <Text fontSize="xs" color={mutedTextColor}>
                          Page {overviewProductsPage} of {overviewProductsTotalPages}
                        </Text>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => fetchOverviewProductsPage(Math.min(overviewProductsTotalPages, overviewProductsPage + 1))}
                          isDisabled={overviewDataLoading || overviewProductsPage >= overviewProductsTotalPages}
                        >
                          Next
                        </Button>
                      </HStack>
                    </Flex>
                  )}
                </Box>
              )}

              {overviewDims.trades && (
                <Box>
                  <HStack mb={2} justify="space-between">
                    <Text fontWeight="700" fontSize="sm" color={textColor}>Trades</Text>
                    <Text fontSize="xs" color={mutedTextColor}>
                      {overviewTradesTotal ? `${overviewTradesTotal.toLocaleString()} total` : `${overviewTradesData.length} rows`}
                      {overviewTradesTotalPages > 1 ? ` • Page ${overviewTradesPage}/${overviewTradesTotalPages}` : ''}
                    </Text>
                  </HStack>
                  {overviewTradesData.length === 0 ? (
                    <Text fontSize="sm" color={mutedTextColor}>No trades found for the selected range.</Text>
                  ) : (
                    <Box overflowX="auto" w="full">
                      <ChakraTable variant="simple" size="sm" style={{ tableLayout: 'fixed', width: '100%', minWidth: '760px' }}>
                        <Thead bg={headerBg}>
                          <Tr>
                            <Th w="64px" px={2} color={mutedTextColor}>#</Th>
                            <Th w="120px" px={2} color={mutedTextColor}>Status</Th>
                            <Th w="110px" px={2} color={mutedTextColor}>Option</Th>
                            <Th px={2} color={mutedTextColor}>Product</Th>
                            <Th w="180px" px={2} color={mutedTextColor}>Buyer</Th>
                            <Th w="180px" px={2} color={mutedTextColor}>Seller</Th>
                            <Th w="120px" px={2} color={mutedTextColor}>Created</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {overviewTradesData.map((t) => (
                            <Tr key={t.id} _hover={{ bg: hoverBg }}>
                              <Td px={2} fontSize="xs" color={mutedTextColor} fontWeight="700">#{t.id}</Td>
                              <Td px={2}>
                                <Badge borderRadius="full" px={2} fontSize="2xs" textTransform="capitalize" colorScheme={t.status === 'completed' ? 'green' : t.status === 'active' ? 'blue' : t.status === 'pending' ? 'orange' : 'gray'}>
                                  {t.status}
                                </Badge>
                              </Td>
                              <Td px={2}>
                                <Badge borderRadius="full" px={2} fontSize="2xs" textTransform="capitalize" colorScheme={t.trade_option === 'delivery' ? 'purple' : 'teal'}>
                                  {t.trade_option || 'meetup'}
                                </Badge>
                              </Td>
                              <Td px={2}>
                                <Text fontSize="sm" noOfLines={1}>{t.product_title || `Product #${t.target_product_id}`}</Text>
                              </Td>
                              <Td px={2}><Text fontSize="sm" noOfLines={1}>{t.buyer_name || `User #${t.buyer_id}`}</Text></Td>
                              <Td px={2}><Text fontSize="sm" noOfLines={1}>{t.seller_name || `User #${t.seller_id}`}</Text></Td>
                              <Td px={2} fontSize="sm" color={mutedTextColor}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : '-'}</Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </ChakraTable>
                    </Box>
                  )}

                  {overviewTradesTotalPages > 1 && (
                    <Flex mt={3} justify="flex-end">
                      <HStack spacing={2}>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => fetchOverviewTradesPage(Math.max(1, overviewTradesPage - 1))}
                          isDisabled={overviewDataLoading || overviewTradesPage <= 1}
                        >
                          Prev
                        </Button>
                        <Text fontSize="xs" color={mutedTextColor}>
                          Page {overviewTradesPage} of {overviewTradesTotalPages}
                        </Text>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => fetchOverviewTradesPage(Math.min(overviewTradesTotalPages, overviewTradesPage + 1))}
                          isDisabled={overviewDataLoading || overviewTradesPage >= overviewTradesTotalPages}
                        >
                          Next
                        </Button>
                      </HStack>
                    </Flex>
                  )}
                </Box>
              )}

              {overviewDims.categories && (
                <Box>
                  <HStack mb={2} justify="space-between">
                    <Text fontWeight="700" fontSize="sm" color={textColor}>Categories</Text>
                    <Text fontSize="xs" color={mutedTextColor}>{overviewCategoriesData.length} rows</Text>
                  </HStack>
                  {overviewCategoriesData.length === 0 ? (
                    <Text fontSize="sm" color={mutedTextColor}>No categories found for the selected range.</Text>
                  ) : (
                    <Box overflowX="auto" w="full">
                      <ChakraTable variant="simple" size="sm" style={{ tableLayout: 'fixed', width: '100%', minWidth: '640px' }}>
                        <Thead bg={headerBg}>
                          <Tr>
                            <Th px={2} color={mutedTextColor}>Category</Th>
                            <Th w="90px" px={2} color={mutedTextColor} isNumeric>Total</Th>
                            <Th w="110px" px={2} color={mutedTextColor} isNumeric>Available</Th>
                            <Th w="95px" px={2} color={mutedTextColor} isNumeric>Premium</Th>
                            <Th w="130px" px={2} color={mutedTextColor}>Last</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {overviewCategoriesData.map((r) => (
                            <Tr key={r.category} _hover={{ bg: hoverBg }}>
                              <Td px={2}><Text fontSize="sm" fontWeight="600" noOfLines={1}>{r.category}</Text></Td>
                              <Td px={2} isNumeric fontSize="sm">{(r.total || 0).toLocaleString()}</Td>
                              <Td px={2} isNumeric fontSize="sm">{(r.available || 0).toLocaleString()}</Td>
                              <Td px={2} isNumeric fontSize="sm">{(r.premium || 0).toLocaleString()}</Td>
                              <Td px={2} fontSize="sm" color={mutedTextColor}>{r.last_created_at ? new Date(r.last_created_at).toLocaleDateString() : '-'}</Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </ChakraTable>
                    </Box>
                  )}
                </Box>
              )}
            </VStack>
          )}
        </CardBody>
      </Card>

      {/* User metrics group */}
      <Box>
        <HStack mb={4} spacing={2}>
          <Icon as={FiUsers} color="brand.500" />
          <Text fontWeight="700" color={textColor} fontSize="sm" textTransform="uppercase" letterSpacing="wide">Users</Text>
        </HStack>
        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>
          <MetricCard icon={FiUsers} color="indigo" label="Total Users" value={stats!.total_users} />
          <MetricCard icon={FiStar} color="violet" label="Premium Users" value={stats!.premium_users} />
          <MetricCard icon={FiUsers} color="orange" label="New Today" value={stats!.new_users_today} />
          <MetricCard icon={FiBarChart2} color="brand" label="Activity" value={stats!.recent_activity?.length ?? 0} />
        </SimpleGrid>
      </Box>

      {/* Marketplace metrics group */}
      <Box>
        <HStack mb={4} spacing={2}>
          <Icon as={FiShoppingBag} color="brand.500" />
          <Text fontWeight="700" color={textColor} fontSize="sm" textTransform="uppercase" letterSpacing="wide">Marketplace</Text>
        </HStack>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          <MetricCard icon={FiShoppingBag} color="emerald" label="Active Listings" value={stats!.active_listings} />
          <MetricCard icon={FiShoppingCart} color="cyan" label="Total Trades" value={stats!.total_trades} />
          <MetricCard icon={FiPackage} color="pink" label="New Listings Today" value={stats!.new_listings_today} />
        </SimpleGrid>
      </Box>

      {/* Financials group */}
      <Box>
        <HStack mb={4} spacing={2}>
          <Icon as={FiDollarSign} color="brand.500" />
          <Text fontWeight="700" color={textColor} fontSize="sm" textTransform="uppercase" letterSpacing="wide">Financials</Text>
        </HStack>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <MetricCard icon={FiDollarSign} color="green" label="Total Income" value={formatCurrency(stats!.total_income || 0)} raw />
          <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" _hover={{ transform: 'translateY(-3px)', boxShadow: 'lg' }} transition="all 0.2s ease">
            <CardBody>
              <HStack mb={3}>
                <Box w={9} h={9} bg="blue.50" borderRadius="lg" display="flex" alignItems="center" justifyContent="center" mr={1}>
                  <Icon as={FiDollarSign} color="blue.500" boxSize={5} />
                </Box>
                <Text fontSize="sm" color={mutedTextColor} fontWeight="500">Revenue by Source</Text>
              </HStack>
              <VStack spacing={2} align="stretch">
                {stats?.revenue_by_source && Object.entries(stats.revenue_by_source).map(([source, amount], i) => (
                  <HStack key={i} justify="space-between">
                    <Text fontSize="xs" color="#64748b" textTransform="capitalize">
                      {source.replace('_', ' ')}
                    </Text>
                    <Text fontSize="xs" fontWeight="700" color="blue.600">{formatCurrency(amount)}</Text>
                  </HStack>
                ))}
                {(!stats?.revenue_by_source || Object.keys(stats.revenue_by_source).length === 0) && (
                  <Text fontSize="xs" color="gray.400" fontStyle="italic">No data available</Text>
                )}
              </VStack>
            </CardBody>
          </Card>
        </SimpleGrid>
      </Box>

      {/* Charts */}
      <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={6}>
        <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl">
          <CardHeader pb={2}>
            <HStack>
              <Icon as={FiBarChart2} color="brand.500" />
              <Heading size="sm" color={textColor}>Revenue Trends (Last 4 Weeks)</Heading>
            </HStack>
          </CardHeader>
          <CardBody>
            {loading ? <ChartSkeleton /> : stats!.revenue_breakdown && stats!.revenue_breakdown.length > 0 ? (
              <Box h="300px">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[...stats!.revenue_breakdown].reverse()} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="period" stroke="#94a3b8" style={{ fontSize: '11px' }} />
                    <YAxis stroke="#94a3b8" style={{ fontSize: '11px' }} tickFormatter={v => `â‚±${(v / 1000).toFixed(0)}k`} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }} formatter={(value: number) => [formatCurrency(value), 'Revenue']} />
                    <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            ) : <ChartSkeleton />}
          </CardBody>
        </Card>

        <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl">
          <CardHeader pb={2}>
            <HStack>
              <Icon as={FiUsers} color="indigo.500" />
              <Heading size="sm" color={textColor}>User Metrics</Heading>
            </HStack>
          </CardHeader>
          <CardBody>
            {loading ? <ChartSkeleton /> : (
              <Box>
                <Flex justify="center" mb={4}>
                  <Box textAlign="center" px={4} py={2} bg="indigo.50" borderRadius="lg">
                    <Text fontSize="xs" color="gray.500" fontWeight="600" textTransform="uppercase">Total Users</Text>
                    <Text fontSize="2xl" fontWeight="700" color="indigo.600">{(stats!.total_users || 0).toLocaleString()}</Text>
                  </Box>
                </Flex>
                <Box h="260px">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Premium', value: stats!.premium_users || 0 },
                      { name: 'Verified', value: stats!.verified_users || 0 },
                      { name: 'Non-Verified', value: (stats!.total_users || 0) - (stats!.verified_users || 0) },
                    ]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" style={{ fontSize: '11px' }} />
                      <YAxis stroke="#94a3b8" style={{ fontSize: '11px' }} />
                      <RechartsTooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }} />
                      <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            )}
          </CardBody>
        </Card>
      </Grid>

      {/* Recent Activity */}
      <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl">
        <CardHeader pb={2}>
          <HStack>
            <Icon as={FiAlertCircle} color="orange.500" />
            <Heading size="sm" color={textColor}>Recent Activity (Last 24h)</Heading>
          </HStack>
        </CardHeader>
        <CardBody>
          {stats!.recent_activity && stats!.recent_activity.length > 0 ? (
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3}>
              {stats!.recent_activity.map((a, i) => (
                <HStack key={i} p={3} bg={hoverBg} borderRadius="lg" justify="space-between">
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="600" fontSize="sm">{a.action}</Text>
                    <Text fontSize="xs" color={mutedTextColor}>{new Date(a.latest).toLocaleTimeString()}</Text>
                  </VStack>
                  <Badge colorScheme="indigo" borderRadius="full" px={3}>{a.count}</Badge>
                </HStack>
              ))}
            </SimpleGrid>
          ) : (
            <Text color="gray.400" fontSize="sm">No recent activity</Text>
          )}
        </CardBody>
      </Card>
    </VStack>
  );

  // â"€â"€ SECTION: Moderation Queue â"€â"€
  const ModerationSection = () => {
    const pendingCount = reports.filter((r: any) => r.status === 'pending').length;
    const reviewedCount = reports.filter((r: any) => r.status === 'reviewed').length;
    const resolvedCount = reports.filter((r: any) => r.status === 'resolved').length;
    const dismissedCount = reports.filter((r: any) => r.status === 'dismissed').length;
    // By reason counts
    const scamCount = reports.filter((r: any) => r.reason === 'scam').length;
    const spamCount = reports.filter((r: any) => r.reason === 'spam').length;
    const counterfeitCount = reports.filter((r: any) => r.reason === 'counterfeit').length;
    const inappropriateCount = reports.filter((r: any) => r.reason === 'inappropriate').length;
    const [expandedReportId, setExpandedReportId] = React.useState<number | null>(null);
    const toggleExpand = (id: number) => setExpandedReportId(prev => prev === id ? null : id);
    return (
      <VStack spacing={8} pr={20} align="stretch">
        {/* Report Summary Cards */}
        <Box maxW="5xl">
          <HStack mb={3} spacing={2}>
            <Icon as={FiAlertTriangle} color="#f43f5e" />
            <Text fontWeight="700" color={textColor} fontSize="sm" textTransform="uppercase" letterSpacing="wide">Reports Overview</Text>
          </HStack>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
            <Card bg={pendingCount > 0 ? 'red.50' : cardBg} border="1px solid" borderColor={pendingCount > 0 ? 'red.200' : borderColor} borderRadius="xl" _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }} transition="all 0.2s">
              <CardBody py={4}>
                <HStack mb={1}><Icon as={FiAlertCircle} color="red.400" boxSize={4} /><Text fontSize="xs" color={mutedTextColor} fontWeight="500">Pending</Text></HStack>
                <Text fontWeight="800" fontSize="2xl" color="red.500">{pendingCount}</Text>
                <Text fontSize="xs" color={mutedTextColor}>Need action</Text>
              </CardBody>
            </Card>
            <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }} transition="all 0.2s">
              <CardBody py={4}>
                <HStack mb={1}><Icon as={FiEye} color="blue.400" boxSize={4} /><Text fontSize="xs" color={mutedTextColor} fontWeight="500">Reviewed</Text></HStack>
                <Text fontWeight="800" fontSize="2xl" color="blue.500">{reviewedCount}</Text>
                <Text fontSize="xs" color={mutedTextColor}>Under review</Text>
              </CardBody>
            </Card>
            <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }} transition="all 0.2s">
              <CardBody py={4}>
                <HStack mb={1}><Icon as={FiCheckCircle} color="green.400" boxSize={4} /><Text fontSize="xs" color={mutedTextColor} fontWeight="500">Resolved</Text></HStack>
                <Text fontWeight="800" fontSize="2xl" color="green.500">{resolvedCount}</Text>
                <Text fontSize="xs" color={mutedTextColor}>Closed</Text>
              </CardBody>
            </Card>
            <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }} transition="all 0.2s">
              <CardBody py={4}>
                <HStack mb={1}><Icon as={FiXCircle} color="gray.400" boxSize={4} /><Text fontSize="xs" color={mutedTextColor} fontWeight="500">Dismissed</Text></HStack>
                <Text fontWeight="800" fontSize="2xl" color="gray.500">{dismissedCount}</Text>
                <Text fontSize="xs" color={mutedTextColor}>No action</Text>
              </CardBody>
            </Card>
          </SimpleGrid>
        </Box>

        {/* Report Type Breakdown Cards */}
        <Box maxW="5xl">
          <HStack mb={3} spacing={2}>
            <Icon as={FiAlertCircle} color="orange.500" />
            <Text fontWeight="700" color={textColor} fontSize="sm" textTransform="uppercase" letterSpacing="wide">Reports by Reason</Text>
          </HStack>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
            <Card bg="red.50" border="1px solid" borderColor="red.200" borderRadius="xl" _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }} transition="all 0.2s" cursor="pointer" onClick={() => { setReportsStatusFilter(''); fetchAdminReports(1, ''); }}>
              <CardBody py={4}>
                <HStack mb={1}><Text fontSize="lg">🚨</Text><Text fontSize="xs" color={mutedTextColor} fontWeight="500">Scam</Text></HStack>
                <Text fontWeight="800" fontSize="2xl" color="red.600">{scamCount}</Text>
                <Text fontSize="xs" color={mutedTextColor}>Fraud / scam reports</Text>
              </CardBody>
            </Card>
            <Card bg="yellow.50" border="1px solid" borderColor="yellow.200" borderRadius="xl" _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }} transition="all 0.2s">
              <CardBody py={4}>
                <HStack mb={1}><Text fontSize="lg">📢</Text><Text fontSize="xs" color={mutedTextColor} fontWeight="500">Spam</Text></HStack>
                <Text fontWeight="800" fontSize="2xl" color="yellow.600">{spamCount}</Text>
                <Text fontSize="xs" color={mutedTextColor}>Spam / repeated posts</Text>
              </CardBody>
            </Card>
            <Card bg="orange.50" border="1px solid" borderColor="orange.200" borderRadius="xl" _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }} transition="all 0.2s">
              <CardBody py={4}>
                <HStack mb={1}><Text fontSize="lg">🎭</Text><Text fontSize="xs" color={mutedTextColor} fontWeight="500">Counterfeit</Text></HStack>
                <Text fontWeight="800" fontSize="2xl" color="orange.600">{counterfeitCount}</Text>
                <Text fontSize="xs" color={mutedTextColor}>Fake / counterfeit items</Text>
              </CardBody>
            </Card>
            <Card bg="purple.50" border="1px solid" borderColor="purple.200" borderRadius="xl" _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }} transition="all 0.2s">
              <CardBody py={4}>
                <HStack mb={1}><Text fontSize="lg">⚠️</Text><Text fontSize="xs" color={mutedTextColor} fontWeight="500">Inappropriate</Text></HStack>
                <Text fontWeight="800" fontSize="2xl" color="purple.600">{inappropriateCount}</Text>
                <Text fontSize="xs" color={mutedTextColor}>Inappropriate content</Text>
              </CardBody>
            </Card>
          </SimpleGrid>
        </Box>

        {/* User Reports */}
        <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" maxW="5xl">
          <CardHeader>
            <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
              <HStack>
                <Icon as={FiAlertTriangle} color="#f43f5e" boxSize={5} />
                <Heading size="sm" color={textColor}>User Reports</Heading>
                {reports.filter((r: any) => r.status === 'pending').length > 0 && (
                  <Badge colorScheme="red" borderRadius="full" px={2}>{reports.filter((r: any) => r.status === 'pending').length} pending</Badge>
                )}
              </HStack>
              <HStack>
                <select
                  value={reportsStatusFilter}
                  onChange={(e) => { setReportsStatusFilter(e.target.value); fetchAdminReports(1, e.target.value); }}
                  style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', cursor: 'pointer' }}
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
                <Button size="sm" leftIcon={<FiRefreshCw />} onClick={() => fetchAdminReports(reportsPage, reportsStatusFilter)} isLoading={reportsLoading}>Refresh</Button>
              </HStack>
            </Flex>
          </CardHeader>
          <CardBody px={0} pb={2}>
            {reportsLoading ? (
              <Center py={8}><Spinner color="#f43f5e" /></Center>
            ) : reports.length === 0 ? (
              <Center py={8}><VStack spacing={2}><Icon as={FiShield} boxSize={10} color="gray.300" /><Text color="#64748b">No reports found</Text></VStack></Center>
            ) : (
              <>
                <Box overflowX="auto" w="full">
                  <ChakraTable variant="simple" size="sm" style={{ tableLayout: 'fixed', width: '100%', minWidth: '560px' }}>
                    <Thead bg={headerBg}>
                      <Tr>
                        <Th color={mutedTextColor} w="48px" px={2}>#</Th>
                        <Th color={mutedTextColor} w="100px" px={2}>Reporter</Th>
                        <Th color={mutedTextColor} w="100px" px={2}>Against</Th>
                        <Th color={mutedTextColor} px={2}>Details</Th>
                        <Th color={mutedTextColor} w="88px" px={2}>Status</Th>
                        <Th color={mutedTextColor} w="76px" px={2} display={{ base: 'none', md: 'table-cell' }}>Date</Th>
                        <Th color={mutedTextColor} w="44px" px={1} textAlign="center">Act</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {reports.map((report: any) => (
                        <React.Fragment key={report.id}>
                          <Tr _hover={{ bg: hoverBg }} verticalAlign="top" cursor="pointer" onClick={() => toggleExpand(report.id)}>
                            <Td px={2} fontWeight="bold" color="gray.500" fontSize="xs">#{report.id}</Td>
                            <Td px={2}>
                              <VStack align="start" spacing={0}>
                                <Text fontSize="xs" fontWeight="600" isTruncated maxW="90px">
                                  {report.reporter_name || `User #${report.reporter_id}`}
                                </Text>
                                <Text fontSize="2xs" color={mutedTextColor}>ID: {report.reporter_id}</Text>
                              </VStack>
                            </Td>
                            <Td px={2}>
                              <VStack align="start" spacing={0}>
                                <Text fontSize="xs" fontWeight="600" isTruncated maxW="90px" color="red.600">
                                  {report.reported_name || `User #${report.reported_user_id}`}
                                </Text>
                                <Text fontSize="2xs" color={mutedTextColor}>ID: {report.reported_user_id}</Text>
                              </VStack>
                            </Td>
                            <Td px={2}>
                              <VStack align="start" spacing={1}>
                                <Badge
                                  colorScheme={report.reason === 'scam' ? 'red' : report.reason === 'counterfeit' ? 'orange' : report.reason === 'spam' ? 'yellow' : report.reason === 'inappropriate' ? 'purple' : 'gray'}
                                  borderRadius="full" px={2} fontSize="2xs" textTransform="capitalize"
                                >
                                  {report.reason || 'Other'}
                                </Badge>
                                {report.description && (
                                  <Text fontSize="2xs" color={mutedTextColor} noOfLines={2} maxW="180px">
                                    {report.description}
                                  </Text>
                                )}
                                {report.product_title && (
                                  <Text fontSize="2xs" color="brand.500" isTruncated maxW="180px">
                                    📦 {report.product_title}
                                  </Text>
                                )}
                              </VStack>
                            </Td>
                            <Td px={2}><Badge colorScheme={report.status === 'pending' ? 'orange' : report.status === 'resolved' ? 'green' : report.status === 'reviewed' ? 'blue' : 'gray'} borderRadius="full" px={1} fontSize="2xs" textTransform="capitalize">{report.status}</Badge></Td>
                            <Td px={2} fontSize="xs" color={mutedTextColor} display={{ base: 'none', md: 'table-cell' }}>{report.created_at ? new Date(report.created_at).toLocaleDateString() : '-'}</Td>
                            <Td px={1} textAlign="center" onClick={(e) => e.stopPropagation()}>
                              <Menu>
                                <MenuButton as={IconButton} icon={<FiMoreVertical />} size="xs" variant="ghost" aria-label="Actions" />
                                <MenuList shadow="lg" borderRadius="lg" minW="180px">
                                  {['Warn User', 'Delete Listing', 'Suspend Account', 'Mark Resolved', 'Dismiss'].map(action => (
                                    <MenuItem
                                      key={action}
                                      fontSize="sm"
                                      color={action === 'Suspend Account' || action === 'Delete Listing' ? '#f43f5e' : 'gray.700'}
                                      onClick={() => setModerationTarget({ report, action })}
                                    >
                                      {action}
                                    </MenuItem>
                                  ))}
                                </MenuList>
                              </Menu>
                            </Td>
                          </Tr>
                          {expandedReportId === report.id && (
                            <Tr bg={hoverBg}>
                              <Td colSpan={7} px={4} py={3}>
                                <VStack align="start" spacing={2}>
                                  <HStack spacing={4} flexWrap="wrap">
                                    <Text fontSize="xs"><Text as="span" fontWeight="700">Reporter:</Text> {report.reporter_name} (ID: {report.reporter_id})</Text>
                                    <Text fontSize="xs"><Text as="span" fontWeight="700">Reported:</Text> {report.reported_name} (ID: {report.reported_user_id})</Text>
                                    {report.product_title && <Text fontSize="xs"><Text as="span" fontWeight="700">Listing:</Text> {report.product_title}</Text>}
                                  </HStack>
                                  {report.description && (
                                    <Box bg="white" border="1px solid" borderColor={borderColor} borderRadius="md" p={3} w="full">
                                      <Text fontSize="xs" fontWeight="600" color={mutedTextColor} mb={1}>Description</Text>
                                      <Text fontSize="sm">{report.description}</Text>
                                    </Box>
                                  )}
                                  {report.reviewer_comment && (
                                    <Box bg="blue.50" border="1px solid" borderColor="blue.200" borderRadius="md" p={3} w="full">
                                      <Text fontSize="xs" fontWeight="600" color="blue.600" mb={1}>Reviewer Comment</Text>
                                      <Text fontSize="sm">{report.reviewer_comment}</Text>
                                    </Box>
                                  )}
                                  <Text fontSize="2xs" color={mutedTextColor}>Submitted: {report.created_at ? new Date(report.created_at).toLocaleString() : '-'} • Updated: {report.updated_at ? new Date(report.updated_at).toLocaleString() : '-'}</Text>
                                </VStack>
                              </Td>
                            </Tr>
                          )}
                        </React.Fragment>
                      ))}
                    </Tbody>
                  </ChakraTable>
                </Box>
                {reportsTotalPages > 1 && (
                  <HStack spacing={2} justify="center" mt={3} pb={3}>
                    <Button size="xs" variant="outline" isDisabled={reportsPage <= 1} onClick={() => { setReportsPage(p => p - 1); fetchAdminReports(reportsPage - 1, reportsStatusFilter); }}>Prev</Button>
                    <Text fontSize="xs" color={mutedTextColor}>{reportsPage} / {reportsTotalPages}</Text>
                    <Button size="xs" variant="outline" isDisabled={reportsPage >= reportsTotalPages} onClick={() => { setReportsPage(p => p + 1); fetchAdminReports(reportsPage + 1, reportsStatusFilter); }}>Next</Button>
                  </HStack>
                )}
              </>
            )}
          </CardBody>
        </Card>

        {/* Multiway Disputes */}
        <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" maxW="5xl">
          <CardHeader>
            <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
              <HStack>
                <Icon as={FiAlertTriangle} color="purple.500" boxSize={5} />
                <Heading size="sm" color={textColor}>Trade Disputes (Multi-Way Chains)</Heading>
                {multiwayDisputes.filter(d => d.status === 'pending').length > 0 && (
                  <Badge colorScheme="purple" borderRadius="full" px={2}>{multiwayDisputes.filter(d => d.status === 'pending').length} pending</Badge>
                )}
              </HStack>
              <Button size="sm" leftIcon={<FiRefreshCw />} onClick={fetchMultiwayDisputes} isLoading={multiwayDisputesLoading}>Refresh</Button>
            </Flex>
          </CardHeader>
          <CardBody px={0} pb={2}>
            {multiwayDisputesLoading ? (
              <Center py={8}><Spinner color="purple.500" /></Center>
            ) : multiwayDisputes.length === 0 ? (
              <Center py={8}><VStack spacing={2}><Icon as={FiShield} boxSize={10} color="gray.300" /><Text color="#64748b">No active disputes</Text></VStack></Center>
            ) : (
              <Box overflowX="auto" w="full">
                <ChakraTable variant="simple" size="sm" style={{ tableLayout: 'fixed', width: '100%', minWidth: '700px' }}>
                  <Thead bg={headerBg}>
                    <Tr>
                      <Th color={mutedTextColor} w="50px" px={2}>ID</Th>
                      <Th color={mutedTextColor} w="120px" px={2}>Leg / Chain</Th>
                      <Th color={mutedTextColor} w="100px" px={2}>Reporter</Th>
                      <Th color={mutedTextColor} w="100px" px={2}>Against</Th>
                      <Th color={mutedTextColor} px={2}>Reason</Th>
                      <Th color={mutedTextColor} w="90px" px={2}>Status</Th>
                      <Th color={mutedTextColor} w="76px" px={2}>Action</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {multiwayDisputes.map(dispute => (
                      <Tr key={dispute.id} _hover={{ bg: hoverBg }} verticalAlign="top">
                        <Td px={2} fontWeight="bold" color="gray.500" fontSize="xs">#{dispute.id}</Td>
                        <Td px={2}>
                          <VStack align="start" spacing={0}>
                            <Text fontSize="xs" fontWeight="600" isTruncated maxW="110px">Leg #{dispute.leg_index}</Text>
                            <Text fontSize="2xs" color={mutedTextColor} isTruncated maxW="110px">{dispute.chain_id}</Text>
                          </VStack>
                        </Td>
                        <Td px={2}><Text fontSize="xs" fontWeight="600" isTruncated>{dispute.filer_name}</Text></Td>
                        <Td px={2}><Text fontSize="xs" fontWeight="600" color="red.600" isTruncated>{dispute.against_name}</Text></Td>
                        <Td px={2}>
                          <Badge colorScheme="red" borderRadius="full" px={2} fontSize="2xs" textTransform="capitalize" mb={1}>{dispute.reason}</Badge>
                          <Text fontSize="2xs" color={mutedTextColor} noOfLines={1} maxW="150px">{dispute.description}</Text>
                        </Td>
                        <Td px={2}>
                          <Badge colorScheme={dispute.status === 'pending' ? 'orange' : 'green'} borderRadius="full" px={1} fontSize="2xs" textTransform="capitalize">{dispute.status}</Badge>
                        </Td>
                        <Td px={2}>
                          <Button size="xs" colorScheme="purple" onClick={() => openDisputeDetails(dispute)}>Inspect</Button>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </ChakraTable>
              </Box>
            )}
          </CardBody>
        </Card>

        {/* Multiway Dispute Modal */}
        <Modal isOpen={!!selectedDispute} onClose={() => setSelectedDispute(null)} size="2xl" scrollBehavior="inside">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Resolve Multi-Way Dispute</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              {selectedDispute && (
                <VStack align="stretch" spacing={4}>
                  <Box p={3} bg="gray.50" borderRadius="md" border="1px" borderColor="gray.200">
                    <HStack justify="space-between" mb={2}>
                      <Badge colorScheme="purple">Leg #{selectedDispute.leg_index}</Badge>
                      <Text fontSize="xs" color="gray.500">Chain: {selectedDispute.chain_id}</Text>
                    </HStack>
                    <SimpleGrid columns={2} spacing={2} fontSize="sm">
                      <Text><b>Filed By:</b> {selectedDispute.filer_name}</Text>
                      <Text><b>Against:</b> {selectedDispute.against_name}</Text>
                      <Text><b>Reason:</b> {selectedDispute.reason}</Text>
                      <Text><b>Status:</b> {selectedDispute.status}</Text>
                    </SimpleGrid>
                    <Text mt={2} fontSize="sm"><b>Description:</b> {selectedDispute.description}</Text>
                  </Box>

                  {/* Photo Evidence block */}
                  <Box>
                    <Text fontWeight="bold" fontSize="sm" mb={2}>Photo Evidence</Text>
                    {!selectedDispute.evidence_urls || selectedDispute.evidence_urls.length === 0 ? (
                      <Box p={3} bg="orange.50" borderRadius="md" border="1px" borderColor="orange.200">
                        <HStack>
                          <Icon as={FiAlertCircle} color="orange.500" />
                          <Text fontSize="sm" color="orange.800">No photo evidence uploaded for this dispute.</Text>
                        </HStack>
                      </Box>
                    ) : (
                      <SimpleGrid columns={[2, 3, 4]} spacing={2}>
                        {selectedDispute.evidence_urls.map((url: string, idx: number) => (
                          <Box key={idx} borderRadius="md" overflow="hidden" border="1px" borderColor="gray.200" cursor="pointer" onClick={() => window.open(url, '_blank')}>
                            <Image src={url} alt={`Evidence ${idx+1}`} fallbackSrc="/no-image.svg" objectFit="cover" w="full" h="100px" />
                          </Box>
                        ))}
                      </SimpleGrid>
                    )}
                  </Box>

                  {/* Chat Logs */}
                  <Box>
                    <Text fontWeight="bold" fontSize="sm" mb={2}>Leg Chat Logs</Text>
                    <Box bg="white" border="1px" borderColor="gray.200" borderRadius="md" p={2} maxH="200px" overflowY="auto">
                      {disputeChatLogs.length === 0 ? (
                        <Text fontSize="sm" color="gray.500" p={2}>No messages in this leg.</Text>
                      ) : (
                        <VStack align="stretch" spacing={2}>
                          {disputeChatLogs.map(msg => (
                            <Box key={msg.id} p={2} bg="gray.50" borderRadius="md">
                              <HStack justify="space-between">
                                <Text fontSize="xs" fontWeight="bold">{msg.sender_id === selectedDispute.filed_by ? selectedDispute.filer_name : (msg.sender_id === selectedDispute.against_uid ? selectedDispute.against_name : `User ${msg.sender_id}`)}</Text>
                                <Text fontSize="2xs" color="gray.500">{new Date(msg.created_at).toLocaleString()}</Text>
                              </HStack>
                              <Text fontSize="sm" mt={1}>{msg.content}</Text>
                            </Box>
                          ))}
                        </VStack>
                      )}
                    </Box>
                  </Box>
                </VStack>
              )}
            </ModalBody>
            <ModalFooter>
              {selectedDispute && selectedDispute.status === 'pending' ? (
                <HStack spacing={2} w="full" justify="space-between">
                  <Menu>
                    <MenuButton as={Button} size="sm" colorScheme="red" rightIcon={<FiChevronDown />}>
                      Action
                    </MenuButton>
                    <MenuList>
                      <MenuItem onClick={() => resolveDispute(selectedDispute.id, 'cancel_leg', selectedDispute.against_uid)} color="red.500">
                        Cancel Leg (Issue Strike to Against)
                      </MenuItem>
                      <MenuItem onClick={() => resolveDispute(selectedDispute.id, 'cancel_chain', selectedDispute.against_uid)} color="red.500">
                        Cancel Entire Chain & Strike
                      </MenuItem>
                      <MenuItem onClick={() => resolveDispute(selectedDispute.id, 'no_action')}>
                        Dismiss (No Action)
                      </MenuItem>
                    </MenuList>
                  </Menu>
                  <Button size="sm" onClick={() => setSelectedDispute(null)}>Close</Button>
                </HStack>
              ) : (
                <Button size="sm" onClick={() => setSelectedDispute(null)}>Close</Button>
              )}
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Rider Remittance & Free Slots (Task 19/20) */}
        <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" maxW="5xl">
          <CardHeader>
            <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
              <HStack>
                <Icon as={FiSettings} color="brand.500" boxSize={5} />
                <Heading size="sm" color={textColor}>Rider Free Slots & Remittance</Heading>
              </HStack>
              <Button size="sm" leftIcon={<FiRefreshCw />} onClick={() => { fetchRiderConfig(); fetchRemittancePayments(); }} isLoading={riderConfigLoading || remittanceLoading}>
                Refresh
              </Button>
            </Flex>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={4}>
              <Box>
                <Heading size="xs" color={textColor} mb={2}>Default free delivery slots (new riders & refills)</Heading>
                <HStack spacing={2} wrap="wrap">
                  <Input
                    size="sm"
                    w="170px"
                    type="number"
                    min={1}
                    max={100}
                    value={riderFreeSlotsDefault}
                    onChange={e => setRiderFreeSlotsDefault(Number(e.target.value))}
                  />
                  <Button size="sm" colorScheme="brand" onClick={saveRiderConfig} isLoading={riderConfigLoading}>
                    Save All
                  </Button>
                  <Text fontSize="xs" color={mutedTextColor}>
                    During free slots, remittance is waived. When slots are exhausted and remittance is due, riders get locked.
                  </Text>
                </HStack>
              </Box>

              <Box borderTop="1px" borderColor={borderColor} pt={4}>
                <Heading size="xs" color={textColor} mb={3}>Remittance Calculation Settings</Heading>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <Box>
                    <FormLabel fontSize="xs" fontWeight="600" color={textColor} mb={2}>
                      Tax per delivery collection (₱)
                    </FormLabel>
                    <Input
                      size="sm"
                      type="number"
                      step={0.5}
                      min={0.1}
                      max={100}
                      value={riderRemittanceTaxPerCollection}
                      onChange={e => setRiderRemittanceTaxPerCollection(Number(e.target.value))}
                      placeholder="e.g., 2.0"
                    />
                    <Text fontSize="xs" color={mutedTextColor} mt={1}>
                      Amount collected per delivery that becomes remittance owed
                    </Text>
                  </Box>
                  <Box>
                    <FormLabel fontSize="xs" fontWeight="600" color={textColor} mb={2}>
                      Remittance lock threshold (₱)
                    </FormLabel>
                    <Input
                      size="sm"
                      type="number"
                      step={1}
                      min={1}
                      max={1000}
                      value={riderRemittanceLockThreshold}
                      onChange={e => setRiderRemittanceLockThreshold(Number(e.target.value))}
                      placeholder="e.g., 50.0"
                    />
                    <Text fontSize="xs" color={mutedTextColor} mt={1}>
                      Amount of remittance owed before rider gets locked
                    </Text>
                  </Box>
                </SimpleGrid>
              </Box>

              <Box>
                <HStack justify="space-between" mb={2}>
                  <Heading size="xs" color={textColor}>Pending remittance payments</Heading>
                  <Button size="xs" variant="outline" onClick={fetchRemittancePayments} isLoading={remittanceLoading}>
                    Refresh list
                  </Button>
                </HStack>

                {remittanceLoading ? (
                  <Center py={6}><Spinner color="teal.500" /></Center>
                ) : remittancePayments.length === 0 ? (
                  <Text fontSize="sm" color={mutedTextColor}>No pending remittance payments.</Text>
                ) : (
                  <Box overflowX="auto" border="1px" borderColor={borderColor} borderRadius="md">
                    <ChakraTable variant="simple" size="sm">
                      <Thead bg={headerBg}>
                        <Tr>
                          <Th color={mutedTextColor}>Rider</Th>
                          <Th color={mutedTextColor}>Amount</Th>
                          <Th color={mutedTextColor}>Method</Th>
                          <Th color={mutedTextColor}>Proof</Th>
                          <Th color={mutedTextColor}>Submitted</Th>
                          <Th color={mutedTextColor}>Action</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {remittancePayments.map(p => (
                          <Tr key={p.id} _hover={{ bg: hoverBg }}>
                            <Td>
                              <VStack align="start" spacing={0}>
                                <Text fontWeight="600" fontSize="sm">{p.rider_name || `Rider #${p.rider_id}`}</Text>
                                <Text fontSize="xs" color={mutedTextColor}>{p.rider_email}</Text>
                              </VStack>
                            </Td>
                            <Td fontWeight="600">₱{Number(p.amount_paid).toFixed(2)}</Td>
                            <Td fontSize="sm">{p.payment_method || '-'}</Td>
                            <Td>
                              {p.payment_proof_url ? (
                                <Button as="a" href={p.payment_proof_url} target="_blank" rel="noreferrer" size="xs" variant="outline">
                                  View
                                </Button>
                              ) : (
                                <Text fontSize="sm" color={mutedTextColor}>-</Text>
                              )}
                            </Td>
                            <Td fontSize="xs" color={mutedTextColor}>{p.created_at ? new Date(p.created_at).toLocaleString() : '-'}</Td>
                            <Td>
                              <Button
                                size="xs"
                                colorScheme="green"
                                onClick={() => approveRemittancePayment(p.id)}
                                isLoading={verifyRemittanceLoadingId === p.id}
                              >
                                Confirm Received
                              </Button>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </ChakraTable>
                  </Box>
                )}
              </Box>
            </VStack>
          </CardBody>
        </Card>

        {/* Rider Applications */}
        <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" maxW="5xl">
          <CardHeader>
            <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
              <HStack>
                <Icon as={FaMotorcycle} color="brand.500" boxSize={5} />
                <Heading size="sm" color={textColor}>Rider Applications</Heading>
                {riderApplications.filter(r => r.status === 'pending').length > 0 && (
                  <Badge colorScheme="orange" borderRadius="full" px={2}>{riderApplications.filter(r => r.status === 'pending').length} pending</Badge>
                )}
              </HStack>
              <HStack spacing={2}>
                <Select size="sm" w="130px" value={riderStatusFilter} onChange={e => setRiderStatusFilter(e.target.value)} placeholder="All statuses">
                  <option value="pending">Pending</option>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </Select>
                <Input size="sm" w="160px" placeholder="Search name/email" value={riderSearchInput} onChange={e => handleRiderSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') fetchRiderApplications(); }} />
                <Button size="sm" leftIcon={<FiRefreshCw />} onClick={() => fetchRiderApplications()} isLoading={riderAppsLoading}>Refresh</Button>
              </HStack>
            </Flex>
          </CardHeader>
          <CardBody overflowX="auto" px={0}>
            {riderAppsLoading ? (
              <Center py={8}><Spinner color="teal.500" /></Center>
            ) : riderApplications.length === 0 ? (
              <Center py={8}><VStack spacing={2}><Icon as={FaMotorcycle} boxSize={10} color="gray.300" /><Text color="#64748b">No rider applications</Text></VStack></Center>
            ) : (
              <ChakraTable variant="simple" size="sm">
                <Thead bg={headerBg}>
                  <Tr>
                    <Th color={mutedTextColor}>Applicant</Th>
                    <Th color={mutedTextColor}>Vehicle</Th>
                    <Th color={mutedTextColor}>Contact</Th>
                    <Th color={mutedTextColor}>Status</Th>
                    <Th color={mutedTextColor}>Applied</Th>
                    <Th color={mutedTextColor}>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {riderApplications.map(app => (
                    <Tr key={app.id} _hover={{ bg: hoverBg }}>
                      <Td>
                        <VStack align="start" spacing={0}>
                          <Text fontWeight="600" fontSize="sm">{app.full_name || app.name}</Text>
                          <Text fontSize="xs" color={mutedTextColor}>{app.email}</Text>
                        </VStack>
                      </Td>
                      <Td>
                        <VStack align="start" spacing={0}>
                          <Text fontSize="sm" textTransform="capitalize">{app.vehicle_type}</Text>
                          <Text fontSize="xs" color={mutedTextColor}>{app.vehicle_plate || 'No plate'}</Text>
                        </VStack>
                      </Td>
                      <Td fontSize="sm">{app.contact_number || '-'}</Td>
                      <Td>
                        <Badge
                          colorScheme={app.status === 'approved' ? 'green' : app.status === 'rejected' ? 'red' : app.status === 'under_review' ? 'blue' : 'orange'}
                          borderRadius="full" px={2}
                        >
                          {app.status === 'under_review' ? 'Under Review' : app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                        </Badge>
                      </Td>
                      <Td fontSize="xs" color={mutedTextColor}>{new Date(app.created_at).toLocaleDateString()}</Td>
                      <Td>
                        <HStack spacing={1}>
                          <Tooltip label="View Details" hasArrow>
                            <IconButton aria-label="View" size="sm" variant="outline" icon={<FiEye />} onClick={() => setSelectedRiderApp(app)} />
                          </Tooltip>
                          {app.status === 'pending' && (
                            <>
                              <Button size="xs" colorScheme="blue" variant="outline" onClick={() => handleMarkRiderUnderReview(app.id)}>Review</Button>
                              <Button size="xs" colorScheme="green" leftIcon={<FiCheck />} onClick={() => handleApproveRider(app.id)}>Approve</Button>
                              <Button size="xs" colorScheme="red" variant="outline" leftIcon={<FiX />} onClick={() => { setRejectRiderTarget(app); setRejectRiderReason(''); }}>Reject</Button>
                            </>
                          )}
                          {app.status === 'under_review' && (
                            <>
                              <Button size="xs" colorScheme="green" leftIcon={<FiCheck />} onClick={() => handleApproveRider(app.id)}>Approve</Button>
                              <Button size="xs" colorScheme="red" variant="outline" leftIcon={<FiX />} onClick={() => { setRejectRiderTarget(app); setRejectRiderReason(''); }}>Reject</Button>
                            </>
                          )}
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </ChakraTable>
            )}
          </CardBody>
        </Card>

        {/* Rider Application Detail Modal */}
        <Modal isOpen={!!selectedRiderApp} onClose={() => setSelectedRiderApp(null)} size="lg" isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader fontSize="md">
              <HStack>
                <Icon as={FaMotorcycle} color="brand.500" />
                <Text>Rider Application Details</Text>
              </HStack>
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={6}>
              {selectedRiderApp && (
                <VStack spacing={4} align="stretch">
                  <SimpleGrid columns={2} spacing={4}>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Full Name</Text>
                      <Text fontWeight="bold">{selectedRiderApp.full_name || selectedRiderApp.name}</Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Email</Text>
                      <Text fontWeight="bold">{selectedRiderApp.email}</Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Contact Number</Text>
                      <Text fontWeight="bold">{selectedRiderApp.contact_number || 'N/A'}</Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Vehicle</Text>
                      <Text fontWeight="bold" textTransform="capitalize">{selectedRiderApp.vehicle_type} {selectedRiderApp.vehicle_plate ? `(${selectedRiderApp.vehicle_plate})` : ''}</Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Status</Text>
                      <Badge colorScheme={selectedRiderApp.status === 'approved' ? 'green' : selectedRiderApp.status === 'rejected' ? 'red' : selectedRiderApp.status === 'under_review' ? 'blue' : 'orange'}>
                        {selectedRiderApp.status === 'under_review' ? 'Under Review' : selectedRiderApp.status.charAt(0).toUpperCase() + selectedRiderApp.status.slice(1)}
                      </Badge>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Applied On</Text>
                      <Text fontWeight="bold">{new Date(selectedRiderApp.created_at).toLocaleString()}</Text>
                    </Box>
                  </SimpleGrid>

                  {selectedRiderApp.rejection_reason && (
                    <Box bg="red.50" p={3} borderRadius="md">
                      <Text fontSize="xs" color="red.600" fontWeight="bold">Rejection Reason</Text>
                      <Text fontSize="sm">{selectedRiderApp.rejection_reason}</Text>
                    </Box>
                  )}

                  {selectedRiderApp.reviewed_at && (
                    <Text fontSize="xs" color="gray.500">Reviewed at: {new Date(selectedRiderApp.reviewed_at).toLocaleString()}</Text>
                  )}

                  <Divider />

                  {selectedRiderApp.license_image_url && (
                    <Box>
                      <Image src={selectedRiderApp.license_image_url} alt="License" maxH="250px" borderRadius="md" border="1px solid" borderColor="gray.200" objectFit="contain" w="full" bg="gray.50" />
                    </Box>
                  )}

                  {selectedRiderApp.selfie_image_url && (
                    <Box>
                      <Image src={selectedRiderApp.selfie_image_url} alt="Selfie" maxH="200px" borderRadius="md" border="1px solid" borderColor="gray.200" objectFit="contain" w="full" bg="gray.50" />
                    </Box>
                  )}
                </VStack>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Reject Rider Modal */}
        <Modal isOpen={!!rejectRiderTarget} onClose={() => { setRejectRiderTarget(null); setRejectRiderReason(''); }} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader fontSize="md">Reject Rider Application</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Text fontSize="sm" mb={3}>Applicant: <strong>{rejectRiderTarget?.full_name || rejectRiderTarget?.name}</strong> ({rejectRiderTarget?.email})</Text>
              <Textarea
                placeholder="Reason for rejection"
                value={rejectRiderReason}
                onChange={e => setRejectRiderReason(e.target.value)}
                rows={3}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={() => { setRejectRiderTarget(null); setRejectRiderReason(''); }}>Cancel</Button>
              <Button colorScheme="red" onClick={handleConfirmRejectRider} isLoading={rejectRiderLoading} isDisabled={!rejectRiderReason.trim()}>
                Reject Application
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

      </VStack>
    );
  };

  // â"€â"€ SECTION: Management â"€â"€
  const ManagementSection = () => (
    <VStack spacing={8} pr={20} align="stretch">
      {/* Users */}
      <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" maxW="5xl">
        <CardHeader pb={0}>
          <Heading size="sm" color={textColor}>Users</Heading>
          <Text fontSize="xs" color={mutedTextColor} mt={1}>View all registered users and manage accounts.</Text>
          <HStack mt={4} mb={2} spacing={3} wrap="wrap">
            <Input size="sm" placeholder="Search users by name, email..." value={usersSearchInput} onChange={(e) => handleUsersSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') fetchAdminUsers(1, usersSearchInput, usersRoleFilter, usersIsVerifiedFilter); }} maxW="300px" />
            <Select size="sm" w="130px" placeholder="All Roles" value={usersRoleFilter} onChange={(e) => { setUsersRoleFilter(e.target.value); fetchAdminUsers(1, usersSearch, e.target.value); }}>
              <option value="admin">Admin</option>
              <option value="user">User</option>
              <option value="suspended">Suspended</option>
            </Select>
            <Select size="sm" w="150px" placeholder="All Verifications" value={usersIsVerifiedFilter} onChange={(e) => { setUsersIsVerifiedFilter(e.target.value); fetchAdminUsers(1, usersSearch, usersRoleFilter, e.target.value); }}>
              <option value="true">Verified Only</option>
              <option value="false">Unverified Only</option>
            </Select>
            <Button size="sm" onClick={() => fetchAdminUsers(1)}>Search</Button>
          </HStack>
        </CardHeader>
        <CardBody px={0} pb={2}>
          {usersLoading ? <Center py={6}><Spinner color="brand.500" /></Center> : users.length === 0 ? <Text fontSize="sm" color={mutedTextColor} px={4}>No users found.</Text> : (
            <>
              <Box overflowX="auto" w="full">
                <ChakraTable size="sm" variant="simple" style={{ tableLayout: 'fixed', width: '100%', minWidth: '500px' }}>
                  <Thead><Tr>
                    <Th color={mutedTextColor} px={2}>User</Th>
                    <Th color={mutedTextColor} px={2} display={{ base: 'none', md: 'table-cell' }}>Email</Th>
                    <Th color={mutedTextColor} w="80px" px={2}>Role</Th>
                    <Th color={mutedTextColor} w="72px" px={2} display={{ base: 'none', sm: 'table-cell' }}>Status</Th>
                    <Th textAlign="right" color={mutedTextColor} w="100px" px={1}>Act</Th>
                  </Tr></Thead>
                  <Tbody>
                    {users.map(user => (
                      <Tr key={user.id} _hover={{ bg: hoverBg }}>
                        <Td px={2}><HStack spacing={2}><VerifiedAvatar size="xs" name={user.name} src={user.profile_picture || undefined} isVerified={user.verified || user.verification_status === 'verified' || false} /><VStack spacing={0} align="start" minW={0}><Text fontWeight="600" fontSize="xs" isTruncated maxW="120px">{user.name || 'Unnamed'}</Text><Text fontSize="xs" color={mutedTextColor}>#{user.id}</Text></VStack></HStack></Td>
                        <Td px={2} display={{ base: 'none', md: 'table-cell' }}><Text fontSize="xs" isTruncated maxW="160px">{user.email}</Text></Td>
                        <Td px={2}><Tag size="sm" colorScheme={user.role === 'admin' ? 'purple' : user.role === 'banned' ? 'blackAlpha' : user.role === 'suspended' ? 'red' : 'blue'} fontSize="xs">{user.role || 'user'}</Tag></Td>
                        <Td px={2} display={{ base: 'none', sm: 'table-cell' }}><Tag size="sm" colorScheme={user.verified ? 'green' : 'gray'} fontSize="xs">{user.verified ? 'Verified' : 'Unverified'}</Tag></Td>
                        <Td textAlign="right" px={1}>
                          <HStack spacing={1} justify="flex-end">
                            <Tooltip label="Strike History" hasArrow><IconButton aria-label="Strikes" size="xs" colorScheme="purple" variant="ghost" icon={<FiAlertTriangle />} onClick={() => openStrikeHistory(user)} /></Tooltip>
                            {user.role !== 'admin' && (
                              <Tooltip label={(user.role === 'suspended') ? 'Unsuspend' : 'Suspend'} hasArrow>
                                <IconButton aria-label="Toggle suspend" size="xs" colorScheme={(user.role === 'suspended') ? 'green' : 'orange'} variant="ghost" icon={(user.role === 'suspended') ? <FiCheckCircle /> : <FiXCircle />} onClick={() => handleToggleSuspend(user)} />
                              </Tooltip>
                            )}
                            {user.role !== 'admin' && (
                              <Tooltip label={(user.role === 'banned') ? 'Unban' : 'Ban'} hasArrow>
                                <IconButton aria-label="Toggle ban" size="xs" colorScheme={(user.role === 'banned') ? 'green' : 'blackAlpha'} variant="ghost" icon={(user.role === 'banned') ? <FiCheckCircle /> : <FiAlertCircle />} onClick={() => handleToggleBan(user)} />
                              </Tooltip>
                            )}
                            <Tooltip label="Delete user" hasArrow><IconButton aria-label="Delete user" size="xs" colorScheme="red" variant="ghost" icon={<FiTrash2 />} onClick={() => askDeleteUser(user)} /></Tooltip>
                          </HStack>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </ChakraTable>
              </Box>
              <HStack justify="space-between" mt={3} px={4} pb={3}>
                <Button size="xs" variant="outline" onClick={() => fetchAdminUsers(usersPage - 1)} isDisabled={usersPage <= 1 || usersLoading}>Prev</Button>
                <Text fontSize="xs" color={mutedTextColor}>{usersPage} / {usersTotalPages}</Text>
                <Button size="xs" variant="outline" onClick={() => fetchAdminUsers(usersPage + 1)} isDisabled={usersPage >= usersTotalPages || usersLoading}>Next</Button>
              </HStack>
            </>
          )}
        </CardBody>
      </Card>

      {/* Items */}
      <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" maxW="5xl">
        <CardHeader pb={0}>
          <Heading size="sm" color={textColor}>Items</Heading>
          <Text fontSize="xs" color={mutedTextColor} mt={1}>Inspect and manage marketplace listings.</Text>
          <HStack mt={4} mb={2} spacing={3} wrap="wrap">
            <Input size="sm" placeholder="Search items by title..." value={productsSearchInput} onChange={(e) => handleProductsSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') fetchAdminProducts(1, productsSearchInput, productsStatusFilter); }} maxW="300px" />
            <Select size="sm" w="140px" placeholder="All Status" value={productsStatusFilter} onChange={(e) => { setProductsStatusFilter(e.target.value); fetchAdminProducts(1, productsSearch, e.target.value); }}>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="traded">Traded</option>
              <option value="suspended">Suspended</option>
            </Select>
            <Button size="sm" onClick={() => fetchAdminProducts(1)}>Search</Button>
          </HStack>
          {selectedProductIds.size > 0 && (
            <HStack mt={3} p={3} bg={useColorModeValue('blue.50', 'blue.900')} borderRadius="md" spacing={3}>
              <Text fontSize="sm" fontWeight="600" color={useColorModeValue('blue.900', 'blue.100')}>
                {selectedProductIds.size} item{selectedProductIds.size !== 1 ? 's' : ''} selected
              </Text>
              <Button size="xs" colorScheme="red" variant="solid" onClick={() => handleBulkDeleteProducts()} isLoading={isSelectingProducts}>
                Delete Selected
              </Button>
              <Button size="xs" colorScheme="orange" variant="solid" onClick={() => handleBulkSuspendProducts()} isLoading={isSelectingProducts}>
                Suspend Selected
              </Button>
              <Button size="xs" colorScheme="green" variant="solid" onClick={() => handleBulkUnsuspendProducts()} isLoading={isSelectingProducts}>
                Unsuspend Selected
              </Button>
              <Button size="xs" variant="outline" onClick={() => setSelectedProductIds(new Set())}>
                Clear Selection
              </Button>
            </HStack>
          )}
        </CardHeader>
        <CardBody px={0} pb={2}>
          {productsLoading ? <Center py={6}><Spinner color="brand.500" /></Center> : products.length === 0 ? <Text fontSize="sm" color={mutedTextColor} px={4}>No items found.</Text> : (
            <>
              <Box overflowX="auto" w="full">
                <ChakraTable size="sm" variant="simple" style={{ tableLayout: 'fixed', width: '100%', minWidth: '480px' }}>
                  <Thead><Tr bg={headerBg}>
                    <Th color={mutedTextColor} px={2} w="40px"><Checkbox isChecked={selectedProductIds.size === products.length && products.length > 0} isIndeterminate={selectedProductIds.size > 0 && selectedProductIds.size < products.length} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.checked) { setSelectedProductIds(new Set(products.map(p => p.id))); } else { setSelectedProductIds(new Set()); } }} /></Th>
                    <Th color={mutedTextColor} px={2}>Item</Th>
                    <Th color={mutedTextColor} px={2} display={{ base: 'none', md: 'table-cell' }}>Trader</Th>
                    <Th color={mutedTextColor} w="80px" px={2}>Status</Th>
                    <Th isNumeric color={mutedTextColor} w="88px" px={2} display={{ base: 'none', sm: 'table-cell' }}>Price</Th>
                    <Th textAlign="right" color={mutedTextColor} w="80px" px={1}></Th>
                  </Tr></Thead>
                  <Tbody>
                    {products.map(product => {
                      const isSuspended = product.status === 'suspended';
                      const isSelected = selectedProductIds.has(product.id);
                      return (
                        <Tr key={product.id} _hover={{ bg: hoverBg }} bg={isSelected ? useColorModeValue('blue.50', 'blue.900') : undefined}>
                          <Td px={2}><Checkbox isChecked={isSelected} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const newSet = new Set(selectedProductIds); if (e.target.checked) { newSet.add(product.id); } else { newSet.delete(product.id); } setSelectedProductIds(newSet); }} /></Td>
                          <Td><HStack spacing={3}><Avatar size="sm" variant="rounded" name={product.title} src={product.image_urls?.[0] || undefined} /><VStack spacing={0} align="start"><Text fontWeight="600" fontSize="sm" noOfLines={1} maxW="150px">{product.title}</Text><Text fontSize="xs" color={mutedTextColor}>ID #{product.id}</Text></VStack></HStack></Td>
                          <Td><Text fontSize="sm">{product.seller_name || `User #${product.seller_id}`}</Text></Td>
                          <Td><Tag size="sm" colorScheme={product.status === 'available' ? 'green' : product.status === 'suspended' ? 'red' : 'gray'}>{product.status}</Tag></Td>
                          <Td isNumeric><Text fontSize="sm">{product.price != null ? formatCurrency(product.price) : '—'}</Text></Td>
                          <Td textAlign="right">
                            <HStack spacing={1} justify="flex-end">
                              <Tooltip label="View Details" hasArrow>
                                <IconButton as="a" href={`/product/${product.id}`} target="_blank" aria-label="View Details" size="sm" colorScheme="blue" variant="ghost" icon={<FiEye />} />
                              </Tooltip>
                              <Tooltip label={isSuspended ? "Unsuspend listing" : "Suspend listing"} hasArrow>
                                <IconButton
                                  aria-label="Toggle suspend"
                                  size="sm"
                                  colorScheme={isSuspended ? "green" : "orange"}
                                  variant="ghost"
                                  icon={isSuspended ? <FiCheckCircle /> : <FiXCircle />}
                                  onClick={async () => {
                                    try {
                                      await api.put(`/api/admin/products/${product.id}/${isSuspended ? 'unsuspend' : 'suspend'}`);
                                      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status: isSuspended ? 'available' : 'suspended' } : p));
                                      toast({ title: isSuspended ? 'Listing Unsuspended' : 'Listing Suspended', status: 'success', duration: 2000 });
                                    } catch (err: any) {
                                      toast({ title: 'Failed to update status', status: 'error' });
                                    }
                                  }}
                                />
                              </Tooltip>
                              <Tooltip label="Delete item" hasArrow>
                                <IconButton aria-label="Delete item" size="sm" colorScheme="red" variant="ghost" icon={<FiTrash2 />} onClick={() => askDeleteProduct(product)} />
                              </Tooltip>
                            </HStack>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </ChakraTable>
              </Box>
              <HStack justify="space-between" mt={3} px={4} pb={3}>
                <Button size="xs" variant="outline" onClick={() => fetchAdminProducts(productsPage - 1)} isDisabled={productsPage <= 1 || productsLoading}>Prev</Button>
                <Text fontSize="xs" color={mutedTextColor}>{productsPage} / {productsTotalPages}</Text>
                <Button size="xs" variant="outline" onClick={() => fetchAdminProducts(productsPage + 1)} isDisabled={productsPage >= productsTotalPages || productsLoading}>Next</Button>
              </HStack>
            </>
          )}
        </CardBody>
      </Card>

      {/* Advertisements */}
      <AdvertisementCMS />

      {/* Campaigns */}
      <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" maxW="5xl">
        <CardHeader>
          <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
            <HStack><Icon as={FiStar} color="orange.500" boxSize={5} /><Heading size="sm" color={textColor}>Popup Campaigns</Heading></HStack>
            <HStack>
              <Button size="sm" colorScheme="brand" onClick={() => { setEditingCampaign({}); openCampaignModal(); }}>Create Campaign</Button>
              <Button size="sm" leftIcon={<FiRefreshCw />} onClick={fetchAdminCampaigns} isLoading={campaignsLoading}>Refresh</Button>
            </HStack>
          </Flex>
        </CardHeader>
        <CardBody px={0} pb={2}>
          {campaignsLoading ? <Center py={8}><Spinner color="orange.500" /></Center> : campaigns.length === 0 ? (
            <Center py={8}><VStack spacing={2}><Icon as={FiStar} boxSize={10} color="gray.300" /><Text color={mutedTextColor}>No campaigns found</Text></VStack></Center>
          ) : (
            <Box overflowX="auto" w="full">
              <ChakraTable variant="simple" size="sm" style={{ tableLayout: 'fixed', width: '100%', minWidth: '540px' }}>
                <Thead bg={headerBg}><Tr>
                  <Th color={mutedTextColor} px={2}>Title</Th>
                  <Th color={mutedTextColor} w="80px" px={2}>Targets</Th>
                  <Th color={mutedTextColor} w="100px" px={2} display={{ base: 'none', md: 'table-cell' }}>Frequency</Th>
                  <Th color={mutedTextColor} px={2} display={{ base: 'none', lg: 'table-cell' }}>Dates</Th>
                  <Th color={mutedTextColor} w="56px" px={2}>Active</Th>
                  <Th color={mutedTextColor} w="84px" px={1}>Actions</Th>
                </Tr></Thead>
                <Tbody>
                  {campaigns.map(camp => (
                    <Tr key={camp.id} _hover={{ bg: hoverBg }}>
                      <Td px={2}><Text fontWeight="600" fontSize="xs" isTruncated maxW="140px">{camp.title}</Text></Td>
                      <Td px={2}><Tag size="sm" colorScheme="blue" textTransform="capitalize" fontSize="xs">{camp.target_users}</Tag></Td>
                      <Td px={2} display={{ base: 'none', md: 'table-cell' }}><Text fontSize="xs">{camp.frequency.replace(/_/g, ' ')}</Text></Td>
                      <Td px={2} fontSize="xs" color={mutedTextColor} display={{ base: 'none', lg: 'table-cell' }}>{camp.start_date ? new Date(camp.start_date).toLocaleDateString() : 'Always'} - {camp.end_date ? new Date(camp.end_date).toLocaleDateString() : '∞'}</Td>
                      <Td px={2}><Switch colorScheme="green" size="sm" isChecked={camp.is_active} onChange={() => handleToggleCampaignStatus(camp)} /></Td>
                      <Td px={1}>
                        <HStack spacing={1}>
                          <Button size="xs" onClick={() => { setEditingCampaign({ ...camp, start_date: camp.start_date ? new Date(camp.start_date).toISOString().slice(0, 16) : '', end_date: camp.end_date ? new Date(camp.end_date).toISOString().slice(0, 16) : '' }); openCampaignModal(); }}>Edit</Button>
                          <IconButton aria-label="Delete campaign" size="xs" colorScheme="red" variant="ghost" icon={<FiTrash2 />} onClick={() => askDeleteCampaign(camp)} />
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </ChakraTable>
            </Box>
          )}
        </CardBody>
      </Card>
    </VStack>
  );

  // â"€â"€ SECTION: System â"€â"€
  const SystemSection = () => (
    <VStack spacing={8} pr={20} align="stretch">
      <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4}>
        <MetricCard icon={FiAlertTriangle} color="rose" label="Reports Filed" value={stats!.reports_filed} />
        <MetricCard icon={FiXCircle} color="red" label="Suspended Users" value={stats!.suspended_users} />
        <MetricCard icon={FiServer} color="purple" label="Storage Used" value={`${(stats!.storage_usage_mb || 0).toFixed(1)} MB`} raw />
        <MetricCard icon={FiShield} color="brand" label="Pending Verifications" value={stats!.pending_verifications ?? 0} />
      </SimpleGrid>

      <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl">
        <CardHeader>
          <HStack><Icon as={FiCalendar} color="brand.500" boxSize={5} /><Heading size="sm" color={textColor}>Usage History</Heading></HStack>
          <Text fontSize="xs" color={mutedTextColor} mt={1}>Click any day to view that day's detailed stats.</Text>
        </CardHeader>
        <CardBody>
          <UsageCalendar year={calYear} month={calMonth} activityMap={activityMap} onDayClick={handleDayClick} onPrevMonth={handlePrevMonth} onNextMonth={handleNextMonth} calendarLoading={calendarLoading} selectedDate={selectedDate} />
        </CardBody>
      </Card>

      <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl">
      </Card>

      <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" maxW="5xl">
        <CardHeader>
          <HStack>
            <Icon as={FiServer} color="brand.500" boxSize={5} />
            <Heading size="sm" color={textColor}>Multi-way Match Debug</Heading>
          </HStack>
          <Text fontSize="xs" color={mutedTextColor} mt={1}>Explain why a trade did or did not produce a loop suggestion.</Text>
        </CardHeader>
        <CardBody>
          <VStack align="stretch" spacing={4}>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
              <Input
                placeholder="Primary trade ID"
                value={loopDebugTradeID}
                onChange={(e) => setLoopDebugTradeID(e.target.value)}
                bg={tableBg}
              />
              <Input
                placeholder="Compare trade ID (optional)"
                value={loopDebugCompareTradeID}
                onChange={(e) => setLoopDebugCompareTradeID(e.target.value)}
                bg={tableBg}
              />
              <Button colorScheme="brand" onClick={handleRunLoopDebug} isLoading={loopDebugLoading}>
                Run Debug
              </Button>
            </SimpleGrid>

            {!loopDebugResult ? (
              <Text fontSize="sm" color={mutedTextColor}>Run the debug query to see scoring details, threshold failures, and recommended loop state.</Text>
            ) : (
              <VStack align="stretch" spacing={4}>
                {[{ key: 'primary', label: 'Primary Trade' }, { key: 'comparison', label: 'Comparison Trade' }].map((section) => {
                  const entry = loopDebugResult?.[section.key];
                  if (!entry) return null;

                  const candidates = entry?.debug?.candidates || [];
                  return (
                    <Box key={section.key} border="1px solid" borderColor={borderColor} borderRadius="lg" p={4} bg={tableBg}>
                      <HStack justify="space-between" align="start" mb={2}>
                        <VStack align="start" spacing={0}>
                          <Text fontWeight="700" color={textColor}>{section.label}</Text>
                          <Text fontSize="xs" color={mutedTextColor}>
                            Trade #{entry.trade_id} • status: {entry.trade_status}
                          </Text>
                        </VStack>
                        <Badge colorScheme={entry.recommended_loop_status === 'no_match' ? 'gray' : entry.recommended_loop_status === 'pending_initiator_upgrade' ? 'orange' : 'green'}>
                          {entry.recommended_loop_status}
                        </Badge>
                      </HStack>

                      <Text fontSize="sm" color={mutedTextColor} mb={2}>
                        Matches: {entry.match_count} • Threshold: {entry?.debug?.threshold ?? '-'}
                      </Text>
                      {entry?.debug?.no_match_reason ? (
                        <Alert status="warning" borderRadius="md" mb={3}>
                          <AlertIcon />
                          <Text fontSize="sm">{entry.debug.no_match_reason}</Text>
                        </Alert>
                      ) : null}

                      {candidates.length === 0 ? (
                        <Text fontSize="sm" color={mutedTextColor}>No candidates evaluated.</Text>
                      ) : (
                        <VStack align="stretch" spacing={2}>
                          {candidates.slice(0, 6).map((cand: any, idx: number) => (
                            <Box key={`${section.key}-${idx}`} border="1px solid" borderColor={borderColor} borderRadius="md" p={3} bg={cardBg}>
                              <HStack justify="space-between" mb={1}>
                                <Text fontSize="sm" fontWeight="600" color={textColor}>
                                  User #{cand.user3_id}: {cand.user3_product_title}
                                </Text>
                                <Badge colorScheme={cand.passed_threshold ? 'green' : 'red'}>
                                  Score {cand.score}
                                </Badge>
                              </HStack>
                              <Text fontSize="xs" color={mutedTextColor}>Offered item: {cand.offered_title}</Text>
                              <Text fontSize="xs" color={mutedTextColor} mt={1}>{(cand.reasons || []).join(' | ')}</Text>
                            </Box>
                          ))}
                        </VStack>
                      )}
                    </Box>
                  );
                })}
                {loopDebugResult?.comparison_error ? (
                  <Alert status="warning" borderRadius="md">
                    <AlertIcon />
                    <Text fontSize="sm">Comparison error: {loopDebugResult.comparison_error}</Text>
                  </Alert>
                ) : null}
              </VStack>
            )}
          </VStack>
        </CardBody>
      </Card>

      <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" maxW="5xl">
        <CardHeader><Heading size="sm" color={textColor}>Revenue Breakdown (Last 4 Weeks)</Heading></CardHeader>
        <CardBody>
          <VStack spacing={3} align="stretch">
            {stats!.revenue_breakdown && stats!.revenue_breakdown.length > 0 ? stats!.revenue_breakdown.map((period, i) => (
              <HStack key={i} justify="space-between" p={3} bg={hoverBg} borderRadius="lg">
                <Text fontWeight="600" fontSize="sm" color={mutedTextColor}>{period.period}</Text>
                <Text fontSize="md" fontWeight="800" color="#10b981">{formatCurrency(period.amount)}</Text>
              </HStack>
            )) : <Text color={mutedTextColor} textAlign="center" fontSize="sm">No revenue data</Text>}
          </VStack>
        </CardBody>
      </Card>
    </VStack>
  );

  const sectionTitles: Record<SectionId, string> = {
    overview: 'Overview',
    moderation: 'Moderation Queue',
    management: 'Management',
    system: 'System',
  };

  return (
    <ErrorBoundary>
      <Box minH="100vh" bg={mainBg} display="flex">

        {/* â"€â"€ Desktop Sidebar â"€â"€ */}
        {!isMobile && (
          <Box
            w="260px"
            minH="100vh"
            bg={sidebarBg}
            borderRight="1px solid"
            borderColor={borderColor}
            position="fixed"
            top={0}
            left={0}
            overflowY="auto"
            zIndex={20}
            boxShadow="sm"
          >
            <SidebarContent />
          </Box>
        )}

        {/* â"€â"€ Mobile Sidebar Drawer â"€â"€ */}
        <Drawer isOpen={isSidebarOpen} placement="left" onClose={closeSidebar}>
          <DrawerOverlay />
          <DrawerContent maxW="260px">
            <DrawerCloseButton />
            <DrawerBody p={0} pt={8}>
              <SidebarContent />
            </DrawerBody>
          </DrawerContent>
        </Drawer>

        {/* â"€â"€ Main Content â"€â"€ */}
        <Box flex={1} ml={isMobile ? 0 : '210px'} display="flex" flexDirection="column">

          {/* Top Bar */}
          <Box
            bg={topBarBg}
            borderBottom="1px solid"
            borderColor={borderColor}
            px={{ base: 4, md: 6 }}
            py={4}
            position="sticky"
            top={0}
            zIndex={10}
            boxShadow="sm"
          >
            <Flex justify="space-between" align="center">
              <HStack spacing={3}>
                {isMobile && (
                  <IconButton aria-label="Open menu" icon={<FiMenu />} variant="ghost" size="sm" onClick={openSidebar} />
                )}
                <VStack align="start" spacing={0}>
                  <Heading size="md" color={textColor}>{sectionTitles[activeSection]}</Heading>
                  {isUsingMockData && <Badge colorScheme="orange" variant="subtle" fontSize="xs">Demo Mode</Badge>}
                </VStack>
              </HStack>
              <HStack spacing={2} mr={20}>
                <Button onClick={handleBackfillLedgers} size="sm" colorScheme="orange" variant="solid" isLoading={backfillLoading}>Sync Legacy Ledgers</Button>
                <Button leftIcon={<FiRefreshCw />} onClick={handleRefresh} size="sm" colorScheme="brand" variant="outline" isLoading={loading}>Refresh</Button>
              </HStack>
            </Flex>
            <Collapse in={showConnectionAlert}>
              <Alert status="warning" mt={3} borderRadius="lg">
                <AlertIcon />
                <AlertDescription>{!connectionStatus.online ? 'You are offline. Some features may be limited.' : 'API unreachable. Using demo data.'}</AlertDescription>
              </Alert>
            </Collapse>
          </Box>

          {/* Content Area */}
          <Box flex={1} p={{ base: 3, md: 5 }} maxW="1400px" w="full" mx="auto" overflow="hidden">
            {activeSection === 'overview' && <OverviewSection />}
            {activeSection === 'moderation' && <ModerationSection />}
            {activeSection === 'management' && <ManagementSection />}
            {activeSection === 'system' && <SystemSection />}
          </Box>
        </Box>

        {/* â"€â"€ Day Detail Modal â"€â"€ */}
        <Modal isOpen={isDayModalOpen} onClose={closeDayModal} isCentered size="md">
          <ModalOverlay backdropFilter="blur(4px)" />
          <ModalContent borderRadius="xl" overflow="hidden">
            <Box bg="brand.500" px={6} py={4}>
              <ModalHeader color="white" p={0} fontSize="lg">
                {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Day Details'}
              </ModalHeader>
              <ModalCloseButton color="white" top={4} right={4} />
            </Box>
            <ModalBody py={6}>
              {dayDetailLoading ? (
                <VStack spacing={4} py={6}><Spinner size="lg" color="brand.500" /><Text color={mutedTextColor}>Loading day stats…</Text></VStack>
              ) : selectedDayDetail ? (
                <VStack spacing={3} align="stretch">
                  {[
                    { label: 'New Users', value: selectedDayDetail.new_users, color: 'blue', icon: FiUsers },
                    { label: 'New Listings', value: selectedDayDetail.new_listings, color: 'purple', icon: FiPackage },
                    { label: 'Completed Trades', value: selectedDayDetail.completed_trades, color: 'brand', icon: FiShoppingCart },
                    { label: 'Reports Filed', value: selectedDayDetail.reports_filed, color: 'red', icon: FiShield },
                  ].map(({ label, value, color, icon }) => (
                    <HStack key={label} justify="space-between" p={3} bg={`${color}.50`} borderRadius="lg" border="1px" borderColor={`${color}.100`}>
                      <HStack spacing={2}><Icon as={icon} color={`${color}.500`} /><Text fontWeight="600" color={textColor} fontSize="sm">{label}</Text></HStack>
                      <Badge colorScheme={color} fontSize="md" px={3} py={1} borderRadius="full">{value?.toLocaleString() ?? 0}</Badge>
                    </HStack>
                  ))}
                  <HStack justify="space-between" p={3} bg="green.50" borderRadius="lg" border="1px" borderColor="green.100">
                    <HStack spacing={2}><Icon as={FiDollarSign} color="green.500" /><Text fontWeight="600" color={textColor} fontSize="sm">Revenue</Text></HStack>
                    <Text fontSize="md" fontWeight="800" color="green.600">{formatCurrency(selectedDayDetail.revenue ?? 0)}</Text>
                  </HStack>
                </VStack>
              ) : (
                <VStack spacing={3} py={6}><Text color={mutedTextColor} textAlign="center">No data available for this day.</Text></VStack>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* â"€â"€ Moderation Action Confirm Dialog â"€â"€ */}
        <AlertDialog isOpen={!!moderationTarget} leastDestructiveRef={cancelModerationRef} onClose={() => setModerationTarget(null)}>
          <AlertDialogOverlay>
            <AlertDialogContent borderRadius="xl">
              <AlertDialogHeader fontSize="lg" fontWeight="800">Confirm: {moderationTarget?.action}</AlertDialogHeader>
              <AlertDialogBody>
                Are you sure you want to <b>{moderationTarget?.action}</b> for report <b>#{moderationTarget?.report?.id}</b>? This will update the report status immediately.
              </AlertDialogBody>
              <AlertDialogFooter>
                <Button ref={cancelModerationRef} onClick={() => setModerationTarget(null)} variant="ghost">Cancel</Button>
                <Button colorScheme="red" onClick={handleModerationAction} ml={3} isLoading={moderationLoading}>Confirm</Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogOverlay>
        </AlertDialog>



        {/* â"€â"€ Campaign Create/Edit Modal â"€â"€ */}
        <Modal isOpen={isCampaignModalOpen} onClose={() => { closeCampaignModal(); setEditingCampaign(null); }} size="lg">
          <ModalOverlay />
          <ModalContent borderRadius="xl">
            <form onSubmit={handleSaveCampaign}>
              <ModalHeader>{editingCampaign?.id ? 'Edit Campaign' : 'Create Campaign'}</ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <VStack spacing={4} align="stretch">
                  <Box><Text fontSize="sm" fontWeight="600" mb={1}>Title *</Text><Input placeholder="e.g. Free Premium Promotion" value={editingCampaign?.title || ''} onChange={(e) => setEditingCampaign({ ...editingCampaign, title: e.target.value })} required /></Box>
                  <Box><Text fontSize="sm" fontWeight="600" mb={1}>Description</Text><Textarea placeholder="Enter the main content of the popup" value={editingCampaign?.description || ''} onChange={(e) => setEditingCampaign({ ...editingCampaign, description: e.target.value })} rows={3} /></Box>
                  <Box><Text fontSize="sm" fontWeight="600" mb={1}>Image URL (Optional)</Text><Input placeholder="https://example.com/image.jpg" value={editingCampaign?.image_url || ''} onChange={(e) => setEditingCampaign({ ...editingCampaign, image_url: e.target.value })} /></Box>
                  <SimpleGrid columns={2} spacing={4}>
                    <Box><Text fontSize="sm" fontWeight="600" mb={1}>Button Text</Text><Input placeholder="Click Here" value={editingCampaign?.button_text || ''} onChange={(e) => setEditingCampaign({ ...editingCampaign, button_text: e.target.value })} /></Box>
                    <Box><Text fontSize="sm" fontWeight="600" mb={1}>Button Link</Text><Input placeholder="/premium" value={editingCampaign?.button_link || ''} onChange={(e) => setEditingCampaign({ ...editingCampaign, button_link: e.target.value })} /></Box>
                  </SimpleGrid>
                  <SimpleGrid columns={2} spacing={4}>
                    <Box><Text fontSize="sm" fontWeight="600" mb={1}>Start Date</Text><Input type="datetime-local" value={editingCampaign?.start_date || ''} onChange={(e) => setEditingCampaign({ ...editingCampaign, start_date: e.target.value })} /></Box>
                    <Box><Text fontSize="sm" fontWeight="600" mb={1}>End Date</Text><Input type="datetime-local" value={editingCampaign?.end_date || ''} onChange={(e) => setEditingCampaign({ ...editingCampaign, end_date: e.target.value })} /></Box>
                  </SimpleGrid>
                  <SimpleGrid columns={2} spacing={4}>
                    <Box><Text fontSize="sm" fontWeight="600" mb={1}>Target Users</Text><Select value={editingCampaign?.target_users || 'all'} onChange={(e) => setEditingCampaign({ ...editingCampaign, target_users: e.target.value as any })}><option value="all">All Users</option><option value="new">New</option><option value="verified">Verified Students</option><option value="unverified">Unverified</option></Select></Box>
                    <Box><Text fontSize="sm" fontWeight="600" mb={1}>Frequency</Text><Select value={editingCampaign?.frequency || 'once_per_user'} onChange={(e) => setEditingCampaign({ ...editingCampaign, frequency: e.target.value as any })}><option value="once_per_user">Once per user</option><option value="once_per_day">Once per day</option><option value="every_login">Every time</option></Select></Box>
                  </SimpleGrid>
                  <HStack justify="space-between" pt={1}><Text fontSize="sm" fontWeight="600">Active Status</Text><Switch colorScheme="green" isChecked={editingCampaign?.is_active ?? true} onChange={(e) => setEditingCampaign({ ...editingCampaign, is_active: e.target.checked })} /></HStack>
                </VStack>
              </ModalBody>
              <Box px={6} pb={4} pt={2}><HStack justify="flex-end" spacing={3}><Button variant="ghost" onClick={() => { closeCampaignModal(); setEditingCampaign(null); }}>Cancel</Button><Button type="submit" colorScheme="brand" isLoading={campaignFormLoading}>Save Campaign</Button></HStack></Box>
            </form>
          </ModalContent>
        </Modal>

        {/* â"€â"€ Delete Confirmation Dialog â"€â"€ */}
        <AlertDialog isOpen={isDeleteDialogOpen} leastDestructiveRef={cancelDeleteRef} onClose={closeDeleteDialog}>
          <AlertDialogOverlay>
            <AlertDialogContent borderRadius="xl">
              <AlertDialogHeader fontSize="lg" fontWeight="800">Confirm Deletion</AlertDialogHeader>
              <AlertDialogBody>
                {deleteTarget ? <>Are you sure you want to delete <b>{deleteTarget.name}</b>? This action is permanent.</> : 'Are you sure? This action is permanent.'}
              </AlertDialogBody>
              <AlertDialogFooter>
                <Button ref={cancelDeleteRef} onClick={closeDeleteDialog} disabled={deleteLoading}>Cancel</Button>
                <Button colorScheme="red" onClick={handleConfirmDelete} ml={3} isLoading={deleteLoading}>Delete</Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogOverlay>
        </AlertDialog>

      </Box>
    </ErrorBoundary>
  );
};

export default AdminDashboard;
