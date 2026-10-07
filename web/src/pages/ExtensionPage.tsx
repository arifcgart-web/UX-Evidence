import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/Icon';

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (extensionId: string, message: unknown, cb: (response: unknown) => void) => void;
        lastError?: { message: string };
      };
    };
  }
}

type State = 'idle' | 'busy' | 'ok' | 'error';

export function ExtensionPage() {
  const { user, session } = useAuth();
  const [params] = useSearchParams();
  const [extId, setExtId] = useState(params.get('ext') ?? '');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = params.get('ext');
    if (fromUrl) setExtId(fromUrl);
  }, [params]);

  const canHandover = Boolean(window.chrome?.runtime?.sendMessage);

  /**
   * Ask our Edge Function for a one-time sign-in token and hand it to the
   * extension, which turns it into its own session. (Handing over this tab's
   * tokens instead would make the two share one session, and the first token
   * refresh on either side would sign both out.)
   */
  const connect = async () => {
    if (!session || !extId.trim()) return;
    const runtime = window.chrome?.runtime;
    if (!runtime?.sendMessage) {
      setState('error');
      setMessage('This only works in Google Chrome with the extension installed.');
      return;
    }
    setState('busy');
    setMessage(null);

    let tokenHash: string;
    try {
      const { data, error } = await supabase().functions.invoke<{ token_hash?: string; error?: string }>('extension-session', {
        method: 'POST',
      });
      if (error || !data?.token_hash) throw new Error(data?.error ?? error?.message ?? 'No token');
      tokenHash = data.token_hash;
    } catch {
      setState('error');
      setMessage(
        "Couldn't create a sign-in for the extension. One-time setup: deploy the \"extension-session\" Edge Function in Supabase (see the update guide), then try again.",
      );
      return;
    }

    try {
      runtime.sendMessage(
        extId.trim(),
        {
          type: 'UXE_HANDOVER',
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          tokenHash,
        },
        (response) => {
          const err = runtime.lastError?.message;
          const res = response as { ok: boolean; error?: string } | undefined;
          if (err || !res) {
            setState('error');
            setMessage(
              'Could not reach the extension. Check the ID, make sure the extension is installed and enabled, then try again.',
            );
          } else if (!res.ok) {
            setState('error');
            setMessage(res.error ?? 'The extension refused the sign-in.');
          } else {
            setState('ok');
            setMessage('Connected. You can close this tab and open the extension.');
          }
        },
      );
    } catch {
      setState('error');
      setMessage('Could not reach the extension. Check the ID and try again.');
    }
  };

  return (
    <div className="doc">
      <h1>Chrome extension</h1>
      <p className="muted">The extension is where you capture; this site is where you browse and manage.</p>

      <section className="panel handover">
        <h2>Connect the extension to this account</h2>
        <p className="muted">
          No second email needed. Open the extension popup → <strong>Sign in via the web app</strong>, which brings you
          here with the extension's ID filled in. Then click Connect.
        </p>
        <div className="handover-row">
          <input
            className="input mono"
            placeholder="Extension ID (32 letters, from chrome://extensions)"
            value={extId}
            onChange={(e) => setExtId(e.target.value)}
            spellCheck={false}
          />
          <button type="button" className="btn primary" onClick={() => void connect()} disabled={!extId.trim() || state === 'busy' || !user}>
            {state === 'busy' ? 'Connecting…' : 'Connect'}
          </button>
        </div>
        {message && (
          <div className={`notice${state === 'error' ? ' error' : ''}`}>
            <Icon name={state === 'ok' ? 'check' : 'alert'} size={14} /> <span>{message}</span>
          </div>
        )}
        {!canHandover && (
          <p className="muted small">
            This page must be opened in Google Chrome (the browser the extension is installed in).
          </p>
        )}
        <p className="muted small">
          Signed in as <strong>{user?.email}</strong>. Only connect an extension you installed yourself.
        </p>
      </section>

      <h2>Install</h2>
      <ol>
        <li>
          Get the <code>extension/dist</code> folder (from the project ZIP or by running <code>npm run build:extension</code>).
        </li>
        <li>
          In Chrome open <code>chrome://extensions</code>, switch on <strong>Developer mode</strong>.
        </li>
        <li>
          Click <strong>Load unpacked</strong> and pick the <code>extension/dist</code> folder.
        </li>
        <li>Pin the extension from the puzzle-piece menu.</li>
      </ol>

      <h2>Capture</h2>
      <ul>
        <li>
          <strong>+ Capture Evidence</strong> → hover an element, click. Drag for a region. <kbd>↑</kbd>/<kbd>↓</kbd> picks the parent/child.
        </li>
        <li>
          <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>E</kbd> starts capture from anywhere.
        </li>
        <li>Only the observation is required; everything else is optional.</li>
      </ul>
    </div>
  );
}
