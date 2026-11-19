// Where the task cache persists between plugin loads.
//
// The cache used to live in the vault, first as one shared cache.json and
// then as cache-<deviceId>.json per device. A per-device file still
// conflicts under self-hosted LiveSync's hidden-file sync: each device
// rewrites its own file every minute while the other device holds a
// replicated copy, and LiveSync records concurrent revisions of that copy
// as a conflict for the user to resolve by hand. obsidian-git also commits
// the file every time it changes. Keeping the cache in IndexedDB takes it
// out of every vault sync and every commit: IndexedDB belongs to the
// Obsidian installation, so each device has its own, and the key is scoped
// to the vault so two vaults on one device do not share a cache.

export interface CacheStore {
  read(): Promise<string | null>;
  write(raw: string): Promise<void>;
}

const DB_NAME = "todoist-sync-plus";
const DB_VERSION = 1;
const STORE_NAME = "cache";

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const run = async <T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = op(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};

export const indexedDbCacheStore = (key: string): CacheStore => ({
  read: async () => {
    const value = await run("readonly", (s) => s.get(key));
    return typeof value === "string" ? value : null;
  },
  write: async (raw) => {
    await run("readwrite", (s) => s.put(raw, key));
  },
});

// A file the cache can be seeded from once, before IndexedDB holds it.
export type LegacyCacheFile = {
  exists(): Promise<boolean>;
  read(): Promise<string>;
};

// Returns the cache text to restore: IndexedDB first, then each legacy
// file in order. A legacy file is only ever read, never written or
// deleted, because another device may still be running an older release
// that writes it.
export const readCache = async (
  store: CacheStore,
  legacy: LegacyCacheFile[],
): Promise<{ raw: string; source: "store" | number } | null> => {
  const stored = await store.read();
  if (stored !== null) {
    return { raw: stored, source: "store" };
  }
  for (const [index, file] of legacy.entries()) {
    if (await file.exists()) {
      return { raw: await file.read(), source: index };
    }
  }
  return null;
};
