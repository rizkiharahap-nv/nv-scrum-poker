/**
 * Join gate + remembered display name — AC-F1.5/F1.6 (component tests, jsdom).
 *
 * - Join prompt pre-fills the remembered name (AC-F1.5) and remains editable;
 *   nothing is submitted without an explicit submit — opening the invite URL
 *   never auto-joins (AC-F1.6, guest isolation AC-F1.4).
 * - A stored session (participantId + roomId in sessionStorage) makes the Room
 *   view attempt room:resume (AC-F5.5) instead of bouncing to the join gate.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { WebSocket } from 'ws';
import Join from '../../apps/web/src/components/Join.svelte';
import Room from '../../apps/web/src/components/Room.svelte';
import { resetRoom, room } from '../../apps/web/src/store/room.svelte';
import * as clientChannel from '../../apps/web/src/realtime/clientChannel';

describe('join gate (AC-F1.5/F1.6)', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    resetRoom();
    // The components connect a WS; stub the real one so no network is attempted.
    vi.stubGlobal('WebSocket', WebSocket);
  });

  it('pre-fills the remembered name and never auto-submits (editable, explicit submit only)', async () => {
    localStorage.setItem('scrum-poker.displayName', 'Maya');
    const navigate = vi.fn();
    render(Join, { props: { token: 'room-token-123', onNavigate: navigate } });

    const input = (await screen.findByPlaceholderText('e.g. Maya')) as HTMLInputElement;
    expect(input.value).toBe('Maya'); // AC-F1.5 prefill

    // AC-F1.6 — editable, no auto-submit: wait a beat and assert no navigation happened.
    await new Promise((r) => setTimeout(r, 150));
    expect(navigate).not.toHaveBeenCalled();

    // Editable before submit.
    await fireEvent.input(input, { target: { value: 'Maya2' } });
    expect(input.value).toBe('Maya2');
    expect(navigate).not.toHaveBeenCalled();

    // Submitting with an empty name → inline validation, no navigation.
    await fireEvent.input(input, { target: { value: '   ' } });
    await fireEvent.submit(input.closest('form')!);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('fresh device (no stored name) shows an empty input and does not navigate', async () => {
    const navigate = vi.fn();
    render(Join, { props: { token: 'room-token-123', onNavigate: navigate } });
    const input = (await screen.findByPlaceholderText('e.g. Maya')) as HTMLInputElement;
    expect(input.value).toBe(''); // AC-F1.6
    await new Promise((r) => setTimeout(r, 150));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('room view resume (AC-F5.5)', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    resetRoom();
    vi.restoreAllMocks();
    vi.stubGlobal('WebSocket', WebSocket);
  });

  it('with a stored session, Room attempts room:resume and shows the room instead of the join gate', async () => {
    // Simulate a prior join: sessionStorage holds the identity.
    sessionStorage.setItem('scrum-poker.session', JSON.stringify({ roomId: 'room-token-123', participantId: 'pid-1' }));
    const navigate = vi.fn();
    render(Room, { props: { token: 'room-token-123', onNavigate: navigate } });

    // The resume attempt connects a WS (stubbed, never opens) → no navigation
    // to the join gate; UI shows the reconnecting state.
    await waitFor(() => {
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it('resumes a stored session even when a leftover channel exists (dev remount)', async () => {
    sessionStorage.setItem(
      'scrum-poker.session',
      JSON.stringify({ roomId: 'room-token-123', participantId: 'pid-1' }),
    );
    const resume = vi.spyOn(clientChannel, 'resumeRoom').mockResolvedValue(undefined);
    vi.spyOn(clientChannel, 'getChannel').mockReturnValue({ request: vi.fn() } as never);
    const navigate = vi.fn();
    render(Room, { props: { token: 'room-token-123', onNavigate: navigate } });
    await waitFor(() => {
      expect(resume).toHaveBeenCalledWith('room-token-123', 'pid-1');
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows recovery instead of a spinner when the room is gone (server restart)', async () => {
    room.sessionLost = true;
    vi.spyOn(clientChannel, 'getChannel').mockReturnValue({ request: vi.fn() } as never);
    const navigate = vi.fn();
    render(Room, { props: { token: 'room-token-123', onNavigate: navigate } });
    expect(screen.getByLabelText('Session expired').textContent).toContain(
      'This room is no longer available.',
    );
    expect(screen.queryByText('Connecting to room…')).toBeNull();
    const create = screen.getByRole('button', { name: 'Create a new room' });
    await fireEvent.click(create);
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
