import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Button,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  VStack,
  HStack,
  Box,
  Text,
  Badge,
  Image,
  Icon,
  IconButton,
  useToast,
  Heading,
  Avatar,
  useColorModeValue,
  Stack,
  Progress,
  useDisclosure,
  Flex,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Spinner,
  Textarea,
  SimpleGrid,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Card,
  CardBody,
  Divider,
} from '@chakra-ui/react'
import {
  FaArrowRight,
  FaCheck,
  FaTimes,
  FaClock,
  FaBox,
  FaMapMarkerAlt,
  FaChevronDown,
  FaTruck,
  FaHandshake,
  FaPaperPlane,
  FaSmile,
  FaExclamationTriangle,
  FaCheckCircle,
  FaCalendarAlt,
  FaStore,
  FaCamera,
  FaStar,
  FaSearch,
} from 'react-icons/fa'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { MultiWayTrade, MultiWayTradeParticipant, Trade } from '../types'
import { getProductUrl } from '../utils/productUtils'
import { getImageUrl } from '../utils/imageUtils'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import TradeCompletionModal from './TradeCompletionModal'
import {
  acceptMultiWayTrade,
  declineMultiWayTrade,
  executeMultiWayTrade,
  cancelTradeLoop,
  reinviteTradeLoop,
  fetchTradeLoopMeetup,
  updateTradeLoopMeetup,
} from '../services/tradeService'

// Fix generic leaflet icon
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

const MapUpdater = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap()
  useEffect(() => {
    const timers = [
      setTimeout(() => {
        map.invalidateSize()
        map.setView([lat, lng], 16, { animate: true })
      }, 350),
      setTimeout(() => {
        map.invalidateSize()
        map.setView([lat, lng], 16, { animate: true })
      }, 700),
    ]
    return () => timers.forEach(t => clearTimeout(t))
  }, [lat, lng, map])
  return null
}

const ModalMapFix = () => {
  const map = useMap()
  useEffect(() => {
    const timers = [
      setTimeout(() => map.invalidateSize(), 350),
      setTimeout(() => map.invalidateSize(), 600),
      setTimeout(() => map.invalidateSize(), 1000),
    ]
    return () => timers.forEach(t => clearTimeout(t))
  }, [map])
  return null
}

const MapClickPicker = ({ onPick }: { onPick: (lat: number, lng: number) => void }) => {
  useMapEvents({
    click: (event) => {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

const formatTimePH = (time?: string | null): string => {
  if (!time) return ''
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const date = new Date()
  date.setHours(hour)
  date.setMinutes(minute)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const buildMeetupKey = (location?: string | null, date?: string | null, time?: string | null): string | null => {
  if (!location || !date || !time) return null
  return `${location.trim().toLowerCase()}|${date.trim()}|${time.trim()}`
}

interface MeetupLocation {
  name: string
  address: string
  type: 'cafe' | 'mall' | 'public' | 'other'
  lat?: number
  lng?: number
  isPartner?: boolean
}

// Helper to get user profile URL using slug if available, otherwise ID
const getUserProfileUrl = (userId: number, userSlug?: string): string => {
  return `/profile/${userSlug || userId}`
}

interface MultiWayTradeModalProps {
  isOpen: boolean
  onClose: () => void
  multiWayTrade: MultiWayTrade
  onTradeCompleted?: () => void
  canManage?: boolean
  currentUserId?: number
}

interface TradeMessage {
  id: number
  trade_id: number
  sender_id: number
  content: string
  created_at: string
  sender_name?: string
}

const linkBlockPattern = /(https?:\/\/|www\.|facebook\.com|fb\.com|m\.me|instagram\.com|t\.me|telegram\.me|wa\.me|whatsapp\.com)/i
const isBlockedMessage = (value: string): boolean => {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^photo:/i.test(trimmed)) return true
  return linkBlockPattern.test(trimmed)
}

/** Format ms remaining as "Xh Ym" or "Expired" */
function formatTimeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${m}m remaining`
}

/** Human-readable label for raw DB status strings */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    user3_accepted: 'Accepted',
    active: 'Active',
    pending_user3: 'Awaiting 3rd Party',
    accepted: 'Accepted',
    declined: 'Declined',
    completed: 'Completed',
    cancelled: 'Cancelled',
    in_progress: 'In Progress',
    multiway_active: 'Active',
    pending_initiator_upgrade: 'Upgrade Required',
  }
  return map[status] || status.replace(/_/g, ' ')
}

function statusColorScheme(status: string): string {
  switch (status) {
    case 'pending':
      return 'yellow'
    case 'confirmed':
      return 'green'
    case 'pending_user3':
    case 'pending_initiator_upgrade':
      return 'yellow'
    case 'accepted':
    case 'user3_accepted':
      return 'green'
    case 'active':
    case 'multiway_active':
    case 'in_progress':
      return 'blue'
    case 'declined':
    case 'cancelled':
      return 'red'
    case 'completed':
      return 'cyan'
    default:
      return 'gray'
  }
}

const MultiWayTradeModal: React.FC<MultiWayTradeModalProps> = ({
  isOpen,
  onClose,
  multiWayTrade,
  onTradeCompleted,
  canManage = false,
  currentUserId,
}) => {
  const { user } = useAuth()
  const viewerUserId = currentUserId ?? user?.id
  const isActiveChain =
    multiWayTrade.status === 'confirmed'

  const [loading, setLoading] = useState(false)
  const [selectedAction, setSelectedAction] = useState<
    'accept' | 'decline' | 'execute' | 'cancel' | 'reinvite' | null
  >(null)
  const [activeTab, setActiveTab] = useState(0)
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [reviewTrade, setReviewTrade] = useState<Trade | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [loadingReviewTrade, setLoadingReviewTrade] = useState(false)

  // Meetup UI state
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [searchedLocations, setSearchedLocations] = useState<MeetupLocation[]>([])
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResults, setPlaceResults] = useState<Array<{ name: string; address: string; latitude: number; longitude: number }>>([])
  const [placeSearching, setPlaceSearching] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [showSuggestionsPanel, setShowSuggestionsPanel] = useState(false)
  const [mapInitKey, setMapInitKey] = useState(0)
  const [pinnedLocation, setPinnedLocation] = useState<MeetupLocation | null>(null)
  const [showPredefinedLocations, setShowPredefinedLocations] = useState(false)

  // Meetup Agreement / Dispute state (mirrors ViewTradeModal flow)
  const [meetupStatus, setMeetupStatus] = useState<{
    loop_id: string
    participants: Array<{
      user_id: number
      meetup_location: string
      meetup_date: string
      meetup_time: string
      meetup_confirmed: boolean
      met_confirmed: boolean
    }>
  } | null>(null)
  const [loadingMeetupStatus, setLoadingMeetupStatus] = useState(false)
  const [confirmingMeetup, setConfirmingMeetup] = useState(false)
  const [resettingMeetup, setResettingMeetup] = useState(false)
  const [confirmingMeetupDone, setConfirmingMeetupDone] = useState(false)
  const [agreeingToSchedule, setAgreeingToSchedule] = useState(false)

  const [meetupInDispute, setMeetupInDispute] = useState(false)
  const [meetupDisputeReason, setMeetupDisputeReason] = useState<
    'time' | 'date' | 'unresponsive' | 'conflict' | null
  >(null)
  const [disputeNotes, setDisputeNotes] = useState('')
  const [showDisputeDialog, setShowDisputeDialog] = useState(false)
  const cancelDialogRef = useRef<HTMLButtonElement>(null)

  // Chat state
  const [messages, setMessages] = useState<TradeMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [chatPhotoFile, setChatPhotoFile] = useState<File | null>(null)
  const [chatPhotoPreview, setChatPhotoPreview] = useState<string | null>(null)
  const [uploadingChatPhoto, setUploadingChatPhoto] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [userAvatarById, setUserAvatarById] = useState<Record<number, string>>({})
  const fetchedAvatarUserIdsRef = useRef<Set<number>>(new Set())
  const navigate = useNavigate()
  const toast = useToast()

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [rating, setRating] = useState(5)
  const [feedback, setFeedback] = useState('')
  const [proofImage, setProofImage] = useState<string | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewSubmitted, setReviewSubmitted] = useState(false)

  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const sectionBg = useColorModeValue('gray.50', 'gray.750')
  const legCardBg = useColorModeValue('white', 'gray.800')
  const locationTextColor = useColorModeValue('gray.800', 'gray.100')
  const partnerBg = useColorModeValue('orange.50', 'orange.900')
  const nearestBg = useColorModeValue('blue.50', 'blue.950')
  const partnerIconBg = useColorModeValue('orange.100', 'orange.800')
  const defaultIconBg = useColorModeValue('gray.100', 'gray.700')
  const meetupInfoBg = useColorModeValue('blue.50', 'blue.900')
  const meetupInfoTextColor = useColorModeValue('blue.700', 'blue.200')
  const proofRequired = true

  // Countdown timer
  useEffect(() => {
    if (!multiWayTrade.expires_at) return
    const tick = () => setTimeLeft(formatTimeLeft(multiWayTrade.expires_at!))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [multiWayTrade.expires_at])

  useEffect(() => {
    if (isOpen && activeTab === 2) {
      setMapInitKey(prev => prev + 1)
    }
  }, [isOpen, activeTab])

  const fetchMeetupStatus = async () => {
    if (!multiWayTrade.loop_id) return
    setLoadingMeetupStatus(true)
    try {
      const data = await fetchTradeLoopMeetup(multiWayTrade.loop_id)
      setMeetupStatus(data as any)
    } catch {
      setMeetupStatus(null)
    } finally {
      setLoadingMeetupStatus(false)
    }
  }

  useEffect(() => {
    if (!isOpen || !multiWayTrade.loop_id) return
    if (activeTab !== 2) return
    fetchMeetupStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, multiWayTrade.loop_id])

  // Fetch chat messages for loop
  useEffect(() => {
    if (!isOpen || !multiWayTrade.loop_id) return
    const fetchMessages = async () => {
      setLoadingMessages(true)
      try {
        const res = await api.get(`/api/trades/loops/${multiWayTrade.loop_id}/messages`)
        setMessages(Array.isArray(res.data?.data) ? res.data.data : [])
      } catch (error) {
        setMessages([])
      } finally {
        setLoadingMessages(false)
      }
    }
    fetchMessages()
  }, [isOpen, multiWayTrade.loop_id])

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sortedParticipants = useMemo(
    () =>
      [...multiWayTrade.participants].sort(
        (a, b) =>
          ((a as any).position_in_loop ?? (a as any).position ?? 0) -
          ((b as any).position_in_loop ?? (b as any).position ?? 0)
      ),
    [multiWayTrade.participants]
  )

  const meetupByUserId = useMemo(() => {
    const map: Record<
      number,
      {
        meetup_location: string
        meetup_date: string
        meetup_time: string
        meetup_confirmed: boolean
        met_confirmed: boolean
      }
    > = {}
    meetupStatus?.participants?.forEach((p) => {
      map[p.user_id] = {
        meetup_location: p.meetup_location,
        meetup_date: p.meetup_date,
        meetup_time: p.meetup_time,
        meetup_confirmed: !!p.meetup_confirmed,
        met_confirmed: !!p.met_confirmed,
      }
    })
    return map
  }, [meetupStatus])

  const participantIds = useMemo(() => sortedParticipants.map((p) => p.user_id), [sortedParticipants])

  const myMeetup = useMemo(() => {
    if (!viewerUserId) return null
    return meetupByUserId[viewerUserId] || null
  }, [meetupByUserId, viewerUserId])

  const myMeetupConfirmed = !!myMeetup?.meetup_confirmed
  const myMetConfirmed = !!myMeetup?.met_confirmed

  const anyMeetupConfirmed = useMemo(() => {
    return participantIds.some((uid) => meetupByUserId[uid]?.meetup_confirmed)
  }, [participantIds, meetupByUserId])

  const allMeetupConfirmed = useMemo(() => {
    if (participantIds.length === 0) return false
    return participantIds.every((uid) => meetupByUserId[uid]?.meetup_confirmed)
  }, [participantIds, meetupByUserId])

  const meetupAgreed = useMemo(() => {
    if (!allMeetupConfirmed) return false
    const keys = new Set<string>()
    for (const uid of participantIds) {
      const sel = meetupByUserId[uid]
      const key = buildMeetupKey(sel?.meetup_location, sel?.meetup_date, sel?.meetup_time)
      if (!key) return false
      keys.add(key)
    }
    return keys.size === 1
  }, [allMeetupConfirmed, meetupByUserId, participantIds])

  const meetupMismatch = allMeetupConfirmed && !meetupAgreed

  const allMetConfirmed = useMemo(() => {
    if (!meetupAgreed) return false
    return participantIds.every((uid) => meetupByUserId[uid]?.met_confirmed)
  }, [meetupAgreed, meetupByUserId, participantIds])

  const proposedMeetup = useMemo(() => {
    const list = meetupStatus?.participants || []
    const otherFirst = viewerUserId
      ? list.find((p) => p.user_id !== viewerUserId && p.meetup_confirmed)
      : undefined
    return otherFirst || list.find((p) => p.meetup_confirmed) || null
  }, [meetupStatus, viewerUserId])

  const agreedMeetup = useMemo(() => {
    if (!meetupAgreed) return null
    return (meetupStatus?.participants || []).find((p) => p.meetup_confirmed) || null
  }, [meetupAgreed, meetupStatus])

  const resolveAvatarSrc = (raw?: string | null): string | undefined => {
    if (!raw) return undefined
    return getImageUrl(raw)
  }

  // Fetch participant avatars for chat
  useEffect(() => {
    if (!isOpen) return
    if (!sortedParticipants.length) return

    let cancelled = false

    const fetchAvatarForUser = async (id: number) => {
      if (!id) return
      if (fetchedAvatarUserIdsRef.current.has(id)) return
      fetchedAvatarUserIdsRef.current.add(id)

      try {
        const res = await api.get(`/api/users/${id}`)
        const payload = res.data?.data || res.data
        const apiUser = (payload?.user || payload) as any
        const rawPic = apiUser?.profile_picture || apiUser?.avatar_url || apiUser?.org_logo_url || apiUser?.logo_url
        if (!rawPic) return

        if (!cancelled) {
          setUserAvatarById(prev => ({ ...prev, [id]: rawPic }))
        }
      } catch (_) {
        // Best-effort: fall back to initials
      }
    }

    sortedParticipants.forEach((p) => fetchAvatarForUser(Number(p.user_id)))

    return () => {
      cancelled = true
    }
  }, [isOpen, sortedParticipants])

  const completedLegs = multiWayTrade.edges.filter((e) => e.status === 'completed').length
  const totalLegs = multiWayTrade.edges.length
  const healthPct = totalLegs > 0 ? Math.round((completedLegs / totalLegs) * 100) : 0
  const isTwoWayLoop = sortedParticipants.length === 2
  const reviewTradeId = useMemo(() => {
    const edgeTradeId = multiWayTrade.edges.find((e) => e.trade_id)?.trade_id
    const participantTradeId = sortedParticipants.find((p) => p.trade_id)?.trade_id
    return edgeTradeId || participantTradeId || null
  }, [multiWayTrade.edges, sortedParticipants])

  // Show Execute button only when the overall trade is active AND every participant has accepted.
  const canExecute =
    ['active', 'confirmed', 'multiway_active', 'in_progress'].includes(multiWayTrade.status as string) &&
    sortedParticipants.every((p) =>
      ['accepted', 'confirmed', 'active', 'multiway_active', 'user3_accepted'].includes(p.trade_status)
    ) &&
    meetupAgreed &&
    allMetConfirmed

  const viewerParticipant = useMemo(() => {
    if (!viewerUserId) return null
    return sortedParticipants.find((p) => p.user_id === viewerUserId) || null
  }, [sortedParticipants, viewerUserId])

  const viewerHasAccepted = !!viewerParticipant &&
    ['accepted', 'confirmed', 'active', 'multiway_active', 'user3_accepted'].includes(viewerParticipant.trade_status)

  const canAcceptLoopTrade = (multiWayTrade.status as string) === 'pending' && !!viewerUserId && !viewerHasAccepted

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleRaiseDispute = async () => {
    if (!meetupDisputeReason) {
      toast({
        title: 'Please select a reason',
        status: 'warning',
        position: 'top',
      })
      return
    }

    setMeetupInDispute(true)
    setShowDisputeDialog(false)
    setMeetupDisputeReason(null)
    setDisputeNotes('')

    toast({
      title: 'Meetup marked as in dispute',
      description: 'You can propose alternative times or discuss the issue in chat.',
      status: 'info',
      position: 'top',
      duration: 3000,
    })
  }

  const getMeetupState = (): 'proposed' | 'dispute' | 'finalized' | 'none' | 'mismatch' => {
    if (meetupInDispute) return 'dispute'
    if (meetupAgreed) return 'finalized'
    if (meetupMismatch) return 'mismatch'
    if (anyMeetupConfirmed) return 'proposed'
    return 'none'
  }

  const handleAccept = async () => {
    try {
      setLoading(true)
      setSelectedAction('accept')
      await acceptMultiWayTrade(multiWayTrade.loop_id)
      toast({ id: 'mwt-accept', title: 'Trade accepted!', status: 'success' })
      onTradeCompleted?.()
      onClose()
    } catch (error: any) {
      toast({
        id: 'mwt-accept-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to accept trade',
        status: 'error',
      })
    } finally {
      setLoading(false)
      setSelectedAction(null)
    }
  }

  const handleDecline = async () => {
    try {
      setLoading(true)
      setSelectedAction('decline')
      await declineMultiWayTrade(multiWayTrade.loop_id)
      toast({ id: 'mwt-decline', title: 'Trade declined', status: 'info' })
      onClose()
    } catch (error: any) {
      toast({
        id: 'mwt-decline-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to decline trade',
        status: 'error',
      })
    } finally {
      setLoading(false)
      setSelectedAction(null)
    }
  }

  const handleExecute = async () => {
    try {
      setLoading(true)
      setSelectedAction('execute')
      await executeMultiWayTrade(multiWayTrade.loop_id)
      toast({ id: 'mwt-execute', title: 'Trade executed!', status: 'success' })
      onTradeCompleted?.()
      onClose()
    } catch (error: any) {
      toast({
        id: 'mwt-execute-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to execute trade',
        status: 'error',
      })
    } finally {
      setLoading(false)
      setSelectedAction(null)
    }
  }

  const handleLeaveReview = async () => {
    try {
      setLoadingReviewTrade(true)
      let tradeId = reviewTradeId
      if (!tradeId) {
        const resolverRes = await api.post(`/api/trades/loops/${multiWayTrade.loop_id}/review-trade`)
        tradeId = resolverRes.data?.data?.trade_id || null
      }

      if (!tradeId) {
        toast({
          id: 'mwt-review-missing',
          title: 'Review unavailable',
          description: 'No trade was found for this loop yet.',
          status: 'warning',
        })
        return
      }

      const res = await api.get(`/api/trades/${tradeId}`)
      const tradePayload = res.data?.data?.trade || res.data?.data || res.data
      setReviewTrade(tradePayload || null)
      setReviewOpen(true)
    } catch (error: any) {
      toast({
        id: 'mwt-review-load',
        title: 'Unable to load trade',
        description: error?.response?.data?.error || 'Failed to open review',
        status: 'error',
      })
    } finally {
      setLoadingReviewTrade(false)
    }
  }

  const handleCancelLoop = async () => {
    try {
      setLoading(true)
      setSelectedAction('cancel')
      await cancelTradeLoop(multiWayTrade.loop_id)
      toast({ id: 'mwt-cancel', title: 'Loop cancelled', status: 'info' })
      onTradeCompleted?.()
      onClose()
    } catch (error: any) {
      toast({
        id: 'mwt-cancel-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to cancel loop',
        status: 'error',
      })
    } finally {
      setLoading(false)
      setSelectedAction(null)
    }
  }

  const handleReinviteLoop = async () => {
    try {
      setLoading(true)
      setSelectedAction('reinvite')
      await reinviteTradeLoop(multiWayTrade.loop_id)
      toast({ id: 'mwt-reinvite', title: 'Loop reinvited', status: 'success' })
      onTradeCompleted?.()
      onClose()
    } catch (error: any) {
      toast({
        id: 'mwt-reinvite-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to reinvite loop',
        status: 'error',
      })
    } finally {
      setLoading(false)
      setSelectedAction(null)
    }
  }

  const handlePlaceSearch = async () => {
    const q = placeQuery.trim()
    if (q.length < 2) {
      setPlaceResults([])
      return
    }
    setPlaceSearching(true)
    try {
      const params = new URLSearchParams({ q })
      if (user?.latitude && user?.longitude) {
        params.set('lat', String(user.latitude))
        params.set('lng', String(user.longitude))
      }
      const res = await api.get(`/api/places/search?${params.toString()}`)
      setPlaceResults(res.data?.results || [])
    } catch {
      setPlaceResults([])
    } finally {
      setPlaceSearching(false)
    }
  }

  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0]
      setProofFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setProofImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const submitReview = async () => {
    if (!rating || !feedback.trim()) {
      toast({
        id: 'mwt-review-missing',
        title: 'Missing information',
        description: 'Please provide a rating and feedback.',
        status: 'warning',
      })
      return
    }

    if (proofRequired && !proofFile) {
      toast({
        id: 'mwt-review-proof-required',
        title: 'Proof image required',
        description: 'Please upload a proof image before submitting your review.',
        status: 'warning',
      })
      return
    }

    try {
      setSubmittingReview(true)

      if (proofFile) {
        const formData = new FormData()
        formData.append('image', proofFile)
        formData.append('type', 'trade_proof')
        const uploadRes = await api.post('/api/upload', formData)
        const uploadedProofUrl = uploadRes.data?.data?.url
        if (!uploadedProofUrl) {
          throw new Error(uploadRes.data?.error || 'Upload succeeded but no image URL was returned.')
        }
      }

      setSelectedAction('execute')
      await executeMultiWayTrade(multiWayTrade.loop_id)
      toast({ id: 'mwt-review-submitted', title: 'Review submitted', status: 'success' })
      onTradeCompleted?.()
      setReviewSubmitted(true)
    } catch (error: any) {
      toast({
        id: 'mwt-review-error',
        title: 'Error',
        description: error?.response?.data?.error || error?.message || 'Failed to complete trade',
        status: 'error',
      })
    } finally {
      setSubmittingReview(false)
      setSelectedAction(null)
    }
  }

  const handleChatPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast({ id: 'mwt-photo-type', title: 'Photo only', description: 'Please select an image file.', status: 'warning' })
      e.target.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ id: 'mwt-photo-size', title: 'File too large', description: 'Photo must be under 10MB.', status: 'warning' })
      e.target.value = ''
      return
    }
    if (chatPhotoPreview) {
      URL.revokeObjectURL(chatPhotoPreview)
    }
    setChatPhotoFile(file)
    setChatPhotoPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  const clearChatPhoto = () => {
    if (chatPhotoPreview) {
      URL.revokeObjectURL(chatPhotoPreview)
    }
    setChatPhotoPreview(null)
    setChatPhotoFile(null)
  }

  const uploadChatPhoto = async (): Promise<string | null> => {
    if (!chatPhotoFile) return null
    setUploadingChatPhoto(true)
    try {
      const formData = new FormData()
      formData.append('image', chatPhotoFile)
      const uploadRes = await api.post('/api/upload', formData)
      const uploadedUrl = uploadRes.data?.data?.url
      if (!uploadedUrl) throw new Error('No image URL returned')
      return uploadedUrl
    } catch (error: any) {
      toast({
        id: 'mwt-photo-upload',
        title: 'Photo upload failed',
        description: error?.response?.data?.error || 'Please try again.',
        status: 'error',
      })
      return null
    } finally {
      setUploadingChatPhoto(false)
    }
  }

  const handleSendMessage = async () => {
    if (!multiWayTrade.loop_id || sendingMessage) return
    const trimmed = newMessage.trim()
    const hasText = trimmed.length > 0
    const hasPhoto = !!chatPhotoFile

    if (!hasText && !hasPhoto) return

    if (hasText && isBlockedMessage(trimmed)) {
      toast({
        id: 'mwt-link-block',
        title: 'Links are not allowed',
        description: 'Please remove links. You can send photos instead.',
        status: 'warning',
      })
      return
    }

    setSendingMessage(true)
    try {
      if (hasText) {
        await api.post(`/api/trades/loops/${multiWayTrade.loop_id}/messages`, {
          content: trimmed,
        })
        setNewMessage('')
      }

      if (hasPhoto) {
        const uploadedUrl = await uploadChatPhoto()
        if (uploadedUrl) {
          await api.post(`/api/trades/loops/${multiWayTrade.loop_id}/messages`, {
            content: `photo:${uploadedUrl}`,
          })
          clearChatPhoto()
        }
      }

      const res = await api.get(`/api/trades/loops/${multiWayTrade.loop_id}/messages`)
      setMessages(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch (error: any) {
      toast({
        id: 'mwt-msg-err',
        title: 'Failed to send message',
        description: error?.response?.data?.error || 'Please try again',
        status: 'error',
      })
    } finally {
      setSendingMessage(false)
    }
  }

  const confirmMeetup = async () => {
    if (!multiWayTrade.loop_id || confirmingMeetup || myMeetupConfirmed) return
    if (!selectedLocation) {
      setValidationError('Please select a meetup location')
      return
    }

    const error = validateDateTimeSelection(selectedDate, selectedTime)
    if (error) {
      setValidationError(error)
      toast({
        id: 'mwt-meetup-validation',
        title: 'Invalid Selection',
        description: error,
        status: 'warning',
        duration: 3000,
      })
      return
    }

    try {
      setConfirmingMeetup(true)
      setValidationError(null)
      const updated = await updateTradeLoopMeetup(multiWayTrade.loop_id, 'confirm_meetup', {
        meetup_location: selectedLocation,
        meetup_date: selectedDate || undefined,
        meetup_time: selectedTime || undefined,
      })
      setMeetupStatus(updated as any)

      // Determine whether we agreed/mismatched with existing confirmed selections.
      const byUser: Record<number, any> = {}
      ;(updated as any)?.participants?.forEach((p: any) => {
        byUser[p.user_id] = p
      })
      const confirmed = (updated as any)?.participants?.filter((p: any) => p.meetup_confirmed) || []
      if (confirmed.length >= 2) {
        const keys = new Set<string>()
        confirmed.forEach((p: any) => {
          const k = buildMeetupKey(p.meetup_location, p.meetup_date, p.meetup_time)
          if (k) keys.add(k)
        })
        if (keys.size === 1 && confirmed.length === participantIds.length) {
          toast({
            id: 'mwt-meetup-agreed',
            title: 'Meetup Agreed!',
            description: 'All participants agreed on the same location and time.',
            status: 'success',
            duration: 5000,
          })
        } else if (confirmed.length === participantIds.length) {
          toast({
            id: 'mwt-meetup-mismatch',
            title: 'Selection Mismatch',
            description: 'Selections differ. Please coordinate to agree on the same location and time.',
            status: 'warning',
            duration: 5000,
          })
        } else {
          toast({
            id: 'mwt-meetup-submitted',
            title: 'Meetup selection submitted',
            description: 'Waiting for others to confirm...',
            status: 'info',
            duration: 3000,
          })
        }
      } else {
        toast({
          id: 'mwt-meetup-submitted',
          title: 'Meetup selection submitted',
          description: 'Waiting for other participants to select their preferences...',
          status: 'info',
          duration: 3000,
        })
      }

      await fetchMeetupStatus()
    } catch (error: any) {
      toast({
        id: 'mwt-meetup-confirm-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to confirm meetup',
        status: 'error',
      })
      await fetchMeetupStatus()
    } finally {
      setConfirmingMeetup(false)
    }
  }

  const resetMeetupSelection = async () => {
    if (!multiWayTrade.loop_id || resettingMeetup) return
    try {
      setResettingMeetup(true)
      await updateTradeLoopMeetup(multiWayTrade.loop_id, 'reset_meetup_selection')
      setSelectedLocation(null)
      setSelectedTime(null)
      setSelectedDate(null)
      toast({
        id: 'mwt-meetup-reset',
        title: 'Selection Reset',
        description: 'Your meetup selection has been cleared. You can now select new options.',
        status: 'info',
        duration: 3000,
      })
      await fetchMeetupStatus()
    } catch (error: any) {
      toast({
        id: 'mwt-meetup-reset-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to reset selection',
        status: 'error',
      })
    } finally {
      setResettingMeetup(false)
    }
  }

  const acceptSchedule = async () => {
    if (!multiWayTrade.loop_id || agreeingToSchedule || !proposedMeetup) return
    try {
      setAgreeingToSchedule(true)
      await updateTradeLoopMeetup(multiWayTrade.loop_id, 'confirm_meetup', {
        meetup_location: proposedMeetup.meetup_location,
        meetup_date: proposedMeetup.meetup_date,
        meetup_time: proposedMeetup.meetup_time,
      })
      toast({
        title: 'Schedule Accepted!',
        description: 'You have agreed to the proposed date and time.',
        status: 'success',
        duration: 3000,
      })
      await fetchMeetupStatus()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to accept schedule',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setAgreeingToSchedule(false)
    }
  }

  const confirmMeetupDone = async () => {
    if (!multiWayTrade.loop_id || confirmingMeetupDone) return
    try {
      setConfirmingMeetupDone(true)
      await updateTradeLoopMeetup(multiWayTrade.loop_id, 'confirm_meetup_done')
      toast({
        id: 'mwt-meetup-done',
        title: 'Confirmed',
        description: 'Waiting for others to confirm they met too.',
        status: 'success',
        duration: 3000,
      })
      await fetchMeetupStatus()
    } catch (error: any) {
      toast({
        id: 'mwt-meetup-done-err',
        title: 'Error',
        description: error?.response?.data?.error || 'Failed to confirm meetup completion',
        status: 'error',
      })
    } finally {
      setConfirmingMeetupDone(false)
    }
  }

  // Debounced place search
  useEffect(() => {
    const q = placeQuery.trim()
    if (q.length < 2) {
      setPlaceResults([])
      setPlaceSearching(false)
      return
    }
    setPlaceSearching(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q })
        if (user?.latitude && user?.longitude) {
          params.set('lat', String(user.latitude))
          params.set('lng', String(user.longitude))
        }
        const res = await api.get(`/api/places/search?${params.toString()}`)
        if (!cancelled) {
          setPlaceResults(res.data?.results || [])
        }
      } catch {
        if (!cancelled) setPlaceResults([])
      } finally {
        if (!cancelled) setPlaceSearching(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [placeQuery, user?.latitude, user?.longitude])

  const defaultLocations: MeetupLocation[] = [
    { name: 'Meet n Eat', address: 'Gov. Camins Ave, Zamboanga City', type: 'cafe', lat: 6.9150, lng: 122.0630, isPartner: true },
    { name: 'WMSU', address: 'Normal Road, Zamboanga City', type: 'public', lat: 6.9142, lng: 122.0620 },
    { name: 'SM Mindpro', address: 'La Purisima St, Zamboanga City', type: 'mall', lat: 6.9080, lng: 122.0745 },
    { name: 'KCC de Zamboanga', address: 'Gov. Camins Ave, Zamboanga City', type: 'mall', lat: 6.9214, lng: 122.0790 },
    { name: 'Amethyst Eatery', address: 'Johnston Road, Zamboanga City', type: 'cafe', lat: 6.9125, lng: 122.0720, isPartner: true },
    { name: 'Paseo del Mar', address: 'Valderosa St, Zamboanga City', type: 'public', lat: 6.9030, lng: 122.0780 },
  ]

  const suggestedLocations: MeetupLocation[] = useMemo(
    () => [...searchedLocations, ...defaultLocations],
    [searchedLocations]
  )

  const getDistance = (lat1?: number, lon1?: number, lat2?: number, lon2?: number) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const nearestLocationName = useMemo(() => {
    if (!user?.latitude || !user?.longitude) return 'WMSU'
    let nearest = ''
    let minDistance = Infinity
    for (const loc of suggestedLocations) {
      const dist = getDistance(user.latitude, user.longitude, loc.lat, loc.lng)
      if (dist < minDistance) {
        minDistance = dist
        nearest = loc.name
      }
    }
    return nearest
  }, [user?.latitude, user?.longitude, suggestedLocations])

  useEffect(() => {
    // Prefill the picker from the current user's confirmed selection
    if (!myMeetupConfirmed) return
    if (selectedLocation && selectedDate && selectedTime) return
    const loc = myMeetup?.meetup_location?.trim()
    const date = myMeetup?.meetup_date?.trim()
    const time = myMeetup?.meetup_time?.trim()
    if (loc && !selectedLocation) setSelectedLocation(loc)
    if (date && !selectedDate) setSelectedDate(date)
    if (time && !selectedTime) setSelectedTime(time)
  }, [myMeetup, myMeetupConfirmed, selectedDate, selectedLocation, selectedTime])

  const getNext7Days = (): string[] => {
    const days: string[] = []
    for (let i = 0; i < 7; i++) {
      const date = new Date()
      date.setDate(date.getDate() + i)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      days.push(`${year}-${month}-${day}`)
    }
    return days
  }

  const formatDateLabel = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.getTime() === today.getTime()) return 'Today'
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow'

    const options = { weekday: 'short', month: 'short', day: 'numeric' } as const
    return date.toLocaleDateString('en-US', options)
  }

  const generateTimeSlots = (dateStr: string | null): string[] => {
    if (!dateStr) return []

    const now = new Date()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const selectedDateObj = new Date(dateStr + 'T00:00:00')
    const isToday = selectedDateObj.getTime() === today.getTime()

    const slots: string[] = []
    const startHour = 9
    const endHour = 18

    for (let hour = startHour; hour <= endHour; hour++) {
      for (const minute of [0, 30]) {
        const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
        if (isToday) {
          const [hourPart, minPart] = timeStr.split(':').map(Number)
          const slotDate = new Date()
          slotDate.setHours(hourPart, minPart, 0, 0)
          if (slotDate <= now) continue
        }
        slots.push(timeStr)
      }
    }

    return slots
  }

  const validateDateTimeSelection = (date: string | null, time: string | null): string | null => {
    if (!date) return 'Please select a date'
    if (!time) return 'Please select a time'

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const selectedDateObj = new Date(date + 'T00:00:00')
    const maxDate = new Date(today)
    maxDate.setDate(maxDate.getDate() + 6)

    if (selectedDateObj < today) return 'Cannot select a past date'
    if (selectedDateObj > maxDate) return 'Meetup must be scheduled within 7 days'

    if (selectedDateObj.getTime() === today.getTime()) {
      const [hour, minute] = time.split(':').map(Number)
      const now = new Date()
      const selectedDateTime = new Date()
      selectedDateTime.setHours(hour, minute, 0, 0)

      if (selectedDateTime <= now) {
        return 'Cannot select a past time'
      }
    }

    return null
  }

  const generateSmartSuggestions = useMemo(() => {
    return (): Array<{ date: string; time: string; label: string }> => {
      const suggestions: Array<{ date: string; time: string; label: string }> = []
      const next7days = getNext7Days()

      if (next7days[0]) {
        suggestions.push({
          date: next7days[0],
          time: '11:00',
          label: 'Today, 11:00 AM',
        })
        suggestions.push({
          date: next7days[0],
          time: '15:00',
          label: 'Today, 3:00 PM',
        })
      }

      if (next7days[1]) {
        suggestions.push({
          date: next7days[1],
          time: '09:00',
          label: 'Tomorrow, 9:00 AM',
        })
      }

      if (next7days[2]) {
        suggestions.push({
          date: next7days[2],
          time: '14:00',
          label: 'Day after tomorrow, 2:00 PM',
        })
      }

      if (next7days[3]) {
        suggestions.push({
          date: next7days[3],
          time: '17:00',
          label: 'In 3 days, 5:00 PM',
        })
      }

      if (next7days[6]) {
        suggestions.push({
          date: next7days[6],
          time: '10:00',
          label: 'Weekend, 10:00 AM',
        })
      }

      return suggestions
    }
  }, [])

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size={["sm", "md", "lg", "6xl"]} isCentered scrollBehavior="inside">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent bg={cardBg} minH="70vh" maxH="92vh" display="flex" flexDirection="column" w="full">
        <ModalHeader py={2}>
          <HStack spacing={2} w="full" justify="space-between" fontSize={"md"}>
            <HStack spacing={2}>
              <Icon as={FaHandshake} color="purple.500" />
              <Text>Trade Details</Text>
              <Badge colorScheme="green" variant="subtle" fontSize="sm">
                In Progress
              </Badge>
            </HStack>
          </HStack>
          <ModalCloseButton mt={2} />
        </ModalHeader>

        <ModalBody py={0} px={0} flex={1} display="flex" flexDirection="column" overflow="hidden" minH={0}>
          <Tabs index={activeTab} onChange={setActiveTab} variant="soft-rounded" colorScheme="brand" display="flex" flexDirection="column" flex={1} overflow="hidden">
            <TabList px={4} pt={2} mb={0} borderBottomWidth="1px" borderColor={borderColor}>
              <Tab fontSize="sm" fontWeight="medium">Overview</Tab>
              <Tab fontSize="sm" fontWeight="medium">
                {sortedParticipants.length >= 3 ? 'Group Chat' : 'Chat'}
              </Tab>
              <Tab fontSize="sm" fontWeight="medium">Meet up</Tab>
            </TabList>

            <TabPanels flex={1} minH={0} overflow="hidden" display="flex" flexDirection="column">
              {/* Overview Tab - Restructured Layout */}
              <TabPanel py={3} px={[2, 4]} overflowY="auto" minH={0} flex={1} display="flex" flexDirection="column">
                <VStack spacing={4} align="stretch">
                  {/* CONFIRMATION PROGRESS */}
                  <Box>
                    <HStack justify="space-between" mb={3}>
                      <Text fontSize="sm" fontWeight="semibold" color={useColorModeValue('gray.700', 'gray.300')}>Confirmation progress</Text>
                      <Text fontSize="sm" fontWeight="bold" color="brand.500">{sortedParticipants.filter(p => ['accepted', 'user3_accepted', 'active', 'multiway_active'].includes(p.trade_status)).length}/{sortedParticipants.length}</Text>
                    </HStack>
                    {/* Step indicators with labels */}
                    {sortedParticipants.length === 2 ? (
                      <VStack spacing={0} align="stretch">
                        <HStack spacing={2} align="flex-end" justify="center">
                          {sortedParticipants.map((p, idx) => {
                            const isAccepted = ['accepted', 'confirmed', 'user3_accepted', 'active', 'multiway_active'].includes(p.trade_status)
                            return (
                              <Box key={idx} display="flex" alignItems="center" gap={2}>
                                <Box
                                  w="24px"
                                  h="24px"
                                  borderRadius="full"
                                  bg={isAccepted ? 'green.500' : useColorModeValue('gray.300', 'gray.600')}
                                  display="flex"
                                  alignItems="center"
                                  justifyContent="center"
                                  color="white"
                                  fontSize="12px"
                                  fontWeight="bold"
                                >
                                  {isAccepted ? '✓' : idx + 1}
                                </Box>
                                {idx < sortedParticipants.length - 1 && (
                                  <Icon as={FaArrowRight} boxSize={3} color={useColorModeValue('gray.400', 'gray.500')} />
                                )}
                              </Box>
                            )
                          })}
                        </HStack>
                        <HStack spacing={2} align="flex-start" justify="center" mt={1}>
                          <Text fontSize="11px" color={useColorModeValue('gray.600', 'gray.400')} textAlign="center" minW="60px">Confirm items</Text>
                          <Box w={6} />
                          <Text fontSize="11px" color={useColorModeValue('gray.600', 'gray.400')} textAlign="center" minW="80px">Exchange meetup</Text>
                        </HStack>
                      </VStack>
                    ) : (
                      <HStack spacing={2} align="center" justify="center">
                        {sortedParticipants.map((p, idx) => {
                          const isAccepted = ['accepted', 'confirmed', 'user3_accepted', 'active', 'multiway_active'].includes(p.trade_status)
                          return (
                            <Box key={idx} display="flex" alignItems="center" gap={2}>
                              <Box
                                w="24px"
                                h="24px"
                                borderRadius="full"
                                bg={isAccepted ? 'green.500' : useColorModeValue('gray.300', 'gray.600')}
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                color="white"
                                fontSize="12px"
                                fontWeight="bold"
                              >
                                {isAccepted ? '✓' : idx + 1}
                              </Box>
                              {idx < sortedParticipants.length - 1 && (
                                <Icon as={FaArrowRight} boxSize={3} color={useColorModeValue('gray.400', 'gray.500')} />
                              )}
                            </Box>
                          )
                        })}
                      </HStack>
                    )}
                  </Box>

                  {meetupAgreed && agreedMeetup && (
                    <Card bg="green.50" borderWidth="2px" borderColor="green.200">
                      <CardBody>
                        <VStack spacing={3} align="stretch">
                          <HStack>
                            <Icon as={FaCheckCircle} color="green.500" boxSize={5} />
                            <Text fontWeight="semibold" fontSize="md" color="green.700">
                              Meetup Agreed
                            </Text>
                          </HStack>

                          <VStack spacing={2} align="start" fontSize="sm">
                            <HStack spacing={2} w="full">
                              <Icon as={FaMapMarkerAlt} boxSize={4} color="green.600" />
                              <VStack align="start" spacing={0} flex={1}>
                                <Text fontWeight="semibold" color="green.900">Location</Text>
                                <Text color="green.800">{agreedMeetup.meetup_location}</Text>
                              </VStack>
                            </HStack>
                            <HStack spacing={2} w="full">
                              <Icon as={FaCalendarAlt} boxSize={4} color="green.600" />
                              <VStack align="start" spacing={0} flex={1}>
                                <Text fontWeight="semibold" color="green.900">Date</Text>
                                <Text color="green.800">{new Date(agreedMeetup.meetup_date + 'T00:00:00').toLocaleDateString()}</Text>
                              </VStack>
                            </HStack>
                            <HStack spacing={2} w="full">
                              <Icon as={FaClock} boxSize={4} color="green.600" />
                              <VStack align="start" spacing={0} flex={1}>
                                <Text fontWeight="semibold" color="green.900">Time</Text>
                                <Text color="green.800">{formatTimePH(agreedMeetup.meetup_time)}</Text>
                              </VStack>
                            </HStack>
                          </VStack>
                        </VStack>
                      </CardBody>
                    </Card>
                  )}

                  {/* TRADE LOOP DIAGRAM - INTERACTIVE ROWS */}
                  <Box borderTopWidth="1px" borderBottomWidth="1px" borderColor={borderColor} py={4} px={2}>
                    <Heading size="xs" mb={3} textTransform="uppercase" fontSize="10px" color={useColorModeValue('gray.600', 'gray.400')} letterSpacing="1px">
                      Trade Exchange
                    </Heading>
                    
                    {sortedParticipants.length === 2 ? (
                      /* Two-way trade: two rows showing bidirectional exchange */
                      <VStack spacing={2} align="stretch">
                        {/* Row 1: Participant 0 gives to Participant 1 */}
                        <HStack spacing={3} justify="center" align="center">
                          {/* Sender Avatar */}
                          <Box display="flex" flexDirection="column" alignItems="center" gap={1} minW="fit-content">
                            <Avatar
                              name={sortedParticipants[0].user_name}
                              size="sm"
                              bg="brand.500"
                              cursor="pointer"
                              title={`View ${sortedParticipants[0].user_name}'s profile`}
                              aria-label={`View ${sortedParticipants[0].user_name}'s profile`}
                              onClick={() => navigate(getUserProfileUrl(sortedParticipants[0].user_id, sortedParticipants[0].user_slug))}
                              transition="all 0.2s"
                              _hover={{ ring: '2px', ringColor: 'brand.600', opacity: 0.85 }}
                            />
                            <Text fontSize="9px" fontWeight="semibold">{sortedParticipants[0].user_name.split(' ')[0]}</Text>
                          </Box>

                          {/* Arrow */}
                          <Icon as={FaArrowRight} boxSize={2.5} color={useColorModeValue('gray.400', 'gray.500')} />

                          {/* Item Pill - Clickable */}
                          <Box
                            display="flex"
                            alignItems="center"
                            gap={1.5}
                            px={2}
                            py={1}
                            borderRadius="full"
                            borderWidth="0.5px"
                            borderColor={useColorModeValue('purple.300', 'purple.500')}
                            bg={useColorModeValue('purple.50', 'purple.900')}
                            cursor="pointer"
                            transition="all 0.2s"
                            onClick={() => navigate(getProductUrl({ ...sortedParticipants[0], id: sortedParticipants[0].product_id }))}
                            title={`View ${sortedParticipants[0].product_title} listing`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                navigate(getProductUrl({ ...sortedParticipants[0], id: sortedParticipants[0].product_id }))
                              }
                            }}
                            _hover={{ bg: useColorModeValue('purple.100', 'purple.800'), borderColor: useColorModeValue('purple.400', 'purple.400') }}
                          >
                            {sortedParticipants[0].product_image && (
                              <Image
                                src={sortedParticipants[0].product_image}
                                alt={sortedParticipants[0].product_title}
                                h="20px"
                                w="20px"
                                borderRadius="sm"
                                objectFit="cover"
                              />
                            )}
                            <Text fontSize="11px" fontWeight="500" color={useColorModeValue('purple.700', 'purple.100')} whiteSpace="nowrap">
                              {sortedParticipants[0].product_title}
                            </Text>
                            <Icon as={FaChevronDown} boxSize={3} color={useColorModeValue('purple.600', 'purple.200')} transform="rotate(-90deg)" />
                          </Box>

                          {/* Arrow */}
                          <Icon as={FaArrowRight} boxSize={2.5} color={useColorModeValue('gray.400', 'gray.500')} />

                          {/* Recipient Avatar */}
                          <Box display="flex" flexDirection="column" alignItems="center" gap={1} minW="fit-content">
                            <Avatar
                              name={sortedParticipants[1].user_name}
                              size="sm"
                              bg="brand.500"
                              cursor="pointer"
                              title={`View ${sortedParticipants[1].user_name}'s profile`}
                              aria-label={`View ${sortedParticipants[1].user_name}'s profile`}
                              onClick={() => navigate(getUserProfileUrl(sortedParticipants[1].user_id, sortedParticipants[1].user_slug))}
                              transition="all 0.2s"
                              _hover={{ ring: '2px', ringColor: 'brand.600', opacity: 0.85 }}
                            />
                            <Text fontSize="9px" fontWeight="semibold">{sortedParticipants[1].user_name.split(' ')[0]}</Text>
                          </Box>
                        </HStack>

                        {/* Row 2: Participant 1 gives to Participant 0 */}
                        <HStack spacing={3} justify="center" align="center">
                          {/* Sender Avatar */}
                          <Box display="flex" flexDirection="column" alignItems="center" gap={1} minW="fit-content">
                            <Avatar
                              name={sortedParticipants[1].user_name}
                              size="sm"
                              bg="brand.500"
                              cursor="pointer"
                              title={`View ${sortedParticipants[1].user_name}'s profile`}
                              aria-label={`View ${sortedParticipants[1].user_name}'s profile`}
                              onClick={() => navigate(getUserProfileUrl(sortedParticipants[1].user_id, sortedParticipants[1].user_slug))}
                              transition="all 0.2s"
                              _hover={{ ring: '2px', ringColor: 'brand.600', opacity: 0.85 }}
                            />
                            <Text fontSize="9px" fontWeight="semibold">{sortedParticipants[1].user_name.split(' ')[0]}</Text>
                          </Box>

                          {/* Arrow */}
                          <Icon as={FaArrowRight} boxSize={2.5} color={useColorModeValue('gray.400', 'gray.500')} />

                          {/* Item Pill - Clickable */}
                          <Box
                            display="flex"
                            alignItems="center"
                            gap={1.5}
                            px={2}
                            py={1}
                            borderRadius="full"
                            borderWidth="0.5px"
                            borderColor={useColorModeValue('blue.300', 'blue.500')}
                            bg={useColorModeValue('blue.50', 'blue.900')}
                            cursor="pointer"
                            transition="all 0.2s"
                            onClick={() => navigate(getProductUrl({ ...sortedParticipants[1], id: sortedParticipants[1].product_id }))}
                            title={`View ${sortedParticipants[1].product_title} listing`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                navigate(getProductUrl({ ...sortedParticipants[1], id: sortedParticipants[1].product_id }))
                              }
                            }}
                            _hover={{ bg: useColorModeValue('blue.100', 'blue.800'), borderColor: useColorModeValue('blue.400', 'blue.400') }}
                          >
                            {sortedParticipants[1].product_image && (
                              <Image
                                src={sortedParticipants[1].product_image}
                                alt={sortedParticipants[1].product_title}
                                h="20px"
                                w="20px"
                                borderRadius="sm"
                                objectFit="cover"
                              />
                            )}
                            <Text fontSize="11px" fontWeight="500" color={useColorModeValue('blue.700', 'blue.100')} whiteSpace="nowrap">
                              {sortedParticipants[1].product_title}
                            </Text>
                            <Icon as={FaChevronDown} boxSize={3} color={useColorModeValue('blue.600', 'blue.200')} transform="rotate(-90deg)" />
                          </Box>

                          {/* Arrow */}
                          <Icon as={FaArrowRight} boxSize={2.5} color={useColorModeValue('gray.400', 'gray.500')} />

                          {/* Recipient Avatar */}
                          <Box display="flex" flexDirection="column" alignItems="center" gap={1} minW="fit-content">
                            <Avatar
                              name={sortedParticipants[0].user_name}
                              size="sm"
                              bg="brand.500"
                              cursor="pointer"
                              title={`View ${sortedParticipants[0].user_name}'s profile`}
                              aria-label={`View ${sortedParticipants[0].user_name}'s profile`}
                              onClick={() => navigate(getUserProfileUrl(sortedParticipants[0].user_id, sortedParticipants[0].user_slug))}
                              transition="all 0.2s"
                              _hover={{ ring: '2px', ringColor: 'brand.600', opacity: 0.85 }}
                            />
                            <Text fontSize="9px" fontWeight="semibold">{sortedParticipants[0].user_name.split(' ')[0]}</Text>
                          </Box>
                        </HStack>
                      </VStack>
                    ) : (
                      /* 3+ way trade: linear chain */
                      <Box overflowX="auto" pb={2}>
                        <HStack spacing={2} minW="min-content" justify="center" px={2}>
                          {sortedParticipants.map((participant, idx) => {
                            const isAccepted = ['accepted', 'confirmed', 'user3_accepted', 'active', 'multiway_active'].includes(participant.trade_status)
                            return (
                              <Box key={idx} display="flex" alignItems="center" gap={2} flexShrink={0}>
                                {/* Participant Avatar */}
                                <Box display="flex" flexDirection="column" alignItems="center" gap={1}>
                                  <Box position="relative">
                                    <Avatar
                                      name={participant.user_name}
                                      size="sm"
                                      bg="brand.500"
                                      cursor="pointer"
                                      title={`View ${participant.user_name}'s profile`}
                                      aria-label={`View ${participant.user_name}'s profile`}
                                      onClick={() => navigate(getUserProfileUrl(participant.user_id, participant.user_slug))}
                                      transition="all 0.2s"
                                      _hover={{ ring: '2px', ringColor: 'brand.600', opacity: 0.85 }}
                                    />
                                    <Box position="absolute" bottom="-4px" right="-4px" borderRadius="full" bg={isAccepted ? 'green.500' : 'gray.400'} w="16px" h="16px" display="flex" alignItems="center" justifyContent="center" color="white" fontSize="9px" fontWeight="bold" shadow="md" borderWidth="1px" borderColor="white">
                                      {isAccepted ? '✓' : '●'}
                                    </Box>
                                  </Box>
                                  <Text fontSize="8px" fontWeight="semibold" textAlign="center">{participant.user_name.split(' ')[0]}</Text>
                                </Box>

                                {/* Arrow + Item Pill */}
                                {idx < sortedParticipants.length - 1 && (
                                  <HStack spacing={1} minW="120px">
                                    <Icon as={FaArrowRight} boxSize={2.5} color={useColorModeValue('gray.400', 'gray.500')} />
                                    <Box
                                      display="flex"
                                      alignItems="center"
                                      gap={1}
                                      px={1.5}
                                      py={0.5}
                                      borderRadius="full"
                                      borderWidth="0.5px"
                                      borderColor={useColorModeValue('gray.300', 'gray.600')}
                                      bg={useColorModeValue('gray.100', 'gray.800')}
                                      cursor="pointer"
                                      transition="all 0.2s"
                                      onClick={() => navigate(getProductUrl({ ...participant, id: participant.product_id }))}
                                      title={`View ${participant.product_title} listing`}
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          navigate(getProductUrl({ ...participant, id: participant.product_id }))
                                        }
                                      }}
                                      _hover={{ bg: useColorModeValue('gray.200', 'gray.700'), borderColor: useColorModeValue('gray.400', 'gray.500') }}
                                    >
                                      {participant.product_image && (
                                        <Image
                                          src={participant.product_image}
                                          alt={participant.product_title}
                                          h="16px"
                                          w="16px"
                                          borderRadius="sm"
                                          objectFit="cover"
                                        />
                                      )}
                                      <Text fontSize="10px" fontWeight="500" color={useColorModeValue('gray.700', 'gray.200')} noOfLines={1}>
                                        {participant.product_title}
                                      </Text>
                                      <Icon as={FaChevronDown} boxSize={2.5} color={useColorModeValue('gray.600', 'gray.400')} transform="rotate(-90deg)" />
                                    </Box>
                                  </HStack>
                                )}
                              </Box>
                            )
                          })}
                        </HStack>
                      </Box>
                    )}
                  </Box>

                  {/* INFO CARDS ROW - Only show if we have data */}
                  <SimpleGrid columns={3} spacing={2} w="full">
                    {/* Expires - Only show if we have a date */}
                    {multiWayTrade.expires_at && (
                      <Box borderWidth="1px" borderColor={borderColor} borderRadius="md" p={2.5} bg={useColorModeValue('gray.50', 'gray.800')}>
                        <Text fontSize="10px" fontWeight="semibold" textTransform="uppercase" color={useColorModeValue('gray.600', 'gray.400')} mb={1}>
                          Expires
                        </Text>
                        <Text fontSize="xs" fontWeight="semibold" color={useColorModeValue('gray.900', 'gray.100')}>
                          {new Date(multiWayTrade.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                      </Box>
                    )}
                  </SimpleGrid>

                  {/* PARTICIPANTS SECTION */}
                  <Box borderTopWidth="1px" borderColor={borderColor} pt={3}>
                    <Heading size="xs" mb={2} textTransform="uppercase" fontSize="10px" color={useColorModeValue('gray.600', 'gray.400')} letterSpacing="1px">
                      Participants
                    </Heading>
                    <VStack spacing={2} align="stretch">
                      {sortedParticipants.map((participant, idx) => {
                        const isAccepted = ['accepted', 'confirmed', 'user3_accepted', 'active', 'multiway_active'].includes(participant.trade_status)
                        const isCurrentUser = participant.user_id === user?.id
                        
                        return (
                          <Box key={idx} p={3} borderWidth="1px" borderColor={borderColor} borderRadius="md" bg={useColorModeValue('white', 'gray.800')}>
                            <HStack justify="space-between" align="start">
                              <HStack spacing={2} flex={1}>
                                <Avatar name={participant.user_name} size="sm" cursor="pointer" onClick={() => navigate(getUserProfileUrl(participant.user_id, participant.user_slug))} />
                                <VStack spacing={0} align="start" flex={1} minW={0}>
                                  <Text fontSize="sm" fontWeight="semibold">{participant.user_name} {isCurrentUser && <Text as="span" fontSize="xs" color="gray.500">(you)</Text>}</Text>
                                  <Text fontSize="xs" color="gray.600" noOfLines={1}>Giving: {participant.product_title}</Text>
                                </VStack>
                              </HStack>
                              <VStack spacing={1} align="flex-end">
                                <Badge colorScheme={isAccepted ? 'green' : 'gray'} borderRadius="md" whiteSpace="nowrap">
                                  {isAccepted ? 'Confirmed' : 'Pending'}
                                </Badge>
                                {!isAccepted && canManage && !isCurrentUser && (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    fontSize="xs"
                                    isDisabled={loading}
                                    isLoading={selectedAction === 'reinvite' && loading}
                                    onClick={() => handleReinviteLoop()}
                                  >
                                    Reinvite
                                  </Button>
                                )}
                              </VStack>
                            </HStack>
                          </Box>
                        )
                      })}
                    </VStack>
                  </Box>

                  {/* Estimated Total Value */}
                  {multiWayTrade.total_value && (
                    <HStack justify="space-between" bg={useColorModeValue('green.50', 'green.900')} p={3} borderRadius="md" borderLeftWidth="4px" borderColor="green.500">
                      <Text fontWeight="semibold" fontSize="sm">Estimated Total Value</Text>
                      <Text fontSize="lg" fontWeight="bold" color="green.500">₱{multiWayTrade.total_value.toFixed(2)}</Text>
                    </HStack>
                  )}
                </VStack>
              </TabPanel>

        {/* Chat Tab */}
        <TabPanel px={[2, 4]} py={3} overflow="hidden" minH={0} flex={1} display="flex" flexDirection="column">
          <VStack spacing={2} align="stretch" h="full" display="flex" flexDirection="column" minH={0}>
            {/* Messages Area */}
            <Box
              flex={1}
              overflowY="auto"
              p={[2, 2.5]}
              bg={sectionBg}
              borderRadius="md"
              borderWidth="1px"
              borderColor={borderColor}
              minH={0}
              maxH={{ base: '54vh', md: '60vh' }}
            >
              {loadingMessages ? (
                <Flex justify="center" align="center" h="full">
                  <Spinner />
                </Flex>
              ) : messages.length === 0 ? (
                <Flex justify="center" align="center" h="full" direction="column">
                  <Icon as={FaPaperPlane} boxSize={8} color="gray.400" mb={2} />
                  <Text color="gray.500" fontSize="sm" textAlign="center">No messages yet. Start the conversation!</Text>
                </Flex>
              ) : (
                <VStack spacing={12} align="stretch">
                  {messages.map((msg) => {
                    const isOwnMessage = msg.sender_id === user?.id
                    const isPhotoMessage = typeof msg.content === 'string' && msg.content.startsWith('photo:')
                    const photoUrl = isPhotoMessage ? msg.content.slice('photo:'.length).trim() : ''
                    const senderAvatarSrc = isOwnMessage
                      ? resolveAvatarSrc((user as any)?.profile_picture)
                      : resolveAvatarSrc(userAvatarById[Number(msg.sender_id)])
                    return (
                      <HStack
                        key={`msg-${msg.id}`}
                        justify={isOwnMessage ? 'flex-end' : 'flex-start'}
                        align="flex-start"
                        spacing={2}
                      >
                        {!isOwnMessage && (
                          <Avatar
                            name={msg.sender_name || 'User'}
                            src={senderAvatarSrc}
                            size="sm"
                            bg="brand.500"
                            color="white"
                          />
                        )}
                        <Box
                          maxW="70%"
                          p={2.5}
                          borderRadius="lg"
                          bg={isOwnMessage ? 'brand.500' : 'white'}
                          color={isOwnMessage ? 'white' : 'gray.800'}
                          borderWidth={isOwnMessage ? 0 : '1px'}
                          borderColor={borderColor}
                          shadow="sm"
                        >
                          {!isOwnMessage && (
                            <Text fontSize="xs" fontWeight="bold" color={isOwnMessage ? 'white' : 'gray.700'} mb={1}>
                              {msg.sender_name}
                            </Text>
                          )}
                          {isPhotoMessage ? (
                            <Image
                              src={getImageUrl(photoUrl)}
                              alt="Shared photo"
                              borderRadius="md"
                              maxH="220px"
                              objectFit="cover"
                            />
                          ) : (
                            <Text fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-word">
                              {msg.content}
                            </Text>
                          )}
                          <Text
                            fontSize="2xs"
                            opacity={0.7}
                            mt={1}
                            textAlign={isOwnMessage ? 'right' : 'left'}
                          >
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </Box>
                        {isOwnMessage && (
                          <Avatar
                            name={user?.name || 'You'}
                            size="sm"
                            bg="brand.500"
                            color="white"
                            src={senderAvatarSrc}
                          />
                        )}
                      </HStack>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </VStack>
              )}
            </Box>

            {/* Message Input */}
            <Box borderTopWidth="1px" borderColor={borderColor} pt={3}>
              {chatPhotoPreview && (
                <HStack spacing={2} mb={2} align="center">
                  <Image src={chatPhotoPreview} alt="Photo preview" maxH="60px" borderRadius="md" />
                  <Button size="xs" variant="ghost" onClick={clearChatPhoto}>Remove</Button>
                </HStack>
              )}
              <HStack spacing={2} align="flex-end">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder="Type a message... (Shift+Enter for new line)"
                  minH="60px"
                  maxH="120px"
                  resize="none"
                  isDisabled={sendingMessage || uploadingChatPhoto}
                  fontSize="sm"
                  borderRadius="md"
                  flex={1}
                />
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleChatPhotoSelect}
                  style={{ display: 'none' }}
                />
                <IconButton
                  aria-label="Attach photo"
                  icon={<FaCamera />}
                  variant="outline"
                  onClick={() => photoInputRef.current?.click()}
                  isDisabled={sendingMessage || uploadingChatPhoto}
                />
                <Button
                  colorScheme="brand"
                  onClick={handleSendMessage}
                  isLoading={sendingMessage || uploadingChatPhoto}
                  isDisabled={!newMessage.trim() && !chatPhotoFile}
                  leftIcon={<FaPaperPlane />}
                  h="48px"
                  px={4}
                  flexShrink={0}
                  whiteSpace="nowrap"
                >
                  Send
                </Button>
              </HStack>
            </Box>
          </VStack>
        </TabPanel>

              {/* Meet up Tab */}
              <TabPanel px={[2, 4]} py={3} overflowY="auto" minH={0} flex={1} display="flex" flexDirection="column">
                <VStack spacing={4} align="stretch">
                  <Box p={3} bg={meetupInfoBg} borderLeft="4px" borderColor="brand.500" borderRadius="md">
                    <Text fontSize="sm" color={meetupInfoTextColor} fontWeight="medium">
                      {loadingMeetupStatus
                        ? 'Current Stage: Loading meetup status...'
                        : getMeetupState() === 'dispute'
                          ? 'Current Stage: Meetup in dispute'
                          : getMeetupState() === 'finalized'
                            ? 'Current Stage: Meetup agreed — confirm you met'
                            : getMeetupState() === 'mismatch'
                              ? 'Current Stage: Selection mismatch — coordinate to match'
                              : getMeetupState() === 'proposed'
                                ? 'Current Stage: Waiting for everyone to confirm'
                                : 'Current Stage: Select a location and time'}
                    </Text>
                  </Box>


                  <Box>
                    <Text fontWeight="semibold" mb={1} fontSize="md">
                      Suggested Meetup Locations
                    </Text>
                    <Text fontSize="sm" color="gray.600" mb={3}>
                      Select a safe, public location. Everyone must confirm the same selection to proceed.
                    </Text>

                    <Box mb={4} position="relative" zIndex={1500}>
                      <InputGroup size="sm">
                        <InputLeftElement pointerEvents="none">
                          <Icon as={FaMapMarkerAlt} color="gray.400" />
                        </InputLeftElement>
                        <Input
                          placeholder='Search any place in PH (e.g. "claret jollibee")'
                          value={placeQuery}
                          onChange={(e) => setPlaceQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handlePlaceSearch()
                            }
                          }}
                          pr={placeSearching ? '2rem' : undefined}
                        />
                        <InputRightElement>
                          <IconButton
                            aria-label="Search places"
                            icon={<FaSearch />}
                            size="sm"
                            variant="ghost"
                            isLoading={placeSearching}
                            onClick={handlePlaceSearch}
                          />
                        </InputRightElement>
                        {placeSearching && (
                          <Box position="absolute" right={2} top="50%" transform="translateY(-50%)" zIndex={2}>
                            <Spinner size="xs" />
                          </Box>
                        )}
                      </InputGroup>
                      {placeResults.length > 0 && (
                        <Box
                          position="absolute"
                          top="100%"
                          left={0}
                          right={0}
                          zIndex={1500}
                          bg="white"
                          borderWidth="1px"
                          borderColor={borderColor}
                          borderRadius="md"
                          boxShadow="lg"
                          maxH="240px"
                          overflowY="auto"
                          mt={1}
                        >
                          {placeResults.map((r, idx) => (
                            <Box
                              key={`${r.name}-${idx}`}
                              px={3}
                              py={2}
                              cursor="pointer"
                              _hover={{ bg: 'brand.50' }}
                              borderBottomWidth={idx < placeResults.length - 1 ? '1px' : 0}
                              borderColor="gray.100"
                              onClick={() => {
                                const loc: MeetupLocation = {
                                  name: r.name,
                                  address: r.address,
                                  type: 'other',
                                  lat: r.latitude,
                                  lng: r.longitude,
                                }
                                setSearchedLocations((prev) => {
                                  if (prev.find((p) => p.name === loc.name)) return prev
                                  return [loc, ...prev].slice(0, 5)
                                })
                                setSelectedLocation(loc.name)
                                setValidationError(null)
                                setPlaceResults([])
                                setPlaceQuery('')
                              }}
                            >
                              <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
                                {r.name}
                              </Text>
                              <Text fontSize="xs" color="gray.500" noOfLines={1}>
                                {r.address}
                              </Text>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>

                    <Box h={['150px', '180px', '200px']} mb={3} borderRadius="md" overflow="hidden" borderWidth="1px" borderColor={borderColor}>
                      <MapContainer
                        key={mapInitKey}
                        center={[6.9214, 122.0790]}
                        zoom={14}
                        scrollWheelZoom={false}
                        style={{ height: '100%', width: '100%' }}
                        // @ts-ignore
                        attributionControl={false}
                      >
                        <ModalMapFix />
                        <MapClickPicker
                          onPick={(lat, lng) => {
                            const loc: MeetupLocation = {
                              name: 'Pinned location',
                              address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
                              type: 'other',
                              lat,
                              lng,
                            }
                            setPinnedLocation(loc)
                            setSearchedLocations((prev) => {
                              const filtered = prev.filter((p) => p.name !== 'Pinned location')
                              return [loc, ...filtered].slice(0, 5)
                            })
                            setSelectedLocation(loc.name)
                            setValidationError(null)
                          }}
                        />
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        {selectedLocation && suggestedLocations.find((l) => l.name === selectedLocation)?.lat && (
                          <MapUpdater
                            lat={suggestedLocations.find((l) => l.name === selectedLocation)!.lat!}
                            lng={suggestedLocations.find((l) => l.name === selectedLocation)!.lng!}
                          />
                        )}
                        {suggestedLocations
                          .filter((loc) => loc.lat && loc.lng)
                          .map((loc, idx) => (
                            <Marker
                              key={idx}
                              position={[loc.lat!, loc.lng!]}
                              eventHandlers={{ click: () => setSelectedLocation(loc.name) }}
                            >
                              <Popup>
                                <b>{loc.name}</b>
                                <br />
                                {loc.address}
                              </Popup>
                            </Marker>
                          ))}
                      </MapContainer>
                    </Box>

                    <Box
                      w="full"
                      borderWidth="1px"
                      borderColor={borderColor}
                      borderRadius="md"
                      px={3}
                      py={2}
                      cursor="pointer"
                      bg={useColorModeValue('gray.50', 'gray.800')}
                      onClick={() => setShowPredefinedLocations((prev) => !prev)}
                      _hover={{ bg: useColorModeValue('gray.100', 'gray.700') }}
                    >
                      <HStack justify="space-between">
                        <Text fontSize="sm" fontWeight="semibold">
                          Predefined locations & partners
                        </Text>
                        <Icon
                          as={FaChevronDown}
                          boxSize={4}
                          transform={showPredefinedLocations ? 'rotate(180deg)' : 'rotate(0deg)'}
                          transition="transform 0.2s"
                        />
                      </HStack>
                    </Box>

                    {showPredefinedLocations && (
                      <SimpleGrid
                        columns={[1, 2]}
                        spacing={[1, 1.5]}
                        maxH={['280px', '350px']}
                        overflowY="auto"
                        pr={2}
                        css={{
                          '&::-webkit-scrollbar': {
                            width: '4px',
                          },
                          '&::-webkit-scrollbar-track': {
                            width: '6px',
                          },
                          '&::-webkit-scrollbar-thumb': {
                            background: 'brand.500',
                            borderRadius: '24px',
                          },
                        }}
                      >
                        {suggestedLocations.map((location) => {
                          const isSelected = selectedLocation === location.name
                          const isPartner = location.isPartner
                          const isNearest = location.name === nearestLocationName

                          return (
                            <Card
                              key={`location-${location.name}`}
                              variant="outline"
                              cursor="pointer"
                              borderWidth={isPartner ? '2px' : isSelected ? '2px' : '1px'}
                              borderColor={
                                isPartner
                                  ? 'orange.400'
                                  : isSelected
                                    ? 'brand.500'
                                    : isNearest
                                      ? 'blue.300'
                                      : borderColor
                              }
                              bg={isSelected ? 'brand.50' : isPartner ? partnerBg : isNearest ? nearestBg : 'white'}
                              onClick={() => {
                                setSelectedLocation(location.name)
                                setValidationError(null)
                              }}
                              transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                              _hover={{
                                borderColor: isPartner ? 'orange.500' : isSelected ? 'brand.600' : 'brand.400',
                                shadow: 'md',
                                transform: 'translateY(-2px)',
                              }}
                            >
                              <CardBody p={[1.5, 2]}>
                                <VStack spacing={0.5} align="stretch">
                                  <HStack spacing={1.5} flex={1}>
                                    <Box
                                      p={1}
                                      bg={isPartner ? partnerIconBg : defaultIconBg}
                                      borderRadius="sm"
                                      display="flex"
                                      alignItems="center"
                                      justifyContent="center"
                                      flexShrink={0}
                                    >
                                      <Icon
                                        as={isPartner ? FaStore : FaMapMarkerAlt}
                                        color={
                                          isPartner
                                            ? 'orange.500'
                                            : isSelected
                                              ? 'brand.500'
                                              : isNearest
                                                ? 'blue.500'
                                                : 'gray.500'
                                        }
                                        boxSize={isPartner ? 4 : 3.5}
                                      />
                                    </Box>

                                    <VStack align="start" spacing={0.25} flex={1} minW={0}>
                                      <Text fontWeight="semibold" fontSize={['10px', 'xs']} color={locationTextColor} noOfLines={1}>
                                        {location.name}
                                      </Text>
                                      <Text fontSize={['2xs', '2xs']} color="gray.600" noOfLines={1}>
                                        {location.address}
                                      </Text>
                                      <Badge
                                        colorScheme={
                                          location.type === 'cafe'
                                            ? 'orange'
                                            : location.type === 'mall'
                                              ? 'blue'
                                              : 'green'
                                        }
                                        variant="subtle"
                                        fontSize="2xs"
                                        px={0.5}
                                        py={0}
                                        w="fit-content"
                                      >
                                        {location.type}
                                      </Badge>
                                    </VStack>
                                  </HStack>

                                  {isSelected && (
                                    <HStack justify="center" flexShrink={0}>
                                      <Icon as={FaCheckCircle} color="brand.500" boxSize={4} />
                                    </HStack>
                                  )}
                                </VStack>
                              </CardBody>
                            </Card>
                          )
                        })}
                      </SimpleGrid>
                    )}
                  </Box>

                  {showSuggestionsPanel && (
                    <Box p={3} bg="blue.50" borderRadius="md" borderLeft="4px" borderColor="blue.400">
                      <HStack justify="space-between" mb={2}>
                        <Text fontSize="sm" fontWeight="medium" color="blue.700">
                          Suggested Alternative Times
                        </Text>
                        <Button size="xs" variant="ghost" onClick={() => setShowSuggestionsPanel(false)}>
                          Close
                        </Button>
                      </HStack>
                      <VStack align="stretch" spacing={2}>
                        {generateSmartSuggestions().map((suggestion, idx) => (
                          <Button
                            key={idx}
                            size="sm"
                            variant="outline"
                            colorScheme="blue"
                            justifyContent="flex-start"
                            onClick={() => {
                              setSelectedDate(suggestion.date)
                              setSelectedTime(suggestion.time)
                              setValidationError(null)
                              setShowSuggestionsPanel(false)
                            }}
                          >
                            {suggestion.label}
                          </Button>
                        ))}
                      </VStack>
                    </Box>
                  )}

                  <Box>
                    <HStack justify="space-between" mb={2}>
                      <VStack align="start" spacing={0}>
                        <Text fontWeight="semibold" fontSize="md">
                          Schedule a Meetup
                        </Text>
                        <Text fontSize="sm" color="gray.600">
                          Pick a date within the next 7 days and a time that works for everyone.
                        </Text>
                      </VStack>
                      <HStack spacing={2}>
                        {myMeetupConfirmed ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            colorScheme="blue"
                            onClick={() => {
                              resetMeetupSelection()
                              setSelectedDate(null)
                              setSelectedTime(null)
                              setValidationError(null)
                            }}
                          >
                            Change
                          </Button>
                        ) : (
                          <Button size="xs" variant="ghost" onClick={() => setShowSuggestionsPanel(true)}>
                            Suggestions
                          </Button>
                        )}
                      </HStack>
                    </HStack>

                    {myMeetupConfirmed ? (
                      <Box
                        p={3}
                        borderWidth="1px"
                        borderColor={borderColor}
                        borderRadius="md"
                        bg={useColorModeValue('green.50', 'green.900')}
                      >
                        <HStack spacing={2} mb={2}>
                          <Icon as={FaCheckCircle} color="green.500" boxSize={4} />
                          <Text fontWeight="semibold" color={useColorModeValue('green.700', 'green.200')}>
                            Schedule confirmed
                          </Text>
                        </HStack>
                        <VStack align="start" spacing={1} fontSize="sm">
                          <Text><strong>Location:</strong> {myMeetup?.meetup_location || selectedLocation || '—'}</Text>
                          <Text><strong>Date:</strong> {myMeetup?.meetup_date ? new Date(myMeetup.meetup_date + 'T00:00:00').toLocaleDateString() : (selectedDate ? formatDateLabel(selectedDate) : '—')}</Text>
                          <Text><strong>Time:</strong> {myMeetup?.meetup_time ? formatTimePH(myMeetup.meetup_time) : (selectedTime ? formatTimePH(selectedTime) : '—')}</Text>
                        </VStack>
                      </Box>
                    ) : (
                      <VStack spacing={4} align="stretch" data-meetup-picker>
                      {validationError && (
                        <Box p={3} bg="red.50" borderRadius="md" borderLeft="4px" borderColor="red.500">
                          <Text fontSize="sm" color="red.700">
                            {validationError}
                          </Text>
                        </Box>
                      )}

                      <Box>
                        <Text fontSize="sm" fontWeight="medium" mb={2}>
                          Select Date
                        </Text>
                        <HStack spacing={2} flexWrap="wrap">
                          {getNext7Days().map((dateStr) => (
                            <Button
                              key={dateStr}
                              size="sm"
                              variant={selectedDate === dateStr ? 'solid' : 'outline'}
                              colorScheme={selectedDate === dateStr ? 'brand' : 'gray'}
                              onClick={() => {
                                setSelectedDate(dateStr)
                                setSelectedTime(null)
                                setValidationError(null)
                              }}
                              fontWeight="medium"
                              px={3}
                            >
                              {formatDateLabel(dateStr)}
                            </Button>
                          ))}
                        </HStack>
                      </Box>

                      <Box>
                        <Text fontSize="sm" fontWeight="medium" mb={2}>
                          Select Time
                        </Text>
                        {selectedDate ? (
                          <VStack align="start" spacing={2}>
                            <Text fontSize="xs" color="gray.600">
                              Available times (30-minute intervals):
                            </Text>
                            <SimpleGrid columns={[3, 4, 5]} spacing={2} w="full">
                              {generateTimeSlots(selectedDate).map((time) => (
                                <Button
                                  key={time}
                                  size="sm"
                                  variant={selectedTime === time ? 'solid' : 'outline'}
                                  colorScheme={selectedTime === time ? 'brand' : 'gray'}
                                  onClick={() => {
                                    setSelectedTime(time)
                                    setValidationError(null)
                                  }}
                                  fontWeight="medium"
                                  fontSize="xs"
                                >
                                  {formatTimePH(time)}
                                </Button>
                              ))}
                            </SimpleGrid>
                            {generateTimeSlots(selectedDate).length === 0 && (
                              <Text fontSize="xs" color="orange.600">
                                No available times remaining today. Please select tomorrow or a later date.
                              </Text>
                            )}
                          </VStack>
                        ) : (
                          <Text fontSize="sm" color="gray.500">
                            Select a date first to see available times
                          </Text>
                        )}
                      </Box>

                      <Button
                        colorScheme="green"
                        size="lg"
                        onClick={confirmMeetup}
                        isLoading={confirmingMeetup}
                        isDisabled={!selectedLocation || !selectedDate || !selectedTime || myMeetupConfirmed}
                        w="full"
                        fontWeight="semibold"
                        mt={3}
                        _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
                        transition="all 0.2s"
                      >
                        Confirm Schedule
                      </Button>
                    </VStack>
                    )}
                  </Box>

                  <Box pt={4}>
                    <Divider />
                    <Box p={[2, 3]} bg={meetupInfoBg} borderRadius="lg" borderWidth="1px" borderColor="blue.200">
                      <VStack spacing={[2, 3]} align="stretch">
                        <HStack justify="center" spacing={2} py={[1, 2]}>
                          <Icon as={FaHandshake} color="blue.500" boxSize={4} />
                          <Text fontWeight="bold" fontSize={['sm', 'md']} color="blue.700">
                            Meetup Agreement
                          </Text>
                        </HStack>

                        {getMeetupState() === 'none' && (
                          <Box textAlign="center" py={1}>
                            <Text fontSize={['xs', 'sm']} color="gray.600">
                              Use the Confirm button above to submit your selection.
                            </Text>
                          </Box>
                        )}

                        {getMeetupState() === 'dispute' && (
                          <Box p={3} bg={useColorModeValue('orange.50', 'orange.900')} borderRadius="md" borderWidth="1px" borderColor={useColorModeValue('orange.200', 'orange.700')}>
                            <Text fontWeight="semibold">In Dispute</Text>
                            <Text fontSize="sm" color={useColorModeValue('gray.700', 'gray.300')}>
                              This meetup is marked as disputed. Coordinate in chat to resolve and then submit matching selections.
                            </Text>
                          </Box>
                        )}

                        {getMeetupState() === 'proposed' && proposedMeetup && (
                          <VStack spacing={3} align="stretch">
                            <Box p={3} bg={useColorModeValue('white', 'gray.800')} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
                              <Text fontWeight="semibold" mb={1}>
                                Proposed Schedule
                              </Text>
                              <Text fontSize="sm" color={useColorModeValue('gray.700', 'gray.300')}>
                                {proposedMeetup.meetup_location}
                              </Text>
                              <Text fontSize="sm" color={useColorModeValue('gray.700', 'gray.300')}>
                                {new Date(proposedMeetup.meetup_date + 'T00:00:00').toLocaleDateString()} · {formatTimePH(proposedMeetup.meetup_time)}
                              </Text>
                            </Box>

                            {!myMeetupConfirmed ? (
                              <HStack spacing={2} justify="center">
                                <Button size="sm" colorScheme="green" onClick={acceptSchedule} isLoading={agreeingToSchedule}>
                                  Accept This Time
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setShowSuggestionsPanel(true)}>
                                  Suggest different time
                                </Button>
                              </HStack>
                            ) : (
                              <Text fontSize="sm" textAlign="center" color={useColorModeValue('gray.600', 'gray.400')}>
                                You already confirmed. Waiting for others.
                              </Text>
                            )}
                          </VStack>
                        )}

                        {getMeetupState() === 'mismatch' && (
                          <VStack spacing={3} align="stretch">
                            <Box p={3} bg={useColorModeValue('orange.50', 'orange.900')} borderRadius="md" borderWidth="1px" borderColor={useColorModeValue('orange.200', 'orange.700')}>
                              <HStack spacing={2}>
                                <Icon as={FaExclamationTriangle} color={useColorModeValue('orange.600', 'orange.300')} />
                                <Text fontWeight="semibold">Selection Mismatch</Text>
                              </HStack>
                              <Text fontSize="sm" color={useColorModeValue('gray.700', 'gray.300')} mt={1}>
                                Everyone confirmed different selections. Click "Change My Selection" to modify yours, or message others to coordinate.
                              </Text>
                            </Box>

                            <SimpleGrid columns={[1, 2, 3]} spacing={2}>
                              {sortedParticipants.map((p) => {
                                const sel = meetupByUserId[p.user_id]
                                const has = !!sel?.meetup_confirmed
                                return (
                                  <Box key={p.user_id} p={3} bg={useColorModeValue('white', 'gray.800')} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
                                    <Text fontSize="sm" fontWeight="semibold" mb={1}>
                                      {p.user_name}
                                    </Text>
                                    {has ? (
                                      <VStack spacing={1} align="start" fontSize="sm">
                                        <Text><strong>Location:</strong> {sel.meetup_location}</Text>
                                        <Text><strong>Date:</strong> {new Date(sel.meetup_date + 'T00:00:00').toLocaleDateString()}</Text>
                                        <Text><strong>Time:</strong> {formatTimePH(sel.meetup_time)}</Text>
                                      </VStack>
                                    ) : (
                                      <Text fontSize="sm" color={useColorModeValue('gray.600', 'gray.400')}>
                                        No selection
                                      </Text>
                                    )}
                                  </Box>
                                )
                              })}
                            </SimpleGrid>
                          </VStack>
                        )}

                        {getMeetupState() === 'finalized' && (
                          <VStack spacing={3} align="stretch">
                            <Box p={[2, 3]} bg="green.100" borderRadius="md" borderWidth="2px" borderColor="green.400" textAlign="center">
                              <Icon as={FaCheckCircle} color="green.500" boxSize={6} mb={1} />
                              <Text fontWeight="bold" color="green.700" fontSize={['sm', 'md']}>
                                {participantIds.length <= 2 ? 'You Both Agreed!' : 'Everyone Agreed!'}
                              </Text>
                              {agreedMeetup && (
                                <Text fontSize={['xs', 'sm']} color="green.600" mt={0.5}>
                                  {agreedMeetup.meetup_location} · {new Date(agreedMeetup.meetup_date + 'T00:00:00').toLocaleDateString()} · {formatTimePH(agreedMeetup.meetup_time)}
                                </Text>
                              )}
                            </Box>

                            <Button
                              size="sm"
                              colorScheme="green"
                              onClick={confirmMeetupDone}
                              isLoading={confirmingMeetupDone}
                              isDisabled={!meetupAgreed || myMetConfirmed}
                            >
                              {myMetConfirmed ? 'You already confirmed' : 'Confirm You Met'}
                            </Button>

                            {allMetConfirmed && (
                              <Button
                                colorScheme="green"
                                size="lg"
                                onClick={() => setIsReviewModalOpen(true)}
                                leftIcon={<FaStar />}
                                w="full"
                                transition="all 0.2s"
                                _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
                              >
                                Review & Complete Trade
                              </Button>
                            )}
                          </VStack>
                        )}

                        <HStack justify="space-between" pt={1}>
                          <Button size="sm" variant="outline" onClick={resetMeetupSelection} isLoading={resettingMeetup}>
                            Change My Selection
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            colorScheme="orange"
                            onClick={() => setShowDisputeDialog(true)}
                            isDisabled={allMetConfirmed}
                          >
                            Dispute
                          </Button>
                        </HStack>

                        <AlertDialog
                          isOpen={showDisputeDialog}
                          onClose={() => setShowDisputeDialog(false)}
                          leastDestructiveRef={cancelDialogRef}
                          isCentered
                        >
                          <AlertDialogOverlay>
                            <AlertDialogContent>
                              <AlertDialogHeader fontSize="lg" fontWeight="bold">
                                Report Meetup Issue
                              </AlertDialogHeader>
                              <AlertDialogBody>
                                <VStack spacing={4} align="stretch">
                                  <Text fontSize="sm" color="gray.600">
                                    What's the problem with the scheduled time?
                                  </Text>
                                  <VStack spacing={2}>
                                    <Button
                                      variant={meetupDisputeReason === 'time' ? 'solid' : 'outline'}
                                      colorScheme="orange"
                                      justifyContent="flex-start"
                                      onClick={() => setMeetupDisputeReason('time')}
                                    >
                                      The time doesn't work for me
                                    </Button>
                                    <Button
                                      variant={meetupDisputeReason === 'date' ? 'solid' : 'outline'}
                                      colorScheme="orange"
                                      justifyContent="flex-start"
                                      onClick={() => setMeetupDisputeReason('date')}
                                    >
                                      The date is inconvenient
                                    </Button>
                                    <Button
                                      variant={meetupDisputeReason === 'unresponsive' ? 'solid' : 'outline'}
                                      colorScheme="orange"
                                      justifyContent="flex-start"
                                      onClick={() => setMeetupDisputeReason('unresponsive')}
                                    >
                                      Other person is unresponsive
                                    </Button>
                                    <Button
                                      variant={meetupDisputeReason === 'conflict' ? 'solid' : 'outline'}
                                      colorScheme="orange"
                                      justifyContent="flex-start"
                                      onClick={() => setMeetupDisputeReason('conflict')}
                                    >
                                      Schedule conflict
                                    </Button>
                                  </VStack>
                                  <FormControl>
                                    <FormLabel fontSize="sm">Additional notes (optional)</FormLabel>
                                    <Textarea
                                      placeholder="Explain your concern..."
                                      value={disputeNotes}
                                      onChange={(e) => setDisputeNotes(e.target.value)}
                                      size="sm"
                                      minH="80px"
                                    />
                                  </FormControl>
                                </VStack>
                              </AlertDialogBody>
                              <AlertDialogFooter>
                                <Button ref={cancelDialogRef} onClick={() => setShowDisputeDialog(false)}>
                                  Cancel
                                </Button>
                                <Button colorScheme="orange" onClick={handleRaiseDispute} ml={3}>
                                  Report Issue
                                </Button>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialogOverlay>
                        </AlertDialog>
                      </VStack>
                    </Box>
                  </Box>
                </VStack>
              </TabPanel>

        </TabPanels>
      </Tabs>
    </ModalBody>

    <ModalFooter borderTopWidth="1px" borderColor={borderColor} pt={3} pb={3}>
      <VStack w="full" spacing={2} align="stretch">
        {/* Action Buttons */}
        <HStack w="full" spacing={2} justify="flex-end">
          {!isActiveChain ? (
            <>
              <Button
                flex={1}
                variant="ghost"
                isDisabled={loading}
                onClick={handleDecline}
                isLoading={selectedAction === 'decline' && loading}
                leftIcon={<FaTimes />}
                colorScheme="red"
              >
                Decline
              </Button>
              <Button
                flex={1}
                colorScheme="green"
                isDisabled={loading || !canAcceptLoopTrade}
                isLoading={selectedAction === 'accept' && loading}
                onClick={handleAccept}
                leftIcon={<FaCheck />}
              >
                Accept Trade
              </Button>
            </>
          ) : (
            <>
              {canExecute && (
                <Button
                  flex={1}
                  colorScheme="brand"
                  isDisabled={loading || (isTwoWayLoop && loadingReviewTrade)}
                  isLoading={selectedAction === 'execute' && loading}
                  onClick={isTwoWayLoop ? handleLeaveReview : handleExecute}
                  leftIcon={isTwoWayLoop ? <FaStar /> : <FaHandshake />}
                >
                  {isTwoWayLoop ? 'Leave Review' : 'Execute Trade'}
                </Button>
              )}
            </>
          )}
        </HStack>
      </VStack>
    </ModalFooter>
      </ModalContent>
    </Modal>
    <TradeCompletionModal
      trade={reviewTrade}
      isOpen={reviewOpen}
      onClose={() => setReviewOpen(false)}
      onCompleted={() => {
        onTradeCompleted?.()
        onClose()
      }}
      currentUserId={viewerUserId}
    />
    </>
  )
}

export default MultiWayTradeModal
