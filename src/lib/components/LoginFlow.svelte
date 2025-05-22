<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    PUBLIC_KEY_NAME, 
    PRIVATE_KEY_NAME, 
    loadKey, 
    isCallbackUrlTrusted, 
    saveTrustedCallbackUrl 
  } from '../indexedDB';
  import { createSignedLoginToken } from '../../auth';
  import LoadingSpinner from './auth/LoadingSpinner.svelte';
  import ConfirmLoginStep from './auth/ConfirmLoginStep.svelte';

  export let rawCallbackParam: string | null = null;

  type LoginStep = 'loading' | 'awaitingConfirmation' | 'processingLogin' | 'error';
  let currentStep: LoginStep = 'loading';
  let errorMessage: string | null = null;
  let parsedCallbackUrl: URL | null = null;

  onMount(async () => {
    if (!rawCallbackParam) {
      errorMessage = "Missing 'callback' URL parameter. Please provide a callback URL.";
      currentStep = 'error';
      return;
    }

    try {
      parsedCallbackUrl = new URL(rawCallbackParam);
    } catch (e) {
      errorMessage = "Invalid 'callback' URL format. Please provide a full, valid URL (e.g., https://example.com/path).";
      currentStep = 'error';
      return;
    }

    try {
      const privateKey = await loadKey(PRIVATE_KEY_NAME);
      const publicKey = await loadKey(PUBLIC_KEY_NAME);

      if (!privateKey || !publicKey) {
        errorMessage = "User keys not found. Please set up your identity on the main page before using the /login route.";
        currentStep = 'error';
        return;
      }

      const isTrusted = await isCallbackUrlTrusted(parsedCallbackUrl.toString());

      if (isTrusted) {
        await proceedWithLogin(privateKey, publicKey, parsedCallbackUrl);
      } else {
        currentStep = 'awaitingConfirmation';
      }
    } catch (error: any) {
      console.error("Error during login initialization:", error);
      errorMessage = `Failed to initialize login: ${error.message || "Unknown error"}`;
      currentStep = 'error';
    }
  });

  async function proceedWithLogin(privateKey: CryptoKey, publicKey: CryptoKey, callbackUrl: URL) {
    currentStep = 'processingLogin';
    errorMessage = null;
    try {
      const jwtToken = await createSignedLoginToken(privateKey, publicKey, callbackUrl.toString());
      
      const redirectUrl = new URL(callbackUrl.toString());
      redirectUrl.searchParams.set('jwt', jwtToken);
      
      window.location.replace(redirectUrl.toString());
      // "Processing login request and redirecting..." message will be shown by this step
    } catch (error: any) {
      console.error("Error during login token generation or redirect:", error);
      errorMessage = `Failed to process login request: ${error.message || "Unknown error"}`;
      currentStep = 'error';
    }
  }

  async function handleConfirm() {
    if (!parsedCallbackUrl) {
        errorMessage = "Callback URL is not available for confirmation.";
        currentStep = 'error';
        return;
    }
    currentStep = 'loading'; // Show loader while saving and fetching keys again
    try {
      await saveTrustedCallbackUrl(parsedCallbackUrl.toString());
      console.log(`Callback URL ${parsedCallbackUrl.toString()} saved as trusted.`);
      
      // Re-fetch keys to pass to proceedWithLogin, or ensure they are still in scope
      // For simplicity, re-fetching, though they could be stored in component state if preferred
      const privateKey = await loadKey(PRIVATE_KEY_NAME);
      const publicKey = await loadKey(PUBLIC_KEY_NAME);

      if (!privateKey || !publicKey) {
        errorMessage = "User keys not found after confirmation. This should not happen.";
        currentStep = 'error';
        return;
      }
      await proceedWithLogin(privateKey, publicKey, parsedCallbackUrl);
    } catch (error: any) {
      console.error("Error after login confirmation:", error);
      errorMessage = `Failed to process login after confirmation: ${error.message || "Unknown error"}`;
      currentStep = 'error';
    }
  }

  function handleCancel() {
    errorMessage = "Login request was cancelled by the user.";
    currentStep = 'error';
    // Optionally, redirect to home page: window.location.href = "/";
  }

</script>

<div class="w-full">
  {#if currentStep === 'loading'}
    <LoadingSpinner />
    <p class="mt-4 text-center text-gray-600">Initializing login...</p>
  {/if}

  {#if currentStep === 'awaitingConfirmation' && parsedCallbackUrl}
    <ConfirmLoginStep callbackUrl={parsedCallbackUrl.toString()} on:confirm={handleConfirm} on:cancel={handleCancel} />
  {/if}

  {#if currentStep === 'processingLogin'}
    <LoadingSpinner />
    <p class="mt-4 text-center text-gray-600">Processing login request and redirecting...</p>
  {/if}

  {#if currentStep === 'error'}
    <div class="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded w-full">
      <h2 class="text-lg font-semibold mb-2">Login Error</h2>
      <p>{errorMessage || "An unexpected error occurred."}</p>
      <p class="mt-2">Please <a href="/" class="text-blue-600 hover:underline">return to the main page</a>.</p>
    </div>
  {/if}
</div>
