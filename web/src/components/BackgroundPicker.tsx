import { useEffect, useRef, useState } from 'react';
import { BACKGROUNDS, useBackground } from '../lib/background';
import { Icon } from './Icon';

/** Small icon in the bottom-left corner; opens a popover of backgrounds. */
export function BackgroundPicker() {
  const bg = useBackground();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      await bg.setCustomFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that image');
    }
  };

  return (
    <div className="bg-picker" ref={ref}>
      {open && (
        <div className="bg-pop" role="dialog" aria-label="Background">
          <div className="bg-title">Background</div>
          <div className="bg-grid">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`bg-swatch${bg.id === b.id ? ' on' : ''}`}
                data-bg={b.id}
                title={b.label}
                aria-label={b.label}
                aria-pressed={bg.id === b.id}
                onClick={() => bg.set(b.id)}
              />
            ))}
            <button
              type="button"
              className={`bg-swatch custom${bg.id === 'custom' ? ' on' : ''}`}
              style={bg.customUrl ? { backgroundImage: `url(${bg.customUrl})` } : undefined}
              title={bg.customUrl ? 'Your image' : 'Upload your own'}
              aria-label="Upload your own"
              onClick={() => (bg.customUrl ? bg.set('custom') : fileRef.current?.click())}
            >
              {!bg.customUrl && <Icon name="plus" size={16} />}
            </button>
          </div>
          <button type="button" className="link" onClick={() => fileRef.current?.click()}>
            {bg.customUrl ? 'Replace your image' : 'Upload your own image'}
          </button>
          {error && <div className="error">{error}</div>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
      )}
      <button type="button" className="bg-btn" aria-label="Change background" title="Change background" onClick={() => setOpen((o) => !o)}>
        <Icon name="image" size={18} />
      </button>
    </div>
  );
}
