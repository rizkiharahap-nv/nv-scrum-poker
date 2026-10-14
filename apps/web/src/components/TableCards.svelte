<script lang="ts">
  import type { Participant, VoteValue } from '@scrum-poker/room';
  import PlayingCard from './PlayingCard.svelte';

  interface CardSpot {
    participant: Participant;
    value: VoteValue | undefined;
    left: number;
    top: number;
    rot: number;
  }

  interface Props {
    spots: CardSpot[];
    phase: 'voting' | 'revealed' | null;
  }
  let { spots, phase }: Props = $props();

  let flipping = $state(false);
  let showFace = $state(false);
  let prevPhase: Props['phase'] = null;

  $effect(() => {
    const current = phase;
    const fromVoting = prevPhase === 'voting' && current === 'revealed';
    prevPhase = current;

    if (current !== 'revealed') {
      flipping = false;
      showFace = false;
      return;
    }

    const reduce =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!fromVoting || reduce) {
      flipping = false;
      showFace = true;
      return;
    }

    flipping = true;
    showFace = false;
    const swap = setTimeout(() => {
      showFace = true;
    }, 170);
    const done = setTimeout(() => {
      flipping = false;
    }, 360);
    return () => {
      clearTimeout(swap);
      clearTimeout(done);
    };
  });
</script>

<div class="cards-layer">
  {#each spots as spot (spot.participant.id)}
    {#if spot.participant.hasVoted}
      <div
        class="oncard"
        data-oncard
        aria-hidden="true"
        style:left="{spot.left}%"
        style:top="{spot.top}%"
        style:--rot="{spot.rot}deg"
      >
        <div class="oncard-face" class:flip={flipping}>
          {#if showFace && phase === 'revealed' && spot.value !== undefined}
            <PlayingCard value={spot.value} />
          {:else}
            <div class="card-back"></div>
          {/if}
        </div>
      </div>
    {/if}
  {/each}
</div>
