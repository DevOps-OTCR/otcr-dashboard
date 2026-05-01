import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SLOT_STEP = 15;

const LEGACY_NUM_COLS = 5;

const MAX_GRID_COLUMNS = 45;
/** Max fifteen-minute intervals in one calendar day (exclusive endMinute). */
const MAX_ROWS_SINGLE_DAY = 24 * (60 / SLOT_STEP);
const MAX_TOTAL_SLOTS = 4000;

type SessionUser = { id: string; role: string; email?: string };

function formatMinuteAmPm(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const suffix = h24 >= 12 ? 'pm' : 'am';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${h12}${mm} ${suffix}`;
}

/** Microsoft / LDAP often exposes `Smith, Jane`. Emit `Jane Smith` for hover lists. */
function flipCommaSeparatedName(value: string): string {
  const t = value.trim();
  if (!t) return '';
  const m = /^([^,]+),\s*(.+)$/u.exec(t);
  if (!m) return t;
  return `${m[2].trim()} ${m[1].trim()}`.trim();
}

function formatFirstNameLastName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}): string {
  const first = flipCommaSeparatedName((user.firstName ?? '').trim());
  const last = flipCommaSeparatedName((user.lastName ?? '').trim());
  const full = [first, last].filter(Boolean).join(' ').trim();
  return full || user.email.trim();
}

export type PollGridSpec = {
  numCols: number;
  numRows: number;
  totalSlots: number;
  slotStartMinute: number;
  slotEndMinute: number;
  gridFirstDate: string | null;
  gridLastDate: string | null;
  columnLabels: string[];
  rowStartLabels: string[];
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function utcYmd(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function parseYmdUtc(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) {
    throw new BadRequestException('gridFirstDate and gridLastDate must be YYYY-MM-DD');
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!mo || mo > 12 || !d || d > 31) {
    throw new BadRequestException('Invalid calendar date range');
  }
  return new Date(Date.UTC(y, mo - 1, d));
}

/** Inclusive UTC calendar dates as `YYYY-MM-DD` consecutive days. */
function enumerateUtcDaysInclusive(first: Date, last: Date): string[] {
  const days: string[] = [];
  const cur = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()),
  );
  const endUtc = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  while (cur.getTime() <= endUtc) {
    days.push(utcYmd(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

function formatUtcColumnHeading(isoYmd: string): string {
  const d = parseYmdUtc(isoYmd);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function hhmmToMinutes(value: unknown, label: string): number {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${label} is required (HH:MM, 24h)`);
  }
  const trimmed = value.trim();
  const m = /^(\d{1,2}):(\d{2})(?::[\d.]*)?$/.exec(trimmed);
  if (!m) {
    throw new BadRequestException(`${label} must use HH:MM (24‑hour)`);
  }
  const h = Number(m[1]);
  const mins = Number(m[2]);
  if (h > 23 || mins > 59) {
    throw new BadRequestException(`${label} is out of range`);
  }
  return h * 60 + mins;
}

function deriveGridSpec(poll: {
  gridFirstDate: Date | null;
  gridLastDate: Date | null;
  slotStartMinute: number;
  slotEndMinute: number;
}): PollGridSpec {
  const startMinute = poll.slotStartMinute ?? 540;
  const endMinute = poll.slotEndMinute ?? 1020;

  if (startMinute < 0 || endMinute > 24 * 60 || endMinute <= startMinute) {
    throw new BadRequestException('Poll has an invalid saved time window');
  }
  if (
    startMinute % SLOT_STEP !== 0 ||
    endMinute % SLOT_STEP !== 0 ||
    ((endMinute - startMinute) / SLOT_STEP) % 1 !== 0
  ) {
    throw new BadRequestException('Poll times must align to fifteen‑minute increments');
  }

  const duration = endMinute - startMinute;
  const numRows = duration / SLOT_STEP;

  let numCols: number;
  let columnLabels: string[];
  let gridFirstDateIso: string | null;
  let gridLastDateIso: string | null;

  if (poll.gridFirstDate && poll.gridLastDate) {
    const firstUtc = new Date(poll.gridFirstDate);
    const lastUtc = new Date(poll.gridLastDate);
    const days = enumerateUtcDaysInclusive(firstUtc, lastUtc);
    numCols = days.length;
    columnLabels = days.map(formatUtcColumnHeading);
    gridFirstDateIso = utcYmd(firstUtc);
    gridLastDateIso = utcYmd(lastUtc);
  } else {
    numCols = LEGACY_NUM_COLS;
    columnLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    gridFirstDateIso = null;
    gridLastDateIso = null;
  }

  const totalSlots = numCols * numRows;
  const rowStartLabels: string[] = [];
  for (let r = 0; r < numRows; r += 1) {
    const minute = startMinute + r * SLOT_STEP;
    const onHourBoundary = minute % 60 === 0;
    rowStartLabels.push(onHourBoundary ? formatMinuteAmPm(minute) : '');
  }

  return {
    numCols,
    numRows,
    totalSlots,
    slotStartMinute: startMinute,
    slotEndMinute: endMinute,
    gridFirstDate: gridFirstDateIso,
    gridLastDate: gridLastDateIso,
    columnLabels,
    rowStartLabels,
  };
}

@Injectable()
export class When2MeetService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureProjectAccess(user: SessionUser, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        pmId: true,
        members: {
          where: { leftAt: null },
          select: { userId: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Team not found');
    }

    if (['ADMIN', 'PARTNER', 'EXECUTIVE'].includes(user.role)) {
      return project;
    }

    if (user.role === 'PM' && project.pmId === user.id) {
      return project;
    }

    const isMember = project.members.some((m) => m.userId === user.id);
    if (isMember) {
      return project;
    }

    throw new ForbiddenException('You do not have access to this team');
  }

  private async ensureCanCreateForProject(user: SessionUser, projectId: string) {
    await this.ensureProjectAccess(user, projectId);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { pmId: true },
    });

    if (!project) {
      throw new NotFoundException('Team not found');
    }

    if (user.role === 'PM' && project.pmId !== user.id) {
      throw new ForbiddenException('PMs can only create When2Meet polls for their own teams');
    }

    return project;
  }

  private normalizeSlots(slots: unknown, maxSlot: number): number[] {
    if (!Array.isArray(slots)) {
      throw new BadRequestException('slots must be an array of integers');
    }
    const seen = new Set<number>();
    for (const raw of slots) {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > maxSlot) {
        throw new BadRequestException(`Invalid slot index: ${String(raw)}`);
      }
      seen.add(n);
    }
    return Array.from(seen).sort((a, b) => a - b);
  }

  /** Validates input and persists calendar dates normalized to `@db.Date` midnight UTC rows. */
  private parseCreateSchedule(body: {
    gridFirstDate?: string;
    gridLastDate?: string;
    slotStart?: string;
    slotEnd?: string;
  }) {
    const fd = body.gridFirstDate?.trim();
    const ld = body.gridLastDate?.trim();

    const startMinute = hhmmToMinutes(body.slotStart, 'slotStart');
    const endMinute = hhmmToMinutes(body.slotEnd, 'slotEnd');

    if (endMinute <= startMinute) {
      throw new BadRequestException('slotEnd must be later than slotStart');
    }

    if (startMinute % SLOT_STEP !== 0 || endMinute % SLOT_STEP !== 0) {
      throw new BadRequestException(
        `Start and end times must align to fifteen‑minute increments (${SLOT_STEP}-minute slots)`,
      );
    }

    const numRows = (endMinute - startMinute) / SLOT_STEP;
    if (numRows < 1 || numRows > MAX_ROWS_SINGLE_DAY) {
      throw new BadRequestException(`Time range yields an invalid slot count (${numRows})`);
    }

    if (!fd || !ld) {
      throw new BadRequestException('gridFirstDate and gridLastDate are required');
    }

    const dStart = parseYmdUtc(fd);
    const dEnd = parseYmdUtc(ld);

    const dayCount =
      enumerateUtcDaysInclusive(new Date(dStart), new Date(dEnd)).length;

    if (dayCount > MAX_GRID_COLUMNS) {
      throw new BadRequestException(`Date range spans too many columns (${MAX_GRID_COLUMNS} maximum)`);
    }

    const totalSlots = dayCount * numRows;
    if (totalSlots > MAX_TOTAL_SLOTS) {
      throw new BadRequestException('That grid configuration is too large; narrow the dates or hours');
    }

    return {
      gridFirstDate: new Date(Date.UTC(dStart.getUTCFullYear(), dStart.getUTCMonth(), dStart.getUTCDate())),
      gridLastDate: new Date(Date.UTC(dEnd.getUTCFullYear(), dEnd.getUTCMonth(), dEnd.getUTCDate())),
      slotStartMinute: startMinute,
      slotEndMinute: endMinute,
    };
  }

  async createPoll(
    user: SessionUser,
    body: {
      projectId?: string;
      title?: string;
      gridFirstDate?: string;
      gridLastDate?: string;
      slotStart?: string;
      slotEnd?: string;
    },
  ) {
    const projectId = body.projectId?.trim();
    const title = body.title?.trim();
    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }
    if (!title) {
      throw new BadRequestException('title is required');
    }

    await this.ensureCanCreateForProject(user, projectId);

    const schedule = this.parseCreateSchedule({
      gridFirstDate: body.gridFirstDate,
      gridLastDate: body.gridLastDate,
      slotStart: body.slotStart,
      slotEnd: body.slotEnd,
    });

    const poll = await this.prisma.when2MeetPoll.create({
      data: {
        title,
        projectId,
        createdById: user.id,
        gridFirstDate: schedule.gridFirstDate,
        gridLastDate: schedule.gridLastDate,
        slotStartMinute: schedule.slotStartMinute,
        slotEndMinute: schedule.slotEndMinute,
      },
      select: {
        id: true,
        title: true,
        projectId: true,
        createdAt: true,
        gridFirstDate: true,
        gridLastDate: true,
        slotStartMinute: true,
        slotEndMinute: true,
      },
    });

    return { poll };
  }

  async listPolls(user: SessionUser, projectId: string) {
    if (!projectId?.trim()) {
      throw new BadRequestException('projectId is required');
    }

    await this.ensureProjectAccess(user, projectId.trim());

    const polls = await this.prisma.when2MeetPoll.findMany({
      where: { projectId: projectId.trim() },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        projectId: true,
        createdAt: true,
      },
    });

    return { polls };
  }

  async deletePoll(user: SessionUser, pollId: string) {
    const poll = await this.prisma.when2MeetPoll.findUnique({
      where: { id: pollId },
      select: { id: true, projectId: true },
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    await this.ensureCanCreateForProject(user, poll.projectId);

    await this.prisma.when2MeetPoll.delete({
      where: { id: pollId },
    });

    return { success: true as const };
  }

  async getPoll(user: SessionUser, pollId: string) {
    const poll = await this.prisma.when2MeetPoll.findUnique({
      where: { id: pollId },
      select: {
        id: true,
        title: true,
        projectId: true,
        createdAt: true,
        gridFirstDate: true,
        gridLastDate: true,
        slotStartMinute: true,
        slotEndMinute: true,
        availabilities: {
          select: {
            slotIndex: true,
            userId: true,
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    await this.ensureProjectAccess(user, poll.projectId);

    let gridSpec: PollGridSpec;
    try {
      gridSpec = deriveGridSpec({
        gridFirstDate: poll.gridFirstDate,
        gridLastDate: poll.gridLastDate,
        slotStartMinute: poll.slotStartMinute,
        slotEndMinute: poll.slotEndMinute,
      });
    } catch (e: any) {
      if (e instanceof BadRequestException) {
        throw new BadRequestException(
          `${e.message} This poll’s saved schedule may need a database fix.`,
        );
      }
      throw e;
    }
    const maxSlot = gridSpec.totalSlots - 1;

    const projectWithPm = await this.prisma.project.findUnique({
      where: { id: poll.projectId },
      select: {
        pm: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        members: {
          where: { leftAt: null },
          select: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    const memberUsers = (projectWithPm?.members ?? []).map((m) => m.user);
    const rosterIds = new Set(memberUsers.map((u) => u.id));
    if (projectWithPm?.pm && !rosterIds.has(projectWithPm.pm.id)) {
      memberUsers.push(projectWithPm.pm);
    }

    /** Prefer roster spelling of first/last for members; fallback to persisted row.user. */
    const namesByUserId = new Map(
      memberUsers.map((u) => [u.id, formatFirstNameLastName(u)] as const),
    );

    const slotToNames = new Map<number, string[]>();
    const mySlots: number[] = [];

    for (const row of poll.availabilities) {
      if (row.slotIndex < 0 || row.slotIndex > maxSlot) {
        continue;
      }
      const name =
        namesByUserId.get(row.userId) ?? formatFirstNameLastName(row.user);
      const list = slotToNames.get(row.slotIndex) ?? [];
      list.push(name);
      slotToNames.set(row.slotIndex, list);
      if (row.userId === user.id) {
        mySlots.push(row.slotIndex);
      }
    }

    for (const [slot, list] of slotToNames) {
      list.sort((a, b) => a.localeCompare(b));
      slotToNames.set(slot, list);
    }

    mySlots.sort((a, b) => a - b);

    const teamSize = memberUsers.length;
    const slots: Array<{ slotIndex: number; names: string[] }> = [];
    for (const [slotIndex, names] of [...slotToNames.entries()].sort((a, b) => a[0] - b[0])) {
      slots.push({ slotIndex, names });
    }

    return {
      poll: {
        id: poll.id,
        title: poll.title,
        projectId: poll.projectId,
        createdAt: poll.createdAt,
      },
      grid: gridSpec,
      teamSize,
      members: memberUsers.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: formatFirstNameLastName(u),
      })),
      slots,
      mySlots,
    };
  }

  async saveMyAvailability(user: SessionUser, pollId: string, body: { slots?: unknown }) {
    const poll = await this.prisma.when2MeetPoll.findUnique({
      where: { id: pollId },
      select: {
        id: true,
        projectId: true,
        gridFirstDate: true,
        gridLastDate: true,
        slotStartMinute: true,
        slotEndMinute: true,
      },
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    await this.ensureProjectAccess(user, poll.projectId);

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId: poll.projectId, userId: user.id, leftAt: null },
      select: { id: true },
    });

    const project = await this.prisma.project.findUnique({
      where: { id: poll.projectId },
      select: { pmId: true },
    });

    const isPm = user.role === 'PM' && project?.pmId === user.id;

    if (!membership && !isPm && user.role !== 'ADMIN') {
      throw new ForbiddenException('Only members of this team can set availability');
    }

    let gridSpec: PollGridSpec;
    try {
      gridSpec = deriveGridSpec({
        gridFirstDate: poll.gridFirstDate,
        gridLastDate: poll.gridLastDate,
        slotStartMinute: poll.slotStartMinute,
        slotEndMinute: poll.slotEndMinute,
      });
    } catch (e: any) {
      if (e instanceof BadRequestException) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    const maxSlot = gridSpec.totalSlots - 1;
    const slots = this.normalizeSlots(body.slots, maxSlot);

    await this.prisma.$transaction([
      this.prisma.when2MeetAvailability.deleteMany({
        where: { pollId, userId: user.id },
      }),
      ...(slots.length
        ? [
            this.prisma.when2MeetAvailability.createMany({
              data: slots.map((slotIndex) => ({
                pollId,
                userId: user.id,
                slotIndex,
              })),
            }),
          ]
        : []),
    ]);

    return this.getPoll(user, pollId);
  }
}
