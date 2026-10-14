<script lang="ts">
  import type { Participant, VoteValue } from '@scrum-poker/room';
  import { initials } from '../lib/seatGeometry';

  interface Props {
    participant: Participant;
    value: VoteValue | undefined;
    phase: 'voting' | 'revealed' | null;
    isSelf: boolean;
    left: number;
    top: number;
    hue: number;
  }
  let { participant, value, phase, isSelf, left, top, hue }: Props = $props();

  const noVote = $derived(phase === 'revealed' && value === undefined);
</script>

<div
  data-seat
  class="seat"
  class:is-host={participant.isHost}
  class:is-self={isSelf}
  class:voted={participant.hasVoted}
  style:left="{left}%"
  style:top="{top}%"
  style:--hue={hue}
>
  <div class="avatar">{initials(participant.name)}</div>
  <div class="plate">
    <span class="name" title={participant.name}>{participant.name}</span>
  </div>
  {#if participant.isHost}
    <span class="tag host">Host</span>
  {/if}
  {#if isSelf}
    <span class="tag you">You</span>
  {/if}
  {#if noVote}
    <span class="tag novote">No vote</span>
  {/if}
</div>
