import { describe, expect, it } from 'vitest';
import { cueForTransition } from '../apps/web/src/lib/tableAudio';

describe('cueForTransition', () => {
  it('plays consensus when a voting round reveals agreement', () => {
    expect(cueForTransition('voting', 'revealed', true)).toBe('consensus');
  });

  it('plays split when a voting round reveals disagreement', () => {
    expect(cueForTransition('voting', 'revealed', false)).toBe('split');
  });

  it('plays revote when the table resets to voting', () => {
    expect(cueForTransition('revealed', 'voting', true)).toBe('revote');
  });

  it('is silent on first paint and while staying in the same phase', () => {
    expect(cueForTransition(null, 'voting', undefined)).toBeNull();
    expect(cueForTransition(null, 'revealed', true)).toBeNull();
    expect(cueForTransition('voting', 'voting', false)).toBeNull();
    expect(cueForTransition('revealed', 'revealed', true)).toBeNull();
  });
});
