import { useRef, useState, type KeyboardEvent } from 'react';
import { normalizeTags } from '@shared/search';

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  id?: string;
}

export function TagInput({ value, onChange, suggestions = [], id }: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    if (!draft.trim()) return;
    onChange(normalizeTags([...value, ...draft.split(',')]));
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const chosen = new Set(value.map((t) => t.toLowerCase()));
  const visibleSuggestions = suggestions.filter((s) => !chosen.has(s.toLowerCase())).slice(0, 8);

  return (
    <div>
      <div className="tags" onClick={() => inputRef.current?.focus()}>
        {value.map((tag) => (
          <span className="chip" key={tag}>
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((t) => t !== tag));
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={value.length ? '' : 'Add tag, press Enter'}
          aria-label="Add tag"
        />
      </div>
      {visibleSuggestions.length > 0 && (
        <div className="suggest">
          {visibleSuggestions.map((s) => (
            <button type="button" key={s} onClick={() => onChange(normalizeTags([...value, s]))}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
