/** Search, filter and tag helpers. Pure functions, used by both apps. */

import type { Category, EvidenceBase } from './evidence';

export type SortOrder = 'newest' | 'oldest';

export interface EvidenceQuery {
  search?: string;
  category?: Category | null;
  domain?: string | null;
  tag?: string | null;
  sort?: SortOrder;
  limit?: number;
}

export function buildSearchText(
  e: Pick<EvidenceBase, 'observation' | 'whyItMatters' | 'notes' | 'category' | 'tags' | 'domain' | 'pageTitle' | 'url'>,
): string {
  return [e.observation, e.whyItMatters, e.notes, e.category, e.tags.join(' '), e.domain, e.pageTitle, e.url]
    .join(' \n ')
    .toLowerCase();
}

export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/^#/, '').slice(0, 32);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, 12);
}

/**
 * Plain substring search, every term must match. Not semantic by design.
 * `searchText` may be precomputed on the record; otherwise it is built here.
 */
export function queryEvidence<T extends EvidenceBase & { searchText?: string }>(
  records: readonly T[],
  query: EvidenceQuery,
): T[] {
  const terms = (query.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);

  let out = records.filter((r) => {
    if (query.category && r.category !== query.category) return false;
    if (query.domain && r.domain !== query.domain) return false;
    if (query.tag && !r.tags.some((t) => t.toLowerCase() === query.tag!.toLowerCase())) return false;
    if (terms.length === 0) return true;
    const haystack = r.searchText || buildSearchText(r);
    return terms.every((term) => haystack.includes(term));
  });

  out = [...out].sort((a, b) =>
    query.sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
  );
  return typeof query.limit === 'number' ? out.slice(0, query.limit) : out;
}

export function collectTags(records: readonly Pick<EvidenceBase, 'tags'>[]): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const r of records) {
    for (const tag of r.tags) {
      const key = tag.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.n += 1;
      else counts.set(key, { label: tag, n: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map((e) => e.label);
}

export function collectDomains(records: readonly Pick<EvidenceBase, 'domain'>[]): string[] {
  return [...new Set(records.map((r) => r.domain).filter(Boolean))].sort();
}
