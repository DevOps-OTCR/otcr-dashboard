import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const jwt = require('jsonwebtoken');

type CalendarEligibleTask = {
  id: string;
  taskName: string;
  description?: string | null;
  dueDate: Date;
  projectName: string;
  workstream: string;
  assigneeType: 'PERSON' | 'ALL' | 'ALL_PMS' | 'ALL_TEAM';
  projectId?: string | null;
  googleCalendarEventId?: string | null;
  googleCalendarId?: string | null;
};

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private accessTokenCache: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async syncTask(task: CalendarEligibleTask): Promise<{
    googleCalendarEventId: string | null;
    googleCalendarId: string | null;
  }> {
    const targetCalendarId = await this.resolveTaskCalendarId(task);

    if (!targetCalendarId) {
      if (task.googleCalendarEventId && task.googleCalendarId) {
        await this.deleteEvent(task.googleCalendarId, task.googleCalendarEventId);
      }

      return {
        googleCalendarEventId: null,
        googleCalendarId: null,
      };
    }

    if (!this.isConfigured()) {
      this.logger.warn(
        `Skipping Google Calendar sync for task ${task.id}: service account env vars are missing.`,
      );
      return {
        googleCalendarEventId: task.googleCalendarEventId ?? null,
        googleCalendarId: task.googleCalendarId ?? null,
      };
    }

    const payload = this.buildEventPayload(task);

    try {
      if (
        task.googleCalendarEventId &&
        task.googleCalendarId &&
        task.googleCalendarId !== targetCalendarId
      ) {
        await this.deleteEvent(task.googleCalendarId, task.googleCalendarEventId);
      }

      if (
        task.googleCalendarEventId &&
        (!task.googleCalendarId || task.googleCalendarId === targetCalendarId)
      ) {
        await this.upsertEvent(targetCalendarId, task.googleCalendarEventId, payload);
        return {
          googleCalendarEventId: task.googleCalendarEventId,
          googleCalendarId: targetCalendarId,
        };
      }

      const created = await this.createEvent(targetCalendarId, payload);
      return {
        googleCalendarEventId: created.id ?? null,
        googleCalendarId: targetCalendarId,
      };
    } catch (error: any) {
      const message = error?.message ?? 'Unknown Google Calendar sync error';
      this.logger.error(`Failed to sync task ${task.id} to Google Calendar: ${message}`);
      return {
        googleCalendarEventId: task.googleCalendarEventId ?? null,
        googleCalendarId: task.googleCalendarId ?? null,
      };
    }
  }

  async removeTaskEvent(task: Pick<CalendarEligibleTask, 'id' | 'googleCalendarEventId' | 'googleCalendarId'>) {
    if (!task.googleCalendarEventId || !task.googleCalendarId) {
      return;
    }

    if (!this.isConfigured()) {
      this.logger.warn(
        `Skipping Google Calendar delete for task ${task.id}: service account env vars are missing.`,
      );
      return;
    }

    try {
      await this.deleteEvent(task.googleCalendarId, task.googleCalendarEventId);
    } catch (error: any) {
      const message = error?.message ?? 'Unknown Google Calendar delete error';
      this.logger.error(`Failed to delete Google Calendar event for task ${task.id}: ${message}`);
    }
  }

  private async resolveTaskCalendarId(task: CalendarEligibleTask): Promise<string | null> {
    if (task.assigneeType === 'ALL') {
      return this.configService.get<string>('GOOGLE_CALENDAR_FIRMWIDE_ID')?.trim() || null;
    }

    if (task.assigneeType !== 'ALL_TEAM' || !task.projectId) {
      return null;
    }

    const project = await (this.prisma.project as any).findUnique({
      where: { id: task.projectId },
      select: { googleCalendarId: true },
    });

    return project?.googleCalendarId?.trim() || null;
  }

  private buildEventPayload(task: CalendarEligibleTask) {
    const start = new Date(task.dueDate);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const timeZone =
      this.configService.get<string>('GOOGLE_CALENDAR_TIMEZONE')?.trim() || 'America/Chicago';

    const details = [
      task.description?.trim(),
      `Workstream: ${task.workstream}`,
      `Project: ${task.projectName}`,
      `Dashboard task ID: ${task.id}`,
    ].filter(Boolean);

    return {
      summary: task.taskName,
      description: details.join('\n\n'),
      start: {
        dateTime: start.toISOString(),
        timeZone,
      },
      end: {
        dateTime: end.toISOString(),
        timeZone,
      },
    };
  }

  private isConfigured() {
    return Boolean(
      this.configService.get<string>('GOOGLE_CALENDAR_CLIENT_EMAIL') &&
        this.configService.get<string>('GOOGLE_CALENDAR_PRIVATE_KEY'),
    );
  }

  private async createEvent(calendarId: string, payload: Record<string, unknown>) {
    return this.requestJson(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  }

  private async upsertEvent(
    calendarId: string,
    eventId: string,
    payload: Record<string, unknown>,
  ) {
    return this.requestJson(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );
  }

  private async deleteEvent(calendarId: string, eventId: string) {
    await this.request(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' },
    );
  }

  private async requestJson(url: string, init: RequestInit) {
    const response = await this.request(url, init);
    return response.status === 204 ? null : response.json();
  }

  private async request(url: string, init: RequestInit) {
    const accessToken = await this.getAccessToken();
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Calendar API ${response.status}: ${text}`);
    }

    return response;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > now + 60_000) {
      return this.accessTokenCache.token;
    }

    const clientEmail = this.configService.get<string>('GOOGLE_CALENDAR_CLIENT_EMAIL');
    const rawPrivateKey = this.configService.get<string>('GOOGLE_CALENDAR_PRIVATE_KEY');

    if (!clientEmail || !rawPrivateKey) {
      throw new Error('Missing GOOGLE_CALENDAR_CLIENT_EMAIL or GOOGLE_CALENDAR_PRIVATE_KEY');
    }

    const privateKey = rawPrivateKey.replace(/\\n/g, '\n');
    const issuedAt = Math.floor(now / 1000);
    const expiresAt = issuedAt + 3600;
    const assertion = jwt.sign(
      {
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/calendar',
        aud: 'https://oauth2.googleapis.com/token',
        iat: issuedAt,
        exp: expiresAt,
      },
      privateKey,
      { algorithm: 'RS256' },
    );

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google OAuth token request failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in?: number;
    };

    this.accessTokenCache = {
      token: data.access_token,
      expiresAt: now + (data.expires_in ?? 3600) * 1000,
    };

    return data.access_token;
  }
}
