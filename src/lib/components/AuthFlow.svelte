<script lang="ts">
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
    console.log("AuthFlow component mounted. Checking for existing keys...");
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

<div class="p-4 bg-gray-800 shadow-md rounded-lg">
  {#if currentStep === 'loading'}
    <p class="text-center text-lg">Loading authentication status...</p>
    <!-- You can add a spinner or more elaborate loading indicator here -->
  {/if}

  {#if currentStep === 'initial'}
    <h2 class="text-xl font-semibold mb-4 text-center">Welcome</h2>
    <p class="text-center mb-6">No existing user keys found. Please create a new user or import existing keys.</p>
    <div class="flex justify-center space-x-4">
      <button on:click={handleCreateUser}>Create New User</button>
      <button on:click={handleImportKey}>Import Existing Key</button>
    </div>
  {/if}

  {#if currentStep === 'userReady'}
    <h2 class="text-xl font-semibold mb-4 text-center text-green-400">User Ready</h2>
    <p class="text-center">Your keys are loaded and verified. You are ready to proceed.</p>
    <!-- Add further actions for a ready user, e.g., export, sign data, etc. -->
    <div class="mt-6 flex justify-center space-x-4">
       <!-- Placeholder for future actions like "Export Key Again" or "Sign Out (Clear Keys)" -->
       <button on:click={() => { currentStep = 'initial'; userPrivateKey = undefined; userPublicKey = undefined; console.log("Simulating sign out/reset"); alert("Keys cleared for demo. Refresh or re-create."); }}>Reset (Dev)</button>
    </div>
  {/if}

  {#if currentStep === 'error'}
    <h2 class="text-xl font-semibold mb-4 text-center text-red-400">Authentication Error</h2>
    <p class="text-center mb-4">{errorMessage || "An unexpected error occurred."}</p>
    <div class="flex justify-center">
      <button on:click={() => currentStep = 'initial'}>Try Again</button>
    </div>
  {/if}

  {#if currentStep === 'createUser'}
    <p class="text-center">User Creation (Work In Progress)...</p>
    <!-- User creation UI will go here -->
     <button on:click={() => currentStep = 'initial'}>Back</button>
  {/if}

  {#if currentStep === 'importKey'}
    <p class="text-center">Import Key (Work In Progress)...</p>
    <!-- Key import UI will go here -->
    <button on:click={() => currentStep = 'initial'}>Back</button>
  {/if}

</div>

<style>
  /* Component-specific styles can go here, Tailwind is mostly used via classes */
  button {
    background-color: #4F46E5; /* indigo-600 */
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    margin: 0.5rem;
    border: none;
    cursor: pointer;
  }
  button:hover {
    background-color: #4338CA; /* indigo-700 */
  }
</style>
