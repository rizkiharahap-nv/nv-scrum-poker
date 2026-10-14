# Research brief — Frontend stack: Vite + React SPA vs Next.js SSR

- **Status:** COMPLETE (research pass for CR-2026-08-17-01)
- **Date:** 2026-08-17 · **Owner:** researcher · **Appetite:** S
- **Inputs:** `docs/constitution.md` §Stack line 6, `docs/change_requests/2026-08-17-stack-realtime.md`, `docs/PRD.md`, `docs/architecture/architecture.md`
- **Next owner:** architect (re-evaluate ADR-001 + constitution §6–7)

## TL;DR / verdict

**Adopt Vite + React + TypeScript SPA (no SSR).** It is the right stack for
scrum-poker: a private, invite-only internal tool with no SEO or social-sharing
needs (PRD non-goals; internal),[1] where all realtime behavior happens in the
client and the server is a small Node realtime service (architecture §3;
internal). Vite gives a simpler dev loop, lower deploy footprint (static
files), and zero SSR complexity that would add nothing for this audience.[2][3]
Next.js SSR is the right tool when SEO / first-byte HTML / server-side
data-fetching matter — none apply here.[1] **Constitution §Stack line 6 should
flip from "Next.js preferred" to "Vite SPA".**[unverified — my synthesis of
the evidence above]

## 1. Evidence — dev/build simplicity

- Vite is a build tool + dev server; its dev server serves source via native
  ES modules and pre-bundles deps with esbuild, so startup is instant and HMR is
  fast regardless of project size.[3]
- Learning curve: Vite is described as "gentler", Next.js as "steeper" because
  of its custom components, routing, data-fetching, and rendering features.[3]
- Next.js is "opinionated" with built-in routing/data-fetching; Vite is
  "un-opinionated" and lets you pick libraries (here: Zustand, React Router).[3]
- A 2026 migration benchmark (mid-sized e-commerce dashboard) reports Vite SPA
  as "lightning fast" DX and Next.js as introducing SSR-specific concerns:
  hydration mismatch — using `window`/`localStorage` directly in a component
  body throws in Next.js SSR.[1]
- Build speed comparison in the same source: Vite wins on build speed; Next.js
  wins on SEO/meta tags.[1]

## 2. Evidence — deploy

- Vite SPA is CSR by default: the server mostly serves static files, which
  "offloads work from your server" and can "reduce infrastructure needs".[2]
  Deploy = static hosting (any VPS/CDN/object store) plus the existing small
  Node realtime server (ADR-001; internal). No Node server is required for the
  frontend itself.[2]
- Next.js SSR shifts rendering to the server per request and "increases the
  load on your server and can add some latency for each request" (mitigated by
  caching/ISR, but still server work).[2]
- Deployment consequence for this project: the realtime server (Socket.IO or
  SSE) must run as a persistent process anyway (ADR-001 consequences;
  internal); a Vite SPA adds no second runtime surface. Next.js would add a
  second Node/edge runtime with no benefit.[unverified — inference from [2]
  and ADR-001]

## 3. Evidence — realtime coexistence

- Scrum-poker's realtime pattern is: client renders a `room:state` snapshot,
  server owns the state machine, client sends commands with acks (architecture
  §7; internal). The client is a thin renderer of server state — exactly the
  CSR SPA model.[2]
- Next.js SSR adds a server-render/hydration step that must not touch browser
  APIs (`window`, `localStorage`, `sessionStorage`) during render; scrum-poker
  needs `sessionStorage` for the re-join identity flow (PRD decision 5;
  internal) — a known SSR friction point.[1]
- SEO and social sharing — the main reasons to choose SSR — are explicitly
  non-goals: private internal tool, no public audience, invite-only link
  access (PRD; internal). "If your application is a private, behind-a-login
  dashboard, Vite is often sufficient and offers a simpler development
  cycle."[1]

## 4. Comparison for scrum-poker

| Dimension | Vite + React SPA | Next.js SSR | Why it matters here |
|---|---|---|---|
| Dev/build simplicity | Instant server start, HMR, esbuild[3] | Steeper learning curve, hydration constraints[3][1] | S appetite; 6 slices; small team |
| Deploy | Static files + existing Node realtime server[2] | Node/edge runtime for SSR[2] | Internal tool; preview-only deploy (constitution) |
| SEO / social sharing | Weak (JS-executed meta)[1] | Strong (first-byte HTML)[1] | Non-goal (PRD) |
| Initial load | Slower first paint, white-screen risk[1] | Faster LCP (+60% in benchmark) but hydration FID[1] | 3–15 internal users on LAN/VPN; not a public funnel |
| Realtime coexistence | Native — client-only state + WS client[2] | SSR + browser-API constraints on sessionStorage[1] | Room state is server-authoritative; client is a mirror |
| Framework lock-in | Un-opinionated; Zustand/React Router our choice[3] | Opinionated routing/data-fetching[3] | Constitution prefers minimal deps |

## 5. Recommendation

**Choose Vite + React + TypeScript SPA.** Rationale:

1. The app's realtime model is server-authoritative push with client commands;
   the browser is a thin state mirror — no SSR value (architecture §7;
   internal).[2]
2. SEO / first-byte HTML / social previews are explicit non-goals (PRD;
   internal).[1]
3. S appetite: Vite's simpler dev loop and static deploy match the "easy to
   build" requirement in the change request (CR-2026-08-17-01; internal).[3]
4. ADR-001's technical contract already says "React + Vite (SPA) + TypeScript +
   Zustand" (internal); constitution line 6 ("Next.js preferred") is the only
   document still pointing the other way.[unverified — repo-doc comparison]

**Implication for constitution §Stack line 6:** change to something like:

> **Frontend:** React + Vite (SPA, no SSR) + TypeScript. Next.js SSR is out of
> scope for Phase 1 — no SEO/public-audience need; add an ADR if that changes.

**Implication for ADR-001:** no change needed to the client-stack contract; it
already specifies Vite SPA (internal). The spike (001) validated Socket.IO with
a Vite client; the stack decision here merely aligns the constitution with what
the ADR already assumes.[unverified — repo-doc comparison]

## Sources

[1] https://dev.to/digitaldev/vite-spa-vs-nextjs-ssr-real-performance-differences-after-migration-with-benchmarks-4d7k — Vite SPA vs Next.js SSR: Real Performance Differences
[2] https://rollbar.com/blog/nextjs-vs-vitejs — Next.js or Vite.js: Which Framework is Better, and When?
[3] https://prismic.io/blog/vite-vs-nextjs — Vite vs. Next.js: Features, Comparisons, Pros & Cons
