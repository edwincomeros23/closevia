import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react'

export type NotificationType = 'success' | 'alert' | 'info'

export interface Notification {
  id: string
  message: string
  type: NotificationType
  createdAt: number
}

interface NotificationContextType {
  notifications: Notification[]
  showNotification: (message: string, type?: NotificationType) => void
  dismissNotification: (id: string) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

const MAX_STACK = 3
const AUTO_DISMISS_MS = 5000
// Deduplicate identical notifications within this window to prevent spam
const DEDUP_WINDOW_MS = 1500

export const useNotification = () => {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return context
}

interface NotificationProviderProps {
  children: ReactNode
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const recentNotificationsRef = useRef<Map<string, { type: NotificationType; timestamp: number }>>(new Map())
  
  // Clean up old entries in recentNotifications map
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      recentNotificationsRef.current.forEach((data, message) => {
        if (now - data.timestamp > DEDUP_WINDOW_MS) {
          recentNotificationsRef.current.delete(message)
        }
      })
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const showNotification = useCallback((message: string, type: NotificationType = 'info') => {
    // Create a unique key for this notification (message + type)
    const notifKey = `${type}:${message}`
    
    // Check if this notification was shown recently
    const lastEntry = recentNotificationsRef.current.get(notifKey)
    if (lastEntry && Date.now() - lastEntry.timestamp < DEDUP_WINDOW_MS) {
      // Skip duplicate notification
      return
    }
    
    // Record this notification
    recentNotificationsRef.current.set(notifKey, { type, timestamp: Date.now() })

    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const newNotif: Notification = { id, message, type, createdAt: Date.now() }

    setNotifications(prev => {
      const updated = [newNotif, ...prev].slice(0, MAX_STACK)
      return updated
    })
  }, [])

  return (
    <NotificationContext.Provider value={{ notifications, showNotification, dismissNotification }}>
      {children}
    </NotificationContext.Provider>
  )
}

export { NotificationContext }
export const NOTIFICATION_AUTO_DISMISS_MS = AUTO_DISMISS_MS
