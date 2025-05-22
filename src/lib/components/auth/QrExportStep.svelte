<script lang="ts">
  const { qrCodeImageDataUrl, wrappedKeyForExport, ondone, onbacktostart }: 
    { qrCodeImageDataUrl: string | null, wrappedKeyForExport: string | null, ondone: () => void, onbacktostart: () => void } = $props();
</script>

<div id="qrExportSection" class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
  <h2 class="text-2xl font-semibold mb-4 text-gray-100">Your Account Key - Save Securely!</h2>
  <p class="text-gray-300 mb-2">Scan this QR code with a secure QR app or copy the text below. Store it safely. This is your encrypted private key.</p>
  <p class="text-amber-400 mb-4 text-sm">You will need this QR code (or text) AND your password to recover your account on other devices.</p>
  {#if qrCodeImageDataUrl}
    <img src={qrCodeImageDataUrl} alt="Account Key QR Code" class="mx-auto my-4 border-4 border-white rounded"/>
  {:else}
    <p class="text-gray-400">Generating QR code...</p>
  {/if}
  <textarea
    readonly
    value={wrappedKeyForExport || ''}
    class="w-full p-2 mt-4 bg-gray-700 text-gray-200 rounded border border-gray-600 h-32 text-xs"
    placeholder="Wrapped key data will appear here..."
  ></textarea>
  <div class="mt-6 flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:space-x-4 justify-center">
    <button class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded" onclick={ondone}>
      Done, I've Saved My Key
    </button>
     <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded" onclick={onbacktostart}>Back to Start (Key is Saved)</button>
  </div>
</div>
