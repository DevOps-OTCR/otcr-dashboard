'use client';

import { AlertCircle, Bot, Check, ExternalLink, Loader2, Plus, RotateCcw, Send, Square, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { useAuth } from '@/components/AuthContext';
import { projectsAPI } from '@/lib/api';
import { ChatRequestError, streamChat, type AgentEvent, type AgentSource } from './chat-stream';
import { MessageText } from './MessageText';
import { pickWorkstream, type WorkstreamOption } from './workstream';

type ProjectOption = { id: string; name: string; sprintTimezone?: string };
type ToolStep = { id: string; label: string; status: 'running' | 'ok' | 'failed'; note?: string };
type UserEntry = { id: string; role: 'user'; text: string };
type BotEntry = {
  id: string;
  role: 'assistant';
  text: string;
  tools: ToolStep[];
  sources: AgentSource[];
  error?: { message: string; retryable: boolean };
  pending: boolean;
};
type Entry = UserEntry | BotEntry;

const MAX_MESSAGE_CHARS = 8000;
const EXAMPLES = [
  'Summarize my current workstream',
  'Research the size of the US campus e-bike market, with sources',
  'Write an executive summary of our findings so far',
];
const DEFAULT_WIDTH = 440;
const MIN_WIDTH = 360;
const MAX_WIDTH = 960;
const WIDTH_STEP = 24;
const WIDTH_KEY = 'otcr-bot-width';

const clampWidth = (width: number) =>
  Math.round(Math.max(MIN_WIDTH, Math.min(width, MAX_WIDTH, window.innerWidth - 40)));

// The panel only loads in the browser, after the backend enables the feature.
function savedWidth() {
  try {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    return saved > 0 ? clampWidth(saved) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

let nextId = 0;
const newId = () => `m${++nextId}`;

export function OtcrBot() {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [projectsError, setProjectsError] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [sprints, setSprints] = useState<WorkstreamOption[]>([]);
  const [sprintId, setSprintId] = useState('');
  // Which project's workstreams are loaded. Chat waits for them so the default week
  // can't change after a conversation has started.
  const [sprintsFor, setSprintsFor] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState(savedWidth);
  const abortRef = useRef<AbortController | null>(null);
  const chatGeneration = useRef(0); // bumped on every reset so an older request's events are ignored
  const workstreamsReady = sprintsFor === projectId;
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Stop any reply in flight if the feature is unmounted (flag off, sign-out, account change).
  useEffect(() => () => abortRef.current?.abort(), []);

  // Load the user's projects the first time the panel opens.
  useEffect(() => {
    if (!open || projects !== null) return;
    let cancelled = false;
    projectsAPI.getAll({ limit: 100 })
      .then((res) => {
        if (cancelled) return;
        const list = ((res.data?.projects ?? []) as ProjectOption[]).map(({ id, name, sprintTimezone }) => ({ id, name, sprintTimezone }));
        setProjects(list);
        setProjectId((current) => current || list[0]?.id || '');
      })
      .catch(() => { if (!cancelled) { setProjects([]); setProjectsError(true); } });
    return () => { cancelled = true; };
  }, [open, projects]);

  // Load the project's workstreams (sprints) and select the current one, if any.
  useEffect(() => {
    if (!projectId) return; // the project-change handler already cleared the workstreams
    let cancelled = false;
    const timeZone = projects?.find((p) => p.id === projectId)?.sprintTimezone;
    projectsAPI.getSprints(projectId)
      .then((res) => {
        if (cancelled) return;
        // Draft workstreams are hidden from consultants, and the backend refuses them.
        const list = ((res.data ?? []) as Array<{ id: string; label: string; status: string; weekStartDate: string; weekEndDate: string }>)
          .filter((s) => s.status === 'RELEASED')
          .map((s) => ({ id: s.id, name: s.label, weekStartDate: s.weekStartDate, weekEndDate: s.weekEndDate }));
        setSprints(list);
        setSprintId((current) => pickWorkstream(list, current, timeZone, new Date()));
        setSprintsFor(projectId);
      })
      .catch(() => { if (!cancelled) { setSprints([]); setSprintId(''); setSprintsFor(projectId); } });
    return () => { cancelled = true; };
  }, [projectId, projects]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [entries]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // Private browsing can block storage; the width still works for this visit.
    }
  }, [width]);

  const updateBot = useCallback((id: string, change: (entry: BotEntry) => BotEntry) => {
    setEntries((list) => list.map((e) => (e.id === id && e.role === 'assistant' ? change(e) : e)));
  }, []);

  const newChat = useCallback(() => {
    chatGeneration.current += 1;
    abortRef.current?.abort();
    setEntries([]);
    setConversationId(undefined);
  }, []);

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busy || !projectId || !workstreamsReady) return;
    const generation = chatGeneration.current;
    const botId = newId();
    setEntries((list) => [
      ...list,
      { id: newId(), role: 'user', text: message },
      { id: botId, role: 'assistant', text: '', tools: [], sources: [], pending: true },
    ]);
    setDraft('');
    setBusy(true);
    const abort = new AbortController();
    abortRef.current = abort;

    const onEvent = (event: AgentEvent) => {
      if (generation !== chatGeneration.current) return; // the chat was reset: this reply no longer belongs to it
      switch (event.type) {
        case 'conversation':
          setConversationId(event.id);
          break;
        case 'text_delta':
          updateBot(botId, (e) => ({ ...e, text: e.text + event.text }));
          break;
        case 'text_replace':
          updateBot(botId, (e) => ({ ...e, text: event.text }));
          break;
        case 'tool_start':
          updateBot(botId, (e) => ({ ...e, tools: [...e.tools, { id: event.id, label: event.label, status: 'running' }] }));
          break;
        case 'tool_end':
          updateBot(botId, (e) => ({
            ...e,
            tools: e.tools.map((t) => (t.id === event.id ? { ...t, status: event.ok ? 'ok' : 'failed', note: event.note } : t)),
          }));
          break;
        case 'sources':
          updateBot(botId, (e) => ({ ...e, sources: event.sources }));
          break;
        case 'error':
          updateBot(botId, (e) => ({ ...e, error: { message: event.message, retryable: event.retryable } }));
          break;
      }
    };

    try {
      const token = await getToken();
      if (!token) throw new ChatRequestError('Your session expired. Sign in again.', false);
      await streamChat({ projectId, sprintId: sprintId || undefined, conversationId, message }, token, onEvent, abort.signal);
    } catch (err) {
      if (abort.signal.aborted) {
        updateBot(botId, (e) => ({ ...e, text: e.text ? `${e.text}\n\n(Stopped)` : '(Stopped)' }));
      } else {
        const error = err instanceof ChatRequestError
          ? { message: err.message, retryable: err.retryable }
          : { message: 'The reply was interrupted. Try again.', retryable: true };
        updateBot(botId, (e) => ({ ...e, error }));
      }
    } finally {
      updateBot(botId, (e) => ({ ...e, pending: false, tools: e.tools.map((t) => (t.status === 'running' ? { ...t, status: 'failed' } : t)) }));
      if (abortRef.current === abort) abortRef.current = null;
      setBusy(false);
    }
  }, [busy, projectId, sprintId, workstreamsReady, conversationId, getToken, updateBot]);

  const retry = (botId: string) => {
    const index = entries.findIndex((e) => e.id === botId);
    const user = entries[index - 1];
    if (!user || user.role !== 'user') return;
    setEntries((list) => list.filter((e) => e.id !== botId && e.id !== user.id));
    void send(user.text);
  };

  const onResizeStart = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); // keep the drag from selecting chat text
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(clampWidth(window.innerWidth - e.clientX));
  };
  const onResizeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setWidth((w) => clampWidth(w + (e.key === 'ArrowLeft' ? WIDTH_STEP : -WIDTH_STEP)));
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void send(draft); };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        aria-label="Open OTCR Bot"
      >
        <Bot className="h-5 w-5" aria-hidden /> OTCR Bot
      </button>
    );
  }

  const selectClass = 'min-w-0 flex-1 truncate rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

  return (
    <aside
      aria-label="OTCR Bot"
      style={{ '--otcr-bot-width': `${width}px` } as CSSProperties}
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-slate-200 bg-white text-slate-900 shadow-2xl sm:w-[var(--otcr-bot-width)] sm:max-w-[calc(100vw-2.5rem)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize OTCR Bot"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onKeyDown={onResizeKey}
        className="absolute inset-y-0 left-0 z-10 hidden w-2 -translate-x-1/2 cursor-ew-resize touch-none hover:bg-blue-500/40 focus:outline-none focus-visible:bg-blue-500/60 active:bg-blue-500/60 sm:block"
      />
      <header className="space-y-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-blue-700 dark:text-blue-400" aria-hidden />
          <h2 className="flex-1 text-sm font-semibold">OTCR Bot <span className="font-normal text-slate-500">(pilot)</span></h2>
          <button type="button" onClick={newChat} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" title="New chat" aria-label="New chat">
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" title="Close" aria-label="Close OTCR Bot">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="otcr-bot-project">Project</label>
          <select
            id="otcr-bot-project"
            className={selectClass}
            value={projectId}
            disabled={busy || !projects?.length}
            onChange={(e) => { newChat(); setSprints([]); setSprintId(''); setSprintsFor(''); setProjectId(e.target.value); }}
          >
            {projects === null && <option value="">Loading projects…</option>}
            {projects?.length === 0 && <option value="">No projects</option>}
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="sr-only" htmlFor="otcr-bot-workstream">Workstream</label>
          <select id="otcr-bot-workstream" className={selectClass} value={sprintId} disabled={busy || !workstreamsReady} onChange={(e) => { newChat(); setSprintId(e.target.value); }}>
            <option value="">No workstream</option>
            {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </header>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm" aria-live="polite">
        {projectsError && <Notice text="Couldn't load your projects. Close and reopen OTCR Bot to try again." />}
        {projects?.length === 0 && !projectsError && <Notice text="OTCR Bot works within a project. You aren't on any projects yet." />}
        {entries.length === 0 && !!projects?.length && (
          <div className="space-y-3 text-slate-600 dark:text-slate-300">
            <p>Ask about your workstream, research a topic with cited sources, or draft text for a whitepaper or slides. Check everything before you use it.</p>
            <div className="flex flex-col gap-2">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => void send(example)} disabled={busy || !workstreamsReady}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((entry) => entry.role === 'user' ? (
          <div key={entry.id} className="ml-8 whitespace-pre-wrap break-words rounded-lg bg-blue-700 px-3 py-2 text-white">{entry.text}</div>
        ) : (
          <div key={entry.id} className="mr-4 space-y-2">
            {entry.tools.map((tool) => (
              <div key={tool.id} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                {tool.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {tool.status === 'ok' && <Check className="h-3.5 w-3.5 text-green-600" aria-hidden />}
                {tool.status === 'failed' && <AlertCircle className="h-3.5 w-3.5 text-amber-600" aria-hidden />}
                <span>{tool.label}{tool.note ? ` · ${tool.note}` : ''}</span>
              </div>
            ))}
            {entry.text && <MessageText text={entry.text} sources={entry.sources} copyable={!entry.pending && !entry.error} />}
            {entry.pending && !entry.text && (
              <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Thinking…</div>
            )}
            {entry.sources.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700">
                <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">Sources</p>
                <ol className="space-y-1">
                  {entry.sources.map((s) => (
                    <li key={s.id} className="flex gap-1">
                      <span className="text-slate-500">[{s.id}]</span>
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">
                        <span className="truncate">{s.title}</span><ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {entry.error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="flex-1">{entry.error.message}</span>
                {entry.error.retryable && !busy && (
                  <button type="button" onClick={() => retry(entry.id)} className="flex items-center gap-1 font-semibold hover:underline">
                    <RotateCcw className="h-3 w-3" aria-hidden /> Retry
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="border-t border-slate-200 p-3 dark:border-slate-700">
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="otcr-bot-input">Message OTCR Bot</label>
          <textarea
            id="otcr-bot-input"
            ref={inputRef}
            rows={2}
            maxLength={MAX_MESSAGE_CHARS}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={projectId ? 'Ask OTCR Bot… (Shift+Enter for a new line)' : 'Select a project first'}
            disabled={!projectId}
            className="max-h-40 min-h-[2.75rem] flex-1 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
          />
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-lg bg-slate-200 p-2.5 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600" aria-label="Stop">
              <Square className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim() || !projectId || !workstreamsReady} className="rounded-lg bg-blue-700 p-2.5 text-white hover:bg-blue-800 disabled:opacity-40" aria-label="Send">
              <Send className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">AI output can be wrong. Verify facts and sources before sharing with a client.</p>
      </form>
    </aside>
  );
}

function Notice({ text }: { text: string }) {
  return <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{text}</p>;
}
