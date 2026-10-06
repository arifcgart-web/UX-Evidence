import { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLibraries } from '../lib/libraries';
import { supabase } from '../lib/supabase';
import { createLibrary } from '@shared/api';
import { Icon } from '../components/Icon';

export function Shell() {
  const { user, loading, signOut } = useAuth();
  const { libraries, refresh } = useLibraries();
  const location = useLocation();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) return <div className="page-state">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = await createLibrary(supabase(), name);
    setNewName('');
    setCreating(false);
    await refresh();
    navigate(`/l/${id}`);
  };

  return (
    <div className="shell">
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="brand">
          <Icon name="frame" size={18} />
          <span>UX Evidence</span>
        </div>

        <nav className="libs">
          <div className="nav-label">Libraries</div>
          {libraries.map((lib) => (
            <NavLink
              key={lib.id}
              to={`/l/${lib.id}`}
              className={({ isActive }) => `lib${isActive || location.pathname.startsWith(`/l/${lib.id}/`) ? ' active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <span className="lib-name">{lib.name}</span>
              {lib.role !== 'owner' && <span className="lib-role">{lib.role}</span>}
            </NavLink>
          ))}

          {creating ? (
            <form
              className="new-lib"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
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

        <nav className="side-foot">
          <NavLink to="/extension" className="side-link" onClick={() => setMenuOpen(false)}>
            <Icon name="download" size={14} /> Chrome extension
          </NavLink>
          <div className="account">
            <span className="email" title={user.email ?? ''}>
              {user.email}
            </span>
            <button type="button" className="link" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </nav>
      </aside>

      <button type="button" className="menu-toggle" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>
        <Icon name="menu" size={18} />
      </button>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
