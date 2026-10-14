# Spike 001 — Realtime transport: Socket.IO

Status: COMPLETE · Date: 2026-08-15 · Owner: architect
Question: Which realtime transport can carry the Scrum Poker walking skeleton
(connect → create room → join → vote → broadcast → reveal → reset) with the
lowest latency and least operational complexity for an internal 3–15-person tool?

## Approach

A runnable, throwaway Node spike (`spike.mjs`) that runs an in-process Socket.IO
server plus two `socket.io-client` clients and exercises the **exact slice-0
walking-skeleton path** from `docs/tasks.md`, plus the full game protocol:

1. both clients connect over the WebSocket transport
2. raw ping/pong round-trip latency (5 samples)
3. `room:create` → host + 128-bit base64url room token
4. `room:join` → second participant, state converges on both clients
5. `vote:submit` → "X of N voted" propagates; **no vote values** in the
   voting-phase state (face-down enforced at the protocol level)
6. guest `room:reveal` → rejected (`NOT_HOST`) — host-only enforcement
7. host `room:reveal` → single broadcast carries all values + consensus verdict
8. `room:reset` → votes cleared, back to voting
9. mixed votes → no-consensus + distribution

## Results

```
[server] listening on :60245
  PASS  both clients connect over WebSocket transport
[latency] ping/pong RTT (local, websocket): 1ms, 0ms, 1ms, 0ms, 0ms, avg 0.4ms
  PASS  round-trip latency below 100ms locally (avg 0.4ms)
  PASS  A creates room, becomes host
  PASS  roomId is 128-bit base64url token (got RDa8roz-OLvGMQQYpamnWQ)
  PASS  B joins; ack state has 2 participants
  PASS  B receives room:state broadcast with 2 participants
  PASS  after A votes, B sees votedCount=1 and NO values (face-down enforced at protocol level)
  PASS  B sees who voted (hasVoted flag) without the value
  PASS  guest reveal rejected by server (host-only enforcement)
  PASS  host reveal succeeds, phase=revealed
  PASS  reveal broadcast carries votes to all clients in one event
  PASS  consensus detected: single submitted vote => consensus at 5
  PASS  host reset returns to voting with zero votes
  PASS  reset broadcast reaches B: votes cleared, no values in state
  PASS  mixed votes => no-consensus
  PASS  distribution {3:1, 8:1} surfaced for discussion

SPIKE VERDICT: VALIDATED — Socket.IO supports the full walking-skeleton path end-to-end.
```

**16/16 assertions pass.** Socket.IO provides rooms, broadcast, host/guest
permission checks, ack-based request/reply, and automatic reconnection — the exact
primitives the game loop needs.

## Verdict: VALIDATED

### What worked
- Full-duplex round trip over a single WebSocket at sub-millisecond local RTT.
- Room join + broadcast state convergence on all clients.
- Protocol-level face-down enforcement: voting-phase state carries only
  `votedCount`/`hasVoted`, never values.
- Host-only reveal and re-vote enforced server-side; guests get `NOT_HOST`.
- Zero-vote reveal guard, invalid-card guard, phase guards all ack with errors.
- Consensus + distribution detection in a pure function, unit-testable.
- ack-based request/reply pattern keeps client logic simple (no polling).

### What didn't / caveats
- Server is **in-memory and ephemeral** by design (matches PRD "ephemeral rooms").
  Reconnect resync (AC-F5.5) is the server's job: on reconnect the client
  re-requests the full room state — the spike validates the state shape, not the
  reconnect timer itself.
- Presence leave detection (AC-F5.2, ≤10s) needs a grace-period eviction loop on
  the server (socket `disconnect` → mark leaving → emit → evict after grace). Not
  in the spike; it's a slice-2 concern.
- A single Node server is a single point of failure. For an internal 3–15 person
  tool that is acceptable; horizontal scaling (redis adapter) is out of scope for
  Phase 1.

### Surprises
- `socket.io-client`'s `connect` event does not pass the socket as its payload —
  a test-harness assertion had to check `client.connected` instead.
- Broadcast races in the test harness (client's own vote broadcast arriving before
  the reveal broadcast) required predicate-based state waits. In the real client,
  `room:state` is the single source of truth, so this is a non-issue.

### Recommendation for the real build
- **Use Socket.IO (server + client) on a small Node server.**
- Architecture: server-authoritative room state in memory; every mutation
  (create/join/vote/reveal/reset) is a socket event with an ack; every mutation
  broadcasts the full `room:state` snapshot to the room. Clients render
  `room:state` as the single source of truth (Zustand store mirrors it).
- Presence: `participants[]` in state + `hasVoted` flags; server evicts after a
  disconnect grace period.
- Keep `detectConsensus()` a pure, unit-tested function.
- Deploy as a tiny Node service (same repo, separate entry point) — no external
  SaaS dependency, which fits an internal tool with no cloud budget decision yet.

## Files
- `spike.mjs` — the spike (throwaway, but kept as the walking-skeleton reference)
- `package.json` / `package-lock.json` — `socket.io` + `socket.io-client` only

## Reproduction
```bash
cd spikes/001-realtime-transport
npm install
node spike.mjs
```
