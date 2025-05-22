<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { PUBLIC_KEY_NAME, PRIVATE_KEY_NAME, loadKey, saveKey } from '../indexedDB';
  import { 
    signAndVerify, 
    generateUserKeysAndWrappedPayload, 
    unwrapAndImportKeysFromPayload 
  } from '../../auth';
  import QRCode from 'qrcode';
  import jsQR from 'jsqr';

  type AuthStep =
    | 'initial'
    | 'loading'
    | 'userReady'
    | 'enterPasswordForCreate' // Renamed from createUser
    | 'qrExport' // Will be used to display QR code after creation
    | 'qrScanForImport' // New step for QR code scanning
    | 'enterWrappedKeyForImport' // For manual input or after QR scan
    | 'error';

  let currentStep: AuthStep = 'loading'; // Start in loading state
  let errorMessage: string | null = null;
  let userPrivateKey: CryptoKey | undefined;
  let userPublicKey: CryptoKey | undefined;

  // New state for create/import flows
  let passwordInput: string = '';
  let wrappedKeyForExport: string | null = null; // JSON string of WrappedKeyPayload for QR
  let qrCodeImageDataUrl: string | null = null; // Data URL for QR code image
  let wrappedKeyForImport: string = ''; // Textarea input for importing key

  // State for QR Scanner
  let videoElement: HTMLVideoElement | null = null;
  let canvasElement: HTMLCanvasElement | null = null;
  let qrScanError: string | null = null;
  let isScanning: boolean = false;
  let animationFrameId: number | null = null;
  let mediaStream: MediaStream | null = null;


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
    passwordInput = ''; // Clear previous input
    currentStep = 'enterPasswordForCreate';
    console.log("Transitioning to enterPasswordForCreate step");
  }

  async function initiateUserCreationProcess() {
    if (!passwordInput) {
      errorMessage = "Password cannot be empty.";
      // Optionally, stay on the current step or move to an error display within this step
      console.error(errorMessage);
      return;
    }
    currentStep = 'loading'; // Show loading indicator during key generation
    errorMessage = null;
    try {
      const { operationalPrivateKey, publicKey, wrappedKeyJSON } = 
        await generateUserKeysAndWrappedPayload(passwordInput);

      wrappedKeyForExport = wrappedKeyJSON;
      qrCodeImageDataUrl = await QRCode.toDataURL(wrappedKeyForExport);

      userPrivateKey = operationalPrivateKey;
      userPublicKey = publicKey;

      await saveKey(userPrivateKey, PRIVATE_KEY_NAME);
      await saveKey(userPublicKey, PUBLIC_KEY_NAME);
      
      console.log("New keys generated, wrapped, and stored.");
      currentStep = 'qrExport'; // Transition to show QR code
    } catch (error: any) {
      console.error("Error during user creation process:", error);
      errorMessage = `Failed to create user: ${error.message || "Unknown error"}`;
      currentStep = 'error';
    } finally {
      passwordInput = ''; // Clear password after use
    }
  }

  function handleImportKey() {
    passwordInput = '';
    wrappedKeyForImport = '';
    qrScanError = null;
    currentStep = 'qrScanForImport';
    console.log("Transitioning to qrScanForImport step");
    startQrScan();
  }

  async function startQrScan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      qrScanError = "getUserMedia() not supported by your browser.";
      console.error(qrScanError);
      currentStep = 'enterWrappedKeyForImport'; // Fallback to manual input
      return;
    }

    isScanning = true;
    qrScanError = null;

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoElement && mediaStream) {
        videoElement.srcObject = mediaStream;
        videoElement.setAttribute("playsinline", "true"); // Required for iOS Safari
        await videoElement.play();
        tick(); // Start scanning loop
      }
    } catch (err: any) {
      console.error("Error accessing camera for QR scan:", err);
      qrScanError = `Could not access camera: ${err.name} - ${err.message}. Try manual input.`;
      stopQrScan(); // Ensure resources are released
      currentStep = 'enterWrappedKeyForImport'; // Fallback to manual input
    }
  }

  function stopQrScan() {
    isScanning = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
    console.log("QR Scanner stopped.");
  }

  function tick() {
    if (!isScanning || !videoElement || !canvasElement || videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
      if (isScanning) animationFrameId = requestAnimationFrame(tick); // Retry if not ready but still scanning
      return;
    }

    const canvas = canvasElement.getContext('2d', { willReadFrequently: true });
    if (canvas) {
      canvasElement.height = videoElement.videoHeight;
      canvasElement.width = videoElement.videoWidth;
      canvas.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
      const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        console.log("QR Code detected:", code.data);
        wrappedKeyForImport = code.data;
        stopQrScan();
        currentStep = 'enterWrappedKeyForImport'; // Move to password entry with pre-filled data
        // Potentially auto-focus password field here
      } else {
        animationFrameId = requestAnimationFrame(tick);
      }
    } else {
      animationFrameId = requestAnimationFrame(tick); // Retry if canvas context not ready
    }
  }

  onDestroy(() => {
    stopQrScan(); // Ensure camera is released when component is destroyed
  });

  async function initiateUserImportProcess() {
    if (!passwordInput || !wrappedKeyForImport) {
      errorMessage = "Wrapped key data and password cannot be empty.";
      console.error(errorMessage);
      // Optionally, display this message in the UI of the current step
      return;
    }
    currentStep = 'loading';
    errorMessage = null;
    try {
      const { importedPrivateKey, importedPublicKey } = 
        await unwrapAndImportKeysFromPayload(wrappedKeyForImport, passwordInput);

      userPrivateKey = importedPrivateKey;
      userPublicKey = importedPublicKey;

      await saveKey(userPrivateKey, PRIVATE_KEY_NAME);
      await saveKey(userPublicKey, PUBLIC_KEY_NAME);

      console.log("Keys successfully imported and stored.");
      // Verify the newly imported keys
      await signAndVerify(userPrivateKey, userPublicKey);
      console.log("Sign and verify with imported keys was successful.");
      currentStep = 'userReady';

    } catch (error: any) {
      console.error("Error during key import process:", error);
      errorMessage = `Failed to import keys: ${error.message || "Unknown error"}. Ensure the key data and password are correct.`;
      currentStep = 'error'; // Or back to 'enterWrappedKeyForImport' with error message
    } finally {
      passwordInput = ''; // Clear password
      wrappedKeyForImport = ''; // Clear imported key data
    }
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

  {#if currentStep === 'enterPasswordForCreate'}
    <div id="enterPasswordCreateSection" class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
      <h2 class="text-2xl font-semibold mb-4 text-gray-100">Create New Account</h2>
      <p class="text-gray-300 mb-4">Enter a strong password to secure your new account key. This password will be required to export/import your key.</p>
      <input
        type="password"
        bind:value={passwordInput}
        placeholder="Enter password"
        class="w-full p-2 mb-4 bg-gray-700 text-gray-100 rounded border border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
      />
      {#if errorMessage && currentStep === 'enterPasswordForCreate'}
        <p class="text-red-400 mb-4">{errorMessage}</p>
      {/if}
      <div class="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:space-x-4 justify-center">
        <button
          class="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
          on:click={initiateUserCreationProcess}
          disabled={!passwordInput}
        >
          Create Account & Get QR Key
        </button>
        <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded" on:click={() => { currentStep = 'initial'; errorMessage = null; }}>Back</button>
      </div>
    </div>
  {/if}

  {#if currentStep === 'qrExport'}
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
        bind:value={wrappedKeyForExport}
        class="w-full p-2 mt-4 bg-gray-700 text-gray-200 rounded border border-gray-600 h-32 text-xs"
        placeholder="Wrapped key data will appear here..."
      ></textarea>
      <div class="mt-6 flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:space-x-4 justify-center">
        <button class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded" on:click={() => currentStep = 'userReady'}>
          Done, I've Saved My Key
        </button>
         <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded" on:click={() => currentStep = 'initial'}>Back to Start (Key is Saved)</button>
      </div>
    </div>
  {/if}

  {#if currentStep === 'qrScanForImport'}
    <div id="qrScanImportSection" class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
      <h2 class="text-2xl font-semibold mb-4 text-gray-100">Scan QR Code to Import Key</h2>
      <p class="text-gray-300 mb-4">Point your camera at the QR code containing your encrypted account key.</p>
      <div class="relative w-full max-w-md mx-auto aspect-square bg-gray-700 rounded overflow-hidden mb-4">
        <!-- svelte-ignore a11y-media-has-caption -->
        <video bind:this={videoElement} class="w-full h-full object-cover" playsinline autoplay muted></video>
        {#if !isScanning && !qrScanError && !mediaStream}
          <div class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <p class="text-gray-200">Initializing camera...</p>
          </div>
        {/if}
      </div>
      <canvas bind:this={canvasElement} class="hidden"></canvas> {#if qrScanError}
        <p class="text-red-400 mb-4">{qrScanError}</p>
      {/if}
      <div class="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:space-x-4 justify-center">
        <button
          class="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
          on:click={() => { stopQrScan(); currentStep = 'enterWrappedKeyForImport'; qrScanError = null; }}
        >
          Switch to Manual Input
        </button>
        <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded" on:click={() => { stopQrScan(); currentStep = 'initial'; qrScanError = null; errorMessage = null; }}>Back</button>
      </div>
    </div>
  {/if}

  {#if currentStep === 'enterWrappedKeyForImport'}
    <div id="importKeyDataSection" class="bg-gray-800 p-6 rounded-lg shadow-md mb-6 text-center">
      <h2 class="text-2xl font-semibold mb-4 text-gray-100">Import Account Key</h2>
      {#if wrappedKeyForImport && !qrScanError}
      <p class="text-gray-300 mb-1">QR code data loaded. Now enter your password.</p>
      {:else if qrScanError && currentStep === 'enterWrappedKeyForImport'}
      <p class="text-gray-300 mb-1">Camera failed or not available. Paste your wrapped key data and enter password.</p>
      {:else}
      <p class="text-gray-300 mb-1">Paste your wrapped key data (JSON text from backup) and enter the password you used to encrypt it.</p>
      {/if}
      <p class="text-gray-400 mb-4 text-sm">Ensure the key data below is correct before proceeding.</p>
      <textarea
        bind:value={wrappedKeyForImport}
        placeholder="Paste wrapped key JSON here, or it will appear after QR scan"
        class="w-full p-2 mb-4 bg-gray-700 text-gray-100 rounded border border-gray-600 focus:ring-indigo-500 focus:border-indigo-500 h-32"
        readonly={!!(wrappedKeyForImport && !qrScanError)}
      ></textarea>
      <input
        type="password"
        bind:value={passwordInput}
        placeholder="Enter password for this key"
        class="w-full p-2 mb-4 bg-gray-700 text-gray-100 rounded border border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
      />
      {#if errorMessage && currentStep === 'enterWrappedKeyForImport'}
        <p class="text-red-400 mb-4">{errorMessage}</p>
      {/if}
      <div class="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:space-x-4 justify-center">
        <button
          class="bg-sky-500 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded"
          on:click={initiateUserImportProcess}
          disabled={!passwordInput || !wrappedKeyForImport}
        >
          Import Account
        </button>
        <button class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded" on:click={() => { currentStep = 'initial'; errorMessage = null; wrappedKeyForImport = ''; passwordInput = ''; qrScanError = null; }}>Back</button>
      </div>
    </div>
  {/if}

</div>
