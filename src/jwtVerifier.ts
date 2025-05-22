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
 * Verifies a JWT login token.
 *
 * @param jwtString The JWT string.
 * @param expectedCallbackUrl The expected callback URL (must match the 'sub' claim).
 * @param publicKey The public key to verify the signature and 'iss' claim.
 * @returns A promise that resolves to true if the JWT is valid, false otherwise.
 */
export async function verifyLoginJWT(
  jwtString: string,
  expectedCallbackUrl: string,
  publicKey: CryptoKey
): Promise<boolean> {
  try {
    const parts = jwtString.split('.');
    if (parts.length !== 3) {
      console.error("JWT Verifier: Invalid JWT structure (not three parts).");
      return false;
    }

    const encodedHeader = parts[0];
    const encodedPayload = parts[1];
    const encodedSignature = parts[2];

    // 1. Decode Header
    const headerString = new TextDecoder().decode(base64UrlToArrayBuffer(encodedHeader));
    const header = JSON.parse(headerString) as JwtHeader;

    // 2. Check Algorithm
    if (header.alg !== "ES384" || header.typ !== "JWT") {
      console.error(`JWT Verifier: Invalid JWT header. Expected alg ES384 and typ JWT, got alg ${header.alg} and typ ${header.typ}.`);
      return false;
    }

    // 3. Decode Payload
    const payloadString = new TextDecoder().decode(base64UrlToArrayBuffer(encodedPayload));
    const payload = JSON.parse(payloadString) as LoginTokenPayload;

    // 4. Verify Expiry (exp)
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSeconds) {
      console.error(`JWT Verifier: Token expired. Expiry: ${new Date(payload.exp * 1000)}, Current: ${new Date(nowSeconds * 1000)}`);
      return false;
    }

    // 5. Verify Callback URL (sub)
    if (payload.sub !== expectedCallbackUrl) {
      console.error(`JWT Verifier: Callback URL mismatch. Expected: ${expectedCallbackUrl}, Got: ${payload.sub}`);
      return false;
    }

    // 6. Verify Public Key (iss)
    const expectedPublicKeyDigest = await getPublicKeyDigest(publicKey);
    if (payload.iss !== expectedPublicKeyDigest) {
      console.error(`JWT Verifier: Public key digest mismatch (iss claim). Expected: ${expectedPublicKeyDigest}, Got: ${payload.iss}`);
      return false;
    }

    // 7. Verify Signature
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
      console.error("JWT Verifier: Signature verification failed.");
      return false;
    }

    console.log("JWT Verifier: Token successfully verified.");
    return true;
  } catch (error: any) {
    console.error("JWT Verifier: Error during JWT verification:", error.message || error);
    return false;
  }
}
