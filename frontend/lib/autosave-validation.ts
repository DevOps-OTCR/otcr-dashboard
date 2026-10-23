export function validDate(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) return 'Enter a complete date.';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return 'Enter a valid date.';
}
export function validDateTime(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || validDate(value.slice(0, 10))) return 'Enter a complete date and time.';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || toLocalDateTime(date.toISOString()) !== value) return 'Enter a valid local date and time.';
}
export const optionalDateTime = (value: string) => value ? validDateTime(value) : undefined;
export const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? undefined : 'Enter a valid time.';
export const validTitle = (value: string) => value.trim() ? undefined : 'A title is required.';
export function validTimezone(value: string): string | undefined {
  if (!value.trim()) return 'A timezone is required.';
  try { new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }); }
  catch { return 'Enter a valid timezone, such as America/Chicago.'; }
}
export function toLocalDateTime(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Sprint boundaries are calendar dates stored at UTC midnight, not local instants. */
export function formatDateOnly(value: string) {
  return new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC' });
}
