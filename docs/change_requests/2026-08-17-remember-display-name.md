# Change Request: Remembered display name (guest + host)

- **ID:** CR-2026-08-17-02
- **Date:** 2026-08-17
- **Requester:** Rizki (human)
- **Lanes affected:** `docs/PRD.md` (AC-F1.* area), `docs/design/flows.md`, `docs/design/ui_spec.md` (§4.3 name form, §5.2 join form), `docs/architecture/architecture.md` (storage), `docs/tasks.md` (slice 1/2 tests)
- **Status:** pm done (2026-08-17) + ux done (2026-08-17) — AC-F1.5/F1.6 added to `docs/PRD.md`, decision 7 locked, touchpoints locked below, ux touchpoints applied to `docs/design/flows.md` + `docs/design/ui_spec.md`; architect done (2026-08-17) — storage note in `docs/architecture/architecture.md` (§6.4 + §5 join-flow prefill, `Participant.name` reconciled to ≤24), slice 1/2 acceptance tests + PRD AC lists updated in `docs/tasks.md`; folds into Gate 3 (`t_12f14f3d`)

## Requested change

If a user already entered a display name before (any previous session on this device), the name is remembered and automatically pre-filled the next time they create a room (host) or join a room (guest) — no re-typing.

## Requirements (user words → AC shape)

1. **Remember:** after a successful create (host) or join (guest), store the trimmed display name on the device (localStorage — survives tab/session, unlike the existing sessionStorage participantId which is per-room).
2. **Prefill on landing (host):** `Flow 1 — Create room` shows the name input already filled with the remembered name; user can still edit before "New room".
3. **Prefill on join (guest):** `Flow 2 — Join via invite link` shows the join prompt with the name input pre-filled; user can still edit before "Join room".
4. **AC-F1.4 guest isolation is preserved:** the join prompt still renders — prefill only, no auto-submit, no bypass of the join gate. Remembered name never reveals creator's room state.

## Design notes / decisions for pm to lock

- Storage key: single `localStorage` entry (e.g. `scrum-poker.displayName`), device-local, plain display name (constitution: "No PII required; display name only" — a nickname is not PII-sensitive; still client-side only, never sent except on join).
- Editable: the input is never locked to the remembered value.
- Same validation on submit as today (trimmed, ≤24 chars).
- Phase 1 scope: no "forget me" / name-switcher UI; editing the input is the escape hatch. Note if pm disagrees.
- Shared devices: last-used name wins; acceptable for an internal tool.

**pm lock (2026-08-17):** all five design notes accepted as written — storage key
`scrum-poker.displayName`, editable, submit validation unchanged (trimmed, ≤24), no
forget-me UI in Phase 1 (edit-in-place is the escape hatch), last-used name wins on shared
devices.

## Deliverables

- `pm` (DONE 2026-08-17): AC-F1.5 + AC-F1.6 in PRD Feature 1 (prefill on create + join, editable, no auto-submit, isolation preserved), locked product decision 7, exact touchpoint list below.
- `ux` (DONE 2026-08-17): flows.md Flow 1/2 prefill steps + Flow 6 edge row + ui_spec §4.3/§5.2 behavior lines.
- `architect` (DONE 2026-08-17): storage note in architecture.md (localStorage name key vs sessionStorage participant session — new §6.4 + §5 join-flow prefill note; `Participant.name` reconciled to ≤24), tasks.md slice 1/2 acceptance test additions (create → reload → name pre-filled; join → reload → name pre-filled, no auto-submit).

## Next owner

`ux` ∥ `architect` (touchpoints below) → Gate 3 `t_12f14f3d` re-review before human approval.

## Touchpoints (pm — locked 2026-08-17)

**Scope lock:** Phase 1 has no "forget me" / name-switcher UI — editing the pre-filled
input is the escape hatch. Storage key locked: `scrum-poker.displayName` (single
device-local `localStorage` entry). Submit validation unchanged: trimmed, ≤24 chars.

### ux — `docs/design/flows.md` + `docs/design/ui_spec.md`

1. `flows.md` Flow 1 (Create room): after the "type display name" step, add a prefill line —
   name input starts pre-filled from the remembered name when one exists (AC-F1.5); user may
   edit before [New room]. Extend the empty/edge paragraph: fresh device (no remembered
   name) ⇒ empty input (AC-F1.1 unchanged).
2. `flows.md` Flow 2 (Join via invite link): add a prefill line — name input pre-filled
   from the remembered name when one exists; joining still requires an explicit [Join room]
   click or Enter — never auto-submit, join gate intact (AC-F1.4/F1.6).
3. `flows.md` Flow 6 edge table: add row — "Shared device / remembered name from a previous
   user" ⇒ last-used name pre-filled, editable (accepted; internal tool).
4. `ui_spec.md` §4.3 Behavior: add — on mount, if a remembered name exists (localStorage key
   `scrum-poker.displayName`), the name input is pre-filled; it remains editable; submit
   validation unchanged.
5. `ui_spec.md` §5.2 Behavior: add the same prefill line for the join form, plus "no
   auto-submit — the join gate still requires an explicit submit".
6. `ui_spec.md` §3.2 (shared input): no change — prefill is input initialization on the same
   component.

### architect — `docs/architecture/architecture.md` + `docs/tasks.md`

1. `architecture.md` new §6.x "Client-side remembered display name": one device-local
   `localStorage` entry (`scrum-poker.displayName`) written with the trimmed name on
   successful `room:create` / `room:join` acks, read on Landing/Join mount to prefill. It is
   NOT identity — the sessionStorage `roomId + participantId` session remains the only
   identity for `room:resume`; the remembered name is cosmetic input init, never
   auto-submitted (AC-F1.4/F1.6). Add a note to §5 join flow: join prompt's name input is
   pre-filled when a remembered name exists.
2. `architecture.md` §4.2 `Participant.name` says "1..40 chars" — reconcile to "1..24 chars"
   (PRD + this CR lock trimmed, ≤24). Architect owns the edit.
3. `tasks.md` Slice 1: extend `test/room-create.test.ts` — create → reload → name pre-filled
   (after a successful create, reload the landing page; assert the name input holds the
   remembered value and is editable; fresh device ⇒ empty input). Add AC-F1.5 (create half)
   + AC-F1.6 to slice 1's PRD ACs.
4. `tasks.md` Slice 2: extend `test/join-presence.test.ts` — join → reload → name pre-filled
   (after a successful join, reload the join URL; assert the name input holds the remembered
   value AND the join gate still requires an explicit submit — no auto-submit). Add AC-F1.5
   (join half) + AC-F1.6 to slice 2's PRD ACs.
