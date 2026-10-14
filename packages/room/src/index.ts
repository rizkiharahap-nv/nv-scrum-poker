/**
 * @scrum-poker/room — pure, transport-agnostic room state machine (architecture.md §4–§10).
 *
 * Used by BOTH the Cloudflare Durable Object adapter and the Node `ws` test
 * adapter. No I/O, no timers, no storage — the adapters own those concerns.
 */

import type { ErrorCode } from '@scrum-poker/protocol';

/** Exact Phase-1 deck (AC-F2.1). */
export const DECK = [1, 2, 3, 5, 8, 13, 21] as const;

export type DeckValue = (typeof DECK)[number];

/**
 * Non-numeric "pass" vote (PRD AC-F3.5, resolved 2026-08-17). Deliberately NOT
 * part of `DECK` — AC-F2.1 says the deck offers exactly 1..21 and nothing else;
 * pass is a separate participant action. Excluded from consensus detection and
 * from the numeric distribution (see `detectConsensus`).
 */
export const PASS_VOTE = 'pass' as const;

/** A submitted vote: a Fibonacci deck value or the non-numeric pass vote. */
export type VoteValue = DeckValue | typeof PASS_VOTE;

/**
 * Serializable snapshot of a Room — the DO storage blob payload
 * (architecture §4.1 runtime durability: hydrate on wake, write on every
 * mutation). Room state only; leave-grace eviction metadata is adapter-owned.
 */
export interface RoomSnapshot {
  id: string;
  hostId: string;
  phase: Phase;
  participants: Array<{ id: string; name: string }>;
  votes: Array<{ participantId: string; value: VoteValue }>;
}

/** Is this a value the server accepts for `vote:submit`? (deck value or pass) */
export function isValidVote(value: unknown): value is VoteValue {
  if (value === PASS_VOTE) return true;
  return typeof value === 'number' && (DECK as readonly number[]).includes(value);
}

export type Phase = 'voting' | 'revealed';

/** Room participant (architecture §4.2). */
export interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  hasVoted: boolean;
}

/** Consensus verdict (architecture §4.3). */
export interface Consensus {
  hasConsensus: boolean;
  value: DeckValue | null;
  distribution: Record<string, number>;
}

/** Full room snapshot broadcast after every mutation (architecture §7.2). */
export interface RoomState {
  roomId: string;
  phase: Phase;
  participants: Array<{
    id: string;
    name: string;
    isHost: boolean;
    hasVoted: boolean;
  }>;
  votedCount: number;
  totalCount: number;
  /** Present ONLY when phase === 'revealed' (AC-F2.3 — face-down guarantee). */
  votes?: Array<{ participantId: string; value: VoteValue }>;
  consensus?: Consensus;
}

export type CommandResult =
  | { ok: true; state: RoomState }
  | { ok: false; code: ErrorCode };

/** Display-name validation (architecture §4.2: trimmed, 1..24 chars). */
export function isValidName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 24;
}

export function normalizeName(name: string): string {
  return name.trim();
}

/**
 * Consensus detection (architecture §10, PRD AC-F3.5/F4.1/F4.4): all-equal
 * numeric votes ⇒ consensus; mixed ⇒ distribution; 0 numeric votes ⇒ no
 * verdict. Pass votes (AC-F3.5) are EXCLUDED from consensus detection and from
 * the numeric distribution — a round with only pass votes has no consensus
 * verdict.
 */
export function detectConsensus(votes: ReadonlyMap<string, VoteValue>): Consensus {
  // Numeric values only — pass votes never count toward consensus or the
  // distribution (AC-F3.5).
  const values = [...votes.values()].filter((v): v is DeckValue => typeof v === 'number');
  if (values.length === 0) {
    return { hasConsensus: false, value: null, distribution: {} };
  }
  const distribution: Record<string, number> = {};
  for (const value of values) {
    distribution[String(value)] = (distribution[String(value)] ?? 0) + 1;
  }
  const hasConsensus = new Set(values).size === 1;
  return { hasConsensus, value: hasConsensus ? (values[0] as DeckValue) : null, distribution };
}

/**
 * A single room. `hostId` is the creator's participantId; host is a user too
 * (can vote/reveal/reset, no extra permission — Gate 3 / PRD decision 2).
 */
export class Room {
  readonly id: string;
  hostId: string;
  phase: Phase = 'voting';

  /** participantId -> display name (trimmed, 1..24). */
  private readonly participantNames = new Map<string, string>();
  /** participantId -> submitted value (last wins, AC-F2.4; may be pass, AC-F3.5). */
  private readonly votes = new Map<string, VoteValue>();

  constructor(id: string, hostId: string, hostName: string) {
    this.id = id;
    this.hostId = hostId;
    this.participantNames.set(hostId, hostName);
  }

  /**
   * room:create — the creating participant is the host. The adapter supplies a
   * freshly generated participantId (server-side crypto on both paths);
   * room id ≠ participant id (architecture §4.1).
   */
  static create(id: string, participantId: string, name: string): { ok: true; room: Room } | { ok: false; code: 'NAME_INVALID' } {
    if (!isValidName(name)) return { ok: false, code: 'NAME_INVALID' };
    return { ok: true, room: new Room(id, participantId, normalizeName(name)) };
  }

  /** room:join — adds a guest participant. */
  join(participantId: string, name: string): CommandResult {
    if (!isValidName(name)) return { ok: false, code: 'NAME_INVALID' };
    if (this.participantNames.has(participantId)) {
      // Same id already present (id collision on the test adapter); treat as resume.
      this.participantNames.set(participantId, normalizeName(name));
      return { ok: true, state: this.state() };
    }
    this.participantNames.set(participantId, normalizeName(name));
    return { ok: true, state: this.state() };
  }

  /** room:resume — re-binds an existing participant (refresh / reconnect, AC-F5.5). */
  resume(participantId: string): CommandResult {
    if (!this.participantNames.has(participantId)) return { ok: false, code: 'SESSION_UNKNOWN' };
    return { ok: true, state: this.state() };
  }

  /** vote:submit — last submitted value wins (AC-F2.4); pass allowed (AC-F3.5). */
  submitVote(participantId: string, value: VoteValue): CommandResult {
    if (!this.participantNames.has(participantId)) return { ok: false, code: 'NOT_IN_ROOM' };
    if (this.phase !== 'voting') return { ok: false, code: 'NOT_VOTING_PHASE' };
    if (!isValidVote(value)) return { ok: false, code: 'INVALID_VALUE' };
    this.votes.set(participantId, value);
    return { ok: true, state: this.state() };
  }

  /** room:reveal — ANY participant, guarded ≥1 vote (AC-F3.1/F3.4). */
  reveal(participantId: string): CommandResult {
    if (!this.participantNames.has(participantId)) return { ok: false, code: 'NOT_IN_ROOM' };
    if (this.phase !== 'voting') return { ok: false, code: 'NOT_VOTING_PHASE' };
    if (this.votes.size === 0) return { ok: false, code: 'ZERO_VOTES' };
    this.phase = 'revealed';
    return { ok: true, state: this.state() };
  }

  /** room:reset — ANY participant; clears votes, back to voting, participants unchanged (AC-F4.3). */
  reset(participantId: string): CommandResult {
    if (!this.participantNames.has(participantId)) return { ok: false, code: 'NOT_IN_ROOM' };
    if (this.phase !== 'revealed') return { ok: false, code: 'NOT_REVEALED_PHASE' };
    this.phase = 'voting';
    this.votes.clear();
    return { ok: true, state: this.state() };
  }

  /** Remove a participant (leave path — grace/eviction owned by the adapter, slice 2). */
  removeParticipant(participantId: string): void {
    this.participantNames.delete(participantId);
    this.votes.delete(participantId);
  }

  hasParticipant(participantId: string): boolean {
    return this.participantNames.has(participantId);
  }

  get participantIds(): string[] {
    return [...this.participantNames.keys()];
  }

  get votedCount(): number {
    return this.votes.size;
  }

  get totalCount(): number {
    return this.participantNames.size;
  }

  /**
   * Serializable snapshot for the DO storage blob (architecture §4.1). The
   * Cloudflare adapter writes it on every mutation and hydrates on wake.
   */
  toSnapshot(): RoomSnapshot {
    return {
      id: this.id,
      hostId: this.hostId,
      phase: this.phase,
      participants: [...this.participantNames.entries()].map(([id, name]) => ({ id, name })),
      votes: [...this.votes.entries()].map(([participantId, value]) => ({ participantId, value })),
    };
  }

  /** Rebuild a room from a snapshot (DO wake path). Trusted input — the DO's own storage blob. */
  static fromSnapshot(snapshot: RoomSnapshot): Room {
    const room = new Room(snapshot.id, snapshot.hostId, '');
    room.participantNames.clear();
    for (const p of snapshot.participants) room.participantNames.set(p.id, p.name);
    room.phase = snapshot.phase;
    for (const v of snapshot.votes) room.votes.set(v.participantId, v.value);
    return room;
  }

  /** Full snapshot for `room:state` (face-down guarantee: no votes/consensus while voting). */
  state(): RoomState {
    const participants = [...this.participantNames.entries()].map(([id, name]) => ({
      id,
      name,
      isHost: id === this.hostId,
      hasVoted: this.votes.has(id),
    }));
    const base: RoomState = {
      roomId: this.id,
      phase: this.phase,
      participants,
      votedCount: this.votes.size,
      totalCount: this.participantNames.size,
    };
    if (this.phase === 'revealed') {
      base.votes = [...this.votes.entries()].map(([participantId, value]) => ({ participantId, value }));
      base.consensus = detectConsensus(this.votes);
    }
    return base;
  }
}
