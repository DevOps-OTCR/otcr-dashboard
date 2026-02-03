'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Sparkles,
  ClipboardCheck,
  Clock,
  FileText,
  Users,
  TrendingUp,
  Upload,
  Calendar,
  CheckCircle2,
  Bell,
  Settings,
  Download,
  ArrowUpRight,
  Target,
  Activity,
  Wand2,
  LinkIcon,
  BookOpen,
  PlayCircle,
  Shield,
  Check,
  AlertTriangle,
  ArrowDownRight,
  Flame,
  CheckCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import {
  mockActionItems,
  mockAnnouncements,
  mockDocuments,
  mockExtensionRequests,
  mockWorkstreamDeadlines
} from '@/data/mockData';
import type { ActionItem, Document, ExtensionRequest, WorkstreamDeadline } from '@/types';
import { cn, formatDate, getDaysUntil } from '@/lib/utils';
import { authAPI } from '@/lib/api';

const COLORS = ['#7c3aed', '#2563eb', '#f97316', '#10b981', '#f43f5e', '#a855f7'];

function getUserRole(email: string): 'PM' | 'CONSULTANT' | 'ADMIN' {
  const pmEmails = ['lsharma2@illinois.edu', 'crawat2@illinois.edu'];
  const adminEmails = ['admin@otcr.com'];

  if (adminEmails.includes(email)) return 'ADMIN';
  if (pmEmails.includes(email)) return 'PM';
  return 'CONSULTANT';
}

type TaskFilter = 'all' | 'pending' | 'in_progress' | 'overdue' | 'completed';
type HoursDay = { name: string; hours: number };

const statusBadge: Record<ActionItem['status'] | 'all', { label: string; variant: Parameters<typeof Badge>[0]['variant'] }> = {
  all: { label: 'All Work', variant: 'default' },
  pending: { label: 'Pending', variant: 'warning' },
  in_progress: { label: 'In Progress', variant: 'info' },
  overdue: { label: 'Overdue', variant: 'danger' },
  completed: { label: 'Completed', variant: 'success' },
};

const chartPalette = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
const statGradients = [
  'from-indigo-600/90 via-purple-500/80 to-pink-500/70',
  'from-emerald-500/90 via-teal-500/80 to-cyan-500/70',
  'from-amber-500/90 via-orange-500/80 to-yellow-400/70',
  'from-blue-600/90 via-sky-500/80 to-cyan-400/70',
  'from-rose-500/90 via-red-500/80 to-orange-500/70',
  'from-purple-600/90 via-fuchsia-500/80 to-pink-500/70',
];

const workstreamStatusGradients: Record<string, string> = {
  on_track: 'from-emerald-500 to-green-500',
  at_risk: 'from-amber-500 to-orange-500',
  overdue: 'from-rose-500 to-red-500',
};
const statusColorMap: Record<string, string> = {
  on_track: '#10b981',
  at_risk: '#f59e0b',
  overdue: '#ef4444',
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [role, setRole] = useState<'PM' | 'CONSULTANT' | 'ADMIN'>('CONSULTANT');

  const [actionItems, setActionItems] = useState<ActionItem[]>(mockActionItems);
  const [workstreams, setWorkstreams] = useState<WorkstreamDeadline[]>(mockWorkstreamDeadlines);
  const [extensionRequests, setExtensionRequests] = useState<ExtensionRequest[]>(mockExtensionRequests);
  const [documents, setDocuments] = useState<Document[]>(mockDocuments);
  const [activityData, setActivityData] = useState<HoursDay[]>([
    { name: 'Mon', hours: 6 },
    { name: 'Tue', hours: 7 },
    { name: 'Wed', hours: 5 },
    { name: 'Thu', hours: 8 },
    { name: 'Fri', hours: 6 },
    { name: 'Sat', hours: 3 },
    { name: 'Sun', hours: 4 },
  ]);

  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; tone: 'success' | 'warning' | 'info' } | null>(null);
  const [taskFormError, setTaskFormError] = useState('');
  const [extensionFormError, setExtensionFormError] = useState('');

  const [uploadForm, setUploadForm] = useState({
    name: '',
    workstream: mockWorkstreamDeadlines[0]?.workstreamName ?? '',
    type: 'pdf',
    note: '',
  });
  const [extensionForm, setExtensionForm] = useState({
    workstream: mockWorkstreamDeadlines[0]?.workstreamName ?? '',
    requestedDeadline: '',
    reason: '',
  });
  const [timeForm, setTimeForm] = useState({
    workstream: mockWorkstreamDeadlines[0]?.workstreamName ?? '',
    date: new Date().toISOString().split('T')[0],
    hours: 1,
    note: '',
  });
  const [taskForm, setTaskForm] = useState({
    taskName: '',
    dueDate: '',
    workstream: mockWorkstreamDeadlines[0]?.workstreamName ?? '',
    projectName: 'OTCR Client',
    description: '',
  });

  const overviewRef = useRef<HTMLDivElement>(null);
  const tasksRef = useRef<HTMLDivElement>(null);
  const docsRef = useRef<HTMLDivElement>(null);
  const projectsRef = useRef<HTMLDivElement>(null);
  const extensionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Email check is already handled in sign-in page
    // Just set role and redirect based on role
    if (session?.user?.email) {
      const email = session.user.email;
      const userRole = getUserRole(email);
      setRole(userRole);

      // Redirect to role-specific dashboard
      if (userRole === 'PM') {
        window.location.href = '/pm';
      } else if (userRole === 'CONSULTANT') {
        window.location.href = '/consultant';
      }
      // ADMIN stays on main dashboard
    }
  }, [session]);

  useEffect(() => {
    setChartsReady(true);
  }, []);

  useEffect(() => {
    if (!actionFeedback) return;
    const timer = setTimeout(() => setActionFeedback(null), 2400);
    return () => clearTimeout(timer);
  }, [actionFeedback]);

  const dashboardStats = useMemo(
    () => ({
      pendingActionItems: actionItems.filter((item) => !item.completed).length,
      upcomingDeadlines: actionItems.filter((item) => !item.completed && getDaysUntil(item.dueDate) <= 5).length,
      activeWorkstreams: workstreams.length,
      hoursThisWeek: activityData.reduce((sum, day) => sum + day.hours, 0),
      documents: documents.length,
      completed: actionItems.filter((item) => item.completed).length,
    }),
    [actionItems, workstreams.length, activityData, documents.length]
  );

  const statusDistribution = useMemo(() => {
    const distribution = { completed: 0, in_progress: 0, pending: 0, overdue: 0 } as Record<ActionItem['status'], number>;
    actionItems.forEach((item) => {
      distribution[item.status] = (distribution[item.status] || 0) + 1;
    });
    return distribution;
  }, [actionItems]);

  const pendingExtensions = useMemo(() => extensionRequests.filter((req) => req.status === 'pending').length, [extensionRequests]);

  const taskDistributionData = useMemo(
    () => [
      { name: 'Completed', value: statusDistribution.completed, color: chartPalette[4] },
      { name: 'In Progress', value: statusDistribution.in_progress, color: chartPalette[5] },
      { name: 'Pending', value: statusDistribution.pending, color: chartPalette[3] },
      { name: 'Overdue', value: statusDistribution.overdue, color: chartPalette[2] },
    ],
    [statusDistribution]
  );

  const weeklyProgressData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const totalHours = activityData.reduce((sum, entry) => sum + entry.hours, 0) || 1;

    return days.map((day, index) => {
      const hours = activityData[index]?.hours ?? Math.max(2, 8 - index);
      const ratio = hours / totalHours;
      const assigned = Math.max(3, Math.round(ratio * Math.max(actionItems.length + 4, 8)) + index);
      const completed = Math.min(
        assigned,
        Math.max(1, Math.round(ratio * Math.max(dashboardStats.completed + 3, 5)))
      );
      return { day, assigned, completed };
    });
  }, [activityData, actionItems.length, dashboardStats.completed, dashboardStats.hoursThisWeek]);

  const teamMetrics = useMemo(
    () => [
      { metric: 'Completion', You: 92, PM: 88, Analyst: 79 },
      { metric: 'Efficiency', You: 86, PM: 82, Analyst: 74 },
      { metric: 'Quality', You: 94, PM: 89, Analyst: 82 },
    ],
    []
  );

  const workstreamBarData = useMemo(
    () =>
      workstreams.map((workstream, index) => ({
        name: workstream.workstreamName,
        value: workstream.progress ?? Math.min(95, 45 + index * 10),
        status: workstream.status,
        daysRemaining: workstream.daysRemaining,
        color: statusColorMap[workstream.status] || COLORS[index % COLORS.length],
      })),
    [workstreams]
  );

  const filteredActionItems = useMemo(() => {
    return actionItems
      .filter((item) => {
        if (taskFilter !== 'all' && item.status !== taskFilter) return false;
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          return (
            item.taskName.toLowerCase().includes(term) ||
            item.projectName.toLowerCase().includes(term) ||
            item.workstream.toLowerCase().includes(term)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [actionItems, taskFilter, searchTerm]);

  const timelineItems = useMemo(() => {
    return [...actionItems]
      .filter((item) => !item.completed)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 4);
  }, [actionItems]);

  const scrollToRef = (ref: RefObject<HTMLDivElement | null>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const sideNavItems = [
    { label: 'Overview', icon: LayoutDashboard, ref: overviewRef },
    { label: 'Tasks', icon: ClipboardCheck, ref: tasksRef },
    { label: 'Workstreams', icon: Target, ref: projectsRef },
    { label: 'Documents', icon: FileText, ref: docsRef },
    { label: 'Extensions', icon: Calendar, ref: extensionsRef },
  ];

  const handleMarkComplete = (id: string) => {
    setActionItems((prev) => prev.map((item) => (item.id === id ? { ...item, completed: true, status: 'completed' } : item)));
    setActionFeedback({ message: 'Task marked as completed', tone: 'success' });
  };

  const handleStartTask = (id: string) => {
    setActionItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'in_progress' } : item)));
    setActionFeedback({ message: 'Task moved to in progress', tone: 'info' });
  };

  const handleUploadSubmit = () => {
    if (!uploadForm.name.trim()) return;

    const newDoc: Document = {
      id: Date.now().toString(),
      name: uploadForm.name.trim(),
      type: uploadForm.type as Document['type'],
      url: '#',
      workstream: uploadForm.workstream || 'General',
      uploadedBy: session?.user?.name || session?.user?.email?.split('@')[0] || 'You',
      uploadedAt: new Date(),
      lastModified: new Date(),
    };

    setDocuments((prev) => [newDoc, ...prev]);
    setUploadForm({
      name: '',
      workstream: workstreams[0]?.workstreamName ?? '',
      type: 'pdf',
      note: '',
    });
    setUploadModalOpen(false);
    setActionFeedback({ message: 'Document uploaded', tone: 'success' });
  };

  const handleRequestExtension = () => {
    if (!extensionForm.workstream || !extensionForm.requestedDeadline) {
      setExtensionFormError('Please pick a workstream and a new date.');
      return;
    }
    setExtensionFormError('');
    const requestedDate = new Date(extensionForm.requestedDeadline);

    const request: ExtensionRequest = {
      id: Date.now().toString(),
      workstream: extensionForm.workstream,
      originalDeadline: workstreams.find((w) => w.workstreamName === extensionForm.workstream)?.deadline ?? new Date(),
      requestedDeadline: requestedDate,
      reason: extensionForm.reason || 'Requesting buffer for quality.',
      status: 'pending',
      requestedBy: session?.user?.name || 'You',
      requestedAt: new Date(),
    };

    setExtensionRequests((prev) => [request, ...prev]);
    setExtensionForm({ workstream: workstreams[0]?.workstreamName ?? '', requestedDeadline: '', reason: '' });
    setExtensionModalOpen(false);
    setActionFeedback({ message: 'Extension request submitted', tone: 'info' });
  };

  const handleReviewExtension = (id: string, status: 'approved' | 'denied') => {
    setExtensionRequests((prev) => {
      const request = prev.find((r) => r.id === id);
      if (request && status === 'approved') {
        setWorkstreams((ws) =>
          ws.map((workstream) =>
            workstream.workstreamName === request.workstream
              ? {
                  ...workstream,
                  deadline: request.requestedDeadline,
                  daysRemaining: getDaysUntil(request.requestedDeadline),
                }
              : workstream
          )
        );
      }

      return prev.map((req) =>
        req.id === id
          ? {
              ...req,
              status,
              reviewedBy: session?.user?.name || 'Project Manager',
              reviewedAt: new Date(),
              reviewNotes: status === 'approved' ? 'Approved and updated timeline' : 'Keep existing deadline',
            }
              : req
      );
    });
    setActionFeedback({
      message: status === 'approved' ? 'Extension approved and timeline updated' : 'Extension denied, keeping deadline',
      tone: status === 'approved' ? 'success' : 'warning',
    });
  };

  const handleLogTime = () => {
    if (!timeForm.date) return;
    const dayLabel = new Date(timeForm.date).toLocaleDateString('en-US', { weekday: 'short' });

    setActivityData((prev) => {
      const exists = prev.find((entry) => entry.name === dayLabel);
      if (exists) {
        return prev.map((entry) =>
          entry.name === dayLabel ? { ...entry, hours: entry.hours + Number(timeForm.hours || 0) } : entry
        );
      }
      return [...prev, { name: dayLabel, hours: Number(timeForm.hours || 0) }];
    });

    setTimeForm({ workstream: workstreams[0]?.workstreamName ?? '', date: new Date().toISOString().split('T')[0], hours: 1, note: '' });
    setTimeModalOpen(false);
    setActionFeedback({ message: 'Hours logged', tone: 'success' });
  };

  const handleCreateTask = () => {
    if (!taskForm.taskName || !taskForm.dueDate || !taskForm.workstream) {
      setTaskFormError('Task name, due date, and workstream are required.');
      return;
    }
    setTaskFormError('');

    const newTask: ActionItem = {
      id: Date.now().toString(),
      taskName: taskForm.taskName,
      dueDate: new Date(taskForm.dueDate),
      projectName: taskForm.projectName || 'OTCR Project',
      workstream: taskForm.workstream || 'General',
      status: 'pending',
      assignedTo: session?.user?.name || 'current_user',
      description: taskForm.description || 'Created from dashboard',
      completed: false,
    };

    setActionItems((prev) => [newTask, ...prev]);
    setTaskForm({
      taskName: '',
      dueDate: '',
      workstream: workstreams[0]?.workstreamName ?? '',
      projectName: 'OTCR Client',
      description: '',
    });
    setTaskModalOpen(false);
    setActionFeedback({ message: 'Task created and queued', tone: 'success' });
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3"
        >
          <Activity className="w-10 h-10 text-[var(--primary)] animate-pulse" />
          <div className="text-sm font-medium text-[var(--foreground)]/70">Preparing your dashboard</div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)]">
      <AnimatePresence>
        {actionFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            className={cn(
              'fixed bottom-6 right-6 z-50 rounded-2xl px-4 py-3 shadow-2xl text-white border border-white/20 backdrop-blur',
              actionFeedback.tone === 'success'
                ? 'bg-gradient-to-r from-emerald-500/90 to-green-500/90'
                : actionFeedback.tone === 'warning'
                ? 'bg-gradient-to-r from-amber-500/90 to-orange-500/90'
                : 'bg-gradient-to-r from-indigo-500/90 to-purple-500/90'
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              {actionFeedback.tone === 'success' && <CheckCircle className="w-4 h-4" />}
              {actionFeedback.tone === 'warning' && <AlertTriangle className="w-4 h-4" />}
              {actionFeedback.tone === 'info' && <Sparkles className="w-4 h-4" />}
              <span>{actionFeedback.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[var(--primary)] text-white shadow-sm">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--foreground)]/60">Operational dashboard</p>
                <h1 className="text-xl font-semibold text-[var(--foreground)]">OTCR Control Room</h1>
              </div>
              <Badge variant="purple" size="sm" className="ml-2 flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                Live
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="info" size="sm" className="hidden sm:inline-flex uppercase">{role}</Badge>
              <div className="hidden sm:flex items-center gap-2">
                <button className="p-2 hover:bg-[var(--accent)] rounded-lg transition-colors relative">
                  <Bell className="w-5 h-5" />
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-500 animate-bounce" />
                </button>
                <button className="p-2 hover:bg-[var(--accent)] rounded-lg transition-colors">
                  <Settings className="w-5 h-5" />
                </button>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/sign-in' })}
                className="p-2 hover:bg-[var(--accent)] rounded-lg transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={() => signOut({ callbackUrl: '/sign-in' })}
                className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors px-3 py-2 rounded-md hover:bg-gray-100"
              >
                Sign Out
              </button>
            </div>
          </div>
          <nav className="flex items-center gap-1 border-t border-[var(--border)] py-2 overflow-x-auto">
            {sideNavItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => scrollToRef(item.ref)}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-[var(--foreground)]/75 hover:bg-[var(--accent)] hover:text-[var(--foreground)] transition-colors whitespace-nowrap"
              >
                <item.icon className="w-4 h-4 text-[var(--primary)]" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
          <div
            ref={overviewRef}
            className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16 space-y-8"
          >
            {/* Stat Boxes */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="shadow-lg border-[var(--border)] bg-[var(--card)]">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-[var(--foreground)]/70">Pending</p>
                    <Badge variant="warning" size="sm">{dashboardStats.pendingActionItems}</Badge>
                  </div>
                  <p className="text-3xl font-bold text-[var(--foreground)]">{dashboardStats.pendingActionItems}</p>
                  <p className="text-xs text-[var(--foreground)]/60 mt-1">Tasks awaiting action</p>
                </CardContent>
              </Card>

              <Card className="shadow-lg border-[var(--border)] bg-[var(--card)]">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-[var(--foreground)]/70">Completed</p>
                    <Badge variant="success" size="sm">{dashboardStats.completed}</Badge>
                  </div>
                  <p className="text-3xl font-bold text-[var(--foreground)]">{dashboardStats.completed}</p>
                  <p className="text-xs text-[var(--foreground)]/60 mt-1">Tasks finished</p>
                </CardContent>
              </Card>

              <Card className="shadow-lg border-[var(--border)] bg-[var(--card)]">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-[var(--foreground)]/70">Deadlines</p>
                    <Badge variant="danger" size="sm">{dashboardStats.upcomingDeadlines}</Badge>
                  </div>
                  <p className="text-3xl font-bold text-[var(--foreground)]">{dashboardStats.upcomingDeadlines}</p>
                  <p className="text-xs text-[var(--foreground)]/60 mt-1">Due within 5 days</p>
                </CardContent>
              </Card>

              <Card className="shadow-lg border-[var(--border)] bg-[var(--card)]">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-[var(--foreground)]/70">Workstreams</p>
                    <Badge variant="info" size="sm">{dashboardStats.activeWorkstreams}</Badge>
                  </div>
                  <p className="text-3xl font-bold text-[var(--foreground)]">{dashboardStats.activeWorkstreams}</p>
                  <p className="text-xs text-[var(--foreground)]/60 mt-1">Active projects</p>
                </CardContent>
              </Card>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2 rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-sm p-8"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-wide text-[var(--foreground)]/60">
                  Welcome back{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}
                </p>
                <h2 className="text-3xl sm:text-4xl font-semibold leading-tight text-[var(--foreground)]">
                  Central view of your client work
                </h2>
                <p className="text-sm text-[var(--foreground)]/70 max-w-2xl">
                  Monitor workstreams, deadlines, and deliverables in one place. Use the quick actions below to update
                  what you are working on without leaving this page.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary" size="md" onClick={() => setTaskModalOpen(true)}>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Plan new task
                  </Button>
                  <Button
                    variant="outline"
                    size="md"
                    className="border-[var(--border)] text-[var(--primary)]"
                    onClick={() => scrollToRef(projectsRef)}
                  >
                    <Target className="w-4 h-4 mr-2" />
                    View workstreams
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    className="text-[var(--primary)]"
                    onClick={() => scrollToRef(docsRef)}
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    Documents
                  </Button>
                </div>
              </div>
              <div className="w-full md:w-72 rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-[var(--foreground)]/70">This week</span>
                  <Badge
                    variant="success"
                    size="sm"
                    className="bg-emerald-50 text-emerald-700"
                  >
                    On track
                  </Badge>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[var(--foreground)]/60">Hours logged</p>
                      <p className="text-2xl font-semibold text-[var(--foreground)]">
                        {dashboardStats.hoursThisWeek}h
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-[var(--card)] border border-[var(--border)]">
                      <TrendingUp className="w-4 h-4 text-[var(--primary)]" />
                      <span className="font-medium text-[var(--foreground)]/80">+8% vs last week</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[var(--foreground)]/60">Active streams</p>
                      <p className="text-xl font-semibold text-[var(--foreground)]">
                        {dashboardStats.activeWorkstreams}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[var(--foreground)]/60">Due soon</p>
                      <p className="text-xl font-semibold text-[var(--foreground)]">
                        {dashboardStats.upcomingDeadlines}
                      </p>
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--accent)] overflow-hidden">
                    <div
                      className="h-2 bg-[var(--primary)] rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          (dashboardStats.completed / Math.max(actionItems.length, 1)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--foreground)]/70">
                    <Shield className="w-4 h-4 text-[var(--primary)]" />
                    <span>All critical milestones have owners</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            {[{
              label: 'Action items',
              value: dashboardStats.pendingActionItems,
              icon: ClipboardCheck,
              delta: '+12% vs last week',
            }, {
              label: 'Deadlines due',
              value: dashboardStats.upcomingDeadlines,
              icon: Clock,
              delta: 'Urgent',
            }, {
              label: 'Deliverables',
              value: documents.length,
              icon: FileText,
              delta: 'Docs ready',
            }, {
              label: 'Teammates live',
              value: role === 'PM' ? '24' : '6',
              icon: Users,
              delta: 'Online',
            }].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  'relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm'
                )}
              >
                <div className="relative p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-xl bg-[var(--accent)]">
                      <stat.icon className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <Badge variant="default" size="sm">
                      {stat.delta}
                    </Badge>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-[var(--foreground)]/60 uppercase tracking-wide">
                        {stat.label}
                      </p>
                      <p className="text-2xl font-semibold text-[var(--foreground)]">{stat.value}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-[var(--secondary)] text-[var(--foreground)]/70">
                      <ArrowUpRight className="w-4 h-4 text-[var(--primary)]" />
                      Status
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
            </section>

            <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {[{
            label: 'Upload deliverable',
            icon: Upload,
            onClick: () => setUploadModalOpen(true),
          }, {
            label: 'Request extension',
            icon: Calendar,
            onClick: () => setExtensionModalOpen(true),
          }, {
            label: 'Log time',
            icon: Clock,
            onClick: () => setTimeModalOpen(true),
          }, {
            label: 'New task',
            icon: CheckCircle2,
            onClick: () => setTaskModalOpen(true),
          }, {
            label: 'View documents',
            icon: Download,
            onClick: () => scrollToRef(docsRef),
          }].map((action) => (
            <motion.button
              key={action.label}
              onClick={action.onClick}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'p-4 rounded-2xl bg-[var(--card)] text-[var(--foreground)] shadow-sm flex flex-col items-start gap-3 h-full border border-[var(--border)] hover:border-[var(--primary)]/60'
              )}
            >
              <div className="p-2 rounded-lg bg-[var(--accent)]">
                <action.icon className="w-5 h-5 text-[var(--primary)]" />
              </div>
              <span className="font-semibold text-sm text-left">{action.label}</span>
              <span className="text-xs text-[var(--foreground)]/60">
                Updates dashboard metrics immediately
              </span>
            </motion.button>
          ))}
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="shadow-lg border-[var(--border)] bg-[var(--card)]/90">
            <CardHeader className="flex items-start justify-between">
              <div>
                <CardTitle>Weekly progress</CardTitle>
                <CardDescription>Completed vs assigned tasks with dual gradients.</CardDescription>
              </div>
              <Badge variant="success" size="sm">Live</Badge>
            </CardHeader>
            <CardContent>
              {chartsReady ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={weeklyProgressData}>
                    <defs>
                      <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorAssigned" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" stroke="var(--foreground)" opacity={0.7} />
                    <YAxis stroke="var(--foreground)" opacity={0.7} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                      }}
                    />
                    <Area type="monotone" dataKey="assigned" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorAssigned)" />
                    <Area type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorCompleted)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] rounded-xl bg-[var(--secondary)] animate-pulse" />
              )}
              <div className="flex items-center gap-4 text-sm text-[var(--foreground)]/70 mt-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500" />
                  Completed
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-indigo-500" />
                  Assigned
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-[var(--border)] bg-[var(--card)]/90">
            <CardHeader className="flex items-start justify-between">
              <div>
                <CardTitle>Team radar</CardTitle>
                <CardDescription>Completion, efficiency, and quality metrics.</CardDescription>
              </div>
              <Badge variant="purple" size="sm">PM view</Badge>
            </CardHeader>
            <CardContent>
              {chartsReady ? (
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={teamMetrics}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="metric" stroke="var(--foreground)" />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="var(--foreground)" />
                    <Radar name="You" dataKey="You" stroke={chartPalette[0]} fill={chartPalette[0]} fillOpacity={0.45} />
                    <Radar name="PM" dataKey="PM" stroke={chartPalette[1]} fill={chartPalette[1]} fillOpacity={0.35} />
                    <Radar name="Analyst" dataKey="Analyst" stroke={chartPalette[4]} fill={chartPalette[4]} fillOpacity={0.3} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] rounded-xl bg-[var(--secondary)] animate-pulse" />
              )}
              <div className="flex items-center gap-4 text-sm text-[var(--foreground)]/70 mt-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-indigo-500" />
                  You
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-purple-500" />
                  PM
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500" />
                  Analyst
                </div>
              </div>
            </CardContent>
          </Card>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-3 gap-6" ref={tasksRef}>
          <div className="xl:col-span-2 space-y-6">
            <Card className="border-[var(--border)] bg-[var(--card)]/90 shadow-lg">
              <CardHeader className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl">Action center</CardTitle>
                    <CardDescription>
                      Track, filter, and move your tasks forward. {statusDistribution.overdue} overdue •{' '}
                      {statusDistribution.in_progress} in progress.
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setTaskModalOpen(true)}>
                    <PlusIcon />
                    Add task
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {(Object.keys(statusBadge) as TaskFilter[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTaskFilter(filter)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-sm border transition-all flex items-center gap-2',
                        taskFilter === filter
                          ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                          : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                      )}
                    >
                      <Badge variant={statusBadge[filter].variant} size="sm">{statusBadge[filter].label}</Badge>
                    </button>
                  ))}
                  <div className="flex-1 min-w-[180px]" />
                  <div className="flex items-center gap-2 bg-[var(--secondary)] rounded-full px-3 py-2 border border-[var(--border)]">
                    <LinkIcon className="w-4 h-4 text-[var(--foreground)]/60" />
                    <input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search tasks or projects"
                      className="bg-transparent focus:outline-none text-sm w-full"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {filteredActionItems.length === 0 && (
                  <div className="p-6 rounded-2xl border border-dashed border-[var(--border)] text-center text-sm text-[var(--foreground)]/70">
                    No items match this view. Create a task or clear filters.
                  </div>
                )}

                {filteredActionItems.map((item) => {
                  const daysLeft = getDaysUntil(item.dueDate);
                  return (
                    <motion.div
                      key={item.id}
                      className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/60 hover:border-[var(--primary)]/50 transition-all"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ y: -2 }}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <Badge variant={statusBadge[item.status].variant} size="sm">
                              {statusBadge[item.status].label}
                            </Badge>
                            <span className="text-xs text-[var(--foreground)]/60">{item.projectName}</span>
                          </div>
                          <h3 className="text-lg font-semibold">{item.taskName}</h3>
                          <p className="text-sm text-[var(--foreground)]/70">{item.description || 'No description provided.'}</p>
                          <div className="flex flex-wrap gap-3 text-xs text-[var(--foreground)]/70">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              Due {formatDate(item.dueDate)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Target className="w-4 h-4" />
                              {item.workstream}
                            </span>
                            <span className={cn('px-2 py-1 rounded-full text-xs font-semibold',
                              daysLeft <= 1
                                ? 'bg-red-100 text-red-800'
                                : daysLeft <= 4
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-emerald-100 text-emerald-800'
                            )}>
                              {daysLeft <= 0 ? 'Due today' : `${daysLeft}d left`}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleStartTask(item.id)} disabled={item.status === 'completed'}>
                            <PlayCircle className="w-4 h-4 mr-1" />
                            Start
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setExtensionModalOpen(true)}>
                            <Calendar className="w-4 h-4 mr-1" />
                            Extend
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => handleMarkComplete(item.id)} disabled={item.completed}>
                            <Check className="w-4 h-4 mr-1" />
                            Mark done
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </CardContent>
            </Card>

            <div ref={projectsRef}>
              <Card className="shadow-lg">
                <CardHeader className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Workstream radar</CardTitle>
                      <CardDescription>Progress, risk, and remaining days.</CardDescription>
                    </div>
                    <Badge variant="info" size="sm">{workstreams.length} active</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={workstreamBarData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" stroke="var(--foreground)" opacity={0.7} />
                      <YAxis stroke="var(--foreground)" opacity={0.7} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: '12px',
                        }}
                      />
                      <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                        {workstreamBarData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    {workstreams.map((stream, index) => (
                      <div key={stream.id} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold">{stream.workstreamName}</p>
                            <p className="text-xs text-[var(--foreground)]/60">{stream.description}</p>
                          </div>
                          <Badge
                            variant={
                              stream.status === 'on_track'
                                ? 'success'
                                : stream.status === 'at_risk'
                                ? 'warning'
                                : 'danger'
                            }
                            size="sm"
                          >
                            {stream.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-xs text-[var(--foreground)]/70">
                            <span>Progress</span>
                            <span>{stream.progress ?? 0}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-[var(--accent)] overflow-hidden">
                            <div
                              className={cn(
                                'h-2 rounded-full bg-gradient-to-r transition-all',
                                workstreamStatusGradients[stream.status] ?? 'from-indigo-500 to-purple-500'
                              )}
                              style={{ width: `${stream.progress ?? 0}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-[var(--foreground)]/60">
                            <span>Days remaining</span>
                            <span className={cn(
                              'px-2 py-1 rounded-full text-[10px] font-semibold',
                              stream.daysRemaining <= 2
                                ? 'bg-red-100 text-red-700'
                                : stream.daysRemaining <= 5
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            )}>
                              {stream.daysRemaining} days
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-6">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Timeline</CardTitle>
                    <CardDescription>Next deadlines in order.</CardDescription>
                  </div>
                  <Badge variant="warning" size="sm">{timelineItems.length} due</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {timelineItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60">
                    <div className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center text-white font-semibold',
                      getDaysUntil(item.dueDate) <= 1
                        ? 'bg-red-500'
                        : getDaysUntil(item.dueDate) <= 4
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    )}>
                      {getDaysUntil(item.dueDate)}d
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{item.taskName}</p>
                      <p className="text-xs text-[var(--foreground)]/60">{item.projectName}</p>
                    </div>
                    {getDaysUntil(item.dueDate) <= 2 && <Flame className="w-4 h-4 text-amber-500" />}
                    <Button size="sm" variant="ghost" onClick={() => scrollToRef(tasksRef)}>
                      Details
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div ref={docsRef}>
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Documents</CardTitle>
                      <CardDescription>Everything you uploaded is available below.</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setUploadModalOpen(true)}>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {documents.slice(0, 5).map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60">
                      <div>
                        <p className="font-semibold">{doc.name}</p>
                        <p className="text-xs text-[var(--foreground)]/60">
                          {doc.workstream} • Updated {formatDate(doc.lastModified)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="purple" size="sm">{doc.type}</Badge>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] transition-colors text-sm"
                        >
                          <Download className="w-4 h-4" />
                          Open
                        </a>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div ref={extensionsRef}>
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Extension requests</CardTitle>
                      <CardDescription>Approve or decline in one click.</CardDescription>
                    </div>
                    <Badge variant="warning" size="sm">
                      {pendingExtensions} pending
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {extensionRequests.map((req) => (
                    <motion.div
                      key={req.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        'p-3 rounded-2xl border bg-[var(--secondary)]/60 backdrop-blur transition-all',
                        req.status === 'pending'
                          ? 'border-amber-400/60 shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_10px_30px_-12px_rgba(251,191,36,0.4)]'
                          : 'border-[var(--border)]'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold flex items-center gap-2">
                            {req.workstream}
                            {req.status === 'pending' && <Sparkles className="w-4 h-4 text-amber-500" />}
                          </p>
                          <p className="text-xs text-[var(--foreground)]/60">Requested by {req.requestedBy}</p>
                        </div>
                        <Badge
                          variant={
                            req.status === 'approved'
                              ? 'success'
                              : req.status === 'pending'
                              ? 'warning'
                              : 'danger'
                          }
                          size="sm"
                        >
                          {req.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-[var(--foreground)]/70 mt-2">{req.reason}</p>
                      <div className="flex items-center justify-between text-xs text-[var(--foreground)]/60 mt-3 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 rounded-full bg-[var(--accent)] text-[var(--foreground)] text-[11px]">
                            Current: {formatDate(req.originalDeadline)}
                          </span>
                          <span className="px-2 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-300/40 text-[11px]">
                            Requested: {formatDate(req.requestedDeadline)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {role !== 'CONSULTANT' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="border border-emerald-400/60 bg-emerald-500/10 hover:bg-emerald-500/20"
                                onClick={() => handleReviewExtension(req.id, 'approved')}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="border border-rose-400/60 bg-rose-500/10 hover:bg-rose-500/20"
                                onClick={() => handleReviewExtension(req.id, 'denied')}
                              >
                                Deny
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Team broadcast</CardTitle>
                    <CardDescription>Announcements that went live today.</CardDescription>
                  </div>
                  <Badge variant="success" size="sm">Auto-sync</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {mockAnnouncements.slice(0, 3).map((announcement) => (
                  <div key={announcement.id} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{announcement.title}</p>
                      <Badge variant={announcement.priority === 'urgent' ? 'danger' : 'info'} size="sm">
                        {announcement.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-[var(--foreground)]/70 mt-1">{announcement.message}</p>
                    <p className="text-xs text-[var(--foreground)]/60 mt-2">From {announcement.author}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
            </section>
          </div>
        </main>

      <Modal isOpen={uploadModalOpen} onClose={() => setUploadModalOpen(false)} title="Upload deliverable" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold">Document name</label>
            <input
              value={uploadForm.name}
              onChange={(e) => setUploadForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              placeholder="Competitive analysis draft"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold">Workstream</label>
              <select
                value={uploadForm.workstream}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, workstream: e.target.value }))}
                className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              >
                {workstreams.map((stream) => (
                  <option key={stream.id} value={stream.workstreamName}>
                    {stream.workstreamName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold">File type</label>
              <select
                value={uploadForm.type}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, type: e.target.value }))}
                className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              >
                <option value="pdf">PDF</option>
                <option value="google_docs">Google Doc</option>
                <option value="google_sheets">Google Sheet</option>
                <option value="google_slides">Slides</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold">Notes (optional)</label>
            <textarea
              value={uploadForm.note}
              onChange={(e) => setUploadForm((prev) => ({ ...prev, note: e.target.value }))}
              className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              rows={3}
              placeholder="Add reviewer instructions or links"
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setUploadModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUploadSubmit}>
              <Upload className="w-4 h-4 mr-2" />
              Save to documents
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={extensionModalOpen}
        onClose={() => {
          setExtensionModalOpen(false);
          setExtensionFormError('');
        }}
        title="Request extension"
        size="lg"
      >
        <div className="space-y-4">
          {extensionFormError && (
            <div className="flex items-center gap-2 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/40 px-3 py-2 rounded-xl">
              <AlertTriangle className="w-4 h-4" />
              {extensionFormError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold">Workstream</label>
              <select
                value={extensionForm.workstream}
                onChange={(e) => setExtensionForm((prev) => ({ ...prev, workstream: e.target.value }))}
                className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              >
                {workstreams.map((stream) => (
                  <option key={stream.id} value={stream.workstreamName}>
                    {stream.workstreamName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold">Requested deadline</label>
              <input
                type="date"
                value={extensionForm.requestedDeadline}
                onChange={(e) => setExtensionForm((prev) => ({ ...prev, requestedDeadline: e.target.value }))}
                className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold">Reason</label>
            <textarea
              value={extensionForm.reason}
              onChange={(e) => setExtensionForm((prev) => ({ ...prev, reason: e.target.value }))}
              className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              rows={3}
              placeholder="Explain the risk, blockers, or dependency"
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setExtensionModalOpen(false);
                setExtensionFormError('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleRequestExtension}>
              <Calendar className="w-4 h-4 mr-2" />
              Submit request
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={timeModalOpen} onClose={() => setTimeModalOpen(false)} title="Log time" size="md">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold">Workstream</label>
            <select
              value={timeForm.workstream}
              onChange={(e) => setTimeForm((prev) => ({ ...prev, workstream: e.target.value }))}
              className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
            >
              {workstreams.map((stream) => (
                <option key={stream.id} value={stream.workstreamName}>
                  {stream.workstreamName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold">Date</label>
              <input
                type="date"
                value={timeForm.date}
                onChange={(e) => setTimeForm((prev) => ({ ...prev, date: e.target.value }))}
                className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              />
            </div>
            <div>
              <label className="text-sm font-semibold">Hours</label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={timeForm.hours}
                onChange={(e) => setTimeForm((prev) => ({ ...prev, hours: Number(e.target.value) }))}
                className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold">Note</label>
            <textarea
              value={timeForm.note}
              onChange={(e) => setTimeForm((prev) => ({ ...prev, note: e.target.value }))}
              className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              rows={3}
              placeholder="What did you complete?"
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setTimeModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogTime}>
              <Clock className="w-4 h-4 mr-2" />
              Log hours
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={taskModalOpen}
        onClose={() => {
          setTaskModalOpen(false);
          setTaskFormError('');
        }}
        title="Create a new task"
        size="lg"
      >
        <div className="space-y-4">
          {taskFormError && (
            <div className="flex items-center gap-2 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/40 px-3 py-2 rounded-xl">
              <AlertTriangle className="w-4 h-4" />
              {taskFormError}
            </div>
          )}
          <div>
            <label className="text-sm font-semibold">Task name</label>
            <input
              value={taskForm.taskName}
              onChange={(e) => setTaskForm((prev) => ({ ...prev, taskName: e.target.value }))}
              className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              placeholder="Draft executive summary"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-semibold">Due date</label>
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              />
            </div>
            <div>
              <label className="text-sm font-semibold">Workstream</label>
              <select
                value={taskForm.workstream}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, workstream: e.target.value }))}
                className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              >
                {workstreams.map((stream) => (
                  <option key={stream.id} value={stream.workstreamName}>
                    {stream.workstreamName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold">Project</label>
              <input
                value={taskForm.projectName}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, projectName: e.target.value }))}
                className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold">Description</label>
            <textarea
              value={taskForm.description}
              onChange={(e) => setTaskForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              rows={3}
              placeholder="Add acceptance criteria, owners, or links"
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setTaskModalOpen(false);
                setTaskFormError('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateTask}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Create task
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PlusIcon() {
  return <span className="text-lg leading-none">+</span>;
}
