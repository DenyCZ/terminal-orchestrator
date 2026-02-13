import type { Project, Terminal, AppConfig, AppSettings } from '@shared/types'
import type { TerminalDataBatch, TerminalExitEvent, WorktreeCreateOptions, WorktreeCreateResult, GitBranch } from '@shared/ipc'

export interface ElectronAPI {
  project: {
    list: () => Promise<Project[]>
    create: (name: string, rootDirectory?: string) => Promise<Project>
    update: (id: string, updates: Partial<Project>) => Promise<Project | undefined>
    delete: (id: string) => Promise<boolean>
  }
  
  terminal: {
    create: (
      projectId: string,
      name: string,
      shellType: 'cmd' | 'powershell',
      workingDirectory: string,
      startupCommand?: string
    ) => Promise<Terminal | undefined>
    update: (
      projectId: string,
      terminalId: string,
      updates: Partial<Terminal>
    ) => Promise<Terminal | undefined>
    delete: (projectId: string, terminalId: string) => Promise<boolean>
    start: (projectId: string, terminalId: string) => Promise<{ pid: number } | undefined>
    stop: (terminalId: string) => Promise<void>
    restart: (projectId: string, terminalId: string) => Promise<{ pid: number } | undefined>
    write: (terminalId: string, data: string) => void
    resize: (terminalId: string, cols: number, rows: number) => void
    onData: (callback: (data: TerminalDataBatch) => void) => () => void
    onExit: (callback: (event: TerminalExitEvent) => void) => () => void
  }
  
  config: {
    load: () => Promise<AppConfig>
    save: (config: AppConfig) => Promise<boolean>
    updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>
  }
  
  git: {
    createWorktree: (options: WorktreeCreateOptions) => Promise<WorktreeCreateResult>
    listWorktrees: (repoPath: string) => Promise<{ path: string; branch: string; commit: string }[]>
    listBranches: (repoPath: string) => Promise<GitBranch[]>
  }
  
  shell: {
    openFolder: (folderPath: string) => Promise<string>
  }
  
  init: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
