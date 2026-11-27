'use client';

import { useEffect, useState } from 'react';
import { researchAPI, researchFailure, type FindingsCapabilities, type FindingsMode, type ResearchDocument, type ResearchWorkspace } from './research-api';
import { researchButton as button, researchPrimaryButton as primary } from './research-button-styles';

const field = 'w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-sm';
export function BucketResearchPanel({ projectId, deliverableId, document, canEdit, dirty, busy, researching, selected, onSelect, onResearch, onUnavailable, summary }: {
  projectId: string; deliverableId: string; document: ResearchDocument; canEdit: boolean; dirty: boolean; busy: boolean; researching: boolean;
  summary?: ResearchWorkspace['researchSummary'];
  selected: string; onSelect: (id: string) => void; onResearch: (bucketId: string, mode: FindingsMode, focus: string) => void; onUnavailable: () => void;
}) {
  const [capabilities, setCapabilities] = useState<FindingsCapabilities | null>(null);
  const [failed, setFailed] = useState(false); const [refresh, setRefresh] = useState(0);
  const [focus, setFocus] = useState(''); const [mode, setMode] = useState<FindingsMode>('add');
  useEffect(() => {
    let active = true;
    void researchAPI.findingsCapabilities(projectId, deliverableId).then(value => { if (active) { setCapabilities(value); setFailed(false); } }).catch(error => {
      if (!active) return;
      if ([401, 403, 404].includes(researchFailure(error).status ?? 0)) onUnavailable();
      else setFailed(true);
    });
    return () => { active = false; };
  }, [projectId, deliverableId, refresh, onUnavailable]);
  const buckets = document.framework?.buckets ?? [];
  const bucket = buckets.find(b => b.id === selected) ?? buckets[0];
  const existing = !!bucket && document.sections.some(s => bucket.questions.some(q => q.id === s.frameworkQuestionId) && (s.content.trim() || s.sourceIds.length));
  return <section aria-label="Research a bucket" className="space-y-3 rounded-xl border border-[var(--primary)] bg-[var(--accent)] p-4">
    <h3 className="font-semibold">Research a bucket</h3>
    <p className="text-sm">The bot uses the brief and project context, investigates the bucket’s questions, and makes one follow-up pass for missing evidence before saving findings. Review the evidence before using the results.</p>
    {!buckets.length ? <p className="text-sm">Adopt or create a bucket in Framework / Structure, then save research to get started.</p> : <>
      <label className="block text-sm">Bucket<select aria-label="Research bucket" className={field} disabled={busy} value={bucket?.id ?? ''} onChange={e => { onSelect(e.target.value); setMode('add'); }}>
        {buckets.map(b => <option key={b.id} value={b.id}>{b.title} ({b.questions.length} questions)</option>)}
      </select></label>
      <ul className="list-disc pl-5 text-sm">{bucket?.questions.map(q => <li key={q.id}>{q.title}</li>)}</ul>
      {canEdit && <>
        <label className="block text-sm">Optional research focus<input aria-label="Bucket research focus" disabled={busy} className={field} value={focus} maxLength={1000} onChange={e => setFocus(e.target.value)} placeholder="For example: prioritize recent US evidence and flag conflicting estimates" /></label>
        {existing && <label className="block text-sm">Existing findings<select aria-label="Existing findings action" className={field} disabled={busy} value={mode} onChange={e => setMode(e.target.value as FindingsMode)}><option value="add">Add findings — keep existing text</option><option value="revise">Revise findings — replace this bucket’s answers</option></select></label>}
        {capabilities && !capabilities.webSearchConfigured && <p className="text-sm">Web search is not configured. This run will use project records and flag missing external evidence.</p>}
        {capabilities && !capabilities.modelConfigured && <p className="text-sm">Configure your local Lumen key and restart the backend to research a bucket.</p>}
        {capabilities && !capabilities.released && <p className="text-sm">Release this workstream before researching.</p>}
        {dirty && <p className="text-sm">Save or discard your edits before researching a bucket.</p>}
        {bucket && (bucket.questions.length === 0 || bucket.questions.length > 8) && <p className="text-sm">This first pass researches buckets with 1–8 questions.</p>}
        <button className={primary} disabled={busy || dirty || !capabilities?.modelConfigured || !capabilities.released || !capabilities.canEdit || !bucket?.questions.length || bucket.questions.length > 8} onClick={() => {
          if (!bucket) return;
          if (existing && mode === 'revise' && !window.confirm('Replace findings for every question in this bucket? Other buckets are kept. You can restore the previous whole-document version from Version history.')) return;
          onResearch(bucket.id, existing ? mode : 'add', focus);
        }}>{researching ? 'Researching bucket…' : 'Research this bucket'}</button>
        {researching && <p role="status" className="text-sm">Gathering evidence and writing findings for this bucket. This can take up to three minutes. Keep this page open until it finishes.</p>}
      </>}
    </>}
    {summary && <p role="status" className="text-sm">Last run: {summary.searches} searches · {summary.pagesRead} pages read{summary.followUp ? ' · Follow-up research completed' : ''}. {summary.omittedClaims > 0 ? `${summary.omittedClaims} unsupported draft claims omitted; review the evidence gaps.` : ''}</p>}
    {failed && <p role="alert" className="text-sm">Could not check research availability. <button className={button} disabled={busy} onClick={() => setRefresh(v => v + 1)}>Retry availability</button></p>}
  </section>;
}
