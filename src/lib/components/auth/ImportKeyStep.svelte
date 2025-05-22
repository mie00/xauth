<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let wrappedKeyForImport: string = ''; // Bound from parent
  export let passwordInput: string = ''; // Bound from parent
  export let errorMessage: string | null = null; 
  export let qrScanErrorMessage: string | null = null; 
  export let qrDataLoaded: boolean = false; 

  const dispatch = createEventDispatcher();

  function handleSubmit() {
    // Parent's values are already updated due to binding
    dispatch('submit');
  }

  function handleBack() {
    dispatch('back');
  }
</script>

<div id="importKeyDataSection" class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
  <h2 class="text-2xl font-semibold mb-4 text-gray-100">Import Account Key</h2>
  {#if qrDataLoaded && !qrScanErrorMessage}
    <p class="text-gray-300 mb-1">QR code data loaded. Now enter your password.</p>
  {:else if qrScanErrorMessage}
    <p class="text-gray-300 mb-1">Camera failed or not available. Paste your wrapped key data and enter password.</p>
  {:else}
    <p class="text-gray-300 mb-1">Paste your wrapped key data (JSON text from backup) and enter the password you used to encrypt it.</p>
  {/if}
  <p class="text-gray-400 mb-4 text-sm">Ensure the key data below is correct before proceeding.</p>
  <textarea
    bind:value={wrappedKeyForImport}
    placeholder="Paste wrapped key JSON here, or it will appear after QR scan"
    class="w-full p-2 mb-4 bg-gray-700 text-gray-100 rounded border border-gray-600 focus:ring-indigo-500 focus:border-indigo-500 h-32"
    readonly={qrDataLoaded && !qrScanErrorMessage}
  ></textarea>
  <input
    type="password"
    bind:value={passwordInput}
    placeholder="Enter password for this key"
    class="w-full p-2 mb-4 bg-gray-700 text-gray-100 rounded border border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
  />
  {#if errorMessage}
    <p class="text-red-400 mb-4">{errorMessage}</p>
  {/if}
  <div class="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:space-x-4 justify-center">
    <button
      class="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded"
      on:click={handleSubmit}
      disabled={!passwordInput || !wrappedKeyForImport}
    >
      Import Account
    </button>
    <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded" on:click={handleBack}>Back</button>
  </div>
</div>
