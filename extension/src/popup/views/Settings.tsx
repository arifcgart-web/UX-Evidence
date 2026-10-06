import { useEffect, useState, type FormEvent } from 'react';
import type { SyncStatus } from '../../sync/sync';
import { relativeDate } from '@shared/format';
import { Hero } from '../components/Hero';
import { Icon } from '../components/Icon';
import { send } from '../messaging';

interface Props {
  status: SyncStatus | null;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onSync: () => Promise<void>;
}

const WEB_URL_KEY = 'uxe.webUrl';

async function getWebUrl(): Promise<string | null> {
  const v = (await chrome.storage.local.get(WEB_URL_KEY))[WEB_URL_KEY];
  return typeof v === 'string' ? v : null;
}

/** Open the web app's "connect extension" page, remembering the address. */
async function openWebHandover(): Promise<string | null> {
  const stored = await getWebUrl();
  const answer = window.prompt('Address of your UX Evidence web app (you must be signed in there):', stored ?? 'https://');
  if (!answer) return null;
  let base: string;
  try {
    const u = new URL(answer.trim());
    if (u.protocol !== 'https:' && u.hostname !== 'localhost') throw new Error();
    base = `${u.protocol}//${u.host}`;
  } catch {
    return 'That does not look like a web address (e.g. https://your-site.netlify.app).';
  }
  await chrome.storage.local.set({ [WEB_URL_KEY]: base });
  await chrome.tabs.create({ url: `${base}/extension?ext=${chrome.runtime.id}` });
  return null;
}

export function Settings({ status, onBack, onChanged, onSync }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webUrl, setWebUrl] = useState<string | null>(null);

  // sign-in by email
  const [step, setStep] = useState<'email' | 'link'>('email');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');

  // manual project connect
  const [cfgUrl, setCfgUrl] = useState('');
  const [cfgKey, setCfgKey] = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    void getWebUrl().then(setWebUrl);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const requestLink = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await send({ type: 'AUTH_REQUEST_CODE', email: email.trim() });
    setBusy(false);
    if (res.ok) setStep('link');
    else setError(res.error);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await send({ type: 'AUTH_VERIFY_CODE', email: email.trim(), code: link });
    setBusy(false);
    if (res.ok) {
      setStep('email');
      setLink('');
      await onChanged();
    } else setError(res.error);
  };

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await send({ type: 'SET_CLOUD_CONFIG', config: { url: cfgUrl, anonKey: cfgKey } });
    setBusy(false);
    if (res.ok) {
      setShowManual(false);
      await onChanged();
    } else setError(res.error);
  };

  const handover = () => void openWebHandover().then((err) => err && setError(err));

  if (!status) return null;

  const active = status.libraries.find((l) => l.id === status.activeLibraryId);
  const syncLabel = status.syncing
    ? 'Syncing…'
    : status.lastError
      ? status.lastError
      : status.pending > 0
        ? `${status.pending} item${status.pending === 1 ? '' : 's'} waiting to upload`
        : status.lastSyncAt
          ? `Synced ${relativeDate(status.lastSyncAt).toLowerCase()}`
          : 'Not synced yet';

  return (
    <div className="settings">
      <Hero title="Settings" subtitle="Account, library and sync" onBack={onBack} />

      {error && (
        <div className="notice error" style={{ margin: '12px 14px 0' }}>
          <Icon name="alert" size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* ---------------- Account ---------------- */}
      <section className="sec">
        <h3>Account</h3>
        {status.account ? (
          <div className="line">
            <div className="who">
              <span className="avatar">{(status.account.email[0] ?? '?').toUpperCase()}</span>
              <div className="l">
                <b>{status.account.email}</b>
                <span>Signed in</span>
              </div>
            </div>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void run(() => send({ type: 'AUTH_SIGN_OUT' }))}>
              Sign out
            </button>
          </div>
        ) : !status.configured ? (
          <div className="stack">
            <div className="l">
              <b>Not signed in</b>
              <span>Captures stay on this computer until you sign in. Sign in to sync and share with your team.</span>
            </div>
            <button type="button" className="btn primary" onClick={handover}>
              Sign in via the web app
            </button>
            {!showManual ? (
              <button type="button" className="link center" onClick={() => setShowManual(true)}>
                Connect a project manually instead
              </button>
            ) : (
              <form className="stack" onSubmit={connect}>
                <input className="input" placeholder="https://xxxx.supabase.co" value={cfgUrl} onChange={(e) => setCfgUrl(e.target.value)} required />
                <input className="input" placeholder="publishable / anon key" value={cfgKey} onChange={(e) => setCfgKey(e.target.value)} required />
                <button type="submit" className="btn ghost" disabled={busy || !cfgUrl || !cfgKey}>
                  {busy ? 'Saving…' : 'Connect'}
                </button>
              </form>
            )}
          </div>
        ) : step === 'email' ? (
          <form className="stack" onSubmit={requestLink}>
            <div className="l">
              <b>Not signed in</b>
              <span>Captures stay on this computer until you sign in. Sign in to sync and share.</span>
            </div>
            <button type="button" className="btn primary" onClick={handover}>
              Sign in via the web app
            </button>
            <div className="or">or by email link</div>
            <input className="input" type="email" required placeholder="you@studio.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" className="btn ghost" disabled={busy || !email}>
              {busy ? 'Sending…' : 'Send sign-in email'}
            </button>
          </form>
        ) : (
          <form className="stack" onSubmit={verify}>
            <div className="l">
              <b>Paste the sign-in link</b>
              <span>
                Sent to <strong>{email}</strong>. In the email, right-click “Sign in” → Copy link address and paste it here. Don't click the link.
              </span>
            </div>
            <input className="input" required autoFocus placeholder="https://….supabase.co/auth/v1/verify?token=…" value={link} onChange={(e) => setLink(e.target.value)} />
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => setStep('email')}>
                Back
              </button>
              <button type="submit" className="btn primary" disabled={busy || link.trim().length < 6}>
                {busy ? 'Checking…' : 'Sign in'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ---------------- Library ---------------- */}
      {status.account && (
        <section className="sec">
          <h3>Library</h3>
          <div className="stack">
            <select
              className="select"
              value={status.activeLibraryId ?? ''}
              onChange={(e) => void run(() => send({ type: 'SET_LIBRARY', libraryId: e.target.value }))}
              aria-label="Library"
            >
              {!status.activeLibraryId && <option value="">Choose a library…</option>}
              {status.libraries.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.role === 'viewer' ? ' (view only)' : l.role === 'editor' ? ' (editor)' : ''}
                </option>
              ))}
            </select>
            <span className="muted small">
              New captures go to {active ? <strong>{active.name}</strong> : 'the selected library'}. Rename or share libraries in the web app.
            </span>
          </div>
          <div className="line">
            <div className="l">
              <b>Refresh library list</b>
              <span>Pick up renames and new invites</span>
            </div>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void run(() => send({ type: 'REFRESH_LIBRARIES' }))}>
              Refresh
            </button>
          </div>
        </section>
      )}

      {/* ---------------- Sync ---------------- */}
      {status.account && (
        <section className="sec">
          <h3>Sync</h3>
          <div className="line">
            <div className="l">
              <b className={status.lastError ? 'warn' : undefined}>{syncLabel}</b>
              <span>Runs when you open the popup and every 15 minutes</span>
            </div>
            <button type="button" className="btn primary sm" disabled={status.syncing || busy} onClick={() => void onSync()}>
              <Icon name="refresh" size={13} className={status.syncing ? 'spin' : undefined} /> Sync now
            </button>
          </div>
        </section>
      )}

      {/* ---------------- Cloud project ---------------- */}
      {status.configured && (
        <section className="sec last">
          <h3>Cloud project</h3>
          <div className="line">
            <div className="l grow">
              <b>Connected</b>
              <span className="mono">{status.config?.url}</span>
            </div>
            <button
              type="button"
              className="btn ghost sm danger-text"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await send({ type: 'AUTH_SIGN_OUT' });
                  await send({ type: 'SET_CLOUD_CONFIG', config: null });
                })
              }
            >
              Disconnect
            </button>
          </div>
          {webUrl && (
            <div className="line">
              <div className="l grow">
                <b>Open web app</b>
                <span className="mono">{webUrl.replace(/^https?:\/\//, '')}</span>
              </div>
              <button type="button" className="btn ghost sm" onClick={() => void chrome.tabs.create({ url: webUrl })}>
                <Icon name="external" size={13} /> Open
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
