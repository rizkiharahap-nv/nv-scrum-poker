/**
 * @scrum-poker/protocol — shared wire contract (architecture.md §7, ADR-001 rev 3).
 *
 * All client→server commands are JSON envelopes `{ id, type, payload }` and every
 * command carries an ack reply `{ id, ok: true, ... }` or `{ id, ok: false,
 * error: { code } }` matching the request id. All server→room updates are a single
 * `room:state` broadcast carrying the full snapshot.
 */

/** Client-generated request id — unique per command on a connection. */
export type RequestId = string;

/** Server error codes (architecture §7.1). */
export const ERROR_CODES = [
  'NAME_INVALID',
  'ROOM_NOT_FOUND',
  'SESSION_UNKNOWN',
  'NOT_IN_ROOM',
  'NOT_VOTING_PHASE',
  'NOT_REVEALED_PHASE',
  'INVALID_VALUE',
  'ZERO_VOTES',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Message type names — client→server commands (architecture §7.1). */
export const COMMAND_TYPES = [
  'room:create',
  'room:join',
  'room:resume',
  'vote:submit',
  'room:reveal',
  'room:reset',
] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];

/** Server→client broadcast (architecture §7.2). */
export const BROADCAST_TYPES = ['room:state'] as const;
export type BroadcastType = (typeof BROADCAST_TYPES)[number];

export type MessageType = CommandType | BroadcastType;

/**
 * Envelope. `payload` is `undefined` for commands that carry no payload
 * (`room:reveal`, `room:reset`).
 */
export interface Envelope<TType extends MessageType = MessageType, TPayload = unknown> {
  id: string;
  type: TType;
  payload: TPayload;
}

/** Server error reply body. */
export interface ErrorInfo {
  code: ErrorCode;
}

/** Any inbound command envelope (type-narrowed by callers). */
export type ClientCommand =
  | Envelope<'room:create', { name: string }>
  | Envelope<'room:join', { roomId: string; name: string }>
  | Envelope<'room:resume', { roomId: string; participantId: string }>
  | Envelope<'vote:submit', { value: import('@scrum-poker/room').VoteValue }>
  | Envelope<'room:reveal', Record<string, never>>
  | Envelope<'room:reset', Record<string, never>>;

/**
 * Ack success / error union. Every command ack matches the request id; the
 * success ack carries command-specific extra fields plus (for room commands)
 * the full `RoomState`.
 */
export type Ack<T extends CommandType = CommandType> =
  | {
      id: string;
      ok: true;
      type: T;
      roomId?: string;
      participantId?: string;
      isHost?: boolean;
      state?: import('@scrum-poker/room').RoomState;
    }
  | {
      id: string;
      ok: false;
      type: T;
      error: ErrorInfo;
    };
