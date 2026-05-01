import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from '../integrations/google-calendar.service';
import { NotificationsService } from '../notifications/notifications.service';

type AttendanceUser = {
  id: string;
  role: 'ADMIN' | 'PM' | 'LC' | 'CONSULTANT' | 'PARTNER' | 'EXECUTIVE';
  email?: string;
};

type CreateAttendanceEventInput = {
  title?: string;
  eventDate?: string;
  locationType?: 'IN_PERSON' | 'ONLINE';
  category?: 'CLIENT_CALL' | 'TEAM_MEETING' | 'FIRMWIDE_EVENT' | 'SOCIAL';
  locationLabel?: string;
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number;
  audienceScope?: 'TEAM' | 'GLOBAL';
  projectId?: string;
  availabilityPoll?: {
    enabled?: boolean;
    windowStart?: string;
    windowEnd?: string;
  };
};

type CheckInInput = {
  method?: 'GEOFENCE' | 'CODE';
  geofenceVerified?: boolean;
  code?: string;
};

type AttendanceEventCategory = 'CLIENT_CALL' | 'TEAM_MEETING' | 'FIRMWIDE_EVENT' | 'SOCIAL';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private get attendanceEventModel(): any {
    const model = (this.prisma as any).attendanceEvent;
    if (!model) {
      throw new InternalServerErrorException(
        'Attendance schema is not initialized. Run Prisma generate and apply the database schema for attendance tables.',
      );
    }
    return model;
  }

  private get attendanceCheckInModel(): any {
    const model = (this.prisma as any).attendanceCheckIn;
    if (!model) {
      throw new InternalServerErrorException(
        'Attendance schema is not initialized. Run Prisma generate and apply the database schema for attendance tables.',
      );
    }
    return model;
  }

  private readonly baseEventInclude = {
    createdBy: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    },
    project: {
      select: {
        id: true,
        name: true,
        pmId: true,
        members: {
          where: {
            leftAt: null,
          },
          select: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
      },
    },
    attendances: {
      select: {
        id: true,
        userId: true,
        present: true,
        verificationMethod: true,
        codeVerified: true,
        checkedInAt: true,
      },
      orderBy: { checkedInAt: 'desc' as const },
    },
    _count: {
      select: {
        attendances: true,
      },
    },
  };

  private formatName(user?: { firstName?: string | null; lastName?: string | null; email?: string | null }) {
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    return fullName || user?.email || 'Unknown user';
  }

  private generateVerificationCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  private defaultCategoryForScope(scope: 'TEAM' | 'GLOBAL'): AttendanceEventCategory {
    return scope === 'TEAM' ? 'TEAM_MEETING' : 'FIRMWIDE_EVENT';
  }

  private normalizeAttendanceCategory(
    scope: 'TEAM' | 'GLOBAL',
    category?: string | null,
  ): AttendanceEventCategory {
    const normalized = (category ?? '').trim().toUpperCase();
    const allowedCategories =
      scope === 'TEAM'
        ? ['CLIENT_CALL', 'TEAM_MEETING']
        : ['FIRMWIDE_EVENT', 'SOCIAL'];

    if (!normalized) {
      return this.defaultCategoryForScope(scope);
    }

    if (!allowedCategories.includes(normalized)) {
      throw new BadRequestException(
        scope === 'TEAM'
          ? 'Team events must be tagged as CLIENT_CALL or TEAM_MEETING'
          : 'Firmwide events must be tagged as FIRMWIDE_EVENT or SOCIAL',
      );
    }

    return normalized as AttendanceEventCategory;
  }

  private async ensureAttendanceEventCategoryTable() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AttendanceEventCategorySetting" (
        "eventId" TEXT PRIMARY KEY REFERENCES "AttendanceEvent"("id") ON DELETE CASCADE,
        "category" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private async listAttendanceEventCategories(eventIds: string[]) {
    if (eventIds.length === 0) {
      return new Map<string, AttendanceEventCategory>();
    }

    await this.ensureAttendanceEventCategoryTable();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ eventId: string; category: AttendanceEventCategory }>>(
      `SELECT "eventId", "category"
       FROM "AttendanceEventCategorySetting"
       WHERE "eventId" = ANY($1::text[])`,
      eventIds,
    );

    return new Map(rows.map((row) => [row.eventId, row.category]));
  }

  private async upsertAttendanceEventCategory(eventId: string, category: AttendanceEventCategory) {
    await this.ensureAttendanceEventCategoryTable();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "AttendanceEventCategorySetting" ("eventId", "category", "createdAt", "updatedAt")
       VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("eventId")
       DO UPDATE SET
         "category" = EXCLUDED."category",
         "updatedAt" = CURRENT_TIMESTAMP`,
      eventId,
      category,
    );
  }

  private async ensureAttendanceEventCalendarSyncTable() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AttendanceEventCalendarSync" (
        "eventId" TEXT PRIMARY KEY REFERENCES "AttendanceEvent"("id") ON DELETE CASCADE,
        "googleCalendarId" TEXT NOT NULL,
        "googleCalendarEventId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private async ensureAttendanceAvailabilityTables() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AttendanceEventAvailabilityPoll" (
        "eventId" TEXT PRIMARY KEY REFERENCES "AttendanceEvent"("id") ON DELETE CASCADE,
        "windowStart" TIMESTAMP(3) NOT NULL,
        "windowEnd" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AttendanceEventAvailabilitySelection" (
        "eventId" TEXT NOT NULL REFERENCES "AttendanceEvent"("id") ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "slotStart" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("eventId", "userId", "slotStart")
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AttendanceEventAvailabilitySelection_eventId_idx"
      ON "AttendanceEventAvailabilitySelection" ("eventId")
    `);
  }

  private async getAvailabilityPollRows(eventIds: string[]) {
    if (eventIds.length === 0) {
      return new Map<string, { windowStart: Date; windowEnd: Date; }>();
    }

    await this.ensureAttendanceAvailabilityTables();
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ eventId: string; windowStart: Date; windowEnd: Date;}>
    >(
      `SELECT "eventId", "windowStart", "windowEnd"
       FROM "AttendanceEventAvailabilityPoll"
       WHERE "eventId" = ANY($1::text[])`,
      eventIds,
    );

    return new Map(rows.map((row) => [row.eventId, row]));
  }

  private async getAvailabilitySelectionRows(eventIds: string[]) {
    if (eventIds.length === 0) {
      return [] as Array<{ eventId: string; userId: string; slotStart: Date }>;
    }

    await this.ensureAttendanceAvailabilityTables();
    return this.prisma.$queryRawUnsafe<Array<{ eventId: string; userId: string; slotStart: Date }>>(
      `SELECT "eventId", "userId", "slotStart"
       FROM "AttendanceEventAvailabilitySelection"
       WHERE "eventId" = ANY($1::text[])`,
      eventIds,
    );
  }

  private normalizeAvailabilityPollInput(
    scope: 'TEAM' | 'GLOBAL',
    input?: { enabled?: boolean; windowStart?: string; windowEnd?: string; } | null,
  ) {
    if (!input?.enabled) {
      return null;
    }

    if (scope !== 'TEAM') {
      throw new BadRequestException('Availability polls are only available for team attendance events');
    }

    const windowStart = input.windowStart ? new Date(input.windowStart) : null;
    const windowEnd = input.windowEnd ? new Date(input.windowEnd) : null;

    if (!windowStart || Number.isNaN(windowStart.getTime())) {
      throw new BadRequestException('Availability poll start time is required');
    }

    if (!windowEnd || Number.isNaN(windowEnd.getTime())) {
      throw new BadRequestException('Availability poll end time is required');
    }

    if (windowEnd <= windowStart) {
      throw new BadRequestException('Availability poll end time must be after the start time');
    }


    return {
      windowStart,
      windowEnd,
    };
  }

  /** 15-minute steps to match When2Meet-style grids (stored poll window drives span only). */
  private enumerateAvailabilityPollSlotStarts(windowStart: Date, windowEnd: Date): Date[] {
    const slots: Date[] = [];
    const stepMs = 15 * 60 * 1000;
    for (let t = windowStart.getTime(); t < windowEnd.getTime(); t += stepMs) {
      slots.push(new Date(t));
    }
    return slots;
  }

  private buildAvailabilityPollSummary(
    event: any,
    currentUserId: string,
    pollByEventId: Map<string, { windowStart: Date; windowEnd: Date; }>,
    selectionRows: Array<{ eventId: string; userId: string; slotStart: Date }>,
  ) {
    const poll = pollByEventId.get(event.id);
    if (!poll || event.audienceScope !== 'TEAM' || !event.projectId) {
      return null;
    }

    const teamMembers = (event.project?.members ?? [])
      .map((member: any) => member.user)
      .filter((user: any) => Boolean(user?.id));

    const teamMemberIds = new Set(teamMembers.map((user: any) => user.id));
    const selectionsForEvent = selectionRows.filter(
      (row) => row.eventId === event.id && teamMemberIds.has(row.userId),
    );
    const usersBySlot = new Map<string, any[]>();
    const selectedSlotsForUser: string[] = [];
    const respondingUserIds = new Set<string>();

    for (const row of selectionsForEvent) {
      const key = new Date(row.slotStart).toISOString();
      const user = teamMembers.find((member: any) => member.id === row.userId);
      if (user) {
        usersBySlot.set(key, [...(usersBySlot.get(key) ?? []), user]);
      }
      respondingUserIds.add(row.userId);
      if (row.userId === currentUserId) {
        selectedSlotsForUser.push(key);
      }
    }

    const slotStepMs = 15 * 60 * 1000;
    const slots = this.enumerateAvailabilityPollSlotStarts(poll.windowStart, poll.windowEnd).map((slotStart) => {
      const key = slotStart.toISOString();
      const availablePeople = usersBySlot.get(key) ?? [];
      const availableIds = new Set(availablePeople.map((u: { id: string }) => u.id));
      const availableUsers = availablePeople.map((u: any) => ({
        id: u.id,
        name: this.formatName(u),
      }));
      const unavailableUsers = teamMembers
        .filter((member: any) => !availableIds.has(member.id))
        .map((member: any) => ({
          id: member.id,
          name: this.formatName(member),
        }));

      return {
        start: key,
        end: new Date(slotStart.getTime() + slotStepMs).toISOString(),
        availableCount: availableIds.size,
        availableUsers,
        unavailableUsers,
      };
    });

    const bestSlots = [...slots]
      .sort((a, b) => b.availableCount - a.availableCount || a.start.localeCompare(b.start))
      .slice(0, 3);

    return {
      enabled: true,
      windowStart: poll.windowStart.toISOString(),
      windowEnd: poll.windowEnd.toISOString(),
      teamSize: teamMembers.length,
      respondentCount: respondingUserIds.size,
      currentUserSlots: selectedSlotsForUser,
      slots,
      bestSlots,
    };
  }

  private async attachAvailabilityPollSummary(events: any[], currentUserId: string) {
    if (events.length === 0) return events;

    const eventIds = events.map((event) => event.id);
    const [pollByEventId, selectionRows] = await Promise.all([
      this.getAvailabilityPollRows(eventIds),
      this.getAvailabilitySelectionRows(eventIds),
    ]);

    return events.map((event) => ({
      ...event,
      availabilityPoll: this.buildAvailabilityPollSummary(event, currentUserId, pollByEventId, selectionRows),
    }));
  }

  private async upsertAvailabilityPoll(
    eventId: string,
    poll: { windowStart: Date; windowEnd: Date } | null,
  ) {
    await this.ensureAttendanceAvailabilityTables();

    if (!poll) {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM "AttendanceEventAvailabilityPoll" WHERE "eventId" = $1`,
        eventId,
      );
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM "AttendanceEventAvailabilitySelection" WHERE "eventId" = $1`,
        eventId,
      );
      return;
    }

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "AttendanceEventAvailabilityPoll" ("eventId", "windowStart", "windowEnd", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("eventId")
       DO UPDATE SET
         "windowStart" = EXCLUDED."windowStart",
         "windowEnd" = EXCLUDED."windowEnd",
         "updatedAt" = CURRENT_TIMESTAMP`,
      eventId,
      poll.windowStart,
      poll.windowEnd,
    );
  }

  private async notifyTeamAvailabilityPoll(event: {
    id: string;
    title: string;
    projectId?: string | null;
    project?: { name?: string | null; members?: Array<{ user: { id: string } }> } | null;
  }, actorUserId: string) {
    if (!event.projectId) return;

    const recipients = (event.project?.members ?? [])
      .map((member) => member.user.id)
      .filter((userId) => userId && userId !== actorUserId);

    for (const userId of recipients) {
      await this.notificationsService.queueNotification({
        userId,
        type: 'PROJECT_UPDATED',
        channel: 'BOTH',
        data: {
          projectName: event.project?.name ?? 'Your team',
          deliverableTitle: event.title,
          targetPath: '/attendance',
          feedback: `A team availability poll was added for "${event.title}" in Attendance. Add your available times to help lock in the meeting.`,
          reason: 'attendance-availability-poll',
        } as any,
      });
    }
  }

  private async getAttendanceEventCalendarSync(eventId: string) {
    await this.ensureAttendanceEventCalendarSyncTable();
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ eventId: string; googleCalendarId: string; googleCalendarEventId: string }>
    >(
      `SELECT "eventId", "googleCalendarId", "googleCalendarEventId"
       FROM "AttendanceEventCalendarSync"
       WHERE "eventId" = $1
       LIMIT 1`,
      eventId,
    );

    return rows[0] ?? null;
  }

  private async upsertAttendanceEventCalendarSync(
    eventId: string,
    googleCalendarId: string,
    googleCalendarEventId: string,
  ) {
    await this.ensureAttendanceEventCalendarSyncTable();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "AttendanceEventCalendarSync" ("eventId", "googleCalendarId", "googleCalendarEventId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("eventId")
       DO UPDATE SET
         "googleCalendarId" = EXCLUDED."googleCalendarId",
         "googleCalendarEventId" = EXCLUDED."googleCalendarEventId",
         "updatedAt" = CURRENT_TIMESTAMP`,
      eventId,
      googleCalendarId,
      googleCalendarEventId,
    );
  }

  private async deleteAttendanceEventCalendarSync(eventId: string) {
    await this.ensureAttendanceEventCalendarSyncTable();
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "AttendanceEventCalendarSync" WHERE "eventId" = $1`,
      eventId,
    );
  }

  private attachEventCategory(event: any, categoryByEventId: Map<string, AttendanceEventCategory>) {
    return {
      ...event,
      category: categoryByEventId.get(event.id) ?? this.defaultCategoryForScope(event.audienceScope),
    };
  }

  private async attachEventCategories(events: any[]) {
    const categoryByEventId = await this.listAttendanceEventCategories(events.map((event) => event.id));
    return events.map((event) => this.attachEventCategory(event, categoryByEventId));
  }

  private isManagerRole(role: AttendanceUser['role']) {
    return ['ADMIN', 'PM', 'PARTNER', 'EXECUTIVE'].includes(role);
  }

  private async syncAttendanceEventToGoogleCalendar(
    event: {
      id: string;
      title: string;
      eventDate: Date;
      audienceScope: 'TEAM' | 'GLOBAL';
      locationType: 'IN_PERSON' | 'ONLINE';
      locationLabel?: string | null;
      projectId?: string | null;
      project?: { name?: string | null } | null;
    },
    category: AttendanceEventCategory,
  ) {
    const syncState = await this.googleCalendarService.createAttendanceEvent({
      id: event.id,
      title: event.title,
      eventDate: event.eventDate,
      audienceScope: event.audienceScope,
      projectId: event.projectId,
      category,
      locationType: event.locationType,
      locationLabel: event.locationLabel ?? null,
      projectName: event.project?.name ?? null,
    });

    if (syncState.googleCalendarId && syncState.googleCalendarEventId) {
      await this.upsertAttendanceEventCalendarSync(
        event.id,
        syncState.googleCalendarId,
        syncState.googleCalendarEventId,
      );
      return;
    }

    await this.deleteAttendanceEventCalendarSync(event.id);
  }

  private async ensureProjectExists(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, pmId: true },
    });

    if (!project) {
      throw new NotFoundException('Team not found');
    }

    return project;
  }

  private async ensureCanTargetProject(user: AttendanceUser, projectId: string) {
    const project = await this.ensureProjectExists(projectId);

    if (user.role === 'PM' && project.pmId !== user.id) {
      throw new ForbiddenException('PMs can only create attendance events for their own teams');
    }

    return project;
  }

  private async canAccessEvent(eventId: string, user: AttendanceUser) {
    const event = await this.attendanceEventModel.findUnique({
      where: { id: eventId },
      include: this.baseEventInclude,
    });

    if (!event) {
      throw new NotFoundException('Attendance event not found');
    }

    if (user.role === 'ADMIN' || user.role === 'PARTNER' || user.role === 'EXECUTIVE') {
      return event;
    }

    if (event.audienceScope === 'GLOBAL') {
      return event;
    }

    if (!event.projectId) {
      throw new ForbiddenException('This event is not assigned to a team');
    }

    if (user.role === 'PM' && event.project?.pmId === user.id) {
      return event;
    }

    const membership = await this.prisma.projectMember.findFirst({
      where: {
        projectId: event.projectId,
        userId: user.id,
        leftAt: null,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this attendance event');
    }

    return event;
  }

  private async canManageEvent(eventId: string, user: AttendanceUser) {
    const event = await this.canAccessEvent(eventId, user);

    if (event.createdById === user.id) {
      return event;
    }

    throw new ForbiddenException('Only the event creator can manage this attendance event');
  }

  private canControlOnlineCode(event: any, user: AttendanceUser) {
    return event.createdById === user.id || user.role === 'PARTNER';
  }

  private canRevealVerificationCode(event: any, user: AttendanceUser) {
    return event.createdById === user.id || user.role === 'PARTNER';
  }

  private async canOpenCodeWindow(eventId: string, user: AttendanceUser) {
    const event = await this.canAccessEvent(eventId, user);

    if (this.canControlOnlineCode(event, user)) {
      return event;
    }

    throw new ForbiddenException('Only the event creator or a partner can open the attendance code window');
  }

  private sanitizeEventForUser(event: any, user: AttendanceUser) {
    const attendeeRecord = event.attendances.find((attendance: any) => attendance.userId === user.id) ?? null;
    const canManage = event.createdById === user.id;
    const canControlOnlineCode = this.canControlOnlineCode(event, user);
    const canRevealVerificationCode = this.canRevealVerificationCode(event, user);

    return {
      id: event.id,
      title: event.title,
      eventDate: event.eventDate,
      locationType: event.locationType,
      locationLabel: event.locationLabel,
      latitude: event.latitude,
      longitude: event.longitude,
      geofenceRadiusMeters: event.geofenceRadiusMeters,
      audienceScope: event.audienceScope,
      projectId: event.projectId,
      projectName: event.project?.name ?? null,
      category: event.category ?? this.defaultCategoryForScope(event.audienceScope),
      createdById: event.createdById,
      createdByName: this.formatName(event.createdBy),
      canManage,
      canControlOnlineCode,
      verificationCode: canRevealVerificationCode ? event.verificationCode : null,
      codeWindowOpensAt: canRevealVerificationCode ? event.codeWindowOpensAt : null,
      codeWindowClosesAt: canRevealVerificationCode ? event.codeWindowClosesAt : null,
      availabilityPoll: event.availabilityPoll ?? null,
      attendanceCount: event._count?.attendances ?? 0,
      attendance: attendeeRecord
        ? {
            present: attendeeRecord.present,
            verificationMethod: attendeeRecord.verificationMethod,
            codeVerified: attendeeRecord.codeVerified,
            checkedInAt: attendeeRecord.checkedInAt,
          }
        : null,
    };
  }

  async listEvents(user: AttendanceUser) {
    const where =
      user.role === 'ADMIN' || user.role === 'PARTNER' || user.role === 'EXECUTIVE'
        ? {}
        : user.role === 'PM'
          ? {
              OR: [
                { audienceScope: 'GLOBAL' },
                {
                  project: {
                    pmId: user.id,
                  },
                },
              ],
            }
          : {
              OR: [
                { audienceScope: 'GLOBAL' },
                {
                  project: {
                    members: {
                      some: {
                        userId: user.id,
                        leftAt: null,
                      },
                    },
                  },
                },
              ],
            };

    const events = await this.attendanceEventModel.findMany({
      where,
      include: this.baseEventInclude,
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'desc' }],
    });
    const eventsWithCategories = await this.attachEventCategories(events);
    const eventsWithAvailability = await this.attachAvailabilityPollSummary(eventsWithCategories, user.id);

    return {
      events: eventsWithAvailability.map((event) => this.sanitizeEventForUser(event, user)),
    };
  }

  async createEvent(user: AttendanceUser, body: CreateAttendanceEventInput) {
    const title = body.title?.trim();
    const eventDate = body.eventDate ? new Date(body.eventDate) : null;

    if (!title) {
      throw new BadRequestException('Event title is required');
    }

    if (!eventDate || Number.isNaN(eventDate.getTime())) {
      throw new BadRequestException('A valid event date is required');
    }

    if (body.locationType !== 'IN_PERSON' && body.locationType !== 'ONLINE') {
      throw new BadRequestException('Location type must be IN_PERSON or ONLINE');
    }

    const normalizedScope = user.role === 'PM' ? 'TEAM' : body.audienceScope ?? 'TEAM';

    if (normalizedScope === 'TEAM' && !body.projectId) {
      throw new BadRequestException('A team must be selected for team attendance events');
    }

    if (normalizedScope === 'GLOBAL' && user.role === 'PM') {
      throw new ForbiddenException('PMs cannot create company-wide attendance events');
    }

    let projectId: string | null = null;
    let project: { id: string; name: string; pmId: string } | null = null;
    if (normalizedScope === 'TEAM' && body.projectId) {
      project = await this.ensureCanTargetProject(user, body.projectId);
      projectId = project.id;
    }
    const category = this.normalizeAttendanceCategory(normalizedScope, body.category);
    const availabilityPoll = this.normalizeAvailabilityPollInput(normalizedScope, body.availabilityPoll);

    const locationLabel = body.locationLabel?.trim() || null;

    if (body.locationType === 'IN_PERSON') {
      if (!locationLabel) {
        throw new BadRequestException('In-person events require a location');
      }

      if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
        throw new BadRequestException('In-person events require latitude and longitude for geofence check-in');
      }
    }

    const event = await this.attendanceEventModel.create({
      data: {
        title,
        eventDate,
        locationType: body.locationType,
        locationLabel,
        latitude: body.locationType === 'IN_PERSON' ? body.latitude : null,
        longitude: body.locationType === 'IN_PERSON' ? body.longitude : null,
        geofenceRadiusMeters: body.locationType === 'IN_PERSON' ? 150 : 20,
        audienceScope: normalizedScope,
        projectId,
        createdById: user.id,
        verificationCode: body.locationType === 'ONLINE' ? this.generateVerificationCode() : null,
      },
      include: this.baseEventInclude,
    });
    await this.upsertAttendanceEventCategory(event.id, category);
    await this.upsertAvailabilityPoll(event.id, availabilityPoll);
    await this.syncAttendanceEventToGoogleCalendar(event, category);
    const eventWithCategory = this.attachEventCategory(event, new Map([[event.id, category]]));
    const [eventWithAvailability] = await this.attachAvailabilityPollSummary([eventWithCategory], user.id);

    if (availabilityPoll && projectId) {
      await this.notifyTeamAvailabilityPoll(
        {
          id: event.id,
          title: event.title,
          projectId,
          project: {
            name: project?.name ?? null,
            members: event.project?.members ?? [],
          },
        },
        user.id,
      );
    }

    return this.sanitizeEventForUser(eventWithAvailability, user);
  }

  async openCodeWindow(eventId: string, user: AttendanceUser) {
    const event = await this.canOpenCodeWindow(eventId, user);

    if (event.locationType !== 'ONLINE') {
      throw new BadRequestException('Only online events can open a code check-in window');
    }

    const openedAt = new Date();
    const closesAt = new Date(openedAt.getTime() + 2 * 60 * 1000);

    const updated = await this.attendanceEventModel.update({
      where: { id: eventId },
      data: {
        codeWindowOpensAt: openedAt,
        codeWindowClosesAt: closesAt,
      },
      include: this.baseEventInclude,
    });
    const [updatedWithCategory] = await this.attachEventCategories([updated]);
    const [updatedWithAvailability] = await this.attachAvailabilityPollSummary([updatedWithCategory], user.id);

    return this.sanitizeEventForUser(updatedWithAvailability, user);
  }

  async listAttendances(eventId: string, user: AttendanceUser) {
    const event = await this.canManageEvent(eventId, user);

    const attendances = await this.attendanceCheckInModel.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: { checkedInAt: 'desc' },
    });

    const [eventWithCategory] = await this.attachEventCategories([event]);
    const [eventWithAvailability] = await this.attachAvailabilityPollSummary([eventWithCategory], user.id);

    return {
      event: this.sanitizeEventForUser(eventWithAvailability, user),
      attendances: attendances.map((attendance) => ({
        id: attendance.id,
        userId: attendance.userId,
        name: this.formatName(attendance.user),
        email: attendance.user.email,
        role: attendance.user.role,
        present: attendance.present,
        verificationMethod: attendance.verificationMethod,
        codeVerified: attendance.codeVerified,
        checkedInAt: attendance.checkedInAt,
      })),
    };
  }

  async saveAvailability(
    eventId: string,
    user: AttendanceUser,
    body: { slotStarts?: string[] },
  ) {
    const event = await this.canAccessEvent(eventId, user);

    if (event.audienceScope !== 'TEAM' || !event.projectId) {
      throw new BadRequestException('Availability polls are only available for team attendance events');
    }

    const pollByEventId = await this.getAvailabilityPollRows([eventId]);
    const poll = pollByEventId.get(eventId);

    if (!poll) {
      throw new NotFoundException('This event does not have an availability poll');
    }

    const membership = await this.prisma.projectMember.findFirst({
      where: {
        projectId: event.projectId,
        userId: user.id,
        leftAt: null,
      },
      select: { id: true },
    });

    if (!membership && !['ADMIN', 'PM', 'PARTNER', 'EXECUTIVE'].includes(user.role)) {
      throw new ForbiddenException('Only assigned team members can respond to this availability poll');
    }

    const requestedSlots = Array.from(new Set((body.slotStarts ?? []).map((value) => value?.trim()).filter(Boolean)));


    await this.ensureAttendanceAvailabilityTables();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `DELETE FROM "AttendanceEventAvailabilitySelection" WHERE "eventId" = $1 AND "userId" = $2`,
        eventId,
        user.id,
      );

      for (const slotStart of requestedSlots) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "AttendanceEventAvailabilitySelection" ("eventId", "userId", "slotStart", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          eventId,
          user.id,
          new Date(slotStart),
        );
      }
    });

    const refreshed = await this.attendanceEventModel.findUnique({
      where: { id: eventId },
      include: this.baseEventInclude,
    });

    if (!refreshed) {
      throw new NotFoundException('Attendance event not found');
    }

    const [eventWithCategory] = await this.attachEventCategories([refreshed]);
    const [eventWithAvailability] = await this.attachAvailabilityPollSummary([eventWithCategory], user.id);

    return {
      success: true,
      event: this.sanitizeEventForUser(eventWithAvailability, user),
    };
  }

  async deleteEvent(eventId: string, user: AttendanceUser) {
    await this.canManageEvent(eventId, user);

    const calendarSync = await this.getAttendanceEventCalendarSync(eventId);
    if (calendarSync) {
      await this.googleCalendarService.deleteCalendarEvent(
        calendarSync.googleCalendarId,
        calendarSync.googleCalendarEventId,
      );
      await this.deleteAttendanceEventCalendarSync(eventId);
    }

    await this.attendanceEventModel.delete({
      where: { id: eventId },
    });

    return {
      success: true,
      deletedEventId: eventId,
    };
  }

  async checkIn(eventId: string, user: AttendanceUser, body: CheckInInput) {
    const event = await this.canAccessEvent(eventId, user);

    if (body.method !== 'GEOFENCE' && body.method !== 'CODE') {
      throw new BadRequestException('Check-in method must be GEOFENCE or CODE');
    }

    if (event.locationType === 'IN_PERSON') {
      if (body.method !== 'GEOFENCE') {
        throw new BadRequestException('In-person events require geofence verification');
      }

      if (!body.geofenceVerified) {
        throw new ForbiddenException('You must be inside the event geofence to check in');
      }
    }

    if (event.locationType === 'ONLINE') {
      if (body.method !== 'CODE') {
        throw new BadRequestException('Online events require code verification');
      }

      const now = new Date();
      if (
        !event.codeWindowOpensAt ||
        !event.codeWindowClosesAt ||
        now < event.codeWindowOpensAt ||
        now > event.codeWindowClosesAt
      ) {
        throw new ForbiddenException('The online attendance code is not active right now');
      }

      if (!body.code || body.code.trim() !== event.verificationCode) {
        throw new ForbiddenException('The attendance code is incorrect');
      }
    }

    const checkIn = await this.attendanceCheckInModel.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId: user.id,
        },
      },
      update: {
        present: true,
        verificationMethod: body.method,
        codeVerified: body.method === 'CODE',
        checkedInAt: new Date(),
      },
      create: {
        eventId,
        userId: user.id,
        present: true,
        verificationMethod: body.method,
        codeVerified: body.method === 'CODE',
      },
    });

    return {
      success: true,
      attendance: {
        present: checkIn.present,
        verificationMethod: checkIn.verificationMethod,
        codeVerified: checkIn.codeVerified,
        checkedInAt: checkIn.checkedInAt,
      },
    };
  }

  async listMemberAttendanceHistory(memberId: string, projectId: string, user: AttendanceUser) {
    if (!projectId?.trim()) {
      throw new BadRequestException('projectId is required');
    }

    const project = await this.ensureProjectExists(projectId);

    if (user.role === 'PM' && project.pmId !== user.id) {
      throw new ForbiddenException('PMs can only review attendance for their own teams');
    }

    const member = await this.prisma.user.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Team member not found');
    }

    const membership = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: memberId,
        leftAt: null,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('That user is not an active member of this team');
    }

    const pastEvents = await this.attendanceEventModel.findMany({
      where: {
        eventDate: {
          lt: new Date(),
        },
        OR: [
          {
            audienceScope: 'TEAM',
            projectId,
          },
          {
            audienceScope: 'GLOBAL',
          },
        ],
      },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            pmId: true,
          },
        },
        attendances: {
          where: {
            userId: memberId,
          },
          select: {
            id: true,
            userId: true,
            present: true,
            verificationMethod: true,
            codeVerified: true,
            checkedInAt: true,
          },
        },
      },
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
    });

    const eventsWithCategories = await this.attachEventCategories(pastEvents);
    const eventItems = eventsWithCategories.map((event) => {
      const attendance = event.attendances[0] ?? null;
      const base = {
        id: event.id,
        title: event.title,
        eventDate: event.eventDate,
        audienceScope: event.audienceScope,
        projectId: event.projectId,
        projectName: event.project?.name ?? null,
        locationType: event.locationType,
        locationLabel: event.locationLabel,
        category: event.category ?? this.defaultCategoryForScope(event.audienceScope),
        createdByName: this.formatName(event.createdBy),
        attended: Boolean(attendance?.present),
        checkedInAt: attendance?.checkedInAt ?? null,
        verificationMethod: attendance?.verificationMethod ?? null,
      };
      return base;
    });

    const teamCategories = new Set<AttendanceEventCategory>(['CLIENT_CALL', 'TEAM_MEETING']);
    const firmwideCategories = new Set<AttendanceEventCategory>(['FIRMWIDE_EVENT', 'SOCIAL']);
    const teamEvents = eventItems.filter(
      (event) => event.audienceScope === 'TEAM' && event.projectId === projectId && teamCategories.has(event.category),
    );
    const firmwideEvents = eventItems.filter(
      (event) => event.audienceScope === 'GLOBAL' && firmwideCategories.has(event.category),
    );

    return {
      member: {
        id: member.id,
        email: member.email,
        name: this.formatName(member),
      },
      team: {
        attended: teamEvents.filter((event) => event.attended),
        missed: teamEvents.filter((event) => !event.attended),
      },
      firmwide: {
        attended: firmwideEvents.filter((event) => event.attended),
        missed: firmwideEvents.filter((event) => !event.attended),
      },
    };
  }
}
