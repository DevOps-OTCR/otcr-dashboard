import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CmsReadAccessService, CmsReader } from '../authorization/cms-read-access.service';
import { ReadCursorService, ReadPosition } from './read-cursor.service';
import { finish, parseInput, unavailable, userReference } from './read-helpers';
import * as schemas from './read.schemas';

const personSelect = { id: true, firstName: true, lastName: true } as const;
const workstreamSelect = {
  id: true, projectId: true, label: true, sequenceNumber: true, status: true,
  weekStartDate: true, weekEndDate: true, updatedAt: true,
} satisfies Prisma.SprintSelect;
const deliverableSelect = {
  id: true, projectId: true, sprintId: true, title: true, type: true, templateKind: true,
  deadline: true, status: true, completed: true, updatedAt: true,
} satisfies Prisma.DeliverableSelect;
type DeliverableRow = Prisma.DeliverableGetPayload<{ select: typeof deliverableSelect }>;
const summary = (record: DeliverableRow) => ({
  id: record.id, projectId: record.projectId, workstreamId: record.sprintId,
  title: record.title, type: record.type, templateKind: record.templateKind,
  deadline: record.deadline, status: record.status, completed: record.completed, updatedAt: record.updatedAt,
});

@Injectable()
export class CmsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CmsReadAccessService,
    private readonly flags: FeatureFlagsService,
    private readonly cursors: ReadCursorService,
  ) {}

  private async execute<T>(user: CmsReader, operation: () => Promise<T>): Promise<T> {
    this.flags.assertAgenticCmsEnabledFor(user?.email);
    try {
      const result = await operation();
      this.flags.assertAgenticCmsEnabledFor(user.email);
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({ code: 'CMS_UNAVAILABLE', message: 'CMS data is temporarily unavailable.' });
    }
  }

  private query<T>(user: CmsReader, operation: () => Promise<T>): Promise<T> {
    this.flags.assertAgenticCmsEnabledFor(user.email);
    return operation();
  }

  private page<T>(rows: T[], limit: number, scope: string, position: (row: T) => { id: string; sortValue: string | number | null }, asOf: string | null = null) {
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit
        ? this.cursors.encode(scope, { ...position(items[items.length - 1]), asOf }) : null,
    };
  }

  private datePosition(cursor: ReadPosition | null): Date | null {
    if (!cursor) return null;
    if (typeof cursor.sortValue !== 'string' || !Number.isFinite(Date.parse(cursor.sortValue))) return this.cursors.invalid();
    return new Date(cursor.sortValue);
  }

  private async timezone(user: CmsReader, projectId: string): Promise<string> {
    const project = await this.query(user, () => this.prisma.project.findUnique({
      where: { id: projectId }, select: { sprintTimezone: true },
    }));
    if (!project) unavailable();
    new Intl.DateTimeFormat('en-US', { timeZone: project.sprintTimezone });
    return project.sprintTimezone;
  }

  listWorkstreams(user: CmsReader, raw: unknown) {
    return this.execute(user, async () => {
      const input = parseInput(schemas.listWorkstreamsInput, raw);
      const access = await this.access.workstreamScope(user, input.projectId);
      const timezone = await this.timezone(user, input.projectId);
      const scope = this.cursors.scope({ tool: 'list_workstreams', userId: user.id, projectId: input.projectId,
        currentOnly: input.currentOnly, asOf: input.asOf ?? null, timezone });
      const cursor = this.cursors.decode(input.cursor, scope);
      if (cursor && typeof cursor.sortValue !== 'number') this.cursors.invalid();
      const effectiveAsOf = input.currentOnly ? cursor?.asOf ?? new Date(input.asOf ?? Date.now()).toISOString() : null;
      if (cursor && input.currentOnly && !cursor.asOf) this.cursors.invalid();
      const conditions: Prisma.SprintWhereInput[] = [access.where];
      if (effectiveAsOf) {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
          .formatToParts(new Date(effectiveAsOf));
        const part = (type: string) => parts.find(value => value.type === type)?.value;
        // CMS sprint boundaries are date labels stored at UTC midnight, not instants
        // to shift into the project timezone. Convert only the caller's as-of date.
        const day = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`);
        conditions.push({ weekStartDate: { lt: new Date(day.getTime() + 86400000) }, weekEndDate: { gte: day } });
      }
      if (cursor) conditions.push({ OR: [
        { sequenceNumber: { lt: cursor.sortValue as number } },
        { sequenceNumber: cursor.sortValue as number, id: { gt: cursor.id } },
      ] });
      const records = await this.query(user, () => this.prisma.sprint.findMany({
        where: { AND: conditions }, select: workstreamSelect,
        orderBy: [{ sequenceNumber: 'desc' }, { id: 'asc' }], take: input.limit + 1,
      }));
      return finish(schemas.listWorkstreamsOutput, {
        projectId: input.projectId, timezone, effectiveAsOf,
        workstreams: this.page(records, input.limit, scope, row => ({ id: row.id, sortValue: row.sequenceNumber }), effectiveAsOf),
      });
    });
  }

  getWorkstream(user: CmsReader, raw: unknown) {
    return this.execute(user, async () => {
      const input = parseInput(schemas.getWorkstreamInput, raw);
      const access = await this.access.workstreamScope(user, input.projectId);
      const record = await this.query(user, () => this.prisma.sprint.findFirst({
        where: { AND: [access.where, { id: input.workstreamId }] },
        select: { ...workstreamSelect, configSnapshot: true },
      }));
      if (!record) unavailable();
      const timezone = await this.timezone(user, input.projectId);
      const { configSnapshot, ...workstream } = record;
      const generalNotes = configSnapshot && typeof configSnapshot === 'object' && !Array.isArray(configSnapshot)
        && typeof configSnapshot.generalNotes === 'string' ? configSnapshot.generalNotes : null;
      if (!access.canReadDeliverables) {
        if (input.cursor) unavailable();
        return finish(schemas.getWorkstreamOutput, {
          workstream: { ...workstream, generalNotes }, timezone, deliverablesAccess: 'denied', deliverables: null,
        });
      }
      const deliverables = await this.deliverablePage(user, input, 'get_workstream');
      return finish(schemas.getWorkstreamOutput, {
        workstream: { ...workstream, generalNotes }, timezone, deliverablesAccess: 'allowed', deliverables,
      });
    });
  }

  private async deliverablePage(user: CmsReader, input: { projectId: string; workstreamId?: string; status?: Prisma.EnumDeliverableStatusFilter['equals']; limit: number; cursor?: string }, tool: string) {
    const access = await this.access.deliverableScope(user, input.projectId);
    const scope = this.cursors.scope({ tool, userId: user.id, projectId: input.projectId,
      workstreamId: input.workstreamId ?? null, status: input.status ?? null });
    const cursor = this.cursors.decode(input.cursor, scope);
    const date = this.datePosition(cursor);
    const conditions: Prisma.DeliverableWhereInput[] = [access.where];
    if (input.workstreamId) conditions.push({ sprintId: input.workstreamId });
    if (input.status) conditions.push({ status: input.status });
    if (cursor) conditions.push({ OR: [{ deadline: { gt: date } }, { deadline: date, id: { gt: cursor.id } }] });
    const rows = await this.query(user, () => this.prisma.deliverable.findMany({
      where: { AND: conditions }, select: deliverableSelect,
      orderBy: [{ deadline: 'asc' }, { id: 'asc' }], take: input.limit + 1,
    }));
    return this.page(rows.map(summary), input.limit, scope, row => ({ id: row.id, sortValue: row.deadline.toISOString() }));
  }

  listDeliverables(user: CmsReader, raw: unknown) {
    return this.execute(user, async () => {
      const input = parseInput(schemas.listDeliverablesInput, raw);
      if (input.workstreamId) await this.access.assertWorkstreamAccess(user, input.projectId, input.workstreamId);
      const deliverables = await this.deliverablePage(user, input, 'list_deliverables');
      return finish(schemas.listDeliverablesOutput, { projectId: input.projectId, deliverables });
    });
  }

  getDeliverable(user: CmsReader, raw: unknown) {
    return this.execute(user, async () => {
      const input = parseInput(schemas.getDeliverableInput, raw);
      const access = await this.access.deliverableScope(user, input.projectId);
      const where: Prisma.DeliverableWhereInput = { AND: [access.where, { id: input.deliverableId }] };
      const record = await this.query(user, () => this.prisma.deliverable.findFirst({
        where, select: { ...deliverableSelect, description: true, dueDateSource: true, createdAt: true,
          assignedAt: true, assigneeId: true },
      }));
      if (!record) unavailable();
      const base = { projectId: input.projectId, deliverableId: record.id, section: input.section, sourceUpdatedAt: record.updatedAt };
      if (input.section === 'overview') {
        return finish(schemas.getDeliverableOutput, { ...base,
          deliverable: { ...summary(record), description: record.description, dueDateSource: record.dueDateSource, createdAt: record.createdAt },
          availableSections: ['assignments', 'subtasks', 'submissions'],
        });
      }
      const scope = this.cursors.scope({ tool: 'get_deliverable', userId: user.id, projectId: input.projectId,
        deliverableId: input.deliverableId, section: input.section });
      const cursor = this.cursors.decode(input.cursor, scope);
      const limit = input.limit ?? 20;
      const childWhere = { deliverableId: record.id, deliverable: { is: where } };
      if (input.section === 'assignments') {
        if (cursor && cursor.sortValue !== null) this.cursors.invalid();
        // Select users through actual assignments OR the legacy assignee. The DB
        // deduplicates and orders both sources with the same collation as paging.
        const rows = await this.query(user, () => this.prisma.user.findMany({
          where: { AND: [
            { OR: [{ deliverableAssignments: { some: childWhere } }, ...(record.assigneeId ? [{ id: record.assigneeId }] : [])] },
            ...(cursor ? [{ id: { gt: cursor.id } }] : []),
          ] },
          select: { ...personSelect, deliverableAssignments: {
            where: { deliverableId: record.id }, select: { assignedAt: true }, take: 1,
          } }, orderBy: { id: 'asc' }, take: limit + 1,
        }));
        const assignments = this.page(rows.map(row => ({ user: userReference(row), assignedAt: row.deliverableAssignments[0]?.assignedAt ?? record.assignedAt })),
          limit, scope, row => ({ id: row.user.id, sortValue: null }));
        return finish(schemas.getDeliverableOutput, { ...base, assignments });
      }
      const date = this.datePosition(cursor);
      if (input.section === 'subtasks') {
        const rows = await this.query(user, () => this.prisma.deliverableSubtask.findMany({
          where: { AND: [childWhere, ...(cursor ? [{ OR: [{ createdAt: { gt: date } }, { createdAt: date, id: { gt: cursor.id } }] }] : [])] },
          select: { id: true, title: true, notes: true, dueDate: true, completed: true,
            assignee: { select: personSelect }, createdAt: true, updatedAt: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit + 1,
        }));
        const subtasks = this.page(rows.map(row => ({ ...row, assignee: userReference(row.assignee) })),
          limit, scope, row => ({ id: row.id, sortValue: row.createdAt.toISOString() }));
        return finish(schemas.getDeliverableOutput, { ...base, subtasks });
      }
      const rows = await this.query(user, () => this.prisma.submission.findMany({
        where: { AND: [childWhere, ...(cursor ? [{ OR: [{ submittedAt: { lt: date } }, { submittedAt: date, id: { gt: cursor.id } }] }] : [])] },
        select: { id: true, submitter: { select: personSelect }, fileName: true, fileUrl: true, mimeType: true,
          fileSize: true, status: true, version: true, replacesId: true, submittedAt: true, isLate: true,
          reviewedById: true, reviewedAt: true, feedback: true },
        orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }], take: limit + 1,
      }));
      const submissions = this.page(rows.map(row => ({ ...row, submitter: userReference(row.submitter), contentAvailability: 'link_only' })),
        limit, scope, row => ({ id: row.id, sortValue: row.submittedAt.toISOString() }));
      return finish(schemas.getDeliverableOutput, { ...base, submissions });
    });
  }
}
