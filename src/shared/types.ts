export type ShellType = 'cmd' | 'powershell';

export type TerminalStatus = 'idle' | 'running' | 'stopped' | 'completed' | 'error';

// Keyboard shortcut types
export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export interface ShortcutDefinition {
  id: string;
  name: string;
  description: string;
  group: string;
  defaultBinding: KeyBinding;
}

export type ShortcutId = 
  | 'openCommandPalette'
  | 'closeCommandPalette'
  | 'nextTerminal'
  | 'prevTerminal'
  | 'runTerminal'
  | 'restartTerminal'
  | 'killTerminal'
  | 'newTerminal'
  | 'newProject'
  | 'newWorktree'
  | 'switchProject'
  | 'switchTerminal'
  | 'clearTerminal'
  | 'focusTerminal'
  | 'openHelp';

export type ShortcutConfig = Record<ShortcutId, KeyBinding>;

export interface Terminal {
  id: string;
  projectId: string;
  name: string;
  shellType: ShellType;
  workingDirectory: string;
  startupCommand?: string;
  status: TerminalStatus;
  pid?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectGroup {
  id: string;
  name: string;
  color?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  rootDirectory?: string;
  groupId?: string;
  order: number;
  terminals: Terminal[];
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  defaultShell: ShellType;
  theme: 'dark' | 'light';
  keyboardShortcuts?: ShortcutConfig;
}

// All available shortcuts with their definitions
export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: 'openCommandPalette',
    name: 'Open Command Palette',
    description: 'Toggle the command palette',
    group: 'Command Palette',
    defaultBinding: { key: ' ', ctrl: true }
  },
  {
    id: 'closeCommandPalette',
    name: 'Close Command Palette',
    description: 'Close any open modal or palette',
    group: 'Command Palette',
    defaultBinding: { key: 'Escape' }
  },
  {
    id: 'nextTerminal',
    name: 'Next Terminal',
    description: 'Switch to the next terminal tab',
    group: 'Terminal Navigation',
    defaultBinding: { key: 'Tab', ctrl: true }
  },
  {
    id: 'prevTerminal',
    name: 'Previous Terminal',
    description: 'Switch to the previous terminal tab',
    group: 'Terminal Navigation',
    defaultBinding: { key: 'Tab', ctrl: true, shift: true }
  },
  {
    id: 'switchProject',
    name: 'Switch Project',
    description: 'Open command palette focused on projects',
    group: 'Terminal Navigation',
    defaultBinding: { key: 'p', ctrl: true }
  },
  {
    id: 'switchTerminal',
    name: 'Switch Terminal',
    description: 'Open command palette focused on terminals',
    group: 'Terminal Navigation',
    defaultBinding: { key: 't', ctrl: true }
  },
  {
    id: 'focusTerminal',
    name: 'Focus Terminal',
    description: 'Quick jump to terminal input',
    group: 'Terminal Navigation',
    defaultBinding: { key: 'f' }
  },
  {
    id: 'runTerminal',
    name: 'Run Terminal',
    description: 'Start the current terminal',
    group: 'Terminal Actions',
    defaultBinding: { key: 'r', ctrl: true }
  },
  {
    id: 'restartTerminal',
    name: 'Restart Terminal',
    description: 'Restart the current terminal',
    group: 'Terminal Actions',
    defaultBinding: { key: 'R', ctrl: true, shift: true }
  },
  {
    id: 'killTerminal',
    name: 'Kill Terminal',
    description: 'Stop or delete the current terminal',
    group: 'Terminal Actions',
    defaultBinding: { key: 'w', ctrl: true }
  },
  {
    id: 'clearTerminal',
    name: 'Clear Terminal',
    description: 'Clear the terminal screen',
    group: 'Terminal Actions',
    defaultBinding: { key: 'l', ctrl: true }
  },
  {
    id: 'newTerminal',
    name: 'New Terminal',
    description: 'Create a new terminal',
    group: 'Create New',
    defaultBinding: { key: 'n', ctrl: true }
  },
  {
    id: 'newProject',
    name: 'New Project',
    description: 'Create a new project',
    group: 'Create New',
    defaultBinding: { key: 'N', ctrl: true, shift: true }
  },
  {
    id: 'newWorktree',
    name: 'New Worktree',
    description: 'Create a new git worktree',
    group: 'Create New',
    defaultBinding: { key: 'W', ctrl: true, shift: true }
  },
  {
    id: 'openHelp',
    name: 'Show Help',
    description: 'Show keyboard shortcuts help',
    group: 'General',
    defaultBinding: { key: '?' }
  }
];

// Default shortcuts configuration
export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  openCommandPalette: { key: ' ', ctrl: true },
  closeCommandPalette: { key: 'Escape' },
  nextTerminal: { key: 'Tab', ctrl: true },
  prevTerminal: { key: 'Tab', ctrl: true, shift: true },
  runTerminal: { key: 'r', ctrl: true },
  restartTerminal: { key: 'R', ctrl: true, shift: true },
  killTerminal: { key: 'w', ctrl: true },
  newTerminal: { key: 'n', ctrl: true },
  newProject: { key: 'N', ctrl: true, shift: true },
  newWorktree: { key: 'W', ctrl: true, shift: true },
  switchProject: { key: 'p', ctrl: true },
  switchTerminal: { key: 't', ctrl: true },
  clearTerminal: { key: 'l', ctrl: true },
  focusTerminal: { key: 'f' },
  openHelp: { key: '?' }
};

export interface AppConfig {
  groups: ProjectGroup[];
  projects: Project[];
  settings: AppSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultShell: 'powershell',
  theme: 'dark',
  keyboardShortcuts: DEFAULT_SHORTCUTS
};

export const DEFAULT_CONFIG: AppConfig = {
  groups: [],
  projects: [],
  settings: DEFAULT_SETTINGS
};
