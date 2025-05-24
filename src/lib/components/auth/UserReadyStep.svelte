<script lang="ts">
  // Svelte 5 Runes: $props, $state, $effect are typically automatically available.
  // If not (e.g. Runes mode not fully enabled), you might need:
  // import { $props, $state, $effect } from 'svelte/runes';

  let { publicKey, loginContinuationUrl = null } = $props<{ publicKey?: CryptoKey, loginContinuationUrl?: string | null }>();

  let imageUrl = $state('');
  let publicKeyJwkString = $state('');
  let generationError = $state<string | null>(null);
  let countdown = $state(5);
  let countdownInterval: number | null = null; // Changed from $state to let

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
      }, 1000) as unknown as number;
    } else if (currentPublicKey) { // Only generate image/JWK if not in redirect mode or if public key is available
      // Helper function to decode Base64URL to Uint8Array
      function base64UrlToUint8Array(base64urlString: string): Uint8Array {
        let base64 = base64urlString.replace(/-/g, '+').replace(/_/g, '/');
        const padding = base64.length % 4;
        if (padding) {
          base64 += '='.repeat(4 - padding);
        }
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes;
      }

      // Helper function to encode Uint8Array to Base64
      function uint8ArrayToBase64(buffer: Uint8Array): string {
        let binary = '';
        const len = buffer.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        return window.btoa(binary);
      }

      async function generateData() {
        try {
          // Reset states before attempting generation
          publicKeyJwkString = '';
          imageUrl = '';
          generationError = null;

          const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", currentPublicKey);
          const jwkString = JSON.stringify(publicKeyJwk, null, 2);
          publicKeyJwkString = jwkString; // Update state

          if (!publicKeyJwk.x || !publicKeyJwk.y) {
            throw new Error("JWK must contain x and y coordinates for an EC public key.");
          }

          const xBytes = base64UrlToUint8Array(publicKeyJwk.x);
          const yBytes = base64UrlToUint8Array(publicKeyJwk.y);

          const concatenatedBytes = new Uint8Array(xBytes.length + yBytes.length);
          concatenatedBytes.set(xBytes, 0);
          concatenatedBytes.set(yBytes, xBytes.length);

          const base64Data = uint8ArrayToBase64(concatenatedBytes);
          imageUrl = `http://localhost:5005/generate-image?data=${base64Data}`; // Update state

        } catch (error) {
          console.error("Error generating image URL or public key JWK:", error);
          imageUrl = ''; // Clear image URL on error
          publicKeyJwkString = ''; // Clear JWK string on error
          generationError = 'Error generating public key data for image.'; // Set error state
        }
      }
      generateData();
    } else {
      // Reset if publicKey is not available
      imageUrl = '';
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
    {#if !loginContinuationUrl}
    <div class="text-center space-y-4 mt-4">
      <h3 class="text-xl font-semibold">Your Public Key</h3>
      <p class="text-sm text-gray-400">
        Below is a visual representation of your public key. You can also copy the full public key in JWK format.
      </p>

      {#if imageUrl}
        <div class="bg-white p-4 inline-block rounded-md shadow-md">
          <img src={imageUrl} alt="Public Key Visual Representation" class="w-64 h-64 md:w-72 md:h-72 object-contain" />
        </div>
      {:else if generationError}
        <p class="text-red-400">{generationError}</p>
      {:else}
        <p class="text-gray-400">Generating key image...</p>
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
    {/if}
  {:else}
    <p class="text-center text-gray-400">Public key not available.</p>
  {/if}
</div>
