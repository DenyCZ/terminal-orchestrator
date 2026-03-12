import { ipcMain, BrowserWindow, shell } from 'electron'
import { ConfigStore } from '../store'
import { PtyManager } from '../pty'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { OpenCodeSessionInfo, OpenCodeWatcherStatus, TunnelStatus, WebUIStatus } from '../../shared/ipc'
import type { Terminal, Project, ProjectGroup, WebUISettings, AppSettings, DetectedShell, ShellType } from '../../shared/types'
import type { FileEntry, ReadDirOptions } from '../../shared/ipc'
import * as git from '../git'
import { WebUIManager } from '../web-ui-manager'
import { detectShells } from '../shell-detector'
import { getOpenCodeWatcher } from '../opencode'
import { startTerminalProcess, normalizeDirectory } from '../terminal-helpers'
import { withErrorLogAsync } from '../utils/error-handler'
import * as fs from 'fs'
import * as path from 'path'

let mainWindow: BrowserWindow | null = null

export function setupIpcHandlers(): void {
  const store = ConfigStore.getInstance()
  const ptyManager = PtyManager.getInstance()

  ipcMain.on('set-main-window', (event) => {
    mainWindow = BrowserWindow.fromWebContents(event.sender) || null
    if (mainWindow) {
      ptyManager.setWindow(mainWindow)
    }
  })

  ipcMain.handle(IPC_CHANNELS.GROUP_LIST, (): ProjectGroup[] => {
    return store.getGroups()
  })

  ipcMain.handle(
    IPC_CHANNELS.GROUP_CREATE,
    (_, name: string, color?: string): ProjectGroup => {
      return store.createGroup(name, color)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GROUP_UPDATE,
    (_, id: string, updates: Partial<ProjectGroup>): ProjectGroup | undefined => {
      return store.updateGroup(id, updates)
    }
  )

  ipcMain.handle(IPC_CHANNELS.GROUP_DELETE, (_, id: string): boolean => {
    return store.deleteGroup(id)
  })

  ipcMain.handle(IPC_CHANNELS.GROUP_REORDER, (_, groupIds: string[]): boolean => {
    return store.reorderGroups(groupIds)
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, (): Project[] => {
    return store.getProjects()
  })

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_CREATE,
    (_, name: string, rootDirectory?: string): Project => {
      return store.createProject(name, rootDirectory)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UPDATE,
    (_, id: string, updates: Partial<Project>): Project | undefined => {
      return store.updateProject(id, updates)
    }
  )

  ipcMain.handle(IPC_CHANNELS.PROJECT_DELETE, (_, id: string): boolean => {
    const project = store.getProject(id)
    if (project) {
      for (const terminal of project.terminals) {
        if (ptyManager.isRunning(terminal.id)) {
          ptyManager.kill(terminal.id)
        }
      }
    }
    return store.deleteProject(id)
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_REORDER, (_, projectIds: string[], groupId?: string): boolean => {
    return store.reorderProjects(projectIds, groupId)
  })

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_CREATE,
    (
      _,
      projectId: string,
      name: string,
      shellType: ShellType,
      workingDirectory: string,
      startupCommand?: string
    ): Terminal | undefined => {
      return store.createTerminal(projectId, name, shellType, workingDirectory, startupCommand)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_UPDATE,
    (_, projectId: string, terminalId: string, updates: Partial<Terminal>): Terminal | undefined => {
      return store.updateTerminal(projectId, terminalId, updates)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_DELETE,
    (_, projectId: string, terminalId: string): boolean => {
      // Kill terminal if running
      if (ptyManager.isRunning(terminalId)) {
        ptyManager.kill(terminalId)
      }
      return store.deleteTerminal(projectId, terminalId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_START,
    async (_, projectId: string, terminalId: string, cols?: number, rows?: number): Promise<{ pid: number } | undefined> => {
      const result = await startTerminalProcess(
        store, 
        ptyManager, 
        projectId, 
        terminalId,
        (terminal) => {
          if (terminal.startupCommand?.toLowerCase().includes('opencode')) {
            const session = openCodeWatcher.getSessionByDirectory(terminal.workingDirectory)
            if (session) {
              store.updateTerminal(projectId, terminalId, { openCodeSessionId: session.id })
            }
          }
        },
        cols,
        rows
      )
      
      if (!result.success) return undefined
      return { pid: result.pid! }
    }
  )

  ipcMain.handle(IPC_CHANNELS.TERMINAL_STOP, (_, terminalId: string): void => {
    ptyManager.kill(terminalId)
    
    const config = store.getConfig()
    for (const project of config.projects) {
      const terminal = project.terminals.find(t => t.id === terminalId)
      if (terminal) {
        store.updateTerminal(project.id, terminalId, { openCodeSessionId: undefined })
        break
      }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_RESTART,
    async (_, projectId: string, terminalId: string, cols?: number, rows?: number): Promise<{ pid: number } | undefined> => {
      ptyManager.kill(terminalId)
      
      const result = await startTerminalProcess(store, ptyManager, projectId, terminalId, undefined, cols, rows)
      
      if (!result.success) return undefined
      return { pid: result.pid! }
    }
  )

  ipcMain.on(IPC_CHANNELS.TERMINAL_WRITE, (_, terminalId: string, data: string): void => {
    ptyManager.write(terminalId, data)
  })

  ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, (_, terminalId: string, cols: number, rows: number): void => {
    ptyManager.resize(terminalId, cols, rows)
  })


  ipcMain.on(IPC_CHANNELS.TERMINAL_PAUSE, (_, terminalId: string): void => {
    ptyManager.pause(terminalId)
  })

  ipcMain.on(IPC_CHANNELS.TERMINAL_RESUME, (_, terminalId: string): void => {
    ptyManager.resume(terminalId)
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_LOAD, () => {
    return store.getConfig()
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, (_, config) => {
    store.saveConfig(config)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_, settings: Partial<AppSettings>): AppSettings => {
    return store.updateSettings(settings)
  })

  ipcMain.on('terminal:exit-handled', (_, terminalId: string, projectId: string, exitCode: number) => {
    const status = exitCode === 0 ? 'stopped' : 'error'
    store.updateTerminal(projectId, terminalId, { status, pid: undefined })
  })

  ipcMain.handle(
    IPC_CHANNELS.GIT_WORKTREE_CREATE,
    async (_, options: git.WorktreeCreateOptions): Promise<git.WorktreeCreateResult> => {
      return git.createWorktree(options)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_WORKTREE_LIST,
    (_, repoPath: string) => {
      return git.listWorktrees(repoPath)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GIT_BRANCHES_LIST,
    (_, repoPath: string) => {
      return git.listBranches(repoPath)
    }
  )

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_FOLDER, (_, folderPath: string): Promise<string> => {
    return shell.openPath(folderPath)
  })

  ipcMain.handle(IPC_CHANNELS.SHELL_LIST, (): DetectedShell[] => {
    return detectShells()
  })

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_VSCODE, async (_, filePath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const vscodeUrl = `vscode://file/${encodeURIComponent(filePath)}`
      await shell.openExternal(vscodeUrl)
      return { success: true }
    } catch (error) {
      console.error('Failed to open VSCode:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to open VSCode' 
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_ZED, async (_, filePath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Zed URL scheme: zed://file/path/to/file
      // On Windows, convert backslashes to forward slashes
      const normalizedPath = filePath.replace(/\\/g, '/')
      const zedUrl = `zed://file${normalizedPath}`
      await shell.openExternal(zedUrl)
      return { success: true }
    } catch (error) {
      console.error('Failed to open Zed:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to open Zed' 
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.FS_READ_DIR, async (_, options: ReadDirOptions): Promise<FileEntry[]> => {
    const { path: dirPath } = options
    
    return withErrorLogAsync(async () => {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      
      const fileEntries: FileEntry[] = await Promise.all(
        entries
          .filter(entry => !entry.name.startsWith('.'))
          .map(async (entry): Promise<FileEntry> => {
            const fullPath = path.join(dirPath, entry.name)
            const stats = entry.isSymbolicLink() 
              ? await fs.promises.lstat(fullPath).catch(() => null)
              : await fs.promises.stat(fullPath).catch(() => null)
            
            const isDirectory = entry.isDirectory() || (stats?.isDirectory() ?? false)
            
            return {
              name: entry.name,
              path: fullPath,
              isDirectory,
              isFile: !isDirectory,
              extension: isDirectory ? undefined : path.extname(entry.name),
              size: stats?.size,
              modifiedAt: stats?.mtimeMs
            }
          })
      )
      
      return fileEntries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      })
    }, [], `FS read dir ${dirPath}`)
  })


  ipcMain.handle(IPC_CHANNELS.FS_READ_FILE, async (_, filePath: string): Promise<string> => {
    return withErrorLogAsync(async () => {
      return await fs.promises.readFile(filePath, 'utf-8')
    }, '', `FS read file ${filePath}`)
  })

  const webUIManager = WebUIManager.getInstance()

  ipcMain.handle(IPC_CHANNELS.WEBUI_START, async (): Promise<{ success: boolean; error?: string }> => {
    const settings = store.getSettings().webUI
    if (settings) {
      try {
        await webUIManager.start(settings)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
    return { success: false, error: 'Web UI settings not found' }
  })

  ipcMain.handle(IPC_CHANNELS.WEBUI_STOP, async (): Promise<{ success: boolean }> => {
    await webUIManager.stop()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.WEBUI_STATUS, async (): Promise<WebUIStatus> => {
    return webUIManager.getStatus()
  })

  ipcMain.handle(IPC_CHANNELS.WEBUI_REGENERATE_PIN, (): { pin: string } => {
    const newPin = webUIManager.regeneratePIN()
    return { pin: newPin }
  })

  // Tunnel operations
  ipcMain.handle(IPC_CHANNELS.TUNNEL_START, async (): Promise<{ success: boolean; url?: string; error?: string }> => {
    try {
      const url = await webUIManager.startTunnel()
      return { success: true, url }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.TUNNEL_STOP, (): { success: boolean } => {
    webUIManager.stopTunnel()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.TUNNEL_STATUS, (): TunnelStatus => {
    return webUIManager.getTunnelStatus()
  })

  const openCodeWatcher = getOpenCodeWatcher()

  openCodeWatcher.start()

  ipcMain.handle(IPC_CHANNELS.OPENCODE_SESSIONS, (): OpenCodeSessionInfo[] => {
    return openCodeWatcher.getAllSessions()
  })

  ipcMain.handle(IPC_CHANNELS.OPENCODE_SESSION_BY_DIR, (_, directory: string): OpenCodeSessionInfo | null => {
    return openCodeWatcher.getSessionByDirectory(directory)
  })

  ipcMain.handle(IPC_CHANNELS.OPENCODE_STATUS, (): OpenCodeWatcherStatus => {
    return openCodeWatcher.getStatus()
  })

  openCodeWatcher.onSessionChange((sessions) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.OPENCODE_EVENT, {
        type: 'sessions-updated',
        sessions: Array.from(sessions.values())
      })
      
      const config = store.getConfig()
      for (const project of config.projects) {
        for (const terminal of project.terminals) {
          if (terminal.startupCommand?.toLowerCase().includes('opencode') && 
              terminal.status === 'running') {
            const session = sessions.get(normalizeDirectory(terminal.workingDirectory))
            if (session && session.id !== terminal.openCodeSessionId) {
              store.updateTerminal(project.id, terminal.id, { openCodeSessionId: session.id })
            }
          }
        }
      }
    }
  })

  openCodeWatcher.onStatusChange((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.OPENCODE_EVENT, {
        type: 'status-changed',
        status
      })
    }
  })
}
