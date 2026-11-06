'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { api, setAuthToken, projectsAPI } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import { getEffectiveRole, type AppRole } from '@/lib/permissions';

export default function AgenticCms() {
  const pathname = usePathname();
  const { getToken, user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [overview, setOverview] = useState('');
  const [scope, setScope] = useState('');
  const [notes, setNotes] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [roleReady, setRoleReady] = useState(false);
  const [mount] = useState<HTMLElement | null>(() => typeof document === 'undefined' ? null : document.getElementById('agentic-cms-root'));
  const [panel, setPanel] = useState<'context' | 'notes'>('context');
  const canManage = roleReady && (role === 'ADMIN' || role === 'LC' || role === 'PM');
  const load = async (id: string) => {
    if (!id) return;
    const { data } = await api.get(`/agentic-cms/context/projects/${id}`);
    setOverview(data.project.overview ?? ''); setScope(data.project.scope ?? ''); setNotes(data.notes);
  };
  useEffect(() => { void (async () => { const token = await getToken(); setAuthToken(token); const resolvedRole = await getEffectiveRole(token, user?.email); setRole(resolvedRole); setRoleReady(true); const { data } = await projectsAPI.getAll({ limit: 100 }); const list = data.projects ?? []; setProjects(list); if (list[0]) { setProjectId(list[0].id); await load(list[0].id); } })().catch(() => setError('Could not load project context or resolve your CMS role.')); }, [getToken, user?.email]);
  const save = async () => { try { await api.put(`/agentic-cms/context/projects/${projectId}`, { overview, scope }); setError('Saved.'); } catch { setError('Unable to save context.'); } };
  const addNote = async () => { try { const { data } = await api.post(`/agentic-cms/context/projects/${projectId}/notes`, { title, content }); setNotes([data, ...notes]); setTitle(''); setContent(''); } catch { setError('Unable to add note.'); } };
  const removeNote = async (id: string) => { try { await api.delete(`/agentic-cms/context/projects/${projectId}/notes/${id}`); setNotes(notes.filter(n => n.id !== id)); } catch { setError('Unable to delete note.'); } };
  if (pathname !== '/agentic-cms') return null;
  if (!mount) return null;
  if (roleReady && projects.length === 0) return null;
  if (!mount) return null;
  return createPortal(<main className="mx-auto max-w-5xl space-y-4 p-6">
    <h1 className="text-2xl font-semibold">Agentic CMS</h1>
    {projects.length > 0 && <><div role="tablist" aria-label="Agentic CMS tools" className="flex gap-2 border-b pb-2"><button role="tab" aria-selected={panel === 'context'} onClick={() => setPanel('context')}>Project Context</button><button role="tab" aria-selected={panel === 'notes'} onClick={() => setPanel('notes')}>Client Call Notes</button></div>{error && <p role="status" className="text-sm">{error}</p>}
    <select aria-label="Project" value={projectId} onChange={e => { setProjectId(e.target.value); void load(e.target.value); }} className="my-2 w-full rounded border p-2">{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    {panel === 'context' && <section><h2>Project overview and SOW / scope</h2>{canManage ? <><label className="block text-sm">Overview<textarea aria-label="Overview" value={overview} onChange={e => setOverview(e.target.value)} className="my-1 w-full rounded border p-2" /></label><label className="block text-sm">SOW / Scope<textarea aria-label="SOW / Scope" value={scope} onChange={e => setScope(e.target.value)} className="my-1 w-full rounded border p-2" /></label><button onClick={() => void save()} className="rounded bg-blue-600 px-3 py-2 text-white">Save context</button></> : <div className="space-y-3"><div><h3>Overview</h3><p className="whitespace-pre-wrap">{overview}</p></div><div><h3>SOW / Scope</h3><p className="whitespace-pre-wrap">{scope}</p></div></div>}</section>}
    {panel === 'notes' && <section><h2>Client call notes</h2>{canManage && <><input aria-label="Note title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="my-1 w-full rounded border p-2" /><textarea aria-label="Note text" value={content} onChange={e => setContent(e.target.value)} placeholder="Paste note text" className="my-1 w-full rounded border p-2" /><button onClick={() => void addNote()} className="rounded border px-3 py-2">Add note</button></>}{notes.map(n => <article key={n.id} className="my-2 border-t pt-2"><strong>{n.title}</strong><p className="whitespace-pre-wrap">{n.content}</p><small>{new Date(n.createdAt).toLocaleString()}</small>{canManage && <button aria-label={`Delete ${n.title}`} onClick={() => void removeNote(n.id)} className="ml-3 underline">Delete</button>}</article>)}</section>}</>}
  </main>, mount);
}
