'use client';

import { useEffect, useState, useCallback } from 'react';
import { Slack, ChevronDown, ChevronRight, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { remindersAPI } from '@/lib/api';
import {
  buildExplicitRecipientSummary,
  formatOffsetLabel,
  resolveDeliverableReminderConfig,
  validateCustomOffsets,
  type ResolvedDeliverableConfig,
} from '@/lib/reminders-config';

type ProjectMember = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  active: boolean;
  slackConnected: boolean;
};

type SprintDeliverable = {
  id: string;
  title: string;
  deadline: string;
  status: string;
  projectId: string;
  reminderOverride?: {
    enabled?: boolean | null;
    offsetMinutes?: number[] | null;
    explicitRecipientUserIds?: string[] | null;
  } | null;
};

type DeliveryReminderOverridesProps = {
  projectId: string;
  projectTimezone: string;
  projectDefaults: { enabled: boolean; offsetMinutes: number[]; timezone: string };
  deliverables: SprintDeliverable[];
  members: ProjectMember[];
  canConfigure: boolean;
  onConfigChange?: () => void;
};

export function DeliveryReminderOverrides({
  projectId,
  projectTimezone,
  projectDefaults,
  deliverables,
  members,
  canConfigure,
  onConfigChange,
}: DeliveryReminderOverridesProps) {
  const [expandedDeliverable, setExpandedDeliverable] = useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<any[]>([]);
  const [deliveryStatusLoading, setDeliveryStatusLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [overrideSaving, setOverrideSaving] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Map<string, ResolvedDeliverableConfig>>(new Map());

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setDeliveryStatusLoading(true);
      try {
        const res = await remindersAPI.getStatus(
          projectId,
          statusFilter === 'ALL' ? undefined : statusFilter,
        );
        if (mounted) setDeliveryStatus(res.data ?? []);
      } catch {
        if (mounted) setDeliveryStatus([]);
      } finally {
        if (mounted) setDeliveryStatusLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [projectId, statusFilter]);

  const getDraft = useCallback(
    (deliverableId: string): ResolvedDeliverableConfig => {
      const existing = drafts.get(deliverableId);
      if (existing) return existing;
      const d = deliverables.find((x) => x.id === deliverableId);
      const resolved = resolveDeliverableReminderConfig(
        d?.reminderOverride ?? null,
        projectDefaults,
      );
      setDrafts((prev) => new Map(prev).set(deliverableId, resolved));
      return resolved;
    },
    [deliverables, drafts, projectDefaults],
  );

  const handleToggleInherit = (deliverableId: string) => {
    const draft = getDraft(deliverableId);
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(deliverableId, {
        ...draft,
        inherited: !draft.inherited,
        enabled: draft.inherited ? projectDefaults.enabled : !draft.enabled,
      });
      return next;
    });
  };

  const handleToggleEnabled = (deliverableId: string) => {
    const draft = getDraft(deliverableId);
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(deliverableId, {
        ...draft,
        inherited: false,
        enabled: !draft.enabled,
      });
      return next;
    });
  };

  const handleOffsetChange = (deliverableId: string, minutes: number, checked: boolean) => {
    const draft = getDraft(deliverableId);
    const current = new Set(draft.offsetMinutes);
    if (checked) current.add(minutes);
    else current.delete(minutes);
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(deliverableId, {
        ...draft,
        inherited: false,
        offsetMinutes: [...current].sort((a, b) => b - a),
      });
      return next;
    });
  };

  const handleSaveOverride = async (deliverableId: string) => {
    setOverrideSaving((prev) => new Set(prev).add(deliverableId));
    try {
      const draft = getDraft(deliverableId);
      const validation = validateCustomOffsets(draft.offsetMinutes);
      if (!validation.valid) {
        alert(validation.error);
        return;
      }
      await remindersAPI.updateDeliverableConfig(deliverableId, {
        enabled: draft.inherited ? undefined : draft.enabled,
        offsetMinutes: draft.inherited ? undefined : draft.offsetMinutes,
        explicitRecipientUserIds: draft.inherited ? undefined : [],
      });
      setExpandedDeliverable(null);
      onConfigChange?.();
    } catch {
      alert('Failed to save reminder override');
    } finally {
      setOverrideSaving((prev) => {
        const next = new Set(prev);
        next.delete(deliverableId);
        return next;
      });
    }
  };

  const handleResetToInherit = (deliverableId: string) => {
    const d = deliverables.find((x) => x.id === deliverableId)!;
    const resolved = resolveDeliverableReminderConfig(
      d.reminderOverride ?? null,
      projectDefaults,
    );
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(deliverableId, resolved);
      return next;
    });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'PENDING': return <Badge variant="default">Pending</Badge>;
      case 'SENT': return <Badge variant="info">Sent</Badge>;
      case 'FAILED': return <Badge variant="danger">Failed</Badge>;
      case 'CANCELLED': return <Badge variant="default">Cancelled</Badge>;
      default: return <Badge variant="default">{status}</Badge>;
    }
  };

  const filteredStatus = deliveryStatus.filter(
    (r) => statusFilter === 'ALL' || r.status === statusFilter,
  );

  return (
    <div className="space-y-6">
      <section className="border rounded-xl border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Slack className="w-4 h-4 text-[var(--primary)]" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Per-Deliverable Reminder Overrides
            </h3>
          </div>
          <p className="text-xs text-[var(--foreground)]/60">
            Override project reminder settings for individual deliverables
          </p>
        </div>
        <div className="space-y-3">
          {deliverables.map((d) => {
            const draft = getDraft(d.id);
            const isExpanded = expandedDeliverable === d.id;
            const isSaving = overrideSaving.has(d.id);
            const summary = buildExplicitRecipientSummary(
              d.reminderOverride?.explicitRecipientUserIds ?? [],
              members,
            );
            return (
              <div key={d.id} className="border border-[var(--border)] rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedDeliverable(isExpanded ? null : d.id)}
                      className="p-1 hover:bg-[var(--accent)] rounded"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <span className="text-sm font-medium text-[var(--foreground)]">{d.title}</span>
                    {draft.inherited ? (
                      <Badge variant="default" size="sm" className="ml-2">Inherits project defaults</Badge>
                    ) : (
                      <Badge variant="info" size="sm" className="ml-2">Custom</Badge>
                    )}
                  </div>
                  <span className="text-xs text-[var(--foreground)]/60">
                    {new Date(d.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                {isExpanded && canConfigure && (
                  <div className="space-y-3 pt-3 border-t border-[var(--border)]/50">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={draft.inherited} onChange={() => handleToggleInherit(d.id)} disabled={!canConfigure} className="rounded border-[var(--border)]" />
                        <span className="text-sm text-[var(--foreground)]">
                          Use project defaults ({draft.enabled ? 'enabled' : 'disabled'}, {draft.offsetMinutes.join(', ')} min)
                        </span>
                      </label>
                      {!draft.inherited && (
                        <>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={draft.enabled} onChange={() => handleToggleEnabled(d.id)} disabled={!canConfigure} className="rounded border-[var(--border)]" />
                            <span className="text-sm text-[var(--foreground)]">Enable reminders for this deliverable</span>
                          </label>
                          {draft.enabled && (
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-[var(--foreground)]/70 mb-1 block">Reminder times</span>
                              <div className="grid gap-2 sm:grid-cols-3">
                                {[60, 120, 1440, 10080, 20160].map((m) => {
                                  const checked = draft.offsetMinutes.includes(m);
                                  return (
                                    <label key={m} className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                                      <input type="checkbox" checked={checked} onChange={(e) => handleOffsetChange(d.id, m, e.target.checked)} disabled={!canConfigure} className="rounded border-[var(--border)]" />
                                      {formatOffsetLabel(m)}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <div className="pt-2 border-t border-[var(--border)]/50">
                            <span className="text-xs font-medium text-[var(--foreground)]/70 mb-2 block">Explicit recipients</span>
                            <p className="text-xs text-[var(--foreground)]/60">
                              {summary.activeCount} of {summary.selectedCount} selected
                              {summary.inactiveCount > 0 && <> - {summary.inactiveCount} inactive</>}
                              {summary.missingSlackCount > 0 && <> - {summary.missingSlackCount} without Slack</>}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3 pt-3">
                      <Button size="sm" variant="outline" onClick={() => handleResetToInherit(d.id)} disabled={!canConfigure || draft.inherited}>
                        Reset to inherit
                      </Button>
                      <Button size="sm" onClick={() => handleSaveOverride(d.id)} disabled={!canConfigure || isSaving}>
                        {isSaving ? 'Saving...' : 'Save override'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="border rounded-xl border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Delivery Status</h3>
          </div>
          <button
            onClick={() => setStatusFilter(statusFilter === 'ALL' ? 'PENDING' : statusFilter === 'PENDING' ? 'SENT' : statusFilter === 'SENT' ? 'FAILED' : statusFilter === 'FAILED' ? 'CANCELLED' : 'ALL')}
            className="text-xs border border-[var(--border)] rounded px-2 py-1 text-[var(--foreground)]/60 hover:text-[var(--foreground)]"
          >
            {statusFilter === 'ALL' ? 'All statuses' : statusFilter}
          </button>
        </div>
        {deliveryStatusLoading ? (
          <p className="text-sm text-[var(--foreground)]/60">Loading delivery status...</p>
        ) : filteredStatus.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--foreground)]/60">
            No {statusFilter === 'ALL' ? 'reminders' : statusFilter.toLowerCase()} reminders found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]/50">
                  <th className="text-left pb-2 text-[var(--foreground)]/60 font-medium">Deliverable</th>
                  <th className="text-left pb-2 text-[var(--foreground)]/60 font-medium">Recipient</th>
                  <th className="text-left pb-2 text-[var(--foreground)]/60 font-medium">Scheduled</th>
                  <th className="text-left pb-2 text-[var(--foreground)]/60 font-medium">Status</th>
                  <th className="text-right pb-2 text-[var(--foreground)]/60 font-medium">Attempts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/50">
                {filteredStatus.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--accent)]/50 transition-colors">
                    <td className="py-3 text-[var(--foreground)]">{r.deliverableTitle}</td>
                    <td className="py-3 flex items-center gap-2">
                      <User className="w-3 h-3 text-[var(--foreground)]/40" />
                      <span className="text-[var(--foreground)]">{r.userName}</span>
                    </td>
                    <td className="py-3 text-[var(--foreground)]/60">
                      {new Date(r.fireAt).toLocaleString(undefined, {
                        timeZone: projectTimezone,
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3">{statusBadge(r.status)}</td>
                    <td className="py-3 text-right text-[var(--foreground)]/60">{r.attempts}</td>
                    {r.status === 'FAILED' && r.lastError && (
                      <td className="py-3">
                        <Button size="sm" variant="outline" onClick={() => alert(r.lastError)}>
                          {r.lastError}
                        </Button>
                      </td>
                    )}
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
