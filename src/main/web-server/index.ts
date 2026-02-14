import express, { type Express, type Request, Response } from 'express';
import path from 'path';
import type { Server } from 'http';
import type { ConfigStore } from '../store';
import type { PtyManager } from '../pty';
import type { ServerConfig } from './types';
import { createRoutes } from './routes';
import { createAuthMiddleware, corsMiddleware, validTokens } from './middleware';

export class WebServer {
  private app: Express;
  private server?: Server;
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
    
    // Health check (public)
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });
    
    // Static files for mobile UI
    // In production: out/main/index.js -> out/mobile (one level up, then into mobile)
    const mobilePath = path.join(__dirname, '../mobile');
    this.app.use(express.static(mobilePath, {
      index: false,
      extensions: ['html', 'js', 'css', 'json', 'png', 'svg', 'ico']
    }));
    
    // Serve index.html for all non-API routes (SPA support)
    this.app.get('*', (_req, res, next) => {
      // Skip API routes and health check
      if (_req.path.startsWith('/api') || _req.path === '/health') {
        return next();
      }
      res.sendFile(path.join(mobilePath, 'index.html'), (err) => {
        if (err) {
          // If index.html doesn't exist, return 404
          res.status(404).json({
            error: 'Not Found',
            message: 'Mobile UI not available. Please build the mobile app.',
            statusCode: 404
          });
        }
      });
    });
    
    // Error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
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
  
  getServer(): Server | undefined {
    return this.server;
  }
  
  getValidTokens(): Set<string> {
    return validTokens;
  }
}
