import { useState, type KeyboardEvent } from 'react';
import { allCategories, MAX_CATEGORY_LENGTH, normalizeCategory } from '../../types/evidence';

const NEW = '__new__';

interface Props {
  id?: string;
  value: string;
  /** Custom categories of the current library. */
  custom: string[];
  /** When given, the select offers "+ Add category…". Resolves to the new custom list. */
  onAdd?: (name: string) => Promise<string[]>;
  onChange: (category: string) => void;
  className?: string;
}

/** Category dropdown: built-ins, the library's own, and an inline "add" row. */
export function CategorySelect({ id, value, custom, onAdd, onChange, className = 'select' }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = allCategories(custom, value);

  const close = () => {
    setAdding(false);
    setDraft('');
    setError(null);
  };

  const commit = async () => {
    const name = normalizeCategory(draft);
    if (!name) {
      setError('Type a category name first.');
      return;
    }
    const existing = options.find((c) => c.toLowerCase() === name.toLowerCase());
    if (existing) {
      onChange(existing);
      close();
      return;
    }
    if (!onAdd) return;
    setBusy(true);
    try {
      await onAdd(name);
      onChange(name);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The category couldn't be added.");
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      void commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <>
      <select
        id={id}
        className={className}
        value={adding ? NEW : value}
        onChange={(e) => {
          if (e.target.value === NEW) setAdding(true);
          else onChange(e.target.value);
        }}
      >
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        {onAdd && <option value={NEW}>+ Add category…</option>}
      </select>
      {adding && (
        <div className="newcat">
          <div className="newcat-row">
            <input
              className="input"
              autoFocus
              maxLength={MAX_CATEGORY_LENGTH}
              placeholder="New category name"
              aria-label="New category name"
              value={draft}
              disabled={busy}
              onChange={(e) => {
                setError(null);
                setDraft(e.target.value);
              }}
              onKeyDown={onKey}
            />
            <button type="button" className="btn primary sm" disabled={busy} onClick={() => void commit()}>
              {busy ? 'Adding…' : 'Add'}
            </button>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={close}>
              Cancel
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      )}
    </>
  );
}
