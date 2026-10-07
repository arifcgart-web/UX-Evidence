/**
 * The only module that knows how evidence is persisted locally.
 *
 * Local IndexedDB is the source of truth for the extension; the cloud (see
 * sync/) is a replica that is pushed to and pulled from. UI code never touches
 * either directly.
 */

import { IDX_CREATED_AT, IDX_STATUS, IDX_SYNC, STORE_EVIDENCE, idb, metaGet, openDB, withStore } from './db';
import type { CaptureContext, CaptureMode, EvidenceFields, EvidenceRecord } from '../types/evidence';
import { DEFAULT_CATEGORY, isCategory } from '../types/evidence';
import { buildSearchText, normalizeTags } from '@shared/search';
import type { Shape } from '@shared/annotations';
import { META_ACTIVE_LIBRARY } from '../sync/keys';

export { normalizeTags, queryEvidence, collectTags, collectDomains } from '@shared/search';
export type { SortOrder, EvidenceQuery } from '@shared/search';

/** Drafts older than this are abandoned captures; the worker sweeps them. */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export function newId(): string {
  return crypto.randomUUID();
}

export interface DraftInput {
  id: string;
  screenshot: Blob;
  thumbnail: Blob;
  screenshotWidth: number;
  screenshotHeight: number;
  captureMode: CaptureMode;
  context: CaptureContext;
}

/**
 * Persist the screenshot the moment it exists, before the user has typed
 * anything. A capture is expensive to reproduce; form input is not.
 */
export async function createDraft(input: DraftInput): Promise<EvidenceRecord> {
  const now = new Date().toISOString();
  const libraryId = (await metaGet<string>(META_ACTIVE_LIBRARY)) ?? null;
  const record: EvidenceRecord = {
    id: input.id,
    status: 'draft',
    screenshot: input.screenshot,
    thumbnail: input.thumbnail,
    screenshotWidth: input.screenshotWidth,
    screenshotHeight: input.screenshotHeight,
    url: input.context.url,
    domain: input.context.domain,
    pageTitle: input.context.pageTitle,
    category: DEFAULT_CATEGORY,
    observation: '',
    whyItMatters: '',
    notes: '',
    tags: [],
    viewport: input.context.viewport,
    captureMode: input.captureMode,
    pageType: input.context.pageType,
    annotations: [],
    libraryId,
    syncState: libraryId ? 'pending' : 'local',
    searchText: '',
    createdAt: now,
    updatedAt: now,
  };
  await withStore(STORE_EVIDENCE, 'readwrite', (store) => idb.put(store, record));
  return record;
}

function applyFields(existing: EvidenceRecord, fields: EvidenceFields): EvidenceRecord {
  const next: EvidenceRecord = {
    ...existing,
    category: isCategory(fields.category) ? fields.category : DEFAULT_CATEGORY,
    observation: fields.observation.trim(),
    whyItMatters: fields.whyItMatters.trim(),
    notes: fields.notes.trim(),
    tags: normalizeTags(fields.tags),
    updatedAt: new Date().toISOString(),
    syncState: existing.libraryId ? 'pending' : 'local',
    searchText: '',
  };
  next.searchText = buildSearchText(next);
  return next;
}

/** Turn a draft into a library item. Returns null if the draft vanished. */
export async function commitDraft(
  draftId: string,
  fields: EvidenceFields,
  annotations?: Shape[],
  mobileAnnotations?: Shape[],
): Promise<EvidenceRecord | null> {
  return withStore(STORE_EVIDENCE, 'readwrite', async (store) => {
    const existing = await idb.get<EvidenceRecord>(store, draftId);
    if (!existing) return null;
    const mobile = existing.mobile ? { ...existing.mobile, annotations: mobileAnnotations ?? existing.mobile.annotations ?? [] } : null;
    const next = { ...applyFields(existing, fields), status: 'saved' as const, annotations: annotations ?? existing.annotations ?? [], mobile };
    await idb.put(store, next);
    return next;
  });
}

export async function updateEvidence(id: string, fields: EvidenceFields): Promise<EvidenceRecord | null> {
  return withStore(STORE_EVIDENCE, 'readwrite', async (store) => {
    const existing = await idb.get<EvidenceRecord>(store, id);
    if (!existing) return null;
    const next = applyFields(existing, fields);
    await idb.put(store, next);
    return next;
  });
}

/** Attach (or replace) the mobile version on a draft or saved item. */
export async function attachMobile(
  id: string,
  input: { screenshot: Blob; thumbnail: Blob; width: number; height: number; viewport: { width: number; height: number } },
): Promise<EvidenceRecord | null> {
  return withStore(STORE_EVIDENCE, 'readwrite', async (store) => {
    const existing = await idb.get<EvidenceRecord>(store, id);
    if (!existing) return null;
    const next: EvidenceRecord = {
      ...existing,
      mobileScreenshot: input.screenshot,
      mobileThumbnail: input.thumbnail,
      mobile: { width: input.width, height: input.height, viewport: input.viewport, annotations: [] },
      updatedAt: new Date().toISOString(),
      syncState: existing.libraryId ? 'pending' : 'local',
    };
    await idb.put(store, next);
    return next;
  });
}

/** Remove the mobile version from a draft (e.g. the user discarded it). */
export async function detachMobile(id: string): Promise<void> {
  await withStore(STORE_EVIDENCE, 'readwrite', async (store) => {
    const existing = await idb.get<EvidenceRecord>(store, id);
    if (!existing) return;
    await idb.put(store, { ...existing, mobile: null, mobileScreenshot: null, mobileThumbnail: null } satisfies EvidenceRecord);
  });
}

/** Replace the annotation shapes; marks the item pending for sync. */
export async function setAnnotations(id: string, annotations: Shape[], view: 'desktop' | 'mobile' = 'desktop'): Promise<EvidenceRecord | null> {
  return withStore(STORE_EVIDENCE, 'readwrite', async (store) => {
    const existing = await idb.get<EvidenceRecord>(store, id);
    if (!existing) return null;
    if (view === 'mobile' && !existing.mobile) return existing;
    const next: EvidenceRecord = {
      ...existing,
      ...(view === 'mobile' ? { mobile: { ...existing.mobile!, annotations } } : { annotations }),
      updatedAt: new Date().toISOString(),
      syncState: existing.libraryId ? 'pending' : 'local',
    };
    await idb.put(store, next);
    return next;
  });
}

export async function getEvidence(id: string): Promise<EvidenceRecord | undefined> {
  return withStore(STORE_EVIDENCE, 'readonly', (store) => idb.get<EvidenceRecord>(store, id));
}

/**
 * Delete from the user's point of view. Items the cloud knows about become a
 * tombstone until the deletion is pushed; local-only items vanish immediately.
 */
export async function deleteEvidence(id: string): Promise<void> {
  await withStore(STORE_EVIDENCE, 'readwrite', async (store) => {
    const existing = await idb.get<EvidenceRecord>(store, id);
    if (!existing) return;
    if (existing.libraryId && existing.status === 'saved') {
      await idb.put(store, {
        ...existing,
        status: 'deleted',
        syncState: 'pending',
        screenshot: null,
        updatedAt: new Date().toISOString(),
      } satisfies EvidenceRecord);
    } else {
      await idb.delete(store, id);
    }
  });
}

/** Physically remove a row (used by sync after a tombstone was pushed or pulled). */
export async function purgeEvidence(id: string): Promise<void> {
  await withStore(STORE_EVIDENCE, 'readwrite', (store) => idb.delete(store, id));
}

/**
 * Saved records visible in the popup, newest first. When a cloud library is
 * active only its items show; signed out, everything local shows.
 */
export async function listEvidence(activeLibraryId: string | null): Promise<EvidenceRecord[]> {
  const db = await openDB();
  return new Promise<EvidenceRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_EVIDENCE, 'readonly');
    const index = tx.objectStore(STORE_EVIDENCE).index(IDX_CREATED_AT);
    const out: EvidenceRecord[] = [];
    const cursorRequest = index.openCursor(null, 'prev');

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve(out);
        return;
      }
      const record = cursor.value as EvidenceRecord;
      if (record.status === 'saved' && (activeLibraryId === null || record.libraryId === activeLibraryId)) {
        out.push(record);
      }
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Could not read the evidence library.'));
  });
}

/** Everything the cloud hasn't seen yet: new/edited items and tombstones. */
export async function listPending(): Promise<EvidenceRecord[]> {
  const rows = await withStore(STORE_EVIDENCE, 'readonly', (store) =>
    idb.getAllByIndex<EvidenceRecord>(store, IDX_SYNC, 'pending'),
  );
  return rows.filter((r) => r.libraryId && r.status !== 'draft');
}

export async function countPending(): Promise<number> {
  return (await listPending()).length;
}

/** Move every local-only item into a cloud library (first sign-in). */
export async function adoptLocalItems(libraryId: string): Promise<number> {
  return withStore(STORE_EVIDENCE, 'readwrite', async (store) => {
    const rows = await idb.getAllByIndex<EvidenceRecord>(store, IDX_SYNC, 'local');
    let n = 0;
    for (const row of rows) {
      if (row.status !== 'saved') continue;
      await idb.put(store, { ...row, libraryId, syncState: 'pending' } satisfies EvidenceRecord);
      n += 1;
    }
    return n;
  });
}

/** Called after a successful push: the cloud now matches this row. */
export async function markSynced(id: string, updatedAt: string): Promise<void> {
  await withStore(STORE_EVIDENCE, 'readwrite', async (store) => {
    const existing = await idb.get<EvidenceRecord>(store, id);
    // If the user edited again while we were uploading, leave it pending.
    if (!existing || existing.updatedAt !== updatedAt) return;
    await idb.put(store, { ...existing, syncState: 'synced' } satisfies EvidenceRecord);
  });
}

/**
 * Apply a row pulled from the cloud. Local pending edits that are newer win;
 * everything else is overwritten. Returns true if the local copy changed.
 */
export async function applyRemote(remote: Omit<EvidenceRecord, 'screenshot'> & { screenshot?: Blob | null }): Promise<boolean> {
  return withStore(STORE_EVIDENCE, 'readwrite', async (store) => {
    const existing = await idb.get<EvidenceRecord>(store, remote.id);
    if (existing && existing.syncState === 'pending' && existing.updatedAt > remote.updatedAt) return false;
    if (existing && existing.syncState === 'synced' && existing.updatedAt === remote.updatedAt) return false;
    await idb.put(store, {
      ...remote,
      screenshot: remote.screenshot ?? existing?.screenshot ?? null,
      mobileScreenshot: remote.mobile ? remote.mobileScreenshot ?? existing?.mobileScreenshot ?? null : null,
      mobileThumbnail: remote.mobile ? remote.mobileThumbnail ?? existing?.mobileThumbnail ?? null : null,
      syncState: 'synced',
      status: 'saved',
      searchText: buildSearchText(remote),
    } satisfies EvidenceRecord);
    return true;
  });
}

export async function attachScreenshot(id: string, screenshot: Blob, view: 'desktop' | 'mobile' = 'desktop'): Promise<void> {
  await withStore(STORE_EVIDENCE, 'readwrite', async (store) => {
    const existing = await idb.get<EvidenceRecord>(store, id);
    if (!existing) return;
    const patch = view === 'mobile' ? { mobileScreenshot: screenshot } : { screenshot };
    await idb.put(store, { ...existing, ...patch } satisfies EvidenceRecord);
  });
}

/** Drop the local cache of a library (sign-out or leaving a library). Pending items are kept. */
export async function dropLibraryCache(libraryId: string): Promise<void> {
  await withStore(STORE_EVIDENCE, 'readwrite', async (store) => {
    const all = await idb.getAll<EvidenceRecord>(store);
    for (const row of all) {
      if (row.libraryId === libraryId && row.syncState === 'synced') await idb.delete(store, row.id);
    }
  });
}

/** Remove capture drafts the user never finished. Cheap, runs on worker startup. */
export async function sweepStaleDrafts(now = Date.now()): Promise<number> {
  return withStore(STORE_EVIDENCE, 'readwrite', async (store) => {
    const drafts = await idb.getAllByIndex<EvidenceRecord>(store, IDX_STATUS, 'draft');
    let removed = 0;
    for (const record of drafts) {
      if (now - Date.parse(record.createdAt) < DRAFT_TTL_MS) continue;
      await idb.delete(store, record.id);
      removed += 1;
    }
    return removed;
  });
}
