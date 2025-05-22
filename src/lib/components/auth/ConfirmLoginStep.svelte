<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let callbackUrl: string = '';

  const dispatch = createEventDispatcher();

  function confirm() {
    dispatch('confirm');
  }

  function cancel() {
    dispatch('cancel');
  }
</script>

<div class="p-6 bg-white shadow-md rounded-lg text-center">
  <h2 class="text-xl font-semibold mb-4 text-gray-700">Confirm Login</h2>
  <p class="mb-2 text-gray-600">An application is requesting to log in with your identity.</p>
  <p class="mb-1 text-gray-600">Callback URL:</p>
  <p class="mb-6 text-sm font-mono bg-gray-100 p-2 rounded break-all">{callbackUrl}</p>
  
  <p class="mb-6 text-gray-600">Do you want to allow this application to log in?</p>

  <div class="flex justify-center space-x-4">
    <button 
      on:click={confirm}
      class="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
    >
      Confirm Login
    </button>
    <button 
      on:click={cancel}
      class="px-6 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-opacity-50"
    >
      Cancel
    </button>
  </div>
</div>
