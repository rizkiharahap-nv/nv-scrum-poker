/**
 * CR-2026-08-18-06 (AC-F1.2) — Landing room-create collision retry.
 *
 * The client draws a crypto-random 6-digit code and calls `room:create` over
 * the room channel. When the drawn code is already owned by a live room the
 * server acks ROOM_NOT_FOUND; the client must close the channel, draw a FRESH
 * code, reconnect, and retry — bounded to ≤5 attempts — then surface the
 * generic creation-error state (PRD AC-F1.2 / architecture §5).
 *
 * The server-side collision semantics (occupied code → ROOM_NOT_FOUND, never
 * overwrites) live in test/room-create.test.ts; this file proves the CLIENT
 * retry behavior the unit suite can't see.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import Landing from '../../apps/web/src/components/Landing.svelte';
import * as clientChannel from '../../apps/web/src/realtime/clientChannel';
import * as token from '../../apps/web/src/logic/token';

describe('Landing room-create collision retry (AC-F1.2, CR-2026-08-18-06)', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function rejectingChannel(code: string) {
    return {
      request: vi.fn().mockRejectedValue(new Error(`server error: ROOM_NOT_FOUND (${code})`)),
      setSession: vi.fn(),
    };
  }

  function okChannel(roomId: string) {
    return {
      request: vi.fn().mockResolvedValue({
        ok: true,
        roomId,
        participantId: `pid-${roomId}`,
        state: {
          roomId,
          phase: 'voting',
          participants: [{ id: `pid-${roomId}`, name: 'Maya', isHost: true, hasVoted: false }],
          votedCount: 0,
          totalCount: 1,
        },
      }),
      setSession: vi.fn(),
    };
  }

  async function submitCreate(name = 'Maya') {
    const input = (await screen.findByPlaceholderText('e.g. Maya')) as HTMLInputElement;
    await fireEvent.input(input, { target: { value: name } });
    await fireEvent.submit(input.closest('form')!);
  }

  it('on ROOM_NOT_FOUND, closes, draws a FRESH code, reconnects, and retries up to 5 times', async () => {
    // First two attempts collide; the third code is free.
    vi.spyOn(token, 'generateRoomCode')
      .mockReturnValueOnce('111111')
      .mockReturnValueOnce('222222')
      .mockReturnValueOnce('333333');
    const connectRoom = vi.spyOn(clientChannel, 'connectRoom');
    const disconnectRoom = vi.spyOn(clientChannel, 'disconnectRoom').mockImplementation(() => {});
    const onNavigate = vi.fn();

    let calls = 0;
    connectRoom.mockImplementation((code: string) => {
      calls += 1;
      if (calls <= 2) return rejectingChannel(code) as never;
      return okChannel(code) as never;
    });

    render(Landing, { props: { onNavigate } });
    await submitCreate();

    // connectRoom was called once per attempt, with a FRESH code each time.
    await vi.waitFor(() => expect(connectRoom).toHaveBeenCalledTimes(3));
    expect(connectRoom.mock.calls.map((c) => c[0])).toEqual(['111111', '222222', '333333']);
    // The channel was disconnected between attempts (either explicit catch or
    // the internal close in connectRoom) — no same-channel reuse.
    expect(disconnectRoom).toHaveBeenCalled();
    // Third attempt succeeded and navigated to the REAL room id.
    await vi.waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/room/333333'));
  });

  it('after 5 consecutive collisions, stops retrying and shows the generic creation error', async () => {
    vi.spyOn(token, 'generateRoomCode')
      .mockReturnValueOnce('000001')
      .mockReturnValueOnce('000002')
      .mockReturnValueOnce('000003')
      .mockReturnValueOnce('000004')
      .mockReturnValueOnce('000005');
    const connectRoom = vi.spyOn(clientChannel, 'connectRoom').mockImplementation((code: string) => rejectingChannel(code) as never);
    const disconnectRoom = vi.spyOn(clientChannel, 'disconnectRoom').mockImplementation(() => {});
    const onNavigate = vi.fn();

    render(Landing, { props: { onNavigate } });
    await submitCreate();

    // Bounded ≤5 — no 6th attempt.
    await vi.waitFor(() => expect(connectRoom).toHaveBeenCalledTimes(5));
    await vi.waitFor(() => expect(disconnectRoom).toHaveBeenCalledTimes(5));
    expect(onNavigate).not.toHaveBeenCalled();
    // Generic creation-error state surfaces (no dead-end, button re-enabled).
    await vi.waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain("Couldn't create room. Check your connection and try again."),
    );
    const submit = screen.getByRole('button', { name: 'New room' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });
});
