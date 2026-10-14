# ADR-001 — Realtime transport + deployment: native WebSocket thin layer on Cloudflare Workers + Durable Objects

Status: ACCEPTED (rev 3 — supersedes rev 2) · Date: 2026-08-18 · Owner: architect
Deciders: architect (spike + CR-01/CR-03/CR-04 re-eval), pm (PRD), maestro (gate), Rizki (Svelte FE + Cloudflare DO decision)

## Revision history

- **Rev 1 (2026-08-15):** Socket.IO on a small Node server — spike-validated (001, 16/16), ACCEPTED.
- **Rev 2 (2026-08-18):** Superseded by CR-2026-08-17-01 + CR-2026-08-17-03 and the
  human's **lifetime-free-only** deployment constraint (no Oracle; Cloudflare/Render/Railway
  verdict). Transport → native WebSocket thin layer; deployment → Cloudflare Workers +
  Durable Objects free tier (primary), Render free web service (fallback). Socket.IO is
  dropped. The `room:state` contract, event names, and state machine are **unchanged**
  (architecture §7) — only the transport framing and runtime topology change.
- **Rev 3 (2026-08-18):** Superseded by CR-2026-08-18-04 (bun-monorepo pivot). Human
  decision: **Svelte frontend + Cloudflare Workers + Durable Objects**. Client stack
  React+Vite+Zustand → **Svelte 5 + Vite SPA + Svelte runes** (Zustand dropped; plain
  Svelte, no SvelteKit SSR). The Node `ws` adapter is demoted from production fallback to
  **in-process test adapter only** (walking skeleton) — NOT a production path; Render free
  is documented for that adapter only (demo/play-test). The `room:state` contract, event
  names, ack shapes, and state machine are **unchanged** (architecture §7) — only the
  client framework and the runtime-topology framing change.

## Context

Scrum Poker is a real-time, invite-only planning-poker room for an internal team
(3–15 participants/room, handful of concurrent rooms). The constitution mandates
a realtime transport (no polling), and the PRD's Feature 5 requires: join ≤2s,
leave ≤10s, vote propagation without revealing values, action propagation, and
reconnect resync. Rooms are ephemeral by design (PRD decision 5).

Rev 1 chose Socket.IO because its spike validated the full walking-skeleton path
and no hosted alternative could be spiked locally. Three research passes plus the
human's free-tier constraint changed the picture; rev 3 adds the human's Svelte
decision:

1. **A backend is required** (CR-03 Q1): realtime multiplayer cannot work
   client-only; the server owns the state machine and enforces the guards.
2. **Frontend is a Vite SPA, no SSR** (CR-01 frontend brief; Svelte at rev 3):
   no SEO/public audience; the client is a thin state mirror.
3. **The transport is swappable**: the spike validated the *state machine* and
   the transport-agnostic `room:state` contract, not the library. A thin native
   WebSocket layer reuses the identical contract with ~150 lines and one fewer
   dependency family (realtime brief §7–8, deployment brief §4).
4. **Free tier only, lifetime-free** (CR-03 round 2, human): Oracle is NOT an
   option (human constraint); Railway is trial-only (not lifetime-free); Render
   free works but sleeps after 15 min idle and caps at 750 instance-hours/mo;
   Cloudflare Workers + Durable Objects is free forever, no card, with WebSocket
   Hibernation (no duration charge while idle). Vercel/Netlify free cannot hold
   long-lived realtime (300s function cap / request-response functions).
5. **Svelte is the human's explicit choice** (CR-2026-08-18-04 decision): "give
   me architecture when i chose svelte for FE, and if i use cloudflare DO for
   it". Research (svelte-node-comparison-brief §1.6, §2, §5.2) confirms the port
   is mechanical — Zustand → Svelte runes, JSX → Svelte markup; Tailwind-only +
   Akira conventions unaffected; `room:state` contract unchanged. **Plain Svelte
   5 + Vite** (no SvelteKit) is chosen over SvelteKit SPA mode: a 2-route SPA
   gains nothing from a meta-framework (research §1.2, §1.6), and the SvelteKit
   SPA path carries an explicit "large negative performance and SEO impacts"
   warning. The Bun/Node pivot is resolved by the Cloudflare decision: Workers
   cannot run Bun or Node (V8 isolates), so the production runtime is TS-only;
   Node remains only as the in-process test adapter (bun-node brief §5.2).

## Decision

1. **Transport — native WebSocket thin layer.** Browser `WebSocket` client +
   server adapter; JSON envelope `{ id, type, payload }` with ack replies
   `{ id, ok: true, ... } | { id, ok: false, error: { code } }`. ~150 lines
   across `transport.ts` / `protocol.ts` / `roomChannel.ts` (client) and the
   server's room module. Event names, payloads, ack shapes, error codes, and the
   `room:state` broadcast are unchanged from architecture §7 — only the framing
   differs from Socket.IO. **Drop** `socket.io`, `socket.io-client`,
   `engine.io` (transitive). **Add**: nothing on the Cloudflare path; `ws` (+
   `@types/ws`) only on the Node test adapter (Node 22 has no built-in WS
   server).

2. **Deployment — Cloudflare Workers + Durable Objects, free tier (primary).**
   SPA static assets served by the Worker (same origin as the WS endpoint);
   each room = one Durable Object, id derived deterministically from the room
   token (`idFromName(token)`); WebSocket Hibernation API
   (`acceptWebSocket` + `webSocketMessage`/`webSocketClose`/`webSocketError`).
   The room state machine lives in a shared, transport-agnostic module
   (`server/room.ts`) used by both the DO class and the Node test adapter.

3. **Deployment — Node `ws` is a test adapter, NOT a production path.** Node 22 +
   `ws`, same protocol, same `room.ts` module, in-memory `Map<roomId, Room>`.
   It exists for the in-process walking-skeleton integration test and local
   dev, and as a documented escape hatch if the DO path ever hits a wall —
   zero contract change. Render free is documented for demo/play-test of that
   adapter only; it is NOT a supported room host (15-min idle sleep → ~1 min
   cold start, 750 hr/mo cap).

4. **Client — Svelte 5 + Vite SPA (plain Svelte, no SvelteKit SSR).** Client
   room state = **Svelte runes** (`$state` in a `.svelte.ts` module) — Zustand
   is dropped. Tailwind-only + Akira conventions unchanged (research §2: the
   ui_spec's conditional classes map to Svelte's clsx-style `class={...}`; no
   layout change needed — architect confirms). Two routes (`/` landing,
   `/r/:token` join/room) via a tiny hand-rolled history router (~30 lines,
   zero deps) — matches the 2-route SPA and the dependency-minimal policy.

5. **Rejected hosts:** Railway (trial credit then ~$1/mo — not lifetime-free),
   Oracle Always Free (human constraint), Vercel/Netlify for realtime (function
   duration caps — static SPA hosting only), Fly.io (free allowance but credit
   card required), Supabase Realtime (hosted SaaS — kept as a documented
   alternative, not adopted), PartyKit (extra abstraction over raw DOs),
   Liveblocks (CRDT overkill), polling (banned).

## Lifetime-free verdict (CR-03 round 2, human — updated for rev 3)

| Host | Lifetime-free? | Realtime on free tier | Verdict |
|---|---|---|---|
| **Cloudflare Workers + DO** | ✅ Yes, no card | ✅ WebSocket Hibernation — DO free while idle; 100k requests/day free, far above our scale | **PRIMARY** |
| **Render free web service** | ✅ Yes | ⚠️ Persistent while active (WS traffic = inbound), but 15-min idle sleep + 750 hr/mo cap | **TEST ADAPTER ONLY** (demo/play-test of the Node adapter; NOT a room host) |
| **Railway** | ❌ No | Trial credit only, then ~$1/mo | Rejected |
| **Oracle Always Free** | (would be yes) | Full persistent VPS | Rejected — human constraint |
| Vercel Hobby / Netlify free | ✅ Yes | ❌ WS/SSE capped at 300s / request-response functions | Static SPA hosting only |
| Fly.io | ⚠️ Yes w/ card | Persistent VMs | Rejected — card friction |

## Dependency change

| Package | Rev 1 | Rev 2 | Rev 3 (Cloudflare primary) | Rev 3 (Node test adapter) |
|---|---|---|---|---|
| `svelte`, `@sveltejs/vite-plugin-svelte`, `vite`, `typescript`, `tailwindcss` | — | — | ✅ client | ✅ client |
| `react`, `react-dom`, `zustand` | keep | keep | ❌ dropped | ❌ dropped |
| `socket.io`, `socket.io-client` | keep | ❌ dropped | ❌ dropped | ❌ dropped |
| `engine.io` (transitive) | — | ❌ gone | ❌ gone | ❌ gone |
| `ws` + `@types/ws` | (transitive) | Node fallback only | not needed (Workers native WS server) | ✅ test adapter only |

## Consequences

### Positive
- Lifetime-free, no card, no VM to babysit; rooms are free while idle
  (hibernation = no duration charge).
- Svelte 5 SPA is the smallest bundle for the thinnest client, and runes remove
  the Zustand dependency entirely (dependency-policy win; research §1.3, §1.5).
- The client realtime layer (`transport.ts` / `protocol.ts` / `roomChannel.ts`)
  is plain TS and framework-agnostic — only the store layer swaps (Zustand →
  runes) (research §1.5).
- Zero new server dependencies on the primary path; one small, well-maintained
  dep (`ws`) on the test adapter. Constitution dependency policy honored.
- Same TypeScript stack end-to-end; the state machine is a shared module, so
  unit tests and the walking-skeleton integration test run without `wrangler`.
- `room:state` contract, event names, ack shapes, and state machine are
  untouched — the builder's protocol work is additive framing, not redesign.

### Negative / risks
- **DO runtime differs from Node.** Local dev needs `wrangler dev`. Mitigation:
  `server/room.ts` is pure logic; the DO class (`roomObject.ts`) and the Node
  adapter (`index.ts`) are thin adapters over it. The slice-0 walking skeleton
  runs against the Node adapter (fast, in-process) and a `wrangler dev` smoke
  covers the DO adapter.
- **Hibernated DOs don't run timers.** The leave-grace eviction must use a DO
  alarm (`state.storage.setAlarm`) on the Cloudflare path, `setTimeout` on Node.
- **In-memory state is not durable across hibernation.** The DO persists the
  room state as a single JSON blob in `state.storage` on every mutation and
  hydrates on wake. This is runtime durability for hibernation only — NOT
  product persistence. No history; the room is deleted when the last connection
  leaves after the grace period (`deleteAll` / Map delete) and a later open of
  the link shows "Room not found" (PRD ephemeral semantics preserved).
- **Token generation moves client-side on the primary path** (Web Crypto, 16
  random bytes → base64url) because the DO id must be known before the first
  message (`idFromName(token)`). AC-F1.2 (≥128-bit crypto-random, two creations
  differ, not sequential) holds; the Node test adapter keeps server-side
  generation.
- **Svelte 5 runes are a new idiom for the team** (research §1.4). Mitigated by
  the small scope (2 routes, ~8 components), official docs, and runes being the
  documented shared-state pattern (research §1.5).
- **No production Node path.** If the DO path hits a wall, the Node adapter is a
  documented escape hatch for dev/tests only; Render free is demo/play-test only
  — never a 24/7 room service.
- **Deploy stays preview-only** until qa + reviewer pass (constitution). The
  builder does NOT deploy to a public URL.

## Technical contract (what the builder implements)

- **Client:** Svelte 5 + Vite + TS SPA (plain Svelte, **no SvelteKit SSR**).
  `src/main.ts` (mount), `src/App.svelte` (2 routes: `/` landing and
  `/r/:token` join/room via a tiny hand-rolled history router, ~30 lines),
  `src/realtime/transport.ts` (native WS connect + backoff reconnect, ~50
  lines), `src/realtime/protocol.ts` (`{id,type,payload}` envelope + ack
  matching, ~40 lines), `src/realtime/roomChannel.ts` (subscribe `room:state` →
  runes mirror, resync via `room:resume` on reconnect, ~60 lines),
  `src/store/room.svelte.ts` (Svelte runes `$state` mirror of `RoomState` +
  local participantId — replaces Zustand `roomStore.ts`), `src/logic/deck.ts`,
  `src/logic/consensus.ts`, `src/logic/token.ts` (unchanged from rev 2),
  `src/components/*.svelte` (Landing, JoinForm, RoomTable, CardDeck,
  RevealPanel, ResultPanel — Tailwind-only; conditional classes via Svelte
  `class={...}`; ui_spec layout unchanged). `VITE_SOCKET_URL` default
  same-origin `/ws`.
- **Server (primary):** `server/room.ts` (pure room state machine — Room,
  Participant, `detectConsensus`, guards), `server/roomObject.ts` (DO class:
  fetch upgrade → `acceptWebSocket`; `webSocketMessage/Close/Error`; `setAlarm`
  grace eviction; storage-backed state blob), `wrangler.toml` (free plan, static
  assets + `/ws`).
- **Server (test adapter only, NOT production):** `server/index.ts` — Node 22 +
  `ws`, same envelope + `room.ts`, in-memory `Map<roomId, Room>`. Used ONLY by
  the in-process walking-skeleton integration test and local dev.
- **Routing:** Cloudflare path — client connects to `/ws?room=<token>`, DO id =
  `idFromName(token)`; `room:create { name }` is the first message and the DO
  returns `roomId` = the token. Node test-adapter path — server generates the
  token on `room:create`; later messages carry `roomId` in the envelope.
- **Events (names unchanged):** `room:create`, `room:join`, `room:resume`,
  `vote:submit`, `room:reveal`, `room:reset` (client→server, acked); `room:state`
  broadcast after every mutation. Error codes per architecture §7.1.
- **Permissions (per approved PRD, Gate 3):** reveal and re-vote by ANY
  participant; zero-vote reveal guard; last-wins votes; face-down state (no vote
  values pre-reveal); leaver votes ignored.
- **Testing:** slice-0 walking skeleton integration test
  (`test/walking-skeleton.test.ts`) exercises connect → create → join → vote →
  reveal → reset against the **Node test adapter** in-process (same protocol as
  prod, shared `room.ts`); unit tests cover `room.ts` (consensus, guards) and
  `token.ts`. Optional `wrangler dev` smoke for the DO adapter. Deploy (after qa
  + reviewer) via `wrangler deploy` only.

## Alternatives considered

1. **Socket.IO (rev 1)** — superseded: pulls `socket.io-client` + `engine.io`,
   needs `transports:['websocket']` on serverless, and its fallbacks/rooms are
   features the thin layer reproduces in ~150 lines against the same contract.
   Spike 001 remains the validated evidence for the state machine.
2. **SSE + HTTP POST** — see ADR-002. Not adopted for Phase 1: weaker
   command/ack path; native WS on CF DO is free and full-duplex.
3. **Supabase Realtime** — hosted Broadcast + Presence, no server code; free
   200 concurrent connections. Adds a SaaS dependency and a different room-state
   model; kept as a documented alternative only.
4. **PartyKit** — DO-based, but adds an abstraction over raw DOs for no gain at
   this scale.
5. **Liveblocks** — CRDT cost/complexity with no co-editing need.
6. **Polling** — constitution-banned.
7. **React + Vite + Zustand (rev 2)** — superseded by the human's explicit
   Svelte choice (CR-2026-08-18-04). Evidence in svelte-node-comparison-brief
   §5: Svelte ships the smaller bundle and runes remove Zustand; the React
   advantage (ecosystem/hiring depth) is a mild risk, not a Phase-1 blocker for
   a 2-route SPA (research §4).
8. **SvelteKit SPA (adapter-static fallback)** — rejected for Phase 1: plain
   Svelte + Vite is simpler for a 2-route SPA (no adapter/fallback config), and
   SvelteKit SPA mode carries an explicit "large negative performance and SEO
   impacts" warning (research §1.2, §1.6).

## Reference

- Spike: `spikes/001-realtime-transport/README.md` + `spike.mjs` (Socket.IO —
  state-machine evidence; transport superseded)
- Research briefs: `docs/research/frontend-stack-brief.md`,
  `docs/research/realtime-http-stream-brief.md`,
  `docs/research/deployment-cost-minimal-realtime-brief.md`,
  `docs/research/bun-node-monorepo-brief.md`,
  `docs/research/svelte-node-comparison-brief.md`
- Change requests: `docs/change_requests/2026-08-17-stack-realtime.md`,
  `docs/change_requests/2026-08-17-deployment-cost-minimal-realtime.md`,
  `docs/change_requests/2026-08-18-bun-monorepo.md`
- ADR-002: `docs/architecture/ADR-002-sse-post-alternative.md`
- PRD: `docs/PRD.md` Feature 5 · Constitution: `docs/constitution.md` Stack
