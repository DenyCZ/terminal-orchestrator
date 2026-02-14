interface ConnectionStatusProps {
  connected: boolean
  onLogout: () => void
}

export function ConnectionStatus({ connected, onLogout }: ConnectionStatusProps) {
  return (
    <div className="connection-status">
      <div className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
        <span className="status-dot"></span>
        <span className="status-text">{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
      <button className="logout-button" onClick={onLogout} title="Logout">
        ⏻
      </button>
    </div>
  )
}
