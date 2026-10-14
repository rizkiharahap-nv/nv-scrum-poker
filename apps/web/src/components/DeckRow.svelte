<script lang="ts">
  import type { VoteValue } from '@scrum-poker/room';
  import { DECK, PASS_VOTE } from '@scrum-poker/room';
  import FibonacciCard from './FibonacciCard.svelte';
  import { room, setMyVote } from '../store/room.svelte';
  import { getChannel } from '../realtime/clientChannel';
  import { fanFor } from '../lib/seatGeometry';

  let submitting = $state(false);
  let hideSelected = $state(false);
  const hand = $derived([...DECK, PASS_VOTE] as VoteValue[]);

  async function select(value: VoteValue): Promise<void> {
    if (room.phase !== 'voting') return;
    if (room.myVote === value) return;
    if (submitting) return;
    submitting = true;
    try {
      const channel = getChannel();
      if (!channel) return;
      await channel.request('vote:submit', { value });
      setMyVote(value);
    } catch {
      // Ack error — broadcast state is truth.
    } finally {
      submitting = false;
    }
  }

  const hint = $derived(
    room.phase === 'revealed'
      ? 'Cards are revealed. Re-vote on the table to start a new round.'
      : room.myVote === null
        ? 'Pick a card to vote — your card lands face-down on the table.'
        : hideSelected
          ? 'Vote submitted. Click another card to change it.'
          : room.myVote === PASS_VOTE
            ? 'You voted Pass. Click another card to change it.'
            : `You voted ${room.myVote}. Click another card to change it.`,
  );
</script>

<div class="deck" class:is-concealed={hideSelected}>
  <div class="deck-head">
    <p class="deck-label">Your hand</p>
    <label class="hide-pick">
      <input type="checkbox" bind:checked={hideSelected} />
      Hide selected card
    </label>
  </div>
  <div class="hand">
    {#each hand as value, i}
      {@const fan = fanFor(i, hand.length)}
      <FibonacciCard
        {value}
        selected={!hideSelected && room.myVote === value}
        fan={fan.fan}
        lift={fan.lift}
        onselect={select}
      />
    {/each}
  </div>
  <p class="deck-hint">{hint}</p>
</div>
