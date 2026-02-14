import { ipcMain, BrowserWindow, shell } from 'electron'
import { ConfigStore } from '../store'
import { PtyManager } from '../pty'
import { IPC_CHANNELS } from '@shared/ipc'
import type { PtyConfig, TerminalDataBatch, TerminalExitEvent } from '@shared/ipc'
import type { Terminal, Project, ProjectGroup, WebUISettings, AppSettings, DetectedShell, ShellType } from '@shared/types'
import * as git from '../git'
import { WebUIManager } from '../web-ui-manager'
import { detectShells } from '../shell-detector'

let mainWindow: BrowserWindow | null = null

export function setupIpcHandlers(): void {
  const store = ConfigStore.getInstance()
  const ptyManager = PtyManager.getInstance()

  // Store window reference for PTY manager
  ipcMain.on('set-main-window', (event) => {
    mainWindow = BrowserWindow.fromWebContents(event.sender) || null
    if (mainWindow) {
      ptyManager.setWindow(mainWindow)
    }
  })

  // =====================
  // Group Operations
  // =====================

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

  // =====================
  // Project Operations
  // =====================

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
    // Kill all terminals in project first
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

  // =====================
  // Terminal Operations
  // =====================

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
    async (_, projectId: string, terminalId: string): Promise<{ pid: number } | undefined> => {
      const terminal = store.getTerminal(projectId, terminalId)
      if (!terminal) return undefined

      // Kill existing if running
      if (ptyManager.isRunning(terminalId)) {
        ptyManager.kill(terminalId)
      }

      // Update status
      store.updateTerminal(projectId, terminalId, { status: 'running' })

      const config: PtyConfig = {
        terminalId,
        shellType: terminal.shellType,
        cwd: terminal.workingDirectory,
        cols: 80,
        rows: 24
      }

      const result = await ptyManager.spawn(config)

      // Run startup command if provided
      if (terminal.startupCommand) {
        setTimeout(() => {
          ptyManager.write(terminalId, terminal.startupCommand! + '\r')
        }, 500)
      }

      return { pid: result.pid }
    }
  )

  ipcMain.handle(IPC_CHANNELS.TERMINAL_STOP, (_, terminalId: string): void => {
    ptyManager.kill(terminalId)
  })

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_RESTART,
    async (_, projectId: string, terminalId: string): Promise<{ pid: number } | undefined> => {
      ptyManager.kill(terminalId)
      
      const terminal = store.getTerminal(projectId, terminalId)
      if (!terminal) return undefined

      store.updateTerminal(projectId, terminalId, { status: 'running' })

      const config: PtyConfig = {
        terminalId,
        shellType: terminal.shellType,
        cwd: terminal.workingDirectory,
        cols: 80,
        rows: 24
      }

      const result = await ptyManager.spawn(config)

      if (terminal.startupCommand) {
        setTimeout(() => {
          ptyManager.write(terminalId, terminal.startupCommand! + '\r')
        }, 500)
      }

      return { pid: result.pid }
    }
  )

  ipcMain.on(IPC_CHANNELS.TERMINAL_WRITE, (_, terminalId: string, data: string): void => {
    ptyManager.write(terminalId, data)
  })

  ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, (_, terminalId: string, cols: number, rows: number): void => {
    ptyManager.resize(terminalId, cols, rows)
  })

  // =====================
  // Config Operations
  // =====================

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

  // =====================
  // Terminal Events
  // =====================

  // Handle terminal exit to update status
  ipcMain.on('terminal:exit-handled', (_, terminalId: string, projectId: string, exitCode: number) => {
    const status = exitCode === 0 ? 'stopped' : 'error'
    store.updateTerminal(projectId, terminalId, { status, pid: undefined })
  })

  // =====================
  // Git Operations
  // =====================

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

  // =====================
  // Shell Operations
  // =====================

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_FOLDER, (_, folderPath: string): Promise<string> => {
    return shell.openPath(folderPath)
  })

  ipcMain.handle(IPC_CHANNELS.SHELL_LIST, (): DetectedShell[] => {
    return detectShells()
  })

  // =====================
  // Web UI Operations
  // =====================

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

  ipcMain.handle(IPC_CHANNELS.WEBUI_STATUS, (): WebUIStatus => {
    const settings = store.getSettings().webUI as WebUISettings | undefined
    return {
      running: webUIManager.isRunning(),
      port: settings?.port || 3000,
      pin: settings?.pin || '',
      addresses: [],
      url: settings?.enabled ? `http://localhost:${settings?.port || 3000}` : undefined
    }
  })

  ipcMain.handle(IPC_CHANNELS.WEBUI_REGENERATE_PIN, (): { pin: string } => {
    const newPin = webUIManager.regeneratePIN()
    return { pin: newPin }
  })
}
