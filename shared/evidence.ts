/**
 * Domain types shared by the Chrome extension and the web app.
 * Keep this file free of browser- or Supabase-specific code.
 */

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

export type Category = (typeof CATEGORIES)[number];
export const DEFAULT_CATEGORY: Category = 'Other';

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
}

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export function emptyFields(category: Category = DEFAULT_CATEGORY): EvidenceFields {
  return { category, observation: '', whyItMatters: '', notes: '', tags: [] };
}

export function canEdit(role: LibraryRole | null | undefined): boolean {
  return role === 'owner' || role === 'editor';
}
