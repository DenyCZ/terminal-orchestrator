import { execSync } from 'child_process'
import { existsSync } from 'fs'
import * as path from 'path'
import type { DetectedShell, ShellType } from '@shared/types'

/**
 * Detects all available shells on the system.
 * On Windows, detects CMD, PowerShell, Git Bash, WSL, Cygwin, MSYS2.
 * On other platforms, returns the default shell from $SHELL.
 */
export function detectShells(): DetectedShell[] {
  const shells: DetectedShell[] = []

  if (process.platform === 'win32') {
    shells.push({
      id: 'cmd',
      name: 'Command Prompt',
      type: 'cmd',
      path: process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe',
      available: true
    })

    shells.push({
      id: 'powershell',
      name: 'Windows PowerShell',
      type: 'powershell',
      path: 'powershell.exe',
      available: true
    })

    const pwshPaths = [
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe'
    ]
    for (const pwshPath of pwshPaths) {
      if (existsSync(pwshPath)) {
        shells.push({
          id: 'pwsh',
          name: 'PowerShell 7',
          type: 'pwsh',
          path: pwshPath,
          available: true
        })
        break
      }
    }

    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Git', 'bin', 'bash.exe')
    ]
    for (const bashPath of gitBashPaths) {
      if (existsSync(bashPath)) {
        shells.push({
          id: 'git-bash',
          name: 'Git Bash',
          type: 'bash',
          path: bashPath,
          args: ['--login', '-i'],
          available: true
        })
        break
      }
    }

    try {
      // WSL outputs in UTF-16 LE on some systems, so we need to handle encoding
      const buffer = execSync('wsl --list --quiet', { 
        encoding: 'buffer',
        timeout: 5000
      })
      
      // Try to decode - UTF-16 LE has null bytes between characters
      let output: string
      if (buffer.length >= 2 && buffer[1] === 0) {
        // Looks like UTF-16 LE (null byte in second position)
        output = buffer.toString('utf16le')
      } else {
        // UTF-8 or ASCII
        output = buffer.toString('utf8')
      }
      
      // Clean up the output: remove BOM, null chars, and other control characters
      const distros = output
        .replace(/^\uFEFF/, '')           // Remove BOM
        .replace(/\0/g, '')               // Remove null characters
        .replace(/[\r\n]+/g, '\n')        // Normalize line endings
        .split('\n')
        .map(d => d.trim())
        .filter(d => d.length > 0 && !d.includes('Windows Subsystem for Linux') && !d.includes('WSL'))

      for (const distro of distros) {
        // Clean distro name - remove any remaining control characters
        const cleanDistro = distro.replace(/[\x00-\x1F\x7F]/g, '')
        if (cleanDistro) {
          shells.push({
            id: `wsl-${cleanDistro.toLowerCase().replace(/\s+/g, '-')}`,
            name: `WSL: ${cleanDistro}`,
            type: 'wsl',
            path: 'wsl.exe',
            args: ['-d', cleanDistro],
            available: true
          })
        }
      }
    } catch {
      // WSL not available
    }

    const cygwinPaths = [
      'C:\\cygwin64\\bin\\bash.exe',
      'C:\\cygwin\\bin\\bash.exe'
    ]
    for (const cygwinPath of cygwinPaths) {
      if (existsSync(cygwinPath)) {
        shells.push({
          id: 'cygwin',
          name: 'Cygwin',
          type: 'bash',
          path: cygwinPath,
          args: ['--login', '-i'],
          available: true
        })
        break
      }
    }

    const msys2Path = 'C:\\msys64\\usr\\bin\\bash.exe'
    if (existsSync(msys2Path)) {
      shells.push({
        id: 'msys2',
        name: 'MSYS2',
        type: 'bash',
        path: msys2Path,
        args: ['--login', '-i'],
        available: true
      })
    }
  } else {
    // Non-Windows: Just use the default shell
    const defaultShell = process.env.SHELL || '/bin/bash'
    const shellName = path.basename(defaultShell)
    
    shells.push({
      id: shellName,
      name: shellName.charAt(0).toUpperCase() + shellName.slice(1),
      type: 'bash',
      path: defaultShell,
      available: true
    })
  }

  return shells
}

/**
 * Get the default shell for the system.
 * Returns the first available shell, preferring PowerShell on Windows.
 */
export function getDefaultShell(): DetectedShell {
  const shells = detectShells()
  
  // Prefer PowerShell on Windows
  if (process.platform === 'win32') {
    const pwsh = shells.find(s => s.id === 'pwsh')
    if (pwsh) return pwsh
    
    const powershell = shells.find(s => s.id === 'powershell')
    if (powershell) return powershell
  }
  
  // Fallback to first available shell
  return shells[0] || {
    id: 'default',
    name: 'Default Shell',
    type: 'bash',
    path: process.env.SHELL || '/bin/bash',
    available: true
  }
}

/**
 * Map a shell ID to the appropriate ShellType for storage.
 * This ensures backward compatibility with existing terminal configurations.
 */
export function mapIdToShellType(id: string): ShellType {
  // Map common IDs to the base ShellType
  switch (id) {
    case 'cmd':
      return 'cmd'
    case 'powershell':
    case 'pwsh':
      return 'powershell'
    case 'git-bash':
    case 'cygwin':
    case 'msys2':
      return 'git-bash' as ShellType
    default:
      if (id.startsWith('wsl-')) {
        return 'wsl' as ShellType
      }
      // For custom/unknown shells, default to powershell
      return 'powershell'
  }
}

/**
 * Get shell info by ID.
 */
export function getShellById(id: string): DetectedShell | undefined {
  const shells = detectShells()
  return shells.find(s => s.id === id)
}
