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
    <div class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
      <p class="text-lg text-gray-300">Loading authentication status...</p>
      <!-- You can add a spinner or more elaborate loading indicator here -->
    </div>
  {/if}

  {#if currentStep === 'initial'}
    <div class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
      <h2 class="text-2xl font-semibold mb-4 text-gray-100">Welcome</h2>
      <p class="text-gray-300 mb-6">No existing user keys found. Please create a new user or import existing keys.</p>
      <div class="flex justify-center space-x-4">
        <button class="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded" on:click={handleCreateUser}>Create New User</button>
        <button class="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded" on:click={handleImportKey}>Import Existing Key</button>
      </div>
    </div>
  {/if}

  {#if currentStep === 'userReady'}
    <div class="bg-green-700 border border-green-600 text-green-100 px-4 py-3 rounded relative mb-6 text-center" role="alert">
      <h2 class="text-xl font-bold mb-2">User Ready</h2>
      <p class="text-sm">Your keys are loaded and verified. You are ready to proceed.</p>
      <!-- Add further actions for a ready user, e.g., export, sign data, etc. -->
      <div class="mt-6 flex justify-center space-x-4">
         <!-- Placeholder for future actions like "Export Key Again" or "Sign Out (Clear Keys)" -->
         <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded" on:click={() => { currentStep = 'initial'; userPrivateKey = undefined; userPublicKey = undefined; console.log("Simulating sign out/reset"); alert("Keys cleared for demo. Refresh or re-create."); }}>Reset (Dev)</button>
      </div>
    </div>
  {/if}

  {#if currentStep === 'error'}
    <div class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
      <h2 class="text-2xl font-semibold mb-4 text-red-400">Authentication Error</h2>
      <p class="text-gray-300 mb-4">{errorMessage || "An unexpected error occurred."}</p>
      <div class="flex justify-center">
        <button class="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded" on:click={() => currentStep = 'initial'}>Try Again</button>
      </div>
    </div>
  {/if}

  {#if currentStep === 'createUser'}
    <div class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
      <p class="text-gray-300 mb-4">User Creation (Work In Progress)...</p>
      <!-- User creation UI will go here -->
      <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded mt-4" on:click={() => currentStep = 'initial'}>Back</button>
    </div>
  {/if}

  {#if currentStep === 'importKey'}
    <div class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
      <p class="text-gray-300 mb-4">Import Key (Work In Progress)...</p>
      <!-- Key import UI will go here -->
      <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded mt-4" on:click={() => currentStep = 'initial'}>Back</button>
    </div>
  {/if}

</div>
