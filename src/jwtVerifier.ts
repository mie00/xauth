import { getPublicKeyDigest, type LoginTokenPayload } from './auth';

// Helper to convert Base64url string to ArrayBuffer
// JWT uses Base64url encoding
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  // Replace URL-safe characters and add padding if necessary
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

interface JwtHeader {
  alg: string;
  typ: string;
}

/**
 * Verifies a JWT login token and returns its payload if valid.
 *
 * @param jwtString The JWT string.
 * @param publicKey The public key to verify the signature and 'iss' claim.
 * @returns A promise that resolves to the LoginTokenPayload if the JWT is valid.
 * @throws Error if the JWT is invalid for any reason.
 */
export async function verifyLoginJWT(
  jwtString: string,
  publicKey: CryptoKey
): Promise<LoginTokenPayload> {
  try {
    const parts = jwtString.split('.');
    if (parts.length !== 3) {
      throw new Error("JWT Verifier: Invalid JWT structure (not three parts).");
    }

    const encodedHeader = parts[0];
    const encodedPayload = parts[1];
    const encodedSignature = parts[2];

    // 1. Decode Header
    const headerString = new TextDecoder().decode(base64UrlToArrayBuffer(encodedHeader));
    const header = JSON.parse(headerString) as JwtHeader;

    // 2. Check Algorithm
    if (header.alg !== "ES384" || header.typ !== "JWT") {
      throw new Error(`JWT Verifier: Invalid JWT header. Expected alg ES384 and typ JWT, got alg ${header.alg} and typ ${header.typ}.`);
    }

    // 3. Decode Payload
    const payloadString = new TextDecoder().decode(base64UrlToArrayBuffer(encodedPayload));
    const payload = JSON.parse(payloadString) as LoginTokenPayload;

    // 4. Verify Expiry (exp)
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSeconds) {
      throw new Error(`JWT Verifier: Token expired. Expiry: ${new Date(payload.exp * 1000)}, Current: ${new Date(nowSeconds * 1000)}`);
    }

    // 5. Verify Public Key (iss) - This claim has been removed from the JWT.
    // The public key passed to this function is now directly used for signature verification.
    // const expectedPublicKeyDigest = await getPublicKeyDigest(publicKey); // No longer needed
    // if (payload.iss !== expectedPublicKeyDigest) { // 'iss' is no longer in payload
    //   throw new Error(`JWT Verifier: Public key digest mismatch (iss claim). Expected: ${expectedPublicKeyDigest}, Got: ${payload.iss}`);
    // }

    // 6. Verify Signature
    const signatureData = base64UrlToArrayBuffer(encodedSignature);
    const dataToVerifyString = `${encodedHeader}.${encodedPayload}`;
    const dataToVerifyBuffer = new TextEncoder().encode(dataToVerifyString);

    const isValidSignature = await window.crypto.subtle.verify(
      {
        name: "ECDSA",
        hash: { name: "SHA-384" }, // Must match the 'alg' in the JWT header
      },
      publicKey,
      signatureData,
      dataToVerifyBuffer
    );

    if (!isValidSignature) {
      throw new Error("JWT Verifier: Signature verification failed.");
    }

    // If all checks pass, return the payload
    console.log("JWT Verifier: Token successfully verified.");
    return payload;
  } catch (error: any) {
    // Log the original error and re-throw a generic or specific error
    // If it's already an Error object from our checks, it will have a message.
    // If it's a parsing error or other unexpected error, wrap it.
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("JWT Verifier: Error during JWT verification:", errorMessage);
    throw new Error(`JWT Verifier: Verification failed. ${errorMessage}`);
  }
}


window.verifyLoginJWT = verifyLoginJWT;

// add verifyLoginJWT to window type
declare global {
  interface Window {
    verifyLoginJWT: typeof verifyLoginJWT;
  }
}
