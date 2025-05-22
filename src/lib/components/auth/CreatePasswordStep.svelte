<script lang="ts">
  let { 
    passwordInput = $bindable(''), 
    errorMessage = null,
    onsubmit,
    onback
  }: {
    passwordInput: string,
    errorMessage: string | null,
    onsubmit: () => void,
    onback: () => void
  } = $props();

</script>

<div id="enterPasswordCreateSection" class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
  <h2 class="text-2xl font-semibold mb-4 text-gray-100">Create New Account</h2>
  <p class="text-gray-300 mb-4">Enter a strong password to secure your new account key. This password will be required to export/import your key.</p>
  <input
    type="password"
    bind:value={passwordInput}
    placeholder="Enter password"
    class="w-full p-2 mb-4 bg-gray-700 text-gray-100 rounded border border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
  />
  {#if errorMessage}
    <p class="text-red-400 mb-4">{errorMessage}</p>
  {/if}
  <div class="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:space-x-4 justify-center">
    <button
      class="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
      onclick={onsubmit}
      disabled={!passwordInput}
    >
      Create Account & Get QR Key
    </button>
    <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded" onclick={onback}>Back</button>
  </div>
</div>
