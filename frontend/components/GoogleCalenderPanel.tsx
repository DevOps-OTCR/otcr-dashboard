'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageLoading } from './PageLoading';
import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { projectsAPI, setAuthToken, type ProjectListItem } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import {
  buildCalendarSources,
  buildEmbedUrl,
  type CalendarSource,
} from '@/lib/calendar-sources';

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

type GoogleCalendarPanelProps = {
  title?: string;
  description?: string;
  className?: string;
  projectId?: string;
  active?: boolean;
};

export function GoogleCalendarPanel({
  title = 'Calendar',
  description = 'Upcoming dates and deadlines',
  className,
  projectId,
  active = true,
}: GoogleCalendarPanelProps) {
  const session = useAuth();
  const fallbackCalendarUrl = useMemo(
    () => process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_EMBED_URL || DEFAULT_CALENDAR_URL,
    [],
  );
  const [sources, setSources] = useState<CalendarSource[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const getToken = session.getToken;
  const email = session?.user?.email;
  const isLoggedIn = session?.isLoggedIn;

  useEffect(() => {
    if (!active) return;

    if (!isLoggedIn || !email) {
      const fallbackSources = buildCalendarSources(fallbackCalendarUrl, []);
      setSources(fallbackSources);
      setSelected(new Set(fallbackSources.map((source) => source.key)));
      return;
    }

    let canceled = false;
    getToken()
      .then((token) => {
        if (canceled) return null;
        setAuthToken(token || email || null);
        return projectsAPI.getAll({ includeMembers: true, limit: 100 });
      })
      .then((res) => {
        if (canceled || !res) return;
        const projects = (res.data?.projects ?? []) as ProjectListItem[];

        const nextSources = buildCalendarSources(fallbackCalendarUrl, projects);

        const defaultSelected = new Set(
          nextSources
            .filter((source) => source.kind === 'firm')
            .map((source) => source.key),
        );

        const projectSource = projectId
          ? nextSources.find((source) => source.key === `project:${projectId}`)
          : undefined;

        if (projectSource) {
          defaultSelected.add(projectSource.key);
        } else {
          nextSources.forEach((source) => defaultSelected.add(source.key));
        }

        setSources(nextSources);
        setSelected(defaultSelected);
      })
      .catch(() => {
        if (canceled) return;
        const fallbackSources = buildCalendarSources(fallbackCalendarUrl, []);
        setSources(fallbackSources);
        setSelected(new Set(fallbackSources.map((source) => source.key)));
      });

    return () => {
      canceled = true;
    };
  }, [isLoggedIn, email, fallbackCalendarUrl, projectId, active, getToken]);

  const embedUrl = useMemo(() => {
    if (!sources) return null;
    const visible = sources.filter((source) => selected.has(source.key));
    return sanitizeCalendarEmbedUrl(
      buildEmbedUrl(fallbackCalendarUrl, visible),
      fallbackCalendarUrl,
    );
  }, [sources, selected, fallbackCalendarUrl]);

  const allSelected =
    sources !== null && sources.length > 0 && sources.every((source) => selected.has(source.key));

  const toggleSource = (key: string) => {
    setSelected((current) => {
      if (current.has(key)) {
        if (current.size === 1) return current;
        const next = new Set(current);
        next.delete(key);
        return next;
      }
      const next = new Set(current);
      next.add(key);
      return next;
    });
  };

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
        {sources && sources.length >= 2 && (
          <div role="group" aria-label="Calendars to show" className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={allSelected}
              onClick={() => setSelected(new Set(sources.map((source) => source.key)))}
              className={
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition' +
                (allSelected
                  ? ' border-[var(--primary)] bg-[var(--secondary)]'
                  : ' border-[var(--border)] opacity-60')
              }
            >
              All calendars
            </button>
            {sources.map((source) => {
              const isSelected = selected.has(source.key);
              return (
                <button
                  key={source.key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleSource(source.key)}
                  className={
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition' +
                    (isSelected
                      ? ' border-[var(--primary)] bg-[var(--secondary)]'
                      : ' border-[var(--border)] opacity-60')
                  }
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: source.color }}
                    aria-hidden
                  />
                  {source.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--secondary)]/50 h-[430px]">
          {embedUrl ? <iframe
            title="OTCR Google Calendar"
            src={embedUrl}
            className="google-calendar-embed w-full h-full"
            frameBorder="0"
            scrolling="no"
          /> : <PageLoading />}
        </div>
      </CardContent>
    </Card>
  );
}
