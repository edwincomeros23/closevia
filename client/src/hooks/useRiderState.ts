import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'

// Rider states as defined in the backend
export type RiderState = 'NOT_APPLIED' | 'PENDING_APPROVAL' | 'REJECTED' | 'READY' | 'WORKING' | 'LOCKED'

export interface RiderPermissions {
  can_view_jobs: boolean
  can_claim_jobs: boolean
  can_view_earnings: boolean
}

export interface RiderStateData {
  state: RiderState
  rider_id?: number
  full_name?: string
  message: string
  rejection_reason?: string
  show_welcome: boolean
  free_delivery_slots: number
  completed_deliveries: number
  rating: number
  first_login_completed: boolean
  permissions: RiderPermissions
  can_apply?: boolean
}

interface UseRiderStateReturn {
  riderState: RiderStateData | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  markFirstLoginComplete: () => Promise<void>
}

export function useRiderState(): UseRiderStateReturn {
  const [riderState, setRiderState] = useState<RiderStateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRiderState = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/api/deliveries/rider-state')
      if (response.data?.success) {
        setRiderState(response.data.data)
      } else {
        setError(response.data?.error || 'Failed to fetch rider state')
      }
    } catch (err: any) {
      // If 401, user is not logged in - this is expected for guests
      if (err?.response?.status === 401) {
        setRiderState({
          state: 'NOT_APPLIED',
          message: 'Please log in to apply as a rider.',
          show_welcome: false,
          free_delivery_slots: 0,
          completed_deliveries: 0,
          rating: 0,
          first_login_completed: false,
          permissions: { can_view_jobs: false, can_claim_jobs: false, can_view_earnings: false },
          can_apply: false,
        })
      } else {
        setError(err?.message || 'Failed to fetch rider state')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const markFirstLoginComplete = useCallback(async () => {
    try {
      await api.post('/api/deliveries/rider-first-login-complete')
      // Refetch to update state
      await fetchRiderState()
    } catch (err) {
      console.error('Failed to mark first login complete:', err)
    }
  }, [fetchRiderState])

  useEffect(() => {
    fetchRiderState()
  }, [fetchRiderState])

  return {
    riderState,
    loading,
    error,
    refetch: fetchRiderState,
    markFirstLoginComplete,
  }
}
