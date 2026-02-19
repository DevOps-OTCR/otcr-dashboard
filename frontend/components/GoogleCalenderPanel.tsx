'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { projectsAPI, type ProjectListItem } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';

const DEFAULT_CALENDAR_URL =
  'https://calendar.google.com/calendar/embed?src=en.usa%23holiday%40group.v.calendar.google.com&ctz=America%2FChicago';

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
          byProjectId?.googleCalendarEmbedUrl?.trim() ||
          byMembership?.googleCalendarEmbedUrl?.trim() ||
          byPmOwnership?.googleCalendarEmbedUrl?.trim() ||
          firstWithCalendar?.googleCalendarEmbedUrl?.trim() ||
          fallbackCalendarUrl;

        setCalendarUrl(resolved);
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
