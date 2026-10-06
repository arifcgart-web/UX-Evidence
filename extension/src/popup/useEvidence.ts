/**
 * Loads the library once, keeps it in memory for the popup's lifetime, and
 * owns the object URLs for thumbnails so they are revoked exactly once.
 * Also exposes the cloud sync status so the UI can show account state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EvidenceFields, EvidenceRecord } from '../types/evidence';
import { deleteEvidence as deleteRecord, listEvidence, updateEvidence as updateRecord } from '../storage/evidenceStore';
import type { SyncStatus } from '../sync/sync';
import { send } from './messaging';

export interface EvidenceState {
  records: EvidenceRecord[];
  loading: boolean;
  error: string | null;
  status: SyncStatus | null;
  thumbUrl: (record: EvidenceRecord) => string;
  reload: () => Promise<void>;
  refreshStatus: () => Promise<SyncStatus | null>;
  syncNow: () => Promise<void>;
  update: (id: string, fields: EvidenceFields) => Promise<EvidenceRecord | null>;
  remove: (id: string) => Promise<void>;
  replaceRecord: (record: EvidenceRecord) => void;
}

export function useEvidence(): EvidenceState {
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef(new Map<string, string>());

  const refreshStatus = useCallback(async () => {
    const res = await send<SyncStatus>({ type: 'SYNC_STATUS' });
    const next = res.ok ? res.data : null;
    setStatus(next);
    return next;
  }, []);

  const reload = useCallback(async () => {
    try {
      const s = await refreshStatus();
      setRecords(await listEvidence(s?.account ? s.activeLibraryId : null));
      setError(null);
    } catch (e) {
      console.warn('[ux-evidence] load failed', e);
      setError("Couldn't load your library. Try reopening the popup.");
    } finally {
      setLoading(false);
    }
  }, [refreshStatus]);

  const syncNow = useCallback(async () => {
    const res = await send<SyncStatus>({ type: 'SYNC_NOW' });
    if (res.ok) setStatus(res.data);
    await reload();
  }, [reload]);

  useEffect(() => {
    void reload().then(() => {
      // Pull fresh data in the background while the user looks at the cache.
      void syncNow();
    });
    const map = urls.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, [reload, syncNow]);

  const thumbUrl = useCallback((record: EvidenceRecord) => {
    const key = `${record.id}:${record.updatedAt}`;
    let url = urls.current.get(key);
    if (!url) {
      url = URL.createObjectURL(record.thumbnail);
      urls.current.set(key, url);
    }
    return url;
  }, []);

  const update = useCallback(async (id: string, fields: EvidenceFields) => {
    const next = await updateRecord(id, fields);
    if (next) setRecords((prev) => prev.map((r) => (r.id === id ? next : r)));
    void send({ type: 'LOCAL_CHANGED' });
    return next;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    void send({ type: 'LOCAL_CHANGED' });
  }, []);

  const replaceRecord = useCallback((record: EvidenceRecord) => {
    setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));
  }, []);

  return useMemo(
    () => ({ records, loading, error, status, thumbUrl, reload, refreshStatus, syncNow, update, remove, replaceRecord }),
    [records, loading, error, status, thumbUrl, reload, refreshStatus, syncNow, update, remove, replaceRecord],
  );
}
