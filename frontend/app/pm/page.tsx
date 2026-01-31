'use client';

import { useUser, UserButton } from '@clerk/nextjs';
import { useState, useEffect, useMemo, useRef, type RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, CheckSquare, Clock, AlertTriangle, TrendingUp, Settings, Bell, Menu, Sun, Moon,
  Calendar, FileText, Target, BarChart3, UserCheck, ClipboardList, Send, CheckCircle2, XCircle, Activity,
  Award, Briefcase, Zap, Star, Sparkles, PieChart as PieChartIcon,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { cn, formatDate, getDaysUntil } from '@/lib/utils';
import { mockActionItems, mockWorkstreamDeadlines, mockExtensionRequests } from '@/data/mockData';
import type { ActionItem, ExtensionRequest, WorkstreamDeadline } from '@/types';

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

export default function PMDashboard() {
  const { user } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [extensionRequests, setExtensionRequests] = useState<ExtensionRequest[]>(mockExtensionRequests);
  const [actionItems, setActionItems] = useState<ActionItem[]>(mockActionItems);
  const [workstreams, setWorkstreams] = useState<WorkstreamDeadline[]>(mockWorkstreamDeadlines);
  const [assignTaskModalOpen, setAssignTaskModalOpen] = useState(false);
  const [assignTaskForm, setAssignTaskForm] = useState({
    taskName: '', assignTo: '', dueDate: '', workstream: '', description: '',
  });
  const dashboardRef = useRef<HTMLDivElement>(null);
  const analyticsRef = useRef<HTMLDivElement>(null);
  const teamRef = useRef<HTMLDivElement>(null);
  const projectsRef = useRef<HTMLDivElement>(null);
  const reportsRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

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

  const pmStats = useMemo(() => {
    const totalTasks = actionItems.length;
    const completedTasks = actionItems.filter(t => t.completed).length;
    const overdueTasks = actionItems.filter(t => !t.completed && new Date(t.dueDate) < new Date()).length;
    const pendingExtensions = extensionRequests.filter(r => r.status === 'pending').length;
    const atRiskWorkstreams = workstreams.filter(w => w.status === 'at_risk' || w.status === 'overdue').length;
    return {
      totalTasks, completedTasks, overdueTasks, pendingExtensions, atRiskWorkstreams,
      teamUtilization: 87,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  }, [actionItems, extensionRequests, workstreams]);

  const teamMembers = [
    { id: '1', name: 'Alice Johnson', role: 'Senior Consultant', tasksAssigned: 8, tasksCompleted: 6, avatar: 'AJ', color: '#6366f1' },
    { id: '2', name: 'Bob Smith', role: 'Consultant', tasksAssigned: 6, tasksCompleted: 5, avatar: 'BS', color: '#8b5cf6' },
    { id: '3', name: 'Carol Davis', role: 'Analyst', tasksAssigned: 5, tasksCompleted: 4, avatar: 'CD', color: '#ec4899' },
    { id: '4', name: 'David Lee', role: 'Consultant', tasksAssigned: 7, tasksCompleted: 3, avatar: 'DL', color: '#f59e0b' },
  ];

  const taskStatusData = useMemo(() => [
    { name: 'Completed', value: pmStats.completedTasks, color: '#10b981' },
    { name: 'In Progress', value: actionItems.filter(t => !t.completed && t.status === 'in_progress').length, color: '#3b82f6' },
    { name: 'Pending', value: actionItems.filter(t => !t.completed && t.status === 'pending').length, color: '#f59e0b' },
    { name: 'Overdue', value: pmStats.overdueTasks, color: '#ef4444' },
  ], [pmStats, actionItems]);

  const weeklyProgressData = [
    { day: 'Mon', completed: 4, assigned: 6 }, { day: 'Tue', completed: 5, assigned: 7 },
    { day: 'Wed', completed: 3, assigned: 5 }, { day: 'Thu', completed: 6, assigned: 8 },
    { day: 'Fri', completed: 7, assigned: 9 }, { day: 'Sat', completed: 2, assigned: 3 }, { day: 'Sun', completed: 1, assigned: 2 },
  ];

  const teamPerformanceRadar = teamMembers.map(member => ({
    name: member.name.split(' ')[0],
    completion: Math.round((member.tasksCompleted / member.tasksAssigned) * 100),
    efficiency: Math.random() * 30 + 70,
  }));

  const scrollToRef = (ref: RefObject<HTMLElement | null>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setSidebarOpen(false);
    }
  };

  const handleExtensionReview = (id: string, decision: 'approved' | 'denied') => {
    setExtensionRequests(prev => prev.map(req => req.id === id ? {
      ...req, status: decision, reviewedBy: user?.fullName || 'PM', reviewedAt: new Date(),
      reviewNotes: decision === 'approved' ? 'Extension approved' : 'Extension denied',
    } : req));
  };

  const handleAssignTask = () => {
    if (!assignTaskForm.taskName || !assignTaskForm.assignTo || !assignTaskForm.dueDate) return alert('Fill all required fields');
    const newTask: ActionItem = {
      id: Date.now().toString(), taskName: assignTaskForm.taskName, dueDate: new Date(assignTaskForm.dueDate),
      projectName: 'OTCR Project', workstream: assignTaskForm.workstream || workstreams[0]?.workstreamName || 'General',
      status: 'pending', assignedTo: assignTaskForm.assignTo, description: assignTaskForm.description || 'Task assigned by PM',
      completed: false,
    };
    setActionItems(prev => [newTask, ...prev]);
    setAssignTaskForm({ taskName: '', assignTo: '', dueDate: '', workstream: '', description: '' });
    setAssignTaskModalOpen(false);
    alert(`Task "${newTask.taskName}" assigned!`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-blue-950 dark:to-indigo-950 flex">
      <div className="fixed inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-700" />
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-1000" />
      </div>

      <aside className={cn('fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-indigo-600 via-purple-600 to-pink-600 transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:static shadow-2xl', sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex flex-col h-full text-white">
          <div className="p-6 border-b border-white/20">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-3">
              <div className="p-3 bg-white/20 backdrop-blur-xl rounded-2xl shadow-lg"><Briefcase className="w-7 h-7" /></div>
              <div>
                <h1 className="text-2xl font-bold">PM Console</h1>
                <p className="text-sm opacity-90 flex items-center gap-1"><Sparkles className="w-3 h-3" />Command Center</p>
              </div>
            </motion.div>
          </div>
          <nav className="flex-1 p-4 space-y-2">
            {[
              { icon: LayoutDashboard, label: 'Dashboard', active: true, target: dashboardRef },
              { icon: Users, label: 'Team', active: false, target: teamRef },
              { icon: Target, label: 'Projects', active: false, target: projectsRef },
              { icon: BarChart3, label: 'Analytics', active: false, target: analyticsRef },
              { icon: FileText, label: 'Reports', active: false, target: reportsRef },
              { icon: Settings, label: 'Settings', active: false, target: settingsRef },
            ].map((item, index) => (
              <motion.button key={item.label} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: index * 0.1 }}
                onClick={() => scrollToRef(item.target)}
                className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300',
                  item.active ? 'bg-white/30 backdrop-blur-xl shadow-lg scale-105' : 'hover:bg-white/10 hover:scale-105')}>
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
                {item.active && <Zap className="w-4 h-4 ml-auto animate-pulse" />}
              </motion.button>
            ))}
          </nav>
          <div className="p-4 border-t border-white/20">
            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl">
              <UserButton />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.firstName || 'PM'}</p>
                <Badge variant="purple" size="sm" className="bg-white/20">PM</Badge>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-h-screen relative lg:ml-72">
        <header ref={settingsRef} className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                  <Menu className="w-6 h-6" />
                </button>
                <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">PM Command Center</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                    <Activity className="w-4 h-4" />Manage team and track project health
                  </p>
                </motion.div>
              </div>
              <div className="flex items-center gap-3">
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                  <Bell className="w-5 h-5" />
                  {pmStats.pendingExtensions > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs rounded-full flex items-center justify-center font-bold animate-bounce">
                      {pmStats.pendingExtensions}
                    </span>
                  )}
                </motion.button>
                <motion.button whileHover={{ scale: 1.1, rotate: 180 }} whileTap={{ scale: 0.9 }} onClick={toggleTheme}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-300">
                  {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-indigo-600" />}
                </motion.button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-6">
              {[
                { label: 'Total Tasks', value: pmStats.totalTasks, icon: ClipboardList, gradient: 'from-blue-500 to-cyan-500', change: '+12%' },
                { label: 'Completed', value: `${pmStats.completionRate}%`, icon: CheckCircle2, gradient: 'from-green-500 to-emerald-500', change: '+8%' },
                { label: 'Overdue', value: pmStats.overdueTasks, icon: AlertTriangle, gradient: 'from-red-500 to-rose-500', change: '-3%' },
                { label: 'Extensions', value: pmStats.pendingExtensions, icon: Clock, gradient: 'from-yellow-500 to-orange-500', change: '+2' },
                { label: 'At Risk', value: pmStats.atRiskWorkstreams, icon: Activity, gradient: 'from-orange-500 to-red-500', change: '-1' },
                { label: 'Team Util.', value: `${pmStats.teamUtilization}%`, icon: TrendingUp, gradient: 'from-purple-500 to-pink-500', change: '+5%' },
              ].map((stat, index) => (
                <motion.div key={stat.label} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.05, y: -5 }} className={cn('relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg cursor-pointer', stat.gradient)}>
                  <div className="absolute top-0 right-0 opacity-20"><stat.icon className="w-20 h-20 -mt-4 -mr-4" /></div>
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
          <div ref={dashboardRef} className="max-w-7xl mx-auto space-y-8 pb-8">
            {pmStats.pendingExtensions > 0 && (
              <motion.div ref={reportsRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-yellow-600 via-orange-600 to-red-600 rounded-3xl blur opacity-25 animate-pulse" />
                <Card className="relative border-2 border-yellow-500/50 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-2xl">
                          <AlertTriangle className="w-6 h-6 text-yellow-600 animate-pulse" />
                          <span className="bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">Pending Extension Requests</span>
                        </CardTitle>
                        <CardDescription className="text-base">Review and approve deadline extensions</CardDescription>
                      </div>
                      <Badge variant="warning" size="lg" className="text-lg px-4 py-2">{pmStats.pendingExtensions} Pending</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      {extensionRequests.filter(r => r.status === 'pending').map((request, index) => (
                        <motion.div key={request.id} id={`extension-${request.id}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }} whileHover={{ scale: 1.02 }}
                          className="p-5 rounded-2xl bg-white dark:bg-slate-800 border-2 border-yellow-300 dark:border-yellow-700 shadow-lg">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-bold text-lg">{request.workstream}</h4>
                              <p className="text-sm text-slate-600 dark:text-slate-400">by {request.requestedBy}</p>
                            </div>
                            <Badge variant="warning" size="sm" className="animate-pulse">Pending</Badge>
                          </div>
                          <p className="text-sm mb-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg">{request.reason}</p>
                          <div className="flex items-center gap-2 text-xs mb-4 bg-slate-100 dark:bg-slate-900 p-2 rounded-lg">
                            <Calendar className="w-4 h-4" />
                            <span className="font-medium">{formatDate(request.originalDeadline)}</span>
                            <span>→</span>
                            <span className="font-bold text-yellow-600">{formatDate(request.requestedDeadline)}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleExtensionReview(request.id, 'approved')}
                              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600">
                              <CheckCircle2 className="w-4 h-4 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleExtensionReview(request.id, 'denied')}
                              className="flex-1 border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                              <XCircle className="w-4 h-4 mr-1" />Deny
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            <div ref={analyticsRef} className="grid lg:grid-cols-2 gap-6">
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                <Card className="bg-gradient-to-br from-white to-blue-50 dark:from-slate-900 dark:to-blue-950/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><PieChartIcon className="w-5 h-5 text-blue-600" />Task Distribution</CardTitle>
                    <CardDescription>Overview by status</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={taskStatusData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent = 0 }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100}
                            dataKey="value"
                            animationDuration={800}
                          >
                          {taskStatusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      {taskStatusData.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-800">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-sm font-medium">{item.name}: {item.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                <Card className="bg-gradient-to-br from-white to-purple-50 dark:from-slate-900 dark:to-purple-950/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-purple-600" />Weekly Progress</CardTitle>
                    <CardDescription>Tasks completed vs assigned</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={weeklyProgressData}>
                        <defs>
                          <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="colorAssigned" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="day" stroke="#6b7280" />
                        <YAxis stroke="#6b7280" />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="completed" stroke="#10b981" fillOpacity={1} fill="url(#colorCompleted)" strokeWidth={2} />
                        <Area type="monotone" dataKey="assigned" stroke="#6366f1" fillOpacity={1} fill="url(#colorAssigned)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            <div ref={teamRef} className="grid lg:grid-cols-3 gap-6">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2">
                <Card className="bg-gradient-to-br from-white to-indigo-50 dark:from-slate-900 dark:to-indigo-950/20">
                  <CardHeader action={<Button size="sm" className="bg-gradient-to-r from-indigo-600 to-purple-600" onClick={() => setAssignTaskModalOpen(true)}>
                    <Send className="w-4 h-4 mr-2" />Assign Task</Button>}>
                    <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600" />Team Performance</CardTitle>
                    <CardDescription>Track progress and workload</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      {teamMembers.map((member, index) => {
                        const completionRate = member.tasksAssigned > 0 ? Math.round((member.tasksCompleted / member.tasksAssigned) * 100) : 0;
                        return (
                          <motion.div key={member.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}
                            whileHover={{ scale: 1.03, y: -5 }} className="p-4 rounded-2xl bg-white dark:bg-slate-800 border shadow-lg cursor-pointer">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white shadow-lg"
                                  style={{ background: `linear-gradient(135deg, ${member.color}, ${member.color}dd)` }}>{member.avatar}</div>
                                <div>
                                  <h4 className="font-bold">{member.name}</h4>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{member.role}</p>
                                </div>
                              </div>
                              <Badge variant={completionRate >= 80 ? 'success' : completionRate >= 60 ? 'warning' : 'danger'} size="sm" className="text-base px-3 py-1">
                                {completionRate}%
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                              <div className="bg-blue-50 dark:bg-blue-950/30 p-2 rounded-lg">
                                <p className="text-xs text-slate-600 dark:text-slate-400">Assigned</p>
                                <p className="font-bold text-blue-600 dark:text-blue-400">{member.tasksAssigned} tasks</p>
                              </div>
                              <div className="bg-green-50 dark:bg-green-950/30 p-2 rounded-lg">
                                <p className="text-xs text-slate-600 dark:text-slate-400">Completed</p>
                                <p className="font-bold text-green-600 dark:text-green-400">{member.tasksCompleted} tasks</p>
                              </div>
                            </div>
                            <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${completionRate}%` }} transition={{ duration: 1, delay: index * 0.1 }}
                                className="h-full rounded-full" style={{
                                  background: `linear-gradient(90deg, ${completionRate >= 80 ? '#10b981' : completionRate >= 60 ? '#f59e0b' : '#ef4444'}, ${completionRate >= 80 ? '#059669' : completionRate >= 60 ? '#d97706' : '#dc2626'})`
                                }} />
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <Card className="bg-gradient-to-br from-white to-pink-50 dark:from-slate-900 dark:to-pink-950/20 h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Star className="w-5 h-5 text-pink-600" />Team Metrics</CardTitle>
                    <CardDescription>Performance radar</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={teamPerformanceRadar}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="name" />
                        <PolarRadiusAxis />
                        <Radar name="Completion" dataKey="completion" stroke="#6366f1" fill="#6366f1" fillOpacity={0.6} />
                        <Radar name="Efficiency" dataKey="efficiency" stroke="#ec4899" fill="#ec4899" fillOpacity={0.6} />
                        <Legend />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            <motion.div ref={projectsRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <Card className="bg-gradient-to-br from-white to-green-50 dark:from-slate-900 dark:to-green-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-green-600" />Project Health</CardTitle>
                  <CardDescription>Real-time workstream monitoring</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {workstreams.map((ws, index) => (
                      <motion.div key={ws.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.1 }}
                        whileHover={{ scale: 1.05 }} className="p-5 rounded-2xl bg-white dark:bg-slate-800 border-2 shadow-lg">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-bold text-lg">{ws.workstreamName}</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{ws.description}</p>
                          </div>
                          <Badge variant={ws.status === 'on_track' ? 'success' : ws.status === 'at_risk' ? 'warning' : 'danger'} size="sm">
                            {ws.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm mt-4 mb-4">
                          <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-xl">
                            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Progress</p>
                            <p className="font-bold text-2xl text-blue-600 dark:text-blue-400">{ws.progress}%</p>
                          </div>
                          <div className={cn('p-3 rounded-xl',
                            ws.daysRemaining <= 2 ? 'bg-red-50 dark:bg-red-950/30' :
                            ws.daysRemaining <= 5 ? 'bg-yellow-50 dark:bg-yellow-950/30' : 'bg-green-50 dark:bg-green-950/30')}>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Days Left</p>
                            <p className={cn('font-bold text-2xl',
                              ws.daysRemaining <= 2 ? 'text-red-600 dark:text-red-400' :
                              ws.daysRemaining <= 5 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400')}>
                              {ws.daysRemaining}
                            </p>
                          </div>
                        </div>
                        <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${ws.progress}%` }} transition={{ duration: 1, delay: index * 0.1 }}
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </main>
      </div>

      <div ref={reportsRef} />
      <div ref={settingsRef} />

      <Modal isOpen={assignTaskModalOpen} onClose={() => setAssignTaskModalOpen(false)} title="Assign New Task" size="lg">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleAssignTask(); }}>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Task Name *</label>
            <input type="text" value={assignTaskForm.taskName}
              onChange={(e) => setAssignTaskForm(prev => ({ ...prev, taskName: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 focus:border-indigo-500 transition-colors"
              placeholder="e.g., Complete market analysis" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Assign To *</label>
              <select value={assignTaskForm.assignTo}
                onChange={(e) => setAssignTaskForm(prev => ({ ...prev, assignTo: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 focus:border-indigo-500 transition-colors" required>
                <option value="">Select team member</option>
                {teamMembers.map(member => <option key={member.id} value={member.name}>{member.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Due Date *</label>
              <input type="date" value={assignTaskForm.dueDate}
                onChange={(e) => setAssignTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 focus:border-indigo-500 transition-colors" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Workstream</label>
            <select value={assignTaskForm.workstream}
              onChange={(e) => setAssignTaskForm(prev => ({ ...prev, workstream: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 focus:border-indigo-500 transition-colors">
              <option value="">Select workstream</option>
              {workstreams.map(ws => <option key={ws.id} value={ws.workstreamName}>{ws.workstreamName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Description</label>
            <textarea value={assignTaskForm.description}
              onChange={(e) => setAssignTaskForm(prev => ({ ...prev, description: e.target.value }))}
              rows={4} className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 focus:border-indigo-500 transition-colors"
              placeholder="Provide detailed instructions..." />
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button type="button" variant="outline" onClick={() => setAssignTaskModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="bg-gradient-to-r from-indigo-600 to-purple-600">
              <Send className="w-4 h-4 mr-2" />Assign Task
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
