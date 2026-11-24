'use client';

import { useEffect, useRef, useState } from 'react';
import { researchAPI, researchFailure, type ResearchPreparation } from './research-api';

export function ResearchPreparationStatus({ projectId, deliverableId, refreshKey, onReady, onUnavailable }: {
  projectId: string; deliverableId: string; refreshKey: string;
  onReady?: () => void; onUnavailable: () => void;
}) {
  const [status, setStatus] = useState<ResearchPreparation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const requests = useRef(0);
  useEffect(() => {
    const generation = requests;
    const request = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasPreparing = false;
    const check = () => {
      void researchAPI.preparation(projectId, deliverableId).then(result => {
        if (request !== generation.current) return;
        setStatus(result); setError('');
        if (result.state === 'READY' && wasPreparing) onReady?.();
        wasPreparing = result.state === 'PREPARING';
        if (wasPreparing && !result.interrupted) timer = setTimeout(check, 1500);
      }).catch((failure: unknown) => {
        if (request !== generation.current) return;
        if ([401, 403, 404].includes(researchFailure(failure).status ?? 0)) onUnavailable();
        else setError('Could not check research preparation.');
      });
    };
    check();
    return () => { ++generation.current; if (timer) clearTimeout(timer); };
  }, [projectId, deliverableId, refreshKey, refresh, onReady, onUnavailable]);

  const retry = async () => {
    const request = requests.current;
    setBusy(true); setError('');
    try {
      const result = await researchAPI.retryPreparation(projectId, deliverableId);
      if (request !== requests.current) return;
      setStatus(result);
      if (result.state === 'READY') onReady?.();
      else setRefresh(value => value + 1);
    } catch (failure) {
      if (request !== requests.current) return;
      if ([401, 403, 404].includes(researchFailure(failure).status ?? 0)) onUnavailable();
      else setError('Could not retry research preparation. Please try again.');
    } finally { if (request === requests.current) setBusy(false); }
  };

  const label = status?.state === 'READY' ? 'Ready'
    : status?.interrupted ? 'Interrupted'
      : status?.state === 'PREPARING' ? 'Preparing…'
        : status?.state === 'FAILED' ? 'Needs retry'
          : status?.state === 'PENDING' ? 'Pending' : 'Not started';
  return <div aria-label="Research preparation" className="rounded-lg border border-[var(--border)] p-3 text-sm">
    {status && <p role="status">Workspace preparation: <strong>{label}</strong></p>}
    {status?.message && <p className="mt-1 text-[var(--text-muted)]">{status.message}</p>}
    {status?.state === 'NOT_STARTED' && <p className="mt-1 text-[var(--text-muted)]">Research is created when the workstream is released. You can also start it manually below.</p>}
    {error && <p role="alert">{error}</p>}
    {error && <button className="mt-2 rounded border px-3 py-2" onClick={() => setRefresh(value => value + 1)}>Check preparation again</button>}
    {status?.canRetry && status.state !== 'NOT_STARTED' && <button disabled={busy} className="mt-2 rounded border px-3 py-2 disabled:opacity-50" onClick={() => void retry()}>{busy ? 'Retrying preparation…' : 'Retry research preparation'}</button>}
  </div>;
}
