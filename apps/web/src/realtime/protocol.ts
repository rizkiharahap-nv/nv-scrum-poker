/**
 * Client-side protocol helpers (architecture §7, ADR-001 rev 3 technical contract).
 * Envelope `{ id, type, payload }` + ack matching. Framework-agnostic plain TS.
 */

import type { Envelope, ClientCommand, Ack } from '@scrum-poker/protocol';

let nextId = 0;

/** Generate a unique request id for this client session. */
export function requestId(): string {
  nextId += 1;
  return `c${Date.now().toString(36)}-${nextId.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Build a client→server command envelope. */
export function command<TType extends ClientCommand['type'], TPayload>(type: TType, payload: TPayload): Envelope<TType, TPayload> {
  return { id: requestId(), type, payload };
}

/** Parse an inbound server message (ack or broadcast). */
export function parseServerMessage(raw: string): Ack | Envelope<'room:state', import('@scrum-poker/room').RoomState> | null {
  try {
    const data = JSON.parse(raw) as Ack | Envelope<'room:state', import('@scrum-poker/room').RoomState>;
    if (data && typeof data === 'object' && typeof data.type === 'string') return data;
    return null;
  } catch {
    return null;
  }
}
