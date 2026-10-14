# UI Spec — Scrum Poker Phase 1 MVP

Status: Stage 3 Design · Owner: ux · Date: 2026-08-15 (rev 2026-08-18, CR-2026-08-18-05) · Appetite: S
Inputs: `docs/PRD.md` (ACs F1–F5), `docs/design/flows.md` (flows + state machine),
`docs/constitution.md` (Tailwind-only), `docs/change_requests/2026-08-18-poker-table-ui.md`
(CR-2026-08-18-05). Consumed by: builder (slice 6), qa (visual smoke).

## 0. Scope and rules

This spec is the builder's styling contract for slice 6 and the visual reference for the
whole app. It describes every screen and component with Tailwind utility classes.

**Hard rules (constitution + PRD):**
- **Plain CSS** in `apps/web/src/poker-table.css`. No Tailwind. Svelte `style:*`
  geometry directives place seats/cards on the stadium rail (`seatGeometry.ts`).
  No `.less`. The static scan in `test/no-tailwind.test.ts` enforces this.
- No third-party UI kits, no icon libraries, no custom fonts. Icons are inline SVGs
  (SVG *elements* are allowed; SVG *presentation attributes* used only where Tailwind
  cannot express them — see §6).
- Every color/space/radius/font below is a Tailwind default token. No arbitrary values.
- `focus-visible` ring on every interactive element, `disabled:` styles on every disabled
  control, `aria-*` attributes as listed. Dark text on light background only.
- No text truncation on names or invite links (wrap instead); copyable invite link.

**Not in Phase 1 (do not style):** chips, gamification badges, card fans/decks
imagery, chat, issue list, timers, stats beyond the consensus distribution. The
poker-table layout IS in scope (CR-2026-08-18-05) — see §6.2; the old "no felt"
non-goal is reversed.

## 1. Design tokens

| Token | Value (Tailwind class) | Usage |
|-------|------------------------|-------|
| Background | `bg-white` | app pages (reference screenshots are white, not slate-100) |
| Surface | `bg-white` | panels, cards, modals |
| Ink (primary text) | `text-slate-900` | headings, labels, values |
| Ink (secondary) | `text-slate-600` | body copy, helpers |
| Ink (faint) | `text-slate-400` | placeholders, disabled text |
| Brand / primary action | `bg-indigo-600 hover:bg-indigo-500 text-white` | primary buttons (kept — see §6.1 note) |
| Brand hover | `bg-indigo-50 text-indigo-700` | ghost/select states |
| Success | `text-emerald-600 bg-emerald-50` | voted check, consensus |
| Warning | `text-amber-600 bg-amber-50` | no-consensus, connection banner |
| Danger | `text-red-600` | error text, invalid link |
| Border | `border-slate-200` | dividers, card edges |
| Card face (revealed value) | `bg-white border-slate-300` | card front |
| Card back | `bg-indigo-600` | face-down card |
| **Felt (table surface)** | `bg-blue-500` | the oval poker-table felt (reference `image/Screenshot 2026-08-18 at 16.20.40.png` etc.; felt ≈ #5d9cf5 → Tailwind `blue-500` #3b82f6; no arbitrary values) |
| **Table rim / rail** | `bg-blue-100 border-blue-300` | light-blue ring around the felt (reference ≈ #dfebfc → `blue-100` #dbeafe) |
| **Seat card back (face-down)** | `bg-blue-500 text-blue-100` | participant seat during voting (matches the felt family; reference shows solid blue seat cards) |
| **Seat card front (revealed)** | `bg-white border-blue-300 text-blue-600` | participant seat after reveal (reference shows white cards with blue border + blue value text) |
| **Deck value text** | `text-blue-600` | the Fibonacci value on a deck card (AA contrast on white) |
| Radius | `rounded-lg` (cards/buttons), `rounded-xl` (panels), `rounded-full` (badges/chips), `rounded-3xl` (table oval — Tailwind default) | corners |
| Shadow | `shadow-sm` (panels), `shadow` (raised cards), `shadow-md` (selected card) | elevation |
| Font | default sans (`font-sans`), `font-semibold` (labels), `font-bold` (values/headings) | type |
| Size scale | `text-sm` (body), `text-base` (input), `text-lg` (card values), `text-xl` (page titles), `text-3xl` (consensus value) | type |

## 2. Global layout shell

Both screens use the same page frame:

```html
<div class="min-h-screen bg-white flex flex-col">
  <header class="bg-white border-b border-slate-200">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
      <!-- wordmark left, phase badge / room actions right -->
    </div>
  </header>
  <main class="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10">
    <!-- screen content -->
  </main>
</div>
```

- Max content width `max-w-4xl` for all screens (comfortable for a 3–15 person team).
- Sticky header: `sticky top-0 z-20` on the header for the room screen (invite link stays
  reachable while scrolling).

## 3. Shared components

### 3.1 Button

Primary / secondary / ghost variants used across screens.

| Variant | Classes | Usage |
|---------|---------|-------|
| Primary | `inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500` | New room, Join room, Copy |
| Secondary | `inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-not-allowed disabled:opacity-50` | Re-vote (secondary emphasis) |
| Ghost/icon | `inline-flex items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-not-allowed disabled:opacity-50` | copy icon button |

State notes: `disabled:` present on all variants; loading text replaces label and keeps
button disabled; `type="button"` everywhere except the form submit.

### 3.2 Form input (display name)

```html
<label class="block">
  <span class="mb-1 block text-sm font-semibold text-slate-700">Display name</span>
  <input
    type="text"
    maxlength="24"
    autocomplete="name"
    placeholder="e.g. Maya"
    class="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
  />
</label>
```

- Trimmed on submit; empty → inline error + `aria-invalid="true"` + `border-red-300`.
- Max 24 chars enforced by `maxlength`.

### 3.3 Inline error

```html
<p role="alert" class="mt-2 text-sm font-medium text-red-600">…</p>
```

### 3.4 Badge

Small rounded label: `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold`.

| Kind | Extra classes |
|------|---------------|
| Host | `bg-indigo-100 text-indigo-700` |
| You | `bg-slate-200 text-slate-700` |
| Voted (seat) | `bg-emerald-100 text-emerald-700` |
| Left | `bg-slate-100 text-slate-500` |

### 3.5 Connection banner

Non-blocking, sits at top of room content below the header:

```html
<div role="status" aria-live="polite"
     class="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
  <svg class="h-4 w-4 shrink-0" …aria-hidden="true"><!-- spinner --></svg>
  Connection lost — reconnecting…
</div>
```

## 4. Screen 1 — Landing (`/`)

### 4.1 Layout

```html
<div class="mx-auto flex max-w-xl flex-col items-center py-12 sm:py-20 text-center">
  <!-- logo mark -->
  <!-- title -->
  <!-- subtitle -->
  <!-- name form -->
  <!-- create button -->
</div>
```

### 4.2 Wordmark

Logo mark + name. The mark is a simple two-card SVG (one face-up showing `5`, one
face-down) — no external assets:

```html
<svg class="mx-auto h-12 w-12 text-indigo-600" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <!-- card 1 (face-down, indigo) -->
  <rect x="6" y="14" width="20" height="28" rx="3" class="fill-indigo-600" />
  <!-- card 2 (face-up, white) tilted -->
  <rect x="22" y="6" width="20" height="28" rx="3" class="fill-white stroke-slate-300" stroke-width="1.5" />
  <text x="32" y="24" text-anchor="middle" font-size="12" font-weight="700" class="fill-slate-900">5</text>
</svg>
<h1 class="mt-4 text-3xl font-bold tracking-tight text-slate-900">Scrum Poker</h1>
<p class="mt-2 max-w-sm text-base text-slate-600">
  Estimate sprint tickets together. Create a room, share the link, and vote in secret — then reveal as a team.
</p>
```

### 4.3 Name form + create action

```html
<form class="mt-8 w-full max-w-sm space-y-4" novalidate>
  <!-- display name input (§3.2) -->
  <button type="submit" class="…primary w-full">
    New room
  </button>
</form>
<p class="mt-4 text-xs text-slate-400">No account needed. Rooms are live sessions only.</p>
```

Behavior:
- **Prefill (remembered name):** on mount, if a remembered name exists (localStorage key
  `scrum-poker.displayName`), the name input is pre-filled with it (AC-F1.5); the input
  remains editable and submit validation is unchanged (trimmed, ≤24 chars, AC-F1.6).
- **Loading (creating):** button label → `Creating room…`, `disabled`.
- **Error (creation failed):** inline error (§3.3) above the button; button re-enabled.
- **Success:** navigate to `/room/[token]` (flows §4.1); the trimmed name is written to
  `localStorage` `scrum-poker.displayName`.

## 5. Screen 2 — Join (`/r/[token]`)

### 5.1 Layout

```html
<div class="mx-auto flex max-w-xl flex-col items-center py-12 sm:py-20 text-center">
  <!-- small logo mark (h-8 w-8) -->
  <h1 class="mt-4 text-2xl font-bold tracking-tight text-slate-900">You've been invited</h1>
  <p class="mt-2 max-w-sm text-base text-slate-600">
    Join the Scrum Poker room to estimate the next story with your team.
  </p>
  <!-- name form + join button -->
</div>
```

- The join form is always the first thing rendered for a non-joined session
  (AC-F1.4 guest isolation).

### 5.2 Join form

```html
<form class="mt-8 w-full max-w-sm space-y-4" novalidate>
  <!-- display name input (§3.2) -->
  <button type="submit" class="…primary w-full">Join room</button>
</form>
```

Behavior:
- **Prefill (remembered name):** on mount, if a remembered name exists (localStorage key
  `scrum-poker.displayName`), the name input is pre-filled with it (AC-F1.5). No
  auto-submit — the join gate still requires an explicit [Join room] click or Enter
  (AC-F1.4/F1.6).
- **Loading (joining):** label → `Joining…`, disabled.
- **Success:** navigate to `/room/[token]`, room renders voting phase; the trimmed name
  is written to `localStorage` `scrum-poker.displayName`.
- **Error — link invalid:** error text "This invite link is no longer valid." Button
  re-enabled (retry pointless but harmless).
- **Error — name taken:** "That name is already taken in this room." input
  `aria-invalid="true"`, `border-red-300`.
- **Error — connection:** "Couldn't connect. Check your connection and try again."

## 6. Screen 3 — Room (`/room/[token]`)

The room is one component tree driven by `RoomUiState` (flows §8) and the phase state
machine (flows §3). All live values update in real time via the transport; nothing here
polls.

### 6.0 Connecting splash

Rendered while the transport connects / before first state arrives:

```html
<div class="mx-auto flex max-w-md flex-col items-center py-24 text-center">
  <svg class="h-8 w-8 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
  </svg>
  <p class="mt-4 text-sm font-medium text-slate-600">Connecting to room…</p>
</div>
```

### 6.1 HeaderBar

> Note (CR-05): the reference screenshots show a blue felt table with blue action
> buttons. The primary action button stays `indigo-600` (existing brand token) —
> the CR is about the table, not a full rebrand. If the human wants buttons
> recolored to blue too, that is a separate change request.

```html
<header class="sticky top-0 z-20 border-b border-slate-200 bg-white">
  <div class="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
    <!-- left: wordmark mini + phase badge -->
    <div class="flex items-center gap-3">
      <span class="text-sm font-bold tracking-tight text-slate-900">Scrum Poker</span>
      <PhaseBadge />
    </div>
    <!-- right: invite link chip + copy -->
    <InviteLinkChip />
  </div>
</header>
```

#### PhaseBadge

| Phase | Classes | Label |
|-------|---------|-------|
| voting | `inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700` | `Voting` |
| revealed | `inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700` | `Revealed` |

#### InviteLinkChip

```html
<div class="flex min-w-0 items-center gap-2">
  <div class="hidden min-w-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 sm:flex">
    <svg class="h-3.5 w-3.5 shrink-0 text-slate-400" …aria-hidden="true"><!-- link icon --></svg>
    <span class="truncate text-xs font-medium text-slate-600"><full invite URL></span>
  </div>
  <CopyButton />
</div>
```

CopyButton:
- Primary (compact): `…primary px-3 py-1.5 text-xs` label `Copy link`.
- On click: label → `Copied!` for 2s, icon swaps to a check; `aria-live="polite"`.
- Clipboard failure: label → `Copy failed` for 2s; the URL span stays selectable
  (flows §4.6). Full URL is always rendered in the chip (AC-F1.3).

### 6.2 TablePanel — the poker table

The room center is a **Texas Hold'em table** (prototype `docs/design/prototype/poker-table.html`):
a stadium felt with a wood rail, seats equally spaced by perimeter (host locked
top-center), face-down cards on the felt during voting,
and the deck rail below. Reference screenshots: `image/Screenshot 2026-08-18 at
16.20.40.png` (voting, seats top/bottom/sides, no deck row), `16.21.07.png`
(voting, seats top + deck rail bottom), `16.21.13.png` (revealed, seats flipped
white with values). All classes below are Tailwind default tokens — no arbitrary
values.

```html
<section aria-label="Participants" class="mx-auto w-full max-w-2xl">
  <!-- top row of seats -->
  <div class="flex flex-wrap items-start justify-center gap-3 sm:gap-6">
    <ParticipantSeat :participant="…" :state="…" />
  </div>

  <!-- the table: blue felt oval on a light-blue rim -->
  <div class="my-6 rounded-3xl border border-blue-300 bg-blue-100 p-3 shadow-sm sm:p-4">
    <div class="relative flex min-h-44 items-center justify-center rounded-2xl bg-blue-500 sm:min-h-56">
      <!-- face-down/face-up cards sit on the felt center -->
      <TableCards />
    </div>
  </div>

  <!-- bottom row of seats -->
  <div class="flex flex-wrap items-start justify-center gap-3 sm:gap-6">
    <ParticipantSeat :participant="…" :state="…" />
  </div>
</section>
```

**Oval geometry (Tailwind-only):** the felt is a rounded rectangle made to look
oval — `rounded-2xl` inner felt + `rounded-3xl` outer rim. No `rounded-[50%]`
arbitrary values. The rim (`bg-blue-100 border-blue-300`) is the light-blue ring
visible in the reference; the inner felt is `bg-blue-500`.

**Seat placement:** up to 4 seats top, 4 bottom, 1 left, 1 right (max 10
participants; PRD cap is 15 — overflow wraps into the top/bottom rows). Rows are
`flex flex-wrap justify-center` so extra seats wrap gracefully; each seat is a
`ParticipantSeat` (below). Empty states render defensively.

Empty state (should not normally render while connected — at least self is a
participant; render defensively):

```html
<p class="py-10 text-center text-sm text-slate-500">No participants yet.</p>
```

#### ParticipantSeat

One per online participant. Identical geometry for self and others; content differs by
phase and role. Card dimensions fixed: `h-28 w-20` (compact — reference seat cards
are smaller than the current `h-32 w-24`; mobile-safe within the wrap rows).

```html
<div class="flex flex-col items-center gap-1.5">
  <!-- the card -->
  <div class="relative h-28 w-20">…card content by state…</div>
  <!-- label row -->
  <div class="flex items-center gap-1">
    <span class="text-sm font-semibold text-slate-900">Maya</span>
    <HostBadge v-if="isHost" />
    <YouBadge v-if="isSelf" />
  </div>
</div>
```

Card content by state:

| State | Markup |
|-------|--------|
| voting, not voted | `<div class="flex h-28 w-20 items-center justify-center rounded-lg bg-blue-500 shadow-sm"> <span class="text-3xl text-blue-100">♠</span> </div>` (no value text — AC-F2.3) |
| voting, voted | same face-down + check overlay: `<span class="absolute inset-x-0 bottom-1.5 flex justify-center"><span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">✓ Voted</span></span>` |
| revealed, has value | `<div class="flex h-28 w-20 items-center justify-center rounded-lg border border-blue-300 bg-white shadow"> <span class="text-2xl font-bold text-blue-600">5</span> </div>` |
| revealed, no vote | `<div class="flex h-28 w-20 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50"> <span class="text-xs font-medium text-slate-400">No vote</span> </div>` |

- Face-down seat card shows **no value text anywhere** — including the host's view of guests
  and the guest's view of the host (AC-F2.3; QA asserts no value text in DOM pre-reveal).
- Seat card back is the same blue family as the felt (`bg-blue-500`) per the reference
  (21.07 shows solid blue seat cards during voting). After reveal it flips to a white
  card with blue border + blue value (21.13).
- Self seat: value pre-reveal is only ever the participant's **own** `myVote`; when the
  seat is self and `hasVoted`, show the check overlay; self can also see their own card
  face-down (same back). After reveal, self card flips like everyone else's.
- Seat label for `isSelf` appends YouBadge (`You`); `isHost` appends HostBadge (`Host`).
- Revealed card is a static value display — not a button, no hover.

#### TableCards (cards on the felt)

The reference shows 1–2 small cards sitting on the felt center during voting
(the "on-table" cards). Render the center of the felt as a face-down card when
there is at least one submitted vote; after reveal, flip it to a face-up card.

```html
<!-- center of the felt (inside the bg-blue-500 oval) -->
<div v-if="phase === 'voting' && votedCount > 0"
     class="flex h-14 w-10 items-center justify-center rounded-lg border border-blue-300 bg-white shadow">
  <span class="text-lg font-bold text-blue-600">?</span>
</div>
```

- Face-down on-table card shows **no value text** (AC-F2.3) — a `?` mark or the
  ♠ back are both acceptable; no value digits.
- After reveal, the on-table card flips to `bg-white border-blue-300 text-blue-600`
  with the consensus value (or "Pass"), same as a revealed seat.
- The on-table card is decorative (the seat cards remain the source of who voted);
  it reinforces the poker-table metaphor. No buttons.

#### Leaver seats (departed mid-round)

A participant who disconnected after voting renders as dimmed with a `Left` badge:

```html
<div class="flex flex-col items-center gap-1.5 opacity-60">
  <div class="flex h-28 w-20 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100">
    <span class="text-xs font-medium text-slate-500">Left</span>
  </div>
  <span class="text-sm font-semibold text-slate-500">Maya</span>
  <span class="badge badge-left">Left</span>
</div>
```

(UX decision Q4 in flows: leaver votes are excluded from X and from the reveal/distribution.)

### 6.3 ControlsRow (voting phase only)

```html
<div class="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
  <p class="text-sm font-medium text-slate-600">
    <span class="font-bold text-slate-900">0</span> of <span class="font-bold text-slate-900">5</span> voted
  </p>
  <RevealButton />
</div>
```

#### ProgressText

`X of N voted`, `X` and `N` bold. Updates live (AC-F2.5, AC-F5.3).
- `X = 0`: also show helper below the table:
  `Waiting for the team to vote.` (and if N < 2: `Waiting for teammates to join. Share the invite link in the header.`)

#### RevealButton

```html
<button type="button" disabled title="…"
        class="…primary disabled:bg-slate-300 disabled:text-slate-500">
  Reveal
</button>
```

| Who | `disabled` | `title` |
|-----|-----------|---------|
| Host, X ≥ 1 | `false` | — |
| Host, X = 0 | `true` | `No votes yet` (AC-F3.4) |
| Guest | `true` | `Only the host can reveal` (AC-F3.1) |

### 6.4 DeckRow (voting phase only)

```html
<div class="mt-6">
  <p class="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">Your vote</p>
  <div class="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
    <FibonacciCard v-for="value in DECK" :value="value" :selected="myVote === value" />
  </div>
</div>
```

Deck constant: exactly `[1, 2, 3, 5, 8, 13, 21]` (AC-F2.1). No other values.

#### FibonacciCard

Interactive card in the deck row. Select-and-submit on single click (flows §4.3, Q1).
White face with a blue border (reference 21.07 deck cards) and blue value text;
selected state fills blue:

```html
<button type="button"
        :aria-pressed="selected"
        :aria-label="`Vote ${value}`"
        class="flex h-14 w-10 items-center justify-center rounded-lg border border-blue-300 bg-white text-lg font-bold text-blue-600 shadow-sm transition
               hover:-translate-y-0.5 hover:border-blue-400 hover:shadow
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600
               data-[selected=true]:border-blue-500 data-[selected=true]:bg-blue-500 data-[selected=true]:text-white data-[selected=true]:shadow-md">
  {{ value }}
</button>
```

- Selected card: blue fill, white value text, raised shadow (`shadow-md`) — the
  reference shows the selected deck card as solid blue (21.07 deck card centers
  that read blue are the selected ones).
- Clicking a card selects AND submits the vote (UX decision Q1); clicking another card
  changes the vote (AC-F2.4); clicking the already-selected card is a no-op.
- `aria-pressed` reflects selection. No inline `style`; `data-[selected]` variant is the
  Tailwind-idiomatic way to drive selection state.
- Pass card (`PASS_VOTE`) keeps the same classes; its label is `Pass`.
- After reveal, the deck row is hidden entirely (only the host's Re-vote brings it back).

### 6.5 ResultPanel (revealed phase only)

Appears below the table after the reveal broadcast. Replaces the controls/deck area.

```html
<section aria-live="polite" class="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
  <!-- banner -->
  <ConsensusBanner v-if="reveal.consensus.reached" />
  <NoConsensusBanner v-else />
  <!-- distribution -->
  <DistributionRow :distribution="reveal.consensus.distribution" />
  <!-- action -->
  <div class="mt-4 flex justify-center">
    <ReVoteButton />
  </div>
</section>
```

#### ConsensusBanner

```html
<div class="rounded-lg bg-emerald-50 px-4 py-3 text-center">
  <p class="text-sm font-semibold uppercase tracking-wide text-emerald-700">Consensus</p>
  <p class="mt-1 text-3xl font-bold text-slate-900">Estimated at 5</p>
  <p class="mt-1 text-sm text-slate-600">All 5 votes matched.</p>
</div>
```

#### NoConsensusBanner

```html
<div class="rounded-lg bg-amber-50 px-4 py-3 text-center">
  <p class="text-sm font-semibold uppercase tracking-wide text-amber-700">No consensus yet</p>
  <p class="mt-1 text-base text-slate-700">Discuss the spread, then re-vote.</p>
</div>
```

#### DistributionRow

Always rendered when revealed. Value → count chips, sorted by count desc.

```html
<div class="mt-4 flex flex-wrap items-center justify-center gap-2">
  <span v-for="d in distribution"
        class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
    <span class="text-base font-bold text-slate-900">{{ d.value }}</span>
    <span class="text-slate-400">×</span>{{ d.count }}
  </span>
</div>
```

Examples: `5 ×3`, `8 ×1`. Single participant reveal renders one chip.

#### ReVoteButton

```html
<button type="button" disabled title="…" class="…secondary disabled:opacity-50">
  Re-vote
</button>
```

| Who | `disabled` | `title` |
|-----|-----------|---------|
| Host | `false` | — |
| Guest | `true` | `Only the host can start a re-vote` |

Host click: clears all votes, phase → voting, participant list unchanged (AC-F4.3);
broadcasts so all clients reset simultaneously (AC-F5.4).

## 7. Accessibility checklist

- Every interactive element has `focus-visible` ring; inputs show focus ring + border.
- Every icon has `aria-hidden="true"`; adjacent text provides the accessible name; icon
  buttons (copy) carry `aria-label`.
- Live updates use `aria-live="polite"` on: ProgressText, ResultPanel, ConnectionBanner.
- The poker table section has `aria-label="Participants"`; the on-table card is
  decorative and carries `aria-hidden="true"` (seat cards carry the real state).
- `role="alert"` on inline errors; `aria-invalid` + red border on invalid inputs.
- Buttons use native `<button>`; form submission via `<form onSubmit>`; Enter key works.
- Contrast: `text-slate-600` body on white, `text-indigo-700` on `indigo-50`,
  `text-blue-600` value on white, `text-white` on `bg-blue-500` — all pass AA.
  Disabled text `text-slate-400/500`
  is intentionally low-contrast (disabled states are not content).
- `aria-pressed` on deck cards; `aria-label="Vote {value}"` for screen readers.

## 8. Responsive behavior

| Breakpoint | Layout |
|------------|--------|
| Base (mobile) | Seat rows wrap (`flex-wrap`), table min-height `min-h-44`, full-width buttons, invite chip collapses to icon-only copy button (URL hidden; still accessible via the icon `aria-label`) |
| `sm` (≥640) | Seat rows `gap-6`, table min-height `min-h-56`, invite chip visible, controls row becomes horizontal |
| `md` (≥768) | Table max-width `max-w-2xl` still centered; no seat grid columns (rows wrap instead) |

No other breakpoints used; no custom media queries (Tailwind classes only).

## 9. Build notes for builder (slice 6)

1. Implement components from §6 tree exactly; slice 6 is styling, so keep the existing
   Svelte runes store + transport wiring from slices 0–5 and swap in these classes.
2. Selection state on deck cards uses `data-selected` + Tailwind `data-[selected=true]:*`
   variants (no conditional inline classes with `style`).
3. Deck constant: export `DECK = [1, 2, 3, 5, 8, 13, 21]` from the same module slice 3
   created; do not duplicate.
4. Icons: inline SVG only, `aria-hidden`, `class="h-4 w-4"` sizing. No icon library.
5. Verify with `test/no-tailwind.test.ts` — Tailwind is not a dependency.
6. The poker table (CR-05): oval = `rounded-2xl` felt inside `rounded-3xl` rim; both
   Tailwind defaults — **no arbitrary radii** (`rounded-[50%]` is forbidden). Felt
   `bg-blue-500`, rim `bg-blue-100 border-blue-300`. Seats wrap around: top/bottom
   flex rows + the oval between. Face-down seat cards use the blue felt family;
   revealed cards flip to white with blue border/value. Deck cards: white face,
   blue border/value; selected = blue fill + white text.
7. Page background is `bg-white` (reference screenshots are white, not slate-100).
8. QA visual smoke compares screenshots to this spec's component inventory (states:
   landing, join, voting-waiting, voting-in-progress, revealed-consensus,
   revealed-no-consensus, reconnecting), now including the poker-table geometry.

## 10. Component inventory (QA checklist)

| # | Component | States covered in spec |
|---|-----------|------------------------|
| 1 | LandingPage | default, loading, error |
| 2 | JoinPage | default, loading, error-invalid-link, error-name-taken, error-connection |
| 3 | ConnectingSplash | connecting |
| 4 | HeaderBar + PhaseBadge | voting, revealed |
| 5 | InviteLinkChip + CopyButton | default, copied, copy-failed |
| 6 | TablePanel / ParticipantSeat / TableCards | empty, voting-not-voted, voting-voted, revealed-value, revealed-no-vote, leaver, on-table-card (voting/revealed) |
| 7 | ControlsRow (ProgressText) | 0 of N, X of N |
| 8 | RevealButton | host-enabled, host-disabled (0 votes), guest-disabled |
| 9 | DeckRow / FibonacciCard | unselected, selected |
| 10 | ResultPanel | consensus, no-consensus |
| 11 | DistributionRow | single chip, multiple chips |
| 12 | ReVoteButton | host-enabled, guest-disabled |
| 13 | ConnectionBanner | reconnecting |
