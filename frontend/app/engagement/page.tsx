'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Users,
} from 'lucide-react';
import { PMNavbar } from '@/components/PMNavbar';
import { LCPartnerNavbar } from '@/components/LCPartnerNavbar';
import { getLastDashboard } from '@/lib/dashboard-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { mockWorkstreamDeadlines } from '@/data/mockData';
import { mockAllowedEmails } from '@/data/mockData';
import { tasksAPI, projectsAPI } from '@/lib/api';
import type { TaskFromApi } from '@/lib/task-utils';
import { notifyTaskAssigned } from '@/lib/notifications-storage';
import { getEffectiveRole } from '@/lib/permissions';
import type { WorkstreamDeadline } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthContext';
import { AppRole } from '@/lib/permissions';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';


function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function EngagementPage() {
  const session = useAuth();
  const router = useRouter();
  const [workstreams] = useState<WorkstreamDeadline[]>(mockWorkstreamDeadlines);
  const [tasks, setTasks] = useState<TaskFromApi[]>([]);
  const [hasMounted, setHasMounted] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [activeWorkstreamId, setActiveWorkstreamId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<TaskFromApi | null>(null);
  const [allProjectMemberEmails, setAllProjectMemberEmails] = useState<string[]>([]);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    assignType: 'person' as 'person' | 'all_team',
    assigneeEmail: '',
    dueDate: '',
  });
  const [resolvedRole, setResolvedRole] = useState<AppRole>('CONSULTANT');
  const canEdit = resolvedRole === 'PM' || resolvedRole === 'ADMIN';

  useEffect(() => {
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in'); 
    }
  }, [session, router]);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  useEffect(() => {
    const fetchRole = async () => {
      if (session) {
        const token = await session.getToken(); 
        const email = session.user?.email || '';
        
        const role = await getEffectiveRole(token, email);
        setResolvedRole(role);
      }
    };

    fetchRole();
  }, [session]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    tasksAPI.getAll({ includeCompleted: true }).then((res) => setTasks(Array.isArray(res.data) ? res.data : [])).catch(() => setTasks([]));
  }, [session?.user?.email]);

  useEffect(() => {
    projectsAPI
      .getAll({ includeMembers: true, limit: 100 })
      .then((res) => {
        const projects = res.data?.projects ?? [];
        const emails = Array.from(
          new Set(projects.flatMap((p: { members?: { user: { email: string } }[] }) => p.members?.map((m: { user: { email: string } }) => m.user.email) ?? []))
        ).filter(Boolean) as string[];
        setAllProjectMemberEmails(emails);
      })
      .catch(() => setAllProjectMemberEmails([]));
  }, [session?.user?.email]);

  const assignOptions = [
    { value: 'all_team', label: 'All team members' },
    ...mockAllowedEmails.map((email) => ({ value: email, label: email })),
  ];

  const openAddModal = (workstreamId: string) => {
    setTaskError(null);
    setActiveWorkstreamId(workstreamId);
    setForm({ title: '', assignType: 'all_team', assigneeEmail: '', dueDate: '' });
    setAddModalOpen(true);
  };

  const openEditModal = (task: TaskFromApi) => {
    setEditingTask(task);
    setForm({
      title: task.taskName,
      assignType: task.assigneeType === 'ALL' || task.assigneeType === 'ALL_TEAM' ? 'all_team' : 'person',
      assigneeEmail: task.assigneeEmail ?? '',
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '',
    });
    setEditModalOpen(true);
  };

  const handleAddTask = () => {
    if (!activeWorkstreamId || !form.title.trim() || !form.dueDate) return;
    setTaskError(null);
    const workstream = workstreams.find((w) => w.id === activeWorkstreamId)?.workstreamName ?? 'General';
    const assigneeType = form.assignType === 'all_team' ? 'ALL' : 'PERSON';
    tasksAPI
      .create({
        taskName: form.title.trim(),
        dueDate: form.dueDate,
        projectName: 'OTCR Engagement',
        workstream,
        workstreamId: activeWorkstreamId,
        assigneeType,
        assigneeEmail: form.assignType === 'person' ? form.assigneeEmail || undefined : undefined,
      })
      .then(() => {
        setAddModalOpen(false);
        setActiveWorkstreamId(null);
        setForm({ title: '', assignType: 'all_team', assigneeEmail: '', dueDate: '' });
        if (form.assignType === 'person' && form.assigneeEmail) {
          notifyTaskAssigned(form.assigneeEmail, form.title.trim(), '');
        } else if (form.assignType === 'all_team') {
          allProjectMemberEmails.forEach((email) => notifyTaskAssigned(email, form.title.trim(), ''));
        }
        return tasksAPI.getAll({ includeCompleted: true });
      })
      .then((res) => setTasks(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        const message = err.response?.data?.message ?? err.message ?? 'Failed to create task. Is the backend running?';
        setTaskError(message);
      });
  };

  const handleUpdateTask = () => {
    if (!editingTask) return;
    if (!form.title.trim() || !form.dueDate) return;
    const assigneeType = form.assignType === 'all_team' ? 'ALL' : 'PERSON';
    tasksAPI
      .update(editingTask.id, {
        taskName: form.title.trim(),
        dueDate: form.dueDate,
        assigneeType,
        assigneeEmail: form.assignType === 'person' ? form.assigneeEmail || undefined : undefined,
      })
      .then(() => tasksAPI.getAll({ includeCompleted: true }))
      .then((res) => {
        setTasks(Array.isArray(res.data) ? res.data : []);
        setEditModalOpen(false);
        setEditingTask(null);
      })
      .catch(() => {});
  };

  const handleDeleteTask = (id: string) => {
    if (!confirm('Delete this task?')) return;
    tasksAPI
      .delete(id)
      .then(() => tasksAPI.getAll({ includeCompleted: true }))
      .then((res) => setTasks(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  };

  const getTasksForWorkstream = (workstreamId: string) =>
    tasks.filter((t) => t.workstreamId === workstreamId);

  const getAssigneeLabel = (task: TaskFromApi) =>
    task.assigneeType === 'ALL' || task.assigneeType === 'ALL_TEAM' ? 'All team members' : (task.assigneeEmail ?? '—');

  if (session.loading || !hasMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="animate-pulse text-[var(--foreground)]/70">Loading...</div>
      </div>
    );
  }

  if (!session.isLoggedIn) {
    router.replace('/sign-in');
    return null;
  }

  // Show LC/Partner navbar when user is LC or Partner, or when they came from LC/Partner dashboard (e.g. DEV). PM/ADMIN always see PM navbar.
  const lastDashboard = hasMounted ? getLastDashboard() : null;
  const showLCNavbar =
    resolvedRole === 'LC' || (resolvedRole !== 'PM' && resolvedRole !== 'ADMIN' && lastDashboard === '/lc');
  const showPartnerNavbar =
    resolvedRole === 'PARTNER' || (resolvedRole !== 'PM' && resolvedRole !== 'ADMIN' && lastDashboard === '/partner');
  const showPMNavbar =
    resolvedRole === 'PM' || resolvedRole === 'ADMIN' || (!showLCNavbar && !showPartnerNavbar);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      {showPMNavbar && <PMNavbar currentPath="/engagement" />}
      {showLCNavbar && <LCPartnerNavbar role="LC" currentPath="/engagement" />}
      {showPartnerNavbar && <LCPartnerNavbar role="PARTNER" currentPath="/engagement" />}

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 overflow-y-auto">
        <div className="max-w-[1800px] mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--foreground)]">Engagement — Workstreams & Tasks</h1>
            <p className="text-sm text-[var(--foreground)]/70 mt-1">View workstreams and manage tasks. Assign to a member or all team members.</p>
          </div>

          <div className="grid gap-6">
            {workstreams.map((ws) => {
              const workstreamTasks = getTasksForWorkstream(ws.id);
              return (
                <Card key={ws.id} className="shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="w-5 h-5 text-[var(--primary)]" />
                          {ws.workstreamName}
                        </CardTitle>
                        <CardDescription>{ws.description}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={ws.status === 'on_track' ? 'success' : ws.status === 'at_risk' ? 'warning' : 'danger'}
                          size="sm"
                        >
                          {ws.status.replace('_', ' ')}
                        </Badge>
                        <span className="text-xs text-[var(--foreground)]/60">{ws.daysRemaining}d left · {ws.progress ?? 0}%</span>
                        {canEdit && (
                          <Button size="sm" onClick={() => openAddModal(ws.id)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add task
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="h-2 bg-[var(--accent)] rounded-full overflow-hidden mt-2">
                      <div className="h-full bg-[var(--primary)]" style={{ width: `${ws.progress ?? 0}%` }} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {workstreamTasks.length === 0 ? (
                      <p className="text-sm text-[var(--foreground)]/60 py-4">No tasks yet.{canEdit && ' Use "Add task" to create one.'}</p>
                    ) : (
                      <ul className="space-y-2">
                        {workstreamTasks.map((task) => (
                          <li
                            key={task.id}
                            className={cn(
                              'flex items-center justify-between gap-4 p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80'
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-[var(--foreground)]">{task.taskName}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-[var(--foreground)]/70">
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {getAssigneeLabel(task)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  Due {formatDate(new Date(task.dueDate))}
                                </span>
                              </div>
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-2 shrink-0">
                                <Button variant="ghost" size="sm" onClick={() => openEditModal(task)} aria-label="Edit task">
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-rose-600 hover:bg-rose-500/20"
                                  onClick={() => handleDeleteTask(task.id)}
                                  aria-label="Delete task"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>

      <Modal isOpen={addModalOpen} onClose={() => { setAddModalOpen(false); setTaskError(null); }} title="Add task" size="md">
        <div className="space-y-4">
          {taskError && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-300 px-3 py-2 text-sm">
              {taskError}
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">Task title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
              placeholder="e.g. Complete market analysis"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">Assign to</label>
            <select
              value={form.assignType === 'all_team' ? 'all_team' : form.assigneeEmail}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'all_team') setForm((p) => ({ ...p, assignType: 'all_team', assigneeEmail: '' }));
                else setForm((p) => ({ ...p, assignType: 'person', assigneeEmail: v }));
              }}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
            >
              {assignOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">Due date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTask} disabled={!form.title.trim() || !form.dueDate}>
              <Plus className="w-4 h-4 mr-2" /> Add task
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit task" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">Task title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
              placeholder="e.g. Complete market analysis"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">Assign to</label>
            <select
              value={form.assignType === 'all_team' ? 'all_team' : form.assigneeEmail}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'all_team') setForm((p) => ({ ...p, assignType: 'all_team', assigneeEmail: '' }));
                else setForm((p) => ({ ...p, assignType: 'person', assigneeEmail: v }));
              }}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
            >
              {assignOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">Due date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateTask} disabled={!form.title.trim() || !form.dueDate}>
              Save changes
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
