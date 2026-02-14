import { useState } from 'react'

interface LoginScreenProps {
  onLogin: () => void
  api: {
    authenticate: (serverUrl: string, pin: string) => Promise<{ token: string; expiresAt: number }>
  }
}

export function LoginScreen({ onLogin, api }: LoginScreenProps) {
  const [serverUrl, setServerUrl] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      // Normalize URL (remove trailing slash)
      const normalizedUrl = serverUrl.replace(/\/+$/, '')
      
      // Store server URL
      localStorage.setItem('serverUrl', normalizedUrl)
      
      // Authenticate
      const result = await api.authenticate(normalizedUrl, pin)
      localStorage.setItem('authToken', result.token)
      
      onLogin()
    } catch (err) {
      setError('Invalid PIN or server URL')
      localStorage.removeItem('serverUrl')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-icon">⌘</div>
        <h1>Terminal Orchestrator</h1>
        <p className="subtitle">Mobile Access</p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Server URL</label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://192.168.1.100:3000"
              required
              autoComplete="url"
            />
          </div>
          
          <div className="form-group">
            <label>PIN Code</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
              required
              autoComplete="one-time-code"
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button type="submit" disabled={loading} className="login-button">
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </form>
        
        <p className="hint">
          Find the server URL and PIN in your desktop app settings
        </p>
      </div>
    </div>
  )
}
