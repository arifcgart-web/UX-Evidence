/**
 * Extension-side evidence types. The portable core lives in shared/evidence.ts;
 * this adds what only the local copy needs: blobs, status and sync state.
 */

export * from '@shared/evidence';
import type { EvidenceBase } from '@shared/evidence';

/**
 * draft   — captured, form not yet saved (hidden from the library)
 * saved   — in the library
 * deleted — removed locally, deletion not yet pushed to the cloud (hidden)
 */
export type EvidenceStatus = 'draft' | 'saved' | 'deleted';

/**
 * local   — never assigned to a cloud library (signed-out capture)
 * pending — has local changes the cloud hasn't seen
 * synced  — identical to the cloud copy
 */
export type SyncState = 'local' | 'pending' | 'synced';

export interface EvidenceRecord extends EvidenceBase {
  status: EvidenceStatus;

  /** Full-resolution PNG. Null when pulled from the cloud and not yet downloaded. */
  screenshot: Blob | null;
  /** Always present: captured locally or downloaded on pull. */
  thumbnail: Blob;

  /** Cloud library this item belongs to; null while local-only. */
  libraryId: string | null;
  syncState: SyncState;

  /** Lower-cased haystack built at write time. */
  searchText: string;
}
