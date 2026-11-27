'use client';

import { useState } from 'react';
import type { ResearchDocument, ResearchFramework } from './research-api';
import { blankFramework, chooseFramework } from './framework-document';
import { researchButton as button, researchPrimaryButton as primary } from './research-button-styles';

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
const field = 'w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-sm';
const disclosure = 'cursor-pointer rounded-lg p-3 font-semibold text-[var(--primary)] hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]';
function move<T>(items: T[], index: number, offset: number) {
  const result = [...items];
  [result[index], result[index + offset]] = [result[index + offset], result[index]];
  return result;
}
export function FrameworkPanel({ document, canEdit, busy, dirty, onChange, onGenerate, onResearch }: {
  document: ResearchDocument; canEdit: boolean; busy: boolean; dirty: boolean;
  onResearch?: (bucketId: string) => void;
  onChange: (document: ResearchDocument) => void; onGenerate: (focus: string) => void;
}) {
  const [focus, setFocus] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const tree = document.framework ?? blankFramework();
  const suggestion = document.frameworkSuggestion;
  const update = (edit: (tree: ResearchFramework) => void) => {
    const next = structuredClone(tree); edit(next); onChange(chooseFramework(document, next));
  };
  const remove = (edit: (tree: ResearchFramework) => void) => {
    if (window.confirm('Remove this item from the framework? Existing findings will be kept as Unassigned findings.')) update(edit);
  };
  const adopt = (ids: string[]) => {
    if (!suggestion) return;
    const existing = new Set(tree.buckets.map(b => b.id));
    const next = { ...tree, objective: tree.objective || suggestion.objective,
      buckets: [...tree.buckets, ...suggestion.buckets.filter(b => ids.includes(b.id) && !existing.has(b.id))],
      assumptions: [...new Set([...tree.assumptions, ...suggestion.assumptions])].slice(0, 6),
      clarificationQuestions: [...new Set([...tree.clarificationQuestions, ...suggestion.clarificationQuestions])].slice(0, 6) };
    if (next.buckets.length > 8 || next.buckets.flatMap(b => b.questions).length > 30) {
      window.alert('Keep the framework to 8 buckets and 30 questions. Adopt fewer buckets or remove some chosen items.'); return;
    }
    const changed = chooseFramework(document, next);
    changed.frameworkSuggestion = { ...suggestion, buckets: suggestion.buckets.filter(b => !ids.includes(b.id)) };
    onChange(changed); setSelected([]);
  };
  return <section aria-label="Framework builder" className="space-y-4 rounded-xl border border-[var(--border)] p-4">
    <h3 className="font-semibold">Build your research framework</h3>
    <p className="rounded-lg bg-[var(--accent)] p-3 text-sm">Select the buckets you want, then expand them to review the questions and evidence needed. After adopting a bucket, you can still edit, add, move, or remove its questions. Each chosen question creates a Findings section. Save research to keep your changes.</p>
    {canEdit && <div className="space-y-2">
      <label className="block text-sm">Optional framework focus<input aria-label="Framework focus" maxLength={1000} className={field} value={focus} disabled={busy} onChange={e => setFocus(e.target.value)} placeholder="For example: compare customer segments within the client's pilot budget" /></label>
      <button className={primary} disabled={busy || dirty} onClick={() => onGenerate(focus)}>{busy ? 'Working…' : 'Generate framework'}</button>
      <p className="text-sm">Generation saves a suggestion and leaves your chosen framework and findings intact. {dirty ? 'Save or discard your edits before generating.' : 'Requires a released workstream and a configured model.'}</p>
    </div>}
    {suggestion && <section aria-label="Suggested framework" className="space-y-3 rounded-lg border border-[var(--border)] p-3">
      <h4 className="font-semibold">Suggested framework</h4><p className="text-sm">{suggestion.objective}</p>
      {suggestion.buckets.length === 0 && <p className="text-sm">All suggested buckets have been adopted. You can generate another suggestion.</p>}
      {suggestion.buckets.map(b => <div key={b.id} className={`overflow-hidden rounded-lg border-2 transition-colors ${selected.includes(b.id) ? 'border-[var(--primary)] bg-[var(--accent)]' : 'border-[var(--border)] bg-[var(--card)]'}`}>
        <label className="flex cursor-pointer items-center gap-3 p-3 font-semibold text-[var(--primary)] hover:bg-[var(--accent)]">
          {canEdit && <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" disabled={busy} checked={selected.includes(b.id)} onChange={e => setSelected(e.target.checked ? [...selected, b.id] : selected.filter(id => id !== b.id))} />}
          {b.title}{selected.includes(b.id) && <span className="ml-auto text-xs">Selected</span>}
        </label>
        <details><summary aria-label={`Preview ${b.title}`} className={`${disclosure} text-sm`}>Questions &amp; evidence ({b.questions.length})</summary>
          <ul className="space-y-3 px-4 pb-4 text-sm">{b.questions.map((q, qi) => <li key={q.id} className="rounded-lg bg-[var(--secondary)] p-3"><p className="font-medium">{qi + 1}. {q.title}</p><p className="mt-1">Evidence needed: {q.evidence}</p></li>)}</ul>
        </details>
      </div>)}
      {suggestion.assumptions.length > 0 && <p className="text-sm">Assumptions to test: {suggestion.assumptions.join(' · ')}</p>}
      {suggestion.clarificationQuestions.length > 0 && <p className="text-sm">Clarify: {suggestion.clarificationQuestions.join(' · ')}</p>}
      {canEdit && suggestion.buckets.length > 0 && <div className="flex flex-wrap gap-2"><button className={primary} disabled={busy || !selected.length} onClick={() => adopt(selected)}>Adopt selected buckets</button><button className={button} disabled={busy} onClick={() => adopt(suggestion.buckets.map(b => b.id))}>Adopt all</button></div>}
    </section>}
    <h4 className="font-semibold">Chosen framework</h4>
    <fieldset disabled={busy || !canEdit} className="space-y-3 disabled:opacity-70">
      <label className="block text-sm">Research objective<input aria-label="Research objective" className={field} maxLength={1000} value={tree.objective} onChange={e => update(t => { t.objective = e.target.value; })} /></label>
      {tree.buckets.length === 0 && <p className="text-sm">Adopt a suggested bucket or add your own below.</p>}
      {tree.buckets.map((b, bi) => <details key={b.id} className="rounded-lg border-2 border-[var(--primary)] bg-[var(--card)]">
        <summary aria-label={`Chosen bucket ${bi + 1}`} className={disclosure}>{b.title} <span className="text-xs font-normal">· {b.questions.length} {b.questions.length === 1 ? 'question' : 'questions'} · Expand to edit</span></summary>
        <div className="space-y-3 p-3 pt-0">
          <label className="block text-sm">Bucket name<input aria-label={`Bucket ${bi + 1}`} className={field} maxLength={300} value={b.title} onChange={e => update(t => { t.buckets[bi].title = e.target.value; })} /></label>
          <div className="flex flex-wrap gap-2"><button className={button} disabled={bi === 0} onClick={() => update(t => { t.buckets = move(t.buckets, bi, -1); })}>Move bucket up</button><button className={button} disabled={bi === tree.buckets.length - 1} onClick={() => update(t => { t.buckets = move(t.buckets, bi, 1); })}>Move bucket down</button><button className={button} onClick={() => remove(t => { t.buckets.splice(bi, 1); })}>Remove bucket</button></div>
          {b.questions.map((q, qi) => <div key={q.id} className="space-y-2 rounded-lg bg-[var(--secondary)] p-3">
            <label className="block text-sm">Question / information to gather<input aria-label={`Question ${bi + 1}.${qi + 1}`} className={field} maxLength={300} value={q.title} onChange={e => update(t => { t.buckets[bi].questions[qi].title = e.target.value; })} /></label>
            <label className="block text-sm">Evidence needed<textarea aria-label={`Evidence ${bi + 1}.${qi + 1}`} className={field} maxLength={1000} value={q.evidence} onChange={e => update(t => { t.buckets[bi].questions[qi].evidence = e.target.value; })} /></label>
            <div className="flex flex-wrap gap-2"><button className={button} disabled={qi === 0} onClick={() => update(t => { t.buckets[bi].questions = move(t.buckets[bi].questions, qi, -1); })}>Move question up</button><button className={button} disabled={qi === b.questions.length - 1} onClick={() => update(t => { t.buckets[bi].questions = move(t.buckets[bi].questions, qi, 1); })}>Move question down</button><button className={button} onClick={() => remove(t => { t.buckets[bi].questions.splice(qi, 1); })}>Remove question</button></div>
          </div>)}
          {canEdit && onResearch && <div className="space-y-1"><button className={primary} disabled={dirty || !b.questions.length || b.questions.length > 8} onClick={() => onResearch(b.id)}>Research this bucket</button>{dirty && <p className="text-sm">Save your changes before researching.</p>}</div>}
          <button className={button} disabled={tree.buckets.flatMap(b => b.questions).length >= 30} onClick={() => update(t => { t.buckets[bi].questions.push({ id: newId(), title: 'New research question?', evidence: '' }); })}>Add question</button>
        </div>
      </details>)}
      <button className={button} disabled={tree.buckets.length >= 8} onClick={() => update(t => { t.buckets.push({ id: newId(), title: 'New bucket', questions: [] }); })}>Add bucket</button>
      {tree.assumptions.length > 0 && <label className="block text-sm">Assumptions to test (one per line)<textarea className={field} maxLength={3606} value={tree.assumptions.join('\n')} onChange={e => update(t => { t.assumptions = e.target.value.split('\n').filter(Boolean).slice(0, 6).map(s => s.slice(0, 600)); })} /></label>}
      {tree.clarificationQuestions.length > 0 && <label className="block text-sm">Questions to clarify (one per line)<textarea className={field} maxLength={3606} value={tree.clarificationQuestions.join('\n')} onChange={e => update(t => { t.clarificationQuestions = e.target.value.split('\n').filter(Boolean).slice(0, 6).map(s => s.slice(0, 600)); })} /></label>}
    </fieldset>
  </section>;
}
