import Store from 'electron-store'
import type { AppConfig, Project, Terminal } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'
import { v4 as uuid } from 'uuid'

const STORE_KEY = 'terminal-orchestrator-config'

export class ConfigStore {
  private static instance: ConfigStore
  private store: Store

  private constructor() {
    this.store = new Store({
      name: 'config',
      defaults: {
        [STORE_KEY]: DEFAULT_CONFIG
      }
    })
  }

  static getInstance(): ConfigStore {
    if (!ConfigStore.instance) {
      ConfigStore.instance = new ConfigStore()
    }
    return ConfigStore.instance
  }

  getConfig(): AppConfig {
    return this.store.get(STORE_KEY) as AppConfig
  }

  saveConfig(config: AppConfig): void {
    this.store.set(STORE_KEY, config)
  }

  // Project operations
  getProjects(): Project[] {
    return this.getConfig().projects
  }

  getProject(id: string): Project | undefined {
    return this.getProjects().find((p) => p.id === id)
  }

  createProject(name: string, rootDirectory?: string): Project {
    const config = this.getConfig()
    const now = Date.now()
    
    const project: Project = {
      id: uuid(),
      name,
      rootDirectory,
      terminals: [],
      createdAt: now,
      updatedAt: now
    }

    config.projects.push(project)
    this.saveConfig(config)
    
    return project
  }

  updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Project | undefined {
    const config = this.getConfig()
    const index = config.projects.findIndex((p) => p.id === id)
    
    if (index === -1) return undefined

    config.projects[index] = {
      ...config.projects[index],
      ...updates,
      updatedAt: Date.now()
    }

    this.saveConfig(config)
    return config.projects[index]
  }

  deleteProject(id: string): boolean {
    const config = this.getConfig()
    const index = config.projects.findIndex((p) => p.id === id)
    
    if (index === -1) return false

    config.projects.splice(index, 1)
    this.saveConfig(config)
    return true
  }

  // Terminal operations
  createTerminal(
    projectId: string,
    name: string,
    shellType: 'cmd' | 'powershell',
    workingDirectory: string,
    startupCommand?: string
  ): Terminal | undefined {
    const config = this.getConfig()
    const projectIndex = config.projects.findIndex((p) => p.id === projectId)
    
    if (projectIndex === -1) return undefined

    const now = Date.now()
    const terminal: Terminal = {
      id: uuid(),
      projectId,
      name,
      shellType,
      workingDirectory,
      startupCommand,
      status: 'idle',
      createdAt: now,
      updatedAt: now
    }

    config.projects[projectIndex].terminals.push(terminal)
    config.projects[projectIndex].updatedAt = now
    this.saveConfig(config)
    
    return terminal
  }

  getTerminal(projectId: string, terminalId: string): Terminal | undefined {
    const project = this.getProject(projectId)
    return project?.terminals.find((t) => t.id === terminalId)
  }

  updateTerminal(
    projectId: string,
    terminalId: string,
    updates: Partial<Omit<Terminal, 'id' | 'projectId' | 'createdAt'>>
  ): Terminal | undefined {
    const config = this.getConfig()
    const projectIndex = config.projects.findIndex((p) => p.id === projectId)
    
    if (projectIndex === -1) return undefined

    const terminalIndex = config.projects[projectIndex].terminals.findIndex(
      (t) => t.id === terminalId
    )
    
    if (terminalIndex === -1) return undefined

    const now = Date.now()
    config.projects[projectIndex].terminals[terminalIndex] = {
      ...config.projects[projectIndex].terminals[terminalIndex],
      ...updates,
      updatedAt: now
    }
    config.projects[projectIndex].updatedAt = now

    this.saveConfig(config)
    return config.projects[projectIndex].terminals[terminalIndex]
  }

  deleteTerminal(projectId: string, terminalId: string): boolean {
    const config = this.getConfig()
    const projectIndex = config.projects.findIndex((p) => p.id === projectId)
    
    if (projectIndex === -1) return false

    const terminalIndex = config.projects[projectIndex].terminals.findIndex(
      (t) => t.id === terminalId
    )
    
    if (terminalIndex === -1) return false

    config.projects[projectIndex].terminals.splice(terminalIndex, 1)
    config.projects[projectIndex].updatedAt = Date.now()
    this.saveConfig(config)
    return true
  }

  // Settings
  getSettings() {
    return this.getConfig().settings
  }

  updateSettings(settings: Partial<AppConfig['settings']>): AppConfig['settings'] {
    const config = this.getConfig()
    config.settings = { ...config.settings, ...settings }
    this.saveConfig(config)
    return config.settings
  }
}
