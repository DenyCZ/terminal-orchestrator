import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../store'
import type { Project, ProjectGroup, Terminal } from '@shared/types'

interface SidebarProps {
  onOpenSettings?: () => void
}

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
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [visible, onClose])

  if (!visible) return null

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleRenameClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onClose()
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
      ref={menuRef}
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
  onTerminalRenameComplete,
  filteredTerminals,
  isInGroup = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  isDragging,
  isDragOver: isItemDragOver
}: { 
  project: Project
  isExpanded: boolean
  onToggle: () => void 
  editingTerminalId: string | null
  onTerminalContextMenu: (e: React.MouseEvent, terminalId: string, projectId: string) => void
  onTerminalRenameComplete: (projectId: string, terminalId: string, newName: string) => void
  filteredTerminals?: Terminal[]
  isInGroup?: boolean
  onDragStart?: (e: React.DragEvent, projectId: string) => void
  onDragOver?: (e: React.DragEvent, projectId: string, groupId?: string) => void
  onDragLeave?: () => void
  onDrop?: (e: React.DragEvent, projectId: string, groupId?: string) => void
  onDragEnd?: () => void
  isDragging?: boolean
  isDragOver?: boolean
}) {
  const { activeProjectId, activeTerminalId, setActiveProject, setActiveTerminal, createTerminal, deleteProject, groups, updateProject } = useAppStore()
  const isActive = project.id === activeProjectId
  const terminals = filteredTerminals ?? project.terminals
  const [showGroupMenu, setShowGroupMenu] = useState(false)
  
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `project:${project.id}`)
    onDragStart?.(e, project.id)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    onDragOver?.(e, project.id, project.groupId)
  }

  const handleDragLeave = () => {
    onDragLeave?.()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDrop?.(e, project.id, project.groupId)
  }

  const handleDragEnd = () => {
    onDragEnd?.()
  }
  
  return (
    <div 
      className={`mb-1 transition-all ${isDragging ? 'opacity-30 scale-95' : ''} ${isItemDragOver ? 'border-t-2 border-[#4ec9b0] pt-1' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
    >
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer rounded group
          ${isActive ? 'bg-sidebar-active' : 'hover:bg-sidebar-hover'}`}
        onClick={() => { setActiveProject(project.id); onToggle() }}
      >
        <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
        <span className="flex-1 font-medium truncate cursor-grab active:cursor-grabbing select-none">{project.name}</span>
        
        <span className="text-xs text-gray-500">{terminals.length}</span>
        
        {!isInGroup && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowGroupMenu(!showGroupMenu)
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#37373d] rounded text-xs"
              title="Assign to group"
            >
              📁
            </button>
            
            {showGroupMenu && (
              <div 
                className="absolute right-0 top-full mt-1 bg-[#252526] border border-[#3c3c3c] rounded shadow-lg py-1 z-50 min-w-[120px]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    updateProject(project.id, { groupId: undefined })
                    setShowGroupMenu(false)
                  }}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[#37373d] ${!project.groupId ? 'text-[#4ec9b0]' : ''}`}
                >
                  No Group
                </button>
                {groups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => {
                      updateProject(project.id, { groupId: g.id })
                      setShowGroupMenu(false)
                    }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[#37373d] flex items-center gap-2 ${project.groupId === g.id ? 'text-[#4ec9b0]' : ''}`}
                  >
                    {g.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />}
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        
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
      
      {isExpanded && (
        <div className="ml-4 mt-1">
          {terminals.map(terminal => (
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

// Group item component
function GroupItem({
  group,
  projects,
  isExpanded,
  onToggle,
  editingTerminalId,
  onTerminalContextMenu,
  onTerminalRenameComplete,
  getFilteredTerminals,
  onDragOver,
  onDrop,
  isDragOver: isItemDragOver,
  onProjectDragStart,
  onProjectDragOver,
  onProjectDragLeave,
  onProjectDrop,
  onProjectDragEnd,
  draggingProjectId
}: {
  group: ProjectGroup
  projects: Project[]
  isExpanded: boolean
  onToggle: () => void
  editingTerminalId: string | null
  onTerminalContextMenu: (e: React.MouseEvent, terminalId: string, projectId: string) => void
  onTerminalRenameComplete: (projectId: string, terminalId: string, newName: string) => void
  getFilteredTerminals: (project: Project) => Terminal[]
  onDragOver?: (e: React.DragEvent, groupId: string) => void
  onDrop?: (e: React.DragEvent, groupId: string) => void
  isDragOver?: boolean
  onProjectDragStart?: (e: React.DragEvent, projectId: string) => void
  onProjectDragOver?: (e: React.DragEvent, projectId: string, groupId?: string) => void
  onProjectDragLeave?: () => void
  onProjectDrop?: (e: React.DragEvent, projectId: string, groupId?: string) => void
  onProjectDragEnd?: () => void
  draggingProjectId?: string | null
}) {
  const { deleteGroup, updateGroup } = useAppStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(group.name)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [isEditing])

  const handleRenameComplete = () => {
    setIsEditing(false)
    if (editName.trim() && editName !== group.name) {
      updateGroup(group.id, { name: editName.trim() })
    } else {
      setEditName(group.name)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (draggingProjectId) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      onDragOver?.(e, group.id)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    onDrop?.(e, group.id)
  }

  return (
    <div 
      className={`mb-1 transition-all ${isItemDragOver ? 'bg-[#1a3a5a] rounded' : ''}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer rounded group
          hover:bg-sidebar-hover`}
        onClick={() => onToggle()}
      >
        <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
        {group.color && (
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
        )}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameComplete()
              if (e.key === 'Escape') {
                setEditName(group.name)
                setIsEditing(false)
              }
            }}
            onBlur={handleRenameComplete}
            className="flex-1 bg-[#1e1e1e] border border-[#4ec9b0] rounded px-2 py-0.5 text-sm outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 font-semibold truncate select-none">{group.name}</span>
        )}
        
        <span className="text-xs text-gray-500">{projects.length}</span>
        
        <button
          onClick={(e) => {
            e.stopPropagation()
            setIsEditing(true)
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#37373d] rounded text-xs"
          title="Rename group"
        >
          ✏️
        </button>
        
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirm(`Delete group "${group.name}"? Projects will be ungrouped.`)) {
              deleteGroup(group.id)
            }
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-600 rounded text-xs"
          title="Delete group"
        >
          ✕
        </button>
      </div>
      
      {isExpanded && (
        <div className="ml-2 mt-1">
          {projects.map(project => (
            <ProjectItem
              key={project.id}
              project={project}
              isExpanded={expandedProjects.has(project.id)}
              onToggle={() => toggleProject(project.id)}
              editingTerminalId={editingTerminalId}
              onTerminalContextMenu={onTerminalContextMenu}
              onTerminalRenameComplete={onTerminalRenameComplete}
              filteredTerminals={getFilteredTerminals(project)}
              isInGroup={true}
              onDragStart={onProjectDragStart}
              onDragOver={onProjectDragOver}
              onDragLeave={onProjectDragLeave}
              onDrop={onProjectDrop}
              onDragEnd={onProjectDragEnd}
              isDragging={draggingProjectId === project.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ onOpenSettings }: SidebarProps) {
  const { groups, projects, createProject, createTerminal, updateTerminal, deleteTerminal, createGroup, reorderProjects } = useAppStore()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
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
  const [searchQuery, setSearchQuery] = useState('')
  
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)

  const getFilteredTerminals = (project: Project): Terminal[] => {
    if (!searchQuery.trim()) return project.terminals
    const query = searchQuery.toLowerCase()
    return project.terminals.filter(terminal => 
      terminal.name.toLowerCase().includes(query)
    )
  }

  const getProjectsByGroup = (groupId: string): Project[] => {
    return projects
      .filter(p => p.groupId === groupId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  const ungroupedProjects = projects
    .filter(p => !p.groupId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  
  const sortedGroups = [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const handleProjectDragStart = (_e: React.DragEvent, projectId: string) => {
    setDraggingProjectId(projectId)
  }

  const handleProjectDragOver = (e: React.DragEvent, projectId: string, _groupId?: string) => {
    e.preventDefault()
    if (draggingProjectId && draggingProjectId !== projectId) {
      setDragOverProjectId(projectId)
    }
  }

  const handleProjectDragLeave = () => {
    setDragOverProjectId(null)
  }

  const handleProjectDragEnd = () => {
    setDraggingProjectId(null)
    setDragOverProjectId(null)
    setDragOverGroupId(null)
  }

  const handleProjectDrop = async (e: React.DragEvent, targetProjectId: string, targetGroupId?: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    const draggedId = e.dataTransfer.getData('text/plain').replace('project:', '')
    
    if (!draggedId || draggedId === targetProjectId) {
      setDraggingProjectId(null)
      setDragOverProjectId(null)
      return
    }

    const sourceProject = projects.find(p => p.id === draggedId)
    const targetProject = projects.find(p => p.id === targetProjectId)
    
    if (!sourceProject || !targetProject) {
      setDraggingProjectId(null)
      setDragOverProjectId(null)
      return
    }

    const targetGroup = targetGroupId || ''

    const groupProjects = targetGroup 
      ? projects.filter(p => p.groupId === targetGroup)
      : projects.filter(p => !p.groupId)
    
    const sortedProjects = [...groupProjects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    
    const filteredProjects = sortedProjects.filter(p => p.id !== draggedId)
    
    const targetIndex = filteredProjects.findIndex(p => p.id === targetProjectId)
    
    if (targetIndex === -1) {
      setDraggingProjectId(null)
      setDragOverProjectId(null)
      return
    }
    
    filteredProjects.splice(targetIndex, 0, sourceProject)
    
    const orderedIds = filteredProjects.map(p => p.id)
    
    await reorderProjects(orderedIds, targetGroup)
    
    setDraggingProjectId(null)
    setDragOverProjectId(null)
  }

  const handleGroupDragOver = (e: React.DragEvent, groupId: string) => {
    if (draggingProjectId) {
      e.preventDefault()
      setDragOverGroupId(groupId)
    }
  }

  const handleGroupDrop = async (e: React.DragEvent, targetGroupId: string) => {
    e.preventDefault()
    
    if (draggingProjectId) {
      const groupProjects = projects.filter(p => p.groupId === targetGroupId || p.id === draggingProjectId)
      const sortedProjects = [...groupProjects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      
      const filteredProjects = sortedProjects.filter(p => p.id !== draggingProjectId)
      const draggedProject = projects.find(p => p.id === draggingProjectId)
      if (draggedProject) {
        filteredProjects.push(draggedProject)
      }
      
      const orderedIds = filteredProjects.map(p => p.id)
      await reorderProjects(orderedIds, targetGroupId)
    }
    
    setDraggingProjectId(null)
    setDragOverGroupId(null)
  }

  useEffect(() => {
    if (searchQuery.trim()) {
      const projectsWithMatches = projects.filter(p => 
        p.terminals.some(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
      )
      setExpandedProjects(prev => {
        const next = new Set(prev)
        projectsWithMatches.forEach(p => next.add(p.id))
        return next
      })
      setExpandedGroups(prev => {
        const next = new Set(prev)
        projectsWithMatches.forEach(p => {
          if (p.groupId) next.add(p.groupId)
        })
        return next
      })
    }
  }, [searchQuery, projects])

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

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
    
    const files = e.dataTransfer.files
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = (file as any).path || file.name
      if (path) {
        const folderName = path.split(/[\\/]/).pop() || 'New Project'
        const project = await createProject(folderName, path)
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
      <div className="px-4 py-3 border-b border-border-color flex items-center justify-between">
        <h1 className="font-bold text-lg">Terminal Orchestrator</h1>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="flex items-center px-2 py-1 bg-[#3c3c3c] hover:bg-[#4ec9b0] rounded text-white hover:text-[#1e1e1e] transition-colors text-sm font-medium border border-[#4ec9b0]"
            title="Open Settings"
          >
            <span>⚙️</span>
          </button>
        )}
      </div>
      
      <div className="px-3 py-2 border-b border-border-color">
        <div className="relative">
          <input
            type="text"
            placeholder="Filter terminals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-sm outline-none focus:border-[#4ec9b0] placeholder-gray-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {sortedGroups.map(group => (
          <GroupItem
            key={group.id}
            group={group}
            projects={getProjectsByGroup(group.id)}
            isExpanded={expandedGroups.has(group.id)}
            onToggle={() => toggleGroup(group.id)}
            editingTerminalId={editingTerminalId}
            onTerminalContextMenu={handleTerminalContextMenu}
            onTerminalRenameComplete={handleRenameComplete}
            getFilteredTerminals={getFilteredTerminals}
            onDragOver={handleGroupDragOver}
            onDrop={handleGroupDrop}
            isDragOver={dragOverGroupId === group.id}
            onProjectDragStart={handleProjectDragStart}
            onProjectDragOver={handleProjectDragOver}
            onProjectDragLeave={handleProjectDragLeave}
            onProjectDrop={handleProjectDrop}
            onProjectDragEnd={handleProjectDragEnd}
            draggingProjectId={draggingProjectId}
          />
        ))}
        
        {ungroupedProjects.length > 0 && (
          <div className="mb-1">
            {sortedGroups.length > 0 && (
              <div className="px-3 py-1 text-xs text-gray-500 font-medium">
                Ungrouped
              </div>
            )}
            {ungroupedProjects.map(project => (
              <ProjectItem
                key={project.id}
                project={project}
                isExpanded={expandedProjects.has(project.id)}
                onToggle={() => toggleProject(project.id)}
                editingTerminalId={editingTerminalId}
                onTerminalContextMenu={handleTerminalContextMenu}
                onTerminalRenameComplete={handleRenameComplete}
                filteredTerminals={getFilteredTerminals(project)}
                onDragStart={handleProjectDragStart}
                onDragOver={handleProjectDragOver}
                onDragLeave={handleProjectDragLeave}
                onDrop={handleProjectDrop}
                onDragEnd={handleProjectDragEnd}
                isDragging={draggingProjectId === project.id}
                isDragOver={dragOverProjectId === project.id}
              />
            ))}
          </div>
        )}
      </div>
      
      <div className="p-3 border-t border-border-color space-y-2">
        <button
          onClick={async () => {
            const group = await createGroup('New Group')
            setExpandedGroups(prev => new Set([...prev, group.id]))
          }}
          className="w-full py-1.5 px-3 bg-[#3c3c3c] hover:bg-[#4c4c4c] rounded text-sm transition-colors flex items-center justify-center gap-2"
        >
          <span>📁</span> New Group
        </button>
        
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
