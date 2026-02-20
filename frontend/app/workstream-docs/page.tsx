'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FileText, ExternalLink, Edit3, Plus, Trash2 } from 'lucide-react';
import { PMNavbar } from '@/components/PMNavbar';
import { LCPartnerNavbar } from '@/components/LCPartnerNavbar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getEffectiveRole, hasAccess } from '@/lib/permissions';
import { deliverablesAPI, projectsAPI } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import type { AppRole } from '@/lib/permissions';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';

type WorkstreamDoc = {
  id: string;
  title: string;
  link: string;
  status: 'draft' | 'released';
  projectName: string;
  deadline?: string;
};

type DeliverableDoc = {
  id: string;
  title: string;
  description?: string;
  status: string;
  type?: string;
  deadline?: string;
  projectId?: string;
  project?: { id?: string; name?: string };
};

type ProjectSummary = {
  id: string;
  name: string;
};

const LINK_MARKER_PATTERN = /\[\[WORKSTREAM_LINK:([^\]]+)\]\]/i;

function buildDescriptionWithLink(link: string): string {
  return `[[WORKSTREAM_LINK:${link.trim()}]]`;
}

function extractLink(description?: string): string {
  if (!description) return '';
  const marked = description.match(LINK_MARKER_PATTERN)?.[1];
  if (marked) return marked.trim();
  const plainUrl = description.match(/https?:\/\/\S+/i)?.[0];
  return plainUrl?.trim() ?? '';
}

function parseApiError(err: any, fallback: string): string {
  const message = err?.response?.data?.message ?? err?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : String(message);
}

export default function WorkstreamDocsPage() {
  const session = useAuth();
  const [resolvedRole, setResolvedRole] = useState<AppRole>('CONSULTANT');

  const [docs, setDocs] = useState<WorkstreamDoc[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [form, setForm] = useState({ title: '', link: '', status: 'draft' as 'draft' | 'released' });
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    link: '',
    status: 'draft' as 'draft' | 'released',
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWriteDraft = hasAccess('workstreamDocDraft', resolvedRole, 'write');
  const canReadDraft = hasAccess('workstreamDocDraft', resolvedRole, 'read');
  const canCommentDraft = hasAccess('workstreamDocDraft', resolvedRole, 'comment');

  const canWriteReleased = hasAccess('workstreamDocReleased', resolvedRole, 'write');
  const canReadReleased = hasAccess('workstreamDocReleased', resolvedRole, 'read');
  const canCommentReleased = hasAccess('workstreamDocReleased', resolvedRole, 'comment');

  const canEditLive = hasAccess('editWorkstreamLive', resolvedRole, 'write');

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

  const loadDocs = async () => {
    try {
      setLoading(true);
      const res = await deliverablesAPI.getAll({ limit: 200 });
      const raw = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.deliverables)
          ? res.data.deliverables
          : [];

      const mapped = (raw as DeliverableDoc[])
        .filter((d) => d.type === 'DOCUMENT')
        .map((d) => {
          const normalizedStatus: 'draft' | 'released' =
            d.status === 'SUBMITTED' || d.status === 'APPROVED'
              ? 'released'
              : 'draft';
          return {
            id: d.id,
            title: d.title || 'Untitled workstream doc',
            link: extractLink(d.description),
            status: normalizedStatus,
            projectName: d.project?.name || 'General',
            deadline: d.deadline,
          };
        });

      setDocs(mapped);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    if (!(resolvedRole === 'PM' || resolvedRole === 'ADMIN')) {
      setProjects([]);
      setSelectedProjectId('');
      return;
    }

    try {
      const res = await projectsAPI.getAll({ limit: 100 });
      const raw = Array.isArray(res.data?.projects) ? res.data.projects : [];
      const mapped = raw.map((p: { id: string; name: string }) => ({
        id: p.id,
        name: p.name,
      }));
      setProjects(mapped);
      setSelectedProjectId((prev) => prev || mapped[0]?.id || '');
    } catch {
      setProjects([]);
      setSelectedProjectId('');
    }
  };

  useEffect(() => {
    if (!session.user?.email) return;
    void loadDocs();
    void loadProjects();
  }, [session.user?.email, resolvedRole]);

  const visibleDocs = useMemo(
    () =>
      docs.filter((doc) => {
        if (doc.status === 'draft') {
          return canReadDraft || canCommentDraft || canWriteDraft;
        }
        return canReadReleased || canCommentReleased || canWriteReleased;
      }),
    [
      docs,
      canReadDraft,
      canCommentDraft,
      canWriteDraft,
      canReadReleased,
      canCommentReleased,
      canWriteReleased,
    ],
  );

  const addDoc = async () => {
    if (!form.title.trim() || !form.link.trim()) {
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
      const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const created = await deliverablesAPI.create({
        projectId: selectedProjectId,
        title: form.title.trim(),
        description: buildDescriptionWithLink(form.link),
        type: 'DOCUMENT',
        deadline,
      });
      if (form.status === 'released' && created?.data?.id) {
        await deliverablesAPI.update(created.data.id, { status: 'SUBMITTED' });
      }
      setForm({ title: '', link: '', status: 'draft' });
      await loadDocs();
    } catch (err: any) {
      setError(parseApiError(err, 'Failed to submit workstream doc.'));
    } finally {
      setSubmitting(false);
    }
  };

  const beginEdit = (doc: WorkstreamDoc) => {
    setEditId(doc.id);
    setEditForm({ title: doc.title, link: doc.link, status: doc.status });
  };

  const saveEdit = async () => {
    if (!editId) return;
    if (!editForm.title.trim() || !editForm.link.trim()) {
      setError('Title and link are required.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await deliverablesAPI.update(editId, {
        title: editForm.title.trim(),
        description: buildDescriptionWithLink(editForm.link),
        status: editForm.status === 'released' ? 'SUBMITTED' : 'IN_PROGRESS',
      });
      setEditId(null);
      await loadDocs();
    } catch (err: any) {
      setError(parseApiError(err, 'Failed to update workstream doc.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!canEditLive) return;
    if (!window.confirm('Delete this workstream doc? This action cannot be undone.')) return;

    setError(null);
    setSubmitting(true);
    try {
      await deliverablesAPI.delete(id);
      if (editId === id) setEditId(null);
      await loadDocs();
    } catch (err: any) {
      setError(parseApiError(err, 'Failed to delete workstream doc.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {(resolvedRole === 'PM' || resolvedRole === 'ADMIN') && (
        <PMNavbar currentPath="/workstream-docs" />
      )}
      {(resolvedRole === 'LC' || resolvedRole === 'PARTNER') && (
        <LCPartnerNavbar
          role={resolvedRole === 'PARTNER' ? 'PARTNER' : 'LC'}
          currentPath="/workstream-docs"
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
        <div className="max-w-[1200px] mx-auto space-y-4">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[var(--primary)]" />
                Workstream Docs
              </CardTitle>
              <CardDescription>
                Submit docs with a title and link. Access is role-based for draft and released docs.
              </CardDescription>
            </CardHeader>
            {canWriteDraft && (
              <CardContent className="space-y-3 border-t border-[var(--border)]">
                {error && (
                  <div className="rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-300 px-3 py-2 text-sm">
                    {error}
                  </div>
                )}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-[var(--foreground)]/70">Project</span>
                      <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                      >
                    {!projects.length && <option value="">No project</option>}
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-[var(--foreground)]/70">Visibility</span>
                      <select
                        value={form.status}
                        onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as 'draft' | 'released' }))}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                      >
                        <option value="draft">Draft (consultants cannot view)</option>
                        <option value="released">Released (consultants can view)</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                  <input
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Workstream doc title"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                  />
                  <input
                    value={form.link}
                    onChange={(e) => setForm((p) => ({ ...p, link: e.target.value }))}
                    placeholder="Paste doc link"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                  />
                  <Button onClick={addDoc} disabled={submitting || !projects.length}>
                    <Plus className="w-4 h-4 mr-1" />
                    Submit
                  </Button>
                  </div>
                  <p className="text-xs text-[var(--foreground)]/60">
                    Submit as Draft for internal review, or Released to make it visible to consultants.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="shadow-lg">
            <CardContent className="space-y-3 pt-6">
              {loading ? (
                <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-[var(--foreground)]/60 text-sm">
                  Loading workstream docs...
                </div>
              ) : visibleDocs.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-[var(--foreground)]/60 text-sm">
                  No workstream docs available for your role.
                </div>
              ) : (
                visibleDocs.map((doc) => {
                  const canRead = doc.status === 'draft' ? canReadDraft : canReadReleased;
                  const isEditing = editId === doc.id;
                  return (
                    <div
                      key={doc.id}
                      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80"
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            value={editForm.title}
                            onChange={(e) =>
                              setEditForm((p) => ({ ...p, title: e.target.value }))
                            }
                            className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                          />
                          <input
                            value={editForm.link}
                            onChange={(e) =>
                              setEditForm((p) => ({ ...p, link: e.target.value }))
                            }
                            className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                          />
                          <select
                            value={editForm.status}
                            onChange={(e) =>
                              setEditForm((p) => ({
                                ...p,
                                status: e.target.value as 'draft' | 'released',
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                          >
                            <option value="draft">Draft</option>
                            <option value="released">Released</option>
                          </select>
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={saveEdit} disabled={submitting}>
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditId(null)}
                              disabled={submitting}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div>
                            <h3 className="font-semibold">{doc.title}</h3>
                            <p className="text-xs text-[var(--foreground)]/70">
                              {doc.projectName} •{' '}
                              {doc.status === 'released' ? 'Released' : 'Draft'} • Due{' '}
                              {doc.deadline
                                ? new Date(doc.deadline).toLocaleDateString()
                                : '—'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              size="sm"
                              variant={doc.status === 'released' ? 'success' : 'warning'}
                            >
                              {doc.status}
                            </Badge>
                            {canRead && doc.link && (
                              <a
                                href={doc.link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-[var(--primary)] underline inline-flex items-center gap-1"
                              >
                                <ExternalLink className="w-4 h-4" />
                                Open
                              </a>
                            )}
                            {canEditLive && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => beginEdit(doc)}
                                disabled={submitting}
                              >
                                <Edit3 className="w-4 h-4 mr-1" />
                                Edit live
                              </Button>
                            )}
                            {canEditLive && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteDoc(doc.id)}
                                disabled={submitting}
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Delete
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
