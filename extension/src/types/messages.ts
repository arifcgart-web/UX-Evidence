/**
 * The message contract between popup -> worker, content -> worker and
 * worker -> content. Every channel is typed so the three contexts cannot drift.
 */

import type { CaptureContext, CaptureMode, EvidenceFields } from './evidence';
import type { Shape } from '@shared/annotations';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---- capture ---------------------------------------------------------------

/** popup -> worker: begin a capture on the active tab. */
export interface StartCaptureMsg {
  type: 'START_CAPTURE';
  mode: 'element' | 'visible';
}

/** worker -> content: switch the page into selection mode. */
export interface EnterCaptureModeMsg {
  type: 'ENTER_CAPTURE_MODE';
}

/** worker -> content: open the evidence form straight away (whole-viewport path). */
export interface CaptureVisibleMsg {
  type: 'CAPTURE_VISIBLE';
}

/**
 * content -> worker: the user picked an area (CSS pixels, viewport-relative).
 * `rect` is omitted for a whole-viewport capture.
 */
export interface CaptureAreaMsg {
  type: 'CAPTURE_AREA';
  rect: Rect | null;
  mode: CaptureMode;
  context: CaptureContext;
  clipped: boolean;
}

/** content -> worker: promote a draft into the library. */
export interface SaveEvidenceMsg {
  type: 'SAVE_EVIDENCE';
  draftId: string;
  fields: EvidenceFields;
  annotations?: Shape[];
  mobileAnnotations?: Shape[];
}

/** content -> worker: the user cancelled the form; drop the draft. */
export interface DiscardDraftMsg {
  type: 'DISCARD_DRAFT';
  draftId: string;
}

/** content -> worker: tags already in the library, for suggestions. */
export interface GetKnownTagsMsg {
  type: 'GET_KNOWN_TAGS';
}

// ---- sync & account (popup -> worker) --------------------------------------

export interface GetSyncStatusMsg {
  type: 'SYNC_STATUS';
}
export interface SyncNowMsg {
  type: 'SYNC_NOW';
}
export interface RequestCodeMsg {
  type: 'AUTH_REQUEST_CODE';
  email: string;
}
export interface VerifyCodeMsg {
  type: 'AUTH_VERIFY_CODE';
  email: string;
  code: string;
}
export interface SignOutMsg {
  type: 'AUTH_SIGN_OUT';
}
export interface SetLibraryMsg {
  type: 'SET_LIBRARY';
  libraryId: string;
}
export interface RefreshLibrariesMsg {
  type: 'REFRESH_LIBRARIES';
}
/** content -> worker: switch this tab to a phone-sized view (chrome.debugger emulation). */
export interface MobileEnterMsg {
  type: 'MOBILE_ENTER';
}
/** content -> worker: leave the phone-sized view. */
export interface MobileExitMsg {
  type: 'MOBILE_EXIT';
}
/** content -> worker: screenshot the phone view, crop, attach to the draft, then leave phone view. */
export interface MobileCaptureMsg {
  type: 'MOBILE_CAPTURE';
  draftId: string;
  rect: Rect | null;
  viewport: { width: number; height: number };
}
/** content -> worker: drop the mobile view from a draft. */
export interface MobileRemoveMsg {
  type: 'MOBILE_REMOVE';
  draftId: string;
}
/** any -> worker: add a custom category to the active library (or the local list). Returns the custom list. */
export interface AddCategoryMsg {
  type: 'ADD_CATEGORY';
  name: string;
}
export interface FetchScreenshotMsg {
  type: 'FETCH_SCREENSHOT';
  id: string;
  view?: 'desktop' | 'mobile';
}
/** popup -> worker: store (or clear) the Supabase project the extension talks to. */
export interface SetCloudConfigMsg {
  type: 'SET_CLOUD_CONFIG';
  config: { url: string; anonKey: string } | null;
}
/** popup -> worker: a local edit/delete happened; push when convenient. */
export interface LocalChangedMsg {
  type: 'LOCAL_CHANGED';
}

export type ExtensionMessage =
  | StartCaptureMsg
  | EnterCaptureModeMsg
  | CaptureVisibleMsg
  | CaptureAreaMsg
  | SaveEvidenceMsg
  | DiscardDraftMsg
  | GetKnownTagsMsg
  | GetSyncStatusMsg
  | SyncNowMsg
  | RequestCodeMsg
  | VerifyCodeMsg
  | SignOutMsg
  | SetLibraryMsg
  | RefreshLibrariesMsg
  | AddCategoryMsg
  | MobileEnterMsg
  | MobileExitMsg
  | MobileCaptureMsg
  | MobileRemoveMsg
  | FetchScreenshotMsg
  | SetCloudConfigMsg
  | LocalChangedMsg;

/** Uniform envelope so every caller handles failure the same way. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface DraftCreated {
  draftId: string;
  /** Downscaled data URL, only for the form preview. */
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
  context: CaptureContext;
  clipped: boolean;
  /** Custom categories available to the form (active library's, or local). */
  categories: string[];
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(error: string): Result<never> {
  return { ok: false, error };
}
