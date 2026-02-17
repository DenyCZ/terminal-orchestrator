import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import type { Terminal as TerminalType, Project, TerminalStatus } from '@shared/types'

// Constants
const WRITE_BATCH_INTERVAL = 16
const RESIZE_DEBOUNCE = 150
const SCROLLBACK_LIMIT = 10000

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
  
  // Performance: batch writes
  const writeBufferRef = useRef<string[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  // Flush writes to terminal
  const flushWrites = () => {
    if (writeBufferRef.current.length > 0 && terminalRef.current) {
      const combined = writeBufferRef.current.join('')
      writeBufferRef.current = []
      terminalRef.current.write(combined)
    }
  }
  
  // Queue data for batched writing
  const queueWrite = (data: string) => {
    writeBufferRef.current.push(data)
    if (!flushTimerRef.current) {
      flushTimerRef.current = setInterval(flushWrites, WRITE_BATCH_INTERVAL)
    }
  }
  
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return
    
    // Create terminal with stable options
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
      scrollback: SCROLLBACK_LIMIT,
      convertEol: true,
      // FIX: Disable smooth scroll
      smoothScrollDuration: 0,
      scrollSensitivity: 1,
      // FIX: Don't auto-scroll on user input
      scrollOnUserInput: false,
    })
    
    const fitAddon = new FitAddon()
    
    // Load WebGL addon first for GPU acceleration (900% performance improvement)
    // Falls back to canvas renderer automatically if WebGL is unavailable
    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        webglAddon.dispose()
        console.warn('WebGL context lost, falling back to canvas renderer')
      })
      term.loadAddon(webglAddon)
    } catch (e) {
      console.warn('WebGL addon failed to load, using canvas renderer:', e)
    }
    
    term.loadAddon(fitAddon)
    
    // FIX: Store refs BEFORE opening
    terminalRef.current = term
    fitAddonRef.current = fitAddon
    
    term.open(containerRef.current)
    
    // FIX: Delay fit to ensure DOM is ready
    requestAnimationFrame(() => {
      fitAddon.fit()
      
      // Subscribe after terminal is ready
      ws.subscribe(terminal.id)
      
      // Notify initial size
      const { cols, rows } = term
      ws.sendResize(terminal.id, cols, rows)
    })
    
    // Handle incoming data with batching
    const handleMessage = (data: any) => {
      if (data.terminalId === terminal.id) {
        if (data.type === 'output') {
          queueWrite(data.data)
        } else if (data.type === 'status' && data.status) {
          setCurrentStatus(data.status)
        }
      }
    }
    
    messageHandlerRef.current = handleMessage
    ws.onMessage(handleMessage)
    
    // FIX: Send input immediately for responsiveness
    term.onData((data) => {
      ws.sendInput(terminal.id, data)
    })
    
    // FIX: Debounced resize handler
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null
    let lastCols = 0
    let lastRows = 0
    
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      
      resizeTimeout = setTimeout(() => {
        if (!fitAddonRef.current || !terminalRef.current) return
        
        try {
          fitAddonRef.current.fit()
          
          const { cols, rows } = terminalRef.current
          
          // Only send resize if size changed
          if (cols !== lastCols || rows !== lastRows) {
            lastCols = cols
            lastRows = rows
            ws.sendResize(terminal.id, cols, rows)
          }
        } catch (e) {
          console.warn('Resize error:', e)
        }
      }, RESIZE_DEBOUNCE)
    }
    
    window.addEventListener('resize', handleResize)
    
    // Initial resize after delay
    setTimeout(handleResize, 200)
    
    return () => {
      // Clear flush timer
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current)
        flushTimerRef.current = null
      }
      writeBufferRef.current = []
      
      // Clear resize timeout
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      
      window.removeEventListener('resize', handleResize)
      if (messageHandlerRef.current) {
        ws.offMessage(messageHandlerRef.current)
      }
      ws.unsubscribe(terminal.id)
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
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
