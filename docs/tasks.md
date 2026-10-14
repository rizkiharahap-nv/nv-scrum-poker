# Tasks — Scrum Poker Phase 1 MVP

Status: Stage 5 Slice · Owners: pm + architect · Date: 2026-08-15 · Appetite: S
Inputs: `docs/PRD.md` (ACs are the contract), `docs/product/research-brief.md`,
`docs/architecture/architecture.md` + realtime ADR (architect, slice 0 dep),
`docs/design/ui_spec.md` + `docs/design/flows.md` (ux, slice 6 dep).

## How to read this file

- Slices are **thin vertical slices**: each delivers one user- or system-visible behavior
  through the stack (entry → logic → realtime → UI) and ends green on `npm test` +
  `npm run build`.
- **Order matters.** A slice may start only when all its `Deps` are `done`.
- **One acceptance test per slice** — the named test in each slice is the Definition of
  Ready gate: it must exist (RED) before build, and pass (GREEN) before the slice is Done.
- All PRD ACs stay the builder's contract; each slice lists the PRD ACs it satisfies.
- **No scope expansion.** Anything not listed here or in `docs/PRD.md` needs a change
  request (`docs/change_requests/`).
- Human Gate 3 (`docs/approval_log.md`) must be approved before any slice enters build;
  the whole build block is a child of that gate.

## Slice map

| # | Slice | Deps | Acceptance test (named) |
|---|-------|------|--------------------------|
| 0 | Walking skeleton — scaffold, Tailwind, Svelte runes store, realtime transport wired | architect ADR + human gate | `test/walking-skeleton.test.ts` — integration: connect → join → vote → broadcast → reveal round trip |
| 1 | Room creation + 6-digit invite code | 0 | `test/room-create.test.ts` — 6-digit numeric code, uniform generation, collision-retry (≤5) on `room:create`; invite URL `/r/\d{6}` opens join flow |
| 2 | Join via link + real-time presence | 1 | `test/join-presence.test.ts` — second client joins by link; both see each other ≤2s |
| 3 | Fibonacci deck + face-down voting | 2 | `test/voting.test.ts` — deck constant exact; submit/change vote updates "X of N" without revealing values |
| 4 | Simultaneous reveal | 3 | `test/reveal.test.ts` — anyone triggers reveal; broadcast flips all cards on both clients; zero-vote guard |
| 5 | Consensus detection + re-vote | 4 | `test/consensus.test.ts` — all-equal ⇒ consensus; mixed ⇒ distribution + re-vote clears to voting |
| 6 | Poker-table styling per ui_spec (plain CSS) | 5 + ui_spec | `test/no-tailwind.test.ts` — Tailwind is not a dependency; holdem table CSS |

---

## Slice 0 — Walking skeleton

- **Goal:** Thinnest end-to-end path running on the architect's chosen transport: page
  loads, a client can connect to the realtime transport, and a broadcast round-trips.
- **Deps:** `t_e3118ec4` (architect) done; human gate approved; `docs/architecture/architecture.md`
  + ADR present.
- **Inputs:** architecture.md, ADR (transport, room state machine, message contracts),
  PRD.md.
- **Outputs:** scaffolded app (Svelte 5 + TS + Vite SPA per ADR-001 rev 3), Tailwind wired,
  Svelte runes store shell, realtime client connected (native WebSocket thin layer over the
  Node `ws` **test adapter**; `wrangler dev` smoke for the DO adapter), build + test
  infra green.
- **PRD ACs:** (none user-visible; enables all)
- **Acceptance test (`test/walking-skeleton.test.ts`, integration):** a scripted client
  connects over the native WS protocol (JSON envelope + ack), joins a room channel,
  broadcasts a `ping`, and a second client receives the `ping` — proving the transport
  round-trip the rest of the slices rely on.
- **DoD:** `npm test` green (walking-skeleton test passes); `npm run build` green;
  Tailwind compiled; no `.css`/`.less`/inline styles; commit message `slice-0`.

## Slice 1 — Room creation + 6-digit invite code (CR-2026-08-18-06)

- **Goal:** A user with no session creates a room, gets a crypto-random **6-digit
  numeric room code**, and can copy a working invite URL.
- **Deps:** slice 0 done.
- **Inputs:** PRD AC-F1.*, architecture.md (room-code generation + collision-retry
  contract, §5), ui_spec landing screen (if available).
- **Outputs:** "New room" action, room entity with 6-digit code, invite URL render
  + copy affordance, join route that accepts the code, bounded collision retry.
- **PRD ACs:** AC-F1.1, AC-F1.2, AC-F1.3, AC-F1.4, AC-F1.5 (create half), AC-F1.6.
- **Acceptance test (`test/room-create.test.ts`):** unit — code generator returns
  exactly 6 digits (`/^\d{6}$/`), leading zeros preserved, uniform
  (rejection-sampling spot-check), two calls differ, not sequential; integration —
  `room:create` returns a `/r/<code>` URL whose code, opened in a fresh browser,
  shows the join prompt (never the creator's room state); **collision** —
  `room:create` on an occupied code acks `ROOM_NOT_FOUND` (server never
  overwrites a live room), and the client retries with a fresh code (bounded ≤5)
  then surfaces the generic error; remembered-name — after a successful create,
  reload the landing page and assert the name input holds the remembered value
  and is editable; fresh device (no stored name) ⇒ empty input.
- **DoD:** AC-F1.1–F1.6 pass in the named test; `npm test` + `npm run build` green;
  commit `slice-1`.

## Slice 2 — Join via link + real-time presence

- **Goal:** A guest joins by link with only a display name and everyone in the room sees
  live presence.
- **Deps:** slice 1 done.
- **Inputs:** PRD AC-F5.1/F5.2, architecture.md presence contract (who's online, X of N
  model), ui_spec lobby.
- **Outputs:** join-with-name flow, participant list, join/leave propagation,
  presence-driven "X of N" counter.
- **PRD ACs:** AC-F5.1, AC-F5.2, AC-F1.5 (join half), AC-F1.6.
- **Acceptance test (`test/join-presence.test.ts`):** integration — client A creates,
  client B joins by link; A shows B ≤2s without refresh; B closing tab removes B from
  A's list ≤10s; remembered-name — after a successful join, reload the join URL and
  assert the name input holds the remembered value AND the join gate still requires an
  explicit submit (no auto-submit).
- **DoD:** named test green; `npm test` + `npm run build` green; commit `slice-2`.

## Slice 3 — Fibonacci deck + face-down voting

- **Goal:** Participants vote with exactly the Fibonacci deck, face-down, with live
  progress.
- **Deps:** slice 2 done.
- **Inputs:** PRD AC-F2.*, AC-F5.3, architecture.md vote message contract + deck constant.
- **Outputs:** deck constant `[1,2,3,5,8,13,21]`, card selection UI (face-down until
  reveal), submit/change-vote, "X of N voted" updates.
- **PRD ACs:** AC-F2.1, AC-F2.2, AC-F2.3, AC-F2.4, AC-F2.5, AC-F5.3.
- **Acceptance test (`test/voting.test.ts`):** unit — deck is exactly the Fibonacci
  constant; vote model stores per-participant last value; integration — A votes, B sees
  "1 of 2 voted" without any value text in B's DOM; A changes vote, still no value text.
- **DoD:** named test green; AC-F2.* pass; `npm test` + `npm run build` green;
  commit `slice-3`.

## Slice 4 — Simultaneous reveal

- **Goal:** Any participant can trigger a simultaneous reveal that flips every submitted
  card face-up on all clients at once.
- **Deps:** slice 3 done.
- **Inputs:** PRD AC-F3.*, architecture.md reveal broadcast contract + participant state
  machine (`voting → revealed`).
- **Outputs:** reveal control enabled for every participant (anyone-can-reveal, AC-F3.1),
  reveal broadcast, simultaneous flip, zero-vote guard (AC-F3.4).
- **PRD ACs:** AC-F3.1, AC-F3.2, AC-F3.3, AC-F3.4.
- **Acceptance test (`test/reveal.test.ts`):** integration — A + B have voted; A
  triggers reveal; B's client flips face-up in the same broadcast (assert no value
  rendered pre-broadcast); a third participant C (guest) can also trigger reveal; with
  zero votes reveal is disabled.
- **DoD:** named test green; AC-F3.* pass; `npm test` + `npm run build` green;
  commit `slice-4`.

## Slice 5 — Consensus detection + re-vote

- **Goal:** The room tells the team whether the round reached consensus and supports
  re-voting until it does.
- **Deps:** slice 4 done.
- **Inputs:** PRD AC-F4.*, architecture.md consensus logic + reset message contract
  (`revealed → voting`).
- **Outputs:** consensus verdict, distribution (value → count), no-consensus state,
  Re-vote control that clears votes and returns to voting phase.
- **PRD ACs:** AC-F4.1, AC-F4.2, AC-F4.3, AC-F4.4.
- **Acceptance test (`test/consensus.test.ts`):** unit — all-equal ⇒ consensus; mixed ⇒
  no-consensus with distribution; single participant ⇒ consensus; integration — after a
  no-consensus reveal, Re-vote clears all votes and participants vote again.
- **DoD:** named test green; AC-F4.* pass; `npm test` + `npm run build` green;
  commit `slice-5`.

## Slice 6 — Poker-table styling per ui_spec (Tailwind-only)

- **Goal:** The functional UI is styled to the approved ui_spec — CR-2026-08-18-05
  poker-table room layout (§6.2/§6.4) — while keeping the Tailwind-only constraint verifiable.
- **Deps:** slice 5 done; `docs/design/ui_spec.md` + `flows.md` present (ux).
- **Inputs:** ui_spec.md (component-level classes), flows.md, PRD constraints.
- **Outputs:** final component styling matching ui_spec; no styling tokens outside
  Tailwind utility classes.
- **PRD ACs:** constraints (Tailwind-only), AC-F3.3 presentation quality.
- **Acceptance test (`test/tailwind-only.test.ts`):** static scan — repo contains no
  `.css`/`.less` files and no inline `style=` attributes in source; visual smoke —
  screenshots of each screen match ui_spec component inventory (qa re-verifies in the
  test report).
- **DoD:** scan + smoke pass; `npm test` + `npm run build` green; commit `slice-6`.

---

## Definition of Ready (every slice, before build starts)

- [ ] Slice listed above with named acceptance test (this file).
- [ ] All `Deps` done.
- [ ] Contract exists for the slice's realtime messages (architecture.md).
- [ ] PRD ACs for the slice are unambiguous (qa confirms testability).
- [ ] Tailwind-only + constitution constraints understood by builder.

## Definition of Done (every slice, before moving to next)

- [ ] Named acceptance test passes (GREEN) and `npm test` green.
- [ ] `npm run build` green.
- [ ] PRD ACs for the slice verified (unit/integration/code inspection as listed).
- [ ] No `.css`/`.less`/inline styles introduced.
- [ ] Committed with `slice-N` message; notes written.

## Next owner

- Builder (per-slice), then QA (full `test-report.md` against every PRD AC), then
  reviewer (product gate, `docs/review/review-decision.md`), then maestro outcome.
- No growth lane (internal tool, per intake).
