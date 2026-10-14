# Architecture — Scrum Poker Phase 1 MVP

Status: Stage 4 Plan · Owner: architect · Date: 2026-08-15 · Appetite: S
Inputs: `docs/PRD.md`, `docs/constitution.md`, `docs/product/research-brief.md`,
spike `spikes/001-realtime-transport` (VALIDATED), ADR-001.

## 1. TL;DR

A **server-authoritative, ephemeral, real-time room** over a **native WebSocket
thin layer** (ADR-001 rev 3), deployed on **Cloudflare Workers + Durable Objects
free tier** (one DO per room, WebSocket Hibernation) with a **Node 22 + `ws`
test adapter** for the in-process walking skeleton (NOT a production path).
Clients are a **Svelte 5 + Vite SPA** (plain Svelte, no SSR) with **Svelte
runes** for client state (Zustand dropped). The server owns the room state
machine (`voting → revealed → voting`), enforces the guards (zero-vote reveal,
face-down values), and broadcasts a full `room:state` snapshot after every
mutation. No persistence, no accounts — a room is born from a crypto-random **6-digit
numeric room code** (CR-2026-08-18-06; deliberately low-entropy, human-approved
tradeoff), lives while connected participants keep it alive, and is gone when
the last connection leaves.

Decision records: `docs/architecture/ADR-001-realtime-transport.md` (ACCEPTED),
`docs/architecture/ADR-002-sse-post-alternative.md` (PROPOSED alternative).

## 2. Scope and non-goals (from PRD)

In Phase 1: room + invite link, face-down Fibonacci voting, host-only
simultaneous reveal, consensus detection + re-vote, live presence. **Out:**
persistence/history, accounts, chat, custom decks, pass/coffee card, timers,
stats, integrations, poker-table dressing/gamification, public deployment.

## 3. System context diagram

```
┌──────────────┐   invite URL   ┌──────────────────────────────┐
│  Host browser│ ─────────────► │                              │
│  (creator)   │                │  Cloudflare Workers + DO     │
│              │  native WS     │  (primary: one DO per room,  │
└──────┬───────┘ ◄────────────► │   WebSocket Hibernation)     │
       │                        │                              │
┌──────┴───────┐  native WS     │  Node 22 + `ws` TEST ADAPTER │
│ Guest browser│ ◄────────────► │  (walking skeleton, local    │
│ (join by link)│               │   dev — NOT production)      │
└──────────────┘               └──────────────────────────────┘
   no auth · display name only    room:state broadcast after every mutation
```

- One native WebSocket connection per participant to `/ws?room=<code>`
  (default same origin; `VITE_SOCKET_URL` override). Messages are JSON envelopes
  `{ id, type, payload }`; server replies `{ id, ok, ... } | { id, ok: false,
  error: { code } }`. Event names and payloads match §7 exactly.
- **Primary (Cloudflare):** each room is one Durable Object, id
  `idFromName(roomToken)`; `acceptWebSocket` + `webSocketMessage/Close/Error`
  (Hibernation API); room state persisted to `state.storage` as a single JSON
  blob per mutation (runtime durability for hibernation — NOT product
  persistence).
- **Test adapter (Node 22 + `ws`, NOT production):** in-memory
  `Map<roomId, Room>`, same envelope + `server/room.ts` module; used only for
  local dev and the walking-skeleton integration test.
- No database, no message broker, no external SaaS (ADR-001 rev 3).

## 4. Data model (server-side, in-memory)

### 4.1 Room

```ts
type Phase = 'voting' | 'revealed';

interface Room {
  id: string;            // 6-digit numeric room code "000000".."999999" (CR-06)
  hostId: string;        // participantId of the creator (host)
  phase: Phase;          // voting | revealed
  participants: Map<string, Participant>; // by participantId
  votes: Map<string, DeckValue>;          // participantId -> submitted value
}
```

- **Ephemeral:** rooms live only in server memory; no persistence (PRD decision 5).
  Server restart ⇒ rooms gone; client shows "Room not found".
- **Runtime durability (DO path only):** the DO writes the room state to
  `state.storage` as a single JSON blob after every mutation and hydrates on
  wake — this survives hibernation, NOT product persistence. The blob is deleted
  after the last connection leaves (grace period); a later open of the link
  shows "Room not found" (PRD ephemeral semantics preserved).
- **Room id ≠ participant id.** Host is the creator; guests get new ids on join.

### 4.2 Participant

```ts
interface Participant {
  id: string;      // 128-bit crypto-random token (base64url)
  name: string;    // display name, 1..24 chars, trimmed, no PII
  hasVoted: boolean; // derived from votes map; kept in sync server-side
  isHost: boolean;   // computed: p.id === room.hostId
}
```

- **Guest isolation (AC-F1.4):** the server never sends one participant's vote to
  another before reveal; voting-phase `room:state` contains **no** vote values.

### 4.3 Deck and consensus

```ts
const DECK = [1, 2, 3, 5, 8, 13, 21] as const; // AC-F2.1, exact
type DeckValue = typeof DECK[number];

interface Consensus {
  hasConsensus: boolean;           // votes.size > 0 && all values identical
  value: DeckValue | null;         // consensus value when hasConsensus
  distribution: Record<string, number>; // value -> count (for no-consensus UI)
}
```

- **Consensus rule (PRD decision 3 / AC-F4.1, F4.4):** all submitted votes
  identical **and** ≥1 vote ⇒ consensus. Mixed ⇒ no-consensus + distribution.
  Single participant ⇒ trivially consensus. Zero votes ⇒ no verdict (reveal
  disabled, AC-F3.4).
- Pure function, unit-tested (slice 5).

## 5. Invite-link / room-code generation (AC-F1.2, CR-2026-08-18-06)

- **Room code:** exactly **6 ASCII digits** (`000000`–`999999`); **leading zeros
  are preserved** on the wire and in the URL — `roomId` is a string and is never
  coerced to a number. This is a deliberate, human-approved entropy reduction
  from the old 128-bit token (~19.9 bits for 10^6 codes); the tradeoff ships in
  PRD AC-F1.2 and the approval log (Gate 4, CR-2026-08-18-06).
- **Generation (uniform, no modulo bias):** crypto-random integer in
  [0, 999999] via **rejection sampling** on `crypto.getRandomValues` — draw
  enough bytes, reject any sample ≥ the largest multiple of 1_000_000 that fits
  the drawn width, retry until in range. Every code is equiprobable.
  - **Cloudflare path:** generated **client-side** because the DO id must be
    known before the first message (`idFromName(code)`); `room:create` returns
    `roomId = code`.
  - **Node test adapter:** generated **server-side**, same 6-digit format, using
    `crypto.randomInt(0, 1_000_000)` zero-padded to 6 digits (uniform; test
    adapter only, NOT production).
- **AC-F1.2 properties:** two consecutive creations yield different codes
  (probabilistic — the collision retry below covers the rare equal case); codes
  are **not sequential** and not derivable from room count.
- **Collision retry (bounded, ≤5):** with 10^6 codes a live room can already own
  the drawn code. On a `room:create` ack of `ROOM_NOT_FOUND` (DO path: the
  `idFromName(code)` DO already owns a room → the DO acks `ROOM_NOT_FOUND`), the
  client closes the channel, generates a **fresh** code, reconnects
  (`/ws?room=<newCode>`), and retries — at most 5 attempts, then a generic
  "couldn't create room" error. The Node adapter mirrors the semantics:
  `handleCreate` checks `rooms.has(code)` and acks `ROOM_NOT_FOUND` on collision
  (never overwrites a live room). A guessed/occupied code never grants entry —
  create/join on it returns `ROOM_NOT_FOUND`.
- **Invite URL:** `https://<origin>/r/<code>` (SPA route; join route regex
  `/^\/r\/\d{6}\/?$/`). The room view renders the full URL with a copy
  affordance (AC-F1.3).
- The code is the **only** credential — no auth. Possession of the link grants
  join (matches PRD). Codes are never logged.
- **Participant ids unchanged:** the 6-digit format applies to **room codes
  only**; participant ids stay server-generated 128-bit crypto-random (base64url
  on the Node adapter, `crypto.randomUUID()` on the DO) — identities are not
  user-shared.
- **Security tradeoff (must ship in PRD + approval log):** 6-digit codes are
  brute-forceable (10^6 combos). Acceptable ONLY for an internal team tool with
  **ephemeral rooms** (deleted when the last connection leaves) and **no PII**
  (join gate = display name only). Do NOT reuse this format for a
  public/external deployment without revisiting.
- **Join-attempt rate limit — DECISION: deferred out of Phase 1.** A per-code
  attempt counter on the DO would blunt brute-force room probing, but it adds
  storage + logic to the DO for marginal benefit under the internal threat
  model; kept within appetite S and the free-tier constraint. Revisit if the
  tool goes public/external.
- Join flow: open `/r/<code>` → no session ⇒ join prompt (display name) →
  `room:join` → room state (AC-F1.4).
- **Join prompt prefill (AC-F1.5):** when a remembered name exists
  (`localStorage` `scrum-poker.displayName`), the join prompt's name input is
  pre-filled with it; it remains editable and the join gate still requires an
  explicit submit (AC-F1.6).

## 6. Participant state machine

A single room-level phase machine drives the ritual. Every transition is a
server mutation that broadcasts `room:state`.

```
                  any participant: room:reset / re-vote
       ┌──────────────────────────────────────────────┐
       │                                              ▼
   ┌─────────┐   vote:submit (any participant)    ┌──────────┐
   │ voting  │ ─────────────────────────────────► │ revealed │
   └─────────┘      (last submitted value wins,   └──────────┘
       ▲                AC-F2.4)                       │
       │                room:reveal (any participant)  │
       │              (guarded: ≥1 vote) ──────────────┘
       └────────────────────────────────────────────────
```

- **Reveal (AC-F3.1) and re-vote (AC-F4.3) are ANY-participant actions** (Gate 3
  decision; PRD locked — do not reintroduce host-only privileges).

Participant lifecycle (per participant, orthogonal to room phase):

```
joined ──► voting (hasVoted=false) ──► submitted (hasVoted=true)
   ▲                                      │ (change vote, AC-F2.4)
   └──────────────────────────────────────┘
   │ (leave: disconnect → grace → evicted from participants)
   └─────────────────────────────────────────────────────────► gone
```

- **Host refresh (resolved by Gate 3 / PRD decision 5):** re-joining the same
  room via the same invite link keeps all the participant's data (name, vote,
  host status) via a device-side session re-bound on reconnect. Implemented as:
  on `room:create`, the client stores `roomId + participantId` in
  `sessionStorage`; on page load with a stored session, the client calls
  `room:resume` which re-binds the stored participantId (and host privileges) if
  the room still exists. Implement `room:resume` in slice 1.

### 6.4 Client-side remembered display name (AC-F1.5/F1.6, CR-2026-08-17-02)

- **One device-local `localStorage` entry:** `scrum-poker.displayName`, holding
  the trimmed display name. Written on successful `room:create` / `room:join`
  acks; read on Landing/Join mount to prefill the name input. Trimming matches
  submit validation (trimmed, ≤24 chars).
- **NOT identity:** the remembered name never substitutes for a session. The
  `sessionStorage` `roomId + participantId` session remains the **only** identity
  for `room:resume`; the remembered name is cosmetic input initialization only.
- **Never auto-submitted (AC-F1.6):** prefill is editable before submit and
  nothing is submitted without the user's explicit action — the join gate
  (AC-F1.4) is untouched. Fresh device / cleared storage ⇒ empty input.
- **No forget-me UI in Phase 1:** editing the input is the escape hatch; shared
  devices keep the last-used name (accepted, internal tool).

## 7. Realtime message contracts (native WebSocket, JSON envelopes)

All client→server commands carry an ack reply (`{ id, ok: true, ... }` or
`{ id, ok: false, error: { code } }`) matching a request id in the envelope.
All server→room updates are a single `room:state` broadcast carrying the full
snapshot. Error replies are machine-readable `error.code` values.

### 7.1 Client → Server (commands, with ack)

| Event | Payload | Ack success | Ack error (`error.code`) | Notes |
|---|---|---|---|---|
| `room:create` | `{ name: string }` | `{ ok:true, roomId, participantId, isHost:true, state:RoomState }` | `NAME_INVALID`, `ROOM_NOT_FOUND` (code collision — client retries with fresh code, ≤5) | creator is host |
| `room:join` | `{ roomId: string, name: string }` | `{ ok:true, roomId, participantId, isHost:false, state:RoomState }` | `ROOM_NOT_FOUND`, `NAME_INVALID` | guests |
| `room:resume` | `{ roomId, participantId }` | `{ ok:true, roomId, participantId, isHost, state }` | `ROOM_NOT_FOUND`, `SESSION_UNKNOWN` | refresh / reconnect (slice 1) |
| `vote:submit` | `{ value: DeckValue }` | `{ ok:true, state:RoomState }` | `NOT_IN_ROOM`, `NOT_VOTING_PHASE`, `INVALID_VALUE` | last wins (AC-F2.4) |
| `room:reveal` | `{}` | `{ ok:true, state:RoomState }` | `NOT_IN_ROOM`, `NOT_VOTING_PHASE`, `ZERO_VOTES` | **any** participant (AC-F3.1), guarded ≥1 vote (AC-F3.4) |
| `room:reset` | `{}` | `{ ok:true, state:RoomState }` | `NOT_IN_ROOM`, `NOT_REVEALED_PHASE` | **any** participant (AC-F4.3) |

### 7.2 Server → Client (broadcasts)

| Event | Payload | When |
|---|---|---|
| `room:state` | `RoomState` (below) | after every mutation: create/join/resume/vote/reveal/reset/leave |

```ts
interface RoomState {
  roomId: string;
  phase: 'voting' | 'revealed';
  participants: Array<{ id: string; name: string; isHost: boolean; hasVoted: boolean }>;
  votedCount: number;   // votes.size — drives "X of N voted" (AC-F2.5)
  totalCount: number;   // participants.size
  votes?: Array<{ participantId: string; value: DeckValue }>; // ONLY when phase==='revealed' (AC-F2.3)
  consensus?: Consensus; // ONLY when phase==='revealed'
}
```

- **Face-down guarantee (AC-F2.3):** `votes` and `consensus` are absent from
  `RoomState` while `phase === 'voting'`. QA asserts no value text in the DOM
  pre-reveal; the protocol makes it structurally impossible.
- **No polling (AC-F5.6):** all updates arrive via `room:state`; the client never
  HTTP-polls.

## 8. Client architecture

```
Svelte 5 + Vite + TS SPA (plain Svelte, no SvelteKit SSR)
├── src/main.ts              // mount App.svelte
├── src/App.svelte           // routes: / (landing) and /r/:code (join/room) via tiny history router
├── src/realtime/transport.ts    // native WS connect + backoff reconnect (~50 lines)
├── src/realtime/protocol.ts     // {id,type,payload} envelope + ack matching (~40 lines)
├── src/realtime/roomChannel.ts  // room-scoped subscribe → runes mirror; resync via room:resume (~60 lines)
├── src/store/room.svelte.ts // Svelte runes ($state): mirrors RoomState + local participantId (replaces Zustand roomStore.ts)
├── src/logic/deck.ts        // DECK constant (AC-F2.1)
├── src/logic/consensus.ts   // detectConsensus(votes) pure fn (AC-F4.1..4)
├── src/logic/token.ts       // 6-digit room-code generator (rejection sampling, Web Crypto) + participant id (client-side on CF path)
└── src/components/          // *.svelte: Landing, JoinForm, RoomTable, CardDeck, RevealPanel, ResultPanel
```

- **Single source of truth:** `room:state` broadcasts are applied verbatim to the
  Svelte runes store (`room.svelte.ts`); local UI derives from the store.
  Command acks also return state (so the initiating client converges even if it
  missed a broadcast).
- **State model:** a `$state` object in `src/store/room.svelte.ts` mirrors
  `RoomState` + the local `participantId`; components read it directly and
  Svelte updates automatically (research svelte-node-comparison-brief §1.5 —
  runes are the documented shared-state pattern; Zustand is dropped).
- **Reconnect (AC-F5.5):** `transport.ts` auto-reconnects with backoff; on
  reconnect the client calls `room:resume` (or `room:join`) to re-sync the full
  state. No reload.
- **Tailwind-only** (constitution): no `.css`/`.less`/inline `style=`; all
  styling via utility classes, conditional classes via Svelte `class={...}`
  (ui_spec port notes: research svelte-node-comparison-brief §2; ui_spec
  layout unchanged — architect confirms).

## 9. Presence and leave detection (AC-F5.1/F5.2)

- **Join:** `room:join` (or `room:resume`) adds the participant and broadcasts the
  new `room:state` — ≤2s target is trivially met over WS.
- **Leave:** server listens for disconnect (`webSocketClose` on DO, `close` on
  `ws`). Strategy (slice 2): mark participant `leaving`, broadcast updated state
  immediately, then evict from `participants` after a grace period (e.g. 8s,
  under the 10s AC) and broadcast again. Grace period distinguishes a quick
  tab-refresh from a real leave and lets `room:resume` reclaim the same
  participantId during the window.
  - **DO path:** the grace eviction uses a DO alarm (`state.storage.setAlarm`)
    — hibernated DOs do not run `setTimeout`. On alarm, evict `leaving`
    participants past grace and broadcast; if the room has no remaining
    participants, `deleteAll()` and delete the blob (ephemeral semantics).
  - **Node path:** `setTimeout` per participant, same eviction logic.
- Presence UI: `participants[]` with `hasVoted` drives "X of N voted" (AC-F2.5).

## 10. Consensus detection logic (AC-F4.*)

```
detectConsensus(votes: Map<pid, value>): Consensus
  if votes.size === 0:  return { hasConsensus:false, value:null, distribution:{} }
  values = [...votes.values()]
  distribution = count each value
  hasConsensus = new Set(values).size === 1
  return { hasConsensus, value: hasConsensus ? values[0] : null, distribution }
```

- All-equal ⇒ consensus at that value (AC-F4.1).
- Mixed ⇒ no-consensus + distribution (AC-F4.2).
- Single participant ⇒ `new Set.size === 1` ⇒ consensus (AC-F4.4).
- Re-vote (`room:reset`) clears `votes`, sets `hasVoted=false`, phase → voting
  (AC-F4.3).

## 11. Slice mapping (from docs/tasks.md)

| Slice | Architecture contract it implements |
|---|---|
| 0 walking skeleton | native WS round trip over the Node test adapter (same envelope + `room.ts`); build + test infra; `wrangler dev` smoke for the DO adapter |
| 1 room create + invite | 6-digit code gen (rejection sampling on CF / randomInt on Node), collision retry ≤5, `/r/:code` route, `room:create`, `room:resume`, invite URL |
| 2 join + presence | `room:join`, participants + leave grace (DO alarm / setTimeout), X-of-N |
| 3 deck + face-down voting | DECK constant, `vote:submit`, voting-phase state w/o values |
| 4 simultaneous reveal | `room:reveal` any-participant + zero-vote guard, revealed state with votes |
| 5 consensus + re-vote | `detectConsensus`, `room:reset` any-participant, distribution UI |
| 6 styling | Tailwind-only pass per ui_spec |

## 12. Known risks / open items for the human gate

1. **Deployment choice (Gate 3 re-check, resolved rev 3)** — ADR-001 rev 3:
   Cloudflare Workers + DO free tier (lifetime-free, no card, hibernation) is
   the ONLY production path; the Node `ws` adapter is a test adapter (walking
   skeleton, local dev) with Render free documented for demo/play-test only.
   Human confirmed the final stack (Svelte FE + Cloudflare DO); maestro
   unblocks builder `t_434db72a`.
2. **Ephemeral + room lifetime** — rooms vanish when the last connection leaves
   (or DO blob is deleted); app must handle "room not found" gracefully (no
   persistence in Phase 1).
3. **DO runtime differences** — hibernation means no running timers (use DO
   alarms) and storage-backed state; the shared `server/room.ts` module keeps the
   logic identical across DO/Node so the walking-skeleton test runs in-process.
4. **Deployment** — preview-only until qa + reviewer pass (constitution); the
   builder does not deploy to a public URL.
5. **6-digit room-code entropy (CR-2026-08-18-06)** — codes are brute-forceable
   (10^6 combos); accepted for internal, ephemeral, no-PII use (PRD AC-F1.2,
   approval log). Join-attempt rate limit explicitly deferred out of Phase 1;
   revisit before any public/external deployment.

## 13. References

- PRD: `docs/PRD.md` · Constitution: `docs/constitution.md` ·
  Research: `docs/product/research-brief.md` · Tasks: `docs/tasks.md` ·
  ADR: `docs/architecture/ADR-001-realtime-transport.md` ·
  Spike: `spikes/001-realtime-transport/README.md`
