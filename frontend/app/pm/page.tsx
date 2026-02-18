'use client';

import { useSession } from 'next-auth/react';
import { useState, useRef, useEffect, type RefObject } from 'react';
import { setLastDashboard } from '@/lib/dashboard-context';
import { motion } from 'framer-motion';
import {
  Bell,
  FileText,
  Activity,
  Edit3,
  MessageSquare,
  Download,
  Layers,
  StickyNote,
  Upload,
  MessageCircle,
} from 'lucide-react';
import { PMNavbar } from '@/components/PMNavbar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { mockWorkstreamDeadlines } from '@/data/mockData';
import type { WorkstreamDeadline } from '@/types';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { useRouter } from 'next/navigation';

type NotificationType = 'upload' | 'comment' | 'revision_request' | 'doc_updated';
interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  context?: string;
  at: Date;
  read: boolean;
}

const mockNotifications: Notification[] = [
  { id: '1', type: 'upload', title: 'New upload to task', message: 'Market analysis draft v2 was uploaded to "Complete market analysis section".', context: 'Market Research', at: new Date(Date.now() - 1000 * 60 * 15), read: false },
  { id: '2', type: 'comment', title: 'New comment', message: 'Alice Johnson commented on "Kickoff deck" in Initial Slides.', context: 'Market Research', at: new Date(Date.now() - 1000 * 60 * 45), read: false },
  { id: '3', type: 'comment', title: 'New comment', message: 'Bob Smith replied to your comment on "Final client deck".', context: 'Financial Analysis', at: new Date(Date.now() - 1000 * 60 * 120), read: true },
  { id: '4', type: 'doc_updated', title: 'Workstream doc updated', message: 'Financial Analysis – Draft was edited by Carol Davis.', context: 'Financial Analysis', at: new Date(Date.now() - 1000 * 60 * 180), read: true },
  { id: '5', type: 'upload', title: 'New upload to task', message: 'Initial slides pack was uploaded to "Update client presentation slides".', context: 'Client Presentation', at: new Date(Date.now() - 1000 * 60 * 240), read: true },
];

// Mock data for PM-aligned features
const mockWorkstreamDocs = [
  { id: '1', name: 'Market Research – Draft', workstream: 'Market Research', status: 'draft' as const },
  { id: '2', name: 'Financial Analysis – Released', workstream: 'Financial Analysis', status: 'released' as const },
];
const mockInitialSlides = [{ id: '1', title: 'Kickoff deck', workstream: 'Market Research', commentCount: 2 }];
const mockFinalSlides = [{ id: '1', title: 'Final client deck', workstream: 'Market Research', commentCount: 1 }];
const mockCallNotes = [{ id: '1', title: 'Q4 planning call', date: new Date(), author: 'LC' }];

function formatNotificationTime(at: Date, now: number): string {
  const mins = Math.floor((now - at.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PMDashboard() {
  const session = useAuth();
  const router = useRouter();
  const [workstreams] = useState<WorkstreamDeadline[]>(mockWorkstreamDeadlines);
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [now, setNow] = useState<number | null>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const docsRef = useRef<HTMLDivElement>(null);
  const initialSlidesRef = useRef<HTMLDivElement>(null);
  const finalSlidesRef = useRef<HTMLDivElement>(null);
  const callNotesRef = useRef<HTMLDivElement>(null);
  const engagementRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    // If loading is done and user is NOT logged in, kick them to sign-in
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in'); // replace prevents back-button loops
    }
  }, [session, router]);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  const scrollToRef = (ref: RefObject<HTMLElement | null>) => {
    if (ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const navScrollMap: Record<string, RefObject<HTMLDivElement | null>> = {
    overview: dashboardRef,
    notifications: notificationsRef,
    workstreamdocs: docsRef,
    initialslides: initialSlidesRef,
    finalslides: finalSlidesRef,
    callnotes: callNotesRef,
  };
  const handleNavClick = (key: string) => {
    const ref = navScrollMap[key];
    if (ref?.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  useEffect(() => {
    setLastDashboard('/pm');
  }, []);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      <PMNavbar
        currentPath="/pm"
        unreadNotificationCount={unreadCount}
        onNavClick={handleNavClick}
      />

      <div className="flex-1 flex flex-col min-h-screen relative overflow-y-auto">
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 overflow-y-auto">
          <div ref={dashboardRef} className="max-w-[1800px] mx-auto space-y-8 pb-8">
            {/* Notifications */}
            <div ref={notificationsRef}>
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Bell className="w-5 h-5 text-[var(--primary)]" />
                        Notifications
                      </CardTitle>
                      <CardDescription>New uploads, comments, and updates</CardDescription>
                    </div>
                    {unreadCount > 0 && (
                      <Badge variant="info" size="sm">
                        {unreadCount} new
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 max-h-[420px] overflow-y-auto">
                    {notifications.map((n) => {
                      const Icon =
                        n.type === 'upload'
                          ? Upload
                          : n.type === 'comment'
                            ? MessageCircle
                            : n.type === 'doc_updated'
                              ? Edit3
                              : MessageSquare;
                      return (
                        <li
                          key={n.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => markAsRead(n.id)}
                          onKeyDown={(e) => e.key === 'Enter' && markAsRead(n.id)}
                          className={cn(
                            'p-4 rounded-xl border transition-colors text-left cursor-pointer',
                            n.read
                              ? 'border-[var(--border)] bg-[var(--secondary)]/60'
                              : 'border-[var(--primary)]/30 bg-[var(--primary)]/5'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-[var(--accent)] shrink-0">
                              <Icon className="w-4 h-4 text-[var(--primary)]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-[var(--foreground)]">{n.title}</h4>
                                {!n.read && (
                                  <span className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />
                                )}
                                <span className="text-xs text-[var(--foreground)]/60 ml-auto" suppressHydrationWarning>
                                  {now !== null ? formatNotificationTime(n.at, now) : '—'}
                                </span>
                              </div>
                              <p className="text-sm text-[var(--foreground)]/80 mt-1">{n.message}</p>
                              {n.context && (
                                <Badge variant="info" size="sm" className="mt-2">
                                  {n.context}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {notifications.length === 0 && (
                    <div className="text-center py-8 text-[var(--foreground)]/60">
                      <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No notifications yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Layout: left Engagement, right Workstream Docs (consultant-style grid) */}
            <div className="grid grid-cols-12 gap-6">
              <div ref={engagementRef} className="col-span-12 lg:col-span-5">
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-[var(--primary)]" />
                      Engagement status & timelines
                    </CardTitle>
                    <CardDescription>Workstream status and deadlines</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 max-h-[400px] overflow-y-auto">
                    {workstreams
                      .sort((a, b) => a.daysRemaining - b.daysRemaining)
                      .map((ws) => (
                        <div
                          key={ws.id}
                          className="p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h5 className="font-semibold text-[var(--foreground)]">{ws.workstreamName}</h5>
                              <p className="text-xs text-[var(--foreground)]/70">{ws.description}</p>
                            </div>
                            <Badge
                              variant={
                                ws.status === 'on_track' ? 'success' : ws.status === 'at_risk' ? 'warning' : 'danger'
                              }
                              size="sm"
                            >
                              {ws.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="mt-3 space-y-1">
                            <div className="flex justify-between text-xs text-[var(--foreground)]/60">
                              <span>Progress</span>
                              <span>{ws.progress ?? 0}%</span>
                            </div>
                            <div className="h-2 bg-[var(--accent)] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[var(--primary)]"
                                style={{ width: `${ws.progress ?? 0}%` }}
                              />
                            </div>
                          </div>
                          <p className="text-xs text-[var(--foreground)]/60 mt-2">{ws.daysRemaining}d remaining</p>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              </div>

              <div ref={docsRef} className="col-span-12 lg:col-span-7">
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-[var(--primary)]" />
                      Workstream Documents
                    </CardTitle>
                    <CardDescription>Draft (RW+C) · Released (RW+C) · Edit workstream live (RW)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {mockWorkstreamDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80 flex items-center justify-between"
                      >
                        <div>
                          <h5 className="font-semibold text-[var(--foreground)]">{doc.name}</h5>
                          <p className="text-xs text-[var(--foreground)]/70">{doc.workstream}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={doc.status === 'draft' ? 'warning' : 'success'} size="sm">
                            {doc.status}
                          </Badge>
                          <Button variant="ghost" size="sm">
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <MessageSquare className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Initial Slides (R, C) | Final Slides (R, C, W, Compile, Download) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div ref={initialSlidesRef}>
                <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-[var(--primary)]" />
                    Initial slides
                  </CardTitle>
                  <CardDescription>View (R) · Comment (C)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {mockInitialSlides.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80 flex items-center justify-between"
                    >
                      <div>
                        <h5 className="font-semibold text-[var(--foreground)]">{s.title}</h5>
                        <p className="text-xs text-[var(--foreground)]/70">{s.workstream}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="info" size="sm">
                          {s.commentCount} comments
                        </Badge>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              </div>

              <div ref={finalSlidesRef}>
                <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-[var(--primary)]" />
                    Final slides
                  </CardTitle>
                  <CardDescription>View (R) · Comment (C) · Edit (W) · Compile deck (W) · Download (R)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {mockFinalSlides.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80 flex items-center justify-between flex-wrap gap-2"
                    >
                      <div>
                        <h5 className="font-semibold text-[var(--foreground)]">{s.title}</h5>
                        <p className="text-xs text-[var(--foreground)]/70">{s.workstream}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button size="sm">Compile deck</Button>
                        <Button variant="outline" size="sm">
                          <Download className="w-4 h-4 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              </div>
            </div>

            {/* Client call notes – read (R) */}
            <div ref={callNotesRef}>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <StickyNote className="w-5 h-5 text-[var(--primary)]" />
                  Client call notes
                </CardTitle>
                <CardDescription>Read (R) – written by LC</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockCallNotes.map((note) => (
                    <div
                      key={note.id}
                      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-semibold text-[var(--foreground)]">{note.title}</h5>
                        <span className="text-xs text-[var(--foreground)]/60">
                          {note.date.toLocaleDateString()} · {note.author}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--foreground)]/80">
                        Call notes content (read-only). Key decisions and action items from the client call.
                      </p>
                    </div>
                  ))}
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