import { Navigate } from 'react-router-dom';
import { useLibraries } from '../lib/libraries';

export function HomeRedirect() {
  const { libraries, loading } = useLibraries();
  if (loading) return <div className="page-state">Loading…</div>;

  const next = sessionStorage.getItem('uxe.next');
  if (next) {
    sessionStorage.removeItem('uxe.next');
    return <Navigate to={next} replace />;
  }

  const first = libraries[0];
  if (!first) {
    return (
      <div className="page-state">
        <h2>No library yet</h2>
        <p>Your personal library is being created. Refresh in a moment.</p>
      </div>
    );
  }
  return <Navigate to={`/l/${first.id}`} replace />;
}
