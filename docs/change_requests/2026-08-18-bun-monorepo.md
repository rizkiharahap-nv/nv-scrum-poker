# Change Request: Bun.js backend + static FE in a monorepo, one-server deploy (pivots CR-03/ADR-001)

- **ID:** CR-2026-08-18-04
- **Date:** 2026-08-18
- **Requester:** Rizki (human)
- **Lanes affected:** `docs/architecture/ADR-001-realtime-transport.md` (rev 2 — Cloudflare DO primary), `docs/constitution.md` §Stack (line 7-8), `docs/architecture/architecture.md`, `docs/tasks.md`
- **Status:** RESOLVED — architect re-evaluation complete (ADR-001 rev 3, 2026-08-18): human chose **Svelte 5 FE (plain Svelte + Vite SPA, no SvelteKit SSR) + Cloudflare Workers + Durable Objects**. Node `ws` demoted to in-process test adapter only; Render free documented for that adapter (demo/play-test). Constitution §Stack + architecture.md + tasks.md updated in lockstep.
- **Pivots:** CR-2026-08-17-03 + ADR-001 rev 2 (Cloudflare Workers + Durable Objects, TypeScript-only)

## Human intent (verbatim)

- "i want use bun js, please research best option for bun js BE + static FE. i want in monorepo structure so i can deploy in one server only"
- **UPDATE 2026-08-18 (human): "how about nodejs BE?"** — the runtime is now an open choice between **Bun and Node.js** for the backend. Research BOTH (Node 22+ native WebSocket, no `ws` needed; Bun.serve native WS/SSE), and give a recommendation for the SAME monorepo + one-server + free-tier constraints. If Bun's free-tier hosting is strictly worse than Node's, say so with evidence.
- **UPDATE 2026-08-18 (human): "i want using svelte and node js backend can you make comparation for it?"** — the FRONTEND is now **Svelte** (vs the React/Vite SPA chosen in CR-01/ADR-001). Provide a Svelte + Node.js comparison: SvelteKit vs plain Svelte (SPA mode) vs React/Vite, for THIS app (static FE + one Node backend + realtime), with the monorepo shape adjusted accordingly.
- **DECISION 2026-08-18 (human): "give me architecture when i chose svelte for FE, and if i use cloudflare DO for it"** — human chose **Svelte FE + Cloudflare Workers + Durable Objects** for deployment. This resolves the fork: Svelte builds to static JS (no Node runtime needed on Workers), the DO holds the room state machine (pure TS), keeping the lifetime-free no-sleep host. Node/Bun process path is dropped for production; the Node `ws` adapter remains only for in-process walking-skeleton tests. Research (svelte-node-comparison-brief §5.2) confirms the port is mechanical (Zustand → Svelte runes, JSX → Svelte markup; Tailwind-only + Akira conventions unaffected; `room:state` contract unchanged).

## Constraint conflict to resolve with evidence

- Human earlier locked **free tier only** + **no Oracle** (CR-03 round 2) and chose **Cloudflare** (Gate 3 re-check).
- Cloudflare Workers + Durable Objects **cannot run Bun** (V8 isolates only; JS/TS + WASM; Bun is a separate JavaScriptCore runtime, no support). Node also can't run on Workers natively (only via `nodejs_compat` partial support, no long-lived process).
- So "Bun OR Node BE + static FE, one server, free tier" requires a persistent-process host. Candidate free hosts: Render free (15-min idle sleep, 750 hr/mo cap), Fly.io (free allowance but credit card required), Railway (trial credit then ~$1/mo — not lifetime-free), Vercel/Netlify functions (long-lived realtime capped ~300s), a non-Oracle VPS (no free tier found; Hetzner/DO droplet are paid).
- **Research must answer:** is there ANY lifetime-free host that runs a persistent Bun OR Node realtime process? If not, what is the least-pain option (accept Render sleep? pay ~$5/mo? keep Cloudflare DO in TS instead of Bun/Node?) — present honestly, no forced preference.

## Research scope

1. **Bun vs Node runtime support matrix** — which hosts run Bun and/or Node today (Render, Fly, Railway, Vercel, Netlify, Cloudflare?, VPS), with free-tier reality and realtime (WS/SSE) viability on each. Compare Node 22+ native WebSocket (built-in client; `ws` still needed for server? verify) vs Bun.serve native WS/SSE (zero deps).
2. **Monorepo structure** — best monorepo layout for "BE + static FE, one server" with EITHER runtime: Bun workspaces (`bunfig.toml`) or npm/pnpm workspaces (Node); `apps/web` (Vite React SPA) + `apps/server` (Bun.serve or Node http/ws + static file serving), shared `packages/` (protocol, room state machine). Compare Bun's built-in bundler + `Bun.serve` serving static assets (zero separate build server) vs Node (needs `express`/`serve-static` or Vite preview).
3. **Realtime on Bun vs Node** — Bun.serve WebSocketHandler (native WS server, zero dep) vs Node 22 (native WebSocket client only — server needs `ws`? confirm current state). SSE on both (HTTP response streams). Which makes the ~150-line thin layer smaller; does ADR-002 (SSE+POST) become more attractive on a Bun/Node single-process server?
4. **One-server deploy** — can the same process serve the built SPA + WS/SSE on one port (Bun.serve static middleware + upgrade handler; Node http server + static middleware + ws upgrade)? What does the free-tier host need (Dockerfile? build command? port binding)?
5. **If free tier can't host Bun/Node persistently** — present the honest fork: (a) Bun or Node on Render free (accept sleep + 750hr), (b) pay ~$5/mo (Fly/Railway Hobby/Hetzner), (c) stay Cloudflare DO (TypeScript-only, neither Bun nor Node), (d) free non-Oracle VPS if any. Recommend the least-pain path.

## Deliverables (researcher)

- `docs/research/bun-node-monorepo-brief.md` — evidence-backed: Bun vs Node runtime/host matrix + free-tier reality, recommended monorepo layout (workspaces), realtime approach (native WS/SSE), one-server serving pattern, and an honest verdict resolving the free-tier conflict. Cite sources (Bun docs, Node docs, host pricing/docs).
- Explicit implications for ADR-001 rev 2 + constitution §7-8.

## Next owner

`architect` — re-evaluate ADR-001 rev 2 vs the Bun/Node pivot (accept the runtime change if evidence supports it), then human Gate 3 re-check before builder.
