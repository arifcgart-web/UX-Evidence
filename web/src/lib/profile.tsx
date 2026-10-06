import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMyProfile, nameFromEmail, saveMyProfile } from '@shared/api';
import { supabase } from './supabase';
import { useAuth } from './auth';

interface ProfileState {
  /** Display name, falling back to the email's local part. */
  name: string;
  hasCustomName: boolean;
  save: (name: string) => Promise<void>;
}

const Ctx = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [custom, setCustom] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setCustom(null);
      return;
    }
    getMyProfile(supabase())
      .then((p) => setCustom(p?.displayName ?? null))
      .catch(() => setCustom(null));
  }, [user]);

  const save = useCallback(async (name: string) => {
    await saveMyProfile(supabase(), name);
    setCustom(name.trim());
  }, []);

  const value = useMemo<ProfileState>(
    () => ({ name: custom ?? nameFromEmail(user?.email), hasCustomName: custom !== null, save }),
    [custom, user?.email, save],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProfile outside ProfileProvider');
  return ctx;
}
