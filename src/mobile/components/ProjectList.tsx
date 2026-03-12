import { useState } from 'react'
import type { Project, Terminal } from '@shared/types'

interface ProjectListProps {
  projects: Project[]
  onSelectTerminal: (project: Project, terminal: Terminal) => void
  onRefresh: () => void
  onAddTerminal: (project: Project) => void
}

export function ProjectList({ projects, onSelectTerminal, onRefresh, onAddTerminal }: ProjectListProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  
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
  
  return (
    <div className="project-list">
      <div className="project-list-header">
        <h2>Projects</h2>
        <button className="refresh-button" onClick={onRefresh} title="Refresh">
          ↻
        </button>
      </div>
      
      {projects.length === 0 ? (
        <div className="empty-state">
          <p>No projects found</p>
          <p className="empty-hint">Create projects in the desktop app</p>
        </div>
      ) : (
        <div className="project-items">
          {projects.map((project) => (
            <div key={project.id} className="project-group">
              <div
                className="project-item"
                onClick={() => toggleProject(project.id)}
              >
                <div className="project-icon">
                  {expandedProjects.has(project.id) ? '📂' : '📁'}
                </div>
                <div className="project-info">
                  <span className="project-name">{project.name}</span>
                  <span className="project-terminals">
                    {project.terminals.length} terminal{project.terminals.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="project-expand-icon">
                  {expandedProjects.has(project.id) ? '▼' : '▶'}
                </div>
              </div>
              
              {expandedProjects.has(project.id) && (
                <div className="project-terminals-list">
                  {project.terminals.length === 0 ? (
                    <div className="empty-terminals">
                      <p>No terminals</p>
                      <button 
                        className="add-terminal-inline"
                        onClick={(e) => {
                          e.stopPropagation()
                          onAddTerminal(project)
                        }}
                      >
                        + Add Terminal
                      </button>
                    </div>
                  ) : (
                    <>
                      {project.terminals.map((terminal) => (
                        <div
                          key={terminal.id}
                          className="terminal-item-inline"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectTerminal(project, terminal)
                          }}
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
                      <button 
                        className="add-terminal-inline"
                        onClick={(e) => {
                          e.stopPropagation()
                          onAddTerminal(project)
                        }}
                      >
                        + Add Terminal
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
