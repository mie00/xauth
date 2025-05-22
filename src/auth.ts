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

// Helper to convert ArrayBuffer to Base64url string
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  return arrayBufferToBase64(buffer)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Helper to convert a UTF-8 string to Base64url string
function stringToBase64Url(str: string): string {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(str);
  return arrayBufferToBase64Url(buffer);
}

// Helper to convert ArrayBuffer to Hex string
function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
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

export async function wrapPrivateKeyWithPassword(
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

export async function unwrapPrivateKeyWithPassword(
  payload: WrappedKeyPayload,
  password: string
): Promise<CryptoKey> { // Returns the unwrapped (original, extractable) private key
  const salt = base64ToArrayBuffer(payload.salt);
  const iv = base64ToArrayBuffer(payload.iv);
  const wrappedKeyBuffer = base64ToArrayBuffer(payload.cipherText);

  const wrappingKey = await deriveKeyFromPassword(password, new Uint8Array(salt));

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

// --- Login Token Functions ---

export async function getPublicKeyDigest(publicKey: CryptoKey): Promise<string> {
  // Export the public key in SPKI format
  const publicKeySpki = await window.crypto.subtle.exportKey('spki', publicKey);
  // Hash the SPKI representation using SHA-256
  const digestBuffer = await window.crypto.subtle.digest('SHA-256', publicKeySpki);
  // Convert the digest to a hex string
  return arrayBufferToHex(digestBuffer);
}

export interface LoginTokenPayload {
  iss: string; // Issuer: Hex encoded SHA-256 digest of the public key
  sub: string; // Subject: The callback URL
  exp: number; // Expiry timestamp in seconds since epoch (JWT standard)
  iat: number; // Issued at timestamp in seconds since epoch (JWT standard)
  cstm_dat?: string; // For custom payload data from query param
}

export async function createSignedLoginToken(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  callbackUrl: string,
  customPayloadData?: string | null
): Promise<string> { // Returns the full JWT string
  const publicKeyDigest = await getPublicKeyDigest(publicKey);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expirySeconds = nowSeconds + (24 * 60 * 60); // 1 day from now in seconds

  // JWT Header
  const header = {
    alg: "ES384", // ECDSA using P-384 curve and SHA-384 hash
    typ: "JWT"
  };
  const encodedHeader = stringToBase64Url(JSON.stringify(header));

  // JWT Payload
  const payload: LoginTokenPayload = {
    iss: publicKeyDigest,
    sub: callbackUrl,
    exp: expirySeconds,
    iat: nowSeconds,
  };
  if (customPayloadData) {
    payload.cstm_dat = customPayloadData;
  }
  const encodedPayload = stringToBase64Url(JSON.stringify(payload));

  // Data to sign
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signingInputBuffer = new TextEncoder().encode(signingInput);

  // Sign the data
  const signatureBuffer = await window.crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-384" }, // Must match alg in header
    },
    privateKey,
    signingInputBuffer
  );

  const encodedSignature = arrayBufferToBase64Url(signatureBuffer);

  // Assemble the JWT
  return `${signingInput}.${encodedSignature}`;
}

// --- End Login Token Functions ---

export async function generateUserKeysAndWrappedPayload(password: string): Promise<{
  operationalPrivateKey: CryptoKey; // Non-extractable
  publicKey: CryptoKey;
  wrappedKeyJSON: string;
}> {
  // 1. Generate extractable key pair
  const keyPair = await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-384" },
    true, // private key needs to be extractable for wrapping
    ["sign", "verify"] // Usages for the extractable private key
  ) as CryptoKeyPair;

  const extractablePrivateKey = keyPair.privateKey;
  const generatedPublicKey = keyPair.publicKey;

  // 2. Wrap the extractable private key
  const wrappedPayload = await wrapPrivateKeyWithPassword(extractablePrivateKey, password);
  const wrappedKeyJSON = JSON.stringify(wrappedPayload, null, 2);

  // 3. Create a non-extractable version of the private key for operational use
  const jwkPrivate = await window.crypto.subtle.exportKey("jwk", extractablePrivateKey);
  
  // Import the JWK as a non-extractable private key
  const operationalPrivateKey = await window.crypto.subtle.importKey(
    "jwk",
    jwkPrivate, // The JWK of the private key
    { name: "ECDSA", namedCurve: "P-384" },
    false, // NON-EXTRACTABLE
    ["sign"] // Only "sign" usage for the operational private key
  );

  return {
    operationalPrivateKey,
    publicKey: generatedPublicKey,
    wrappedKeyJSON,
  };
}

export async function unwrapAndImportKeysFromPayload(
  wrappedKeyJSON: string,
  password: string
): Promise<{ importedPrivateKey: CryptoKey; importedPublicKey: CryptoKey }> {
  const payload = JSON.parse(wrappedKeyJSON);
  const unwrappedExtractablePrivateKey = await unwrapPrivateKeyWithPassword(payload, password);

  // Convert this CryptoKey (which is extractable) into a JWK
  const privateJwk = await window.crypto.subtle.exportKey("jwk", unwrappedExtractablePrivateKey);

  // importJwkAsKeys will create a non-extractable private key and its public key
  return importJwkAsKeys(privateJwk);
}


// --- Key Management and Utility Functions ---

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

export async function importJwkAsKeys(jwk: JsonWebKey): Promise<{ importedPrivateKey: CryptoKey; importedPublicKey: CryptoKey }> {
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


export async function signAndVerify(newPrivate: CryptoKey, publicKey: CryptoKey): Promise<void> {
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
