import { Router } from 'express';
import type { ConfigStore } from '../store';
import type { PtyManager } from '../pty';
import type { ServerConfig } from './types';
import * as qrcode from 'qrcode';

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
  ptyManager: PtyManager
): Router {
  const router = Router();
  
  // =====================
  // Status & Info
  // =====================
  
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
        message: 'projectId is required in body',
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
          ptyManager.write(id, terminal.startupCommand! + '\r');
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
