// Akki offline: keeps the data on this phone (IndexedDB). Nothing is sent anywhere.
// A "backend" only needs get(key), set(key, value), remove(key). That makes it easy to test.

export function indexedDbBackend(name = "akki-offline") {
  let dbPromise;
  const open = () => dbPromise || (dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
  const run = async (mode, action) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("kv", mode);
      const result = action(transaction.objectStore("kv"));
      transaction.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  };
  return {
    get: (key) => run("readonly", (store) => store.get(key)),
    set: (key, value) => run("readwrite", (store) => store.put(value, key)),
    remove: (key) => run("readwrite", (store) => store.delete(key)),
  };
}

export function localStorageBackend(prefix = "akki-offline:") {
  return {
    get: async (key) => { const raw = localStorage.getItem(prefix + key); return raw === null ? undefined : JSON.parse(raw); },
    set: async (key, value) => { localStorage.setItem(prefix + key, JSON.stringify(value)); },
    remove: async (key) => { localStorage.removeItem(prefix + key); },
  };
}

export function memoryBackend() {
  const map = new Map();
  return {
    get: async (key) => (map.has(key) ? structuredClone(map.get(key)) : undefined),
    set: async (key, value) => { map.set(key, structuredClone(value)); },
    remove: async (key) => { map.delete(key); },
  };
}

const STATE_KEY = "state";

export function createStorage(backend) {
  let timer = null;
  let pending = null;
  let lastError = null;
  let writing = Promise.resolve();

  const write = (state) => {
    writing = writing.then(() => backend.set(STATE_KEY, state)).then(() => { lastError = null; }).catch((error) => { lastError = error; console.error("Could not save", error); });
    return writing;
  };

  return {
    async load() { return (await backend.get(STATE_KEY)) || null; },
    /** Saves a moment after the last change, so typing and quick taps do not write again and again. */
    save(state, delayMs = 300) {
      pending = state;
      clearTimeout(timer);
      timer = setTimeout(() => { const value = pending; pending = null; timer = null; write(value); }, delayMs);
    },
    /** Saves right now (used when the app is closed or hidden). */
    async flush() {
      if (pending) { clearTimeout(timer); const value = pending; pending = null; timer = null; await write(value); }
      else await writing;
    },
    async saveNow(state) { clearTimeout(timer); pending = null; timer = null; await write(state); },
    get lastError() { return lastError; },
    // Receipt photos are kept apart from the main data, so saving stays fast.
    saveReceipt: (id, dataUrl) => backend.set(`receipt:${id}`, dataUrl),
    loadReceipt: (id) => backend.get(`receipt:${id}`),
    removeReceipt: (id) => backend.remove(`receipt:${id}`),
  };
}

/** Picks IndexedDB, or localStorage when IndexedDB is not available. */
export function defaultBackend() {
  try { if (typeof indexedDB !== "undefined" && indexedDB) return indexedDbBackend(); } catch { /* fall through */ }
  return localStorageBackend();
}

/** Asks the phone not to throw this data away when it needs space. */
export async function keepDataSafe() {
  try { return Boolean(navigator.storage && navigator.storage.persist && await navigator.storage.persist()); } catch { return false; }
}
