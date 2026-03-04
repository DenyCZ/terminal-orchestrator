import type { AppSettings } from '@shared/types';

export interface ServerConfig {
  port: number;
  pin: string;
  allowRemote: boolean;
}

export interface TunnelInfo {
  running: boolean;
  url?: string;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  addresses: string[];
  url: string;
  qrCode?: string;
  tunnel?: TunnelInfo;
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
