import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupIpcHandlers } from './ipc'
import { ConfigStore, clearAllTerminals } from './store'
import { PtyManager } from './pty'
import { WebUIManager } from './web-ui-manager'
import { ensureOpenCodePlugin } from './opencode'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Quit when all windows are closed, except on macOS
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.terminal-orchestrator')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize config store and clear orphaned terminals
  // Initialize config store and clear orphaned terminals
  ConfigStore.getInstance()
  clearAllTerminals()

  // Auto-install OpenCode notification plugin on first run
  ensureOpenCodePlugin()

  // Setup IPC handlers
  setupIpcHandlers()

  // Initialize Web UI manager
  WebUIManager.getInstance().initialize().catch(console.error)

  createWindow()

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Close all PTY processes on quit
app.on('before-quit', () => {
  PtyManager.getInstance().killAll()
  WebUIManager.getInstance().stop().catch(console.error)
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
