import { useCallback, useMemo, useState } from 'react';
import { useEvidence } from './useEvidence';
import { Home, EMPTY_FILTERS, type Filters } from './views/Home';
import { Detail } from './views/Detail';
import { Settings } from './views/Settings';
import { collectTags } from '../storage/evidenceStore';
import type { EvidenceState } from './useEvidence';
import { send } from './messaging';

/** Viewers of a shared library can look but not change. */
function canEditActive(e: EvidenceState): boolean {
  const s = e.status;
  if (!s?.account || !s.activeLibraryId) return true;
  const lib = s.libraries.find((l) => l.id === s.activeLibraryId);
  return !lib || lib.role !== 'viewer';
}

type View = { name: 'home' } | { name: 'detail'; id: string } | { name: 'settings' };

export function App() {
  const evidence = useEvidence();
  const [view, setView] = useState<View>({ name: 'home' });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const knownTags = useMemo(() => collectTags(evidence.records), [evidence.records]);
  const goHome = useCallback(() => setView({ name: 'home' }), []);

  const addCategory = useCallback(
    async (name: string) => {
      const res = await send<string[]>({ type: 'ADD_CATEGORY', name });
      if (!res.ok) throw new Error(res.error);
      await evidence.refreshStatus();
      return res.data;
    },
    [evidence],
  );

  const filterByTag = useCallback((tag: string) => {
    setFilters({ ...EMPTY_FILTERS, tag });
    setView({ name: 'home' });
  }, []);

  if (view.name === 'settings') {
    return <Settings status={evidence.status} onBack={goHome} onChanged={evidence.reload} onSync={evidence.syncNow} />;
  }

  if (view.name === 'detail') {
    const record = evidence.records.find((r) => r.id === view.id);
    if (record) {
      return (
        <Detail
          record={record}
          knownTags={knownTags}
          onBack={goHome}
          onTag={filterByTag}
          onUpdate={evidence.update}
          onDelete={evidence.remove}
          onReplace={evidence.replaceRecord}
          categories={evidence.status?.categories ?? []}
          onAddCategory={addCategory}
          canEdit={canEditActive(evidence)}
        />
      );
    }
  }

  return (
    <Home
      records={evidence.records}
      loading={evidence.loading}
      error={evidence.error}
      status={evidence.status}
      thumbUrl={evidence.thumbUrl}
      filters={filters}
      onFilters={setFilters}
      onOpen={(id) => setView({ name: 'detail', id })}
      onSettings={() => setView({ name: 'settings' })}
    />
  );
}
