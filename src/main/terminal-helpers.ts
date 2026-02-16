import fs from 'fs'
import path from 'path'
import os from 'os'
import type { ConfigStore } from './store'
import type { PtyManager } from './pty'
import type { Terminal } from '@shared/types'

export interface TerminalStartResult {
  success: boolean
  pid?: number
  error?: string
}

/**
 * Shared terminal start logic used by both IPC handlers and web routes.
 * Handles killing existing PTY, spawning new PTY, and running startup commands.
 */
function ensureValidDirectory(dirPath: string): string {
  if (!dirPath || dirPath.trim() === '') {
    return os.homedir()
  }

  const resolved = path.resolve(dirPath)
  
  if (!fs.existsSync(resolved)) {
    console.warn(`Directory does not exist: "${dirPath}", using home directory`)
    return os.homedir()
  }

  const stats = fs.statSync(resolved)
  if (!stats.isDirectory()) {
    const parent = path.dirname(resolved)
    console.warn(`Path is not a directory: "${dirPath}", using parent: "${parent}"`)
    return ensureValidDirectory(parent)
  }

  return resolved
}

export async function startTerminalProcess(
  store: ConfigStore,
  ptyManager: PtyManager,
  projectId: string,
  terminalId: string,
  onOpenCodeDetected?: (terminal: Terminal) => void
): Promise<TerminalStartResult> {
  const terminal = store.getTerminal(projectId, terminalId)
  if (!terminal) {
    return { success: false, error: 'Terminal not found' }
  }

  // Validate working directory before spawning
  const validCwd = ensureValidDirectory(terminal.workingDirectory)
  if (validCwd !== terminal.workingDirectory) {
    console.log(`Working directory adjusted: "${terminal.workingDirectory}" -> "${validCwd}"`)
  }

  if (ptyManager.isRunning(terminalId)) {
    ptyManager.kill(terminalId)
  }

  store.updateTerminal(projectId, terminalId, { status: 'running' })

  try {
    const result = await ptyManager.spawn({
      terminalId,
      shellType: terminal.shellType,
      cwd: validCwd,
      cols: 80,
      rows: 24
    })

    if (terminal.startupCommand) {
      setTimeout(() => {
        ptyManager.write(terminalId, terminal.startupCommand! + '\r')
      }, 500)

      if (terminal.startupCommand.toLowerCase().includes('opencode')) {
        onOpenCodeDetected?.(terminal)
      }
    }

    return { success: true, pid: result.pid }
  } catch (error) {
    store.updateTerminal(projectId, terminalId, { status: 'error' })
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

// Re-export from shared utils for convenience
export { normalizeDirectory } from '@shared/utils'
