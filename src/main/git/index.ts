import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'

const execAsync = promisify(exec)

export interface WorktreeCreateOptions {
  sourcePath: string
  branch: string
  worktreePath?: string
  createBranch?: boolean
  basePath?: string
}

export interface WorktreeCreateResult {
  success: boolean
  worktreePath?: string
  branch?: string
  error?: string
}

export interface GitBranch {
  name: string
  isCurrent: boolean
  isRemote: boolean
  upstream?: string
}

/**
 * Check if a directory is a git repository
 */
export function isGitRepository(dirPath: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd: dirPath, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * Get the root directory of a git repository
 */
export function getGitRoot(dirPath: string): string | null {
  try {
    const root = execSync('git rev-parse --show-toplevel', { 
      cwd: dirPath, 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
    return root || null
  } catch {
    return null
  }
}

/**
 * List all branches in the repository
 */
export function listBranches(repoPath: string): GitBranch[] {
  try {
    const output = execSync('git branch -a --format="%(refname:short)|%(HEAD)|%(upstream:short)"', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()

    if (!output) return []

    return output.split('\n').map(line => {
      const [name, head, upstream] = line.split('|')
      return {
        name: name.trim(),
        isCurrent: head === '*',
        isRemote: name.startsWith('origin/') || name.includes('/'),
        upstream: upstream?.trim() || undefined
      }
    })
  } catch {
    return []
  }
}

/**
 * List existing worktrees
 */
export function listWorktrees(repoPath: string): { path: string; branch: string; commit: string }[] {
  try {
    const output = execSync('git worktree list --porcelain', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()

    if (!output) return []

    const worktrees: { path: string; branch: string; commit: string }[] = []
    let current: Partial<{ path: string; branch: string; commit: string }> = {}

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) {
          worktrees.push(current as { path: string; branch: string; commit: string })
        }
        current = { path: line.substring(9) }
      } else if (line.startsWith('HEAD ')) {
        current.commit = line.substring(5)
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(7)
      }
    }

    if (current.path) {
      worktrees.push(current as { path: string; branch: string; commit: string })
    }

    return worktrees
  } catch {
    return []
  }
}

/**
 * Create a new git worktree
 */
export async function createWorktree(options: WorktreeCreateOptions): Promise<WorktreeCreateResult> {
  const { sourcePath, branch, worktreePath, createBranch = false, basePath } = options

  try {
    // Verify source is a git repo
    if (!isGitRepository(sourcePath)) {
      return {
        success: false,
        error: 'Source path is not a git repository'
      }
    }

    // Get git root
    const gitRoot = getGitRoot(sourcePath)
    if (!gitRoot) {
      return {
        success: false,
        error: 'Could not determine git root directory'
      }
    }

    // Determine worktree path
    let finalWorktreePath = worktreePath
    if (!finalWorktreePath) {
      const baseDir = basePath || path.dirname(gitRoot)
      const branchDirName = branch.replace(/\//g, '-')
      finalWorktreePath = path.join(baseDir, branchDirName)
    }

    // Check if worktree path already exists
    if (fs.existsSync(finalWorktreePath)) {
      return {
        success: false,
        error: `Path already exists: ${finalWorktreePath}`
      }
    }

    // Build the git worktree add command
    const createBranchFlag = createBranch ? '-b' : ''
    const command = createBranch
      ? `git worktree add -b "${branch}" "${finalWorktreePath}"`
      : `git worktree add "${finalWorktreePath}" "${branch}"`

    // Execute the command
    await execAsync(command, { cwd: gitRoot })

    return {
      success: true,
      worktreePath: finalWorktreePath,
      branch
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * Generate a default worktree path based on branch name
 */
export function generateWorktreePath(gitRoot: string, branch: string): string {
  const baseDir = path.dirname(gitRoot)
  const repoName = path.basename(gitRoot)
  const branchDirName = branch.replace(/\//g, '-')
  return path.join(baseDir, `${repoName}-${branchDirName}`)
}
