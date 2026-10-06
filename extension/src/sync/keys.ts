/** Keys in the IndexedDB `meta` store. */
export const META_ACTIVE_LIBRARY = 'activeLibraryId';
export const META_LIBRARIES = 'libraries';
export const META_LAST_SYNC = 'lastSyncAt';
export const META_LAST_ERROR = 'lastSyncError';
export const metaPullCursor = (libraryId: string) => `pullCursor:${libraryId}`;

/** Keys in chrome.storage.local. */
export const SESSION_KEY = 'uxe.session';
export const CONFIG_KEY = 'uxe.cloudConfig';
