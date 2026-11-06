export type CalendarProject = {
  id: string;
  name: string;
  googleCalendarId?: string | null;
  googleCalendarEmbedUrl?: string | null;
};

export type CalendarSource = {
  key: string;
  label: string;
  src: string;
  color: string;
  kind: 'firm' | 'project';
};

export const CALENDAR_COLORS = [
  '#039BE5',
  '#33B679',
  '#8E24AA',
  '#E67C73',
  '#F6BF26',
  '#F4511E',
  '#3F51B5',
  '#0B8043',
] as const;

export function extractGoogleCalendarSources(candidate?: string | null): string[] {
  if (!candidate) return [];

  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase();
    const isGoogleCalendarHost =
      host === 'calendar.google.com' || host.endsWith('.calendar.google.com');
    if (!isGoogleCalendarHost || !parsed.pathname.startsWith('/calendar/embed')) {
      return [];
    }

    return parsed.searchParams
      .getAll('src')
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function buildCalendarSources(
  firmEmbedUrl: string,
  projects: CalendarProject[],
): CalendarSource[] {
  const sources: CalendarSource[] = [];
  const seen = new Set<string>();

  for (const src of extractGoogleCalendarSources(firmEmbedUrl)) {
    if (seen.has(src)) continue;
    seen.add(src);
    sources.push({
      key: `firm:${src}`,
      label: 'OTCR events',
      src,
      color: CALENDAR_COLORS[sources.length % CALENDAR_COLORS.length],
      kind: 'firm',
    });
  }

  for (const project of projects ?? []) {
    const trimmedId = project.googleCalendarId?.trim();

    if (trimmedId) {
      if (seen.has(trimmedId)) continue;
      seen.add(trimmedId);
      sources.push({
        key: `project:${project.id}`,
        label: project.name,
        src: trimmedId,
        color: CALENDAR_COLORS[sources.length % CALENDAR_COLORS.length],
        kind: 'project',
      });
      continue;
    }

    const extracted = extractGoogleCalendarSources(project.googleCalendarEmbedUrl);
    let index = 0;
    for (const src of extracted) {
      if (seen.has(src)) continue;
      seen.add(src);
      index += 1;
      sources.push({
        key: index === 1 ? `project:${project.id}` : `project:${project.id}:${index}`,
        label: index === 1 ? project.name : `${project.name} (${index})`,
        src,
        color: CALENDAR_COLORS[sources.length % CALENDAR_COLORS.length],
        kind: 'project',
      });
    }
  }

  return sources;
}

export function buildEmbedUrl(
  firmEmbedUrl: string,
  selected: CalendarSource[],
): string {
  if (!selected || selected.length === 0) {
    return firmEmbedUrl;
  }

  let ctz = 'America/Chicago';
  let mode = 'WEEK';
  let showTitle = '0';
  let showPrint = '0';
  let showNav = '1';
  let showTabs = '0';
  let showCalendars = '0';
  let wkst = '1';
  let height: string | null = null;
  let bgcolor: string | null = null;

  try {
    const base = new URL(firmEmbedUrl);
    ctz = base.searchParams.get('ctz') || ctz;
    mode = base.searchParams.get('mode') || mode;
    showTitle = base.searchParams.get('showTitle') || showTitle;
    showPrint = base.searchParams.get('showPrint') || showPrint;
    showNav = base.searchParams.get('showNav') || showNav;
    showTabs = base.searchParams.get('showTabs') || showTabs;
    showCalendars = base.searchParams.get('showCalendars') || showCalendars;
    wkst = base.searchParams.get('wkst') || wkst;
    height = base.searchParams.get('height');
    bgcolor = base.searchParams.get('bgcolor');
  } catch {
    // fall through with defaults
  }

  const embed = new URL('https://calendar.google.com/calendar/embed');
  embed.searchParams.set('ctz', ctz);
  embed.searchParams.set('mode', mode);
  embed.searchParams.set('showTitle', showTitle);
  embed.searchParams.set('showPrint', showPrint);
  embed.searchParams.set('showNav', showNav);
  embed.searchParams.set('showTabs', showTabs);
  embed.searchParams.set('showCalendars', showCalendars);
  embed.searchParams.set('wkst', wkst);
  if (height) embed.searchParams.set('height', height);
  if (bgcolor) embed.searchParams.set('bgcolor', bgcolor);

  for (const source of selected) {
    embed.searchParams.append('src', source.src);
    embed.searchParams.append('color', source.color);
  }

  return embed.toString();
}
