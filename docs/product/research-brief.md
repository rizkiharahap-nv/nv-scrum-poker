# Research Brief — Scrum Poker (internal real-time planning poker)

Status: Stage 1 Discover — evidence sufficient for pursue/pivot/kill
Owner: researcher · Date: 2026-08-15 · Appetite: S (Phase 1 bare MVP)

## 1. TL;DR / Recommendation

Build the Phase 1 MVP as specified in `docs/product/idea.md`: instant room + crypto-random
invite link, live presence (who's online / who has voted), hidden vote → simultaneous reveal
→ discussion → re-vote until consensus, Fibonacci deck, next-story reset. Realtime should be
**Supabase Realtime (Broadcast + Presence)** or, if self-hosting is preferred, **Socket.IO on a
small Node server** — the architect decides in the mandated spike. Avoid CRDT platforms
(Liveblocks) and polling. Competitors prove the core loop is table stakes; the engagement
differentiator (poker-table dressing, gamification) is explicitly Phase 2+ per the constitution.

**Verdict: pursue.** No kill signal found. Market evidence shows the bare loop is well
understood, cheap to build, and differentiating features are exactly the ones already
scoped out of Phase 1.

## 2. Reference tool: planningpokeronline.com (We Agile You)

Facts from the marketing site (https://planningpokeronline.com/):

- **Positioning:** "Planning Poker that feels like a game" — explicitly uses game framing
  ("Start new game", "Press Play"), not "estimation form".
- **3-step flow:** (1) Initiate a new game with issues added up front; (2) send the game URL
  to the team; (3) vote. No signup required to start a game.
- **Core features:** real-time voting, visual results ("Voting Round Visual Results at a
  Glance"), in-game issue management sidebar for the facilitator, integrations with Linear /
  CSV / clipboard paste, dedicated Jira plugin (Atlassian Marketplace), facilitator-license
  admin for organizations, mobile-compatible web app, ISO 27001 + GDPR compliance claims.
- **Pricing:** Free tier (unlimited players, 9 votings/game, 5 issues/game, CSV import,
  6-week game lifetime, permanent game URLs); Premium $30/facilitator/month or $300/year
  (unlimited votings/issues, saved history, resume games, add/remove facilitators).
- **Deck:** supports Fibonacci, T-shirt sizes, and custom decks ("our tool adapts to the way
  your team works").

**Takeaways for our product:** the "game" framing is a deliberate engagement choice; room
creation without signup is the default onboarding; facilitator-side issue list is core; free
tier gating (voting counts, issue counts) exists purely to upsell — not a UX pattern to copy.

## 3. Competitor matrix

| Tool | Room creation | Invite flow | Vote/reveal | Consensus handling | Engagement signals | Standout / to avoid |
|---|---|---|---|---|---|---|
| **planningpokeronline.com** (reference) | Instant game, no signup | Game URL | Real-time voting, visual results | Re-estimate until consensus (marketing claim) | "Feels like a game" framing, visual results, facilitator sidebar | Issue management + integrations; free-tier limits are pure upsell |
| **planitpoker.com** | Quick play without signup, or free account to secure rooms | Share room URL; guests join without signing up | Cards scaled visually; "access all estimate options, putting differences between each card into scale" | Graphs + distribution after voting, discuss and reach consensus | "Pure & Simple", 90k devs claim | Quick play = low friction; Jira XML/CSV import, stats, retry past stories |
| **scrumpoker-online.org** | Instant room (no signup, no email) | Room ID + QR code for mobile | See who is online, who has voted; reveal all at once | If all match → done; else outliers discuss, re-vote (documented) | Presence indicators, QR invite, attendance indicator (premium) | Deliberately NO Jira integration — standalone tab next to Jira; ad-funded free tier; $40/yr premium (timer, avg/median, personal room ID) |
| **kollabe.com** | No signup | Join link | Deck: 0, ½, 1, 2, 3, 5, 8, 13, 20, 40, 100, ☕ (coffee) | Auto-reveal option; re-vote; comments per ticket | Built-in chat + per-ticket comments, anonymous voting, async voting, change vote | Feature-heavy: Spaces, analytics, integrations with sync-back — phase-1 overkill |
| **planningpoker.com** (Mountain Goat) | Start a game | (share link) | Anonymous estimates; compare | "If the team doesn't come to a consensus, have a discussion … estimate again until agreement" | "Encourage lively discussion", anonymous voting highlights disagreement | Customizable scoring + timers; import/export to Jira; Mike Cohn endorsement |

Sources: https://planningpokeronline.com/ · https://planitpoker.com/ · https://www.scrumpoker-online.org/en/ · https://kollabe.com/planning-poker · https://www.planningpoker.com/

## 4. Core interaction patterns (the universal loop)

Across all five tools, the estimation ritual is identical. These are the patterns to **adopt**:

1. **Instant room creation** — no signup, no email; a room exists the moment the host clicks
   "new game". Signup/accounts are only for persistence (saved history, custom decks).
2. **Invite flow** — a shareable URL (room ID embedded) is the universal invite; QR code for
   mobile join is a common addition. Guests join with just a display name.
3. **Presence** — seeing who is online and **who has already voted** (X of N) is the
   standard "waiting" UI. It is the single most important engagement cue during a round.
4. **Hidden vote** — cards are face-down until reveal; anonymity prevents anchoring bias.
   Everyone sees the same reveal ceremony at once ("simultaneous reveal" is called out
   explicitly by scrumpoker-online.org as a rule to respect).
5. **Reveal → discuss → re-vote** — after reveal: show distribution (graphs/stats), let
   outliers talk, re-vote until all agree or team accepts a value.
6. **Consensus detection** — if all votes match, the story is done; otherwise surface the
   spread. Stats (average, median) are paid/premium features in two tools — nice-to-have,
   not core.
7. **Reset / next story** — a clean "reset votes, next issue" transition keeps the session
   moving.
8. **Decks** — Fibonacci is universal; custom decks (T-shirt, half-point) are the common
   customization. A "pass"/coffee card is common (kollabe shows ☕; planningpoker.com shows Pass).
9. **Issue list** — facilitator-side list of stories being estimated (add manually, CSV
   import, Jira/Linear sync in paid tools). Out of Phase 1 except a minimal manual list.

## 5. What makes tools feel engaging vs flat

**Engaging (adopt where cheap):**
- **Game framing** — "Start new game", "Press Play", room as a game table (planningpokeronline.com).
- **Presence + voting progress** — seeing teammates online and "who voted" makes the wait
  social rather than dead time (scrumpoker-online.org, kollabe).
- **The reveal ceremony** — simultaneous flip with visual results (graphs/distribution)
  gives a shared payoff moment.
- **Low friction** — instant rooms, no accounts, QR invite, mobile-friendly (all four non-reference tools).
- **In-room communication** — chat / per-ticket comments for the discussion phase (kollabe).
- **Anonymity** — anonymous votes surface disagreement without interpersonal friction
  (planningpoker.com: "anonymous voting highlights disagreements and generates better conversations").

**Flat (avoid):**
- **Mandatory accounts before the first room** (planitpoker's signup-first path).
- **Ad-driven free tier** that injects noise into the room (scrumpoker-online.org).
- **List-only UI** with no game metaphor — the exact complaint in `idea.md` about the reference
  being "flat lists"; the market leader solves this with framing, not necessarily with heavy visuals.
- **Feature bloat before the core loop works** — kollabe's Spaces/analytics/integrations are
  useful at scale but would sink an S-appetite MVP.

**Phase 1 note:** the constitution explicitly excludes poker-table dressing and gamification
from Phase 1. The research supports that split: the core loop is the value; dressing is the
future differentiator.

## 6. Realtime transport landscape (for architect's spike)

Sources: https://ably.com/blog/websockets-vs-sse · https://www.duskolicanin.com/blog/real-time-saas-supabase-vs-liveblocks-vs-partykit-2026 · https://aidxn.com/blog/realtime-web-patterns/ · MDN WebSocket/SSE

### Options

| Option | Model | Strength | Weakness / limits | Fit for scrum poker |
|---|---|---|---|---|
| **Raw WebSockets (RFC 6455)** | Full-duplex persistent TCP connection | Lowest latency; bidirectional; RFC standard since 2011 | You implement reconnect, heartbeat, state sync; some enterprise firewalls block WS; serverless-hostile | Workable but most manual work for a simple voting room |
| **Socket.IO** | WS with HTTP long-polling fallback, rooms, built-in reconnection | Fallback gets past firewalls; rooms + broadcast are built-in; familiar | Own server infra; client lib lock-in | Strong fallback if self-hosting Node; constitution lists it |
| **Server-Sent Events (SSE)** | One-way server→client over plain HTTP | Auto-reconnect, last-event-id resume; works through proxies/CDN/load balancers; simplest | One-way only — client→server still needs HTTP POSTs | Wrong tool alone: voting needs client→server push, though votes could go over normal POSTs |
| **Supabase Realtime** | WebSocket layer over Postgres logical replication; modes: Postgres Changes, Broadcast (pub/sub without DB), Presence | Broadcast + Presence map 1:1 to room mechanics (vote broadcast, who's online/voted); RLS applies; no server code; free tier 200 concurrent conns, 100 msg/s; Pro $25/mo (500 conns, 500 msg/s) | No message replay on reconnect (client re-syncs current state); Presence limits (5 track calls/30s per client); presence can go stale on tab refocus (re-track on visibilitychange) | **Best fit for Phase 1**: presence is a first-class need, room state is small, no CRDT needed |
| **Liveblocks** | CRDT-based collaborative state (LiveObject/LiveList/LiveMap), rooms, presence, storage | Handles concurrent edits; rooms/presence out of the box | Pro $30/mo + metered $0.002/collab-minute, $0.01/comment; free 10 conns/room, Pro 20 conns/room; cost scales by MAU | Overkill — voting is not co-editing; no CRDT conflict problem to solve |
| **PartyKit (Cloudflare Durable Objects)** | Per-room "party" class (onConnect/onMessage/onClose), hibernatable WebSockets | Custom server-side room state machine; cheap at scale (~$4/mo for 10k rooms @ 80 conns vs ~$80 Liveblocks); hibernation kills idle cost | You own reconnection, state reconciliation, backoff; 128MB memory per party; SQLite storage now metered (Jan 2026) | Good if architect wants a real room-state server; more work than Supabase for same outcome |

### Decision framework (from aidxn.com)

- Client sends data in realtime → **WebSockets or Supabase Broadcast**
- Client only receives live DB-driven updates → **Supabase Realtime (Postgres Changes)**
- Server-pushed updates not DB-driven → **SSE**
- Infrequent changes, near-real-time OK → polling (explicitly **banned** by our constitution)

### Recommendation for the spike

For an internal team (3–15 people/room, handful of rooms), **Supabase Realtime Broadcast +
Presence is the primary recommendation**: it provides exactly the two primitives the game
needs (room-wide message fan-out + online/voted presence), needs no dedicated server, and the
free/pro limits (200 conns, 100 msg/s) are orders of magnitude above our scale. **Socket.IO**
is the recommended fallback if the team prefers zero external SaaS and self-hosting a small
Node service. **PartyKit** is the "custom room state machine" option if the architect wants
server-authoritative room state. **Liveblocks** should be rejected for Phase 1 (cost + CRDT
complexity with no co-editing need).

The constitution already mandates the architect spike this before build — this section is
the input to that spike, not a decision.

## 7. Recommended product direction (Phase 1 scope, S appetite)

**Adopt (Phase 1):**
- Instant room creation → crypto-random room code + invite link (constitution: unguessable, not sequential).
- Invite by link; guest joins with display name only (no auth beyond link — matches idea.md).
- Fibonacci deck (1, 2, 3, 5, 8, 13, 21) per scrumpoker-online.org and constitution testing bar.
- Presence: who is online; "X of N voted" indicator per round.
- Hidden vote → simultaneous reveal → distribution shown → discussion → re-vote until consensus.
- Consensus detection: all-equal = estimated; otherwise show spread and outliers.
- Reset/next-story transition.
- Minimal facilitator-side issue list (manual add + reorder); CSV/Jira sync explicitly deferred.
- Zustand client state (constitution); Tailwind-only styling (constitution).

**Defer (Phase 2+, per constitution):** poker-table dressing, gamification, chat/comments,
custom decks, timers, avg/median stats, QR invite, mobile polish, integrations, analytics.

**Avoid (never):** polling as realtime; mandatory accounts for guests; CRDT/co-editing
complexity; feature bloat before the loop works.

## 8. Open assumptions / unknowns

1. **Supabase availability** — unknown whether the team can/wants to run a Supabase project or
   prefers self-hosting. Affects transport choice; the spike must resolve it.
2. **Deployment target** — internal-only; deployment details (Vercel/self-host) are not yet
   decided; constitution says preview-only until qa + reviewer pass.
3. **Team size ceiling** — assumed 3–15 concurrent/room based on scrumpoker-online.org's
   practical range; no hard cap needed in Phase 1.
4. **Reference tool's actual reveal interaction** — captured from marketing copy + FAQ, not
   hands-on gameplay; the spike can validate against a live session if desired.

## Kill criteria (revisit only if these emerge)

- Evidence that internal team already standardizes on a competitor tool and refuses to switch.
- Realtime transport turns out to require infra the team cannot run (spike outcome).
- Consensus detection proves ambiguous in practice (should not — all tools implement it).
