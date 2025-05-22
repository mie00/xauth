<script lang="ts">
  import { onMount } from 'svelte';
  import { PUBLIC_KEY_NAME, PRIVATE_KEY_NAME, loadKey } from '../indexedDB';
  import { signAndVerify } from '../../auth'; // We'll keep other auth functions in auth.ts for now

  type AuthStep = 'initial' | 'loading' | 'userReady' | 'createUser' | 'importKey' | 'qrExport' | 'error';

  let currentStep: AuthStep = 'loading'; // Start in loading state
  let errorMessage: string | null = null;
  let userPrivateKey: CryptoKey | undefined;
  let userPublicKey: CryptoKey | undefined;

  onMount(async () => {
    // console.log("AuthFlow component mounted. Checking for existing keys..."); // Quieter log
    currentStep = 'loading';
    errorMessage = null;
    try {
      userPrivateKey = await loadKey(PRIVATE_KEY_NAME);
      userPublicKey = await loadKey(PUBLIC_KEY_NAME);

      if (userPrivateKey && userPublicKey) {
        console.log("User keys successfully loaded from IndexedDB.");
        // Attempt to verify keys to ensure they are usable
        try {
          await signAndVerify(userPrivateKey, userPublicKey);
          console.log("Sign and verify with loaded keys was successful.");
          currentStep = 'userReady';
        } catch (e: any) {
          console.error("Error during sign/verify with loaded keys:", e);
          errorMessage = "Error verifying stored keys. They might be corrupted. Consider creating new keys or importing.";
          // Optionally, clear the problematic keys here
          // await deleteKey(PRIVATE_KEY_NAME);
          // await deleteKey(PUBLIC_KEY_NAME);
          currentStep = 'error'; // Or 'initial' if you want to allow immediate re-creation
        }
      } else {
        console.log("No keys found in IndexedDB or keys failed to load. User creation flow will be active.");
        currentStep = 'initial';
      }
    } catch (error: any) {
      console.error("Error loading keys from IndexedDB on startup:", error);
      errorMessage = `Failed to load keys: ${error.message || "Unknown error"}`;
      currentStep = 'error'; // Or 'initial'
    }
  });

  function handleCreateUser() {
    currentStep = 'createUser';
    // Logic for createUser step will be added here
    console.log("Transitioning to createUser step");
  }

  function handleImportKey() {
    currentStep = 'importKey';
    // Logic for importKey step will be added here
    console.log("Transitioning to importKey step");
  }

</script>

<div class="w-full">
  {#if currentStep === 'loading'}
    <div id="loadingSection" class="bg-gray-800 text-gray-100 p-6 rounded-lg shadow-md mb-6 flex justify-center items-center">
      <svg class="animate-spin h-10 w-10 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>
  {/if}

  {#if currentStep === 'initial'}
    <div id="createUserSection" class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
      <h2 class="text-2xl font-semibold mb-4 text-gray-100">Manage Your Account</h2>
      <p class="text-gray-300 mb-4">Create a new account or import an existing one.</p>
      <div class="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:space-x-4 justify-center">
        <button id="createUserButton" class="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded" on:click={handleCreateUser}>
          Create New Account
        </button>
        <button id="importKeyButton" class="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded" on:click={handleImportKey}>
          Import Account via QR
        </button>
      </div>
    </div>
  {/if}

  {#if currentStep === 'userReady'}
    <div id="userCreatedSection" class="bg-green-700 border border-green-600 text-green-100 px-4 py-3 rounded relative mb-6 text-center" role="alert">
      <p class="font-bold">Login Successful!</p>
      <p class="text-sm">Your account is ready and keys are active.</p>
    </div>
  {/if}

  {#if currentStep === 'error'}
    <div class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
      <h2 class="text-2xl font-semibold mb-4 text-red-400">Authentication Error</h2>
      <p class="text-gray-300 mb-4">{errorMessage || "An unexpected error occurred."}</p>
      <div class="flex justify-center">
        <button class="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded" on:click={() => { currentStep = 'initial'; errorMessage = null; }}>Try Again</button>
      </div>
    </div>
  {/if}

  {#if currentStep === 'createUser'}
    <div id="qrCodeSection" class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
      <h2 class="text-2xl font-semibold mb-4 text-gray-100">Secure & Save Your Account Key</h2>
      <p class="text-gray-300 mb-4">Password setup and QR generation will appear here.</p>
      <!-- User creation UI (password, QR display) will go here -->
      <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded mt-4" on:click={() => currentStep = 'initial'}>Back</button>
    </div>
  {/if}

  {#if currentStep === 'importKey'}
    <div id="importKeySection" class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
      <h2 class="text-2xl font-semibold mb-4 text-gray-100">Import Account by QR Code</h2>
      <p class="text-gray-300 mb-4">QR scanner and password input will appear here.</p>
      <!-- Key import UI (scanner, password) will go here -->
      <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded mt-4" on:click={() => currentStep = 'initial'}>Back</button>
    </div>
  {/if}

</div>
