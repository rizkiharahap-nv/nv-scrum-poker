/**
 * Felt-table cues from short MP3s. Unique per Fibonacci value is forbidden
 * (would leak the vote on a shared tab).
 */

export type TablePhase = 'voting' | 'revealed' | null;
export type TableCue = 'consensus' | 'split' | 'revote';

export function cueForTransition(
  prev: TablePhase,
  next: TablePhase,
  hasConsensus: boolean | undefined,
): TableCue | null {
  if (prev === 'voting' && next === 'revealed') {
    return hasConsensus ? 'consensus' : 'split';
  }
  if (prev === 'revealed' && next === 'voting') return 'revote';
  return null;
}

let shuffleEl: HTMLAudioElement | null = null;
let revealEl: HTMLAudioElement | null = null;
let primed = false;

function audioAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }
  return true;
}

function getEl(kind: 'shuffle' | 'reveal'): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (kind === 'shuffle') {
    if (!shuffleEl) {
      shuffleEl = new Audio('/shuffle.mp3');
      shuffleEl.preload = 'auto';
    }
    return shuffleEl;
  }
  if (!revealEl) {
    revealEl = new Audio('/reveal.mp3');
    revealEl.preload = 'auto';
  }
  return revealEl;
}

/** Call from a user gesture so later remote reveals can make sound. */
export function unlockTableAudio(): void {
  if (primed || !audioAllowed()) return;
  primed = true;
  for (const kind of ['shuffle', 'reveal'] as const) {
    const el = getEl(kind);
    if (!el) continue;
    el.muted = true;
    const play = el.play();
    if (play && typeof play.then === 'function') {
      void play
        .then(() => {
          if (!el.muted) return;
          el.pause();
          el.currentTime = 0;
          el.muted = false;
        })
        .catch(() => {
          el.muted = false;
        });
    } else {
      el.muted = false;
    }
  }
}

function playEl(el: HTMLAudioElement): void {
  el.muted = false;
  el.volume = 1;
  try {
    el.currentTime = 0;
  } catch {
    /* ignore until metadata is ready */
  }
  const play = el.play();
  if (play && typeof play.catch === 'function') void play.catch(() => {});
}

export function playTableCue(cue: TableCue): void {
  if (!audioAllowed()) return;
  const el = getEl(cue === 'revote' ? 'shuffle' : 'reveal');
  if (el) playEl(el);
}
