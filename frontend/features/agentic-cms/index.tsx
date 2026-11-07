'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { api, setAuthToken, projectsAPI } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import { getEffectiveRole } from '@/lib/permissions';

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
  const [message, setMessage] = useState('');
  const [roleReady, setRoleReady] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);
  const [panel, setPanel] = useState<'context' | 'notes'>('context');

  const load = async (id: string) => {
    const request = ++requestId.current;
    setProjectId(id);
    setOverview('');
    setScope('');
    setNotes([]);
    setCanManage(false);
    setError('');
    setMessage('');
    if (!id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/agentic-cms/context/projects/${id}`);
      if (request !== requestId.current) return;
      setOverview(data.project.overview ?? '');
      setScope(data.project.scope ?? '');
      setNotes(data.notes ?? []);
      setCanManage(data.canEdit === true);
    } catch {
      if (request === requestId.current) setError('Could not load this project context. Try again.');
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  };

  // The layout can create the portal target after this component mounts (for
  // example, when navigating here from another CMS page), so watch for it.
  useEffect(() => {
    const sync = () => setMount(document.getElementById('agentic-cms-root'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await getToken();
      if (!active) return;
      setAuthToken(token);
      await getEffectiveRole(token, user?.email);
      if (!active) return;
      setRoleReady(true);
      const { data } = await projectsAPI.getAll({ limit: 100 });
      if (!active) return;
      const list = data.projects ?? [];
      setProjects(list);
      setProjectsLoaded(true);
      if (list[0]) await load(list[0].id);
      else setLoading(false);
    })().catch(() => {
      if (active) {
        setProjectsLoaded(true);
        setError('Could not load your CMS projects. Refresh and try again.');
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [getToken, user?.email]);

  const save = async () => {
    const target = projectId;
    const values = { overview, scope };
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.put(`/agentic-cms/context/projects/${target}`, values);
      if (projectId === target) setMessage('Context saved.');
    } catch {
      if (projectId === target) setError('Unable to save context. Check your access and try again.');
    } finally { setSaving(false); }
  };
  const addNote = async () => {
    const target = projectId;
    setError('');
    setMessage('');
    try {
      const { data } = await api.post(`/agentic-cms/context/projects/${target}/notes`, { title, content });
      if (projectId === target) { setNotes(current => [data, ...current]); setTitle(''); setContent(''); setMessage('Note added.'); }
    } catch { if (projectId === target) setError('Unable to add note. Check your access and try again.'); }
  };
  const removeNote = async (id: string) => {
    const target = projectId;
    try {
      await api.delete(`/agentic-cms/context/projects/${target}/notes/${id}`);
      if (projectId === target) setNotes(current => current.filter(n => n.id !== id));
    } catch { if (projectId === target) setError('Unable to delete note. Check your access and try again.'); }
  };

  if (pathname !== '/agentic-cms' || !mount) return null;
  if (roleReady && projectsLoaded && projects.length === 0 && !error) return null;

  return createPortal(<main className="mx-auto max-w-5xl space-y-4 p-6">
    <h1 className="text-2xl font-semibold">Agentic CMS</h1>
    {projects.length > 0 && <div role="tablist" aria-label="Agentic CMS tools" className="flex gap-2 border-b pb-2"><button role="tab" aria-selected={panel === 'context'} onClick={() => setPanel('context')}>Project Context</button><button role="tab" aria-selected={panel === 'notes'} onClick={() => setPanel('notes')}>Client Call Notes</button></div>}
    {projects.length > 0 && <select aria-label="Project" value={projectId} onChange={e => void load(e.target.value)} className="my-2 w-full rounded border p-2">{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
    {error && <p role="alert" className="text-sm">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {loading ? <p role="status">Loading project context...</p> : error ? (projects.length > 0 && <button className="rounded border px-3 py-2" onClick={() => void load(projectId)}>Retry</button>) : panel === 'context' && projects.length > 0 ? <section><h2>Project overview and SOW / scope</h2>{canManage ? <><label className="block text-sm">Overview<textarea aria-label="Overview" value={overview} onChange={e => setOverview(e.target.value)} className="my-1 w-full rounded border p-2" /></label><label className="block text-sm">SOW / Scope<textarea aria-label="SOW / Scope" value={scope} onChange={e => setScope(e.target.value)} className="my-1 w-full rounded border p-2" /></label><button disabled={saving} onClick={() => void save()} className="rounded bg-blue-600 px-3 py-2 text-white">{saving ? 'Saving...' : 'Save context'}</button></> : <div className="space-y-3"><div><h3>Overview</h3><p className="whitespace-pre-wrap">{overview}</p></div><div><h3>SOW / Scope</h3><p className="whitespace-pre-wrap">{scope}</p></div></div>}</section> : panel === 'notes' && projects.length > 0 ? <section><h2>Client call notes</h2>{canManage && <><input aria-label="Note title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="my-1 w-full rounded border p-2" /><textarea aria-label="Note text" value={content} onChange={e => setContent(e.target.value)} placeholder="Paste note text" className="my-1 w-full rounded border p-2" /><button onClick={() => void addNote()} className="rounded border px-3 py-2">Add note</button></>}{notes.map(n => <article key={n.id} className="my-2 border-t pt-2"><strong>{n.title}</strong><p className="whitespace-pre-wrap">{n.content}</p><small>{new Date(n.createdAt).toLocaleString()}</small>{canManage && <button aria-label={`Delete ${n.title}`} onClick={() => void removeNote(n.id)} className="ml-3 underline">Delete</button>}</article>)}</section> : null}
  </main>, mount);
}
