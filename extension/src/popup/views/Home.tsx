import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, EvidenceRecord } from '../../types/evidence';
import { allCategories, isCategory } from '../../types/evidence';
import { collectDomains, collectTags, queryEvidence, type SortOrder } from '../../storage/evidenceStore';
import { EvidenceCard } from '../components/EvidenceCard';
import { Icon } from '../components/Icon';
import { Hero } from '../components/Hero';
import type { SyncStatus } from '../../sync/sync';
import { send } from '../messaging';
import { restrictionReason } from '../../utils/restrictedPages';

export interface Filters {
  search: string;
  category: Category | null;
  domain: string | null;
  tag: string | null;
  sort: SortOrder;
}

export const EMPTY_FILTERS: Filters = { search: '', category: null, domain: null, tag: null, sort: 'newest' };

interface Props {
  records: EvidenceRecord[];
  loading: boolean;
  error: string | null;
  status: SyncStatus | null;
  thumbUrl: (r: EvidenceRecord) => string;
  filters: Filters;
  onFilters: (f: Filters) => void;
  onOpen: (id: string) => void;
  onSettings: () => void;
}

function syncPill(status: SyncStatus | null): { label: string; tone: 'ok' | 'warn' | 'off' } {
  if (!status || !status.configured || !status.account) return { label: 'Not synced', tone: 'off' };
  if (status.syncing) return { label: 'Syncing…', tone: 'ok' };
  if (status.lastError) return { label: 'Sync issue', tone: 'warn' };
  if (status.pending > 0) return { label: `${status.pending} pending`, tone: 'warn' };
  return { label: 'Synced', tone: 'ok' };
}

export function Home({ records, loading, error, status, thumbUrl, filters, onFilters, onOpen, onSettings }: Props) {
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [pageBlocked, setPageBlocked] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const tagStrip = useRef<HTMLDivElement>(null);
  const [tagOverflow, setTagOverflow] = useState({ left: false, right: false });

  useEffect(() => {
    chrome.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then(([tab]) => setPageBlocked(restrictionReason(tab?.url)))
      .catch(() => setPageBlocked(null));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const capture = async (mode: 'element' | 'visible') => {
    setMenuOpen(false);
    setCaptureError(null);
    const res = await send<null>({ type: 'START_CAPTURE', mode });
    if (res.ok) window.close();
    else setCaptureError(res.error);
  };

  const tags = useMemo(() => collectTags(records), [records]);
  const domains = useMemo(() => collectDomains(records), [records]);
  const visible = useMemo(() => queryEvidence(records, filters), [records, filters]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onFilters({ ...filters, [key]: value });
  const hasFilter = Boolean(filters.search || filters.category || filters.domain || filters.tag);

  const activeLib = status?.account ? status.libraries.find((l) => l.id === status.activeLibraryId) : undefined;
  const viewOnly = activeLib?.role === 'viewer';
  const captureBlocked = pageBlocked ?? (viewOnly ? `You can only view “${activeLib!.name}”. Switch to a library you can edit to capture.` : null);

  // ---- tag strip scrolling ----
  const measureStrip = () => {
    const el = tagStrip.current;
    if (!el) return;
    setTagOverflow({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  useEffect(() => {
    measureStrip();
    const el = tagStrip.current;
    if (!el) return;
    const ro = new ResizeObserver(measureStrip);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tags, filters.tag]);
  const scrollStrip = (dir: -1 | 1) => tagStrip.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });

  const pill = syncPill(status);
  const subtitle = status?.account
    ? `${activeLib?.name ?? 'Choose a library'} · ${records.length} item${records.length === 1 ? '' : 's'}`
    : `Local only · ${records.length} item${records.length === 1 ? '' : 's'}`;

  return (
    <div className="home">
      <Hero title="UX Evidence" subtitle={subtitle}>
        <span className={`hero-pill ${pill.tone}`} title={status?.lastError ?? undefined}>
          <i />
          {pill.label}
        </span>
        <button type="button" className="hero-circle" aria-label="Settings" title="Settings" onClick={onSettings}>
          <Icon name="gear" size={17} />
        </button>
      </Hero>

      <section className="capture">
        <div className="capture-row">
          <button type="button" className="btn primary capture-btn" onClick={() => capture('element')} disabled={Boolean(captureBlocked)}>
            <Icon name="camera" size={17} />
            Capture Evidence
          </button>
          <button
            type="button"
            className="btn primary capture-more"
            aria-label="More capture options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            disabled={Boolean(captureBlocked)}
          >
            <Icon name="chevron" size={14} />
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <button type="button" role="menuitem" onClick={() => capture('element')}>
                <Icon name="camera" size={14} />
                <span>
                  Select element or region
                  <small>Hover, click or drag on the page</small>
                </span>
              </button>
              <button type="button" role="menuitem" onClick={() => capture('visible')}>
                <Icon name="image" size={14} />
                <span>
                  Capture visible page
                  <small>Everything currently on screen</small>
                </span>
              </button>
            </div>
          )}
        </div>
        {(captureBlocked || captureError) && (
          <div className="notice error">
            <Icon name="alert" size={14} />
            <span>{captureBlocked ?? captureError}</span>
          </div>
        )}
      </section>

      <section className="search">
        <div className="search-box">
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search evidence…"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            aria-label="Search evidence"
          />
          {filters.search && (
            <button type="button" className="clear" aria-label="Clear search" onClick={() => set('search', '')}>
              <Icon name="close" size={12} />
            </button>
          )}
        </div>

        {records.length > 0 && (
          <div className="filter-row">
            <select
              className="select sm"
              value={filters.category ?? ''}
              onChange={(e) => set('category', isCategory(e.target.value) ? e.target.value : null)}
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {allCategories(status?.categories ?? [], filters.category).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select className="select sm" value={filters.domain ?? ''} onChange={(e) => set('domain', e.target.value || null)} aria-label="Filter by website">
              <option value="">All sites</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="iconbtn"
              title={filters.sort === 'newest' ? 'Newest first' : 'Oldest first'}
              aria-label="Toggle sort order"
              onClick={() => set('sort', filters.sort === 'newest' ? 'oldest' : 'newest')}
            >
              <Icon name="sort" size={15} className={filters.sort === 'oldest' ? 'flip' : undefined} />
            </button>
          </div>
        )}

        {tags.length > 0 && (
          <div className="tag-strip-wrap">
            <button type="button" className={`strip-arrow${tagOverflow.left ? '' : ' hidden'}`} aria-label="Scroll tags left" onClick={() => scrollStrip(-1)}>
              <Icon name="chevronLeft" size={13} />
            </button>
            <div className="tag-strip" ref={tagStrip} onScroll={measureStrip}>
              {filters.tag && (
                <button type="button" className="tag active" onClick={() => set('tag', null)}>
                  {filters.tag} <Icon name="close" size={10} />
                </button>
              )}
              {tags
                .filter((t) => t !== filters.tag)
                .map((t) => (
                  <button type="button" key={t} className="tag" onClick={() => set('tag', t)}>
                    {t}
                  </button>
                ))}
            </div>
            {tagOverflow.right && <div className="strip-fade" />}
            <button type="button" className={`strip-arrow${tagOverflow.right ? '' : ' hidden'}`} aria-label="Scroll tags right" onClick={() => scrollStrip(1)}>
              <Icon name="chevronRight" size={13} />
            </button>
          </div>
        )}
      </section>

      <section className="list">
        <div className="list-head">
          <h2>{hasFilter ? `${visible.length} result${visible.length === 1 ? '' : 's'}` : 'Recent'}</h2>
          {hasFilter && (
            <button type="button" className="link" onClick={() => onFilters(EMPTY_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>

        {loading && <div className="state">Loading…</div>}
        {error && (
          <div className="notice error">
            <Icon name="alert" size={14} />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && records.length === 0 && (
          <div className="empty">
            <div className="empty-art">
              <Icon name="camera" size={26} />
            </div>
            <h3>No evidence yet</h3>
            <p>
              Spot a pattern worth remembering? Hit <strong>Capture Evidence</strong>, pick the element, and note why it matters.
            </p>
            <p className="hint">
              <kbd>{/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'}</kbd> <kbd>Shift</kbd> <kbd>E</kbd> captures the visible area
            </p>
          </div>
        )}

        {!loading && records.length > 0 && visible.length === 0 && (
          <div className="empty small">
            <h3>Nothing matches</h3>
            <p>Try a different term or clear the filters.</p>
          </div>
        )}

        {visible.map((record) => (
          <EvidenceCard key={record.id} record={record} thumbUrl={thumbUrl(record)} onOpen={onOpen} onTag={(t) => set('tag', t)} />
        ))}
      </section>
    </div>
  );
}
