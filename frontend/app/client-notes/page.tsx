'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StickyNote, ExternalLink, Plus } from 'lucide-react';
import { AppNavbar } from '@/components/AppNavbar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getEffectiveRole, hasAccess } from '@/lib/permissions';
import { deliverablesAPI, projectsAPI } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import { RoleDashboardRedirect } from '@/components/RoleDashboardRedirect';
import type { AppRole } from '@/lib/permissions';
import { PageLoading } from '@/components/PageLoading';
import { dispatchNotificationsRefresh } from '@/lib/notification-events';
import { useNavigationSnapshot } from '@/lib/use-navigation-snapshot';

type ClientNote = {
  id: string;
  title: string;
  link: string;
  projectName: string;
  createdAt?: string;
};

type DeliverableDoc = {
  id: string;
  title: string;
  description?: string;
  type?: string;
  status?: string;
  createdAt?: string;
  project?: { id?: string; name?: string };
};

type ProjectSummary = {
  id: string;
  name: string;
};

const NOTE_LINK_PATTERN = /\[\[CLIENT_NOTE_LINK:([^\]]+)\]\]/i;

function toDescription(link: string): string {
  return `[[CLIENT_NOTE_LINK:${link.trim()}]]`;
}

function fromDescription(description?: string): string {
  if (!description) return '';
  const marked = description.match(NOTE_LINK_PATTERN)?.[1];
  if (marked) return marked.trim();
  const plain = description.match(/https?:\/\/\S+/i)?.[0];
  return plain?.trim() ?? '';
}

function parseApiError(err: any, fallback: string): string {
  const message = err?.response?.data?.message ?? err?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : String(message);
}

export default function ClientNotesPage() {
  const session = useAuth();
  const router = useRouter();
  const { snapshot, saveSnapshot } = useNavigationSnapshot<{
    role: AppRole; notes: ClientNote[]; projects: ProjectSummary[]; selectedProjectId: string;
  }>('client-notes', session.user?.email);
  const [roleLookupFailed, setRoleLookupFailed] = useState(false);
  const [roleReady, setRoleReady] = useState(false);
  const [resolvedRole, setResolvedRole] = useState<AppRole>(snapshot?.role ?? 'CONSULTANT');
  const dataRole = useRef(snapshot?.role);

  const [notes, setNotes] = useState<ClientNote[]>(snapshot?.notes ?? []);
  const [projects, setProjects] = useState<ProjectSummary[]>(snapshot?.projects ?? []);
  const [selectedProjectId, setSelectedProjectId] = useState(snapshot?.selectedProjectId ?? '');
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(!snapshot);
  const [loadFailed, setLoadFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Once auth init finishes, bounce signed-out users to sign-in instead of
    // leaving them stuck on the loader (deep links / bookmarks).
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in');
    }
  }, [session.loading, session.isLoggedIn, router]);

  useEffect(() => {
    let cancelled = false;
    const syncRole = async () => {
      if (!session.isLoggedIn || roleLookupFailed) return;
      const token = await session.getToken();
      const email = session.user?.email || '';
      const role = await getEffectiveRole(token, email);
      if (cancelled) return;
      if (dataRole.current !== role) {
        // Restored content belongs to the old permissions, even when both roles can write.
        dataRole.current = role;
        setNotes([]);
        setProjects([]);
        setSelectedProjectId('');
        setLoading(true);
        setLoadFailed(false);
      }
      setResolvedRole(role);
      setRoleReady(true);
    };
    void syncRole().catch(() => { if (!cancelled) setRoleLookupFailed(true); });
    return () => { cancelled = true; };
  }, [session, roleLookupFailed]);

  const canWrite = useMemo(
    () => hasAccess('clientCallNotesWrite', resolvedRole, 'write'),
    [resolvedRole],
  );
  const canRead = useMemo(
    () => hasAccess('clientCallNotesRead', resolvedRole, 'read'),
    [resolvedRole],
  );

  const loadNotes = useCallback(async (isCurrent: () => boolean = () => true) => {
    const requestRole = dataRole.current;
    const active = () => isCurrent() && dataRole.current === requestRole;
    try {
      const res = await deliverablesAPI.getAll({ limit: 200 });
      if (!active()) return;
      const raw = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.deliverables)
          ? res.data.deliverables
          : [];

      const mapped = (raw as DeliverableDoc[])
        .filter((d) => d.type === 'REPORT')
        .map((d) => ({
          id: d.id,
          title: d.title || 'Untitled client note',
          link: fromDescription(d.description),
          projectName: d.project?.name || 'General',
          createdAt: d.createdAt,
        }))
        .filter((d) => !!d.link)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      setNotes(mapped);
      setLoadFailed(false);
    } catch {
      // Keep previously loaded notes visible when a refresh fails.
      if (active()) setLoadFailed(true);
    } finally {
      if (active()) setLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async (isCurrent: () => boolean = () => true) => {
    const requestRole = dataRole.current;
    const active = () => isCurrent() && dataRole.current === requestRole;
    if (!canWrite) {
      setProjects([]);
      setSelectedProjectId('');
      return;
    }

    try {
      const res = await projectsAPI.getAll({ limit: 100 });
      if (!active()) return;
      const raw = Array.isArray(res.data?.projects) ? res.data.projects : [];
      const mapped = raw.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
      setProjects(mapped);
      setSelectedProjectId((prev) => (mapped.some((project: ProjectSummary) => project.id === prev) ? prev : mapped[0]?.id || ''));
    } catch {
      // Keep the restored project list when a refresh fails.
    }
  }, [canWrite]);

  useEffect(() => {
    if (session.loading || !session.isLoggedIn || !session.user?.email || roleLookupFailed || !roleReady) return;
    let cancelled = false;
    void loadNotes(() => !cancelled);
    void loadProjects(() => !cancelled);
    return () => { cancelled = true; };
  }, [session.loading, session.isLoggedIn, session.user?.email, resolvedRole, roleReady, roleLookupFailed, loadNotes, loadProjects]);

  useEffect(() => {
    if (roleReady && !loading && !loadFailed && !roleLookupFailed) saveSnapshot({ role: resolvedRole, notes, projects, selectedProjectId });
  }, [roleReady, loading, loadFailed, roleLookupFailed, resolvedRole, notes, projects, selectedProjectId, saveSnapshot]);

  const addNote = async () => {
    if (!title.trim() || !link.trim()) {
      setError('Title and link are required.');
      return;
    }
    if (!selectedProjectId) {
      setError('Select a project first.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await deliverablesAPI.create({
        projectId: selectedProjectId,
        title: title.trim(),
        description: toDescription(link),
        type: 'REPORT',
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      setTitle('');
      setLink('');
      await loadNotes();
      dispatchNotificationsRefresh();
    } catch (err: any) {
      setError(parseApiError(err, 'Failed to submit client note.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (session.loading || !session.isLoggedIn) {
    return <PageLoading />;
  }

  if (roleLookupFailed) return <RoleDashboardRedirect onRetry={() => setRoleLookupFailed(false)} />;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AppNavbar role={resolvedRole} currentPath="/client-notes" />

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-[1000px] mx-auto space-y-6">
          {!canRead && (
            <Card className="shadow-lg">
              <CardContent className="py-8 text-center text-[var(--foreground)]/70 text-sm">
                You do not have access to client call notes.
              </CardContent>
            </Card>
          )}

          {canRead && (
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <StickyNote className="w-5 h-5 text-[var(--primary)]" />
                  Client Notes
                </CardTitle>
              </CardHeader>
              {canWrite && (
                <CardContent className="space-y-3 border-t border-[var(--border)]">
                  {error && (
                    <div className="rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-300 px-3 py-2 text-sm">
                      {error}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_1fr_auto] gap-2">
                    <select
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                    >
                      {!projects.length && <option value="">No project</option>}
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Note title"
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                    />
                    <input
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="Paste notes link"
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                    />
                    <Button onClick={addNote} disabled={submitting || !projects.length}>
                      <Plus className="w-4 h-4 mr-1" />
                      Submit
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {canRead && (
            <Card className="shadow-lg">
              <CardContent className="pt-6 space-y-3">
                {loadFailed && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                    {notes.length ? 'Could not refresh client notes. Showing previously loaded notes.' : 'Could not load client notes.'}
                  </p>
                )}
                {loading ? (
                  <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-[var(--foreground)]/60 text-sm">
                    Loading client notes...
                  </div>
                ) : notes.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-[var(--foreground)]/60 text-sm">
                    No submitted client notes yet.
                  </div>
                ) : (
                  notes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80 p-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <h3 className="font-semibold">{note.title}</h3>
                          <p className="text-xs text-[var(--foreground)]/70">
                            {note.projectName} • {note.createdAt ? new Date(note.createdAt).toLocaleString() : 'Recently added'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge size="sm" variant="success">submitted</Badge>
                          <a
                            href={note.link}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-[var(--primary)] underline inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Open notes
                          </a>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
