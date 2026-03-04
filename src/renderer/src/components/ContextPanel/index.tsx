import { useState, useEffect, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { FileEntry } from '@shared/ipc'

const STORAGE_KEY_PREFIX = 'terminal-orchestrator-context-'
const DEBOUNCE_MS = 300

type PanelMode = 'notes' | 'preview'

interface ContextPanelProps {
  terminalId: string
  isOpen: boolean
  width: number
  onWidthChange: (width: number) => void
  onClose: () => void
  selectedFile?: FileEntry | null
}

export default function ContextPanel({ 
  terminalId, 
  isOpen, 
  width, 
  onWidthChange, 
  onClose,
  selectedFile 
}: ContextPanelProps) {
  const storageKey = `${STORAGE_KEY_PREFIX}${terminalId}`
  const [notesContent, setNotesContent] = useState('')
  const [previewContent, setPreviewContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [mode, setMode] = useState<PanelMode>('preview')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load notes from localStorage when terminalId changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      setNotesContent(saved || '')
    } catch (e) {
      console.error('Failed to load context from localStorage:', e)
      setNotesContent('')
    }
  }, [storageKey])

  // Load file content when selectedFile changes and it's a markdown file
  useEffect(() => {
    const loadFileContent = async () => {
      if (selectedFile && !selectedFile.isDirectory) {
        const ext = selectedFile.extension?.toLowerCase() || ''
        const isPreviewable = ['.md', '.txt', '.json', '.js', '.ts', '.tsx', '.jsx', '.css', '.html', '.py', '.rs', '.go'].includes(ext)
        
        if (isPreviewable) {
          setIsLoading(true)
          setError(null)
          setMode('preview') // Auto-switch to preview when file is selected
          
          try {
            const content = await window.electronAPI?.fs.readFile(selectedFile.path)
            setPreviewContent(content || '')
          } catch (e) {
            console.error('Failed to read file:', e)
            setError(e instanceof Error ? e.message : 'Failed to read file')
            setPreviewContent('')
          } finally {
            setIsLoading(false)
          }
        }
      }
    }
    
    if (isOpen) {
      loadFileContent()
    }
  }, [selectedFile, isOpen])

  // Debounced save to localStorage
  const saveContent = useCallback((value: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, value)
      } catch (e) {
        console.error('Failed to save context to localStorage:', e)
      }
    }, DEBOUNCE_MS)
  }, [storageKey])

  const handleNotesChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setNotesContent(value)
    saveContent(value)
  }, [saveContent])

  // Handle resize drag (resize from left edge)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX
      if (newWidth >= 200 && newWidth <= 600) {
        onWidthChange(newWidth)
      }
    }
    
    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [onWidthChange])

  // Focus textarea when panel opens in notes mode
  useEffect(() => {
    if (isOpen && mode === 'notes' && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [isOpen, mode])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  if (!isOpen) return null

  // Get display title based on mode and selected file
  const getTitle = () => {
    if (mode === 'notes') return '📝 Notes'
    if (selectedFile) {
      const fileName = selectedFile.name
      return `📄 ${fileName.length > 20 ? fileName.substring(0, 20) + '...' : fileName}`
    }
    return '📄 Preview'
  }

  return (
    <>
      {/* Resize handle on left edge */}
      <div
        className={`context-panel-resize-handle ${isResizing ? 'active' : ''}`}
        onMouseDown={handleMouseDown}
      />
      
      {/* Panel */}
      <div 
        className="context-panel"
        style={{ width }}
      >
        {/* Header with tabs */}
        <div className="context-panel-header">
          <span className="context-panel-title">{getTitle()}</span>
          <div className="context-panel-tabs">
            <button
              className={`context-panel-tab ${mode === 'preview' ? 'active' : ''}`}
              onClick={() => setMode('preview')}
              title="Preview file"
            >
              👁️
            </button>
            <button
              className={`context-panel-tab ${mode === 'notes' ? 'active' : ''}`}
              onClick={() => setMode('notes')}
              title="Edit notes"
            >
              ✏️
            </button>
          </div>
          <div className="context-panel-actions">
            {mode === 'notes' && (
              <button
                className="context-panel-btn"
                onClick={() => {
                  if (confirm('Clear all notes?')) {
                    setNotesContent('')
                    localStorage.removeItem(storageKey)
                  }
                }}
                title="Clear notes"
              >
                🗑️
              </button>
            )}
            <button
              className="context-panel-btn"
              onClick={onClose}
              title="Close panel"
            >
              ✕
            </button>
          </div>
        </div>
        
        {/* Content area */}
        <div className="context-panel-content">
          {mode === 'preview' ? (
            <>
              {isLoading && (
                <div className="preview-loading">Loading...</div>
              )}
              {error && (
                <div className="preview-error">
                  <p>⚠️ Error loading file</p>
                  <p className="error-detail">{error}</p>
                </div>
              )}
              {!selectedFile && (
                <div className="preview-empty">
                  <p>📄 Select a file to preview</p>
                  <p className="hint">Supported: .md, .txt, .json, code files</p>
                </div>
              )}
              {!isLoading && !error && selectedFile && (
                <div className="markdown-preview">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '')
                        const isInline = !match
                        return !isInline ? (
                          <SyntaxHighlighter
                            language={match[1]}
                            style={vscDarkPlus}
                            PreTag="div"
                            customStyle={{
                              margin: 0,
                              borderRadius: '4px',
                              fontSize: '13px'
                            }}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className="inline-code" {...props}>
                            {children}
                          </code>
                        )
                      },
                      // Style headings
                      h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
                      h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
                      h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
                      // Style links to open externally
                      a: ({ href, children }) => (
                        <a 
                          href={href} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.preventDefault()
                            if (href) {
                              window.electronAPI?.shell.openFolder(href)
                            }
                          }}
                        >
                          {children}
                        </a>
                      ),
                      // Style tables
                      table: ({ children }) => (
                        <div className="md-table-wrapper">
                          <table className="md-table">{children}</table>
                        </div>
                      ),
                      // Style blockquotes
                      blockquote: ({ children }) => (
                        <blockquote className="md-blockquote">{children}</blockquote>
                      ),
                    }}
                  >
                    {previewContent}
                  </ReactMarkdown>
                </div>
              )}
            </>
          ) : (
            <textarea
              ref={textareaRef}
              className="context-panel-textarea"
              value={notesContent}
              onChange={handleNotesChange}
              placeholder="Write your notes, context, or reminders here...

Supports plain text. Content is auto-saved and persists across restarts.

Markdown formatting ideas:
- **bold**: **text**
- *italic*: *text*
- `code`: `code`
- # Heading 1
- ## Heading 2
- - List item"
              spellCheck={false}
            />
          )}
        </div>
        
        {/* Footer with stats */}
        <div className="context-panel-footer">
          {mode === 'notes' ? (
            <>
              <span>{notesContent.length} characters</span>
              <span>{notesContent.split(/\s+/).filter(w => w.length > 0).length} words</span>
            </>
          ) : (
            selectedFile && (
              <>
                <span>{selectedFile.name}</span>
                {selectedFile.size !== undefined && (
                  <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                )}
              </>
            )
          )}
        </div>
      </div>
    </>
  )
}
