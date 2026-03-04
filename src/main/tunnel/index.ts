import { spawn, ChildProcess } from 'child_process';

export interface TunnelStatus {
  running: boolean;
  url?: string;
  error?: string;
}

export interface TunnelEvents {
  onUrlReceived?: (url: string) => void;
  onError?: (error: string) => void;
  onExit?: (code: number | null) => void;
}

/**
 * Cloudflare Quick Tunnel manager
 * Spawns cloudflared to create an ephemeral public URL for the local webserver
 */
export class CloudflareTunnel {
  private process?: ChildProcess;
  private url?: string;
  private events: TunnelEvents = {};
  private starting = false;

  /**
   * Check if cloudflared is available on the system
   */
  static async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const checkProcess = spawn('cloudflared', ['--version'], { 
        windowsHide: true,
        timeout: 5000 
      });
      
      checkProcess.on('error', () => resolve(false));
      checkProcess.on('close', (code) => resolve(code === 0));
      
      // Timeout fallback
      setTimeout(() => {
        checkProcess.kill();
        resolve(false);
      }, 3000);
    });
  }

  /**
   * Set event handlers
   */
  setEvents(events: TunnelEvents): void {
    this.events = events;
  }

  /**
   * Start the tunnel
   * @param localPort The local port to tunnel to
   * @returns Promise that resolves with the public URL
   */
  async start(localPort: number): Promise<string> {
    if (this.process) {
      throw new Error('Tunnel is already running');
    }

    if (this.starting) {
      throw new Error('Tunnel is already starting');
    }

    this.starting = true;
    this.url = undefined;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stop();
        reject(new Error('Timeout waiting for tunnel URL (30s)'));
      }, 30000);

      // Spawn cloudflared with quick tunnel
      this.process = spawn('cloudflared', [
        'tunnel',
        '--url', `http://localhost:${localPort}`
      ], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.process.on('error', (err) => {
        clearTimeout(timeout);
        this.starting = false;
        const errorMsg = `Failed to start cloudflared: ${err.message}`;
        this.events.onError?.(errorMsg);
        reject(new Error(errorMsg));
      });

      this.process.on('exit', (code) => {
        clearTimeout(timeout);
        this.starting = false;
        this.process = undefined;
        this.events.onExit?.(code);
      });

      // Parse stdout for tunnel URL
      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        const url = this.parseTunnelUrl(output);
        
        if (url) {
          clearTimeout(timeout);
          this.url = url;
          this.starting = false;
          this.events.onUrlReceived?.(url);
          resolve(url);
        }
      });

      // Also check stderr (cloudflared sometimes outputs there)
      this.process.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        const url = this.parseTunnelUrl(output);
        
        if (url) {
          clearTimeout(timeout);
          this.url = url;
          this.starting = false;
          this.events.onUrlReceived?.(url);
          resolve(url);
        }
      });
    });
  }

  /**
   * Stop the tunnel
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
      this.url = undefined;
      this.starting = false;
    }
  }

  /**
   * Get current tunnel status
   */
  getStatus(): TunnelStatus {
    if (this.starting) {
      return { running: false, error: 'Tunnel is starting...' };
    }
    
    if (!this.process) {
      return { running: false };
    }

    return {
      running: true,
      url: this.url
    };
  }

  /**
   * Check if tunnel is running
   */
  isRunning(): boolean {
    return !!this.process && !this.starting;
  }

  /**
   * Get the tunnel URL if available
   */
  getUrl(): string | undefined {
    return this.url;
  }

  /**
   * Parse cloudflared output to extract tunnel URL
   */
  private parseTunnelUrl(output: string): string | undefined {
    // Match patterns like:
    // https://xxx-xxx-xxx.trycloudflare.com
    // Your quick Tunnel has been created! Visit it at: https://xxx.trycloudflare.com
    const patterns = [
      /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi,
      /(https:\/\/[^\s]+\.trycloudflare\.com)/i
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match && match[0]) {
        // Clean up the URL (remove trailing chars like . or :)
        let url = match[0];
        // Remove trailing punctuation
        url = url.replace(/[.,:;]+$/, '');
        return url;
      }
    }

    return undefined;
  }
}
