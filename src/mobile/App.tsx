import { useState, useEffect, useCallback } from 'react'
import { LoginScreen } from './components/LoginScreen'
import { ProjectList } from './components/ProjectList'
import { AddTerminalModal } from './components/AddTerminalModal'
import { TerminalView } from './components/TerminalView'
import { ConnectionStatus } from './components/ConnectionStatus'
import { useApi } from './hooks/useApi'
import { useWebSocket } from './hooks/useWebSocket'
import type { Project, Terminal, ShellType } from '@shared/types'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [activeTerminal, setActiveTerminal] = useState<Terminal | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [projectForNewTerminal, setProjectForNewTerminal] = useState<Project | null>(null)
  
  const api = useApi()
  const ws = useWebSocket(isAuthenticated)
  
  const loadProjects = useCallback(async () => {
    try {
      const data = await api.getProjects()
      setProjects(data)
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }, [api])
  
  useEffect(() => {
    if (isAuthenticated) {
      loadProjects()
    }
  }, [isAuthenticated, loadProjects])
  
  const handleLogin = () => {
    setIsAuthenticated(true)
  }
  
  const handleTerminalSelect = (project: Project, terminal: Terminal) => {
    setActiveProject(project)
    setActiveTerminal(terminal)
  }
  
  const handleAddTerminal = (project: Project) => {
    setProjectForNewTerminal(project)
    setShowAddModal(true)
  }
  
  const handleCreateTerminal = async (
    name: string,
    shellType: ShellType,
    workingDirectory: string,
    startupCommand?: string
  ) => {
    if (!projectForNewTerminal) return
    try {
      await api.createTerminal(projectForNewTerminal.id, name, shellType, workingDirectory, startupCommand)
      loadProjects()
    } catch (error) {
      console.error('Failed to create terminal:', error)
      throw error
    }
  }
  
  const getPrefilledTerminalName = () => {
    if (!projectForNewTerminal) return 'Terminal 1'
    const count = projectForNewTerminal.terminals.length + 1
    return `Terminal ${count}`
  }
  
  const handleBack = () => {
    if (activeTerminal) {
      setActiveTerminal(null)
      setActiveProject(null)
    }
  }
  
  const handleLogout = () => {
    localStorage.removeItem('authToken')
    setIsAuthenticated(false)
    setActiveProject(null)
    setActiveTerminal(null)
    setProjects([])
  }
  
  // Check for existing auth on mount
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (token) {
      setIsAuthenticated(true)
    }
  }, [])
  
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} api={api} />
  }
  
  return (
    <div className="mobile-app">
      <ConnectionStatus connected={ws.connected} onLogout={handleLogout} />
      
      {!activeTerminal ? (
        <ProjectList 
          projects={projects}
          onSelectTerminal={handleTerminalSelect}
          onRefresh={loadProjects}
          onAddTerminal={handleAddTerminal}
        />
      ) : (
        <TerminalView
          terminal={activeTerminal}
          project={activeProject!}
          ws={ws}
          api={api}
          onBack={handleBack}
        />
      )}
      
      <AddTerminalModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false)
          setProjectForNewTerminal(null)
        }}
        onAdd={handleCreateTerminal}
        projectRootDirectory={projectForNewTerminal?.rootDirectory}
        prefilledName={getPrefilledTerminalName()}
      />
    </div>
  )
}

export default App
