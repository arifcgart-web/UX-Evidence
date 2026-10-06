import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Library, LibraryRole } from '@shared/evidence';
import {
  createInvite,
  listInvites,
  listMembers,
  listProfiles,
  nameFromEmail,
  removeMember,
  revokeInvite,
  setMemberRole,
  type Invite,
  type Member,
} from '@shared/api';
import { relativeDate } from '@shared/format';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Icon } from './Icon';

const AVATAR_COLORS = ['#7a5cff', '#ffa640', '#22c55e', '#2563eb', '#ec4899', '#14b8a6'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

interface Props {
  library: Library;
  /** Compact layout for the modal. */
  compact?: boolean;
}

/** Members list, role management and invite links. Used by the Team page and the Members modal. */
export function MembersManager({ library, compact }: Props) {
  const { user } = useAuth();
  const isOwner = library.role === 'owner';
  const [members, setMembers] = useState<Member[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [inviteLabel, setInviteLabel] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const m = await listMembers(db, library.id);
      setMembers(m);
      setNames(await listProfiles(db, m.map((x) => x.userId)));
      if (isOwner) setInvites(await listInvites(db, library.id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load members');
    }
  }, [library.id, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

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
      await createInvite(supabase(), library.id, inviteRole, inviteLabel.trim());
      setInviteLabel('');
    });
  };

  const copy = async (inv: Invite) => {
    await navigator.clipboard.writeText(`${location.origin}/invite/${inv.token}`);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const displayName = (m: Member) => names.get(m.userId) ?? nameFromEmail(m.email);

  return (
    <div className="members-manager">
      {error && (
        <div className="notice error">
          <Icon name="alert" size={14} /> <span>{error}</span>
        </div>
      )}

      <ul className="members">
        {members.map((m) => (
          <li key={m.userId}>
            <div className="member-id">
              <span className="avatar" style={{ background: avatarColor(m.userId) }}>
                {displayName(m).charAt(0).toUpperCase()}
              </span>
              <div>
                <div className="member-email">
                  {displayName(m)} {m.userId === user?.id && <span className="you">you</span>}
                </div>
                <div className="muted small">
                  {m.email || 'unknown'} · joined {relativeDate(m.createdAt)}
                </div>
              </div>
            </div>
            <div className="member-actions">
              {isOwner && m.role !== 'owner' ? (
                <>
                  <select
                    className="select sm"
                    value={m.role}
                    onChange={(e) => void run(() => setMemberRole(supabase(), library.id, m.userId, e.target.value as LibraryRole))}
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button type="button" className="iconbtn danger" title="Remove" onClick={() => void run(() => removeMember(supabase(), library.id, m.userId))}>
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
      {!compact && (
        <p className="muted small roles-help">
          <strong>Owner</strong> manages members and settings · <strong>Editor</strong> adds and edits evidence · <strong>Viewer</strong> can only browse.
        </p>
      )}

      {isOwner && (
        <div className={compact ? 'invite-block compact' : 'invite-block'}>
          {!compact && <h2 style={{ marginTop: 20 }}>Invite people</h2>}
          <p className="muted small" style={{ margin: '14px 0 10px' }}>
            Create a link and send it however you like. Whoever opens it and signs in joins this library. Links work once and expire after 14 days.
          </p>
          <form className="invite-form" onSubmit={invite}>
            <input className="input" placeholder="Note, e.g. “for Anna” (optional)" value={inviteLabel} maxLength={60} onChange={(e) => setInviteLabel(e.target.value)} />
            <select className="select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button type="submit" className="btn primary">
              <Icon name="link" size={14} /> Create link
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
        </div>
      )}
    </div>
  );
}
