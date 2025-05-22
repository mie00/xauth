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

  // Import new child components
  import LoadingSpinner from './auth/LoadingSpinner.svelte';
  import InitialStep from './auth/InitialStep.svelte';
  import UserReadyStep from './auth/UserReadyStep.svelte';
  import ErrorStep from './auth/ErrorStep.svelte';
  import CreatePasswordStep from './auth/CreatePasswordStep.svelte';
  import QrExportStep from './auth/QrExportStep.svelte';
  import QrScanStep from './auth/QrScanStep.svelte';
  import ImportKeyStep from './auth/ImportKeyStep.svelte';

  type AuthStep =
    | 'initial'
    | 'loading'
    | 'userReady'
    | 'enterPasswordForCreate'
    | 'qrExport'
    | 'qrScanForImport'
    | 'enterWrappedKeyForImport'
    | 'error';

  let currentStep: AuthStep = 'loading';
  let errorMessage: string | null = null;
  let userPrivateKey: CryptoKey | undefined;
  let userPublicKey: CryptoKey | undefined;

  let passwordInput: string = '';
  let wrappedKeyForExport: string | null = null;
  let qrCodeImageDataUrl: string | null = null;
  let wrappedKeyForImport: string = '';

  let videoElement: HTMLVideoElement | null = null;
  let canvasElement: HTMLCanvasElement | null = null;
  let qrScanError: string | null = null;
  let isScanning: boolean = false;
  let animationFrameId: number | null = null;
  let mediaStream: MediaStream | null = null;

  onMount(async () => {
    currentStep = 'loading';
    errorMessage = null;
    try {
      userPrivateKey = await loadKey(PRIVATE_KEY_NAME);
      userPublicKey = await loadKey(PUBLIC_KEY_NAME);

      if (userPrivateKey && userPublicKey) {
        console.log("User keys successfully loaded from IndexedDB.");
        try {
          await signAndVerify(userPrivateKey, userPublicKey);
          console.log("Sign and verify with loaded keys was successful.");
          currentStep = 'userReady';
        } catch (e: any) {
          console.error("Error during sign/verify with loaded keys:", e);
          errorMessage = "Error verifying stored keys. They might be corrupted. Consider creating new keys or importing.";
          currentStep = 'error';
        }
      } else {
        console.log("No keys found in IndexedDB or keys failed to load. User creation flow will be active.");
        currentStep = 'initial';
      }
    } catch (error: any) {
      console.error("Error loading keys from IndexedDB on startup:", error);
      errorMessage = `Failed to load keys: ${error.message || "Unknown error"}`;
      currentStep = 'error';
    }
  });

  function handleCreateUser() {
    passwordInput = ''; 
    errorMessage = null;
    currentStep = 'enterPasswordForCreate';
    console.log("Transitioning to enterPasswordForCreate step");
  }

  async function initiateUserCreationProcess() {
    if (!passwordInput) {
      errorMessage = "Password cannot be empty.";
      console.error(errorMessage);
      // Error will be displayed by CreatePasswordStep if currentStep is 'enterPasswordForCreate'
      return;
    }
    currentStep = 'loading';
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
      currentStep = 'qrExport';
    } catch (error: any) {
      console.error("Error during user creation process:", error);
      errorMessage = `Failed to create user: ${error.message || "Unknown error"}`;
      currentStep = 'error';
    } finally {
      passwordInput = ''; 
    }
  }

  function handleImportKey() {
    passwordInput = '';
    wrappedKeyForImport = '';
    qrScanError = null;
    errorMessage = null;
    currentStep = 'qrScanForImport';
    console.log("Transitioning to qrScanForImport step");
    startQrScan();
  }

  async function startQrScan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      qrScanError = "getUserMedia() not supported by your browser.";
      console.error(qrScanError);
      currentStep = 'enterWrappedKeyForImport';
      return;
    }
    isScanning = true;
    qrScanError = null;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoElement && mediaStream) {
        videoElement.srcObject = mediaStream;
        videoElement.setAttribute("playsinline", "true");
        await videoElement.play();
        tick();
      }
    } catch (err: any) {
      console.error("Error accessing camera for QR scan:", err);
      qrScanError = `Could not access camera: ${err.name} - ${err.message}. Try manual input.`;
      stopQrScan();
      currentStep = 'enterWrappedKeyForImport';
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
      if (isScanning) animationFrameId = requestAnimationFrame(tick);
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
        passwordInput = ''; // Clear password for import step
        errorMessage = null; // Clear any previous general errors
        currentStep = 'enterWrappedKeyForImport';
      } else {
        animationFrameId = requestAnimationFrame(tick);
      }
    } else {
      animationFrameId = requestAnimationFrame(tick);
    }
  }

  onDestroy(() => {
    stopQrScan();
  });

  async function initiateUserImportProcess() {
    if (!passwordInput || !wrappedKeyForImport) {
      errorMessage = "Wrapped key data and password cannot be empty.";
      console.error(errorMessage);
      // Error will be displayed by ImportKeyStep if currentStep is 'enterWrappedKeyForImport'
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
      await signAndVerify(userPrivateKey, userPublicKey);
      console.log("Sign and verify with imported keys was successful.");
      currentStep = 'userReady';
    } catch (error: any) {
      console.error("Error during key import process:", error);
      errorMessage = `Failed to import keys: ${error.message || "Unknown error"}. Ensure the key data and password are correct.`;
      currentStep = 'error';
    } finally {
      passwordInput = '';
      // Keep wrappedKeyForImport if import failed, so user can retry password
      // wrappedKeyForImport = ''; // Clear only on success or explicit back/cancel
    }
  }

  function resetToInitial() {
    currentStep = 'initial';
    errorMessage = null;
    qrScanError = null;
    passwordInput = '';
    wrappedKeyForImport = '';
    wrappedKeyForExport = null;
    qrCodeImageDataUrl = null;
    stopQrScan(); // Ensure scanner is stopped if active
  }

</script>

<div class="w-full">
  {#if currentStep === 'loading'}
    <LoadingSpinner />
  {/if}

  {#if currentStep === 'initial'}
    <InitialStep on:create={handleCreateUser} on:import={handleImportKey} />
  {/if}

  {#if currentStep === 'userReady'}
    <UserReadyStep />
  {/if}

  {#if currentStep === 'error'}
    <ErrorStep {errorMessage} on:tryagain={resetToInitial} />
  {/if}

  {#if currentStep === 'enterPasswordForCreate'}
    <CreatePasswordStep 
      bind:passwordInput 
      errorMessage={errorMessage}
      on:submit={initiateUserCreationProcess} 
      on:back={resetToInitial} 
    />
  {/if}

  {#if currentStep === 'qrExport'}
    <QrExportStep 
      {qrCodeImageDataUrl} 
      {wrappedKeyForExport} 
      on:done={() => currentStep = 'userReady'} 
      on:backtostart={resetToInitial} 
    />
  {/if}

  {#if currentStep === 'qrScanForImport'}
    <QrScanStep 
      bind:videoElement 
      bind:canvasElement 
      qrScanError={qrScanError}
      isScanning={isScanning}
      mediaStreamActive={!!mediaStream}
      on:manualinput={() => { 
        stopQrScan(); 
        currentStep = 'enterWrappedKeyForImport'; 
        qrScanError = qrScanError || "Switched to manual input."; // Keep existing error or set a new one
        errorMessage = null; // Clear general error message
        passwordInput = ''; // Clear password for import step
      }} 
      on:back={resetToInitial} 
    />
  {/if}

  {#if currentStep === 'enterWrappedKeyForImport'}
    <ImportKeyStep 
      bind:wrappedKeyForImport 
      bind:passwordInput
      errorMessage={errorMessage} 
      qrScanErrorMessage={qrScanError}
      qrDataLoaded={!!(wrappedKeyForImport && !qrScanError)}
      on:submit={initiateUserImportProcess} 
      on:back={() => {
        resetToInitial();
        currentStep = 'initial'; // Go back to initial options
      }} 
    />
  {/if}
</div>
