import { useState } from 'react'
import type { Project, Terminal, ShellType } from '@shared/types'
import { AddTerminalModal } from './AddTerminalModal'

interface TerminalListProps {
  project: Project
  onSelect: (terminal: Terminal) => void
  onBack: () => void
  onTerminalCreated?: () => void
  api: {
    createTerminal: (
      projectId: string,
      name: string,
      shellType: string,
      workingDirectory: string,
      startupCommand?: string
    ) => Promise<void>
  }
}

export function TerminalList({ project, onSelect, onBack, onTerminalCreated, api }: TerminalListProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return '#4ec9b0'
      case 'stopped': return '#f14c4c'
      case 'error': return '#f14c4c'
      default: return '#888'
    }
  }
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return '▶'
      case 'stopped': return '■'
      case 'error': return '⚠'
      default: return '○'
    }
  }
  
  const handleCreateTerminal = async (
    name: string,
    shellType: ShellType,
    workingDirectory: string,
    startupCommand?: string
  ) => {
    await api.createTerminal(project.id, name, shellType, workingDirectory, startupCommand)
    onTerminalCreated?.()
  }
  
  return (
    <>
      <div className="terminal-list">
        <div className="terminal-list-header">
          <button className="back-button" onClick={onBack}>
            ‹
          </button>
          <h2>{project.name}</h2>
          <button 
            className="add-button"
            onClick={() => setShowAddModal(true)}
            title="Add terminal"
          >
            +
          </button>
        </div>
        
        {project.terminals.length === 0 ? (
          <div className="empty-state">
            <p>No terminals in this project</p>
            <button 
              className="add-terminal-empty"
              onClick={() => setShowAddModal(true)}
            >
              + Add Terminal
            </button>
          </div>
        ) : (
          <div className="terminal-items">
            {project.terminals.map((terminal) => (
              <div
                key={terminal.id}
                className="terminal-item"
                onClick={() => onSelect(terminal)}
              >
                <div 
                  className="terminal-status-indicator"
                  style={{ color: getStatusColor(terminal.status) }}
                >
                  {getStatusIcon(terminal.status)}
                </div>
                <div className="terminal-info">
                  <span className="terminal-name">{terminal.name}</span>
                  <span className="terminal-shell">{terminal.shellType}</span>
                </div>
                <div className="terminal-arrow">›</div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <AddTerminalModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleCreateTerminal}
        projectRootDirectory={project.rootDirectory}
      />
    </>
  )
}
