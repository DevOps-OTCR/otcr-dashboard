'use client';

import React, { Fragment, useEffect, useState } from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';
import { AppNavbar } from '@/components/AppNavbar';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import {
  attendanceAPI,
  projectsAPI,
  setAuthToken,
  type AttendanceEvent,
} from '@/lib/api';
import { getEffectiveRole, type AppRole } from '@/lib/permissions';

type ProjectOption = {
  id: string;
  name: string;
};

type PollFormState = {
  title: string;
  projectId: string;
  availabilityWindowStart: string;
  availabilityWindowEnd: string;
  availabilityWindowStartTime: string;
  availabilityWindowEndTime: string;
  availabilitySlotMinutes: '15' | '30' | '60';
};

const DEFAULT_POLL_FORM: PollFormState = {
  title: '',
  projectId: '',
  availabilityWindowStart: '',
  availabilityWindowEnd: '',
  availabilityWindowStartTime: '09:00',
  availabilityWindowEndTime: '17:00',
  availabilitySlotMinutes: '30',
};

function formatAvailabilitySlotLabel(start: string, end: string) {
  return `${new Date(start).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })} - ${new Date(end).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function formatAvailabilityDayLabel(value: string) {
  return new Date(value).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatAvailabilityTimeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getAvailabilityDayKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getAvailabilityHeatColor(availableCount: number, teamSize: number, isSelected: boolean) {
  if (isSelected) {
    return '#22c55e'; // Solid green for selected
  }
  if (teamSize <= 0) {
    return '#ffffff';
  }

  const intensity = Math.max(0, Math.min(1, availableCount / teamSize));
  const green = { r: 34, g: 197, b: 94 };
  const white = { r: 255, g: 255, b: 255 };
  const mix = (start: number, end: number) => Math.round(start + (end - start) * intensity);
  const r = Math.max(0, mix(white.r, green.r));
  const g = Math.max(0, mix(white.g, green.g));
  const b = Math.max(0, mix(white.b, green.b));
  return `rgb(${r}, ${g}, ${b})`;
}

export default function When2MeetPage() {
  const session = useAuth();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [polls, setPolls] = useState<AttendanceEvent[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<PollFormState>(DEFAULT_POLL_FORM);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availabilitySelections, setAvailabilitySelections] = useState<Record<string, string[]>>({});
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<string | null>(null);

  useEffect(() => {
    const syncRole = async () => {
      if (!session.isLoggedIn || !session.user) {
        setLoading(false);
        return;
      }

      try {
        const token = await session.getToken();
        const email = session.user.email;
        setAuthToken(token || email || null);
        const resolvedRole = await getEffectiveRole(token, email);
        setRole(resolvedRole);

        // Load projects
        const projectsResponse = await projectsAPI.getAll({
          status: 'ACTIVE',
          includeMembers: false,
          includeDeliverables: false,
        });
        setProjects(projectsResponse.data?.projects ?? []);

        // Load polls (events with availability polls enabled)
        const eventsResponse = await attendanceAPI.listEvents();
        const pollEvents = (Array.isArray(eventsResponse.data?.events) ? eventsResponse.data.events : []).filter((event: AttendanceEvent) => 
          event.availabilityPoll?.enabled
        );
        setPolls(pollEvents);
      } catch (error) {
        console.error('Failed to load When2Meet page data', error);
      } finally {
        setLoading(false);
      }
    };

    void syncRole();
  }, [session]);

  const resetForm = () => {
    setForm(DEFAULT_POLL_FORM);
  };

  const handleFormChange = (key: keyof PollFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleCreatePoll = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setMessage(null);
    setError(null);

    try {
      if (!form.title.trim()) {
        throw new Error('Poll title is required.');
      }
      if (!form.availabilityWindowStart || !form.availabilityWindowEnd) {
        throw new Error('Choose both a start day and end day for the availability poll.');
      }
      if (form.availabilityWindowEnd < form.availabilityWindowStart) {
        throw new Error('The poll end day must be the same as or after the start day.');
      }
      if (!form.availabilityWindowStartTime || !form.availabilityWindowEndTime) {
        throw new Error('Choose both a start time and end time for the availability poll.');
      }
      if (form.availabilityWindowStartTime >= form.availabilityWindowEndTime) {
        throw new Error('The poll end time must be after the start time.');
      }
      if (!form.projectId) {
        throw new Error('Select a team for the poll.');
      }

      const payload = {
        title: form.title.trim(),
        eventDate: new Date().toISOString(), // Use current date as placeholder
        locationType: 'ONLINE' as const,
        category: 'TEAM_MEETING' as const,
        audienceScope: 'TEAM' as const,
        projectId: form.projectId,
        availabilityPoll: {
          enabled: true,
          windowStart: `${form.availabilityWindowStart}T${form.availabilityWindowStartTime}:00.000Z`,
          windowEnd: `${form.availabilityWindowEnd}T${form.availabilityWindowEndTime}:00.000Z`,
          slotMinutes: Number(form.availabilitySlotMinutes),
        },
      };

      const response = await attendanceAPI.createEvent(payload);
      const created = response.data as AttendanceEvent;
      setPolls((current) => [...current, created]);
      setCreateOpen(false);
      resetForm();
      setMessage('Availability poll created successfully.');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create availability poll.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePoll = async (poll: AttendanceEvent) => {
    if (!confirm(`Are you sure you want to delete the poll "${poll.title}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await attendanceAPI.deleteEvent(poll.id);
      setPolls((current) => current.filter((p) => p.id !== poll.id));
      setMessage('Poll deleted successfully.');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to delete poll.');
    }
  };

  const handleSubmitAvailability = async (poll: AttendanceEvent) => {
    const selectedSlots = availabilitySelections[poll.id] ?? [];
    if (selectedSlots.length === 0) {
      setError('Please select at least one time slot.');
      return;
    }
    try {
      await attendanceAPI.saveAvailability(poll.id, { slotStarts: selectedSlots });
      setMessage('Availability submitted successfully.');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to submit availability.');
    }
  };

  const handleMouseDown = (pollId: string, slotStart: string) => {
    setIsSelecting(true);
    setSelectionStart(slotStart);
    setAvailabilitySelections((current) => ({
      ...current,
      [pollId]: [slotStart],
    }));
  };

  const handleMouseEnter = (pollId: string, slotStart: string) => {
    if (!isSelecting || !selectionStart) return;
    const poll = polls.find((p) => p.id === pollId);
    if (!poll?.availabilityPoll) return;
    const slots = poll.availabilityPoll.slots;
    const startIndex = slots.findIndex((s) => s.start === selectionStart);
    const endIndex = slots.findIndex((s) => s.start === slotStart);
    if (startIndex === -1 || endIndex === -1) return;
    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);
    const selectedSlots = slots.slice(minIndex, maxIndex + 1).map((s) => s.start);
    setAvailabilitySelections((current) => ({
      ...current,
      [pollId]: selectedSlots,
    }));
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setSelectionStart(null);
  };

    const renderPollCard = (poll: AttendanceEvent) => {
    const pollData = poll.availabilityPoll!;
    const availabilityDayKeys = Array.from(
        new Set(pollData.slots.map((slot) => getAvailabilityDayKey(slot.start)))
    );

    const availabilityTimeRows = Array.from(
        pollData.slots
        .reduce((map, slot) => {
            const date = new Date(slot.start);
            const key = `${String(date.getHours()).padStart(2, '0')}:${String(
            date.getMinutes()
            ).padStart(2, '0')}`;
            if (!map.has(key)) {
            map.set(key, {
                key,
                label: formatAvailabilityTimeLabel(slot.start),
            });
            }
            return map;
        }, new Map<string, { key: string; label: string }>())
        .values()
    );

    const availabilitySlotByGridKey = new Map(
        pollData.slots.map((slot) => {
        const date = new Date(slot.start);
        const timeKey = `${String(date.getHours()).padStart(2, '0')}:${String(
            date.getMinutes()
        ).padStart(2, '0')}`;
        return [`${getAvailabilityDayKey(slot.start)}__${timeKey}`, slot] as const;
        })
    );

    const selectedSlots = availabilitySelections[poll.id] ?? [];
    const gridTemplateColumns = `36px repeat(${availabilityDayKeys.length}, minmax(0, 1fr))`;

    return (
        <Card key={poll.id}>
        <CardHeader>
            <div className="flex items-center justify-between">
            <div>
                <CardTitle className="text-lg">{poll.title}</CardTitle>
                <CardDescription>
                {new Date(pollData.windowStart).toLocaleDateString()} -{' '}
                {new Date(pollData.windowEnd).toLocaleDateString()}
                </CardDescription>
            </div>
            <Badge variant="info">Active Poll</Badge>
            </div>
        </CardHeader>

        <CardContent className="space-y-4">
            {/* Heatmap */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2">
            <div
                className="grid gap-[1px]"
                style={{
                gridTemplateColumns
                }}
            >
                {/* Empty corner */}
                <div />

                {/* Day headers */}
                {availabilityDayKeys.map((dayKey) => {
                const firstSlot = pollData.slots.find(
                    (slot) => getAvailabilityDayKey(slot.start) === dayKey
                );
                return (
                    <div
                    key={dayKey}
                    className="text-center text-[8px] font-semibold text-[var(--foreground)]/60 leading-tight py-0.5"
                    >
                    {firstSlot
                        ? formatAvailabilityDayLabel(firstSlot.start)
                        : dayKey}
                    </div>
                );
                })}

                {/* Rows */}
                {availabilityTimeRows.map((timeRow) => (
                <Fragment key={timeRow.key}>
                    {/* Time label */}
                    <div className="flex items-center justify-end pr-1 text-[8px] text-[var(--foreground)]/70 leading-none">
                    {timeRow.label}
                    </div>

                    {/* Cells */}
                    {availabilityDayKeys.map((dayKey) => {
                    const slot = availabilitySlotByGridKey.get(
                        `${dayKey}__${timeRow.key}`
                    );

                    if (!slot) {
                        return <div key={`${dayKey}-${timeRow.key}`} />;
                    }

                    return (
                        <div
                        key={slot.start}
                        className="h-5 rounded-sm border cursor-pointer select-none"
                        title={`${formatAvailabilitySlotLabel(
                            slot.start,
                            slot.end
                        )} • ${slot.availableCount}/${pollData.teamSize}`}
                        style={{
                            borderColor: 'var(--border)',
                            backgroundColor: getAvailabilityHeatColor(
                            slot.availableCount,
                            pollData.teamSize,
                            selectedSlots.includes(slot.start)
                            ),
                        }}
                        onMouseDown={() => handleMouseDown(poll.id, slot.start)}
                        onMouseEnter={() => handleMouseEnter(poll.id, slot.start)}
                        onMouseUp={handleMouseUp}
                        />
                    );
                    })}
                </Fragment>
                ))}
            </div>
            </div>

            {/* Legend */}
            <div className="flex gap-3 text-[10px] text-[var(--foreground)]/65">
            <span className="flex items-center gap-1">
                <span className="h-2 w-2 border bg-white" />
                None
            </span>
            <span className="flex items-center gap-1">
                <span className="h-2 w-2 border bg-emerald-500" />
                Most
            </span>
            <span className="flex items-center gap-1">
                <span className="h-2 w-2 border bg-green-500" />
                Selected
            </span>
            </div>

            <Button
              size="sm"
              onClick={() => void handleSubmitAvailability(poll)}
            >
              Submit Availability
            </Button>
        </CardContent>
        </Card>
    );
    }; 
  if (loading) {
    return <FullScreenLoader />;
  }

  const canCreate = role === 'PM' || role === 'ADMIN' || role === 'PARTNER' || role === 'EXECUTIVE';

  return (
    <>
      <AppNavbar role={role} currentPath="/when2meet" />
      <main className="max-w-[2000px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <section className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-[var(--primary)]" />
            <h1 className="text-2xl font-semibold">When2Meet</h1>
          </div>
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              Create Availability Poll
            </Button>
          )}
        </section>

        {message && (
          <p className="text-sm rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p className="text-sm rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-red-700">
            {error}
          </p>
        )}

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Active Polls</h2>
          {polls.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-sm text-[var(--foreground)]/65">No active availability polls.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {polls.map(renderPollCard)}
            </div>
          )}
        </section>
      </main>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Availability Poll"
        size="lg"
      >
        <form onSubmit={handleCreatePoll} className="space-y-5">
          <label className="space-y-2 text-sm block">
            <span className="font-medium">Poll Title</span>
            <input
              value={form.title}
              onChange={(event) => handleFormChange('title', event.target.value)}
              placeholder="Find a time for weekly standup"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
              required
            />
          </label>

          <label className="space-y-2 text-sm block">
            <span className="font-medium">Team</span>
            <select
              value={form.projectId}
              onChange={(event) => handleFormChange('projectId', event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
              required
            >
              <option value="">Select team</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-5">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Start day</span>
              <input
                type="date"
                value={form.availabilityWindowStart}
                onChange={(event) => handleFormChange('availabilityWindowStart', event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                required
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Start time</span>
              <input
                type="time"
                value={form.availabilityWindowStartTime}
                onChange={(event) => handleFormChange('availabilityWindowStartTime', event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                required
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">End day</span>
              <input
                type="date"
                value={form.availabilityWindowEnd}
                onChange={(event) => handleFormChange('availabilityWindowEnd', event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                required
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">End time</span>
              <input
                type="time"
                value={form.availabilityWindowEndTime}
                onChange={(event) => handleFormChange('availabilityWindowEndTime', event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                required
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Slot size</span>
              <select
                value={form.availabilitySlotMinutes}
                onChange={(event) => handleFormChange('availabilitySlotMinutes', event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </label>
          </div>

          <p className="text-xs text-[var(--foreground)]/65">
            The poll will cover the selected days from {form.availabilityWindowStartTime || 'start time'} to {form.availabilityWindowEndTime || 'end time'}.
          </p>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create Poll'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}