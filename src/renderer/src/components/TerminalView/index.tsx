import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useAppStore } from '../../store'
import type { Terminal as TerminalType } from '@shared/types'
import '@xterm/xterm/css/xterm.css'

interface TerminalViewProps {
  terminal: TerminalType
  projectId: string
  onOpenCommandPalette?: () => void
  onNextTerminal?: () => void
  onPrevTerminal?: () => void
  onNewTerminal?: () => void
}

export default function TerminalView({
  terminal,
  projectId,
  onOpenCommandPalette,
  onNextTerminal,
  onPrevTerminal,
  onNewTerminal
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const hasStartedRef = useRef(false) // Track if we've already attempted to start this terminal
  const { startTerminal, stopTerminal, restartTerminal } = useAppStore()

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return
    
    // Reset start tracking when terminal changes
    hasStartedRef.current = false

    // Create terminal instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
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
        brightWhite: '#e5e5e5'
      },
      allowProposedApi: true,
      scrollback: 5000
    })

    // Load addons
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    // Open terminal
    term.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
        const { cols, rows } = terminalRef.current
        window.electronAPI?.terminal.resize(terminal.id, cols, rows)
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(containerRef.current)

    // Handle keyboard shortcuts BEFORE they're sent to the terminal
    term.onKey(({ domEvent }) => {
      const { key, ctrlKey, shiftKey } = domEvent

      // Ctrl+Space - Open command palette
      if (ctrlKey && key === ' ') {
        domEvent.preventDefault()
        domEvent.stopPropagation()
        onOpenCommandPalette?.()
        return false
      }

      // Ctrl+Tab - Next terminal
      if (ctrlKey && key === 'Tab' && !shiftKey) {
        domEvent.preventDefault()
        domEvent.stopPropagation()
        onNextTerminal?.()
        return false
      }

      // Ctrl+Shift+Tab - Previous terminal
      if (ctrlKey && key === 'Tab' && shiftKey) {
        domEvent.preventDefault()
        domEvent.stopPropagation()
        onPrevTerminal?.()
        return false
      }

      // Ctrl+N - New terminal
      if (ctrlKey && key === 'n' && !shiftKey) {
        domEvent.preventDefault()
        domEvent.stopPropagation()
        onNewTerminal?.()
        return false
      }

      // Note: Help shortcut (?) is handled at the App level via useKeyboardShortcuts
      // Don't intercept it here to allow typing / and ? in the terminal

      // Let other keys through to the terminal
      return true
    })

    // Handle user input (for non-shortcut keys)
    term.onData((data) => {
      window.electronAPI?.terminal.write(terminal.id, data)
    })

    // Setup data listener for this terminal
    const removeDataListener = window.electronAPI?.terminal.onData((data) => {
      if (data.terminalId === terminal.id && terminalRef.current) {
        terminalRef.current.write(data.data)
      }
    })

    // Auto-start terminal if idle (only once per terminal)
    if (terminal.status === 'idle' && !hasStartedRef.current) {
      hasStartedRef.current = true
      startTerminal(projectId, terminal.id)
    }

    return () => {
      resizeObserver.disconnect()
      removeDataListener?.()
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [terminal.id, terminal.status, projectId, startTerminal, onOpenCommandPalette, onNextTerminal, onPrevTerminal, onNewTerminal]) // Include all dependencies

  // Update PTY when terminal resizes
  useEffect(() => {
    if (!terminalRef.current) return

    const disposable = terminalRef.current.onResize(({ cols, rows }) => {
      if (terminal.status === 'running') {
        window.electronAPI?.terminal.resize(terminal.id, cols, rows)
      }
    })

    return () => disposable.dispose()
  }, [terminal.id, terminal.status])

  // Clear and refit when switching terminals
  useEffect(() => {
    if (terminalRef.current && fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit()
      }, 0)
    }
  }, [terminal.id])

  return (
    <div className="h-full w-full flex flex-col bg-terminal-bg">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-4 py-2 bg-sidebar-bg border-b border-border-color">
        <div className="flex items-center gap-2">
          <span className="font-medium">{terminal.name}</span>
          <span className="text-xs text-gray-500">({terminal.shellType})</span>
          <span 
            className={`text-xs px-2 py-0.5 rounded ${
              terminal.status === 'running' ? 'bg-green-900 text-green-300' :
              terminal.status === 'completed' ? 'bg-yellow-900 text-yellow-300' :
              terminal.status === 'error' ? 'bg-red-900 text-red-300' :
              'bg-gray-700 text-gray-300'
            }`}
          >
            {terminal.status}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {terminal.status === 'running' ? (
            <button
              onClick={() => stopTerminal(terminal.id)}
              className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => {
                if (terminal.status === 'stopped' || terminal.status === 'completed' || terminal.status === 'error') {
                  restartTerminal(projectId, terminal.id)
                } else {
                  startTerminal(projectId, terminal.id)
                }
              }}
              className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 rounded transition-colors"
            >
              {terminal.status === 'stopped' || terminal.status === 'completed' || terminal.status === 'error' ? 'Restart' : 'Start'}
            </button>
          )}
        </div>
      </div>
      
      {/* Terminal container */}
      <div 
        ref={containerRef}
        className="flex-1 h-0"
      />
    </div>
  )
}
