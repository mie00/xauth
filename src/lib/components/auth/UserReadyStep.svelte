<script lang="ts">
  // Svelte 5 Runes: $props, $state, $effect are typically automatically available.
  // If not (e.g. Runes mode not fully enabled), you might need:
  // import { $props, $state, $effect } from 'svelte/runes';
  import QRCode from 'qrcode';

  let { publicKey, loginContinuationUrl = null } = $props<{ publicKey?: CryptoKey, loginContinuationUrl?: string | null }>();

  let imageUrl = $state('');
  let qrCodeUrl = $state('');
  let publicKeyJwkString = $state('');
  let generationError = $state<string | null>(null);
  let imageFailedToLoad = $state(false); // New state for tracking image load failure
  let countdown = $state(navigator.webdriver?0.1:5);
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
      countdown = navigator.webdriver?0.1:5; // Reset countdown
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

      // Helper function to encode Uint8Array to Base64URL
      function uint8ArrayToBase64Url(buffer: Uint8Array): string {
        let binary = '';
        const len = buffer.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        return window.btoa(binary)
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
      }

      async function generateData() {
        try {
          // Reset states before attempting generation
          publicKeyJwkString = '';
          imageUrl = '';
          qrCodeUrl = '';
          generationError = null;
          imageFailedToLoad = false; // Reset image load failure flag

          let jwkForQrGeneration: string | null = null;

          try {
            const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", currentPublicKey);
            const jwkString = JSON.stringify(publicKeyJwk, null, 2);
            publicKeyJwkString = jwkString; // Update state for display/copy
            jwkForQrGeneration = jwkString;

            // Attempt to generate imageUrl
            try {
              if (!publicKeyJwk.x || !publicKeyJwk.y) {
                throw new Error("JWK must contain x and y coordinates for an EC public key to generate image.");
              }
              const xBytes = base64UrlToUint8Array(publicKeyJwk.x);
              const yBytes = base64UrlToUint8Array(publicKeyJwk.y);
              const concatenatedBytes = new Uint8Array(xBytes.length + yBytes.length);
              concatenatedBytes.set(xBytes, 0);
              concatenatedBytes.set(yBytes, xBytes.length);
              const base64UrlData = uint8ArrayToBase64Url(concatenatedBytes);
              imageUrl = `http://localhost:5005/generate-image?data=${base64UrlData}`;
            } catch (imageGenError) {
              console.error("Error generating image URL:", imageGenError);
              imageUrl = ''; // Clear image URL on its specific error
              generationError = (generationError || '') + 'Failed to generate visual key image. ';
            }

          } catch (jwkError) {
            console.error("Error exporting public key JWK:", jwkError);
            publicKeyJwkString = ''; // Clear JWK string on error
            generationError = 'Error generating public key data (JWK export failed).';
            // No point in trying image or QR if JWK fails, so jwkForQrGeneration remains null
          }

          // Attempt to generate qrCodeUrl if JWK was successfully exported
          if (jwkForQrGeneration) {
            try {
              qrCodeUrl = await QRCode.toDataURL(jwkForQrGeneration, { errorCorrectionLevel: 'M', scale: 6 });
            } catch (qrGenError) {
              console.error("Error generating QR code:", qrGenError);
              qrCodeUrl = ''; // Clear QR code URL on its specific error
              generationError = (generationError || '') + 'Failed to generate QR code. ';
            }
          }
          
          // Final error state if nothing could be generated
          if (!imageUrl && !qrCodeUrl && !generationError) {
            // This might occur if JWK export was fine, but both image and QR gen failed silently (unlikely with current catches)
            generationError = 'Could not generate visual key or QR code.';
          } else if (!imageUrl && !qrCodeUrl && generationError && !generationError.includes('JWK export failed')) {
            // If both are empty, and there was some error after JWK success
            // generationError should already be descriptive from individual catches.
          }
        } catch (error) {
          console.error("Overall error in generateData:", error);
          generationError = (generationError || '') + 'An unexpected error occurred while generating key data. ';
          // Ensure states are reset if an overarching error occurs
          imageUrl = '';
          qrCodeUrl = '';
          publicKeyJwkString = '';
        }
      }
      generateData();
    } else {
      // Reset if publicKey is not available
      imageUrl = '';
      qrCodeUrl = '';
      publicKeyJwkString = '';
      imageFailedToLoad = false;
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
        Below is a visual representation of your public key. If it fails to load, a QR code will be shown. You can also copy the full public key in JWK format.
      </p>

      {#if imageUrl && !imageFailedToLoad}
        <div class="bg-white p-4 inline-block rounded-md shadow-md">
          <img 
            src={imageUrl} 
            alt="Public Key Visual Representation" 
            class="w-64 h-64 md:w-72 md:h-72 object-contain" 
            onerror={() => { 
              console.warn('Visual key image failed to load. Attempting QR code fallback.'); 
              imageFailedToLoad = true; 
            }} 
          />
        </div>
      {:else if qrCodeUrl} <!-- This shows if imageUrl is empty OR imageFailedToLoad is true -->
        <div class="bg-white p-4 inline-block rounded-md shadow-md">
          <img src={qrCodeUrl} alt="Public Key QR Code" class="w-64 h-64 md:w-72 md:h-72 object-contain" />
        </div>
        {#if imageFailedToLoad && imageUrl && qrCodeUrl} <!-- Only show this specific message if primary image *failed* to load and QR is the fallback -->
          <p class="text-orange-400 text-xs mt-2">Visual key image failed to load. Displaying QR code as fallback.</p>
        {/if}
      {:else if generationError}
        <p class="text-red-400">{generationError}</p>
      {:else}
        <p class="text-gray-400">Generating key data...</p>
      {/if}

      {#if publicKeyJwkString && (!generationError || qrCodeUrl || imageUrl)} <!-- Show copy button if JWK is available and either image or QR could be generated or was attempted -->
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
