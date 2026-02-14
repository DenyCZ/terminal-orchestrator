import type { Project } from '@shared/types'

interface ProjectListProps {
  projects: Project[]
  onSelect: (project: Project) => void
  onRefresh: () => void
}

export function ProjectList({ projects, onSelect, onRefresh }: ProjectListProps) {
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
            <div
              key={project.id}
              className="project-item"
              onClick={() => onSelect(project)}
            >
              <div className="project-icon">
                📁
              </div>
              <div className="project-info">
                <span className="project-name">{project.name}</span>
                <span className="project-terminals">
                  {project.terminals.length} terminal{project.terminals.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="project-arrow">›</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
