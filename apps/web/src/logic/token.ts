/**
 * Room-code generation — Cloudflare path (AC-F1.2, CR-2026-08-18-06).
 *
 * Room codes are exactly 6 ASCII digits (`000000`–`999999`), generated
 * CLIENT-SIDE because the DO id must be known before the first message
 * (`idFromName(code)`).
 *
 * Uniform generation via REJECTION SAMPLING on `crypto.getRandomValues`:
 * draw 32 bits (4 bytes), reject any sample ≥ the largest multiple of
 * 1_000_000 that fits in 2^32 (4_294_000_000), retry until in range, then
 * take `sample % 1_000_000`. Every code in [0, 999999] is equiprobable —
 * no modulo bias. Leading zeros are preserved: the code is a string and is
 * never coerced to a number.
 *
 * The Node test adapter generates codes server-side with
 * `crypto.randomInt(0, 1_000_000)` zero-padded to 6 digits (same format).
 */

const CODE_COUNT = 1_000_000;
/** Draw width: 32 bits (one Uint32Array element). */
const DRAW_WIDTH = 2 ** 32;
/** Largest multiple of CODE_COUNT that fits in DRAW_WIDTH. */
const REJECTION_LIMIT = Math.floor(DRAW_WIDTH / CODE_COUNT) * CODE_COUNT;

/** Zero-pad an integer in [0, 999999] to exactly 6 digits. */
export function formatRoomCode(value: number): string {
  return String(value).padStart(6, '0');
}

/** Crypto-random, uniform 6-digit room code (rejection sampling, no modulo bias). */
export function generateRoomCode(): string {
  const buf = new Uint32Array(1);
  let sample = 0;
  do {
    crypto.getRandomValues(buf);
    sample = buf[0] ?? 0;
  } while (sample >= REJECTION_LIMIT);
  return formatRoomCode(sample % CODE_COUNT);
}
