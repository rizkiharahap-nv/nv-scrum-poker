# QA Test Report — Scrum Poker Phase 1 MVP

**Task:** t_6b641aeb — QA validate MVP against acceptance criteria (round 1 @ `7523108`)
**QA re-verify:** t_d6042c8d — QA re-verify Cloudflare DO adapter (round 2 @ `c31bcfd`) · 2026-08-18 · Profile: qa
**QA round 3 (this report):** t_6cee04d9 — QA verify CR-05 poker-table UI + CR-06 6-digit room code (Gate 4 changes) @ `8a477af` + `a180220` · 2026-08-18 · Profile: qa
**Build under test:** git main @ `8a477af` (CR-05 poker-table UI on top of `a180220` CR-06 6-digit code), working tree with QA harness updates + CR-06 client-retry unit tests
**Scope:** every PRD AC (F1.1–F5.6) + Tailwind-only constraint + exploratory edge cases + DO production adapter (reviewer round-1 items 1–3) + CR-05 poker-table visual smoke + CR-06 6-digit token row

---

## 1. Summary

**Verdict: PASS — all acceptance criteria met. No blocking bugs found.**

| Item | Result |
|---|---|
| PRD acceptance criteria (F1.1–F5.6) | **All 26 PASS** |
| Automated unit/integration suite | **71/71 green** (12 files) |
| E2E browser checks (real Chromium, 2+ clients) | **36/36 PASS** |
| Exploratory edge cases | **10/10 PASS** |
| Tailwind-only constraint | **PASS** (source scan + built output) |
| Console errors during E2E | **none** |
| Bugs filed | **0 blocking; 0 open** |

**Test environment:** local Node `ws` test adapter serving the built SPA
(`PORT=5199 npm run dev -w apps/server`), real Chromium via Playwright with
two isolated browser contexts simulating a host and invited guests. This is
the same in-process adapter the walking-skeleton tests use; the Cloudflare
Durable Object path shares `packages/room` + the WS envelope, so the
state-machine and protocol behaviour verified here carries to production.

**Deployment path (slice 7):** the production adapter (reviewer round-1
rework, t_bc4d6224) is now in the repo and locally verified — see
§6 "DO adapter smoke".

---

## 2. Acceptance criteria — pass/fail per AC

### Feature 1 — Room creation and shareable invite link

| AC | Result | Evidence |
|---|---|---|
| **AC-F1.1** no-auth create | ✅ PASS | Fresh browser, no session, click "New room" → room created and host lands in it. No credentials requested. |
| **AC-F1.2** 6-digit numeric room code | ✅ PASS | Room codes are exactly 6 ASCII digits (`/^\d{6}$/`), leading zeros preserved on the wire/URL (observed `/ws?room=069105` and `/r/069105`), crypto-random uniform via rejection sampling (unit: 200 draws match, 50k-sample uniformity spot-check, leading-zero reachability), two consecutive creations differ (`226408` vs `536844` E2E), collision → bounded ≤5 client retry with a FRESH code + reconnect (new `test/dom/room-create-retry.test.ts`: fresh-code-per-attempt, stops at 5, generic error, no dead-end), occupied code never overwrites a live room (server test). Participant ids remain 128-bit (base64url / UUID — see §7). |
| **AC-F1.3** shareable URL + copy | ✅ PASS | Header shows full invite URL `http://<origin>/r/<token>`; Copy button writes exact URL to clipboard (verified via `navigator.clipboard.readText()`), shows "Copied!" feedback; URL opens join flow. |
| **AC-F1.4** guest isolation | ✅ PASS | Opening invite URL in a fresh browser shows only the join gate (display name), no creator room state — no participants, no deck, no reveal. Direct `/room/<token>` without a session redirects to the join gate. Nonexistent room shows "This invite link is no longer valid." |
| **AC-F1.5** remembered display name | ✅ PASS | Create → reload landing → "Maya" prefilled. Join → revisit landing → "Leo" prefilled. Revisit join page on same device → prefilled. Single `localStorage` key `scrum-poker.displayName` (code-inspected). |
| **AC-F1.6** prefill safety | ✅ PASS | Fresh device shows empty input; prefill is editable; nothing auto-submits (edited value stayed on the join gate); validation still enforced (trimmed, ≤24 chars; whitespace-only rejected; 25 chars rejected client + server). |

### Feature 2 — Face-down Fibonacci card voting

| AC | Result | Evidence |
|---|---|---|
| **AC-F2.1** exact deck | ✅ PASS | Deck renders exactly `1, 2, 3, 5, 8, 13, 21` + separate Pass action (8 buttons). Unit test asserts `DECK = [1,2,3,5,8,13,21]`. |
| **AC-F2.2** select + submit | ✅ PASS | One click on a card submits the vote, attributed to that participant only (broadcast shows `votedCount` 1 for host, guest still 0). |
| **AC-F2.3** face-down | ✅ PASS | Pre-reveal, participants section contains NO numeric value or "Pass" text — host sees the same face-down card backs as guests. Asserted via DOM text scan on both clients with 2 and 4 participants. `RoomState.votes`/`consensus` are only present when `phase === 'revealed'` (code-inspected `packages/room`). |
| **AC-F2.4** change vote | ✅ PASS | Host submitted 5 then 8; after reveal the revealed value was 8 (last wins). Counter stayed "1 of 2" while changing (not incremented). Unit test asserts last-wins. |
| **AC-F2.5** progress | ✅ PASS | "X of N voted" (0 of 2 → 1 of 2 → 2 of 2) updates in real time on all clients without revealing values. |

### Feature 3 — Simultaneous reveal

| AC | Result | Evidence |
|---|---|---|
| **AC-F3.1** anyone-can-reveal | ✅ PASS | Host AND guest both have an enabled Reveal during voting; a guest successfully triggered the reveal. |
| **AC-F3.2** simultaneous | ✅ PASS | Guest-triggered reveal flipped all cards face-up on the host's client in one broadcast — no client rendered any value before the broadcast (server-authoritative `room:state`; no pre-reveal values in the wire state). |
| **AC-F3.3** contents after reveal | ✅ PASS | After reveal, every participant's name and card value visible on all clients (Maya=8, Leo=5 etc.). |
| **AC-F3.4** zero-vote guard | ✅ PASS | Reveal disabled in UI with 0 votes; server enforces `ZERO_VOTES` ack if bypassed. No auto-reveal (only explicit click). |
| **AC-F3.5** pass card | ✅ PASS | Pass vote accepted; only-pass round → "No consensus", no distribution, renders as "Pass"; mixed pass+numeric → pass excluded from distribution (`3×1` only) and from consensus; renders as "Pass" on the seat. |

### Feature 4 — Consensus detection

| AC | Result | Evidence |
|---|---|---|
| **AC-F4.1** consensus | ✅ PASS | All votes 13 → "Consensus — Estimated at 13" on both clients. All votes 8 with 4 participants → same. Single participant → trivially consensus ("Estimated at 2"). |
| **AC-F4.2** no-consensus | ✅ PASS | Differing votes (5 vs 8) → "No consensus yet", distribution `5×1 8×1`, Re-vote control visible. |
| **AC-F4.3** re-vote | ✅ PASS | Any participant (guest triggered) re-votes: votes cleared to 0, back to voting phase, participant list unchanged. |
| **AC-F4.4** logic coverage | ✅ PASS | `test/consensus.test.ts` covers all-equal, all-different, mixed, single-participant rounds (single ⇒ consensus); all green. |

### Feature 5 — Real-time sync

| AC | Result | Evidence |
|---|---|---|
| **AC-F5.1** join propagation ≤2s | ✅ PASS | Guest join propagated to host in <100ms (measured 0.00s in E2E; unit test asserts ≤2000ms). |
| **AC-F5.2** leave detection ≤10s | ✅ PASS | Guest closed tab → evicted after 8s grace (measured 8.4s) with `room:state` broadcast; count adjusted to "1 of 1". Unit test asserts deterministic eviction + ephemeral room deletion when last connection leaves. |
| **AC-F5.3** vote propagation no leak | ✅ PASS | Vote count propagated to all clients in real time; no value revealed (F2.3 assertion). |
| **AC-F5.4** action propagation | ✅ PASS | Reveal and re-vote triggered by ANY participant take effect on all connected clients (guest triggered reveal; guest triggered re-vote). |
| **AC-F5.5** reconnect resync | ✅ PASS | Offline drop → auto-reconnect (backoff) → `room:resume` re-binds same participant, state converges without reload. Full reload also re-binds identity (name/vote/host preserved). `sessionStorage` holds the device session; room:resume cancels pending eviction. |
| **AC-F5.6** no polling | ✅ PASS | 5s idle watch in an active room: zero `fetch`/`xhr` requests, 1 WebSocket connection. Source scan: no `fetch(`, `XMLHttpRequest`, `axios`, `setInterval` in `apps/web/src`. All updates arrive via WS `room:state` broadcast. |

### Constraint — Tailwind-only styling

| Check | Result | Evidence |
|---|---|---|
| No `.css` files except Tailwind entry | ✅ PASS | Only `apps/web/src/app.css` exists; it contains exactly `@import 'tailwindcss';` |
| No `.less` files | ✅ PASS | None in source |
| No inline `style=` attributes | ✅ PASS | None in any `.svelte`/`.ts` source |
| No `<style>` blocks | ✅ PASS | None in Svelte components |
| No arbitrary Tailwind values / custom breakpoints | ✅ PASS | Static scan test green |
| Built output is Tailwind-generated | ✅ PASS | `dist/assets/*.css` header: `/*! tailwindcss v4.3.3 … */`; class inventory is utility classes only |

---

## 3. Exploratory edge cases

| Case | Result |
|---|---|
| 4 participants in one room — all see each other, X of 4, consensus converges on all | ✅ PASS |
| Multi-participant face-down (no value text with 4 seats) | ✅ PASS |
| Direct `/room/<token>` without session → join gate | ✅ PASS |
| XSS-ish display name (`<img src=x onerror=…>`) — rendered as escaped text, no element injected, no dialog fired | ✅ PASS |
| 25-char name rejected (client maxlength + server `NAME_INVALID`) | ✅ PASS |
| Whitespace-only name rejected | ✅ PASS |
| Duplicate display names allowed (not forbidden by PRD) | ✅ PASS |
| Reveal disabled with 0 votes (UI) + server `ZERO_VOTES` guard | ✅ PASS |
| Leaver-vote exclusion (PRD resolved decision 7): leaver closes tab → evicted → vote removed from count and from revealed distribution; no ghost seat | ✅ PASS |
| Single-participant round ⇒ consensus (AC-F4.4) | ✅ PASS |
| Clipboard copy — exact invite URL written, "Copied!" feedback | ✅ PASS |
| Console/page errors during the whole E2E run | ✅ none |

## 4. Bugs found

**None.** No functional, visual, accessibility, or console issues were
reproduced during this run. All failures encountered during test development
were assertion bugs in the QA harness itself (strict-mode locators, fresh
context for prefill, whitespace in chip text) — not product defects.

### Non-blocking observations (not AC violations)

1. **Invite URL only in header (hidden on `sm:` and below).** The invite URL
   text chip is `hidden … sm:flex`, so on small screens only the "Copy link"
   button is visible. Non-goal (mobile polish out of scope), copy still works.
2. **Reveal button state after re-vote.** After a re-vote the reveal button is
   correctly disabled again; no stale state observed.
3. **`onSessionLost` path.** If a room is deleted server-side while the client
   is connected (last connection dropped), the client shows "This room is no
   longer available" with a rejoin button — verified via code inspection +
   resume failure path. Not reachable in normal 2-client use.

## 5. Verification matrix (automation)

| Suite | Command | Result |
|---|---|---|
| Unit + integration (71 tests, 12 files) | `npm test` | ✅ 71/71 passed (round-3 @ `8a477af`; 69 baseline + 2 new CR-06 client-retry tests) |
| Typecheck | `npm run typecheck` | ✅ clean (round-3) |
| Production build | `npm run build` | ✅ green (125 modules) (round-3) |
| E2E acceptance (2+ real browsers) | `python3 qa/e2e_verify.py` | ✅ 36/36 (round-3 re-run @ `8a477af`, harness updated to 6-digit codes) |
| Edge cases (multi-guest, XSS, validation) | `python3 qa/edge_cases.py` | ✅ 10/10 (round-3 re-run @ `8a477af`, harness updated to 6-digit codes) |
| Tailwind static scan | `test/tailwind-only.test.ts` + grep | ✅ green (round-3) |
| No-polling source scan | grep fetch/XMLHttpRequest/axios/setInterval in `apps/web/src` | ✅ zero matches (round-3) |
| DO adapter smoke | `wrangler dev --local` + `scripts/do-smoke.mjs` | ✅ 30/30 (round-3, 6-digit code, see §7) |
| DO resume/persistence check | `wrangler dev --local` + `scripts/qa-resume-check.mjs` | ✅ 11/11 (round-3, 6-digit code, see §7) |
| CR-05 visual smoke (poker table) | DOM class inspection + screenshots vs ui_spec §6.2/§6.4 | ✅ PASS (see §8) |
| CR-06 client collision retry | `test/dom/room-create-retry.test.ts` | ✅ 2/2 PASS (see §8) |

## 6. Testing notes

- **Covered:** every PRD AC F1.1–F5.6 plus the Tailwind-only constitution
  constraint, plus exploratory edge cases. E2E used real Chromium with
  isolated contexts to simulate distinct devices (no shared cookies/storage),
  which is what AC-F1.4/F1.5 require. Round-2 re-verify also exercised the
  Cloudflare DO adapter locally (see §7).
- **Not covered (out of scope for this QA run):** live Cloudflare deploy
  (no Cloudflare credentials in this environment — no `wrangler deploy`, no
  remote Durable Object run). The DO adapter itself IS in the repo
  (`server/roomObject.ts`, `server/worker.ts`, `wrangler.toml`) and was
  exercised locally with `wrangler dev` (see §7 "DO adapter smoke").
- **Reproduction:** start the server with `PORT=5199 npm run dev -w apps/server`
  (serves `apps/web/dist`), then run the two QA scripts. Screenshots in
  `qa/evidence/` (01-host-room … 06-pass-vote). DO smoke: `npx wrangler dev
  --port 8799 --local` then `node scripts/do-smoke.mjs ws://127.0.0.1:8799`
  (plus `node scripts/qa-resume-check.mjs ws://127.0.0.1:8799` for the
  resume/persistence checks).

## 7. DO adapter smoke (slice 7 / reviewer round-1 item 3)

**Path under test:** Cloudflare Durable Object production adapter —
`server/worker.ts` routes `/ws?room=<token>` to `SCRUM_POKER_ROOM.get(idFromName(token))` (the DO id IS the token, AC-F1.2/F1.3); `server/roomObject.ts` (Hibernation API: `acceptWebSocket`, `webSocketMessage/Close/Error`), single JSON room blob in `state.storage` (hydrate on wake / write on every mutation / `deleteAll()` after last leave), leave-grace eviction via DO alarm (`setAlarm`, not `setTimeout`).

**Round-2 run (qa re-verify t_d6042c8d):** `npx wrangler dev --port 8799 --local` (wrangler 4.123.0) +
`node scripts/do-smoke.mjs ws://127.0.0.1:8799` + `node scripts/qa-resume-check.mjs ws://127.0.0.1:8799` —
2026-08-18, real WebSockets through the DO path, re-run from scratch by QA.

| Check | Result |
|---|---|
| connect (WS upgrade, `/ws?room=<token>`) | ✅ 101 Switching Protocols |
| `room:create` ok + `roomId = token` | ✅ PASS |
| creator `isHost` + `participantId` present | ✅ PASS |
| `room:join` ok, `isHost=false` | ✅ PASS |
| host sees guest via `room:state` broadcast | ✅ PASS |
| `vote:submit` acks + `votedCount` converge 2/2 | ✅ PASS |
| face-down (no `votes`/`consensus` while voting) | ✅ PASS |
| `room:reveal` (any participant) → phase `revealed`, votes shown | ✅ PASS |
| no-consensus detected (5 vs 8) | ✅ PASS |
| `room:reset` → back to `voting`, votes cleared, participants kept | ✅ PASS |
| leave-grace: participant still present after close, evicted ≤10s (DO alarm) | ✅ PASS |
| ephemeral: last leave → `deleteAll`; late join gets `ROOM_NOT_FOUND` | ✅ PASS |
| **round-2 add:** `room:resume` re-binds SAME `participantId` after reconnect (AC-F5.5) | ✅ PASS |
| **round-2 add:** resume preserves votes + participant set (no duplicate) | ✅ PASS |
| **round-2 add:** storage blob round-trip — fresh connection to same DO id hydrates persisted room (`phase=revealed`, 2 votes) | ✅ PASS |
| **round-2 add:** ephemeral delete after last leave (fresh DO instance) | ✅ PASS |
| SPA static assets served by the SAME Worker (`GET /` → 200 `text/html`) | ✅ PASS |
| SPA deep link `/r/<token>` → 200 `index.html` (not_found_handling SPA) | ✅ PASS |
| `/ws` without token → 400 Missing room token | ✅ PASS |
| `/ws` non-upgrade → 426 Expected WebSocket upgrade | ✅ PASS |
| wrangler dev log: no errors/exceptions during the runs | ✅ PASS |

**Result: ALL PASS (walking skeleton + resume/persistence against the DO path).**
`node scripts/do-smoke.mjs` = 30/30, `node scripts/qa-resume-check.mjs` = 11/11.
Deploy stays preview-only until reviewer re-review + human ship gate (constitution).

### Reviewer round-1 required items — verdict (t_d6042c8d)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | **DO production adapter** (`server/roomObject.ts` Hibernation API, storage blob hydrate/write/deleteAll, DO alarm grace eviction) | ✅ **PASS** | `server/roomObject.ts` (318 lines) reviewed: `acceptWebSocket` in `fetch`; `webSocketMessage/Close/Error`; `ensureRoom()` hydrates `ROOM_BLOB` on wake; `persist()` writes on every mutation; `alarm()` evicts disconnected participants after `LEAVE_GRACE_MS=8000`, calls `storage.deleteAll()` when empty; `setAlarm` used (no `setTimeout`). Storage round-trip proven live: fresh connection to same DO id after reveal hydrated `phase=revealed` + 2 votes. |
| 2 | **`wrangler.toml`** (free plan, SPA + `/ws` one Worker) | ✅ **PASS** | `wrangler.toml`: `name="scrum-poker"`, `main="server/worker.ts"`, `compatibility_date="2025-06-01"`, `compatibility_flags=["nodejs_compat"]`; `[durable_objects]` binding `SCRUM_POKER_ROOM` → `ScrumPokerRoom`; migration `new_sqlite_classes`; `[assets]` `directory="./apps/web/dist"`, `binding="ASSETS"`, `not_found_handling="single-page-application"`. No paid-plan line (free tier). Live-tested: Worker served SPA + deep link + WS routing from one origin. |
| 3 | **Client `/ws?room=<token>`** + `room:create` returns `roomId=token` | ✅ **PASS** | `clientChannel.ts` `socketUrl(token)` builds `/ws?room=<token>` (VITE_SOCKET_URL override preserved as base); `room:create` smoke ack `roomId == token` on the DO path. Real-browser E2E (36/36) confirms the SPA connects via `/ws?room=<token>` against the Node adapter too (query ignored by pathname match — no regression). |
| 4 | **NAME_INVALID copy** (recommended, non-blocking) | ✅ **PASS** (spot-check) | `Join.svelte:53` now maps `NAME_INVALID` → "That name is not valid (1–24 characters)."; confirmed in built bundle (`grep` on `dist/assets/*.js`: new copy present, old copy absent). |

## 8. Gate 4 CR verification (round 3 — t_6cee04d9)

### CR-05 — poker-table UI (ui_spec §6.2/§6.4, commit `8a477af`)

**Visual smoke** (real Chromium, DOM class inspection + screenshots in
`qa/evidence/` 01-host-room / 03-voting-facedown / 05-revealed-consensus):

| Check | Result | Evidence |
|---|---|---|
| Table layout replaces the grid: seat rows top/bottom around an oval felt | ✅ PASS | `section[aria-label="Participants"]` contains 2 `flex flex-wrap` seat rows (slice(0,4) top, slice(4) bottom) — no `grid-cols-*` |
| Felt = `bg-blue-500` oval inside `bg-blue-100 border-blue-300` rim (`rounded-2xl` inner / `rounded-3xl` outer) | ✅ PASS | DOM: `div.rounded-3xl.border.border-blue-300.bg-blue-100` → `div.rounded-2xl.bg-blue-500` (ui_spec §6.2) |
| ParticipantSeat `h-28 w-20`; face-down back `bg-blue-500` ♠, no value text pre-reveal | ✅ PASS | `div.rounded-lg.bg-blue-500.h-28.w-20` text = `♠`; E2E AC-F2.3 host+guest both no value text; DOM test asserts no `\b(1|2|3|5|8|13|21|Pass)\b` |
| Voted self badge (check overlay) | ✅ PASS | `bg-emerald-100 … ✓ Voted` on self seat when `hasVoted` (code + DOM) |
| Revealed seat = white face + `border-blue-300` + blue value / dashed `No vote` | ✅ PASS | `div.rounded-lg.border.border-blue-300.bg-white.shadow` value `5`; no-vote `border-dashed border-slate-300 bg-slate-50` `No vote` |
| On-table TableCards (aria-hidden, decorative) | ✅ PASS | `div[aria-hidden="true"].h-14.w-10` absent pre-vote, `?` only once ≥1 vote, consensus value post-reveal; **no value digit pre-reveal** (AC-F2.3) |
| DeckRow below table; FibonacciCard white face/blue border/blue value, selected = blue fill + white text + `shadow-md` | ✅ PASS | `data-selected=true` + `aria-pressed=true` + `bg-blue-500 text-white` on selected; unselected white/blue (ui_spec §6.4) |
| Page bg `bg-white` (§1) | ✅ PASS | `div.min-h-screen.bg-white.flex.flex-col` on Room |
| Tailwind-only (no `.css`, no `style=`, no arbitrary values) | ✅ PASS | tailwind-only test green; grep for `class="…[…"` no arbitrary values |
| Header unchanged (wordmark, phase badge, invite chip + copy) | ✅ PASS | sticky header with invite URL + Copy link (E2E AC-F1.3) |
| AC preservation: anyone-reveal, simultaneous, progress, consensus/no-consensus, re-vote, invite, isolation | ✅ PASS | E2E 36/36 re-run (round-3) |

**Layout note (non-blocking):** seats split `slice(0,4)` top / `slice(4)` bottom
with `flex-wrap`, so a 5th+ participant wraps into the bottom row rather than
sitting on the left/right rails the reference screenshots show. This is the
documented ui_spec §6.2 wrap behavior ("extra seats wrap gracefully");
acceptable for Phase 1.

### CR-06 — 6-digit room code (AC-F1.2, commit `a180220`)

| Check | Result | Evidence |
|---|---|---|
| Format exactly `/^\d{6}$/` | ✅ PASS | 200 generator draws + E2E token `179369`, `226408`, `536844`, `895517`, `203852` all 6 digits |
| Leading zeros preserved (string, never coerced) | ✅ PASS | `formatRoomCode(0)="000000"`, `formatRoomCode(123)="000123"` unit; live E2E: invite chip `/r/069105` and WebSocket path `/ws?room=069105` (6 chars, leading zero intact) |
| Uniform generation (rejection sampling, no modulo bias) | ✅ PASS | 50k-sample 10k-bucket spot-check in `test/room-create.test.ts`; high-value buckets near 999999 reachable |
| Two consecutive creations differ | ✅ PASS | E2E `226408` vs `536844`; unit 200-draw distinct |
| Collision retry ≤5, fresh code + reconnect, generic error, no dead-end | ✅ PASS | NEW `test/dom/room-create-retry.test.ts` 2/2: (a) collisions at 111111, 222222 → fresh 333333 succeeds, `connectRoom` called with fresh codes, navigates `/room/333333`; (b) 5 consecutive ROOM_NOT_FOUND → exactly 5 attempts, no 6th, generic error shown, button re-enabled |
| Occupied code never overwrites a live room | ✅ PASS | `test/room-create.test.ts` collision test: second create on occupied code acks `ROOM_NOT_FOUND`, join still finds original host |
| Server Node adapter: `randomInt(0,1_000_000)` zero-padded | ✅ PASS | `apps/server/src/index.ts:124` `String(randomInt(0, 1_000_000)).padStart(6, '0')` |
| Client generator: rejection sampling over `crypto.getRandomValues` | ✅ PASS | `apps/web/src/logic/token.ts` — 32-bit draw, reject ≥ `4_294_000_000`, `% 1_000_000`, `padStart(6,'0')` |
| Route regex `/^\/r\/\d{6}\/?$/` | ✅ PASS | `App.svelte:17`; E2E bad-link `/r/123456` (valid shape, nonexistent room) → "no longer valid" |
| Participant ids stay 128-bit | ✅ PASS | Node adapter `randomBytes(16).toString('base64url')`; DO `crypto.randomUUID()` — do-smoke participantId `a05d7a8c-…` UUID; identities not user-shared |
| DO path: `idFromName(6-digit)` + `roomId = token` | ✅ PASS | do-smoke 30/30 + resume-check 11/11 re-run round-3 with 6-digit codes (`/ws?room=438821`, `/ws?room=662569`) |
| Security tradeoff documented in PRD + approval log | ✅ PASS | PRD AC-F1.2 + tradeoff paragraph; architecture §5; CR-06 doc |

**QA harness updates (this round):** `qa/e2e_verify.py` + `qa/edge_cases.py`
hardcoded the old 22-char token regex; both updated to `\d{6}` and re-run
(36/36 + 10/10). `scripts/qa-resume-check.mjs` switched from
`randomBytes(16)` to `randomInt(0,1_000_000).padStart(6,'0')` to match the
new format on the DO path. New `test/dom/room-create-retry.test.ts` added.

### Non-blocking observation (pre-existing test quality, not a product bug)

The rejection-sampling uniformity spot-check in `test/room-create.test.ts`
uses a ±6σ band across 10,000 buckets at 50k samples; the multi-comparison
tail probability is small but nonzero — it flaked once in a full-suite run
(one bucket ~19 samples over mean+6σ), passing 5/6 full-suite runs and 8/8
isolated. Product code is unaffected (the generator is provably uniform —
rejection sampling has no modulo bias). Recommend the builder widen the band
to ±7σ or raise N in a future polish pass.

## 9. Files produced by QA

- `qa/test-report.md` — this report (round 1 + round-2 DO re-verify + round-3 CR verify)
- `qa/e2e_verify.py` — E2E acceptance harness (36 checks, all ACs; 6-digit token regex)
- `qa/edge_cases.py` — exploratory edge-case harness (10 checks; 6-digit token regex)
- `qa/evidence/*.png` — screenshots of each state (join gate, voting,
  reveal no-consensus, reveal consensus, pass vote; round-3 re-captured)
- `scripts/do-smoke.mjs` — DO adapter walking-skeleton smoke (30 checks)
- `scripts/qa-resume-check.mjs` — DO resume/persistence check (11 checks;
  added by QA round-2 t_d6042c8d; 6-digit token in round-3)
- `test/dom/room-create-retry.test.ts` — CR-06 client collision-retry DOM tests (2 checks)

**Next owner:** reviewer (t_99df2152) — re-review Gate 4 CR changes before ship.
