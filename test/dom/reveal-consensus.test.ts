/**
 * Slice 5 DOM test — reveal + consensus + re-vote UI
 * (t_b15998bd; PRD AC-F3.1..F3.5, AC-F4.1..F4.3).
 *
 * - Reveal button is visible to EVERY participant during voting (AC-F3.1) and
 *   disabled while zero votes are submitted (AC-F3.4).
 * - Clicking Reveal sends `room:reveal`; clicking Re-vote sends `room:reset`
 *   (wire contract exercised end-to-end in test/consensus.test.ts).
 * - After a revealed state: seats show face-up values (AC-F3.3), Pass renders
 *   as "Pass" (AC-F3.5), no-vote seats show "No vote", consensus banner shows
 *   "Consensus — Estimated at v" (AC-F4.1) or no-consensus + distribution +
 *   Re-vote (AC-F4.2).
 * - Re-vote button is present for any participant (AC-F4.3) and a reset state
 *   returns seats to face-down with the deck row back.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import Room from '../../apps/web/src/components/Room.svelte';
import TableCards from '../../apps/web/src/components/TableCards.svelte';
import { room, applyState, resetRoom } from '../../apps/web/src/store/room.svelte';
import * as clientChannel from '../../apps/web/src/realtime/clientChannel';
import type { RoomState } from '@scrum-poker/room';

let requestMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  cleanup();
  resetRoom();
  vi.unstubAllGlobals();
  requestMock = vi.fn().mockResolvedValue({ ok: true });
  vi.spyOn(clientChannel, 'getChannel').mockReturnValue({ request: requestMock } as never);
});

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

function revealedState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomId: 'room-token-123',
    phase: 'revealed',
    participants: [
      { id: 'host-1', name: 'Host', isHost: true, hasVoted: true },
      { id: 'guest-2', name: 'Guest', isHost: false, hasVoted: true },
    ],
    votedCount: 2,
    totalCount: 2,
    votes: [
      { participantId: 'host-1', value: 5 },
      { participantId: 'guest-2', value: 8 },
    ],
    consensus: { hasConsensus: false, value: null, distribution: { '5': 1, '8': 1 } },
    ...overrides,
  };
}

const seatSelector = '[data-seat]';

describe('Reveal button (AC-F3.1, AC-F3.4)', () => {
  it('is visible+enabled for EVERY participant during voting once ≥1 vote exists', async () => {
    applyState(votingState({ votedCount: 1 }), 'guest-2'); // guest view
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    await vi.waitFor(() => {
      expect(container.querySelectorAll(seatSelector).length).toBe(2);
    });
    const reveal = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Reveal')!;
    expect(reveal).toBeTruthy();
    expect(reveal.hasAttribute('disabled')).toBe(false);
  });

  it('is disabled while zero votes are submitted (AC-F3.4)', async () => {
    applyState(votingState({ votedCount: 0 }), 'host-1');
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    await vi.waitFor(() => {
      expect(container.querySelectorAll(seatSelector).length).toBe(2);
    });
    const reveal = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Reveal')!;
    expect(reveal).toBeTruthy();
    expect(reveal.hasAttribute('disabled')).toBe(true);
    expect(reveal.getAttribute('title')).toBe('No votes yet');
  });

  it('clicking Reveal sends room:reveal once', async () => {
    applyState(votingState({ votedCount: 1 }), 'host-1');
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    await vi.waitFor(() => {
      expect(container.querySelectorAll(seatSelector).length).toBe(2);
    });
    const reveal = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Reveal')!;
    await fireEvent.click(reveal);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenLastCalledWith('room:reveal', {});
  });
});

describe('revealed phase (AC-F3.2/F3.3, AC-F3.5, AC-F4.1/F4.2)', () => {
  it('shows face-up values on every seat, Pass renders as Pass, no-vote renders No vote', async () => {
    applyState(
      revealedState({
        participants: [
          { id: 'host-1', name: 'Host', isHost: true, hasVoted: true },
          { id: 'guest-2', name: 'Guest', isHost: false, hasVoted: true },
          { id: 'spectator-3', name: 'Spectator', isHost: false, hasVoted: false },
        ],
        votedCount: 2,
        totalCount: 3,
        votes: [
          { participantId: 'host-1', value: 5 },
          { participantId: 'guest-2', value: 'pass' as const },
        ],
        consensus: { hasConsensus: false, value: null, distribution: { '5': 1 } },
      }),
      'host-1',
    );
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });

    expect(container.querySelectorAll('[data-oncard] .card-front').length).toBe(2);
    expect(container.textContent).toContain('5');
    expect(container.textContent).toContain('☕');
    expect(container.textContent).toContain('No vote');
    expect(container.querySelectorAll('[data-oncard] .card-back').length).toBe(0);
    expect(container.querySelectorAll(seatSelector).length).toBe(3);
  });

  it('all-equal reveal shows Consensus — Estimated at v (AC-F4.1)', async () => {
    applyState(
      revealedState({
        votes: [
          { participantId: 'host-1', value: 5 },
          { participantId: 'guest-2', value: 5 },
        ],
        consensus: { hasConsensus: true, value: 5, distribution: { '5': 2 } },
      }),
      'host-1',
    );
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    expect(container.textContent).toContain('Consensus');
    expect(container.textContent).toContain('Estimated at 5');
    expect(container.textContent).toContain('All 2 votes matched.');
    expect(container.querySelector('[data-dist="5×2"]')).toBeTruthy();
    expect(container.textContent).toContain('2 votes');
  });

  it('mixed reveal shows No consensus + distribution chips + Re-vote (AC-F4.2/F4.3)', async () => {
    applyState(revealedState(), 'guest-2'); // guest view — re-vote is ANY participant
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    expect(container.textContent).toContain('No consensus yet');
    expect(container.textContent).toContain('Discuss the spread, then re-vote.');
    expect(container.querySelector('[data-dist="5×1"]')).toBeTruthy();
    expect(container.querySelector('[data-dist="8×1"]')).toBeTruthy();
    expect(container.textContent).toContain('Your hand');

    const reVote = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Re-vote')!;
    expect(reVote).toBeTruthy();
    expect(reVote.hasAttribute('disabled')).toBe(false);
    await fireEvent.click(reVote);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenLastCalledWith('room:reset', {});
  });

  it('reset broadcast returns to voting: seats face-down again, deck row back, result panel gone', async () => {
    applyState(
      revealedState({
        phase: 'voting',
        participants: [
          { id: 'host-1', name: 'Host', isHost: true, hasVoted: false },
          { id: 'guest-2', name: 'Guest', isHost: false, hasVoted: false },
        ],
        votedCount: 0,
        totalCount: 2,
        votes: undefined,
        consensus: undefined,
      }),
      'host-1',
    );
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    await vi.waitFor(() => {
      expect(container.querySelectorAll(seatSelector).length).toBe(2);
    });
    // Deck row back, result panel gone, Reveal control back (disabled — 0 votes).
    expect(container.textContent).toContain('Your hand');
    expect(container.textContent).not.toContain('No consensus yet');
    expect(container.textContent).not.toContain('Estimated at');
    const reveal = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Reveal')!;
    expect(reveal).toBeTruthy();
    expect(reveal.hasAttribute('disabled')).toBe(true);
  });
});

describe('felt card flip on reveal', () => {
  it('squashes the card back then shows the face when voting becomes revealed', async () => {
    const spots = [
      {
        participant: { id: 'host-1', name: 'Host', isHost: true, hasVoted: true },
        value: 8 as const,
        left: 50,
        top: 50,
        rot: 0,
      },
    ];
    const { container, rerender } = render(TableCards, { props: { spots, phase: 'voting' } });
    expect(container.querySelector('[data-oncard] .card-back')).toBeTruthy();

    await rerender({ spots, phase: 'revealed' });
    expect(container.querySelector('.oncard-face.flip')).toBeTruthy();
    expect(container.querySelector('[data-oncard] .card-back')).toBeTruthy();

    await vi.waitFor(() => {
      expect(container.querySelector('[data-oncard] .card-front')).toBeTruthy();
    });
  });
});
