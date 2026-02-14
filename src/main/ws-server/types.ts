import type { TerminalStatus } from '@shared/types';
import type { WebSocket } from 'ws';

export type WsMessageType = 'subscribe' | 'unsubscribe' | 'input' | 'resize' | 'output' | 'status' | 'error';

export interface WebSocketMessage {
  type: WsMessageType;
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
