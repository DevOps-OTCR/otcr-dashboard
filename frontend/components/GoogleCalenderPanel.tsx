'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { projectsAPI, type ProjectListItem } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';

const DEFAULT_CALENDAR_URL =
  'https://calendar.google.com/calendar/embed?src=en.usa%23holiday%40group.v.calendar.google.com&ctz=America%2FChicago';

function sanitizeCalendarEmbedUrl(candidate: string, fallback: string): string {
  const trimmed = candidate.trim();
  if (!trimmed) return fallback;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isGoogleCalendarHost =
      host === 'calendar.google.com' || host.endsWith('.calendar.google.com');
    const isEmbedPath = parsed.pathname.startsWith('/calendar/embed');

    // Google Calendar root/regular pages send frame-ancestors: 'self' and cannot be embedded.
    if (isGoogleCalendarHost && !isEmbedPath) {
      return fallback;
    }

    return parsed.toString();
  } catch {
    return fallback;
  }
}

function extractGoogleCalendarSources(candidate?: string | null): string[] {
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

function buildCombinedCalendarEmbedUrl(primary: string, secondary?: string | null): string {
  const primarySources = extractGoogleCalendarSources(primary);
  const secondarySources = extractGoogleCalendarSources(secondary);
  const allSources = Array.from(new Set([...primarySources, ...secondarySources]));

  if (allSources.length === 0) {
    return primary;
  }

  const base = new URL(primary);
  const ctz = base.searchParams.get('ctz') || 'America/Chicago';
  const mode = base.searchParams.get('mode') || 'WEEK';
  const showTitle = base.searchParams.get('showTitle') || '0';
  const showPrint = base.searchParams.get('showPrint') || '0';
  const showNav = base.searchParams.get('showNav') || '1';
  const showTabs = base.searchParams.get('showTabs') || '0';
  const showCalendars = base.searchParams.get('showCalendars') || '0';
  const wkst = base.searchParams.get('wkst') || '1';
  const height = base.searchParams.get('height');
  const bgcolor = base.searchParams.get('bgcolor');

  const combined = new URL('https://calendar.google.com/calendar/embed');
  combined.searchParams.set('ctz', ctz);
  combined.searchParams.set('mode', mode);
  combined.searchParams.set('showTitle', showTitle);
  combined.searchParams.set('showPrint', showPrint);
  combined.searchParams.set('showNav', showNav);
  combined.searchParams.set('showTabs', showTabs);
  combined.searchParams.set('showCalendars', showCalendars);
  combined.searchParams.set('wkst', wkst);
  if (height) combined.searchParams.set('height', height);
  if (bgcolor) combined.searchParams.set('bgcolor', bgcolor);

  allSources.forEach((src) => combined.searchParams.append('src', src));

  return combined.toString();
}

type GoogleCalendarPanelProps = {
  title?: string;
  description?: string;
  className?: string;
  projectId?: string;
};

export function GoogleCalendarPanel({
  title = 'Calendar',
  description = 'Upcoming dates and deadlines',
  className,
  projectId,
}: GoogleCalendarPanelProps) {
  const session = useAuth();
  const fallbackCalendarUrl = useMemo(
    () => process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_EMBED_URL || DEFAULT_CALENDAR_URL,
    [],
  );
  const [calendarUrl, setCalendarUrl] = useState(fallbackCalendarUrl);

  useEffect(() => {
    if (!session?.isLoggedIn || !session?.user?.email) {
      setCalendarUrl(fallbackCalendarUrl);
      return;
    }

    let canceled = false;
    projectsAPI
      .getAll({ includeMembers: true, limit: 100 })
      .then((res) => {
        if (canceled) return;
        const projects = (res.data?.projects ?? []) as ProjectListItem[];
        const normalizedEmail = (session?.user?.email ?? '').toLowerCase();

        const byProjectId = projectId
          ? projects.find((project) => project.id === projectId)
          : undefined;
        const byMembership = projects.find((project) =>
          (project.members ?? []).some(
            (member) => (member.user.email ?? '').toLowerCase() === normalizedEmail,
          ),
        );
        const byPmOwnership = projects.find(
          (project) => (project.pm?.email ?? '').toLowerCase() === normalizedEmail,
        );
        const firstWithCalendar = projects.find(
          (project) => typeof project.googleCalendarEmbedUrl === 'string' && project.googleCalendarEmbedUrl.trim(),
        );

        const resolved =
          byProjectId?.googleCalendarEmbedUrl?.trim() ??
          byMembership?.googleCalendarEmbedUrl?.trim() ??
          byPmOwnership?.googleCalendarEmbedUrl?.trim() ??
          firstWithCalendar?.googleCalendarEmbedUrl?.trim() ??
          null;

        setCalendarUrl(
          sanitizeCalendarEmbedUrl(
            buildCombinedCalendarEmbedUrl(fallbackCalendarUrl, resolved),
            fallbackCalendarUrl,
          ),
        );
      })
      .catch(() => {
        if (!canceled) {
          setCalendarUrl(fallbackCalendarUrl);
        }
      });

    return () => {
      canceled = true;
    };
  }, [session?.isLoggedIn, session?.user?.email, fallbackCalendarUrl, projectId]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-[var(--primary)]" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--secondary)]/50 h-[430px]">
          <iframe
            title="OTCR Google Calendar"
            src={calendarUrl}
            className="w-full h-full"
            frameBorder="0"
            scrolling="no"
          />
        </div>
      </CardContent>
    </Card>
  );
}
