# Flows — Scrum Poker Phase 1 MVP

Status: Stage 3 Design · Owner: ux · Date: 2026-08-15 · Appetite: S
Inputs: `docs/PRD.md` (ACs F1–F5, locked decisions), `docs/product/research-brief.md`
(universal interaction patterns), `docs/constitution.md` (Tailwind-only, no auth).
Outputs consumed by: builder (slice 6), architect (route/state alignment), qa (testability).

## 1. Purpose

Defines the information architecture, the UI phase state machine, and every user flow
for the Phase 1 MVP, including happy, empty, error, and loading paths. The companion
`docs/design/ui_spec.md` carries the component-level Tailwind implementation detail;
this file is the "what happens and in what order" reference.

Phase 1 = bare MVP (room + invite link, face-down vote, reveal, consensus detection,
Fibonacci cards). Poker-table layout (CR-2026-08-18-05) — seats around an oval felt
table, face-down cards on the felt, deck rail below; no gamification, no chat, no issue list.

## 2. Information architecture

### 2.1 Routes

| Route        | Screen        | Purpose                                                        | Guard                        |
| ------------ | ------------- | -------------------------------------------------------------- | ---------------------------- |
| `/`          | Landing       | Host creates a room (no auth)                                  | none                         |
| `/r/[token]` | Join          | Guest joins an existing room via invite link                   | none (token is the secret)   |
| `/room/[token]` | Room       | Live poker-table room (voting / revealed / result)             | requires joined session; direct hit without one → redirect to `/r/[token]` |

Notes for architect:
- `/r/[token]` is the **invite URL** (AC-F1.3). It always renders the join form for a
  browser without an active joined session — never the room state (AC-F1.4 guest isolation).
- The host lands on `/room/[token]` immediately after creation (AC-F1.1).
- Route naming is a recommendation; the architect may unify `/r/[token]` and
  `/room/[token]` as long as the isolation rule above holds.

### 2.2 Screens and states

| # | Screen | Primary states |
|---|--------|----------------|
| 1 | Landing (`/`) | default · loading (creating) · error (creation failed) |
| 2 | Join (`/r/[token]`) | default · loading (joining) · error: link invalid · error: name taken · error: connection |
| 3 | Room (`/room/[token]`) | connecting · voting (waiting / in-progress) · revealed (+ result) · reconnecting · left |

## 3. UI phase state machine

The room is one screen with two UI phases. `voting` covers both the "waiting for the
team" lobby and the active vote round (same layout, `X of N` counts up).

```
                host: Reveal (X >= 1)
   ┌──────────┐  ──────────────────────────►  ┌────────────┐
   │  voting  │                                │  revealed  │
   │          │  ◄──────────────────────────   │ + result   │
   └──────────┘        host: Re-vote          └────────────┘
        │  ▲                (clears all votes)
        │  │
        │  └── submit / change vote (stays in voting, X of N updates)
        └──── participant join / leave (stays in phase, N updates)
```

Rules (from PRD locked decisions + ACs):
- **voting → revealed**: only the host triggers it (AC-F3.1); guard `X >= 1` (AC-F3.4);
  a single broadcast flips all submitted cards face-up on every client (AC-F3.2).
- **revealed → voting**: only the host triggers Re-vote (AC-F5.4 names re-vote a host
  action); clears all votes to unsubmitted; participant list unchanged (AC-F4.3).
- Votes may change any number of times while in `voting`; the last submitted value wins
  (AC-F2.4).
- Join/leave never change phase; only `N` (and possibly `X` for a leaver) change.

## 4. Flows

### Flow 1 — Create room (landing)

```
[Landing /]
  ├─ type display name (required, trimmed, ≤24 chars)
  │    └─ prefill: name input starts pre-filled from the remembered name
  │         when one exists (AC-F1.5); user may edit before [New room]
  ├─ click [New room]  ──►  loading: button shows "Creating room…", disabled
  │       │
  │       ├─ success ──► room created (crypto-random token, AC-F1.2)
  │       │             ──► navigate to /room/[token] as host (AC-F1.1)
  │       │             ──► room view, phase=voting, invite link visible (AC-F1.3)
  │       │             ──► trimmed name written to localStorage `scrum-poker.displayName`
  │       │
  │       └─ failure ──► inline error "Couldn't create room. Check your
  │                      connection and try again." — button re-enabled
  └─ Enter key submits (same as clicking New room)
```

Empty/edge: no prior session, no stored state — the landing is stateless (AC-F1.1).
A fresh device (no remembered name in `localStorage` `scrum-poker.displayName`) shows an
empty input (AC-F1.1/F1.6 unchanged).

### Flow 2 — Join via invite link (lobby with participant list)

```
[Open /r/[token] in any browser]
  ├─ join form renders: "You've been invited to a Scrum Poker room"
  │    + display name input + [Join room]
  │    (never the creator's room state — AC-F1.4)
  ├─ type display name (trimmed, ≤24 chars)
  │    └─ prefill: name input pre-filled from the remembered name when one
  │         exists (AC-F1.5); user may edit before [Join room]
  ├─ click [Join room] ──► loading: "Joining…", disabled
  │       │
  │       ├─ success ──► navigate to /room/[token]
  │       │             ──► room view, phase=voting
  │       │             ──► all connected clients show the new seat ≤2s (AC-F5.1)
  │       │             ──► trimmed name written to localStorage `scrum-poker.displayName`
  │       │
  │       ├─ link invalid / room gone ──► inline error
  │       │    "This invite link is no longer valid." (no retry offered)
  │       ├─ name taken ──► inline error "That name is already taken in this room."
  │       └─ connection failure ──► inline error
  │            "Couldn't connect. Check your connection and try again."
  └─ Enter key submits
```

Joining still requires an explicit [Join room] click or Enter — the prefill never
auto-submits, so the join gate is intact (AC-F1.4/F1.6).

Lobby behavior inside the room (phase=voting, X=0):
- Seats around the poker table show every online participant with a face-down card (host + guests).
- "0 of N voted" progress text.
- If N < 2, a hint shows: "Waiting for teammates to join. Share the invite link in the header."
- Closing the tab: other clients drop the seat ≤10s (AC-F5.2).

### Flow 3 — Vote (Fibonacci deck, face-down)

```
[Room /room/[token], phase=voting]
  ├─ deck row shows exactly [1, 2, 3, 5, 8, 13, 21] (AC-F2.1)
  ├─ click a card ──► select AND submit in one action (UX decision Q1)
  │    ├─ my seat: card back gains a "voted" check; deck card shows selected state
  │    ├─ progress: "X of N voted" increments (AC-F2.5); propagates live (AC-F5.3)
  │    └─ everyone else's cards remain face-down, NO value text in DOM (AC-F2.3)
  ├─ click a different card ──► vote changes; X unchanged (AC-F2.4)
  ├─ click the same selected card ──► no-op (stays voted)
  └─ after reveal: deck hidden until Re-vote
```

### Flow 4 — Reveal (host-only, simultaneous)

```
[Room, phase=voting]
  ├─ host only: [Reveal] button in the controls row
  │    ├─ X = 0  ──► disabled, tooltip "No votes yet" (AC-F3.4)
  │    └─ X ≥ 1  ──► enabled
  ├─ guests: [Reveal] disabled, tooltip "Only the host can reveal" (AC-F3.1)
  ├─ host clicks [Reveal] ──► one broadcast (AC-F3.2)
  │    └─ all connected clients flip all submitted cards face-up simultaneously
  │         └─ phase = revealed; values + names visible to all (AC-F3.3)
  └─ non-voters render a dashed "No vote" card (not a hidden value)
```

### Flow 5 — Result + re-vote

```
[Room, phase=revealed]
  ├─ cards all face-up; result panel appears below the table
  │
  ├─ all submitted votes identical ──► CONSENSUS banner (AC-F4.1)
  │    "Consensus — estimated at 5" + "All N votes matched."
  │    (single participant ⇒ consensus trivially — AC-F4.4)
  │
  ├─ votes differ ──► NO-CONSENSUS banner (AC-F4.2)
  │    "No consensus yet" + "Discuss the spread, then re-vote."
  │    + distribution: value → count chips (e.g. "5 ×3", "8 ×1")
  │
  └─ host: [Re-vote] enabled ──► clears all votes, phase=voting (AC-F4.3)
        participants list unchanged; seats return to face-down "waiting"
        guests: [Re-vote] disabled, tooltip "Only the host can start a re-vote"
```

### Flow 6 — Edge and recovery flows

| Situation | Behavior |
|-----------|----------|
| Direct hit on `/room/[token]` without a joined session | Redirect to `/r/[token]` (join form) |
| Open `/r/[unknown-token]` | Join form with error "This invite link is no longer valid." |
| Transport drops mid-session | Non-blocking amber banner "Connection lost — reconnecting…"; on reconnect, state resyncs to room state (AC-F5.5); no full reload |
| Participant closes tab | Others drop the seat ≤10s (AC-F5.2); `N` decreases; if the leaver had voted, their vote is excluded from `X` and from the reveal/distribution (UX decision Q4) |
| Host refreshes during a round | Host rejoins the live room as a participant with their name (state-machine semantics owned by architect; UI renders the same room view) |
| Single participant in room | Normal voting allowed; reveal works; consensus trivially true |
| Clipboard unavailable for invite link | Copy button shows "Copy failed"; the link text in the chip stays selectable |
| Shared device / remembered name from a previous user | Last-used name pre-filled in the create and join name inputs, editable (accepted; internal tool) |

## 5. Component tree

```
App
├── LandingPage                       (screen 1)
├── JoinPage                          (screen 2)
└── RoomPage                          (screen 3)
    ├── HeaderBar
    │   ├── Wordmark
    │   ├── PhaseBadge
    │   └── InviteLinkChip
    │       └── CopyButton
    ├── TablePanel
    │   └── ParticipantSeat[]         (one per online participant)
    │       ├── CardBack              (waiting / voted-check)
    │       ├── CardFront             (revealed: shows value)
    │       ├── NoVoteCard            (revealed: participant didn't vote)
    │       └── SeatLabel             (+ YouBadge / HostBadge)
    ├── ControlsRow                   (voting phase only)
    │   ├── ProgressText              ("X of N voted")
    │   └── RevealButton              (host-enabled)
    ├── DeckRow                       (voting phase only)
    │   └── FibonacciCard[]           ([1,2,3,5,8,13,21], interactive)
    ├── ResultPanel                   (revealed phase only)
    │   ├── ConsensusBanner | NoConsensusBanner
    │   ├── DistributionRow
    │   └── ReVoteButton              (host-enabled)
    ├── ConnectingSplash              (initial transport connect)
    └── ConnectionBanner              (reconnecting state)
```

## 6. Role matrix (host vs guest)

| Control / data | Host (creator) | Guest (joined by link) |
|----------------|-----------------|------------------------|
| Create room    | yes (landing)   | n/a |
| Copy invite link | yes          | yes (guests may invite teammates) |
| Vote / change vote | yes         | yes |
| See own vote   | yes             | yes |
| See others' values pre-reveal | **no** | **no** (AC-F2.3 for everyone, incl. host) |
| Reveal         | enabled when X ≥ 1 | disabled + tooltip |
| Re-vote        | enabled after reveal | disabled + tooltip |
| See participant list | yes       | yes |

## 7. State → UI mapping

| UI phase | Deck row | Seats | Controls row | Result panel |
|----------|----------|-------|--------------|--------------|
| voting (waiting, X=0) | interactive | face-down "waiting" | "0 of N voted" + Reveal (disabled) | hidden |
| voting (X ≥ 1) | interactive | face-down "voted" check on voters | "X of N voted" + Reveal (host: enabled) | hidden |
| revealed | hidden | face-up values + "No vote" for abstainers | hidden | banner + distribution + Re-vote (host) |
| reconnecting (any) | frozen per last state | frozen | frozen | frozen + amber banner |

## 8. UI-facing state contract (consumed by components)

TypeScript shape the components render from (architect maps transport messages into it;
builder should not read other participants' vote values pre-reveal):

```ts
type Phase = 'voting' | 'revealed';

interface Participant {
  id: string;            // transport-generated, stable per session
  name: string;          // trimmed, ≤24 chars
  isHost: boolean;
  isSelf: boolean;
  hasVoted: boolean;     // presence-derived; never derived from a vote value
}

interface RoomUiState {
  token: string;
  selfId: string;
  hostId: string;
  phase: Phase;
  participants: Participant[];      // online only
  myVote: number | null;            // the only vote value this client may hold pre-reveal
  votedCount: number;               // X
  reveal: {
    values: Record<string, number>; // participantId -> value, only after reveal broadcast
    consensus: {
      reached: boolean;             // all identical && X >= 1
      value?: number;               // present when reached
      distribution: { value: number; count: number }[]; // sorted desc by count
    };
  } | null;                         // null until reveal
}
```

## 9. Open questions for the human gate (ux side)

In addition to the PRD's three open questions:

1. **Select = submit.** A single card click both selects and submits the vote (no separate
   Submit button). Change = click another card. Matches competitor ritual and keeps the
   round fast; confirm the team is fine with no explicit "confirm" step.
2. **Re-vote host-only.** PRD AC-F4.2 says "a Re-vote control" without a role qualifier,
   but AC-F5.4 explicitly lists re-vote among *host actions*. This spec renders Re-vote
   disabled for guests (tooltip). Confirm.
3. **No story/ticket title field.** The PRD scope has no issue/story input; rooms are
   unnamed sessions. Teams name the story verbally or in their own tab. Confirm Phase 1
   rooms don't need a story field (research flags it as a Phase 2 item).
4. **Leaver votes.** When a participant leaves after voting, their seat dims with a
   "left" badge and their vote is excluded from X and the reveal. Architect owns the
   underlying state semantics; this is the UI behavior. Confirm.

## 10. Glossary

- **Room**: one live estimation session, identified by an unguessable token.
- **Host**: the participant who created the room. Also a voter.
- **Guest**: a participant who joined via the invite link.
- **Round**: one vote → reveal cycle. Re-vote starts a new round.
- **X of N**: submitted votes (X) vs current online participants (N).
