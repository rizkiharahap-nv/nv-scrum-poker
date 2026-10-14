/**
 * Slice 1 acceptance test — room creation + 6-digit invite code
 * (tasks.md slice 1; PRD AC-F1.1..F1.6; CR-2026-08-18-06).
 *
 * 1. Unit — the room-code generator (apps/web/src/logic/token.ts) produces
 *    exactly 6 ASCII digits (`/^\d{6}$/`), preserves leading zeros, is
 *    crypto-random (two calls differ, not sequential), and is uniform over
 *    [0, 999999] (rejection sampling — no modulo bias).
 * 2. Integration — walking skeleton over the Node ws test adapter (in-process):
 *    connect → create → join → vote → reveal → reset, with room:state
 *    broadcasts. Invite URL shape `/r/<roomId>`.
 * 3. Collision semantics (AC-F1.2 / architecture §5): `room:create` on an
 *    occupied code acks ROOM_NOT_FOUND and NEVER overwrites the live room
 *    (a guessed/occupied code never grants entry); a join to an occupied code
 *    still finds the original room.
 *
 * Remembered-name prefill (AC-F1.5/F1.6) lives in test/dom/remembered-name.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { startTestServer } from '../apps/server/src/index';
import { generateRoomCode, formatRoomCode } from '../apps/web/src/logic/token';

let server: { port: number; close: () => Promise<void> } | null = null;

beforeAll(async () => {
  server = await startTestServer({ port: 0 });
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

describe('room-code generator (AC-F1.2, CR-2026-08-18-06)', () => {
  it('generates exactly 6 ASCII digits', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('preserves leading zeros (roomId stays a string, never coerced)', () => {
    // Rejection sampling over [0, 999999] must be able to produce codes whose
    // numeric value is < 100000; the generator zero-pads them to 6 digits.
    // Deterministic check: force the sample to a small value via the exported
    // formatter used by the generator.
    expect(formatRoomCode(0)).toBe('000000');
    expect(formatRoomCode(123)).toBe('000123');
    expect(formatRoomCode(999999)).toBe('999999');
    // The property over random draws: any code with a leading zero is still a
    // 6-char string — exercising the full generator range.
    let sawLeadingZero = false;
    for (let i = 0; i < 2000; i++) {
      const code = generateRoomCode();
      if (code.startsWith('0')) sawLeadingZero = true;
    }
    expect(sawLeadingZero).toBe(true);
  });

  it('two calls differ (not sequential, not derivable from count)', () => {
    const a = generateRoomCode();
    const b = generateRoomCode();
    expect(a).not.toBe(b);
    const gap = Math.abs(Number(a) - Number(b));
    expect(gap).toBeGreaterThan(0);
    // Not sequential: consecutive draws are not +1.
    expect(gap).not.toBe(1);
  });

  it('rejection-sampling uniformity spot-check (no modulo-bias artifacts)', () => {
    // Bucket width 100 divides 1_000_000 evenly → exactly 10_000 buckets of
    // 100 codes each (codes 0..999999). A modulo-bias generator overdraws
    // whole buckets (e.g. all codes >= 4_000_000 if it forgot to reject),
    // which this test would catch; a uniform generator keeps every bucket
    // within noise. 50k samples into 10k buckets → mean 5, σ≈2.2; a ±6σ band
    // (~19) has a Poisson(5) tail ≈ 1e-9 per bucket — flake-proof while still
    // catching a bias that shifts whole buckets by dozens of counts.
    const N = 50_000;
    const bucketCount = 10_000;
    const bucket = (value: number) => Math.floor(value / 100);
    const counts = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      const value = Number(generateRoomCode());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(999_999);
      const b = bucket(value);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(9_900);
    const mean = N / bucketCount;
    const sigma = Math.sqrt(N * (1 / bucketCount) * (1 - 1 / bucketCount));
    for (const count of counts.values()) {
      expect(count).toBeLessThan(mean + 6 * sigma);
      expect(count).toBeGreaterThan(mean - 6 * sigma);
    }
    // The drawn width is large enough that high values near 999999 are
    // reachable (rejection sampling does not cap at a power-of-ten boundary).
    const high = [...counts.keys()].filter((b) => b * 100 > 900_000);
    expect(high.length).toBeGreaterThan(0);
  });
});

describe('walking skeleton over the Node ws test adapter (in-process)', () => {
  async function createAndReturn(): Promise<{ client: TestClient; roomId: string; participantId: string }> {
    const c = new TestClient();
    await c.connect();
    const createAck = (await c.request('room:create', { name: 'Host' })) as {
      ok: boolean;
      roomId?: string;
      participantId?: string;
      isHost?: boolean;
      state?: import('@scrum-poker/room').RoomState;
    };
    expect(createAck.ok).toBe(true);
    expect(createAck.roomId).toBeTruthy();
    expect(createAck.isHost).toBe(true);
    expect(createAck.state?.roomId).toBe(createAck.roomId);
    c.participantId = createAck.participantId ?? null;
    return { client: c, roomId: createAck.roomId!, participantId: createAck.participantId! };
  }

  it('connects → creates → joins → votes → reveals → resets with room:state broadcasts', async () => {
    const { client: host, roomId } = await createAndReturn();
    // invite URL shape (AC-F1.3): /r/<6-digit code>
    expect(roomId).toMatch(/^\d{6}$/);
    expect(`/r/${roomId}`).toMatch(/^\/r\/\d{6}$/);

    // Guest joins by link (AC-F1.4 join gate; room:join over same /ws)
    const guest = new TestClient();
    await guest.connect();
    const joinAck = (await guest.request('room:join', { roomId, name: 'Guest' })) as {
      ok: boolean;
      participantId?: string;
      isHost?: boolean;
      state?: import('@scrum-poker/room').RoomState;
    };
    expect(joinAck.ok).toBe(true);
    expect(joinAck.isHost).toBe(false);
    expect(joinAck.state?.participants).toHaveLength(2);
    expect(joinAck.state?.totalCount).toBe(2);

    // Host sees the guest ≤2s (broadcast arrives without refresh — AC-F5.1)
    await new Promise((r) => setTimeout(r, 50));
    expect(host.states.at(-1)?.participants).toHaveLength(2);

    // Vote phase: no values in state (face-down, AC-F2.3)
    expect(host.states.at(-1)?.phase).toBe('voting');
    expect(host.states.at(-1)?.votes).toBeUndefined();
    expect(host.states.at(-1)?.consensus).toBeUndefined();

    // vote:submit (last-wins, AC-F2.4) — host submits 5 then 8
    await host.request('vote:submit', { value: 5 });
    await host.request('vote:submit', { value: 8 });
    const guestVote = await guest.request('vote:submit', { value: 5 });
    expect((guestVote as { ok: boolean }).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(host.states.at(-1)?.votedCount).toBe(2);
    expect(host.states.at(-1)?.votes).toBeUndefined(); // still voting → face-down

    // room:reveal (any participant — guest triggers; AC-F3.1/F3.2)
    const reveal = await guest.request('room:reveal', {});
    expect((reveal as { ok: boolean }).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    const revealed = host.states.at(-1)!;
    expect(revealed.phase).toBe('revealed');
    // last-wins: host's final value is 8 (AC-F2.4)
    const hostVote = revealed.votes?.find((v) => v.participantId === host.participantId);
    expect(hostVote?.value).toBe(8);
    // distribution: { '8': 1, '5': 1 } → no consensus
    expect(revealed.consensus?.hasConsensus).toBe(false);

    // room:reset (any participant; AC-F4.3) — clears votes back to voting
    const reset = await host.request('room:reset', {});
    expect((reset as { ok: boolean }).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    const resetState = host.states.at(-1)!;
    expect(resetState.phase).toBe('voting');
    expect(resetState.votedCount).toBe(0);
    expect(resetState.participants).toHaveLength(2); // participants unchanged

    host.close();
    guest.close();
  });

  it('room:create with an invalid name acks NAME_INVALID', async () => {
    const c = new TestClient();
    await c.connect();
    const ack = (await c.request('room:create', { name: '   ' })) as { ok: boolean; error?: { code: string } };
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe('NAME_INVALID');
    c.close();
  });

  it('room:join to a missing room acks ROOM_NOT_FOUND', async () => {
    const c = new TestClient();
    await c.connect();
    const ack = (await c.request('room:join', { roomId: 'no-such-room', name: 'X' })) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe('ROOM_NOT_FOUND');
    c.close();
  });

  it('room:create on an occupied code acks ROOM_NOT_FOUND and never overwrites (AC-F1.2 collision)', async () => {
    const { client: host, roomId } = await createAndReturn();
    expect(roomId).toMatch(/^\d{6}$/);

    // Second client supplies the SAME occupied code (mirrors the DO path,
    // where the code is fixed by `/ws?room=<code>` before room:create) and
    // tries to create on it.
    const second = new TestClient();
    await second.connect();
    const collideAck = (await second.request('room:create', { roomId, name: 'Sneaky' })) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(collideAck.ok).toBe(false);
    expect(collideAck.error?.code).toBe('ROOM_NOT_FOUND');

    // The live room is untouched: a join still finds the ORIGINAL host room.
    const guest = new TestClient();
    await guest.connect();
    const joinAck = (await guest.request('room:join', { roomId, name: 'Guest' })) as {
      ok: boolean;
      participantId?: string;
      state?: import('@scrum-poker/room').RoomState;
    };
    expect(joinAck.ok).toBe(true);
    expect(joinAck.state?.participants).toHaveLength(2);
    // The original host is still in the room (not replaced by the collider).
    expect(joinAck.state?.participants.map((p) => p.id)).toContain(host.participantId);

    host.close();
    second.close();
    guest.close();
  });
});
