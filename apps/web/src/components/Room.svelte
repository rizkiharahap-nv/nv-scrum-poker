<script lang="ts">
  import { onMount } from 'svelte';
  import { getChannel, resumeRoom } from '../realtime/clientChannel';
  import { room } from '../store/room.svelte';
  import { getStoredSession } from '../store/session';
  import DeckRow from './DeckRow.svelte';
  import ParticipantSeat from './ParticipantSeat.svelte';
  import ResultsBoard from './ResultsBoard.svelte';
  import TableCards from './TableCards.svelte';
  import type { VoteValue } from '@scrum-poker/room';
  import {
    anchorIndex,
    feltGeometry,
    geometry,
    hueFor,
    placeCardPct,
    placeSeatPct,
  } from '../lib/seatGeometry';
  import { cueForTransition, playTableCue, unlockTableAudio, type TablePhase } from '../lib/tableAudio';

  interface Props {
    token: string;
    onNavigate: (to: string) => void;
  }
  let { token, onNavigate }: Props = $props();

  let inviteUrl = $state('');
  let copied = $state(false);
  let copyFailed = $state(false);
  let resuming = $state(false);
  let sessionLost = $state(false);
  let slowConnect = $state(false);
  let revealing = $state(false);
  let resetting = $state(false);
  let wrapEl = $state<HTMLDivElement | null>(null);
  let wrapW = $state(0);
  let wrapH = $state(0);

  const lost = $derived(sessionLost || room.sessionLost);
  const connecting = $derived(!lost && (resuming || !room.phase));

  let prevAudioPhase: TablePhase = null;

  $effect(() => {
    const next = room.phase;
    const cue = cueForTransition(prevAudioPhase, next, room.consensus?.hasConsensus);
    prevAudioPhase = next;
    if (cue) playTableCue(cue);
  });

  onMount(() => {
    const unlock = () => unlockTableAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  });

  onMount(() => {
    inviteUrl = `${window.location.origin}/r/${token}`;
    const slowTimer = setTimeout(() => {
      slowConnect = true;
    }, 3000);

    const existing = getChannel();
    const stored = getStoredSession();

    // Live room already mirrored in the store (create/join just navigated here).
    if (existing && room.phase) {
      return () => clearTimeout(slowTimer);
    }

    // Always resume when we have a stored identity — even if a leftover
    // channel exists (Vite remount / server restart). Skipping resume here
    // is what left the "Connecting to room…" splash spinning forever.
    if (stored && stored.roomId === token) {
      resuming = true;
      resumeRoom(stored.roomId, stored.participantId)
        .then(() => {
          resuming = false;
        })
        .catch(() => {
          resuming = false;
          sessionLost = true;
        });
      return () => clearTimeout(slowTimer);
    }

    if (existing) {
      return () => clearTimeout(slowTimer);
    }

    onNavigate(`/r/${token}`);
    return () => clearTimeout(slowTimer);
  });

  $effect(() => {
    if (!wrapEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      wrapW = box.width;
      wrapH = box.height;
    });
    ro.observe(wrapEl);
    wrapW = wrapEl.offsetWidth;
    wrapH = wrapEl.offsetHeight;
    return () => ro.disconnect();
  });

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      copied = true;
      copyFailed = false;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copyFailed = true;
      copied = false;
      setTimeout(() => (copyFailed = false), 2000);
    }
  }

  async function reveal(): Promise<void> {
    if (revealing) return;
    revealing = true;
    try {
      const channel = getChannel();
      if (!channel) return;
      await channel.request('room:reveal', {});
    } catch {
      // Ack error — broadcast state is truth.
    } finally {
      revealing = false;
    }
  }

  async function reset(): Promise<void> {
    if (resetting) return;
    resetting = true;
    try {
      const channel = getChannel();
      if (!channel) return;
      await channel.request('room:reset', {});
    } catch {
      // Ack error — broadcast state is truth.
    } finally {
      resetting = false;
    }
  }

  function seatValue(participantId: string): VoteValue | undefined {
    return room.votes?.find((v) => v.participantId === participantId)?.value;
  }

  const layout = $derived.by(() => {
    const people = room.participants;
    const n = people.length;
    const anchor = anchorIndex(people);
    const seatG = geometry(wrapW, wrapH);
    const cardG = feltGeometry(wrapW, wrapH);
    return people.map((p, i) => ({
      participant: p,
      value: seatValue(p.id),
      hue: hueFor(p.name),
      seat: placeSeatPct(i, n, seatG, anchor),
      card: placeCardPct(i, n, cardG, anchor),
    }));
  });
</script>

<div class="holdem">
  <header class="topbar">
    <div class="brand">
      <span class="logo">🂠</span>
      <span class="brand-name">Scrum <span class="brand-accent">Hold'em</span> Poker</span>
      {#if room.phase}
        <span class="badge {room.phase === 'voting' ? 'voting' : 'revealed'}">
          <span class="dot"></span>
          {room.phase === 'voting' ? 'Voting' : 'Revealed'}
        </span>
      {/if}
    </div>
    <div class="invite">
      <span class="invite-url">{inviteUrl}</span>
      <button type="button" class="btn-ghost" aria-label="Copy invite link" onclick={copyLink}>
        {copied ? 'Copied!' : copyFailed ? 'Copy failed' : 'Copy link'}
      </button>
    </div>
  </header>

  <main class="stage">
    {#if room.phase && !room.connected}
      <div role="status" aria-live="polite" class="banner">
        Connection lost — reconnecting…
      </div>
    {/if}

    {#if connecting}
      <div class="gate">
        <svg class="spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" opacity="0.25" />
          <path fill="currentColor" opacity="0.75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <p class="lead">Connecting to room…</p>
        {#if slowConnect}
          <p class="fine">If you just restarted the server, this room no longer exists.</p>
          <button type="button" class="primary" onclick={() => onNavigate('/')}>Create a new room</button>
        {/if}
      </div>
    {:else if lost}
      <section aria-label="Session expired" class="gate">
        <p class="lead">This room is no longer available.</p>
        <p class="fine">Restarting the server wipes in-memory rooms. Create a new one to keep playing.</p>
        <button type="button" class="primary" onclick={() => onNavigate('/')}>Create a new room</button>
      </section>
    {:else}
      <section aria-label="Participants">
        {#if room.participants.length === 0}
          <p class="lead">No participants yet.</p>
        {:else}
          <div class="table-wrap" bind:this={wrapEl}>
            <div class="table">
              <div class="felt">
                <div class="center">
                  {#if room.phase === 'voting'}
                    <p class="progress" aria-live="polite">
                      <b>{room.votedCount}</b> of <b>{room.totalCount}</b> voted
                    </p>
                    <button
                      type="button"
                      class="chip-btn"
                      disabled={room.votedCount === 0 || revealing}
                      title={room.votedCount === 0 ? 'No votes yet' : undefined}
                      onclick={reveal}
                    >
                      <span>{revealing ? '…' : 'Reveal'}</span>
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="chip-btn"
                      disabled={resetting}
                      onclick={reset}
                    >
                      <span>{resetting ? '…' : 'Re-vote'}</span>
                    </button>
                  {/if}
                </div>
                <TableCards
                  phase={room.phase}
                  spots={layout.map((row) => ({
                    participant: row.participant,
                    value: row.value,
                    left: row.card.left,
                    top: row.card.top,
                    rot: row.card.rot,
                  }))}
                />
              </div>
            </div>
            <div class="seats-layer">
              {#each layout as row (row.participant.id)}
                <ParticipantSeat
                  participant={row.participant}
                  value={row.value}
                  phase={room.phase}
                  isSelf={row.participant.id === room.selfId}
                  left={row.seat.left}
                  top={row.seat.top}
                  hue={row.hue}
                />
              {/each}
            </div>
          </div>
        {/if}
      </section>

      {#if room.phase === 'voting' || room.phase === 'revealed'}
        <DeckRow />
        <ResultsBoard />
      {/if}
    {/if}
  </main>
</div>
