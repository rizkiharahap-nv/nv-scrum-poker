# ADR-002 — Alternative: SSE + HTTP POST commands (not adopted for Phase 1)

Status: PROPOSED (documented alternative — NOT accepted) · Date: 2026-08-18 · Owner: architect
Deciders: architect (CR-01/CR-03 re-eval), pm (PRD), maestro (gate)

## Context

CR-2026-08-17-01 asked whether HTTP streaming (SSE / fetch streams) can replace
WebSocket for Scrum Poker. Research (realtime-http-stream-brief §2–§9) concluded:

- SSE is one-way server→client; the app's voting/reveal/re-vote are client→server
  commands that need acks → they would become plain HTTP POSTs with hand-rolled
  ack/retry semantics.
- Latency parity at our scale (1–10ms framing difference vs 2s/10s PRD targets).
- `EventSource` auto-reconnects with `Last-Event-ID` — slightly simpler resume
  than hand-rolled WS backoff.
- HTTP/1.1 6-connection-per-origin cap is a non-issue at 3–15 users, one tab each.
- Requires `proxy_buffering off` on reverse proxies (standard config).
- **Zero new server dependencies**: Node `Response` streams + browser
  `EventSource` are built-in. This is its main draw.

## Decision

**Record the SSE + POST path as a documented alternative; do not adopt it for
Phase 1.** Native WebSocket on Cloudflare Durable Objects is free, full-duplex,
and matches the command/ack contract with no hand-rolled ack/retry layer. SSE
wins only if hosting ever becomes serverless-HTTP-only (e.g. Vercel free, where
WS is capped at 300s) or if zero server deps outweigh the ack-path cost.

## Swap path (pre-decided, if ever needed)

- Server keeps the same room state machine (`server/room.ts`) and broadcasts
  `room:state` as SSE events to a `Map<roomId, Set<Response>>`.
- Commands become HTTP POSTs (`POST /api/room/:id/vote` etc.) carrying the same
  `protocol.ts` envelope; server replies `{ ok, state | error }` as the HTTP
  response (request/reply acks, retries on the client).
- Client swaps `transport.ts` for an `EventSource` + `fetch` adapter; the
  `roomChannel.ts` → Svelte runes mirror wiring and the `room:state` shape are
  unchanged.

## Consequences

- Pros: zero server deps; CDN-transparent; built-in reconnect with
  `Last-Event-ID`; works on HTTP-only serverless.
- Cons: commands lose built-in acks/retries (hand-rolled); POSTs are
  request/reply (a slow client could stall a command queue); proxy buffering must
  be disabled for the stream; no single full-duplex channel.

## Reference

- Research: `docs/research/realtime-http-stream-brief.md` (sources [4]–[19])
- ADR-001 rev 3 (accepted transport): `docs/architecture/ADR-001-realtime-transport.md`
