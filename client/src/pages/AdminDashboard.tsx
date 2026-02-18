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
  FiFileText,
} from 'react-icons/fi';
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
import { mockAdminStats, simulateApiDelay } from '../utils/mockData';
import { enhancedApiCall, checkConnectionStatus } from '../utils/apiUtils';
import ConnectionStatus from '../components/ConnectionStatus';
import ErrorBoundary from '../components/ErrorBoundary';

// ─── PDF / DOCX imports ───────────────────────────────────────────────────────
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';

// ─── Types ────────────────────────────────────────────────────────────────────
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
  reports_filed: number;
  suspended_users: number;
  storage_usage_mb: number;
  revenue_breakdown: Array<{ period: string; amount: number }>;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Export helpers ───────────────────────────────────────────────────────────
function buildReportRows(stats: AdminStats) {
  return [
    ['Total Users', stats.total_users?.toLocaleString() ?? '0'],
    ['Premium Users', stats.premium_users?.toLocaleString() ?? '0'],
    ['Verified Users', stats.verified_users?.toLocaleString() ?? '0'],
    ['Suspended Users', stats.suspended_users?.toLocaleString() ?? '0'],
    ['Active Listings', stats.active_listings?.toLocaleString() ?? '0'],
    ['Total Completed Trades', stats.total_trades?.toLocaleString() ?? '0'],
    ['Total Income', formatCurrency(stats.total_income ?? 0)],
    ['New Users Today', stats.new_users_today?.toLocaleString() ?? '0'],
    ['New Listings Today', stats.new_listings_today?.toLocaleString() ?? '0'],
    ['Pending Approvals', stats.pending_approvals?.toLocaleString() ?? '0'],
    ['Reports Filed', stats.reports_filed?.toLocaleString() ?? '0'],
    ['Storage Usage', `${(stats.storage_usage_mb ?? 0).toFixed(1)} MB`],
  ];
}

function exportToPDF(stats: AdminStats) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date();
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header band ──
  doc.setFillColor(49, 130, 206); // blue.500
  doc.rect(0, 0, pageW, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Clovia Admin — Site Usage Report', pageW / 2, 14, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${now.toLocaleString('en-PH')}`, pageW / 2, 22, { align: 'center' });
  doc.text(`Data as of: ${stats.last_updated ?? now.toLocaleString('en-PH')}`, pageW / 2, 28, { align: 'center' });

  // ── Section: Core Metrics ──
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Core Metrics', 14, 42);

  autoTable(doc, {
    startY: 46,
    head: [['Metric', 'Value']],
    body: buildReportRows(stats),
    theme: 'striped',
    headStyles: { fillColor: [49, 130, 206], textColor: 255, fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 10 },
    alternateRowStyles: { fillColor: [235, 244, 255] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  // ── Section: Revenue Breakdown ──
  const afterTable = (doc as any).lastAutoTable.finalY + 10;
  if (stats.revenue_breakdown && stats.revenue_breakdown.length > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Revenue Breakdown (Last 4 Weeks)', 14, afterTable);

    autoTable(doc, {
      startY: afterTable + 4,
      head: [['Period', 'Revenue (PHP)']],
      body: stats.revenue_breakdown.map(r => [r.period, formatCurrency(r.amount)]),
      theme: 'striped',
      headStyles: { fillColor: [56, 178, 172], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 10 },
      alternateRowStyles: { fillColor: [240, 255, 254] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  }

  // ── Footer ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}  •  Clovia Admin Report`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
  }

  doc.save(`clovia-report-${now.toISOString().slice(0, 10)}.pdf`);
}

async function exportToDOCX(stats: AdminStats) {
  const now = new Date();
  const rows = buildReportRows(stats);

  const makeCell = (text: string, bold = false, shade?: string) =>
    new TableCell({
      shading: shade ? { fill: shade, type: 'clear' as any } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold, size: 20 })],
        }),
      ],
    });

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        makeCell('Metric', true, '3182CE'),
        makeCell('Value', true, '3182CE'),
      ],
    }),
    ...rows.map((row, i) =>
      new TableRow({
        children: [
          makeCell(row[0], true, i % 2 === 0 ? 'EBF4FF' : 'FFFFFF'),
          makeCell(row[1], false, i % 2 === 0 ? 'EBF4FF' : 'FFFFFF'),
        ],
      })
    ),
  ];

  const revenueRows =
    stats.revenue_breakdown && stats.revenue_breakdown.length > 0
      ? [
        new TableRow({
          tableHeader: true,
          children: [makeCell('Period', true, '38B2AC'), makeCell('Revenue (PHP)', true, '38B2AC')],
        }),
        ...stats.revenue_breakdown.map((r, i) =>
          new TableRow({
            children: [
              makeCell(r.period, true, i % 2 === 0 ? 'F0FFFE' : 'FFFFFF'),
              makeCell(formatCurrency(r.amount), false, i % 2 === 0 ? 'F0FFFE' : 'FFFFFF'),
            ],
          })
        ),
      ]
      : [];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: 'Clovia Admin — Site Usage Report',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Generated: ${now.toLocaleString('en-PH')}`, size: 18, color: '555555' }),
            ],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Data as of: ${stats.last_updated ?? now.toLocaleString('en-PH')}`, size: 18, color: '555555' }),
            ],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: 'Core Metrics',
            heading: HeadingLevel.HEADING_2,
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows,
          }),
          ...(revenueRows.length > 0
            ? [
              new Paragraph({ text: '' }),
              new Paragraph({ text: 'Revenue Breakdown (Last 4 Weeks)', heading: HeadingLevel.HEADING_2 }),
              new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: revenueRows }),
            ]
            : []),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Clovia Admin Report  •  Confidential', size: 16, color: '999999', italics: true }),
            ],
            alignment: AlignmentType.CENTER,
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `clovia-report-${now.toISOString().slice(0, 10)}.docx`);
}

// ─── Calendar Component ───────────────────────────────────────────────────────
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

      {/* Day-of-week headers */}
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
          { color: 'blue.400', label: 'Medium (4–10)' },
          { color: 'orange.400', label: 'Low (1–3)' },
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

// ─── Main Component ───────────────────────────────────────────────────────────
const AdminDashboard: React.FC = () => {
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

  const { isOpen: isDayModalOpen, onOpen: openDayModal, onClose: closeDayModal } = useDisclosure();

  const toast = useToast();
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const cardBg = useColorModeValue('white', 'gray.700');

  // ── Connection check ──
  const checkConnection = useCallback(async () => {
    try {
      const status = await checkConnectionStatus();
      setConnectionStatus({ online: !!status.online, apiReachable: !!status.apiReachable });
      setShowConnectionAlert(!status.online || !status.apiReachable);
    } catch { }
  }, []);

  // ── Fetch main stats ──
  const fetchAdminStats = useCallback(async (useMockDataFallback = false) => {
    try {
      setLoading(true);
      setError(null);
      setIsUsingMockData(false);

      if (useMockDataFallback) {
        await simulateApiDelay(500);
        setStats(mockAdminStats);
        setIsUsingMockData(true);
        toast({ title: 'Using Demo Data', description: 'Showing mock data while API is unavailable', status: 'info', duration: 5000, isClosable: true });
        return;
      }

      const response = await enhancedApiCall<{ success: boolean; data: AdminStats; error?: string }>('/api/admin/stats', {
        retryConfig: { maxRetries: 2 },
        useMockData: true,
      });

      if (response.success) {
        if (!response.data) {
          await simulateApiDelay(300);
          setStats(mockAdminStats);
          setIsUsingMockData(true);
        } else {
          setStats(response.data);
          setIsUsingMockData(false);
        }
      } else {
        throw new Error(response.error || 'Failed to fetch admin statistics');
      }
    } catch (err: any) {
      if (err.message === 'API_UNREACHABLE_MOCK_DATA_AVAILABLE') {
        await fetchAdminStats(true);
        return;
      }
      setError(err.message || 'Error fetching admin statistics');
      setRetryCount(prev => prev + 1);
      toast({ title: 'Error', description: err.message || 'Failed to load dashboard data', status: 'error', duration: 5000, isClosable: true });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ── Fetch calendar daily stats ──
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
      // silently fail — calendar is supplementary
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  // ── Fetch stats for a specific day ──
  const fetchDayDetail = useCallback(async (date: string) => {
    setDayDetailLoading(true);
    setSelectedDayDetail(null);
    try {
      const response = await api.get(`/api/admin/stats-by-date?date=${date}`);
      if (response.data?.success) {
        setSelectedDayDetail(response.data.data as DayDetail);
      }
    } catch {
      toast({ title: 'Could not load day data', status: 'warning', duration: 3000, isClosable: true });
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

  // ── Export handlers ──
  const handleExportPDF = useCallback(async () => {
    if (!stats) return;
    setExportLoading(true);
    try {
      exportToPDF(stats);
      toast({ title: 'PDF exported successfully', status: 'success', duration: 3000, isClosable: true });
    } catch (e) {
      toast({ title: 'PDF export failed', status: 'error', duration: 3000, isClosable: true });
    } finally {
      setExportLoading(false);
    }
  }, [stats, toast]);

  const handleExportDOCX = useCallback(async () => {
    if (!stats) return;
    setExportLoading(true);
    try {
      await exportToDOCX(stats);
      toast({ title: 'DOCX exported successfully', status: 'success', duration: 3000, isClosable: true });
    } catch (e) {
      toast({ title: 'DOCX export failed', status: 'error', duration: 3000, isClosable: true });
    } finally {
      setExportLoading(false);
    }
  }, [stats, toast]);

  useEffect(() => {
    checkConnection();
    fetchAdminStats();
    const connectionInterval = setInterval(checkConnection, 30000);
    return () => clearInterval(connectionInterval);
  }, [checkConnection, fetchAdminStats]);

  useEffect(() => {
    fetchDailyStats(calYear, calMonth);
  }, [calYear, calMonth, fetchDailyStats]);

  // ── Loading / Error / No-data states ──
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

  // ── Main render ──
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
                  : 'API server is unreachable. Using demo data.'}
              </AlertDescription>
            </Box>
          </Alert>
        </Collapse>

        {/* ── Header ── */}
        <Flex justify="space-between" align="center" mb={8} flexWrap="wrap" gap={3}>
          <VStack align="start" spacing={1}>
            <Heading color="blue.600">Admin Dashboard</Heading>
            {isUsingMockData && (
              <Badge colorScheme="orange" variant="subtle">Demo Mode — Using Mock Data</Badge>
            )}
            {stats?.last_updated && (
              <Text fontSize="sm" color="gray.500">
                Last updated: {new Date(stats.last_updated).toLocaleString()}
              </Text>
            )}
          </VStack>

          <HStack spacing={3} flexWrap="wrap">
            <Button
              leftIcon={<FiRefreshCw />}
              onClick={handleRefresh}
              colorScheme="blue"
              variant="outline"
              isLoading={loading}
            >
              Refresh
            </Button>

            {/* ── Export Report Menu ── */}
            <Menu>
              <MenuButton
                as={Button}
                leftIcon={<FiPrinter />}
                rightIcon={<FiChevronDown />}
                colorScheme="teal"
                isLoading={exportLoading}
                loadingText="Exporting…"
              >
                Export Report
              </MenuButton>
              <MenuList shadow="lg" borderRadius="lg" overflow="hidden" minW="200px">
                <Box px={3} py={2} bg="teal.50">
                  <Text fontSize="xs" fontWeight="bold" color="teal.700" textTransform="uppercase" letterSpacing="wide">
                    Choose Format
                  </Text>
                </Box>
                <Divider />
                <MenuItem
                  icon={<FiFileText />}
                  onClick={handleExportPDF}
                  _hover={{ bg: 'red.50' }}
                  py={3}
                >
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="semibold" fontSize="sm">Export as PDF</Text>
                    <Text fontSize="xs" color="gray.500">Formatted report, ready to print or share</Text>
                  </VStack>
                </MenuItem>
                <MenuItem
                  icon={<FiFileText />}
                  onClick={handleExportDOCX}
                  _hover={{ bg: 'blue.50' }}
                  py={3}
                >
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="semibold" fontSize="sm">Export as DOCX</Text>
                    <Text fontSize="xs" color="gray.500">Editable Word document</Text>
                  </VStack>
                </MenuItem>
              </MenuList>
            </Menu>

            {!connectionStatus.apiReachable && (
              <Button leftIcon={<FiServer />} onClick={() => fetchAdminStats(true)} variant="ghost" colorScheme="orange">
                Use Demo Data
              </Button>
            )}
          </HStack>
        </Flex>

        {/* ── Core Metrics Grid ── */}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6} mb={8}>
          {[
            { icon: FiUsers, color: 'blue', label: 'Total Users', value: stats.total_users },
            { icon: FiStar, color: 'yellow', label: 'Premium Users', value: stats.premium_users },
            { icon: FiDollarSign, color: 'green', label: 'Total Income', value: formatCurrency(stats.total_income || 0), raw: true },
            { icon: FiShoppingBag, color: 'purple', label: 'Active Listings', value: stats.active_listings },
            { icon: FiShoppingCart, color: 'teal', label: 'Total Trades', value: stats.total_trades },
            { icon: FiUsers, color: 'orange', label: 'New Users Today', value: stats.new_users_today },
            { icon: FiPackage, color: 'pink', label: 'New Listings Today', value: stats.new_listings_today },
            { icon: FiShield, color: 'cyan', label: 'Verified Users', value: stats.verified_users },
          ].map(({ icon, color, label, value, raw }) => (
            <Card key={label} bg={cardBg} border="1px" borderColor={borderColor}>
              <CardBody>
                <Stat>
                  <Flex align="center" mb={2}>
                    <Icon as={icon} color={`${color}.500`} mr={2} />
                    <StatLabel color="gray.600">{label}</StatLabel>
                  </Flex>
                  <StatNumber color={`${color}.600`} fontSize="2xl">
                    {raw ? value : (value as number)?.toLocaleString() ?? 0}
                  </StatNumber>
                </Stat>
              </CardBody>
            </Card>
          ))}
        </SimpleGrid>

        {/* ── Charts ── */}
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={8} mb={8}>
          {/* Revenue Trends */}
          <GridItem colSpan={{ base: 1, lg: 2 }}>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader>
                <Heading size="md" color="blue.600">Revenue Trends (Last 4 Weeks)</Heading>
              </CardHeader>
              <CardBody>
                {stats.revenue_breakdown && stats.revenue_breakdown.length > 0 ? (
                  <Box h="300px">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[...stats.revenue_breakdown].reverse()} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3182CE" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#3182CE" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="period" stroke="#718096" style={{ fontSize: '12px' }} />
                        <YAxis stroke="#718096" style={{ fontSize: '12px' }} tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}
                          formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                        />
                        <Area type="monotone" dataKey="amount" stroke="#3182CE" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
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

          {/* User Metrics */}
          <GridItem>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader><Heading size="md" color="blue.600">User Metrics Overview</Heading></CardHeader>
              <CardBody>
                <Box h="300px">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'Total Users', value: stats.total_users || 0 },
                        { name: 'Premium', value: stats.premium_users || 0 },
                        { name: 'Verified', value: stats.verified_users || 0 },
                      ]}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="name" stroke="#718096" style={{ fontSize: '12px' }} />
                      <YAxis stroke="#718096" style={{ fontSize: '12px' }} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}
                        formatter={(value: number) => [value.toLocaleString(), 'Count']}
                      />
                      <Bar dataKey="value" fill="#3182CE" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardBody>
            </Card>
          </GridItem>

          {/* Daily Activity */}
          <GridItem>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader><Heading size="md" color="blue.600">Daily Activity Metrics</Heading></CardHeader>
              <CardBody>
                <Box h="300px">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: 'New Users', value: stats.new_users_today || 0 },
                        { name: 'New Listings', value: stats.new_listings_today || 0 },
                        { name: 'Trades', value: stats.total_trades || 0 },
                      ]}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="name" stroke="#718096" style={{ fontSize: '12px' }} />
                      <YAxis stroke="#718096" style={{ fontSize: '12px' }} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}
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

        {/* ── User Management & System Metrics ── */}
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={8} mb={8}>
          <GridItem>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader><Heading size="md" color="blue.600">User Management</Heading></CardHeader>
              <CardBody>
                <VStack spacing={4} align="stretch">
                  {[
                    { label: 'Pending Approvals', value: stats.pending_approvals, scheme: 'yellow' },
                    { label: 'Reports Filed', value: stats.reports_filed, scheme: 'red' },
                    { label: 'Suspended/Banned Users', value: stats.suspended_users, scheme: 'gray' },
                  ].map(({ label, value, scheme }) => (
                    <HStack key={label} justify="space-between">
                      <Text fontWeight="medium">{label}</Text>
                      <Badge colorScheme={scheme} fontSize="md" px={3} py={1}>
                        {value?.toLocaleString() ?? 0}
                      </Badge>
                    </HStack>
                  ))}
                </VStack>
              </CardBody>
            </Card>
          </GridItem>

          <GridItem>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader><Heading size="md" color="blue.600">System Metrics</Heading></CardHeader>
              <CardBody>
                <HStack justify="space-between">
                  <Text fontWeight="medium">Storage Usage</Text>
                  <Text fontSize="lg" fontWeight="bold" color="purple.500">
                    {(stats.storage_usage_mb || 0).toFixed(1)} MB
                  </Text>
                </HStack>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>

        {/* ── Revenue Breakdown & Recent Activity ── */}
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={8} mb={10}>
          <GridItem>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader><Heading size="md" color="blue.600">Revenue Breakdown (Last 4 Weeks)</Heading></CardHeader>
              <CardBody>
                <VStack spacing={3} align="stretch">
                  {stats.revenue_breakdown && stats.revenue_breakdown.length > 0 ? (
                    stats.revenue_breakdown.map((period, i) => (
                      <HStack key={i} justify="space-between" p={3} bg="gray.50" borderRadius="md">
                        <Text fontWeight="medium">{period.period}</Text>
                        <Text fontSize="lg" fontWeight="bold" color="green.500">{formatCurrency(period.amount)}</Text>
                      </HStack>
                    ))
                  ) : (
                    <Text color="gray.500" textAlign="center">No revenue data available</Text>
                  )}
                </VStack>
              </CardBody>
            </Card>
          </GridItem>

          <GridItem>
            <Card bg={cardBg} border="1px" borderColor={borderColor}>
              <CardHeader><Heading size="md" color="blue.600">Recent Activity (Last 24h)</Heading></CardHeader>
              <CardBody>
                <VStack spacing={3} align="stretch">
                  {stats.recent_activity && stats.recent_activity.length > 0 ? (
                    stats.recent_activity.map((activity, i) => (
                      <HStack key={i} justify="space-between" p={3} bg="gray.50" borderRadius="md">
                        <VStack align="start" spacing={1}>
                          <Text fontWeight="medium">{activity.action}</Text>
                          <Text fontSize="sm" color="gray.600">{new Date(activity.latest).toLocaleString()}</Text>
                        </VStack>
                        <Badge colorScheme="blue" fontSize="md" px={3} py={1}>{activity.count}</Badge>
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

        {/* ── Usage History Calendar ── */}
        <Card bg={cardBg} border="1px" borderColor={borderColor} mb={8}>
          <CardHeader>
            <HStack spacing={3}>
              <Icon as={FiCalendar} color="blue.500" boxSize={5} />
              <Heading size="md" color="blue.600">Usage History</Heading>
            </HStack>
            <Text fontSize="sm" color="gray.500" mt={1}>
              Click any day to view that day's detailed stats. Colored dots indicate activity level.
            </Text>
          </CardHeader>
          <CardBody>
            <UsageCalendar
              year={calYear}
              month={calMonth}
              activityMap={activityMap}
              onDayClick={handleDayClick}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
              calendarLoading={calendarLoading}
              selectedDate={selectedDate}
            />
          </CardBody>
        </Card>

        {/* ── Day Detail Modal ── */}
        <Modal isOpen={isDayModalOpen} onClose={closeDayModal} isCentered size="md">
          <ModalOverlay backdropFilter="blur(4px)" />
          <ModalContent borderRadius="xl" overflow="hidden">
            <Box bg="blue.600" px={6} py={4}>
              <ModalHeader color="white" p={0} fontSize="lg">
                {selectedDate
                  ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-PH', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                  })
                  : 'Day Details'}
              </ModalHeader>
              <ModalCloseButton color="white" top={4} right={4} />
            </Box>
            <ModalBody py={6}>
              {dayDetailLoading ? (
                <VStack spacing={4} py={6}>
                  <Spinner size="lg" color="blue.500" />
                  <Text color="gray.500">Loading day stats…</Text>
                </VStack>
              ) : selectedDayDetail ? (
                <VStack spacing={3} align="stretch">
                  {[
                    { label: 'New Users', value: selectedDayDetail.new_users, color: 'blue', icon: FiUsers },
                    { label: 'New Listings', value: selectedDayDetail.new_listings, color: 'purple', icon: FiPackage },
                    { label: 'Completed Trades', value: selectedDayDetail.completed_trades, color: 'teal', icon: FiShoppingCart },
                    { label: 'Reports Filed', value: selectedDayDetail.reports_filed, color: 'red', icon: FiShield },
                    { label: 'Active Listings', value: selectedDayDetail.active_listings, color: 'orange', icon: FiShoppingBag },
                  ].map(({ label, value, color, icon }) => (
                    <HStack key={label} justify="space-between" p={3} bg={`${color}.50`} borderRadius="lg" border="1px" borderColor={`${color}.100`}>
                      <HStack spacing={2}>
                        <Icon as={icon} color={`${color}.500`} />
                        <Text fontWeight="medium" color="gray.700">{label}</Text>
                      </HStack>
                      <Badge colorScheme={color} fontSize="md" px={3} py={1} borderRadius="full">
                        {value?.toLocaleString() ?? 0}
                      </Badge>
                    </HStack>
                  ))}
                  <HStack justify="space-between" p={3} bg="green.50" borderRadius="lg" border="1px" borderColor="green.100">
                    <HStack spacing={2}>
                      <Icon as={FiDollarSign} color="green.500" />
                      <Text fontWeight="medium" color="gray.700">Revenue</Text>
                    </HStack>
                    <Text fontSize="md" fontWeight="bold" color="green.600">
                      {formatCurrency(selectedDayDetail.revenue ?? 0)}
                    </Text>
                  </HStack>
                </VStack>
              ) : (
                <VStack spacing={3} py={6}>
                  <Text color="gray.500" textAlign="center">No data available for this day.</Text>
                </VStack>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>
      </Container>
    </ErrorBoundary>
  );
};

export default AdminDashboard;
