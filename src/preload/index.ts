import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { TerminalDataBatch, TerminalExitEvent, PtyConfig } from '@shared/ipc'
import type { Project, Terminal, AppConfig } from '@shared/types'

// Exposed API to renderer
const electronAPI = {
  // Project operations
  project: {
    list: (): Promise<Project[]> => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST),
    create: (name: string, rootDirectory?: string): Promise<Project> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, name, rootDirectory),
    update: (id: string, updates: Partial<Project>): Promise<Project | undefined> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE, id, updates),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, id)
  },

  // Terminal operations
  terminal: {
    create: (
      projectId: string,
      name: string,
      shellType: 'cmd' | 'powershell',
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
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE, config)
  },

  // Initialize main window reference
  init: (): void => ipcRenderer.send('set-main-window')
}

// Use `contextBridge` APIs to expose Electron APIs to renderer
// only if context isolation is enabled
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error('Failed to expose electronAPI:', error)
  }
} else {
  // @ts-ignore
  window.electronAPI = electronAPI
}
