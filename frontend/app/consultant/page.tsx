'use client';

import { useUser, UserButton } from '@clerk/nextjs';
import { useState, useEffect, useMemo, useRef, type RefObject } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  FileText,
  Clock,
  Settings,
  Bell,
  AlertCircle,
  CheckCircle2,
  Calendar,
  TrendingUp,
  Upload,
  ChevronRight,
  FileSpreadsheet,
  Presentation,
  File,
  Plus,
  ExternalLink,
  Menu,
  Sun,
  Moon,
  Target,
  Activity,
  TrendingDown,
  BarChart3,
  Sparkles,
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
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import {
  mockAnnouncements,
  mockActionItems,
  mockWorkstreamDeadlines,
  mockExtensionRequests,
  mockDocuments,
  mockPreviousWeekSummary,
  mockDashboardStats,
} from '@/data/mockData';
import type { ActionItem, ExtensionRequest, Document as DocType } from '@/types';

export default function ConsultantDashboard() {
  const { user } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [previousWeekModalOpen, setPreviousWeekModalOpen] = useState(false);
  const [actionItems, setActionItems] = useState(mockActionItems);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [extensionRequests, setExtensionRequests] = useState(mockExtensionRequests);
  const [extensionForm, setExtensionForm] = useState({
    workstream: mockWorkstreamDeadlines[0]?.workstreamName ?? '',
    originalDeadline: '',
    requestedDeadline: '',
    reason: '',
  });
  const overviewRef = useRef<HTMLDivElement>(null);
  const tasksRef = useRef<HTMLDivElement>(null);
  const docsRef = useRef<HTMLDivElement>(null);
  const requestsRef = useRef<HTMLDivElement>(null);
  const analyticsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark';
    if (stored) {
      setTheme(stored);
      document.documentElement.classList.toggle('dark', stored === 'dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const toggleActionItem = (id: string) => {
    setActionItems(items =>
      items.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const stats = useMemo(() => {
    const pendingActions = actionItems.filter((a) => !a.completed).length;
    const upcoming = mockWorkstreamDeadlines.filter((d) => d.daysRemaining <= 7).length;
    const completed = actionItems.filter((a) => a.completed).length;
    return {
      pendingActions,
      upcoming,
      activeWorkstreams: mockWorkstreamDeadlines.length,
      hours: mockDashboardStats.hoursThisWeek,
      completed,
      extensions: extensionRequests.filter((req) => req.status === 'pending').length,
    };
  }, [actionItems, extensionRequests]);

  const statusPie = useMemo(
    () => [
      { name: 'Completed', value: actionItems.filter((t) => t.completed).length, color: '#10b981' },
      { name: 'In Progress', value: actionItems.filter((t) => !t.completed && t.status === 'in_progress').length, color: '#3b82f6' },
      { name: 'Pending', value: actionItems.filter((t) => !t.completed && t.status === 'pending').length, color: '#f59e0b' },
      { name: 'Overdue', value: actionItems.filter((t) => !t.completed && t.status === 'overdue').length, color: '#ef4444' },
    ],
    [actionItems]
  );

  const weeklyCadence = useMemo(
    () => [
      { day: 'Mon', hours: 6 },
      { day: 'Tue', hours: 7 },
      { day: 'Wed', hours: 5 },
      { day: 'Thu', hours: 8 },
      { day: 'Fri', hours: 6 },
      { day: 'Sat', hours: 3 },
      { day: 'Sun', hours: 4 },
    ],
    []
  );

  const skillRadar = useMemo(
    () => [
      { area: 'Analysis', score: 86 },
      { area: 'Client', score: 82 },
      { area: 'Research', score: 91 },
      { area: 'Slides', score: 88 },
      { area: 'Modeling', score: 80 },
    ],
    []
  );

  const scrollToRef = (ref: RefObject<HTMLElement | null>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setSidebarOpen(false);
    }
  };

  const getDocumentIcon = (type: DocType['type']) => {
    const className = "w-8 h-8";
    switch (type) {
      case 'google_docs':
        return <FileText className={cn(className, "text-blue-600")} />;
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

  const handleSubmitExtension = () => {
    if (!extensionForm.workstream || !extensionForm.requestedDeadline) return;
    const newRequest: ExtensionRequest = {
      id: Date.now().toString(),
      workstream: extensionForm.workstream,
      originalDeadline: extensionForm.originalDeadline ? new Date(extensionForm.originalDeadline) : new Date(),
      requestedDeadline: new Date(extensionForm.requestedDeadline),
      reason: extensionForm.reason || 'Requesting buffer for quality.',
      status: 'pending',
      requestedBy: user?.fullName || 'Consultant',
      requestedAt: new Date(),
    };
    setExtensionRequests((prev) => [newRequest, ...prev]);
    setExtensionForm({
      workstream: mockWorkstreamDeadlines[0]?.workstreamName ?? '',
      originalDeadline: '',
      requestedDeadline: '',
      reason: '',
    });
    setExtensionModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-blue-950 dark:to-indigo-950 flex relative">
      <div className="pointer-events-none fixed inset-0 opacity-50 -z-10">
        <div className="absolute -top-16 -left-10 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-400/25 via-blue-400/20 to-transparent blur-3xl" />
        <div className="absolute top-20 right-0 h-72 w-72 rounded-full bg-gradient-to-br from-cyan-400/25 via-indigo-500/25 to-transparent blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-gradient-to-br from-purple-500/25 via-blue-500/20 to-transparent blur-3xl" />
      </div>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-indigo-600 via-blue-700 to-slate-900 text-white shadow-2xl border-r border-white/10 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/15 backdrop-blur-xl rounded-2xl shadow-lg"><LayoutDashboard className="w-6 h-6" /></div>
              <div>
                <h1 className="text-xl font-bold">Consultant Hub</h1>
                <p className="text-xs opacity-80">Client-ready toolkit</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {[
              { icon: LayoutDashboard, label: 'Overview', target: overviewRef },
              { icon: CheckCircle2, label: 'Tasks', target: tasksRef },
              { icon: FileText, label: 'Documents', target: docsRef },
              { icon: Clock, label: 'Extensions', target: requestsRef },
              { icon: BarChart3, label: 'Analytics', target: analyticsRef },
            ].map((item, index) => (
              <motion.button
                key={item.label}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => scrollToRef(item.target)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 bg-white/5 hover:bg-white/10 hover:scale-[1.02] backdrop-blur"
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
                <ChevronRight className="w-4 h-4 ml-auto" />
              </motion.button>
            ))}
          </nav>

          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl">
              <UserButton />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.firstName || 'Consultant'}</p>
                <Badge variant="purple" size="sm" className="bg-white/15 text-white border-white/20">Consultant</Badge>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-h-screen lg:ml-72 relative">
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                <Menu className="w-6 h-6" />
              </button>
              <div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent">Client Delivery Console</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <Target className="w-4 h-4" />Execute tasks, track hours, stay client-ready
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                <Bell className="w-5 h-5" />
                {stats.extensions > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs rounded-full flex items-center justify-center font-bold animate-bounce">
                    {stats.extensions}
                  </span>
                )}
              </motion.button>
              <motion.button whileHover={{ scale: 1.1, rotate: 180 }} whileTap={{ scale: 0.9 }} onClick={toggleTheme}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-300">
                {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-indigo-600" />}
              </motion.button>
            </div>
          </div>

          <div className="px-4 sm:px-6 lg:px-8 pb-6">
            <div ref={overviewRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Pending', value: stats.pendingActions, icon: AlertCircle, gradient: 'from-blue-500 to-cyan-500', change: '-1 task' },
                { label: 'Completed', value: stats.completed, icon: CheckCircle2, gradient: 'from-green-500 to-emerald-500', change: '+8%' },
                { label: 'Deadlines', value: stats.upcoming, icon: Calendar, gradient: 'from-orange-500 to-amber-500', change: 'Due soon' },
                { label: 'Workstreams', value: stats.activeWorkstreams, icon: TrendingUp, gradient: 'from-indigo-500 to-purple-500', change: 'Active' },
                { label: 'Extensions', value: stats.extensions, icon: Clock, gradient: 'from-yellow-500 to-orange-500', change: 'Pending' },
                { label: 'Hours', value: `${stats.hours}h`, icon: Activity, gradient: 'from-sky-500 to-blue-600', change: '+5%' },
              ].map((stat, index) => (
                <motion.div key={stat.label} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.05, y: -5 }} className={cn('relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg cursor-pointer', stat.gradient)}>
                  <div className="absolute top-0 right-0 opacity-10"><stat.icon className="w-16 h-16 -mt-4 -mr-4" /></div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                      <stat.icon className="w-5 h-5" />
                      <p className="text-xs font-medium opacity-90">{stat.label}</p>
                    </div>
                    <p className="text-3xl font-bold mb-1">{stat.value}</p>
                    <div className="flex items-center gap-1 text-xs"><TrendingUp className="w-3 h-3" /><span>{stat.change}</span></div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-0 shadow-xl bg-gradient-to-r from-white to-blue-50 dark:from-slate-900 dark:to-blue-950/40">
                <CardHeader action={
                  <Button variant="ghost" size="sm" onClick={() => scrollToRef(tasksRef)}>
                    View tasks <ChevronRight className="w-4 h-4" />
                  </Button>
                }>
                  <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-500" />Announcements</CardTitle>
                  <CardDescription>Latest client and team updates</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                  {mockAnnouncements.map((announcement) => (
                    <div
                      key={announcement.id}
                      className={cn(
                        'p-4 rounded-xl border backdrop-blur bg-white/70 dark:bg-slate-800/70',
                        announcement.priority === 'urgent'
                          ? 'border-red-300 shadow-[0_10px_30px_-12px_rgba(239,68,68,0.5)]'
                          : 'border-slate-200 dark:border-slate-700'
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-[var(--foreground)]">{announcement.title}</h4>
                        {announcement.priority === 'urgent' && <Badge variant="danger" size="sm">Urgent</Badge>}
                      </div>
                      <p className="text-sm text-[var(--foreground)]/80 mb-2">{announcement.message}</p>
                      <div className="flex items-center gap-4 text-xs text-[var(--foreground)]/60">
                        <span>{announcement.author}</span>
                        <span>•</span>
                        <span>{announcement.createdAt.toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>

            <div ref={analyticsRef} className="grid xl:grid-cols-3 gap-6">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><PieChart className="w-5 h-5 text-indigo-500" />Task distribution</CardTitle>
                  <CardDescription>Status mix for your workload</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={50} paddingAngle={3}>
                        {statusPie.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {statusPie.map((item) => (
                      <div key={item.name} className="flex items-center justify-between p-2 rounded-lg bg-[var(--secondary)]">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <p className="text-sm">{item.name}</p>
                        </div>
                        <Badge variant="default" size="sm">{item.value}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-sky-500" />Weekly cadence</CardTitle>
                  <CardDescription>Hours logged by day</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={weeklyCadence}>
                      <defs>
                        <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="day" stroke="var(--foreground)" opacity={0.7} />
                      <YAxis stroke="var(--foreground)" opacity={0.7} />
                      <Tooltip />
                      <Area type="monotone" dataKey="hours" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorHours)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-2 text-xs text-[var(--foreground)]/60 mt-2">
                    <TrendingDown className="w-4 h-4" />
                    Keep hours balanced across the week.
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-purple-500" />Skill radar</CardTitle>
                  <CardDescription>Your current strengths</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <RadarChart data={skillRadar}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="area" stroke="var(--foreground)" />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="var(--foreground)" />
                      <Radar name="You" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.45} />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div ref={tasksRef} className="grid xl:grid-cols-3 gap-6">
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="xl:col-span-2">
                <Card className="shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Action items</CardTitle>
                        <CardDescription>Tasks assigned to you</CardDescription>
                      </div>
                      <Badge variant="info" size="sm">{stats.pendingActions} open</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {actionItems
                      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
                      .map((item) => {
                        const isOverdue = item.dueDate < new Date() && !item.completed;
                        return (
                          <motion.div key={item.id} whileHover={{ y: -2 }} className={cn(
                            'p-4 rounded-2xl border flex items-start gap-3',
                            isOverdue ? 'border-red-400/70 bg-red-50 dark:bg-red-900/30' : 'border-[var(--border)] bg-[var(--secondary)]/80'
                          )}>
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => toggleActionItem(item.id)}
                              className="mt-1 w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
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
              </motion.div>

              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle>Workstream deadlines</CardTitle>
                    <CardDescription>Upcoming milestones</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {mockWorkstreamDeadlines.map((deadline) => (
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
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-blue-500" style={{ width: `${deadline.progress ?? 0}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              <motion.div ref={requestsRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="shadow-lg">
                  <CardHeader action={
                    <Button
                      size="sm"
                      icon={<Plus className="w-4 h-4" />}
                      onClick={() => setExtensionModalOpen(true)}
                    >
                      Request
                    </Button>
                  }>
                    <CardTitle>Extension requests</CardTitle>
                    <CardDescription>Manage deadline extensions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {extensionRequests.length === 0 ? (
                      <div className="text-center py-8 text-[var(--foreground)] opacity-50">
                        <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>No extension requests</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {extensionRequests.map((request) => (
                          <div
                            key={request.id}
                            className="p-4 rounded-lg bg-[var(--secondary)] border border-[var(--border)]"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <h5 className="font-medium text-[var(--foreground)]">
                                {request.workstream}
                              </h5>
                              <Badge
                                variant={
                                  request.status === 'approved'
                                    ? 'success'
                                    : request.status === 'denied'
                                    ? 'danger'
                                    : 'warning'
                                }
                                size="sm"
                              >
                                {request.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-[var(--foreground)] opacity-70 mb-2">
                              {request.reason}
                            </p>
                            <div className="text-xs text-[var(--foreground)] opacity-60">
                              {request.originalDeadline.toLocaleDateString()} → {request.requestedDeadline.toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div ref={docsRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="shadow-lg">
                  <CardHeader action={
                    <Button size="sm" variant="outline" icon={<Upload className="w-4 h-4" />}>
                      Upload
                    </Button>
                  }>
                    <CardTitle>Workstream documents</CardTitle>
                    <CardDescription>Quick access to files</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      {mockDocuments.slice(0, 6).map((doc) => (
                        <a
                          key={doc.id}
                          href={doc.url}
                          className="p-3 rounded-lg bg-[var(--secondary)] hover:bg-[var(--accent)] border border-[var(--border)] transition-colors group"
                        >
                          <div className="flex items-start gap-3">
                            {getDocumentIcon(doc.type)}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[var(--foreground)] truncate group-hover:text-[var(--primary)]">
                                {doc.name}
                              </p>
                              <p className="text-xs text-[var(--foreground)] opacity-60 truncate">
                                {doc.workstream}
                              </p>
                            </div>
                            <ExternalLink className="w-4 h-4 text-[var(--foreground)] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <button
                onClick={() => setPreviousWeekModalOpen(true)}
                className="w-full p-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <h3 className="text-xl font-bold mb-1">Previous Week Summary</h3>
                    <p className="opacity-90">View your accomplishments from last week</p>
                  </div>
                  <CheckCircle2 className="w-12 h-12" />
                </div>
              </button>
            </motion.div>
          </div>
        </main>
      </div>

      {/* Extension Request Modal */}
      <Modal
        isOpen={extensionModalOpen}
        onClose={() => setExtensionModalOpen(false)}
        title="Request Deadline Extension"
      >
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Workstream
            </label>
            <select
              value={extensionForm.workstream}
              onChange={(e) => setExtensionForm((prev) => ({ ...prev, workstream: e.target.value }))}
              className="w-full px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-[var(--foreground)]"
            >
              {mockWorkstreamDeadlines.map((ws) => (
                <option key={ws.id} value={ws.workstreamName}>{ws.workstreamName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Original Deadline
            </label>
            <input
              type="date"
              value={extensionForm.originalDeadline}
              onChange={(e) => setExtensionForm((prev) => ({ ...prev, originalDeadline: e.target.value }))}
              className="w-full px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-[var(--foreground)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Requested New Deadline
            </label>
            <input
              type="date"
              value={extensionForm.requestedDeadline}
              onChange={(e) => setExtensionForm((prev) => ({ ...prev, requestedDeadline: e.target.value }))}
              className="w-full px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-[var(--foreground)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Reason for Extension
            </label>
            <textarea
              rows={4}
              value={extensionForm.reason}
              onChange={(e) => setExtensionForm((prev) => ({ ...prev, reason: e.target.value }))}
              className="w-full px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-[var(--foreground)]"
              placeholder="Please provide a detailed reason for the extension request..."
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setExtensionModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmitExtension}>Submit Request</Button>
          </div>
        </form>
      </Modal>

      {/* Previous Week Modal */}
      <Modal
        isOpen={previousWeekModalOpen}
        onClose={() => setPreviousWeekModalOpen(false)}
        title="Previous Week Summary"
        size="lg"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[var(--secondary)]">
              <p className="text-sm text-[var(--foreground)] opacity-70">Tasks Completed</p>
              <p className="text-3xl font-bold text-[var(--foreground)]">
                {mockPreviousWeekSummary.completedTasks.length}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-[var(--secondary)]">
              <p className="text-sm text-[var(--foreground)] opacity-70">Hours Logged</p>
              <p className="text-3xl font-bold text-[var(--foreground)]">
                {mockPreviousWeekSummary.hoursLogged}h
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-[var(--foreground)] mb-3">Workstream Progress</h4>
            {mockPreviousWeekSummary.workstreams.map((ws) => (
              <div key={ws.name} className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-[var(--foreground)]">{ws.name}</span>
                  <Badge variant="info" size="sm">{ws.tasksCompleted} tasks</Badge>
                </div>
                <ul className="space-y-1 ml-4">
                  {ws.keyAccomplishments.map((accomplishment, i) => (
                    <li key={i} className="text-sm text-[var(--foreground)] opacity-70 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      {accomplishment}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
