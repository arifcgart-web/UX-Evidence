/**
 * Minimal promise wrapper around IndexedDB.
 *
 * Deliberately hand-rolled rather than pulling in `idb`: the surface we need is
 * a handful of operations, and the extension should ship no dependency it does
 * not earn. Works unchanged in the popup and in the service worker.
 */

export const DB_NAME = 'ux-evidence';
export const DB_VERSION = 2;
export const STORE_EVIDENCE = 'evidence';
export const STORE_META = 'meta';

export const IDX_CREATED_AT = 'by_createdAt';
export const IDX_STATUS = 'by_status';
export const IDX_SYNC = 'by_syncState';
export const IDX_LIBRARY = 'by_libraryId';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction!;
      const oldVersion = event.oldVersion;

      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_EVIDENCE)) {
        store = db.createObjectStore(STORE_EVIDENCE, { keyPath: 'id' });
        store.createIndex(IDX_CREATED_AT, 'createdAt');
        store.createIndex(IDX_STATUS, 'status');
      } else {
        store = tx.objectStore(STORE_EVIDENCE);
      }

      if (oldVersion < 2) {
        // v2: cloud sync. Add the sync indexes and back-fill existing rows.
        if (!store.indexNames.contains(IDX_SYNC)) store.createIndex(IDX_SYNC, 'syncState');
        if (!store.indexNames.contains(IDX_LIBRARY)) store.createIndex(IDX_LIBRARY, 'libraryId');
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);

        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          const value = cursor.value as Record<string, unknown>;
          if (value.libraryId === undefined) value.libraryId = null;
          if (value.syncState === undefined) value.syncState = 'local';
          cursor.update(value);
          cursor.continue();
        };
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => reject(request.error ?? new Error('Could not open the database.'));
    request.onblocked = () =>
      reject(new Error('The database is in use by another window. Close it and try again.'));
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Database request failed.'));
  });
}

/** Runs `work` inside a transaction over one store and resolves once it commits. */
export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result: T;
    let settled = false;

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => {
      if (!settled) reject(tx.error ?? new Error('Database transaction failed.'));
    };
    tx.onabort = () => {
      if (!settled) reject(tx.error ?? new Error('Database transaction was aborted.'));
    };

    Promise.resolve(work(tx.objectStore(storeName)))
      .then((value) => {
        result = value;
      })
      .catch((error: unknown) => {
        settled = true;
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

export const idb = {
  get: <T>(store: IDBObjectStore, key: IDBValidKey) => promisify<T | undefined>(store.get(key)),
  getAll: <T>(store: IDBObjectStore) => promisify<T[]>(store.getAll()),
  getAllByIndex: <T>(store: IDBObjectStore, index: string, key: IDBValidKey) =>
    promisify<T[]>(store.index(index).getAll(key)),
  put: (store: IDBObjectStore, value: unknown, key?: IDBValidKey) => promisify(store.put(value, key)),
  delete: (store: IDBObjectStore, key: IDBValidKey) => promisify(store.delete(key)),
};

// ---------------------------------------------------------------------------
// Tiny key-value store for sync bookkeeping (session, active library, cursors)
// ---------------------------------------------------------------------------

export async function metaGet<T>(key: string): Promise<T | undefined> {
  return withStore(STORE_META, 'readonly', (s) => idb.get<T>(s, key));
}

export async function metaSet(key: string, value: unknown): Promise<void> {
  await withStore(STORE_META, 'readwrite', (s) => idb.put(s, value, key));
}

export async function metaDelete(key: string): Promise<void> {
  await withStore(STORE_META, 'readwrite', (s) => idb.delete(s, key));
}
