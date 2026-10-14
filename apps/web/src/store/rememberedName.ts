/**
 * Remembered display name (AC-F1.5/F1.6, architecture §6.4).
 * One device-local `localStorage` entry `scrum-poker.displayName`, holding the
 * trimmed display name. Written on successful room:create / room:join acks;
 * read on Landing/Join mount to prefill the name input. NEVER auto-submits.
 */

const KEY = 'scrum-poker.displayName';

export function getRememberedName(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setRememberedName(name: string): void {
  try {
    localStorage.setItem(KEY, name.trim());
  } catch {
    // storage unavailable — ignore (name simply won't be remembered)
  }
}
