// --- IndexedDB Utilities ---
const DB_NAME = "AuthDB";
const STORE_NAME = "CryptoKeys";
const PRIVATE_KEY_NAME = "userPrivateKey";
const PUBLIC_KEY_NAME = "userPublicKey";

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };
    request.onerror = (event) => {
      console.error("IndexedDB error opening database:", (event.target as IDBOpenDBRequest).error);
      reject("Error opening IndexedDB");
    };
  });
}

async function saveKey(key: CryptoKey, keyName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(key, keyName);
    request.onsuccess = () => resolve();
    request.onerror = (event) => {
      console.error("Error saving key to IndexedDB:", (event.target as IDBRequest).error);
      reject("Error saving key");
    };
    transaction.oncomplete = () => {
      // console.log(`Transaction completed for saving key: ${keyName}`);
      db.close();
    };
    transaction.onerror = (event) => {
      console.error("Transaction error saving key to IndexedDB:", (event.target as IDBTransaction).error);
      reject("Transaction error saving key");
    };
  });
}

async function loadKey(keyName: string): Promise<CryptoKey | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(keyName);
    request.onsuccess = (event) => {
      resolve((event.target as IDBRequest).result as CryptoKey | undefined);
    };
    request.onerror = (event) => {
      console.error("Error loading key from IndexedDB:", (event.target as IDBRequest).error);
      reject("Error loading key");
    };
    transaction.oncomplete = () => {
      // console.log(`Transaction completed for loading key: ${keyName}`);
      db.close();
    };
    transaction.onerror = (event) => {
      console.error("Transaction error loading key from IndexedDB:", (event.target as IDBTransaction).error);
      reject("Transaction error loading key");
    };
  });
}
import QRCode from 'qrcode';
import jsQR from 'jsqr';

// --- End IndexedDB Utilities ---

// --- Empty functions as requested ---

function extractPublicKeyFromJWK(jwk: JsonWebKey): Uint8Array {
  const base64urlToBytes = (str: string): Uint8Array =>
    Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=')), c => c.charCodeAt(0));

  if (!jwk.x || !jwk.y) {
    throw new Error("JWK must contain x and y coordinates for an EC public key.");
  }

  const xBytesDecoded = base64urlToBytes(jwk.x);
  const yBytesDecoded = base64urlToBytes(jwk.y);

  // P-384 coordinates are 48 bytes (384 bits)
  const coordLength = 48;

  const padToLength = (bytes: Uint8Array, length: number): Uint8Array => {
    if (bytes.length === length) {
      return bytes;
    }
    if (bytes.length > length) {
      // This case implies the coordinate data is longer than expected for P-384.
      // Standard behavior for uncompressed EC points is fixed length, so we might truncate from the left (most significant bytes).
      // However, for JWK, x and y are base64url of the minimal-length big-endian representation.
      // We'll take the last 'length' bytes, assuming it's a larger number than fits.
      return bytes.slice(bytes.length - length);
    }
    // Pad with leading zeros if shorter (standard for fixed-length integer representations)
    const padded = new Uint8Array(length);
    padded.set(bytes, length - bytes.length);
    return padded;
  };

  const xBytes = padToLength(xBytesDecoded, coordLength);
  const yBytes = padToLength(yBytesDecoded, coordLength);

  // Format output in raw uncompressed point format: 0x04 || x || y
  const uncompressedPoint = new Uint8Array(1 + coordLength + coordLength);
  uncompressedPoint[0] = 0x04; // Uncompressed point indicator
  uncompressedPoint.set(xBytes, 1);
  uncompressedPoint.set(yBytes, 1 + coordLength);

  return uncompressedPoint;
}

/**
 * Simulates the process of creating a new user.
 * This function is a placeholder and does not perform actual user creation.
 * It introduces a delay to mimic an asynchronous operation.
 */
async function createUser(): Promise<{
  newPrivate: CryptoKey;
  publicKey: CryptoKey;
  exportedPrivateJwk: JsonWebKey;
}> {
  console.log("Attempting to create a new user (key generation)...");
  // Generate an extractable private key first
  const { privateKey: originalPrivateKey } = await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-384",
    },
    true, // extractable = true, so we can get its JWK for QR code
    ["sign", "verify"], // "verify" is often included, though "sign" is primary for private key
  );
  const exportedPrivateJwk = await window.crypto.subtle.exportKey("jwk", originalPrivateKey);

  // Create the non-extractable private key for operational use and IndexedDB storage
  const newPrivate = await window.crypto.subtle.importKey(
    "jwk",
    exportedPrivateJwk, // Import from the JWK of the extractable key
    {
      name: "ECDSA",
      namedCurve: "P-384",
    },
    false, // extractable = false for the operational key
    ["sign"],
  );
  console.log("Operational non-extractable private key:", newPrivate);
  const uncompressedPoint = extractPublicKeyFromJWK(exportedPrivateJwk);

  // 1. Import the uncompressedPoint as a public CryptoKey
  const publicKey = await window.crypto.subtle.importKey(
    "raw",
    uncompressedPoint,
    {
      name: "ECDSA",
      namedCurve: "P-384",
    },
    true, // public keys are always extractable
    ["verify"],
  );
  console.log("Generated Public Key:", publicKey);

  return { newPrivate, publicKey, exportedPrivateJwk };
}

async function importJwkAsKeys(jwk: JsonWebKey): Promise<{ importedPrivateKey: CryptoKey; importedPublicKey: CryptoKey }> {
  // Validate JWK structure (basic check for private EC key)
  if (jwk.kty !== "EC" || !jwk.crv || !jwk.x || !jwk.y || !jwk.d) {
      throw new Error("Invalid or incomplete EC JWK structure provided for import.");
  }

  // Import the JWK as a non-extractable private key
  const importedPrivateKey = await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDSA",
      namedCurve: jwk.crv, // Use the curve from the JWK
    },
    false, // non-extractable
    ["sign"]
  );

  // Derive the public key from the imported private key's JWK data
  const uncompressedPoint = extractPublicKeyFromJWK(jwk); // Use the original JWK
  const importedPublicKey = await window.crypto.subtle.importKey(
    "raw",
    uncompressedPoint,
    {
      name: "ECDSA",
      namedCurve: jwk.crv, // Use the curve from the JWK
    },
    true, // public keys are always extractable
    ["verify"]
  );
  return { importedPrivateKey, importedPublicKey };
}


async function signAndVerify(newPrivate: CryptoKey, publicKey: CryptoKey): Promise<void> {
  // 2. Generate a test string and encode it
  const testString = "This is a test string for signing and verification.";
  const encodedData = new TextEncoder().encode(testString);
  console.log("Encoded data for signing:", encodedData);

  // 3. Sign the encoded string using the newPrivate key
  const signature = await window.crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-384" },
    },
    newPrivate, // The private key CryptoKey object
    encodedData, // The data to sign
  );
  console.log("Signature:", signature);

  // 4. Verify the signature using the imported public key
  const isValid = await window.crypto.subtle.verify(
    {
      name: "ECDSA",
      hash: { name: "SHA-384" },
    },
    publicKey, // The public key CryptoKey object
    signature, // The signature to verify
    encodedData, // The original data
  );

  // 5. Log the verification result
  if (isValid) {
    console.log("Signature verification successful!");
  } else {
    console.error("Signature verification failed.");
  }
}

// --- End of empty functions ---

export async function initializeAuthFlow(): Promise<void> { // Make async
  // DOM Elements
  const createUserSection = document.getElementById('createUserSection') as HTMLDivElement | null;
  const loadingSection = document.getElementById('loadingSection') as HTMLDivElement | null;
  const userCreatedSection = document.getElementById('userCreatedSection') as HTMLDivElement | null;
  // const userInfoSection = document.getElementById('userInfoSection') as HTMLDivElement | null; // Removed
  const createUserButton = document.getElementById('createUserButton') as HTMLButtonElement | null;
  // const userInfoForm = document.getElementById('userInfoForm') as HTMLFormElement | null; // Removed
  // New DOM elements for QR code section
  const qrCodeSection = document.getElementById('qrCodeSection') as HTMLDivElement | null;
  const qrCodeImage = document.getElementById('qrCodeImage') as HTMLImageElement | null;
  const qrCodeSavedButton = document.getElementById('qrCodeSavedButton') as HTMLButtonElement | null;
  // New DOM elements for QR import
  const importKeyButton = document.getElementById('importKeyButton') as HTMLButtonElement | null;
  const importKeySection = document.getElementById('importKeySection') as HTMLDivElement | null;
  const qrScannerVideo = document.getElementById('qrScannerVideo') as HTMLVideoElement | null;
  const qrScannerCanvas = document.getElementById('qrScannerCanvas') as HTMLCanvasElement | null;
  const qrScannerMessage = document.getElementById('qrScannerMessage') as HTMLParagraphElement | null;
  const cancelImportButton = document.getElementById('cancelImportButton') as HTMLButtonElement | null;

  let currentVideoStream: MediaStream | null = null;

  function stopCamera() {
    if (currentVideoStream) {
      currentVideoStream.getTracks().forEach(track => track.stop());
      currentVideoStream = null;
    }
    if (qrScannerVideo) {
      qrScannerVideo.srcObject = null;
      qrScannerVideo.pause(); // Ensure video is paused
      qrScannerVideo.load(); // Release resources
    }
  }

  async function handleImportKeyProcess() {
    if (!importKeySection || !qrScannerVideo || !qrScannerCanvas || !qrScannerMessage || !loadingSection || !createUserSection || !userCreatedSection /* || !userInfoSection - removed */) {
      console.error("One or more UI elements for import are missing.");
      return;
    }

    // UI updates for starting import
    if (createUserSection) createUserSection.style.display = 'none';
    if (loadingSection) loadingSection.style.display = 'none';
    importKeySection.style.display = 'block';
    qrScannerMessage.textContent = 'Requesting camera access...';

    try {
      currentVideoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      qrScannerVideo.srcObject = currentVideoStream;
      await qrScannerVideo.play(); // Ensure play() is awaited or handled as a promise

      const canvasContext = qrScannerCanvas.getContext('2d', { willReadFrequently: true });
      if (!canvasContext) {
        throw new Error("Could not get canvas context for QR scanning.");
      }

      qrScannerMessage.textContent = 'Scanning for QR code...';

      const tick = () => {
        if (!currentVideoStream || qrScannerVideo.readyState < qrScannerVideo.HAVE_METADATA) {
          if (currentVideoStream) requestAnimationFrame(tick); // Continue if stream active but video not ready
          return;
        }

        qrScannerCanvas.width = qrScannerVideo.videoWidth;
        qrScannerCanvas.height = qrScannerVideo.videoHeight;
        canvasContext.drawImage(qrScannerVideo, 0, 0, qrScannerCanvas.width, qrScannerCanvas.height);
        const imageData = canvasContext.getImageData(0, 0, qrScannerCanvas.width, qrScannerCanvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code && code.data) {
          stopCamera();
          qrScannerMessage.textContent = 'QR code detected. Processing...';
          importKeySection.style.display = 'none';
          if (loadingSection) loadingSection.style.display = 'block';

          setTimeout(async () => { // Introduce a small delay for UI to update
            try {
              const jwk = JSON.parse(code.data) as JsonWebKey;
              const { importedPrivateKey, importedPublicKey } = await importJwkAsKeys(jwk);

              await saveKey(importedPrivateKey, PRIVATE_KEY_NAME);
              await saveKey(importedPublicKey, PUBLIC_KEY_NAME);
              console.log("Keys imported from QR and saved to IndexedDB.");

              await signAndVerify(importedPrivateKey, importedPublicKey);

              if (loadingSection) loadingSection.style.display = 'none';
              if (userCreatedSection) userCreatedSection.style.display = 'block'; // Show success message and keep it
              // No longer transitioning to userInfoSection

            } catch (importError: any) {
              console.error("Error processing QR code or importing keys:", importError);
              stopCamera();
              if (loadingSection) loadingSection.style.display = 'none';
              importKeySection.style.display = 'block';
              qrScannerMessage.textContent = `Error: ${importError.message || "Could not import key."} Cancel and try again.`;
            }
          }, 100); // Small delay for UI transition
        } else {
          if (currentVideoStream) {
              requestAnimationFrame(tick);
          }
        }
      };
      requestAnimationFrame(tick);

    } catch (err: any) {
      console.error("Error accessing camera or starting scanner:", err);
      qrScannerMessage.textContent = `Error: ${err.message || "Could not access camera."} Check permissions.`;
      stopCamera();
      // Keep importKeySection visible to show the error
      importKeySection.style.display = 'block';
      if (createUserSection) createUserSection.style.display = 'none';
    }
  }

  // Try to load keys from IndexedDB on initialization
  let userPrivateKey: CryptoKey | undefined;
  let userPublicKey: CryptoKey | undefined;

  try {
    userPrivateKey = await loadKey(PRIVATE_KEY_NAME);
    userPublicKey = await loadKey(PUBLIC_KEY_NAME);
  } catch (error) {
    console.error("Error loading keys from IndexedDB on startup:", error);
    // UI could inform the user that previously saved keys could not be loaded.
  }

  if (userPrivateKey && userPublicKey) {
    console.log("User keys successfully loaded from IndexedDB.");
    // Keys exist, adjust UI to reflect this (e.g., skip creation step)
    if (createUserSection) createUserSection.style.display = 'none';
    if (loadingSection) loadingSection.style.display = 'none';
    if (userCreatedSection) userCreatedSection.style.display = 'block'; // Show success message
    // if (userInfoSection) userInfoSection.style.display = 'none'; // Removed

    // Demonstrate that the loaded keys can be used for cryptographic operations
    console.log("Attempting to sign and verify with loaded keys...");
    try {
      await signAndVerify(userPrivateKey, userPublicKey);
      console.log("Sign and verify with loaded keys was successful.");
    } catch (e) {
      console.error("Error during sign/verify with loaded keys:", e);
      // This could indicate corrupted keys or an issue with the IndexedDB data.
      // Fallback: Show an error and allow the user to re-create keys.
      if (userCreatedSection) userCreatedSection.style.display = 'none';
      if (createUserSection) createUserSection.style.display = 'block';
      alert("There was an error verifying your stored keys. You might need to create them again.");
      // Optionally, you could attempt to clear the problematic keys from IndexedDB here.
      // For example:
      // Promise.all([deleteKey(PRIVATE_KEY_NAME), deleteKey(PUBLIC_KEY_NAME)])
      //   .catch(delErr => console.error("Error deleting problematic keys:", delErr));
    }

    // The userCreatedSection is already visible and will remain so.
    // No timeout or transition to another section is needed.

  } else {
    console.log("No keys found in IndexedDB or keys failed to load. User creation flow will be active.");
    // No keys found, or loading failed. Ensure create user UI is visible.
    if (createUserSection) createUserSection.style.display = 'block'; // This section now has both buttons
    if (loadingSection) loadingSection.style.display = 'none';
    if (userCreatedSection) userCreatedSection.style.display = 'none';
    // if (userInfoSection) userInfoSection.style.display = 'none'; // Removed
    if (importKeySection) importKeySection.style.display = 'none'; // Ensure import section is hidden initially

    // Setup the create user button listener
    if (createUserButton) {
      createUserButton.addEventListener('click', async () => {
        // Hide initial choice section, show loading
        if (createUserSection) createUserSection.style.display = 'none'; // This is the section with two buttons
        if (loadingSection) loadingSection.style.display = 'block';
        if (userCreatedSection) userCreatedSection.style.display = 'none';
        // if (userInfoSection) userInfoSection.style.display = 'none'; // Removed
        if (qrCodeSection) qrCodeSection.style.display = 'none'; // This is for showing the QR to save
        if (importKeySection) importKeySection.style.display = 'none'; // Hide import section if it was somehow visible


        try {
          // Key creation logic remains the same, leading to QR display for backup
          const { newPrivate, publicKey, exportedPrivateJwk } = await createUser();

          // Generate QR code from the exportedPrivateJwk for backup
          const qrDataUrl = await QRCode.toDataURL(JSON.stringify(exportedPrivateJwk), {
            errorCorrectionLevel: 'M', // Medium error correction
            margin: 2, // Margin around QR code
            scale: 4, // Scale factor
            color: {
              dark: '#000000FF', // Black dots
              light: '#FFFFFFFF', // White background
            }
          });
          if (qrCodeImage) qrCodeImage.src = qrDataUrl;

          // Hide loading, show QR code section
          if (loadingSection) loadingSection.style.display = 'none';
          if (qrCodeSection) qrCodeSection.style.display = 'block';

          // Handle QR code saved confirmation
          if (qrCodeSavedButton) {
            qrCodeSavedButton.addEventListener('click', async () => {
              if (qrCodeSection) qrCodeSection.style.display = 'none';
              if (userCreatedSection) userCreatedSection.style.display = 'block';

              // Save keys to IndexedDB
              try {
                await saveKey(newPrivate, PRIVATE_KEY_NAME);
                await saveKey(publicKey, PUBLIC_KEY_NAME);
                console.log("Private (non-extractable) and Public keys saved to IndexedDB after QR confirmation.");
              } catch (saveError) {
                console.error("Error saving keys to IndexedDB after QR confirmation:", saveError);
                alert("Error saving keys. Please try again or contact support.");
                if (userCreatedSection) userCreatedSection.style.display = 'none';
                if (createUserSection) createUserSection.style.display = 'block'; // Allow to try again
                return;
              }

              // Sign and verify with the newly stored keys
              try {
                await signAndVerify(newPrivate, publicKey);
              } catch (signVerifyError) {
                console.error("Error during sign/verify after QR confirmation:", signVerifyError);
                // This might not be critical enough to stop the user flow if keys are saved,
                // but it's important to log.
              }

              // The userCreatedSection is already visible from the click handler.
              // No timeout or transition to another section is needed.
            }, { once: true }); // Ensure this listener fires only once per button instance
          }

        } catch (error) {
          console.error("Error during user creation or QR generation:", error);
          if (loadingSection) loadingSection.style.display = 'none';
          if (createUserSection) createUserSection.style.display = 'block';
          alert("Failed to create user or generate QR code. Please try again.");
        }
      });
    }

    // Setup the import key button listener
    if (importKeyButton) {
      importKeyButton.addEventListener('click', () => {
        handleImportKeyProcess();
      });
    }

    // Setup the cancel import button listener
    if (cancelImportButton) {
      cancelImportButton.addEventListener('click', () => {
        stopCamera();
        if (importKeySection) importKeySection.style.display = 'none';
        if (qrScannerMessage) qrScannerMessage.textContent = '';
        if (createUserSection) createUserSection.style.display = 'block'; // Show initial choice section
        if (loadingSection) loadingSection.style.display = 'none';
      });
    }

    // Removed userInfoForm event listener as the form itself is removed.
  }
}
