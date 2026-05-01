'use client';

import { useCallback, useEffect, useState } from 'react';
import { Be_Vietnam_Pro, Mulish } from 'next/font/google';
import { AppNavbar } from '@/components/AppNavbar';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { useAuth } from '@/components/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import {
  when2meetAPI,
  projectsAPI,
  setAuthToken,
  type When2MeetPollDetail,
  type When2MeetPollSummary,
} from '@/lib/api';
import { getEffectiveRole, type AppRole } from '@/lib/permissions';
import { When2MeetBoard } from '@/when2meet/When2MeetBoard';

const mulish = Mulish({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
});

const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
});

const PROJECT_STORAGE_KEY = 'otcr_when2meet_project_id';

function localCalendarDateISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseApiError(err: unknown, fallback: string): string {
  const message =
    typeof err === 'object' && err !== null && 'response' in err
      ? (err as { response?: { data?: { message?: unknown } } }).response?.data?.message
      : undefined;
  if (Array.isArray(message)) return message.join(', ');
  if (typeof message === 'string') return message;
  if (err instanceof Error) return err.message;
  return fallback;
}

type ProjectOption = { id: string; name: string };

export default function When2MeetPage() {
  const session = useAuth();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [polls, setPolls] = useState<When2MeetPollSummary[]>([]);
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
  const [pollDetail, setPollDetail] = useState<When2MeetPollDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [gridFirstDate, setGridFirstDate] = useState('');
  const [gridLastDate, setGridLastDate] = useState('');
  const [slotStart, setSlotStart] = useState('09:00');
  const [slotEnd, setSlotEnd] = useState('17:00');
  const [creating, setCreating] = useState(false);
  const [deletingPoll, setDeletingPoll] = useState(false);

  const canCreatePoll =
    role === 'ADMIN' || role === 'PM' || role === 'PARTNER' || role === 'EXECUTIVE';

  const loadPolls = useCallback(
    async (opts?: { selectPollId?: string; droppedPollId?: string }) => {
      if (!projectId) {
        setPolls([]);
        return;
      }
      try {
        const res = await when2meetAPI.listPolls(projectId);
        const list = Array.isArray(res.data?.polls) ? (res.data.polls as When2MeetPollSummary[]) : [];
        setPolls(list);
        const preferred = opts?.selectPollId;
        const dropped = opts?.droppedPollId;
        setSelectedPollId((prev) => {
          if (dropped && prev === dropped) {
            return list[0]?.id ?? null;
          }
          if (preferred && list.some((p) => p.id === preferred)) return preferred;
          if (prev && list.some((p) => p.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      } catch (err) {
        setPolls([]);
        setError(parseApiError(err, 'Could not load When2Meet polls.'));
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!createOpen) return;
    const today = localCalendarDateISO();
    setGridFirstDate(today);
    setGridLastDate(today);
    setSlotStart('09:00');
    setSlotEnd('17:00');
  }, [createOpen]);

  const loadPollDetail = useCallback(async (pollId: string) => {
    setDetailLoading(true);
    try {
      const res = await when2meetAPI.getPoll(pollId);
      setPollDetail(res.data as When2MeetPollDetail);
      setError(null);
    } catch (err) {
      setPollDetail(null);
      setError(parseApiError(err, 'Could not load this poll.'));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session.isLoggedIn || !session.user?.email) return;

    let cancelled = false;

    const bootstrap = async () => {
      setLoading(true);
      try {
        const token = await session.getToken();
        const email = session.user!.email!;
        setAuthToken(token || email || null);
        const resolvedRole = await getEffectiveRole(token, email);
        if (cancelled) return;
        setRole(resolvedRole);

        const projectsRes = await projectsAPI.getAll({ limit: 100 });
        const raw = Array.isArray(projectsRes.data?.projects)
          ? (projectsRes.data.projects as Array<{ id: string; name: string }>)
          : [];
        const options = raw.map((p) => ({ id: p.id, name: p.name }));
        if (cancelled) return;
        setProjects(options);

        let initialProject =
          typeof window !== 'undefined' ? window.localStorage.getItem(PROJECT_STORAGE_KEY) : null;
        if (initialProject && !options.some((p) => p.id === initialProject)) {
          initialProject = null;
        }
        const pid = initialProject || options[0]?.id || '';
        setProjectId(pid);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err, 'Failed to load teams.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!projectId || !session.isLoggedIn) return;
    void loadPolls();
  }, [projectId, session.isLoggedIn, loadPolls]);

  useEffect(() => {
    if (!selectedPollId) {
      setPollDetail(null);
      return;
    }
    void loadPollDetail(selectedPollId);
  }, [selectedPollId, loadPollDetail]);

  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return;
    window.localStorage.setItem(PROJECT_STORAGE_KEY, projectId);
  }, [projectId]);

  useEffect(() => {
    if (!selectedPollId || !session.isLoggedIn) return;
    const id = window.setInterval(() => {
      void loadPollDetail(selectedPollId);
    }, 45000);
    return () => window.clearInterval(id);
  }, [selectedPollId, session.isLoggedIn, loadPollDetail]);

  const handleProjectChange = (nextId: string) => {
    setProjectId(nextId);
    setSelectedPollId(null);
    setPollDetail(null);
  };

  const handleCreatePoll = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!projectId || !newTitle.trim()) return;
    if (!gridFirstDate || !gridLastDate) {
      setError('Choose both the first and last day for this poll.');
      return;
    }
    if (gridLastDate < gridFirstDate) {
      setError('The last day must be on or after the first day.');
      return;
    }

    const ss = slotStart.split(':').map(Number);
    const ee = slotEnd.split(':').map(Number);
    const sh = ss[0];
    const sm = ss[1];
    const eh = ee[0];
    const em = ee[1];
    const startM = sh * 60 + sm;
    const endM = eh * 60 + em;
    if (
      ![sh, sm, eh, em].every((n) => Number.isFinite(n)) ||
      endM <= startM ||
      startM % 15 !== 0 ||
      endM % 15 !== 0
    ) {
      setError('Pick a valid time window in fifteen‑minute steps (start before end).');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const res = await when2meetAPI.createPoll({
        projectId,
        title: newTitle.trim(),
        gridFirstDate,
        gridLastDate,
        slotStart,
        slotEnd,
      });
      const createdId =
        res.data && typeof res.data === 'object' && 'poll' in res.data
          ? (res.data as { poll?: { id?: string } }).poll?.id
          : undefined;
      setNewTitle('');
      setCreateOpen(false);
      await loadPolls(createdId ? { selectPollId: createdId } : undefined);
    } catch (err) {
      setError(parseApiError(err, 'Could not create poll.'));
    } finally {
      setCreating(false);
    }
  };

  const commitAvailability = async (slots: number[]) => {
    if (!selectedPollId) return;
    const res = await when2meetAPI.saveMyAvailability(selectedPollId, slots);
    setPollDetail(res.data as When2MeetPollDetail);
  };

  const handleDeletePoll = async () => {
    if (!selectedPollId) return;
    const pollTitle =
      polls.find((p) => p.id === selectedPollId)?.title ??
      pollDetail?.poll.title ??
      'this poll';
    const confirmed = window.confirm(
      `Delete “${pollTitle}”? Availability data will be removed. This cannot be undone.`,
    );
    if (!confirmed) return;

    const idBeingDeleted = selectedPollId;
    setDeletingPoll(true);
    setError(null);
    try {
      await when2meetAPI.deletePoll(idBeingDeleted);
      await loadPolls({ droppedPollId: idBeingDeleted });
    } catch (err) {
      setError(parseApiError(err, 'Could not delete this poll.'));
    } finally {
      setDeletingPoll(false);
    }
  };

  if (!session.isLoggedIn || session.loading || loading) {
    return <FullScreenLoader />;
  }

  return (
    <div className={`min-h-screen bg-[var(--background)] ${mulish.className}`}>
      <AppNavbar role={role} currentPath="/when2meet" />

      <main className="max-w-[2000px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>When2Meet</CardTitle>
            <CardDescription>
              Coordinate weekly availability with your team.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col gap-1 text-sm min-w-[200px]">
              <span className="font-medium text-[var(--foreground)]">Team</span>
              <select
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
              >
                {projects.length === 0 ? (
                  <option value="">No teams available</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm min-w-[220px]">
              <span className="font-medium text-[var(--foreground)]">Poll</span>
              <select
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={selectedPollId ?? ''}
                onChange={(e) => setSelectedPollId(e.target.value || null)}
                disabled={!polls.length}
              >
                {polls.length === 0 ? (
                  <option value="">No polls yet</option>
                ) : (
                  polls.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))
                )}
              </select>
            </label>

            {canCreatePoll ? (
              <Button type="button" onClick={() => setCreateOpen(true)} disabled={!projectId}>
                New When2Meet
              </Button>
            ) : null}

            {canCreatePoll && selectedPollId ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => void handleDeletePoll()}
                disabled={deletingPoll || detailLoading}
                loading={deletingPoll}
              >
                Delete poll
              </Button>
            ) : null}

            {detailLoading ? (
              <span className="text-sm text-[var(--foreground)]/60">Refreshing poll…</span>
            ) : null}
          </CardContent>
        </Card>

        {error ? (
          <p className="text-sm text-red-600 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            {error}
          </p>
        ) : null}

        {pollDetail && selectedPollId ? (
          <When2MeetBoard
            detail={pollDetail}
            headlineFontClassName={beVietnam.className}
            onCommitAvailability={commitAvailability}
          />
        ) : !detailLoading && projectId && polls.length === 0 && !error ? (
          <p className="text-center text-[var(--foreground)]/70 py-12">
            No polls for this team yet.
            {canCreatePoll ? ' Create one to get started.' : ''}
          </p>
        ) : null}

        <Modal
          isOpen={createOpen}
          onClose={() => {
            if (!creating) setCreateOpen(false);
          }}
          title="Create When2Meet"
        >
          <form id="when2meet-create-form" className="space-y-4" onSubmit={handleCreatePoll}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Title</span>
              <input
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Sprint planning sync"
                autoFocus
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">First day</span>
                <input
                  type="date"
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                  value={gridFirstDate}
                  onChange={(e) => setGridFirstDate(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Last day</span>
                <input
                  type="date"
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                  value={gridLastDate}
                  onChange={(e) => setGridLastDate(e.target.value)}
                  min={gridFirstDate || undefined}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Start time</span>
                <input
                  type="time"
                  step={900}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                  value={slotStart}
                  onChange={(e) => setSlotStart(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">End time</span>
                <input
                  type="time"
                  step={900}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                  value={slotEnd}
                  onChange={(e) => setSlotEnd(e.target.value)}
                  required
                />
              </label>
            </div>
            <p className="text-xs text-[var(--foreground)]/60">
              Columns show each calendar day in the range (one day only if first and last match). Rows are fifteen‑minute
              steps between start and end time.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating || !newTitle.trim() || !gridFirstDate || !gridLastDate}
              >
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        </Modal>
      </main>
    </div>
  );
}
