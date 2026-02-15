/**
 * OpenCode Session Types
 * 
 * These types match the OpenCode SQLite schema and API responses
 * Repository: https://github.com/anomalyco/opencode
 */

// OpenCode session as stored in SQLite
export interface OpenCodeSession {
  id: string                    // e.g., "ses_abc123..."
  project_id: string            // OpenCode project ID (git hash)
  parent_id?: string            // Parent session ID (for sub-sessions)
  slug: string                  // Human-readable slug e.g., "gentle-nebula"
  directory: string             // Working directory path
  title: string                 // Session title (user's first message)
  version: string               // OpenCode version
  share_url?: string            // Share URL if published
  summary_additions?: number    // Lines added
  summary_deletions?: number    // Lines deleted
  summary_files?: number        // Files changed
  time_created: number          // Unix timestamp (ms)
  time_updated: number          // Unix timestamp (ms)
  time_compacting?: number
  time_archived?: number
}

// Simplified session info for sidebar display
export interface OpenCodeSessionInfo {
  id: string
  title: string
  directory: string
  updatedAt: number
}

// SSE Event types from OpenCode
export type OpenCodeEventType = 
  | 'server.connected'
  | 'server.heartbeat'
  | 'session.created'
  | 'session.updated'
  | 'session.deleted'
  | 'session.diff'
  | 'session.error'

export interface OpenCodeSSEEvent {
  type: OpenCodeEventType
  properties: {
    info?: OpenCodeSessionInfo
    sessionID?: string
    error?: string
  }
}

// Watcher status for debugging
export interface OpenCodeWatcherStatus {
  sqliteConnected: boolean
  sseConnected: boolean
  pollingActive: boolean
  sessionCount: number
  lastUpdate: number | null
}
