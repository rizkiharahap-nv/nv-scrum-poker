/**
 * Svelte runes store — mirrors `RoomState` + local participantId (ADR-001 rev 3,
 * architecture §8). Replaces Zustand. Components read this directly.
 */

import type { RoomState, VoteValue } from '@scrum-poker/room';

export interface RoomUiState {
  token: string | null;
  selfId: string | null;
  hostId: string | null;
  phase: 'voting' | 'revealed' | null;
  participants: RoomState['participants'];
  votedCount: number;
  totalCount: number;
  /** The local participant's submitted vote. While voting this is client-local
   *  (the server never sends vote values pre-reveal, AC-F2.3) — it mirrors the
   *  participant's own last submitted value so the deck can show the selected
   *  card. After reveal it is derived from `votes`. */
  myVote: VoteValue | null;
  votes: RoomState['votes'];
  consensus: RoomState['consensus'];
  connected: boolean;
  error: string | null;
  /** True after resume/reconnect fails because the room is gone (server restart). */
  sessionLost: boolean;
}

export const room = $state<RoomUiState>({
  token: null,
  selfId: null,
  hostId: null,
  phase: null,
  participants: [],
  votedCount: 0,
  totalCount: 0,
  myVote: null,
  votes: undefined,
  consensus: undefined,
  connected: false,
  error: null,
  sessionLost: false,
});

export function applyState(state: RoomState, selfId: string | null): void {
  room.sessionLost = false;
  room.token = state.roomId;
  room.phase = state.phase;
  room.participants = state.participants;
  room.votedCount = state.votedCount;
  room.totalCount = state.totalCount;
  room.votes = state.votes;
  room.consensus = state.consensus;
  room.hostId = state.participants.find((p) => p.isHost)?.id ?? null;
  room.selfId = selfId;
  // While voting the server never sends vote values (AC-F2.3), so `myVote`
  // stays whatever this client last submitted (kept in the store). After
  // reveal it is derived from the revealed `votes` payload. A reset back to
  // voting clears the local selection (the server cleared my hasVoted).
  if (state.phase === 'revealed') {
    room.myVote = state.votes?.find((v) => v.participantId === selfId)?.value ?? null;
  } else if (selfId && !state.participants.find((p) => p.id === selfId)?.hasVoted) {
    room.myVote = null;
  } else if (!room.myVote) {
    // Fresh join mid-round with no local selection yet.
    room.myVote = null;
  }
}

/** Record the local participant's submitted value (select = submit, AC-F2.2/F2.4). */
export function setMyVote(value: VoteValue): void {
  room.myVote = value;
}

export function resetRoom(): void {
  room.token = null;
  room.selfId = null;
  room.hostId = null;
  room.phase = null;
  room.participants = [];
  room.votedCount = 0;
  room.totalCount = 0;
  room.myVote = null;
  room.votes = undefined;
  room.consensus = undefined;
  room.connected = false;
  room.error = null;
  room.sessionLost = false;
}

/** Room vanished (server restart / last-leave wipe). UI should stop spinning. */
export function markSessionLost(): void {
  resetRoom();
  room.sessionLost = true;
}
