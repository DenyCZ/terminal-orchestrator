import _Store from 'electron-store'
// ESM/CJS interop: electron-store v11+ is ESM-only, bundled as { default: Store }
// Type the module correctly for both ESM and CJS import patterns
type ElectronStoreModule = typeof _Store & { default?: typeof _Store }
const Store = (_Store as ElectronStoreModule).default || _Store
import type { AppConfig, Project, ProjectGroup, Terminal, ShellType } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { detectShells } from '../shell-detector'

const STORE_KEY = 'terminal-orchestrator-config'

// Create single store instance at module level
const store = new Store({
  name: 'config',
  defaults: {
    [STORE_KEY]: DEFAULT_CONFIG
  }
})

// Helper functions
const getConfig = (): AppConfig => store.get(STORE_KEY) as AppConfig

const saveConfig = (config: AppConfig): void => {
  store.set(STORE_KEY, config)
}

// Generic CRUD helpers
interface EntityWithId { id: string }
interface OrderedEntity extends EntityWithId { order: number }
interface TimestampedEntity extends EntityWithId { createdAt: number; updatedAt: number }

const findById = <T extends EntityWithId>(collection: T[], id: string): T | undefined =>
  collection.find(e => e.id === id)

const findIndexById = <T extends EntityWithId>(collection: T[], id: string): number =>
  collection.findIndex(e => e.id === id)

const updateInCollection = <T extends TimestampedEntity>(
  collection: T[],
  id: string,
  updates: Partial<Omit<T, 'id' | 'createdAt'>>
): T | undefined => {
  const index = findIndexById(collection, id)
  if (index === -1) return undefined
  collection[index] = { ...collection[index], ...updates, updatedAt: Date.now() }
  return collection[index]
}

const deleteFromCollection = <T extends EntityWithId>(collection: T[], id: string): boolean => {
  const index = findIndexById(collection, id)
  if (index === -1) return false
  collection.splice(index, 1)
  return true
}

const getNextOrder = <T extends OrderedEntity>(collection: T[]): number =>
  collection.length > 0 ? Math.max(...collection.map(e => e.order ?? 0)) + 1 : 1

// Group operations
export const getGroups = (): ProjectGroup[] => getConfig().groups || []

export const getGroup = (id: string): ProjectGroup | undefined => findById(getConfig().groups || [], id)

export const createGroup = (name: string, color?: string): ProjectGroup => {
  const config = getConfig()
  if (!config.groups) config.groups = []
  
  const group: ProjectGroup = {
    id: uuid(),
    name,
    color,
    order: getNextOrder(config.groups),
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  
  config.groups.push(group)
  saveConfig(config)
  return group
}

export const updateGroup = (id: string, updates: Partial<Omit<ProjectGroup, 'id' | 'createdAt'>>): ProjectGroup | undefined => {
  const config = getConfig()
  if (!config.groups) config.groups = []
  
  const result = updateInCollection(config.groups, id, updates)
  if (result) saveConfig(config)
  return result
}

export const deleteGroup = (id: string): boolean => {
  const config = getConfig()
  if (!config.groups) config.groups = []
  
  if (!deleteFromCollection(config.groups, id)) return false
  
  // Remove group from all projects
  config.projects.forEach(p => { if (p.groupId === id) p.groupId = undefined })
  saveConfig(config)
  return true
}

export const reorderGroups = (groupIds: string[]): boolean => {
  const config = getConfig()
  if (!config.groups) config.groups = []
  
  groupIds.forEach((id, order) => {
    const group = findById(config.groups!, id)
    if (group) { group.order = order; group.updatedAt = Date.now() }
  })
  
  saveConfig(config)
  return true
}

// Project operations
export const getProjects = (): Project[] => getConfig().projects

export const getProject = (id: string): Project | undefined => findById(getConfig().projects, id)

export const createProject = (name: string, rootDirectory?: string): Project => {
  const config = getConfig()
  
  const project: Project = {
    id: uuid(),
    name,
    rootDirectory,
    order: getNextOrder(config.projects),
    terminals: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  
  config.projects.push(project)
  saveConfig(config)
  return project
}

export const updateProject = (id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Project | undefined => {
  const config = getConfig()
  const result = updateInCollection(config.projects, id, updates)
  if (result) saveConfig(config)
  return result
}

export const deleteProject = (id: string): boolean => {
  const config = getConfig()
  if (!deleteFromCollection(config.projects, id)) return false
  saveConfig(config)
  return true
}

export const reorderProjects = (projectIds: string[], groupId?: string): boolean => {
  const config = getConfig()
  
  projectIds.forEach((id, order) => {
    const project = findById(config.projects, id)
    if (project) {
      project.order = order
      if (groupId !== undefined) project.groupId = groupId || undefined
      project.updatedAt = Date.now()
    }
  })
  
  saveConfig(config)
  return true
}

// Terminal operations
const ensureValidWorkingDirectory = (workingDirectory: string): string => {
  if (!workingDirectory?.trim()) {
    console.warn('Empty workingDirectory provided, using home directory')
    return os.homedir()
  }

  const resolvedPath = path.resolve(workingDirectory)

  if (!fs.existsSync(resolvedPath)) {
    console.warn(`workingDirectory does not exist: "${workingDirectory}", using home directory`)
    return os.homedir()
  }

  const stats = fs.statSync(resolvedPath)
  if (!stats.isDirectory()) {
    const parentDir = path.dirname(resolvedPath)
    console.warn(`workingDirectory is not a directory: "${workingDirectory}", using parent: "${parentDir}"`)
    return ensureValidWorkingDirectory(parentDir)
  }

  return resolvedPath
}

export const createTerminal = (
  projectId: string,
  name: string,
  shellType: ShellType,
  workingDirectory: string,
  startupCommand?: string
): Terminal | undefined => {
  const config = getConfig()
  const projectIndex = findIndexById(config.projects, projectId)
  if (projectIndex === -1) return undefined

  const now = Date.now()
  const terminal: Terminal = {
    id: uuid(),
    projectId,
    name,
    shellType,
    workingDirectory: ensureValidWorkingDirectory(workingDirectory),
    startupCommand,
    status: 'idle',
    createdAt: now,
    updatedAt: now
  }

  config.projects[projectIndex].terminals.push(terminal)
  config.projects[projectIndex].updatedAt = now
  saveConfig(config)
  return terminal
}

export const getTerminal = (projectId: string, terminalId: string): Terminal | undefined => {
  const project = getProject(projectId)
  return project ? findById(project.terminals, terminalId) : undefined
}

export const updateTerminal = (
  projectId: string,
  terminalId: string,
  updates: Partial<Omit<Terminal, 'id' | 'projectId' | 'createdAt'>>
): Terminal | undefined => {
  const config = getConfig()
  const projectIndex = findIndexById(config.projects, projectId)
  if (projectIndex === -1) return undefined

  const result = updateInCollection(config.projects[projectIndex].terminals, terminalId, updates)
  if (result) {
    config.projects[projectIndex].updatedAt = Date.now()
    saveConfig(config)
  }
  return result
}

export const deleteTerminal = (projectId: string, terminalId: string): boolean => {
  const config = getConfig()
  const projectIndex = findIndexById(config.projects, projectId)
  if (projectIndex === -1) return false

  if (!deleteFromCollection(config.projects[projectIndex].terminals, terminalId)) return false
  
  config.projects[projectIndex].updatedAt = Date.now()
  saveConfig(config)
  return true
}

// Clear all terminals from all projects (for cleanup on app start)
export const clearAllTerminals = (): void => {
  const config = getConfig()
  config.projects.forEach(project => {
    project.terminals = []
    project.updatedAt = Date.now()
  })
  saveConfig(config)
}

// Settings
export const getSettings = () => {
  const settings = getConfig().settings
  
  // Normalize defaultShell for non-Windows platforms
  if (process.platform !== 'win32' && settings.defaultShell === 'powershell') {
    // On Linux/macOS, use bash as default instead of powershell
    const shells = detectShells()
    const bashShell = shells.find(s => s.id === 'bash')
    if (bashShell) {
      return { ...settings, defaultShell: 'bash' as ShellType }
    }
    // If bash not available, use the first available shell
    if (shells.length > 0) {
      return { ...settings, defaultShell: shells[0].id as ShellType }
    }
  }
  
  return settings
}

export const updateSettings = (settings: Partial<AppConfig['settings']>): AppConfig['settings'] => {
  const config = getConfig()
  config.settings = { ...config.settings, ...settings }
  saveConfig(config)
  return config.settings
}

// Re-export getConfig and saveConfig for compatibility
export { getConfig, saveConfig }

// Keep ConfigStore class for backward compatibility (deprecated)
/** @deprecated Use direct imports instead */
export class ConfigStore {
  private static instance: ConfigStore
  private store: typeof store

  private constructor() {
    this.store = store
  }

  static getInstance(): ConfigStore {
    if (!ConfigStore.instance) {
      ConfigStore.instance = new ConfigStore()
    }
    return ConfigStore.instance
  }

  getConfig = getConfig
  saveConfig = saveConfig
  getGroups = getGroups
  getGroup = getGroup
  createGroup = createGroup
  updateGroup = updateGroup
  deleteGroup = deleteGroup
  reorderGroups = reorderGroups
  getProjects = getProjects
  getProject = getProject
  createProject = createProject
  updateProject = updateProject
  deleteProject = deleteProject
  reorderProjects = reorderProjects
  createTerminal = createTerminal
  getTerminal = getTerminal
  updateTerminal = updateTerminal
  deleteTerminal = deleteTerminal
  getSettings = getSettings
  updateSettings = updateSettings
}
