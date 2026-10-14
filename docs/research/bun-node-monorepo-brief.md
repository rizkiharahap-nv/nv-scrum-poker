# Research brief — Bun vs Node.js backend + static FE monorepo, one-server free-tier deploy (CR-2026-08-18-04)

- **Status:** COMPLETE (research pass for CR-2026-08-18-04)
- **Date:** 2026-08-18 · **Owner:** researcher · **Appetite:** S
- **Inputs:** `docs/change_requests/2026-08-18-bun-monorepo.md`, `docs/architecture/ADR-001-realtime-transport.md` (rev 2), `docs/architecture/ADR-002-sse-post-alternative.md`, `docs/research/deployment-cost-minimal-realtime-brief.md`, `docs/constitution.md`, `docs/architecture/architecture.md`
- **Scope (maestro update, 2026-08-18):** runtime open between **Bun and Node.js** — research BOTH, same monorepo + one-server + free-tier constraints.
- **Next owner:** architect (re-evaluate ADR-001 rev 2 vs Bun/Node pivot), then human Gate 3 re-check before builder.

---

## TL;DR / verdicts

1. **No lifetime-free host runs a persistent Bun or Node realtime process.** Every candidate that keeps a WS/SSE connection alive costs money or a card, or is trial-only. The evidence-backed reality:
   - **Cloudflare Workers + Durable Objects** is the only true lifetime-free, no-card, persistent-realtime host — and it **cannot run Bun or Node** (V8 isolates; JS/TS/WASM only, no native code, no long-lived process).[33][34]
   - **Render Free web service** runs **Bun natively** and Node natively, keeps a WS alive while active, but **sleeps after 15 min idle** and caps at **750 instance-hours/month**.[3][2]
   - **Fly.io** has **no free tier for new organizations** (legacy free allowance deprecated; all orgs need a credit card on file).[9][unverified]
   - **Railway** free is a **30-day trial with $5 credits, then $1/month** — not lifetime-free.[17]
   - **Vercel/Netlify** — Bun runtime on Vercel Functions is real, but functions cap at **300s duration** on Hobby (WS connection dies at 5 min) and there is **no cross-instance fan-out**.[4][7][8] Netlify Functions are request/response (no long-lived WS/SSE).[18]
   - **Cloudflare Containers** (the new Docker-style offering) can run "any programming language" but is **Workers Paid ($5/mo) only** — free tier has **no** container allowance.[24][23]

2. **The honest fork (no forced preference), least-pain recommendation first:**
   - **(a) Bun on Render Free** — real Bun, real Node-free server, native WS/SSE zero-dep, one server, one port. Cost: $0, but rooms sleep after 15 min idle and the account has 750 instance-hours/mo (≈31 days always-on; a room open overnight wakes with ~1 min cold start).
   - **(c) Stay Cloudflare Workers + DO, TypeScript-only** — the only lifetime-free, no-card, always-awake realtime option; but you give up Bun/Node runtime entirely (V8 isolates).[33][34]
   - **(b) Pay ~$5/mo** — Hetzner CX22 (~€3.79/mo ≈ $4.43) or DigitalOcean Basic Droplet, both run Bun/Node natively with no idle sleep; or Fly.io Hobby (~$2/mo for a shared-cpu-1x 256MB machine) with card on file.[21][22][9]
   - **(d) Free non-Oracle VPS** — none found that is lifetime-free and unconstrained. Oracle Always Free ARM Ampere A1 is the only true free VPS, and the human has excluded Oracle.[20]

3. **Runtime recommendation for the monorepo (if the human accepts a Bun/Node host):** **Bun** is the better technical fit for this exact app — native WebSocket **server** with zero deps (Node 22+ has only a built-in WS **client**, not a server),[29] native SSE via `Response` streams,[13] built-in bundler + `Bun.serve` serving the built SPA and the WS/SSE endpoint on **one port** with no separate static-server process,[13][31] and first-class monorepo workspaces.[14] Node is the conservative alternative if the team prefers the largest ecosystem and the most battle-tested deploy path, at the cost of one extra dependency (`ws`).[29]

4. **Does ADR-002 (SSE+POST) become more attractive on a Bun/Node single process?** **Yes, marginally — but still not recommended for Phase 1.** On a single persistent Bun.serve process, SSE costs zero deps and works fine; but the command/ack path (voting, reveal, reset) still becomes hand-rolled HTTP POSTs with retries, while native WS gives the same zero-dep surface *and* full-duplex acks. The SSE argument weakens: the reason ADR-002 existed was serverless-HTTP-only hosting; on a persistent Bun/Node server that reason mostly disappears. Verdict: keep WS.

5. **Implication for ADR-001 rev 2 + constitution §7-8:** the Cloudflare-primary / Render-fallback split stays valid **only if the runtime is TS-only**. If the human chooses Bun/Node, the ADR must be re-evaluated: Cloudflare DO becomes non-viable (cannot run Bun/Node), and **Render Free (Bun) becomes primary** with all its sleep/750hr caveats, or the human pays ~$5/mo. Constitution §7 (Deployment) must be updated to reflect whichever fork is chosen.

---

## 1. Bun vs Node runtime/host matrix (free-tier reality)

### 1.1 Runtime capability comparison (what the code needs)

| Capability | Bun (1.3.x) | Node 22+ | Node 24 |
|---|---|---|---|
| Native WebSocket **server** | ✅ `Bun.serve` `websocket` handler, zero dep, built on uWebSockets[12] | ❌ **No built-in WS server** — needs `ws` package[29] | ❌ Still no built-in WS server (Node docs still say v22 lacks it; no stable server in 24)[unverified] |
| Native WebSocket **client** | ✅ built-in[12] | ✅ built-in since v22[29] | ✅ |
| SSE server (streaming `Response`) | ✅ `Response` body stream[13] | ✅ `Response` stream[29] | ✅ |
| Static file serving from same process | ✅ `Bun.serve` + HTML imports serve bundled assets with no runtime bundling[31] | ⚠️ needs `serve-static`/`express` or a static middleware | ⚠️ same |
| TypeScript/JSX runtime | ✅ native (zero build step)[12] | ⚠️ needs `tsx`/`ts-node` or build | ⚠️ same |
| Package manager + workspaces | ✅ `bun install` + `workspaces` in `package.json`[14] | ✅ `npm` workspaces (or pnpm/yarn)[15] | ✅ |
| Bundler | ✅ built-in `bun build`[31] | ❌ needs Vite/esbuild | ❌ same |

**Key fact:** Node 22+ **does not** provide a built-in native WebSocket *server* implementation — "To create a WebSocket server that accepts incoming connections from web browsers or other [clients], [you need the ws package]."[29] This is exactly what the previous brief (deployment-cost-minimal-realtime-brief §4.2) already concluded: `ws` stays as the only new server dep on Node. Bun removes even that.

### 1.2 Host matrix — can it run Bun? Node? And free-tier realtime?

| Host | Runs Bun? | Runs Node? | Free tier holds persistent WS/SSE? | Free-tier reality (cited) |
|---|---|---|---|---|
| **Cloudflare Workers + DO** | ❌ No (V8 isolates; JS/WASM only, no native code)[33][34] | ⚠️ Partial via `nodejs_compat` (not a real Node process, no long-lived process)[unverified — documented compatibility layer] | ✅ WebSocket Hibernation, free while idle[10] | 100k req/day free, no card. **Cannot run Bun/Node** → conflicts with this CR. |
| **Cloudflare Containers** | ✅ (Docker image, "any programming language")[24] | ✅ | ⚠️ billed per-10ms active; containers sleep to zero | **Workers Paid only ($5/mo)**, free tier has no container allowance[24][23] |
| **Render Free web service** | ✅ native[2] | ✅ | ⚠️ **yes while active**; sleeps after 15 min idle (incl. WS); cold start ~1 min[3] | 750 free instance-hrs/mo[3] |
| **Fly.io** | ✅ | ✅ | ❌ no free tier for new orgs; legacy allowance deprecated; card required[9][unverified] | ~$2/mo for shared-cpu-1x 256MB (if you pay)[9] |
| **Railway** | ✅ (Nixpacks/Railpack auto-detect)[unverified] | ✅ | ❌ trial only | 30-day trial, $5 credits, then **$1/mo**[17] |
| **Vercel Hobby (Functions)** | ✅ (Bun runtime beta since Oct 2025)[5][6] | ✅ | ❌ WS/SSE capped at **300s** max duration on Hobby[7][8] | Static SPA + short functions free; WS beta has no cross-instance fan-out[8] |
| **Netlify Free** | ⚠️ Bun for *builds*, not server runtime[unverified] | ⚠️ Functions are request/response | ❌ no long-lived WS/SSE server[18] | Free $0 forever for static[18] |
| **Deno Deploy** | ❌ (Deno runtime, not Bun) | ❌ | ⚠️ native WS/SSE but usage-billed | Free: 1M req/mo, 20GB egress[30] |
| **Hetzner Cloud (CX22)** | ✅ (any Docker image) | ✅ | ✅ persistent VM | **~€3.79/mo ≈ $4.43**[unverified — third-party pricing; official page JS-rendered] |
| **DigitalOcean Droplet (Basic)** | ✅ | ✅ | ✅ persistent VM | paid, per-second billing from Jan 2026[22][unverified — exact $4 base not shown] |
| **Oracle Always Free VM** | ✅ (any runtime) | ✅ | ✅ persistent | Free ARM Ampere A1, but **human excluded Oracle**[20] |
| **Koyeb** | ✅ | ✅ | ⚠️ scale-to-zero on free | Free 5h/mo... then paid; effectively not a persistent always-free VM[26] |

### 1.3 Free-tier reality per host (the evidence that matters)

- **Render** — "Render spins down a Free web service that goes 15 minutes without receiving any inbound traffic. This includes both HTTP requests and WebSocket messages from existing connections."[3] "Render grants 750 Free instance hours to each workspace per calendar month."[3] **Bun natively**: "Render now supports Bun natively, so you can use Bun without Docker."[2]
- **Vercel** — Bun runtime: "Vercel Functions using the Bun runtime support most Node.js APIs, including standard Web APIs such as the Request and Response Objects."[4] But: "Maximum duration Hobby: 300s default and maximum."[7] WS: "WebSockets are available in Beta on all plans" but "New WebSocket connections are not guaranteed to reach the same Vercel Function instance."[8] → no persistent room on free.
- **Fly.io** — "All organizations (except for Linked Organizations) require a credit card on file."[9] Third-party 2026 sources: "no free tier for new organizations; legacy free allowance deprecated" and "~$1.94/mo for one shared-cpu-1x 256MB always-on."[unverified] Official free allowance page is a 404 now (fly.io/docs/about/plans → Error 404).[27]
- **Railway** — "Start with a 30-day free trial with $5 credits, then $1 per month."[17]
- **Netlify** — "Free $0 forever Build and deploy free forever... Functions & AI models..."[18] But functions are request/response (no persistent WS/SSE server); Bun is supported for *builds* only.[19][32]
- **Cloudflare** — Workers: "Workers does not allow our customers to upload native-code binaries to run on the Cloudflare network — only JavaScript and WebAssembly."[33] "The Cloudflare Workers runtime is built on top of the V8 JavaScript and WebAssembly engine."[34] Containers (new): "Available on Workers Paid plan... Run code written in any programming language, built for any runtime."[24] Pricing: "Free N/A" (no free container usage).[23]

---

## 2. Recommended monorepo layout (Bun or Node — same shape)

The layout works identically with `bun` (workspaces) or `npm`/`pnpm` (workspaces). Bun docs: "Bun supports workspaces in package.json. With workspaces, you develop several independent packages in a single repository, a monorepo."[14] npm/pnpm equivalent exists for Node.[15][16]

```
scrum-poker/
├── package.json            # "workspaces": ["apps/*", "packages/*"]
├── bun.lock (or package-lock.json)
├── tsconfig.base.json
├── apps/
│   ├── web/                # Vite + React SPA (builds to dist/)
│   │   └── vite.config.ts
│   └── server/             # Bun.serve (or Node http + ws)
│       ├── index.ts        # serves built SPA + /ws upgrade + optional /api
│       └── roomChannel.ts  # transport-agnostic room:state broadcast adapter
└── packages/
    ├── protocol/           # {id,type,payload} envelope + types (shared client/server)
    └── room/               # room state machine (Room, Participant, detectConsensus, guards)
```

- **Bun path:** `apps/server` imports `packages/protocol` + `packages/room` via `workspace:*`. `bun build --target=bun` bundles server; Vite builds SPA; `Bun.serve` serves `dist/` + `/ws`.[13][31]
- **Node path:** same structure, `npm`/`pnpm` workspaces; server uses `ws` WebSocketServer + a static middleware (express or serve-static) to serve `dist/`.[15][16]
- The `packages/room` state machine is **runtime-agnostic** (pure TS) — identical on Bun, Node, and (with adapter) Cloudflare DO. This matches ADR-001's "shared transport-agnostic module" intent, preserving the walking-skeleton test that runs in-process.[architecture.md §3]

**One-server serving pattern (both runtimes):**
- Bun: `Bun.serve({ routes: { "/": myReactSinglePageApp, "/ws": upgradeToWebSocket, ... } })` — the same process serves the built SPA, the WS upgrade, and any REST/SSE routes. "Bun.serve serves the assets from this manifest with no bundling at runtime."[31][13]
- Node: one `http.createServer()` + `ws` upgrade handler + static file middleware, all on the same port (standard pattern; `ws` + express/serve-static).[29]

---

## 3. Realtime on Bun vs Node — which thin layer is smaller?

| Aspect | Bun | Node 22+ |
|---|---|---|
| WS server | `Bun.serve({ websocket: { open, message, close } })` — zero deps[12] | `ws` WebSocketServer (one dep)[29] |
| WS throughput | "7x more messages per second than Node.js + ws" (Bun docs benchmark)[12] | baseline |
| Pub/sub | Bun-native publish-subscribe API[12] | manual `Set<ws>` broadcast (or `ws` broadcast) |
| SSE | `Response` body stream — zero deps[13] | `Response` body stream — zero deps[29] |
| Static + WS same port | native (HTML imports + `Bun.serve`)[31] | need static middleware |

**The ~150-line thin layer** from the earlier brief stays ~150 lines on both; Bun just drops the `ws` dependency and its types. The `room:state` contract, event names, acks, and state machine are **unchanged** (architecture §7).

**Does ADR-002 (SSE+POST) become more attractive on a single Bun/Node server?** Partially:
- **SSE becomes zero-dep on Bun** (`Response` stream, same as Node). But so is native WS on Bun. The original SSE advantage ("zero server deps on Node, where WS needs `ws`") vanishes on Bun — both are zero-dep.
- **The command/ack path still favors WS.** Voting/reveal/reset are client→server commands needing acks. SSE forces hand-rolled POST + retry semantics (ADR-002 §Decision). On a persistent process that cost has no offsetting benefit.
- **Verdict: keep native WebSocket on either runtime; SSE+POST stays a documented alternative, not Phase 1.** The serverless-HTTP-only scenario that motivated ADR-002 does not apply to a Bun/Node persistent process.

---

## 4. One-server deploy (free-tier host needs)

| Host | Build | Port | One server? | Free-tier caveat |
|---|---|---|---|---|
| **Render Free (Bun)** | Bun native (no Docker needed)[2]; or Dockerfile[31] | `$PORT` env | ✅ same process serves SPA + WS | sleeps 15-min idle; 750 hr/mo[3] |
| **Hetzner CX22 / DO Droplet** | Dockerfile or systemd | 80/443 via reverse proxy | ✅ | **paid** (~$4–5/mo) |
| **Fly.io** | Dockerfile | `$PORT` | ✅ | card required; ~$2/mo[9][unverified] |
| **Cloudflare DO** | `wrangler deploy` (no Bun/Node runtime) | workers.dev | ✅ (Worker serves SPA + WS) | TS-only; cannot run Bun/Node[33][34] |

The "one server" requirement is satisfied by **any** of these — a single process serving the built SPA + WS on one port. The real discriminator is the free-tier constraint, not the serving pattern.

---

## 5. HONEST verdict — the fork (no forced preference)

### 5.1 Is there ANY lifetime-free host that runs a persistent Bun or Node realtime process?

**No.** The evidence:
- Cloudflare Workers/DO (the only true lifetime-free persistent-realtime host) **cannot run Bun or Node** (V8 isolates, JS/WASM only).[33][34]
- Cloudflare Containers can run any language but is **Workers Paid ($5/mo)** — no free container allowance.[24][23]
- Render Free runs Bun/Node but **sleeps after 15 min idle** and caps at **750 instance-hours/mo** — not "persistent" in the always-awake sense.[3]
- Fly.io free tier is **gone for new orgs** (legacy only; card required).[9][unverified]
- Railway free is a **trial** (30 days/$5 credits → $1/mo).[17]
- Vercel/Netlify free can't hold long-lived WS/SSE (300s cap / request-response functions).[7][8][18]
- No free non-Oracle VPS found that is lifetime-free and unconstrained; Oracle (the only real free VPS) is human-excluded.[20]

### 5.2 The fork (presented honestly, least-pain first)

| Option | What you get | Cost | Realtime reality | Runtime |
|---|---|---|---|---|
| **(a) Bun on Render Free** | Real Bun backend + static FE, one server, one port, native WS/SSE zero-dep | **$0** | ✅ while active; ⚠️ sleeps after 15-min idle (cold start ~1 min); 750 hr/mo cap (≈31 days always-on) | Bun |
| **(c) Stay Cloudflare DO, TS-only** | Lifetime-free, no card, always-awake rooms via Hibernation | **$0** | ✅ best free realtime | TypeScript (V8), **not** Bun/Node |
| **(b) Pay ~$5/mo** | Hetzner CX22 (~€3.79/mo ≈ $4.43)[unverified] or DO Droplet / Fly Hobby[9][21][22] | ~$2–5/mo | ✅ persistent, no sleep | Bun or Node (any) |
| **(d) Free non-Oracle VPS** | None found that is lifetime-free + unconstrained (Oracle excluded by human)[20] | — | — | — |

**Least-pain recommendation (not forced):** If the human's priority is **"I want Bun/Node and I accept the free-tier tradeoff,"** choose **(a) Bun on Render Free** — it satisfies "Bun BE + static FE, monorepo, one server" at $0, and the sleep/750hr limits are acceptable for an internal 3–15-user demo tool. If the priority is **"lifetime-free and always-awake no matter what,"** the only evidence-backed path is **(c) Cloudflare DO in TypeScript** — accept that neither Bun nor Node runs there. If the team values **no idle sleep and a real Bun/Node process** more than $5, **(b)** is the cleanest.

**Explicit non-recommendation:** don't pick Vercel Hobby for the realtime server (300s WS cap kills rooms)[7][8], don't pick Railway for a "free" long-term host (trial then $1/mo)[17], and don't pick Fly.io without accepting the card-on-file requirement (no free tier for new orgs).[9][unverified]

---

## 6. Implications for ADR-001 rev 2 + constitution §7–8

### ADR-001 rev 2 (Cloudflare DO primary, Render fallback)
- **If runtime stays TS-only (option c):** ADR-001 rev 2 stands as-is — Cloudflare DO primary, Render fallback. No change.
- **If runtime becomes Bun (option a):** the ADR must be **superseded or re-evaluated**:
  - Cloudflare DO is **non-viable** for Bun (V8 isolates, no native runtime).[33][34]
  - Render Free (Bun native) becomes **primary** (it already runs Bun natively[2]), with documented caveats: 15-min idle sleep, 750 hr/mo cap, ~1 min cold start.[3]
  - The `room:state` contract, event names, ack shapes, and state machine stay **unchanged** (architecture §7) — only the transport adapter and deployment target change. The "Node fallback" in ADR-001 §3 becomes a "Bun primary, Node fallback" or vice versa.
  - The walking-skeleton test (slice 0) still runs in-process against the shared `room.ts` module; `wrangler dev` smoke is replaced by a Render/Bun smoke.
- **If runtime becomes Node:** ADR-001 rev 2's Render free fallback is already Node + `ws`; it would just become primary (same caveats). Cloudflare DO stays rejected for the same reason (no real Node process; `nodejs_compat` is a partial compatibility layer, not a Node runtime).[33][34][unverified]

### Constitution §7 (Deployment)
- Line 8 currently: "Cloudflare Workers + Durable Objects free tier ... is primary; Render free web service is fallback."
- **If Bun/Node chosen:** update to "Render Free web service (Bun/Node) is primary for Bun/Node runtimes (sleeps after 15 min idle; 750 instance-hr/mo cap); Cloudflare Workers + DO remains the lifetime-free, always-awake alternative only for TypeScript-only code." Railway (trial-only), Fly (card), Oracle (human constraint) stay out.

### Constitution §8 (Language)
- Line 10: "Language: TypeScript." — This stays true for Bun and Node (both run TS natively or via build). No change needed, but if option (a) is chosen, add a note that Bun runs TS with zero build step.[12]

---

## 7. Open questions for architect / human gate

1. **Runtime + host fork** — (a) Bun on Render Free (accept sleep/750hr), (b) pay ~$5/mo (Hetzner/DO/Fly), (c) stay Cloudflare DO TS-only, or (d) other? This is the single decision that resolves the CR.
2. **Does the human accept 15-min idle sleep + 750 hr/mo for a demo tool?** If yes, Render Free (Bun) is the answer. If rooms must be always-awake overnight, that pushes toward (c) or (b).
3. **Cloudflare Containers** — it *can* run Bun/Node, but only on Workers Paid ($5/mo). If the human is willing to pay, this is a strong "Bun on Cloudflare" option worth a spike by architect (no free tier, so it belongs to option (b)).
4. **Node 24 native WS server** — the docs still say v22 lacks a built-in server; no stable Node built-in WS server is documented for 24 at this writing[unverified]. `ws` remains the Node path dependency. Re-verify if the team targets Node 24.
5. **Hetzner/DO exact pricing** — third-party sources give ~€3.79/mo (CX22) and per-second billing (DO); official pages are JS-rendered and not fully extracted here. Verify at purchase time.[21][22][unverified]

---

## Sources

[2] https://render.com/docs/deploy-bun-docker — https://render.com/docs/deploy-bun-docker
    > "Render now supports Bun natively, so you can use Bun without Docker."
[3] https://render.com/docs/free — https://render.com/docs/free
    > "Render spins down a Free web service that goes 15 minutes without receiving any inbound traffic. This includes both HTTP requests and WebSocket messages from existing connections."
    > "Render grants 750 Free instance hours to each workspace per calendar month"
[4] https://vercel.com/docs/functions/runtimes/bun — https://vercel.com/docs/functions/runtimes/bun
    > "Vercel Functions using the Bun runtime support most Node.js APIs"
[5] https://vercel.com/blog/bun-runtime-on-vercel-functions — https://vercel.com/blog/bun-runtime-on-vercel-functions
[6] https://bun.com/blog/vercel-adds-native-bun-support — https://bun.com/blog/vercel-adds-native-bun-support
[7] https://vercel.com/docs/functions/limitations — https://vercel.com/docs/functions/limitations
    > "Maximum duration Hobby: 300s default and maximum."
[8] https://vercel.com/docs/functions/websockets — https://vercel.com/docs/functions/websockets
    > "WebSockets are available in Beta on all plans"
    > "New WebSocket connections are not guaranteed to reach the same Vercel Function instance"
[9] https://fly.io/docs/about/pricing — https://fly.io/docs/about/pricing
    > "All organizations (except for Linked Organizations) require a credit card on file."
[10] https://developers.cloudflare.com/workers/platform/compatibility-dates — https://developers.cloudflare.com/workers/platform/compatibility-dates/
[12] https://bun.com/docs/api/websockets — https://bun.com/docs/api/websockets
    > "Bun.serve() supports server-side WebSockets, with on-the-fly compression, TLS support, and a Bun-native publish-subscribe API."
[13] https://bun.com/docs/api/http — https://bun.com/docs/api/http
    > "Use Bun.serve to start a high-performance HTTP server in Bun"
[14] https://bun.com/docs/install/workspaces — https://bun.com/docs/install/workspaces
    > "Bun supports workspaces in package.json . With workspaces, you develop several independent packages in a single repository, a monorepo ."
[15] https://docs.npmjs.com/cli/v10/using-npm/workspaces — https://docs.npmjs.com/cli/v10/using-npm/workspaces
[16] https://pnpm.io/workspaces — https://pnpm.io/workspaces
[17] https://railway.com/pricing — https://railway.com/pricing
[18] https://www.netlify.com/pricing — https://www.netlify.com/pricing/
[19] https://www.netlify.com/blog/netlify-bun — https://www.netlify.com/blog/netlify-bun/
[20] https://www.oracle.com/cloud/free — https://www.oracle.com/cloud/free/
    > "Arm-based Ampere A1 Compute"
[21] https://www.hetzner.com/cloud — https://www.hetzner.com/cloud/
[22] https://www.digitalocean.com/pricing/droplets — https://www.digitalocean.com/pricing/droplets
[23] https://developers.cloudflare.com/containers/pricing — Cloudflare Containers pricing
[24] https://developers.cloudflare.com/containers — Cloudflare Containers docs
    > "Available on Workers Paid plan"
[26] https://www.koyeb.com/pricing — Koyeb pricing
[27] https://fly.io/docs/about/plans — Fly.io plans
[29] https://nodejs.org/learn/getting-started/websocket — Node.js WebSocket client learn docs
    > "Node.js v22 does not provide a built-in native WebSocket server implementation."
[30] https://deno.com/deploy/pricing — Deno Deploy pricing
    > "Application Requests/month Allowed inbound HTTP requests to your deployments per month 1M"
    > "Egress Bandwidth Monthly limit on data egress across all your deployments. Inbound request data does not count against this number. 20GB"
[31] https://bun.com/docs/bundler — Bun bundler docs
    > "Bun.serve serves the assets from this manifest with no bundling at runtime."
[32] https://www.netlify.com/blog/bun-support-in-builds — Netlify Bun support in builds
[33] https://developers.cloudflare.com/workers/reference/security-model — Cloudflare Workers security model
    > "Workers does not allow our customers to upload native-code binaries to run on the Cloudflare network — only JavaScript and WebAssembly."
[34] https://developers.cloudflare.com/workers/runtime-apis/web-standards — Cloudflare Workers web standards
    > "The Cloudflare Workers runtime is built on top of the V8 JavaScript and WebAssembly engine ."
