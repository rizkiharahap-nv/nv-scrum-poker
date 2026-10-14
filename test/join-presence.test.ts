/**
 * Slice 2 acceptance test — join via link + real-time presence
 * (tasks.md slice 2; PRD AC-F5.1/F5.2/F5.5, AC-F1.5 join half, AC-F1.6).
 *
 * Integration over the Node ws test adapter (in-process):
 *   1. AC-F5.1 — client A creates, client B joins by link; A shows B ≤2s
 *      without refresh (room:state broadcast).
 *   2. AC-F5.2 — B closes their tab; A shows B as gone ≤10s (grace eviction).
 *   3. AC-F5.5 / PRD decision 5 — after a join, a fresh connection that
 *      re-sends room:resume with the SAME participantId re-binds the same
 *      identity (participant count unchanged, same id), even during the grace
 *      window (refresh-like behavior).
 *
 * Remembered-name prefill + join-gate safety (AC-F1.5/F1.6) live in
 * test/dom/join-gate.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { startTestServer } from '../apps/server/src/index';

let server: {
  port: number;
  close: () => Promise<void>;
  flushLeaveTimers: () => void;
  fireLeaveTimers: () => void;
} | null = null;

// A large grace keeps participants listed while we assert resume behaviour;
// eviction is asserted deterministically via flushLeaveTimers().
const LEAVE_GRACE_MS = 60_000;

beforeAll(async () => {
  server = await startTestServer({ port: 0, leaveGraceMs: LEAVE_GRACE_MS });
});

afterAll(async () => {
  await server?.close();
});

interface PendingAck {
  resolve: (msg: unknown) => void;
  reject: (err: Error) => void;
}

/** Minimal scripted WS client using the same JSON envelope + ack contract. */
class TestClient {
  ws: WebSocket | null = null;
  private pending = new Map<string, PendingAck>();
  states: import('@scrum-poker/room').RoomState[] = [];
  url: string;
  participantId: string | null = null;

  constructor(url = `ws://127.0.0.1:${server!.port}/ws`) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
      this.ws.on('message', (data) => this.handleMessage(String(data)));
    });
  }

  request(type: string, payload: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = `t${Math.random().toString(36).slice(2)}`;
      this.pending.set(id, { resolve, reject });
      this.ws?.send(JSON.stringify({ id, type, payload }));
    });
  }

  /** Wait until `states` contains a snapshot satisfying `pred` (poll ≤ timeout). */
  async waitForState(
    pred: (s: import('@scrum-poker/room').RoomState) => boolean,
    timeoutMs = 2000,
  ): Promise<import('@scrum-poker/room').RoomState> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = this.states.find(pred);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`waitForState timed out after ${timeoutMs}ms`);
  }

  private handleMessage(raw: string): void {
    const msg = JSON.parse(raw) as { id: string; type: string; payload?: unknown };
    if (msg.type === 'room:state') {
      this.states.push(msg.payload as import('@scrum-poker/room').RoomState);
      return;
    }
    const pending = this.pending.get(msg.id);
    if (pending) {
      this.pending.delete(msg.id);
      pending.resolve(msg);
    }
  }

  close(): void {
    this.ws?.close();
  }
}

describe('join via link + real-time presence (slice 2)', () => {
  it('AC-F5.1: host creates, guest joins by link, host sees guest ≤2s without refresh', async () => {
    const host = new TestClient();
    await host.connect();
    const createAck = (await host.request('room:create', { name: 'Host' })) as {
      ok: boolean;
      roomId?: string;
      participantId?: string;
      state?: import('@scrum-poker/room').RoomState;
    };
    expect(createAck.ok).toBe(true);
    const roomId = createAck.roomId!;

    // Guest opens the invite link → join gate → explicit submit (AC-F1.4/F1.6)
    const guest = new TestClient();
    await guest.connect();
    const joinAck = (await guest.request('room:join', { roomId, name: 'Guest' })) as {
      ok: boolean;
      roomId?: string;
      participantId?: string;
      isHost?: boolean;
      state?: import('@scrum-poker/room').RoomState;
    };
    expect(joinAck.ok).toBe(true);
    expect(joinAck.isHost).toBe(false);
    expect(joinAck.roomId).toBe(roomId);
    expect(joinAck.state?.participants).toHaveLength(2);

    // Host sees the guest without refresh (room:state broadcast) — ≤2s (AC-F5.1)
    const t0 = Date.now();
    const hostState = await host.waitForState((s) => s.participants.some((p) => p.name === 'Guest'), 2000);
    expect(hostState.participants.map((p) => p.name)).toContain('Guest');
    expect(Date.now() - t0).toBeLessThanOrEqual(2000);

    host.close();
    guest.close();
  });

  it('AC-F5.5: room:resume with the SAME participantId re-binds identity (refresh keeps it)', async () => {
    const host = new TestClient();
    await host.connect();
    const createAck = (await host.request('room:create', { name: 'Host' })) as {
      ok: boolean;
      roomId?: string;
      participantId?: string;
    };
    const roomId = createAck.roomId!;

    // Guest joins → gets a participantId (device-side session, PRD decision 5)
    const guest = new TestClient();
    await guest.connect();
    const joinAck = (await guest.request('room:join', { roomId, name: 'Guest' })) as {
      ok: boolean;
      participantId?: string;
      state?: import('@scrum-poker/room').RoomState;
    };
    const guestPid = joinAck.participantId!;
    expect(joinAck.state?.participants).toHaveLength(2);

    // Guest closes the tab (disconnect) — participant stays during grace (no
    // eviction yet; refresh within the window keeps the SAME identity).
    guest.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(host.states.at(-1)?.participants).toHaveLength(2); // still listed

    // "Reload": a fresh connection sends room:resume with the SAME participantId
    const guest2 = new TestClient();
    await guest2.connect();
    const resumeAck = (await guest2.request('room:resume', { roomId, participantId: guestPid })) as {
      ok: boolean;
      participantId?: string;
      isHost?: boolean;
      state?: import('@scrum-poker/room').RoomState;
    };
    expect(resumeAck.ok).toBe(true);
    expect(resumeAck.participantId).toBe(guestPid); // identity preserved
    expect(resumeAck.isHost).toBe(false);
    expect(resumeAck.state?.participants).toHaveLength(2); // not duplicated

    // After grace the participant is NOT evicted (resume cancelled the timer).
    server!.fireLeaveTimers();
    expect(host.states.at(-1)?.participants).toHaveLength(2);

    host.close();
    guest2.close();
  });

  it('AC-F5.2: closing the tab removes the participant ≤10s (grace eviction)', async () => {
    const host = new TestClient();
    await host.connect();
    const createAck = (await host.request('room:create', { name: 'Host' })) as { ok: boolean; roomId?: string };
    const roomId = createAck.roomId!;

    const guest = new TestClient();
    await guest.connect();
    await guest.request('room:join', { roomId, name: 'Guest' });
    await host.waitForState((s) => s.participants.length === 2, 2000);

    // Guest closes the tab.
    guest.close();
    await new Promise((r) => setTimeout(r, 50));

    // Not evicted yet (grace window) — the host still shows 2.
    expect(host.states.at(-1)?.participants).toHaveLength(2);

    // Fire the eviction (simulates leaveGraceMs elapsing, which is < 10s in
    // production; here we assert the mechanism deterministically).
    const t0 = Date.now();
    server!.fireLeaveTimers();
    await host.waitForState((s) => s.participants.length === 1, 2000);
    expect(Date.now() - t0).toBeLessThanOrEqual(2000);
    expect(host.states.at(-1)?.participants.map((p) => p.name)).toEqual(['Host']);

    // Ephemeral rooms: when the LAST connection leaves, the room is deleted —
    // a later open of the link shows "Room not found" (architecture §4.1).
    host.close();
    await new Promise((r) => setTimeout(r, 50));
    server!.fireLeaveTimers();
    const late = new TestClient();
    await late.connect();
    const joinAck = (await late.request('room:join', { roomId, name: 'Late' })) as { ok: boolean; error?: { code: string } };
    expect(joinAck.ok).toBe(false);
    expect(joinAck.error?.code).toBe('ROOM_NOT_FOUND');
    late.close();
  });
});
