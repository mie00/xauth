// --- IndexedDB Utilities ---
export const DB_NAME = "AuthDB";
export const CRYPTO_KEYS_STORE_NAME = "CryptoKeys";
export const TRUSTED_ORIGINS_STORE_NAME = "TrustedOrigins"; // Renamed
export const PRIVATE_KEY_NAME = "userPrivateKey";
export const PUBLIC_KEY_NAME = "userPublicKey";

const DB_VERSION = 3; // Incremented version due to new object store name

export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CRYPTO_KEYS_STORE_NAME)) {
        db.createObjectStore(CRYPTO_KEYS_STORE_NAME);
      }
      // Create new store for trusted origins, using the origin string as the key.
      if (!db.objectStoreNames.contains(TRUSTED_ORIGINS_STORE_NAME)) {
        db.createObjectStore(TRUSTED_ORIGINS_STORE_NAME); 
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

export async function saveKey(key: CryptoKey, keyName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CRYPTO_KEYS_STORE_NAME, "readwrite");
    const store = transaction.objectStore(CRYPTO_KEYS_STORE_NAME);
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

export async function loadKey(keyName: string): Promise<CryptoKey | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CRYPTO_KEYS_STORE_NAME, "readonly");
    const store = transaction.objectStore(CRYPTO_KEYS_STORE_NAME);
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

export async function saveTrustedOrigin(origin: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TRUSTED_ORIGINS_STORE_NAME, "readwrite");
    const store = transaction.objectStore(TRUSTED_ORIGINS_STORE_NAME);
    // Store a simple object or boolean; the key (origin) is what matters for existence.
    const request = store.put(true, origin); 
    request.onsuccess = () => resolve();
    request.onerror = (event) => {
      console.error("Error saving trusted origin to IndexedDB:", (event.target as IDBRequest).error);
      reject("Error saving trusted origin");
    };
    transaction.oncomplete = () => {
      db.close();
    };
    transaction.onerror = (event) => {
      console.error("Transaction error saving trusted origin:", (event.target as IDBTransaction).error);
      reject("Transaction error saving trusted origin");
    };
  });
}

export async function isOriginTrusted(origin: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TRUSTED_ORIGINS_STORE_NAME, "readonly");
    const store = transaction.objectStore(TRUSTED_ORIGINS_STORE_NAME);
    const request = store.get(origin);
    request.onsuccess = (event) => {
      resolve(!!(event.target as IDBRequest).result); // Convert result to boolean
    };
    request.onerror = (event) => {
      console.error("Error checking trusted origin in IndexedDB:", (event.target as IDBRequest).error);
      reject("Error checking trusted origin");
    };
    transaction.oncomplete = () => {
      db.close();
    };
    transaction.onerror = (event) => {
      console.error("Transaction error checking trusted origin:", (event.target as IDBTransaction).error);
      reject("Transaction error checking trusted origin");
    };
  });
}
// --- End IndexedDB Utilities ---
