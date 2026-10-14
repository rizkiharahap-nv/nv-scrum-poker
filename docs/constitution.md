# Constitution — Scrum Poker

Non-negotiables. Every artifact and line of code must comply.

## Stack
- **Frontend:** Svelte 5 (plain Svelte + Vite SPA, **no SSR**, no SvelteKit) + TypeScript. Next.js/Astro/React SSR is out of scope for Phase 1 — no SEO/public-audience need (ADR-001 rev 3).
- **Realtime:** Native WebSocket thin layer — browser `WebSocket` on the client, Cloudflare Durable Objects server adapter, JSON envelopes `{id, type, payload}` with acks, `room:state` broadcast. SSE + HTTP POST documented as an alternative (ADR-002). Socket.IO and polling are out.
- **Deployment (lifetime-free only):** Cloudflare Workers + Durable Objects free tier (WebSocket Hibernation) is the ONLY production path; it serves the built SPA + `/ws` from one Worker. Node `ws` adapter is a **test adapter only** (walking skeleton, local dev) — NOT a production path; Render free is documented as a demo/play-test host for that adapter only. Railway (trial-only) and Oracle are out. Public deploy stays preview-only until qa + reviewer pass (see Never allowed).
- **State:** Svelte runes (`$state` in a `.svelte.ts` module) for client room state — no Zustand.
- **Language:** TypeScript.

## Testing bar
- Unit tests for core game logic (vote collection, reveal, consensus detection, Fibonacci sequence).
- Integration test for the realtime path (vote → broadcast → reveal → consensus) — the walking skeleton must be covered.
- `npm test` and `npm run build` must pass before a slice is Done.

## Security
- No secrets in client code; `.env` left out of git.
- Room access via unguessable room code / invite link (crypto-random, not sequential).
- No PII required; display name only.

## Style
- Plain CSS (`apps/web/src/poker-table.css`). No Tailwind, no `.less`.
  Svelte `style:*` directives are allowed for seat/card geometry.
- Component-first; no dead code; match Akira design conventions where applicable.

## Dependency policy
- Prefer minimal, well-maintained deps. Justify every dependency in the ADR.
- No heavyweight framework additions without architect approval.

## Never allowed
- No plaintext passwords/keys in repo.
- No synchronous HTTP polling to fake realtime (must use a realtime transport).
- No scope expansion beyond the current slice's acceptance criteria without a change request.
- Deploy to public URL is NOT part of builder output — preview only until qa + reviewer pass.

## Phase 1 (S) scope guardrail
Phase 1 = bare MVP only: room + invite link, face-down vote, reveal, consensus detection, Fibonacci cards. Poker-table dressing and gamification are OUT of Phase 1 (future phases).
