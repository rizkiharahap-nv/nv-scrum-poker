<script lang="ts">
  import { onMount } from 'svelte';
  import { generateRoomCode } from '../logic/token';
  import { connectRoom, disconnectRoom, rememberSession } from '../realtime/clientChannel';
  import { applyState } from '../store/room.svelte';
  import { getRememberedName, setRememberedName } from '../store/rememberedName';

  interface Props {
    onNavigate: (to: string) => void;
  }
  let { onNavigate }: Props = $props();

  let name = $state('');
  let creating = $state(false);
  let error = $state('');

  /** Max `room:create` attempts before surfacing the generic error (AC-F1.2). */
  const MAX_CREATE_ATTEMPTS = 5;

  onMount(() => {
    name = getRememberedName();
  });

  async function createRoom(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      error = 'Enter a display name to create a room.';
      return;
    }
    if (trimmed.length > 24) {
      error = 'Display name must be 24 characters or fewer.';
      return;
    }
    error = '';
    creating = true;

    // Client-side crypto-random 6-digit room code (AC-F1.2): the DO id must
    // exist before the first message, so the code is generated here
    // (Cloudflare path). Each attempt draws a FRESH code and reconnects with
    // it; an occupied code acks ROOM_NOT_FOUND and we retry (bounded ≤5).
    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt++) {
      const code = generateRoomCode();
      // connectRoom connects immediately; the transport queues room:create
      // until the socket opens (no dropped frames).
      const channel = connectRoom(code);

      try {
        const ack = await channel.request('room:create', { name: trimmed });
        setRememberedName(trimmed);
        // On the Node test adapter the server generates the room id; on
        // Cloudflare it equals the code. Either way the invite URL uses the
        // REAL room id.
        const roomId = ack.roomId ?? code;
        // Persist identity so a reload re-binds the same participant (AC-F5.5).
        if (ack.participantId) rememberSession(roomId, ack.participantId);
        applyState(ack.state, ack.participantId);
        onNavigate(`/room/${roomId}`);
        return;
      } catch (e) {
        const message = e instanceof Error ? e.message : '';
        disconnectRoom();
        if (message.includes('ROOM_NOT_FOUND') && attempt < MAX_CREATE_ATTEMPTS) {
          // The drawn code is already owned by a live room — close the
          // channel, draw a fresh code, reconnect, and retry (AC-F1.2).
          continue;
        }
        error = message.includes('ROOM_NOT_FOUND')
          ? "Couldn't create room. Check your connection and try again."
          : e instanceof Error
            ? e.message
            : "Couldn't create room. Check your connection and try again.";
        creating = false;
        return;
      }
    }
    // Loop exhausted (≤5 attempts all collided) — generic creation error.
    error = "Couldn't create room. Check your connection and try again.";
    creating = false;
  }
</script>

<div class="holdem">
  <main class="gate">
    <h1>Scrum <span class="brand-accent">Hold'em</span> Poker</h1>
    <p class="lead">
      Estimate sprint tickets together. Create a room, share the link, and vote in secret — then reveal as a team.
    </p>
    <form novalidate onsubmit={createRoom}>
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
      <button type="submit" class="primary" disabled={creating}>
        {creating ? 'Creating room…' : 'New room'}
      </button>
    </form>
    <p class="fine">No account needed. Rooms are live sessions only.</p>
  </main>
</div>
