# PRD — Scrum Poker Phase 1 MVP

Status: Stage 2 Define · Owner: pm · Date: 2026-08-15 (rev 2026-08-18, CR-2026-08-18-05) · Appetite: S
Inputs: `docs/product/idea.md`, `docs/product/research-brief.md`, `docs/constitution.md`

## Vision

A real-time, invite-only planning poker room where an internal team estimates sprint
tickets in story points together — one click to create, one link to join, and a shared
face-down vote → simultaneous reveal ritual that makes the estimate real instead of
rubber-stamped.

## Problem

Story-point estimation in sprint planning is ad-hoc or boring. Estimates get
rubber-stamped because nothing makes the team commit individually before seeing what
everyone else picked. Existing tools are flat lists with heavy onboarding.

## Target users

- **Primary:** the internal team (Ninja Van sort operations + adjacent squads), 3–15
  concurrent participants per room.
- **No public audience, no monetization, no accounts.** Host creates a room; guests join
  through an unguessable invite link and enter only a display name.
- Internal tool — a competent but not design-sensitive audience; speed and clarity beat
  flourish.

## Locked product decisions (pm — architects/UX/builders must not re-decide)

1. **Deck (Phase 1):** exactly `[1, 2, 3, 5, 8, 13, 21]`. No pass/coffee card, no 0/½, no
   custom decks in Phase 1.
2. **Reveal permission:** anyone can reveal. There is no host-exclusive reveal control; the host is a user too (can vote, can reveal) but has no extra permission over other participants.
3. **Consensus:** all submitted votes identical (and ≥1 vote) ⇒ consensus at that value.
   Otherwise ⇒ no-consensus, show distribution, offer re-vote. Single participant ⇒
   consensus trivially true.
4. **Anonymity:** no participant — including the host — can see any other participant's
   value before reveal.
5. **Ephemeral rooms, re-join keeps identity:** rooms are live sessions with no history
   or persistence. A participant who re-joins the same room via the same invite link
   (refresh or re-open) keeps all their data — name, vote, host status — via a
   device-side session that is re-bound on reconnect. Host refresh behavior is the
   architect's state-machine decision (see open questions).
6. **Realtime:** all live updates via the transport the architect's spike selects
   (Supabase Realtime Broadcast+Presence preferred; Socket.IO fallback). Polling is
   forbidden (constitution).
7. **Remembered display name:** the last display name successfully used on this device
   (create or join) is remembered in a single device-local `localStorage` entry and
   pre-filled into the name input on the next create (host) or join (guest). Prefill is
   editable and never auto-submits — the join gate (AC-F1.4) is untouched. No "forget me" /
   name-switcher UI in Phase 1; editing the input is the escape hatch. Shared devices:
   last-used name wins (internal tool, acceptable).

## Scope — Phase 1 (S)

### Poker-table room layout (in scope — CR-2026-08-18-05)

The room screen renders as a **poker table** — participants seated around an oval felt
table, face-down cards on the table during voting, revealed values after reveal, deck
rail below the table. This reverses the previous Phase-1 non-goal ("poker-table dressing
/ game-table visuals beyond a clean card metaphor") and was approved at Gate 4 on
2026-08-18 (CR-2026-08-18-05). Component-level treatment is locked in
`docs/design/ui_spec.md` §6.2 (TablePanel / ParticipantSeat / TableCards) and §6.4
(DeckRow / FibonacciCard). The dressing that remains OUT of scope: chips, animations,
gamification badges, timers (see Non-goals).

### Feature 1 — Room creation and shareable invite link

- **AC-F1.1 (no-auth create):** In a fresh browser with no session, clicking "New room"
  creates a room and lands the user in it, without asking for credentials.
- **AC-F1.2 (6-digit numeric room code):** Room codes are exactly 6 ASCII digits
  (`000000`–`999999`), crypto-random and uniformly generated (rejection sampling
  via `crypto.getRandomValues` on the client; `crypto.randomInt` on the Node test
  adapter), with leading zeros preserved (the code is a string, never coerced to
  a number). Two consecutive room creations yield different codes (probabilistic —
  a bounded ≤5-attempt collision retry covers the rare equal case); codes are not
  sequential and not derivable from room count. When a drawn code is already in
  use by a live room (`room:create` acks `ROOM_NOT_FOUND`), the client retries
  `room:create` with a fresh code up to 5 times, then shows the generic
  creation-error state. (Unit test + code inspection.)
- **AC-F1.2 security tradeoff (must ship with the AC):** This format reduces
  room-code entropy from 128-bit to ~19.9 bits (10^6 codes) — codes are
  brute-forceable by a motivated attacker. This is a deliberate, human-approved
  tradeoff (Gate 4, CR-2026-08-18-06) acceptable ONLY because this is an
  **internal team tool** with **ephemeral rooms** (deleted when the last
  connection leaves) and **no PII** (the join gate requires only a display name).
  Do NOT reuse this format for a public/external deployment without revisiting.
  Join-attempt rate limiting is explicitly deferred out of Phase 1.
- **AC-F1.3 (shareable URL):** The room view shows the full invite URL with a copy
  affordance; the copied URL opens the join flow.
- **AC-F1.4 (guest isolation):** Opening the invite URL in a browser without the
  creator's session shows the join prompt (display name), never the creator's room state.
- **AC-F1.5 (remembered display name):** After a successful create (host) or join (guest),
  the trimmed display name is stored on the device (single `localStorage` entry). On a
  later visit to the landing page, the create form's name input is pre-filled with the
  remembered value; on a later visit to any join page, the join form's name input is
  pre-filled with it. (QA: create → reload → name pre-filled; join → reload → name
  pre-filled.)
- **AC-F1.6 (prefill safety):** The pre-filled name is editable before submit; nothing is
  ever submitted without the user's explicit action — no auto-submit, no join-gate bypass;
  opening the invite URL in a browser without the creator's session still shows the join
  prompt, never the creator's room state (AC-F1.4 preserved). A device with no remembered
  name (fresh browser / cleared storage) shows an empty input. Submit still enforces
  today's validation (trimmed, ≤24 chars) on whatever value is in the input.

### Feature 2 — Face-down Fibonacci card voting

- **AC-F2.1 (exact deck):** The vote phase offers exactly the cards 1, 2, 3, 5, 8, 13,
  21 and no other values. (Unit test on the deck constant.)
- **AC-F2.2 (select + submit):** A participant can select exactly one card and submit it
  as their vote; the vote is attributed to that participant only.
- **AC-F2.3 (face-down):** Before reveal, each participant sees only their own selected
  value; every other participant's card renders face-down with no value text present in
  the UI, including for the host. (QA: assert no value text in DOM pre-reveal.)
- **AC-F2.4 (change vote):** A participant may change their vote any number of times
  before reveal; the last submitted value is the one revealed.
- **AC-F2.5 (progress):** The room shows "X of N voted" (X = submitted votes, N = current
  participants) and it updates in real time without revealing values.

### Feature 3 — Simultaneous reveal

- **AC-F3.1 (anyone-can-reveal):** every participant (host and guests) sees an enabled
  "Reveal" control during the voting phase. Reveal is a participant action, not a
  host privilege.
- **AC-F3.2 (simultaneous):** Triggering reveal flips all submitted votes face-up on
  every connected client in a single reveal broadcast; no client renders any revealed
  value before receiving that broadcast.
- **AC-F3.3 (contents):** After reveal, every participant's name and card value are
  visible to all.
- **AC-F3.4 (guard):** Reveal is disabled while zero votes are submitted in the current
  round. Reveal only happens when someone clicks Reveal (no auto-reveal).
- **AC-F3.5 (pass card):** A participant may cast a non-numeric "pass" vote instead of a
  Fibonacci card. A pass vote is excluded from consensus detection and from the numeric
  distribution; after reveal it renders as "Pass". A round with only pass votes has no
  consensus verdict.

### Feature 4 — Consensus detection

- **AC-F4.1 (consensus):** When all submitted votes in a round are the same value v, the
  UI shows "Consensus — estimated at v".
- **AC-F4.2 (no-consensus):** When submitted votes differ, the UI shows "No consensus",
  a distribution (value → count of votes), and a "Re-vote" control.
- **AC-F4.3 (re-vote):** Any participant can activate Re-vote. It clears all votes to
  unsubmitted, returns the room to the voting phase, and keeps the participant list
  unchanged. (Host has no special re-vote privilege.)
- **AC-F4.4 (logic coverage):** Unit tests cover all-equal, all-different, mixed, and
  single-participant rounds (single ⇒ consensus).

### Feature 5 — Real-time sync

- **AC-F5.1 (join propagation):** When a participant joins, every other connected client
  shows them in the participant list within 2 seconds, without a page refresh.
- **AC-F5.2 (leave detection):** When a participant closes their tab, every other client
  shows them as gone within 10 seconds.
- **AC-F5.3 (vote propagation):** A vote submission by one participant updates "X of N
  voted" on all other clients in real time; no value is revealed.
- **AC-F5.4 (action propagation):** Reveal and re-vote take effect on all connected
  clients in real time, regardless of which participant triggered them.
- **AC-F5.5 (reconnect resync):** A client that drops and reconnects converges to the
  same room state (participants, round phase, submitted votes) as other clients without a
  full reload.
- **AC-F5.6 (no polling):** No client uses synchronous HTTP polling for room updates; all
  live updates arrive via the realtime transport. (Code inspection.)

## Non-goals (explicitly OUT of Phase 1)

- Gamification: scores, streaks, badges, leaderboards, chips.
- Growth features: analytics, signups, marketing, public access.
- Chat / per-ticket comments.
- Custom decks, timers, animations, average/median stats.
- QR invite, mobile polish beyond basic usability.
- Integrations (Jira, Linear, CSV import/export).
- Persistence, history, saved sessions, accounts.
- Async/anonymous voting outside a live session.

## Success metrics

1. **Adoption:** the team runs at least one full sprint planning session in the tool.
2. **Ritual integrity:** every story in that session ends in consensus or an accepted
   spread after a real discussion (no rubber-stamping).
3. **Quality gate:** 100% of PRD ACs pass the QA test report; `npm test` and
   `npm run build` are green.

## Constraints

- Web app, real-time multiplayer, TypeScript, React + Next.js/Vite (architect spike
  decides), Zustand client state.
- Tailwind CSS only — no `.css`, `.less`, or inline `style=` attributes.
- Room access via crypto-random unguessable invite link (6-digit numeric room
  code; see AC-F1.2 tradeoff); no auth, display name only.
- No secrets in client code; no synchronous polling.

## Resolved questions (human gate — 2026-08-17)

1. **Reveal permission:** anyone can reveal. Host is a user too — can vote and reveal,
   but no extra permission. (Resolved 2026-08-17.)
2. **Ephemeral rooms / re-join:** rooms stay ephemeral, but re-joining the same room via
   the same invite link keeps all the participant's data (name, vote, host status) via a
   device-side session re-bound on reconnect. (Resolved 2026-08-17.)
3. **Pass/coffee card:** IN Phase 1 as a non-numeric pass vote (AC-F3.5), excluded from
   consensus and the distribution. (Resolved 2026-08-17.)
4. **Select = submit:** one card click selects AND submits (no confirm step); clicking
   another card changes the vote. (Resolved 2026-08-17.)
5. **Re-vote:** anyone can re-vote; host is the same as any other user except for room
   creation. (Resolved 2026-08-17.)
6. **Story/ticket title field:** no story title field in Phase 1 rooms (team names the
   story verbally). (Resolved 2026-08-17.)
7. **Leaver votes:** votes from participants who left after voting are ignored — they
   are excluded from X and from the reveal/distribution; after reveal they render as
   "Pass". (Resolved 2026-08-17.)
