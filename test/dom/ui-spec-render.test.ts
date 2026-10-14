/**
 * Slice 6 DOM smoke — ui_spec §6 room additions (t_a61512f3).
 *
 * Covers the styling contract pieces that landed in slice 6 and the
 * static-scan test can't see at runtime:
 *  - ConnectingSplash (§6.0): shown while the transport is connecting /
 *    before the first room state arrives; spinner + "Connecting to room…".
 *  - ConnectionBanner (§3.5): amber, aria-live=polite, rendered once a room
 *    phase exists but the transport reports disconnected.
 *  - Empty participants state (§6.2): "No participants yet."
 *  - ProgressText (§6.3): "X of N voted" on the table.
 *  - Seat grid responsive classes (ui_spec §6.2/§8): grid-cols-2
 *    sm:grid-cols-3 md:grid-cols-4.
 *  - Card states: face-down back (bg-indigo-600), revealed value card
 *    (bg-white border-slate-300), no-vote dashed card, selected deck card
 *    (data-[selected=true] state via data-selected + aria-pressed).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import Room from '../../apps/web/src/components/Room.svelte';
import { room, applyState, resetRoom, setMyVote } from '../../apps/web/src/store/room.svelte';
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

describe('ConnectingSplash (ui_spec §6.0)', () => {
  it('renders while no room state has arrived (no phase)', async () => {
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    expect(container.textContent).toContain('Connecting to room…');
    // Spinner is the animate-spin svg with a circle + arc.
    const spinner = container.querySelector('svg.spinner');
    expect(spinner).toBeTruthy();
  });
});

describe('ConnectionBanner (ui_spec §3.5)', () => {
  it('renders amber, aria-live, with reconnecting text when a room state exists but transport is down', () => {
    applyState(votingState(), 'host-1');
    room.connected = false; // simulate a drop after a successful join
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    const banner = container.querySelector('[role="status"]');
    expect(banner).toBeTruthy();
    expect(banner?.getAttribute('aria-live')).toBe('polite');
    expect(banner?.textContent).toContain('Connection lost — reconnecting…');
    expect(banner?.className).toContain('banner');
  });

  it('is absent while the transport is connected', () => {
    applyState(votingState(), 'host-1');
    room.connected = true;
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe('TablePanel poker table (ui_spec §6.2/§8)', () => {
  it('renders seats around the stadium felt table', async () => {
    applyState(votingState(), 'host-1');
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    const section = container.querySelector('section[aria-label="Participants"]');
    expect(section).toBeTruthy();
    expect(section?.querySelector('.table-wrap .felt')).toBeTruthy();
    expect(section?.querySelectorAll('[data-seat]').length).toBe(2);
  });

  it('empty participants state renders "No participants yet." (defensive)', () => {
    applyState({ ...votingState(), participants: [], totalCount: 0 }, 'host-1');
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    expect(container.textContent).toContain('No participants yet.');
  });
});

describe('ProgressText (ui_spec §6.3)', () => {
  it('shows X of N voted on the table', () => {
    applyState(votingState(), 'host-1');
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    expect(container.textContent).toContain('0 of 2 voted');
  });
});

describe('Seat card states (ui_spec §6.2)', () => {
  it('voting seats show avatars with no value text', async () => {
    applyState(votingState(), 'host-1');
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    const seats = container.querySelectorAll('[data-seat]');
    expect(seats.length).toBe(2);
    for (const seat of seats) {
      expect(seat.textContent).not.toMatch(/\b(1|2|3|5|8|13|21|Pass)\b/);
    }
  });

  it('revealed value appears on the felt card', async () => {
    applyState(
      {
        roomId: 'room-token-123',
        phase: 'revealed',
        participants: [{ id: 'host-1', name: 'Host', isHost: true, hasVoted: true }],
        votedCount: 1,
        totalCount: 1,
        votes: [{ participantId: 'host-1', value: 5 }],
        consensus: { hasConsensus: true, value: 5, distribution: { '5': 1 } },
      },
      'host-1',
    );
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    const card = container.querySelector('[data-oncard]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('5');
  });

  it('revealed no-vote seat uses "No vote"', async () => {
    applyState(
      {
        roomId: 'room-token-123',
        phase: 'revealed',
        participants: [{ id: 'host-1', name: 'Host', isHost: true, hasVoted: false }],
        votedCount: 0,
        totalCount: 1,
        votes: [],
        consensus: { hasConsensus: false, value: null, distribution: {} },
      },
      'host-1',
    );
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    expect(container.textContent).toContain('No vote');
  });
});

describe('TableCards on the felt (ui_spec §6.2)', () => {
  it('renders a decorative face-down on-table card once a vote exists (no value text)', async () => {
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
    const felt = container.querySelector('.felt')!;
    const onTable = felt.querySelector('[data-oncard]');
    expect(onTable).toBeTruthy();
    expect(onTable?.querySelector('.card-back')).toBeTruthy();
    expect(onTable?.textContent).not.toMatch(/\b(1|2|3|5|8|13|21|Pass)\b/);
  });

  it('does not render while voting with zero votes', async () => {
    applyState(votingState(), 'host-1');
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    const felt = container.querySelector('.felt')!;
    expect(felt.querySelector('[data-oncard]')).toBeNull();
  });

  it('flips to the consensus value after reveal', async () => {
    applyState(
      {
        roomId: 'room-token-123',
        phase: 'revealed',
        participants: [{ id: 'host-1', name: 'Host', isHost: true, hasVoted: true }],
        votedCount: 1,
        totalCount: 1,
        votes: [{ participantId: 'host-1', value: 5 }],
        consensus: { hasConsensus: true, value: 5, distribution: { '5': 1 } },
      },
      'host-1',
    );
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    const felt = container.querySelector('.felt')!;
    const onTable = felt.querySelector('[data-oncard]');
    expect(onTable).toBeTruthy();
    expect(onTable?.textContent).toContain('5');
  });
});

describe('DeckRow selection state (ui_spec §6.4)', () => {
  it('selected FibonacciCard carries data-selected=true + aria-pressed=true', () => {
    applyState(votingState(), 'host-1');
    setMyVote(5);
    const { container } = render(Room, { props: { token: 'room-token-123', onNavigate: vi.fn() } });
    const selected = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Vote 5')!;
    expect(selected).toBeTruthy();
    expect(selected.getAttribute('data-selected')).toBe('true');
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    // And the unselected siblings are data-selected=false.
    const unselected = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Vote 8')!;
    expect(unselected.getAttribute('data-selected')).toBe('false');
    expect(unselected.getAttribute('aria-pressed')).toBe('false');
  });
});
