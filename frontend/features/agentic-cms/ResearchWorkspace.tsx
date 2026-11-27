'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ResearchPreparationStatus } from './ResearchPreparationStatus';
import { FrameworkPanel } from './FrameworkPanel';
import { PastDataPanel } from './PastDataPanel';
import {
  researchAPI, researchFailure,
  type ResearchDeliverable, type ResearchDocument, type ResearchHistory, type ResearchTab,
  type ResearchWorkspace as Workspace,
} from './research-api';

const tabs: { id: ResearchTab; label: string; hint: string }[] = [
  { id: 'past-data', label: 'Relevant Past Data', hint: 'Write or paste useful prior research, decisions, and client notes. Include links to the originals.' },
  { id: 'framework', label: 'Framework / Structure', hint: 'Start with the questions and headings that will guide your research.' },
  { id: 'findings', label: 'Findings', hint: 'Record your findings, supporting evidence, and what they mean for the assignment.' },
];
import { researchButton as button, researchPrimaryButton } from './research-button-styles';
const field = 'w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-[var(--foreground)]';
const discard = () => window.confirm('Discard your unsaved research changes? Copy any text you want to keep before continuing.');

function groupDeliverables(items: ResearchDeliverable[]) {
  const groups = new Map<string, { id: string; label: string; sequence: number; start: string; items: ResearchDeliverable[] }>();
  for (const item of items) {
    const id = item.sprintId ?? item.sprint?.id ?? '';
    if (!groups.has(id)) groups.set(id, {
      id, label: item.sprint?.label ?? (id ? 'Workstream' : 'No workstream'),
      sequence: item.sprint?.sequenceNumber ?? 0, start: item.sprint?.weekStartDate ?? '', items: [],
    });
    groups.get(id)!.items.push(item);
  }
  return [...groups.values()].sort((a, b) => Number(!a.id) - Number(!b.id) || b.start.localeCompare(a.start) || b.sequence - a.sequence);
}

export function ResearchWorkspace({ projectId, onDirtyChange }: { projectId: string; onDirtyChange: (dirty: boolean) => void }) {
  const [deliverables, setDeliverables] = useState<ResearchDeliverable[]>([]);
  const [workstream, setWorkstream] = useState('');
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const generation = useRef(0);
  const load = useCallback(() => {
    const request = ++generation.current;
    return researchAPI.deliverables(projectId).then(items => {
      if (request !== generation.current) return;
      setDeliverables(items);
      const first = groupDeliverables(items)[0];
      setWorkstream(first?.id ?? '');
      setSelected(first?.items[0]?.id ?? '');
    }).catch(() => {
      if (request === generation.current) setError(true);
    }).finally(() => {
      if (request === generation.current) setLoading(false);
    });
  }, [projectId]);

  useEffect(() => {
    const requests = generation;
    void load();
    return () => { ++requests.current; };
  }, [load]);
  const updateDirty = useCallback((value: boolean) => { setDirty(value); onDirtyChange(value); }, [onDirtyChange]);
  const groups = groupDeliverables(deliverables);
  const currentGroup = groups.find(group => group.id === workstream);

  return <section aria-label="Research workspace" className="space-y-5">
    <div>
      <h2 className="text-xl font-semibold">Research workspace</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Shared research for each deliverable. Save your changes to keep them in the CMS.</p>
    </div>
    {loading ? <p role="status">Loading deliverables…</p> : error ? <div role="alert">
      <p>Could not load deliverables. Check your connection and project access.</p>
      <button className={`${button} mt-2`} onClick={() => { setLoading(true); setError(false); void load(); }}>Retry deliverables</button>
    </div> : deliverables.length === 0 ? <p>No deliverables are available for this project. Ask your PM to create or release an assignment.</p> : <>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block min-w-0 space-y-2 text-sm font-medium">Workstream
          <select aria-label="Research workstream" className={field} value={workstream} onChange={event => {
            if (dirty && !discard()) return;
            updateDirty(false);
            setWorkstream(event.target.value);
            setSelected(groups.find(group => group.id === event.target.value)?.items[0]?.id ?? '');
          }}>
            {groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
          </select>
        </label>
        <label className="block min-w-0 space-y-2 text-sm font-medium">Deliverable
          <select aria-label="Research deliverable" className={field} value={selected} onChange={event => {
            if (dirty && !discard()) return;
            updateDirty(false); setSelected(event.target.value);
          }}>
            {currentGroup?.items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
      </div>
      {selected && <ResearchEditor key={selected} projectId={projectId} deliverableId={selected} onDirtyChange={updateDirty} />}
    </>}
  </section>;
}

function ResearchEditor({ projectId, deliverableId, onDirtyChange }: {
  projectId: string; deliverableId: string; onDirtyChange: (dirty: boolean) => void;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [draft, setDraft] = useState<ResearchDocument | null>(null);
  const [tab, setTab] = useState<ResearchTab>('past-data');
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState<{ canEdit: boolean } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ResearchHistory | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const generation = useRef(0);
  const historyGeneration = useRef(0);
  const draftRevision = useRef(0);
  const dirty = !!workspace && !!draft && JSON.stringify(workspace.document) !== JSON.stringify(draft);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const accept = (saved: Workspace) => {
    ++historyGeneration.current;
    setWorkspace(saved); setDraft(saved.document); setMissing(null); setConflict(false);
    setHistory(null); setHistoryOpen(false); setHistoryError(''); setHistoryBusy(false);
  };
  const denyOrExplain = (failure: ReturnType<typeof researchFailure>, fallback: string) => {
    if ([401, 403, 404].includes(failure.status ?? 0)) {
      setWorkspace(null); setDraft(null); setMissing(null);
      setHistory(null); setHistoryOpen(false);
      setError('This research is unavailable or your access has changed. Check with your PM and reload.');
    } else if (failure.status === 409) {
      setConflict(true);
      setError('Research changed elsewhere. Your draft is still here. Copy any text you want to keep, then reload the saved research before continuing.');
    } else {
      const modelErrors: Record<string, string> = { MODEL_NOT_CONFIGURED: 'Configure your local Lumen key and restart the backend before generating.', MODEL_FAILED: 'Generation could not finish. Your saved research was kept. Try again or check your model configuration.', INVALID_MODEL_OUTPUT: 'The bot returned an invalid framework. Your saved research was kept. Try a narrower focus.', SKILL_UNAVAILABLE: 'The framework skill could not be loaded. Check the backend skill directory.' };
      setError(modelErrors[failure.code ?? ''] ?? fallback);
    }
  };
  const preparationUnavailable = useCallback(() => {
    setWorkspace(null); setDraft(null); setMissing(null); setHistory(null); setHistoryOpen(false);
    setError('This research is unavailable or your access has changed. Check with your PM and reload.');
  }, []);
  const load = useCallback(() => {
    const request = ++generation.current;
    return researchAPI.read(projectId, deliverableId).then(saved => {
      if (request === generation.current) { setWorkspace(saved); setDraft(saved.document); }
    }).catch((error: unknown) => {
      if (request !== generation.current) return;
      const failure = researchFailure(error);
      if (failure.code === 'WORKSPACE_NOT_INITIALIZED') setMissing({ canEdit: failure.canEdit });
      else setError('Could not load this research. Check your connection and access, then try again.');
    }).finally(() => { if (request === generation.current) setLoading(false); });
  }, [projectId, deliverableId]);
  const loadGenerated = useCallback(() => {
    const request = generation.current;
    const edits = draftRevision.current;
    void researchAPI.read(projectId, deliverableId).then(saved => {
      if (request !== generation.current) return;
      if (edits !== draftRevision.current) {
        setMessage('The bot saved a new version. Your unsaved draft is kept; reload saved research when ready.');
        return;
      }
      setWorkspace(saved); setDraft(saved.document);
    }).catch((error: unknown) => {
      if (request !== generation.current) return;
      if ([401, 403, 404].includes(researchFailure(error).status ?? 0)) preparationUnavailable();
      else setError('The bot saved a new version, but it could not be loaded. Your draft is kept. Use Reload saved research when ready.');
    });
  }, [projectId, deliverableId, preparationUnavailable]);
  useEffect(() => {
    const requests = generation;
    void load();
    return () => { ++requests.current; };
  }, [load]);
  const reload = () => {
    setLoading(true); setError(''); setMessage(''); setWorkspace(null); setDraft(null); setMissing(null);
    setHistory(null); setHistoryOpen(false); setHistoryError(''); setConflict(false);
    void load();
  };

  const mutate = async (operation: () => Promise<Workspace>, success: string) => {
    const request = generation.current;
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await operation();
      if (request === generation.current) { accept(saved); setMessage(success); }
    } catch (error) {
      if (request === generation.current) denyOrExplain(researchFailure(error), 'Could not save research. Your draft is still here. Try again when your connection is restored.');
    } finally { if (request === generation.current) setBusy(false); }
  };

  const loadHistory = async (beforeVersion?: number) => {
    const request = generation.current;
    const historyRequest = ++historyGeneration.current;
    setHistoryBusy(true); setHistoryError('');
    try {
      const page = await researchAPI.history(projectId, deliverableId, beforeVersion);
      if (request === generation.current && historyRequest === historyGeneration.current) setHistory(prior => ({ ...page, items: beforeVersion && prior ? [...prior.items, ...page.items] : page.items }));
    } catch (error) {
      if (request === generation.current && historyRequest === historyGeneration.current) {
        const failure = researchFailure(error);
        if ([401, 403, 404].includes(failure.status ?? 0)) denyOrExplain(failure, '');
        else setHistoryError('Could not load version history. Try again.');
      }
    } finally { if (request === generation.current && historyRequest === historyGeneration.current) setHistoryBusy(false); }
  };

  if (loading) return <p role="status">Loading research…</p>;
  return <div className="space-y-4">
    <ResearchPreparationStatus projectId={projectId} deliverableId={deliverableId} refreshKey={workspace?.id ?? 'missing'} onReady={workspace ? undefined : load} onUnavailable={preparationUnavailable} />
    {error && <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">{error}</div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {!workspace && !missing && <button className={button} onClick={reload}>Retry research</button>}
    {missing && <div className="rounded-xl border border-dashed border-[var(--border)] p-6">
      <h3 className="font-semibold">Research has not been started</h3>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{missing.canEdit ? 'Create a shared workspace with three blank sections for this deliverable.' : 'An assigned consultant or project manager can create this workspace.'}</p>
      {missing.canEdit && <button disabled={busy} className={`${researchPrimaryButton} mt-4`} onClick={() => void mutate(() => researchAPI.initialize(projectId, deliverableId), 'Research workspace created.')}>
        {busy ? 'Creating…' : 'Create research workspace'}
      </button>}
    </div>}
    {workspace && draft && <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-4">
        <div className="text-sm">
          <p className="font-medium">{dirty ? 'Unsaved changes' : 'Saved in CMS'} · Version {workspace.version}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{workspace.canEdit ? 'Shared editing for assigned consultants' : 'Read-only access'} · {new Date(workspace.updatedAt).toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {workspace.canEdit && <button disabled={!dirty || busy || conflict} className={researchPrimaryButton} onClick={() => void mutate(
            () => researchAPI.save(projectId, deliverableId, workspace.version, draft), 'Research saved.',
          )}>{busy ? 'Saving…' : 'Save research'}</button>}
          <button disabled={busy} className={button} onClick={() => { if (!dirty || discard()) reload(); }}>Reload saved research</button>
          <button disabled={busy} aria-expanded={historyOpen} className={button} onClick={() => {
            setHistoryOpen(!historyOpen); if (!historyOpen) void loadHistory();
          }}>Version history</button>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">
        These three sections guide your research: <strong>Relevant Past Data</strong> captures what’s already known, and <strong>Framework / Structure</strong> defines the questions to answer. Use <strong>Findings</strong> to record what you learn, with sources that support your conclusions.
      </p>
      <div role="tablist" aria-label="Research sections" className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
        {tabs.map(item => <button key={item.id} id={`research-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`research-panel-${item.id}`} className={tab === item.id ? researchPrimaryButton : button} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>
      {tabs.map(item => <div key={item.id} id={`research-panel-${item.id}`} role="tabpanel" aria-labelledby={`research-tab-${item.id}`} hidden={tab !== item.id} className="space-y-4">
        {item.id === 'past-data' && <PastDataPanel projectId={projectId} deliverableId={deliverableId} version={workspace.version} dirty={dirty} canEdit={workspace.canEdit} hasPastData={!!draft.sections.find(section => section.id === 'past-data')?.content.trim()} onGenerated={dirty ? undefined : loadGenerated} onUnavailable={preparationUnavailable} />}
        {item.id === 'framework' && <FrameworkPanel document={draft} canEdit={workspace.canEdit} busy={busy || conflict} dirty={dirty} onChange={next => { ++draftRevision.current; setMessage(''); setDraft(next); }} onGenerate={focus => void mutate(() => researchAPI.generateFramework(projectId, deliverableId, workspace.version, focus), 'Framework suggestion saved. Choose the buckets you want to adopt.')} />}
        {item.id !== 'framework' && <p className="text-sm text-[var(--text-muted)]">{item.hint}</p>}
        {draft.sections.filter(section => section.tab === item.id).map(section => { const Container = item.id === 'framework' ? 'details' : 'div'; return <Container key={section.id} className="space-y-3">
          {item.id === 'framework' && <summary className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--secondary)] p-3 text-sm font-medium">Additional framework notes (optional)</summary>}
          {section.frameworkQuestionId && <p className="text-sm font-medium text-[var(--primary)]">{draft.framework?.buckets.find(b => b.questions.some(q => q.id === section.frameworkQuestionId))?.title}</p>}
          {item.id !== 'framework' && <label className="block space-y-1 text-sm">Section title
            <input aria-label={`${item.label} title ${section.id}`} className={field} maxLength={300} readOnly={!workspace.canEdit || !!section.frameworkQuestionId} disabled={busy} value={section.title} onChange={event => {
              ++draftRevision.current;
              setMessage(''); setDraft({ ...draft, sections: draft.sections.map(current => current.id === section.id ? { ...current, title: event.target.value } : current) });
            }} />
          </label>}
          <label className="block space-y-1 text-sm">{item.id === 'framework' ? 'Planning notes' : section.title || item.label}
            <textarea aria-label={`${item.label} text ${section.id}`} className={`${field} min-h-72 resize-y leading-relaxed`} maxLength={50_000} readOnly={!workspace.canEdit} disabled={busy} value={section.content} placeholder={item.hint} onChange={event => {
              ++draftRevision.current;
              setMessage(''); setDraft({ ...draft, sections: draft.sections.map(current => current.id === section.id ? { ...current, content: event.target.value } : current) });
            }} />
          </label>
          {section.sourceIds.length > 0 && <ul aria-label={`Sources for ${section.title}`} className="space-y-1 text-sm">{section.sourceIds.map(id => {
            const source = draft.sources.find(source => source.id === id);
            return source && /^https?:\/\//i.test(source.url) ? <li key={id}><a href={source.url} target="_blank" rel="noopener noreferrer" className="break-words underline">{source.title}</a></li> : null;
          })}</ul>}
        </Container>; })}
      </div>)}
      {historyOpen && <section aria-label="Research version history" className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <h3 className="font-semibold">Version history</h3>
        <p className="text-sm text-[var(--text-muted)]">Restoring replaces all three tabs and their sources. It creates a new version and keeps earlier versions available.</p>
        {historyError && <p role="alert">{historyError}</p>}
        {history?.items.map(revision => <div key={revision.version} className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-sm">
          <span>Version {revision.version} · {revision.action === 'RESTORE' ? `Restored from version ${revision.restoredFromVersion}` : revision.action === 'INITIALIZE' ? 'Workspace created' : 'Research edited'} · {new Date(revision.createdAt).toLocaleString()}</span>
          {workspace.canEdit && revision.version !== workspace.version && <button disabled={busy || dirty || conflict || historyBusy} className={button} onClick={() => {
            if (window.confirm(`Restore version ${revision.version}? This replaces all three tabs and their sources. Your current saved version will remain in history.`)) {
              void mutate(() => researchAPI.restore(projectId, deliverableId, workspace.version, revision.version), `Restored version ${revision.version} as a new version.`);
            }
          }}>Restore version {revision.version}</button>}
        </div>)}
        {dirty && <p className="text-sm">Save or discard your changes before restoring a version.</p>}
        {historyBusy ? <p role="status">Loading history…</p> : historyError ? <button className={button} onClick={() => void loadHistory()}>Retry history</button> : history?.nextBeforeVersion ? <button className={button} onClick={() => void loadHistory(history.nextBeforeVersion!)}>Load older versions</button> : null}
      </section>}
    </>}
  </div>;
}
