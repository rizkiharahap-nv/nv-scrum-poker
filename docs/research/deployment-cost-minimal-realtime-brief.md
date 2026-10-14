# Research brief — Deployment topology, realtime cost, minimal-dependency transport (CR-2026-08-17-03)

- **Status:** COMPLETE (research pass for CR-2026-08-17-03, extends CR-01)
- **Date:** 2026-08-17 · **Owner:** researcher · **Appetite:** S
- **Inputs:** `docs/change_requests/2026-08-17-deployment-cost-minimal-realtime.md`, `docs/research/frontend-stack-brief.md`, `docs/research/realtime-http-stream-brief.md`, `docs/architecture/ADR-001-realtime-transport.md`, `docs/architecture/architecture.md`, `docs/constitution.md`
- **Scope added mid-run (maestro, human 2026-08-17):** deployment is **FREE TIER ONLY**. See §5 (host matrix) and §6 (backend languages).
- **Next owner:** architect (combined ADR-001 re-eval CR-01 + CR-03), then builder t_434db72a.

## TL;DR / verdicts

1. **Q1 — Backend needed? YES.** Realtime multiplayer cannot work client-only: rooms need a server-authoritative state machine to enforce host-only reveal and zero-vote guard, and WebSocket/broadcast requires a server process (browser APIs can connect but not host).[19][20] Minimal shape: one small process owning an in-memory `Map<roomId, Room>` plus a WebSocket/SSE endpoint and the existing `room:state` broadcast contract (architecture §7; internal).
2. **Q2 — Astro on one server (Vercel) fully functional? NO on Vercel free.** Astro SSR on Vercel = routes become serverless Functions with a **300s max duration on the free Hobby plan** — a WebSocket connection closes when the function hits that cap.[18][2] Socket.IO runs on Vercel only if the client forces `transports: ['websocket']` and only for short-lived sessions; long-lived rooms are cut at 5 minutes.[8] **The free-tier-compatible paths are:** (a) Vercel Hobby for the SPA static files + a persistent-process host for the realtime server, (b) Render Free web service (spins down after 15 min idle, but WebSocket traffic counts as inbound and keeps it alive while active — within 750 free instance hours/month),[13] (c) Cloudflare Workers + Durable Objects with WebSocket Hibernation (the strongest free option — DO compute free while hibernated),[14] (d) Oracle Always Free VM (2 OCPU/12GB ARM after June 2026 reduction) for a full persistent VPS,[22][unverified — capacity reduction reported by secondary sources, see §5.1] or (e) Supabase Realtime free (200 concurrent connections, no server code to host).[23]
3. **Q3 — SSE vs WS cost?** On **serverless (Vercel Hobby)**: both are capped by the 300s function duration; WS also incurs no charge while idle on Fluid Active CPU pricing, but the connection dies at 5 minutes regardless.[1][2] On **flat VM**: transport-agnostic — both cost the same fixed VM price; SSE has a small CDN/proxy edge, WS has a small framing edge; at 3–15 users/room the difference is noise.[20] **Verdict at scrum-poker scale:** cost is not the deciding factor on a flat VM; on serverless free tiers, neither holds a persistent room past 5 minutes without reconnection — so the real decision is *host*, not *transport*.

**Minimal-library recommendation (Q4):** drop Socket.IO; build a ~150-line thin realtime layer on **native browser WebSocket + Node `ws`** (server) that reuses the transport-agnostic `room:state` contract. Node 22 has a built-in **WebSocket client** but **no built-in server**, so `ws` stays as the only new server dependency; the browser side uses the native `WebSocket` API with a hand-rolled reconnect + `room:resume` resync (~30 lines).[19] SSE/EventSource is the alternative if you want zero server-lib and accept POST-based commands. **Keep:** React, Vite, TypeScript, Zustand, Tailwind. **Drop:** `socket.io`, `socket.io-client`, `engine.io` (transitive). **Stays:** `ws` (server), nothing else new. If you go SSE: drop `ws` too — Node's `fetch`/`Response` streams and the browser's `EventSource` are both built-in.[12][16]

**Implications for ADR-001 + constitution §6–7:** see §7 — ADR-001's Socket.IO decision should be re-evaluated (recommend: supersede with native WS thin-layer, or document SSE+POST as ADR-002); constitution line 7 should flip from "Socket.IO, Liveblocks, or Supabase Realtime" to "WebSocket via minimal thin layer; SSE documented as alternative"; constitution line 6 already resolved by frontend-stack-brief (Vite SPA, not Astro/Next).

---

## 1. Q1 — Is a backend needed at all?

**Yes.** Evidence:

- Realtime multiplayer requires a process that accepts connections and broadcasts state. Browsers can *connect* via native `WebSocket` (or `EventSource`), but cannot *host* a room: there is no browser API that lets one tab accept another tab's connection.[20][19]
- The architecture is server-authoritative: host-only reveal and zero-vote guard must be enforced where clients cannot bypass them (architecture §7.2, ADR-001; internal). That is a server-side state machine, not client logic.
- The existing contract already assumes a server: `Map<roomId, Room>` in memory, `room:create/join/vote:submit/room:reveal/room:reset` with ack callbacks, `room:state` broadcasts (architecture §4, §7; internal).

**Minimal backend shape** (from ADR-001 + architecture; internal, unchanged by this research):

```
Node process (Node 22+)
  ├─ ws/SSE endpoint: /ws (or /api/ws)
  ├─ in-memory Map<roomId, Room>   // ephemeral by design
  ├─ room:state broadcasts after every mutation
  └─ no DB, no broker, no external SaaS
```

The only thing this research changes about that shape is *how the transport is implemented* (fewer libraries — see §4) and *where it runs* (free tier — see §5).

## 2. Q2 — Can Astro be fully functional on one server (Vercel)?

### 2.1 Astro on Vercel: what it gives you

- Astro on Vercel uses the `@astrojs/vercel` adapter. "Using SSR, or on-demand rendering as Astro calls it, enables you to deploy your routes as Vercel functions on Vercel."[4]
- Astro server endpoints are **HTTP request/response** (`GET`, `POST`, `ALL`, returning `Response` objects). There is no native WebSocket upgrade API in Astro's endpoint model; the docs describe `request`/`Response` handling only.[12]
- Astro *can* serve a static SPA (Vite/React output) from Vercel without SSR — that's the path the frontend-stack-brief already recommends (Vite SPA, no SSR; CR-01).[4]

### 2.2 Why Astro SSR on Vercel is NOT fully functional for this app (free tier)

- Vercel Hobby (free) Functions have **max duration 300s (5 minutes)**; "WebSocket connections close when a Vercel Function reaches its maximum duration."[18][8]
- A scrum-poker room is open for the duration of a planning session — minutes to an hour+ (PRD Feature 5; internal). A 5-minute cap means every room would disconnect all participants every 5 minutes. Reconnect logic can recover, but the "room:state after every mutation" contract (internal) assumes a long-lived connection; reconnecting every 5 min is a poor fit for "leave ≤10s, join ≤2s" ACs (reconnect storms every 5 min for every room).
- Vercel's WS beta (public beta June 22, 2026) runs on Fluid compute with **Active CPU pricing** (idle time not billed),[1] but a WS connection is **pinned to one Function instance** and there is **no built-in fan-out between instances**; "Store durable state, presence, counters, rooms, and pub/sub coordination in an external data store instead of relying on in-memory variables."[8] That means the in-memory `Map<roomId, Room>` pattern (architecture §4; internal) does **not** work on Vercel multi-instance without adding a Redis/data-store dependency — which contradicts the minimal-dependency goal and the "no external SaaS" ADR-001 consequence (internal).
- Socket.IO on Vercel is explicitly supported but requires the client to force `transports: ['websocket']` (Socket.IO defaults to HTTP long-polling, which conflicts with the no-polling constitution rule and Vercel's model), and inherits the same 5-min cap.[8][6]
- Ably's independent analysis (July 2026): "There's no built-in way to broadcast a message to connections held by other instances. There's no presence either, and no delivery guarantees beyond the single pinned connection."[6]

### 2.3 Concrete single-server deployment options (free-tier focus)

| Option | Holds persistent WS/SSE? | Free-tier reality | Fit |
|---|---|---|---|
| **Vercel Hobby all-in-one** (Astro SSR or SPA + API) | ❌ WS/SSE capped at 300s[18][2] | Static files + short functions free; no long-lived room | Static SPA only; realtime server elsewhere |
| **Render Free web service** (single Node process) | ⚠️ Yes while active; spins down after 15 min idle[13] | 750 free instance hours/mo; WebSocket traffic counts as inbound → stays alive during a session[13] | Good for demo/play-testing; cold-start ~1 min after idle |
| **Fly.io** (persistent VM) | ✅ Persistent | Free allowance: up to 3 shared-cpu-1x 256MB VMs, but **credit card required** and usage-based beyond[17][unverified — allowance figures from Fly pricing page, see §5.2] | Strong, but requires card; 256MB RAM is tight for heavy stacks |
| **Railway** | ✅ Persistent | Free trial only (one-time trial credit), then $5/mo[unverified — see §5.2] | Not truly free after trial |
| **Netlify** | ❌ Functions are request/response; no WS[16] | Free plan: hard monthly limits, no overage[16] | Static hosting only |
| **Cloudflare Workers + Durable Objects** | ✅ Persistent via WebSocket Hibernation[14] | Free tier: 100,000 requests/day; DO idle+hibernatable = no duration charge[14] | Strongest free option for this app (§5.3) |
| **Deno Deploy** | ⚠️ Native WS supported but free tier: 1M req/mo, 20GB egress, 15h CPU, 350GB-h memory[15] | Fine for a room service at this scale | Viable if you want Deno runtime (§6) |
| **Supabase Realtime** (hosted, no server code) | ✅ Managed Broadcast + Presence[23] | Free: 200 concurrent connections, 2M messages/mo[23][21] | Simplest ops; adds SaaS dependency (ADR-001 rejected it for no-credentials, but free-tier-only changes the calculus) |
| **Oracle Always Free VM** | ✅ Full persistent VPS | Always Free ARM Ampere A1 (2 OCPU/12GB after June 2026 reduction; 4/24 before)[22][unverified — capacity reduction from secondary sources] | Best raw capacity, most ops burden |

**Verdict Q2:** Astro (SSR) on Vercel free is **not** fully functional for realtime rooms because of the 300s duration cap and the no-fan-out/instance-pinning constraint.[2][8][6] The functional free-tier shapes are: (a) static SPA on Vercel/Netlify + realtime server on a persistent host (Render free / Fly / Oracle VM), or (b) all-in-one on Cloudflare Workers + Durable Objects (SPA static files + DO-backed rooms), or (c) all-in-one on Supabase Realtime if you accept the hosted-SaaS dependency. Astro as a *static SPA host* on Vercel is fine — it's Astro SSR's serverless function model that breaks realtime.

## 3. Q3 — SSE vs WebSocket: cost comparison

### 3.1 On serverless (Vercel / Fluid compute)

- **WebSocket:** "WebSocket connections run on Fluid compute and follow the same limits and pricing as other Function invocations. With Active CPU pricing, billing only applies to the time your Function spends processing messages, not idle connection time."[1] Vercel Functions limits (Hobby): max duration 300s; cost = Active CPU ($0.128/hr cle1) + Provisioned Memory ($0.0106/GB-hr cle1) + Invocations ($0.60/1M over 1M included).[9][2]
- **SSE:** SSE is a streaming HTTP response, also subject to the same function duration cap (300s Hobby / 800s Pro / 1800s Pro beta).[2][6][3] Billing is the same Fluid-compute model — active CPU only while writing events, plus provisioned memory while the stream is open.
- **Key serverless insight:** on Vercel free, *both* are cheap (idle CPU not billed) but *both* die at 300s.[2][18] Cost is not the differentiator; **connection longevity** is. The only way around the cap is to move the connection off the function model entirely (persistent host or DO hibernation) or accept periodic reconnection.[6]
- WebSocket messages are additionally charged Fast Data Transfer / Fast Origin Transfer for data sent over the connection; SSE the same for response bytes.[8] At scrum-poker message sizes (room-state snapshots, ~1KB) and volumes (a few per minute, ≤15 users), bandwidth cost is negligible on any plan.[8][7]

### 3.2 On a flat persistent VM

- **Transport-agnostic:** a flat VM is billed by the hour regardless of whether you run WS or SSE — the protocol choice changes the compute bill by $0. Both run on the same Node process; neither incurs per-message fees, function invocations, or bandwidth overages (beyond the VM's included egress, e.g. Fly's first 10GB free/month[17]).
- **Latency/overhead:** WS framing ~1–3ms/msg vs SSE ~5–10ms/msg; network RTT + JSON serialization dominate by orders of magnitude.[7] At 3–15 users, invisible.
- **Proxy/CDN:** SSE needs `proxy_buffering off`; WS needs upgrade forwarding. Both are one-time config on a single reverse proxy (nginx/Caddy).[7] SSE is HTTP-native and CDN-transparent; WS terminates at origin.[7]

### 3.3 Verdict at scrum-poker scale

| Dimension | Serverless (Vercel Hobby) | Flat VM |
|---|---|---|
| WS cost | Idle CPU free; connection dies at 300s[1][2] | Fixed monthly VM cost; no per-connection fee |
| SSE cost | Same Fluid model; dies at 300s[6][2] | Same fixed cost as WS |
| Real differentiator | Duration cap, not money[2] | Proxy config, not money[7] |

**At 3–15 users/room: cost is a non-factor on a flat VM; on Vercel free the binding constraint is the 300s duration cap, not the bill.** Choose host first, transport second. If you must stay on serverless, prefer the host that keeps connections alive (Cloudflare DO Hibernation — free while hibernated[14]) or the hosted realtime (Supabase free[23]).

## 4. Q4 — Minimal-dependency realtime layer recommendation

### 4.1 Evaluate: native WebSocket / EventSource vs Socket.IO

| Criterion | Native WebSocket (`ws` server + browser API) | Native EventSource (SSE) | Socket.IO (client+server) |
|---|---|---|---|
| Deps added | `ws` (server only) — Node 22 has no built-in WS *server*[19] | None (Node `Response` stream + browser `EventSource`)[12][16] | `socket.io` + `socket.io-client` + transitive `engine.io`, `ws`, etc. |
| Client→server commands with acks | Manual: send JSON over `ws.send()`; ack = server replies | Separate HTTP POST per command; hand-rolled ack/retry[7] | Built-in event + ack callbacks[20] |
| Reconnect/resync | Manual: `close` → backoff → `room:resume` (architecture §8 already plans this; internal)[20] | Built-in `EventSource` auto-reconnect + `Last-Event-ID`[16] | Built-in automatic reconnection[20] |
| Rooms/broadcast | Hand-rolled (server keeps `Map<roomId, Set<ws>>`; architecture §7 already has room broadcast; internal) | Server keeps `Map<roomId, Set<Response>>` | Built-in rooms + broadcast[20] |
| Protocol overhead | Minimal framing[20] | Slightly more framing[7] | "Higher message overhead due to abstraction and custom framing"[20] |
| Fit for this app | Strong: full-duplex; commands+acks match the contract | Weak alone: one-way; commands become POSTs[7] | Strong on paper, but adds deps and the Vercel WS beta needs `transports:['websocket']`[8] |

### 4.2 Recommendation: own thin layer on native WebSocket + `ws`

**Proposal (~150 lines total, transport-agnostic `room:state` contract preserved):**

```
src/realtime/transport.ts        // ~50 lines — connect(ws), onMessage, onClose, backoff
src/realtime/protocol.ts         // ~40 lines — encode/decode {type, payload}, ack ids
src/realtime/roomChannel.ts      // ~60 lines — subscribe to room:state → Zustand store;
                                 //   resubscribe on reconnect via room:resume
```

- **Client:** browser native `WebSocket` (`new WebSocket(url)`), plus ~30 lines of reconnect + `room:resume` resync — the exact flow architecture §8 already specifies for Socket.IO's auto-reconnect (internal), just hand-rolled. Node 22's built-in WebSocket *client* exists if you ever need a server-side client for tests.[19]
- **Server:** Node 22 + `ws` (`WebSocketServer`), reusing the existing room state machine and `room:state` broadcast (architecture §4, §7; internal). `ws` is the only added server dependency — justified because Node 22 has no built-in WebSocket *server*.[19]
- **Acks:** JSON envelope `{id, type, payload}`; server replies `{id, ok, state|error}`. ~40 lines. The ack pattern mirrors the existing contract (architecture §7.1; internal) without Socket.IO's ack plumbing.

**Why this over Socket.IO:**
1. Constitution dependency policy: "Prefer minimal, well-maintained deps. Justify every dependency in the ADR."[constitution; internal] `ws` is the single well-maintained dep; Socket.IO pulls engine.io + client + ack protocol for features we can implement in ~150 lines that already match the spiked contract (architecture §7; internal).
2. The existing spike (001) validated Socket.IO, but the transport-agnostic `room:state` contract (architecture §7.2; internal) means the adapter is thin either way — the spike proved the *state machine*, not the library.
3. On Vercel's WS beta, Socket.IO requires `transports: ['websocket']` (long-polling default conflicts with the no-polling constitution rule) — with native WS there is no fallback to disable.[8]
4. Ably's comparison: WS is "raw, binary-capable protocol with minimal overhead"; Socket.IO adds "higher overhead due to abstraction and custom framing."[20]

**Alternative (record as ADR-002):** SSE + HTTP POST commands. Zero new server deps (Node `Response` stream), browser `EventSource` auto-reconnects with `Last-Event-ID` (free resume — even simpler than hand-rolled WS reconnect),[16] but commands become POSTs with hand-rolled acks/retries.[7] Good if you want the absolute minimum dep surface or a serverless/HTTP-only future; weaker for the command/ack path this app uses.[20]

### 4.3 Deps: what stays vs drops

| Package | Current (ADR-001) | After (this recommendation) | Reason |
|---|---|---|---|
| `react`, `react-dom` | ✅ keep | ✅ keep | Frontend stack (CR-01) |
| `vite` | ✅ keep | ✅ keep | Build tool (CR-01) |
| `typescript` | ✅ keep | ✅ keep | Language (constitution) |
| `zustand` | ✅ keep | ✅ keep | Client state (architecture §8) |
| `tailwindcss` | ✅ keep | ✅ keep | Style (constitution) |
| `socket.io` | ✅ drop | ❌ removed | Replaced by `ws` thin layer |
| `socket.io-client` | ✅ drop | ❌ removed | Browser native `WebSocket` |
| `engine.io` (transitive) | ✅ drop | ❌ removed | Transitive of socket.io |
| `ws` | (transitive) | ✅ add as direct | Only server dep; Node has no built-in WS server[19] |
| (SSE path) `ws` | — | ❌ not needed | Node `Response` stream + browser `EventSource`[12][16] |

## 5. Free-tier host matrix (scope added mid-run)

### 5.1 Hosts that CAN hold a persistent realtime (WS/SSE) process

| Host | Persistent realtime? | Free-tier limits (cited) | Notes |
|---|---|---|---|
| **Cloudflare Workers + Durable Objects** | ✅ WebSocket Hibernation[14] | Free: 100,000 requests/day; DO idle+hibernatable = no duration charge[14] | **Best free option for this app.** Room state lives in a DO; WebSocket connections hibernate when idle → no duration cost. 20:1 billing ratio for incoming WS messages keeps requests cheap.[14] |
| **Render Free web service** | ⚠️ Yes while active; 15-min idle spindown[13] | 750 free instance hours/mo[13] | WebSocket messages count as inbound traffic and delay spindown[13] — a room in active use stays alive; idle room (nobody voting) spins down and cold-starts ~1 min later. Acceptable for demo; not for a room left open overnight. |
| **Fly.io** | ✅ Persistent VMs | Free allowance: up to 3 shared-cpu-1x 256MB VMs; **credit card required**[17][unverified — allowance figures from Fly pricing page] | 256MB RAM is workable for a small Node/Deno/Go service (light Express ~50MB[unverified — community source]) but not for heavy stacks. Card-on-file is a friction point. |
| **Railway** | ✅ Persistent | **Trial only** — one-time free trial credit, then $5/mo[unverified — secondary sources; see §5.2] | Not a long-term free option. |
| **Deno Deploy** | ⚠️ Native WS/SSE supported, but free tier is monthly-usage-based[15] | 1M req/mo, 20GB egress, 15h CPU, 350GB-h memory[15] | A room service at this scale stays well under limits; but Deno Deploy is not "a server you keep alive" — it's an edge-runtime with per-request pricing that still supports long-lived WS. |
| **Supabase Realtime** | ✅ Managed Broadcast + Presence[23] | Free: 200 concurrent connections, 100 msg/s, 2M messages/mo[23][21] | No server to host at all; adds SaaS dependency. ADR-001 rejected it for spiking (no credentials), but free-tier-only makes it worth re-listing as an option. |
| **Oracle Always Free VM** | ✅ Full VPS | Always Free ARM Ampere A1 (historically 4 OCPU/24GB; **reported cut to 2 OCPU/12GB in June 2026**)[22][unverified — capacity reduction from secondary sources] | Raw capacity for a real Node/Go/Elixir server; most ops burden (DNS, TLS, updates). Oracle official page confirms "Arm-based Ampere A1 Compute" is Always Free, not the exact capacity.[22] |

### 5.2 Hosts that CANNOT hold persistent realtime (static/SPA only)

| Host | Why not | Free-tier reality |
|---|---|---|
| **Vercel Hobby** | WS/SSE capped at 300s max duration[18][2] | Static files + short functions free; 1M invocations/mo, 4 CPU-hrs, 360GB-h memory included[9] |
| **Netlify** | Functions are request/response; no WS/SSE server[16] | Free plan "always free, with hard monthly limits"[16]; static hosting fine |
| **GitHub Pages** | Static only (no server-side code) | Free forever; SPA only |
| **Cloudflare Pages (static only)** | Static functions are edge request/response; persistent WS needs Workers + DO (covered above) | Free plan generous |

### 5.3 Recommended free-tier topology (for architect to confirm)

**Option A (recommended): Cloudflare Workers + Durable Objects (all-in-one)**
- SPA static assets on Workers static/Pages; each room = one Durable Object holding the state machine; WebSocket connections with Hibernation.[14]
- Free: 100k req/day is far above this app's usage; DO compute free while hibernated.[14]
- Replaces the "persistent Node process" assumption in ADR-001 — no VM to babysit. Biggest change: the server-side state machine moves from a Node process to a DO class (same logic, different runtime).

**Option B: Vercel/Netlify static SPA + persistent Node/Go/Elixir realtime server on a free VM**
- SPA on Vercel Hobby or Netlify free (both fine for static).[18][16]
- Realtime server on Render Free (demo-friendly, sleeps when idle)[13] or Oracle Always Free VM (real persistent, 2 OCPU/12GB ARM)[22][unverified — capacity].
- Closest to the current ADR-001 architecture (Node + ws), just split across two hosts.

**Option C: Supabase Realtime (hosted, zero server code)**
- SPA on any static host; room state machine becomes Supabase Broadcast/Presence logic (different implementation, same `room:state` contract).
- Free: 200 concurrent connections — enough for 3–15 users/room, several concurrent rooms.[23]
- Simplest ops; adds a hosted SaaS dependency and a different room-state model (ADR-001's reason for rejection was spiking, not fit; internal).

## 6. Backend language evaluation (free-tier fit, ease-to-build, minimal-libs)

Ranked for this app (server-authoritative room state, ~150-line thin realtime layer, free-tier hosting):

| Rank | Language/runtime | Ease to build (minimal deps) | Free-tier fit | Verdict |
|---|---|---|---|---|
| 1 | **Node.js 22 + `ws`** | ✅ 1 dep (`ws`); TS types via `@types/ws`; same language as frontend[19] | Works on Render Free, Fly, Oracle VM, Cloudflare Workers (DO), Deno Deploy (compat)[13][15] | **Best fit** — one language across the stack, `ws` is the only added dep, spike already validated the logic |
| 2 | **Deno (native WS)** | ✅ Zero runtime deps — `Deno.serve` + native WebSocket/`WebSocketServer`-equivalent[15] | Deno Deploy free: 1M req/mo, 350GB-h memory[15] | Strong — zero-dependency realtime is Deno's selling point; slight team-tooling change (Deno instead of Node/tsx) |
| 3 | **Python + FastAPI** | ⚠️ FastAPI + uvicorn + websockets/wsproto (3 deps); ASGI WS first-class | Render Free / Fly / Oracle VM fine; Deno Deploy no; Workers no | Workable but more deps and a second language; no advantage for this app |
| 4 | **Go (gorilla/websocket or stdlib)** | ⚠️ 1 dep (gorilla/websocket) but static binary + separate toolchain | Oracle VM / Fly excellent (tiny binary, 256MB RAM fine) | Good if team prefers Go; adds a second language/toolchain for no benefit at this scale |
| 5 | **Elixir/Phoenix** | ⚠️ Phoenix brings Channels + LiveView, excellent realtime, but full framework + BEAM VM | Fly.io has first-class Elixir docs; Oracle VM fine; free-tier RAM (256MB Fly) tight for BEAM | Overkill for a 150-line realtime layer; Phoenix's strength (LiveView) conflicts with the React SPA decision (CR-01) |

**Verdict:** Node.js 22 + `ws` is the pragmatic default (one language, one new dep, all free hosts support it). Deno is the zero-dependency alternative if the team wants the absolute minimum runtime surface. The others add languages/toolchains without moving the needle for a 3–15-user room.

## 7. Implications for ADR-001 + constitution §6–7

### ADR-001 (realtime transport)
- **Status should be re-evaluated.** This brief's evidence contradicts two ADR-001 assumptions:
  1. "Serverless cold start kills WebSockets" — no longer universally true: Cloudflare Durable Objects with WebSocket Hibernation supports persistent WS on a free tier with zero duration cost when idle,[14] and Vercel now has WS in public beta (June 22, 2026), though capped at 300s on free.[1][18]
  2. "Socket.IO is the low-risk option" — the spiked contract is transport-agnostic (architecture §7.2; internal); the thin native-WS layer replaces it with one dep (`ws`), and on Vercel the Socket.IO client must be configured to `transports: ['websocket']` anyway.[8]
- **Recommendation for architect:** supersede ADR-001's Socket.IO decision with a native WebSocket thin layer (or SSE+POST, recorded as ADR-002), and record the deployment target per §5.3 (Option A Cloudflare DO recommended; Option B Vercel/Netlify + VM as the closest-to-current; Option C Supabase as hosted alternative). The `room:state` contract, event names, and state machine stay unchanged (architecture §7; internal) — only the transport adapter changes.
- Note: this is a **change request** to the accepted ADR — per constitution, it goes through maestro/architect, which is the next owner (architect combined re-eval CR-01 + CR-03).

### Constitution §6–7
- **Line 6 (Frontend):** already resolved by frontend-stack-brief → flip "Next.js preferred" to "React + Vite (SPA, no SSR) + TypeScript." This brief adds: Astro SSR on Vercel free is ruled out for realtime (300s cap),[2][18] so the constitution's stack line should not offer Astro/Next SSR as a realtime path.
- **Line 7 (Realtime):** "Default candidates: Socket.IO, Liveblocks, or Supabase Realtime" → change to reflect this research: **"WebSocket via minimal thin layer (Node `ws` + native browser WebSocket; ~150 lines). SSE + HTTP POST documented as alternative (ADR-002)."** Supabase Realtime stays a listed alternative for the hosted/no-server-code path (free tier: 200 concurrent connections).[23] Liveblocks stays out (CRDT overkill, ADR-001 §Alternatives; internal).
- **Dependency policy:** the ~150-line thin layer complies (one new dep, `ws`, justified in the ADR); Socket.IO's dependency surface is the reason it's dropped.

## 8. Open questions for architect / human gate

1. **Deployment target choice** — Option A (Cloudflare DO all-in-one), Option B (static + VM, closest to current), or Option C (Supabase)? This determines the ADR-001 rewrite and the builder's runtime.
2. **Transport** — native WS (recommended) vs SSE+POST (ADR-002)? Both are free-tier compatible; SSE is even fewer deps but weakens the command/ack path.[7][16]
3. **Oracle capacity reduction** — the official Oracle page confirms "Arm-based Ampere A1 Compute" is Always Free but not the exact OCPU/RAM; secondary sources report a June 2026 cut from 4 OCPU/24GB to 2 OCPU/12GB.[22][unverified] Verify at setup time.
4. **Render idle behavior** — a room left idle 15 min on Render Free spins down and cold-starts ~1 min.[13] If rooms must survive idle gaps with no reconnect cost, prefer Cloudflare DO or Oracle VM.

## Sources

[1] https://vercel.com/changelog/websocket-support-is-now-in-public-beta
[2] https://vercel.com/docs/functions/limitations
[3] https://vercel.com/docs/fluid-compute
[4] https://docs.astro.build/en/guides/integrations-guide/vercel
[6] https://ably.com/vercel/websockets-on-vercel
[7] https://vercel.com/pricing
[8] https://vercel.com/docs/functions/websockets
[9] https://vercel.com/docs/functions/usage-and-pricing
[12] https://docs.astro.build/en/guides/endpoints
[13] https://render.com/docs/free
[14] https://developers.cloudflare.com/durable-objects/platform/pricing
[15] https://deno.com/deploy/pricing
[16] https://www.netlify.com/pricing
[17] https://fly.io/docs/about/pricing
[18] https://vercel.com/docs/plans/hobby
[19] https://nodejs.org/learn/getting-started/websocket
[20] https://ably.com/topic/socketio-vs-websocket
[21] https://supabase.com/pricing
[22] https://www.oracle.com/cloud/free
[23] https://supabase.com/docs/guides/realtime/limits
