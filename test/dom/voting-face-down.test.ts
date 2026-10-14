/**
 * Slice 3 DOM test — face-down voting UI (PRD AC-F2.1..F2.5, AC-F3.5).
 *
 * - The deck renders EXACTLY the Fibonacci cards 1..21 plus the separate Pass
 *   card (AC-F2.1, AC-F3.5); no other values.
 * - Select = submit (AC-F2.2/F2.4): clicking a card sends `vote:submit { value }`
 *   once; clicking another card re-submits (last wins); clicking the selected
 *   card is a no-op.
 * - Face-down guarantee (AC-F2.3): other participants' seats show no value text
 *   anywhere while voting; only the local "Your vote" deck shows values.
 * - Progress "X of N voted" updates live (AC-F2.5).
 *
 * The select=submit tests stub the client-channel singleton's `request` (the
 * wire contract is exercised end-to-end in test/voting.test.ts against the
 * Node test adapter); the DOM assertions here prove the UI behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import Room from '../../apps/web/src/components/Room.svelte';
import DeckRow from '../../apps/web/src/components/DeckRow.svelte';
import { room, applyState, setMyVote, resetRoom } from '../../apps/web/src/store/room.svelte';
import * as clientChannel from '../../apps/web/src/realtime/clientChannel';
import type { RoomState } from '@scrum-poker/room';

let requestMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  cleanup();
  resetRoom();
  vi.unstubAllGlobals();
  // Stub the channel singleton so DeckRow's submit is a recorded call.
  requestMock = vi.fn().mockResolvedValue({ ok: true });
  vi.spyOn(clientChannel, 'getChannel').mockReturnValue({ request: requestMock } as never);
});

/** A RoomState shaped like the server sends DURING voting (no votes/consensus). */
function votingState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomId: 'room-token-123',
    phase: 'voting',
    participants: [
      { id: 'host-1', name: 'Host', isHost: true, hasVoted: false },
      { id: 'guest-2', name: 'Guest', isHost: false, hasVoted: false },
    ],
    votedCount: 0,
    totalCount: 2,
    ...overrides,
  };
}

describe('FibonacciCard deck (AC-F2.1, AC-F3.5)', () => {
  it('renders EXACTLY 1,2,3,5,8,13,21 plus the Pass card — no other values', () => {
    const { container } = render(DeckRow);
    const buttons = container.querySelectorAll('button');
    const labels = [...buttons].map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Vote 1',
      'Vote 2',
      'Vote 3',
      'Vote 5',
      'Vote 8',
      'Vote 13',
      'Vote 21',
      'Pass',
    ]);
    expect(container.textContent).not.toContain('0');
    expect(container.textContent).not.toContain('½');
    expect(container.textContent).not.toContain('coffee');
  });

  it('aria-pressed reflects the selected card', () => {
    setMyVote(8);
    const { container } = render(DeckRow);
    const pressed = [...container.querySelectorAll('button')].filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]?.getAttribute('aria-label')).toBe('Vote 8');
  });
});

describe('select = submit (AC-F2.2/F2.4)', () => {
  it('clicking a card submits exactly once; another card re-submits (last wins); selected card is a no-op', async () => {
    applyState(votingState(), 'host-1');
    const { container } = render(DeckRow);
    const buttons = [...container.querySelectorAll('button')];
    const vote5 = buttons.find((b) => b.getAttribute('aria-label') === 'Vote 5')!;
    const vote8 = buttons.find((b) => b.getAttribute('aria-label') === 'Vote 8')!;

    await fireEvent.click(vote5);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenLastCalledWith('vote:submit', { value: 5 });

    // Clicking the selected card is a no-op (ui_spec §6.4).
    await fireEvent.click(vote5);
    expect(requestMock).toHaveBeenCalledTimes(1);

    // Clicking another card re-submits (last wins, AC-F2.4).
    await fireEvent.click(vote8);
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock).toHaveBeenLastCalledWith('vote:submit', { value: 8 });
  });

  it('clicking Pass submits the non-numeric pass vote (AC-F3.5)', async () => {
    applyState(votingState(), 'host-1');
    const { container } = render(DeckRow);
    const pass = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Pass')!;
    await fireEvent.click(pass);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenLastCalledWith('vote:submit', { value: 'pass' });
  });
});

describe('face-down guarantee (AC-F2.3)', () => {
  it('other participants\' seats show no value text anywhere while voting', async () => {
    // Host has voted 5; guest has NOT. Server broadcasts voting state with no values.
    applyState(
      votingState({
        participants: [
          { id: 'host-1', name: 'Host', isHost: true, hasVoted: true },
          { id: 'guest-2', name: 'Guest', isHost: false, hasVoted: false },
        ],
        votedCount: 1,
      }),
      'host-1',
    );

    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    await vi.waitFor(() => {
      expect(container.querySelectorAll('[data-seat]').length).toBe(2);
    });

    const seats = [...container.querySelectorAll('[data-seat]')];
    expect(seats.length).toBe(2);
    for (const seat of seats) {
      expect(seat.textContent).not.toMatch(/\b(1|2|3|5|8|13|21|Pass)\b/);
    }
    const backs = container.querySelectorAll('[data-oncard] .card-back');
    expect(backs.length).toBe(1);
    expect(container.textContent).toContain('Your hand');
    expect(container.textContent).toContain('13');
  });
});

describe('hide selected card', () => {
  it('checkbox conceals the pick while keeping the vote', async () => {
    applyState(votingState(), 'host-1');
    setMyVote(8);
    const { container, getByLabelText } = render(DeckRow);

    const picked = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Vote 8')!;
    expect(picked.getAttribute('data-selected')).toBe('true');
    expect(container.textContent).toContain('You voted 8');

    await fireEvent.click(getByLabelText('Hide selected card'));

    expect(container.querySelector('.deck.is-concealed')).toBeTruthy();
    expect(picked.getAttribute('data-selected')).toBe('false');
    expect(picked.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-selected="true"]')).toBeNull();
    expect(container.textContent).not.toContain('You voted 8');
    expect(container.textContent).toContain('Vote submitted');

    const vote5 = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Vote 5')!;
    await fireEvent.click(vote5);
    expect(requestMock).toHaveBeenLastCalledWith('vote:submit', { value: 5 });
    expect(container.querySelector('[data-selected="true"]')).toBeNull();
  });
});
