# Change Request: Poker-table UI (room screen per reference screenshots)

- **ID:** CR-2026-08-18-05
- **Date:** 2026-08-18
- **Requester:** Rizki (human) — raised at **Gate 4 ship gate** (t_5d8f44d7)
- **Lanes affected:** `docs/PRD.md` (non-goal line 140 — "Poker-table dressing /
  game-table visuals beyond a clean card metaphor"), `docs/design/ui_spec.md`
  (design tokens §1, room screen), `apps/web/src/components/Room.svelte` +
  `DeckRow.svelte` + `FibonacciCard.svelte` (builder), `qa` visual smoke,
  `docs/tasks.md`
- **Status:** APPROVED by human (Gate 4, 2026-08-18) — work proceeds: ux spec → pm PRD reversal → builder → qa → reviewer re-check → ship.

## Human intent (verbatim)

> "for ui poker table is like this image in image/"

Reference screenshots (in the repo): `image/Screenshot 2026-08-18 at 16.20.40.png`,
`image/Screenshot 2026-08-18 at 16.21.07.png`, `image/Screenshot 2026-08-18 at 16.21.13.png`.

## Requested change

The room screen should render as a **poker table** like the reference images
(participants seated around a table, cards on the table, deck below), replacing
the current flat participant-grid layout. This reverses the PRD Phase-1
non-goal that explicitly excluded poker-table dressing.

## Requirements → AC shape (for pm to lock)

1. **Table layout:** the room view renders participants arranged around a
   table/oval, not a `grid-cols-*` list. Face-down cards sit on the table during
   voting; revealed values show on reveal (AC-F3.3 preserved).
2. **Deck stays below the table** (current DeckRow placement is acceptable) —
   reference screenshots show the card rail at the bottom.
3. **All existing ACs preserved:** face-down (AC-F2.3 — no value text
   pre-reveal), anyone-can-reveal (AC-F3.1), simultaneous reveal (AC-F3.2),
   progress "X of N voted" (AC-F2.5), consensus/no-consensus display (AC-F4.*),
   re-vote (AC-F4.3), invite link + copy (AC-F1.3), guest isolation (AC-F1.4),
   connection banner, aria/focus-visible rings.
4. **Tailwind-only:** no `.css`, no inline `style=`, no custom fonts/images for
   the table — use Tailwind default tokens only (constitution). Felt color from
   the Tailwind palette (e.g. `bg-emerald-700`/`bg-green-800` family); no SVG
   texture/pattern hacks beyond the existing inline-SVG rule.
5. **Still out of scope:** chips, animations, gamification badges, timers —
   the non-goal reversal is limited to the table layout, not arcade dressing.

## Design notes / decisions for ux to lock

- ux opens the three reference screenshots and spec the exact table treatment:
  oval/ellipse via rounded-full/rounded-[?] **— no arbitrary values allowed;
  use Tailwind default radii only**, seat positions around the table, felt
  color token, card-face styling on the table vs the current sidebar grid.
- Keep the header (wordmark, phase badge, invite link + copy) unchanged.
- Update `docs/design/ui_spec.md` §1 tokens (add felt/table tokens) + the room
  screen section; keep the hard rules (Tailwind-only, focus-visible, aria).
- pm records the non-goal reversal in `docs/PRD.md` (remove/replace line 140
  with the new "poker table layout" scope line) and locks the AC wording.
- builder implements against the ui_spec delta; `test/tailwind-only.test.ts`
  stays green; qa adds a visual smoke row to `qa/test-report.md`.

## Deliverables

- `ux` (next): `docs/design/ui_spec.md` delta — table layout spec + tokens,
  referencing `image/` screenshots.
- `pm`: PRD non-goal reversal + AC wording (can land with ux).
- `builder`: Room.svelte/DeckRow/FibonacciCard restyle per ui_spec.
- `qa`: visual smoke row in `qa/test-report.md`.
- `reviewer`: re-review before Gate 4 re-fires.

## Next owner

`ux` — open the reference screenshots and write the ui_spec delta, then pm
locks the PRD wording. After spec lands, maestro routes `builder`.
