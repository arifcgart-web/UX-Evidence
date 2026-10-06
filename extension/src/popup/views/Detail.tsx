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

export function Detail({ record, knownTags, canEdit, onBack, onTag, onUpdate, onDelete, onReplace }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [showMarks, setShowMarks] = useState(true);
  const hasMarks = (record.annotations ?? []).length > 0;

  // Items pulled from the cloud arrive with a thumbnail only; fetch the full image once.
  useEffect(() => {
    if (record.screenshot || fetching) return;
    setFetching(true);
    (async () => {
      const res = await send<boolean>({ type: 'FETCH_SCREENSHOT', id: record.id });
      if (res.ok && res.data) {
        const fresh = await getEvidence(record.id);
        if (fresh) onReplace(fresh);
      }
      setFetching(false);
    })();
  }, [record.id, record.screenshot, fetching, onReplace]);

  const imageBlob = record.screenshot ?? record.thumbnail;
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
  const openAnnotate = () => void chrome.tabs.create({ url: chrome.runtime.getURL(`annotate.html?id=${record.id}`) });

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
        <div className="shot-wrap">
          <button type="button" className="shot" onClick={openFullSize} title="Open full size">
            <AnnotatedImage src={imageUrl} alt={record.observation} shapes={record.annotations ?? []} hidden={!showMarks} />
            <span className="shot-dim">
              <Icon name="expand" size={11} /> {record.screenshotWidth}×{record.screenshotHeight}
              {!record.screenshot && (fetching ? ' · loading full size…' : ' · preview')}
            </span>
            {record.syncState === 'pending' && <span className="shot-sync">waiting to upload</span>}
          </button>
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
          <EvidenceEditForm initial={initialFields} knownTags={knownTags} saving={saving} onSave={save} onCancel={() => setEditing(false)} />
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
