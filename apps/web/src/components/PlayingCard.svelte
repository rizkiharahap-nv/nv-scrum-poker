<script lang="ts">
  import type { VoteValue } from '@scrum-poker/room';
  import { PASS_VOTE } from '@scrum-poker/room';

  interface Props {
    value: VoteValue;
  }
  let { value }: Props = $props();

  const SUITS: Record<number, string> = { 1: '♠', 2: '♥', 3: '♣', 5: '♦', 8: '♠', 13: '♥', 21: '♣' };
  const isPass = $derived(value === PASS_VOTE);
  const suit = $derived(isPass ? '' : (SUITS[value as number] ?? '♠'));
  const suitClass = $derived(suit === '♥' || suit === '♦' ? 'red' : 'black');
  const label = $derived(isPass ? '☕' : String(value));
</script>

{#if isPass}
  <div class="card-front pass" title="Pass">
    <span class="value black" aria-label="Pass">{label}</span>
  </div>
{:else}
  <div class="card-front">
    <span class="corner {suitClass}">{suit}</span>
    <span class="value {suitClass}">{label}</span>
    <span class="corner br {suitClass}">{suit}</span>
  </div>
{/if}
