import type { Server } from 'http';
import { WebServer } from './web-server';
import { WebSocketTerminalServer } from './ws-server';
import { ConfigStore } from './store';
import { PtyManager } from './pty';
import { CloudflareTunnel } from './tunnel';
import type { WebUISettings, TerminalStatus, TunnelSettings } from '../shared/types';
import type { ITerminalDataBroadcaster } from './pty';
import type { WebUIStatus } from '../shared/ipc';

export class WebUIManager implements ITerminalDataBroadcaster {
  private static instance: WebUIManager;
  private webServer?: WebServer;
  private wsServer?: WebSocketTerminalServer;
  private tunnel?: CloudflareTunnel;
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
        this.wsServer.startIdleCleanup(); // Start idle session cleanup
        this.ptyManager.setWebSocketServer(this);
      }
      
      console.log('Web UI started successfully');
      
      // Start tunnel if enabled
      if (settings.tunnel?.enabled) {
        await this.startTunnel();
      }
    } catch (error) {
      console.error('Failed to start Web UI:', error);
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    this.ptyManager.setWebSocketServer(null);
    this.stopTunnel();
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
  
  // Tunnel management
  async startTunnel(): Promise<string> {
    if (!this.webServer?.isRunning()) {
      throw new Error('Web server must be running to start tunnel');
    }
    
    if (this.tunnel?.isRunning()) {
      return this.tunnel.getUrl()!;
    }
    
    // Check if cloudflared is available
    const available = await CloudflareTunnel.isAvailable();
    if (!available) {
      throw new Error('cloudflared is not installed. Install it from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
    }
    
    this.tunnel = new CloudflareTunnel();
    
      const port = this.webServer.getPort();
      const settings = this.store.getSettings().webUI;
      const url = await this.tunnel.start(port, settings?.tunnel);
    
    // Update web server with tunnel info
    this.webServer.setTunnelInfo({ running: true, url });
    
    console.log(`Cloudflare tunnel started: ${url}`);
    return url;
  }
  
  stopTunnel(): void {
    if (this.tunnel) {
      this.tunnel.stop();
      this.tunnel = undefined;
      this.webServer?.setTunnelInfo({ running: false });
      console.log('Cloudflare tunnel stopped');
    }
  }
  
  getTunnelStatus(): { running: boolean; url?: string; error?: string } {
    if (!this.tunnel) {
      return { running: false };
    }
    return this.tunnel.getStatus();
  }
  
  isTunnelRunning(): boolean {
    return this.tunnel?.isRunning() ?? false;
  }

  async getStatus(): Promise<WebUIStatus> {
    const settings = this.store.getSettings().webUI;

    if (!settings) {
      return {
        running: false,
        port: 3000,
        pin: '',
        addresses: []
      };
    }

    if (!this.webServer?.isRunning()) {
      const localUrl = `http://localhost:${settings.port}`;
      return {
        running: false,
        port: settings.port,
        pin: settings.pin || '',
        url: settings.tunnel?.mode === 'named' && settings.tunnel.hostname
          ? `https://${settings.tunnel.hostname}`
          : localUrl,
        localUrl,
        addresses: [],
        tunnel: this.getTunnelStatus()
      };
    }

    const serverStatus = await this.webServer.getStatus();
    const tunnelStatus = this.getTunnelStatus();

    return {
      running: serverStatus.running,
      port: serverStatus.port,
      pin: settings.pin || '',
      url: tunnelStatus.url || serverStatus.url,
      localUrl: serverStatus.url,
      addresses: serverStatus.addresses,
      qrCode: serverStatus.qrCode,
      tunnel: tunnelStatus
    };
  }
}
