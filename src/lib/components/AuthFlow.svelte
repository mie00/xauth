<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { PUBLIC_KEY_NAME, PRIVATE_KEY_NAME, loadKey, saveKey } from '../indexedDB';
  import { 
    signAndVerify, 
    generateUserKeysAndWrappedPayload, 
    unwrapAndImportKeysFromPayload,
  } from '../../auth';
  import QRCode from 'qrcode';

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

  let currentStep: AuthStep = $state('loading');
  let errorMessage: string | null = $state(null);
  let userPrivateKey: CryptoKey | undefined = $state(undefined);
  let userPublicKey: CryptoKey | undefined = $state(undefined);

  let passwordInput: string = $state('');
  let wrappedKeyForExport: string | null = $state(null);
  let qrCodeImageDataUrl: string | null = $state(null);
  let wrappedKeyForImport: string = $state('');
  let qrMessageForImportStep: string | null = $state(null); // For messages from QR scan flow to ImportKeyStep

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
          // print digest of public key
          console.log("pub", userPublicKey)
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
    qrMessageForImportStep = null;
    errorMessage = null;
    currentStep = 'qrScanForImport';
    console.log("Transitioning to qrScanForImport step");
  }

  onDestroy(() => {
    // QR Scan cleanup is now handled by QrScanStep's own onDestroy
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
    qrMessageForImportStep = null;
    passwordInput = '';
    wrappedKeyForImport = '';
    wrappedKeyForExport = null;
    qrCodeImageDataUrl = null;
    // QR Scan cleanup is now handled by QrScanStep's own onDestroy
  }

</script>

<div class="w-full">
  {#if currentStep === 'loading'}
    <LoadingSpinner />
  {/if}

  {#if currentStep === 'initial'}
    <InitialStep oncreate={handleCreateUser} onimport={handleImportKey} />
  {/if}

  {#if currentStep === 'userReady'}
    <UserReadyStep publicKey={userPublicKey} />
  {/if}

  {#if currentStep === 'error'}
    <ErrorStep errorMessage={errorMessage} ontryagain={resetToInitial} />
  {/if}

  {#if currentStep === 'enterPasswordForCreate'}
    <CreatePasswordStep 
      bind:passwordInput 
      errorMessage={errorMessage}
      onsubmit={initiateUserCreationProcess} 
      onback={resetToInitial} 
    />
  {/if}

  {#if currentStep === 'qrExport'}
    <QrExportStep 
      qrCodeImageDataUrl={qrCodeImageDataUrl} 
      wrappedKeyForExport={wrappedKeyForExport} 
      ondone={() => currentStep = 'userReady'} 
      onbacktostart={resetToInitial} 
    />
  {/if}

  {#if currentStep === 'qrScanForImport'}
    <QrScanStep
      onscanned={(key) => {
        wrappedKeyForImport = key;
        passwordInput = ''; 
        errorMessage = null; 
        qrMessageForImportStep = null;
        currentStep = 'enterWrappedKeyForImport';
        console.log("QR scanned, transitioning to enterWrappedKeyForImport");
      }}
      onscanerror={(error) => {
        qrMessageForImportStep = error;
        errorMessage = null; // Clear general error, qrMessageForImportStep will show specific scan error
        currentStep = 'enterWrappedKeyForImport';
        console.log("QR scan error, transitioning to enterWrappedKeyForImport");
      }}
      onmanualinput={() => {
        qrMessageForImportStep = qrMessageForImportStep || "Switched to manual input.";
        errorMessage = null;
        passwordInput = '';
        currentStep = 'enterWrappedKeyForImport';
        console.log("Switched to manual input, transitioning to enterWrappedKeyForImport");
      }}
      onback={resetToInitial}
    />
  {/if}

  {#if currentStep === 'enterWrappedKeyForImport'}
    <ImportKeyStep
      bind:wrappedKeyForImport
      bind:passwordInput
      errorMessage={errorMessage}
      qrScanErrorMessage={qrMessageForImportStep}
      qrDataLoaded={!!(wrappedKeyForImport && !qrMessageForImportStep)}
      onsubmit={initiateUserImportProcess}
      onback={() => {
        resetToInitial();
        currentStep = 'initial'; // Go back to initial options
      }} 
    />
  {/if}
</div>
