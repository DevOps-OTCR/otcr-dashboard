'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { StickyNote, ExternalLink, Plus } from 'lucide-react';
import { PMNavbar } from '@/components/PMNavbar';
import { LCPartnerNavbar } from '@/components/LCPartnerNavbar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getEffectiveRole } from '@/lib/permissions';
import { deliverablesAPI, projectsAPI } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import type { AppRole } from '@/lib/permissions';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';

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
  const [resolvedRole, setResolvedRole] = useState<AppRole>('CONSULTANT');

  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const syncRole = async () => {
      if (!session.isLoggedIn) return;
      const token = await session.getToken();
      const email = session.user?.email || '';
      const role = await getEffectiveRole(token, email);
      setResolvedRole(role);
    };
    void syncRole();
  }, [session]);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  const canWrite = useMemo(() => resolvedRole === 'LC' || resolvedRole === 'ADMIN', [resolvedRole]);
  const canRead = useMemo(
    () => resolvedRole === 'LC' || resolvedRole === 'PM' || resolvedRole === 'PARTNER' || resolvedRole === 'ADMIN',
    [resolvedRole],
  );

  const loadNotes = async () => {
    try {
      setLoading(true);
      const res = await deliverablesAPI.getAll({ limit: 200 });
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
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    if (!canWrite) {
      setProjects([]);
      setSelectedProjectId('');
      return;
    }

    try {
      const res = await projectsAPI.getAll({ limit: 100 });
      const raw = Array.isArray(res.data?.projects) ? res.data.projects : [];
      const mapped = raw.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
      setProjects(mapped);
      setSelectedProjectId((prev) => prev || mapped[0]?.id || '');
    } catch {
      setProjects([]);
      setSelectedProjectId('');
    }
  };

  useEffect(() => {
    if (!session.user?.email) return;
    void loadNotes();
    void loadProjects();
  }, [session.user?.email, canWrite]);

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
    } catch (err: any) {
      setError(parseApiError(err, 'Failed to submit client note.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {(resolvedRole === 'PM' || resolvedRole === 'ADMIN') && (
        <PMNavbar currentPath="/client-notes" />
      )}
      {(resolvedRole === 'LC' || resolvedRole === 'PARTNER') && (
        <LCPartnerNavbar
          role={resolvedRole === 'PARTNER' ? 'PARTNER' : 'LC'}
          currentPath="/client-notes"
        />
      )}
      {resolvedRole === 'CONSULTANT' && (
        <header className="border-b border-[var(--border)] bg-[var(--card)]">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <Link href="/consultant" className="text-sm text-[var(--primary)] underline">
              Back to Dashboard
            </Link>
          </div>
        </header>
      )}

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
                <CardDescription>
                  {canWrite ? 'Submit title + link. PM and Partner can view all submitted notes.' : 'View submitted client notes.'}
                </CardDescription>
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
