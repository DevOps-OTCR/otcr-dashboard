export type ResolvedReminderConfig = {
  enabled: boolean;
  offsetsMinutes: number[];
  timezone: string;
};

type ReminderOverride = {
  enabled?: boolean | null;
  offsetMinutes?: number[];
};

/** Resolve settings consistently for scheduling, previews, and delivery checks. */
export function resolveReminderConfig(
  project: Partial<ResolvedReminderConfig>,
  override?: ReminderOverride | null,
): ResolvedReminderConfig {
  return {
    enabled: override?.enabled ?? project.enabled ?? false,
    offsetsMinutes: override?.offsetMinutes?.length
      ? override.offsetMinutes
      : (project.offsetsMinutes ?? [1440, 60]),
    timezone: project.timezone || 'America/Chicago',
  };
}
