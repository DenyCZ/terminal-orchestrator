import type { AppNotification } from '@shared/ipc'
import { useNotificationStore } from '../../store/notifications'
import { useAppStore } from '../../store'
import './styles.css'

const TYPE_ICONS: Record<AppNotification['type'], string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌'
}

const TYPE_COLORS: Record<AppNotification['type'], string> = {
  info: 'var(--toast-info, #3b82f6)',
  success: 'var(--toast-success, #22c55e)',
  warning: 'var(--toast-warning, #f59e0b)',
  error: 'var(--toast-error, #ef4444)'
}

interface ToastProps {
  notification: AppNotification
  onDismiss: (id: string) => void
  onNavigate?: (terminalId: string) => void
}

function ToastItem({ notification, onDismiss, onNavigate }: ToastProps) {
  const handleClick = () => {
    // Navigate to terminal if available
    if (notification.terminalId && onNavigate) {
      onNavigate(notification.terminalId)
    }
    // Always dismiss on click
    onDismiss(notification.id)
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation() // Don't trigger handleClick
    onDismiss(notification.id)
  }

  return (
    <div
      className={`toast-item ${notification.terminalId ? 'toast-clickable' : ''}`}
      style={{ borderLeftColor: TYPE_COLORS[notification.type] }}
      onClick={notification.terminalId ? handleClick : undefined}
    >
      <span className="toast-icon">{TYPE_ICONS[notification.type]}</span>
      <div className="toast-content">
        <div className="toast-title">{notification.title}</div>
        {notification.body && (
          <div className="toast-body">{notification.body}</div>
        )}
      </div>
      <button className="toast-close" onClick={handleClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}

export function ToastContainer() {
  const notifications = useNotificationStore((state) => state.notifications)
  const dismissNotification = useNotificationStore((state) => state.dismissNotification)
  const clearTerminalNotification = useNotificationStore((state) => state.clearTerminalNotification)
  const setActiveTerminal = useAppStore((state) => state.setActiveTerminal)

  const handleNavigate = (terminalId: string) => {
    // Clear all notifications for this terminal
    clearTerminalNotification(terminalId)
    // Navigate to the terminal
    setActiveTerminal(terminalId)
  }

  return (
    <div className="toast-container">
      {notifications.map((notification) => (
        <ToastItem
          key={notification.id}
          notification={notification}
          onDismiss={dismissNotification}
          onNavigate={handleNavigate}
        />
      ))}
    </div>
  )
}
