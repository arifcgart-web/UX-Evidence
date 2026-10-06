import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CATEGORIES, canEdit, isCategory, type Category, type EvidenceFields } from '@shared/evidence';
import { collectDomains, collectTags, queryEvidence, type SortOrder } from '@shared/search';
import { deleteEvidence, listEvidence, signedUrls, updateEvidenceFields, type RemoteEvidence } from '@shared/api';
import { fullDate, relativeDate, truncate } from '@shared/format';
import { supabase } from '../lib/supabase';
import { useLibraries } from '../lib/libraries';
import { Icon } from '../components/Icon';
import { EvidenceEditForm } from '../components/EvidenceEditForm';

export function LibraryPage() {
  const { libraryId = '' } = useParams();
  const { libraries } = useLibraries();
  const library = libraries.find((l) => l.id === libraryId);
  const editable = canEdit(library?.role);

  const [items, setItems] = useState<RemoteEvidence[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filters = {
    search: params.get('q') ?? '',
    category: (isCategory(params.get('cat')) ? params.get('cat') : null) as Category | null,
    domain: params.get('site'),
    tag: params.get('tag'),
    sort: (params.get('sort') === 'oldest' ? 'oldest' : 'newest') as SortOrder,
  };
  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const clearFilters = () => setParams(new URLSearchParams(), { replace: true });
  const hasFilter = Boolean(filters.search || filters.category || filters.domain || filters.tag);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listEvidence(supabase(), libraryId);
      setItems(rows);
      setError(null);
      const map = await signedUrls(supabase(), rows.flatMap((r) => [r.thumbnailPath, r.screenshotPath]));
      setUrls(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this library');
    } finally {
      setLoading(false);
    }
  }, [libraryId]);

  useEffect(() => {
    setSelectedId(null);
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visible = useMemo(() => queryEvidence(items, filters), [items, filters.search, filters.category, filters.domain, filters.tag, filters.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const tags = useMemo(() => collectTags(items), [items]);
  const domains = useMemo(() => collectDomains(items), [items]);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  const update = async (id: string, fields: EvidenceFields) => {
    const next = await updateEvidenceFields(supabase(), id, fields);
    setItems((prev) => prev.map((i) => (i.id === id ? next : i)));
  };

  const remove = async (item: RemoteEvidence) => {
    await deleteEvidence(supabase(), item);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setSelectedId(null);
  };

  const exportJson = () => {
    const payload = {
      library: library?.name,
      exportedAt: new Date().toISOString(),
      items: items.map(({ screenshotPath, thumbnailPath, deletedAt, ...rest }) => rest), // eslint-disable-line @typescript-eslint/no-unused-vars
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(library?.name ?? 'ux-evidence').replace(/[^\w-]+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!library && libraries.length > 0) {
    return (
      <div className="page-state">
        <h2>Library not found</h2>
        <p>You may have been removed from it, or the link is wrong.</p>
      </div>
    );
  }

  return (
    <div className="library">
      <header className="page-head">
        <div>
          <h1>{library?.name ?? '…'}</h1>
          <div className="muted small">
            {items.length} item{items.length === 1 ? '' : 's'}
            {library && library.role !== 'owner' && ` · you are ${library.role === 'editor' ? 'an editor' : 'a viewer'}`}
          </div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn ghost" onClick={exportJson} disabled={items.length === 0}>
            <Icon name="download" size={14} /> Export JSON
          </button>
          <Link to={`/l/${libraryId}/team`} className="btn ghost">
            <Icon name="users" size={14} /> Team
          </Link>
        </div>
      </header>

      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search evidence…  ⌘K"
            value={filters.search}
            onChange={(e) => setFilter('q', e.target.value)}
            aria-label="Search evidence"
          />
          {filters.search && (
            <button type="button" className="clear" aria-label="Clear search" onClick={() => setFilter('q', null)}>
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
        <select className="select sm" value={filters.category ?? ''} onChange={(e) => setFilter('cat', e.target.value || null)} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="select sm" value={filters.domain ?? ''} onChange={(e) => setFilter('site', e.target.value || null)} aria-label="Website">
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
          onClick={() => setFilter('sort', filters.sort === 'newest' ? 'oldest' : null)}
        >
          <Icon name="sort" size={15} className={filters.sort === 'oldest' ? 'flip' : undefined} />
        </button>
        {hasFilter && (
          <button type="button" className="link" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {(filters.tag || tags.length > 0) && (
        <div className="tag-row">
          {filters.tag ? (
            <button type="button" className="tag active" onClick={() => setFilter('tag', null)}>
              {filters.tag} <Icon name="close" size={10} />
            </button>
          ) : (
            tags.slice(0, 14).map((t) => (
              <button type="button" key={t} className="tag" onClick={() => setFilter('tag', t)}>
                {t}
              </button>
            ))
          )}
        </div>
      )}

      {error && (
        <div className="notice error">
          <Icon name="alert" size={14} /> <span>{error}</span>
        </div>
      )}
      {loading && <div className="page-state">Loading…</div>}

      {!loading && items.length === 0 && !error && (
        <div className="empty">
          <div className="empty-art">
            <Icon name="frame" size={28} />
          </div>
          <h3>Nothing here yet</h3>
          <p>
            Capture evidence with the <Link to="/extension">Chrome extension</Link> while signed in to this account and it
            will appear here.
          </p>
        </div>
      )}
      {!loading && items.length > 0 && visible.length === 0 && (
        <div className="empty small">
          <h3>Nothing matches</h3>
          <p>Try a different term or clear the filters.</p>
        </div>
      )}

      <div className="grid">
        {visible.map((item) => (
          <article key={item.id} className={`card${item.id === selectedId ? ' selected' : ''}`}>
            <button type="button" className="card-main" onClick={() => setSelectedId(item.id)}>
              <div className="thumb">
                {urls.get(item.thumbnailPath) ? <img src={urls.get(item.thumbnailPath)} alt="" loading="lazy" /> : <div className="thumb-ph" />}
              </div>
              <div className="card-body">
                <div className="card-meta">
                  <span className="site">{item.domain}</span>
                  <span className="dot">·</span>
                  <span className="cat">{item.category}</span>
                </div>
                <p className="obs">{truncate(item.observation, 110)}</p>
                <div className="card-foot">{relativeDate(item.createdAt)}</div>
              </div>
            </button>
            {item.tags.length > 0 && (
              <div className="card-tags">
                {item.tags.slice(0, 5).map((t) => (
                  <button type="button" key={t} className="tag" onClick={() => setFilter('tag', t)}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {selected && (
        <DetailDrawer
          item={selected}
          screenshotUrl={urls.get(selected.screenshotPath)}
          editable={editable}
          knownTags={tags}
          onClose={() => setSelectedId(null)}
          onTag={(t) => setFilter('tag', t)}
          onUpdate={update}
          onDelete={remove}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface DrawerProps {
  item: RemoteEvidence;
  screenshotUrl: string | undefined;
  editable: boolean;
  knownTags: string[];
  onClose: () => void;
  onTag: (tag: string) => void;
  onUpdate: (id: string, fields: EvidenceFields) => Promise<void>;
  onDelete: (item: RemoteEvidence) => Promise<void>;
}

function DetailDrawer({ item, screenshotUrl, editable, knownTags, onClose, onTag, onUpdate, onDelete }: DrawerProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setConfirm(false);
    setErr(null);
  }, [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, onClose]);

  const save = async (fields: EvidenceFields) => {
    setSaving(true);
    setErr(null);
    try {
      await onUpdate(item.id, fields);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(item.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Evidence detail">
        <header className="drawer-head">
          <div className="topbar-title">
            <span className="site">{item.domain}</span>
            <span className="cat-pill">{item.category}</span>
          </div>
          <div className="topbar-actions">
            {editable && !editing && (
              <>
                <button type="button" className="iconbtn" title="Edit" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={16} />
                </button>
                <button type="button" className="iconbtn danger" title="Delete" onClick={() => setConfirm(true)}>
                  <Icon name="trash" size={16} />
                </button>
              </>
            )}
            <button type="button" className="iconbtn" title="Close" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>

        <div className="drawer-body">
          {screenshotUrl ? (
            <a className="shot" href={screenshotUrl} target="_blank" rel="noreferrer" title="Open full size">
              <img src={screenshotUrl} alt={item.observation} />
              <span className="shot-dim">
                <Icon name="expand" size={11} /> {item.screenshotWidth}×{item.screenshotHeight}
              </span>
            </a>
          ) : (
            <div className="shot placeholder" />
          )}

          {err && (
            <div className="notice error">
              <Icon name="alert" size={14} /> <span>{err}</span>
            </div>
          )}

          {confirm && (
            <div className="confirm">
              <span>Delete this evidence for everyone in the library? This can't be undone.</span>
              <div className="confirm-actions">
                <button type="button" className="btn ghost sm" onClick={() => setConfirm(false)}>
                  Keep
                </button>
                <button type="button" className="btn danger sm" onClick={() => void onDelete(item).catch((e) => setErr(String(e)))}>
                  Delete
                </button>
              </div>
            </div>
          )}

          {editing ? (
            <EvidenceEditForm
              initial={{ category: item.category, observation: item.observation, whyItMatters: item.whyItMatters, notes: item.notes, tags: item.tags }}
              knownTags={knownTags}
              saving={saving}
              onSave={save}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <section className="block">
                <h3>Observation</h3>
                <p className="lead">{item.observation}</p>
              </section>
              {item.whyItMatters && (
                <section className="block">
                  <h3>Why it matters</h3>
                  <p>{item.whyItMatters}</p>
                </section>
              )}
              {item.notes && (
                <section className="block">
                  <h3>Notes</h3>
                  <p className="notes">{item.notes}</p>
                </section>
              )}
              {item.tags.length > 0 && (
                <section className="block">
                  <h3>Tags</h3>
                  <div className="tag-row">
                    {item.tags.map((t) => (
                      <button type="button" key={t} className="tag" onClick={() => onTag(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section className="block meta">
                <dl>
                  <dt>Page</dt>
                  <dd title={item.url}>{item.pageTitle || item.url}</dd>
                  <dt>URL</dt>
                  <dd className="url" title={item.url}>
                    {item.url}
                  </dd>
                  <dt>Captured</dt>
                  <dd className="wrap">
                    {fullDate(item.createdAt)} · {item.viewport.width}×{item.viewport.height} viewport
                    {item.pageType ? ` · ${item.pageType}` : ''}
                  </dd>
                </dl>
              </section>
              <div className="detail-actions">
                <a className="btn ghost" href={item.url} target="_blank" rel="noreferrer">
                  <Icon name="external" size={14} /> Open source page
                </a>
                <button type="button" className="btn ghost" onClick={() => void copy()}>
                  <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy URL'}
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
