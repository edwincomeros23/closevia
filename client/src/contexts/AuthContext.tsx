import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User } from '../types'
import { api, API_BASE_URL } from '../services/api'

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  googleLogin: (firebaseToken: string, userData: any) => Promise<void>
  register: (payload: { name: string; email: string; password: string; is_organization?: boolean; org_name?: string; department?: string; org_logo_url?: string; bio?: string }) => Promise<void>
  logout: () => void
  updateProfile: (payload: { name?: string; email?: string; profile_picture?: string }) => Promise<void>
  refreshUser: () => Promise<void>
  restoreAuthentication: () => Promise<void>
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

  // Computed authentication state
  const isAuthenticated = !!(user && token)

  useEffect(() => {
    console.log('AuthContext: Initializing authentication check')

    // Development mode: skip authentication for faster development
    const skipAuth = localStorage.getItem('skip_auth') === 'true'
    if (skipAuth) {
      console.log('AuthContext: Development mode: skipping authentication')
      setLoading(false)
      return
    }

    // Check if user is logged in on app start
    const storedToken = localStorage.getItem('clovia_token')
    console.log('AuthContext: Stored token found:', !!storedToken)
    if (storedToken) {
      console.log('AuthContext: Setting token and fetching user profile')
      setToken(storedToken)
      api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
      fetchUserProfile()
    } else {
      console.log('AuthContext: No stored token, setting loading to false')
      setLoading(false)
    }

    // More aggressive fallback: force loading to stop after 3 seconds
    const fallbackTimer = setTimeout(() => {
      console.log('AuthContext: Loading timeout - forcing loading state to false')
      setLoading(false)
    }, 3000) // 3 second fallback

    return () => clearTimeout(fallbackTimer)
  }, [])

  const fetchUserProfile = async () => {
    try {
      console.log('AuthContext: Fetching user profile from /api/users/profile')
      // Add timeout to prevent infinite loading
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout

      const response = await api.get('/api/users/profile', {
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      console.log('AuthContext: User profile response received:', response.data)

      // Normalize profile_picture: if backend returned a relative path ("/uploads/.."),
      // prefix it with the API base URL so the browser loads from the backend origin.
      const userData = response.data.data as any
      if (userData && userData.profile_picture && typeof userData.profile_picture === 'string') {
        if (userData.profile_picture.startsWith('/')) {
          userData.profile_picture = `${API_BASE_URL}${userData.profile_picture}`
        }
      }
      console.log('AuthContext: Setting user data:', userData)
      setUser(userData)
    } catch (error: any) {
      console.error('AuthContext: Failed to fetch user profile:', error)

      // Only clear token if it's a 401 (unauthorized) error
      // For network errors, keep the token and allow manual retry
      if (error.response?.status === 401) {
        console.log('AuthContext: Token invalid or expired, clearing authentication')
        localStorage.removeItem('clovia_token')
        setToken(null)
        setUser(null)
      } else {
        // For network errors or other issues, keep the token but clear user state
        console.log('AuthContext: Network or server error, keeping token for retry')
        setUser(null)
        // Don't clear token here - user might be able to retry
      }

      // If it's a network error or timeout, show a more specific message
      if (error.name === 'AbortError') {
        console.log('AuthContext: Request timeout - backend might be down')
      } else if (error.code === 'NETWORK_ERROR' || !error.response) {
        console.log('AuthContext: Network error - backend might be down')
      } else if (error.response?.status === 401) {
        console.log('AuthContext: Token invalid or expired')
      }
    } finally {
      console.log('AuthContext: Setting loading to false')
      setLoading(false)
    }
  }

  // Exposed helper to allow components to refresh user data after updates
  const refreshUser = async () => {
    console.log('AuthContext: Manual refresh requested')
    setLoading(true)
    await fetchUserProfile()
  }

  // Helper to check and restore authentication from stored token
  const restoreAuthentication = async () => {
    console.log('AuthContext: Restoring authentication from stored token')
    const storedToken = localStorage.getItem('clovia_token')
    if (storedToken && !token) {
      setToken(storedToken)
      api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
      setLoading(true)
      await fetchUserProfile()
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

  const googleLogin = async (firebaseToken: string, userData: any) => {
    try {
      console.log('AuthContext: Starting Google login process')
      const response = await api.post('/api/auth/google', {
        idToken: firebaseToken,
        uid: userData.uid,
        email: userData.email,
        displayName: userData.displayName,
        photoURL: userData.photoURL,
      })
      console.log('AuthContext: Backend response received:', response.data)
      const { token: newToken, user: userDataResponse } = response.data.data

      console.log('AuthContext: Setting token and user state')
      setToken(newToken)
      setUser(userDataResponse)
      localStorage.setItem('clovia_token', newToken)
      api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
      console.log('AuthContext: Google login completed successfully')
    } catch (error: any) {
      console.error('AuthContext: Google login failed:', error)
      throw new Error(error.response?.data?.error || 'Google login failed')
    }
  }

  const updateProfile = async (payload: { name?: string; email?: string; profile_picture?: string }) => {
    try {
      // Only call backend for fields the server accepts (name/email)
      const serverPayload: any = {}
      if (payload.name !== undefined) serverPayload.name = payload.name
      if (payload.email !== undefined) serverPayload.email = payload.email
      if (payload.profile_picture !== undefined) serverPayload.profile_picture = payload.profile_picture

      if (Object.keys(serverPayload).length > 0) {
        await api.put('/api/users/profile', serverPayload)
      }

      // Update local user state but only overwrite fields that are defined
      setUser((prev) => {
        const updated = prev ? { ...(prev as any) } as User : {} as User
        if (payload.name !== undefined) updated.name = payload.name as string
        if (payload.email !== undefined) updated.email = payload.email as string
        if (payload.profile_picture !== undefined) {
          // Normalize stored profile picture URL if backend returned a relative path
          let pic = payload.profile_picture as string
          if (pic.startsWith('/')) pic = `${API_BASE_URL}${pic}`
          updated.profile_picture = pic
        }
        // If there was no previous user, and we have at least one field, return it
        if (!prev) {
          return updated
        }
        return updated
      })
    } catch (error: any) {
      // bubble up error to caller
      throw error
    }
  }

  const register = async (payload: { name: string; email: string; password: string; is_organization?: boolean; org_name?: string; department?: string; org_logo_url?: string; bio?: string }) => {
    try {
      const response = await api.post('/api/auth/register', payload)
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
    isAuthenticated,
    login,
    googleLogin,
    register,
    logout,
    updateProfile,
    refreshUser,
    restoreAuthentication,
    loading,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
