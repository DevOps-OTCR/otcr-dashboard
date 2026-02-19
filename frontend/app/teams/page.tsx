'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserPlus, UserMinus, Trash2, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { getEffectiveRole, getUserRole, type AppRole } from '@/lib/permissions';
import { PMNavbar } from '@/components/PMNavbar';
import { LCPartnerNavbar } from '@/components/LCPartnerNavbar';
import { AdminRoleSwitcher } from '@/components/AdminRoleSwitcher';
import { getLastDashboard } from '@/lib/dashboard-context';
import { useRouter } from 'next/navigation';
import { projectsAPI, authAPI, setAuthToken } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';

type ProjectMember = { user: { id: string; email: string; firstName?: string; lastName?: string; role?: string } };
type ProjectFromApi = {
  id: string;
  name: string;
  status?: string;
  createdAt: string;
  googleCalendarEmbedUrl?: string | null;
  members?: ProjectMember[];
};

function getMemberEmails(project: ProjectFromApi): string[] {
  return project.members?.map((m) => m.user.email) ?? [];
}

function parseApiError(err: any, fallback: string): string {
  const message = err?.response?.data?.message ?? err?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : String(message);
}

export default function TeamsPage() {
  const session = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [hasMounted, setHasMounted] = useState(false);
  const [projects, setProjects] = useState<ProjectFromApi[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false);
  const [createTeamForm, setCreateTeamForm] = useState({ name: '', selectedEmails: [] as string[], search: '' });
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [calendarLinkDrafts, setCalendarLinkDrafts] = useState<Record<string, string>>({});
  const [actionFeedback, setActionFeedback] = useState<{ message: string; tone: 'success' | 'warning' | 'info' } | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const token = await session.getToken();
      if (!token) {
        setProjects([]);
        return;
      }
      setAuthToken(token);
      const res = await projectsAPI.getAll({ includeMembers: true, limit: 100 });
      setProjects(res.data?.projects ?? []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!session.isLoggedIn || !session.user?.email) return;
    if (session.loading) return;
    void fetchProjects();
  }, [session.isLoggedIn, session.user?.email, session.loading, fetchProjects]);

  useEffect(() => {
    const loadAllowedEmails = async () => {
      if (!session.isLoggedIn || !session.user?.email) return;

      // Consultants/Partners only need read-only access, not full allowed-email directory.
      if (role === 'CONSULTANT' || role === 'PARTNER') {
        setAllowedEmails([]);
        return;
      }

      try {
        const token = await session.getToken();
        if (!token) {
          setAllowedEmails([]);
          return;
        }
        setAuthToken(token);

        const res = await authAPI.getAllowedEmails();
        const list = res.data?.emails ?? res.data ?? [];
        const emails = Array.isArray(list)
          ? (list.map((e: { email?: string }) => (typeof e === 'string' ? e : e?.email)).filter(Boolean) as string[])
          : [];
        setAllowedEmails(emails);
      } catch {
        setAllowedEmails([]);
      }
    };

    void loadAllowedEmails();
  }, [session.isLoggedIn, session.user?.email, role]);

  useEffect(() => {
    const syncRole = async () => {
      if (session.isLoggedIn) {
        try {
          const token = await session.getToken();
          const email = session.user?.email || '';
          const userRole = await getEffectiveRole(token, email);
          setRole(userRole);
        } catch {
          setRole('CONSULTANT');
        }
      }
    };
    syncRole();
  }, [session]);

  useEffect(() => {
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in');
    }
  }, [session, router]);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  const resolvedRole = hasMounted && session.isLoggedIn ? role : role;
  const canManageTeams =
    resolvedRole === 'PM' ||
    resolvedRole === 'LC' ||
    resolvedRole === 'ADMIN';
  const isConsultant = resolvedRole === 'CONSULTANT';
  const isPartner = resolvedRole === 'PARTNER';
  const currentUserEmail = session.user?.email ?? null;

  const myTeam =
    currentUserEmail && isConsultant
      ? projects.find((p) => getMemberEmails(p).includes(currentUserEmail))
      : null;
  const selectedTeam = selectedTeamId ? projects.find((p) => p.id === selectedTeamId) : null;
  const selectedMemberEmails = selectedTeam ? getMemberEmails(selectedTeam) : [];

  useEffect(() => {
    if (!actionFeedback) return;
    const timer = setTimeout(() => setActionFeedback(null), 2400);
    return () => clearTimeout(timer);
  }, [actionFeedback]);

  const filterEmailsBySearch = (emails: string[], query: string) => {
    if (!query.trim()) return emails;
    const q = query.trim().toLowerCase();
    return emails.filter((e) => e.toLowerCase().includes(q));
  };

  const createModalAvailableEmails = filterEmailsBySearch(allowedEmails, createTeamForm.search);
  const addMemberAvailableEmails = selectedTeam
    ? filterEmailsBySearch(
        allowedEmails.filter((e) => !selectedMemberEmails.includes(e)),
        addMemberSearch
      )
    : [];

  const toggleTeamMember = (email: string) => {
    setCreateTeamForm((prev) => ({
      ...prev,
      selectedEmails: prev.selectedEmails.includes(email)
        ? prev.selectedEmails.filter((e) => e !== email)
        : [...prev.selectedEmails, email],
    }));
  };

  const handleCreateTeam = () => {
    if (!createTeamForm.name.trim()) return;
    const startDate = new Date().toISOString().slice(0, 10);
    projectsAPI
      .create({
        name: createTeamForm.name.trim(),
        startDate,
        memberEmails: createTeamForm.selectedEmails,
      })
      .then(() => {
        setCreateTeamForm({ name: '', selectedEmails: [], search: '' });
        setCreateTeamModalOpen(false);
        setSelectedTeamId(null);
        setActionFeedback({ message: 'Team created', tone: 'success' });
        fetchProjects();
      })
      .catch((err) =>
        setActionFeedback({
          message: parseApiError(err, 'Failed to create team'),
          tone: 'warning',
        }),
      );
  };

  const handleAddMemberToTeam = (projectId: string, email: string) => {
    projectsAPI
      .addMember(projectId, { email })
      .then(() => {
        setActionFeedback({ message: 'Member added', tone: 'success' });
        fetchProjects();
      })
      .catch((err) =>
        setActionFeedback({
          message: parseApiError(err, 'Failed to add member'),
          tone: 'warning',
        }),
      );
  };

  const handleRemoveMemberFromTeam = (projectId: string, userId: string) => {
    projectsAPI
      .removeMember(projectId, userId)
      .then(() => {
        setActionFeedback({ message: 'Member removed', tone: 'warning' });
        fetchProjects();
      })
      .catch((err) =>
        setActionFeedback({
          message: parseApiError(err, 'Failed to remove member'),
          tone: 'warning',
        }),
      );
  };

  const handleDeleteTeam = (projectId: string) => {
    projectsAPI
      .delete(projectId)
      .then(() => {
        setSelectedTeamId((id) => (id === projectId ? null : id));
        setActionFeedback({ message: 'Team deleted', tone: 'warning' });
        fetchProjects();
      })
      .catch((err) =>
        setActionFeedback({
          message: parseApiError(err, 'Failed to delete team'),
          tone: 'warning',
        }),
      );
  };

  const handleSaveCalendarLink = (project: ProjectFromApi) => {
    const draft = (calendarLinkDrafts[project.id] ?? '').trim();
    projectsAPI
      .update(project.id, {
        googleCalendarEmbedUrl: draft || null,
      })
      .then(() => {
        setActionFeedback({ message: draft ? 'Team calendar link saved' : 'Team calendar link cleared', tone: 'success' });
        fetchProjects();
      })
      .catch((err) =>
        setActionFeedback({
          message: parseApiError(err, 'Failed to save calendar link'),
          tone: 'warning',
        }),
      );
  };

  if (!hasMounted) {
    return <FullScreenLoader />;
  }

  const lastDashboard = getLastDashboard();
  const showLCNavbar = resolvedRole === 'LC' || lastDashboard === '/lc';
  const showPartnerNavbar = resolvedRole === 'PARTNER' || lastDashboard === '/partner';

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      {isConsultant ? (
        <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-50">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <a href="/consultant" className="flex items-center gap-3">
                  <img src="/otcr-logo.png" alt="OTCR Consulting" className="h-10 w-auto" />
                  <span className="text-sm font-semibold text-[var(--primary)] hidden sm:inline">Consultant</span>
                </a>
                <AdminRoleSwitcher className="shrink-0" />
              </div>
            </div>
            <nav className="flex items-center gap-1 border-t border-[var(--border)] py-2">
              <a href="/consultant" className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-[var(--foreground)]/75 hover:bg-[var(--accent)] hover:text-[var(--foreground)]">
                Overview
              </a>
              <span className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-[var(--foreground)]/75 bg-[var(--accent)]">
                Teams
              </span>
            </nav>
          </div>
        </header>
      ) : showLCNavbar ? (
        <LCPartnerNavbar role="LC" currentPath="/teams" />
      ) : showPartnerNavbar ? (
        <LCPartnerNavbar role="PARTNER" currentPath="/teams" />
      ) : (
        <PMNavbar currentPath="/teams" />
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {canManageTeams && (
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-[var(--primary)]" />
                      Teams
                    </CardTitle>
                    <CardDescription>
                      {selectedTeamId ? 'Team details and members' : 'Create and manage teams. Click a team to view members and roles.'}
                    </CardDescription>
                  </div>
                  {!selectedTeamId && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="text-[var(--foreground)] shrink-0"
                      onClick={() => setCreateTeamModalOpen(true)}
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Create team
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="p-8 text-center text-sm text-[var(--foreground)]/70">Loading teams...</div>
                ) : selectedTeamId && selectedTeam ? (
                  <div className="space-y-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[var(--foreground)]"
                      onClick={() => setSelectedTeamId(null)}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Back to teams
                    </Button>
                    <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">{selectedTeam.name}</h3>
                        {canManageTeams && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600 hover:bg-rose-500/10"
                            onClick={() => handleDeleteTeam(selectedTeam.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete team
                          </Button>
                        )}
                      </div>
                      {canManageTeams && (
                        <div className="mb-4 p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]">
                          <p className="text-xs font-medium text-[var(--foreground)]/70 mb-2">Team Google Calendar embed link</p>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="url"
                              value={calendarLinkDrafts[selectedTeam.id] ?? selectedTeam.googleCalendarEmbedUrl ?? ''}
                              onChange={(e) =>
                                setCalendarLinkDrafts((prev) => ({
                                  ...prev,
                                  [selectedTeam.id]: e.target.value,
                                }))
                              }
                              placeholder="https://calendar.google.com/calendar/embed?src=..."
                              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 text-sm"
                            />
                            <Button
                              size="sm"
                              onClick={() => handleSaveCalendarLink(selectedTeam)}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      )}
                      <p className="text-xs font-medium text-[var(--foreground)]/70 mb-2">Members and roles</p>
                      <ul className="space-y-2 mb-4">
                        {(selectedTeam.members ?? []).map((m) => (
                          <li
                            key={m.user.id}
                            className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--card)] border border-[var(--border)]"
                          >
                            <span className="text-sm">
                              <span className="font-medium text-[var(--foreground)]">{m.user.email}</span>
                              <span className="text-[var(--foreground)]/60 ml-2">({getUserRole(m.user.email)})</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveMemberFromTeam(selectedTeam.id, m.user.id)}
                              className="p-1.5 rounded hover:bg-rose-500/20 text-rose-600"
                              title="Remove member"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs font-medium text-[var(--foreground)]/70 mb-2">Add member</p>
                      <input
                        type="search"
                        value={addMemberSearch}
                        onChange={(e) => setAddMemberSearch(e.target.value)}
                        placeholder="Search OTCR emails..."
                        className="w-full mb-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        {addMemberAvailableEmails.map((email) => (
                          <button
                            key={email}
                            type="button"
                            onClick={() => handleAddMemberToTeam(selectedTeam.id, email)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--accent)]"
                          >
                            <UserPlus className="w-3 h-3" />
                            {email}
                          </button>
                        ))}
                        {addMemberAvailableEmails.length === 0 && (
                          <span className="text-sm text-[var(--foreground)]/60">
                            {allowedEmails.filter((e) => !selectedMemberEmails.includes(e)).length === 0
                              ? 'All allowed users are in this team.'
                              : 'No matches for your search.'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {projects.length === 0 ? (
                      <div className="p-8 rounded-xl border border-dashed border-[var(--border)] text-center">
                        <p className="text-sm text-[var(--foreground)]/70">
                          No teams yet. Use &quot;Create team&quot; above to add your first team and assign members.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {projects.map((project) => {
                          const count = getMemberEmails(project).length;
                          return (
                            <div
                              key={project.id}
                              className={cn(
                                'flex items-center gap-3 p-4 rounded-xl border transition-all',
                                'bg-[var(--secondary)]/60 border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--secondary)]'
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedTeamId(project.id)}
                                className="flex-1 min-w-0 text-left flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2">
                                  <Users className="w-4 h-4 text-[var(--primary)] shrink-0" />
                                  <span className="font-semibold">{project.name}</span>
                                  <span className="text-xs text-[var(--foreground)]/60">
                                    {count} member{count !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-[var(--foreground)]/50 shrink-0" />
                              </button>
                              {canManageTeams && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteTeam(project.id);
                                  }}
                                  className="p-2 rounded-lg hover:bg-rose-500/20 text-rose-600 shrink-0"
                                  title="Delete team"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {isConsultant && (
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-[var(--primary)]" />
                  Your team
                </CardTitle>
                <CardDescription>
                  View your team and its members. Only PM and Lead Consultant can create or edit teams.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!myTeam ? (
                  <div className="p-8 rounded-xl border border-dashed border-[var(--border)] text-center text-sm text-[var(--foreground)]/70">
                    You are not assigned to a team yet. Ask a PM or Lead Consultant to add you to a team.
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60">
                    <h3 className="text-lg font-semibold mb-3">{myTeam.name}</h3>
                    <p className="text-xs font-medium text-[var(--foreground)]/70 mb-2">Members and roles</p>
                    <ul className="space-y-2">
                      {(myTeam.members ?? []).map((m) => (
                        <li
                          key={m.user.id}
                          className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--card)] border border-[var(--border)]"
                        >
                          <span className="text-sm">
                            <span className="font-medium text-[var(--foreground)]">{m.user.email}</span>
                            <span className="text-[var(--foreground)]/60 ml-2">({getUserRole(m.user.email)})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isPartner && (
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-[var(--primary)]" />
                  Teams (Read only)
                </CardTitle>
                <CardDescription>
                  View teams and members. Partners cannot create or edit teams.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="p-8 text-center text-sm text-[var(--foreground)]/70">Loading teams...</div>
                ) : selectedTeamId && selectedTeam ? (
                  <div className="space-y-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[var(--foreground)]"
                      onClick={() => setSelectedTeamId(null)}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Back to teams
                    </Button>
                    <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60">
                      <h3 className="text-lg font-semibold mb-3">{selectedTeam.name}</h3>
                      <p className="text-xs font-medium text-[var(--foreground)]/70 mb-2">Members and roles</p>
                      <ul className="space-y-2">
                        {(selectedTeam.members ?? []).map((m) => (
                          <li
                            key={m.user.id}
                            className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--card)] border border-[var(--border)]"
                          >
                            <span className="text-sm">
                              <span className="font-medium text-[var(--foreground)]">{m.user.email}</span>
                              <span className="text-[var(--foreground)]/60 ml-2">({getUserRole(m.user.email)})</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : projects.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-[var(--border)] text-center">
                    <p className="text-sm text-[var(--foreground)]/70">No teams available.</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {projects.map((project) => {
                      const count = getMemberEmails(project).length;
                      return (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => setSelectedTeamId(project.id)}
                          className={cn(
                            'w-full text-left flex items-center justify-between gap-2 p-4 rounded-xl border transition-all',
                            'bg-[var(--secondary)]/60 border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--secondary)]',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-[var(--primary)] shrink-0" />
                            <span className="font-semibold">{project.name}</span>
                            <span className="text-xs text-[var(--foreground)]/60">
                              {count} member{count !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[var(--foreground)]/50 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

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
              <span>{actionFeedback.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        isOpen={createTeamModalOpen}
        onClose={() => {
          setCreateTeamModalOpen(false);
          setCreateTeamForm({ name: '', selectedEmails: [], search: '' });
        }}
        title="Create team"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold">Team name</label>
            <input
              value={createTeamForm.name}
              onChange={(e) => setCreateTeamForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              placeholder="e.g. Market Research Team"
            />
          </div>
          <div>
            <label className="text-sm font-semibold">Add members (OTCR list)</label>
            <p className="text-xs text-[var(--foreground)]/60 mt-1 mb-2">Search and select emails to add to the team</p>
            <input
              type="search"
              value={createTeamForm.search}
              onChange={(e) => setCreateTeamForm((prev) => ({ ...prev, search: e.target.value }))}
              placeholder="Search by email..."
              className="w-full mb-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)] placeholder:text-[var(--foreground)]/50"
            />
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50">
              {createModalAvailableEmails.map((email) => (
                <button
                  key={email}
                  type="button"
                  onClick={() => toggleTeamMember(email)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm border transition-all',
                    createTeamForm.selectedEmails.includes(email)
                      ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]'
                      : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                  )}
                >
                  {createTeamForm.selectedEmails.includes(email) ? '✓ ' : ''}{email}
                </button>
              ))}
              {createModalAvailableEmails.length === 0 && (
                <span className="text-sm text-[var(--foreground)]/60 py-2">No emails match your search.</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setCreateTeamModalOpen(false);
                setCreateTeamForm({ name: '', selectedEmails: [], search: '' });
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateTeam} disabled={!createTeamForm.name.trim()} className="text-[var(--foreground)]">
              <UserPlus className="w-4 h-4 mr-2" />
              Create team
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
