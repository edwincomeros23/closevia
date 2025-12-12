import { useCallback, useRef, useEffect } from 'react'
import { api } from '../services/api'

interface TradeCompletionState {
  tradeId: number
  buyerCompleted: boolean
  sellerCompleted: boolean
  status: 'active' | 'completed'
}

interface UseTradeCompletionProps {
  tradeId: number
  onStatusChange?: (state: TradeCompletionState) => void
}

export const useTradeCompletion = ({ tradeId, onStatusChange }: UseTradeCompletionProps) => {
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef(false)

  // Complete trade for current user
  const completeTrade = useCallback(async () => {
    try {
      const response = await api.post('/api/trades/complete', {
        trade_id: tradeId,
      })

      if (response.data.success) {
        // Immediately poll for updated status
        await pollTradeStatus()
        return true
      }
      return false
    } catch (error: any) {
      console.error('Failed to complete trade:', error)
      throw error
    }
  }, [tradeId])

  // Poll trade status
  const pollTradeStatus = useCallback(async () => {
    try {
      const response = await api.get(`/api/trades/${tradeId}`)
      const tradeData = response.data.data

      const state: TradeCompletionState = {
        tradeId,
        buyerCompleted: tradeData.buyer_completed || false,
        sellerCompleted: tradeData.seller_completed || false,
        status: tradeData.status || 'active',
      }

      onStatusChange?.(state)
      return state
    } catch (error: any) {
      console.error('Failed to fetch trade status:', error)
      return null
    }
  }, [tradeId, onStatusChange])

  // Start polling with exponential backoff
  const startPolling = useCallback(
    (intervalMs: number = 2000) => {
      if (isPollingRef.current) return

      isPollingRef.current = true
      pollIntervalRef.current = setInterval(async () => {
        await pollTradeStatus()
      }, intervalMs)
    },
    [pollTradeStatus]
  )

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    isPollingRef.current = false
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return {
    completeTrade,
    pollTradeStatus,
    startPolling,
    stopPolling,
  }
}
