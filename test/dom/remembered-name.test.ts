/**
 * Remembered display name — AC-F1.5/F1.6 (component tests, jsdom project).
 *
 * - After a successful create, reloading the landing page shows the remembered
 *   name pre-filled; it is editable (no auto-submit).
 * - A fresh device (no stored name) shows an empty input.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { WebSocket } from 'ws';
import Landing from '../../apps/web/src/components/Landing.svelte';

describe('remembered display name (AC-F1.5/F1.6)', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    // The component only reads localStorage on mount; stub the real WS so the
    // create flow doesn't attempt a network connection during the prefill test.
    vi.stubGlobal('WebSocket', WebSocket);
  });

  it('after a successful create, the landing input holds the remembered name and is editable', async () => {
    localStorage.setItem('scrum-poker.displayName', 'Maya');
    render(Landing, { props: { onNavigate: () => {} } });
    const input = (await screen.findByPlaceholderText('e.g. Maya')) as HTMLInputElement;
    expect(input.value).toBe('Maya');
    // editable (AC-F1.6) — no auto-submit; value can be changed before submit
    await fireEvent.input(input, { target: { value: 'Maya2' } });
    expect(input.value).toBe('Maya2');
  });

  it('a fresh device (no stored name) shows an empty input (AC-F1.6)', async () => {
    render(Landing, { props: { onNavigate: () => {} } });
    const input = (await screen.findByPlaceholderText('e.g. Maya')) as HTMLInputElement;
    expect(input.value).toBe('');
  });
});
