import { create } from 'zustand'
import type { AppNotification } from '@shared/ipc'

interface NotificationState {
  notifications: AppNotification[]
  // Track terminals with pending notifications (for blinking indicator)
  notifyingTerminals: Set<string>
  
  // Actions
  addNotification: (notification: AppNotification) => void
  dismissNotification: (id: string) => void
  clearAll: () => void
  // Clear notification state for a specific terminal (when user focuses it)
  clearTerminalNotification: (terminalId: string) => void
  // Check if terminal has pending notification
  hasTerminalNotification: (terminalId: string) => boolean
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  notifyingTerminals: new Set<string>(),
  
  addNotification: (notification: AppNotification) => {
    set(state => {
      const newNotifyingTerminals = new Set(state.notifyingTerminals)
      if (notification.terminalId) {
        newNotifyingTerminals.add(notification.terminalId)
      }
      return {
        notifications: [...state.notifications, notification],
        notifyingTerminals: newNotifyingTerminals
      }
    })
    
    // Auto-dismiss after duration (if not persistent)
    if (notification.duration && notification.duration > 0) {
      setTimeout(() => {
        get().dismissNotification(notification.id)
      }, notification.duration)
    }
  },
  
  dismissNotification: (id: string) => {
    set(state => {
      const notification = state.notifications.find(n => n.id === id)
      const newNotifyingTerminals = new Set(state.notifyingTerminals)
      
      // Only remove from notifying terminals if no other notifications for this terminal
      if (notification?.terminalId) {
        const hasOtherNotifications = state.notifications.some(
          n => n.id !== id && n.terminalId === notification.terminalId
        )
        if (!hasOtherNotifications) {
          newNotifyingTerminals.delete(notification.terminalId)
        }
      }
      
      return {
        notifications: state.notifications.filter(n => n.id !== id),
        notifyingTerminals: newNotifyingTerminals
      }
    })
  },
  
  clearAll: () => {
    set({ 
      notifications: [],
      notifyingTerminals: new Set<string>()
    })
  },
  
  clearTerminalNotification: (terminalId: string) => {
    set(state => {
      const newNotifyingTerminals = new Set(state.notifyingTerminals)
      newNotifyingTerminals.delete(terminalId)
      
      return {
        notifications: state.notifications.filter(n => n.terminalId !== terminalId),
        notifyingTerminals: newNotifyingTerminals
      }
    })
  },
  
  hasTerminalNotification: (terminalId: string) => {
    return get().notifyingTerminals.has(terminalId)
  }
}))
