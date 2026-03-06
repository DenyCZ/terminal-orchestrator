import { BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { ShellType, TerminalStatus } from '@shared/types'
import type { PtyConfig, AppNotification } from '@shared/ipc'
import { IPC_CHANNELS } from '@shared/ipc'
import { detectShells } from '../shell-detector'
import { EscapeAwareBuffer } from './utf8-buffer'

// OSC 777 notification pattern: ESC ] 777 ; notify ; Title ; Body BEL
// Format: \x1b]777;notify;Title;Body\x07
const OSC_777_NOTIFY_REGEX = /\x1b\]777;notify;([^;]*);([^\x07]*)\x07/g

// Interface for WebSocket broadcaster (to avoid circular dependency)
export interface ITerminalDataBroadcaster {
  broadcastToTerminal(terminalId: string, data: string): void
  broadcastStatus(terminalId: string, status: TerminalStatus): void
}

// Type definitions for PTY interface
interface IPty {
  pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(callback: (data: string) => void): void
  onExit(callback: (event: { exitCode: number }) => void): void
}

interface PtySession {
  id: string
  terminalId: string
  pty: IPty
  pid: number
  paused: boolean  // Flow control flag
  pausedBuffer: string[]  // Buffer for data received while paused
  escapeBuffer: EscapeAwareBuffer  // Prevents split ANSI sequences across IPC chunks
}

// Data sender - sends terminal data immediately to avoid splitting escape sequences
// IMPORTANT: We must send data atomically to avoid splitting multi-byte ANSI escape sequences
// Buffering with setTimeout can split multi-byte ANSI escape sequences
// causing characters to appear stuck on the left side of the terminal
const createDataSender = () => {
  let window: BrowserWindow | null = null

  const sendData = (terminalId: string, data: string) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send('terminal:data', {
        terminalId,
        data
      })
    }
  }

  return {
    setWindow: (w: BrowserWindow) => { window = w },
    sendData,
    clear: () => {
      // No-op - no buffering
    },
    clearAll: () => {
      // No-op - no buffering
    }
  }
}

// Fallback PTY using child_process (limited functionality)
class ChildProcessPty implements IPty {
  pid: number
  private process: ChildProcess
  private dataCallbacks: ((data: string) => void)[] = []
  private exitCallbacks: ((event: { exitCode: number }) => void)[] = []

  constructor(process: ChildProcess) {
    this.process = process
    this.pid = process.pid || 0

    process.stdout?.on('data', (data) => {
      const str = data.toString()
      this.dataCallbacks.forEach(cb => cb(str))
    })

    process.stderr?.on('data', (data) => {
      const str = data.toString()
      this.dataCallbacks.forEach(cb => cb(str))
    })

    process.on('close', (code) => {
      this.exitCallbacks.forEach(cb => cb({ exitCode: code || 0 }))
    })
  }

  write(data: string): void {
    this.process.stdin?.write(data)
  }

  resize(_cols: number, _rows: number): void {
    // Not supported in child_process fallback
    console.warn('Resize not supported in child_process fallback')
  }

  kill(): void {
    this.process.kill()
  }

  onData(callback: (data: string) => void): void {
    this.dataCallbacks.push(callback)
  }

  onExit(callback: (event: { exitCode: number }) => void): void {
    this.exitCallbacks.push(callback)
  }
}

interface PtySpawnOptions {
  name: string
  cols: number
  rows: number
  cwd: string
  env: Record<string, string>
  encoding?: string
}

function validateCwd(cwd: string): string {
  // If cwd is empty or not provided, use home directory
  if (!cwd || cwd.trim() === '') {
    console.warn('Empty cwd provided, using home directory')
    return os.homedir()
  }

  // Resolve to absolute path
  const resolvedPath = path.resolve(cwd)

  // Check if path exists
  if (!fs.existsSync(resolvedPath)) {
    console.warn(`Cwd does not exist: "${cwd}", using home directory`)
    return os.homedir()
  }

  // Check if it's a directory
  const stats = fs.statSync(resolvedPath)
  if (!stats.isDirectory()) {
    console.warn(`Cwd is not a directory: "${cwd}", using parent directory`)
    const parentDir = path.dirname(resolvedPath)
    // Recursively validate parent directory
    return validateCwd(parentDir)
  }

  return resolvedPath
}

async function createPty(
  shell: string,
  args: string[],
  options: { cols: number; rows: number; cwd: string; env: Record<string, string> }
): Promise<IPty> {
  // Validate and normalize cwd before passing to node-pty
  const validCwd = validateCwd(options.cwd)
  console.log(`Creating PTY with cwd: "${validCwd}" (original: "${options.cwd}")`)

  const MAX_RETRIES = 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const pty = await import('@lydell/node-pty')

      const ptyOptions: PtySpawnOptions = {
        name: 'xterm-256color',
        cols: options.cols,
        rows: options.rows,
        cwd: validCwd,
        env: options.env
      }

      if (process.platform !== 'win32') {
        ptyOptions.encoding = 'utf8'
      }

      return pty.spawn(shell, args, ptyOptions)
    } catch (error) {
      lastError = error as Error
      console.warn(`PTY spawn attempt ${attempt + 1} failed:`, error)
      
      // If we have retries left, wait with exponential backoff
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)))
      }
    }
  }

  // All retries failed, fall back to child_process
  console.warn('node-pty not available after retries, falling back to child_process:', lastError)

  const proc = spawn(shell, args, {
    cwd: validCwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe']
  })

  return new ChildProcessPty(proc)
}

// Session limit to prevent resource exhaustion
const MAX_CONCURRENT_SESSIONS = 50

// Max buffer size for paused terminals (256KB) - prevents memory exhaustion
const MAX_PAUSED_BUFFER_BYTES = 256 * 1024

// Metrics for observability
export interface PtyMetrics {
  totalSpawned: number
  failedSpawns: number
  activeSessions: number
  bytesEmitted: number
  pausesTriggered: number
}
export class PtyManager {
  private static instance: PtyManager
  private sessions: Map<string, PtySession> = new Map()
  private dataSender: ReturnType<typeof createDataSender>
  private window: BrowserWindow | null = null
  private ptyAvailable: boolean | null = null
  private wsServer: ITerminalDataBroadcaster | null = null
  private metrics: PtyMetrics = {
    totalSpawned: 0,
    failedSpawns: 0,
    activeSessions: 0,
    bytesEmitted: 0,
    pausesTriggered: 0
  }
  private constructor() {
    this.dataSender = createDataSender()
    this.checkPtyAvailability()
  }
  
  setWebSocketServer(wsServer: ITerminalDataBroadcaster | null): void {
    this.wsServer = wsServer
  }

  private async checkPtyAvailability(): Promise<void> {
    try {
      await import('@lydell/node-pty')
      this.ptyAvailable = true
      console.log('node-pty is available')
    } catch (error) {
      this.ptyAvailable = false
      console.warn('node-pty not available, using child_process fallback')
    }
  }

  static getInstance(): PtyManager {
    if (!PtyManager.instance) {
      PtyManager.instance = new PtyManager()
    }
    return PtyManager.instance
  }

  setWindow(window: BrowserWindow): void {
    this.window = window
    this.dataSender.setWindow(window)
  }

  private getShell(shellType: ShellType): { shell: string; args: string[] } {
    if (process.platform !== 'win32') {
      // On Linux/macOS, use detected shells
      const shells = detectShells()
      
      // Try to find a shell matching the requested type
      const matchingShell = shells.find(s => s.id === shellType || s.type === shellType)
      if (matchingShell) {
        return { shell: matchingShell.path, args: matchingShell.args || [] }
      }
      
      // Fallback to bash, zsh, fish, or first available
      const bashShell = shells.find(s => s.id === 'bash')
      if (bashShell) return { shell: bashShell.path, args: bashShell.args || [] }
      
      const zshShell = shells.find(s => s.id === 'zsh')
      if (zshShell) return { shell: zshShell.path, args: zshShell.args || [] }
      
      const fishShell = shells.find(s => s.id === 'fish')
      if (fishShell) return { shell: fishShell.path, args: fishShell.args || [] }
      
      // Last resort: use $SHELL or /bin/bash
      return { shell: process.env.SHELL || '/bin/bash', args: [] }
    }

    const fs = require('fs')
    
    switch (shellType) {
      case 'cmd':
        return { 
          shell: process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe', 
          args: [] 
        }
      case 'pwsh': {
        const pwshCore = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
        if (fs.existsSync(pwshCore)) {
          return { shell: pwshCore, args: [] }
        }
        // Fallback to Windows PowerShell
        return { shell: 'powershell.exe', args: [] }
      }
      case 'git-bash': {
        const gitBashPaths = [
          'C:\\Program Files\\Git\\bin\\bash.exe',
          'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
        ]
        for (const bashPath of gitBashPaths) {
          if (fs.existsSync(bashPath)) {
            return { shell: bashPath, args: ['--login', '-i'] }
          }
        }
        // Fallback to PowerShell if Git Bash not found
        return { shell: 'powershell.exe', args: [] }
      }
      case 'wsl':
        return { shell: 'wsl.exe', args: [] }
      case 'cygwin': {
        const cygwinPaths = [
          'C:\\cygwin64\\bin\\bash.exe',
          'C:\\cygwin\\bin\\bash.exe'
        ]
        for (const cygwinPath of cygwinPaths) {
          if (fs.existsSync(cygwinPath)) {
            return { shell: cygwinPath, args: ['--login', '-i'] }
          }
        }
        return { shell: 'powershell.exe', args: [] }
      }
      case 'msys2': {
        const msys2Path = 'C:\\msys64\\usr\\bin\\bash.exe'
        if (fs.existsSync(msys2Path)) {
          return { shell: msys2Path, args: ['--login', '-i'] }
        }
        return { shell: 'powershell.exe', args: [] }
      }
      case 'powershell':
      default:
        // Try PowerShell Core first, then Windows PowerShell
        const pwshCore = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
        if (fs.existsSync(pwshCore)) {
          return { shell: pwshCore, args: [] }
        }
        return { shell: 'powershell.exe', args: [] }
    }
  }

  async spawn(config: PtyConfig): Promise<{ terminalId: string; pid: number }> {
    // Check session limit
    if (this.sessions.size >= MAX_CONCURRENT_SESSIONS) {
      this.metrics.failedSpawns++
      throw new Error(`Maximum concurrent sessions (${MAX_CONCURRENT_SESSIONS}) reached`)
    }

    const { shell, args: shellArgs } = this.getShell(config.shellType)
    const session = uuid()

    let ptyProcess: IPty
    try {
      // Build environment with improved terminal/agent compatibility settings
      const terminalEnv: Record<string, string> = {
        ...process.env,
        // Terminal identification for proper color/feature support
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        // Kitty window ID for some terminal features
        KITTY_WINDOW_ID: '1',
        // Claude Code allow-list hack - pretend to be ghostty
        TERM_PROGRAM: 'ghostty',
        TERM_PROGRAM_VERSION: '3.0.0',
        // Override with any custom env from config
        ...(config.env || {})
      } as Record<string, string>
      
      // Remove CLAUDECODE to prevent nested-session detection
      delete terminalEnv.CLAUDECODE
      
      ptyProcess = await createPty(shell, shellArgs, {
        cols: config.cols,
        rows: config.rows,
        cwd: config.cwd,
        env: terminalEnv
      })
      this.metrics.totalSpawned++
    } catch (error) {
      this.metrics.failedSpawns++
      throw error
    }

    const ptySession: PtySession = {
      id: session,
      terminalId: config.terminalId,
      pty: ptyProcess,
      pid: ptyProcess.pid,
      paused: false,  // Initialize as not paused
      pausedBuffer: [],  // Buffer for data received while paused
      escapeBuffer: new EscapeAwareBuffer()  // Per-session buffer to prevent split escape sequences
    }

    // Setup data handling - buffer data when paused, send when not
    ptyProcess.onData((data) => {
      const session = this.sessions.get(config.terminalId)
      if (!session) return
      
      if (session.paused) {
        // Buffer data while paused - will be flushed on resume
        session.pausedBuffer.push(data)
        
        // Cap buffer size to prevent memory exhaustion
        const bufferSize = session.pausedBuffer.reduce((sum, chunk) => sum + chunk.length, 0)
        if (bufferSize > MAX_PAUSED_BUFFER_BYTES) {
          // Drop oldest chunks when over limit
          while (
            session.pausedBuffer.reduce((sum, chunk) => sum + chunk.length, 0) > MAX_PAUSED_BUFFER_BYTES &&
            session.pausedBuffer.length > 1
          ) {
            session.pausedBuffer.shift()
          }
        }
        return
      }
      
      // Run through escape-aware buffer — prevents split ANSI sequences across IPC chunk boundaries
      // (e.g. ESC [ arriving in chunk N, 31m in chunk N+1 → TUI distortion if sent separately)
      const safeData = session.escapeBuffer.push(data)
      if (!safeData) return  // holding an incomplete escape sequence — wait for next chunk

      // Detect OSC 777 notifications before sending to terminal
      this.detectAndEmitNotifications(safeData, config.terminalId)
      
      // Track bytes for metrics
      this.metrics.bytesEmitted += safeData.length
      
      // Strip OSC 777 sequences from data before sending to terminal
      const cleanData = safeData.replace(OSC_777_NOTIFY_REGEX, '')
      
      this.dataSender.sendData(config.terminalId, cleanData)
      // Also broadcast to WebSocket clients
      this.wsServer?.broadcastToTerminal(config.terminalId, cleanData)
    })

    // Handle exit
    ptyProcess.onExit(({ exitCode }) => {
      this.dataSender.clear(config.terminalId)
      this.sessions.delete(config.terminalId)
      
      // Broadcast status to WebSocket clients
      const status: TerminalStatus = exitCode === 0 ? 'stopped' : 'error'
      this.wsServer?.broadcastStatus(config.terminalId, status)
      
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('terminal:exit', {
          terminalId: config.terminalId,
          exitCode
        })
      }
    })

    this.sessions.set(config.terminalId, ptySession)

    return {
      terminalId: config.terminalId,
      pid: ptyProcess.pid
    }
  }

  write(terminalId: string, data: string): void {
    const session = this.sessions.get(terminalId)
    if (session) {
      session.pty.write(data)
    }
  }

  resize(terminalId: string, cols: number, rows: number): void {
    const session = this.sessions.get(terminalId)
    if (session) {
      try {
        session.pty.resize(cols, rows)
      } catch (error) {
        console.warn(`Resize failed for terminal ${terminalId}:`, error)
      }
    }
  }

  kill(terminalId: string): void {
    const session = this.sessions.get(terminalId)
    if (session) {
      // Graceful shutdown: Send Ctrl-C first
      try {
        session.pty.write('\x03')
      } catch {
        // Ignore write errors
      }
      
      // Wait a brief moment for graceful exit, then force kill
      setTimeout(() => {
        try {
          session.pty.kill()
        } catch (error) {
          console.warn(`Kill failed for terminal ${terminalId}:`, error)
        }
      }, 100)
      
      this.dataSender.clear(terminalId)
      this.sessions.delete(terminalId)
    }
  }

  killAll(): void {
    // Synchronous kill for app shutdown - no delays
    for (const [terminalId, session] of this.sessions) {
      try {
        session.pty.kill()
      } catch (error) {
        console.warn(`Kill failed for terminal ${terminalId}:`, error)
      }
    }
    this.sessions.clear()
    this.dataSender.clearAll()
  }

  getPid(terminalId: string): number | undefined {
    return this.sessions.get(terminalId)?.pid
  }

  isRunning(terminalId: string): boolean {
    return this.sessions.has(terminalId)
  }

  isPtyAvailable(): boolean | null {
    return this.ptyAvailable
  }

  // Flow control: pause PTY output
  pause(terminalId: string): void {
    const session = this.sessions.get(terminalId)
    if (session && !session.paused) {
      session.paused = true
      this.metrics.pausesTriggered++
    }
  }

  // Flow control: resume PTY output and flush buffered data
  // IMPORTANT: Always flush buffer and set paused=false to handle race conditions
  resume(terminalId: string): void {
    const session = this.sessions.get(terminalId)
    if (session) {
      // Always set paused to false to ensure we don't get stuck
      const wasPaused = session.paused
      session.paused = false
      
      // Flush buffered data if any (buffer could have data even if wasPaused is false due to race conditions)
      if (session.pausedBuffer.length > 0) {
        const rawBuffered = session.pausedBuffer.join('')
        session.pausedBuffer = []
        
        // Run through escape buffer — merges any held remainder from before the pause
        // so sequence boundaries are respected across the pause/resume transition
        const safeBuffered = session.escapeBuffer.push(rawBuffered)
        if (safeBuffered) {
          // Track bytes for metrics
          this.metrics.bytesEmitted += safeBuffered.length

          // Strip OSC 777 sequences
          const cleanBuffered = safeBuffered.replace(OSC_777_NOTIFY_REGEX, '')

          this.dataSender.sendData(terminalId, cleanBuffered)
          this.wsServer?.broadcastToTerminal(terminalId, cleanBuffered)
        }
      }
    }
  }

  // Check if at session capacity
  isAtCapacity(): boolean {
    return this.sessions.size >= MAX_CONCURRENT_SESSIONS
  }

  // Get metrics for observability
  getMetrics(): PtyMetrics {
    return {
      ...this.metrics,
      activeSessions: this.sessions.size
    }
  }

  /**
   * Detect OSC 777 notifications in PTY output and emit to renderer.
   * Format: ESC ] 777 ; notify ; Title ; Body BEL
   */
  private detectAndEmitNotifications(data: string, terminalId: string): void {
    // Reset regex lastIndex for global regex
    OSC_777_NOTIFY_REGEX.lastIndex = 0
    
    let match
    while ((match = OSC_777_NOTIFY_REGEX.exec(data)) !== null) {
      const [, title, body] = match
      
      // Create notification
      const notification: AppNotification = {
        id: uuid(),
        title: title || 'Notification',
        body: body || undefined,
        type: 'info',
        terminalId,
        timestamp: Date.now(),
        duration: 5000 // 5 seconds default
      }
      
      // Emit to renderer
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send(IPC_CHANNELS.NOTIFICATION_SHOW, notification)
      }
      
      console.log('[PTY] OSC 777 notification:', title, body)
    }
  }
}
