export interface User {
  id: number
  name: string
  email: string
  role: string
  verified: boolean
  profile_picture?: string
  is_organization?: boolean
  org_verified?: boolean
  org_name?: string
  org_logo_url?: string
  department?: string
  bio?: string
  badges?: number[]
  created_at: string
  updated_at: string
  response_score?: number
  response_rating?: 'excellent' | 'good' | 'average' | 'poor'
  latitude?: number
  longitude?: number
}

export interface Product {
  id: number
  slug?: string // SEO-friendly URL identifier (e.g., "eco-bag-3f8a9d2a")
  title: string
  description: string
  price?: number
  image_urls: string[]
  seller_id: number
  seller_name?: string
  premium: boolean
  status: 'available' | 'sold' | 'traded' | 'locked'
  allow_buying: boolean
  barter_only: boolean
  location?: string
  condition?: string
  suggested_value?: number
  category?: string
  latitude?: number
  longitude?: number
  distance?: string // Calculated distance from user (e.g., "1.2km nearby")
  created_at: string
  updated_at: string
  wishlist_count?: number;
  counterfeit_confidence?: number;
  counterfeit_flags?: string[];
  latitude?: number;
  longitude?: number;
}

export interface Order {
  id: number
  product_id: number
  buyer_id: number
  status: 'pending' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
  product?: Product
  buyer?: User
}

export interface ProductCreate {
  title: string
  description: string
  price?: number
  image_urls: string[]
  premium: boolean
  allow_buying: boolean
  barter_only: boolean
  location?: string
  condition: string
  category?: string
}

export interface ProductUpdate {
  title?: string
  description?: string
  price?: number
  image_urls?: string[]
  premium?: boolean
  status?: 'available' | 'sold' | 'traded'
  allow_buying?: boolean
  barter_only?: boolean
  location?: string
  condition?: string
}

export interface OrderCreate {
  product_id: number
}

export interface OrderUpdate {
  status?: 'pending' | 'completed' | 'cancelled'
}

export interface SearchFilters {
  keyword?: string
  min_price?: number
  max_price?: number
  premium?: boolean
  status?: string
  seller_id?: number
  barter_only?: boolean
  allow_buying?: boolean
  location?: string
  page?: number
  limit?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  total_pages: number
}

export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'countered' | 'active' | 'awaiting_confirmation' | 'completed' | 'auto_completed' | 'cancelled'
export type TradeOption = 'meetup' | 'delivery'

export interface TradeItem {
  id: number
  trade_id: number
  product_id: number
  offered_by: 'buyer' | 'seller'
  created_at: string
  product_title?: string
  product_status?: 'available' | 'sold' | 'traded'
  product_image_url?: string
}

export interface Trade {
  id: number
  buyer_id: number
  seller_id: number
  target_product_id: number
  status: TradeStatus
  message?: string
  offered_cash_amount?: number | null
  created_at: string
  updated_at: string
  items: TradeItem[]
  buyer_name?: string
  seller_name?: string
  product_title?: string
  buyer_completed?: boolean
  seller_completed?: boolean
  completed_at?: string | null
  meetup_confirmed?: boolean
  meetup_location?: string
  buyer_meetup_confirmed?: boolean
  seller_meetup_confirmed?: boolean
  transaction_proof_url?: string
  trade_option?: TradeOption // 'meetup' or 'delivery'
  option_change_requested?: TradeOption // Requested option change (pending approval)
  option_change_requested_by?: number // User ID who requested the change
  delivery_address?: string // Delivery address if option is 'delivery'
  delivery_estimated_time?: string // Estimated delivery time
}

export interface TradeCreate {
  target_product_id: number
  offered_product_ids: number[]
  message?: string
  offered_cash_amount?: number
  trade_option: TradeOption // Required: 'meetup' or 'delivery'
  delivery_address?: string // Required if trade_option is 'delivery'
}

export interface TradeAction {
  action: 'accept' | 'decline' | 'counter' | 'complete' | 'cancel' | 'request_option_change' | 'approve_option_change' | 'reject_option_change'
  message?: string
  counter_offered_product_ids?: number[]
  counter_offered_cash_amount?: number
  requested_option?: TradeOption // For option change requests
  delivery_address?: string // For delivery option
}

export interface APIResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  error?: string
}

// AI Features Types
export interface DistanceResult {
  distance_km: number
  distance_miles: number
  distance_m: number
}

export interface ResponseMetrics {
  average_response_time_hours: number
  average_response_time_mins: number
  response_rate: number
  total_messages: number
  total_responses: number
  response_score: number
  last_response_at?: string
  rating: 'excellent' | 'good' | 'average' | 'poor'
}

export interface ProfileAnalysis {
  is_outdated: boolean
  is_inactive: boolean
  last_activity_at?: string
  profile_age_days: number
  recommendations: string[]
  score: number
}

export interface CounterfeitReport {
  is_suspicious: boolean
  reason: string
  confidence: number
  flags: string[]
}
