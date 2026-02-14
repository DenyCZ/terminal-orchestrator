import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from './store'
import Sidebar from './components/Sidebar'
import TerminalView from './components/TerminalView'
import Toolbar from './components/Toolbar'
import CommandPalette from './components/CommandPalette'
import InlinePrompt, { type PromptField } from './components/InlinePrompt'
import HelpModal from './components/HelpModal'
import SettingsModal from './components/SettingsModal'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

type PromptMode = 'none' | 'new-terminal' | 'new-project' | 'new-worktree'

function App() {
  const { 
    isLoading, 
    loadConfig, 
    activeTerminalId, 
    activeProjectId, 
    projects,
    setActiveTerminal,
    startTerminal,
    stopTerminal,
    restartTerminal,
    deleteTerminal,
    createTerminal,
    createProject,
    settings
  } = useAppStore()

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('')
  const [promptMode, setPromptMode] = useState<PromptMode>('none')
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const hasCheckedStartup = useRef(false)

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (isLoading || hasCheckedStartup.current) return
    hasCheckedStartup.current = true

    const timer = setTimeout(() => {
      if (projects.length === 0) {
        setIsCommandPaletteOpen(true)
      }
    }, 100)
    
    return () => clearTimeout(timer)
  }, [isLoading, projects.length])

  const activeProject = projects.find(p => p.id === activeProjectId)
  const activeTerminal = activeProject?.terminals.find(t => t.id === activeTerminalId)

  const getActiveProjectTerminals = useCallback(() => {
    return activeProject?.terminals || []
  }, [activeProject])

  const nextTerminal = useCallback(() => {
    const terminals = getActiveProjectTerminals()
    if (terminals.length === 0) return
    
    const currentIndex = terminals.findIndex(t => t.id === activeTerminalId)
    const nextIndex = (currentIndex + 1) % terminals.length
    setActiveTerminal(terminals[nextIndex].id)
  }, [getActiveProjectTerminals, activeTerminalId, setActiveTerminal])

  const prevTerminal = useCallback(() => {
    const terminals = getActiveProjectTerminals()
    if (terminals.length === 0) return
    
    const currentIndex = terminals.findIndex(t => t.id === activeTerminalId)
    const prevIndex = currentIndex <= 0 ? terminals.length - 1 : currentIndex - 1
    setActiveTerminal(terminals[prevIndex].id)
  }, [getActiveProjectTerminals, activeTerminalId, setActiveTerminal])

  const handleFocusTerminal = useCallback(() => {
    const xtermTextarea = document.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement
    if (xtermTextarea) {
      xtermTextarea.focus()
    } else {
      const terminalContainer = document.querySelector('.xterm')
      if (terminalContainer) {
        (terminalContainer as HTMLElement).click()
      }
    }
  }, [])

  const handleOpenCommandPalette = useCallback(() => {
    setCommandPaletteQuery('')
    setIsCommandPaletteOpen(true)
  }, [])

  const handleCloseCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false)
    setCommandPaletteQuery('')
  }, [])

  const handleNewTerminal = useCallback(() => {
    setIsCommandPaletteOpen(false)
    setPromptMode('new-terminal')
  }, [])

  const handleNewProject = useCallback(() => {
    setIsCommandPaletteOpen(false)
    setPromptMode('new-project')
  }, [])

  const handleNewWorktree = useCallback(() => {
    setIsCommandPaletteOpen(false)
    setPromptMode('new-worktree')
  }, [])

  const handleSwitchProject = useCallback(() => {
    setCommandPaletteQuery('project ')
    setIsCommandPaletteOpen(true)
  }, [])

  const handleSwitchTerminal = useCallback(() => {
    setCommandPaletteQuery('terminal ')
    setIsCommandPaletteOpen(true)
  }, [])

  const handleRunTerminal = useCallback(async () => {
    if (activeProject && activeTerminal) {
      if (activeTerminal.status === 'running') return
      await startTerminal(activeProject.id, activeTerminal.id)
    }
  }, [activeProject, activeTerminal, startTerminal])

  const handleRestartTerminal = useCallback(async () => {
    if (activeProject && activeTerminal) {
      await restartTerminal(activeProject.id, activeTerminal.id)
    }
  }, [activeProject, activeTerminal, restartTerminal])

  const handleKillTerminal = useCallback(async () => {
    if (activeTerminal && activeProject) {
      if (activeTerminal.status === 'running') {
        await stopTerminal(activeTerminal.id)
      } else if (confirm(`Delete terminal "${activeTerminal.name}"?`)) {
        await deleteTerminal(activeProject.id, activeTerminal.id)
      }
    }
  }, [activeProject, activeTerminal, stopTerminal, deleteTerminal])

  const handleClearTerminal = useCallback(() => {
    const terminalContainer = document.querySelector('.xterm')
    if (terminalContainer) {
      window.electronAPI?.terminal.write(activeTerminalId || '', '\x1b[2J\x1b[H')
    }
  }, [activeTerminalId])

  const handleOpenHelp = useCallback(() => {
    setIsHelpModalOpen(true)
  }, [])

  const handleCloseHelp = useCallback(() => {
    setIsHelpModalOpen(false)
  }, [])

  const handleOpenSettings = useCallback(() => {
    setIsSettingsModalOpen(true)
  }, [])

  const handleCloseSettings = useCallback(() => {
    setIsSettingsModalOpen(false)
  }, [])

  useKeyboardShortcuts({
    onOpenCommandPalette: handleOpenCommandPalette,
    onCloseCommandPalette: handleCloseCommandPalette,
    onNextTerminal: nextTerminal,
    onPrevTerminal: prevTerminal,
    onRunTerminal: handleRunTerminal,
    onRestartTerminal: handleRestartTerminal,
    onKillTerminal: handleKillTerminal,
    onNewTerminal: handleNewTerminal,
    onNewProject: handleNewProject,
    onNewWorktree: handleNewWorktree,
    onSwitchProject: handleSwitchProject,
    onSwitchTerminal: handleSwitchTerminal,
    onClearTerminal: handleClearTerminal,
    onFocusTerminal: handleFocusTerminal,
    onOpenHelp: handleOpenHelp,
    isCommandPaletteOpen: isCommandPaletteOpen,
    enabled: promptMode === 'none' && !isHelpModalOpen && !isSettingsModalOpen
  })

  const handlePromptSubmit = useCallback(async (values: Record<string, string>) => {
    if (promptMode === 'new-terminal') {
      const projectId = activeProjectId || projects[0]?.id
      if (projectId) {
        const cwd = activeProject?.rootDirectory || values.path || ''
        await createTerminal(
          projectId,
          values.name || 'New Terminal',
          (values.shell as 'cmd' | 'powershell') || settings.defaultShell,
          cwd,
          values.command
        )
      }
    } else if (promptMode === 'new-project') {
      const project = await createProject(values.name || 'New Project', values.path)
      if (project && values.path) {
        await createTerminal(
          project.id,
          'Terminal 1',
          settings.defaultShell,
          values.path
        )
      }
    } else if (promptMode === 'new-worktree') {
      const projectId = activeProjectId || projects[0]?.id
      const sourcePath = activeProject?.rootDirectory || values.sourcePath || ''
      
      if (projectId && sourcePath) {
        const result = await window.electronAPI.git.createWorktree({
          sourcePath,
          branch: values.branch,
          createBranch: values.createNewBranch === 'true',
          basePath: values.basePath || undefined
        })

        if (result.success && result.worktreePath) {
          await createTerminal(
            projectId,
            values.terminalName || `Worktree: ${values.branch}`,
            settings.defaultShell,
            result.worktreePath
          )
        } else {
          console.error('Failed to create worktree:', result.error)
          alert(`Failed to create worktree: ${result.error}`)
        }
      }
    }
    setPromptMode('none')
  }, [promptMode, activeProjectId, activeProject, projects, settings.defaultShell, createTerminal, createProject])

  const handlePromptCancel = useCallback(() => {
    setPromptMode('none')
  }, [])

  const newTerminalFields: PromptField[] = [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'Terminal name', required: true },
    { 
      key: 'shell', 
      label: 'Shell', 
      type: 'select', 
      defaultValue: settings.defaultShell,
      options: [
        { value: 'powershell', label: 'PowerShell' },
        { value: 'cmd', label: 'Command Prompt' }
      ]
    },
    { key: 'path', label: 'Path', type: 'text', placeholder: activeProject?.rootDirectory || 'Working directory' },
    { key: 'command', label: 'Command', type: 'text', placeholder: 'Startup command (optional)' }
  ]

  const newProjectFields: PromptField[] = [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'Project name', required: true },
    { key: 'path', label: 'Path', type: 'text', placeholder: 'C:\\path\\to\\project', required: true }
  ]

  const newWorktreeFields: PromptField[] = [
    { key: 'sourcePath', label: 'Source Path', type: 'text', placeholder: 'Path to git repository', defaultValue: activeProject?.rootDirectory || '', required: true },
    { key: 'branch', label: 'Branch', type: 'text', placeholder: 'Branch name', required: true },
    { 
      key: 'createNewBranch', 
      label: 'New Branch', 
      type: 'select', 
      defaultValue: 'false',
      options: [
        { value: 'false', label: 'Use existing branch' },
        { value: 'true', label: 'Create new branch' }
      ]
    },
    { key: 'basePath', label: 'Base Path', type: 'text', placeholder: 'Optional: custom location for worktree' },
    { key: 'terminalName', label: 'Terminal Name', type: 'text', placeholder: 'Optional: name for the new terminal' }
  ]

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-terminal-bg">
        <div className="text-terminal-fg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-terminal-bg">
      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar onOpenSettings={handleOpenSettings} />
        
        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          {activeProject && (
            <Toolbar project={activeProject} />
          )}
          
          {/* Terminal view */}
          <div className="flex-1 overflow-hidden">
            {activeTerminal ? (
              <TerminalView
                terminal={activeTerminal}
                projectId={activeProject!.id}
                onOpenCommandPalette={handleOpenCommandPalette}
                onNextTerminal={nextTerminal}
                onPrevTerminal={prevTerminal}
                onNewTerminal={handleNewTerminal}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <p className="text-lg mb-2">No terminal selected</p>
                  <p className="text-sm mb-4">Create a project and add terminals to get started</p>
                  <p className="text-xs text-gray-600">
                    Press <kbd className="px-1 py-0.5 bg-gray-700 rounded text-gray-300">Ctrl+Space</kbd> to open command palette
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={handleCloseCommandPalette}
        initialQuery={commandPaletteQuery}
        onNewTerminal={handleNewTerminal}
        onNewProject={handleNewProject}
        onNewWorktree={handleNewWorktree}
        onOpenSettings={handleOpenSettings}
      />

      {/* Inline Prompts */}
      <InlinePrompt
        isOpen={promptMode === 'new-terminal'}
        title="Create New Terminal"
        fields={newTerminalFields}
        onSubmit={handlePromptSubmit}
        onCancel={handlePromptCancel}
      />

      <InlinePrompt
        isOpen={promptMode === 'new-project'}
        title="Create New Project"
        fields={newProjectFields}
        onSubmit={handlePromptSubmit}
        onCancel={handlePromptCancel}
      />

      <InlinePrompt
        isOpen={promptMode === 'new-worktree'}
        title="Create New Git Worktree"
        fields={newWorktreeFields}
        onSubmit={handlePromptSubmit}
        onCancel={handlePromptCancel}
      />

      {/* Help Modal */}
      <HelpModal
        isOpen={isHelpModalOpen}
        onClose={handleCloseHelp}
        onOpenSettings={handleOpenSettings}
      />
      
      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={handleCloseSettings}
      />

      {/* Keyboard shortcuts hint */}
      {!isCommandPaletteOpen && promptMode === 'none' && !isHelpModalOpen && !isSettingsModalOpen && !activeTerminal && (
        <div className="keyboard-shortcuts-overlay">
          <div className="mb-1"><kbd>Ctrl</kbd>+<kbd>Space</kbd> Command palette</div>
          <div className="mb-1"><kbd>Ctrl</kbd>+<kbd>N</kbd> New terminal</div>
          <div><kbd>?</kbd> Show all shortcuts</div>
        </div>
      )}

      {/* Help button - always visible in bottom right */}
      {!isHelpModalOpen && !isCommandPaletteOpen && !isSettingsModalOpen && promptMode === 'none' && (
        <button
          className="help-button"
          onClick={handleOpenHelp}
          title="Keyboard shortcuts (?)"
          style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            zIndex: 50
          }}
        >
          ?
        </button>
      )}
    </div>
  )
}

export default App
