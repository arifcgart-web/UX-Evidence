import { useEffect, useMemo, useState } from 'react';
import type { EvidenceFields, EvidenceRecord } from '../../types/evidence';
import { Icon } from '../components/Icon';
import { AnnotatedImage } from '../components/AnnotatedImage';
import { EvidenceEditForm } from '../components/EvidenceEditForm';
import { getEvidence } from '../../storage/evidenceStore';
import { send } from '../messaging';

interface Props {
  record: EvidenceRecord;
  knownTags: string[];
  categories: string[];
  onAddCategory: (name: string) => Promise<string[]>;
  canEdit: boolean;
  onBack: () => void;
  onTag: (tag: string) => void;
  onUpdate: (id: string, fields: EvidenceFields) => Promise<EvidenceRecord | null>;
  onDelete: (id: string) => Promise<void>;
  onReplace: (record: EvidenceRecord) => void;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function Detail({ record, knownTags, canEdit, onBack, onTag, onUpdate, onDelete, onReplace, categories, onAddCategory }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [showMarks, setShowMarks] = useState(true);
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop');
  const isMobile = view === 'mobile' && !!record.mobile;
  const shapes = (isMobile ? record.mobile?.annotations : record.annotations) ?? [];
  const hasMarks = shapes.length > 0;
  const fullBlob = isMobile ? record.mobileScreenshot : record.screenshot;

  useEffect(() => setView('desktop'), [record.id]);

  // Items pulled from the cloud arrive with thumbnails only; fetch the full image once per view.
  useEffect(() => {
    if (fullBlob || fetching || !record.libraryId) return;
    setFetching(true);
    (async () => {
      const res = await send<boolean>({ type: 'FETCH_SCREENSHOT', id: record.id, view: isMobile ? 'mobile' : 'desktop' });
      if (res.ok && res.data) {
        const fresh = await getEvidence(record.id);
        if (fresh) onReplace(fresh);
      }
      setFetching(false);
    })();
  }, [record.id, record.libraryId, fullBlob, isMobile, fetching, onReplace]);

  const imageBlob = (isMobile ? record.mobileScreenshot ?? record.mobileThumbnail : record.screenshot) ?? record.thumbnail;
  const imageUrl = useMemo(() => URL.createObjectURL(imageBlob), [imageBlob]);
  useEffect(() => () => URL.revokeObjectURL(imageUrl), [imageUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, onBack]);

  const openSource = () => void chrome.tabs.create({ url: record.url });

  // --- Mobile view for an already-saved item -----------------------------
  const [mobileHint, setMobileHint] = useState(false);
  useEffect(() => setMobileHint(false), [record.id]);

  /** Same page ignoring #hash, query order and a trailing slash. */
  const samePage = (a: string | undefined, b: string) => {
    try {
      const x = new URL(a ?? '');
      const y = new URL(b);
      const path = (u: URL) => u.pathname.replace(/\/+$/, '') || '/';
      return x.origin === y.origin && path(x) === path(y);
    } catch {
      return false;
    }
  };

  const addMobile = async () => {
    setActionError(null);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!samePage(tab?.url, record.url)) {
      setMobileHint(true);
      return;
    }
    const res = await send<null>({ type: 'START_MOBILE_FOR', evidenceId: record.id });
    if (res.ok) window.close();
    else setActionError(res.error);
  };

  const removeMobile = async () => {
    setActionError(null);
    const res = await send<null>({ type: 'MOBILE_REMOVE', draftId: record.id });
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    const fresh = await getEvidence(record.id);
    if (fresh) onReplace(fresh);
    setView('desktop');
  };
  const openAnnotate = () =>
    void chrome.tabs.create({ url: chrome.runtime.getURL(`annotate.html?id=${record.id}${isMobile ? '&view=mobile' : ''}`) });

  const openFullSize = async () => {
    // Data URLs survive the popup closing; blob URLs don't.
    const url = await blobToDataUrl(imageBlob);
    void chrome.tabs.create({ url });
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(record.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setActionError("Couldn't copy to the clipboard.");
    }
  };

  const save = async (fields: EvidenceFields) => {
    setSaving(true);
    setActionError(null);
    try {
      const next = await onUpdate(record.id, fields);
      if (!next) setActionError('This item no longer exists.');
      else setEditing(false);
    } catch {
      setActionError("Couldn't save changes. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setActionError(null);
    try {
      await onDelete(record.id);
      onBack();
    } catch {
      setActionError("Couldn't delete this item. Try again.");
    }
  };

  const initialFields: EvidenceFields = {
    category: record.category,
    observation: record.observation,
    whyItMatters: record.whyItMatters,
    notes: record.notes,
    tags: record.tags,
  };

  return (
    <div className="detail">
      <header className="topbar">
        <button type="button" className="iconbtn" onClick={editing ? () => setEditing(false) : onBack} aria-label="Back">
          <Icon name="back" size={18} />
        </button>
        <div className="topbar-title">
          <span className="site">{record.domain}</span>
          <span className="cat-pill">{record.category}</span>
        </div>
        {!editing && canEdit && (
          <div className="topbar-actions">
            <button type="button" className="iconbtn" title="Edit" aria-label="Edit" onClick={() => setEditing(true)}>
              <Icon name="edit" size={20} />
            </button>
            <button type="button" className="iconbtn danger" title="Delete" aria-label="Delete" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={20} />
            </button>
          </div>
        )}
      </header>

      <div className="detail-body">
        {(record.mobile || canEdit) && (
          <div className="view-tabs" role="tablist" aria-label="Screenshot view">
            <button type="button" role="tab" aria-selected={!isMobile} className={!isMobile ? 'on' : ''} onClick={() => setView('desktop')}>
              <Icon name="monitor" size={14} /> Desktop
            </button>
            {record.mobile ? (
              <button type="button" role="tab" aria-selected={isMobile} className={isMobile ? 'on' : ''} onClick={() => setView('mobile')}>
                <Icon name="phone" size={14} /> Mobile
              </button>
            ) : (
              <button type="button" className="add" onClick={() => void addMobile()}>
                <Icon name="plus" size={14} /> Add mobile view
              </button>
            )}
          </div>
        )}
        {mobileHint && (
          <div className="notice mobile-hint">
            <Icon name="phone" size={14} />
            <span>
              Open this page first, then click the UX Evidence icon, open this item and choose <b>Add mobile view</b>.{' '}
              <button type="button" className="linkbtn" onClick={openSource}>
                Open page
              </button>
            </span>
          </div>
        )}
        <div className="shot-wrap">
          <button type="button" className={`shot${isMobile ? ' is-mobile' : ''}`} onClick={openFullSize} title="Open full size">
            <AnnotatedImage src={imageUrl} alt={record.observation} shapes={shapes} hidden={!showMarks} />
            {!fullBlob && fetching && <span className="shot-dim">loading full size…</span>}
            {record.syncState === 'pending' && <span className="shot-sync">waiting to upload</span>}
          </button>
          {isMobile && canEdit && (
            <div className="shot-tools">
              <button type="button" onClick={() => void addMobile()} title="Capture the mobile view again">
                <Icon name="refresh" size={12} /> Retake
              </button>
              <button type="button" className="danger" onClick={() => void removeMobile()} title="Remove the mobile view" aria-label="Remove mobile view">
                <Icon name="trash" size={12} />
              </button>
            </div>
          )}
          {hasMarks && (
            <button type="button" className={`marks-toggle${showMarks ? '' : ' off'}`} onClick={() => setShowMarks((v) => !v)}>
              <Icon name={showMarks ? 'eye' : 'eyeOff'} size={12} /> {showMarks ? 'Markings on' : 'Markings off'}
            </button>
          )}
        </div>

        {actionError && (
          <div className="notice error">
            <Icon name="alert" size={14} />
            <span>{actionError}</span>
          </div>
        )}

        {confirmDelete && (
          <div className="confirm">
            <span>Delete this evidence{record.libraryId ? ' for everyone in the library' : ''}? This can't be undone.</span>
            <div className="confirm-actions">
              <button type="button" className="btn ghost sm" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
              <button type="button" className="btn danger sm" onClick={remove}>
                Delete
              </button>
            </div>
          </div>
        )}

        {editing ? (
          <EvidenceEditForm
            initial={initialFields}
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
              <p className="lead">{record.observation}</p>
            </section>

            {record.whyItMatters && (
              <section className="block">
                <h3>Why it matters</h3>
                <p>{record.whyItMatters}</p>
              </section>
            )}

            {record.notes && (
              <section className="block">
                <h3>Notes</h3>
                <p className="notes">{record.notes}</p>
              </section>
            )}

            {record.tags.length > 0 && (
              <section className="block">
                <h3>Tags</h3>
                <div className="tag-row">
                  {record.tags.map((t) => (
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
                <dd title={record.url}>{record.pageTitle || record.url}</dd>
                <dt>URL</dt>
                <dd className="url" title={record.url}>
                  {record.url}
                </dd>
                <dt>Viewport</dt>
                <dd className="wrap">
                  {record.viewport.width}×{record.viewport.height}
                  {record.pageType ? ` · ${record.pageType}` : ''}
                </dd>
              </dl>
            </section>

            {canEdit && (
              <div className="detail-actions one">
                <button type="button" className="btn ghost" onClick={openAnnotate}>
                  <Icon name="pen" size={18} /> {hasMarks ? 'Edit markings' : 'Annotate'}
                </button>
              </div>
            )}
            <div className="detail-actions">
              <button type="button" className="btn ghost" onClick={openSource}>
                <Icon name="external" size={18} /> Open source page
              </button>
              <button type="button" className="btn ghost" onClick={copyUrl}>
                <Icon name={copied ? 'check' : 'copy'} size={18} /> {copied ? 'Copied' : 'Copy URL'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
