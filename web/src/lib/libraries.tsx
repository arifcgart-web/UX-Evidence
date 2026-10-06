import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Library } from '@shared/evidence';
import { listLibraries } from '@shared/api';
import { supabase } from './supabase';
import { useAuth } from './auth';

interface LibrariesState {
  libraries: Library[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<LibrariesState | null>(null);

export function LibrariesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setLibraries([]);
      setLoading(false);
      return;
    }
    try {
      setLibraries(await listLibraries(supabase()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load libraries');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ libraries, loading, error, refresh }), [libraries, loading, error, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibraries(): LibrariesState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLibraries outside LibrariesProvider');
  return ctx;
}
