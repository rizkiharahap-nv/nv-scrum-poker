/**
 * Slice 5 acceptance test — simultaneous reveal + consensus detection
 * (t_b15998bd; PRD AC-F3.1..F3.5, AC-F4.1..F4.4, AC-F5.4; tasks.md slice 4+5;
 * architecture §4.3, §6, §7, §10).
 *
 * 1. Unit — `detectConsensus` for all-equal (AC-F4.1), all-different/mixed
 *    (AC-F4.2), single participant (AC-F4.4), pass-excluded (AC-F3.5).
 * 2. Integration over the Node ws test adapter:
 *    - ANY participant can reveal (AC-F3.1) and the single broadcast flips all
 *      submitted votes face-up (AC-F3.2/F3.3, AC-F5.4).
 *    - zero-vote guard (AC-F3.4): room:reveal with no votes acks ZERO_VOTES.
 *    - no-consensus reveal → Re-vote (room:reset) by ANY participant clears
 *      votes, returns to voting, participants unchanged (AC-F4.3).
 *    - consensus on all-equal reveal; distribution on mixed.
 *    - leaver votes ignored (decision 7): excluded from X/distribution after
 *      grace eviction.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { startTestServer } from '../apps/server/src/index';
import { PASS_VOTE, detectConsensus, type VoteValue } from '@scrum-poker/room';

let server: {
  port: number;
  close: () => Promise<void>;
  fireLeaveTimers: () => void;
} | null = null;

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

describe('consensus detection (AC-F4.1..F4.4, AC-F3.5)', () => {
  it('AC-F4.1: all-equal numeric votes ⇒ consensus at that value', () => {
    const consensus = detectConsensus(
      new Map<string, VoteValue>([
        ['a', 5],
        ['b', 5],
        ['c', 5],
      ]),
    );
    expect(consensus.hasConsensus).toBe(true);
    expect(consensus.value).toBe(5);
    expect(consensus.distribution).toEqual({ '5': 3 });
  });

  it('AC-F4.2: all-different votes ⇒ no consensus + distribution', () => {
    const consensus = detectConsensus(
      new Map<string, VoteValue>([
        ['a', 1],
        ['b', 3],
        ['c', 8],
      ]),
    );
    expect(consensus.hasConsensus).toBe(false);
    expect(consensus.value).toBeNull();
    expect(consensus.distribution).toEqual({ '1': 1, '3': 1, '8': 1 });
  });

  it('AC-F4.2: mixed votes (one pair + outlier) ⇒ no consensus + distribution', () => {
    const consensus = detectConsensus(
      new Map<string, VoteValue>([
        ['a', 5],
        ['b', 5],
        ['c', 8],
      ]),
    );
    expect(consensus.hasConsensus).toBe(false);
    expect(consensus.value).toBeNull();
    expect(consensus.distribution).toEqual({ '5': 2, '8': 1 });
  });

  it('AC-F4.4: single participant ⇒ trivially consensus', () => {
    const consensus = detectConsensus(new Map<string, VoteValue>([['a', 13]]));
    expect(consensus.hasConsensus).toBe(true);
    expect(consensus.value).toBe(13);
    expect(consensus.distribution).toEqual({ '13': 1 });
  });

  it('AC-F3.5: pass votes excluded from consensus and distribution; only-pass ⇒ no verdict', () => {
    const mixed = detectConsensus(
      new Map<string, VoteValue>([
        ['a', PASS_VOTE],
        ['b', 5],
      ]),
    );
    expect(mixed.hasConsensus).toBe(true);
    expect(mixed.value).toBe(5);
    expect(mixed.distribution).toEqual({ '5': 1 });

    const onlyPass = detectConsensus(
      new Map<string, VoteValue>([
        ['a', PASS_VOTE],
        ['b', PASS_VOTE],
      ]),
    );
    expect(onlyPass.hasConsensus).toBe(false);
    expect(onlyPass.value).toBeNull();
    expect(onlyPass.distribution).toEqual({});
  });

  it('AC-F4.4: zero votes ⇒ no verdict (reveal guard territory)', () => {
    const consensus = detectConsensus(new Map<string, VoteValue>());
    expect(consensus.hasConsensus).toBe(false);
    expect(consensus.value).toBeNull();
    expect(consensus.distribution).toEqual({});
  });
});

describe('simultaneous reveal + consensus over the Node ws test adapter', () => {
  async function setup(): Promise<{
    host: TestClient;
    guest: TestClient;
    roomId: string;
    hostPid: string;
    guestPid: string;
  }> {
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
    const joinAck = (await guest.request('room:join', { roomId, name: 'Guest' })) as {
      ok: boolean;
      participantId?: string;
    };
    expect(joinAck.ok).toBe(true);
    await host.waitForState((s) => s.participants.length === 2);
    return { host, guest, roomId, hostPid: createAck.participantId!, guestPid: joinAck.participantId! };
  }

  it('AC-F3.1/F3.2/F3.3 + AC-F5.4: ANY participant reveals; single broadcast flips both seats face-up', async () => {
    const { host, guest } = await setup();

    await host.request('vote:submit', { value: 5 });
    await guest.request('vote:submit', { value: 5 });
    await host.waitForState((s) => s.votedCount === 2);

    // The GUEST triggers reveal (AC-F3.1: anyone can — not host-only).
    const reveal = (await guest.request('room:reveal', {})) as { ok: boolean };
    expect(reveal.ok).toBe(true);

    // Both clients converge to the SAME single broadcast (phase=revealed) with
    // both values face-up (AC-F3.2/F3.3) and the consensus verdict (AC-F4.1).
    const hostRevealed = await host.waitForState((s) => s.phase === 'revealed');
    const guestRevealed = await guest.waitForState((s) => s.phase === 'revealed');
    expect(hostRevealed.votes).toHaveLength(2);
    expect(hostRevealed.consensus?.hasConsensus).toBe(true);
    expect(hostRevealed.consensus?.value).toBe(5);
    for (const v of hostRevealed.votes ?? []) expect(v.value).toBe(5);
    // Same content on the other client — a single broadcast, not per-client state.
    expect(guestRevealed.votes).toEqual(hostRevealed.votes);

    host.close();
    guest.close();
  });

  it('AC-F3.4: reveal with zero votes acks ZERO_VOTES', async () => {
    const { host, guest } = await setup();
    const reveal = (await guest.request('room:reveal', {})) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(reveal.ok).toBe(false);
    expect(reveal.error?.code).toBe('ZERO_VOTES');
    expect(host.states.at(-1)?.phase).toBe('voting'); // no accidental reveal

    host.close();
    guest.close();
  });

  it('AC-F4.2 + AC-F4.3: no-consensus reveal shows distribution; ANY participant re-votes to clear', async () => {
    const { host, guest } = await setup();

    await host.request('vote:submit', { value: 5 });
    await guest.request('vote:submit', { value: 8 });
    await host.waitForState((s) => s.votedCount === 2);

    await host.request('room:reveal', {});
    const revealed = await host.waitForState((s) => s.phase === 'revealed');
    expect(revealed.consensus?.hasConsensus).toBe(false);
    expect(revealed.consensus?.distribution).toEqual({ '5': 1, '8': 1 });

    // The GUEST triggers re-vote (AC-F4.3: anyone can reset).
    const reset = (await guest.request('room:reset', {})) as { ok: boolean };
    expect(reset.ok).toBe(true);

    const resetState = await host.waitForState((s) => s.phase === 'voting' && s.votedCount === 0);
    expect(resetState.votes).toBeUndefined();
    expect(resetState.consensus).toBeUndefined();
    expect(resetState.participants).toHaveLength(2); // participants unchanged
    expect(resetState.participants.every((p) => p.hasVoted === false)).toBe(true);

    host.close();
    guest.close();
  });

  it('AC-F3.5: pass renders as Pass after reveal and is excluded from consensus/distribution', async () => {
    const { host, guest } = await setup();

    await host.request('vote:submit', { value: PASS_VOTE });
    await guest.request('vote:submit', { value: 5 });
    await host.waitForState((s) => s.votedCount === 2);

    await host.request('room:reveal', {});
    const revealed = await host.waitForState((s) => s.phase === 'revealed');
    // Pass vote present as the non-numeric value; consensus among numeric only.
    const passVote = revealed.votes?.find((v) => v.value === PASS_VOTE);
    expect(passVote).toBeTruthy();
    expect(revealed.consensus?.hasConsensus).toBe(true);
    expect(revealed.consensus?.value).toBe(5);
    expect(revealed.consensus?.distribution).toEqual({ '5': 1 });

    host.close();
    guest.close();
  });

  it('decision 7: leaver votes are excluded from X and from the reveal/distribution after eviction', async () => {
    const { host, guest, roomId, hostPid, guestPid } = await setup();

    // Both vote, then the guest leaves (closes tab).
    await host.request('vote:submit', { value: 5 });
    await guest.request('vote:submit', { value: 8 });
    await host.waitForState((s) => s.votedCount === 2);
    guest.close();
    await new Promise((r) => setTimeout(r, 50));

    // Grace window: still listed (2 participants), so a refresh can resume.
    expect(host.states.at(-1)?.participants).toHaveLength(2);

    // Evict the leaver (grace elapsed — production default 8s < 10s AC-F5.2).
    server!.fireLeaveTimers();
    await host.waitForState((s) => s.participants.length === 1);

    // After eviction the leaver's vote is gone: X excludes them, and the
    // remaining host vote is the only one considered (decision 7).
    const preReveal = host.states.at(-1)!;
    expect(preReveal.participants.map((p) => p.id)).toEqual([hostPid]);
    expect(preReveal.totalCount).toBe(1);
    expect(preReveal.votedCount).toBe(1); // leaver excluded from X

    await host.request('room:reveal', {});
    const revealed = await host.waitForState((s) => s.phase === 'revealed');
    // Only the host's vote appears; the leaver's 8 is absent from the payload.
    expect(revealed.votes?.map((v) => v.participantId)).toEqual([hostPid]);
    expect(revealed.consensus?.distribution).toEqual({ '5': 1 });
    // The remaining single vote is consensus (AC-F4.4 single ⇒ consensus).
    expect(revealed.consensus?.hasConsensus).toBe(true);
    expect(revealed.consensus?.value).toBe(5);
    // The leaver id is NOT in the votes payload at all.
    expect(revealed.votes?.some((v) => v.participantId === guestPid)).toBe(false);

    host.close();
  });
});
