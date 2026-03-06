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
import ContextPanel from '../ContextPanel'
import '@xterm/xterm/css/xterm.css'

// Terminal instance cache to preserve history when switching terminals
interface CachedTerminal {
  term: Terminal
  fitAddon: FitAddon
  clipboardAddon: ClipboardAddon
  imageAddon: ImageAddon
}

// Global cache shared across all TerminalView instances
const terminalCache = new Map<string, CachedTerminal>()

// Flow control watermarks (bytes pending in xterm.js write queue)
// Prevents memory overflow when AI agents output rapidly
const HIGH_WATERMARK = 512 * 1024  // 512KB — pause reader when exceeded
const LOW_WATERMARK = 128 * 1024   // 128KB — resume reader when drained below

// Pre-open output buffer limits
const OUTPUT_BUFFER_MAX_BYTES = 100 * 1024  // 100KB max buffer before terminal.open()

// Minimum fit dimensions to prevent WebGL artifacts
const MIN_FIT_WIDTH = 80   // px (~5 columns at 14px)
const MIN_FIT_HEIGHT = 40  // px (~2 rows)
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
  const { startTerminal, stopTerminal, restartTerminal, projects, settings } = useAppStore()
  const project = projects.find(p => p.id === projectId)
  
  // Performance optimization refs
  const isUserAtBottomRef = useRef(true)
  const scrollDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Flow control refs - prevents memory overflow when AI agents output rapidly
  const pendingWriteBytesRef = useRef(0)
  const isPausedRef = useRef(false)
  
  // Pre-open output buffer - holds data until terminal.open() is called
  const outputBufferRef = useRef<string[]>([])
  const outputBufferBytesRef = useRef(0)
  
  // Resize debounce ref — coalesces rapid ResizeObserver events before fitting
  const resizeObserverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // File explorer state
  const [showFileExplorer, setShowFileExplorer] = useState(false)
  const [explorerWidth, setExplorerWidth] = useState(250)
  const [isResizing, setIsResizing] = useState(false)
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)

  // Context panel state
  const [showContextPanel, setShowContextPanel] = useState(false)
  const [contextPanelWidth, setContextPanelWidth] = useState(300)

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

  // Safe fit with minimum dimensions guard
  // Prevents WebGL artifacts when terminal is squeezed into small panes
  const safeFit = useCallback(() => {
    if (!containerRef.current || !fitAddonRef.current || !terminalRef.current) return
    
    // Guard against undersized containers
    if (
      containerRef.current.offsetWidth < MIN_FIT_WIDTH ||
      containerRef.current.offsetHeight < MIN_FIT_HEIGHT
    ) {
      return // Skip fit for tiny containers
    }
    
    fitAddonRef.current.fit()
  }, [])

  // Replay buffered output into the terminal
  const replayBuffer = useCallback(() => {
    if (terminalRef.current && outputBufferRef.current.length > 0) {
      for (const chunk of outputBufferRef.current) {
        terminalRef.current.write(chunk)
      }
      outputBufferRef.current = []
      outputBufferBytesRef.current = 0
    }
  }, [])

  // Write to terminal with flow control - prevents memory overflow
  // When AI agents output rapidly, xterm.js can't keep up -> memory explosion
  // This tracks pending bytes and pauses/resumes the PTY accordingly
  const writeToTerminalWithFlowControl = useCallback((data: string) => {
    if (!terminalRef.current) {
      // Buffer until terminal is open (pre-open buffer)
      outputBufferRef.current.push(data)
      outputBufferBytesRef.current += data.length
      // Cap buffer: drop oldest chunks when over limit
      while (
        outputBufferBytesRef.current > OUTPUT_BUFFER_MAX_BYTES &&
        outputBufferRef.current.length > 1
      ) {
        const dropped = outputBufferRef.current.shift()!
        outputBufferBytesRef.current -= dropped.length
      }
      return
    }

    const byteLen = data.length
    pendingWriteBytesRef.current += byteLen

    // Pause PTY if buffer is too full (flow control)
    if (!isPausedRef.current && pendingWriteBytesRef.current > HIGH_WATERMARK) {
      isPausedRef.current = true
      window.electronAPI?.terminal.pause(terminal.id)
    }

    terminalRef.current.write(data, () => {
      pendingWriteBytesRef.current -= byteLen

      // Resume PTY when buffer drains below threshold
      // IMPORTANT: Always call resume if we're paused, even if bytes seem wrong
      // This prevents getting stuck in paused state due to race conditions
      if (isPausedRef.current && pendingWriteBytesRef.current < LOW_WATERMARK) {
        isPausedRef.current = false
        window.electronAPI?.terminal.resume(terminal.id)
      }

      // Safety: if pendingWriteBytesRef goes negative, reset it
      // This can happen if there's a mismatch between writes and callbacks
      if (pendingWriteBytesRef.current < 0) {
        console.warn('Flow control: pendingWriteBytesRef went negative, resetting')
        pendingWriteBytesRef.current = 0
        // If we're paused, resume to unstick
        if (isPausedRef.current) {
          isPausedRef.current = false
          window.electronAPI?.terminal.resume(terminal.id)
        }
      }

      scrollToBottomDebounced()
    })
  }, [terminal.id, scrollToBottomDebounced])

  // Legacy direct write - for backwards compatibility
  const writeToTerminal = useCallback((data: string) => {
    writeToTerminalWithFlowControl(data)
  }, [writeToTerminalWithFlowControl])

  useEffect(() => {
    if (!containerRef.current) return

    // Check if we have a cached terminal for this ID
    const cached = terminalCache.get(terminal.id)
    
    if (cached && cached.term) {
      // RESTORE CACHED TERMINAL
      terminalRef.current = cached.term
      fitAddonRef.current = cached.fitAddon
      clipboardAddonRef.current = cached.clipboardAddon
      imageAddonRef.current = cached.imageAddon
      
      // Move the terminal element back to our container
      const element = cached.term.element
      if (element && element.parentElement !== containerRef.current) {
        containerRef.current.appendChild(element)
      }
      
      // Re-fit the terminal to new container size
      requestAnimationFrame(() => {
        cached.fitAddon.fit()
        const { cols, rows } = cached.term
        window.electronAPI?.terminal.resize(terminal.id, cols, rows)
        
        // Focus the terminal
        cached.term.focus()

        // Start with actual dimensions now that we have them after fit
        if (terminal.status === 'idle' && !hasStartedRef.current) {
          hasStartedRef.current = true
          startTerminal(projectId, terminal.id, cols > 0 ? cols : undefined, rows > 0 ? rows : undefined)
        }
      })
      
      // Set up ResizeObserver for cached terminal (was disconnected when unmounted)
      let cachedResizeTimeout: ReturnType<typeof setTimeout>
      const handleCachedResize = () => {
        clearTimeout(cachedResizeTimeout)
        cachedResizeTimeout = setTimeout(() => {
          const cachedTerm = terminalCache.get(terminal.id)
          if (cachedTerm && containerRef.current) {
            // Use min fit guard for cached terminals too
            if (
              containerRef.current.offsetWidth >= MIN_FIT_WIDTH &&
              containerRef.current.offsetHeight >= MIN_FIT_HEIGHT
            ) {
              cachedTerm.fitAddon.fit()
              // term.onResize fires synchronously and sends the IPC resize
            }
          }
        }, 100)
      }
      
      const resizeObserver = new ResizeObserver(handleCachedResize)
      resizeObserver.observe(containerRef.current!)
      
      return () => {
        clearTimeout(cachedResizeTimeout)
        resizeObserver.disconnect()
        // Just remove the element from DOM, but don't dispose
        const cachedTerm = terminalCache.get(terminal.id)
        if (cachedTerm?.term.element?.parentElement) {
          cachedTerm.term.element.parentElement.removeChild(cachedTerm.term.element)
        }
      }
    }

    // CREATE NEW TERMINAL
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
      convertEol: false, // Disable - causes issues with escape sequences
      // Native-like scrolling configuration
      scrollSensitivity: 1,
      fastScrollSensitivity: 5,
      scrollOnUserInput: true
    })

    const fitAddon = new FitAddon()
    const clipboardAddon = new ClipboardAddon({
      pasteMultilineAsSingleLine: settings.clipboard?.pasteMultilineAsSingleLine,
      multilineJoinChar: settings.clipboard?.multilineJoinChar
    })
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

      // CACHE THE TERMINAL for reuse when switching
      terminalCache.set(terminal.id, {
        term,
        fitAddon,
        clipboardAddon,
        imageAddon
      })

      // Replay any buffered output from before terminal.open()
      replayBuffer()

      if (terminal.status === 'idle' && !hasStartedRef.current) {
        hasStartedRef.current = true
        // Pass actual xterm dimensions — PTY spawns at the correct size immediately
        startTerminal(projectId, terminal.id, term.cols > 0 ? term.cols : undefined, term.rows > 0 ? term.rows : undefined)
      }
    })

    // ResizeObserver debounce (100ms) — coalesces rapid layout changes into a single fit
    const handleResizeObserver = () => {
      if (resizeObserverTimerRef.current) {
        clearTimeout(resizeObserverTimerRef.current)
      }
      resizeObserverTimerRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          safeFit()
          // term.onResize fires synchronously inside safeFit() and sends the IPC resize
        })
      }, 100)
    }

    const resizeObserver = new ResizeObserver(handleResizeObserver)

    // Single IPC resize path — fires synchronously when xterm dimensions actually change.
    // ResizeObserver debounce above prevents SIGWINCH storms; this just delivers the result.
    term.onResize(({ rows, cols }) => {
      if (rows > 0 && cols > 0) {
        window.electronAPI?.terminal.resize(terminal.id, cols, rows)
      }
    })

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

    // Let xterm.js handle scrolling natively - no custom wheel handler needed

    return () => {
      // Clear scroll debounce timer
      if (scrollDebounceTimerRef.current) {
        clearTimeout(scrollDebounceTimerRef.current)
        scrollDebounceTimerRef.current = null
      }
      
      // Clear resize debounce timer
      if (resizeObserverTimerRef.current) {
        clearTimeout(resizeObserverTimerRef.current)
        resizeObserverTimerRef.current = null
      }
      
      resizeObserver.disconnect()
      clipboardAddonRef.current = null
      imageAddonRef.current = null
      
      // DO NOT dispose - keep terminal cached for reuse!
      // Just detach from DOM by removing element
      if (term.element?.parentElement) {
        term.element.parentElement.removeChild(term.element)
      }
      
      // Clear local refs only
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [terminal.id, terminal.status, startTerminal, onOpenCommandPalette, onNextTerminal, onPrevTerminal, onNewTerminal])

  // Separate useEffect for data listener - runs for BOTH cached and new terminals
  useEffect(() => {
    // Write directly to terminal - xterm.js handles buffering internally
    const removeDataListener = window.electronAPI?.terminal.onData((data) => {
      if (data.terminalId === terminal.id) {
        writeToTerminal(data.data)
      }
    })

    return () => {
      removeDataListener?.()
    }
  }, [terminal.id, writeToTerminal])

  // Correct PTY dimensions whenever the terminal starts running.
  // Covers initial start (PTY spawned with actual dims) AND restart (re-syncs after kill/respawn).
  useEffect(() => {
    if (terminal.status !== 'running') return
    const timer = setTimeout(() => {
      const term = terminalRef.current
      if (term && term.cols > 0 && term.rows > 0) {
        window.electronAPI?.terminal.resize(terminal.id, term.cols, term.rows)
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [terminal.id, terminal.status])

  // Handle resize when file explorer / context panel visibility or width changes
  useEffect(() => {
    const fitAddon = fitAddonRef.current
    if (fitAddon && containerRef.current) {
      if (
        containerRef.current.offsetWidth >= MIN_FIT_WIDTH &&
        containerRef.current.offsetHeight >= MIN_FIT_HEIGHT
      ) {
        requestAnimationFrame(() => {
          fitAddon.fit()
          // term.onResize fires synchronously inside fit() and sends the IPC resize
        })
      }
    }
  }, [showFileExplorer, explorerWidth, showContextPanel, contextPanelWidth])
  
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
          
          {/* Context Panel toggle button */}
          <button
            onClick={() => setShowContextPanel(!showContextPanel)}
            className={`px-2 py-1 text-sm rounded transition-colors ${
              showContextPanel 
                ? 'bg-[#4ec9b0] text-[#1e1e1e]' 
                : 'bg-gray-600 hover:bg-gray-500'
            }`}
            title={showContextPanel ? 'Hide Context Panel' : 'Show Context Panel'}
          >
            📝
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
        
        {/* Context Panel (right sidebar) */}
        <ContextPanel
          terminalId={terminal.id}
          isOpen={showContextPanel}
          width={contextPanelWidth}
          onWidthChange={setContextPanelWidth}
          onClose={() => setShowContextPanel(false)}
          selectedFile={selectedFile}
        />
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
          <button
            onClick={() => window.electronAPI?.shell.openInZed(selectedFile.path)}
            className="text-[#f5a623] hover:text-[#f5a623]/80 hover:underline transition-colors ml-3"
            title="Open in Zed"
          >
            Open in Zed
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
