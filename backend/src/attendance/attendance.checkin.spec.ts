import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from '../integrations/google-calendar.service';
import { NotificationsService } from '../notifications/notifications.service';

// Regression coverage for issue #29: in-person check-in must be decided by a
// server-side distance check, not by a client-supplied geofenceVerified flag.
// Prisma is stubbed so no database is required.

const EVENT_LAT = 40.102;
const EVENT_LON = -88.2272;
// ~0.0009 degrees of latitude is ~100 m.
const INSIDE = { latitude: EVENT_LAT + 0.0009, longitude: EVENT_LON };
const OUTSIDE = { latitude: EVENT_LAT + 0.009, longitude: EVENT_LON };

// Request bodies arrive as untyped JSON, so tests can send fields the type does not declare.
type CheckInBody = Parameters<AttendanceService['checkIn']>[2];

const consultant ={ id: 'consultant', role: 'CONSULTANT' as const, email: 'consultant@example.test' };

function setup(eventOverrides: Record<string, unknown> = {}) {
  const event = {
    id: 'event-1',
    locationType: 'IN_PERSON',
    audienceScope: 'GLOBAL',
    projectId: null,
    latitude: EVENT_LAT,
    longitude: EVENT_LON,
    geofenceRadiusMeters: 150,
    ...eventOverrides,
  };
  const upsert = jest.fn(async ({ create }) => ({ ...create, checkedInAt: new Date('2026-10-14T12:00:00Z') }));
  const prisma = {
    attendanceEvent: { findUnique: jest.fn(async () => ({ ...event })) },
    attendanceCheckIn: { upsert },
  };
  const service = new AttendanceService(
    prisma as unknown as PrismaService,
    {} as GoogleCalendarService,
    {} as NotificationsService,
  );
  return { service, upsert };
}

describe('AttendanceService.checkIn geofence (#29)', () => {
  it('checks in when the submitted coordinates are inside the radius', async () => {
    const { service, upsert } = setup();
    const result = await service.checkIn('event-1', consultant, { method: 'GEOFENCE', ...INSIDE });
    expect(result.attendance.present).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects coordinates outside the radius with the distance in the message', async () => {
    const { service, upsert } = setup();
    const attempt = service.checkIn('event-1', consultant, { method: 'GEOFENCE', ...OUTSIDE });
    await expect(attempt).rejects.toThrow(ForbiddenException);
    await expect(attempt).rejects.toThrow(/You are \d+ meters away\. You must be within 150 meters/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('ignores a client-supplied geofenceVerified flag', async () => {
    const { service, upsert } = setup();
    const forged = { method: 'GEOFENCE', geofenceVerified: true } as CheckInBody;
    await expect(service.checkIn('event-1', consultant, forged)).rejects.toThrow(BadRequestException);
    await expect(
      service.checkIn('event-1', consultant, { ...forged, ...OUTSIDE }),
    ).rejects.toThrow(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects nearly antipodal coordinates without recording attendance', async () => {
    const { service, upsert } = setup();
    await expect(
      service.checkIn('event-1', consultant, {
        method: 'GEOFENCE',
        latitude: -40.10200098999999,
        longitude: 91.7728,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['strings', { latitude: '40.1', longitude: '-88.2' }],
    ['NaN', { latitude: NaN, longitude: EVENT_LON }],
    ['out of range', { latitude: 91, longitude: EVENT_LON }],
  ])('rejects invalid coordinates (%s)', async (_label, coords) => {
    const { service, upsert } = setup();
    await expect(
      service.checkIn('event-1', consultant, { method: 'GEOFENCE', ...(coords as CheckInBody) }),
    ).rejects.toThrow(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects check-in when the event has no stored coordinates', async () => {
    const { service, upsert } = setup({ latitude: null, longitude: null });
    await expect(
      service.checkIn('event-1', consultant, { method: 'GEOFENCE', ...INSIDE }),
    ).rejects.toThrow(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });
});
