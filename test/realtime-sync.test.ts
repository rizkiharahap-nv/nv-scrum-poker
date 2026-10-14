/**
 * Slice 3 acceptance test — real-time participant sync via the chosen transport
 * (t_41af4f4d; PRD AC-F5.3, AC-F5.6; architecture §7.2, ADR-001 rev 3).
 *
 * The transport layer itself (native WebSocket + backoff reconnect,
 * room:state → Svelte runes store, room:resume re-sync on reconnect) landed
 * with slice 2; join/leave propagation (AC-F5.1/F5.2) is covered by
 * test/join-presence.test.ts. This file covers the remaining DoD of the
 * real-time sync card:
 *
 *   1. AC-F5.3 — a vote submission by one client updates "X of N voted"
 *      (votedCount/totalCount) on every OTHER client in real time (≤2s) via a
 *      `room:state` broadcast, with NO vote values present in the payload
 *      (face-down guarantee AC-F2.3: `votes`/`consensus` are structurally
 *      absent while phase === 'voting').
 *   2. AC-F5.6 — no client uses polling: static scan of apps/web/src finds no
 *      `fetch` / `XMLHttpRequest` / `axios` / `setInterval` (code inspection
 *      made executable).
 *
 * Protocol-level integration over the Node ws test adapter (same JSON envelope
 * + ack + room:state contract as the Cloudflare DO path).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { startTestServer } from '../apps/server/src/index';
import type { RoomState } from '@scrum-poker/room';

let server: {
  port: number;
  close: () => Promise<void>;
  flushLeaveTimers: () => void;
  fireLeaveTimers: () => void;
} | null = null;

beforeAll(async () => {
  server = await startTestServer({ port: 0, leaveGraceMs: 60_000 });
});

afterAll(async () => {
  await server?.close();
});

interface PendingAck {
  resolve: (msg: Record<string, unknown>) => void;
  reject: (err: Error) => void;
}

/** Minimal scripted WS client using the same JSON envelope + ack contract. */
class TestClient {
  ws: WebSocket | null = null;
  private pending = new Map<string, PendingAck>();
  states: RoomState[] = [];
  url: string;

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

  request(type: string, payload: unknown): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = `t${Math.random().toString(36).slice(2)}`;
      this.pending.set(id, { resolve, reject });
      this.ws?.send(JSON.stringify({ id, type, payload }));
    });
  }

  /** Wait until `states` contains a snapshot satisfying `pred` (poll ≤ timeout). */
  async waitForState(pred: (s: RoomState) => boolean, timeoutMs = 2000): Promise<RoomState> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = this.states.find(pred);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`waitForState timed out after ${timeoutMs}ms`);
  }

  private handleMessage(raw: string): void {
    const msg = JSON.parse(raw) as { id: string; type: string; payload?: RoomState };
    if (msg.type === 'room:state') {
      this.states.push(msg.payload as RoomState);
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

describe('real-time participant sync via chosen transport (slice 3)', () => {
  it('AC-F5.3: vote submission updates "X of N" on the other client ≤2s without revealing values', async () => {
    const host = new TestClient();
    await host.connect();
    const createAck = (await host.request('room:create', { name: 'Host' })) as {
      ok: boolean;
      roomId?: string;
    };
    expect(createAck.ok).toBe(true);
    const roomId = createAck.roomId!;

    const guest = new TestClient();
    await guest.connect();
    const joinAck = (await guest.request('room:join', { roomId, name: 'Guest' })) as {
      ok: boolean;
      state?: RoomState;
    };
    expect(joinAck.ok).toBe(true);
    // Both clients converge to 2 participants via the join broadcast (AC-F5.1).
    await host.waitForState((s) => s.participants.length === 2, 2000);

    // Host submits a vote (protocol-level equivalent of a card click, AC-F2.2).
    const t0 = Date.now();
    const voteAck = (await host.request('vote:submit', { value: 5 })) as {
      ok: boolean;
      state?: RoomState;
    };
    expect(voteAck.ok).toBe(true);
    expect(voteAck.state?.votedCount).toBe(1);

    // Guest sees "1 of 2 voted" via room:state broadcast — no refresh, ≤2s.
    const guestState = await guest.waitForState(
      (s) => s.votedCount === 1 && s.totalCount === 2,
      2000,
    );
    expect(Date.now() - t0).toBeLessThanOrEqual(2000);
    expect(guestState.votedCount).toBe(1);
    expect(guestState.totalCount).toBe(2);

    // Face-down guarantee (AC-F2.3): while phase === 'voting' the broadcast
    // carries NO votes and NO consensus — no value text can leak to any client.
    expect(guestState.phase).toBe('voting');
    expect(guestState.votes).toBeUndefined();
    expect(guestState.consensus).toBeUndefined();

    // The host's own counter converges too (ack state), without values.
    expect(voteAck.state?.phase).toBe('voting');
    expect(voteAck.state?.votes).toBeUndefined();
    expect(voteAck.state?.consensus).toBeUndefined();

    host.close();
    guest.close();
  });

  it('AC-F5.6: client code contains no polling (fetch / XHR / axios / setInterval)', () => {
    const root = fileURLToPath(new URL('../apps/web/src', import.meta.url));
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|svelte|js)$/.test(entry)) files.push(full);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(0);

    // Polling primitives are banned by constitution + AC-F5.6; all live
    // updates must arrive via the realtime transport (room:state broadcasts).
    const banned = /\b(fetch|XMLHttpRequest|axios|setInterval)\s*\(/;
    const offenders = files.filter((f) => banned.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
