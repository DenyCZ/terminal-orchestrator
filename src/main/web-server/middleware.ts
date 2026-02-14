import type { Request, Response, NextFunction } from 'express';
import type { ServerConfig } from './types';

// Store for valid tokens (shared with WebSocket server)
export const validTokens = new Set<string>();

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
      
      // Generate simple token
      const token = `token_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
    
    // Clear all tokens (on server restart or PIN regenerate)
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


