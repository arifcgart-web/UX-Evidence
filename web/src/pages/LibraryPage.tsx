import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { allCategories, canEdit, isCategory, type Category, type EvidenceFields } from '@shared/evidence';
import { collectDomains, collectTags, queryEvidence, type SortOrder } from '@shared/search';
import {
  addLibraryCategory,
  deleteEvidence,
  listEvidence,
  listMembers,
  listProfiles,
  nameFromEmail,
  signedUrls,
  updateEvidenceAnnotations,
  updateEvidenceFields,
  type RemoteEvidence,
} from '@shared/api';
import { openAnnotationEditor, EDITOR_CSS } from '@shared/annotationEditor';
import { truncate } from '@shared/format';
import { supabase } from '../lib/supabase';
import { useLibraries } from '../lib/libraries';
import { Icon } from '../components/Icon';
import { EvidenceEditForm } from '../components/EvidenceEditForm';
import { AnnotatedImage } from '../components/AnnotatedImage';

type ViewMode = 'grid' | 'list';
const VIEW_KEY = 'uxe.view';

let editorCssInjected = false;
function ensureEditorCss() {
  if (editorCssInjected) return;
  const st = document.createElement('style');
  st.textContent = EDITOR_CSS;
  document.head.append(st);
  editorCssInjected = true;
}

function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !domain) return <span className="favicon" />;
  return (
    <img
      className="favicon"
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
      alt=""
      width={14}
      height={14}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function LibraryPage() {
  const { libraryId = '' } = useParams();
  const { libraries, refresh: refreshLibraries } = useLibraries();
  const library = libraries.find((l) => l.id === libraryId);
  const customCategories = library?.categories ?? [];

  const addCategory = useCallback(
    async (name: string) => {
      if (!libraryId) throw new Error('No library selected');
      const list = await addLibraryCategory(supabase(), libraryId, name);
      await refreshLibraries();
      return list;
    },
    [libraryId, refreshLibraries],
  );
  const editable = canEdit(library?.role);

  const [items, setItems] = useState<RemoteEvidence[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [people, setPeople] = useState<Map<string, string>>(new Map());
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'));
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

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
      const db = supabase();
      const rows = await listEvidence(db, libraryId);
      setItems(rows);
      setError(null);
      setUrls(await signedUrls(db, rows.flatMap((r) => [r.thumbnailPath, r.screenshotPath])));
      const members = await listMembers(db, libraryId).catch(() => []);
      setMemberCount(members.length);
      const names = await listProfiles(db, members.map((m) => m.userId));
      const map = new Map<string, string>();
      for (const m of members) map.set(m.userId, names.get(m.userId) ?? nameFromEmail(m.email));
      setPeople(map);
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

  // tag strip overflow
  const measure = () => {
    const el = strip.current;
    if (!el) return;
    setOverflow({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  useEffect(() => {
    measure();
    const el = strip.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tags, filters.tag]);
  const scrollStrip = (dir: -1 | 1) => strip.current?.scrollBy({ left: dir * 240, behavior: 'smooth' });

  const changeView = (v: ViewMode) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  const update = async (id: string, fields: EvidenceFields) => {
    const next = await updateEvidenceFields(supabase(), id, fields);
    setItems((prev) => prev.map((i) => (i.id === id ? next : i)));
  };

  const annotate = async (item: RemoteEvidence) => {
    const url = urls.get(item.screenshotPath);
    if (!url) return;
    ensureEditorCss();
    const result = await openAnnotationEditor({ imageUrl: url, shapes: item.annotations, viewportFraction: 0.8, root: document.body, title: `Annotate · ${item.domain}` });
    if (!result) return;
    const next = await updateEvidenceAnnotations(supabase(), item.id, result);
    setItems((prev) => prev.map((i) => (i.id === item.id ? next : i)));
  };

  const remove = async (item: RemoteEvidence) => {
    await deleteEvidence(supabase(), item);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setSelectedId(null);
  };

  const copyUrl = async (item: RemoteEvidence) => {
    await navigator.clipboard.writeText(item.url);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1200);
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

  const roleLine = library
    ? library.role === 'owner'
      ? 'you own this library'
      : `you are ${library.role === 'editor' ? 'an editor' : 'a viewer'}`
    : '';

  return (
    <div className="library">
      <header className="page-head">
        <div>
          <h1>{library?.name ?? '…'}</h1>
          <div className="muted small">
            {items.length} item{items.length === 1 ? '' : 's'}
            {memberCount !== null && ` · ${memberCount} member${memberCount === 1 ? '' : 's'}`}
            {roleLine && ` · ${roleLine}`}
          </div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn ghost" onClick={exportJson} disabled={items.length === 0}>
            <Icon name="download" size={16} /> Export JSON
          </button>
          <Link to={`/l/${libraryId}/team`} className="btn ghost">
            <Icon name="users" size={16} /> Team
          </Link>
        </div>
      </header>

      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search evidence…"
            value={filters.search}
            onChange={(e) => setFilter('q', e.target.value)}
            aria-label="Search evidence"
          />
          {filters.search ? (
            <button type="button" className="clear" aria-label="Clear search" onClick={() => setFilter('q', null)}>
              <Icon name="close" size={12} />
            </button>
          ) : (
            <kbd>⌘K</kbd>
          )}
        </div>
        <select className="select sm" value={filters.category ?? ''} onChange={(e) => setFilter('cat', e.target.value || null)} aria-label="Category">
          <option value="">All categories</option>
          {allCategories(customCategories, filters.category).map((c) => (
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
          className="iconbtn boxed"
          title={filters.sort === 'newest' ? 'Newest first' : 'Oldest first'}
          onClick={() => setFilter('sort', filters.sort === 'newest' ? 'oldest' : null)}
        >
          <Icon name="sort" size={15} className={filters.sort === 'oldest' ? 'flip' : undefined} />
        </button>
        <div className="seg" role="radiogroup" aria-label="View">
          <button type="button" role="radio" aria-checked={view === 'grid'} className={view === 'grid' ? 'on' : ''} title="Grid" onClick={() => changeView('grid')}>
            <Icon name="grid" size={15} />
          </button>
          <button type="button" role="radio" aria-checked={view === 'list'} className={view === 'list' ? 'on' : ''} title="List" onClick={() => changeView('list')}>
            <Icon name="list" size={15} />
          </button>
        </div>
        {hasFilter && (
          <button type="button" className="link" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="tag-strip-wrap">
          <button type="button" className={`strip-arrow${overflow.left ? '' : ' hidden'}`} aria-label="Scroll tags left" onClick={() => scrollStrip(-1)}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <div className="tag-strip" ref={strip} onScroll={measure}>
            {filters.tag && (
              <button type="button" className="tag active" onClick={() => setFilter('tag', null)}>
                {filters.tag} <Icon name="close" size={10} />
              </button>
            )}
            {tags
              .filter((t) => t !== filters.tag)
              .map((t) => (
                <button type="button" key={t} className="tag" onClick={() => setFilter('tag', t)}>
                  {t}
                </button>
              ))}
          </div>
          {overflow.right && <div className="strip-fade" />}
          <button type="button" className={`strip-arrow${overflow.right ? '' : ' hidden'}`} aria-label="Scroll tags right" onClick={() => scrollStrip(1)}>
            <Icon name="chevronRight" size={14} />
          </button>
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
            <Icon name="camera" size={28} />
          </div>
          <h3>Nothing here yet</h3>
          <p>
            Capture evidence with the <Link to="/extension">Chrome extension</Link> while signed in to this account and it will appear here.
          </p>
        </div>
      )}
      {!loading && items.length > 0 && visible.length === 0 && (
        <div className="empty small">
          <h3>Nothing matches</h3>
          <p>Try a different term or clear the filters.</p>
        </div>
      )}

      <div className={view === 'grid' ? 'grid' : 'list-view'}>
        {visible.map((item) => (
          <article key={item.id} className={`card${item.id === selectedId ? ' selected' : ''}`}>
            <button type="button" className="card-main" onClick={() => setSelectedId(item.id)}>
              {urls.get(item.thumbnailPath) ? (
                <AnnotatedImage className="thumb" src={urls.get(item.thumbnailPath)!} alt="" shapes={item.annotations} cover>
                  <span className="thumb-badge cat">{item.category}</span>
                  {item.annotations.length > 0 && (
                    <span className="thumb-badge marks">
                      <Icon name="pen" size={11} /> {item.annotations.length}
                    </span>
                  )}
                </AnnotatedImage>
              ) : (
                <div className="thumb">
                  <div className="thumb-ph" />
                </div>
              )}
              <div className="card-body">
                <div className="card-meta">
                  <Favicon domain={item.domain} />
                  <span className="site">{item.domain}</span>
                  {item.pageTitle && (
                    <>
                      <span>·</span>
                      <span className="title">{item.pageTitle}</span>
                    </>
                  )}
                </div>
                <p className="obs">{truncate(item.observation, 120)}</p>
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
            <div className="card-hover">
              <a className="iconbtn" href={item.url} target="_blank" rel="noreferrer" title="Open source page">
                <Icon name="external" size={14} />
              </a>
              <button type="button" className="iconbtn" title="Copy URL" onClick={() => void copyUrl(item)}>
                <Icon name={copiedId === item.id ? 'check' : 'copy'} size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {selected && (
        <DetailDrawer
          item={selected}
          screenshotUrl={urls.get(selected.screenshotPath)}
          editable={editable}
          knownTags={tags}
          categories={customCategories}
          onAddCategory={addCategory}
          addedBy={selected.createdBy ? people.get(selected.createdBy) ?? null : null}
          onClose={() => setSelectedId(null)}
          onTag={(t) => setFilter('tag', t)}
          onUpdate={update}
          onDelete={remove}
          onAnnotate={annotate}
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
  categories: string[];
  onAddCategory: (name: string) => Promise<string[]>;
  addedBy: string | null;
  onClose: () => void;
  onTag: (tag: string) => void;
  onUpdate: (id: string, fields: EvidenceFields) => Promise<void>;
  onDelete: (item: RemoteEvidence) => Promise<void>;
  onAnnotate: (item: RemoteEvidence) => Promise<void>;
}

function DetailDrawer({ item, screenshotUrl, editable, knownTags, categories, onAddCategory, addedBy, onClose, onTag, onUpdate, onDelete, onAnnotate }: DrawerProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showMarks, setShowMarks] = useState(true);
  const hasMarks = item.annotations.length > 0;

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
                  <Icon name="edit" size={18} />
                </button>
                <button type="button" className="iconbtn danger" title="Delete" onClick={() => setConfirm(true)}>
                  <Icon name="trash" size={18} />
                </button>
              </>
            )}
            <button type="button" className="iconbtn" title="Close" onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>

        <div className="drawer-body">
          {screenshotUrl ? (
            <div className="shot-wrap">
              <a className="shot" href={screenshotUrl} target="_blank" rel="noreferrer" title="Open full size">
                <AnnotatedImage src={screenshotUrl} alt={item.observation} shapes={item.annotations} hidden={!showMarks} />
                <span className="shot-dim">
                  <Icon name="expand" size={11} /> {item.screenshotWidth}×{item.screenshotHeight}
                </span>
              </a>
              {hasMarks && (
                <button type="button" className={`marks-toggle${showMarks ? '' : ' off'}`} onClick={() => setShowMarks((v) => !v)}>
                  <Icon name={showMarks ? 'eye' : 'eyeOff'} size={12} /> {showMarks ? 'Markings on' : 'Markings off'}
                </button>
              )}
            </div>
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
              categories={categories}
              onAddCategory={onAddCategory}
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
                  <dt>Viewport</dt>
                  <dd className="wrap">
                    {item.viewport.width}×{item.viewport.height}
                    {item.pageType ? ` · ${item.pageType}` : ''}
                  </dd>
                  {addedBy && (
                    <>
                      <dt>Added by</dt>
                      <dd>{addedBy}</dd>
                    </>
                  )}
                </dl>
              </section>
              {editable && (
                <div className="detail-actions one">
                  <button type="button" className="btn ghost" onClick={() => void onAnnotate(item)}>
                    <Icon name="pen" size={18} /> {hasMarks ? 'Edit markings' : 'Annotate'}
                  </button>
                </div>
              )}
              <div className="detail-actions">
                <a className="btn ghost" href={item.url} target="_blank" rel="noreferrer">
                  <Icon name="external" size={18} /> Open source page
                </a>
                <button type="button" className="btn ghost" onClick={() => void copy()}>
                  <Icon name={copied ? 'check' : 'copy'} size={18} /> {copied ? 'Copied' : 'Copy URL'}
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
