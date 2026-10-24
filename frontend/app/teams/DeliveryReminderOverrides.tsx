'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  remindersAPI,
  type DeliverableReminderSettings,
  type ReminderDeliveryStatus,
} from '@/lib/api';
import {
  formatOffsetLabel,
  resolveDeliverableReminderConfig,
  validateCustomOffsets,
} from '@/lib/reminders-config';

type Defaults = { enabled: boolean; offsetMinutes: number[]; timezone: string };
type Deliverable = { id: string; title: string; deadline: string };
type Draft = ReturnType<typeof resolveDeliverableReminderConfig> & {
  recipientIds: string[];
};

function makeDraft(settings: DeliverableReminderSettings): Draft {
  return {
    ...resolveDeliverableReminderConfig(settings.override, {
      enabled: settings.enabled,
      offsetMinutes: settings.offsetsMinutes,
      timezone: settings.timezone,
    }),
    recipientIds: settings.override?.explicitRecipientUserIds ?? [],
  };
}

function OverrideEditor({
  deliverable,
  defaults,
  onSaved,
}: {
  deliverable: Deliverable;
  defaults: Defaults;
  onSaved: () => void;
}) {
  const [settings, setSettings] = useState<DeliverableReminderSettings | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    remindersAPI
      .getDeliverableConfig(deliverable.id)
      .then((res) => {
        if (current) {
          setSettings(res.data);
          setDraft(makeDraft(res.data));
          setError(null);
        }
      })
      .catch(() => {
        if (current) setError('Could not load reminder settings.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [deliverable.id, reload]);

  if (loading) return <p role="status">Loading reminder settings...</p>;
  if (!draft || !settings)
    return (
      <div role="alert">
        {error} <Button onClick={() => setReload((n) => n + 1)}>Retry</Button>
      </div>
    );
  const save = async () => {
    if (!draft.inherited && draft.enabled) {
      const validation = validateCustomOffsets(draft.offsetMinutes);
      if (!validation.valid) {
        setError(validation.error ?? 'Invalid reminder times');
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const res = await remindersAPI.updateDeliverableConfig(deliverable.id, {
        enabled: draft.inherited ? null : draft.enabled,
        offsetMinutes: draft.inherited ? [] : draft.offsetMinutes,
        explicitRecipientUserIds: draft.inherited ? [] : draft.recipientIds,
      });
      setSettings(res.data);
      setDraft(makeDraft(res.data));
      onSaved();
    } catch {
      setError(
        'Could not save reminder settings. Your changes are still here; try again.',
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <fieldset disabled={saving} className="space-y-3 pt-3">
      <label className="flex gap-2 items-center">
        <input
          type="checkbox"
          checked={draft.inherited}
          onChange={(event) =>
            setDraft({
              ...draft,
              inherited: event.target.checked,
              ...(event.target.checked
                ? { ...defaults, recipientIds: [] }
                : {}),
            })
          }
        />
        Use project defaults
      </label>
      {!draft.inherited && (
        <>
          <label className="flex gap-2 items-center">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                setDraft({ ...draft, enabled: event.target.checked })
              }
            />
            Enable reminders for this deliverable
          </label>
          {draft.enabled && (
            <div>
              <p className="text-sm font-medium">Reminder times</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ...new Set([
                    60,
                    120,
                    1440,
                    10080,
                    20160,
                    ...draft.offsetMinutes,
                  ]),
                ]
                  .sort((a, b) => a - b)
                  .map((minutes) => (
                    <label
                      key={minutes}
                      className="flex gap-2 items-center text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={draft.offsetMinutes.includes(minutes)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            offsetMinutes: event.target.checked
                              ? [...draft.offsetMinutes, minutes]
                              : draft.offsetMinutes.filter(
                                  (n) => n !== minutes,
                                ),
                          })
                        }
                      />
                      {formatOffsetLabel(minutes)}
                    </label>
                  ))}
              </div>
              <label className="block mt-2 text-sm">
                Add custom reminder (minutes before deadline)
                <input
                  type="number"
                  min={1}
                  max={20160}
                  step={1}
                  className="ml-2 border rounded p-1 bg-[var(--background)]"
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    const minutes = Number(event.currentTarget.value);
                    const next = [
                      ...new Set([...draft.offsetMinutes, minutes]),
                    ];
                    const validation = validateCustomOffsets(next);
                    if (!validation.valid)
                      setError(validation.error ?? 'Invalid reminder time');
                    else {
                      setDraft({ ...draft, offsetMinutes: next });
                      event.currentTarget.value = '';
                      setError(null);
                    }
                  }}
                />
              </label>
              <p className="text-xs">
                Press Enter to add. Up to five reminders, at most two weeks
                before the deadline.
              </p>
            </div>
          )}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Explicit recipients</legend>
            <p className="text-xs">
              Leave all unchecked to use the deliverable&apos;s active
              assignees.
            </p>
            {settings.eligibleRecipients.map((person) => (
              <label
                key={person.userId}
                className="flex gap-2 items-center text-sm"
              >
                <input
                  type="checkbox"
                  checked={draft.recipientIds.includes(person.userId)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      recipientIds: event.target.checked
                        ? [...draft.recipientIds, person.userId]
                        : draft.recipientIds.filter(
                            (id) => id !== person.userId,
                          ),
                    })
                  }
                />
                {person.name} ({person.email}){' '}
                <Badge
                  size="sm"
                  variant={person.slackConnected ? 'success' : 'warning'}
                >
                  {person.slackConnected ? 'Slack' : 'No Slack'}
                </Badge>
              </label>
            ))}
          </fieldset>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setDraft({ ...defaults, inherited: true, recipientIds: [] })
          }
        >
          Reset to inherit
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving...' : 'Save override'}
        </Button>
      </div>
    </fieldset>
  );
}

export function DeliveryReminderOverrides({
  projectId,
  projectTimezone,
  projectDefaults,
  deliverables,
  onConfigChange,
}: {
  projectId: string;
  projectTimezone: string;
  projectDefaults: Defaults;
  deliverables: Deliverable[];
  onConfigChange?: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rows, setRows] = useState<ReminderDeliveryStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    remindersAPI
      .getStatus(projectId, filter === 'ALL' ? undefined : filter, refresh > 0)
      .then((res) => {
        if (current) {
          setRows(res.data);
          setError(null);
        }
      })
      .catch(() => {
        if (current) setError('Could not load delivery status.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [projectId, filter, refresh]);
  const refreshStatus = () => setRefresh((n) => n + 1);
  const section =
    'border rounded-xl border-[var(--border)] bg-[var(--card)] p-5 space-y-3';
  return (
    <div className="space-y-6">
      <section className={section}>
        <h3 className="text-sm font-semibold">
          Per-Deliverable Reminder Overrides
        </h3>
        {deliverables.map((d) => (
          <div
            key={d.id}
            className="border border-[var(--border)] rounded-lg p-3"
          >
            <button
              aria-expanded={expanded === d.id}
              className="flex gap-2 items-center text-sm font-medium"
              onClick={() => setExpanded(expanded === d.id ? null : d.id)}
            >
              {expanded === d.id ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              {d.title}
            </button>
            {expanded === d.id && (
              <OverrideEditor
                deliverable={d}
                defaults={projectDefaults}
                onSaved={() => {
                  refreshStatus();
                  onConfigChange?.();
                }}
              />
            )}
          </div>
        ))}
      </section>
      <section className={section}>
        <h3 className="text-sm font-semibold">Delivery Status</h3>
        <div className="flex gap-3">
          <label className="text-sm">
            Status{' '}
            <select
              className="border rounded p-1 bg-[var(--background)]"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              {['PENDING', 'SENT', 'FAILED', 'CANCELLED'].map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <Button size="sm" variant="outline" onClick={refreshStatus}>
            Refresh status
          </Button>
        </div>
        <p className="text-xs">Times shown in {projectTimezone}.</p>
        {error && (
          <p role="alert">
            {error}{' '}
            <Button size="sm" onClick={refreshStatus}>
              Retry
            </Button>
          </p>
        )}
        {loading ? (
          <p role="status">Loading delivery status...</p>
        ) : !rows.length && !error ? (
          <p>No reminders found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  {[
                    'Deliverable',
                    'Recipient',
                    'Scheduled',
                    'Status',
                    'Attempts',
                    'Error',
                  ].map((title) => (
                    <th key={title} className="p-2">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border)]">
                    <td className="p-2">{row.deliverable.title}</td>
                    <td className="p-2">
                      {[row.user.firstName, row.user.lastName]
                        .filter(Boolean)
                        .join(' ') || row.user.email}
                    </td>
                    <td className="p-2">
                      {new Date(row.fireAt).toLocaleString(undefined, {
                        timeZone: projectTimezone,
                      })}
                    </td>
                    <td className="p-2">
                      <Badge
                        variant={
                          row.status === 'FAILED'
                            ? 'danger'
                            : row.status === 'SENT'
                              ? 'success'
                              : 'default'
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="p-2">{row.attempts}</td>
                    <td className="p-2 break-words">{row.lastError ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
