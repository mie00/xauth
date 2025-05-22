<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function handleCreate() {
    dispatch('create');
  }

  function handleImport() {
    dispatch('import');
  }
</script>

<div id="createUserSection" class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
  <h2 class="text-2xl font-semibold mb-4 text-gray-100">Manage Your Account</h2>
  <p class="text-gray-300 mb-4">Create a new account or import an existing one.</p>
  <div class="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:space-x-4 justify-center">
    <button id="createUserButton" class="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded" on:click={handleCreate}>
      Create New Account
    </button>
    <button id="importKeyButton" class="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded" on:click={handleImport}>
      Import Account via QR
    </button>
  </div>
</div>
