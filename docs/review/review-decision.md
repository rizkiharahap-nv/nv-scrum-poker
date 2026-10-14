# Review Decision — Scrum Poker Phase 1 MVP (senior product gate)

- **Task:** t_52e303f8 — Senior product-gate review before ship
- **Reviewer:** reviewer · **Round:** 1 (artifact lens) · **Date:** 2026-08-18
- **Build under review:** git main @ `7523108` (slice-6), clean working tree
- **Upstream:** QA verdict PASS (t_6b641aeb) — independently re-verified by this review
- **Decision: REQUEST CHANGES** — the functional MVP is complete and verified, but the
  production deployment path (Cloudflare Durable Object adapter) mandated by the
  constitution and ADR-001 rev 3 does not exist in the repo. Not ready to ship as-is.

---

## 1. What was verified independently (not just the QA handoff)

| Check | Result |
|---|---|
| `npm test` (unit + integration, 11 files) | **64/64 PASS** (re-run by reviewer) |
| `npm run typecheck` | **clean** (re-run) |
| `npm run build` | **green**, 123 modules, SPA + Tailwind CSS 4 output (re-run) |
| QA E2E harness (`python3 qa/e2e_verify.py`) | **36/36 PASS** (re-run by reviewer against a locally started server, PORT=5199) |
| Source inspection | `apps/server/src/index.ts`, `packages/room/src/index.ts`, `packages/protocol/src/index.ts`, all `apps/web/src` components/store/realtime modules |
| Contract cross-check | PRD AC F1.1–F5.6, constitution, ADR-001 rev 3, architecture.md, ui_spec.md, tasks.md, approval_log.md |
| Scope leak scan | no analytics/growth/auth/gamification code in `apps/web/src`, `index.html`, or packages |

## 2. Verdict against the five review questions

### (1) Does the built product match the PRD vision and ACs? — YES

Every AC F1.1–F5.6 maps to code plus a passing test, and the critical guarantees are
structural, not cosmetic:

- **Face-down (AC-F2.3):** `RoomState.votes`/`consensus` are only emitted when
  `phase === 'revealed'` (`packages/room/src/index.ts` `state()`); the wire contract
  makes pre-reveal value leakage impossible.
- **Guest isolation (AC-F1.4):** a fresh browser hitting `/r/<token>` renders the join
  gate only; `Room.svelte` redirects when no session exists.
- **Anyone-can-reveal / anyone-can-re-vote (AC-F3.1/F4.3):** server treats host and
  guests identically; zero-vote reveal guard is enforced server-side (`ZERO_VOTES`).
- **Unguessable token (AC-F1.2):** 16 random bytes → base64url (128-bit) via Web Crypto
  on the client path / `crypto.randomBytes(16)` on the test adapter.
- **No polling (AC-F5.6):** grep for `fetch(/XMLHttpRequest/axios/setInterval` in
  `apps/web/src` returns zero matches; all updates arrive over the WS `room:state`
  broadcast.
- **Pass vote (AC-F3.5):** excluded from consensus detection and numeric distribution.

### (2) Is the UX usable enough for internal team adoption? — YES (minor notes)

The flow matches ui_spec: Landing (name + New room) → room header with copyable invite
URL → guest join gate → face-down voting with X-of-N progress → simultaneous reveal →
consensus/no-consensus with distribution → Re-vote. Seats show Host/You badges and a
Voted check; `aria-live`/`role="alert"`/`aria-pressed`/focus-visible rings are present.
No console errors in the E2E run. This is clean enough for a competent internal team.

Non-blocking observations (not AC violations):
1. Invite URL chip is `hidden … sm:flex` — on small screens only the Copy button shows
   (documented non-goal: mobile polish out of scope; copy still works).
2. `Join.svelte` maps `NAME_INVALID` to "That name is already taken in this room." —
   inaccurate copy: `NAME_INVALID` means invalid name (empty / >24 chars / whitespace),
   and duplicate names are explicitly allowed. Client-side maxlength+validation makes
   this path rare, but the copy should say the name is invalid (1–24 chars).

### (3) Blocking bugs or usability issues? — NONE found in the functional MVP

No functional, visual, accessibility, or console defects reproduced. QA's edge-case run
(10/10) plus the reviewer's own 36/36 E2E re-run agree.

### (4) Is the architecture sound for a small-team production tool? — DESIGN yes, DELIVERY no

The design is sound for the target scale (3–15 participants/room, handful of rooms):
server-authoritative state machine, transport-agnostic shared `packages/room`, thin WS
envelope with acks, ephemeral rooms with grace-window eviction, 128-bit invite tokens,
no persistence. The shared room module + WS envelope verified here carry to the
Cloudflare path.

**However: the production runtime itself is missing from the repo.** The constitution
and ADR-001 rev 3 mandate Cloudflare Workers + Durable Objects (WebSocket Hibernation)
as **the ONLY production path** — "it serves the built SPA + `/ws` from one Worker".
The ADR's technical contract explicitly lists `server/roomObject.ts` (DO class) and
`wrangler.toml` as builder deliverables, and slice 0 called for a `wrangler dev` smoke.
None of this exists:

- no `wrangler.toml`
- no DO class / `roomObject.ts` / worker entry (grep across repo: zero hits)
- no storage-backed room blob / hydration / `deleteAll` (only prose in architecture.md)
- no DO alarm-based leave-grace eviction (Node `setTimeout` exists; DO needs `setAlarm`)
- client connects to bare `/ws`, not `/ws?room=<token>` as the DO path specifies
- `room:create` on the DO path must return `roomId = token` (`idFromName(token)`);
  the test adapter returns a server-generated id — the DO ack shape is unimplemented

The Node `ws` adapter is constitutionally **not** a production path ("test adapter
only"). Shipping would therefore violate the constitution's Stack/Deployment
non-negotiables — a reviewer-mandated check.

### (5) Growth/auth/gamification features leaked into Phase 1? — NO

No analytics, signups, accounts, leaderboards, scores, streaks, badges, chat, timers,
stats, or integrations anywhere in the SPA/packages. The pass card is in-scope
(AC-F3.5, Gate 3 human decision). Non-goals respected.

---

## 3. Required changes (exact items)

1. **Implement the Cloudflare Durable Object production adapter per ADR-001 rev 3**
   (currently prose only):
   - `server/roomObject.ts` (DO class): `fetch` upgrade → `acceptWebSocket`;
     `webSocketMessage/Close/Error` (Hibernation API); room state persisted to
     `state.storage` as a JSON blob (hydrate on wake, write on mutation, `deleteAll`
     when the last connection leaves after grace); leave-grace eviction via DO alarm
     (`setAlarm`), not `setTimeout`.
   - `wrangler.toml` (free plan) serving the built SPA static assets + `/ws` from one
     Worker.
   - Client: connect to `/ws?room=<token>` on the CF path (currently connects to bare
     `/ws`).
   - `room:create` returns `roomId = token` (DO `idFromName(token)` path), preserving
     AC-F1.2/AC-F1.3.
2. **Re-verify against the DO adapter:** at minimum a `wrangler dev` smoke of the
   walking skeleton (connect → create → join → vote → reveal → reset), plus the shared
   unit suite; update `qa/test-report.md`'s deployment section with the DO results.
3. **Fix the `NAME_INVALID` copy in `Join.svelte`** (recommended, non-blocking):
   "That name is already taken in this room." → e.g. "That name is not valid (1–24
   characters)."

## 4. What remains approved (bounded)

The functional MVP (SPA + shared room/protocol + Node test adapter) is approved as far
as it goes: all ACs verified, tests green, UX usable, no scope leaks. The required
change is additive to that base — the DO adapter + verification — not a redesign.

**Next owner:** builder (implement items 1–2, then re-request QA/review). After the DO
adapter is verified, this decision converts to approve and the product is ready for the
human ship gate.

---

## Round 2 — re-review of Cloudflare DO adapter (execution lens) — APPROVED

- **Task:** t_011f1da6 — Reviewer re-review Cloudflare DO production adapter (round 2)
- **Reviewer:** reviewer · **Round:** 2 (execution lens) · **Date:** 2026-08-18
- **Build under review:** git main @ `c31bcfd` (slice-7-do-adapter) + QA round-2 working tree
- **Upstream:** QA re-verify t_d6042c8d PASS — do-smoke 30/30, resume-check 11/11,
  E2E 36/36, edge 10/10, all constitution scans green
- **Decision: APPROVED** — round-1 required items 1–3 independently re-verified
  against the repo and against the live DO path (`wrangler dev`); item 4 (non-blocking)
  confirmed fixed. Next owner: **human ship gate (Gate 4, t_5d8f44d7)**.

### Round-1 required items — verdict

| # | Item | Verdict | Evidence (independent, this round) |
|---|---|---|---|
| 1 | **DO production adapter** — `acceptWebSocket` + Hibernation handlers, storage-backed state blob (hydrate/write/deleteAll), alarm-based grace eviction (not `setTimeout`) | ✅ **PASS** | `server/roomObject.ts`: `fetch` → `acceptWebSocket` (L86); `webSocketMessage`/`webSocketClose`/`webSocketError` (L290–314); `ensureRoom()` hydrates `ROOM_BLOB` on wake (L91–96); `persist()` writes on every mutation (L99–101); `alarm()` evicts disconnected participants after `LEAVE_GRACE_MS=8000` and calls `storage.deleteAll()` when empty (L140–157); `scheduleAlarm` uses `setAlarm`, keeps earliest pending (L124–132). Zero `setTimeout` in `server/`. |
| 2 | **`wrangler.toml`** free plan serving SPA + `/ws` from one Worker | ✅ **PASS** | `wrangler.toml`: `main="server/worker.ts"`, `[durable_objects]` `SCRUM_POKER_ROOM`, `new_sqlite_classes` migration, `[assets]` `directory="./apps/web/dist"` + `ASSETS` binding + `not_found_handling="single-page-application"`. No paid-plan line. Live-tested: `GET /` → 200 `text/html`; `GET /r/<token>` → 200 SPA fallback; `GET /ws` (no token) → 400; `GET /ws?room=x` non-upgrade → 426. |
| 3 | **Client `/ws?room=<token>`** + `room:create` returns `roomId = token` | ✅ **PASS** | `clientChannel.ts` `socketUrl()` appends `?room=<token>` over the `VITE_SOCKET_URL` base (L26–31); `Landing.svelte` generates the token client-side via Web Crypto (`generateToken`, AC-F1.2) and uses `ack.roomId ?? token` (L37–47). Live: do-smoke `room:create` ack `roomId === token` (128-bit base64url). |
| 4 | **NAME_INVALID copy** (recommended, non-blocking) | ✅ **PASS (fixed)** | `Join.svelte:52–53` → "That name is not valid (1–24 characters)."; built bundle `apps/web/dist/assets/index-*.js` contains the new copy and not the old "already taken" text. |

### Independent verification (round-2 execution lens)

- `npm test` → **64/64 PASS** (11 files) — re-run by reviewer
- `npm run typecheck` → **clean** (tsconfig.base + server/tsconfig)
- `npm run build` → **green** (123 modules)
- `npx wrangler dev --port 8799 --local` (wrangler 4.123.0) + `node scripts/do-smoke.mjs` → **30/30 PASS** (connect → create roomId=token → join → face-down vote → reveal → reset → grace eviction ≤10s → ephemeral deleteAll → `ROOM_NOT_FOUND` on late join)
- `node scripts/qa-resume-check.mjs` → **11/11 PASS** (room:resume re-binds same participantId, storage blob round-trip hydrates `phase=revealed` + votes, ephemeral delete after last leave)
- HTTP guard rails: `/` 200, `/r/<token>` 200 SPA fallback, `/ws` 400, non-upgrade 426 — all correct
- wrangler dev log: no errors/exceptions during either script run
- Constitution scans: Tailwind-only (only `app.css` = `@import 'tailwindcss';`, no `style=` attrs, no `.less`), no polling (no `fetch(`/`XMLHttpRequest`/`axios`/`setInterval` in `apps/web/src`), free-tier-only (no paid plan line), ephemeral rooms (deleteAll live-verified), no scope expansion (all new code is the ADR-001 rev 3 DO adapter)

### Caveats recorded for ship (non-blocking)

- **No live `wrangler deploy` was run** — no Cloudflare credentials in this
  environment. The DO adapter was exercised locally through `wrangler dev` (real
  WebSockets through the DO path, storage blob round-trip, alarm eviction). Deploy
  stays preview-only until the human ship gate; constitution requires the human
  decision before a public deploy.
- Worker falls through to `env.ASSETS` for all non-`/ws` paths; SPA fallback
  behavior verified locally.

**Next owner:** human ship gate (Gate 4, t_5d8f44d7) — maestro blocks for human approval.

---

## Round 3 — re-review of Gate 4 CR deltas (contract lens) — APPROVED (SHIP-READY)

- **Task:** t_99df2152 — Reviewer re-review CR-05 poker-table UI + CR-06 6-digit room code
- **Reviewer:** reviewer · **Round:** 3 (contract lens) · **Date:** 2026-08-18
- **Build under review:** git main @ `8a477af` (CR-05) + `a180220` (CR-06) + QA round-3 working tree
- **Upstream:** QA t_6cee04d9 PASS — 71/71, E2E 36/36, edge 10/10, DO smoke 30/30 + resume 11/11
- **Decision: APPROVED — SHIP-READY.** Both Gate 4 CR deltas independently verified against
  the original task body, the CR docs, and the contracts (PRD AC-F1.2, architecture §5,
  ui_spec §6.2/§6.4). Round-2 approval of the DO adapter stands; this round covers the CR
  deltas only, as specified.

### CR-05 — poker-table UI (ui_spec §6.2/§6.4, commit `8a477af`)

| Check (task body) | Verdict | Evidence (independent, this round) |
|---|---|---|
| Table UI matches ui_spec §6.2 (oval felt, seat rows, face-down cards on table, deck below) | ✅ **PASS** | `Room.svelte`: `rounded-3xl border border-blue-300 bg-blue-100` rim → `rounded-2xl bg-blue-500` felt, `TableCards` in felt center; seat rows `slice(0,4)` top / `slice(4)` bottom `flex flex-wrap justify-center`; `DeckRow` below (L182–242). Built CSS contains `bg-blue-500`, `bg-blue-100`, `border-blue-300`, `rounded-2xl`, `rounded-3xl`. |
| ParticipantSeat: face-down blue back, no value text pre-reveal (AC-F2.3 preserved) | ✅ **PASS** | `ParticipantSeat.svelte`: voting → `h-28 w-20 rounded-lg bg-blue-500` + `♠` only; `isSelf && hasVoted` adds `✓ Voted` overlay; no value digits anywhere pre-reveal (DOM test + E2E AC-F2.3 re-run). |
| Revealed seat: white face + blue border + value (AC-F3.3 preserved) | ✅ **PASS** | `ParticipantSeat.svelte`: revealed → `border border-blue-300 bg-white shadow` + `text-2xl font-bold text-blue-600` value; `Pass` for PASS_VOTE; dashed `No vote` for no-vote. |
| TableCards on felt: `?` pre-reveal, consensus value post-reveal, aria-hidden decorative | ✅ **PASS** | `TableCards.svelte`: `aria-hidden="true"`, shows only when `votedCount > 0` during voting (`?`, no value digit) / consensus (or plurality) value after reveal. |
| DeckRow/FibonacciCard per ui_spec §6.4 | ✅ **PASS** | `DeckRow.svelte` renders exactly DECK + Pass; `FibonacciCard.svelte` white face/blue-300 border/blue-600 value, selected `data-selected=true` + `bg-blue-500 text-white shadow-md` + `aria-pressed`. |
| Tailwind-only (constitution) | ✅ **PASS** | Only `app.css` = `@import 'tailwindcss';`; zero inline `style=`; `data-[selected]` is the allowed data-attribute variant (tailwind-only.test.ts strips it explicitly); no arbitrary `[…]` values; built CSS is Tailwind v4 output. |
| AC preservation (anyone-reveal, simultaneous, progress, consensus/no-consensus, re-vote, invite, isolation) | ✅ **PASS** | E2E 36/36 + edge 10/10 re-run independently this round. |
| Visual evidence | ✅ **PASS** | `qa/evidence/01-host-room.png` … `06-pass-vote.png` captured by QA round-3; my vision model has no image support in this env, so I verified via source + DOM-class inspection + live HTTP/DOM checks on wrangler dev (no browser-harness permission available). QA's DOM-class matrix (§8) corroborates. |

### CR-06 — 6-digit room code (PRD AC-F1.2, architecture §5, commit `a180220`)

| Check (task body) | Verdict | Evidence (independent, this round) |
|---|---|---|
| 6-digit format `/^\d{6}$/` | ✅ **PASS** | `token.ts` `formatRoomCode` + 200-draw unit; live do-smoke `roomId=930709` (6 digits). |
| Rejection-sampling uniformity (no modulo bias) | ✅ **PASS** | `token.ts`: 32-bit draw, reject ≥ 4_294_000_000 (largest multiple of 1M < 2^32), `% 1_000_000`; 50k-sample 10k-bucket spot-check unit (pre-existing ±6σ flake known, product unaffected). |
| Leading zeros preserved on wire/URL (string, never coerced) | ✅ **PASS** | `formatRoomCode(0)="000000"`, `formatRoomCode(123)="000123"` unit; QA E2E live `/r/069105` + WebSocket `/ws?room=069105`. |
| Collision retry ≤5: fresh code + reconnect + generic error | ✅ **PASS** | `Landing.svelte` loop ≤5, `generateRoomCode()` fresh per attempt, `disconnectRoom()` between, generic error + button re-enabled after exhaustion; new `test/dom/room-create-retry.test.ts` 2/2 (fresh-code-per-attempt; exactly 5 attempts, no 6th). |
| Occupied code never overwrites live room | ✅ **PASS** | `apps/server/src/index.ts:125-127` `rooms.has(code) → ROOM_NOT_FOUND`; test proves join still finds original host. |
| Security tradeoff documented (PRD + approval log) | ✅ **PASS** | PRD AC-F1.2 + tradeoff paragraph; architecture §5; CR-06 doc; approval log Gate 4 entries. |
| Participant ids still 128-bit | ✅ **PASS** | Node `randomBytes(16).toString('base64url')`; DO `crypto.randomUUID()` (`server/roomObject.ts:175,201`) — live do-smoke participantId `462daed9-…` UUID. |
| Node adapter `randomInt(0,1_000_000)` zero-padded | ✅ **PASS** | `apps/server/src/index.ts:124`. |
| Route regex `/^\/r\/\d{6}\/?$/` | ✅ **PASS** | `App.svelte:17`. |
| DO path `idFromName(code)` + `roomId = token` | ✅ **PASS** | `server/worker.ts:34` + do-smoke 30/30 + resume 11/11 re-run live this round with 6-digit codes. |

### Independent verification (round-3 execution re-run)

- `npm test` → **71/71 PASS** (12 files) — re-run by reviewer
- `npm run typecheck` → **clean** (tsconfig.base + server/tsconfig)
- `npm run build` → **green** (125 modules)
- `npx wrangler dev --port 8799 --local` (wrangler 4.123.0) + `node scripts/do-smoke.mjs ws://127.0.0.1:8799` → **30/30 PASS** (room:create roomId=930709, join, face-down, reveal, reset, grace eviction, ephemeral delete)
- `node scripts/qa-resume-check.mjs ws://127.0.0.1:8799` → **11/11 PASS** (room:resume re-bind, storage blob round-trip, ephemeral delete)
- HTTP guards on wrangler dev: `/` 200, `/r/123456` 200 SPA fallback, `/ws` no token 400
- `python3 qa/e2e_verify.py` (Node adapter, PORT=5199, built SPA) → **36/36 PASS**
- `python3 qa/edge_cases.py` → **10/10 PASS**
- Constitution scans: no `.css` beyond app.css entry, no `style=`, no `<style>` blocks, no arbitrary values, no `fetch(`/`XMLHttpRequest`/`axios`/`setInterval` in `apps/web/src` (no polling), wrangler.toml free tier (no paid-plan line)
- No implementation files were edited by the reviewer.

### Findings (non-blocking, recorded for maestro)

1. **`docs/constitution.md` line 37 stale** — still reads "Poker-table dressing and
   gamification are OUT of Phase 1 (future phases)" after the CR-05 reversal. PRD,
   ui_spec, architecture, and approval log all reflect the reversal; the constitution's
   Phase-1 scope guardrail was not updated. Not a code defect and does not block ship
   (the governing contracts PRD/ui_spec/approval log are correct), but the constitution
   is a reviewer-checked document and should be reconciled by `maestro`/`pm` before the
   next gate reads it.
2. **Pre-existing uniformity spot-check flake** (QA round-3 note): `test/room-create.test.ts`
   ±6σ band flaked once in 6 runs. Product unaffected (rejection sampling is provably
   uniform); builder should widen to ±7σ or raise N in a future polish pass.

### Caveats carried from round 2 (unchanged)

- No live `wrangler deploy` run (no Cloudflare credentials in this environment); the DO
  path was exercised locally through `wrangler dev`. Deploy stays preview-only until the
  human ship decision (constitution).

**Next owner:** maestro (t_99df2152) — on approval, human ship decision + deploy.
Approval log Gate 4 entry updated to SHIP-READY.
