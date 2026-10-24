// Pure helpers backing the deadline-reminder configuration UI. Kept free of
// React and network code so they can be unit-tested with `node --test`.

export type ReminderRole = 'CONSULTANT' | 'LC' | 'PM' | 'PARTNER' | 'EXECUTIVE' | 'ADMIN';

export type ReminderOffsetPreset = { minutes: number; label: string };

export type ReminderRecipient = {
  userId: string;
  email: string;
  name: string;
  slackConnected: boolean;
};

export type ReminderRecipientGroup = {
  deliverableId: string;
  title: string;
  unassigned: boolean;
  recipients: ReminderRecipient[];
};

/**
 * Roles allowed to configure reminders. Mirrors the backend `@Roles('ADMIN',
 * 'PM', 'LC')` guard on the reminder config APIs, so the UI hides the controls
 * for everyone else (defense in depth; the backend still enforces it).
 */
export function canConfigureReminders(role: string): boolean {
  return role === 'PM' || role === 'LC' || role === 'ADMIN';
}

/**
 * Validate a selection of reminder offsets against the offered presets:
 * drops values that are not presets, de-duplicates (keeping first appearance),
 * and caps the result at `maxOffsets`. `trimmed` is true when the cap removed
 * entries, so the UI can tell the user their selection was shortened.
 */
export function validateReminderOffsets(
  selected: number[],
  presets: ReminderOffsetPreset[],
  maxOffsets = 5,
): { offsets: number[]; trimmed: boolean } {
  const allowed = new Set(presets.map((p) => p.minutes));
  const seen = new Set<number>();
  const offsets: number[] = [];
  for (const minutes of selected) {
    if (!allowed.has(minutes) || seen.has(minutes)) continue;
    seen.add(minutes);
    offsets.push(minutes);
  }
  const trimmed = offsets.length > maxOffsets;
  return { offsets: offsets.slice(0, maxOffsets), trimmed };
}

/**
 * Summarize a recipient preview for the config UI: the number of unique people
 * who will be notified, who is missing a Slack connection (and so will not
 * actually receive reminders), and which deliverables have no assignee (and so
 * notify nobody). Drives the recipient list and Slack-connection warnings.
 */
export function summarizeReminderRecipients(
  groups: ReminderRecipientGroup[],
): {
  totalRecipients: number;
  missingSlack: ReminderRecipient[];
  unassignedDeliverables: string[];
} {
  const byUser = new Map<string, ReminderRecipient>();
  for (const group of groups) {
    if (group.unassigned) continue;
    for (const recipient of group.recipients) {
      if (!byUser.has(recipient.userId)) byUser.set(recipient.userId, recipient);
    }
  }
  const recipients = [...byUser.values()];
  const unassignedDeliverables = groups
    .filter((g) => g.unassigned || g.recipients.length === 0)
    .map((g) => g.title);
  return {
    totalRecipients: recipients.length,
    missingSlack: recipients.filter((r) => !r.slackConnected),
    unassignedDeliverables,
  };
}

/**
 * Deliverable-level override input coming from the UI.
 */
export type DeliverableReminderInput = {
  enabled?: boolean | null;
  offsetMinutes?: number[] | null;
  explicitRecipientUserIds?: string[] | null;
};

/**
 * Resolved effective reminder config for a deliverable. `inherited` is true
 * when the deliverable has no override (or override fields are null/empty) and
 * falls back to project defaults.
 */
export type ResolvedDeliverableConfig = {
  enabled: boolean;
  offsetMinutes: number[];
  timezone: string;
  inherited: boolean;
};

/**
 * Resolve the effective reminder config for a deliverable from a stored
 * override and the project-level defaults. Null/empty override fields mean
 * "inherit from project".
 */
export function resolveDeliverableReminderConfig(
  override: {
    enabled?: boolean | null;
    offsetMinutes?: number[] | null;
    explicitRecipientUserIds?: string[] | null;
  } | null,
  projectDefaults: { enabled: boolean; offsetMinutes: number[]; timezone: string },
): ResolvedDeliverableConfig {
  const inheritedEnabled = override?.enabled == null;
  const enabled = inheritedEnabled ? projectDefaults.enabled : override.enabled!;
  const inheritedOffsets =
    !override?.offsetMinutes?.length;
  const offsetMinutes = inheritedOffsets
    ? projectDefaults.offsetMinutes
    : override.offsetMinutes!;
  return {
    enabled,
    offsetMinutes,
    timezone: projectDefaults.timezone,
    inherited: inheritedEnabled && inheritedOffsets && !override?.explicitRecipientUserIds?.length,
  };
}

/**
 * Validate custom reminder offsets entered by the user: positive whole
 * minutes, no more than `maxOffsets`, none exceeding `maxOffsetMinutes`.
 */
export function validateCustomOffsets(
  minutes: number[],
  maxOffsets = 5,
  maxOffsetMinutes = 20160,
): { valid: boolean; error?: string } {
  if (minutes.length === 0) {
    return { valid: false, error: 'Select at least one reminder time' };
  }
  if (minutes.length > maxOffsets) {
    return {
      valid: false,
      error: `At most ${maxOffsets} reminder times are allowed`,
    };
  }
  for (const m of minutes) {
    if (!Number.isInteger(m) || m <= 0) {
      return {
        valid: false,
        error: 'Reminder times must be positive whole minutes',
      };
    }
    if (m > maxOffsetMinutes) {
      return {
        valid: false,
        error: `Reminder times cannot exceed ${maxOffsetMinutes} minutes (2 weeks)`,
      };
    }
  }
  return { valid: true };
}

/**
 * Format a reminder offset in minutes into a human-readable label.
 */
export function formatOffsetLabel(minutes: number): string {
  if (minutes >= 10080) {
    return `${minutes / 10080} week${minutes / 10080 !== 1 ? 's' : ''} before`;
  }
  if (minutes >= 1440) {
    return `${minutes / 1440} day${minutes / 1440 !== 1 ? 's' : ''} before`;
  }
  if (minutes >= 60) {
    return `${minutes / 60} hour${minutes / 60 !== 1 ? 's' : ''} before`;
  }
  return `${minutes} minute${minutes !== 1 ? 's' : ''} before`;
}

/**
 * Summarize explicit recipient selection: how many users were explicitly
 * selected, how many are active members of the project, and how many lack a
 * Slack connection.
 */
export function buildExplicitRecipientSummary(
  selectedUserIds: string[],
  projectMembers: { id: string; active: boolean; slackConnected: boolean }[],
): {
  selectedCount: number;
  activeCount: number;
  inactiveCount: number;
  missingSlackCount: number;
} {
  const membersById = new Map(
    projectMembers.map((m) => [m.id, m]),
  );
  const activeSelected = selectedUserIds.filter((id) => {
    const m = membersById.get(id);
    return m ? m.active : false;
  });
  const missingSlack = activeSelected.filter(
    (id) => !membersById.get(id)?.slackConnected,
  );
  return {
    selectedCount: selectedUserIds.length,
    activeCount: activeSelected.length,
    inactiveCount: selectedUserIds.length - activeSelected.length,
    missingSlackCount: missingSlack.length,
  };
}