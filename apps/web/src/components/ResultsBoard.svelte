<script lang="ts">
  import type { VoteValue } from '@scrum-poker/room';
  import { room } from '../store/room.svelte';
  import PlayingCard from './PlayingCard.svelte';

  type Snapshot = {
    hasConsensus: boolean;
    value: VoteValue | null;
    votedCount: number;
    distribution: Record<string, number>;
  };

  function capture(): Snapshot | null {
    if (room.phase !== 'revealed') return null;
    return {
      hasConsensus: Boolean(room.consensus?.hasConsensus),
      value: (room.consensus?.value as VoteValue | null) ?? null,
      votedCount: room.votedCount,
      distribution: { ...(room.consensus?.distribution ?? {}) },
    };
  }

  let open = $state(false);
  let snapshot = $state<Snapshot | null>(capture());

  $effect(() => {
    if (room.phase === 'revealed') {
      snapshot = capture();
      open = false;
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => {
          open = true;
        });
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    open = false;
    const hide = setTimeout(() => {
      snapshot = null;
    }, 400);
    return () => clearTimeout(hide);
  });

  const entries = $derived(
    Object.entries(snapshot?.distribution ?? {})
      .map(([value, count]) => ({
        value: Number(value) as VoteValue,
        count,
        key: `${value}×${count}`,
      }))
      .sort((a, b) => b.count - a.count || Number(a.value) - Number(b.value)),
  );
  const max = $derived(Math.max(1, ...entries.map((e) => e.count)));
  const numericTotal = $derived(entries.reduce((sum, e) => sum + e.count, 0));
  const agreePct = $derived(
    numericTotal > 0 ? Math.round((entries.reduce((m, e) => Math.max(m, e.count), 0) / numericTotal) * 100) : 0,
  );

  function barHeight(count: number): number {
    return 12 + Math.round((count / max) * 52);
  }
</script>

<aside
  class="results"
  class:is-open={open}
  aria-live="polite"
  aria-label="Round result"
  aria-hidden={!open}
>
  <div class="results-handle" aria-hidden="true"></div>
  {#if snapshot}
    {#if snapshot.hasConsensus}
      <p class="results-title ok">Consensus</p>
      <p class="results-sub">Estimated at {snapshot.value}</p>
      <p class="results-fine">All {snapshot.votedCount} votes matched.</p>
    {:else}
      <p class="results-title no">No consensus yet</p>
      <p class="results-sub">Discuss the spread, then re-vote.</p>
    {/if}

    <div class="results-row">
      <div class="spread">
        {#each entries as entry (entry.key)}
          <div class="spread-col" data-dist={entry.key}>
            <div class="spread-bar" style:--h="{barHeight(entry.count)}px"></div>
            <div class="spread-card">
              <PlayingCard value={entry.value} />
            </div>
            <p class="spread-count">
              {entry.count === 1 ? '1 vote' : `${entry.count} votes`}
            </p>
          </div>
        {/each}
      </div>
      {#if numericTotal > 0}
        <div class="agree">
          <p class="agree-label">Agreement</p>
          <div class="agree-ring" style:--pct={agreePct}><span>{agreePct}%</span></div>
        </div>
      {/if}
    </div>
  {/if}
</aside>
