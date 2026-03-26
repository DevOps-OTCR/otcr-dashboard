import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AttendanceUser = {
  id: string;
  role: 'ADMIN' | 'PM' | 'LC' | 'CONSULTANT' | 'PARTNER' | 'EXECUTIVE';
  email?: string;
};

type CreateAttendanceEventInput = {
  title?: string;
  eventDate?: string;
  locationType?: 'IN_PERSON' | 'ONLINE';
  locationLabel?: string;
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number;
  audienceScope?: 'TEAM' | 'GLOBAL';
  projectId?: string;
};

type CheckInInput = {
  method?: 'GEOFENCE' | 'CODE';
  geofenceVerified?: boolean;
  code?: string;
};

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

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

  private isManagerRole(role: AttendanceUser['role']) {
    return ['ADMIN', 'PM', 'PARTNER', 'EXECUTIVE'].includes(role);
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
      createdById: event.createdById,
      createdByName: this.formatName(event.createdBy),
      canManage,
      canControlOnlineCode,
      verificationCode: canControlOnlineCode ? event.verificationCode : null,
      codeWindowOpensAt: canControlOnlineCode ? event.codeWindowOpensAt : null,
      codeWindowClosesAt: canControlOnlineCode ? event.codeWindowClosesAt : null,
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

    return {
      events: events.map((event) => this.sanitizeEventForUser(event, user)),
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
    if (normalizedScope === 'TEAM' && body.projectId) {
      const project = await this.ensureCanTargetProject(user, body.projectId);
      projectId = project.id;
    }

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

    return this.sanitizeEventForUser(event, user);
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

    return this.sanitizeEventForUser(updated, user);
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

    return {
      event: this.sanitizeEventForUser(event, user),
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

  async deleteEvent(eventId: string, user: AttendanceUser) {
    await this.canManageEvent(eventId, user);

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
}
