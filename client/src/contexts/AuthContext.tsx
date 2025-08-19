import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User } from '../types'
import { api } from '../services/api'

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Development mode: skip authentication for faster development
    const skipAuth = localStorage.getItem('skip_auth') === 'true'
    if (skipAuth) {
      console.log('Development mode: skipping authentication')
      setLoading(false)
      return
    }

    // Check if user is logged in on app start
    const storedToken = localStorage.getItem('clovia_token')
    if (storedToken) {
      setToken(storedToken)
      api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
      fetchUserProfile()
    } else {
      setLoading(false)
    }

    // More aggressive fallback: force loading to stop after 3 seconds
    const fallbackTimer = setTimeout(() => {
      console.log('Loading timeout - forcing loading state to false')
      setLoading(false)
    }, 3000) // 3 second fallback

    return () => clearTimeout(fallbackTimer)
  }, [])

  const fetchUserProfile = async () => {
    try {
      // Add timeout to prevent infinite loading
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout
      
      const response = await api.get('/api/users/profile', {
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      setUser(response.data.data)
    } catch (error: any) {
      console.error('Failed to fetch user profile:', error)
      
      // Clear invalid token and user data
      localStorage.removeItem('clovia_token')
      setToken(null)
      setUser(null)
      
      // If it's a network error or timeout, show a more specific message
      if (error.name === 'AbortError') {
        console.log('Request timeout - backend might be down')
      } else if (error.code === 'NETWORK_ERROR' || !error.response) {
        console.log('Network error - backend might be down')
      }
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    try {
      const response = await api.post('/api/auth/login', { email, password })
      const { token: newToken, user: userData } = response.data.data
      
      setToken(newToken)
      setUser(userData)
      localStorage.setItem('clovia_token', newToken)
      api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Login failed')
    }
  }

  const register = async (name: string, email: string, password: string) => {
    try {
      const response = await api.post('/api/auth/register', { name, email, password })
      const { token: newToken, user: userData } = response.data.data
      
      setToken(newToken)
      setUser(userData)
      localStorage.setItem('clovia_token', newToken)
      api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Registration failed')
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('clovia_token')
    delete api.defaults.headers.common['Authorization']
  }

  const value: AuthContextType = {
    user,
    token,
    login,
    register,
    logout,
    loading,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
