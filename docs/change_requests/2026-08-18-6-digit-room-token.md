# Change Request: 6-digit numeric room token

- **ID:** CR-2026-08-18-06
- **Date:** 2026-08-18
- **Requester:** Rizki (human) — raised at **Gate 4 ship gate** (t_5d8f44d7)
- **Lanes affected:** `docs/PRD.md` (AC-F1.2), `apps/web/src/logic/token.ts`,
  `apps/web/src/components/Landing.svelte`, `apps/web/src/App.svelte` (route
  regex), `apps/server/src/index.ts` (Node adapter `handleCreate`),
  `server/worker.ts` + `server/roomObject.ts` (DO path — verify only; token is
  opaque there), `test/room-create.test.ts`, `docs/architecture/architecture.md`
  (routing/token section), `docs/tasks.md`
- **Status:** APPROVED by human (Gate 4, 2026-08-18) — work proceeds: architect contract lock → builder → qa → reviewer re-check → ship. **Architect contract lock DONE (t_d6c96fc0):** contract in `docs/architecture/architecture.md` §5, PRD AC-F1.2 rewritten with the security tradeoff, `docs/tasks.md` slice 1 updated, approval log entry added. Next: builder.

## Human intent (verbatim)

> "i need shorten token room we can use 6 number only"

## Requested change

Room tokens become **6 numeric digits** (e.g. `482913`) instead of the current
22-char base64url. Invite URL becomes `/r/482913`. This is a **deliberate
entropy reduction** from 128-bit (~19.9 bits for 10^6 codes) — a human-owned
tradeoff for an internal tool with ephemeral rooms and display-name-only
identity. It must be documented in the PRD/approval log, not silently shipped.

## Requirements → AC shape (for architect to lock)

1. **Format:** exactly 6 ASCII digits (`000000`–`999999`). Leading zeros are
   preserved in the URL and on the wire (`roomId` is a string, never coerced to
   number).
2. **Generation:** crypto-random and uniform. Client path (DO): use
   `crypto.getRandomValues` with rejection sampling for 0–999999 (avoid modulo
   bias) — generation stays client-side because the DO id must exist before the
   first message (`idFromName(token)`). Node test adapter: same 6-digit format
   server-side (`crypto.randomBytes`/`randomInt`).
3. **Collision handling:** with 10^6 codes, a collision on `room:create`
   (existing live room with that code — DO path returns `ROOM_NOT_FOUND`) must
   not dead-end the user. Client retries `room:create` with a fresh token (bounded
   retry loop, e.g. up to 5 attempts), then surfaces the generic error.
4. **AC-F1.2 rewrite:** replace "≥128 bits of entropy" with the 6-digit numeric
   contract + the documented security tradeoff (internal tool, ephemeral rooms,
   no PII). Keep: two consecutive creations yield different codes (probabilistic,
   retry covers the rare equal case); codes are not sequential/derivable from
   room count.
5. **Tests:** `test/room-create.test.ts` — token format regex `/^\d{6}$/`,
   uniqueness across N samples, rejection-sampling uniformity spot-check, invite
   URL shape `/r/\d{6}`, collision-retry behavior. `scripts/do-smoke.mjs` +
   `qa-resume-check.mjs` use arbitrary tokens today (opaque strings — they keep
   passing); optionally switch them to 6-digit for realism.
6. **Server side:** Node adapter `handleCreate` + DO path accept any string
   roomId; only the generator changes. Worker `idFromName(token)` works with
   numeric strings unchanged.

## Design notes / decisions for architect to lock

- **Security note (non-negotiable, must ship in PRD + approval log):** 6-digit
  codes are guessable by brute force (1M combos). Acceptable for an internal
  team tool where rooms are ephemeral, contain no PII, and the join gate
  requires only a display name. Do NOT apply this format to a public/external
  deployment without revisiting.
- Optional hardening (architect decides, keep within appetite S): a small
  join-attempt rate limit on the DO would blunt brute-force room probing —
  cheap to add (storage counter per code), but only if it fits the free-tier
  constraint and Phase-1 scope.
- Keep `tokenBitLength`/`bytesToBase64Url` helpers only if still used;
  otherwise remove with the tests that referenced them.

## Deliverables

- `architect` (next): lock the contract above in `docs/architecture/architecture.md`
  + PRD AC-F1.2 wording + `docs/tasks.md` slice notes.
- `builder`: implement `token.ts` (6-digit generator + rejection sampling),
  Landing collision-retry, Node adapter `handleCreate`, route regex, tests.
- `qa`: re-run suite + add a token-format row to `qa/test-report.md`.
- `reviewer`: re-review before Gate 4 re-fires.

## Next owner

`architect` — lock the token contract + AC rewrite, then maestro routes
`builder`.
