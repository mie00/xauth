<script lang="ts">
  import { onMount } from 'svelte';
  import "./style.css"; // Global styles
  import AuthFlow from './lib/components/AuthFlow.svelte';
  import LoadingSpinner from './lib/components/auth/LoadingSpinner.svelte';
  import { PUBLIC_KEY_NAME, PRIVATE_KEY_NAME, loadKey } from './lib/indexedDB';
  import { createSignedLoginToken, type LoginTokenPayload } from './auth';

  type ViewState = 'loading' | 'authFlow' | 'loginHandler' | 'loginError';

  let currentView: ViewState = 'loading';
  let loginErrorMessage: string | null = null;

  onMount(async () => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    if (path === '/login') {
      currentView = 'loginHandler'; // Show "Processing..." message
      const callbackParam = params.get('callback');

      if (!callbackParam) {
        loginErrorMessage = "Missing 'callback' URL parameter. Please provide a callback URL.";
        currentView = 'loginError';
        return;
      }
      
      let callbackUrl: URL;
      try {
        // Ensure callbackParam is a full URL. If it's a path, resolve against current origin.
        // For "127.0.0.1", it needs a scheme like "http://127.0.0.1"
        // If callbackParam is just "127.0.0.1", new URL() will fail.
        // We assume callbackParam will be a valid, absolute URL string.
        callbackUrl = new URL(callbackParam);
      } catch (e) {
        loginErrorMessage = "Invalid 'callback' URL format. Please provide a full, valid URL (e.g., http://127.0.0.1/path).";
        currentView = 'loginError';
        return;
      }

      try {
        const privateKey = await loadKey(PRIVATE_KEY_NAME);
        const publicKey = await loadKey(PUBLIC_KEY_NAME);

        if (!privateKey || !publicKey) {
          loginErrorMessage = "User keys not found. Please set up your identity on the main page before using the /login route.";
          currentView = 'loginError';
          return;
        }

        const jwtToken = await createSignedLoginToken(privateKey, publicKey, callbackUrl.toString());
        
        // Append JWT to the callback URL
        const redirectUrl = new URL(callbackUrl.toString()); // Create a new URL object to safely add params
        redirectUrl.searchParams.set('jwt', jwtToken);
        
        // Perform the redirect
        window.location.replace(redirectUrl.toString());
        // A "Redirecting..." message will be shown by the 'loginHandler' view until the browser navigates away.
      } catch (error: any) {
        console.error("Error during login token generation or redirect:", error);
        loginErrorMessage = `Failed to process login request: ${error.message || "Unknown error"}`;
        currentView = 'loginError';
      }
    } else {
      currentView = 'authFlow';
    }
  });
</script>

<main class="container p-4 max-w-md flex flex-col items-center">
  {#if currentView === 'loading'}
    <LoadingSpinner />
    <p class="mt-4 text-center text-gray-600">Initializing...</p>
  {:else if currentView === 'loginHandler'}
    <LoadingSpinner />
    <p class="mt-4 text-center text-gray-600">Processing login request and redirecting...</p>
    <!-- This message is shown briefly until redirection or if an error occurs and sets loginErrorMessage -->
  {:else if currentView === 'loginError'}
    <div class="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded w-full">
      <h2 class="text-lg font-semibold mb-2">Login Error</h2>
      <p>{loginErrorMessage || "An unexpected error occurred."}</p>
      <p class="mt-2">Please <a href="/" class="text-blue-600 hover:underline">return to the main page</a> and ensure your identity is set up correctly.</p>
    </div>
  {:else if currentView === 'authFlow'}
    <AuthFlow />
  {/if}
</main>
