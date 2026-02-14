import type { Server } from 'http';
import { WebServer } from './web-server';
import { WebSocketTerminalServer } from './ws-server';
import { ConfigStore } from './store';
import { PtyManager } from './pty';
import type { WebUISettings, TerminalStatus } from '@shared/types';
import type { ITerminalDataBroadcaster } from './pty';

export class WebUIManager implements ITerminalDataBroadcaster {
  private static instance: WebUIManager;
  private webServer?: WebServer;
  private wsServer?: WebSocketTerminalServer;
  private store: ConfigStore;
  private ptyManager: PtyManager;
  
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
        this.webServer.getValidTokens()
      );
      
      // Get the underlying HTTP server and attach WebSocket
      const server = this.webServer.getServer();
      if (server) {
        this.wsServer.attachToServer(server);
        this.ptyManager.setWebSocketServer(this);
      }
      
      console.log('Web UI started successfully');
    } catch (error) {
      console.error('Failed to start Web UI:', error);
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    this.ptyManager.setWebSocketServer(null);
    this.wsServer?.close();
    await this.webServer?.stop();
    this.wsServer = undefined;
    this.webServer = undefined;
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
      
      // Clear all existing tokens by restarting the server
      if (this.isRunning()) {
        this.restart().catch(console.error);
      }
    }
    
    return newPin;
  }
  
  // ITerminalDataBroadcaster implementation
  broadcastToTerminal(terminalId: string, data: string): void {
    this.wsServer?.broadcastToTerminal(terminalId, data);
  }
  
  broadcastStatus(terminalId: string, status: TerminalStatus): void {
    this.wsServer?.broadcastStatus(terminalId, status);
  }
}
