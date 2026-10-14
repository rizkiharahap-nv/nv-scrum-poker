/**
 * Slice 3 acceptance test — Fibonacci deck + face-down voting
 * (t_36bfd45c; PRD AC-F2.1..F2.5, AC-F3.5, AC-F5.3; tasks.md slice 3;
 * architecture §4.3, §7, §10).
 *
 * 1. Unit — `DECK` is EXACTLY [1,2,3,5,8,13,21] (AC-F2.1): no 0, no ½, no
 *    coffee/other values; pass is a SEPARATE non-numeric vote (AC-F3.5).
 * 2. Unit — `detectConsensus` excludes pass from consensus and from the numeric
 *    distribution; a round with only pass votes has no consensus verdict.
 * 3. Integration over the Node ws test adapter — A votes, B sees "X of N"
 *    update without any value text in the room:state payload (face-down,
 *    AC-F2.3/F2.5/F5.3); A changes their vote (last wins, AC-F2.4) — still no
 *    value text; pass counts toward X but not consensus.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { startTestServer } from '../apps/server/src/index';
import { DECK, PASS_VOTE, detectConsensus, isValidVote, type VoteValue } from '@scrum-poker/room';

let server: { port: number; close: () => Promise<void> } | null = null;

beforeAll(async () => {
  server = await startTestServer({ port: 0, leaveGraceMs: 60_000 });
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
  async waitForState(pred: (s: import('@scrum-poker/room').RoomState) => boolean, timeoutMs = 2000): Promise<import('@scrum-poker/room').RoomState> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = this.states.find(pred);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`waitForState timed out after ${timeoutMs}ms`);
  }

  private handleMessage(raw: string): void {
    const msg = JSON.parse(raw) as { id: string; type: string; payload?: import('@scrum-poker/room').RoomState };
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

describe('Fibonacci deck constant (AC-F2.1)', () => {
  it('is EXACTLY [1,2,3,5,8,13,21] — no 0, no ½, no coffee, no other values', () => {
    expect([...DECK]).toEqual([1, 2, 3, 5, 8, 13, 21]);
    // No 0, no half, no coffee, no 100, no 34 — exactly the 7 Phase-1 values.
    expect(DECK).toHaveLength(7);
    for (const v of [0, 0.5, 'coffee', '?', 34, 100] as const) {
      expect((DECK as readonly unknown[]).includes(v)).toBe(false);
    }
  });

  it('pass is a separate non-numeric vote, NOT part of the deck (AC-F3.5)', () => {
    expect(PASS_VOTE).toBe('pass');
    expect((DECK as readonly unknown[]).includes(PASS_VOTE)).toBe(false);
    expect(isValidVote(PASS_VOTE)).toBe(true);
    expect(isValidVote(0)).toBe(false);
    expect(isValidVote(0.5)).toBe(false);
    expect(isValidVote('coffee')).toBe(false);
    expect(isValidVote(5)).toBe(true);
  });
});

describe('consensus excludes pass (AC-F3.5)', () => {
  it('a pass vote is excluded from the distribution and blocks consensus only among numeric votes', () => {
    // Two numeric + one pass → consensus among the numeric pair at 5.
    const votes = new Map<string, VoteValue>([
      ['a', 5],
      ['b', 5],
      ['c', PASS_VOTE],
    ]);
    const consensus = detectConsensus(votes);
    expect(consensus.hasConsensus).toBe(true);
    expect(consensus.value).toBe(5);
    // Pass is absent from the numeric distribution.
    expect(consensus.distribution).toEqual({ '5': 2 });
  });

  it('a round with ONLY pass votes has no consensus verdict', () => {
    const votes = new Map<string, VoteValue>([
      ['a', PASS_VOTE],
      ['b', PASS_VOTE],
    ]);
    const consensus = detectConsensus(votes);
    expect(consensus.hasConsensus).toBe(false);
    expect(consensus.value).toBeNull();
    expect(consensus.distribution).toEqual({});
  });
});

describe('face-down voting over the Node ws test adapter (AC-F2.2..F2.5, AC-F5.3)', () => {
  it('A votes → B sees "X of N" update with NO value text; change vote keeps it face-down', async () => {
    const host = new TestClient();
    await host.connect();
    const createAck = (await host.request('room:create', { name: 'Host' })) as {
      ok: boolean;
      roomId?: string;
      participantId?: string;
    };
    expect(createAck.ok).toBe(true);
    const roomId = createAck.roomId!;

    const guest = new TestClient();
    await guest.connect();
    const joinAck = (await guest.request('room:join', { roomId, name: 'Guest' })) as { ok: boolean };
    expect(joinAck.ok).toBe(true);
    await host.waitForState((s) => s.participants.length === 2);

    // A (host) votes 5 → both clients converge to "1 of 2 voted" (AC-F2.5/F5.3).
    const voteAck = (await host.request('vote:submit', { value: 5 })) as {
      ok: boolean;
      state?: import('@scrum-poker/room').RoomState;
    };
    expect(voteAck.ok).toBe(true);
    expect(voteAck.state?.votedCount).toBe(1);
    expect(voteAck.state?.totalCount).toBe(2);

    const guestState = await guest.waitForState((s) => s.votedCount === 1 && s.totalCount === 2);
    // Face-down guarantee (AC-F2.3): no votes/consensus in the voting-phase payload.
    expect(guestState.phase).toBe('voting');
    expect(guestState.votes).toBeUndefined();
    expect(guestState.consensus).toBeUndefined();
    // Serialize the whole payload — no value field anywhere (QA assertion;
    // a leaked vote would appear as {"participantId":…,"value":…}).
    expect(JSON.stringify(guestState)).not.toContain('"value"');

    // A changes their vote 5 → 8 (AC-F2.4 last wins). B still sees only "1 of 2".
    const changeAck = (await host.request('vote:submit', { value: 8 })) as {
      ok: boolean;
      state?: import('@scrum-poker/room').RoomState;
    };
    expect(changeAck.ok).toBe(true);
    expect(changeAck.state?.votedCount).toBe(1);
    const statesBeforeChange = guest.states.length;
    const afterChange = await guest.waitForState(
      (s) => guest.states.indexOf(s) >= statesBeforeChange && s.votedCount === 1 && s.totalCount === 2,
    );
    expect(afterChange.votes).toBeUndefined();
    expect(JSON.stringify(afterChange)).not.toContain('"value"');

    // Reveal → the values DO appear (this is slice 4's territory, but it proves
    // last-wins is enforced server-side: host's revealed value is 8).
    const reveal = (await guest.request('room:reveal', {})) as { ok: boolean };
    expect(reveal.ok).toBe(true);
    const revealed = await host.waitForState((s) => s.phase === 'revealed');
    const hostVote = revealed.votes?.find((v) => v.participantId === createAck.participantId);
    expect(hostVote?.value).toBe(8);

    host.close();
    guest.close();
  });

  it('AC-F3.5: pass counts toward X of N but is excluded from consensus/distribution', async () => {
    const host = new TestClient();
    await host.connect();
    const createAck = (await host.request('room:create', { name: 'Host' })) as {
      ok: boolean;
      roomId?: string;
    };
    const roomId = createAck.roomId!;

    const guest = new TestClient();
    await guest.connect();
    await guest.request('room:join', { roomId, name: 'Guest' });
    await host.waitForState((s) => s.participants.length === 2);

    // Both pass → "2 of 2 voted" but no consensus on reveal (AC-F3.5).
    await host.request('vote:submit', { value: PASS_VOTE });
    await guest.request('vote:submit', { value: PASS_VOTE });
    const passed = await host.waitForState((s) => s.votedCount === 2);
    expect(passed.votes).toBeUndefined(); // still face-down

    await host.request('room:reveal', {});
    const revealed = await host.waitForState((s) => s.phase === 'revealed');
    expect(revealed.consensus?.hasConsensus).toBe(false);
    expect(revealed.consensus?.value).toBeNull();
    expect(revealed.consensus?.distribution).toEqual({});
    // Both values render as Pass (non-numeric).
    for (const v of revealed.votes ?? []) expect(v.value).toBe(PASS_VOTE);

    host.close();
    guest.close();
  });
});
