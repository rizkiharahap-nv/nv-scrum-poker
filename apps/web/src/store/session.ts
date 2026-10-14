/**
 * Device-side session identity (PRD decision 5, AC-F5.5).
 *
 * On successful `room:create` / `room:join` the client stores
 * `{ roomId, participantId }` in sessionStorage; on page load with a stored
 * session the client calls `room:resume` to re-bind the SAME participant
 * (name/vote/host preserved) — this is the ONLY identity for resume
 * (architecture §6.4: the remembered name is cosmetic prefill only).
 *
 * sessionStorage is per-tab-session: a reload keeps it (resume path), a fresh
 * tab / browser does not (join gate with remembered-name prefill, AC-F1.5).
 */
const KEY = 'scrum-poker.session';

export interface StoredSession {
  roomId: string;
  participantId: string;
}

export function getStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.roomId === 'string' && typeof parsed.participantId === 'string') {
      return { roomId: parsed.roomId, participantId: parsed.participantId };
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // storage unavailable — the session just won't survive a reload
  }
}

export function clearStoredSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
