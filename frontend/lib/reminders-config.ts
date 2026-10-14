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