// --- Empty functions as requested ---

function extractPublicKeyFromJWK(jwk: JsonWebKey): Uint8Array<ArrayBuffer> {
  const base64urlToBytes = (str: string) =>
    Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=')), c => c.charCodeAt(0));

  const dBytes = base64urlToBytes(jwk.d!);
  const d = BigInt('0x' + [...dBytes].map(b => b.toString(16).padStart(2, '0')).join(''));

  // P-384 curve parameters
  const p = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffff');
  const a = BigInt(-3);
  const b = BigInt('0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875a' +
                   'c656398d8a2ed19d2a85c8edd3ec2aef');
  const Gx = BigInt('0xaa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a38' +
                    '5502f25dbf55296c3a545e3872760ab7');
  const Gy = BigInt('0x3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c0' +
                    '0a60b1ce1d7e819d7a431d7c90ea0e5f');

  const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;

  function modInv(a: bigint, m: bigint) {
    let [t, newT] = [BigInt(0), BigInt(1)];
    let [r, newR] = [m, a];
    while (newR !== BigInt(0)) {
      const q = r / newR;
      [t, newT] = [newT, t - q * newT];
      [r, newR] = [newR, r - q * newR];
    }
    if (r > 1) throw new Error("Not invertible");
    return mod(t, m);
  }

  function pointAdd(P: bigint[] | null, Q: bigint[] | null): bigint[] | null {
    if (!P) return Q;
    if (!Q) return P;

    const [x1, y1] = P;
    const [x2, y2] = Q;

    if (x1 === x2 && y1 !== y2) return null;

    let m;
    if (x1 === x2 && y1 === y2) {
      const num = mod(3n * x1 * x1 + a, p);
      const den = modInv(2n * y1, p);
      m = mod(num * den, p);
    } else {
      const num = mod(y2 - y1, p);
      const den = modInv(x2 - x1, p);
      m = mod(num * den, p);
    }

    const x3 = mod(m * m - x1 - x2, p);
    const y3 = mod(m * (x1 - x3) - y1, p);
    return [x3, y3];
  }

  function scalarMult(k: bigint, P: bigint[]): bigint[] {
    let R: bigint[] | null = null;
    let N = P;
    while (k > 0n) {
      if (k & 1n) R = pointAdd(R, N);
      N = pointAdd(N, N)!;
      k >>= 1n;
    }
    return R!;
  }

  // Compute Q = d * G
  const [Qx, Qy] = scalarMult(d, [Gx, Gy]);

  // Format output in raw uncompressed point format: 0x04 || x || y
  const toBytes = (bn: bigint) => {
    let hex = bn.toString(16);
    while (hex.length < 96) hex = '0' + hex; // 384 bits = 48 bytes
    return Uint8Array.from(hex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
  };
  const uncompressedPoint = new Uint8Array(1 + 48 + 48);
  uncompressedPoint[0] = 0x04;
  uncompressedPoint.set(toBytes(Qx), 1);
  uncompressedPoint.set(toBytes(Qy), 1 + 48);

  return uncompressedPoint;
}

/**
 * Simulates the process of creating a new user.
 * This function is a placeholder and does not perform actual user creation.
 * It introduces a delay to mimic an asynchronous operation.
 */
async function createUser(): Promise<void> {
    console.log("Attempting to create a new user (simulation)...");
    // Simulate a delay (e.g., API call)
    const {publicKey, privateKey} = await window.crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-384",
      },
      true,
      ["sign", "verify"],
    );
    // const exportedPublic = await window.crypto.subtle.exportKey("raw", publicKey)
    const exportedPrivate = await window.crypto.subtle.exportKey("jwk", privateKey);
    const rawPublicKeyBuffer = await window.crypto.subtle.exportKey("raw", publicKey);
    const newPrivate = await window.crypto.subtle.importKey(
        "jwk",
        exportedPrivate,
        {
        name: "ECDSA",
        namedCurve: "P-384",
        },
        true,
        ["sign"],
    );
    console.log(newPrivate);
    // get newPublic from newPrivate
    // Compare
    const uncompressedPoint = extractPublicKeyFromJWK(exportedPrivate);
    const inputRaw = new Uint8Array(rawPublicKeyBuffer);
    const equal = inputRaw.length === uncompressedPoint.length &&
                    inputRaw.every((b, i) => b === uncompressedPoint[i]);

    console.log("Original public key (hex):", [...inputRaw].map(b => b.toString(16).padStart(2, '0')).join(''));
    console.log("Computed public key (hex):", [...uncompressedPoint].map(b => b.toString(16).padStart(2, '0')).join(''));
    console.log("Matches provided public key?", equal);

    console.log("User creation simulation complete.");
}

/**
 * Simulates saving additional user information.
 * This function is a placeholder and does not perform actual data saving.
 * @param {object} data - The user information to save.
 */
function saveInformation(data: Record<string, string>): void {
    console.log("Attempting to save user information (simulation):", data);
    // In a real application, you would send this data to a server or store it.
    console.log("User information 'saved' (simulation complete).");
}

// --- End of empty functions ---

export function initializeAuthFlow(): void {
    // DOM Elements
    const createUserSection = document.getElementById('createUserSection') as HTMLDivElement | null;
    const loadingSection = document.getElementById('loadingSection') as HTMLDivElement | null;
    const userCreatedSection = document.getElementById('userCreatedSection') as HTMLDivElement | null;
    const userInfoSection = document.getElementById('userInfoSection') as HTMLDivElement | null;
    const createUserButton = document.getElementById('createUserButton') as HTMLButtonElement | null;
    const userInfoForm = document.getElementById('userInfoForm') as HTMLFormElement | null;

    if (createUserButton) {
        createUserButton.addEventListener('click', async () => {
            // Hide create user section, show loading
            if (createUserSection) createUserSection.style.display = 'none';
            if (loadingSection) loadingSection.style.display = 'block';
            if (userCreatedSection) userCreatedSection.style.display = 'none';
            if (userInfoSection) userInfoSection.style.display = 'none';

            try {
                await createUser(); // Call the empty function that simulates delay

                // Hide loading, show user created message
                if (loadingSection) loadingSection.style.display = 'none';
                if (userCreatedSection) userCreatedSection.style.display = 'block';

                // After a brief moment, show the additional information form
                setTimeout(() => {
                    if (userCreatedSection) userCreatedSection.style.display = 'none'; // Optionally hide the "user created" message
                    if (userInfoSection) userInfoSection.style.display = 'block';
                }, 1500); // Show info form after 1.5 seconds

            } catch (error) {
                console.error("Error during user creation simulation:", error);
                // Handle error: show error message, revert to initial state, etc.
                if (loadingSection) loadingSection.style.display = 'none';
                if (createUserSection) createUserSection.style.display = 'block'; // Show create user section again
                alert("Simulation failed: Could not create user.");
            }
        });
    }

    if (userInfoForm) {
        userInfoForm.addEventListener('submit', (event: SubmitEvent) => {
            event.preventDefault(); // Prevent default form submission

            const formData = new FormData(userInfoForm);
            const data: Record<string, string> = {};
            formData.forEach((value, key) => {
                if (typeof value === 'string') {
                    data[key] = value;
                }
            });

            saveInformation(data); // Call the empty function

            alert("Information 'saved' (simulation - check console).");
            
            // Optionally, reset the form and UI
            userInfoForm.reset();
            if (userInfoSection) userInfoSection.style.display = 'none';
            if (createUserSection) createUserSection.style.display = 'block'; // Go back to initial state
        });
    }
}
