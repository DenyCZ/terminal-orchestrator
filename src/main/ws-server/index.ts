import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { ConfigStore } from '../store';
import type { PtyManager } from '../pty';
import type { WebSocketMessage, TerminalSession } from './types';
import type { TerminalStatus } from '@shared/types';
// Memory protection constants
const MAX_WS_SESSIONS = 100
const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Safely extract remote address from WebSocket
 * The _socket property is internal to ws library but stable
 */
function getRemoteAddress(ws: WebSocket): string {
  // Access internal socket - this is stable in ws library
  const socket = (ws as { _socket?: { remoteAddress?: string } })._socket
  return socket?.remoteAddress || 'unknown'
}

export class WebSocketTerminalServer {
  private wss?: WebSocketServer;
  private store: ConfigStore;
  private ptyManager: PtyManager;
  private sessions: Map<string, TerminalSession> = new Map();
  private sessionLastActive: Map<string, number> = new Map(); // Track idle sessions
  private validTokens: Set<string>;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(store: ConfigStore, ptyManager: PtyManager, validTokens: Set<string>) {
    this.store = store;
    this.ptyManager = ptyManager;
    this.validTokens = validTokens;
  }
  
  attachToServer(server: Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/terminal'
    });
    
    this.wss.on('connection', (ws, req) => {
      // Verify token from query string
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token || !this.validTokens.has(token)) {
        ws.close(1008, 'Invalid authentication token');
        return;
      }
      
      // Check session limit
      if (this.sessions.size >= MAX_WS_SESSIONS) {
        console.warn(`WebSocket connection rejected: max sessions (${MAX_WS_SESSIONS}) reached`);
        ws.close(1013, 'Server busy - max connections reached');
        return;
      }

      console.log(`WebSocket client connected (${this.sessions.size + 1}/${MAX_WS_SESSIONS})`);
      
      ws.on('message', (data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });
      
      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.cleanupSession(ws);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
    
    console.log('WebSocket server attached to /ws/terminal');
  }
  
  private handleMessage(ws: WebSocket, message: WebSocketMessage): void {
    // Track activity for idle timeout
    const sessionKey = this.findSessionKey(ws);
    if (sessionKey) {
      this.sessionLastActive.set(sessionKey, Date.now());
    }

    switch (message.type) {
      case 'subscribe':
        if (message.terminalId) {
          this.subscribeToTerminal(ws, message.terminalId);
        }
        break;
        
      case 'unsubscribe':
        if (message.terminalId) {
          this.unsubscribeFromTerminal(ws, message.terminalId);
        }
        break;
        
      case 'input':
        if (message.terminalId && message.data) {
          this.ptyManager.write(message.terminalId, message.data);
        }
        break;
        
      case 'resize':
        if (message.terminalId && message.cols && message.rows) {
          this.ptyManager.resize(message.terminalId, message.cols, message.rows);
        }
        break;
        
      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }
  
  private subscribeToTerminal(ws: WebSocket, terminalId: string): void {
    // Find terminal to get project ID
    const projects = this.store.getProjects();
    let projectId: string | undefined;
    
    for (const project of projects) {
      const terminal = project.terminals.find(t => t.id === terminalId);
      if (terminal) {
        projectId = project.id;
        break;
      }
    }
    
    if (!projectId) {
      this.sendError(ws, `Terminal ${terminalId} not found`);
      return;
    }
    
    // Create session key
    const sessionKey = `${getRemoteAddress(ws)}_${terminalId}`;
    
    // Create session
    const session: TerminalSession = {
      terminalId,
      ws,
      projectId,
      unsubscribeCallbacks: []
    };
    
    this.sessions.set(sessionKey, session);
    this.sessionLastActive.set(sessionKey, Date.now());
    
    console.log(`Client subscribed to terminal ${terminalId}`);
    
    // Send current status
    const terminal = this.store.getTerminal(projectId, terminalId);
    if (terminal) {
      this.sendMessage(ws, {
        type: 'status',
        terminalId,
        status: terminal.status
      });
    }
  }
  
  private unsubscribeFromTerminal(ws: WebSocket, terminalId: string): void {
    const sessionKey = `${getRemoteAddress(ws)}_${terminalId}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.unsubscribeCallbacks.forEach(cb => cb());
      this.sessions.delete(sessionKey);
      this.sessionLastActive.delete(sessionKey);
      console.log(`Client unsubscribed from terminal ${terminalId}`);
    }
  }
  
  private cleanupSession(ws: WebSocket): void {
    const keysToDelete: string[] = [];
    
    for (const [key, session] of this.sessions.entries()) {
      if (session.ws === ws) {
        session.unsubscribeCallbacks.forEach(cb => cb());
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      this.sessions.delete(key);
      this.sessionLastActive.delete(key);
    });
  }

  /**
   * Find session key by WebSocket reference
   */
  private findSessionKey(ws: WebSocket): string | undefined {
    for (const [key, session] of this.sessions.entries()) {
      if (session.ws === ws) {
        return key;
      }
    }
    return undefined;
  }

  private sendMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
  
  private sendError(ws: WebSocket, message: string): void {
    this.sendMessage(ws, {
      type: 'error',
      message
    });
  }
  
  // Called by PtyManager when terminal data is available
  broadcastToTerminal(terminalId: string, data: string): void {
    for (const session of this.sessions.values()) {
      if (session.terminalId === terminalId) {
        this.sendMessage(session.ws, {
          type: 'output',
          terminalId,
          data
        });
      }
    }
  }
  
  // Called when terminal status changes
  broadcastStatus(terminalId: string, status: TerminalStatus): void {
    for (const session of this.sessions.values()) {
      if (session.terminalId === terminalId) {
        this.sendMessage(session.ws, {
          type: 'status',
          terminalId,
          status
        });
      }
    }
  }
  
  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    if (this.wss) {
      this.wss.close();
    }
    this.sessions.clear();
    this.sessionLastActive.clear();
  }

  /**
   * Start periodic cleanup of idle sessions
   */
  startIdleCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [key, lastActive] of this.sessionLastActive.entries()) {
        if (now - lastActive > SESSION_TIMEOUT_MS) {
          expiredKeys.push(key);
        }
      }

      for (const key of expiredKeys) {
        const session = this.sessions.get(key);
        if (session) {
          console.log(`Closing idle WebSocket session: ${key}`);
          session.unsubscribeCallbacks.forEach(cb => cb());
          session.ws.close(1001, 'Session timed out');
          this.sessions.delete(key);
        }
        this.sessionLastActive.delete(key);
      }

      if (expiredKeys.length > 0) {
        console.log(`Cleaned up ${expiredKeys.length} idle WebSocket sessions`);
      }
    }, 60000); // Check every minute
  }

  /**
   * Get current session count for monitoring
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}
