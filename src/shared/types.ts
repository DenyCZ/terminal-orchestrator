export type ShellType = 'cmd' | 'powershell';

export type TerminalStatus = 'idle' | 'running' | 'stopped' | 'completed' | 'error';

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

export interface Project {
  id: string;
  name: string;
  rootDirectory?: string;
  terminals: Terminal[];
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  defaultShell: ShellType;
  theme: 'dark' | 'light';
}

export interface AppConfig {
  projects: Project[];
  settings: AppSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultShell: 'powershell',
  theme: 'dark'
};

export const DEFAULT_CONFIG: AppConfig = {
  projects: [],
  settings: DEFAULT_SETTINGS
};
