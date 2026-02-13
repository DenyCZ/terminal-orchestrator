import type { Project } from '@shared/types'

interface ToolbarProps {
  project: Project
}

export default function Toolbar({ project }: ToolbarProps) {
  const runningCount = project.terminals.filter(t => t.status === 'running').length
  const totalCount = project.terminals.length

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-sidebar-bg border-b border-border-color">
      <div className="flex items-center gap-4">
        <h2 className="font-semibold">{project.name}</h2>
        <span className="text-sm text-gray-500">
          {runningCount}/{totalCount} running
        </span>
      </div>
    </div>
  )
}
