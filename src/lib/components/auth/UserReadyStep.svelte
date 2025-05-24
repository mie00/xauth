<script lang="ts">
  import QRCode from 'qrcode';

  // Svelte 5 Runes: $props, $state, $effect are typically automatically available.
  // If not (e.g. Runes mode not fully enabled), you might need:
  // import { $props, $state, $effect } from 'svelte/runes';

  let { publicKey, loginContinuationUrl = null } = $props<{ publicKey?: CryptoKey, loginContinuationUrl?: string | null }>();

  let qrCodeUrl = $state('');
  let publicKeyJwkString = $state('');
  let generationError = $state<string | null>(null);
  let countdown = $state(5);
  let countdownInterval = $state<number | null>(null);

  $effect(() => {
    const currentPublicKey = publicKey; 
    const currentLoginContinuationUrl = loginContinuationUrl;

    // Clear previous interval when props change or component re-initializes
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    
    if (currentLoginContinuationUrl && currentPublicKey) {
      countdown = 5; // Reset countdown
      countdownInterval = setInterval(() => {
        countdown -= 1;
        if (countdown <= 0) {
          if (countdownInterval) clearInterval(countdownInterval);
          countdownInterval = null;
          window.location.href = currentLoginContinuationUrl;
        }
      }, 1000);
    } else if (currentPublicKey) { // Only generate QR/JWK if not in redirect mode or if public key is available
      async function generateData() {
        try {
          // Reset states before attempting generation
          publicKeyJwkString = '';
          qrCodeUrl = '';
          generationError = null;

          const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", currentPublicKey);
          const jwkString = JSON.stringify(publicKeyJwk, null, 2);
          publicKeyJwkString = jwkString; // Update state

          qrCodeUrl = await QRCode.toDataURL(jwkString, { errorCorrectionLevel: 'M', scale: 6 }); // Update state
        } catch (error) {
          console.error("Error generating QR code or public key JWK:", error);
          qrCodeUrl = ''; // Clear QR code on error
          publicKeyJwkString = ''; // Clear JWK string on error
          generationError = 'Error generating public key data.'; // Set error state
        }
      }
      generateData();
    } else {
      // Reset if publicKey is not available
      qrCodeUrl = '';
      publicKeyJwkString = '';
      generationError = null;
    }

    // Cleanup function for the effect
    return () => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    };
  });

  function copyToClipboard() {
    if (publicKeyJwkString && !generationError) {
      navigator.clipboard.writeText(publicKeyJwkString)
        .then(() => {
          alert('Public key JWK copied to clipboard!');
        })
        .catch(err => {
          console.error('Failed to copy public key JWK: ', err);
          alert('Failed to copy public key JWK.');
        });
    }
  }
</script>

<div class="p-4 bg-gray-800 text-white rounded-lg shadow-xl flex flex-col items-center space-y-6">
  {#if loginContinuationUrl && publicKey}
    <div id="accountCreatedForLoginSection" class="w-full bg-blue-600 border border-blue-500 text-blue-100 px-4 py-3 rounded relative text-center" role="alert">
      <p class="font-bold text-lg">Account Ready!</p>
      <p class="text-sm">Redirecting to complete your login in {countdown} seconds...</p>
    </div>
  {:else}
    <div id="userCreatedSection" class="w-full bg-green-700 border border-green-600 text-green-100 px-4 py-3 rounded relative text-center" role="alert">
      <p class="font-bold text-lg">Account Ready!</p> 
      <p class="text-sm">Your account is set up and keys are active.</p>
    </div>
  {/if}

  {#if publicKey}
    <div class="text-center space-y-4 mt-4"> {/* Added mt-4 for spacing if header is present */}
      <h3 class="text-xl font-semibold">Your Public Key</h3>
      <p class="text-sm text-gray-400">
        Scan this QR code to import your public key elsewhere (e.g., for verification or setting up trusted devices).
        This key is in JWK (JSON Web Key) format.
      </p>

      {#if qrCodeUrl}
        <div class="bg-white p-4 inline-block rounded-md shadow-md">
          <img src={qrCodeUrl} alt="Public Key QR Code" class="w-64 h-64 md:w-72 md:h-72 object-contain" />
        </div>
      {:else if generationError}
        <p class="text-red-400">{generationError}</p>
      {:else}
        <p class="text-gray-400">Generating QR code...</p>
      {/if}

      {#if publicKeyJwkString && !generationError}
        <div class="mt-4 w-full max-w-md">
          <button
            onclick={copyToClipboard}
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Copy Public Key JWK to Clipboard
          </button>
          <details class="mt-2 text-left bg-gray-700 p-3 rounded-md">
            <summary class="cursor-pointer text-sm text-gray-300 hover:text-white">View Public Key JWK</summary>
            <pre class="text-xs whitespace-pre-wrap break-all bg-gray-900 p-2 rounded mt-1 max-h-48 overflow-auto"><code>{publicKeyJwkString}</code></pre>
          </details>
        </div>
      {/if}
    </div>
  {:else}
    <p class="text-center text-gray-400">Public key not available.</p>
  {/if}
</div>
