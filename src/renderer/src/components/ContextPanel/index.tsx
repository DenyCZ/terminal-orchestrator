import { useState, useEffect, useCallback, useRef } from 'react'

const STORAGE_KEY_PREFIX = 'terminal-orchestrator-context-'
const DEBOUNCE_MS = 300

interface ContextPanelProps {
  terminalId: string
  isOpen: boolean
  width: number
  onWidthChange: (width: number) => void
  onClose: () => void
}

export default function ContextPanel({ terminalId, isOpen, width, onWidthChange, onClose }: ContextPanelProps) {
  const storageKey = `${STORAGE_KEY_PREFIX}${terminalId}`
  const [content, setContent] = useState('')
  const [isResizing, setIsResizing] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load content from localStorage when terminalId changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      setContent(saved || '')
    } catch (e) {
      console.error('Failed to load context from localStorage:', e)
      setContent('')
    }
  }, [storageKey])

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

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setContent(value)
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

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  if (!isOpen) return null

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
        {/* Header */}
        <div className="context-panel-header">
          <span className="context-panel-title">📝 Context</span>
          <div className="context-panel-actions">
            <button
              className="context-panel-btn"
              onClick={() => {
                if (confirm('Clear all notes?')) {
                  setContent('')
                  localStorage.removeItem(storageKey)
                }
              }}
              title="Clear notes"
            >
              🗑️
            </button>
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
          <textarea
            ref={textareaRef}
            className="context-panel-textarea"
            value={content}
            onChange={handleChange}
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
        </div>
        
        {/* Footer with stats */}
        <div className="context-panel-footer">
          <span>{content.length} characters</span>
          <span>{content.split(/\s+/).filter(w => w.length > 0).length} words</span>
        </div>
      </div>
    </>
  )
}
