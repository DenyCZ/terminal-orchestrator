import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { Project, ProjectGroup, Terminal, AppConfig, ShortcutConfig, KeyBinding, ShellType, PredefinedTerminal } from '@shared/types'
import { DEFAULT_SHORTCUTS, DEFAULT_SETTINGS } from '@shared/types'
import type { OpenCodeSessionInfo, OpenCodeWatcherStatus } from '@shared/ipc'
import { normalizeDirectory } from '@shared/utils'

interface AppState {
  // Data - projects kept as array for backward compatibility
  projects: Project[]
  groups: ProjectGroup[]
  activeProjectId: string | null
  activeTerminalId: string | null
  settings: AppConfig['settings']
  
  // OpenCode sessions
  openCodeSessions: Map<string, OpenCodeSessionInfo>
  openCodeStatus: OpenCodeWatcherStatus | null
  
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
    shellType: ShellType,
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

  // Predefined terminals
  createPredefinedTerminal: (terminal: Omit<PredefinedTerminal, 'id'>) => void
  updatePredefinedTerminal: (id: string, updates: Partial<PredefinedTerminal>) => void
  deletePredefinedTerminal: (id: string) => void
  
  // OpenCode session helpers
  getOpenCodeSession: (directory: string) => OpenCodeSessionInfo | null
}

/**
 * OPTIMIZED helper to update a single terminal in the projects array.
 * Uses direct array indexing instead of nested map operations.
 * Only creates new arrays for the affected project, not all projects.
 * 
 * Before: O(P * T) with new objects for every project and terminal
 * After: O(P + T) with new objects only for affected project/terminal
 */
function updateTerminalInProjects(
  projects: Project[],
  terminalId: string,
  updates: Partial<Terminal>
): Project[] {
  // Find the project containing this terminal using direct loop (faster than find)
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i]
    const terminals = project.terminals
    // Find terminal index using direct loop
    for (let j = 0; j < terminals.length; j++) {
      if (terminals[j].id === terminalId) {
        // Found it - create new arrays only for the affected project
        const newTerminals = [...terminals]
        newTerminals[j] = { ...newTerminals[j], ...updates }
        
        const newProjects = [...projects]
        newProjects[i] = { ...project, terminals: newTerminals }
        return newProjects
      }
    }
  }
  return projects
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  projects: [],
  groups: [],
  activeProjectId: null,
  activeTerminalId: null,
  settings: DEFAULT_SETTINGS,
  openCodeSessions: new Map(),
  openCodeStatus: null,
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
        activeProjectId: config.projects[0]?.id || null,
        activeTerminalId: config.projects[0]?.terminals[0]?.id || null
      })
      
      // Setup terminal event listeners
      window.electronAPI.terminal.onExit((event) => {
        const { projects } = get()
        for (const project of projects) {
          const terminal = project.terminals.find(t => t.id === event.terminalId)
          if (terminal) {
            if (terminal.status === 'stopped') break
            const newStatus = event.exitCode === 0 ? 'completed' : 'error'
            get().updateTerminalStatus(project.id, event.terminalId, newStatus)
            if (terminal.openCodeSessionId) {
              get().updateTerminal(project.id, event.terminalId, { openCodeSessionId: undefined })
            }
            break
          }
        }
      })
      
      // Setup OpenCode session event listener
      window.electronAPI.opencode.onEvent((event) => {
        if (event.type === 'sessions-updated' && event.sessions) {
          const sessionMap = new Map<string, OpenCodeSessionInfo>()
          event.sessions.forEach(s => sessionMap.set(normalizeDirectory(s.directory), s))
          set({ openCodeSessions: sessionMap })
        } else if (event.type === 'status-changed' && event.status) {
          set({ openCodeStatus: event.status })
        }
      })
      
      // Load initial OpenCode sessions
      const sessions = await window.electronAPI.opencode.getSessions()
      const sessionMap = new Map<string, OpenCodeSessionInfo>()
      sessions.forEach(s => sessionMap.set(normalizeDirectory(s.directory), s))
      set({ openCodeSessions: sessionMap })
      
      const status = await window.electronAPI.opencode.getStatus()
      set({ openCodeStatus: status })
      
    } catch (error) {
      console.error('Failed to load config:', error)
      set({ isLoading: false })
    }
  },
  
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
  
  createGroup: async (name: string, color?: string) => {
    const group = await window.electronAPI.group.create(name, color)
    set(state => ({ groups: [...state.groups, group] }))
    return group
  },
  
  updateGroup: async (id: string, updates: Partial<ProjectGroup>) => {
    const updated = await window.electronAPI.group.update(id, updates)
    if (updated) {
      set(state => ({ groups: state.groups.map(g => g.id === id ? updated : g) }))
    }
  },
  
  deleteGroup: async (id: string) => {
    await window.electronAPI.group.delete(id)
    set(state => ({
      groups: state.groups.filter(g => g.id !== id),
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
        return index !== -1 ? { ...p, order: index, groupId: groupId || undefined } : p
      })
    }))
  },
  
  createTerminal: async (
    projectId: string,
    name: string,
    shellType: ShellType,
    workingDirectory: string,
    startupCommand?: string
  ) => {
    const terminal = await window.electronAPI.terminal.create(
      projectId, name, shellType, workingDirectory, startupCommand
    )
    if (terminal) {
      set(state => ({
        projects: state.projects.map(p => 
          p.id === projectId ? { ...p, terminals: [...p.terminals, terminal] } : p
        ),
        activeTerminalId: terminal.id
      }))
    }
    return terminal
  },
  
  updateTerminal: async (projectId: string, terminalId: string, updates: Partial<Terminal>) => {
    const updated = await window.electronAPI.terminal.update(projectId, terminalId, updates)
    if (updated) {
      // Use optimized helper - only touches the affected project
      set(state => ({
        projects: updateTerminalInProjects(state.projects, terminalId, updated)
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
          p.id === projectId ? { ...p, terminals: newTerminals } : p
        ),
        activeTerminalId: newActiveTerminalId
      }
    })
  },
  
  startTerminal: async (projectId: string, terminalId: string) => {
    const result = await window.electronAPI.terminal.start(projectId, terminalId)
    if (result) get().updateTerminalStatus(projectId, terminalId, 'running')
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
    if (result) get().updateTerminalStatus(projectId, terminalId, 'running')
  },
  
  setActiveTerminal: (id: string | null) => {
    if (!id) { set({ activeTerminalId: null }); return }
    const { projects } = get()
    for (const project of projects) {
      if (project.terminals.some(t => t.id === id)) {
        set({ activeTerminalId: id, activeProjectId: project.id })
        return
      }
    }
    set({ activeTerminalId: id })
  },
  
  /**
   * OPTIMIZED: Uses direct array indexing instead of nested map operations.
   * Only creates new arrays for the affected project, not all projects.
   * 
   * Memory impact: With 20 projects × 10 terminals = 200 objects,
   * old code copied all 200 on every status change.
   * New code copies only 1 terminal + its parent project's terminal array.
   */
  updateTerminalStatus: (_projectId: string, terminalId: string, status: Terminal['status']) => {
    set(state => ({
      projects: updateTerminalInProjects(state.projects, terminalId, { status })
    }))
  },
  
  startAllTerminals: async (projectId: string) => {
    const project = get().projects.find(p => p.id === projectId)
    if (project) {
      for (const terminal of project.terminals) {
        if (terminal.status !== 'running') {
          await get().startTerminal(projectId, terminal.id)
        }
      }
    }
  },
  
  stopAllTerminals: async (projectId: string) => {
    const project = get().projects.find(p => p.id === projectId)
    if (project) {
      for (const terminal of project.terminals) {
        if (terminal.status === 'running') {
          await get().stopTerminal(terminal.id)
        }
      }
    }
  },
  
  updateSettings: (settings: Partial<AppConfig['settings']>) => {
    set(state => ({ settings: { ...state.settings, ...settings } }))
    window.electronAPI?.config.updateSettings(settings)
  },
  
  updateKeyboardShortcut: (shortcutId: keyof ShortcutConfig, binding: KeyBinding) => {
    set(state => {
      const current = state.settings.keyboardShortcuts || DEFAULT_SHORTCUTS
      return {
        settings: {
          ...state.settings,
          keyboardShortcuts: { ...current, [shortcutId]: binding } as ShortcutConfig
        }
      }
    })
    window.electronAPI?.config.updateSettings({
      keyboardShortcuts: get().settings.keyboardShortcuts || DEFAULT_SHORTCUTS
    })
  },
  
  resetKeyboardShortcuts: () => {
    set(state => ({ settings: { ...state.settings, keyboardShortcuts: DEFAULT_SHORTCUTS } }))
    window.electronAPI?.config.updateSettings({ keyboardShortcuts: DEFAULT_SHORTCUTS })
  },
  
  getKeyboardShortcuts: () => get().settings.keyboardShortcuts || DEFAULT_SHORTCUTS,

  createPredefinedTerminal: (terminal: Omit<PredefinedTerminal, 'id'>) => {
    const newTerminal: PredefinedTerminal = { ...terminal, id: uuid() }
    const current = get().settings.predefinedTerminals || []
    get().updateSettings({ predefinedTerminals: [...current, newTerminal] })
  },

  updatePredefinedTerminal: (id: string, updates: Partial<PredefinedTerminal>) => {
    const current = get().settings.predefinedTerminals || []
    get().updateSettings({
      predefinedTerminals: current.map(t => t.id === id ? { ...t, ...updates } : t)
    })
  },

  deletePredefinedTerminal: (id: string) => {
    const current = get().settings.predefinedTerminals || []
    get().updateSettings({ predefinedTerminals: current.filter(t => t.id !== id) })
  },
  
  getOpenCodeSession: (directory: string) => 
    get().openCodeSessions.get(normalizeDirectory(directory)) || null
}))
