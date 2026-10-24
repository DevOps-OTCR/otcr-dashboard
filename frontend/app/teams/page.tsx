'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  UserMinus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  RefreshCw,
  FileText,
  Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { getEffectiveRole, getUserRole, type AppRole } from '@/lib/permissions';
import { AppNavbar } from '@/components/AppNavbar';
import { useRouter } from 'next/navigation';
import { projectsAPI, authAPI, attendanceAPI, deliverablesAPI, remindersAPI, setAuthToken, type AttendanceEventCategory } from '@/lib/api';
import {
  canConfigureReminders,
  summarizeReminderRecipients,
  validateReminderOffsets,
  type ReminderRecipientGroup,
} from '@/lib/reminders-config';
import { useAuth } from '@/components/AuthContext';
import { PageLoading } from '@/components/PageLoading';
import { parseDashPrefixedDeliverables } from '@/lib/deliverables-parser';
import { buildSprintDeadlineInChicago } from '@/lib/sprint-deadlines';
import { DeliveryReminderOverrides } from './DeliveryReminderOverrides';
import { useNavigationSnapshot } from '@/lib/use-navigation-snapshot';

type ProjectMember = { user: { id: string; email: string; firstName?: string; lastName?: string; role?: string } };
type ProjectFromApi = {
  id: string;
  name: string;
  status?: string;
  createdAt: string;
  googleCalendarId?: string | null;
  members?: ProjectMember[];
};

type SprintConfig = {
  id: string;
  sprintStartDay: string;
  initialSlideDueDay: string;
  finalSlideDueDay: string;
  defaultDueTime: string;
  sprintTimezone: string;
  autoGenerateSprints: boolean;
  updatedAt?: string;
};

type ReminderOffsetPreset = { minutes: number; label: string };
type ReminderConfig = { enabled: boolean; offsetsMinutes: number[]; timezone: string };

type SprintDeliverable = {
  id: string;
  title: string;
  deadline: string;
  templateKind?: string;
  dueDateSource?: string;
  status?: string;
  completed?: boolean;
  assignee?: {
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  } | null;
};

type SprintRecord = {
  id: string;
  label: string;
  sequenceNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  deliverables?: SprintDeliverable[];
};

type AttendanceHistoryEvent = {
  id: string;
  title: string;
  eventDate: string;
  audienceScope: 'TEAM' | 'GLOBAL';
  projectId: string | null;
  projectName: string | null;
  locationType: 'ONLINE' | 'IN_PERSON';
  locationLabel: string | null;
  category: AttendanceEventCategory;
  createdByName: string;
  attended: boolean;
  checkedInAt: string | null;
  verificationMethod: 'GEOFENCE' | 'CODE' | null;
};

type MemberAttendanceHistory = {
  member: {
    id: string;
    email: string;
    name: string;
  };
  team: {
    attended: AttendanceHistoryEvent[];
    missed: AttendanceHistoryEvent[];
  };
  firmwide: {
    attended: AttendanceHistoryEvent[];
    missed: AttendanceHistoryEvent[];
  };
};

type HistoryFilter = 'TEAM' | 'FIRMWIDE';

const WEEKDAY_OPTIONS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

const DEFAULT_SPRINT_CONFIG: Omit<SprintConfig, 'id'> = {
  sprintStartDay: 'MONDAY',
  initialSlideDueDay: 'TUESDAY',
  finalSlideDueDay: 'THURSDAY',
  defaultDueTime: '23:59',
  sprintTimezone: 'America/Chicago',
  autoGenerateSprints: true,
};

const ATTENDANCE_CATEGORY_LABELS: Record<AttendanceEventCategory, string> = {
  CLIENT_CALL: 'Client call',
  TEAM_MEETING: 'Team meeting',
  FIRMWIDE_EVENT: 'Firmwide event',
  SOCIAL: 'Social',
};

function getMemberEmails(project: ProjectFromApi): string[] {
  return project.members?.map((m) => m.user.email) ?? [];
}

function parseApiError(err: any, fallback: string): string {
  const message = err?.response?.data?.message ?? err?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : String(message);
}

function buildCustomDeliverableDeadline(sprint: SprintRecord, dueTime: string): string {
  return buildSprintDeadlineInChicago(sprint.weekEndDate, dueTime);
}

function formatAssigneeLabel(
  assignee?: { email?: string; firstName?: string; lastName?: string } | null,
): string {
  if (!assignee) return 'Unassigned';
  const name = [assignee.firstName, assignee.lastName].filter(Boolean).join(' ').trim();
  return name || 'Assigned';
}

function formatMemberName(member: ProjectMember['user']): string {
  const fullName = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
  return fullName || 'Team member';
}

function TeamDeliverableCard({
  deliverable,
  sprintStatus,
  currentUserEmail,
  onToggleAssign,
}: {
  deliverable: SprintDeliverable;
  sprintStatus: string;
  currentUserEmail?: string | null;
  onToggleAssign: (deliverable: SprintDeliverable) => void;
}) {
  const assignedToCurrentUser = Boolean(
    deliverable.assignee?.email &&
      currentUserEmail &&
      deliverable.assignee.email.toLowerCase() === currentUserEmail.toLowerCase(),
  );
  const isReleased = sprintStatus === 'RELEASED';

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{deliverable.title}</p>
          <p className="text-xs text-[var(--foreground)]/55 mt-1">
            {new Date(deliverable.deadline).toLocaleString()}
          </p>
        </div>
        <span
          className={cn(
            'text-[11px] uppercase tracking-wide rounded-full px-2 py-1',
            isReleased
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
          )}
        >
          {isReleased ? 'final' : 'draft'}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--foreground)]/65">
          {formatAssigneeLabel(deliverable.assignee)}
        </p>
        <Button size="sm" variant={assignedToCurrentUser ? 'outline' : 'primary'} onClick={() => onToggleAssign(deliverable)}>
          {assignedToCurrentUser ? 'Unassign' : 'Assign'}
        </Button>
      </div>
    </div>
  );
}

export default function TeamsPage() {
  const session = useAuth();
  const router = useRouter();
  const { snapshot, saveSnapshot } = useNavigationSnapshot<{
    role: AppRole; projects: ProjectFromApi[]; allowedEmails: string[]; selectedTeamId: string | null;
    sprintsFor: string | null; teamSprints: SprintRecord[]; selectedSprintId: string; sprintConfigDraft: typeof DEFAULT_SPRINT_CONFIG;
  }>('teams', session.user?.email);
  const [role, setRole] = useState<AppRole>(() => snapshot?.role ?? getUserRole(session.user?.email));
  const [projects, setProjects] = useState<ProjectFromApi[]>(snapshot?.projects ?? []);
  const [allowedEmails, setAllowedEmails] = useState<string[]>(snapshot?.allowedEmails ?? []);
  const [loading, setLoading] = useState(!snapshot);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(snapshot?.selectedTeamId ?? null);
  const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false);
  const [createTeamForm, setCreateTeamForm] = useState({
    name: '',
    googleCalendarId: '',
    selectedEmails: [] as string[],
    search: '',
  });
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [teamCalendarIdDraft, setTeamCalendarIdDraft] = useState('');
  const [teamCalendarIdSaving, setTeamCalendarIdSaving] = useState(false);
  const [sprintConfigDraft, setSprintConfigDraft] = useState(snapshot?.sprintConfigDraft ?? DEFAULT_SPRINT_CONFIG);
  const [sprintDataLoading, setSprintDataLoading] = useState(false);
  const [sprintConfigSaving, setSprintConfigSaving] = useState(false);
  const [sprintGenerationLoading, setSprintGenerationLoading] = useState(false);
  const [teamSprints, setTeamSprints] = useState<SprintRecord[]>(snapshot?.teamSprints ?? []);
  const [selectedSprintId, setSelectedSprintId] = useState<string>(snapshot?.selectedSprintId ?? '');
  // The team whose sprint data is shown; a failed refresh for that team keeps it visible.
  const sprintsFor = useRef(snapshot?.sprintsFor ?? null);
  const [draftDeliverablesInput, setDraftDeliverablesInput] = useState('');
  const [draftDeliverablesSaving, setDraftDeliverablesSaving] = useState(false);
  const [memberHistoryOpen, setMemberHistoryOpen] = useState(false);
  const [memberHistoryLoading, setMemberHistoryLoading] = useState(false);
  const [memberHistoryFilter, setMemberHistoryFilter] = useState<HistoryFilter>('TEAM');
  const [memberHistory, setMemberHistory] = useState<MemberAttendanceHistory | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; tone: 'success' | 'warning' | 'info' } | null>(null);

  const [reminderPresets, setReminderPresets] = useState<ReminderOffsetPreset[]>([]);
  const [reminderConfig, setReminderConfig] = useState<ReminderConfig | null>(null);
  const [reminderDraft, setReminderDraft] = useState<{ enabled: boolean; offsetsMinutes: number[] }>({
    enabled: false,
    offsetsMinutes: [],
  });
  const [reminderRecipients, setReminderRecipients] = useState<ReminderRecipientGroup[]>([]);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderSaving, setReminderSaving] = useState(false);
  const reminderScope = useRef<string | null>(null);
  const [loadedReminderProject, setLoadedReminderProject] = useState<string | null>(null);

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
      // Keep previously loaded teams visible when a refresh fails.
    } finally {
      setLoading(false);
    }
  }, [session]);

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
        // Keep the previously loaded directory when a refresh fails.
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

  const resolvedRole = role;
  const canManageTeams =
    resolvedRole === 'PM' ||
    resolvedRole === 'LC' ||
    resolvedRole === 'ADMIN';
  const canConfigureRemindersForTeam = canManageTeams && canConfigureReminders(resolvedRole);
  const canEditTeamCalendar = resolvedRole === 'PM' || resolvedRole === 'ADMIN';
  const canInspectMemberAttendance =
    resolvedRole === 'PM' || resolvedRole === 'PARTNER' || resolvedRole === 'EXECUTIVE' || resolvedRole === 'ADMIN';
  const isConsultant = resolvedRole === 'CONSULTANT';
  const isExecutive = resolvedRole === 'EXECUTIVE';
  const isPartnerLike = resolvedRole === 'PARTNER' || isExecutive;
  const currentUserEmail = session.user?.email ?? null;

  const myTeam =
    currentUserEmail && isConsultant
      ? projects.find((p) => getMemberEmails(p).includes(currentUserEmail))
      : null;
  const selectedTeam = selectedTeamId ? projects.find((p) => p.id === selectedTeamId) : null;
  const selectedMemberEmails = selectedTeam ? getMemberEmails(selectedTeam) : [];

  useEffect(() => {
    if (session.loading || !session.isLoggedIn || !actionFeedback) return;
    const timer = setTimeout(() => setActionFeedback(null), 2400);
    return () => clearTimeout(timer);
  }, [session.loading, session.isLoggedIn, actionFeedback]);

  useEffect(() => {
    if (session.loading || !session.isLoggedIn) return;
    setTeamCalendarIdDraft(selectedTeam?.googleCalendarId ?? '');
  }, [session.loading, session.isLoggedIn, selectedTeam?.id, selectedTeam?.googleCalendarId]);

  const loadSelectedTeamSprintData = useCallback(async (projectId: string) => {
    // Refresh restored sprint data in place; show the loader only for another team.
    if (sprintsFor.current !== projectId) setSprintDataLoading(true);
    try {
      const token = await session.getToken();
      if (token) {
        setAuthToken(token);
      }

      const [configRes, sprintsRes] = await Promise.all([
        projectsAPI.getSprintConfig(projectId),
        projectsAPI.getSprints(projectId),
      ]);

      const incomingConfig = configRes.data as SprintConfig;
      setSprintConfigDraft({
        sprintStartDay: incomingConfig?.sprintStartDay ?? DEFAULT_SPRINT_CONFIG.sprintStartDay,
        initialSlideDueDay:
          incomingConfig?.initialSlideDueDay ?? DEFAULT_SPRINT_CONFIG.initialSlideDueDay,
        finalSlideDueDay: incomingConfig?.finalSlideDueDay ?? DEFAULT_SPRINT_CONFIG.finalSlideDueDay,
        defaultDueTime: incomingConfig?.defaultDueTime ?? DEFAULT_SPRINT_CONFIG.defaultDueTime,
        sprintTimezone: incomingConfig?.sprintTimezone ?? DEFAULT_SPRINT_CONFIG.sprintTimezone,
        autoGenerateSprints:
          incomingConfig?.autoGenerateSprints ?? DEFAULT_SPRINT_CONFIG.autoGenerateSprints,
      });
      const nextSprints = (sprintsRes.data ?? []) as SprintRecord[];
      sprintsFor.current = projectId;
      setTeamSprints(nextSprints);
      setSelectedSprintId((current) =>
        current && nextSprints.some((item) => item.id === current)
          ? current
          : nextSprints[0]?.id ?? '',
      );
    } catch (err) {
      if (sprintsFor.current !== projectId) {
        sprintsFor.current = null;
        setSprintConfigDraft(DEFAULT_SPRINT_CONFIG);
        setTeamSprints([]);
        setSelectedSprintId('');
      }
      setActionFeedback({
        message: parseApiError(err, 'Failed to load sprint settings'),
        tone: 'warning',
      });
    } finally {
      setSprintDataLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session.loading || !session.isLoggedIn) return;
    if (!selectedTeamId || !canManageTeams) {
      sprintsFor.current = null;
      setSprintConfigDraft(DEFAULT_SPRINT_CONFIG);
      setTeamSprints([]);
      setSelectedSprintId('');
      return;
    }

    void loadSelectedTeamSprintData(selectedTeamId);
  }, [session.loading, session.isLoggedIn, selectedTeamId, canManageTeams, loadSelectedTeamSprintData]);

  const fetchReminderData = useCallback(async (projectId: string) => {
    const token = await session.getToken();
    if (token) setAuthToken(token);
    return Promise.all([
      remindersAPI.getPresets(projectId),
      remindersAPI.getConfig(projectId),
      remindersAPI.getRecipients(projectId),
      // Warm the status cache before the child mounts or the user navigates away.
      remindersAPI.getStatus(projectId).catch(() => undefined),
    ]);
  }, [session]);

  const applyReminderData = useCallback((projectId: string, [presetsRes, configRes, recipientsRes]: Awaited<ReturnType<typeof fetchReminderData>>) => {
    if (reminderScope.current !== projectId) return;
    const config = configRes.data as ReminderConfig;
    setLoadedReminderProject(projectId);
    setReminderPresets((presetsRes.data?.presets ?? []) as ReminderOffsetPreset[]);
    setReminderConfig(config);
    setReminderDraft({ enabled: config.enabled, offsetsMinutes: config.offsetsMinutes });
    setReminderRecipients((recipientsRes.data ?? []) as ReminderRecipientGroup[]);
  }, []);

  const loadReminderData = useCallback(async (projectId: string) => {
    setReminderLoading(true);
    try { applyReminderData(projectId, await fetchReminderData(projectId)); }
    catch (error) { setActionFeedback({ message: parseApiError(error, 'Failed to load reminder settings'), tone: 'warning' }); }
    finally { setReminderLoading(false); }
  }, [fetchReminderData, applyReminderData]);

  useEffect(() => {
    reminderScope.current = selectedTeamId;
    if (session.loading || !session.isLoggedIn || !selectedTeamId || !canConfigureRemindersForTeam) return;
    let current = true;
    fetchReminderData(selectedTeamId).then(data => {
      if (current) applyReminderData(selectedTeamId, data);
    }).catch(error => {
      if (current) setActionFeedback({ message: parseApiError(error, 'Failed to load reminder settings'), tone: 'warning' });
    });
    return () => { current = false; };
  }, [session.loading, session.isLoggedIn, selectedTeamId, canConfigureRemindersForTeam, fetchReminderData, applyReminderData]);

  const handleToggleReminderOffset = (minutes: number) => {
    setReminderDraft((prev) => {
      const has = prev.offsetsMinutes.includes(minutes);
      return {
        ...prev,
        offsetsMinutes: has
          ? prev.offsetsMinutes.filter((m) => m !== minutes)
          : [...prev.offsetsMinutes, minutes],
      };
    });
  };

  const handleSaveReminderConfig = async () => {
    if (!selectedTeam || loadedReminderProject !== selectedTeam.id) return;

    // Client-side validation: enabling requires at least one timing, and the
    // selection must survive preset validation (mirrors the backend rules).
    const { offsets } = validateReminderOffsets(reminderDraft.offsetsMinutes, reminderPresets);
    if (reminderDraft.enabled && offsets.length === 0) {
      setActionFeedback({
        message: 'Select at least one reminder time before enabling reminders.',
        tone: 'warning',
      });
      return;
    }

    setReminderSaving(true);
    try {
      const res = await remindersAPI.updateConfig(selectedTeam.id, {
        enabled: reminderDraft.enabled,
        offsetsMinutes: offsets,
      });
      if (reminderScope.current !== selectedTeam.id) return;
      const saved = res.data as ReminderConfig;
      setReminderConfig(saved);
      setReminderDraft({
        enabled: Boolean(saved?.enabled),
        offsetsMinutes: Array.isArray(saved?.offsetsMinutes) ? saved.offsetsMinutes : [],
      });
      // Refresh recipients so the preview reflects the saved state.
      await loadReminderData(selectedTeam.id);
      setActionFeedback({ message: 'Deadline reminders saved', tone: 'success' });
    } catch (err) {
      setActionFeedback({
        message: parseApiError(err, 'Failed to save reminder settings'),
        tone: 'warning',
      });
    } finally {
      setReminderSaving(false);
    }
  };

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
  const selectedSprint = teamSprints.find((sprint) => sprint.id === selectedSprintId) ?? null;
  const parsedDraftDeliverables = parseDashPrefixedDeliverables(draftDeliverablesInput);

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
    projectsAPI
      .create({
        name: createTeamForm.name.trim(),
        googleCalendarId: createTeamForm.googleCalendarId.trim() || null,
        startDate: new Date().toISOString().slice(0, 10),
        memberEmails: createTeamForm.selectedEmails,
      })
      .then(() => {
        setCreateTeamForm({ name: '', googleCalendarId: '', selectedEmails: [], search: '' });
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

  const handleSaveTeamCalendarId = async () => {
    if (!selectedTeam) return;

    setTeamCalendarIdSaving(true);
    try {
      await projectsAPI.update(selectedTeam.id, {
        googleCalendarId: teamCalendarIdDraft.trim() || null,
      });
      await fetchProjects();
      setActionFeedback({ message: 'Team calendar saved', tone: 'success' });
    } catch (err) {
      setActionFeedback({
        message: parseApiError(err, 'Failed to save team calendar'),
        tone: 'warning',
      });
    } finally {
      setTeamCalendarIdSaving(false);
    }
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

  const handleOpenMemberHistory = async (member: ProjectMember['user']) => {
    if (!selectedTeam || !canInspectMemberAttendance) return;

    setMemberHistoryOpen(true);
    setMemberHistoryLoading(true);
    setMemberHistoryFilter('TEAM');
    setMemberHistory(null);

    try {
      const response = await attendanceAPI.getMemberHistory(member.id, selectedTeam.id);
      setMemberHistory(response.data as MemberAttendanceHistory);
    } catch (err) {
      setMemberHistory(null);
      setActionFeedback({
        message: parseApiError(err, 'Failed to load member attendance history'),
        tone: 'warning',
      });
    } finally {
      setMemberHistoryLoading(false);
    }
  };

  const handleSaveSprintConfig = async () => {
    if (!selectedTeam) return;

    setSprintConfigSaving(true);
    try {
      const res = await projectsAPI.updateSprintConfig(selectedTeam.id, sprintConfigDraft);
      setSprintConfigDraft({
        sprintStartDay: res.data?.sprintStartDay ?? sprintConfigDraft.sprintStartDay,
        initialSlideDueDay: res.data?.initialSlideDueDay ?? sprintConfigDraft.initialSlideDueDay,
        finalSlideDueDay: res.data?.finalSlideDueDay ?? sprintConfigDraft.finalSlideDueDay,
        defaultDueTime: res.data?.defaultDueTime ?? sprintConfigDraft.defaultDueTime,
        sprintTimezone: res.data?.sprintTimezone ?? sprintConfigDraft.sprintTimezone,
        autoGenerateSprints: res.data?.autoGenerateSprints ?? sprintConfigDraft.autoGenerateSprints,
      });
      setActionFeedback({ message: 'Sprint schedule saved', tone: 'success' });
    } catch (err) {
      setActionFeedback({
        message: parseApiError(err, 'Failed to save sprint settings'),
        tone: 'warning',
      });
    } finally {
      setSprintConfigSaving(false);
    }
  };

  const handleGenerateSprint = async () => {
    if (!selectedTeam) return;

    setSprintGenerationLoading(true);
    try {
      await projectsAPI.generateNextSprint(selectedTeam.id);
      setSelectedSprintId('');
      await loadSelectedTeamSprintData(selectedTeam.id);
      setActionFeedback({ message: 'Next sprint generated', tone: 'success' });
    } catch (err) {
      setActionFeedback({
        message: parseApiError(err, 'Failed to generate next sprint'),
        tone: 'warning',
      });
    } finally {
      setSprintGenerationLoading(false);
    }
  };

  const handleSaveDraftDeliverables = async () => {
    if (!selectedTeam || !selectedSprint || parsedDraftDeliverables.length === 0) return;

    setDraftDeliverablesSaving(true);
    try {
      await Promise.all(
        parsedDraftDeliverables.map((item) =>
          deliverablesAPI.create({
            projectId: selectedTeam.id,
            sprintId: selectedSprint.id,
            title: item.title,
            description: 'Draft deliverable created from teams page.',
            type: 'OTHER',
            deadline: buildCustomDeliverableDeadline(selectedSprint, sprintConfigDraft.defaultDueTime),
          }),
        ),
      );
      setDraftDeliverablesInput('');
      await loadSelectedTeamSprintData(selectedTeam.id);
      setActionFeedback({ message: 'Draft deliverables saved', tone: 'success' });
    } catch (err) {
      setActionFeedback({
        message: parseApiError(err, 'Failed to save draft deliverables'),
        tone: 'warning',
      });
    } finally {
      setDraftDeliverablesSaving(false);
    }
  };

  const handleUpdateSprintVisibility = async (status: 'DRAFT' | 'RELEASED') => {
    if (!selectedTeam || !selectedSprint) return;

    try {
      await projectsAPI.updateSprintStatus(selectedTeam.id, selectedSprint.id, status);
      await loadSelectedTeamSprintData(selectedTeam.id);
      setActionFeedback({
        message: status === 'RELEASED' ? 'Sprint released to the team' : 'Sprint moved back to draft',
        tone: 'success',
      });
    } catch (err) {
      setActionFeedback({
        message: parseApiError(err, 'Failed to update sprint visibility'),
        tone: 'warning',
      });
    }
  };

  const handleToggleDeliverableAssignment = async (deliverable: SprintDeliverable) => {
    if (!selectedTeam) return;

    try {
      const currentEmail = session.user?.email ?? '';
      const isAssignedToCurrentUser =
        Boolean(deliverable.assignee?.email) &&
        deliverable.assignee?.email?.toLowerCase() === currentEmail.toLowerCase();
      await deliverablesAPI.updateAssignment(deliverable.id, !isAssignedToCurrentUser);
      await loadSelectedTeamSprintData(selectedTeam.id);
      setActionFeedback({
        message: isAssignedToCurrentUser ? 'Deliverable unassigned' : 'Deliverable assigned',
        tone: 'success',
      });
    } catch (err) {
      setActionFeedback({
        message: parseApiError(err, 'Failed to update assignment'),
        tone: 'warning',
      });
    }
  };

  useEffect(() => {
    if (!loading) {
      saveSnapshot({ role, projects, allowedEmails, selectedTeamId, sprintsFor: sprintsFor.current,
        teamSprints, selectedSprintId, sprintConfigDraft });
    }
  }, [loading, role, projects, allowedEmails, selectedTeamId, teamSprints, selectedSprintId, sprintConfigDraft, saveSnapshot]);

  if (session.loading || !session.isLoggedIn) {
    return <PageLoading />;
  }

  const formatDateRange = (start?: string, end?: string) => {
    if (!start || !end) return 'Dates unavailable';
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return 'Dates unavailable';
    }
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    });
    return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
  };
  const labelForWeekday = (value: string) =>
    value.charAt(0) + value.slice(1).toLowerCase();
  const activeHistoryBuckets =
    memberHistoryFilter === 'TEAM'
      ? memberHistory?.team ?? { attended: [], missed: [] }
      : memberHistory?.firmwide ?? { attended: [], missed: [] };

  const renderHistoryCard = (event: AttendanceHistoryEvent, variant: 'attended' | 'missed') => (
    <div key={event.id} className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{event.title}</p>
          <p className="text-xs text-[var(--foreground)]/60 mt-1">
            {new Date(event.eventDate).toLocaleString()}
          </p>
        </div>
        <Badge variant={variant === 'attended' ? 'success' : 'warning'}>
          {variant === 'attended' ? 'Attended' : 'Missed'}
        </Badge>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="info">{ATTENDANCE_CATEGORY_LABELS[event.category]}</Badge>
        <Badge variant={event.locationType === 'ONLINE' ? 'default' : 'purple'}>
          {event.locationType === 'ONLINE' ? 'Online' : 'In person'}
        </Badge>
      </div>
      <p className="text-xs text-[var(--foreground)]/65">
        Created by {event.createdByName}
      </p>
      {event.projectName && (
        <p className="text-xs text-[var(--foreground)]/65">
          Team: {event.projectName}
        </p>
      )}
      {variant === 'attended' && event.checkedInAt && (
        <p className="text-xs text-[var(--foreground)]/65">
          Checked in {new Date(event.checkedInAt).toLocaleString()}
        </p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      <AppNavbar role={resolvedRole} currentPath="/teams" />

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
                            className="text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                            onClick={() => handleDeleteTeam(selectedTeam.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete team
                          </Button>
                        )}
                      </div>
                      {canManageTeams && (
                        <>
                          <div className="mb-4 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-4">

                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold flex items-center gap-2">
                                <CalendarDays className="w-4 h-4 text-[var(--primary)]" />
                                Sprint deliverables schedule
                              </p>
                              <p className="text-xs text-[var(--foreground)]/60 mt-1">
                                Configure weekly due days here for this team. New sprints auto-fill Initial and Final Slides from these settings.
                              </p>
                            </div>
                            <p className="max-w-[280px] text-right text-xs text-[var(--foreground)]/60">
                              Generate sprints, manage draft deliverables, and release weeks from the Deliverables page.
                            </p>
                          </div>

                          {sprintDataLoading ? (
                            <div className="text-sm text-[var(--foreground)]/60">Loading sprint settings...</div>
                          ) : (
                            <>
                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="space-y-1 text-sm">
                                  <span className="font-medium text-[var(--foreground)]">Sprint starts on</span>
                                  <select
                                    value={sprintConfigDraft.sprintStartDay}
                                    onChange={(e) =>
                                      setSprintConfigDraft((prev) => ({
                                        ...prev,
                                        sprintStartDay: e.target.value,
                                      }))
                                    }
                                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                                  >
                                    {WEEKDAY_OPTIONS.map((day) => (
                                      <option key={day} value={day}>
                                        {labelForWeekday(day)}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="space-y-1 text-sm">
                                  <span className="font-medium text-[var(--foreground)]">Default due time</span>
                                  <input
                                    type="time"
                                    value={sprintConfigDraft.defaultDueTime}
                                    onChange={(e) =>
                                      setSprintConfigDraft((prev) => ({
                                        ...prev,
                                        defaultDueTime: e.target.value,
                                      }))
                                    }
                                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                                  />
                                </label>

                                <label className="space-y-1 text-sm">
                                  <span className="font-medium text-[var(--foreground)]">Initial Slides due day</span>
                                  <select
                                    value={sprintConfigDraft.initialSlideDueDay}
                                    onChange={(e) =>
                                      setSprintConfigDraft((prev) => ({
                                        ...prev,
                                        initialSlideDueDay: e.target.value,
                                      }))
                                    }
                                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                                  >
                                    {WEEKDAY_OPTIONS.map((day) => (
                                      <option key={day} value={day}>
                                        {labelForWeekday(day)}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="space-y-1 text-sm">
                                  <span className="font-medium text-[var(--foreground)]">Final Slides due day</span>
                                  <select
                                    value={sprintConfigDraft.finalSlideDueDay}
                                    onChange={(e) =>
                                      setSprintConfigDraft((prev) => ({
                                        ...prev,
                                        finalSlideDueDay: e.target.value,
                                      }))
                                    }
                                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                                  >
                                    {WEEKDAY_OPTIONS.map((day) => (
                                      <option key={day} value={day}>
                                        {labelForWeekday(day)}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="space-y-1 text-sm md:col-span-2">
                                  <span className="font-medium text-[var(--foreground)]">Timezone</span>
                                  <input
                                    type="text"
                                    value={sprintConfigDraft.sprintTimezone}
                                    onChange={(e) =>
                                      setSprintConfigDraft((prev) => ({
                                        ...prev,
                                        sprintTimezone: e.target.value,
                                      }))
                                    }
                                    placeholder="America/Chicago"
                                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                                  />
                                </label>
                              </div>

                              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                                <input
                                  type="checkbox"
                                  checked={sprintConfigDraft.autoGenerateSprints}
                                  onChange={(e) =>
                                    setSprintConfigDraft((prev) => ({
                                      ...prev,
                                      autoGenerateSprints: e.target.checked,
                                    }))
                                  }
                                  className="rounded border-[var(--border)]"
                                />
                                Auto-generate weekly sprint templates for this team
                              </label>

                              <div className="flex flex-wrap items-center gap-3">
                                <Button
                                  size="sm"
                                  onClick={handleSaveSprintConfig}
                                  disabled={sprintConfigSaving}
                                >
                                  {sprintConfigSaving ? 'Saving...' : 'Save sprint schedule'}
                                </Button>
                                <p className="text-xs text-[var(--foreground)]/60">
                                  Current pattern: Initial Slides every {labelForWeekday(sprintConfigDraft.initialSlideDueDay)} at {sprintConfigDraft.defaultDueTime}, Final Slides every {labelForWeekday(sprintConfigDraft.finalSlideDueDay)} at {sprintConfigDraft.defaultDueTime}.
                                </p>
                              </div>

                              <div className="rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--foreground)]/60">
                                {teamSprints.length === 0
                                  ? 'No sprints generated yet. Use the Deliverables page when you are ready to create the first sprint.'
                                  : `${teamSprints.length} sprint${teamSprints.length === 1 ? '' : 's'} already exist for this team. Use the Deliverables page to manage them.`}
                              </div>
                            </>
                          )}
                        </div>

                        {canConfigureRemindersForTeam && (
                          <div className="mb-4 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-4">
                            <div>
                              <p className="text-sm font-semibold flex items-center gap-2">
                                <Bell className="w-4 h-4 text-[var(--primary)]" />
                                Automatic deadline reminders
                              </p>
                              <p className="text-xs text-[var(--foreground)]/60 mt-1">
                                Send Slack reminders to each deliverable&apos;s active assignees before the deadline.
                                {reminderConfig?.timezone
                                  ? ` Times are shown in ${reminderConfig.timezone}.`
                                  : ' Times default to America/Chicago.'}
                              </p>
                            </div>

                            {reminderLoading || loadedReminderProject !== selectedTeamId ? (
                              <div className="text-sm text-[var(--foreground)]/60">Loading reminder settings...</div>
                            ) : (
                              <>
                                <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                                  <input
                                    type="checkbox"
                                    checked={reminderDraft.enabled}
                                    onChange={(e) =>
                                      setReminderDraft((prev) => ({ ...prev, enabled: e.target.checked }))
                                    }
                                    className="rounded border-[var(--border)]"
                                  />
                                  Enable automatic deadline reminders for this team
                                </label>

                                <div className="space-y-2">
                                  <span className="text-sm font-medium text-[var(--foreground)]">Reminder timing</span>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {reminderPresets.map((preset) => {
                                      const checked = reminderDraft.offsetsMinutes.includes(preset.minutes);
                                      return (
                                        <label
                                          key={preset.minutes}
                                          className="flex items-center gap-2 text-sm text-[var(--foreground)]"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => handleToggleReminderOffset(preset.minutes)}
                                            disabled={!reminderDraft.enabled}
                                            className="rounded border-[var(--border)]"
                                          />
                                          {preset.label}
                                        </label>
                                      );
                                    })}
                                  </div>
                                  {reminderDraft.enabled && reminderDraft.offsetsMinutes.length === 0 && (
                                    <p className="text-xs text-amber-600">
                                      Select at least one reminder time, or reminders will not be scheduled.
                                    </p>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <span className="text-sm font-medium text-[var(--foreground)]">
                                    Who will be reminded
                                  </span>
                                  {(() => {
                                    const summary = summarizeReminderRecipients(reminderRecipients);
                                    if (summary.totalRecipients === 0) {
                                      return (
                                        <p className="text-xs text-[var(--foreground)]/60">
                                          No active assignees on pending deliverables yet. Reminders go to each
                                          deliverable&apos;s active assignees only.
                                        </p>
                                      );
                                    }
                                    return (
                                      <div className="space-y-2">
                                        <p className="text-xs text-[var(--foreground)]/60">
                                          {summary.totalRecipients} {summary.totalRecipients === 1 ? 'person' : 'people'} across pending deliverables.
                                        </p>
                                        {summary.unassignedDeliverables.length > 0 && (
                                          <p className="text-xs text-[var(--foreground)]/60">
                                            Unassigned (no reminders sent): {summary.unassignedDeliverables.join(', ')}.
                                          </p>
                                        )}
                                        {summary.missingSlack.length > 0 && (
                                          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                                            Slack not connected for {summary.missingSlack.length === 1 ? 'this person' : 'these people'}:{' '}
                                            {summary.missingSlack.map((r) => r.name).join(', ')}. They will not receive
                                            Slack reminders until they connect.
                                          </div>
                                        )}
                                        <ul className="space-y-1">
                                          {reminderRecipients
                                            .filter((group) => !group.unassigned && group.recipients.length > 0)
                                            .map((group) => (
                                              <li key={group.deliverableId} className="text-xs text-[var(--foreground)]/70">
                                                <span className="font-medium">{group.title}:</span>{' '}
                                                {group.recipients.map((r) => (
                                                  <span key={r.userId} className="mr-2">
                                                    {r.name}{' '}
                                                    {r.slackConnected ? (
                                                      <Badge variant="success" size="sm">Slack</Badge>
                                                    ) : (
                                                      <Badge variant="warning" size="sm">No Slack</Badge>
                                                    )}
                                                  </span>
                                                ))}
                                              </li>
                                            ))}
                                        </ul>
                                      </div>
                                    );
                                  })()}
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                  <Button size="sm" onClick={handleSaveReminderConfig} disabled={reminderSaving}>
                                    {reminderSaving ? 'Saving...' : 'Save reminder settings'}
                                  </Button>
                                  <p className="text-xs text-[var(--foreground)]/60">
                                    {reminderDraft.enabled
                                      ? `Enabled${
                                          reminderDraft.offsetsMinutes.length > 0
                                            ? ` at ${
                                                reminderPresets
                                                  .filter((p) => reminderDraft.offsetsMinutes.includes(p.minutes))
                                                  .map((p) => p.label)
                                                  .join(', ')
                                              }`
                                            : ' (no timing selected)'
                                        }.`
                                      : 'Disabled. No reminders will be sent.'}
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        </>
                      )}
                      {canConfigureRemindersForTeam && loadedReminderProject === selectedTeamId && reminderConfig && (
                        <DeliveryReminderOverrides
                          key={selectedTeamId}
                          projectId={selectedTeamId ?? ''}
                          projectTimezone={reminderConfig.timezone}
                          projectDefaults={{enabled: reminderConfig.enabled, offsetMinutes: reminderConfig.offsetsMinutes, timezone: reminderConfig.timezone}}
                          deliverables={teamSprints.flatMap(s => s.deliverables ?? [])}
                          onConfigChange={() => { void loadReminderData(selectedTeamId ?? ''); }}
                        />
                      )}
                      <div className="mb-4 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold flex items-center gap-2">
                              <CalendarDays className="w-4 h-4 text-[var(--primary)]" />
                              Team calendar
                            </p>
                            <p className="text-xs text-[var(--foreground)]/60 mt-1">
                              Store the team Google Calendar secret/ID here. Team-specific attendance events sync to this calendar automatically.
                            </p>
                          </div>
                        </div>

                        {canEditTeamCalendar ? (
                          <>
                            <label className="space-y-1 text-sm block">
                              <span className="font-medium text-[var(--foreground)]">Google Calendar secret / ID</span>
                              <input
                                type="text"
                                value={teamCalendarIdDraft}
                                onChange={(e) => setTeamCalendarIdDraft(e.target.value)}
                                placeholder="team-calendar@group.calendar.google.com"
                                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                              />
                            </label>
                            <div className="flex flex-wrap items-center gap-3">
                              <Button
                                size="sm"
                                onClick={handleSaveTeamCalendarId}
                                disabled={teamCalendarIdSaving}
                              >
                                {teamCalendarIdSaving ? 'Saving...' : 'Save team calendar'}
                              </Button>
                              <p className="text-xs text-[var(--foreground)]/60">
                                Use the calendar secret/ID, not the public embed URL.
                              </p>
                            </div>
                          </>
                        ) : (
                          <div className="rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--foreground)]/60">
                            {selectedTeam.googleCalendarId
                              ? 'A team calendar is configured for this team.'
                              : 'No team calendar has been configured yet.'}
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-medium text-[var(--foreground)]/70 mb-2">Members and roles</p>
                      <ul className="space-y-2 mb-4">
                        {(selectedTeam.members ?? []).map((m) => (
                          <li
                            key={m.user.id}
                            className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--card)] border border-[var(--border)]"
                          >
                            <span className="text-sm">
                              <span className="font-medium text-[var(--foreground)]">{formatMemberName(m.user)}</span>
                              <span className="text-[var(--foreground)]/60 ml-2">({getUserRole(m.user.email)})</span>
                            </span>
                            {canInspectMemberAttendance && (
                              <button
                                type="button"
                                onClick={() => void handleOpenMemberHistory(m.user)}
                                className="ml-3 text-xs font-medium text-[var(--primary)] hover:underline"
                              >
                                View attendance
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveMemberFromTeam(selectedTeam.id, m.user.id)}
                              className="p-1.5 rounded hover:bg-rose-500/20 text-rose-600 dark:text-rose-400"
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
                                  className="p-2 rounded-lg hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0"
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
                  View your team and its members.
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
                            <span className="font-medium text-[var(--foreground)]">{formatMemberName(m.user)}</span>
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

          {isPartnerLike && (
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-[var(--primary)]" />
                  Teams
                </CardTitle>
                <CardDescription>
                  View teams and members.
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
                              <span className="font-medium text-[var(--foreground)]">{formatMemberName(m.user)}</span>
                              <span className="text-[var(--foreground)]/60 ml-2">({getUserRole(m.user.email)})</span>
                            </span>
                            {canInspectMemberAttendance && (
                              <button
                                type="button"
                                onClick={() => void handleOpenMemberHistory(m.user)}
                                className="ml-3 text-xs font-medium text-[var(--primary)] hover:underline"
                              >
                                View attendance
                              </button>
                            )}
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
                          onClick={() => router.push(`/partner/team/${project.id}`)}
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
          setCreateTeamForm({ name: '', googleCalendarId: '', selectedEmails: [], search: '' });
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
            <label className="text-sm font-semibold">Team calendar secret / ID</label>
            <input
              value={createTeamForm.googleCalendarId}
              onChange={(e) =>
                setCreateTeamForm((prev) => ({ ...prev, googleCalendarId: e.target.value }))
              }
              className="w-full mt-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
              placeholder="team-calendar@group.calendar.google.com"
            />
            <p className="mt-1 text-xs text-[var(--foreground)]/60">
              Optional now, but required if team-specific events should sync into Google Calendar.
            </p>
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
                setCreateTeamForm({ name: '', googleCalendarId: '', selectedEmails: [], search: '' });
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

      <Modal
        isOpen={memberHistoryOpen}
        onClose={() => setMemberHistoryOpen(false)}
        title={
          memberHistory
            ? `${memberHistory.member.name} attendance`
            : 'Member attendance'
        }
        size="xl"
      >
        {memberHistoryLoading ? (
          <p className="text-sm text-[var(--foreground)]/65">Loading attendance history...</p>
        ) : !memberHistory ? (
          <p className="text-sm text-[var(--foreground)]/65">No attendance history available.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">{memberHistory.member.name}</p>
                <p className="text-xs text-[var(--foreground)]/60">{memberHistory.member.email}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  variant={memberHistoryFilter === 'TEAM' ? 'primary' : 'outline'}
                  onClick={() => setMemberHistoryFilter('TEAM')}
                >
                  Team events
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={memberHistoryFilter === 'FIRMWIDE' ? 'primary' : 'outline'}
                  onClick={() => setMemberHistoryFilter('FIRMWIDE')}
                >
                  Firmwide events
                </Button>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">Attended</h3>
                  <Badge variant="success">{activeHistoryBuckets.attended.length}</Badge>
                </div>
                <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                  {activeHistoryBuckets.attended.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--foreground)]/60">
                      No attended events in this filter.
                    </div>
                  ) : (
                    activeHistoryBuckets.attended.map((event) => renderHistoryCard(event, 'attended'))
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">Missed</h3>
                  <Badge variant="warning">{activeHistoryBuckets.missed.length}</Badge>
                </div>
                <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                  {activeHistoryBuckets.missed.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--foreground)]/60">
                      No missed events in this filter.
                    </div>
                  ) : (
                    activeHistoryBuckets.missed.map((event) => renderHistoryCard(event, 'missed'))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
