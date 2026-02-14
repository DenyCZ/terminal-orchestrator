import { create } from 'zustand'
import type { Project, ProjectGroup, Terminal, AppConfig, ShortcutConfig, KeyBinding } from '@shared/types'
import { DEFAULT_SHORTCUTS, DEFAULT_SETTINGS } from '@shared/types'
import type { TerminalDataBatch } from '@shared/ipc'

interface AppState {
  // Data
  projects: Project[]
  groups: ProjectGroup[]
  activeProjectId: string | null
  activeTerminalId: string | null
  settings: AppConfig['settings']
  
  // Loading state
  isLoading: boolean
  
  // Actions
  loadConfig: () => Promise<void>
  
  // Group actions
  createGroup: (name: string, color?: string) => Promise<ProjectGroup>
  updateGroup: (id: string, updates: Partial<ProjectGroup>) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
  
  // Project actions
  createProject: (name: string, rootDirectory?: string) => Promise<Project>
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setActiveProject: (id: string | null) => void
  reorderProjects: (projectIds: string[], groupId?: string) => Promise<void>
  
  // Terminal actions
  createTerminal: (
    projectId: string,
    name: string,
    shellType: 'cmd' | 'powershell',
    workingDirectory: string,
    startupCommand?: string
  ) => Promise<Terminal | undefined>
  updateTerminal: (projectId: string, terminalId: string, updates: Partial<Terminal>) => Promise<void>
  deleteTerminal: (projectId: string, terminalId: string) => Promise<void>
  startTerminal: (projectId: string, terminalId: string) => Promise<void>
  stopTerminal: (terminalId: string) => Promise<void>
  restartTerminal: (projectId: string, terminalId: string) => Promise<void>
  setActiveTerminal: (id: string | null) => void
  updateTerminalStatus: (projectId: string, terminalId: string, status: Terminal['status']) => void
  
  // Orchestrated actions
  startAllTerminals: (projectId: string) => Promise<void>
  stopAllTerminals: (projectId: string) => Promise<void>
  
  // Settings
  updateSettings: (settings: Partial<AppConfig['settings']>) => void
  
  // Keyboard shortcuts
  updateKeyboardShortcut: (shortcutId: keyof ShortcutConfig, binding: KeyBinding) => void
  resetKeyboardShortcuts: () => void
  getKeyboardShortcuts: () => ShortcutConfig
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  projects: [],
  groups: [],
  activeProjectId: null,
  activeTerminalId: null,
  settings: DEFAULT_SETTINGS,
  isLoading: true,
  
  // Load config from main process
  loadConfig: async () => {
    try {
      const config = await window.electronAPI.config.load()
      set({
        projects: config.projects,
        groups: config.groups || [],
        settings: config.settings,
        isLoading: false,
        // Set first project as active if exists
        activeProjectId: config.projects[0]?.id || null,
        activeTerminalId: config.projects[0]?.terminals[0]?.id || null
      })
      
      // Setup terminal event listeners
      window.electronAPI.terminal.onData((_data: TerminalDataBatch) => {
        // Terminal data is handled by TerminalView component
        // This is just for potential future use
      })
      
      window.electronAPI.terminal.onExit((event) => {
        const { projects } = get()
        for (const project of projects) {
          const terminal = project.terminals.find(t => t.id === event.terminalId)
          if (terminal) {
            // If already 'stopped', it was a manual stop - don't override
            if (terminal.status === 'stopped') {
              break
            }
            // Natural exit: completed (code 0) or error (non-zero)
            const newStatus = event.exitCode === 0 ? 'completed' : 'error'
            get().updateTerminalStatus(project.id, event.terminalId, newStatus)
            break
          }
        }
      })
    } catch (error) {
      console.error('Failed to load config:', error)
      set({ isLoading: false })
    }
  },
  
  // Project actions
  createProject: async (name: string, rootDirectory?: string) => {
    const project = await window.electronAPI.project.create(name, rootDirectory)
    set(state => ({
      projects: [...state.projects, project],
      activeProjectId: project.id
    }))
    return project
  },
  
  updateProject: async (id: string, updates: Partial<Project>) => {
    const updated = await window.electronAPI.project.update(id, updates)
    if (updated) {
      set(state => ({
        projects: state.projects.map(p => p.id === id ? updated : p)
      }))
    }
  },
  
  deleteProject: async (id: string) => {
    await window.electronAPI.project.delete(id)
    set(state => {
      const newProjects = state.projects.filter(p => p.id !== id)
      const newActiveProjectId = state.activeProjectId === id 
        ? (newProjects[0]?.id || null)
        : state.activeProjectId
      const newActiveTerminalId = state.activeProjectId === id
        ? (newProjects[0]?.terminals[0]?.id || null)
        : state.activeTerminalId
        
      return {
        projects: newProjects,
        activeProjectId: newActiveProjectId,
        activeTerminalId: newActiveTerminalId
      }
    })
  },
  
  setActiveProject: (id: string | null) => {
    const { projects } = get()
    const project = projects.find(p => p.id === id)
    set({
      activeProjectId: id,
      activeTerminalId: project?.terminals[0]?.id || null
    })
  },
  
  // Group actions
  createGroup: async (name: string, color?: string) => {
    const group = await window.electronAPI.group.create(name, color)
    set(state => ({
      groups: [...state.groups, group]
    }))
    return group
  },
  
  updateGroup: async (id: string, updates: Partial<ProjectGroup>) => {
    const updated = await window.electronAPI.group.update(id, updates)
    if (updated) {
      set(state => ({
        groups: state.groups.map(g => g.id === id ? updated : g)
      }))
    }
  },
  
  deleteGroup: async (id: string) => {
    await window.electronAPI.group.delete(id)
    set(state => ({
      groups: state.groups.filter(g => g.id !== id),
      // Remove groupId from projects that were in this group
      projects: state.projects.map(p => 
        p.groupId === id ? { ...p, groupId: undefined } : p
      )
    }))
  },
  
  reorderProjects: async (projectIds: string[], groupId?: string) => {
    await window.electronAPI.project.reorder(projectIds, groupId)
    set(state => ({
      projects: state.projects.map(p => {
        const index = projectIds.indexOf(p.id)
        if (index !== -1) {
          return { ...p, order: index, groupId: groupId || undefined }
        }
        return p
      })
    }))
  },
  
  // Terminal actions
  createTerminal: async (
    projectId: string,
    name: string,
    shellType: 'cmd' | 'powershell',
    workingDirectory: string,
    startupCommand?: string
  ) => {
    const terminal = await window.electronAPI.terminal.create(
      projectId,
      name,
      shellType,
      workingDirectory,
      startupCommand
    )
    if (terminal) {
      set(state => ({
        projects: state.projects.map(p => 
          p.id === projectId 
            ? { ...p, terminals: [...p.terminals, terminal] }
            : p
        ),
        activeTerminalId: terminal.id
      }))
    }
    return terminal
  },
  
  updateTerminal: async (projectId: string, terminalId: string, updates: Partial<Terminal>) => {
    const updated = await window.electronAPI.terminal.update(projectId, terminalId, updates)
    if (updated) {
      set(state => ({
        projects: state.projects.map(p =>
          p.id === projectId
            ? { ...p, terminals: p.terminals.map(t => t.id === terminalId ? updated : t) }
            : p
        )
      }))
    }
  },
  
  deleteTerminal: async (projectId: string, terminalId: string) => {
    await window.electronAPI.terminal.delete(projectId, terminalId)
    set(state => {
      const project = state.projects.find(p => p.id === projectId)
      const newTerminals = project?.terminals.filter(t => t.id !== terminalId) || []
      
      let newActiveTerminalId = state.activeTerminalId
      if (state.activeTerminalId === terminalId) {
        newActiveTerminalId = newTerminals[0]?.id || null
      }
      
      return {
        projects: state.projects.map(p =>
          p.id === projectId
            ? { ...p, terminals: newTerminals }
            : p
        ),
        activeTerminalId: newActiveTerminalId
      }
    })
  },
  
  startTerminal: async (projectId: string, terminalId: string) => {
    const result = await window.electronAPI.terminal.start(projectId, terminalId)
    if (result) {
      get().updateTerminalStatus(projectId, terminalId, 'running')
    }
  },
  
  stopTerminal: async (terminalId: string) => {
    await window.electronAPI.terminal.stop(terminalId)
    const { projects } = get()
    for (const project of projects) {
      const terminal = project.terminals.find(t => t.id === terminalId)
      if (terminal) {
        get().updateTerminalStatus(project.id, terminalId, 'stopped')
        break
      }
    }
  },
  
  restartTerminal: async (projectId: string, terminalId: string) => {
    const result = await window.electronAPI.terminal.restart(projectId, terminalId)
    if (result) {
      get().updateTerminalStatus(projectId, terminalId, 'running')
    }
  },
  
  setActiveTerminal: (id: string | null) => {
    const { projects } = get()
    // Find the project that contains this terminal and select it too
    for (const project of projects) {
      const terminal = project.terminals.find(t => t.id === id)
      if (terminal) {
        set({
          activeTerminalId: id,
          activeProjectId: project.id
        })
        return
      }
    }
    // Terminal not found, just set the ID
    set({ activeTerminalId: id })
  },
  
  updateTerminalStatus: (projectId: string, terminalId: string, status: Terminal['status']) => {
    set(state => ({
      projects: state.projects.map(p =>
        p.id === projectId
          ? {
              ...p,
              terminals: p.terminals.map(t =>
                t.id === terminalId ? { ...t, status } : t
              )
            }
          : p
      )
    }))
  },
  
  // Orchestrated actions
  startAllTerminals: async (projectId: string) => {
    const { projects, startTerminal } = get()
    const project = projects.find(p => p.id === projectId)
    if (project) {
      for (const terminal of project.terminals) {
        if (terminal.status !== 'running') {
          await startTerminal(projectId, terminal.id)
        }
      }
    }
  },
  
  stopAllTerminals: async (projectId: string) => {
    const { projects, stopTerminal } = get()
    const project = projects.find(p => p.id === projectId)
    if (project) {
      for (const terminal of project.terminals) {
        if (terminal.status === 'running') {
          await stopTerminal(terminal.id)
        }
      }
    }
  },
  
  // Settings
  updateSettings: (settings: Partial<AppConfig['settings']>) => {
    set(state => ({
      settings: { ...state.settings, ...settings }
    }))
    // Persist to main process
    window.electronAPI?.config.updateSettings(settings)
  },
  
  // Keyboard shortcuts
  updateKeyboardShortcut: (shortcutId: keyof ShortcutConfig, binding: KeyBinding) => {
    set(state => {
      const currentShortcuts = state.settings.keyboardShortcuts || DEFAULT_SHORTCUTS
      return {
        settings: {
          ...state.settings,
          keyboardShortcuts: {
            ...currentShortcuts,
            [shortcutId]: binding
          } as ShortcutConfig
        }
      }
    })
    // Persist to main process
    const newShortcuts = get().settings.keyboardShortcuts || DEFAULT_SHORTCUTS
    window.electronAPI?.config.updateSettings({
      keyboardShortcuts: newShortcuts
    })
  },
  
  resetKeyboardShortcuts: () => {
    set(state => ({
      settings: {
        ...state.settings,
        keyboardShortcuts: DEFAULT_SHORTCUTS
      }
    }))
    // Persist to main process
    window.electronAPI?.config.updateSettings({
      keyboardShortcuts: DEFAULT_SHORTCUTS
    })
  },
  
  getKeyboardShortcuts: () => {
    const { settings } = get()
    return settings.keyboardShortcuts || DEFAULT_SHORTCUTS
  }
}))
