'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect, useMemo, useRef, type RefObject } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import {
  LayoutDashboard,
  FileText,
  Settings,
  Bell,
  CheckCircle2,
  Upload,
  ChevronRight,
  FileSpreadsheet,
  Presentation,
  File,
  ExternalLink,
  Activity,
  Users,
  ClipboardList,
  MessageSquare,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { taskToActionItem, getAssigneeLabelForTask, type TaskFromApi, type TeamForTasks } from '@/lib/task-utils';
import { projectsAPI, tasksAPI, deliverablesAPI } from '@/lib/api';
import { getNotificationsForUser, markNotificationRead } from '@/lib/notifications-storage';
import { getEffectiveRole, ROLE_FULL_LABELS } from '@/lib/permissions';
import { AdminRoleSwitcher } from '@/components/AdminRoleSwitcher';
import type { ActionItem, Document as DocType } from '@/types';

function formatNotificationTime(at: Date): string {
  const mins = Math.floor((Date.now() - at.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ConsultantDashboard() {
  const { data: session } = useSession();
  const [tasksFromApi, setTasksFromApi] = useState<TaskFromApi[]>([]);
  const [teamsForTasks, setTeamsForTasks] = useState<TeamForTasks[]>([]);
  const [documentsFromApi, setDocumentsFromApi] = useState<DocType[]>([]);
  const [notifications, setNotifications] = useState<ReturnType<typeof getNotificationsForUser>>([]);
  const overviewRef = useRef<HTMLDivElement>(null);
  const tasksRef = useRef<HTMLDivElement>(null);
  const docsRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const initialSlidesRef = useRef<HTMLDivElement>(null);
  const finalSlidesRef = useRef<HTMLDivElement>(null);
  const engagementRef = useRef<HTMLDivElement>(null);

  const userEmail = session?.user?.email ?? null;
  const resolvedRole = session ? getEffectiveRole(session) : 'CONSULTANT';

  useEffect(() => {
    setNotifications(getNotificationsForUser(userEmail));
  }, [userEmail]);

  useEffect(() => {
    tasksAPI.getAll({ includeCompleted: true }).then((res) => setTasksFromApi(Array.isArray(res.data) ? res.data : [])).catch(() => setTasksFromApi([]));
  }, [session?.user?.email]);

  useEffect(() => {
    projectsAPI
      .getAll({ includeMembers: true, limit: 100 })
      .then((res) => {
        const projects = res.data?.projects ?? [];
        setTeamsForTasks(
          projects.map((p: { id: string; name: string; members?: { user: { email: string } }[] }) => ({
            id: p.id,
            name: p.name,
            memberEmails: p.members?.map((m: { user: { email: string } }) => m.user.email) ?? [],
          }))
        );
      })
      .catch(() => setTeamsForTasks([]));
  }, [session?.user?.email]);

  useEffect(() => {
    // Load documents from backend deliverables API; map to dashboard document type
    deliverablesAPI
      .getAll()
      .then((res) => {
        const raw = Array.isArray(res.data) ? res.data : res.data?.deliverables ?? [];
        const mapped: DocType[] = raw.map((d: any) => ({
          id: d.id,
          name: d.name ?? d.title ?? 'Deliverable',
          type: (d.type ?? 'pdf') as DocType['type'],
          url: d.url ?? '#',
          workstream: d.workstream ?? d.projectName ?? 'General',
          uploadedBy: d.createdBy?.email ?? d.owner?.email ?? 'Unknown',
          uploadedAt: d.createdAt ? new Date(d.createdAt) : new Date(),
          lastModified: d.updatedAt ? new Date(d.updatedAt) : new Date(),
        }));
        setDocumentsFromApi(mapped);
      })
      .catch(() => setDocumentsFromApi([]));
  }, [session?.user?.email]);

  const actionItems = useMemo(() => {
    const fromApi = tasksFromApi.map((t) => taskToActionItem(t, getAssigneeLabelForTask(t, teamsForTasks)));
    return [...fromApi].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [tasksFromApi, teamsForTasks]);

  const toggleActionItem = (id: string) => {
    const task = tasksFromApi.find((t) => t.id === id);
    if (!task) return;
    const nextCompleted = !task.completed;
    tasksAPI
      .update(id, { completed: nextCompleted, status: nextCompleted ? 'COMPLETED' : 'PENDING' })
      .then(() =>
        tasksAPI
          .getAll({ includeCompleted: true })
          .then((res) => setTasksFromApi(Array.isArray(res.data) ? res.data : []))
      )
      .catch(() => {});
  };

  const stats = useMemo(() => {
    const pendingActions = actionItems.filter((a) => !a.completed).length;
    const completed = actionItems.filter((a) => a.completed).length;
    return {
      pendingActions,
      upcoming: pendingActions, // TODO: replace with real upcoming-deadline metric when backend supports it
      activeWorkstreams: 0, // TODO: wire real workstream count if/when available from API
      hours: 0, // TODO: replace with real hours from time-tracking API
      completed,
    };
  }, [actionItems]);

  const statusPie = useMemo(
    () => [
      { name: 'Completed', value: actionItems.filter((t) => t.completed).length, color: '#10b981' },
      { name: 'In Progress', value: actionItems.filter((t) => !t.completed && t.status === 'in_progress').length, color: 'rgb(0, 51, 96)' },
      { name: 'Pending', value: actionItems.filter((t) => !t.completed && t.status === 'pending').length, color: '#f59e0b' },
      { name: 'Overdue', value: actionItems.filter((t) => !t.completed && t.status === 'overdue').length, color: '#ef4444' },
    ],
    [actionItems]
  );

  const weeklyCadence = useMemo(
    () => {
      const buckets: Record<string, number> = {
        Mon: 0,
        Tue: 0,
        Wed: 0,
        Thu: 0,
        Fri: 0,
        Sat: 0,
        Sun: 0,
      };

      actionItems.forEach((item) => {
        const day = item.dueDate.toLocaleDateString('en-US', { weekday: 'short' }) as keyof typeof buckets;
        if (buckets[day] !== undefined) {
          buckets[day] += 1;
        }
      });

      return Object.entries(buckets).map(([day, hours]) => ({ day, hours }));
    },
    [actionItems]
  );

  const skillRadar = useMemo(
    () => {
      const areas = [
        'Analysis',
        'Client',
        'Research',
        'Slides',
        'Modeling',
      ];

      if (actionItems.length === 0) {
        return areas.map((area) => ({ area, score: 0 }));
      }

      const perArea = areas.map((area, idx) => {
        const share = (idx + 1) / areas.length;
        const completed = actionItems.filter((a) => a.completed).length;
        const total = actionItems.length || 1;
        const score = Math.round(50 + (completed / total) * 50 * share);
        return { area, score: Math.min(100, score) };
      });

      return perArea;
    },
    [actionItems]
  );

  const workstreamDeadlines = useMemo(() => {
    const byWorkstream = new Map<
      string,
      { earliestDue: Date; total: number; completed: number }
    >();

    actionItems.forEach((item) => {
      const key = item.workstream || 'General';
      const existing = byWorkstream.get(key);
      if (!existing) {
        byWorkstream.set(key, {
          earliestDue: item.dueDate,
          total: 1,
          completed: item.completed ? 1 : 0,
        });
      } else {
        if (item.dueDate < existing.earliestDue) {
          existing.earliestDue = item.dueDate;
        }
        existing.total += 1;
        if (item.completed) existing.completed += 1;
      }
    });

    const now = new Date();

    return Array.from(byWorkstream.entries()).map(([workstreamName, stats]) => {
      const msDiff = stats.earliestDue.getTime() - now.getTime();
      const daysRemaining = Math.floor(msDiff / (1000 * 60 * 60 * 24));
      const progress =
        stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

      return {
        id: workstreamName,
        workstreamName,
        description: `${stats.total} task${stats.total !== 1 ? 's' : ''} • ${
          stats.completed
        } completed`,
        daysRemaining,
        progress,
      };
    });
  }, [actionItems]);

  const scrollToRef = (ref: RefObject<HTMLElement | null>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const getDocumentIcon = (type: DocType['type']) => {
    const className = "w-8 h-8";
    switch (type) {
      case 'google_docs':
        return <FileText className={cn(className, "text-[rgb(0,51,96)]")} />;
      case 'google_sheets':
        return <FileSpreadsheet className={cn(className, "text-green-600")} />;
      case 'google_slides':
        return <Presentation className={cn(className, "text-yellow-600")} />;
      case 'pdf':
        return <File className={cn(className, "text-red-600")} />;
      default:
        return <File className={cn(className, "text-gray-600")} />;
    }
  };

  const getUrgencyColor = (daysRemaining: number) => {
    if (daysRemaining < 0) return 'danger';
    if (daysRemaining <= 2) return 'danger';
    if (daysRemaining <= 6) return 'warning';
    return 'success';
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3">
                <Image
                  src="/otcr-logo.png"
                  alt="OTCR Consulting"
                  width={120}
                  height={40}
                  className="h-10 w-auto"
                  priority
                />
                <span className="text-sm font-semibold text-[var(--primary)] hidden sm:inline">
                  {ROLE_FULL_LABELS.CONSULTANT}
                </span>
              </div>
              <AdminRoleSwitcher className="shrink-0" />
            </div>
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => notificationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="relative p-2 rounded-xl hover:bg-[var(--accent)]"
              >
                <Bell className="w-5 h-5" />
                {notifications.filter((n) => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-100 border border-red-500/50 text-red-800 text-xs rounded-full flex items-center justify-center font-bold">
                    {notifications.filter((n) => !n.read).length}
                  </span>
                )}
              </motion.button>
              <button
                onClick={() => signOut({ callbackUrl: '/sign-in' })}
                className="p-2 rounded-full bg-[var(--accent)] hover:bg-[var(--primary)]/20 transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
          <nav className="flex items-center gap-1 border-t border-[var(--border)] py-2 overflow-x-auto">
            {[
              { icon: LayoutDashboard, label: 'Overview', target: overviewRef, href: undefined as string | undefined },
              { icon: Bell, label: 'Notifications', target: notificationsRef, href: undefined },
              { icon: FileText, label: 'Workstream Documents', target: docsRef, href: undefined },
              { icon: Presentation, label: 'Initial slides', target: initialSlidesRef, href: undefined },
              { icon: Presentation, label: 'Final slides', target: finalSlidesRef, href: undefined },
              { icon: Activity, label: 'Engagement', target: engagementRef, href: undefined },
              { icon: Users, label: 'Teams', target: undefined, href: '/teams' as const },
            ].map((item, index) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-[var(--foreground)]/75 hover:bg-[var(--accent)] hover:text-[var(--foreground)] transition-colors whitespace-nowrap"
                >
                  <item.icon className="w-4 h-4 text-[var(--primary)]" />
                  <span>{item.label}</span>
                </Link>
              ) : (
                <motion.button
                  key={item.label}
                  initial={{ x: -12, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => scrollToRef(item.target!)}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-[var(--foreground)]/75 hover:bg-[var(--accent)] hover:text-[var(--foreground)] transition-colors whitespace-nowrap"
                >
                  <item.icon className="w-4 h-4 text-[var(--primary)]" />
                  <span>{item.label}</span>
                </motion.button>
              )
            )}
          </nav>
          </div>
        </header>

      <div className="flex-1 flex flex-col min-h-screen relative overflow-y-auto">
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 overflow-y-auto">
          <div ref={overviewRef} className="max-w-[1800px] mx-auto">
            <div className="grid grid-cols-12 gap-6">
              {/* Left Column - Action Items */}
              <div ref={tasksRef} className="col-span-12 lg:col-span-4">
                <Card className="shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Assignments</CardTitle>
                        <CardDescription>Tasks assigned to you</CardDescription>
                      </div>
                      <Badge variant="info" size="sm">{stats.pendingActions} open</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
                    {actionItems
                      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
                      .map((item) => {
                        const isOverdue = item.dueDate < new Date() && !item.completed;
                        return (
                          <motion.div key={item.id} whileHover={{ y: -2 }} className={cn(
                            'p-4 rounded-2xl border flex items-start gap-3',
                            isOverdue ? 'border-red-400/70 bg-red-50' : 'border-[var(--border)] bg-[var(--secondary)]/80'
                          )}>
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => toggleActionItem(item.id)}
                              className="mt-1 w-5 h-5 rounded border-gray-300 text-[rgb(0,51,96)] focus:ring-[rgb(0,51,96)]"
                            />
                            <div className="flex-1">
                              <h5 className={cn('font-semibold text-[var(--foreground)]', item.completed && 'line-through opacity-50')}>
                                {item.taskName}
                              </h5>
                              <p className="text-sm text-[var(--foreground)]/70 mt-1">{item.projectName} • {item.workstream}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant={isOverdue ? 'danger' : 'info'} size="sm">
                                  {item.dueDate.toLocaleDateString()}
                                </Badge>
                                {isOverdue && <Badge variant="danger" size="sm">Overdue</Badge>}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                  </CardContent>
                </Card>
              </div>

              {/* Right Side - Top Row */}
              <div className="col-span-12 lg:col-span-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Notifications (Consultant: task assignments, updates) */}
                  <div ref={notificationsRef}>
                    <Card className="shadow-lg h-full">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Bell className="w-5 h-5 text-[var(--primary)]" />
                              Notifications
                            </CardTitle>
                            <CardDescription>New task assignments and updates</CardDescription>
                          </div>
                          {notifications.filter((n) => !n.read).length > 0 && (
                            <Badge variant="info" size="sm">{notifications.filter((n) => !n.read).length} new</Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {notifications.length === 0 ? (
                          <div className="text-center py-8 text-[var(--foreground)]/60">
                            <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p>No notifications yet</p>
                          </div>
                        ) : (
                          <ul className="space-y-3 max-h-[400px] overflow-y-auto">
                            {notifications.map((n) => (
                              <li
                                key={n.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => { markNotificationRead(n.id); setNotifications(getNotificationsForUser(userEmail)); }}
                                onKeyDown={(e) => e.key === 'Enter' && (markNotificationRead(n.id), setNotifications(getNotificationsForUser(userEmail)))}
                                className={cn(
                                  'p-4 rounded-xl border transition-colors text-left cursor-pointer',
                                  n.read ? 'border-[var(--border)] bg-[var(--secondary)]/60' : 'border-[var(--primary)]/30 bg-[var(--primary)]/5'
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="p-2 rounded-lg bg-[var(--accent)] shrink-0">
                                    <ClipboardList className="w-4 h-4 text-[var(--primary)]" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="font-semibold text-[var(--foreground)]">{n.title}</h4>
                                      {!n.read && <span className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />}
                                      <span className="text-xs text-[var(--foreground)]/60 ml-auto">{formatNotificationTime(n.at)}</span>
                                    </div>
                                    <p className="text-sm text-[var(--foreground)]/80 mt-1">{n.message}</p>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Engagement status & timelines (Consultant: R) */}
                  <div ref={engagementRef}>
                    <Card className="shadow-lg h-full">
                      <CardHeader>
                        <CardTitle>Engagement status & timelines</CardTitle>
                        <CardDescription>Workstream deadlines and milestones</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4 max-h-[400px] overflow-y-auto">
                        {workstreamDeadlines.length === 0 ? (
                          <div className="p-6 text-center text-sm text-[var(--foreground)]/60 border border-dashed border-[var(--border)] rounded-xl">
                            No workstreams yet. Tasks will appear here grouped by workstream.
                          </div>
                        ) : (
                          workstreamDeadlines
                            .sort((a, b) => a.daysRemaining - b.daysRemaining)
                            .map((deadline) => (
                              <div key={deadline.id} className="p-3 rounded-xl border bg-[var(--secondary)]/80">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <h5 className="font-semibold">{deadline.workstreamName}</h5>
                                    <p className="text-xs text-[var(--foreground)]/70">{deadline.description}</p>
                                  </div>
                                  <Badge variant={getUrgencyColor(deadline.daysRemaining)} size="sm">
                                    {deadline.daysRemaining}d
                                  </Badge>
                                </div>
                                <div className="mt-3 space-y-1">
                                  <div className="flex justify-between text-xs text-[var(--foreground)]/60">
                                    <span>Progress</span>
                                    <span>{deadline.progress ?? 0}%</span>
                                  </div>
                                  <div className="h-2 bg-[var(--accent)] rounded-full overflow-hidden">
                                    <div className="h-full bg-[var(--primary)]" style={{ width: `${deadline.progress ?? 0}%` }} />
                                  </div>
                                </div>
                              </div>
                            ))
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </div>

            {/* Consultant: Workstream docs (released) R+C | Initial slides W(self) R(self) */}
            <div className="grid lg:grid-cols-2 gap-6 mt-6">
              <div ref={docsRef}>
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-[var(--primary)]" />
                      Workstream Documents
                    </CardTitle>
                    <CardDescription>View and comment on released workstream documents.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      {documentsFromApi.slice(0, 6).map((doc) => (
                        <div
                          key={doc.id}
                          className="p-3 rounded-lg bg-[var(--secondary)] hover:bg-[var(--accent)] border border-[var(--border)] transition-colors group"
                        >
                          <div className="flex items-start gap-3">
                            {getDocumentIcon(doc.type)}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[var(--foreground)] truncate">
                                {doc.name}
                              </p>
                              <p className="text-xs text-[var(--foreground)]/60 truncate">{doc.workstream}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View">
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Comment">
                                <MessageSquare className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div ref={initialSlidesRef}>
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Presentation className="w-5 h-5 text-[var(--primary)]" />
                      Initial slides
                    </CardTitle>
                    <CardDescription>Upload and view your inital slides.</CardDescription>
                    <div className="pt-2">
                      <Button size="sm" variant="outline">
                        <Upload className="w-4 h-4 mr-2" />
                        Upload
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-[var(--foreground)]/70">
                      <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-[var(--foreground)]/50">
                        No initial slides uploaded yet
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Final slides: Upload W(self), View R(self) */}
            <div ref={finalSlidesRef} className="mt-6">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Presentation className="w-5 h-5 text-[var(--primary)]" />
                    Final slides
                  </CardTitle>
                  <CardDescription>Upload and view your final slides.</CardDescription>
                  <div className="pt-2">
                    <Button size="sm" variant="outline">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-[var(--foreground)]/70">

                    <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-[var(--foreground)]/50">
                      No final slides uploaded yet
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

          </div>
        </main>
      </div>

    </div>
  );
}
