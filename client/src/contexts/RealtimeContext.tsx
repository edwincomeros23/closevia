import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './AuthContext'
import { useNotification } from './NotificationContext'
import { api, API_BASE_URL } from '../services/api'

type RealtimeContextValue = {
  offerCount: number
  notificationCount: number
  refreshCounts: () => void
  refreshProducts: () => void
  refreshSentOffers: () => void
  refreshReceivedOffers: () => void
  refreshOngoingTrades: () => void
  refreshMultiWayTrades: () => void
  refreshHistory: () => void
  setRefreshCallback: (tabType: 'products' | 'sentOffers' | 'receivedOffers' | 'ongoingTrades' | 'multiway' | 'history' | 'multiwayAlert', cb: () => void) => void
}

const RealtimeContext = createContext<RealtimeContextValue>({
  offerCount: 0,
  notificationCount: 0,
  refreshCounts: () => { },
  refreshProducts: () => { },
  refreshSentOffers: () => { },
  refreshReceivedOffers: () => { },
  refreshOngoingTrades: () => { },
  refreshMultiWayTrades: () => { },
  refreshHistory: () => { },
  setRefreshCallback: () => { },
})

const POLL_INTERVAL_MS = 60000
const SSE_MESSAGE_DEDUP_WINDOW = 2000  // Prevent duplicate SSE messages within 2 seconds

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const { showNotification } = useNotification()
  const queryClient = useQueryClient()
  const esRef = useRef<EventSource | null>(null)
  const seenNotifIdsRef = useRef<Set<number>>(new Set())
  const hasInitializedSeenRef = useRef(false)
  const recentSSEMessagesRef = useRef<Map<string, number>>(new Map())  // Track recent SSE messages
  const refreshCallbacksRef = useRef<{
    products: (() => void) | null
    sentOffers: (() => void) | null
    receivedOffers: (() => void) | null
    ongoingTrades: (() => void) | null
    multiway: (() => void) | null
    history: (() => void) | null
    multiwayAlert: (() => void) | null
  }>({
    products: null,
    sentOffers: null,
    receivedOffers: null,
    ongoingTrades: null,
    multiway: null,
    history: null,
    multiwayAlert: null,
  })
  const [offerCount, setOfferCount] = useState(0)
  const [notificationCount, setNotificationCount] = useState(0)

  const refreshCounts = useCallback(async () => {
    try {
      // Admin only sees report notifications, so only count those for the badge
      const notifEndpoint = user?.role === 'admin' ? '/api/notifications?type=report' : '/api/notifications'
      const [offersRes, notifRes] = await Promise.all([
        api.get('/api/trades/count', { params: { direction: 'incoming', status: 'pending' } }),
        api.get(notifEndpoint),
      ])
      const count = offersRes.data?.data?.count ?? 0
      setOfferCount(count)
      const notifs = Array.isArray(notifRes.data?.data) ? notifRes.data.data : []
      setNotificationCount(notifs.filter((n: any) => !n.read).length)

      // Polling fallback: show global toast for new unread notifications we haven't seen
      if (!hasInitializedSeenRef.current) {
        notifs.forEach((n: any) => seenNotifIdsRef.current.add(n.id))
        hasInitializedSeenRef.current = true
      } else {
        const unread = notifs.filter((n: any) => !n.read)
        const newest = unread.sort((a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
        if (newest && !seenNotifIdsRef.current.has(newest.id)) {
          seenNotifIdsRef.current.add(newest.id)

          // Trigger appropriate tab refreshes based on notification type
          const notifType = newest.type || ''
          if (notifType === 'trade_loop') {
            // Refresh multi-way tab — do NOT show global toast; Dashboard handles it
            if (refreshCallbacksRef.current.multiway) refreshCallbacksRef.current.multiway()
            if (refreshCallbacksRef.current.multiwayAlert) refreshCallbacksRef.current.multiwayAlert()
          } else {
            showNotification(newest.message || 'New notification', notifType === 'trade_offer' ? 'success' : 'info')
          }
          if (notifType === 'trade_offer' || notifType === 'trade_update') {
            // Refresh offers/trades tabs when trade updates occur
            if (refreshCallbacksRef.current.receivedOffers) {
              refreshCallbacksRef.current.receivedOffers()
            }
            if (refreshCallbacksRef.current.ongoingTrades) {
              refreshCallbacksRef.current.ongoingTrades()
            }
          }
        }
      }
      if (seenNotifIdsRef.current.size > 50) {
        const ids = [...seenNotifIdsRef.current].slice(-25)
        seenNotifIdsRef.current = new Set(ids)
      }
    } catch { }
  }, [user, showNotification])

  useEffect(() => {
    if (!user) {
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
      seenNotifIdsRef.current = new Set()
      hasInitializedSeenRef.current = false
      return
    }
    // Use token for SSE auth
    const token = localStorage.getItem('clovia_token')
    if (!token) return
    const base = API_BASE_URL.replace(/\/$/, '')
    const url = `${base}/api/chat/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data)
        if (!payload?.type) return
        
        // Deduplicate SSE messages: create a unique key and check if we've processed this recently
        const messageKey = JSON.stringify(payload)
        const lastProcessedTime = recentSSEMessagesRef.current.get(messageKey)
        if (lastProcessedTime && Date.now() - lastProcessedTime < SSE_MESSAGE_DEDUP_WINDOW) {
          // Skip this duplicate message
          return
        }
        recentSSEMessagesRef.current.set(messageKey, Date.now())
        
        // Clean up old messages from the map to prevent memory leaks
        if (recentSSEMessagesRef.current.size > 100) {
          const oldestEntries = Array.from(recentSSEMessagesRef.current.entries())
            .sort((a, b) => a[1] - b[1])
            .slice(0, 50)
          oldestEntries.forEach(([key]) => recentSSEMessagesRef.current.delete(key))
        }
        
        const data = payload.data || {}
        const message = data.message ?? payload.message
        switch (payload.type) {
          case 'trade_created':
            // Invalidate offers/trades in React Query cache so Dashboard refreshes immediately
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            queryClient.invalidateQueries({ queryKey: ['trades'] })
            refreshCounts()
            // Refresh received offers and ongoing trades
            if (refreshCallbacksRef.current.receivedOffers) {
              refreshCallbacksRef.current.receivedOffers()
            }
            if (refreshCallbacksRef.current.ongoingTrades) {
              refreshCallbacksRef.current.ongoingTrades()
            }
            break
          case 'multiway_opportunity':
            // Multiway loop found for this user — refresh data, let Dashboard show the alert
            if (refreshCallbacksRef.current.multiway) refreshCallbacksRef.current.multiway()
            if (refreshCallbacksRef.current.multiwayAlert) refreshCallbacksRef.current.multiwayAlert()
            break
          case 'trade_updated':
            if (data.notification_type === 'trade_loop') {
              // Multiway update — refresh data, let Dashboard show the alert (no global toast)
              if (refreshCallbacksRef.current.multiway) refreshCallbacksRef.current.multiway()
              if (refreshCallbacksRef.current.multiwayAlert) refreshCallbacksRef.current.multiwayAlert()
            } else {
              showNotification(message || `Trade ${data.status || 'updated'}`, 'info')
            }
            // Invalidate offers/trades cache so updated trade appears immediately
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            queryClient.invalidateQueries({ queryKey: ['trades'] })
            refreshCounts()
            if (refreshCallbacksRef.current.receivedOffers) refreshCallbacksRef.current.receivedOffers()
            if (refreshCallbacksRef.current.ongoingTrades) refreshCallbacksRef.current.ongoingTrades()
            break
          case 'notification':
            refreshCounts()
            if (data.notification_type === 'trade_loop') {
              // Multiway notification — let Dashboard handle the toast, not a global popup
              if (refreshCallbacksRef.current.multiway) refreshCallbacksRef.current.multiway()
              if (refreshCallbacksRef.current.multiwayAlert) refreshCallbacksRef.current.multiwayAlert()
            } else if (data.notification_type === 'trade_offer') {
              showNotification(message || 'New notification', 'success')
              if (refreshCallbacksRef.current.receivedOffers) refreshCallbacksRef.current.receivedOffers()
            } else if (data.notification_type === 'product_sold') {
              showNotification(message || 'New notification', data.alert ? 'alert' : 'success')
              if (refreshCallbacksRef.current.products) refreshCallbacksRef.current.products()
            } else {
              showNotification(message || 'New notification', data.alert ? 'alert' : 'success')
            }
            break
          case 'trade_message':
            break
          default:
            break
        }
      } catch { }
    }

    es.onerror = () => {
      // auto-reconnect pattern: close and let useEffect create again on next render
      es.close()
      esRef.current = null
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [user])

  useEffect(() => { if (user) refreshCounts() }, [user, refreshCounts])

  // Polling fallback when SSE may not deliver (e.g. tab backgrounded, connection issues)
  useEffect(() => {
    if (!user) return
    const interval = setInterval(refreshCounts, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [user, refreshCounts])

  const refreshMultiWayTrades = useCallback(() => {
    if (refreshCallbacksRef.current.multiway) {
      refreshCallbacksRef.current.multiway()
    }
  }, [])

  const refreshProducts = useCallback(() => {
    if (refreshCallbacksRef.current.products) {
      refreshCallbacksRef.current.products()
    }
  }, [])

  const refreshSentOffers = useCallback(() => {
    if (refreshCallbacksRef.current.sentOffers) {
      refreshCallbacksRef.current.sentOffers()
    }
  }, [])

  const refreshReceivedOffers = useCallback(() => {
    if (refreshCallbacksRef.current.receivedOffers) {
      refreshCallbacksRef.current.receivedOffers()
    }
  }, [])

  const refreshOngoingTrades = useCallback(() => {
    if (refreshCallbacksRef.current.ongoingTrades) {
      refreshCallbacksRef.current.ongoingTrades()
    }
  }, [])

  const refreshHistory = useCallback(() => {
    if (refreshCallbacksRef.current.history) {
      refreshCallbacksRef.current.history()
    }
  }, [])

  const setRefreshCallback = useCallback((tabType: 'products' | 'sentOffers' | 'receivedOffers' | 'ongoingTrades' | 'multiway' | 'history' | 'multiwayAlert', cb: () => void) => {
    refreshCallbacksRef.current[tabType] = cb
  }, [])

  return (
    <RealtimeContext.Provider value={{
      offerCount,
      notificationCount,
      refreshCounts,
      refreshProducts,
      refreshSentOffers,
      refreshReceivedOffers,
      refreshOngoingTrades,
      refreshMultiWayTrades,
      refreshHistory,
      setRefreshCallback,
    }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export const useRealtime = () => useContext(RealtimeContext)


