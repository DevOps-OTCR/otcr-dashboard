export type WorkstreamOption = { id: string; name: string; weekStartDate: string; weekEndDate: string };

function dateIn(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function todayIn(timeZone: string | undefined, now: Date): string {
  try {
    return dateIn(timeZone || 'America/Chicago', now);
  } catch {
    return dateIn('America/Chicago', now); // the project has an unrecognized timezone
  }
}

/**
 * Keeps the current selection if it's still listed. Otherwise picks the listed week that
 * contains today in the project's timezone, or '' ("No workstream") if there is none.
 * Week dates are stored as UTC calendar days, so they compare as YYYY-MM-DD text.
 */
export function pickWorkstream(list: WorkstreamOption[], selected: string, timeZone: string | undefined, now: Date): string {
  if (selected && list.some((w) => w.id === selected)) return selected;
  const today = todayIn(timeZone, now);
  const current = list
    .filter((w) => w.weekStartDate.slice(0, 10) <= today && today <= w.weekEndDate.slice(0, 10))
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
  return current[0]?.id ?? '';
}
