# Change Request: Deployment topology + realtime cost + minimal-dependency transport (extends CR-01)

- **ID:** CR-2026-08-17-03
- **Date:** 2026-08-17
- **Requester:** Rizki (human)
- **Lanes affected:** `docs/constitution.md` §Stack (6-7), `docs/architecture/ADR-001-realtime-transport.md`, `docs/research/*` (new brief)
- **Status:** OPEN — researcher brief assigned, then architect re-evaluates ADR-001
- **Extends:** CR-2026-08-17-01 (stack + HTTP-stream evaluation)

## Questions from the human (verbatim intent)

1. **Is a backend needed at all?** — Answer with evidence: realtime multiplayer cannot work client-only; define the minimal backend shape.
2. **If backend needed, can Astro be fully functional, deployed on one platform like Vercel?** — Evaluate Astro (frontend + API routes + realtime handling) and give concrete single-server deployment options (Vercel all-in-one vs single persistent Node process on Render/Fly/Railway/VPS vs Astro+Node adapter). Include Vercel's June 2026 WebSocket public beta limits.
3. **SSE vs WebSocket — how about the cost?** — Compare cost on (a) serverless/Vercel (function invocations + bandwidth vs Fluid-compute connection-duration) and (b) a flat persistent VM (transport-agnostic). Give a verdict at scrum-poker scale (3-15 users/room).

## Constraint added 2026-08-17 (human): FREE TIER ONLY + cross-language options

- **Deployment is restricted to free tier only.** Evaluate which hosts actually support a realtime (WebSocket/SSE) app on a free plan without killing long-lived connections: Render free (sleeps after inactivity), Fly.io free allowances (needs card), Railway (trial credit only), Vercel free (function duration caps + WS beta), Netlify free (function timeouts), Cloudflare Workers + Durable Objects free, Deno Deploy free, Supabase free (hosted Realtime), Oracle Cloud free VPS (no sleep). Verdict: which free hosts can hold a persistent realtime process, and which only fit static/SPA hosting.
- **Also evaluate other languages for the backend** if they fit free-tier hosting better or reduce dependency count: Node native (http/WS), Deno (native WebSocket/SSE, no cold start), Python (FastAPI/Starlette WebSocket+SSE), Go (stdlib + gorilla/native ws, single binary), Elixir/Phoenix (native realtime) — ranked by ease-to-build + minimal-libs + free-tier fit for THIS app. Stay aligned with the constitution where possible; if another language is materially better, say so with evidence and propose the constitution change.

## Constraint added 2026-08-17 (human, round 2): Oracle NOT usable + specific host research

- **Oracle Cloud is NOT an option** (human: "i can't use oracle for some reason"). Remove it from the candidate matrix.
- **Research specifically whether Cloudflare, Render, and Railway are lifetime-free**, and rank the best stack (frontend + backend + realtime transport) that is fully supported on a free tier server.
- Researcher CR-03 brief §5 matrix + §6 language eval + §7 ADR implications already exist and reflect the earlier free-tier scope; this round adds: (a) drop Oracle, (b) explicit lifetime-free verdict for Cloudflare/Render/Railway (Cloudflare = yes, free forever no card, DO hibernation; Render = yes but 15-min idle sleep + 750hr/mo cap; Railway = NO — $5 trial credit then $1/mo, not viable), (c) confirm Cloudflare Workers + Durable Objects as the recommended topology for this app (official docs: DO free tier daily-reset limits, no duration charge while hibernated, WebSocket Hibernation API).

## Suggestion from the human

- **Prefer fewer libraries; use built-in framework capabilities; if a simple library, prefer building our own thin layer.** Evaluate: native WebSocket (browser API + Node 22 native/`ws`) and native EventSource (SSE) vs Socket.IO (client+server libs, engine.io, reconnect/buffering). Recommend a minimal-dependency realtime layer (~150 lines, connect/subscribe/command/reconnect+resync) reusing the architecture §7.2 transport-agnostic `room:state` contract. Confirm what stays (React, Vite, Zustand, Tailwind) and what gets dropped.

## Deliverables (researcher)

- `docs/research/deployment-cost-minimal-realtime-brief.md` — evidence-backed answers to Q1-Q3 + the minimal-library recommendation, with implications for ADR-001 and constitution §6-7. Cite sources (Vercel WebSocket beta changelog, Astro docs/adapter, Socket.IO vs native docs, pricing pages).

## Next owner

`architect` — combined re-evaluation of ADR-001 + constitution §6-7 across CR-01 + CR-03, then builder (t_434db72a) unblocks against the final spec.
