import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { LibraryRole } from '@shared/evidence';
import {
  createInvite,
  deleteLibrary,
  leaveLibrary,
  listInvites,
  listMembers,
  removeMember,
  renameLibrary,
  revokeInvite,
  setMemberRole,
  type Invite,
  type Member,
} from '@shared/api';
import { relativeDate } from '@shared/format';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useLibraries } from '../lib/libraries';
import { Icon } from '../components/Icon';

export function TeamPage() {
  const { libraryId = '' } = useParams();
  const { user } = useAuth();
  const { libraries, refresh } = useLibraries();
  const navigate = useNavigate();
  const library = libraries.find((l) => l.id === libraryId);
  const isOwner = library?.role === 'owner';

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [inviteLabel, setInviteLabel] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      setMembers(await listMembers(db, libraryId));
      if (isOwner) setInvites(await listInvites(db, libraryId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the team');
    }
  }, [libraryId, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setName(library?.name ?? '');
  }, [library?.name]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  const invite = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await createInvite(supabase(), libraryId, inviteRole, inviteLabel.trim());
      setInviteLabel('');
    });
  };

  const inviteUrl = (token: string) => `${location.origin}/invite/${token}`;
  const copy = async (inv: Invite) => {
    await navigator.clipboard.writeText(inviteUrl(inv.token));
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === library?.name) return;
    void run(async () => {
      await renameLibrary(supabase(), libraryId, name.trim());
      await refresh();
    });
  };

  const destroy = () =>
    run(async () => {
      await deleteLibrary(supabase(), libraryId);
      await refresh();
      navigate('/');
    });

  const leave = () =>
    run(async () => {
      await leaveLibrary(supabase(), libraryId);
      await refresh();
      navigate('/');
    });

  if (!library) return <div className="page-state">Loading…</div>;

  return (
    <div className="team">
      <header className="page-head">
        <div>
          <Link to={`/l/${libraryId}`} className="back">
            <Icon name="back" size={14} /> {library.name}
          </Link>
          <h1>Team</h1>
        </div>
      </header>

      {error && (
        <div className="notice error">
          <Icon name="alert" size={14} /> <span>{error}</span>
        </div>
      )}

      <section className="panel">
        <h2>Members</h2>
        <ul className="members">
          {members.map((m) => (
            <li key={m.userId}>
              <div className="member-id">
                <span className="avatar">{(m.email[0] ?? '?').toUpperCase()}</span>
                <div>
                  <div className="member-email">
                    {m.email || 'unknown'} {m.userId === user?.id && <span className="you">you</span>}
                  </div>
                  <div className="muted small">joined {relativeDate(m.createdAt)}</div>
                </div>
              </div>
              <div className="member-actions">
                {isOwner && m.role !== 'owner' ? (
                  <>
                    <select
                      className="select sm"
                      value={m.role}
                      onChange={(e) => void run(() => setMemberRole(supabase(), libraryId, m.userId, e.target.value as LibraryRole))}
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button type="button" className="iconbtn danger" title="Remove" onClick={() => void run(() => removeMember(supabase(), libraryId, m.userId))}>
                      <Icon name="close" size={14} />
                    </button>
                  </>
                ) : (
                  <span className="role-pill">{m.role}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="muted small roles-help">
          <strong>Owner</strong> manages members and settings · <strong>Editor</strong> adds and edits evidence ·{' '}
          <strong>Viewer</strong> can only browse.
        </p>
      </section>

      {isOwner && (
        <section className="panel">
          <h2>Invite people</h2>
          <p className="muted">
            Create a link and send it however you like (Slack, email). Whoever opens it and signs in joins this library.
            Links work once and expire after 14 days.
          </p>
          <form className="invite-form" onSubmit={invite}>
            <input className="input" placeholder="Note, e.g. “for Anna” (optional)" value={inviteLabel} maxLength={60} onChange={(e) => setInviteLabel(e.target.value)} />
            <select className="select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button type="submit" className="btn primary">
              <Icon name="plus" size={14} /> Create link
            </button>
          </form>

          {invites.length > 0 && (
            <ul className="invites">
              {invites.map((inv) => {
                const expired = Date.parse(inv.expiresAt) < Date.now();
                return (
                  <li key={inv.id} className={inv.acceptedAt || expired ? 'done' : ''}>
                    <div>
                      <div className="invite-label">
                        {inv.label || 'Invite link'} <span className="role-pill">{inv.role}</span>
                      </div>
                      <div className="muted small">
                        {inv.acceptedAt ? `accepted ${relativeDate(inv.acceptedAt)}` : expired ? 'expired' : `created ${relativeDate(inv.createdAt)}`}
                      </div>
                    </div>
                    <div className="member-actions">
                      {!inv.acceptedAt && !expired && (
                        <button type="button" className="btn ghost sm" onClick={() => void copy(inv)}>
                          <Icon name={copiedId === inv.id ? 'check' : 'copy'} size={13} /> {copiedId === inv.id ? 'Copied' : 'Copy link'}
                        </button>
                      )}
                      <button type="button" className="iconbtn danger" title="Revoke" onClick={() => void run(() => revokeInvite(supabase(), inv.id))}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="panel">
        <h2>Settings</h2>
        {isOwner ? (
          <>
            <form className="rename" onSubmit={rename}>
              <label htmlFor="lib-name">Library name</label>
              <div className="row">
                <input id="lib-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
                <button type="submit" className="btn ghost" disabled={!name.trim() || name.trim() === library.name}>
                  Rename
                </button>
              </div>
            </form>
            {library.isPersonal ? (
              <p className="muted small">This is your personal library; it can't be deleted.</p>
            ) : (
              <div className="danger-zone">
                {confirmDelete ? (
                  <div className="confirm">
                    <span>Delete “{library.name}” and every item in it for all members? This can't be undone.</span>
                    <div className="confirm-actions">
                      <button type="button" className="btn ghost sm" onClick={() => setConfirmDelete(false)}>
                        Keep
                      </button>
                      <button type="button" className="btn danger sm" onClick={() => void destroy()}>
                        Delete library
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>
                    <Icon name="trash" size={14} /> Delete library
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <button type="button" className="btn ghost danger-text" onClick={() => void leave()}>
            Leave this library
          </button>
        )}
      </section>
    </div>
  );
}
