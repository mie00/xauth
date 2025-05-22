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

// --- Cryptographic Helper Functions for Wrapping/Unwrapping ---

const PBKDF2_ITERATIONS = 100000; // Number of iterations for PBKDF2
const AES_KEY_ALGORITHM = { name: "AES-GCM", length: 256 };
const WRAPPING_ALGORITHM = { name: "AES-GCM" }; // IV will be generated per wrap

// Helper to convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}


async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordBuffer = new TextEncoder().encode(password);
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    AES_KEY_ALGORITHM,
    true, // The derived key needs to be extractable: false, usages: ['wrapKey', 'unwrapKey']
    ["wrapKey", "unwrapKey"]
  );
}

interface WrappedKeyPayload {
  salt: string; // base64
  iv: string;   // base64
  cipherText: string; // base64 of wrapped key (ArrayBuffer)
  keyAlgorithmName: string;
  keyAlgorithmNamedCurve?: string;
  keyExtractable: boolean;
  keyUsages: KeyUsage[];
}

async function wrapPrivateKeyWithPassword(
  privateKeyToWrap: CryptoKey, // This is the extractable private key
  password: string
): Promise<WrappedKeyPayload> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const wrappingKey = await deriveKeyFromPassword(password, salt);
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // AES-GCM recommended IV size

  const wrappedKeyBuffer = await window.crypto.subtle.wrapKey(
    "jwk", // Format of the key to be wrapped
    privateKeyToWrap,
    wrappingKey,
    { ...WRAPPING_ALGORITHM, iv: iv } // AES-GCM parameters
  );

  // Get metadata from the key being wrapped
  const jwk = await window.crypto.subtle.exportKey("jwk", privateKeyToWrap);

  return {
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv),
    cipherText: arrayBufferToBase64(wrappedKeyBuffer),
    keyAlgorithmName: jwk.kty === "EC" ? "ECDSA" : jwk.kty || "Unknown", // Assuming EC or other kty
    keyAlgorithmNamedCurve: jwk.crv,
    keyExtractable: privateKeyToWrap.extractable, // Should be true
    keyUsages: privateKeyToWrap.usages, // e.g. ["sign", "verify"]
  };
}

async function unwrapPrivateKeyWithPassword(
  payload: WrappedKeyPayload,
  password: string
): Promise<CryptoKey> { // Returns the unwrapped (original, extractable) private key
  const salt = base64ToArrayBuffer(payload.salt);
  const iv = base64ToArrayBuffer(payload.iv);
  const wrappedKeyBuffer = base64ToArrayBuffer(payload.cipherText);

  const wrappingKey = await deriveKeyFromPassword(password, salt);

  const unwrappedKeyAlgorithm: EcKeyImportParams | RsaHashedImportParams = payload.keyAlgorithmName === "ECDSA"
    ? { name: payload.keyAlgorithmName, namedCurve: payload.keyAlgorithmNamedCurve! }
    : { name: payload.keyAlgorithmName, hash: {name: "SHA-256"} }; // Adjust if other key types are used

  return window.crypto.subtle.unwrapKey(
    "jwk", // Format of the wrapped key
    wrappedKeyBuffer,
    wrappingKey,
    { ...WRAPPING_ALGORITHM, iv: iv }, // AES-GCM parameters
    unwrappedKeyAlgorithm, // Algorithm of the key being unwrapped
    payload.keyExtractable, // Should be true to re-export as JWK
    payload.keyUsages // Usages of the key being unwrapped
  );
}

// --- End Cryptographic Helper Functions ---


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
  // Export password elements
  const passwordForExportDiv = document.getElementById('passwordForExportDiv') as HTMLDivElement | null;
  const exportPasswordInput = document.getElementById('exportPassword') as HTMLInputElement | null;
  const confirmExportPasswordInput = document.getElementById('confirmExportPassword') as HTMLInputElement | null;
  const exportPasswordError = document.getElementById('exportPasswordError') as HTMLParagraphElement | null;
  const confirmPasswordAndGenerateQRButton = document.getElementById('confirmPasswordAndGenerateQRButton') as HTMLButtonElement | null;
  const qrDisplayDiv = document.getElementById('qrDisplayDiv') as HTMLDivElement | null;

  // New DOM elements for QR import
  const importKeyButton = document.getElementById('importKeyButton') as HTMLButtonElement | null;
  const importKeySection = document.getElementById('importKeySection') as HTMLDivElement | null;
  const qrScannerVideo = document.getElementById('qrScannerVideo') as HTMLVideoElement | null;
  const qrScannerCanvas = document.getElementById('qrScannerCanvas') as HTMLCanvasElement | null;
  const qrScannerMessage = document.getElementById('qrScannerMessage') as HTMLParagraphElement | null;
  const cancelImportButton = document.getElementById('cancelImportButton') as HTMLButtonElement | null;
  // Import password elements
  const qrVideoScannerDiv = document.getElementById('qrVideoScannerDiv') as HTMLDivElement | null;
  const passwordForImportDiv = document.getElementById('passwordForImportDiv') as HTMLDivElement | null;
  const importPasswordInput = document.getElementById('importPassword') as HTMLInputElement | null;
  const importPasswordError = document.getElementById('importPasswordError') as HTMLParagraphElement | null;
  const decryptKeyButton = document.getElementById('decryptKeyButton') as HTMLButtonElement | null;


  let currentVideoStream: MediaStream | null = null;
  let scannedQrData: WrappedKeyPayload | null = null; // To store scanned QR data before password input

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

  async function handleImportKeyProcess() { // This function now initiates scanning OR decryption
    if (!importKeySection || !qrVideoScannerDiv || !passwordForImportDiv || !qrScannerVideo || !qrScannerCanvas || !qrScannerMessage || !loadingSection || !createUserSection || !userCreatedSection || !importPasswordInput || !decryptKeyButton || !importPasswordError) {
      console.error("One or more UI elements for import are missing.");
      return;
    }

    // UI updates for starting import
    if (createUserSection) createUserSection.style.display = 'none';
    if (loadingSection) loadingSection.style.display = 'none';
    importKeySection.style.display = 'block';
    qrVideoScannerDiv.style.display = 'block'; // Show scanner first
    passwordForImportDiv.style.display = 'none'; // Hide password input initially
    qrScannerMessage.textContent = 'Requesting camera access...';
    importPasswordError.textContent = '';


    try {
      currentVideoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (!qrScannerVideo) throw new Error("QR Scanner video element not found after getUserMedia");
      qrScannerVideo.srcObject = currentVideoStream;
      await qrScannerVideo.play();

      if (!qrScannerCanvas) throw new Error("QR Scanner canvas element not found");
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
          qrScannerMessage.textContent = 'QR code detected. Enter password to decrypt.';
          if (qrVideoScannerDiv) qrVideoScannerDiv.style.display = 'none';
          if (passwordForImportDiv) passwordForImportDiv.style.display = 'block';
          if (importPasswordInput) importPasswordInput.value = ''; // Clear previous attempts
          if (importPasswordError) importPasswordError.textContent = '';

          try {
            scannedQrData = JSON.parse(code.data) as WrappedKeyPayload;
            // Basic validation of scanned data structure
            if (!scannedQrData || !scannedQrData.salt || !scannedQrData.iv || !scannedQrData.cipherText || !scannedQrData.keyAlgorithmName || !scannedQrData.keyUsages) {
                throw new Error("Invalid QR code data structure.");
            }
          } catch (parseError: any) {
            console.error("Error parsing QR code data:", parseError);
            if (importKeySection) importKeySection.style.display = 'block'; // Keep import section visible
            if (qrVideoScannerDiv) qrVideoScannerDiv.style.display = 'block'; // Show scanner again
            if (passwordForImportDiv) passwordForImportDiv.style.display = 'none';
            if (qrScannerMessage) qrScannerMessage.textContent = `Error: Invalid QR code format. ${parseError.message || ""}`;
            scannedQrData = null;
            return; // Stop processing
          }
          // Now wait for user to enter password and click "Decrypt Key"
          // The event listener for decryptKeyButton will handle the rest.

        } else {
          if (currentVideoStream) { // Only continue if stream is active
              requestAnimationFrame(tick);
          }
        }
      };
      requestAnimationFrame(tick);

    } catch (err: any) {
      console.error("Error accessing camera or starting scanner:", err);
      if (qrScannerMessage) qrScannerMessage.textContent = `Error: ${err.message || "Could not access camera."} Check permissions.`;
      stopCamera();
      // Keep importKeySection visible to show the error, but ensure scanner part is shown if appropriate
      if (importKeySection) importKeySection.style.display = 'block';
      if (qrVideoScannerDiv) qrVideoScannerDiv.style.display = 'block';
      if (passwordForImportDiv) passwordForImportDiv.style.display = 'none';
      if (createUserSection) createUserSection.style.display = 'none';
    }
  }


  if (decryptKeyButton) {
    decryptKeyButton.addEventListener('click', async () => {
      if (!scannedQrData || !importPasswordInput || !loadingSection || !userCreatedSection || !importKeySection || !importPasswordError) {
        console.error("Missing data or elements for decryption.");
        if (importPasswordError) importPasswordError.textContent = "Internal error. Please cancel and retry.";
        return;
      }
      const password = importPasswordInput.value;
      if (!password) {
        importPasswordError.textContent = "Password cannot be empty.";
        return;
      }
      importPasswordError.textContent = ""; // Clear previous errors

      if (importKeySection) importKeySection.style.display = 'none'; // Hide import section (password input)
      if (loadingSection) loadingSection.style.display = 'block';

      try {
        const unwrappedPrivateKey = await unwrapPrivateKeyWithPassword(scannedQrData, password);
        // The unwrappedPrivateKey is the original extractable private key.
        // Now, convert it to JWK and then import it as non-extractable for operational use.
        const unwrappedJwk = await window.crypto.subtle.exportKey("jwk", unwrappedPrivateKey);

        const { importedPrivateKey, importedPublicKey } = await importJwkAsKeys(unwrappedJwk);

        await saveKey(importedPrivateKey, PRIVATE_KEY_NAME);
        await saveKey(importedPublicKey, PUBLIC_KEY_NAME);
        console.log("Keys imported from QR, decrypted, and saved to IndexedDB.");

        await signAndVerify(importedPrivateKey, importedPublicKey);

        if (loadingSection) loadingSection.style.display = 'none';
        if (userCreatedSection) userCreatedSection.style.display = 'block';
        scannedQrData = null; // Clear stored QR data
        if (importPasswordInput) importPasswordInput.value = '';


      } catch (decryptError: any) {
        console.error("Error decrypting or processing key:", decryptError);
        if (loadingSection) loadingSection.style.display = 'none';
        if (importKeySection) importKeySection.style.display = 'block'; // Show import section again
        if (passwordForImportDiv) passwordForImportDiv.style.display = 'block'; // Show password input again
        if (importPasswordError) importPasswordError.textContent = `Decryption failed: ${decryptError.message || "Incorrect password or corrupted data."}`;
        // Do not clear scannedQrData here, allow user to retry password
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
        if (qrCodeSection) qrCodeSection.style.display = 'none';
        if (importKeySection) importKeySection.style.display = 'none';
        if (passwordForExportDiv) passwordForExportDiv.style.display = 'block'; // Show password input first
        if (qrDisplayDiv) qrDisplayDiv.style.display = 'none'; // Hide QR display initially
        if (exportPasswordError) exportPasswordError.textContent = '';
        if (exportPasswordInput) exportPasswordInput.value = '';
        if (confirmExportPasswordInput) confirmExportPasswordInput.value = '';


        try {
          // Step 1: Generate the extractable private key (originalPrivateKey)
          // The createUser() function already returns `exportedPrivateJwk` which is from an extractable key.
          // We need the actual CryptoKey object that is extractable.
          const { privateKey: originalExtractablePrivateKey } = await window.crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-384" }, true, ["sign", "verify"]
          );

          // Hide loading, show QR code section (which now starts with password input)
          if (loadingSection) loadingSection.style.display = 'none';
          if (qrCodeSection) qrCodeSection.style.display = 'block';


          if (confirmPasswordAndGenerateQRButton) {
            confirmPasswordAndGenerateQRButton.onclick = async () => { // Use .onclick to easily replace if needed
              if (!exportPasswordInput || !confirmExportPasswordInput || !exportPasswordError || !qrCodeImage || !passwordForExportDiv || !qrDisplayDiv || !loadingSection) return;

              const password = exportPasswordInput.value;
              const confirmPassword = confirmExportPasswordInput.value;

              if (!password || !confirmPassword) {
                exportPasswordError.textContent = "Both password fields are required.";
                return;
              }
              if (password !== confirmPassword) {
                exportPasswordError.textContent = "Passwords do not match.";
                return;
              }
              exportPasswordError.textContent = "";
              passwordForExportDiv.style.display = 'none'; // Hide password inputs
              loadingSection.style.display = 'block'; // Show loading while wrapping

              try {
                const wrappedPayload = await wrapPrivateKeyWithPassword(originalExtractablePrivateKey, password);
                const qrDataUrl = await QRCode.toDataURL(JSON.stringify(wrappedPayload), {
                  errorCorrectionLevel: 'M', margin: 2, scale: 4,
                  color: { dark: '#000000FF', light: '#FFFFFFFF' }
                });
                qrCodeImage.src = qrDataUrl;
                loadingSection.style.display = 'none';
                qrDisplayDiv.style.display = 'block'; // Show QR code and save button

              } catch (wrapError: any) {
                console.error("Error wrapping key or generating QR:", wrapError);
                loadingSection.style.display = 'none';
                passwordForExportDiv.style.display = 'block'; // Show password inputs again
                exportPasswordError.textContent = `Error: ${wrapError.message || "Could not generate QR."}`;
              }
            };
          }

          if (qrCodeSavedButton) {
            qrCodeSavedButton.onclick = async () => { // Use .onclick
              if (qrCodeSection) qrCodeSection.style.display = 'none';
              if (userCreatedSection) userCreatedSection.style.display = 'block';

              // Now, create the non-extractable key for operational use from originalExtractablePrivateKey
              // and save it.
              try {
                const jwk = await window.crypto.subtle.exportKey("jwk", originalExtractablePrivateKey);
                const { importedPrivateKey: operationalPrivateKey, importedPublicKey } = await importJwkAsKeys(jwk);
                // importJwkAsKeys creates a non-extractable private key.

                await saveKey(operationalPrivateKey, PRIVATE_KEY_NAME);
                await saveKey(importedPublicKey, PUBLIC_KEY_NAME);
                console.log("Operational keys saved to IndexedDB after QR confirmation.");

                await signAndVerify(operationalPrivateKey, importedPublicKey);
              } catch (saveError: any) {
                console.error("Error saving operational keys to IndexedDB:", saveError);
                alert("Error saving keys. Please try again or contact support.");
                if (userCreatedSection) userCreatedSection.style.display = 'none';
                if (createUserSection) createUserSection.style.display = 'block';
              }
            };
          }

        } catch (error) {
          console.error("Error during initial key generation for export:", error);
          if (loadingSection) loadingSection.style.display = 'none';
          if (createUserSection) createUserSection.style.display = 'block';
          alert("Failed to initialize key creation. Please try again.");
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
        scannedQrData = null; // Clear any scanned data
        if (importKeySection) importKeySection.style.display = 'none';
        if (qrScannerMessage) qrScannerMessage.textContent = '';
        if (importPasswordInput) importPasswordInput.value = '';
        if (importPasswordError) importPasswordError.textContent = '';
        if (createUserSection) createUserSection.style.display = 'block'; // Show initial choice section
        if (loadingSection) loadingSection.style.display = 'none';
      });
    }

    // Removed userInfoForm event listener as the form itself is removed.
  }
}
