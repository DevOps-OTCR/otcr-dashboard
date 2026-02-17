'use client';

import { useAuth } from '@/components/AuthContext';
import { useState, useEffect, useMemo, useRef, type RefObject } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
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
  Target,
  Activity,
  TrendingDown,
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
  mockDashboardStats,
} from '@/data/mockData';
import type { ActionItem, ExtensionRequest, Document as DocType } from '@/types';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { useRouter } from 'next/navigation';

export default function ConsultantDashboard() {
  const router = useRouter();
  const session = useAuth();
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [actionItems, setActionItems] = useState(mockActionItems);
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

  useEffect(() => {
    // If loading is done and user is NOT logged in, kick them to sign-in
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in'); // replace prevents back-button loops
    }
  }, [session, router]);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }


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
      { name: 'In Progress', value: actionItems.filter((t) => !t.completed && t.status === 'in_progress').length, color: 'rgb(0, 51, 96)' },
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

  const handleSubmitExtension = () => {
    if (!extensionForm.workstream || !extensionForm.requestedDeadline) return;
    const newRequest: ExtensionRequest = {
      id: Date.now().toString(),
      workstream: extensionForm.workstream,
      originalDeadline: extensionForm.originalDeadline ? new Date(extensionForm.originalDeadline) : new Date(),
      requestedDeadline: new Date(extensionForm.requestedDeadline),
      reason: extensionForm.reason || 'Requesting buffer for quality.',
      status: 'pending',
      requestedBy: session?.user?.name || 'Consultant',
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
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center">
                <Image
                  src="/otcr-logo.png"
                  alt="OTCR Consulting"
                  width={120}
                  height={40}
                  className="h-10 w-auto"
                  priority
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative p-2 rounded-xl hover:bg-[var(--accent)]"
              >
                <Bell className="w-5 h-5" />
                {stats.extensions > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {stats.extensions}
                  </span>
                )}
              </motion.button>
              <button
                onClick={() => session.logout()}
                className="p-2 rounded-full bg-[var(--accent)] hover:bg-[var(--primary)]/20 transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
          <nav className="flex items-center gap-1 border-t border-[var(--border)] py-2 overflow-x-auto">
            {[
              { icon: LayoutDashboard, label: 'Overview', target: overviewRef },
              { icon: CheckCircle2, label: 'Tasks', target: tasksRef },
              { icon: FileText, label: 'Documents', target: docsRef },
              { icon: Clock, label: 'Extensions', target: requestsRef },
            ].map((item, index) => (
              <motion.button
                key={item.label}
                initial={{ x: -12, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => scrollToRef(item.target)}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-[var(--foreground)]/75 hover:bg-[var(--accent)] hover:text-[var(--foreground)] transition-colors whitespace-nowrap"
              >
                <item.icon className="w-4 h-4 text-[var(--primary)]" />
                <span>{item.label}</span>
              </motion.button>
            ))}
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
                        <CardTitle>Action Items</CardTitle>
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
                  {/* Middle Left - Announcements */}
                  <Card className="shadow-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[rgb(0,51,96)]" />
                        Announcements
                      </CardTitle>
                      <CardDescription>Latest client and team updates</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 max-h-[400px] overflow-y-auto">
                      {mockAnnouncements.map((announcement) => (
                        <div
                          key={announcement.id}
                          className={cn(
                            'p-4 rounded-xl border backdrop-blur bg-white/70',
                            announcement.priority === 'urgent'
                              ? 'border-red-300 shadow-[0_10px_30px_-12px_rgba(239,68,68,0.5)]'
                              : 'border-slate-200'
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

                  {/* Middle Right - Upcoming Events */}
                <Card className="shadow-lg">
                  <CardHeader>
                      <CardTitle>Upcoming Events</CardTitle>
                      <CardDescription>Workstream deadlines and milestones</CardDescription>
                  </CardHeader>
                    <CardContent className="space-y-4 max-h-[400px] overflow-y-auto">
                      {mockWorkstreamDeadlines
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
                            <div className="h-full bg-gradient-to-r from-[rgb(0,51,96)] to-[rgb(0,70,120)]" style={{ width: `${deadline.progress ?? 0}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                </div>
              </div>
            </div>

            {/* Assignments - Full Width */}
            <Card className="shadow-lg mt-6">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <CardTitle>Assignments</CardTitle>
                    <CardDescription>Top assignments by due date</CardDescription>
                  </div>
                  {actionItems.filter(a => !a.completed).length > 4 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => scrollToRef(tasksRef)}
                      className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:ring-gray-300 flex-shrink-0"
                    >
                      See All <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {actionItems
                    .filter(a => !a.completed)
                    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
                    .slice(0, 4)
                    .map((item) => {
                      const isOverdue = item.dueDate < new Date();
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'p-4 rounded-xl border flex flex-col',
                            isOverdue ? 'border-red-400/70 bg-red-50' : 'border-[var(--border)] bg-[var(--secondary)]/80'
                          )}
                        >
                          <div className="flex items-start gap-3 mb-3">
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => toggleActionItem(item.id)}
                              className="mt-1 w-5 h-5 rounded border-gray-300 text-[rgb(0,51,96)] focus:ring-[rgb(0,51,96)]"
                            />
                            <div className="flex-1">
                              <h5 className="font-semibold text-[var(--foreground)]">{item.taskName}</h5>
                              <p className="text-sm text-[var(--foreground)]/70 mt-1">{item.projectName} • {item.workstream}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-auto">
                            <Badge variant={isOverdue ? 'danger' : 'info'} size="sm">
                              Due: {item.dueDate.toLocaleDateString()}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {/* Handle upload */}}
                            >
                              <Upload className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-8 mt-6">
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

    </div>
  );
}
