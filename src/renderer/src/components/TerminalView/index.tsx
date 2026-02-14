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
  const hasStartedRef = useRef(false)
  const { startTerminal, stopTerminal, restartTerminal } = useAppStore()

  useEffect(() => {
    if (!containerRef.current) return

    hasStartedRef.current = false

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

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    term.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
        const { cols, rows } = terminalRef.current
        window.electronAPI?.terminal.resize(terminal.id, cols, rows)
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(containerRef.current)

    term.onKey(({ domEvent }) => {
      const { key, ctrlKey, shiftKey } = domEvent

      if (ctrlKey && key === ' ') {
        domEvent.preventDefault()
        domEvent.stopPropagation()
        onOpenCommandPalette?.()
        return false
      }

      if (ctrlKey && key === 'Tab' && !shiftKey) {
        domEvent.preventDefault()
        domEvent.stopPropagation()
        onNextTerminal?.()
        return false
      }

      if (ctrlKey && key === 'Tab' && shiftKey) {
        domEvent.preventDefault()
        domEvent.stopPropagation()
        onPrevTerminal?.()
        return false
      }

      if (ctrlKey && key === 'n' && !shiftKey) {
        domEvent.preventDefault()
        domEvent.stopPropagation()
        onNewTerminal?.()
        return false
      }

      return true
    })

    term.onData((data) => {
      window.electronAPI?.terminal.write(terminal.id, data)
    })

    const removeDataListener = window.electronAPI?.terminal.onData((data) => {
      if (data.terminalId === terminal.id && terminalRef.current) {
        terminalRef.current.write(data.data)
      }
    })

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
  }, [terminal.id, terminal.status, startTerminal, onOpenCommandPalette, onNextTerminal, onPrevTerminal, onNewTerminal])

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
          <button
            onClick={() => window.electronAPI?.shell.openFolder(terminal.workingDirectory)}
            className="px-2 py-1 text-sm bg-gray-600 hover:bg-gray-500 rounded transition-colors"
            title="Open in File Explorer"
          >
            📁
          </button>
          {terminal.status === 'running' ? (
            <button
              onClick={() => stopTerminal(terminal.id)}
              className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded transition-colors flex items-center gap-1.5"
            >
              <span>⏹</span> Stop
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
