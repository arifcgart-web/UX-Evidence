import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/Icon';

export function Login() {
  const { user, loading, signInWithEmail } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = (location.state as { from?: string } | null)?.from ?? '/';
  if (!loading && user) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (next !== '/') sessionStorage.setItem('uxe.next', next);
      await signInWithEmail(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the sign-in link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand large">
          <Icon name="frame" size={22} />
          <span>UX Evidence</span>
        </div>

        {sent ? (
          <>
            <h1>Check your inbox</h1>
            <p>
              We sent a sign-in link to <strong>{email}</strong>. Open it on this device and you'll land back here,
              signed in.
            </p>
            <button type="button" className="link" onClick={() => setSent(false)}>
              Use a different email
            </button>
          </>
        ) : (
          <>
            <h1>Sign in</h1>
            <p className="muted">No password. We email you a link; click it and you're in.</p>
            <form onSubmit={submit}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@studio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && <div className="error">{error}</div>}
              <button type="submit" className="btn primary wide" disabled={busy || !email}>
                {busy ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
