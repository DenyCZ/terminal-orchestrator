import { useState, useEffect, useCallback } from 'react'
import { LoginScreen } from './components/LoginScreen'
import { ProjectList } from './components/ProjectList'
import { TerminalList } from './components/TerminalList'
import { TerminalView } from './components/TerminalView'
import { ConnectionStatus } from './components/ConnectionStatus'
import { useApi } from './hooks/useApi'
import { useWebSocket } from './hooks/useWebSocket'
import type { Project, Terminal } from '@shared/types'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [activeTerminal, setActiveTerminal] = useState<Terminal | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  
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
  
  const handleProjectSelect = (project: Project) => {
    setActiveProject(project)
    if (project.terminals.length > 0) {
      setActiveTerminal(project.terminals[0])
    } else {
      setActiveTerminal(null)
    }
  }
  
  const handleTerminalSelect = (terminal: Terminal) => {
    setActiveTerminal(terminal)
  }
  
  const handleBack = () => {
    if (activeTerminal) {
      setActiveTerminal(null)
    } else if (activeProject) {
      setActiveProject(null)
    }
  }
  
  const handleLogout = () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('serverUrl')
    setIsAuthenticated(false)
    setActiveProject(null)
    setActiveTerminal(null)
    setProjects([])
  }
  
  // Check for existing auth on mount
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    const serverUrl = localStorage.getItem('serverUrl')
    if (token && serverUrl) {
      setIsAuthenticated(true)
    }
  }, [])
  
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} api={api} />
  }
  
  return (
    <div className="mobile-app">
      <ConnectionStatus connected={ws.connected} onLogout={handleLogout} />
      
      {!activeProject ? (
        <ProjectList 
          projects={projects}
          onSelect={handleProjectSelect}
          onRefresh={loadProjects}
        />
      ) : !activeTerminal ? (
        <TerminalList
          project={activeProject}
          onSelect={handleTerminalSelect}
          onBack={handleBack}
          onTerminalCreated={loadProjects}
          api={api}
        />
      ) : (
        <TerminalView
          terminal={activeTerminal}
          project={activeProject}
          ws={ws}
          api={api}
          onBack={handleBack}
        />
      )}
    </div>
  )
}

export default App
