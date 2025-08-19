export interface User {
  id: number
  name: string
  email: string
  verified: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: number
  title: string
  description: string
  price?: number
  image_urls: string[]
  seller_id: number
  seller_name?: string
  premium: boolean
  status: 'available' | 'sold'
  allow_buying: boolean
  barter_only: boolean
  location?: string
  created_at: string
  updated_at: string
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
}

export interface ProductUpdate {
  title?: string
  description?: string
  price?: number
  image_urls?: string[]
  premium?: boolean
  status?: 'available' | 'sold'
  allow_buying?: boolean
  barter_only?: boolean
  location?: string
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

export interface APIResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  error?: string
}
