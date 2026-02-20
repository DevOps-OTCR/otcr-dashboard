/**
 * Remember which dashboard the user last visited (/pm, /lc, /partner)
 * so shared pages (engagement, teams) can show the matching navbar and home link.
 */

const KEY = 'otcr_last_dashboard';

export type LastDashboardPath = '/pm' | '/lc' | '/partner';

export function getLastDashboard(): LastDashboardPath | null {
  if (typeof window === 'undefined') return null;
  const stored = sessionStorage.getItem(KEY);
  if (stored === '/pm' || stored === '/lc' || stored === '/partner') return stored;
  return null;
}

export function setLastDashboard(path: LastDashboardPath): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, path);
}
