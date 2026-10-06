import { useState, type FormEvent } from 'react';
import type { SyncStatus } from '../../sync/sync';
import { relativeDate } from '@shared/format';
import { Icon } from './Icon';
import { send } from '../messaging';

interface Props {
  status: SyncStatus | null;
  onChanged: () => Promise<void>;
  onSync: () => Promise<void>;
}

/**
 * Bottom-of-popup account strip. Three states: cloud not configured (hidden),
 * signed out (sign-in flow), signed in (library picker + sync state).
 */
export function AccountPanel({ status, onChanged, onSync }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cfgUrl, setCfgUrl] = useState('');
  const [cfgKey, setCfgKey] = useState('');

  if (!status) return null;

  // ---- cloud project not configured yet ----
  if (!status.configured) {
    const connect = async (e: FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      const res = await send({ type: 'SET_CLOUD_CONFIG', config: { url: cfgUrl, anonKey: cfgKey } });
      setBusy(false);
      if (res.ok) {
        setOpen(true);
        await onChanged();
      } else {
        setError(res.error);
      }
    };
    return (
      <section className="account">
        {!open ? (
          <button type="button" className="account-row" onClick={() => setOpen(true)}>
            <Icon name="cloud" size={15} />
            <span className="grow">Connect to your cloud project</span>
            <span className="muted">Local only</span>
          </button>
        ) : (
          <form className="account-form" onSubmit={connect}>
            <div className="account-head">
              <strong>Connect to cloud</strong>
              <button type="button" className="iconbtn" aria-label="Close" onClick={() => setOpen(false)}>
                <Icon name="close" size={14} />
              </button>
            </div>
            <p className="muted small">
              Paste the two values from your Supabase project (Project Settings → API). The same ones the web app uses.
            </p>
            <input className="input" placeholder="https://xxxx.supabase.co" value={cfgUrl} onChange={(e) => setCfgUrl(e.target.value)} required autoFocus />
            <input className="input" placeholder="anon public key (eyJ…)" value={cfgKey} onChange={(e) => setCfgKey(e.target.value)} required />
            {error && <div className="error">{error}</div>}
            <button type="submit" className="btn primary" disabled={busy || !cfgUrl || !cfgKey}>
              {busy ? 'Saving…' : 'Connect'}
            </button>
          </form>
        )}
      </section>
    );
  }

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await send({ type: 'AUTH_REQUEST_CODE', email: email.trim() });
    setBusy(false);
    if (res.ok) setStep('code');
    else setError(res.error);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await send({ type: 'AUTH_VERIFY_CODE', email: email.trim(), code });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setStep('email');
      setCode('');
      await onChanged();
    } else {
      setError(res.error);
    }
  };

  const signOut = async () => {
    await send({ type: 'AUTH_SIGN_OUT' });
    setOpen(false);
    await onChanged();
  };

  const setLibrary = async (libraryId: string) => {
    await send({ type: 'SET_LIBRARY', libraryId });
    await onChanged();
  };

  const refreshLibraries = async () => {
    setBusy(true);
    await send({ type: 'REFRESH_LIBRARIES' });
    setBusy(false);
    await onChanged();
  };

  // ---- signed out ----
  if (!status.account) {
    return (
      <section className="account">
        {!open ? (
          <button type="button" className="account-row" onClick={() => setOpen(true)}>
            <Icon name="cloud" size={15} />
            <span className="grow">Sign in to sync &amp; share</span>
            <span className="muted">Local only</span>
          </button>
        ) : step === 'email' ? (
          <form className="account-form" onSubmit={requestCode}>
            <div className="account-head">
              <strong>Sign in</strong>
              <button type="button" className="iconbtn" aria-label="Close" onClick={() => setOpen(false)}>
                <Icon name="close" size={14} />
              </button>
            </div>
            <p className="muted small">We'll email you a sign-in link. No password.</p>
            <input
              className="input"
              type="email"
              required
              autoFocus
              placeholder="you@studio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <div className="error">{error}</div>}
            <button type="submit" className="btn primary" disabled={busy || !email}>
              {busy ? 'Sending…' : 'Send sign-in email'}
            </button>
          </form>
        ) : (
          <form className="account-form" onSubmit={verify}>
            <div className="account-head">
              <strong>Paste the sign-in link</strong>
              <button type="button" className="iconbtn" aria-label="Back" onClick={() => setStep('email')}>
                <Icon name="back" size={14} />
              </button>
            </div>
            <p className="muted small">
              Sent to <strong>{email}</strong>. In the email, <strong>right-click “Sign in” → Copy link address</strong> and paste it
              here. Don't click the link (it only works once). A 6-digit code works too, if your email has one.
            </p>
            <input
              className="input"
              autoComplete="off"
              required
              autoFocus
              placeholder="https://….supabase.co/auth/v1/verify?token=…"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {error && <div className="error">{error}</div>}
            <button type="submit" className="btn primary" disabled={busy || code.trim().length < 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
          </form>
        )}
      </section>
    );
  }

  // ---- signed in ----
  const active = status.libraries.find((l) => l.id === status.activeLibraryId);
  const syncLabel = status.syncing
    ? 'Syncing…'
    : status.lastError
      ? status.lastError
      : status.pending > 0
        ? `${status.pending} waiting to upload`
        : status.lastSyncAt
          ? `Synced ${relativeDate(status.lastSyncAt).toLowerCase()}`
          : 'Not synced yet';

  return (
    <section className="account">
      <div className="account-row static">
        <Icon name="cloud" size={15} className={status.lastError ? 'warn' : undefined} />
        <select
          className="select sm grow"
          value={status.activeLibraryId ?? ''}
          onChange={(e) => void setLibrary(e.target.value)}
          aria-label="Library"
          title={active ? `${active.name} (${active.role})` : 'Choose a library'}
        >
          {!status.activeLibraryId && <option value="">Choose a library…</option>}
          {status.libraries.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.role === 'viewer' ? ' (view only)' : ''}
            </option>
          ))}
        </select>
        <button type="button" className="iconbtn" title="Sync now" aria-label="Sync now" onClick={() => void onSync()} disabled={status.syncing}>
          <Icon name="refresh" size={15} className={status.syncing ? 'spin' : undefined} />
        </button>
        <button type="button" className="iconbtn" title="Account" aria-label="Account" onClick={() => setOpen((o) => !o)}>
          <Icon name="chevron" size={14} className={open ? 'flip' : undefined} />
        </button>
      </div>
      <div className={`sync-line${status.lastError ? ' warn' : ''}`}>{syncLabel}</div>
      {open && (
        <div className="account-more">
          <div className="muted small">{status.account.email}</div>
          <div className="account-actions">
            <button type="button" className="link" onClick={() => void refreshLibraries()} disabled={busy}>
              Refresh libraries
            </button>
            <button type="button" className="link" onClick={() => void signOut()}>
              Sign out
            </button>
            <button
              type="button"
              className="link"
              title={status.config?.url}
              onClick={() => void (async () => {
                await send({ type: 'AUTH_SIGN_OUT' });
                await send({ type: 'SET_CLOUD_CONFIG', config: null });
                setOpen(false);
                await onChanged();
              })()}
            >
              Disconnect project
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
