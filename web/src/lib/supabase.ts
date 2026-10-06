import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey && /^https?:\/\//.test(url));

let client: SupabaseClient | null = null;

/** Lazily created so a misconfigured deploy renders the setup page instead of crashing. */
export function supabase(): SupabaseClient {
  if (!client) {
    if (!isConfigured) throw new Error('Supabase is not configured');
    client = createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
  }
  return client;
}
