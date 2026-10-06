import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteLibrary, leaveLibrary, renameLibrary } from '@shared/api';
import { supabase } from '../lib/supabase';
import { useLibraries } from '../lib/libraries';
import { Icon } from '../components/Icon';
import { MembersManager } from '../components/MembersManager';

export function TeamPage() {
  const { libraryId = '' } = useParams();
  const { libraries, refresh } = useLibraries();
  const navigate = useNavigate();
  const library = libraries.find((l) => l.id === libraryId);
  const isOwner = library?.role === 'owner';

  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setName(library?.name ?? '');
  }, [library?.name]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
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
        <MembersManager library={library} />
      </section>

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
              <p className="muted small" style={{ marginTop: 12 }}>
                This is your personal library; it can't be deleted.
              </p>
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
