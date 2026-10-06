/**
 * Supabase client for the service worker. Sessions persist in
 * chrome.storage.local because a worker has no localStorage.
 *
 * Where the project URL and anon key come from, in priority order:
 *   1. values the user pasted into the popup ("Connect to cloud"), stored in chrome.storage.local
 *   2. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY baked in at build time (extension/.env)
 * With neither, the extension runs local-only.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIG_KEY, SESSION_KEY } from './keys';

export interface CloudConfig {
  url: string;
  anonKey: string;
}

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function valid(c: Partial<CloudConfig> | undefined | null): c is CloudConfig {
  return Boolean(c && typeof c.url === 'string' && /^https:\/\/.+/.test(c.url) && typeof c.anonKey === 'string' && c.anonKey.length > 20);
}

export async function getConfig(): Promise<CloudConfig | null> {
  const stored = (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY] as Partial<CloudConfig> | undefined;
  if (valid(stored)) return stored;
  const env = { url: envUrl ?? '', anonKey: envKey ?? '' };
  return valid(env) ? env : null;
}

export async function setConfig(config: CloudConfig | null): Promise<void> {
  if (config) {
    const clean = { url: config.url.trim().replace(/\/+$/, ''), anonKey: config.anonKey.trim() };
    if (!valid(clean)) throw new Error('That does not look like a Supabase URL and anon key.');
    await chrome.storage.local.set({ [CONFIG_KEY]: clean });
  } else {
    await chrome.storage.local.remove(CONFIG_KEY);
  }
  client = null;
  clientConfig = null;
}

export async function isConfigured(): Promise<boolean> {
  return (await getConfig()) !== null;
}

const chromeStorage = {
  async getItem(key: string): Promise<string | null> {
    const out = await chrome.storage.local.get(key);
    const v = out[key];
    return typeof v === 'string' ? v : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
};

let client: SupabaseClient | null = null;
let clientConfig: string | null = null;

export async function cloud(): Promise<SupabaseClient> {
  const config = await getConfig();
  if (!config) throw new Error('Cloud sync is not configured.');
  const fingerprint = `${config.url}|${config.anonKey}`;
  if (!client || clientConfig !== fingerprint) {
    client = createClient(config.url, config.anonKey, {
      auth: {
        storage: chromeStorage,
        storageKey: SESSION_KEY,
        persistSession: true,
        autoRefreshToken: false, // workers get suspended; getSession() refreshes on demand instead
        detectSessionInUrl: false,
      },
    });
    clientConfig = fingerprint;
  }
  return client;
}

export interface Account {
  email: string;
  userId: string;
}

/** The signed-in account, or null. Refreshes an expired token as a side effect. */
export async function currentAccount(): Promise<Account | null> {
  if (!(await isConfigured())) return null;
  const { data } = await (await cloud()).auth.getSession();
  const user = data.session?.user;
  return user ? { email: user.email ?? '', userId: user.id } : null;
}
