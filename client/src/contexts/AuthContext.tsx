import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react'
import { User } from '../types'
import { api, API_BASE_URL } from '../services/api'

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  googleLogin: (firebaseToken: string, userData: any) => Promise<void>
  register: (payload: { name: string; email: string; phone?: string; password: string; is_organization?: boolean; org_name?: string; department?: string; org_logo_url?: string; bio?: string; organization_type?: string }) => Promise<{ requiresVerification: boolean; email: string; token?: string }>
  logout: () => void
  updateProfile: (payload: { name?: string; email?: string; profile_picture?: string; phone?: string; phone_verified?: boolean }) => Promise<void>
  refreshUser: () => Promise<void>
  restoreAuthentication: () => Promise<void>
  completeLogin: (token: string, user?: User) => Promise<void>
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

// Helper to safely read cached user from localStorage
const getCachedUser = (): User | null => {
  try {
    const raw = localStorage.getItem('clovia_user')
    if (raw) return JSON.parse(raw)
  } catch (e) { /* corrupted data */ }
  return null
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // Synchronously initialize from localStorage so auth survives refresh
  const [user, setUserState] = useState<User | null>(() => getCachedUser())
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('clovia_token'))
  const [loading, setLoading] = useState(true)
  const [authInitialized, setAuthInitialized] = useState(false)
  const initOnceRef = useRef(false)
  const lastNetworkErrorRef = useRef<number>(0)
  const restoringRef = useRef(false)

  // Wrappers that keep localStorage in sync with React state
  const setToken = (newToken: string | null) => {
    setTokenState(newToken)
    if (newToken) {
      localStorage.setItem('clovia_token', newToken)
    } else {
      localStorage.removeItem('clovia_token')
    }
  }

  const setUser = (newUser: User | null | ((prev: User | null) => User | null)) => {
    setUserState(prev => {
      const resolved = typeof newUser === 'function' ? newUser(prev) : newUser
      if (resolved) {
        localStorage.setItem('clovia_user', JSON.stringify(resolved))
      } else {
        localStorage.removeItem('clovia_user')
      }
      return resolved
    })
  }

  // Set auth header immediately if token exists (before any useEffect fires)
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  }

  const normalizeProfilePicture = (pic?: string) => {
    if (!pic || typeof pic !== 'string') return pic
    const cleaned = pic.replace(/[?&]t=\d+/g, '')
    return cleaned.startsWith('/') ? `${API_BASE_URL}${cleaned}` : cleaned
  }

  const normalizeUser = (data: any) => {
    if (!data) return data
    const normalized = { ...data }
    if (typeof normalized.profile_picture === 'string') {
      normalized.profile_picture = normalizeProfilePicture(normalized.profile_picture)
    }
    return normalized
  }

  // Computed authentication state
  const isAuthenticated = !!(user && token)

  useEffect(() => {
    // Prevent double execution in React StrictMode (dev)
    if (initOnceRef.current) return
    initOnceRef.current = true

    console.log('AuthContext: Initializing authentication check')

    // Initialize auth synchronously from localStorage first
    const initializeAuth = async () => {
      try {
        // Development mode: skip authentication for faster development
        const skipAuth = localStorage.getItem('skip_auth') === 'true'
        if (skipAuth) {
          console.log('AuthContext: Development mode: skipping authentication')
          setAuthInitialized(true)
          setLoading(false)
          return
        }

        // Check if user is logged in on app start
        const storedToken = localStorage.getItem('clovia_token')
        console.log('AuthContext: Stored token found:', !!storedToken, 'Cached user:', !!getCachedUser())

        if (storedToken) {
          console.log('AuthContext: Token exists, refreshing user profile in background')
          // Token and user are already set from sync initialization.
          // Just refresh the profile in the background to get latest data.
          api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
          await fetchUserProfile(storedToken)
        } else {
          console.log('AuthContext: No stored token found')
        }
      } catch (error) {
        console.error('AuthContext: Error during initialization:', error)
      } finally {
        setAuthInitialized(true)
        setLoading(false)
      }
    }

    initializeAuth()
  }, [])

  const fetchUserProfile = async (currentToken?: string) => {
    try {
      console.log('AuthContext: Fetching user profile from /api/users/profile')
      // Add timeout to prevent infinite loading (generous for mobile connections)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

      const response = await api.get('/api/users/profile', {
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      console.log('AuthContext: User profile response received:', response.data)

      const rawData = response.data.data
      const userData = normalizeUser(rawData?.user || rawData)
      console.log('AuthContext: Setting user data:', userData)
      console.log('AuthContext: User ID from response:', userData?.id, 'Type:', typeof userData?.id)
      console.log('AuthContext: User object keys:', userData ? Object.keys(userData) : 'null')
      setUser(userData)

      // If token was passed, ensure it's set in state
      if (currentToken && !token) {
        setToken(currentToken)
      }
    } catch (error: any) {
      // Ignore canceled requests (happens during navigation or component unmount)
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        console.log('AuthContext: Request canceled (navigation or unmount)')
        return
      }

      console.error('AuthContext: Failed to fetch user profile:', error)

      // Only clear auth if it's a genuine 401 (unauthorized) error
      if (error.response?.status === 401) {
        console.log('AuthContext: Token invalid or expired (401), clearing authentication')
        setToken(null)
        setUser(null)
        delete api.defaults.headers.common['Authorization']
      } else if (error.response?.status === 404) {
        // User not found in database - clear auth
        console.log('AuthContext: User not found (404), clearing authentication')
        setToken(null)
        setUser(null)
        delete api.defaults.headers.common['Authorization']
      } else {
        // For network errors, timeouts, or server errors (5xx):
        // Keep the token AND user from cache so the user stays logged in
        console.log('AuthContext: Network/server error, keeping cached authentication')
      }

      // If it's a network error or timeout, show a more specific message
      if (error.name === 'AbortError') {
        console.log('AuthContext: Request timeout - backend might be down')
      } else if (error.code === 'NETWORK_ERROR' || !error.response) {
        const now = Date.now()
        if (now - lastNetworkErrorRef.current > 5000) {
          console.log('AuthContext: Network error - backend might be down')
          lastNetworkErrorRef.current = now
        }
      } else if (error.response?.status === 401) {
        console.log('AuthContext: Token invalid or expired')
      }
    }
  }

  // Exposed helper to allow components to refresh user data after updates
  const refreshUser = async () => {
    console.log('AuthContext: Manual refresh requested')
    // Don't change loading state - just refresh user data silently
    await fetchUserProfile(token || undefined)
  }

  // Helper to check and restore authentication from stored token
  const restoreAuthentication = async () => {
    if (restoringRef.current) return
    restoringRef.current = true
    try {
      console.log('AuthContext: Restoring authentication from stored token')
      const storedToken = localStorage.getItem('clovia_token')
      if (!storedToken) return

      // Ensure axios is using the stored token
      if (storedToken !== token) {
        console.log('AuthContext: Token mismatch or missing in state, restoring...')
        setToken(storedToken)
      }
      api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`

      // If user is missing, fetch profile to populate it
      if (!user) {
        await fetchUserProfile(storedToken)
      }
    } finally {
      restoringRef.current = false
    }
  }

  const login = async (email: string, password: string) => {
    try {
      const response = await api.post('/api/auth/login', { email, password })
      const { token: newToken, user: userData } = response.data.data

      // Use centralized completeLogin to handle state and persistence
      const normalizedUser = await completeLogin(newToken, userData)
      
      console.log('AuthContext: Login successful')
      return normalizedUser
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Login failed')
    }
  }

  const completeLogin = async (newToken: string, userData?: User) => {
    console.log('AuthContext: Completing login with token and user data:', !!userData)
    
    // 1. Set authorization header for current and future requests
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
    
    // 2. Update token state (triggers localStorage update via wrapper)
    setToken(newToken)
    
    // 3. Update user state if provided, otherwise fetch it
    let finalUser = userData ? normalizeUser(userData) : null
    
    if (finalUser) {
      setUser(finalUser)
    }
    
    // 4. Always ensure we have the latest profile from server
    // (This also handles the case where userData wasn't provided)
    await fetchUserProfile(newToken)
    
    // Get the updated user from state or freshly fetched
    // Note: setUser is async-ish via state update, so we return what we just fetched/normalized
    return finalUser
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

      // Use centralized completeLogin to handle state and persistence
      const normalizedUser = await completeLogin(newToken, userDataResponse)
      
      console.log('AuthContext: Google login completed successfully')
      return normalizedUser
    } catch (error: any) {
      console.error('AuthContext: Google login failed:', error)
      throw new Error(error.response?.data?.error || 'Google login failed')
    }
  }

  const updateProfile = async (payload: { name?: string; email?: string; profile_picture?: string; phone?: string; phone_verified?: boolean }) => {
    try {
      // Only call backend for fields the server accepts (name/email)
      const serverPayload: any = {}
      if (payload.name !== undefined) serverPayload.name = payload.name
      if (payload.email !== undefined) serverPayload.email = payload.email
      if (payload.profile_picture !== undefined) serverPayload.profile_picture = payload.profile_picture
      if (payload.phone !== undefined) serverPayload.phone = payload.phone
      if (payload.phone_verified !== undefined) serverPayload.phone_verified = payload.phone_verified

      if (Object.keys(serverPayload).length > 0) {
        await api.put('/api/users/profile', serverPayload)
      }

      // Update local user state but only overwrite fields that are defined
      setUser((prev) => {
        const updated = prev ? { ...(prev as any) } as User : {} as User
        if (payload.name !== undefined) updated.name = payload.name as string
        if (payload.email !== undefined) updated.email = payload.email as string
        if (payload.phone !== undefined) updated.phone = payload.phone as string
        if (payload.phone_verified !== undefined) (updated as any).phone_verified = payload.phone_verified as boolean
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

  const register = async (payload: { name: string; email: string; phone?: string; password: string; is_organization?: boolean; org_name?: string; department?: string; org_logo_url?: string; bio?: string; organization_type?: string }): Promise<{ requiresVerification: boolean; email: string; token?: string }> => {
    try {
      const response = await api.post('/api/auth/register', payload)
      console.log('AuthContext: Register raw response:', JSON.stringify(response.data))

      const responseData = response.data.data
      const requiresVerification = !!(responseData?.requires_verification)

      console.log('AuthContext: requires_verification =', requiresVerification, '| responseData keys:', Object.keys(responseData || {}))

      if (requiresVerification) {
        console.log('AuthContext: Redirecting to /verify-email')
        return { requiresVerification: true, email: payload.email }
      }

      // Verification disabled — token returned directly; store it and log the user in
      const { token: newToken, user: userData } = responseData

      // Use centralized completeLogin to handle state and persistence
      await completeLogin(newToken, userData)

      console.log('AuthContext: Registration successful')
      return { requiresVerification: false, email: payload.email, token: newToken }
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Registration failed')
    }
  }

  const logout = () => {
    console.log('AuthContext: Logging out user')
    delete api.defaults.headers.common['Authorization']
    setToken(null)
    setUser(null)
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
    completeLogin,
    loading,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
