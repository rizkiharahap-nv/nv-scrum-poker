<script lang="ts">
  import { onMount } from 'svelte';
  import Landing from './components/Landing.svelte';
  import Join from './components/Join.svelte';
  import Room from './components/Room.svelte';

  type Route =
    | { name: 'landing' }
    | { name: 'join'; token: string }
    | { name: 'room'; token: string };

  let route: Route = $state({ name: 'landing' });
  let currentPath = $state(window.location.pathname);

  function parsePath(path: string): Route {
    // Join route accepts exactly a 6-digit room code (AC-F1.2/F1.3, CR-2026-08-18-06).
    const m = path.match(/^\/r\/(\d{6})\/?$/);
    if (m && m[1]) return { name: 'join', token: m[1] };
    const m2 = path.match(/^\/room\/([^/]+)\/?$/);
    if (m2 && m2[1]) return { name: 'room', token: m2[1] };
    return { name: 'landing' };
  }

  function navigate(to: string): void {
    history.pushState({}, '', to);
    currentPath = to;
  }

  onMount(() => {
    const handlePop = () => {
      currentPath = window.location.pathname;
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  });

  $effect(() => {
    route = parsePath(currentPath);
  });
</script>

{#if route.name === 'landing'}
  <Landing onNavigate={navigate} />
{:else if route.name === 'join'}
  <Join token={route.token} onNavigate={navigate} />
{:else}
  <Room token={route.token} onNavigate={navigate} />
{/if}
