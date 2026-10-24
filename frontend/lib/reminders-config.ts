// Pure helpers backing the deadline-reminder configuration UI. Kept free of
// React and network code so they can be unit-tested with `node --test`.

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
  deadline: string;
  unassigned: boolean;
  recipients: ReminderRecipient[];
};

/** Keep the selected presets and remove duplicates. */
export function validateReminderOffsets(
  selected: number[],
  presets: ReminderOffsetPreset[],
): number[] {
  const allowed = new Set(presets.map((preset) => preset.minutes));
  return [...new Set(selected)].filter((minutes) => allowed.has(minutes));
}

/**
 * Summarize a recipient preview for the config UI: the number of unique people
 * who will be notified, who is missing a Slack connection (and so will not
 * actually receive reminders), and which deliverables have no assignee (and so
 * notify nobody). Drives the recipient list and Slack-connection warnings.
 */
export function summarizeReminderRecipients(groups: ReminderRecipientGroup[]): {
  totalRecipients: number;
  missingSlack: ReminderRecipient[];
  unassignedDeliverables: string[];
} {
  const byUser = new Map<string, ReminderRecipient>();
  for (const group of groups) {
    if (group.unassigned) continue;
    for (const recipient of group.recipients) {
      if (!byUser.has(recipient.userId))
        byUser.set(recipient.userId, recipient);
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

export type ReminderConfig = {
  enabled: boolean;
  offsetsMinutes: number[];
  timezone: string;
};

export type DeliverableReminderOverride = {
  enabled: boolean | null;
  offsetMinutes: number[];
  explicitRecipientUserIds: string[];
};

export type DeliverableReminderInput = Partial<DeliverableReminderOverride>;

export type DeliverableReminderSettings = ReminderConfig & {
  override: DeliverableReminderOverride | null;
  eligibleRecipients: ReminderRecipient[];
};

export type ReminderDeliveryStatus = {
  id: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  fireAt: string;
  attempts: number;
  lastError: string | null;
  user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  };
  deliverable: { id: string; title: string; deadline: string };
};

export function inheritsProjectReminders(
  override: DeliverableReminderOverride | null,
): boolean {
  return (
    override?.enabled == null &&
    !override?.offsetMinutes.length &&
    !override?.explicitRecipientUserIds.length
  );
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
