'use client';

import React, { Fragment, useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { AppNavbar } from '@/components/AppNavbar';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  attendanceAPI,
  projectsAPI,
  setAuthToken,
  type AttendanceAvailabilitySlot,
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
};

type DragState = {
  pollId: string;
  mode: 'add' | 'remove';
};

type HoveredSlot = {
  pollId: string;
  slot: AttendanceAvailabilitySlot;
};

const DEFAULT_POLL_FORM: PollFormState = {
  title: '',
  projectId: '',
  availabilityWindowStart: '',
  availabilityWindowEnd: '',
  availabilityWindowStartTime: '09:00',
  availabilityWindowEndTime: '17:00',
};

function formatAvailabilityDayLabel(value: string) {
  return new Date(value).toLocaleDateString([], {
    weekday: 'short',
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

function getAvailabilityTimeKey(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function localDateTimeToIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function getAvailabilityHeatColor(availableCount: number, teamSize: number) {
  if (teamSize <= 0) {
    return 'rgba(48, 147, 56, 0)';
  }

  const opacity = Math.max(0, Math.min(1, availableCount / teamSize));
  return `rgba(48, 147, 56, ${opacity})`;
}

function getSlotAvailableUsers(slot: AttendanceAvailabilitySlot) {
  return slot.availableUsers ?? [];
}

function getSlotUnavailableUsers(slot: AttendanceAvailabilitySlot) {
  return slot.unavailableUsers ?? [];
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
  const [savingPollId, setSavingPollId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availabilitySelections, setAvailabilitySelections] = useState<Record<string, string[]>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<HoveredSlot | null>(null);
  const availabilitySelectionsRef = useRef<Record<string, string[]>>({});
  const dragStateRef = useRef<DragState | null>(null);

  const setSyncedAvailabilitySelections = (
    updater: Record<string, string[]> | ((current: Record<string, string[]>) => Record<string, string[]>),
  ) => {
    setAvailabilitySelections((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      availabilitySelectionsRef.current = next;
      return next;
    });
  };

  const mergeCurrentUserSelections = (events: AttendanceEvent[]) => {
    setSyncedAvailabilitySelections((current) => {
      const next = { ...current };
      for (const event of events) {
        if (event.availabilityPoll) {
          next[event.id] = current[event.id] ?? event.availabilityPoll.currentUserSlots;
        }
      }
      return next;
    });
  };

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

        const projectsResponse = await projectsAPI.getAll({
          status: 'ACTIVE',
          includeMembers: false,
          includeDeliverables: false,
        });
        setProjects(projectsResponse.data?.projects ?? []);

        const eventsResponse = await attendanceAPI.listEvents();
        const pollEvents = (Array.isArray(eventsResponse.data?.events) ? eventsResponse.data.events : []).filter(
          (event: AttendanceEvent) => event.availabilityPoll?.enabled,
        );
        setPolls(pollEvents);
        mergeCurrentUserSelections(pollEvents);
      } catch (error) {
        console.error('Failed to load When2Meet page data', error);
      } finally {
        setLoading(false);
      }
    };

    void syncRole();
  }, [session]);

  useEffect(() => {
    const handleWindowPointerUp = () => {
      const activeDragState = dragStateRef.current;
      if (!activeDragState) return;
      void saveAvailabilityForPoll(activeDragState.pollId);
      dragStateRef.current = null;
      setDragState(null);
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [polls]);

  const resetForm = () => {
    setForm(DEFAULT_POLL_FORM);
  };

  const handleFormChange = (key: keyof PollFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const replacePoll = (updated: AttendanceEvent) => {
    setPolls((current) => current.map((poll) => (poll.id === updated.id ? updated : poll)));
    if (updated.availabilityPoll) {
      setSyncedAvailabilitySelections((current) => ({
        ...current,
        [updated.id]: updated.availabilityPoll?.currentUserSlots ?? current[updated.id] ?? [],
      }));
    }
  };

  const saveAvailabilityForPoll = async (pollId: string) => {
    const poll = polls.find((item) => item.id === pollId);
    if (!poll?.availabilityPoll) return;

    const selectedSlots = availabilitySelectionsRef.current[pollId] ?? [];
    setSavingPollId(pollId);
    setError(null);
    try {
      const response = await attendanceAPI.saveAvailability(pollId, { slotStarts: selectedSlots });
      const updated = response.data?.event as AttendanceEvent | undefined;
      if (updated) {
        replacePoll(updated);
      }
      setMessage(`Saved your availability for ${poll.title}.`);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to submit availability.');
    } finally {
      setSavingPollId(null);
    }
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
        eventDate: new Date().toISOString(),
        locationType: 'ONLINE' as const,
        category: 'TEAM_MEETING' as const,
        audienceScope: 'TEAM' as const,
        projectId: form.projectId,
        availabilityPoll: {
          enabled: true,
          windowStart: localDateTimeToIso(form.availabilityWindowStart, form.availabilityWindowStartTime),
          windowEnd: localDateTimeToIso(form.availabilityWindowEnd, form.availabilityWindowEndTime),
        },
      };

      const response = await attendanceAPI.createEvent(payload);
      const created = response.data as AttendanceEvent;
      setPolls((current) => [...current, created]);
      mergeCurrentUserSelections([created]);
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

  const setAvailabilitySlotValue = (pollId: string, slotStart: string, selected: boolean) => {
    setSyncedAvailabilitySelections((current) => {
      const existing = new Set(current[pollId] ?? []);
      if (selected) {
        existing.add(slotStart);
      } else {
        existing.delete(slotStart);
      }
      return {
        ...current,
        [pollId]: Array.from(existing),
      };
    });
  };

  const startSlotDrag = (pollId: string, slotStart: string) => {
    const selectedSlots = availabilitySelectionsRef.current[pollId] ?? [];
    const mode = selectedSlots.includes(slotStart) ? 'remove' : 'add';
    dragStateRef.current = { pollId, mode };
    setDragState({ pollId, mode });
    setAvailabilitySlotValue(pollId, slotStart, mode === 'add');
  };

  const continueSlotDrag = (pollId: string, slotStart: string) => {
    const activeDragState = dragStateRef.current;
    if (!activeDragState || activeDragState.pollId !== pollId) return;
    setAvailabilitySlotValue(pollId, slotStart, activeDragState.mode === 'add');
  };

  const getSlotStartFromPointerEvent = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-slot-start]') : null;
    return target?.dataset.slotStart ?? null;
  };

  const handleUserGridPointerDown = (event: React.PointerEvent<HTMLDivElement>, pollId: string) => {
    const slotStart = getSlotStartFromPointerEvent(event);
    if (!slotStart) return;
    event.preventDefault();
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    startSlotDrag(pollId, slotStart);
  };

  const handleUserGridPointerMove = (event: React.PointerEvent<HTMLDivElement>, pollId: string) => {
    if (!dragStateRef.current || dragStateRef.current.pollId !== pollId) return;
    // When pointer is captured, event.target stays on the capture element.
    // elementFromPoint finds the real element under the cursor.
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const target = el?.closest<HTMLElement>('[data-slot-start]');
    if (!target) return;
    const slotStart = target.dataset.slotStart;
    if (!slotStart) return;
    continueSlotDrag(pollId, slotStart);
  };
  const renderAvailabilityGrid = (
    poll: AttendanceEvent,
    variant: 'user' | 'group',
    dayKeys: string[],
    timeRows: Array<{ key: string; label: string }>,
    slotByGridKey: Map<string, AttendanceAvailabilitySlot>,
  ) => {
    const pollData = poll.availabilityPoll!;
    const selectedSlots = availabilitySelections[poll.id] ?? [];

    return (
      <div
        className="grid touch-none select-none border-t border-[#161515]"
        style={{
          gridTemplateColumns: `repeat(${dayKeys.length}, minmax(34px, 1fr))`,
          gridAutoFlow: 'column',
        }}
        onPointerDown={variant === 'user' ? (event) => handleUserGridPointerDown(event, poll.id) : undefined}
        onPointerMove={variant === 'user' ? (event) => handleUserGridPointerMove(event, poll.id) : undefined}
      >
        {dayKeys.map((dayKey) => (
          <Fragment key={`${poll.id}-${variant}-${dayKey}`}>
            {timeRows.map((timeRow, index) => {
              const slot = slotByGridKey.get(`${dayKey}__${timeRow.key}`);

              if (!slot) {
                return (
                  <div
                    key={`${poll.id}-${variant}-${dayKey}-${timeRow.key}`}
                    className="h-[12px] border-l border-r border-[#161515]"
                  />
                );
              }

              const selected = selectedSlots.includes(slot.start);
              const backgroundColor =
                variant === 'user'
                  ? selected
                    ? 'rgb(48, 147, 56)'
                    : 'rgb(255, 216, 216)'
                  : getAvailabilityHeatColor(slot.availableCount, pollData.teamSize);

              if (variant === 'user') {
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    data-slot-start={slot.start}
                    aria-label={`${formatAvailabilityTimeLabel(slot.start)} availability`}
                    key={slot.start}
                    className="h-[12px] w-full cursor-pointer select-none border-l border-r border-[#161515] transition-colors"
                    style={{ backgroundColor }}
                  />
                );
              }

              return (
                <div
                  key={`${slot.start}-group`}
                  className="h-[12px] w-full border-l border-r border-[#161515] transition-colors"
                  style={{ backgroundColor }}
                  onMouseEnter={() => setHoveredSlot({ pollId: poll.id, slot })}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    );
  };

  const renderSchedule = (
    poll: AttendanceEvent,
    variant: 'user' | 'group',
    dayKeys: string[],
    timeRows: Array<{ key: string; label: string }>,
    slotByGridKey: Map<string, AttendanceAvailabilitySlot>,
  ) => {
    const pollData = poll.availabilityPoll!;

    return (
      <div className="mx-auto grid w-full max-w-[400px] grid-cols-[52px_1fr] gap-x-2.5">
        <div className="mt-5 text-right">
          <p className="mb-0 h-[12px] text-[11px] leading-[12px] text-[#6f6c6c]">
            {formatAvailabilityTimeLabel(pollData.windowEnd)}
          </p>
        </div>
        <div>
          <div
            className="grid w-full"
            style={{
              gridTemplateColumns: `repeat(${dayKeys.length}, minmax(34px, 1fr))`,
            }}
          >
            {dayKeys.map((dayKey) => {
              const firstSlot = poll.availabilityPoll?.slots.find((slot) => getAvailabilityDayKey(slot.start) === dayKey);
              return (
                <p key={dayKey} className="mb-0 text-center text-base font-medium leading-5 text-[#161515]">
                  {firstSlot ? formatAvailabilityDayLabel(firstSlot.start) : dayKey}
                </p>
              );
            })}
          </div>
          {renderAvailabilityGrid(poll, variant, dayKeys, timeRows, slotByGridKey)}
        </div>
      </div>
    );
  };

  const renderPollCard = (poll: AttendanceEvent) => {
    const pollData = poll.availabilityPoll!;
    const dayKeys = Array.from(new Set(pollData.slots.map((slot) => getAvailabilityDayKey(slot.start))));
    const timeRows = Array.from(
      pollData.slots
        .reduce((map, slot) => {
          const key = getAvailabilityTimeKey(slot.start);
          if (!map.has(key)) {
            map.set(key, {
              key,
              label: formatAvailabilityTimeLabel(slot.start),
            });
          }
          return map;
        }, new Map<string, { key: string; label: string }>())
        .values(),
    );
    const slotByGridKey = new Map(
      pollData.slots.map((slot) => [`${getAvailabilityDayKey(slot.start)}__${getAvailabilityTimeKey(slot.start)}`, slot] as const),
    );
    const activeHoveredSlot = hoveredSlot?.pollId === poll.id ? hoveredSlot.slot : null;
    const availableUsers = activeHoveredSlot ? getSlotAvailableUsers(activeHoveredSlot) : [];
    const unavailableUsers = activeHoveredSlot ? getSlotUnavailableUsers(activeHoveredSlot) : [];
    const colorSteps = Array.from({ length: Math.max(1, pollData.teamSize + 1) }, (_, index) => index);

    return (
      <Card key={poll.id} className="overflow-visible rounded-lg">
        <CardContent className="p-5">
          <h2 className="mb-1 text-center font-['Be_Vietnam_Pro',sans-serif] text-2xl font-extrabold leading-tight text-[#161515]">
            {poll.title}
          </h2>
          <p className="mb-5 text-center text-sm text-[#6f6c6c]">
            {new Date(pollData.windowStart).toLocaleDateString()} - {new Date(pollData.windowEnd).toLocaleDateString()}
            {poll.projectName ? ` • ${poll.projectName}` : ''}
          </p>

          <div className="grid gap-8 xl:grid-cols-2 xl:gap-[calc(50px_+_5vw)]">
            <div className="relative text-center">
              {activeHoveredSlot ? (
                <div className="mx-auto max-w-[400px] bg-white text-center transition-opacity">
                  <h5 className="font-['Be_Vietnam_Pro',sans-serif] text-lg font-semibold text-[#161515]">
                    {activeHoveredSlot.availableCount}/{pollData.teamSize} Available
                  </h5>
                  <p className="mb-4 text-sm text-[#6f6c6c]">
                    {formatAvailabilityTimeLabel(activeHoveredSlot.start)} - {formatAvailabilityTimeLabel(activeHoveredSlot.end)}
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-sm font-semibold text-[#161515]">Available</p>
                      {availableUsers.length === 0 ? (
                        <p className="mb-0 text-sm text-[#6f6c6c]">No one</p>
                      ) : (
                        availableUsers.map((user) => (
                          <p key={user.id} className="mb-0 text-sm text-[#161515]">
                            {user.name}
                          </p>
                        ))
                      )}
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-semibold text-[#161515]">Unavailable</p>
                      {unavailableUsers.length === 0 ? (
                        <p className="mb-0 text-sm text-[#6f6c6c]">No one</p>
                      ) : (
                        unavailableUsers.map((user) => (
                          <p key={user.id} className="mb-0 text-sm text-[#161515]">
                            {user.name}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <h5 className="font-['Be_Vietnam_Pro',sans-serif] text-lg font-semibold text-[#161515]">Your Availability</h5>
                  <div className="mt-1 inline-flex">
                    <div className="mr-2.5 flex justify-center">
                      <p className="mb-0 inline-block text-sm text-[#161515]">Unavailable</p>
                      <span className="ml-1 inline-block h-[22px] w-[34px] border border-[#161515] bg-[#ffd8d8]" />
                    </div>
                    <div className="flex justify-center">
                      <p className="mb-0 inline-block text-sm text-[#161515]">Available</p>
                      <span className="ml-1 inline-block h-[22px] w-[34px] border border-[#161515] bg-[#309338]" />
                    </div>
                  </div>
                  <p className="my-3 text-sm italic text-[#161515]">
                    Click and Drag to Toggle; Saved Immediately
                  </p>
                  {renderSchedule(poll, 'user', dayKeys, timeRows, slotByGridKey)}
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <p className="mb-0 text-xs text-[#6f6c6c]">
                      {savingPollId === poll.id ? 'Saving...' : 'Changes save when you release the mouse.'}
                    </p>
                    {poll.canManage && (
                      <Button size="sm" variant="outline" onClick={() => void handleDeletePoll(poll)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="text-center" onMouseLeave={() => setHoveredSlot(null)}>
              <h5 className="font-['Be_Vietnam_Pro',sans-serif] text-lg font-semibold text-[#161515]">Group&apos;s Availability</h5>
              <div className="mt-1 inline-flex items-center">
                <p className="mb-0 text-sm text-[#161515]">0/{pollData.teamSize} available</p>
                <div className="mx-1 flex items-center border border-[#161515]">
                  {colorSteps.map((step) => (
                    <span
                      key={step}
                      className="inline-block h-[22px] w-[22px]"
                      style={{ backgroundColor: getAvailabilityHeatColor(step, pollData.teamSize) }}
                    />
                  ))}
                </div>
                <p className="mb-0 text-sm text-[#161515]">
                  {pollData.teamSize}/{pollData.teamSize} available
                </p>
              </div>
              <p className="my-3 text-sm italic text-[#161515]">
                Mouseover the Calendar to See Who Is Available
              </p>
              {renderSchedule(poll, 'group', dayKeys, timeRows, slotByGridKey)}
            </div>
          </div>
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
      <main className="mx-auto max-w-[2000px] space-y-8 px-4 py-8 font-['Mulish',sans-serif] sm:px-6 lg:px-8">
        <section className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-[var(--primary)]" />
            <h1 className="font-['Be_Vietnam_Pro',sans-serif] text-2xl font-extrabold text-[#161515]">When2Meet</h1>
          </div>
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              Create Availability Poll
            </Button>
          )}
        </section>

        {message && (
          <p className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="space-y-4">
          {polls.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-sm text-[var(--foreground)]/65">No active availability polls.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-5">
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
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Poll Title</span>
            <input
              value={form.title}
              onChange={(event) => handleFormChange('title', event.target.value)}
              placeholder="Find a time for weekly standup"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
              required
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="font-medium">Team</span>
            <select
              value={form.projectId}
              onChange={(event) => handleFormChange('projectId', event.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
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
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                required
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Start time</span>
              <input
                type="time"
                value={form.availabilityWindowStartTime}
                onChange={(event) => handleFormChange('availabilityWindowStartTime', event.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                required
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">End day</span>
              <input
                type="date"
                value={form.availabilityWindowEnd}
                onChange={(event) => handleFormChange('availabilityWindowEnd', event.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                required
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">End time</span>
              <input
                type="time"
                value={form.availabilityWindowEndTime}
                onChange={(event) => handleFormChange('availabilityWindowEndTime', event.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                required
              />
            </label>
          </div>

          <p className="text-xs text-[var(--foreground)]/65">
            The poll will cover the selected days from {form.availabilityWindowStartTime || 'start time'} to{' '}
            {form.availabilityWindowEndTime || 'end time'}.
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
