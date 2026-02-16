/**
 * OpenCode Session Watcher
 * 
 * Monitors OpenCode sessions using:
 * 1. SQLite (primary - instant reads)
 * 2. SSE (real-time push when server running)
 * 3. CLI polling (fallback)
 */

import { app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import type { 
  OpenCodeSession, 
  OpenCodeSessionInfo, 
  OpenCodeWatcherStatus,
  OpenCodeSSEEvent 
} from './types'
import { tryOrNull, withErrorLog } from '../utils/error-handler'

// Event subscriber type
type SessionChangeListener = (sessions: Map<string, OpenCodeSessionInfo>) => void
type StatusChangeListener = (status: OpenCodeWatcherStatus) => void

export class OpenCodeSessionWatcher {
  private static instance: OpenCodeSessionWatcher
  
  // Session storage: directory -> session info
  private sessions: Map<string, OpenCodeSessionInfo> = new Map()
  
  // Subscribers
  private sessionListeners: Set<SessionChangeListener> = new Set()
  private statusListeners: Set<StatusChangeListener> = new Set()
  
  // State
  private sqliteAvailable: boolean = false
  private sseConnected: boolean = false
  private pollingActive: boolean = false
  private lastUpdate: number | null = null
  
  // Resources
  private pollInterval: NodeJS.Timeout | null = null
  private eventSource: EventSource | null = null
  private db: any = null // better-sqlite3 Database (dynamic import)
  
  // Paths
  private readonly dbPath: string
  private readonly openCodePort: number = 4096
  
  private constructor() {
    // OpenCode data directory
    const dataDir = path.join(os.homedir(), '.local', 'share', 'opencode')
    this.dbPath = path.join(dataDir, 'opencode.db')
  }
  
  static getInstance(): OpenCodeSessionWatcher {
    if (!OpenCodeSessionWatcher.instance) {
      OpenCodeSessionWatcher.instance = new OpenCodeSessionWatcher()
    }
    return OpenCodeSessionWatcher.instance
  }
  
  /**
   * Start watching OpenCode sessions
   */
  async start(): Promise<void> {
    console.log('[OpenCode] Starting session watcher...')
    
    // 1. Try SQLite (primary)
    await this.initSQLite()
    
    // 2. Initial load
    await this.refreshSessions()
    
    // 3. Try SSE (real-time)
    this.connectSSE()
    
    // 4. Start polling (fallback)
    this.startPolling()
    
    console.log('[OpenCode] Session watcher started', this.getStatus())
  }
  
  /**
   * Stop watching
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    
    if (this.db) {
      this.db.close()
      this.db = null
    }
    
    this.pollingActive = false
    this.sseConnected = false
    this.sqliteAvailable = false
    
    console.log('[OpenCode] Session watcher stopped')
  }
  
  /**
   * Get session by working directory
   */
  getSessionByDirectory(directory: string): OpenCodeSessionInfo | null {
    // Normalize path for comparison
    const normalized = this.normalizePath(directory)
    return this.sessions.get(normalized) || null
  }
  
  /**
   * Get all sessions
   */
  getAllSessions(): OpenCodeSessionInfo[] {
    return Array.from(this.sessions.values())
  }
  
  /**
   * Get watcher status
   */
  getStatus(): OpenCodeWatcherStatus {
    return {
      sqliteConnected: this.sqliteAvailable,
      sseConnected: this.sseConnected,
      pollingActive: this.pollingActive,
      sessionCount: this.sessions.size,
      lastUpdate: this.lastUpdate
    }
  }
  
  /**
   * Subscribe to session changes
   */
  onSessionChange(callback: SessionChangeListener): () => void {
    this.sessionListeners.add(callback)
    return () => this.sessionListeners.delete(callback)
  }
  
  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: StatusChangeListener): () => void {
    this.statusListeners.add(callback)
    return () => this.statusListeners.delete(callback)
  }
  
  // ============================================
  // Private Methods
  // ============================================
  
  /**
   * Initialize SQLite connection
   */
  private async initSQLite(): Promise<void> {
    try {
      // Check if database file exists
      if (!fs.existsSync(this.dbPath)) {
        console.log('[OpenCode] Database not found at:', this.dbPath)
        return
      }
      
      // Try to load better-sqlite3 (optional dependency)
      // Using eval to prevent Rollup from bundling this optional import
      let Database: any = null
      try {
        Database = eval('require')('better-sqlite3')
      } catch {
        // Module not available
      }
      
      if (!Database) {
        console.log('[OpenCode] better-sqlite3 not available, using CLI fallback')
        return
      }
      
      // Open database in read-only mode
      this.db = new Database(this.dbPath, { 
        readonly: true,
        fileMustExist: true 
      })
      
      // Test query
      if (this.db) {
        this.db.prepare('SELECT 1').get()
      }
      
      this.sqliteAvailable = true
      console.log('[OpenCode] SQLite connected')
      
    } catch (error) {
      console.warn('[OpenCode] SQLite init failed:', error)
      this.sqliteAvailable = false
    }
  }
  
  /**
   * Connect to OpenCode SSE endpoint
   */
  private connectSSE(): void {
    const sseUrl = `http://127.0.0.1:${this.openCodePort}/event`
    
    try {
      // Dynamic import for EventSource (may not be available in Node)
      const EventSourceModule = require('eventsource')
      const EventSource = EventSourceModule || EventSourceModule.default
      
      const es = new EventSource(sseUrl)
      this.eventSource = es
      
      es.onopen = () => {
        console.log('[OpenCode] SSE connected')
        this.sseConnected = true
        this.notifyStatusChange()
      }
      
      es.onmessage = (event: MessageEvent) => {
        const data = tryOrNull(() => JSON.parse(event.data) as OpenCodeSSEEvent)
        if (data?.type?.startsWith('session.')) {
          console.log('[OpenCode] SSE event:', data.type)
          this.refreshSessions()
        }
      }
      
      es.onerror = () => {
        if (this.sseConnected) {
          console.log('[OpenCode] SSE disconnected')
          this.sseConnected = false
          this.notifyStatusChange()
        }
      }
      
    } catch (error) {
      // SSE not available - server not running
      this.sseConnected = false
    }
  }
  
  /**
   * Start polling for changes
   */
  private startPolling(): void {
    // Poll every 10 seconds if SSE not connected
    this.pollInterval = setInterval(() => {
      if (!this.sseConnected) {
        this.refreshSessions()
      }
    }, 10000)
    
    this.pollingActive = true
  }
  
  /**
   * Refresh sessions from source
   */
  private async refreshSessions(): Promise<void> {
    let sessions: OpenCodeSessionInfo[] = []
    
    if (this.sqliteAvailable && this.db) {
      // SQLite (fast)
      sessions = this.loadFromSQLite()
    } else {
      // CLI fallback
      sessions = await this.loadFromCLI()
    }
    
    // Update cache
    const previousCount = this.sessions.size
    this.sessions.clear()
    
    for (const session of sessions) {
      const normalizedDir = this.normalizePath(session.directory)
      this.sessions.set(normalizedDir, session)
    }
    
    this.lastUpdate = Date.now()
    
    // Notify if changed
    if (this.sessions.size !== previousCount || sessions.length > 0) {
      this.notifySessionChange()
    }
  }
  
  /**
   * Load sessions from SQLite
   */
  private loadFromSQLite(): OpenCodeSessionInfo[] {
    if (!this.db) return []
    
    return withErrorLog(() => {
      const rows = this.db.prepare(`
        SELECT 
          id, 
          title, 
          directory, 
          time_updated 
        FROM session 
        ORDER BY time_updated DESC
        LIMIT 100
      `).all() as OpenCodeSession[]
      
      return rows.map(row => ({
        id: row.id,
        title: row.title,
        directory: row.directory,
        updatedAt: row.time_updated
      }))
    }, [], 'OpenCode SQLite query')
  }
  
  /**
   * Load sessions via CLI (fallback)
   */
  private async loadFromCLI(): Promise<OpenCodeSessionInfo[]> {
    return new Promise((resolve) => {
      try {
        const proc = spawn('opencode', ['session', 'list', '--format', 'json'], {
          shell: true,
          windowsHide: true
        })
        
        let output = ''
        
        proc.stdout?.on('data', (data) => {
          output += data.toString()
        })
        
        proc.on('close', (code) => {
          if (code === 0 && output.trim()) {
            const sessions = tryOrNull(() => JSON.parse(output))
            resolve(sessions?.map((s: any) => ({
              id: s.id,
              title: s.title,
              directory: s.directory,
              updatedAt: s.updated
            })) || [])
          } else {
            resolve([])
          }
        })
        
        proc.on('error', () => resolve([]))
        
        // Timeout after 5 seconds
        setTimeout(() => {
          proc.kill()
          resolve([])
        }, 5000)
        
      } catch (error) {
        resolve([])
      }
    })
  }
  
  /**
   * Normalize path for comparison
   */
  private normalizePath(p: string): string {
    return withErrorLog(() => path.resolve(p).toLowerCase(), p.toLowerCase(), 'Path resolve')
  }
  
  /**
   * Notify session listeners
   */
  private notifySessionChange(): void {
    const sessions = new Map(this.sessions)
    this.sessionListeners.forEach(cb => cb(sessions))
  }
  
  /**
   * Notify status listeners
   */
  private notifyStatusChange(): void {
    const status = this.getStatus()
    this.statusListeners.forEach(cb => cb(status))
  }
}

// Export singleton getter
export const getOpenCodeWatcher = () => OpenCodeSessionWatcher.getInstance()
