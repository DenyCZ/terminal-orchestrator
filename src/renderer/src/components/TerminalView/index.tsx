import { useEffect, useRef, useState, useCallback, memo } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { ClipboardAddon } from '../../addons/ClipboardAddon'
import { ImageAddon } from '../../addons/ImageAddon'
import { useAppStore } from '../../store'
import type { Terminal as TerminalType } from '@shared/types'
import type { FileEntry } from '@shared/ipc'
import FileTree from '../FileTree'
import '@xterm/xterm/css/xterm.css'

interface TerminalViewProps {
  terminal: TerminalType
  projectId: string
  onOpenCommandPalette?: () => void
  onNextTerminal?: () => void
  onPrevTerminal?: () => void
  onNewTerminal?: () => void
}

// File icon component for inline use
function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.isDirectory) {
    return <span className="text-yellow-400">📁</span>
  }
  
  const ext = entry.extension?.toLowerCase() || ''
  
  const iconMap: Record<string, string> = {
    '.ts': '📘', '.tsx': '📘', '.js': '📙', '.jsx': '📙',
    '.json': '📋', '.md': '📝', '.css': '🎨', '.html': '🌐',
    '.py': '🐍', '.rs': '🦀', '.go': '🐹', '.java': '☕',
  }
  
  return <span>{iconMap[ext] || '📄'}</span>
}

function TerminalView({
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
  const clipboardAddonRef = useRef<ClipboardAddon | null>(null)
  const imageAddonRef = useRef<ImageAddon | null>(null)
  const hasStartedRef = useRef(false)
  const { startTerminal, stopTerminal, restartTerminal, projects } = useAppStore()
  const project = projects.find(p => p.id === projectId)
  
  // Performance optimization refs
  const isUserAtBottomRef = useRef(true)
  const scrollDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // File explorer state
  const [showFileExplorer, setShowFileExplorer] = useState(false)
  const [explorerWidth, setExplorerWidth] = useState(250)
  const [isResizing, setIsResizing] = useState(false)
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)

  // Helper to check if user is at bottom of terminal
  const isAtBottom = useCallback(() => {
    const term = terminalRef.current
    if (!term) return true
    
    const buffer = term.buffer.active
    const viewportY = buffer.viewportY
    const bufferLength = buffer.length
    const rows = term.rows
    
    // Allow 2 lines tolerance
    return viewportY >= bufferLength - rows - 2
  }, [])

  // Debounced scroll to bottom - only if user is at bottom
  const scrollToBottomDebounced = useCallback(() => {
    if (scrollDebounceTimerRef.current) {
      clearTimeout(scrollDebounceTimerRef.current)
    }
    
    scrollDebounceTimerRef.current = setTimeout(() => {
      if (terminalRef.current && isUserAtBottomRef.current) {
        terminalRef.current.scrollToBottom()
      }
    }, 50)
  }, [])

  // Write buffer functions for performance - uses requestAnimationFrame for visual smoothness
  const pendingWritesRef = useRef<string[]>([])
  const rafPendingRef = useRef<boolean>(false)
  
  const flushWriteBuffer = useCallback(() => {
    if (pendingWritesRef.current.length > 0 && terminalRef.current) {
      // Combine all pending writes
      const data = pendingWritesRef.current.join('')
      pendingWritesRef.current = []
      
      // Write to terminal
      terminalRef.current.write(data)
      
      // Trigger scroll
      scrollToBottomDebounced()
    }
    rafPendingRef.current = false
  }, [scrollToBottomDebounced])

  const queueWrite = useCallback((data: string) => {
    pendingWritesRef.current.push(data)
    
    if (!rafPendingRef.current) {
      rafPendingRef.current = true
      requestAnimationFrame(() => {
        flushWriteBuffer()
      })
    }
  }, [flushWriteBuffer])

  useEffect(() => {
    if (!containerRef.current) return

    hasStartedRef.current = false

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        selectionForeground: '#ffffff',
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
      scrollback: 5000,
      convertEol: true,
      // Native-like scrolling configuration
      smoothScrollDuration: 0,
      scrollSensitivity: 1.5,
      fastScrollSensitivity: 7,
      scrollOnUserInput: true
    })

    const fitAddon = new FitAddon()
    const clipboardAddon = new ClipboardAddon()
    const imageAddon = new ImageAddon()
    
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.loadAddon(clipboardAddon)
    term.loadAddon(imageAddon)

    // Open terminal before fitting
    term.open(containerRef.current)

    // Use requestAnimationFrame for smoother initialization
    requestAnimationFrame(() => {
      fitAddon.fit()
      terminalRef.current = term
      fitAddonRef.current = fitAddon
      clipboardAddonRef.current = clipboardAddon
      imageAddonRef.current = imageAddon

      if (terminal.status === 'idle' && !hasStartedRef.current) {
        hasStartedRef.current = true
        startTerminal(projectId, terminal.id)
      }
    })

    // Debounced resize handler
    let resizeTimeout: ReturnType<typeof setTimeout>
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        if (fitAddonRef.current && terminalRef.current) {
          fitAddonRef.current.fit()
          const { cols, rows } = terminalRef.current
          window.electronAPI?.terminal.resize(terminal.id, cols, rows)
        }
      }, 100) // 100ms debounce
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

    // Track scroll position to detect when user scrolls up
    term.onScroll(() => {
      isUserAtBottomRef.current = isAtBottom()
    })

    // Custom wheel handler for Ctrl+wheel zoom
    term.attachCustomWheelEventHandler((event) => {
      if (event.ctrlKey) {
        const delta = event.deltaY > 0 ? -1 : 1
        const currentSize = term.options.fontSize || 14
        const newSize = Math.max(8, Math.min(32, currentSize + delta))
        term.options.fontSize = newSize
        // Refit terminal after zoom
        requestAnimationFrame(() => {
          fitAddonRef.current?.fit()
          if (terminalRef.current) {
            const { cols, rows } = terminalRef.current
            window.electronAPI?.terminal.resize(terminal.id, cols, rows)
          }
        })
        return false
      }
      return true
    })

    // Handle output with buffered writes for performance
    const removeDataListener = window.electronAPI?.terminal.onData((data) => {
      if (data.terminalId === terminal.id) {
        queueWrite(data.data)
      }
    })

    return () => {
      // Clear scroll debounce timer
      if (scrollDebounceTimerRef.current) {
        clearTimeout(scrollDebounceTimerRef.current)
        scrollDebounceTimerRef.current = null
      }
      
      // Clear pending writes
      pendingWritesRef.current = []
      rafPendingRef.current = false
      
      clearTimeout(resizeTimeout)
      resizeObserver.disconnect()
      removeDataListener?.()
      clipboardAddonRef.current = null
      imageAddonRef.current = null
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [terminal.id, terminal.status, startTerminal, onOpenCommandPalette, onNextTerminal, onPrevTerminal, onNewTerminal])

  // Handle resize when file explorer visibility/width changes
  useEffect(() => {
    const terminalInstance = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (terminalInstance && fitAddon) {
      // Use requestAnimationFrame for smoother resize
      requestAnimationFrame(() => {
        fitAddon.fit()
        // Notify PTY of resize - terminalInstance is captured above, safe to use
        const { cols, rows } = terminalInstance
        window.electronAPI?.terminal.resize(terminal.id, cols, rows)
      })
    }
  }, [terminal.id, showFileExplorer, explorerWidth])
  
  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX
      if (newWidth >= 150 && newWidth <= 500) {
        setExplorerWidth(newWidth)
      }
    }
    
    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])
  
  // Handle file click
  const handleFileClick = useCallback((file: FileEntry) => {
    setSelectedFile(file)
  }, [])
  
  // Handle folder double-click (open in terminal)
  const handleFolderDoubleClick = useCallback((folder: FileEntry) => {
    // Could implement opening folder in new terminal or similar
    console.log('Folder clicked:', folder.path)
  }, [])

  return (
    <div className="h-full w-full flex flex-col bg-terminal-bg">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-4 py-2 bg-sidebar-bg border-b border-border-color">
        <div className="flex items-center gap-2">
          {project && (
            <>
              <span className="font-medium text-blue-400">{project.name}</span>
              <span className="text-xs text-gray-500" title={project.rootDirectory}>{project.rootDirectory}</span>
              <span className="text-gray-500">›</span>
            </>
          )}
          <span className="font-medium">{terminal.name}</span>
          <span className="text-xs text-gray-500" title={terminal.workingDirectory}>{terminal.workingDirectory}</span>
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
          {/* File Explorer toggle button */}
          <button
            onClick={() => setShowFileExplorer(!showFileExplorer)}
            className={`px-2 py-1 text-sm rounded transition-colors ${
              showFileExplorer 
                ? 'bg-[#4ec9b0] text-[#1e1e1e]' 
                : 'bg-gray-600 hover:bg-gray-500'
            }`}
            title={showFileExplorer ? 'Hide File Explorer' : 'Show File Explorer'}
          >
            📂
          </button>
          
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
      
      {/* Main content area with file explorer */}
      <div className="flex-1 flex overflow-hidden">
        {/* File Explorer sidebar */}
        {showFileExplorer && (
          <>
            <div 
              className="flex-shrink-0 border-r border-border-color"
              style={{ width: explorerWidth }}
            >
              <FileTree 
                rootPath={terminal.workingDirectory}
                onFileClick={handleFileClick}
                onFolderClick={handleFolderDoubleClick}
              />
            </div>
            
            {/* Resize handle */}
            <div
              className={`w-1 bg-border-color hover:bg-[#4ec9b0] cursor-col-resize flex-shrink-0 transition-colors ${
                isResizing ? 'bg-[#4ec9b0]' : ''
              }`}
              onMouseDown={handleMouseDown}
            />
          </>
        )}
        
        {/* Terminal container */}
        <div className="flex-1 h-full terminal-wrapper">
          <div 
            ref={containerRef}
            className="terminal-container"
          />
        </div>
      </div>
      
      {/* Selected file info (optional footer) */}
      {showFileExplorer && selectedFile && (
        <div className="px-3 py-1 bg-sidebar-bg border-t border-border-color text-xs text-gray-400 flex items-center gap-2">
          <FileIcon entry={selectedFile} />
          <span className="truncate">{selectedFile.name}</span>
          {selectedFile.size !== undefined && (
            <span className="text-gray-500">
              ({(selectedFile.size / 1024).toFixed(1)} KB)
            </span>
          )}
          <span className="flex-1" />
          <button
            onClick={() => window.electronAPI?.shell.openInVSCode(selectedFile.path)}
            className="text-[#4ec9b0] hover:text-[#4ec9b0]/80 hover:underline transition-colors"
            title="Open in VSCode"
          >
            Open in VSCode
          </button>
        </div>
      )}
    </div>
  )
}

// Memoize TerminalView to prevent unnecessary re-renders
// Only re-render if terminal identity or status changes, or if callbacks change
export default memo(TerminalView, (prevProps, nextProps) => {
  return (
    prevProps.terminal.id === nextProps.terminal.id &&
    prevProps.terminal.status === nextProps.terminal.status &&
    prevProps.projectId === nextProps.projectId &&
    prevProps.onOpenCommandPalette === nextProps.onOpenCommandPalette &&
    prevProps.onNextTerminal === nextProps.onNextTerminal &&
    prevProps.onPrevTerminal === nextProps.onPrevTerminal &&
    prevProps.onNewTerminal === nextProps.onNewTerminal
  )
})
