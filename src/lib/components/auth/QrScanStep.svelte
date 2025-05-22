<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  export let videoElement: HTMLVideoElement | null = null; // For binding
  export let canvasElement: HTMLCanvasElement | null = null; // For binding
  export let qrScanError: string | null = null;
  export let isScanning: boolean = false; 
  export let mediaStreamActive: boolean = false; 

  const dispatch = createEventDispatcher();

  function switchToManual() {
    dispatch('manualinput');
  }

  function handleBack() {
    dispatch('back');
  }
</script>

<div id="qrScanImportSection" class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
  <h2 class="text-2xl font-semibold mb-4 text-gray-100">Scan QR Code to Import Key</h2>
  <p class="text-gray-300 mb-4">Point your camera at the QR code containing your encrypted account key.</p>
  <div class="relative w-full max-w-md mx-auto aspect-square bg-gray-700 rounded overflow-hidden mb-4">
    <!-- svelte-ignore a11y-media-has-caption -->
    <video bind:this={videoElement} class="w-full h-full object-cover" playsinline autoplay muted></video>
    {#if !isScanning && !qrScanError && !mediaStreamActive}
      <div class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
        <p class="text-gray-200">Initializing camera...</p>
      </div>
    {/if}
  </div>
  <canvas bind:this={canvasElement} class="hidden"></canvas>
  {#if qrScanError}
    <p class="text-red-400 mb-4">{qrScanError}</p>
  {/if}
  <div class="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:space-x-4 justify-center">
    <button
      class="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
      on:click={switchToManual}
    >
      Switch to Manual Input
    </button>
    <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded" on:click={handleBack}>Back</button>
  </div>
</div>
