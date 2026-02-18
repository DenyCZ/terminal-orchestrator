import type { Project, ProjectGroup, Terminal, AppConfig, AppSettings, DetectedShell, ShellType } from '@shared/types'
import type { TerminalDataBatch, TerminalExitEvent, WorktreeCreateOptions, WorktreeCreateResult, GitBranch, WebUIStatus, FileEntry, ReadDirOptions, OpenCodeSessionInfo, OpenCodeWatcherStatus, OpenCodeSessionEvent } from '@shared/ipc'

export interface ElectronAPI {
  group: {
    list: () => Promise<ProjectGroup[]>
    create: (name: string, color?: string) => Promise<ProjectGroup>
    update: (id: string, updates: Partial<ProjectGroup>) => Promise<ProjectGroup | undefined>
    delete: (id: string) => Promise<boolean>
    reorder: (groupIds: string[]) => Promise<boolean>
  }

  project: {
    list: () => Promise<Project[]>
    create: (name: string, rootDirectory?: string) => Promise<Project>
    update: (id: string, updates: Partial<Project>) => Promise<Project | undefined>
    delete: (id: string) => Promise<boolean>
    reorder: (projectIds: string[], groupId?: string) => Promise<boolean>
  }
  
  terminal: {
    create: (
      projectId: string,
      name: string,
      shellType: ShellType,
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
    listAvailable: () => Promise<DetectedShell[]>
    openInVSCode: (filePath: string) => Promise<{ success: boolean; error?: string }>
    openInZed: (filePath: string) => Promise<{ success: boolean; error?: string }>
  }

  fs: {
    readDir: (options: ReadDirOptions) => Promise<FileEntry[]>
  }
  
  webui: {
    start: () => Promise<{ success: boolean; error?: string }>
    stop: () => Promise<{ success: boolean }>
    getStatus: () => Promise<WebUIStatus>
    regeneratePin: () => Promise<{ pin: string }>
  }
  
  opencode: {
    getSessions: () => Promise<OpenCodeSessionInfo[]>
    getSessionByDir: (directory: string) => Promise<OpenCodeSessionInfo | null>
    getStatus: () => Promise<OpenCodeWatcherStatus>
    onEvent: (callback: (event: OpenCodeSessionEvent) => void) => () => void
  }
  
  init: () => void
  
  // File path utilities (needed for drag-and-drop in Electron 32+)
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
