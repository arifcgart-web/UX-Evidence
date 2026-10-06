import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLibraries } from '../lib/libraries';
import { useProfile } from '../lib/profile';
import { useTheme, type ThemePref } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { countEvidenceByLibrary, createLibrary } from '@shared/api';
import { Icon, type IconName } from '../components/Icon';
import { Mark } from '../components/Mark';
import { MembersManager, avatarColor } from '../components/MembersManager';
import { BackgroundPicker } from '../components/BackgroundPicker';

const THEMES: Array<{ id: ThemePref; icon: IconName; label: string }> = [
  { id: 'light', icon: 'sun', label: 'Light' },
  { id: 'mix', icon: 'mix', label: 'Mix' },
  { id: 'dark', icon: 'moon', label: 'Dark' },
  { id: 'auto', icon: 'monitor', label: 'Follow system' },
];

export function Shell() {
  const { user, loading, signOut } = useAuth();
  const { libraries, refresh } = useLibraries();
  const profile = useProfile();
  const { pref, setPref } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [sideOpen, setSideOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<null | 'members' | 'profile'>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Library item counts for the sidebar badges.
  useEffect(() => {
    if (!user) return;
    countEvidenceByLibrary(supabase())
      .then(setCounts)
      .catch(() => undefined);
  }, [user, location.pathname]);

  // Close the menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (loading) return <div className="page-state">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const activeLibraryId = location.pathname.match(/^\/l\/([^/]+)/)?.[1] ?? params.libraryId ?? null;
  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? libraries[0] ?? null;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const id = await createLibrary(supabase(), name);
    setNewName('');
    setCreating(false);
    await refresh();
    navigate(`/l/${id}`);
  };

  const openProfile = () => {
    setNameDraft(profile.hasCustomName ? profile.name : '');
    setModal('profile');
    setMenuOpen(false);
  };

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!nameDraft.trim()) return;
    setSaving(true);
    try {
      await profile.save(nameDraft);
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const initial = profile.name.charAt(0).toUpperCase();

  return (
    <div className="shell">
      <div className="app-panel">
      <aside className={`sidebar${sideOpen ? ' open' : ''}`}>
        <div className="brand-block">
          <div className="brand-tile">
            <Mark size={24} id="side-mark" />
          </div>
          <div>
            <div className="brand-name">UX Evidence</div>
            <div className="brand-sub">Drip Design</div>
          </div>
        </div>

        <nav className="libs">
          <div className="nav-label">Libraries</div>
          {libraries.map((lib) => (
            <NavLink
              key={lib.id}
              to={`/l/${lib.id}`}
              className={({ isActive }) => `lib${isActive || location.pathname.startsWith(`/l/${lib.id}/`) ? ' active' : ''}`}
              onClick={() => setSideOpen(false)}
            >
              <span className="lib-name">{lib.name}</span>
              {lib.role !== 'owner' ? <span className="lib-role">{lib.role}</span> : <span className="lib-count">{counts.get(lib.id) ?? 0}</span>}
            </NavLink>
          ))}
          {creating ? (
            <form className="new-lib" onSubmit={create}>
              <input
                className="input sm"
                autoFocus
                placeholder="Library name"
                value={newName}
                maxLength={80}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
              />
              <button type="submit" className="btn primary sm" disabled={!newName.trim()}>
                Create
              </button>
            </form>
          ) : (
            <button type="button" className="lib add" onClick={() => setCreating(true)}>
              <Icon name="plus" size={14} /> New library
            </button>
          )}
        </nav>

        <div className="side-foot" ref={menuRef}>
          {menuOpen && (
            <div className="menu" role="menu">
              <div className="menu-head">
                <span className="avatar" style={{ background: avatarColor(user.id) }}>
                  {initial}
                </span>
                <div style={{ minWidth: 0 }}>
                  <b>{profile.name}</b>
                  <span title={user.email ?? ''}>{user.email}</span>
                </div>
              </div>
              <button type="button" className="menu-item" role="menuitem" onClick={openProfile}>
                <Icon name="user" size={16} /> Profile
              </button>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() => {
                  setModal('members');
                  setMenuOpen(false);
                }}
                disabled={!activeLibrary}
              >
                <Icon name="users" size={16} /> Members
              </button>
              <NavLink to="/extension" className="menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                <Icon name="download" size={16} /> Chrome extension
              </NavLink>
              <div className="menu-sep" />
              <div className="menu-item appearance" style={{ cursor: 'default' }}>
                <div className="appearance-label">
                  <Icon name="sun" size={16} />
                  <span>Appearance</span>
                </div>
                <div className="theme-seg" role="radiogroup" aria-label="Appearance">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={pref === t.id}
                      className={pref === t.id ? 'on' : ''}
                      title={t.label}
                      aria-label={t.label}
                      onClick={() => setPref(t.id)}
                    >
                      <Icon name={t.icon} size={14} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="menu-sep" />
              <NavLink to="/extension" className="menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                <Icon name="help" size={16} /> Help
              </NavLink>
              <button type="button" className="menu-item" role="menuitem" onClick={() => void signOut()}>
                <Icon name="logout" size={16} /> Log out
              </button>
            </div>
          )}
          <button type="button" className={`account-row${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
            <span className="avatar" style={{ background: avatarColor(user.id) }}>
              {initial}
            </span>
            <span className="account-name">{profile.name}</span>
            <Icon name={menuOpen ? 'chevron' : 'chevronUp'} size={14} className="chev" />
          </button>
        </div>
      </aside>

      <button type="button" className="menu-toggle" aria-label="Menu" onClick={() => setSideOpen((o) => !o)}>
        <Icon name="menu" size={18} />
      </button>
      {sideOpen && <div className="scrim" onClick={() => setSideOpen(false)} />}

      <main className="main">
        <Outlet />
      </main>
      </div>
      <BackgroundPicker />

      {modal === 'members' && activeLibrary && (
        <div className="modal-scrim" onClick={() => setModal(null)}>
          <div className="modal" role="dialog" aria-label="Members" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Members · {activeLibrary.name}</h2>
                <p className="muted small">Owners manage roles; editors capture and edit; viewers browse.</p>
              </div>
              <button type="button" className="iconbtn" aria-label="Close" onClick={() => setModal(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <MembersManager library={activeLibrary} compact />
            <p className="muted small" style={{ marginTop: 14 }}>
              Rename or delete the library on the{' '}
              <NavLink to={`/l/${activeLibrary.id}/team`} onClick={() => setModal(null)}>
                Team page
              </NavLink>
              .
            </p>
          </div>
        </div>
      )}

      {modal === 'profile' && (
        <div className="modal-scrim" onClick={() => setModal(null)}>
          <form className="modal narrow" role="dialog" aria-label="Profile" onClick={(e) => e.stopPropagation()} onSubmit={saveProfile}>
            <div className="modal-head">
              <h2>Profile</h2>
              <button type="button" className="iconbtn" aria-label="Close" onClick={() => setModal(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <p className="muted small" style={{ marginBottom: 14 }}>
              Your name is shown to teammates in place of your email.
            </p>
            <div className="field">
              <label htmlFor="p-name">Display name</label>
              <input id="p-name" className="input" autoFocus maxLength={60} placeholder={profile.name} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" value={user.email ?? ''} disabled />
            </div>
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving || !nameDraft.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
