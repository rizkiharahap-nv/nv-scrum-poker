/**
 * roomChannel — room-scoped subscribe → runes mirror + ack matching (~60 lines).
 * Subscribes `room:state` broadcasts into the store; sends commands with acks.
 */

import { Transport } from './transport';
import { command, parseServerMessage } from './protocol';
import type { Ack, ClientCommand } from '@scrum-poker/protocol';
import type { RoomState } from '@scrum-poker/room';

export type RoomChannelStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface RoomChannelHandlers {
  onState?: (state: RoomState) => void;
  onStatusChange?: (status: RoomChannelStatus) => void;
  /** Fired when a reconnect resync fails (SESSION_UNKNOWN / ROOM_NOT_FOUND). */
  onSessionLost?: () => void;
}

/**
 * A room command with its ack type — used for the automatic reconnect resync.
 */
type AckOf<T extends ClientCommand['type']> = Extract<Ack<T>, { ok: true }>;

export class RoomChannel {
  private readonly transport: Transport;
  private readonly pending = new Map<string, (ack: Ack) => void>();
  private closed = false;
  /** Identity to re-send via `room:resume` after an auto-reconnect (AC-F5.5). */
  private session: { roomId: string; participantId: string } | null = null;

  constructor(
    private readonly socketUrl: string,
    private readonly handlers: RoomChannelHandlers = {},
  ) {
    this.transport = new Transport(socketUrl, {
      onOpen: () => {
        if (!this.closed) {
          this.handlers.onStatusChange?.('connected');
          // After any (re)connect, re-bind the identity (AC-F5.5). This covers
          // both the first open (resume already sent by the caller — the ack
          // just confirms) and auto-reconnects after a drop (re-sync without a
          // reload).
          void this.resyncIfSession();
        }
      },
      onMessage: (raw) => this.handleRaw(raw),
      onStatusChange: (status) => {
        if (status === 'reconnecting') this.handlers.onStatusChange?.('reconnecting');
        else if (status === 'closed') this.handlers.onStatusChange?.('closed');
        else if (status === 'connecting') this.handlers.onStatusChange?.('connecting');
      },
    });
  }

  connect(): void {
    this.transport.connect();
  }

  close(): void {
    this.closed = true;
    this.transport.close();
  }

  get status(): RoomChannelStatus {
    const s = this.transport.currentStatus;
    if (s === 'open') return 'connected';
    if (s === 'reconnecting') return 'reconnecting';
    if (s === 'closed') return 'closed';
    return 'connecting';
  }

  /** Remember the acked identity so reconnect can re-bind it (AC-F5.5). */
  setSession(session: { roomId: string; participantId: string }): void {
    this.session = session;
  }

  /** Send a command and await its ack. Resolves `ok:true` ack or rejects with `{ code }`. */
  request<T extends ClientCommand['type']>(
    type: T,
    payload: Extract<ClientCommand, { type: T }>['payload'],
  ): Promise<AckOf<T>> {
    return new Promise((resolve, reject) => {
      const msg = command(type, payload);
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(new Error('server error: TIMEOUT'));
      }, RoomChannel.REQUEST_TIMEOUT_MS);
      this.pending.set(msg.id, (ack) => {
        clearTimeout(timer);
        if (ack.ok) resolve(ack as AckOf<T>);
        else reject(new Error(`server error: ${(ack as { error: { code: string } }).error.code}`));
      });
      this.transport.send(JSON.stringify(msg));
    });
  }

  /** Give up if the socket never opens (dev server down) or the ack never arrives. */
  static readonly REQUEST_TIMEOUT_MS = 12_000;

  private async resyncIfSession(): Promise<void> {
    if (!this.session) return;
    try {
      const ack = await this.request('room:resume', this.session);
      if (ack.state) this.handlers.onState?.(ack.state);
    } catch {
      // Session no longer valid (evicted / room gone) — surface so the UI can
      // drop the stored identity and show the join gate (AC-F1.4).
      this.handlers.onSessionLost?.();
    }
  }

  private handleRaw(raw: string): void {
    const msg = parseServerMessage(raw);
    if (!msg) return;
    if (msg.type === 'room:state') {
      this.handlers.onState?.((msg as { payload: RoomState }).payload);
      return;
    }
    const ack = msg as Ack;
    const resolve = this.pending.get(ack.id);
    if (resolve) {
      this.pending.delete(ack.id);
      resolve(ack);
    }
  }
}
