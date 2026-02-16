import _Store from 'electron-store'
// ESM/CJS interop: electron-store v11+ is ESM-only, bundled as { default: Store }
const Store = (_Store as any).default || _Store
import type { AppConfig, Project, ProjectGroup, Terminal, ShellType } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import os from 'os'

const STORE_KEY = 'terminal-orchestrator-config'

export class ConfigStore {
  private static instance: ConfigStore
  private store: InstanceType<typeof Store>

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

  // Group operations
  getGroups(): ProjectGroup[] {
    return this.getConfig().groups || []
  }

  getGroup(id: string): ProjectGroup | undefined {
    return this.getGroups().find((g) => g.id === id)
  }

  createGroup(name: string, color?: string): ProjectGroup {
    const config = this.getConfig()
    const now = Date.now()
    const maxOrder = config.groups?.length > 0 
      ? Math.max(...config.groups.map(g => g.order ?? 0)) 
      : 0
    
    const group: ProjectGroup = {
      id: uuid(),
      name,
      color,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now
    }

    if (!config.groups) {
      config.groups = []
    }
    config.groups.push(group)
    this.saveConfig(config)
    
    return group
  }

  updateGroup(id: string, updates: Partial<Omit<ProjectGroup, 'id' | 'createdAt'>>): ProjectGroup | undefined {
    const config = this.getConfig()
    if (!config.groups) {
      config.groups = []
    }
    const index = config.groups.findIndex((g) => g.id === id)
    
    if (index === -1) return undefined

    config.groups[index] = {
      ...config.groups[index],
      ...updates,
      updatedAt: Date.now()
    }

    this.saveConfig(config)
    return config.groups[index]
  }

  deleteGroup(id: string): boolean {
    const config = this.getConfig()
    if (!config.groups) {
      config.groups = []
    }
    const index = config.groups.findIndex((g) => g.id === id)
    
    if (index === -1) return false

    // Remove group from all projects in this group
    config.projects.forEach((project) => {
      if (project.groupId === id) {
        project.groupId = undefined
      }
    })

    config.groups.splice(index, 1)
    this.saveConfig(config)
    return true
  }

  reorderGroups(groupIds: string[]): boolean {
    const config = this.getConfig()
    if (!config.groups) {
      config.groups = []
    }
    
    groupIds.forEach((id, index) => {
      const group = config.groups.find(g => g.id === id)
      if (group) {
        group.order = index
        group.updatedAt = Date.now()
      }
    })
    
    this.saveConfig(config)
    return true
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
    const maxOrder = config.projects.length > 0 
      ? Math.max(...config.projects.map(p => p.order ?? 0)) 
      : 0
    
    const project: Project = {
      id: uuid(),
      name,
      rootDirectory,
      order: maxOrder + 1,
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

  reorderProjects(projectIds: string[], groupId?: string): boolean {
    const config = this.getConfig()
    const now = Date.now()
    
    // If groupId is provided, only reorder projects in that group
    // If groupId is undefined, reorder ungrouped projects
    projectIds.forEach((id, index) => {
      const project = config.projects.find(p => p.id === id)
      if (project) {
        project.order = index
        if (groupId !== undefined) {
          project.groupId = groupId || undefined
        }
        project.updatedAt = now
      }
    })
    
    this.saveConfig(config)
    return true
  }

  // Terminal operations
  private ensureValidWorkingDirectory(workingDirectory: string): string {
    // If empty or not provided, use home directory
    if (!workingDirectory || workingDirectory.trim() === '') {
      console.warn('Empty workingDirectory provided, using home directory')
      return os.homedir()
    }

    // Resolve to absolute path
    const resolvedPath = path.resolve(workingDirectory)

    // Check if path exists
    if (!fs.existsSync(resolvedPath)) {
      console.warn(`workingDirectory does not exist: "${workingDirectory}", using home directory`)
      return os.homedir()
    }

    // Check if it's a directory
    const stats = fs.statSync(resolvedPath)
    if (!stats.isDirectory()) {
      const parentDir = path.dirname(resolvedPath)
      console.warn(`workingDirectory is not a directory: "${workingDirectory}", using parent: "${parentDir}"`)
      // Recursively validate parent directory
      return this.ensureValidWorkingDirectory(parentDir)
    }

    return resolvedPath
  }

  createTerminal(
    projectId: string,
    name: string,
    shellType: ShellType,
    workingDirectory: string,
    startupCommand?: string
  ): Terminal | undefined {
    const config = this.getConfig()
    const projectIndex = config.projects.findIndex((p) => p.id === projectId)
    
    if (projectIndex === -1) return undefined

    // Validate working directory before saving
    const validWorkingDirectory = this.ensureValidWorkingDirectory(workingDirectory)

    const now = Date.now()
    const terminal: Terminal = {
      id: uuid(),
      projectId,
      name,
      shellType,
      workingDirectory: validWorkingDirectory,
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
