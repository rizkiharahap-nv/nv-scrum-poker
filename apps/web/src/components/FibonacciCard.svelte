<script lang="ts">
  import type { VoteValue } from '@scrum-poker/room';
  import { PASS_VOTE } from '@scrum-poker/room';
  import PlayingCard from './PlayingCard.svelte';

  interface Props {
    value: VoteValue;
    selected: boolean;
    fan: number;
    lift: number;
    onselect: (value: VoteValue) => void;
  }
  let { value, selected, fan, lift, onselect }: Props = $props();

  const isPass = $derived(value === PASS_VOTE);
  const label = $derived(isPass ? 'Pass' : `Vote ${value}`);
</script>

<button
  type="button"
  class="hand-card"
  class:selected
  aria-pressed={selected}
  aria-label={label}
  data-selected={selected}
  style:--fan="{fan}deg"
  style:--lift="{lift}px"
  onclick={() => onselect(value)}
>
  <PlayingCard {value} />
</button>
