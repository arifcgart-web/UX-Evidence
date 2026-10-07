/**
 * Domain types shared by the Chrome extension and the web app.
 * Keep this file free of browser- or Supabase-specific code.
 */

import type { Shape } from './annotations';

export const CATEGORIES = [
  'Navigation',
  'Hero',
  'Product Page',
  'Checkout',
  'CTA',
  'Form',
  'Search',
  'Content',
  'Social Proof',
  'Pricing',
  'Mobile UX',
  'Accessibility',
  'CRO',
  'Interaction',
  'Other',
] as const;

/** Built-in category names. Libraries can add their own (see `allCategories`). */
export type BuiltInCategory = (typeof CATEGORIES)[number];
/** Any built-in or library-defined category name. */
export type Category = string;
export const DEFAULT_CATEGORY: Category = 'Other';
export const MAX_CATEGORY_LENGTH = 40;

export type CaptureMode = 'element' | 'region' | 'visible';

export interface Viewport {
  width: number;
  height: number;
}

/** The user-editable half of an evidence item. */
export interface EvidenceFields {
  category: Category;
  observation: string;
  whyItMatters: string;
  notes: string;
  tags: string[];
}

/** Everything the capture pipeline collects without asking the user. */
export interface CaptureContext {
  url: string;
  domain: string;
  pageTitle: string;
  viewport: Viewport;
  pageType: string;
}

/**
 * The blob-free core of an evidence item. The extension adds local blobs and
 * sync state on top; the web app adds storage paths.
 */
export interface EvidenceBase extends EvidenceFields, CaptureContext {
  id: string;
  screenshotWidth: number;
  screenshotHeight: number;
  captureMode: CaptureMode;
  /** Rectangles/arrows drawn over the screenshot (see shared/annotations.ts). */
  annotations: Shape[];
  createdAt: string;
  updatedAt: string;
}

export type LibraryRole = 'owner' | 'editor' | 'viewer';

export interface Library {
  id: string;
  name: string;
  ownerId: string;
  isPersonal: boolean;
  role: LibraryRole;
  createdAt: string;
  /** Custom categories added by this library's members, in insertion order. */
  categories: string[];
}

/** A usable category name: non-empty, trimmed, within the length limit. */
export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_CATEGORY_LENGTH;
}

/** Clean up a user-typed category name; returns null when unusable. */
export function normalizeCategory(value: string): string | null {
  const name = value.replace(/\s+/g, ' ').trim().slice(0, MAX_CATEGORY_LENGTH);
  return name ? name : null;
}

/**
 * Built-ins first, then the library's own categories, with "Other" kept last.
 * Case-insensitive de-duplication; `extra` makes sure a value that is no
 * longer in either list (e.g. an old item) still shows up in a select.
 */
export function allCategories(custom: readonly string[] = [], extra?: string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (c: string) => {
    const key = c.toLowerCase();
    if (!c || seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  for (const c of CATEGORIES) if (c !== DEFAULT_CATEGORY) push(c);
  for (const c of custom) push(c);
  if (extra && extra !== DEFAULT_CATEGORY) push(extra);
  push(DEFAULT_CATEGORY);
  return out;
}

export function emptyFields(category: Category = DEFAULT_CATEGORY): EvidenceFields {
  return { category, observation: '', whyItMatters: '', notes: '', tags: [] };
}

export function canEdit(role: LibraryRole | null | undefined): boolean {
  return role === 'owner' || role === 'editor';
}
