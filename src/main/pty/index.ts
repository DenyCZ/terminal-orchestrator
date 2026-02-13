import { BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { v4 as uuid } from 'uuid'
import type { ShellType } from '@shared/types'
import type { PtyConfig } from '@shared/ipc'

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
}

// Data batcher for performance optimization
class DataBatcher {
  private buffers: Map<string, string[]> = new Map()
  private timers: Map<string, NodeJS.Timeout> = new Map()
  private readonly batchInterval = 16 // ~60fps
  private window: BrowserWindow | null = null

  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  queueData(terminalId: string, data: string): void {
    if (!this.buffers.has(terminalId)) {
      this.buffers.set(terminalId, [])
    }

    this.buffers.get(terminalId)!.push(data)

    if (!this.timers.has(terminalId)) {
      const timer = setTimeout(() => {
        this.flush(terminalId)
      }, this.batchInterval)
      this.timers.set(terminalId, timer)
    }
  }

  private flush(terminalId: string): void {
    const buffer = this.buffers.get(terminalId)
    if (buffer && buffer.length > 0 && this.window && !this.window.isDestroyed()) {
      const combined = buffer.join('')
      this.buffers.delete(terminalId)
      this.timers.delete(terminalId)
      
      this.window.webContents.send('terminal:data', {
        terminalId,
        data: combined
      })
    }
  }

  clear(terminalId: string): void {
    const timer = this.timers.get(terminalId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(terminalId)
    }
    this.buffers.delete(terminalId)
  }

  clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
    this.buffers.clear()
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

// PTY factory - tries node-pty first, falls back to child_process
async function createPty(
  shell: string,
  args: string[],
  options: { cols: number; rows: number; cwd: string; env: Record<string, string> }
): Promise<IPty> {
  try {
    // Try to load node-pty
    const pty = await import('node-pty')
    
    return pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: options.env,
      encoding: 'utf8'
    })
  } catch (error) {
    console.warn('node-pty not available, falling back to child_process:', error)
    
    // Fallback to child_process
    const proc = spawn(shell, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    return new ChildProcessPty(proc)
  }
}

export class PtyManager {
  private static instance: PtyManager
  private sessions: Map<string, PtySession> = new Map()
  private batcher: DataBatcher
  private window: BrowserWindow | null = null
  private ptyAvailable: boolean | null = null

  private constructor() {
    this.batcher = new DataBatcher()
    this.checkPtyAvailability()
  }

  private async checkPtyAvailability(): Promise<void> {
    try {
      await import('node-pty')
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
    this.batcher.setWindow(window)
  }

  private getShell(shellType: ShellType): string {
    if (process.platform !== 'win32') {
      return process.env.SHELL || '/bin/bash'
    }

    switch (shellType) {
      case 'cmd':
        return process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe'
      case 'powershell':
      default:
        // Try PowerShell Core first, then Windows PowerShell
        const pwshCore = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
        const fs = require('fs')
        if (fs.existsSync(pwshCore)) {
          return pwshCore
        }
        return 'powershell.exe'
    }
  }

  async spawn(config: PtyConfig): Promise<{ terminalId: string; pid: number }> {
    const shell = this.getShell(config.shellType)
    const session = uuid()

    const ptyProcess = await createPty(shell, [], {
      cols: config.cols,
      rows: config.rows,
      cwd: config.cwd,
      env: { ...process.env, ...(config.env || {}) } as Record<string, string>
    })

    const ptySession: PtySession = {
      id: session,
      terminalId: config.terminalId,
      pty: ptyProcess,
      pid: ptyProcess.pid
    }

    // Setup data handling with batching
    ptyProcess.onData((data) => {
      this.batcher.queueData(config.terminalId, data)
    })

    // Handle exit
    ptyProcess.onExit(({ exitCode }) => {
      this.batcher.clear(config.terminalId)
      this.sessions.delete(config.terminalId)
      
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
      try {
        session.pty.kill()
      } catch (error) {
        console.warn(`Kill failed for terminal ${terminalId}:`, error)
      }
      this.batcher.clear(terminalId)
      this.sessions.delete(terminalId)
    }
  }

  killAll(): void {
    for (const terminalId of this.sessions.keys()) {
      this.kill(terminalId)
    }
    this.batcher.clearAll()
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
}
