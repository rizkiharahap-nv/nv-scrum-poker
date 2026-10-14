<script lang="ts">
  import { onMount } from 'svelte';
  import { connectRoom, disconnectRoom, rememberSession } from '../realtime/clientChannel';
  import { applyState } from '../store/room.svelte';
  import { getRememberedName, setRememberedName } from '../store/rememberedName';

  interface Props {
    token: string;
    onNavigate: (to: string) => void;
  }
  let { token, onNavigate }: Props = $props();

  let name = $state('');
  let joining = $state(false);
  let error = $state('');
  let roomGone = $state(false);

  onMount(() => {
    // Prefill from remembered name (AC-F1.5) — NEVER auto-submit (AC-F1.6).
    name = getRememberedName();
  });

  async function joinRoom(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      error = 'Enter a display name to join the room.';
      return;
    }
    if (trimmed.length > 24) {
      error = 'Display name must be 24 characters or fewer.';
      return;
    }
    error = '';
    roomGone = false;
    joining = true;

    // The join prompt always renders for a non-joined session (AC-F1.4 guest
    // isolation). room:join is sent over the SAME /ws connection (queued until
    // the socket opens).
    const channel = connectRoom(token);

    try {
      const ack = await channel.request('room:join', { roomId: token, name: trimmed });
      setRememberedName(trimmed);
      // Persist identity so a reload re-binds the same participant (AC-F5.5).
      if (ack.participantId) rememberSession(ack.roomId ?? token, ack.participantId);
      applyState(ack.state, ack.participantId);
      onNavigate(`/room/${ack.roomId ?? token}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (message.includes('ROOM_NOT_FOUND')) {
        error = 'This invite link is no longer valid.';
        roomGone = true;
      } else if (message.includes('NAME_INVALID')) {
        error = 'That name is not valid (1–24 characters).';
      } else {
        error = "Couldn't connect. Check your connection and try again.";
      }
      disconnectRoom();
      joining = false;
    }
  }
</script>

<div class="holdem">
  <main class="gate">
    <h1>You've been invited</h1>
    <p class="lead">
      Join the Scrum Hold'em Poker room to estimate the next story with your team.
    </p>
    <form novalidate onsubmit={joinRoom}>
      <label>
        <span>Display name</span>
        <input
          type="text"
          maxlength="24"
          autocomplete="name"
          placeholder="e.g. Maya"
          bind:value={name}
          aria-invalid={error ? 'true' : undefined}
        />
      </label>
      {#if error}
        <p role="alert" class="error">{error}</p>
      {/if}
      <button type="submit" class="primary" disabled={joining}>
        {joining ? 'Joining…' : 'Join room'}
      </button>
      {#if roomGone}
        <p class="fine">Rooms live only in server memory — a restart ends the invite.</p>
        <button type="button" class="btn-ghost" onclick={() => onNavigate('/')}>Create a new room</button>
      {/if}
    </form>
  </main>
</div>
