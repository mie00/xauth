<script lang="ts">
  import { onMount } from 'svelte';
  import "./style.css"; // Global styles
  import AuthFlow from './lib/components/AuthFlow.svelte';
  import LoginFlow from './lib/components/LoginFlow.svelte';
  import LoadingSpinner from './lib/components/auth/LoadingSpinner.svelte';

  type ViewState = 'loading' | 'authFlow' | 'loginFlow';

  let currentView: ViewState = $state('loading');
  let rawCallbackParam: string | null = $state(null);
  let loginPayloadData: string | null = $state(null);

  onMount(async () => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    if (path === '/login') {
      rawCallbackParam = params.get('callback');
      loginPayloadData = params.get('payload'); // Read the 'payload' query parameter
      currentView = 'loginFlow';
    } else {
      currentView = 'authFlow';
    }
  });
</script>

<main class="container p-4 max-w-md flex flex-col items-center">
  {#if currentView === 'loading'}
    <LoadingSpinner />
    <p class="mt-4 text-center text-gray-600">Initializing...</p>
  {:else if currentView === 'loginFlow'}
    <LoginFlow {rawCallbackParam} {loginPayloadData} />
  {:else if currentView === 'authFlow'}
    <AuthFlow />
  {/if}
</main>
