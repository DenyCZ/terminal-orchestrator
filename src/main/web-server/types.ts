import type { Project, Terminal, AppConfig, AppSettings } from '@shared/types';

export interface ServerConfig {
  port: number;
  pin: string;
  allowRemote: boolean;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  addresses: string[];
  url: string;
  qrCode?: string;
}

// API Request/Response types
export interface CreateProjectRequest {
  name: string;
  rootDirectory?: string;
}

export interface CreateTerminalRequest {
  name: string;
  shellType: 'cmd' | 'powershell';
  workingDirectory: string;
  startupCommand?: string;
}

export interface ResizeTerminalRequest {
  cols: number;
  rows: number;
}

export interface UpdateSettingsRequest {
  settings: Partial<AppSettings>;
}

// Auth types
export interface AuthRequest {
  pin: string;
}

export interface AuthResponse {
  token: string;
  expiresAt: number;
}

// Error response
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
