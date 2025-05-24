<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    PUBLIC_KEY_NAME, 
    PRIVATE_KEY_NAME, 
    loadKey, 
    isCallbackUrlTrusted, 
    saveTrustedCallbackUrl 
  } from '../indexedDB';
  import { createSignedLoginToken, exportPublicKeyToSpkiBase64Url } from '../../auth';
  import AuthFlow from './AuthFlow.svelte'; // Import AuthFlow
  import LoadingSpinner from './auth/LoadingSpinner.svelte';
  import ConfirmLoginStep from './auth/ConfirmLoginStep.svelte';

  const {rawCallbackParam, loginPayloadData}:{rawCallbackParam: string | null, loginPayloadData?: string | null} = $props();

  type LoginStep = 'loading' | 'awaitingConfirmation' | 'processingLogin' | 'error' | 'accountCreationRequired';
  let currentStep: LoginStep = $state('loading');
  let errorMessage: string | null = $state(null);
  let parsedCallbackUrl: URL | null = $state(null);

  onMount(async () => {
    if (!rawCallbackParam) {
      errorMessage = "Missing 'callback' URL parameter. Please provide a callback URL.";
      currentStep = 'error';
      return;
    }

    try {
      parsedCallbackUrl = new URL(rawCallbackParam);

      // Check if the callback URL's hostname is the same as the current application's hostname
      if (parsedCallbackUrl.host === window.location.host) {
        errorMessage = "Invalid 'callback' URL: Callback URL cannot be the same host as the application. This can cause a loop.";
        currentStep = 'error';
        return;
      }

      // Check if the site is HTTPS, then callback must also be HTTPS
      if (window.location.protocol === 'https:' && parsedCallbackUrl.protocol !== 'https:') {
        errorMessage = "Invalid 'callback' URL: When this site is accessed via HTTPS, the callback URL must also use HTTPS.";
        currentStep = 'error';
        return;
      }

    } catch (e) {
      errorMessage = "Invalid 'callback' URL format. Please provide a full, valid URL (e.g., https://example.com/path).";
      currentStep = 'error';
      return;
    }

    try {
      const privateKey = await loadKey(PRIVATE_KEY_NAME);
      const publicKey = await loadKey(PUBLIC_KEY_NAME);

      if (!privateKey || !publicKey) {
        // Keys not found, initiate account creation flow as part of login
        currentStep = 'accountCreationRequired';
        return;
      }

      const isTrusted = await isCallbackUrlTrusted(parsedCallbackUrl.toString());

      if (isTrusted) {
        await proceedWithLogin(privateKey, publicKey, parsedCallbackUrl, loginPayloadData);
      } else {
        currentStep = 'awaitingConfirmation';
      }
    } catch (error: any) {
      console.error("Error during login initialization:", error);
      errorMessage = `Failed to initialize login: ${error.message || "Unknown error"}`;
      currentStep = 'error';
    }
  });

  async function proceedWithLogin(privateKey: CryptoKey, publicKey: CryptoKey, callbackUrl: URL, customPayload?: string | null) {
    currentStep = 'processingLogin';
    errorMessage = null;
    try {
      // publicKey is passed to createSignedLoginToken only if it's needed for the token itself.
      // Since 'iss' is removed, it's not directly needed by createSignedLoginToken anymore.
      // However, we need the publicKey to send it in the URL.
      const jwtToken = await createSignedLoginToken(privateKey, callbackUrl.toString(), customPayload);
      const publicKeySpkiBase64Url = await exportPublicKeyToSpkiBase64Url(publicKey);
      
      const redirectUrl = new URL(callbackUrl.toString());
      redirectUrl.searchParams.set('jwt', jwtToken);
      redirectUrl.searchParams.set('pubKey', publicKeySpkiBase64Url); // Add public key to URL
      
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
      await proceedWithLogin(privateKey, publicKey, parsedCallbackUrl, loginPayloadData);
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

  {#if currentStep === 'accountCreationRequired'}
    <div class="mb-4 text-center">
      <h2 class="text-xl font-semibold text-gray-100">Create Account to Continue</h2>
      <p class="text-gray-300 mb-4">You need to set up an account before you can log in.</p>
    </div>
    <AuthFlow loginContinuationUrl={window.location.href} />
  {/if}

  {#if currentStep === 'awaitingConfirmation' && parsedCallbackUrl}
    <ConfirmLoginStep callbackUrl={parsedCallbackUrl.toString()} onconfirm={handleConfirm} oncancel={handleCancel} />
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
