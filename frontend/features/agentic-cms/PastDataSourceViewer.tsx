'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { researchAPI, type PastDataSource } from './research-api';

export function PastDataSourceViewer({ projectId, deliverableId, kind, recordId }: { projectId: string; deliverableId: string; kind: string; recordId: string }) {
  const [source, setSource] = useState<PastDataSource | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void researchAPI.pastDataSource(projectId, deliverableId, kind, recordId).then(result => { if (active) setSource(result); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [projectId, deliverableId, kind, recordId]);
  return <section className="space-y-4">
    <Link href="/agentic-cms" className="text-sm underline">Back to research workspace</Link>
    <h2 className="text-xl font-semibold">Research source record</h2>
    {error ? <p role="alert">This source is unavailable or your access has changed.</p> : !source ? <p role="status">Loading source…</p> : <>
      <h3 className="font-semibold">{source.title}</h3>
      <p className="text-sm text-[var(--text-muted)]">{source.kind} · {new Date(source.date).toLocaleString()}</p>
      <p className="text-sm">This is the current source excerpt. Earlier summaries may reflect an older version.</p>
      <p className="whitespace-pre-wrap break-words rounded-xl border border-[var(--border)] p-4">{source.text || 'This record currently has no text.'}</p>
      {source.truncated && <p className="text-sm">This excerpt was shortened. Open the original CMS context, workstream or deliverable for the rest.</p>}
    </>}
  </section>;
}
