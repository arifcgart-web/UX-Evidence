import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { acceptInvite } from '@shared/api';
import { supabase } from '../lib/supabase';
import { useLibraries } from '../lib/libraries';
import { Icon } from '../components/Icon';

export function InvitePage() {
  const { token = '' } = useParams();
  const { refresh } = useLibraries();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const libraryId = await acceptInvite(supabase(), token);
        await refresh();
        if (!cancelled) navigate(`/l/${libraryId}`, { replace: true });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not accept this invite');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refresh, navigate]);

  return (
    <div className="page-state">
      {error ? (
        <>
          <Icon name="alert" size={28} />
          <h2>{error}</h2>
          <p>Ask the library owner for a fresh link.</p>
          <Link to="/" className="btn ghost">
            Go to my libraries
          </Link>
        </>
      ) : (
        <>
          <h2>Joining library…</h2>
        </>
      )}
    </div>
  );
}
