import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { TunnelSettings } from '../../shared/types';

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
  private generatedConfigPath?: string;
  private lastError?: string;

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
  async start(localPort: number, settings?: TunnelSettings): Promise<string> {
    if (this.process) {
      throw new Error('Tunnel is already running');
    }

    if (this.starting) {
      throw new Error('Tunnel is already starting');
    }

    this.starting = true;
    this.url = undefined;
    this.lastError = undefined;

    const mode = settings?.mode ?? 'quick';

    return new Promise(async (resolve, reject) => {
      let resolved = false;
      let commandOutput = '';

      const timeout = setTimeout(() => {
        this.stop();
        reject(new Error('Timeout waiting for tunnel URL (30s)'));
      }, 30000);

      const fail = (error: Error) => {
        if (resolved) {
          return;
        }

        clearTimeout(timeout);
        this.starting = false;
        this.lastError = error.message;
        reject(error);
      };

      const succeed = (url: string) => {
        if (resolved) {
          return;
        }

        resolved = true;
        clearTimeout(timeout);
        this.url = url;
        this.lastError = undefined;
        this.starting = false;
        this.events.onUrlReceived?.(url);
        resolve(url);
      };

      try {
        const args = await this.buildCommandArgs(localPort, settings);
        this.process = spawn('cloudflared', args, {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } catch (error) {
        clearTimeout(timeout);
        this.starting = false;
        reject(error instanceof Error ? error : new Error('Failed to prepare tunnel configuration'));
        return;
      }

      this.process.on('error', (err) => {
        const errorMsg = `Failed to start cloudflared: ${err.message}`;
        this.lastError = errorMsg;
        this.events.onError?.(errorMsg);
        fail(new Error(errorMsg));
      });

      this.process.on('exit', (code) => {
        clearTimeout(timeout);
        this.starting = false;
        this.process = undefined;
        const exitMessage = code === null
          ? 'cloudflared exited unexpectedly'
          : `cloudflared exited with code ${code}`;

        if (!resolved) {
          const details = commandOutput.trim();
          const combinedMessage = details ? `${exitMessage}: ${details}` : exitMessage;
          this.lastError = combinedMessage;
          reject(new Error(combinedMessage));
        }

        void this.cleanupGeneratedConfig();
        this.events.onExit?.(code);
      });

      const handleOutput = (output: string) => {
        commandOutput = `${commandOutput}${output}`.slice(-8000);

        if (mode === 'quick') {
          const url = this.parseTunnelUrl(output);
          if (url) {
            succeed(url);
          }
          return;
        }

        const configuredUrl = this.getNamedTunnelUrl(settings);
        if (configuredUrl && this.isNamedTunnelReady(output)) {
          succeed(configuredUrl);
        }
      };

      this.process.stdout?.on('data', (data: Buffer) => {
        handleOutput(data.toString());
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        handleOutput(data.toString());
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
    }

    this.url = undefined;
    this.starting = false;
    this.lastError = undefined;
    void this.cleanupGeneratedConfig();
  }

  /**
   * Get current tunnel status
   */
  getStatus(): TunnelStatus {
    if (this.starting) {
      return { running: false, error: 'Tunnel is starting...' };
    }
    
    if (!this.process) {
      return this.lastError ? { running: false, error: this.lastError } : { running: false };
    }

    return {
      running: true,
      url: this.url,
      error: this.lastError
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

  private async buildCommandArgs(localPort: number, settings?: TunnelSettings): Promise<string[]> {
    if ((settings?.mode ?? 'quick') === 'quick') {
      return [
        'tunnel',
        '--url', `http://localhost:${localPort}`
      ];
    }

    this.validateNamedTunnelSettings(settings);

    const configPath = await this.writeNamedTunnelConfig(localPort, settings);
    return [
      'tunnel',
      '--config', configPath,
      'run', settings.tunnelId
    ];
  }

  private validateNamedTunnelSettings(settings?: TunnelSettings): asserts settings is TunnelSettings & Required<Pick<TunnelSettings, 'tunnelId' | 'hostname' | 'credentialsFile'>> {
    if (!settings) {
      throw new Error('Named tunnel settings are missing');
    }

    const missingFields: string[] = [];
    if (!settings.tunnelId?.trim()) {
      missingFields.push('Tunnel ID');
    }
    if (!settings.hostname?.trim()) {
      missingFields.push('Hostname');
    }
    if (!settings.credentialsFile?.trim()) {
      missingFields.push('Credentials file');
    }

    if (missingFields.length > 0) {
      throw new Error(`Named tunnel requires: ${missingFields.join(', ')}`);
    }
  }

  private async writeNamedTunnelConfig(localPort: number, settings: TunnelSettings & Required<Pick<TunnelSettings, 'tunnelId' | 'hostname' | 'credentialsFile'>>): Promise<string> {
    const configDir = path.join(os.tmpdir(), 'terminal-orchestrator');
    await fs.mkdir(configDir, { recursive: true });

    const configPath = path.join(configDir, `cloudflared-${settings.tunnelId}.yml`);
    const hostname = settings.hostname.trim();
    const configContent = [
      `tunnel: ${settings.tunnelId.trim()}`,
      `credentials-file: ${settings.credentialsFile.replace(/\\/g, '/')}`,
      '',
      'ingress:',
      `  - hostname: ${hostname}`,
      `    service: http://localhost:${localPort}`,
      '    originRequest:',
      `      httpHostHeader: ${hostname}`,
      '  - service: http_status:404',
      ''
    ].join('\n');

    await fs.writeFile(configPath, configContent, 'utf-8');
    this.generatedConfigPath = configPath;

    return configPath;
  }

  private async cleanupGeneratedConfig(): Promise<void> {
    if (!this.generatedConfigPath) {
      return;
    }

    const configPath = this.generatedConfigPath;
    this.generatedConfigPath = undefined;

    await fs.unlink(configPath).catch(() => undefined);
  }

  private getNamedTunnelUrl(settings?: TunnelSettings): string | undefined {
    const hostname = settings?.hostname?.trim();
    return hostname ? `https://${hostname}` : undefined;
  }

  private isNamedTunnelReady(output: string): boolean {
    return /Registered tunnel connection/i.test(output);
  }
}
