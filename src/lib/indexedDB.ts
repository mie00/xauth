// --- IndexedDB Utilities ---
export const DB_NAME = "AuthDB";
export const CRYPTO_KEYS_STORE_NAME = "CryptoKeys";
export const TRUSTED_CALLBACKS_STORE_NAME = "TrustedCallbacks";
export const PRIVATE_KEY_NAME = "userPrivateKey";
export const PUBLIC_KEY_NAME = "userPublicKey";

const DB_VERSION = 2; // Incremented version due to new object store

export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CRYPTO_KEYS_STORE_NAME)) {
        db.createObjectStore(CRYPTO_KEYS_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(TRUSTED_CALLBACKS_STORE_NAME)) {
        // Using the URL itself as the key path. URLs are unique.
        db.createObjectStore(TRUSTED_CALLBACKS_STORE_NAME); 
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

export async function saveTrustedCallbackUrl(url: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TRUSTED_CALLBACKS_STORE_NAME, "readwrite");
    const store = transaction.objectStore(TRUSTED_CALLBACKS_STORE_NAME);
    // Store a simple object or boolean; the key (URL) is what matters for existence.
    const request = store.put(true, url); 
    request.onsuccess = () => resolve();
    request.onerror = (event) => {
      console.error("Error saving trusted callback URL to IndexedDB:", (event.target as IDBRequest).error);
      reject("Error saving trusted callback URL");
    };
    transaction.oncomplete = () => {
      db.close();
    };
    transaction.onerror = (event) => {
      console.error("Transaction error saving trusted callback URL:", (event.target as IDBTransaction).error);
      reject("Transaction error saving trusted callback URL");
    };
  });
}

export async function isCallbackUrlTrusted(url: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TRUSTED_CALLBACKS_STORE_NAME, "readonly");
    const store = transaction.objectStore(TRUSTED_CALLBACKS_STORE_NAME);
    const request = store.get(url);
    request.onsuccess = (event) => {
      resolve(!!(event.target as IDBRequest).result); // Convert result to boolean
    };
    request.onerror = (event) => {
      console.error("Error checking trusted callback URL in IndexedDB:", (event.target as IDBRequest).error);
      reject("Error checking trusted callback URL");
    };
    transaction.oncomplete = () => {
      db.close();
    };
    transaction.onerror = (event) => {
      console.error("Transaction error checking trusted callback URL:", (event.target as IDBTransaction).error);
      reject("Transaction error checking trusted callback URL");
    };
  });
}
// --- End IndexedDB Utilities ---
