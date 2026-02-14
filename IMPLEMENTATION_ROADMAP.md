# Step-by-Step Implementation Roadmap

## Pre-Implementation Checklist
- [ ] Review the codebase and understand existing patterns
- [ ] Set up a development branch: `git checkout -b feature/mobile-web-ui`
- [ ] Ensure all tests pass before starting

---

## Phase 1: Project Setup & Dependencies (30-60 minutes)

### Step 1.1: Install Dependencies
```bash
# Install production dependencies
npm install express@^4.18.2 ws@^8.16.0 cors@^2.8.5 qrcode@^1.5.3 ip@^2.0.1

# Install development dependencies
npm install -D @types/express@^4.17.21 @types/ws@^8.5.10 @types/qrcode@^1.5.5 @types/ip@^2.0.3
```

**Verification:** Check `package.json` has all new dependencies listed.

### Step 1.2: Update TypeScript Configuration
Update `tsconfig.node.json` to include new types:
```json
{
  "compilerOptions": {
    "types": ["node", "express", "ws", "qrcode", "ip"]
  }
}
```

**Verification:** Run `npm run typecheck` - should pass with no errors.

### Step 1.3: Update Shared Types
Edit `src/shared/types.ts` to add WebUI settings:

```typescript
export interface WebUISettings {
  enabled: boolean;
  port: number;
  pin: string;
  allowRemote: boolean;
  showQRCode: boolean;
}

export interface AppSettings {
  defaultShell: ShellType;
  theme: 'dark' | 'light';
  keyboardShortcuts?: ShortcutConfig;
  webUI?: WebUISettings;  // <-- ADD THIS
}
```

Update `DEFAULT_SETTINGS`:
```typescript
export const DEFAULT_SETTINGS: AppSettings = {
  defaultShell: 'powershell',
  theme: 'dark',
  keyboardShortcuts: DEFAULT_SHORTCUTS,
  webUI: {  // <-- ADD THIS
    enabled: false,
    port: 3000,
    pin: '', // Will be auto-generated on first enable
    allowRemote: false,
    showQRCode: true
  }
};
```

**Verification:** TypeScript compilation passes.

---

## Phase 2: Web Server Core (2-3 hours)

### Step 2.1: Create Web Server Directory Structure
```bash
mkdir -p src/main/web-server
mkdir -p src/main/ws-server
```

### Step 2.2: Create Web Server Types
Create `src/main/web-server/types.ts`:

```typescript
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
```

### Step 2.3: Create Authentication Middleware
Create `src/main/web-server/middleware.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express';
import type { ServerConfig } from './types';

// Simple JWT-like token (in production, use proper JWT library)
const validTokens = new Set<string>();

export function createAuthMiddleware(config: ServerConfig) {
  return {
    // Validate PIN and issue token
    authenticate: (req: Request, res: Response) => {
      const { pin } = req.body;
      
      if (pin !== config.pin) {
        return res.status(401).json({ 
          error: 'Invalid PIN',
          message: 'The provided PIN is incorrect',
          statusCode: 401 
        });
      }
      
      // Generate simple token (use uuid in production)
      const token = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      validTokens.add(token);
      
      res.json({
        token,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      });
    },
    
    // Verify token on protected routes
    requireAuth: (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');
      
      if (!token || !validTokens.has(token)) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Valid authentication token required',
          statusCode: 401
        });
      }
      
      next();
    },
    
    // Clear all tokens (on server restart)
    clearTokens: () => {
      validTokens.clear();
    }
  };
}

// CORS middleware
export function corsMiddleware(allowRemote: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    
    if (allowRemote || !origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    }
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    
    next();
  };
}

// Rate limiting
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function rateLimitMiddleware(maxRequests: number = 100, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || 'unknown';
    const now = Date.now();
    
    const clientData = requestCounts.get(clientIp);
    
    if (!clientData || now > clientData.resetTime) {
      requestCounts.set(clientIp, { count: 1, resetTime: now + windowMs });
    } else {
      clientData.count++;
      if (clientData.count > maxRequests) {
        return res.status(429).json({
          error: 'Rate Limited',
          message: 'Too many requests, please try again later',
          statusCode: 429
        });
      }
    }
    
    next();
  };
}
```

### Step 2.4: Create API Routes
Create `src/main/web-server/routes.ts`:

```typescript
import { Router } from 'express';
import type { ConfigStore } from '../store';
import type { PtyManager } from '../pty';
import type { ServerConfig } from './types';
import * as ip from 'ip';
import * as qrcode from 'qrcode';

export function createRoutes(
  config: ServerConfig,
  store: ConfigStore,
  ptyManager: PtyManager
): Router {
  const router = Router();
  
  // =====================
  // Status & Info
  // =====================
  
  router.get('/status', async (req, res) => {
    const addresses: string[] = [];
    
    // Get local IP addresses
    try {
      const localIp = ip.address();
      if (localIp) addresses.push(localIp);
    } catch (e) {
      console.warn('Could not determine local IP');
    }
    
    const url = addresses.length > 0 
      ? `http://${addresses[0]}:${config.port}`
      : `http://localhost:${config.port}`;
    
    let qrCodeData: string | undefined;
    if (config.allowRemote && addresses.length > 0) {
      try {
        qrCodeData = await qrcode.toDataURL(url);
      } catch (e) {
        console.warn('Failed to generate QR code:', e);
      }
    }
    
    res.json({
      running: true,
      port: config.port,
      addresses,
      url,
      qrCode: qrCodeData
    });
  });
  
  // =====================
  // Projects
  // =====================
  
  router.get('/projects', (req, res) => {
    res.json(store.getProjects());
  });
  
  router.post('/projects', (req, res) => {
    const { name, rootDirectory } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Project name is required',
        statusCode: 400
      });
    }
    
    const project = store.createProject(name, rootDirectory);
    res.status(201).json(project);
  });
  
  router.put('/projects/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    const project = store.updateProject(id, updates);
    
    if (!project) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Project not found',
        statusCode: 404
      });
    }
    
    res.json(project);
  });
  
  router.delete('/projects/:id', (req, res) => {
    const { id } = req.params;
    const success = store.deleteProject(id);
    
    if (!success) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Project not found',
        statusCode: 404
      });
    }
    
    res.sendStatus(204);
  });
  
  // =====================
  // Terminals
  // =====================
  
  router.get('/projects/:projectId/terminals', (req, res) => {
    const { projectId } = req.params;
    const project = store.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Project not found',
        statusCode: 404
      });
    }
    
    res.json(project.terminals);
  });
  
  router.post('/projects/:projectId/terminals', (req, res) => {
    const { projectId } = req.params;
    const { name, shellType, workingDirectory, startupCommand } = req.body;
    
    if (!name || !shellType || !workingDirectory) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Name, shellType, and workingDirectory are required',
        statusCode: 400
      });
    }
    
    const terminal = store.createTerminal(
      projectId,
      name,
      shellType,
      workingDirectory,
      startupCommand
    );
    
    if (!terminal) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Project not found',
        statusCode: 404
      });
    }
    
    res.status(201).json(terminal);
  });
  
  router.put('/terminals/:id', (req, res) => {
    const { id } = req.params;
    const { projectId, ...updates } = req.body;
    
    if (!projectId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'projectId is required',
        statusCode: 400
      });
    }
    
    const terminal = store.updateTerminal(projectId, id, updates);
    
    if (!terminal) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Terminal not found',
        statusCode: 404
      });
    }
    
    res.json(terminal);
  });
  
  router.delete('/terminals/:id', (req, res) => {
    const { id } = req.params;
    const { projectId } = req.body;
    
    if (!projectId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'projectId is required',
        statusCode: 400
      });
    }
    
    const success = store.deleteTerminal(projectId, id);
    
    if (!success) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Terminal not found',
        statusCode: 404
      });
    }
    
    res.sendStatus(204);
  });
  
  // =====================
  // Terminal Actions
  // =====================
  
  router.post('/terminals/:id/start', async (req, res) => {
    const { id } = req.params;
    const { projectId } = req.body;
    
    const terminal = store.getTerminal(projectId, id);
    
    if (!terminal) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Terminal not found',
        statusCode: 404
      });
    }
    
    // Kill existing if running
    if (ptyManager.isRunning(id)) {
      ptyManager.kill(id);
    }
    
    store.updateTerminal(projectId, id, { status: 'running' });
    
    try {
      const result = await ptyManager.spawn({
        terminalId: id,
        shellType: terminal.shellType,
        cwd: terminal.workingDirectory,
        cols: 80,
        rows: 24
      });
      
      // Run startup command if provided
      if (terminal.startupCommand) {
        setTimeout(() => {
          ptyManager.write(id, terminal.startupCommand + '\r');
        }, 500);
      }
      
      res.json({ pid: result.pid });
    } catch (error) {
      store.updateTerminal(projectId, id, { status: 'error' });
      res.status(500).json({
        error: 'Failed to Start',
        message: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500
      });
    }
  });
  
  router.post('/terminals/:id/stop', (req, res) => {
    const { id } = req.params;
    const { projectId } = req.body;
    
    ptyManager.kill(id);
    
    const terminal = store.getTerminal(projectId, id);
    if (terminal) {
      store.updateTerminal(projectId, id, { status: 'stopped' });
    }
    
    res.sendStatus(204);
  });
  
  router.post('/terminals/:id/restart', async (req, res) => {
    const { id } = req.params;
    const { projectId } = req.body;
    
    const terminal = store.getTerminal(projectId, id);
    
    if (!terminal) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Terminal not found',
        statusCode: 404
      });
    }
    
    ptyManager.kill(id);
    store.updateTerminal(projectId, id, { status: 'running' });
    
    try {
      const result = await ptyManager.spawn({
        terminalId: id,
        shellType: terminal.shellType,
        cwd: terminal.workingDirectory,
        cols: 80,
        rows: 24
      });
      
      if (terminal.startupCommand) {
        setTimeout(() => {
          ptyManager.write(id, terminal.startupCommand + '\r');
        }, 500);
      }
      
      res.json({ pid: result.pid });
    } catch (error) {
      store.updateTerminal(projectId, id, { status: 'error' });
      res.status(500).json({
        error: 'Failed to Restart',
        message: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500
      });
    }
  });
  
  router.post('/terminals/:id/resize', (req, res) => {
    const { id } = req.params;
    const { cols, rows } = req.body;
    
    if (typeof cols !== 'number' || typeof rows !== 'number') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'cols and rows must be numbers',
        statusCode: 400
      });
    }
    
    ptyManager.resize(id, cols, rows);
    res.sendStatus(204);
  });
  
  // =====================
  // Config
  // =====================
  
  router.get('/config', (req, res) => {
    res.json(store.getConfig());
  });
  
  router.put('/config/settings', (req, res) => {
    const { settings } = req.body;
    const updated = store.updateSettings(settings);
    res.json(updated);
  });
  
  return router;
}
```

### Step 2.5: Create Main Web Server Class
Create `src/main/web-server/index.ts`:

```typescript
import express from 'express';
import path from 'path';
import type { ConfigStore } from '../store';
import type { PtyManager } from '../pty';
import type { ServerConfig, ServerStatus } from './types';
import { createRoutes } from './routes';
import { createAuthMiddleware, corsMiddleware, rateLimitMiddleware } from './middleware';

export class WebServer {
  private app: express.Application;
  private server?: ReturnType<typeof this.app.listen>;
  private config: ServerConfig;
  private store: ConfigStore;
  private ptyManager: PtyManager;
  private auth: ReturnType<typeof createAuthMiddleware>;
  
  constructor(config: ServerConfig, store: ConfigStore, ptyManager: PtyManager) {
    this.config = config;
    this.store = store;
    this.ptyManager = ptyManager;
    this.app = express();
    this.auth = createAuthMiddleware(config);
    
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  private setupMiddleware(): void {
    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS
    this.app.use(corsMiddleware(this.config.allowRemote));
    
    // Rate limiting
    this.app.use(rateLimitMiddleware());
  }
  
  private setupRoutes(): void {
    // Auth endpoint (public)
    this.app.post('/api/auth', this.auth.authenticate);
    
    // Protected API routes
    this.app.use('/api', this.auth.requireAuth, createRoutes(
      this.config,
      this.store,
      this.ptyManager
    ));
    
    // Static files for mobile UI (will be added in Phase 3)
    // this.app.use(express.static(path.join(__dirname, '../../mobile')));
    
    // Health check (public)
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });
    
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`,
        statusCode: 404
      });
    });
    
    // Error handler
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Web server error:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        statusCode: 500
      });
    });
  }
  
  async start(): Promise<void> {
    if (this.server) {
      console.log('Web server already running');
      return;
    }
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, () => {
        console.log(`Web server started on port ${this.config.port}`);
        console.log(`Mobile UI available at http://localhost:${this.config.port}`);
        resolve();
      });
      
      this.server.on('error', (error: Error) => {
        console.error('Failed to start web server:', error);
        reject(error);
      });
    });
  }
  
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    
    return new Promise((resolve) => {
      this.server?.close(() => {
        console.log('Web server stopped');
        this.server = undefined;
        this.auth.clearTokens();
        resolve();
      });
    });
  }
  
  isRunning(): boolean {
    return !!this.server;
  }
  
  getPort(): number {
    return this.config.port;
  }
}
```

**Verification:** Import in `src/main/index.ts` and test compilation.

---

## Phase 3: WebSocket Server (2-3 hours)

### Step 3.1: Create WebSocket Types
Create `src/main/ws-server/types.ts`:

```typescript
import type { TerminalStatus } from '@shared/types';

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'input' | 'resize' | 'output' | 'status' | 'error';
  terminalId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  status?: TerminalStatus;
  message?: string;
}

export interface TerminalSession {
  terminalId: string;
  ws: WebSocket;
  projectId: string;
  unsubscribeCallbacks: (() => void)[];
}
```

### Step 3.2: Create WebSocket Server
Create `src/main/ws-server/index.ts`:

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { ConfigStore } from '../store';
import type { PtyManager } from '../pty';
import type { WebSocketMessage, TerminalSession } from './types';
import type { TerminalStatus } from '@shared/types';

export class WebSocketTerminalServer {
  private wss?: WebSocketServer;
  private store: ConfigStore;
  private ptyManager: PtyManager;
  private sessions: Map<string, TerminalSession> = new Map();
  private validTokens: Set<string>;
  
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
      
      console.log('WebSocket client connected');
      
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
    
    console.log('WebSocket server attached');
  }
  
  private handleMessage(ws: WebSocket, message: WebSocketMessage): void {
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
    
    // Create session
    const sessionKey = `${ws.toString()}_${terminalId}`;
    const session: TerminalSession = {
      terminalId,
      ws,
      projectId,
      unsubscribeCallbacks: []
    };
    
    this.sessions.set(sessionKey, session);
    
    // Subscribe to PTY data (this requires adding callback support to PtyManager)
    // For now, we'll use the event emitter pattern
    console.log(`Subscribed to terminal ${terminalId}`);
    
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
    const sessionKey = `${ws.toString()}_${terminalId}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.unsubscribeCallbacks.forEach(cb => cb());
      this.sessions.delete(sessionKey);
      console.log(`Unsubscribed from terminal ${terminalId}`);
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
    
    keysToDelete.forEach(key => this.sessions.delete(key));
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
    this.wss?.close();
    this.sessions.clear();
  }
}
```

**Verification:** Check TypeScript compilation.

---

## Phase 4: Integration with Main Process (1-2 hours)

### Step 4.1: Modify PtyManager to Support WebSocket Broadcasting
Edit `src/main/pty/index.ts` to add optional WebSocket server reference:

Add at the top of the file:
```typescript
import type { WebSocketTerminalServer } from '../ws-server';
```

Add to PtyManager class:
```typescript
export class PtyManager {
  private wsServer: WebSocketTerminalServer | null = null;
  
  setWebSocketServer(wsServer: WebSocketTerminalServer): void {
    this.wsServer = wsServer;
  }
  
  // ... existing code ...
  
  // Modify the data handling in spawn() method:
  ptyProcess.onData((data) => {
    this.batcher.queueData(config.terminalId, data);
    // Also broadcast to WebSocket clients
    this.wsServer?.broadcastToTerminal(config.terminalId, data);
  });
  
  // Modify exit handling:
  ptyProcess.onExit(({ exitCode }) => {
    this.batcher.clear(config.terminalId);
    this.sessions.delete(config.terminalId);
    
    // Broadcast to WebSocket clients
    const status = exitCode === 0 ? 'completed' : 'error';
    this.wsServer?.broadcastStatus(config.terminalId, status);
    
    // ... rest of existing code ...
  });
}
```

### Step 4.2: Create Web UI Manager
Create `src/main/web-ui-manager.ts`:

```typescript
import { WebServer } from './web-server';
import { WebSocketTerminalServer } from './ws-server';
import type { ConfigStore } from './store';
import type { PtyManager } from './pty';
import type { WebUISettings } from '@shared/types';

export class WebUIManager {
  private static instance: WebUIManager;
  private webServer?: WebServer;
  private wsServer?: WebSocketTerminalServer;
  private store: ConfigStore;
  private ptyManager: PtyManager;
  private validTokens = new Set<string>();
  
  private constructor() {
    this.store = ConfigStore.getInstance();
    this.ptyManager = PtyManager.getInstance();
  }
  
  static getInstance(): WebUIManager {
    if (!WebUIManager.instance) {
      WebUIManager.instance = new WebUIManager();
    }
    return WebUIManager.instance;
  }
  
  async initialize(): Promise<void> {
    const settings = this.store.getSettings().webUI;
    
    if (settings?.enabled) {
      await this.start(settings);
    }
  }
  
  async start(settings: WebUISettings): Promise<void> {
    try {
      // Generate PIN if not set
      let pin = settings.pin;
      if (!pin) {
        pin = this.generatePIN();
        this.store.updateSettings({
          webUI: { ...settings, pin }
        });
      }
      
      // Create and start web server
      this.webServer = new WebServer(
        {
          port: settings.port,
          pin,
          allowRemote: settings.allowRemote
        },
        this.store,
        this.ptyManager
      );
      
      await this.webServer.start();
      
      // Create WebSocket server
      this.wsServer = new WebSocketTerminalServer(
        this.store,
        this.ptyManager,
        this.validTokens
      );
      
      // Get the underlying HTTP server and attach WebSocket
      // This requires exposing the server from WebServer class
      // Add to WebServer: getServer(): Server | undefined { return this.server; }
      const server = (this.webServer as any).server;
      if (server) {
        this.wsServer.attachToServer(server);
        this.ptyManager.setWebSocketServer(this.wsServer);
      }
      
      console.log('Web UI started successfully');
    } catch (error) {
      console.error('Failed to start Web UI:', error);
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    this.wsServer?.close();
    await this.webServer?.stop();
    this.wsServer = undefined;
    this.webServer = undefined;
    this.validTokens.clear();
    console.log('Web UI stopped');
  }
  
  async restart(): Promise<void> {
    const settings = this.store.getSettings().webUI;
    if (settings?.enabled) {
      await this.stop();
      await this.start(settings);
    }
  }
  
  isRunning(): boolean {
    return this.webServer?.isRunning() ?? false;
  }
  
  generatePIN(length: number = 6): string {
    const digits = '0123456789';
    let pin = '';
    for (let i = 0; i < length; i++) {
      pin += digits[Math.floor(Math.random() * digits.length)];
    }
    return pin;
  }
  
  regeneratePIN(): string {
    const settings = this.store.getSettings().webUI;
    const newPin = this.generatePIN();
    
    if (settings) {
      this.store.updateSettings({
        webUI: { ...settings, pin: newPin }
      });
      
      // Clear all existing tokens
      this.validTokens.clear();
    }
    
    return newPin;
  }
}
```

### Step 4.3: Integrate into Main Process
Edit `src/main/index.ts`:

Add imports:
```typescript
import { WebUIManager } from './web-ui-manager'
```

Add to app.whenReady():
```typescript
app.whenReady().then(() => {
  // ... existing code ...
  
  // Initialize Web UI manager
  WebUIManager.getInstance().initialize().catch(console.error);
  
  createWindow();
  
  // ... rest of existing code ...
});
```

Add to before-quit handler:
```typescript
app.on('before-quit', () => {
  PtyManager.getInstance().killAll();
  WebUIManager.getInstance().stop().catch(console.error);
});
```

Add IPC handlers for Web UI management:
Add to `src/main/ipc/index.ts`:

```typescript
import { WebUIManager } from '../web-ui-manager';

// Add to setupIpcHandlers():
const webUIManager = WebUIManager.getInstance();

// Web UI IPC handlers
ipcMain.handle('webui:start', async () => {
  const settings = store.getSettings().webUI;
  if (settings) {
    await webUIManager.start(settings);
    return { success: true };
  }
  return { success: false, error: 'Web UI settings not found' };
});

ipcMain.handle('webui:stop', async () => {
  await webUIManager.stop();
  return { success: true };
});

ipcMain.handle('webui:status', () => {
  return {
    running: webUIManager.isRunning(),
    settings: store.getSettings().webUI
  };
});

ipcMain.handle('webui:regenerate-pin', () => {
  const newPin = webUIManager.regeneratePIN();
  return { pin: newPin };
});
```

**Verification:** Run `npm run typecheck` - should compile without errors.

---

## Phase 5: Desktop Settings UI (2-3 hours)

### Step 5.1: Update SettingsModal Component
Edit `src/renderer/src/components/SettingsModal/index.tsx`:

Add Web UI section to the settings modal. Add state:
```typescript
const [webUIStatus, setWebUIStatus] = useState({
  running: false,
  pin: '',
  url: ''
});
```

Add useEffect to fetch status:
```typescript
useEffect(() => {
  loadWebUIStatus();
}, []);

const loadWebUIStatus = async () => {
  const status = await window.electronAPI.webui.getStatus();
  setWebUIStatus(status);
};
```

Add Web UI section to the JSX:
```tsx
<div className="settings-section">
  <h3>Mobile Web UI</h3>
  
  <div className="setting-item">
    <label className="toggle-label">
      <input
        type="checkbox"
        checked={settings.webUI?.enabled}
        onChange={(e) => handleWebUIToggle(e.target.checked)}
      />
      <span>Enable Mobile Web UI</span>
    </label>
    <p className="setting-description">
      Access this app from mobile browsers on your local network
    </p>
  </div>
  
  {settings.webUI?.enabled && (
    <>
      <div className="setting-item">
        <label>Port</label>
        <input
          type="number"
          value={settings.webUI?.port || 3000}
          onChange={(e) => handlePortChange(parseInt(e.target.value))}
          min={1024}
          max={65535}
        />
      </div>
      
      <div className="setting-item">
        <label>Access PIN</label>
        <div className="pin-display">
          <code>{webUIStatus.pin || settings.webUI?.pin || 'Not set'}</code>
          <button onClick={handleRegeneratePIN}>Regenerate</button>
        </div>
        <p className="setting-description">
          Enter this PIN on your mobile device to connect
        </p>
      </div>
      
      <div className="setting-item">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={settings.webUI?.allowRemote}
            onChange={(e) => handleAllowRemoteChange(e.target.checked)}
          />
          <span>Allow Remote Connections</span>
        </label>
      </div>
      
      {webUIStatus.running && webUIStatus.url && (
        <div className="setting-item connection-info">
          <label>Mobile URL</label>
          <div className="url-display">
            <code>{webUIStatus.url}</code>
            <button onClick={() => navigator.clipboard.writeText(webUIStatus.url)}>
              Copy
            </button>
          </div>
          {settings.webUI?.showQRCode && webUIStatus.qrCode && (
            <img src={webUIStatus.qrCode} alt="QR Code" className="qr-code" />
          )}
        </div>
      )}
      
      <div className="setting-item">
        <button 
          onClick={webUIStatus.running ? handleStopWebUI : handleStartWebUI}
          className={webUIStatus.running ? 'stop-button' : 'start-button'}
        >
          {webUIStatus.running ? 'Stop Web UI' : 'Start Web UI'}
        </button>
      </div>
    </>
  )}
</div>
```

### Step 5.2: Add Styles
Add to `src/renderer/src/styles/index.css`:

```css
.settings-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-color);
}

.settings-section h3 {
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
}

.setting-item {
  margin-bottom: 16px;
}

.setting-item label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.toggle-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.toggle-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.setting-description {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.pin-display,
.url-display {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pin-display code,
.url-display code {
  background: var(--bg-secondary);
  padding: 8px 12px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
}

.qr-code {
  margin-top: 12px;
  max-width: 200px;
  border-radius: 8px;
}

.connection-info {
  background: var(--bg-secondary);
  padding: 16px;
  border-radius: 8px;
  margin-top: 16px;
}

.start-button,
.stop-button {
  padding: 8px 16px;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.start-button {
  background: var(--color-success);
  color: white;
}

.stop-button {
  background: var(--color-danger);
  color: white;
}
```

**Verification:** Test the desktop app - settings should show the new Web UI section.

---

## Phase 6: Mobile Web UI (4-6 hours)

### Step 6.1: Setup Mobile Build Target
Update `electron.vite.config.ts` to add mobile build:

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react()],
  },
  // Add mobile build configuration
  build: {
    lib: {
      entry: resolve(__dirname, 'src/mobile/main.tsx'),
      name: 'MobileUI',
      fileName: 'mobile',
      formats: ['es']
    },
    outDir: 'out/mobile',
    rollupOptions: {
      external: ['react', 'react-dom'],
    },
  },
})
```

### Step 6.2: Create Mobile HTML Entry
Create `src/mobile/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1e1e1e">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Terminal Orchestrator Mobile</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1e1e1e;
      color: #d4d4d4;
      overflow: hidden;
      touch-action: manipulation;
    }
    
    #root {
      height: 100vh;
      width: 100vw;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

### Step 6.3: Create Mobile Main Entry
Create `src/mobile/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/mobile.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

### Step 6.4: Create Mobile App Component
Create `src/mobile/App.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { LoginScreen } from './components/LoginScreen'
import { ProjectList } from './components/ProjectList'
import { TerminalView } from './components/TerminalView'
import { ConnectionStatus } from './components/ConnectionStatus'
import { useApi } from './hooks/useApi'
import { useWebSocket } from './hooks/useWebSocket'
import type { Project, Terminal } from '@shared/types'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [activeTerminal, setActiveTerminal] = useState<Terminal | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  
  const api = useApi()
  const ws = useWebSocket()
  
  useEffect(() => {
    if (isAuthenticated) {
      loadProjects()
    }
  }, [isAuthenticated])
  
  const loadProjects = async () => {
    try {
      const data = await api.getProjects()
      setProjects(data)
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }
  
  const handleLogin = () => {
    setIsAuthenticated(true)
  }
  
  const handleProjectSelect = (project: Project) => {
    setActiveProject(project)
    if (project.terminals.length > 0) {
      setActiveTerminal(project.terminals[0])
    }
  }
  
  const handleTerminalSelect = (terminal: Terminal) => {
    setActiveTerminal(terminal)
  }
  
  const handleBack = () => {
    if (activeTerminal) {
      setActiveTerminal(null)
    } else if (activeProject) {
      setActiveProject(null)
    }
  }
  
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} api={api} />
  }
  
  return (
    <div className="mobile-app">
      <ConnectionStatus ws={ws} />
      
      {!activeProject ? (
        <ProjectList 
          projects={projects}
          onSelect={handleProjectSelect}
          onRefresh={loadProjects}
        />
      ) : !activeTerminal ? (
        <TerminalList
          project={activeProject}
          onSelect={handleTerminalSelect}
          onBack={handleBack}
        />
      ) : (
        <TerminalView
          terminal={activeTerminal}
          project={activeProject}
          ws={ws}
          api={api}
          onBack={handleBack}
        />
      )}
    </div>
  )
}

export default App
```

### Step 6.5: Create Mobile Components

Create `src/mobile/components/LoginScreen.tsx`:

```tsx
import { useState } from 'react'

interface LoginScreenProps {
  onLogin: () => void
  api: any
}

export function LoginScreen({ onLogin, api }: LoginScreenProps) {
  const [serverUrl, setServerUrl] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      // Store server URL
      localStorage.setItem('serverUrl', serverUrl)
      
      // Authenticate
      const result = await api.authenticate(serverUrl, pin)
      localStorage.setItem('authToken', result.token)
      
      onLogin()
    } catch (err) {
      setError('Invalid PIN or server URL')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="login-screen">
      <div className="login-container">
        <h1>Terminal Orchestrator</h1>
        <p className="subtitle">Mobile Access</p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Server URL</label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://192.168.1.100:3000"
              required
            />
          </div>
          
          <div className="form-group">
            <label>PIN Code</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
              required
            />
          </div>
          
          {error && <div className="error">{error}</div>}
          
          <button type="submit" disabled={loading} className="login-button">
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </form>
        
        <p className="hint">
          Find the PIN in your desktop app settings
        </p>
      </div>
    </div>
  )
}
```

Create `src/mobile/components/TerminalView.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { Terminal as TerminalType, Project } from '@shared/types'

interface TerminalViewProps {
  terminal: TerminalType
  project: Project
  ws: any
  api: any
  onBack: () => void
}

export function TerminalView({ terminal, project, ws, api, onBack }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  
  useEffect(() => {
    if (!containerRef.current) return
    
    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
      },
      scrollback: 1000,
    })
    
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    
    term.open(containerRef.current)
    fitAddon.fit()
    
    terminalRef.current = term
    fitAddonRef.current = fitAddon
    
    // Subscribe to WebSocket
    ws.subscribe(terminal.id)
    
    // Handle incoming data
    const handleMessage = (data: any) => {
      if (data.terminalId === terminal.id && data.type === 'output') {
        term.write(data.data)
      }
    }
    
    ws.onMessage(handleMessage)
    
    // Handle input
    term.onData((data) => {
      ws.sendInput(terminal.id, data)
    })
    
    // Handle resize
    const handleResize = () => {
      fitAddon.fit()
      const { cols, rows } = term
      ws.sendResize(terminal.id, cols, rows)
    }
    
    window.addEventListener('resize', handleResize)
    
    // Start terminal if not running
    if (terminal.status !== 'running') {
      api.startTerminal(project.id, terminal.id)
    }
    
    return () => {
      window.removeEventListener('resize', handleResize)
      ws.unsubscribe(terminal.id)
      ws.offMessage(handleMessage)
      term.dispose()
    }
  }, [terminal.id])
  
  const handleStart = () => {
    api.startTerminal(project.id, terminal.id)
  }
  
  const handleStop = () => {
    api.stopTerminal(terminal.id)
  }
  
  return (
    <div className="terminal-view">
      <div className="terminal-header">
        <button className="back-button" onClick={onBack}>←</button>
        <div className="terminal-info">
          <span className="terminal-name">{terminal.name}</span>
          <span className={`terminal-status ${terminal.status}`}>
            {terminal.status}
          </span>
        </div>
        <div className="terminal-actions">
          {terminal.status === 'running' ? (
            <button onClick={handleStop} className="stop-button">Stop</button>
          ) : (
            <button onClick={handleStart} className="start-button">Start</button>
          )}
        </div>
      </div>
      
      <div ref={containerRef} className="terminal-container" />
    </div>
  )
}
```

### Step 6.6: Create Mobile Hooks
Create `src/mobile/hooks/useApi.ts`:

```typescript
import { useCallback } from 'react'

const getServerUrl = () => localStorage.getItem('serverUrl') || ''
const getToken = () => localStorage.getItem('authToken') || ''

export function useApi() {
  const request = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const serverUrl = getServerUrl()
    const token = getToken()
    
    const response = await fetch(`${serverUrl}/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    return response.json()
  }, [])
  
  const authenticate = async (serverUrl: string, pin: string) => {
    const response = await fetch(`${serverUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    
    if (!response.ok) {
      throw new Error('Authentication failed')
    }
    
    return response.json()
  }
  
  const getProjects = () => request('/projects')
  const startTerminal = (projectId: string, terminalId: string) => 
    request(`/terminals/${terminalId}/start`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    })
  const stopTerminal = (terminalId: string) =>
    request(`/terminals/${terminalId}/stop`, {
      method: 'POST'
    })
  
  return {
    authenticate,
    getProjects,
    startTerminal,
    stopTerminal,
  }
}
```

Create `src/mobile/hooks/useWebSocket.ts`:

```typescript
import { useEffect, useRef, useCallback, useState } from 'react'

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const messageHandlers = useRef<Set<(data: any) => void>>(new Set())
  
  useEffect(() => {
    const serverUrl = localStorage.getItem('serverUrl')
    const token = localStorage.getItem('authToken')
    
    if (!serverUrl || !token) return
    
    const wsUrl = serverUrl.replace('http', 'ws') + `/ws/terminal?token=${token}`
    
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    
    ws.onopen = () => {
      console.log('WebSocket connected')
      setConnected(true)
    }
    
    ws.onclose = () => {
      console.log('WebSocket disconnected')
      setConnected(false)
    }
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        messageHandlers.current.forEach(handler => handler(data))
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
    
    return () => {
      ws.close()
    }
  }, [])
  
  const subscribe = useCallback((terminalId: string) => {
    wsRef.current?.send(JSON.stringify({
      type: 'subscribe',
      terminalId
    }))
  }, [])
  
  const unsubscribe = useCallback((terminalId: string) => {
    wsRef.current?.send(JSON.stringify({
      type: 'unsubscribe',
      terminalId
    }))
  }, [])
  
  const sendInput = useCallback((terminalId: string, data: string) => {
    wsRef.current?.send(JSON.stringify({
      type: 'input',
      terminalId,
      data
    }))
  }, [])
  
  const sendResize = useCallback((terminalId: string, cols: number, rows: number) => {
    wsRef.current?.send(JSON.stringify({
      type: 'resize',
      terminalId,
      cols,
      rows
    }))
  }, [])
  
  const onMessage = useCallback((handler: (data: any) => void) => {
    messageHandlers.current.add(handler)
  }, [])
  
  const offMessage = useCallback((handler: (data: any) => void) => {
    messageHandlers.current.delete(handler)
  }, [])
  
  return {
    connected,
    subscribe,
    unsubscribe,
    sendInput,
    sendResize,
    onMessage,
    offMessage,
  }
}
```

### Step 6.7: Create Mobile Styles
Create `src/mobile/styles/mobile.css`:

```css
/* Mobile App Layout */
.mobile-app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

/* Login Screen */
.login-screen {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
}

.login-container {
  width: 100%;
  max-width: 320px;
  text-align: center;
}

.login-container h1 {
  font-size: 24px;
  margin-bottom: 8px;
  color: #fff;
}

.subtitle {
  color: #888;
  margin-bottom: 32px;
}

.form-group {
  margin-bottom: 20px;
  text-align: left;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: #ccc;
}

.form-group input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #444;
  border-radius: 8px;
  background: #2d2d2d;
  color: #fff;
  font-size: 16px;
}

.form-group input:focus {
  outline: none;
  border-color: #4ec9b0;
}

.error {
  color: #f14c4c;
  margin-bottom: 16px;
  font-size: 14px;
}

.login-button {
  width: 100%;
  padding: 14px;
  background: #4ec9b0;
  color: #1e1e1e;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.login-button:disabled {
  opacity: 0.6;
}

.hint {
  margin-top: 24px;
  font-size: 12px;
  color: #666;
}

/* Connection Status */
.connection-status {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #333;
  z-index: 1000;
}

.connection-status.connected {
  background: #0dbc79;
}

.connection-status.disconnected {
  background: #f14c4c;
}

/* Project List */
.project-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.project-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.project-list-header h2 {
  font-size: 20px;
}

.refresh-button {
  padding: 8px 16px;
  background: #333;
  border: none;
  border-radius: 6px;
  color: #fff;
}

.project-item {
  background: #252526;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  cursor: pointer;
}

.project-item:active {
  background: #2d2d2d;
}

.project-name {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 4px;
}

.project-terminals {
  font-size: 13px;
  color: #888;
}

/* Terminal View */
.terminal-view {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.terminal-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: #252526;
  border-bottom: 1px solid #333;
}

.back-button {
  background: none;
  border: none;
  color: #fff;
  font-size: 20px;
  padding: 4px 12px;
  cursor: pointer;
}

.terminal-info {
  flex: 1;
  margin-left: 12px;
}

.terminal-name {
  display: block;
  font-weight: 500;
}

.terminal-status {
  font-size: 12px;
  text-transform: uppercase;
}

.terminal-status.running { color: #0dbc79; }
.terminal-status.stopped { color: #888; }
.terminal-status.error { color: #f14c4c; }

.terminal-actions button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
}

.start-button {
  background: #0dbc79;
  color: #1e1e1e;
}

.stop-button {
  background: #f14c4c;
  color: #fff;
}

.terminal-container {
  flex: 1;
  overflow: hidden;
  padding: 8px;
}

/* Bottom Navigation */
.bottom-nav {
  display: flex;
  background: #252526;
  border-top: 1px solid #333;
  padding-bottom: env(safe-area-inset-bottom);
}

.bottom-nav-item {
  flex: 1;
  padding: 12px;
  text-align: center;
  color: #888;
  text-decoration: none;
  font-size: 12px;
}

.bottom-nav-item.active {
  color: #4ec9b0;
}

.bottom-nav-icon {
  display: block;
  font-size: 20px;
  margin-bottom: 4px;
}
```

---

## Phase 7: Build & Serve Mobile UI (1 hour)

### Step 7.1: Update Web Server to Serve Mobile UI
Modify `src/main/web-server/index.ts` to serve the built mobile files:

```typescript
import path from 'path';

// In setupRoutes(), add before the 404 handler:
this.app.use(express.static(path.join(__dirname, '../../mobile')));

// Serve index.html for all non-API routes (SPA support)
this.app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
    res.sendFile(path.join(__dirname, '../../mobile/index.html'));
  } else {
    res.status(404).json({ error: 'Not Found' });
  }
});
```

### Step 7.2: Update Build Scripts
Add to `package.json`:

```json
{
  "scripts": {
    "build:mobile": "vite build --config electron.vite.config.ts --mode mobile",
    "dev:mobile": "vite build --config electron.vite.config.ts --mode mobile --watch"
  }
}
```

### Step 7.3: Configure Mobile Build in Vite Config
Update `electron.vite.config.ts` to properly handle the mobile build:

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  // Mobile build configuration
  if (mode === 'mobile') {
    return {
      root: resolve(__dirname, 'src/mobile'),
      build: {
        outDir: resolve(__dirname, 'out/mobile'),
        emptyOutDir: true,
        rollupOptions: {
          input: resolve(__dirname, 'src/mobile/index.html'),
        },
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@shared': resolve(__dirname, 'src/shared'),
        },
      },
    }
  }
  
  // Default Electron configuration
  return {
    main: {
      plugins: [externalizeDepsPlugin()],
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': resolve('src/shared'),
        },
      },
      plugins: [react()],
    },
  }
})
```

**Verification:** Run `npm run build:mobile` - should create `out/mobile/` with built files.

---

## Phase 8: Testing & Refinement (2-3 hours)

### Step 8.1: Desktop App Testing
1. Start the desktop app: `npm run dev`
2. Open Settings → Mobile Web UI section
3. Enable the feature
4. Verify PIN is generated
5. Click "Start Web UI" button
6. Check console for "Web server started" message

### Step 8.2: API Testing (using curl or Postman)
```bash
# Test health endpoint
curl http://localhost:3000/health

# Authenticate
 curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"pin": "YOUR_PIN"}'

# Use the returned token for protected routes
 curl http://localhost:3000/api/projects \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Step 8.3: Mobile Browser Testing
1. Find your computer's local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. On your phone, open browser to `http://YOUR_IP:3000`
3. You should see the login screen
4. Enter PIN from desktop app
5. Verify projects load
6. Test terminal viewing and interaction

### Step 8.4: Common Issues & Fixes

**Issue:** Web server fails to start (port in use)
- **Fix:** Change port in settings or kill process using port 3000

**Issue:** Cannot connect from mobile (connection refused)
- **Fix:** 
  - Ensure "Allow Remote Connections" is enabled
  - Check firewall settings
  - Verify both devices are on same WiFi network

**Issue:** CORS errors
- **Fix:** Check `allowRemote` setting is true, verify CORS middleware is working

**Issue:** Terminal data not appearing on mobile
- **Fix:** Check WebSocket connection in browser dev tools

---

## Phase 9: Final Integration (1 hour)

### Step 9.1: Add Preload API Methods
Edit `src/preload/index.ts` to expose Web UI methods:

```typescript
// Add to electronAPI object:
webui: {
  start: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('webui:start'),
  stop: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('webui:stop'),
  getStatus: (): Promise<{ running: boolean; settings: any }> =>
    ipcRenderer.invoke('webui:status'),
  regeneratePIN: (): Promise<{ pin: string }> =>
    ipcRenderer.invoke('webui:regenerate-pin'),
}
```

Add TypeScript declarations in `src/renderer/src/types/electron.d.ts`:

```typescript
interface ElectronAPI {
  // ... existing methods ...
  webui: {
    start: () => Promise<{ success: boolean; error?: string }>;
    stop: () => Promise<{ success: boolean }>;
    getStatus: () => Promise<{ running: boolean; settings: any }>;
    regeneratePIN: () => Promise<{ pin: string }>;
  };
}
```

### Step 9.2: Polish Settings UI
Ensure all buttons work:
- Start/Stop Web UI
- Regenerate PIN
- Copy URL to clipboard
- Toggle switches save to config

### Step 9.3: Update Documentation
Add to README.md:
```markdown
## Mobile Web UI

Access your Terminal Orchestrator from mobile browsers:

1. Open Settings → Mobile Web UI
2. Enable the feature
3. Note the PIN code
4. Click "Start Web UI"
5. On your mobile device, open the displayed URL
6. Enter the PIN to connect

**Security Note:** The Web UI is only accessible when the desktop app is running and only on your local network by default.
```

---

## Completion Checklist

- [ ] All dependencies installed
- [ ] TypeScript compilation passes (`npm run typecheck`)
- [ ] Web server starts successfully
- [ ] REST API endpoints working
- [ ] WebSocket connections functional
- [ ] Desktop settings UI complete
- [ ] Mobile UI loads in browser
- [ ] Authentication working
- [ ] Terminal streaming working
- [ ] Projects/terminals load on mobile
- [ ] Start/stop controls work from mobile
- [ ] Build process creates mobile files
- [ ] Documentation updated
- [ ] Desktop app runs without errors when feature disabled
- [ ] Mobile feature completely stops when disabled

---

## Estimated Total Time

| Phase | Estimated Time |
|-------|---------------|
| Phase 1: Setup | 30-60 min |
| Phase 2: Web Server | 2-3 hours |
| Phase 3: WebSocket Server | 2-3 hours |
| Phase 4: Integration | 1-2 hours |
| Phase 5: Settings UI | 2-3 hours |
| Phase 6: Mobile UI | 4-6 hours |
| Phase 7: Build Setup | 1 hour |
| Phase 8: Testing | 2-3 hours |
| Phase 9: Final Integration | 1 hour |
| **TOTAL** | **15-22 hours** |

**Recommendation:** Work through phases sequentially. Each phase builds on the previous one. Test thoroughly after each phase before proceeding.
