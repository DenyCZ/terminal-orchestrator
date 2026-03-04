import { Router } from 'express';
import type { ConfigStore } from '../store';
import type { PtyManager } from '../pty';
import type { ServerConfig, TunnelInfo } from './types';
import * as qrcode from 'qrcode';
import { detectShells } from '../shell-detector';
import { startTerminalProcess } from '../terminal-helpers';

// Error response factory for DRY
function errorResponse(statusCode: number, error: string, message: string) {
  return { error, message, statusCode };
}

// Get local IP addresses
function getLocalAddresses(): string[] {
  const addresses: string[] = [];
  const os = require('os');
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  
  return addresses;
}

export function createRoutes(
  config: ServerConfig,
  store: ConfigStore,
  ptyManager: PtyManager,
  getTunnelInfo?: () => TunnelInfo | undefined
): Router {
  const router = Router();
  
  // Status & Info
  router.get('/status', async (req, res) => {
    const addresses = getLocalAddresses();
    
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
    
    // Get tunnel info if available
    const tunnel = getTunnelInfo?.();
    
    res.json({
      running: true,
      port: config.port,
      addresses,
      url,
      qrCode: qrCodeData,
      tunnel
    });
  });
  
  // Shells
  router.get('/shells', (req, res) => {
    const shells = detectShells();
    res.json(shells);
  });
  
  // Projects
  router.get('/projects', (req, res) => {
    res.json(store.getProjects());
  });
  
  router.post('/projects', (req, res) => {
    const { name, rootDirectory } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json(errorResponse(400, 'Bad Request', 'Project name is required'));
    }
    
    const project = store.createProject(name, rootDirectory);
    res.status(201).json(project);
  });
  
  router.put('/projects/:id', (req, res) => {
    const { id } = req.params;
    const project = store.updateProject(id, req.body);
    
    if (!project) {
      return res.status(404).json(errorResponse(404, 'Not Found', 'Project not found'));
    }
    
    res.json(project);
  });
  
  router.delete('/projects/:id', (req, res) => {
    if (!store.deleteProject(req.params.id)) {
      return res.status(404).json(errorResponse(404, 'Not Found', 'Project not found'));
    }
    res.sendStatus(204);
  });
  
  // Terminals
  router.get('/projects/:projectId/terminals', (req, res) => {
    const project = store.getProject(req.params.projectId);
    
    if (!project) {
      return res.status(404).json(errorResponse(404, 'Not Found', 'Project not found'));
    }
    
    res.json(project.terminals);
  });
  
  router.post('/projects/:projectId/terminals', (req, res) => {
    const { name, shellType, workingDirectory, startupCommand } = req.body;
    
    if (!name || !shellType || !workingDirectory) {
      return res.status(400).json(errorResponse(400, 'Bad Request', 'Name, shellType, and workingDirectory are required'));
    }
    
    const terminal = store.createTerminal(req.params.projectId, name, shellType, workingDirectory, startupCommand);
    
    if (!terminal) {
      return res.status(404).json(errorResponse(404, 'Not Found', 'Project not found'));
    }
    
    res.status(201).json(terminal);
  });
  
  router.put('/terminals/:id', (req, res) => {
    const { projectId, ...updates } = req.body;
    
    if (!projectId) {
      return res.status(400).json(errorResponse(400, 'Bad Request', 'projectId is required'));
    }
    
    const terminal = store.updateTerminal(projectId, req.params.id, updates);
    
    if (!terminal) {
      return res.status(404).json(errorResponse(404, 'Not Found', 'Terminal not found'));
    }
    
    res.json(terminal);
  });
  
  router.delete('/terminals/:id', (req, res) => {
    const { projectId } = req.body;
    
    if (!projectId) {
      return res.status(400).json(errorResponse(400, 'Bad Request', 'projectId is required in body'));
    }
    
    if (!store.deleteTerminal(projectId, req.params.id)) {
      return res.status(404).json(errorResponse(404, 'Not Found', 'Terminal not found'));
    }
    
    res.sendStatus(204);
  });
  
  // Terminal Actions
  router.post('/terminals/:id/start', async (req, res) => {
    const { id } = req.params;
    const { projectId } = req.body;
    
    const result = await startTerminalProcess(store, ptyManager, projectId, id);
    
    if (!result.success) {
      return res.status(result.error === 'Terminal not found' ? 404 : 500).json(
        errorResponse(result.error === 'Terminal not found' ? 404 : 500,
          result.error === 'Terminal not found' ? 'Not Found' : 'Failed to Start',
          result.error || 'Unknown error')
      );
    }
    
    res.json({ pid: result.pid });
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
    
    ptyManager.kill(id);
    
    const result = await startTerminalProcess(store, ptyManager, projectId, id);
    
    if (!result.success) {
      return res.status(result.error === 'Terminal not found' ? 404 : 500).json(
        errorResponse(result.error === 'Terminal not found' ? 404 : 500,
          result.error === 'Terminal not found' ? 'Not Found' : 'Failed to Restart',
          result.error || 'Unknown error')
      );
    }
    
    res.json({ pid: result.pid });
  });
  
  router.post('/terminals/:id/resize', (req, res) => {
    const { cols, rows } = req.body;
    
    if (typeof cols !== 'number' || typeof rows !== 'number') {
      return res.status(400).json(errorResponse(400, 'Bad Request', 'cols and rows must be numbers'));
    }
    
    ptyManager.resize(req.params.id, cols, rows);
    res.sendStatus(204);
  });
  
  // Config
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
