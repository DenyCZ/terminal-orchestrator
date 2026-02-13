import type { ShellType } from './types';
export * from './types';

// IPC Channel names
export const IPC_CHANNELS = {
  // Project operations
  PROJECT_LIST: 'project:list',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  
  // Terminal operations
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_UPDATE: 'terminal:update',
  TERMINAL_DELETE: 'terminal:delete',
  TERMINAL_START: 'terminal:start',
  TERMINAL_STOP: 'terminal:stop',
  TERMINAL_RESTART: 'terminal:restart',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
  
  // Terminal events (main -> renderer)
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',
  TERMINAL_ERROR: 'terminal:error',
  
  // Config operations
  CONFIG_LOAD: 'config:load',
  CONFIG_SAVE: 'config:save',
  SETTINGS_UPDATE: 'settings:update',
  
  // Drag & drop
  FOLDER_DROP: 'folder:drop',
  
  // Git operations
  GIT_WORKTREE_CREATE: 'git:worktree-create',
  GIT_WORKTREE_LIST: 'git:worktree-list',
  GIT_BRANCHES_LIST: 'git:branches-list',

  // Shell operations
  SHELL_OPEN_FOLDER: 'shell:open-folder'
} as const;

// Terminal spawn configuration
export interface PtyConfig {
  terminalId: string;
  shellType: ShellType;
  cwd: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

// Terminal data batch
export interface TerminalDataBatch {
  terminalId: string;
  data: string;
}

// Terminal exit event
export interface TerminalExitEvent {
  terminalId: string;
  exitCode: number;
}

// Folder drop target
export type DropTarget = 'project' | 'terminal' | 'window';

export interface FolderDropEvent {
  path: string;
  target: DropTarget;
  targetId?: string;
}

// Git worktree creation options
export interface WorktreeCreateOptions {
  sourcePath: string;         // Path to the git repository
  branch: string;             // Branch name (existing or new)
  worktreePath?: string;      // Custom path for the worktree (optional)
  createBranch?: boolean;     // Whether to create a new branch
  basePath?: string;          // Base path for worktree (if worktreePath not specified)
}

// Git worktree creation result
export interface WorktreeCreateResult {
  success: boolean;
  worktreePath?: string;
  branch?: string;
  error?: string;
}

// Git branch info
export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
}

