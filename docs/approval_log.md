# Approval Log — Scrum Poker

Human-gate decisions and their audit trail. Each entry: gate, date, decision, evidence, artifacts, next action.

---

## Gate 3 — Design + Plan approval (t_12f14f3d)

- **Date:** 2026-08-17
- **Decision:** APPROVED with changes — the human answered all 7 open questions; scope + contracts updated in `docs/PRD.md` (resolved-questions section); build plan approved to proceed through the CR pipeline.
- **Evidence:** Gate 3 review comment (2026-08-15 23:55) verdict APPROVAL-READY; human answers recorded below.
- **Human decisions (verbatim intent):**
  1. Anyone can reveal (host is a user too; can vote, can reveal).
  2. Host is a user too; re-join via link keeps all data before.
  3. Pass/coffee — do in this phase.
  4. Yes — final decision is someone clicks reveal.
  5. Everyone can re-vote; host is same as other user, host just creates the room.
  6. Yes (no story title field in Phase 1).
  7. Ignore the vote after reveal; give pass.
- **PRD updates applied:** anyone-can-reveal (AC-F3.1), pass vote in Phase 1 (AC-F3.5), anyone re-vote (AC-F4.3), re-join keeps identity (decision 5), resolved-questions section.
- **Next action:** CR-01 (researcher t_9efc19ad) + CR-02 (pm t_c3d51375) → architect re-eval → Gate 3 re-check before builder.

---

## Gate 3 re-check — final stack decision (free-tier only) (t_12f14f3d)

- **Date:** 2026-08-18
- **Decision:** APPROVED — human chose **Cloudflare for deployment**. ADR-001 rev 2 ACCEPTED: native WebSocket thin layer on Cloudflare Workers + Durable Objects free tier (primary), Render free web service (fallback). Socket.IO dropped; SSE+POST documented as ADR-002 (not adopted). Constitution §Stack updated (Vite SPA, native WS, Cloudflare DO deploy).
- **Evidence:** CR-03 research brief (deployment-cost-minimal-realtime-brief.md — lifetime-free verdict: Cloudflare yes/no-card/DO-hibernation, Render yes-but-sleeps, Railway trial-only), architect re-eval t_bfb10192 (commit a8cecf5).
- **Human decisions:** free tier only; no Oracle; choose Cloudflare. Railway rejected (trial-only), Render fallback (15-min sleep/750hr cap).
- **Next action:** maestro unblocks builder t_434db72a → build against ADR-001 rev 2 → qa → reviewer → ship gate.

---

## Gate 3 — FINAL approval (ADR-001 rev 3: Svelte + Cloudflare DO)

- **Date:** 2026-08-18
- **Decision:** APPROVED — human said "i approve all". Final stack locked:
  - **FE:** Svelte 5 (plain Svelte + Vite SPA, no SSR, no SvelteKit) + TypeScript; state = Svelte runes `$state` (Zustand dropped).
  - **BE/realtime:** Cloudflare Workers + Durable Objects — the ONLY production path. Native WebSocket thin layer (browser `WebSocket` + DO server adapter), JSON `{id,type,payload}` + acks, `room:state` broadcast. Node `ws` demoted to test adapter (walking skeleton / local dev) only.
  - **Deploy:** lifetime-free Cloudflare free tier (WebSocket Hibernation, fail-closed billing, DDoS-absorbed at edge). Railway/Oracle out; Render free documented for the test adapter only.
- **Evidence:** ADR-001 rev 3 (commit a93dd80), svelte-node-comparison-brief (React→Svelte mechanical port; DO satisfies "backend required" — one DO per room = single server-side authority), bun-node brief (Node ws = test adapter only).
- **Gate decisions carried:** anyone-can-reveal, host=user, pass card (AC-F3.5), anyone re-vote, re-join keeps identity, no story title, leaver votes ignored; remembered display name (AC-F1.5/1.6).
- **Next action:** maestro unblocks builder t_434db72a → build ADR-001 rev 3 → qa → reviewer → ship gate.

---

## Gate 4 (pre-ship) — Senior product-gate review (t_52e303f8 / t_011f1da6)

- **Date:** 2026-08-18
- **Round 1 decision:** REQUEST CHANGES — functional MVP approved as far as it goes,
  but the Cloudflare DO production adapter (constitution + ADR-001 rev 3 mandate) was
  missing from the repo. Not ready to ship.
- **Round 1 evidence:** `docs/review/review-decision.md`. Reviewer independently
  re-ran: `npm test` 64/64, typecheck clean, build green, `qa/e2e_verify.py` 36/36
  PASS (PORT=5199). All PRD ACs F1.1–F5.6 verified. No scope leaks, no functional bugs.
- **Round 1 required before ship:**
  1. Implement `server/roomObject.ts` (DO class: `acceptWebSocket`, Hibernation
     message/close handlers, storage-backed state blob, DO alarm grace eviction) +
     `wrangler.toml` (SPA + `/ws` from one Worker).
  2. Client connects to `/ws?room=<token>` on the CF path; `room:create` returns
     `roomId = token` (`idFromName(token)`).
  3. `wrangler dev` smoke of walking skeleton (connect → create → join → vote →
     reveal → reset) + updated QA deployment section.
  4. (Recommended, non-blocking) Fix `Join.svelte` `NAME_INVALID` copy — it says
     "already taken" but duplicate names are allowed.
- **Round 2 decision: APPROVED** (t_011f1da6, execution lens) — all round-1 required
  items 1–3 independently re-verified against the repo and the live DO path; item 4
  confirmed fixed.
- **Round 2 evidence:** `docs/review/review-decision.md` round 2. Reviewer re-ran:
  `npm test` 64/64, typecheck clean, build green; `wrangler dev` + `do-smoke.mjs`
  30/30; `qa-resume-check.mjs` 11/11 (room:resume re-bind, storage blob round-trip,
  ephemeral deleteAll); HTTP guards (`/` 200, `/r/<token>` 200, `/ws` 400, non-upgrade
  426); constitution scans green (Tailwind-only, no polling, free-tier-only, ephemeral
  rooms, no scope expansion). QA round-2 (t_d6042c8d) corroborates: E2E 36/36, edge
  10/10, do-smoke + resume-check re-run.
- **Next action:** human ship gate (Gate 4, t_5d8f44d7) — maestro blocks for human
  approval of the Phase 1 release. Deploy stays preview-only until then (constitution).

---

## Gate 4 (pre-ship) — human response: APPROVE WITH 3 CHANGES (t_5d8f44d7)

- **Date:** 2026-08-18
- **Decision:** NOT plain approve — the human answered the ship gate with three
  change requests. Release stays preview-only; Gate 4 remains blocked and re-fires
  once for the human after the changes land.
- **Human requests (verbatim intent):**
  1. "for ui poker table is like this image in image/" — room screen should render
     as a poker table (participants around a table, cards on the table) like the
     reference screenshots in `image/`. Reverses the PRD Phase-1 non-goal that
     excluded poker-table dressing.
  2. "i need shorten token room we can use 6 number only" — room tokens become 6
     numeric digits (`/r/123456`). Deliberate entropy reduction (10^6 codes);
     documented tradeoff for an internal ephemeral tool with no PII.
  3. "write me MD file to run in local i need run it locally to test by my self" —
     local-run guide delivered at `docs/local-run.md` (Node test adapter, Vite
     HMR, and `wrangler dev` Cloudflare DO paths + manual checklist).
- **CRs opened (docs + board):**
  - CR-2026-08-18-05 poker-table UI — `docs/change_requests/2026-08-18-poker-table-ui.md`; board task t_70e6c767 (ux → pm → builder)
  - CR-2026-08-18-06 6-digit room token — `docs/change_requests/2026-08-18-6-digit-room-token.md`; board task t_d6c96fc0 (architect → builder)
- **Evidence:** gate comment on t_5d8f44d7; `docs/local-run.md`; CR docs above.
- **Next action:** ux + architect land their CR contracts → maestro routes builder
  → qa → reviewer re-review → Gate 4 re-fires for the human ship decision.

---

## Gate 4 (final) — APPROVED by human, with CR-05 + CR-06 approved (t_5d8f44d7)

- **Date:** 2026-08-18
- **Decision:** APPROVED — human approved the Phase 1 release AND approved both
  change requests raised at the gate. Release ships once the approved changes land
  and pass qa + reviewer.
- **Approved changes folded in:**
  - CR-2026-08-18-05 poker-table UI — approved; ux spec → pm PRD reversal → builder
    (board t_70e6c767, released by gate completion).
  - CR-2026-08-18-06 6-digit numeric room token — approved; architect contract lock
    → builder (board t_d6c96fc0, released by gate completion).
  - Local-run guide `docs/local-run.md` — delivered and verified (Option A live
    smoke: GET / 200, /r/<token> 200, room:create ok).
- **Evidence:** human approval on t_5d8f44d7 ("oke approve and o my change
  request"); reviewer round-2 APPROVED (t_011f1da6); `docs/review/review-decision.md`;
  CR docs; `docs/local-run.md`.
- **Deploy status:** preview-only until CR-05/CR-06 land + qa + reviewer re-check
  (constitution deploy-freeze). No live deploy run (no CF credentials in env —
  reviewer caveat).
- **Next action:** CR tasks run (ux ∥ architect) → maestro routes builder → qa →
  reviewer → deploy + ship. Outcome: `docs/review/outcome.md`.

---

## CR-2026-08-18-06 — 6-digit room-code contract locked (architect)

- **Date:** 2026-08-18
- **Decision:** Contract locked in `docs/architecture/architecture.md` §5,
  PRD AC-F1.2 rewritten with the security tradeoff, `docs/tasks.md` slice 1
  updated for the builder.
- **Locked contract:** room code = exactly 6 ASCII digits (`000000`–`999999`),
  leading zeros preserved, `roomId` always a string; uniform generation via
  rejection sampling (`crypto.getRandomValues`, no modulo bias) on the CF path,
  `crypto.randomInt(0, 1_000_000)` zero-padded on the Node test adapter;
  bounded collision retry ≤5 (`room:create` acks `ROOM_NOT_FOUND` on an occupied
  code — DO `idFromName(code)` already owns a room — client reconnects with a
  fresh code); security tradeoff documented (~19.9 bits / 10^6 codes,
  brute-forceable, acceptable ONLY for internal + ephemeral + no-PII, per human
  Gate 4); **join-attempt rate limit explicitly deferred out of Phase 1**
  (revisit before any public/external deployment); participant ids remain
  128-bit crypto-random (format applies to room codes only).
- **Evidence:** CR doc `docs/change_requests/2026-08-18-6-digit-room-token.md`;
  architecture §5; PRD AC-F1.2; tasks.md slice 1; approval log Gate 4 entries.
- **Next action:** maestro routes builder (token.ts rejection sampling, Landing
  collision retry, Node adapter `handleCreate` collision ack, App.svelte regex
  `/^\/r\/\d{6}\/?$/`, room-create tests) → qa → reviewer → Gate 4 re-fire.

---

## Gate 4 (final) — SHIP-READY (reviewer round 3, t_99df2152)

- **Date:** 2026-08-18
- **Decision:** **SHIP-READY** — reviewer round-3 APPROVED both Gate 4 CR deltas
  (CR-05 poker-table UI + CR-06 6-digit room code). Round-2 approval of the DO
  adapter stands; the release is verified end-to-end. Next step is the **human
  ship decision + deploy** (maestro blocks for the human, constitution
  deploy-freeze).
- **Evidence:** `docs/review/review-decision.md` round 3. Reviewer independently
  re-ran: `npm test` 71/71, typecheck clean, build green (125 modules); wrangler
  dev + do-smoke 30/30 (roomId=6-digit code, participantId UUID), resume-check
  11/11; E2E 36/36 + edge 10/10 on the built SPA; constitution scans green
  (Tailwind-only, no polling, free tier, ephemeral). QA round-3 (t_6cee04d9)
  corroborates: 71/71, E2E 36/36, edge 10/10, DO 30/30 + 11/11.
- **Non-blocking items recorded (for maestro):**
  1. `docs/constitution.md` line 37 still lists "Poker-table dressing … OUT of
     Phase 1" — stale after the CR-05 reversal; reconcile before the next gate.
  2. Pre-existing uniformity spot-check flake (±6σ, once in 6 runs) — product
     unaffected; builder to widen to ±7σ or raise N in a polish pass.
- **Deploy status:** preview-only until the human ship decision (no CF
  credentials in env — no live deploy run; DO path verified locally via
  `wrangler dev`).
- **Next action:** **human ship decision + deploy** — maestro (t_99df2152)
  hands to the human. Outcome: `docs/review/outcome.md`.
