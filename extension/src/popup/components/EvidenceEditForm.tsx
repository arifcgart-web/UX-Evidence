import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { EvidenceFields } from '../../types/evidence';
import { CategorySelect } from './CategorySelect';
import { TagInput } from './TagInput';

interface Props {
  initial: EvidenceFields;
  knownTags: string[];
  /** Custom categories of the library this item belongs to. */
  categories?: string[];
  /** Adds a custom category; resolves to the updated list. Omit to hide the option. */
  onAddCategory?: (name: string) => Promise<string[]>;
  saving: boolean;
  onSave: (fields: EvidenceFields) => void;
  onCancel: () => void;
}

export function EvidenceEditForm({ initial, knownTags, categories = [], onAddCategory, saving, onSave, onCancel }: Props) {
  const [fields, setFields] = useState<EvidenceFields>(initial);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof EvidenceFields>(key: K, value: EvidenceFields[K]) =>
    setFields((f) => ({ ...f, [key]: value }));

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!fields.observation.trim()) {
      setError('Add a short observation so you can find this later.');
      return;
    }
    onSave(fields);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <form className="edit-form" onSubmit={submit} onKeyDown={onKeyDown}>
      <div className="field">
        <label htmlFor="f-category">Category</label>
        <CategorySelect id="f-category" value={fields.category} custom={categories} onAdd={onAddCategory} onChange={(c) => set('category', c)} />
      </div>

      <div className="field">
        <label htmlFor="f-observation">Observation</label>
        <input
          id="f-observation"
          className={`input${error ? ' invalid' : ''}`}
          value={fields.observation}
          maxLength={200}
          placeholder="What did you notice?"
          autoFocus
          onChange={(e) => {
            setError(null);
            set('observation', e.target.value);
          }}
        />
        {error && <div className="error">{error}</div>}
      </div>

      <div className="field">
        <div className="label-row">
          <label htmlFor="f-why">Why it matters</label>
          <span className="opt">optional</span>
        </div>
        <input
          id="f-why"
          className="input"
          value={fields.whyItMatters}
          maxLength={300}
          placeholder="Why is this useful?"
          onChange={(e) => set('whyItMatters', e.target.value)}
        />
      </div>

      <div className="field">
        <div className="label-row">
          <label htmlFor="f-tags">Tags</label>
          <span className="opt">optional</span>
        </div>
        <TagInput id="f-tags" value={fields.tags} onChange={(tags) => set('tags', tags)} suggestions={knownTags} />
      </div>

      <div className="field">
        <div className="label-row">
          <label htmlFor="f-notes">Notes</label>
          <span className="opt">optional</span>
        </div>
        <textarea
          id="f-notes"
          className="textarea"
          rows={4}
          value={fields.notes}
          placeholder="Additional context…"
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
