/**
 * Client room-channel singleton — one live WS connection per room view.
 * Landing (create), Join (join), and Room (resume) establish it; Room.svelte
 * reuses it to send commands (vote/reveal/reset in later slices) and keeps
 * receiving room:state broadcasts. On the Cloudflare path the token IS the
 * room id; on the Node test adapter the server generates the room id
 * (ack.roomId).
 *
 * `room:resume` re-sync is automatic on reconnect (AC-F5.5): the channel
 * remembers the last acked session (roomId + participantId) and re-sends
 * `room:resume` after every transport re-open; the ack's state is applied and
 * the pending eviction on the server is cancelled (grace-window identity).
 */

import { RoomChannel } from './roomChannel';
import { applyState, markSessionLost, room } from '../store/room.svelte';
import { clearStoredSession, setStoredSession } from '../store/session';

/**
 * Socket URL. On the Cloudflare production path the room token rides the query
 * string — `/ws?room=<token>` — because the Worker routes the upgrade to the
 * DO `idFromName(token)` (ADR-001 rev 3 routing §). The Node test adapter
 * serves bare `/ws` (server-generated room id), so dev keeps `VITE_SOCKET_URL`
 * override support (constitution: Node is test adapter only).
 */
function socketUrl(token: string): string {
  const base = (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? '/ws';
  const url = new URL(base, window.location.href);
  url.searchParams.set('room', token);
  return url.toString();
}

let channel: RoomChannel | null = null;

/** Establish (or re-establish) the room channel for `token` (used for /ws?room=). */
export function connectRoom(token: string): RoomChannel {
  if (channel) channel.close();
  channel = new RoomChannel(socketUrl(token), {
    onState: (state) => applyState(state, room.selfId),
    onStatusChange: (status) => {
      room.connected = status === 'connected';
    },
    onSessionLost: () => {
      // The server evicted us (long disconnect / room gone / process restart).
      // Drop the identity and stop reconnecting so the room view can recover.
      clearStoredSession();
      markSessionLost();
      disconnectRoom();
    },
  });
  channel.connect();
  return channel;
}

/**
 * Resume a stored session (AC-F5.5): connect the room channel, then send
 * `room:resume { roomId, participantId }`. Resolves with the ack. Used on
 * page load when sessionStorage holds a session for this room.
 */
export async function resumeRoom(roomId: string, participantId: string): Promise<void> {
  const ch = connectRoom(roomId);
  try {
    const ack = await ch.request('room:resume', { roomId, participantId });
    const session = { roomId: ack.roomId ?? roomId, participantId: ack.participantId ?? participantId };
    setStoredSession(session);
    ch.setSession(session);
    if (ack.state) applyState(ack.state, session.participantId);
  } catch (err) {
    clearStoredSession();
    markSessionLost();
    disconnectRoom();
    throw err;
  }
}

/**
 * Remember the identity after a successful create/join so an auto-reconnect
 * re-syncs without the user re-submitting the join gate (AC-F5.5).
 */
export function rememberSession(roomId: string, participantId: string): void {
  setStoredSession({ roomId, participantId });
  channel?.setSession({ roomId, participantId });
}

export function getChannel(): RoomChannel | null {
  return channel;
}

export function disconnectRoom(): void {
  channel?.close();
  channel = null;
}
