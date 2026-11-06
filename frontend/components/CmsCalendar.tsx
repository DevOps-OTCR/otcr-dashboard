'use client';

import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { useCmsSchedule } from '@/lib/use-cms-schedule';
import {
  weekDays,
  startOfWeek,
  addDays,
  itemsForDay,
  moveToDay,
  deliverableIdOf,
  EVENT_COLOR,
  type CalendarItem,
} from '@/lib/cms-calendar';
import { deliverablesAPI } from '@/lib/api';

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatWeekLabel(days: Date[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  const firstPart = `${MONTH_SHORT[first.getMonth()]} ${first.getDate()}`;
  const lastPart =
    first.getMonth() === last.getMonth()
      ? `${last.getDate()}`
      : `${MONTH_SHORT[last.getMonth()]} ${last.getDate()}`;
  return `${firstPart} – ${lastPart}, ${last.getFullYear()}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDayLong(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function serverMessageOf(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const maybe = err as { response?: { data?: { message?: unknown } } };
    const msg = maybe.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return 'try again';
}

export function CmsCalendar({ refreshKey = 0 }: { refreshKey?: number }) {
  const { items, setItems, projects, loading, error, warning } = useCmsSchedule(refreshKey);
  const [anchor, setAnchor] = useState<Date>(() => startOfWeek(new Date()));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const focusIdRef = useRef<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());

  const days = weekDays(anchor);
  const today = new Date();

  async function moveItem(item: CalendarItem, targetDay: Date) {
    if (saving) return;
    if (isSameDay(item.start, targetDay)) return;

    const previousStart = item.start;
    const newStart = moveToDay(item.start, targetDay);

    setSaving(true);
    setAlertMessage(null);
    setStatusMessage(null);
    setItems((prev) =>
      prev
        .map((i) => (i.id === item.id ? { ...i, start: newStart } : i))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    );

    try {
      await deliverablesAPI.updateDeadline(deliverableIdOf(item), newStart.toISOString());
      setStatusMessage(`Moved ${item.title} to ${formatDayLong(newStart)}`);
    } catch (err) {
      setItems((prev) =>
        prev
          .map((i) => (i.id === item.id ? { ...i, start: previousStart } : i))
          .sort((a, b) => a.start.getTime() - b.start.getTime()),
      );
      setAlertMessage(`Could not move ${item.title}: ${serverMessageOf(err)}`);
    } finally {
      setSaving(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, day: Date) {
    e.preventDefault();
    const id = draggingId ?? e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    if (!id) return;
    const item = items.find((i) => i.id === id);
    if (!item || !item.draggable) return;
    void moveItem(item, day);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, item: CalendarItem) {
    if (e.altKey) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
      if (saving) return;
      if (e.key === 'ArrowLeft') {
        const target = addDays(item.start, -1);
        if (target < days[0]) setAnchor(addDays(anchor, -7));
        focusIdRef.current = item.id;
        void moveItem(item, target);
      } else if (e.key === 'ArrowRight') {
        const target = addDays(item.start, 1);
        if (target >= addDays(days[0], 7)) setAnchor(addDays(anchor, 7));
        focusIdRef.current = item.id;
        void moveItem(item, target);
      }
    }
  }

  useEffect(() => {
    const id = focusIdRef.current;
    if (!id) return;
    focusIdRef.current = null;
    itemRefs.current.get(id)?.focus();
  }, [items, anchor]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Team schedule</CardTitle>
          <CardDescription>
            Deliverable deadlines and OTCR events across your projects. PMs can drag a deadline to
            another day.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--accent)]"
            onClick={() => setAnchor((prev) => addDays(prev, -7))}
          >
            Previous week
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--accent)]"
            onClick={() => setAnchor(startOfWeek(new Date()))}
          >
            Today
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--accent)]"
            onClick={() => setAnchor((prev) => addDays(prev, 7))}
          >
            Next week
          </button>
          <span className="ml-auto text-sm font-medium text-[var(--foreground)]">
            {formatWeekLabel(days)}
          </span>
        </div>

        {alertMessage && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
            {alertMessage}
          </div>
        )}
        {statusMessage && (
          <div role="status" className="rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm text-[var(--foreground)]">
            {statusMessage}
          </div>
        )}
        {warning && (
          <div role="status" className="rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm text-[var(--foreground)]">
            {warning}
          </div>
        )}
        {loading && <p className="text-sm text-[var(--foreground)]/70">Loading schedule…</p>}
        {error && !loading && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        )}

        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <div className="grid min-w-[40rem] grid-cols-7 gap-1.5">
                {days.map((day, index) => {
                  const dayItems = itemsForDay(items, day);
                  const isToday = isSameDay(day, today);
                  return (
                    <div
                      key={day.toISOString()}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5"
                      onDragOver={(e) => {
                        if (draggingId) e.preventDefault();
                      }}
                      onDrop={(e) => handleDrop(e, day)}
                    >
                      <div
                        className={`mb-2 rounded-md px-2 py-1 text-center text-xs ${
                          isToday
                            ? 'bg-[var(--primary)] text-[var(--card)]'
                            : 'text-[var(--foreground)]/70'
                        }`}
                      >
                        <div className="font-semibold">{WEEKDAY_SHORT[index]}</div>
                        <div>{day.getDate()}</div>
                      </div>
                      <div className="min-h-[160px] space-y-2">
                        {dayItems.map((item) => (
                          <button
                            key={item.id}
                            ref={(el) => {
                              if (el) itemRefs.current.set(item.id, el);
                              else itemRefs.current.delete(item.id);
                            }}
                            type="button"
                            draggable={item.draggable && !saving}
                            onDragStart={
                              item.draggable
                                ? (e) => {
                                    setDraggingId(item.id);
                                    e.dataTransfer.setData('text/plain', item.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                  }
                                : undefined
                            }
                            onDragEnd={item.draggable ? () => setDraggingId(null) : undefined}
                            onKeyDown={
                              item.draggable ? (e) => handleKeyDown(e, item) : undefined
                            }
                            aria-label={
                              item.draggable
                                ? `${item.title}, ${item.projectName}, due ${formatDayLong(
                                    item.start,
                                  )}. Press Alt plus Left or Right arrow to move one day.`
                                : `${item.title}, ${item.projectName}, ${formatDayLong(item.start)}`
                            }
                            style={{ borderLeftColor: item.color, borderLeftWidth: '3px' }}
                            className={`w-full rounded-md border border-[var(--border)] bg-[var(--secondary)] px-1.5 py-1 text-left ${
                              item.draggable ? 'cursor-grab' : ''
                            }`}
                          >
                            <span className="block line-clamp-2 break-words text-xs font-medium text-[var(--foreground)]">
                              {item.title}
                            </span>
                            <span className="block truncate text-[11px] text-[var(--foreground)]/70">
                              {item.projectName}
                            </span>
                            <span className="block text-[11px] text-[var(--foreground)]/70">
                              {formatTime(item.start)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {projects.map((project) => (
                <span
                  key={project.id}
                  className="flex items-center gap-1.5 text-xs text-[var(--foreground)]/70"
                >
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: project.color }}
                  />
                  {project.name}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-xs text-[var(--foreground)]/70">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: EVENT_COLOR }}
                />
                OTCR events
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
