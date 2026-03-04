import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { TerminalDataBatch, TerminalExitEvent, WorktreeCreateOptions, WorktreeCreateResult, GitBranch, WebUIStatus, TunnelStatus, FileEntry, ReadDirOptions, OpenCodeSessionInfo, OpenCodeWatcherStatus, OpenCodeSessionEvent, AppNotification } from '@shared/ipc'
import type { Project, ProjectGroup, Terminal, AppConfig, AppSettings, DetectedShell, ShellType } from '@shared/types'

// Exposed API to renderer
const electronAPI = {
  // Group operations
  group: {
    list: (): Promise<ProjectGroup[]> => ipcRenderer.invoke(IPC_CHANNELS.GROUP_LIST),
    create: (name: string, color?: string): Promise<ProjectGroup> =>
      ipcRenderer.invoke(IPC_CHANNELS.GROUP_CREATE, name, color),
    update: (id: string, updates: Partial<ProjectGroup>): Promise<ProjectGroup | undefined> =>
      ipcRenderer.invoke(IPC_CHANNELS.GROUP_UPDATE, id, updates),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.GROUP_DELETE, id),
    reorder: (groupIds: string[]): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.GROUP_REORDER, groupIds)
  },

  // Project operations
  project: {
    list: (): Promise<Project[]> => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST),
    create: (name: string, rootDirectory?: string): Promise<Project> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, name, rootDirectory),
    update: (id: string, updates: Partial<Project>): Promise<Project | undefined> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE, id, updates),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, id),
    reorder: (projectIds: string[], groupId?: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_REORDER, projectIds, groupId)
  },

  // Terminal operations
  terminal: {
    create: (
      projectId: string,
      name: string,
      shellType: ShellType,
      workingDirectory: string,
      startupCommand?: string
    ): Promise<Terminal | undefined> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.TERMINAL_CREATE,
        projectId,
        name,
        shellType,
        workingDirectory,
        startupCommand
      ),

    update: (
      projectId: string,
      terminalId: string,
      updates: Partial<Terminal>
    ): Promise<Terminal | undefined> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_UPDATE, projectId, terminalId, updates),

    delete: (projectId: string, terminalId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_DELETE, projectId, terminalId),

    start: (projectId: string, terminalId: string): Promise<{ pid: number } | undefined> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_START, projectId, terminalId),

    stop: (terminalId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_STOP, terminalId),

    restart: (projectId: string, terminalId: string): Promise<{ pid: number } | undefined> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESTART, projectId, terminalId),

    write: (terminalId: string, data: string): void =>
      ipcRenderer.send(IPC_CHANNELS.TERMINAL_WRITE, terminalId, data),

    resize: (terminalId: string, cols: number, rows: number): void =>
      ipcRenderer.send(IPC_CHANNELS.TERMINAL_RESIZE, terminalId, cols, rows),

    pause: (terminalId: string): void =>
      ipcRenderer.send(IPC_CHANNELS.TERMINAL_PAUSE, terminalId),

    resume: (terminalId: string): void =>
      ipcRenderer.send(IPC_CHANNELS.TERMINAL_RESUME, terminalId),

    // Event listeners
    onData: (callback: (data: TerminalDataBatch) => void) => {
      const listener = (_: unknown, data: TerminalDataBatch) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_DATA, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_DATA, listener)
    },

    onExit: (callback: (event: TerminalExitEvent) => void) => {
      const listener = (_: unknown, event: TerminalExitEvent) => {
        callback(event)
        // Notify main process that we handled the exit
        ipcRenderer.send('terminal:exit-handled', event.terminalId, '', event.exitCode)
      }
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_EXIT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_EXIT, listener)
    }
  },

  // Config operations
  config: {
    load: (): Promise<AppConfig> => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_LOAD),
    save: (config: AppConfig): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE, config),
    updateSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, settings)
  },

  // Git operations
  git: {
    createWorktree: (options: WorktreeCreateOptions): Promise<WorktreeCreateResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREE_CREATE, options),
    listWorktrees: (repoPath: string): Promise<{ path: string; branch: string; commit: string }[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREE_LIST, repoPath),
    listBranches: (repoPath: string): Promise<GitBranch[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCHES_LIST, repoPath)
  },

  // Shell operations
  shell: {
    openFolder: (folderPath: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_FOLDER, folderPath),
    listAvailable: (): Promise<DetectedShell[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_LIST),
    openInVSCode: (filePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_VSCODE, filePath),
    openInZed: (filePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_ZED, filePath)
  },

  // File system operations
  fs: {
    readDir: (options: ReadDirOptions): Promise<FileEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_READ_DIR, options),
    readFile: (filePath: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_READ_FILE, filePath)

  },

  // Web UI operations
  webui: {
    start: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.WEBUI_START),
    stop: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.WEBUI_STOP),
    getStatus: (): Promise<WebUIStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.WEBUI_STATUS),
    regeneratePin: (): Promise<{ pin: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.WEBUI_REGENERATE_PIN)
  },

  // Tunnel operations
  tunnel: {
    start: (): Promise<{ success: boolean; url?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.TUNNEL_START),
    stop: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.TUNNEL_STOP),
    getStatus: (): Promise<TunnelStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.TUNNEL_STATUS)
  },

  // OpenCode session operations
  opencode: {
    getSessions: (): Promise<OpenCodeSessionInfo[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.OPENCODE_SESSIONS),
    getSessionByDir: (directory: string): Promise<OpenCodeSessionInfo | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.OPENCODE_SESSION_BY_DIR, directory),
    getStatus: (): Promise<OpenCodeWatcherStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.OPENCODE_STATUS),
    
    // Event listener for session updates
    onEvent: (callback: (event: OpenCodeSessionEvent) => void) => {
      const listener = (_: unknown, event: OpenCodeSessionEvent) => callback(event)
      ipcRenderer.on(IPC_CHANNELS.OPENCODE_EVENT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.OPENCODE_EVENT, listener)
    }
  },

  // Notification operations
  notification: {
    // Event listener for notifications from main process
    onShow: (callback: (notification: AppNotification) => void) => {
      const listener = (_: unknown, notification: AppNotification) => callback(notification)
      ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_SHOW, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_SHOW, listener)
    },
    
    // Dismiss a notification
    dismiss: (id: string): void =>
      ipcRenderer.send(IPC_CHANNELS.NOTIFICATION_DISMISS, id)
  },

  // Initialize main window reference
  init: (): void => ipcRenderer.send('set-main-window'),

  // File path utilities (needed for drag-and-drop in Electron 32+)
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}


if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error('Failed to expose electronAPI:', error)
  }
} else {
  window.electronAPI = electronAPI
}
