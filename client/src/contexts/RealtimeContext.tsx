import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './AuthContext'
import { useNotification } from './NotificationContext'
import { api, API_BASE_URL } from '../services/api'

type RealtimeContextValue = {
  offerCount: number
  notificationCount: number
  refreshCounts: () => void
}

const RealtimeContext = createContext<RealtimeContextValue>({ offerCount: 0, notificationCount: 0, refreshCounts: () => { } })

const POLL_INTERVAL_MS = 25000

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const { showNotification } = useNotification()
  const queryClient = useQueryClient()
  const esRef = useRef<EventSource | null>(null)
  const seenNotifIdsRef = useRef<Set<number>>(new Set())
  const hasInitializedSeenRef = useRef(false)
  const [offerCount, setOfferCount] = useState(0)
  const [notificationCount, setNotificationCount] = useState(0)

  const refreshCounts = useCallback(async () => {
    try {
      const [offersRes, notifRes] = await Promise.all([
        api.get('/api/trades/count', { params: { direction: 'incoming', status: 'pending' } }),
        api.get('/api/notifications'),
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
          showNotification(newest.message || 'New notification', newest.type === 'trade_offer' ? 'success' : 'info')
        }
      }
      if (seenNotifIdsRef.current.size > 50) {
        const ids = [...seenNotifIdsRef.current].slice(-25)
        seenNotifIdsRef.current = new Set(ids)
      }
    } catch { }
  }, [showNotification])

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
        const data = payload.data || {}
        const message = data.message ?? payload.message
        switch (payload.type) {
          case 'trade_created':
            // Invalidate offers/trades in React Query cache so Dashboard refreshes immediately
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            queryClient.invalidateQueries({ queryKey: ['trades'] })
            refreshCounts()
            break
          case 'trade_updated':
            showNotification(message || `Trade ${data.status || 'updated'}`, 'info')
            // Invalidate offers/trades cache so updated trade appears immediately
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            queryClient.invalidateQueries({ queryKey: ['trades'] })
            refreshCounts()
            break
          case 'notification':
            showNotification(message || 'New notification', data.alert ? 'alert' : 'success')
            refreshCounts()
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

  return (
    <RealtimeContext.Provider value={{ offerCount, notificationCount, refreshCounts }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export const useRealtime = () => useContext(RealtimeContext)


