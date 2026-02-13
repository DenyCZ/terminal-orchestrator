import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../store'
import type { Project, Terminal } from '@shared/types'

// Context menu position type
interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  terminalId: string | null
  projectId: string | null
}

// Status indicator component
function StatusIndicator({ status }: { status: Terminal['status'] }) {
  const statusConfig = {
    running: { color: 'bg-green-500', blink: false, label: 'Running' },
    idle: { color: 'bg-gray-500', blink: false, label: 'Idle' },
    stopped: { color: 'bg-gray-400', blink: false, label: 'Stopped' },
    completed: { color: 'bg-yellow-500', blink: true, label: 'Completed - click to restart' },
    error: { color: 'bg-red-500', blink: false, label: 'Error' }
  }
  
  const config = statusConfig[status]
  
  return (
    <span 
      className={`w-2 h-2 rounded-full ${config.color} ${config.blink ? 'terminal-status-warning' : ''}`} 
      title={config.label}
    />
  )
}

// Context menu component
function TerminalContextMenu({
  visible,
  x,
  y,
  onRename,
  onDelete,
  onClose
}: {
  visible: boolean
  x: number
  y: number
  onRename: () => void
  onDelete: () => void
  onClose: () => void
}) {
  if (!visible) return null

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleRenameClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onClose()
    // Delay to ensure menu is closed before editing starts
    setTimeout(() => onRename(), 10)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onClose()
    setTimeout(() => onDelete(), 10)
  }

  return (
    <div
      className="fixed bg-[#252526] border border-[#3c3c3c] rounded shadow-lg py-1 z-50 min-w-[140px]"
      style={{ left: x, top: y }}
      onClick={handleMenuClick}
    >
      <button
        onClick={handleRenameClick}
        className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#37373d] flex items-center gap-2"
      >
        <span>✏️</span> Rename
      </button>
      <div className="border-t border-[#3c3c3c] my-1" />
      <button
        onClick={handleDeleteClick}
        className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#37373d] text-red-400 flex items-center gap-2"
      >
        <span>🗑️</span> Delete
      </button>
    </div>
  )
}

// Terminal item component
function TerminalItem({ 
  terminal, 
  projectId, 
  isActive,
  onClick,
  onContextMenu,
  isEditing,
  onRenameComplete
}: { 
  terminal: Terminal
  projectId: string
  isActive: boolean
  onClick: () => void 
  onContextMenu: (e: React.MouseEvent) => void
  isEditing: boolean
  onRenameComplete: (newName: string) => void
}) {
  const { startTerminal, stopTerminal } = useAppStore()
  const [editName, setEditName] = useState(terminal.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      // Delay focus to ensure it happens after any click handlers complete
      const timer = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [isEditing])

  useEffect(() => {
    setEditName(terminal.name)
  }, [terminal.name])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onRenameComplete(editName.trim() || terminal.name)
    } else if (e.key === 'Escape') {
      setEditName(terminal.name)
      onRenameComplete(terminal.name)
    }
  }

  const handleBlur = () => {
    onRenameComplete(editName.trim() || terminal.name)
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-sidebar-active rounded">
        <StatusIndicator status={terminal.status} />
        <input
          ref={inputRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="flex-1 bg-[#1e1e1e] border border-[#4ec9b0] rounded px-2 py-0.5 text-sm outline-none"
        />
      </div>
    )
  }
  
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded
        ${isActive ? 'bg-sidebar-active' : 'hover:bg-sidebar-hover'}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <StatusIndicator status={terminal.status} />
      <span className="flex-1 text-sm truncate">{terminal.name}</span>
      
      {/* Quick actions */}
      <div className="hidden group-hover:flex gap-1 items-center">
        {terminal.status === 'running' ? (
          <button
            onClick={(e) => { e.stopPropagation(); stopTerminal(terminal.id) }}
            className="p-1 hover:bg-red-600 rounded text-xs"
            title="Stop"
          >
            ■
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); startTerminal(projectId, terminal.id) }}
            className="p-1 hover:bg-green-600 rounded text-xs"
            title="Start"
          >
            ▶
          </button>
        )}
      </div>
    </div>
  )
}

// Project item component
function ProjectItem({ 
  project, 
  isExpanded, 
  onToggle,
  editingTerminalId,
  onTerminalContextMenu,
  onTerminalRenameComplete
}: { 
  project: Project
  isExpanded: boolean
  onToggle: () => void 
  editingTerminalId: string | null
  onTerminalContextMenu: (e: React.MouseEvent, terminalId: string, projectId: string) => void
  onTerminalRenameComplete: (projectId: string, terminalId: string, newName: string) => void
}) {
  const { activeProjectId, activeTerminalId, setActiveProject, setActiveTerminal, createTerminal, deleteProject } = useAppStore()
  const isActive = project.id === activeProjectId
  
  return (
    <div className="mb-1">
      {/* Project header */}
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer rounded group
          ${isActive ? 'bg-sidebar-active' : 'hover:bg-sidebar-hover'}`}
        onClick={() => { setActiveProject(project.id); onToggle() }}
      >
        <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
        <span className="flex-1 font-medium truncate">{project.name}</span>
        
        {/* Terminal count */}
        <span className="text-xs text-gray-500">{project.terminals.length}</span>
        
        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirm(`Delete project "${project.name}"?`)) {
              deleteProject(project.id)
            }
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-600 rounded text-xs"
          title="Delete project"
        >
          ✕
        </button>
      </div>
      
      {/* Terminals list */}
      {isExpanded && (
        <div className="ml-4 mt-1">
          {project.terminals.map(terminal => (
            <TerminalItem
              key={terminal.id}
              terminal={terminal}
              projectId={project.id}
              isActive={terminal.id === activeTerminalId}
              onClick={() => setActiveTerminal(terminal.id)}
              onContextMenu={(e) => onTerminalContextMenu(e, terminal.id, project.id)}
              isEditing={editingTerminalId === terminal.id}
              onRenameComplete={(newName) => onTerminalRenameComplete(project.id, terminal.id, newName)}
            />
          ))}
          
          {/* Add terminal button */}
          <button
            onClick={async () => {
              const cwd = project.rootDirectory || ''
              await createTerminal(
                project.id,
                `Terminal ${project.terminals.length + 1}`,
                'powershell',
                cwd
              )
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-sidebar-hover rounded"
          >
            + Add Terminal
          </button>
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { projects, createProject, createTerminal, updateTerminal, deleteTerminal } = useAppStore()
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    terminalId: null,
    projectId: null
  })
  const [editingTerminalId, setEditingTerminalId] = useState<string | null>(null)

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleTerminalContextMenu = (e: React.MouseEvent, terminalId: string, projectId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      terminalId,
      projectId
    })
  }

  const handleRename = () => {
    if (contextMenu.terminalId) {
      setEditingTerminalId(contextMenu.terminalId)
    }
  }

  const handleDelete = () => {
    if (contextMenu.terminalId && contextMenu.projectId) {
      if (confirm('Delete this terminal?')) {
        deleteTerminal(contextMenu.projectId, contextMenu.terminalId)
      }
    }
  }

  const handleRenameComplete = async (projectId: string, terminalId: string, newName: string) => {
    setEditingTerminalId(null)
    if (newName.trim()) {
      await updateTerminal(projectId, terminalId, { name: newName.trim() })
    }
  }

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    // Get dropped files
    const files = e.dataTransfer.files
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      // Check if it's a directory (path property in Electron)
      const path = (file as any).path || file.name
      if (path) {
        const folderName = path.split(/[\\/]/).pop() || 'New Project'
        const project = await createProject(folderName, path)
        // Create default terminal
        await createTerminal(
          project.id,
          'Terminal 1',
          'powershell',
          path
        )
        setExpandedProjects(prev => new Set([...prev, project.id]))
      }
    }
  }

  return (
    <div 
      className={`w-64 bg-sidebar-bg border-r border-border-color flex flex-col
        ${dragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-color">
        <h1 className="font-bold text-lg">Terminal Orchestrator</h1>
      </div>
      
      {/* Projects list */}
      <div className="flex-1 overflow-y-auto p-2">
        {projects.map(project => (
          <ProjectItem
            key={project.id}
            project={project}
            isExpanded={expandedProjects.has(project.id)}
            onToggle={() => toggleProject(project.id)}
            editingTerminalId={editingTerminalId}
            onTerminalContextMenu={handleTerminalContextMenu}
            onTerminalRenameComplete={handleRenameComplete}
          />
        ))}
      </div>
      
      {/* Footer actions */}
      <div className="p-3 border-t border-border-color">
        <button
          onClick={async () => {
            const project = await createProject('New Project')
            setExpandedProjects(prev => new Set([...prev, project.id]))
          }}
          className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
        >
          + New Project
        </button>
        
        <p className="mt-2 text-xs text-gray-500 text-center">
          Drop folder here to create project
        </p>
      </div>

      {/* Context Menu */}
      <TerminalContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        onRename={handleRename}
        onDelete={handleDelete}
        onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
      />
    </div>
  )
}
