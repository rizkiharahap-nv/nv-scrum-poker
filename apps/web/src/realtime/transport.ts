/**
 * Client transport — native WebSocket + backoff reconnect (ADR-001 rev 3).
 * ~50 lines, framework-agnostic. Auto-reconnects with backoff; the caller
 * re-syncs via `room:resume` / `room:join` on reconnect (AC-F5.5).
 */

export type TransportStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface TransportHandlers {
  onOpen?: () => void;
  onMessage?: (raw: string) => void;
  onClose?: () => void;
  onStatusChange?: (status: TransportStatus) => void;
}

const MAX_BACKOFF_MS = 5000;
const BASE_BACKOFF_MS = 250;

export class Transport {
  private ws: WebSocket | null = null;
  private status: TransportStatus = 'connecting';
  private backoff = BASE_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  /** Outbound frames queued while the socket is not OPEN (e.g. room:join sent right after connect). */
  private sendQueue: string[] = [];

  constructor(
    private readonly url: string,
    private readonly handlers: TransportHandlers = {},
  ) {}

  get currentStatus(): TransportStatus {
    return this.status;
  }

  connect(): void {
    this.closedByUser = false;
    this.openSocket();
  }

  private openSocket(): void {
    this.setStatus(this.ws ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = BASE_BACKOFF_MS;
      this.setStatus('open');
      // Flush anything queued while connecting (create/join/resume right after connect).
      const queued = this.sendQueue;
      this.sendQueue = [];
      for (const frame of queued) ws.send(frame);
      this.handlers.onOpen?.();
    };

    ws.onmessage = (event) => {
      this.handlers.onMessage?.(String(event.data));
    };

    ws.onclose = () => {
      if (this.closedByUser) {
        this.setStatus('closed');
        this.handlers.onClose?.();
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose follows; no-op here (avoid duplicate reconnect scheduling)
    };
  }

  private scheduleReconnect(): void {
    this.setStatus('reconnecting');
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }

  send(raw: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
      return;
    }
    // Not open yet (connecting/reconnecting): queue so the frame is not lost.
    // Closed-by-user drops instead — the caller is tearing down.
    if (!this.closedByUser) this.sendQueue.push(raw);
  }

  close(): void {
    this.closedByUser = true;
    this.sendQueue = [];
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.setStatus('closed');
  }

  private setStatus(status: TransportStatus): void {
    this.status = status;
    this.handlers.onStatusChange?.(status);
  }
}
