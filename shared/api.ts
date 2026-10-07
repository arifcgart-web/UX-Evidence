/**
 * Thin, typed data-access layer over Supabase, shared by the extension and the
 * web app. Every function takes the client explicitly so each app can build
 * the client the way its runtime needs (localStorage vs chrome.storage).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaptureMode, Category, EvidenceBase, Library, LibraryRole, Viewport } from './evidence';
import { isCategory } from './evidence';
import { isShapeArray, type Shape } from './annotations';

export const BUCKET = 'evidence';

/** One row of public.evidence, as the database returns it. */
export interface EvidenceRow {
  id: string;
  library_id: string;
  created_by: string | null;
  url: string;
  domain: string;
  page_title: string;
  page_type: string;
  viewport: Viewport;
  capture_mode: CaptureMode;
  category: string;
  observation: string;
  why_it_matters: string;
  notes: string;
  tags: string[];
  screenshot_path: string;
  thumbnail_path: string;
  screenshot_width: number;
  screenshot_height: number;
  annotations: Shape[] | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Blob-free remote item, used by the web app directly. */
export interface RemoteEvidence extends EvidenceBase {
  libraryId: string;
  createdBy: string | null;
  screenshotPath: string;
  thumbnailPath: string;
  deletedAt: string | null;
}

export interface Member {
  userId: string;
  email: string;
  role: LibraryRole;
  createdAt: string;
}

export interface Invite {
  id: string;
  token: string;
  role: Exclude<LibraryRole, 'owner'>;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export const EVIDENCE_COLUMNS =
  'id,library_id,created_by,url,domain,page_title,page_type,viewport,capture_mode,category,observation,why_it_matters,notes,tags,screenshot_path,thumbnail_path,screenshot_width,screenshot_height,annotations,created_at,updated_at,deleted_at';

export function rowToEvidence(row: EvidenceRow): RemoteEvidence {
  return {
    id: row.id,
    libraryId: row.library_id,
    createdBy: row.created_by,
    url: row.url,
    domain: row.domain,
    pageTitle: row.page_title,
    pageType: row.page_type,
    viewport: row.viewport ?? { width: 0, height: 0 },
    captureMode: row.capture_mode,
    category: (isCategory(row.category) ? row.category : 'Other') as Category,
    observation: row.observation,
    whyItMatters: row.why_it_matters,
    notes: row.notes,
    tags: row.tags ?? [],
    screenshotPath: row.screenshot_path,
    thumbnailPath: row.thumbnail_path,
    screenshotWidth: row.screenshot_width,
    screenshotHeight: row.screenshot_height,
    annotations: isShapeArray(row.annotations) ? row.annotations : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function storagePaths(libraryId: string, evidenceId: string) {
  return {
    screenshot: `${libraryId}/${evidenceId}/screenshot.png`,
    thumbnail: `${libraryId}/${evidenceId}/thumb.jpg`,
  };
}

function throwIf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Libraries & members
// ---------------------------------------------------------------------------

export async function listLibraries(db: SupabaseClient): Promise<Library[]> {
  const { data: user } = await db.auth.getUser();
  const uid = user.user?.id;
  if (!uid) return [];

  const { data, error } = await db
    .from('library_members')
    .select('role, libraries ( id, name, owner_id, is_personal, created_at, categories )')
    .eq('user_id', uid);
  throwIf(error);

  type Row = {
    role: LibraryRole;
    libraries: { id: string; name: string; owner_id: string; is_personal: boolean; created_at: string; categories: string[] | null } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.libraries)
    .map((r) => ({
      id: r.libraries!.id,
      name: r.libraries!.name,
      ownerId: r.libraries!.owner_id,
      isPersonal: r.libraries!.is_personal,
      role: r.role,
      createdAt: r.libraries!.created_at,
      categories: r.libraries!.categories ?? [],
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createLibrary(db: SupabaseClient, name: string): Promise<string> {
  const { data: user } = await db.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error('Sign in first');
  const { data, error } = await db.from('libraries').insert({ name, owner_id: uid }).select('id').single();
  throwIf(error);
  return (data as { id: string }).id;
}

/**
 * Add a custom category to a library (owners and editors). Returns the
 * library's full custom list afterwards. Case-insensitive duplicates are ignored.
 */
export async function addLibraryCategory(db: SupabaseClient, libraryId: string, name: string): Promise<string[]> {
  const { data, error } = await db.rpc('add_library_category', { p_library: libraryId, p_name: name });
  throwIf(error);
  return (data as string[] | null) ?? [];
}

export async function renameLibrary(db: SupabaseClient, id: string, name: string): Promise<void> {
  const { error } = await db.from('libraries').update({ name }).eq('id', id);
  throwIf(error);
}

export async function deleteLibrary(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('libraries').delete().eq('id', id);
  throwIf(error);
}

export async function leaveLibrary(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.rpc('leave_library', { p_library: id });
  throwIf(error);
}

export async function listMembers(db: SupabaseClient, libraryId: string): Promise<Member[]> {
  const { data, error } = await db
    .from('library_members')
    .select('user_id, email, role, created_at')
    .eq('library_id', libraryId)
    .order('created_at');
  throwIf(error);
  return (data ?? []).map((m) => ({ userId: m.user_id, email: m.email, role: m.role, createdAt: m.created_at }));
}

export async function setMemberRole(db: SupabaseClient, libraryId: string, userId: string, role: LibraryRole): Promise<void> {
  const { error } = await db.from('library_members').update({ role }).eq('library_id', libraryId).eq('user_id', userId);
  throwIf(error);
}

export async function removeMember(db: SupabaseClient, libraryId: string, userId: string): Promise<void> {
  const { error } = await db.from('library_members').delete().eq('library_id', libraryId).eq('user_id', userId);
  throwIf(error);
}

export async function listInvites(db: SupabaseClient, libraryId: string): Promise<Invite[]> {
  const { data, error } = await db
    .from('invites')
    .select('id, token, role, label, created_at, expires_at, accepted_at')
    .eq('library_id', libraryId)
    .order('created_at', { ascending: false });
  throwIf(error);
  return (data ?? []).map((i) => ({
    id: i.id,
    token: i.token,
    role: i.role,
    label: i.label,
    createdAt: i.created_at,
    expiresAt: i.expires_at,
    acceptedAt: i.accepted_at,
  }));
}

export async function createInvite(
  db: SupabaseClient,
  libraryId: string,
  role: 'editor' | 'viewer',
  label: string,
): Promise<Invite> {
  const { data: user } = await db.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error('Sign in first');
  const { data, error } = await db
    .from('invites')
    .insert({ library_id: libraryId, role, label: label || null, created_by: uid })
    .select('id, token, role, label, created_at, expires_at, accepted_at')
    .single();
  throwIf(error);
  const i = data as { id: string; token: string; role: 'editor' | 'viewer'; label: string | null; created_at: string; expires_at: string; accepted_at: string | null };
  return { id: i.id, token: i.token, role: i.role, label: i.label, createdAt: i.created_at, expiresAt: i.expires_at, acceptedAt: i.accepted_at };
}

export async function revokeInvite(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('invites').delete().eq('id', id);
  throwIf(error);
}

export async function acceptInvite(db: SupabaseClient, token: string): Promise<string> {
  const { data, error } = await db.rpc('accept_invite', { p_token: token });
  throwIf(error);
  return data as string;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/** Live (non-deleted) items of a library, newest first. */
export async function listEvidence(db: SupabaseClient, libraryId: string): Promise<RemoteEvidence[]> {
  const { data, error } = await db
    .from('evidence')
    .select(EVIDENCE_COLUMNS)
    .eq('library_id', libraryId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  throwIf(error);
  return ((data ?? []) as unknown as EvidenceRow[]).map(rowToEvidence);
}

/** Everything changed after `since` — including tombstones — for incremental sync. */
export async function listEvidenceSince(db: SupabaseClient, libraryId: string, since: string | null): Promise<RemoteEvidence[]> {
  let q = db.from('evidence').select(EVIDENCE_COLUMNS).eq('library_id', libraryId).order('updated_at');
  if (since) q = q.gt('updated_at', since);
  const { data, error } = await q;
  throwIf(error);
  return ((data ?? []) as unknown as EvidenceRow[]).map(rowToEvidence);
}

export interface UpsertEvidenceInput extends EvidenceBase {
  libraryId: string;
  screenshotPath: string;
  thumbnailPath: string;
}

export async function upsertEvidence(db: SupabaseClient, e: UpsertEvidenceInput): Promise<RemoteEvidence> {
  const { data: user } = await db.auth.getUser();
  const { data, error } = await db
    .from('evidence')
    .upsert(
      {
        id: e.id,
        library_id: e.libraryId,
        created_by: user.user?.id ?? null,
        url: e.url,
        domain: e.domain,
        page_title: e.pageTitle,
        page_type: e.pageType,
        viewport: e.viewport,
        capture_mode: e.captureMode,
        category: e.category,
        observation: e.observation,
        why_it_matters: e.whyItMatters,
        notes: e.notes,
        tags: e.tags,
        screenshot_path: e.screenshotPath,
        thumbnail_path: e.thumbnailPath,
        screenshot_width: e.screenshotWidth,
        screenshot_height: e.screenshotHeight,
        annotations: e.annotations ?? [],
        created_at: e.createdAt,
        updated_at: e.updatedAt,
        deleted_at: null,
      },
      { onConflict: 'id' },
    )
    .select(EVIDENCE_COLUMNS)
    .single();
  throwIf(error);
  return rowToEvidence(data as unknown as EvidenceRow);
}

/** Field-only update from the web app (no blobs involved). */
export async function updateEvidenceFields(
  db: SupabaseClient,
  id: string,
  fields: { category: Category; observation: string; whyItMatters: string; notes: string; tags: string[] },
): Promise<RemoteEvidence> {
  const { data, error } = await db
    .from('evidence')
    .update({
      category: fields.category,
      observation: fields.observation,
      why_it_matters: fields.whyItMatters,
      notes: fields.notes,
      tags: fields.tags,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(EVIDENCE_COLUMNS)
    .single();
  throwIf(error);
  return rowToEvidence(data as unknown as EvidenceRow);
}

/** Replace the annotation shapes (web app editor). */
export async function updateEvidenceAnnotations(db: SupabaseClient, id: string, annotations: Shape[]): Promise<RemoteEvidence> {
  const { data, error } = await db
    .from('evidence')
    .update({ annotations, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(EVIDENCE_COLUMNS)
    .single();
  throwIf(error);
  return rowToEvidence(data as unknown as EvidenceRow);
}

/** Soft delete + remove the files. Other devices pull the tombstone and drop their copy. */
export async function deleteEvidence(db: SupabaseClient, e: Pick<RemoteEvidence, 'id' | 'screenshotPath' | 'thumbnailPath'>): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db.from('evidence').update({ deleted_at: now, updated_at: now }).eq('id', e.id);
  throwIf(error);
  await db.storage.from(BUCKET).remove([e.screenshotPath, e.thumbnailPath]);
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export async function uploadScreenshots(
  db: SupabaseClient,
  libraryId: string,
  evidenceId: string,
  screenshot: Blob,
  thumbnail: Blob,
): Promise<{ screenshotPath: string; thumbnailPath: string }> {
  const paths = storagePaths(libraryId, evidenceId);
  const bucket = db.storage.from(BUCKET);
  const [a, b] = await Promise.all([
    bucket.upload(paths.screenshot, screenshot, { contentType: 'image/png', upsert: true }),
    bucket.upload(paths.thumbnail, thumbnail, { contentType: 'image/jpeg', upsert: true }),
  ]);
  throwIf(a.error);
  throwIf(b.error);
  return { screenshotPath: paths.screenshot, thumbnailPath: paths.thumbnail };
}

export async function downloadFile(db: SupabaseClient, path: string): Promise<Blob> {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  throwIf(error);
  if (!data) throw new Error('Empty download');
  return data;
}

/** Short-lived URLs for <img> tags. */
export async function signedUrls(db: SupabaseClient, paths: string[], ttlSeconds = 3600): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrls(paths, ttlSeconds);
  throwIf(error);
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) out.set(entry.path, entry.signedUrl);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Profiles (display names)
// ---------------------------------------------------------------------------

export interface Profile {
  userId: string;
  displayName: string;
}

/** Fallback when no display name is set: the part before the @. */
export function nameFromEmail(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0] ?? '';
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'You';
}

export async function listProfiles(db: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const { data, error } = await db.from('profiles').select('user_id, display_name').in('user_id', userIds);
  if (error) return out; // table may not exist yet; names just fall back
  for (const row of data ?? []) out.set(row.user_id, row.display_name);
  return out;
}

export async function getMyProfile(db: SupabaseClient): Promise<Profile | null> {
  const { data: user } = await db.auth.getUser();
  const uid = user.user?.id;
  if (!uid) return null;
  const { data } = await db.from('profiles').select('user_id, display_name').eq('user_id', uid).maybeSingle();
  return data ? { userId: data.user_id, displayName: data.display_name } : null;
}

export async function saveMyProfile(db: SupabaseClient, displayName: string): Promise<void> {
  const { data: user } = await db.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error('Sign in first');
  const { error } = await db
    .from('profiles')
    .upsert({ user_id: uid, display_name: displayName.trim(), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  throwIf(error);
}

/** Item counts per library the user can see (RLS does the filtering). */
export async function countEvidenceByLibrary(db: SupabaseClient): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await db.from('evidence').select('library_id').is('deleted_at', null);
  if (error) return out;
  for (const row of data ?? []) out.set(row.library_id, (out.get(row.library_id) ?? 0) + 1);
  return out;
}
