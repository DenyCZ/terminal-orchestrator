import type { ShellType } from './types';
export * from './types';

// IPC Channel names
export const IPC_CHANNELS = {
  // Group operations
  GROUP_LIST: 'group:list',
  GROUP_CREATE: 'group:create',
  GROUP_UPDATE: 'group:update',
  GROUP_DELETE: 'group:delete',
  GROUP_REORDER: 'group:reorder',
  
  // Project operations
  PROJECT_LIST: 'project:list',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_REORDER: 'project:reorder',
  
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
  SHELL_OPEN_FOLDER: 'shell:open-folder',
  SHELL_LIST: 'shell:list',
  SHELL_OPEN_VSCODE: 'shell:open-vscode',

  // File system operations
  FS_READ_DIR: 'fs:read-dir',
   
  // Web UI operations
  WEBUI_START: 'webui:start',
  WEBUI_STOP: 'webui:stop',
  WEBUI_STATUS: 'webui:status',
  WEBUI_REGENERATE_PIN: 'webui:regenerate-pin',
  
  // OpenCode session operations
  OPENCODE_SESSIONS: 'opencode:sessions',
  OPENCODE_SESSION_BY_DIR: 'opencode:session-by-dir',
  OPENCODE_STATUS: 'opencode:status',
  OPENCODE_EVENT: 'opencode:event',  // Main -> renderer event
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

// Web UI status
export interface WebUIStatus {
  running: boolean;
  port: number;
  pin: string;
  url?: string;
  addresses: string[];
  qrCode?: string;
}

// File system entry
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  extension?: string;
  size?: number;
  modifiedAt?: number;
}

// Directory read options
export interface ReadDirOptions {
  path: string;
  recursive?: boolean;
  maxDepth?: number;
}

// OpenCode session info (simplified for display)
export interface OpenCodeSessionInfo {
  id: string;
  title: string;
  directory: string;
  updatedAt: number;
}

// OpenCode watcher status
export interface OpenCodeWatcherStatus {
  sqliteConnected: boolean;
  sseConnected: boolean;
  pollingActive: boolean;
  sessionCount: number;
  lastUpdate: number | null;
}

// OpenCode session event (main -> renderer)
export interface OpenCodeSessionEvent {
  type: 'sessions-updated' | 'status-changed';
  sessions?: OpenCodeSessionInfo[];
  status?: OpenCodeWatcherStatus;
}

