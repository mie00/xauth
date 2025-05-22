<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  export let errorMessage: string | null;
  const dispatch = createEventDispatcher();

  function handleTryAgain() {
    dispatch('tryagain');
  }
</script>

<div class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
  <h2 class="text-2xl font-semibold mb-4 text-red-400">Authentication Error</h2>
  <p class="text-gray-300 mb-4">{errorMessage || "An unexpected error occurred."}</p>
  <div class="flex justify-center">
    <button class="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded" on:click={handleTryAgain}>Try Again</button>
  </div>
</div>
