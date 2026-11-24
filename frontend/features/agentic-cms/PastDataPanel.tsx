'use client';

import { useEffect, useRef, useState } from 'react';
import { researchAPI, researchFailure, type PastDataPreview, type PastDataStatus } from './research-api';

import { researchButton as button, researchPrimaryButton } from './research-button-styles';
export function PastDataPanel({ projectId, deliverableId, version, dirty, canEdit, hasPastData, onGenerated, onUnavailable }: {
  projectId: string; deliverableId: string; version: number; dirty: boolean; canEdit: boolean; hasPastData: boolean;
  onGenerated?: () => void; onUnavailable: () => void;
}) {
  const [status, setStatus] = useState<PastDataStatus | null>(null);
  const [focus, setFocus] = useState('');
  const [preview, setPreview] = useState<PastDataPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const requests = generation;
    const request = ++requests.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      void researchAPI.pastDataStatus(projectId, deliverableId).then(result => {
        if (request !== requests.current) return;
        setStatus(result);
        if (result.state === 'READY' && result.result && result.result.savedVersion > version) onGenerated?.();
        if (['PENDING', 'RUNNING'].includes(result.state) && !result.interrupted) timer = setTimeout(check, 1500);
      }).catch((failure: unknown) => {
        if (request !== requests.current) return;
        if ([401, 403, 404].includes(researchFailure(failure).status ?? 0)) onUnavailable();
        else setError('Could not check past-data generation. Try checking again.');
      });
    };
    check();
    return () => { ++requests.current; if (timer) clearTimeout(timer); };
  }, [projectId, deliverableId, version, refresh, onGenerated, onUnavailable]);

  const act = async (generate: boolean) => {
    if (generate && (status?.result || hasPastData) && !window.confirm('Replace the saved Relevant Past Data summary? Framework and Findings will stay intact, and the previous version will remain in history.')) return;
    const request = generation.current;
    setBusy(true); setError('');
    try {
      if (generate) {
        const result = await researchAPI.generatePastData(projectId, deliverableId, version, focus);
        if (request !== generation.current) return;
        setStatus(result); setRefresh(value => value + 1);
      } else {
        const result = await researchAPI.previewPastData(projectId, deliverableId, focus);
        if (request === generation.current) setPreview(result);
      }
    } catch (failure) {
      if (request !== generation.current) return;
      if ([401, 403, 404].includes(researchFailure(failure).status ?? 0)) onUnavailable();
      else setError(researchFailure(failure).status === 409 ? 'Research changed. Your draft is kept; reload saved research before generating again.' : 'Could not complete this request. Your research has been kept. Try again.');
    } finally { if (request === generation.current) setBusy(false); }
  };
  return <section aria-label="Find relevant past data" className="space-y-3 rounded-xl border border-[var(--border)] p-4">
    <h3 className="font-semibold">Find relevant past data</h3>
    <p className="text-sm text-[var(--text-muted)]">OTCR Bot uses this assignment’s brief and workstream notes to find useful context from the same project. Linked document contents are not read.</p>
    {canEdit && <label className="block space-y-1 text-sm">Optional research focus
      <input aria-label="Past data focus" maxLength={1000} value={focus} onChange={event => { setFocus(event.target.value); setPreview(null); }} placeholder="For example: prior client constraints, segment choices, pricing assumptions" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2" />
    </label>}
    {status && <p role="status" className="text-sm">Past data: {status.interrupted ? 'Interrupted — retry when ready' : status.state === 'RUNNING' ? 'Generating…' : status.state === 'PENDING' ? 'Queued…' : status.state === 'READY' ? 'Saved' : status.state === 'CONFLICT' ? 'Needs a fresh run' : status.state === 'FAILED' ? 'Could not generate' : 'Not generated yet'}</p>}
    {status?.message && <p className="text-sm">{status.message}</p>}
    {status && !status.released && <p className="text-sm">Release this workstream before retrieving prior data.</p>}
    {status && !status.modelConfigured && <p className="text-sm">Configure your own Lumen key in the local backend to generate a summary. You can preview sources without a model key.</p>}
    {dirty && <p className="text-sm">Save or discard your edits before asking the bot to update past data.</p>}
    {canEdit && <div className="flex flex-wrap gap-2">
      <button className={researchPrimaryButton} disabled={busy || dirty || !status?.canGenerate || !status.modelConfigured} onClick={() => void act(true)}>Generate</button>
      <button className={button} disabled={busy || !status?.released} onClick={() => void act(false)}>{busy ? 'Working…' : 'Preview sources'}</button>
    </div>}
    {error && <div role="alert" className="text-sm">{error} <button className={button} onClick={() => { setError(''); setRefresh(value => value + 1); }}>Check past data again</button></div>}
    {preview && <details open className="space-y-2 text-sm"><summary className="cursor-pointer rounded-md px-2 py-2 font-medium text-[var(--primary)] hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]">Retrieved sources ({preview.sources.length})</summary>
      <p>{preview.diagnostics.candidatesConsidered} candidate records considered. {preview.diagnostics.limitsReached ? 'Some records or excerpts were limited.' : 'Within retrieval limits.'}</p>
      {preview.sources.length === 0 && <p>Little relevant history was found in the records searched.</p>}
      {preview.sources.map(source => <details key={source.id} className="rounded border border-[var(--border)] p-2"><summary className="cursor-pointer rounded-md px-2 py-2 font-medium text-[var(--primary)] hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]">{source.title} · {source.kind} · {source.date.slice(0, 10)}</summary>
        <p className="my-2 whitespace-pre-wrap break-words">{source.text}</p><a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">Open source record</a>
      </details>)}
    </details>}
    {status?.result && <details className="space-y-2 text-sm"><summary className="cursor-pointer rounded-md px-2 py-2 font-medium text-[var(--primary)] hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]">Last bot retrieval: {status.result.items.length} sources · {status.result.model ?? status.model}</summary>
      <p>Saved as version {status.result.savedVersion} on {new Date(status.result.generatedAt).toLocaleString()}. Later manual edits may differ.</p>
      {status.result.savedVersion > version && <p>A newer saved version is available. Copy any unsaved text you need, then reload saved research to see it.</p>}
      {status.result.sparse && <p>Little relevant prior history was found in the records searched.</p>}
      {status.result.items.map(item => <article key={item.sourceId} className="space-y-1 border-t border-[var(--border)] py-2"><a href={item.source.url} target="_blank" rel="noopener noreferrer" className="underline">{item.source.title}</a><p>{item.summary}</p><p>Why it matters: {item.whyRelevant}</p><blockquote className="border-l-2 pl-2">{item.quote}</blockquote></article>)}
      <p>Focus used: {(status.result.focus ?? status.focus) || 'Deliverable brief and workstream notes'}</p>
      <p>Query terms: {status.result.diagnostics.queryTerms.join(', ') || 'Recent project context'}</p>
      <p>{status.result.diagnostics.candidatesConsidered} candidates considered; {status.result.diagnostics.sourcesSent} excerpts sent to the bot. {status.result.diagnostics.limitsReached ? 'Retrieval limits were reached.' : ''}</p>
    </details>}
  </section>;
}
