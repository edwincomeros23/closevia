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
import VerifiedAvatar from '../components/VerifiedAvatar';
import { User, Product, PaginatedResponse, APIResponse } from '../types';

// â”€â”€â”€ PDF / DOCX imports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TableLayoutType, TextRun, HeadingLevel, AlignmentType, WidthType, ShadingType } from 'docx';
import { saveAs } from 'file-saver';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// â”€â”€â”€ Export helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Header band â”€â”€
  doc.setFillColor(49, 130, 206); // blue.500
  doc.rect(0, 0, pageW, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Clovia Admin â€” Site Usage Report', pageW / 2, 14, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${now.toLocaleString('en-PH')}`, pageW / 2, 22, { align: 'center' });
  doc.text(`Data as of: ${stats.last_updated ?? now.toLocaleString('en-PH')}`, pageW / 2, 28, { align: 'center' });

  // â”€â”€ Section: Core Metrics â”€â”€
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Core Metrics', 14, 42);

  // usable width = page width minus margins (14 left + 14 right)
  const usableW = pageW - 28;
  const col0W = usableW * 0.58; // 58% for label column
  const col1W = usableW * 0.42; // 42% for value column

  autoTable(doc, {
    startY: 46,
    head: [['Metric', 'Value']],
    body: buildReportRows(stats),
    theme: 'striped',
    tableWidth: usableW,
    headStyles: { fillColor: [49, 130, 206], textColor: 255, fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 10, overflow: 'linebreak' },
    alternateRowStyles: { fillColor: [235, 244, 255] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: col0W },
      1: { halign: 'right', cellWidth: col1W },
    },
    margin: { left: 14, right: 14 },
  });

  // â”€â”€ Section: Revenue Breakdown â”€â”€
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
      tableWidth: usableW,
      headStyles: { fillColor: [56, 178, 172], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 10, overflow: 'linebreak' },
      alternateRowStyles: { fillColor: [240, 255, 254] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: col0W },
        1: { halign: 'right', cellWidth: col1W },
      },
      margin: { left: 14, right: 14 },
    });
  }

  // â”€â”€ Footer â”€â”€
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}  â€¢  Clovia Admin Report`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
  }

  doc.save(`clovia-report-${now.toISOString().slice(0, 10)}.pdf`);
}

async function exportToDOCX(stats: AdminStats) {
  const now = new Date();
  const rows = buildReportRows(stats);

  const makeCell = (text: string, bold = false, shade?: string) =>
    new TableCell({
      shading: shade
        ? { type: ShadingType.CLEAR, color: 'auto', fill: shade }
        : { type: ShadingType.CLEAR, color: 'auto', fill: 'FFFFFF' },
      width: { size: 50, type: WidthType.PERCENTAGE },
      margins: { top: 80, bottom: 80, left: 140, right: 140 },
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
            text: 'Clovia Admin â€” Site Usage Report',
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
            layout: TableLayoutType.FIXED,
            rows: tableRows,
          }),
          ...(revenueRows.length > 0
            ? [
              new Paragraph({ text: '' }),
              new Paragraph({ text: 'Revenue Breakdown (Last 4 Weeks)', heading: HeadingLevel.HEADING_2 }),
              new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows: revenueRows }),
            ]
            : []),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Clovia Admin Report  â€¢  Confidential', size: 16, color: '999999', italics: true }),
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

// â”€â”€â”€ Calendar Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          { color: 'blue.400', label: 'Medium (4â€“10)' },
          { color: 'orange.400', label: 'Low (1â€“3)' },
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

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // Admin lists state
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsPage, setProductsPage] = useState(1);
  const [productsTotalPages, setProductsTotalPages] = useState(1);

  // Reports state
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsTotalPages, setReportsTotalPages] = useState(1);
  const [reportsStatusFilter, setReportsStatusFilter] = useState('');

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'user' | 'product' | 'campaign'; id: number; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Campaigns state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const { isOpen: isCampaignModalOpen, onOpen: openCampaignModal, onClose: closeCampaignModal } = useDisclosure();
  const [editingCampaign, setEditingCampaign] = useState<Partial<Campaign> | null>(null);
  const [campaignFormLoading, setCampaignFormLoading] = useState(false);

  // ID/COR verifications (admin review)
  type VerificationItem = {
    id: number;
    name: string;
    email: string;
    verification_status: string;
    school_name: string;
    school_email: string;
    school_email_verified_at?: string;
    verification_rejection_reason?: string;
    document_type?: string;
    has_id_image: boolean;
  };
  const [verifications, setVerifications] = useState<VerificationItem[]>([]);
  const [verificationsLoading, setVerificationsLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<VerificationItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [idImageModal, setIdImageModal] = useState<{ userId: number; name: string } | null>(null);
  const [idImageUrl, setIdImageUrl] = useState<string | null>(null);

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

  // â”€â”€ Connection check â”€â”€
  const checkConnection = useCallback(async () => {
    try {
      const status = await checkConnectionStatus();
      setConnectionStatus({ online: !!status.online, apiReachable: !!status.apiReachable });
      setShowConnectionAlert(!status.online || !status.apiReachable);
    } catch { }
  }, []);

  // â”€â”€ Fetch main stats â”€â”€
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

  // â”€â”€ Fetch calendar daily stats â”€â”€
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
      // silently fail â€” calendar is supplementary
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  // â”€â”€ Fetch stats for a specific day â”€â”€
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

  // â”€â”€ Export handlers â”€â”€
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

  // â”€â”€ Fetch reports for admin â”€â”€
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

  // â”€â”€ Update report status â”€â”€
  const handleUpdateReportStatus = useCallback(async (reportId: number, newStatus: string) => {
    try {
      await api.put(`/api/admin/reports/${reportId}/status`, { status: newStatus });
      toast({ title: 'Report updated', status: 'success', duration: 2000, isClosable: true });
      fetchAdminReports(reportsPage, reportsStatusFilter);
    } catch (err: any) {
      toast({
        title: 'Failed to update report',
        description: err?.response?.data?.error || 'Update failed',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [reportsPage, reportsStatusFilter, fetchAdminReports, toast]);

  // â”€â”€ Fetch users for admin list â”€â”€
  const fetchAdminUsers = useCallback(
    async (page = 1) => {
      try {
        setUsersLoading(true);
        const response = await api.get<APIResponse<PaginatedResponse<User>>>(`/api/admin/users?page=${page}&limit=10`);
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

  // â”€â”€ Fetch products for admin list â”€â”€
  const fetchAdminProducts = useCallback(
    async (page = 1) => {
      try {
        setProductsLoading(true);
        const response = await api.get<APIResponse<PaginatedResponse<Product>>>(`/api/admin/products?page=${page}&limit=10`);
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

  // â”€â”€ Suspend handler â”€â”€
  const handleToggleSuspend = useCallback(async (user: User) => {
    try {
      const isSuspended = user.role === 'suspended';
      const endpoint = `/api/admin/users/${user.id}/${isSuspended ? 'unsuspend' : 'suspend'}`;

      await api.put(endpoint);

      // Update local state without full refresh
      setUsers(prev => prev.map(u =>
        u.id === user.id ? { ...u, role: isSuspended ? 'user' : 'suspended' } : u
      ));

      toast({
        title: isSuspended ? 'User Unsuspended' : 'User Suspended',
        description: `Successfully ${isSuspended ? 'restored' : 'suspended'} ${user.name}'s account.`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (err: any) {
      toast({
        title: 'Action failed',
        description: err?.response?.data?.error || `Failed to modify user status.`,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  }, [toast]);

  // â”€â”€ Fetch campaigns for admin list â”€â”€
  const fetchAdminCampaigns = useCallback(async () => {
    try {
      setCampaignsLoading(true);
      const response = await api.get('/api/admin/campaigns');
      if (response.data?.success) {
        setCampaigns(response.data.data || []);
      }
    } catch (err: any) {
      toast({
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

  // â”€â”€ Save campaign (Create/Update) â”€â”€
  const handleSaveCampaign = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign?.title) {
      toast({ title: 'Title is required', status: 'warning', duration: 2000 });
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
        toast({ title: 'Campaign updated', status: 'success', duration: 3000 });
      } else {
        // Create
        await api.post('/api/admin/campaigns', Object.assign({
          target_users: 'all',
          frequency: 'once_per_user',
          is_active: true,
        }, payload));
        toast({ title: 'Campaign created', status: 'success', duration: 3000 });
      }
      closeCampaignModal();
      setEditingCampaign(null);
      fetchAdminCampaigns();
    } catch (err: any) {
      toast({
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

  // â”€â”€ Toggle campaign active status â”€â”€
  const handleToggleCampaignStatus = useCallback(async (camp: Campaign) => {
    try {
      await api.put(`/api/admin/campaigns/${camp.id}`, { is_active: !camp.is_active });
      toast({ title: `Campaign ${!camp.is_active ? 'activated' : 'deactivated'}`, status: 'success', duration: 2000 });
      fetchAdminCampaigns();
    } catch (err: any) {
      toast({ title: 'Status update failed', status: 'error', duration: 3000 });
    }
  }, [toast, fetchAdminCampaigns]);

  // â”€â”€ Fetch ID/COR verifications (pending & rejected) â”€â”€
  const fetchAdminVerifications = useCallback(async () => {
    try {
      setVerificationsLoading(true);
      const response = await api.get<APIResponse<VerificationItem[]>>('/api/admin/verifications');
      if (response.data?.success && Array.isArray(response.data.data)) {
        setVerifications(response.data.data);
      } else {
        setVerifications([]);
      }
    } catch (err: any) {
      toast({
        title: 'Failed to load verifications',
        description: err?.response?.data?.error || err.message || 'Unable to fetch verifications',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
      setVerifications([]);
    } finally {
      setVerificationsLoading(false);
    }
  }, [toast]);

  // â”€â”€ View ID image (fetch as blob and show in modal) â”€â”€
  const handleViewIdImage = useCallback(async (userId: number, name: string) => {
    setIdImageModal({ userId, name });
    setIdImageUrl(null);
    try {
      const response = await api.get(`/api/admin/verifications/${userId}/image`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      setIdImageUrl(url);
    } catch (err: any) {
      toast({
        title: 'Could not load image',
        description: err?.response?.data?.error || 'Image not found or access denied',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      setIdImageModal(null);
    }
  }, [toast]);

  const closeIdImageModal = useCallback(() => {
    if (idImageUrl) URL.revokeObjectURL(idImageUrl);
    setIdImageUrl(null);
    setIdImageModal(null);
  }, [idImageUrl]);

  // â”€â”€ Approve verification â”€â”€
  const handleApproveVerification = useCallback(async (userId: number) => {
    try {
      await api.post(`/api/admin/verifications/${userId}/approve`);
      toast({ title: 'User verified', description: 'Verification approved.', status: 'success', duration: 3000, isClosable: true });
      fetchAdminVerifications();
    } catch (err: any) {
      toast({
        title: 'Approve failed',
        description: err?.response?.data?.error || 'Could not approve',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [toast, fetchAdminVerifications]);

  // â”€â”€ Reject verification (open modal to enter reason) â”€â”€
  const openRejectModal = useCallback((item: VerificationItem) => {
    setRejectTarget(item);
    setRejectReason('');
  }, []);

  const handleConfirmReject = useCallback(async () => {
    if (!rejectTarget) return;
    try {
      setRejectLoading(true);
      await api.post(`/api/admin/verifications/${rejectTarget.id}/reject`, { reason: rejectReason || 'Not specified' });
      toast({ title: 'Verification declined', description: 'User has been notified.', status: 'success', duration: 3000, isClosable: true });
      setRejectTarget(null);
      setRejectReason('');
      fetchAdminVerifications();
    } catch (err: any) {
      toast({
        title: 'Reject failed',
        description: err?.response?.data?.error || 'Could not reject',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setRejectLoading(false);
    }
  }, [rejectTarget, rejectReason, toast, fetchAdminVerifications]);

  // â”€â”€ Delete handlers â”€â”€
  const askDeleteUser = useCallback((user: User) => {
    setDeleteTarget({ type: 'user', id: user.id, name: user.name || user.email });
    openDeleteDialog();
  }, [openDeleteDialog]);

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
          title: 'Campaign deleted',
          status: 'success',
          duration: 3000,
        });
      }
    } catch (err: any) {
      toast({
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
    checkConnection();
    fetchAdminStats();
    fetchAdminUsers(1);
    fetchAdminProducts(1);
    fetchAdminReports(1);
    fetchAdminVerifications();
    fetchAdminCampaigns();
    const connectionInterval = setInterval(checkConnection, 30000);
    return () => clearInterval(connectionInterval);
  }, [checkConnection, fetchAdminStats, fetchAdminUsers, fetchAdminProducts, fetchAdminReports, fetchAdminVerifications, fetchAdminCampaigns]);

  useEffect(() => {
    fetchDailyStats(calYear, calMonth);
  }, [calYear, calMonth, fetchDailyStats]);

  // â”€â”€ Loading / Error / No-data states â”€â”€


  // â”€â”€ Sidebar / SPA state â”€â”€
  type SectionId = 'overview' | 'moderation' | 'management' | 'system';
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const { isOpen: isSidebarOpen, onOpen: openSidebar, onClose: closeSidebar } = useDisclosure();

  // â”€â”€ Report action moderation state â”€â”€
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
        title: `Action applied: ${action}`,
        description: `Report #${report.id} has been updated.`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      fetchAdminReports(reportsPage, reportsStatusFilter);
    } catch (err: any) {
      toast({ title: 'Action failed', description: err?.response?.data?.error || 'Could not apply action', status: 'error', duration: 3000, isClosable: true });
    } finally {
      setModerationLoading(false);
      setModerationTarget(null);
    }
  }, [moderationTarget, fetchAdminReports, reportsPage, reportsStatusFilter, toast]);

  // â”€â”€ Sidebar nav config â”€â”€
  const sidebarNav = [
    { id: 'overview' as SectionId, label: 'Overview', icon: FiHome, description: 'Metrics & charts' },
    { id: 'moderation' as SectionId, label: 'Moderation Queue', icon: FiAlertTriangle, description: 'Reports & verifications', badge: (reports.filter((r: any) => r.status === 'pending').length + verifications.filter(v => v.verification_status === 'pending').length) || undefined },
    { id: 'management' as SectionId, label: 'Management', icon: FiGrid, description: 'Users, items & campaigns' },
    { id: 'system' as SectionId, label: 'System', icon: FiSettings, description: 'Metrics & calendar' },
  ];

  const isMobile = useBreakpointValue({ base: true, lg: false });

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
  // â”€â”€ Main render â”€â”€


  // â”€â”€ Sidebar nav item component â”€â”€
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

  // â”€â”€ Sidebar content â”€â”€
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

  // â”€â”€ Metric card with hover lift â”€â”€
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

  // â”€â”€ Chart Skeleton â”€â”€
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

  // â”€â”€ SECTION: Overview â”€â”€
  const OverviewSection = () => (
    <VStack spacing={8} pr={20} align="stretch">
      {/* User metrics group */}
      <Box>
        <HStack mb={4} spacing={2}>
          <Icon as={FiUsers} color="brand.500" />
          <Text fontWeight="700" color={textColor} fontSize="sm" textTransform="uppercase" letterSpacing="wide">Users</Text>
        </HStack>
        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>
          <MetricCard icon={FiUsers} color="indigo" label="Total Users" value={stats!.total_users} />
          <MetricCard icon={FiStar} color="violet" label="Premium Users" value={stats!.premium_users} />
          <MetricCard icon={FiShield} color="brand" label="Verified Users" value={stats!.verified_users} />
          <MetricCard icon={FiUsers} color="orange" label="New Today" value={stats!.new_users_today} />
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
                <Box w={9} h={9} bg="purple.50" borderRadius="lg" display="flex" alignItems="center" justifyContent="center" mr={1}>
                  <Icon as={FiBarChart2} color="purple.500" boxSize={5} />
                </Box>
                <Text fontSize="sm" color={mutedTextColor} fontWeight="500">Revenue (Last 4 Weeks)</Text>
              </HStack>
              <VStack spacing={2} align="stretch">
                {stats!.revenue_breakdown?.slice(0, 3).map((r, i) => (
                  <HStack key={i} justify="space-between">
                    <Text fontSize="xs" color="#64748b">{r.period}</Text>
                    <Text fontSize="xs" fontWeight="700" color="green.600">{formatCurrency(r.amount)}</Text>
                  </HStack>
                ))}
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
              <Box h="300px">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'Total', value: stats!.total_users || 0 },
                    { name: 'Premium', value: stats!.premium_users || 0 },
                    { name: 'Verified', value: stats!.verified_users || 0 },
                  ]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" style={{ fontSize: '11px' }} />
                    <YAxis stroke="#94a3b8" style={{ fontSize: '11px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }} />
                    <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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

  // â”€â”€ SECTION: Moderation Queue â”€â”€
  const ModerationSection = () => (
    <VStack spacing={8} align="stretch">
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
                      <Th color={mutedTextColor} w="88px" px={2}>Reporter</Th>
                      <Th color={mutedTextColor} w="88px" px={2}>Reported</Th>
                      <Th color={mutedTextColor} w="96px" px={2}>Reason</Th>
                      <Th color={mutedTextColor} w="88px" px={2}>Status</Th>
                      <Th color={mutedTextColor} w="76px" px={2} display={{ base: 'none', md: 'table-cell' }}>Date</Th>
                      <Th color={mutedTextColor} w="44px" px={1} textAlign="center">Act</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {reports.map((report: any) => (
                      <Tr key={report.id} _hover={{ bg: hoverBg }}>
                        <Td px={2} fontWeight="bold" color="gray.500" fontSize="xs">#{report.id}</Td>
                        <Td px={2}><Text fontSize="xs" isTruncated>{report.reporter_id}</Text></Td>
                        <Td px={2}><Text fontSize="xs" isTruncated>{report.reported_user_id}</Text></Td>
                        <Td px={2}><Badge colorScheme={report.reason === 'scam' ? 'red' : report.reason === 'counterfeit' ? 'orange' : 'gray'} borderRadius="full" px={1} fontSize="2xs" textTransform="capitalize">{report.reason || 'Other'}</Badge></Td>
                        <Td px={2}><Badge colorScheme={report.status === 'pending' ? 'orange' : report.status === 'resolved' ? 'green' : report.status === 'reviewed' ? 'blue' : 'gray'} borderRadius="full" px={1} fontSize="2xs" textTransform="capitalize">{report.status}</Badge></Td>
                        <Td px={2} fontSize="xs" color={mutedTextColor} display={{ base: 'none', md: 'table-cell' }}>{report.created_at ? new Date(report.created_at).toLocaleDateString() : '-'}</Td>
                        <Td px={1} textAlign="center">
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

      {/* ID Verifications */}
      <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" maxW="5xl">
        <CardHeader>
          <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
            <HStack>
              <Icon as={FiShield} color="brand.500" boxSize={5} />
              <Heading size="sm" color={textColor}>ID / COR Verifications</Heading>
              {verifications.filter(v => v.verification_status === 'pending').length > 0 && (
                <Badge colorScheme="orange" borderRadius="full" px={2}>{verifications.filter(v => v.verification_status === 'pending').length} pending</Badge>
              )}
            </HStack>
            <Button size="sm" leftIcon={<FiRefreshCw />} onClick={fetchAdminVerifications} isLoading={verificationsLoading}>Refresh</Button>
          </Flex>
        </CardHeader>
        <CardBody overflowX="auto" px={0}>
          {verificationsLoading ? (
            <Center py={8}><Spinner color="teal.500" /></Center>
          ) : verifications.length === 0 ? (
            <Center py={8}><VStack spacing={2}><Icon as={FiShield} boxSize={10} color="gray.300" /><Text color="#64748b">No pending verifications</Text></VStack></Center>
          ) : (
            <ChakraTable variant="simple" size="sm">
              <Thead bg={headerBg}>
                <Tr>
                  <Th color={mutedTextColor}>User</Th><Th color={mutedTextColor}>School</Th><Th color={mutedTextColor}>School Email</Th>
                  <Th color={mutedTextColor}>Doc</Th><Th color={mutedTextColor}>Status</Th><Th color={mutedTextColor}>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {verifications.map(item => (
                  <Tr key={item.id} _hover={{ bg: hoverBg }}>
                    <Td><VStack align="start" spacing={0}><Text fontWeight="600" fontSize="sm">{item.name || `User #${item.id}`}</Text><Text fontSize="xs" color={mutedTextColor}>{item.email}</Text></VStack></Td>
                    <Td fontSize="sm">{item.school_name || '-'}</Td>
                    <Td fontSize="sm">{item.school_email || '-'}</Td>
                    <Td><Tag size="sm" colorScheme="blue" textTransform="uppercase">{item.document_type || 'id'}</Tag></Td>
                    <Td><Badge colorScheme={item.verification_status === 'pending' ? 'orange' : 'red'} borderRadius="full" px={2}>{item.verification_status === 'pending' ? 'Pending' : 'Rejected'}</Badge></Td>
                    <Td>
                      <HStack spacing={2}>
                        {item.has_id_image && <Tooltip label="View ID/COR" hasArrow><IconButton aria-label="View ID" size="sm" variant="outline" icon={<FiEye />} onClick={() => handleViewIdImage(item.id, item.name)} /></Tooltip>}
                        {item.verification_status === 'pending' && (
                          <>
                            <Button size="xs" colorScheme="green" leftIcon={<FiCheck />} onClick={() => handleApproveVerification(item.id)}>Verify</Button>
                            <Button size="xs" colorScheme="red" variant="outline" leftIcon={<FiX />} onClick={() => openRejectModal(item)}>Decline</Button>
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
    </VStack>
  );

  // â”€â”€ SECTION: Management â”€â”€
  const ManagementSection = () => (
    <VStack spacing={8} align="stretch">
      {/* Users */}
      <Card bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="xl" maxW="5xl">
        <CardHeader>
          <Heading size="sm" color={textColor}>Users</Heading>
          <Text fontSize="xs" color={mutedTextColor} mt={1}>View all registered users and manage accounts.</Text>
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
                    <Th textAlign="right" color={mutedTextColor} w="76px" px={1}>Act</Th>
                  </Tr></Thead>
                  <Tbody>
                    {users.map(user => (
                      <Tr key={user.id} _hover={{ bg: hoverBg }}>
                        <Td px={2}><HStack spacing={2}><VerifiedAvatar size="xs" name={user.name} src={user.profile_picture || undefined} isVerified={user.verified || user.verification_status === 'verified' || false} /><VStack spacing={0} align="start" minW={0}><Text fontWeight="600" fontSize="xs" isTruncated maxW="120px">{user.name || 'Unnamed'}</Text><Text fontSize="xs" color={mutedTextColor}>#{user.id}</Text></VStack></HStack></Td>
                        <Td px={2} display={{ base: 'none', md: 'table-cell' }}><Text fontSize="xs" isTruncated maxW="160px">{user.email}</Text></Td>
                        <Td px={2}><Tag size="sm" colorScheme={user.role === 'admin' ? 'purple' : user.role === 'suspended' ? 'red' : 'blue'} fontSize="xs">{user.role}</Tag></Td>
                        <Td px={2} display={{ base: 'none', sm: 'table-cell' }}><Tag size="sm" colorScheme={user.verified ? 'green' : 'gray'} fontSize="xs">{user.verified ? 'Verified' : '—'}</Tag></Td>
                        <Td textAlign="right" px={1}>
                          <HStack spacing={1} justify="flex-end">
                            {user.role !== 'admin' && <Tooltip label={user.role === 'suspended' ? 'Unsuspend' : 'Suspend'} hasArrow><IconButton aria-label="Toggle suspend" size="xs" colorScheme={user.role === 'suspended' ? 'green' : 'orange'} variant="ghost" icon={user.role === 'suspended' ? <FiCheckCircle /> : <FiXCircle />} onClick={() => handleToggleSuspend(user)} /></Tooltip>}
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
        <CardHeader>
          <Heading size="sm" color={textColor}>Items</Heading>
          <Text fontSize="xs" color={mutedTextColor} mt={1}>Inspect and manage marketplace listings.</Text>
        </CardHeader>
        <CardBody px={0} pb={2}>
          {productsLoading ? <Center py={6}><Spinner color="brand.500" /></Center> : products.length === 0 ? <Text fontSize="sm" color={mutedTextColor} px={4}>No items found.</Text> : (
            <>
              <Box overflowX="auto" w="full">
                <ChakraTable size="sm" variant="simple" style={{ tableLayout: 'fixed', width: '100%', minWidth: '480px' }}>
                  <Thead><Tr>
                    <Th color={mutedTextColor} px={2}>Item</Th>
                    <Th color={mutedTextColor} px={2} display={{ base: 'none', md: 'table-cell' }}>Seller</Th>
                    <Th color={mutedTextColor} w="80px" px={2}>Status</Th>
                    <Th isNumeric color={mutedTextColor} w="88px" px={2} display={{ base: 'none', sm: 'table-cell' }}>Price</Th>
                    <Th textAlign="right" color={mutedTextColor} w="44px" px={1}></Th>
                  </Tr></Thead>
                  <Tbody>
                    {products.map(product => (
                      <Tr key={product.id} _hover={{ bg: hoverBg }}>
                        <Td><HStack spacing={3}><Avatar size="sm" variant="rounded" name={product.title} src={product.image_urls?.[0] || undefined} /><VStack spacing={0} align="start"><Text fontWeight="600" fontSize="sm" noOfLines={1} maxW="150px">{product.title}</Text><Text fontSize="xs" color={mutedTextColor}>ID #{product.id}</Text></VStack></HStack></Td>
                        <Td><Text fontSize="sm">{product.seller_name || `User #${product.seller_id}`}</Text></Td>
                        <Td><Tag size="sm" colorScheme={product.status === 'available' ? 'green' : 'gray'}>{product.status}</Tag></Td>
                        <Td isNumeric><Text fontSize="sm">{product.price != null ? formatCurrency(product.price) : 'â€”'}</Text></Td>
                        <Td textAlign="right"><Tooltip label="Delete item" hasArrow><IconButton aria-label="Delete item" size="sm" colorScheme="red" variant="ghost" icon={<FiTrash2 />} onClick={() => askDeleteProduct(product)} /></Tooltip></Td>
                      </Tr>
                    ))}
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

  // â”€â”€ SECTION: System â”€â”€
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
      <Box minH="100vh" bg={useColorModeValue('gray.50', 'gray.900')} display="flex">

        {/* â”€â”€ Desktop Sidebar â”€â”€ */}
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

        {/* â”€â”€ Mobile Sidebar Drawer â”€â”€ */}
        <Drawer isOpen={isSidebarOpen} placement="left" onClose={closeSidebar}>
          <DrawerOverlay />
          <DrawerContent maxW="260px">
            <DrawerCloseButton />
            <DrawerBody p={0} pt={8}>
              <SidebarContent />
            </DrawerBody>
          </DrawerContent>
        </Drawer>

        {/* â”€â”€ Main Content â”€â”€ */}
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
                <Button leftIcon={<FiRefreshCw />} onClick={handleRefresh} size="sm" colorScheme="brand" variant="outline" isLoading={loading}>Refresh</Button>
                <Menu>
                  <MenuButton as={Button} leftIcon={<FiPrinter />} rightIcon={<FiChevronDown />} size="sm" colorScheme="brand" isLoading={exportLoading} loadingText="Exporting…">Export</MenuButton>
                  <MenuList shadow="lg" borderRadius="lg">
                    <MenuItem icon={<FiFileText />} onClick={handleExportPDF}>Export as PDF</MenuItem>
                    <MenuItem icon={<FiFileText />} onClick={handleExportDOCX}>Export as DOCX</MenuItem>
                  </MenuList>
                </Menu>
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

        {/* â”€â”€ Day Detail Modal â”€â”€ */}
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

        {/* â”€â”€ Moderation Action Confirm Dialog â”€â”€ */}
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

        {/* â”€â”€ ID Image Modal â”€â”€ */}
        <Modal isOpen={!!idImageModal} onClose={closeIdImageModal} size="xl">
          <ModalOverlay />
          <ModalContent borderRadius="xl">
            <ModalHeader>ID / COR â€” {idImageModal?.name}</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={4}>
              {idImageUrl ? <Box as="img" src={idImageUrl} alt="Submitted ID" maxH="70vh" mx="auto" borderRadius="md" /> : <Center py={8}><Spinner size="lg" color="brand.500" /></Center>}
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* â”€â”€ Reject Verification Modal â”€â”€ */}
        <Modal isOpen={!!rejectTarget} onClose={() => { setRejectTarget(null); setRejectReason(''); }}>
          <ModalOverlay />
          <ModalContent borderRadius="xl">
            <ModalHeader>Decline Verification</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Text fontSize="sm" color="#64748b" mb={3}>User: <strong>{rejectTarget?.name}</strong> ({rejectTarget?.email})</Text>
              <Textarea placeholder="e.g. Document does not appear to be a valid school ID or COR" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
            </ModalBody>
            <Box px={6} pb={4} pt={2}><HStack justify="flex-end" spacing={3}><Button variant="ghost" onClick={() => { setRejectTarget(null); setRejectReason(''); }}>Cancel</Button><Button colorScheme="red" onClick={handleConfirmReject} isLoading={rejectLoading}>Decline</Button></HStack></Box>
          </ModalContent>
        </Modal>

        {/* â”€â”€ Campaign Create/Edit Modal â”€â”€ */}
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

        {/* â”€â”€ Delete Confirmation Dialog â”€â”€ */}
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
