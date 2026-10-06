import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** Built-in backgrounds are CSS (no copyrighted photos); "custom" is the user's own image, kept on this device. */
export type BackgroundId = 'aurora' | 'sea' | 'meadow' | 'dusk' | 'plain' | 'custom';

export const BACKGROUNDS: Array<{ id: Exclude<BackgroundId, 'custom'>; label: string }> = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'sea', label: 'Sunset sea' },
  { id: 'meadow', label: 'Meadow' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'plain', label: 'Plain' },
];

const KEY = 'uxe.bg';
const CUSTOM_KEY = 'uxe.bgCustom';
const MAX_CUSTOM_BYTES = 3_500_000;

interface BackgroundState {
  id: BackgroundId;
  customUrl: string | null;
  set: (id: BackgroundId) => void;
  setCustomFile: (file: File) => Promise<void>;
}

const Ctx = createContext<BackgroundState | null>(null);

function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<BackgroundId>(() => read<BackgroundId>(KEY, 'aurora'));
  const [customUrl, setCustomUrl] = useState<string | null>(() => read<string>(CUSTOM_KEY, '') || null);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.bg = id === 'custom' && !customUrl ? 'aurora' : id;
    root.style.setProperty('--custom-bg', customUrl ? `url("${customUrl}")` : 'none');
  }, [id, customUrl]);

  const value = useMemo<BackgroundState>(
    () => ({
      id,
      customUrl,
      set: (next) => {
        setId(next);
        try {
          localStorage.setItem(KEY, next);
        } catch {
          /* ignore */
        }
      },
      setCustomFile: async (file) => {
        if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
        if (file.size > MAX_CUSTOM_BYTES) throw new Error('Image is too large. Keep it under 3 MB.');
        const url = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(r.error);
          r.readAsDataURL(file);
        });
        try {
          localStorage.setItem(CUSTOM_KEY, url);
          localStorage.setItem(KEY, 'custom');
        } catch {
          throw new Error('Could not store the image on this device. Try a smaller one.');
        }
        setCustomUrl(url);
        setId('custom');
      },
    }),
    [id, customUrl],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBackground(): BackgroundState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBackground outside BackgroundProvider');
  return ctx;
}
