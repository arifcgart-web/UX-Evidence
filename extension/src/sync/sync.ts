/**
 * Push local changes up, pull remote changes down. Runs only in the worker.
 *
 * Rules:
 *   - Local is the source of truth for anything marked `pending`.
 *   - Pull is incremental on `updated_at`; tombstones (`deleted_at`) delete locally.
 *   - Last write wins, compared on `updatedAt`.
 *   - Thumbnails are downloaded on pull; full screenshots on demand.
 */

import type { Library } from '@shared/evidence';
import {
  deleteEvidence as deleteRemote,
  downloadFile,
  listEvidenceSince,
  listLibraries,
  storagePaths,
  uploadScreenshots,
  upsertEvidence,
} from '@shared/api';
import { metaDelete, metaGet, metaSet } from '../storage/db';
import {
  adoptLocalItems,
  applyRemote,
  attachScreenshot,
  getEvidence,
  listPending,
  markSynced,
  purgeEvidence,
} from '../storage/evidenceStore';
import { cloud, currentAccount, getConfig, isConfigured, type CloudConfig } from './client';
import { META_ACTIVE_LIBRARY, META_LAST_ERROR, META_LAST_SYNC, META_LIBRARIES, metaPullCursor } from './keys';

export interface SyncStatus {
  configured: boolean;
  config: CloudConfig | null;
  account: { email: string } | null;
  libraries: Library[];
  activeLibraryId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  pending: number;
  syncing: boolean;
}

let syncing = false;
let queued = false;

export async function getStatus(): Promise<SyncStatus> {
  const account = await currentAccount().catch(() => null);
  const pending = (await listPending()).length;
  const config = await getConfig();
  return {
    configured: config !== null,
    config,
    account: account ? { email: account.email } : null,
    libraries: (await metaGet<Library[]>(META_LIBRARIES)) ?? [],
    activeLibraryId: (await metaGet<string>(META_ACTIVE_LIBRARY)) ?? null,
    lastSyncAt: (await metaGet<string>(META_LAST_SYNC)) ?? null,
    lastError: (await metaGet<string>(META_LAST_ERROR)) ?? null,
    pending,
    syncing,
  };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function requestCode(email: string): Promise<void> {
  const { error } = await (await cloud()).auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw new Error(error.message);
}

/**
 * Accepts either a 6-digit code (if the project's email template includes
 * {{ .Token }}) or the sign-in link itself pasted from the default email.
 * The link carries a `token` (token_hash) that can be verified directly, so
 * no custom SMTP or template editing is needed.
 */
export async function verifyCode(email: string, input: string): Promise<void> {
  const value = input.trim();
  const auth = (await cloud()).auth;

  let error: { message: string } | null;
  if (/^\d{6,8}$/.test(value)) {
    ({ error } = await auth.verifyOtp({ email, token: value, type: 'email' }));
  } else {
    const tokenHash = extractTokenHash(value);
    if (!tokenHash) throw new Error('Paste the whole sign-in link from the email (right-click the link → Copy link address).');
    ({ error } = await auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' }));
    if (error && /expired|invalid/i.test(error.message)) {
      // Some projects issue `type=email` links; try that before giving up.
      ({ error } = await auth.verifyOtp({ token_hash: tokenHash, type: 'email' }));
    }
  }
  if (error) throw new Error(error.message);
  await afterSignIn();
}

/**
 * Sign in with a session handed over by the web app (no email involved).
 * The web app, already signed in, sends its tokens via externally_connectable
 * messaging; we adopt them as our own session.
 */
export async function adoptSession(accessToken: string, refreshToken: string): Promise<void> {
  const { error } = await (await cloud()).auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw new Error(error.message);
  await afterSignIn();
}

async function afterSignIn(): Promise<void> {
  await refreshLibraries();

  // First sign-in: choose the personal library and adopt everything captured so far.
  const active = await metaGet<string>(META_ACTIVE_LIBRARY);
  if (!active) {
    const libs = (await metaGet<Library[]>(META_LIBRARIES)) ?? [];
    const personal = libs.find((l) => l.isPersonal && l.role === 'owner') ?? libs[0];
    if (personal) {
      await metaSet(META_ACTIVE_LIBRARY, personal.id);
      await adoptLocalItems(personal.id);
    }
  }
  void syncNow();
}

/**
 * Pull the token hash out of a Supabase verify link. Tolerates links wrapped
 * by mail "safe link" proxies (Outlook, Gmail) by decoding until a `token=`
 * parameter surfaces.
 */
export function extractTokenHash(raw: string): string | null {
  let text = raw.trim();
  for (let i = 0; i < 3; i += 1) {
    const match = /[?&]token=([^&\s#]+)/.exec(text) ?? /[?&]token_hash=([^&\s#]+)/.exec(text);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
    try {
      const decoded = decodeURIComponent(text);
      if (decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }
  return null;
}

export async function signOut(): Promise<void> {
  await (await cloud()).auth.signOut().catch(() => undefined);
  await metaDelete(META_ACTIVE_LIBRARY);
  await metaDelete(META_LIBRARIES);
  await metaDelete(META_LAST_SYNC);
  await metaDelete(META_LAST_ERROR);
  // Synced copies stay on disk so the library remains readable offline. Pending
  // items keep their libraryId and will upload on the next sign-in.
}

export async function refreshLibraries(): Promise<Library[]> {
  const libs = await listLibraries(await cloud());
  await metaSet(META_LIBRARIES, libs);
  const active = await metaGet<string>(META_ACTIVE_LIBRARY);
  if (active && !libs.some((l) => l.id === active)) await metaDelete(META_ACTIVE_LIBRARY);
  return libs;
}

export async function setActiveLibrary(libraryId: string): Promise<void> {
  await metaSet(META_ACTIVE_LIBRARY, libraryId);
  void syncNow();
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/** Push + pull. Coalesces concurrent calls: at most one run, plus one queued. */
export async function syncNow(): Promise<SyncStatus> {
  if (!(await isConfigured())) return getStatus();
  if (syncing) {
    queued = true;
    return getStatus();
  }
  syncing = true;
  try {
    const account = await currentAccount();
    if (!account) return getStatus();

    await push();
    // Library names/roles can change on the web; keep the picker current.
    await refreshLibraries().catch(() => undefined);
    const active = await metaGet<string>(META_ACTIVE_LIBRARY);
    if (active) await pull(active);

    await metaSet(META_LAST_SYNC, new Date().toISOString());
    await metaDelete(META_LAST_ERROR);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[ux-evidence] sync failed', error);
    await metaSet(META_LAST_ERROR, friendlySyncError(message));
  } finally {
    syncing = false;
    if (queued) {
      queued = false;
      void syncNow();
    }
  }
  return getStatus();
}

async function push(): Promise<void> {
  const db = await cloud();
  for (const item of await listPending()) {
    if (!item.libraryId) continue;
    const paths = storagePaths(item.libraryId, item.id);

    if (item.status === 'deleted') {
      await deleteRemote(db, { id: item.id, screenshotPath: paths.screenshot, thumbnailPath: paths.thumbnail }).catch(
        (e: Error) => {
          // Row already gone (deleted elsewhere) is fine; anything else should retry later.
          if (!/not found|0 rows/i.test(e.message)) throw e;
        },
      );
      await purgeEvidence(item.id);
      continue;
    }

    // Upload files only when we hold them locally and the cloud might not.
    if (item.screenshot) {
      await uploadScreenshots(db, item.libraryId, item.id, item.screenshot, item.thumbnail);
    }
    const saved = await upsertEvidence(db, {
      ...item,
      libraryId: item.libraryId,
      screenshotPath: paths.screenshot,
      thumbnailPath: paths.thumbnail,
    });
    await markSynced(item.id, item.updatedAt);
    // Server may have bumped updated_at; align so the next pull doesn't re-apply it.
    if (saved.updatedAt !== item.updatedAt) {
      const current = await getEvidence(item.id);
      if (current && current.syncState === 'synced') {
        await applyRemote({ ...current, updatedAt: saved.updatedAt });
      }
    }
  }
}

async function pull(libraryId: string): Promise<void> {
  const db = await cloud();
  const cursorKey = metaPullCursor(libraryId);
  const since = (await metaGet<string>(cursorKey)) ?? null;
  const rows = await listEvidenceSince(db, libraryId, since);

  let cursor = since;
  for (const row of rows) {
    if (row.deletedAt) {
      await purgeEvidence(row.id);
    } else {
      const existing = await getEvidence(row.id);
      let thumbnail: Blob | undefined = existing?.thumbnail;
      if (!existing || existing.updatedAt !== row.updatedAt) {
        thumbnail = await downloadFile(db, row.thumbnailPath).catch(() => existing?.thumbnail);
      }
      if (!thumbnail) continue; // file missing; skip rather than store a broken row
      await applyRemote({
        id: row.id,
        status: 'saved',
        thumbnail,
        screenshot: existing?.updatedAt === row.updatedAt ? existing.screenshot : null,
        screenshotWidth: row.screenshotWidth,
        screenshotHeight: row.screenshotHeight,
        url: row.url,
        domain: row.domain,
        pageTitle: row.pageTitle,
        pageType: row.pageType,
        viewport: row.viewport,
        captureMode: row.captureMode,
        category: row.category,
        observation: row.observation,
        whyItMatters: row.whyItMatters,
        notes: row.notes,
        tags: row.tags,
        annotations: row.annotations ?? [],
        libraryId: row.libraryId,
        syncState: 'synced',
        searchText: '',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }
    if (!cursor || row.updatedAt > cursor) cursor = row.updatedAt;
  }
  if (cursor) await metaSet(cursorKey, cursor);
}

/** Fetch the full-resolution screenshot for one item (detail view). */
export async function fetchScreenshot(id: string): Promise<boolean> {
  const item = await getEvidence(id);
  if (!item || !item.libraryId) return false;
  if (item.screenshot) return true;
  const blob = await downloadFile(await cloud(), storagePaths(item.libraryId, item.id).screenshot);
  await attachScreenshot(id, blob);
  return true;
}

function friendlySyncError(message: string): string {
  if (/fetch|network|Failed to fetch/i.test(message)) return 'Offline — will sync when you are back online.';
  if (/JWT|expired|not authenticated|session/i.test(message)) return 'Signed out. Sign in again to keep syncing.';
  if (/row-level security|permission|policy/i.test(message)) return "You don't have edit access to this library.";
  if (/exceeded|quota|too large/i.test(message)) return 'Storage limit reached on the cloud project.';
  return message;
}
