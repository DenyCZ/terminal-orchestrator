import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { Terminal as TerminalType, Project, TerminalStatus } from '@shared/types'

interface TerminalViewProps {
  terminal: TerminalType
  project: Project
  ws: {
    connected: boolean
    subscribe: (terminalId: string) => void
    unsubscribe: (terminalId: string) => void
    sendInput: (terminalId: string, data: string) => void
    sendResize: (terminalId: string, cols: number, rows: number) => void
    onMessage: (handler: (data: any) => void) => void
    offMessage: (handler: (data: any) => void) => void
  }
  api: {
    startTerminal: (projectId: string, terminalId: string) => Promise<void>
    stopTerminal: (projectId: string, terminalId: string) => Promise<void>
  }
  onBack: () => void
}

export function TerminalView({ terminal, project, ws, api, onBack }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const messageHandlerRef = useRef<((data: any) => void) | null>(null)
  const [currentStatus, setCurrentStatus] = useState<TerminalStatus>(terminal.status)
  const [isStarting, setIsStarting] = useState(false)
  
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return
    
    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
      scrollback: 5000,
      allowProposedApi: true,
    })
    
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    
    term.open(containerRef.current)
    
    // Delay fit to allow DOM to settle
    setTimeout(() => {
      fitAddon.fit()
    }, 100)
    
    terminalRef.current = term
    fitAddonRef.current = fitAddon
    
    // Subscribe to WebSocket
    ws.subscribe(terminal.id)
    
    // Handle incoming data
    const handleMessage = (data: any) => {
      if (data.terminalId === terminal.id) {
        if (data.type === 'output') {
          term.write(data.data)
        } else if (data.type === 'status' && data.status) {
          setCurrentStatus(data.status)
        }
      }
    }
    
    messageHandlerRef.current = handleMessage
    ws.onMessage(handleMessage)
    
    // Handle input
    term.onData((data) => {
      ws.sendInput(terminal.id, data)
    })
    
    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
        const { cols, rows } = terminalRef.current
        ws.sendResize(terminal.id, cols, rows)
      }
    }
    
    window.addEventListener('resize', handleResize)
    
    // Initial resize
    setTimeout(handleResize, 200)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      if (messageHandlerRef.current) {
        ws.offMessage(messageHandlerRef.current)
      }
      ws.unsubscribe(terminal.id)
      term.dispose()
      terminalRef.current = null
    }
  }, [terminal.id])
  
  const handleStart = async () => {
    setIsStarting(true)
    try {
      await api.startTerminal(project.id, terminal.id)
      setCurrentStatus('running')
    } catch (error) {
      console.error('Failed to start terminal:', error)
    } finally {
      setIsStarting(false)
    }
  }
  
  const handleStop = async () => {
    try {
      await api.stopTerminal(project.id, terminal.id)
      setCurrentStatus('stopped')
    } catch (error) {
      console.error('Failed to stop terminal:', error)
    }
  }
  
  const getStatusColor = () => {
    switch (currentStatus) {
      case 'running': return '#4ec9b0'
      case 'stopped': return '#f14c4c'
      case 'error': return '#f14c4c'
      default: return '#888'
    }
  }
  
  return (
    <div className="terminal-view">
      <div className="terminal-header">
        <button className="back-button" onClick={onBack}>‹</button>
        <div className="terminal-info">
          <span className="terminal-name">{terminal.name}</span>
          <span 
            className="terminal-status-badge"
            style={{ backgroundColor: getStatusColor() }}
          >
            {currentStatus}
          </span>
        </div>
        <div className="terminal-actions">
          {currentStatus === 'running' ? (
            <button onClick={handleStop} className="action-button stop">Stop</button>
          ) : (
            <button 
              onClick={handleStart} 
              className="action-button start"
              disabled={isStarting}
            >
              {isStarting ? 'Starting...' : 'Start'}
            </button>
          )}
        </div>
      </div>
      
      <div ref={containerRef} className="terminal-container" />
      
      {!ws.connected && (
        <div className="disconnected-overlay">
          <p>Disconnected from server</p>
          <p className="disconnected-hint">Check your network connection</p>
        </div>
      )}
    </div>
  )
}
