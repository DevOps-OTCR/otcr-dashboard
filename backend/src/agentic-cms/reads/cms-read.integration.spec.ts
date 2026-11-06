import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CmsReadAccessService, CmsReader } from '../authorization/cms-read-access.service';
import { CmsReadService } from './cms-read.service';
import { ReadCursorService } from './read-cursor.service';

const databaseUrl = process.env.CMS_READ_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('CMS read operations against migrated PostgreSQL', () => {
  const schema = `cms_read_test_${randomUUID().replace(/-/g, '')}`;
  let pool: Pool;
  let db: PrismaClient;
  let reads: CmsReadService;
  let settings: Record<string, string>;
  const reader: CmsReader = { id: 'reader', email: 'reader@illinois.edu', role: 'CONSULTANT' };
  const admin: CmsReader = { id: 'pm', email: 'pm@illinois.edu', role: 'ADMIN' };
  const date = (value: string) => new Date(value);
  const deadline = '2026-11-07T05:59:00.000Z';

  beforeAll(async () => {
    // Never use DATABASE_URL implicitly or run test writes against a remote CMS.
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)) {
      throw new Error('CMS_READ_TEST_DATABASE_URL must point to local PostgreSQL.');
    }
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const migrations = join(__dirname, '../../../prisma/migrations');
    for (const name of readdirSync(migrations).filter(name => /^\d/.test(name)).sort()) {
      await pool.query(readFileSync(join(migrations, name, 'migration.sql'), 'utf8'));
    }
    db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    const prisma = db as unknown as PrismaService;
    const flags = new FeatureFlagsService({ get: (key: string) => settings[key] } as ConfigService);
    reads = new CmsReadService(prisma, new CmsReadAccessService(prisma, flags), flags, new ReadCursorService());
    await db.user.createMany({ data: ['pm', 'reader', 'a', 'z', 'lc', 'exec'].map(id => ({
      id, email: `${id}@illinois.edu`, firstName: id === 'reader' ? 'Demo' : id,
      lastName: id === 'reader' ? 'Consultant' : null,
    })) });
    await db.project.createMany({ data: ['project', 'other'].map(id => ({
      id, name: id, pmId: 'pm', startDate: date('2026-11-01T00:00:00Z'), sprintTimezone: 'America/Chicago',
    })) });
    await db.projectMember.create({ data: { projectId: 'project', userId: 'reader' } });
    await db.sprint.createMany({ data: [
      { id: 'week', projectId: 'project', sequenceNumber: 1, label: 'Week 1', status: 'RELEASED' as const,
        weekStartDate: date('2026-11-02T00:00:00Z'), weekEndDate: date('2026-11-08T00:00:00Z'),
        configSnapshot: { generalNotes: 'Compare market segments.', privateKey: 'must-not-return' } },
      { id: 'draft', projectId: 'project', sequenceNumber: 2, label: 'Draft', status: 'DRAFT' as const,
        weekStartDate: date('2026-11-09T00:00:00Z'), weekEndDate: date('2026-11-15T00:00:00Z') },
      { id: 'overlap', projectId: 'project', sequenceNumber: 3, label: 'Parallel week', status: 'RELEASED' as const,
        weekStartDate: date('2026-11-02T00:00:00Z'), weekEndDate: date('2026-11-08T00:00:00Z') },
      { id: 'future', projectId: 'project', sequenceNumber: 4, label: 'Future', status: 'RELEASED' as const,
        weekStartDate: date('2026-11-09T00:00:00Z'), weekEndDate: date('2026-11-15T00:00:00Z') },
      { id: 'other-week', projectId: 'other', sequenceNumber: 1, label: 'Other project', status: 'RELEASED' as const,
        weekStartDate: date('2026-11-02T00:00:00Z'), weekEndDate: date('2026-11-08T00:00:00Z') },
    ] });
    await db.deliverable.createMany({ data: [
      { id: 'd1', projectId: 'project', sprintId: 'week', title: 'Market landscape', status: 'IN_PROGRESS' as const, assigneeId: 'z' },
      { id: 'd2', projectId: 'project', sprintId: 'week', title: 'Competitor analysis', status: 'IN_PROGRESS' as const },
      { id: 'd3', projectId: 'project', sprintId: 'overlap', title: 'Submitted memo', status: 'SUBMITTED' as const },
      { id: 'd4', projectId: 'project', sprintId: 'draft', title: 'Draft-only item', status: 'PENDING' as const },
      { id: 'd5', projectId: 'project', sprintId: null, title: 'Unscoped item', status: 'PENDING' as const },
      { id: 'd6', projectId: 'other', sprintId: 'other-week', title: 'Other project item', status: 'PENDING' as const },
      { id: 'd7', projectId: 'project', sprintId: 'other-week', title: 'Inconsistent relation', status: 'PENDING' as const },
    ].map(item => ({ ...item, type: 'ANALYSIS' as const, deadline: date(deadline), description: 'Describe the market.', dueDateSource: 'MANUAL' as const })) });
    await db.deliverableAssignment.createMany({ data: ['a', 'reader'].map(userId => ({ deliverableId: 'd1', userId })) });
    await db.deliverableSubtask.createMany({ data: ['t1', 't2'].map(id => ({
      id, deliverableId: 'd1', title: id, notes: 'Use public sources.', assigneeId: 'reader',
      createdAt: date('2026-11-03T12:00:00Z'),
    })) });
    await db.submission.create({ data: { id: 's1', deliverableId: 'd1', userId: 'reader',
      fileName: 'Draft 1', fileUrl: 'https://example.test/draft1', fileSize: 0, version: 1,
      status: 'REQUIRES_RESUBMISSION', feedback: 'Add source citations.', reviewedById: 'pm',
      reviewedAt: date('2026-11-04T12:00:00Z'), submittedAt: date('2026-11-03T12:00:00Z') } });
    await db.submission.create({ data: { id: 's2', deliverableId: 'd1', userId: 'reader',
      fileName: 'Draft 2', fileUrl: 'https://example.test/draft2', fileSize: 0, version: 2,
      replacesId: 's1', submittedAt: date('2026-11-05T12:00:00Z') } });
  }, 30000);

  beforeEach(() => { settings = { AGENTIC_CMS_ENABLED: 'true' }; });
  afterAll(async () => {
    await db?.$disconnect();
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  });

  it('lists all visible workstreams across batches without missing or duplicate IDs', async () => {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await reads.listWorkstreams(reader, { projectId: 'project', limit: 1, ...(cursor ? { cursor } : {}) });
      ids.push(...result.workstreams.items.map(item => item.id));
      cursor = result.workstreams.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toEqual(['future', 'overlap', 'week']);
  });

  it('uses the local as-of day and UTC date labels, preserving overlapping matches', async () => {
    const input = { projectId: 'project', currentOnly: true, asOf: '2026-11-09T05:59:59Z', limit: 1 };
    const first = await reads.listWorkstreams(reader, input);
    expect(first.workstreams.items.map(row => row.id)).toEqual(['overlap']);
    const second = await reads.listWorkstreams(reader, { ...input, cursor: first.workstreams.nextCursor });
    expect(second.workstreams.items.map(row => row.id)).toEqual(['week']);
    expect(second.effectiveAsOf).toBe(first.effectiveAsOf);
    const nextDay = await reads.listWorkstreams(reader, { ...input, asOf: '2026-11-09T06:00:00Z' });
    expect(nextDay.workstreams.items.map(row => row.id)).toEqual(['future']);
    const none = await reads.listWorkstreams(reader, { ...input, asOf: '2027-01-01T00:00:00Z' });
    expect(none.workstreams).toEqual({ items: [], nextCursor: null });
  });

  it('returns workstream notes and only explicitly selected CMS data', async () => {
    const result = await reads.getWorkstream(reader, { projectId: 'project', workstreamId: 'week' });
    expect(result.workstream).toMatchObject({ id: 'week', generalNotes: 'Compare market segments.', status: 'RELEASED' });
    expect(result.deliverables.items.map(row => row.id)).toEqual(['d1', 'd2']);
    expect(JSON.stringify(result)).not.toContain('must-not-return');
    expect(result.schemaVersion).toBe('1');
    expect(result.truncatedFields).toEqual([]);
  });

  it('preserves broad workstream access without disclosing nested deliverables', async () => {
    for (const role of ['LC', 'EXECUTIVE'] as const) {
      const user = { id: role === 'LC' ? 'lc' : 'exec', email: `${role}@illinois.edu`, role };
      const result = await reads.getWorkstream(user, { projectId: 'project', workstreamId: 'week' });
      expect(result.deliverablesAccess).toBe('denied');
      expect(result.deliverables).toBeNull();
      await expect(reads.listDeliverables(user, { projectId: 'project' })).rejects.toMatchObject({ status: 404 });
    }
  });

  it('combines status/workstream filters and pages tied deadlines correctly', async () => {
    const input = { projectId: 'project', workstreamId: 'week', status: 'IN_PROGRESS', limit: 1 };
    const first = await reads.listDeliverables(reader, input);
    expect(first.deliverables.items).toEqual([expect.objectContaining({ id: 'd1', title: 'Market landscape', deadline, workstreamId: 'week' })]);
    const second = await reads.listDeliverables(reader, { ...input, cursor: first.deliverables.nextCursor });
    expect(second.deliverables.items.map(row => row.id)).toEqual(['d2']);
    expect(second.deliverables.nextCursor).toBeNull();
    expect((await reads.listDeliverables(reader, { ...input, status: 'APPROVED' })).deliverables.items).toEqual([]);
    expect((await reads.listDeliverables(reader, { projectId: 'project' })).deliverables.items.map(row => row.id)).toEqual(['d1', 'd2', 'd3']);
  });

  it('gets exact overview metadata and paged child sections including legacy assignments', async () => {
    const input = { projectId: 'project', deliverableId: 'd1' };
    const overview = await reads.getDeliverable(reader, input);
    expect(overview.section).toBe('overview');
    if (overview.section !== 'overview') throw new Error('Wrong section');
    expect(overview.deliverable).toMatchObject({ id: 'd1', description: 'Describe the market.', dueDateSource: 'MANUAL', deadline });
    expect(overview.availableSections).toEqual(['assignments', 'subtasks', 'submissions']);
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await reads.getDeliverable(reader, { ...input, section: 'assignments', limit: 1, ...(cursor ? { cursor } : {}) });
      if (result.section !== 'assignments') throw new Error('Wrong section');
      ids.push(...result.assignments.items.map(row => row.user.id));
      cursor = result.assignments.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toEqual(['a', 'reader', 'z']);
    const subtasks = await reads.getDeliverable(reader, { ...input, section: 'subtasks', limit: 1 });
    if (subtasks.section !== 'subtasks') throw new Error('Wrong section');
    expect(subtasks.subtasks.items[0]).toMatchObject({ id: 't1', notes: 'Use public sources.', assignee: { id: 'reader', displayName: 'Demo Consultant' } });
    const next = await reads.getDeliverable(reader, { ...input, section: 'subtasks', cursor: subtasks.subtasks.nextCursor });
    if (next.section !== 'subtasks') throw new Error('Wrong section');
    expect(next.subtasks.items.map(row => row.id)).toEqual(['t2']);
  });

  it('returns exact submission versions, replacement links and stored feedback', async () => {
    const input = { projectId: 'project', deliverableId: 'd1', section: 'submissions', limit: 1 };
    const first = await reads.getDeliverable(reader, input);
    if (first.section !== 'submissions') throw new Error('Wrong section');
    expect(first.submissions.items[0]).toMatchObject({ id: 's2', version: 2, replacesId: 's1', contentAvailability: 'link_only', feedback: null });
    const second = await reads.getDeliverable(reader, { ...input, cursor: first.submissions.nextCursor });
    if (second.section !== 'submissions') throw new Error('Wrong section');
    expect(second.submissions.items[0]).toMatchObject({ id: 's1', version: 1, replacesId: null, feedback: 'Add source citations.', reviewedById: 'pm' });
    expect(JSON.stringify(second)).not.toContain('@illinois.edu');
  });

  it('deduplicates legacy assignees and returns explicitly empty child sections', async () => {
    await db.deliverable.update({ where: { id: 'd1' }, data: { assigneeId: 'a' } });
    try {
      const result = await reads.getDeliverable(reader, { projectId: 'project', deliverableId: 'd1', section: 'assignments' });
      if (result.section !== 'assignments') throw new Error('Wrong section');
      expect(result.assignments.items.map(row => row.user.id)).toEqual(['a', 'reader']);
    } finally {
      await db.deliverable.update({ where: { id: 'd1' }, data: { assigneeId: 'z' } });
    }
    for (const section of ['assignments', 'subtasks', 'submissions'] as const) {
      const result = await reads.getDeliverable(reader, { projectId: 'project', deliverableId: 'd2', section });
      expect(result[section]).toEqual({ items: [], nextCursor: null });
    }
  });

  it('pages workstream children and continues after a previous page record is deleted', async () => {
    const input = { projectId: 'project', workstreamId: 'week', limit: 1 };
    const first = await reads.getWorkstream(reader, input);
    expect(first.deliverables.items.map(row => row.id)).toEqual(['d1']);
    const second = await reads.getWorkstream(reader, { ...input, cursor: first.deliverables.nextCursor });
    expect(second.deliverables.items.map(row => row.id)).toEqual(['d2']);
    // A temporary record sorts first; deleting the cursor anchor must not stop traversal.
    await db.deliverable.create({ data: { id: 'd0', projectId: 'project', sprintId: 'week', title: 'Temporary', type: 'ANALYSIS', deadline: date(deadline) } });
    const page = await reads.listDeliverables(reader, { projectId: 'project', limit: 1 });
    await db.deliverable.delete({ where: { id: 'd0' } });
    const next = await reads.listDeliverables(reader, { projectId: 'project', limit: 1, cursor: page.deliverables.nextCursor });
    expect(next.deliverables.items.map(row => row.id)).toEqual(['d1']);
  });

  it('denies drafts, unscoped and cross-project children, including inconsistent relations', async () => {
    for (const deliverableId of ['d4', 'd5', 'd6', 'd7', 'missing']) {
      await expect(reads.getDeliverable(reader, { projectId: 'project', deliverableId })).rejects.toMatchObject({ response: { code: 'NOT_FOUND_OR_FORBIDDEN' } });
    }
    for (const workstreamId of ['draft', 'other-week', 'missing']) {
      await expect(reads.getWorkstream(reader, { projectId: 'project', workstreamId })).rejects.toMatchObject({ status: 404 });
      await expect(reads.listDeliverables(reader, { projectId: 'project', workstreamId })).rejects.toMatchObject({ status: 404 });
    }
    expect((await reads.getWorkstream(admin, { projectId: 'project', workstreamId: 'draft' })).workstream.id).toBe('draft');
    const manager = await reads.listDeliverables(admin, { projectId: 'project' });
    expect(manager.deliverables.items.map(row => row.id)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5']);
  });

  it('binds cursors to callers, tools, sections, parents and filters; detects tampering', async () => {
    const page = await reads.listDeliverables(reader, { projectId: 'project', limit: 1 });
    const cursor = page.deliverables.nextCursor;
    for (const input of [
      { projectId: 'project', cursor: `${cursor}x` },
      { projectId: 'project', cursor, status: 'IN_PROGRESS' },
      { projectId: 'project', cursor, workstreamId: 'week' },
    ]) await expect(reads.listDeliverables(reader, input)).rejects.toMatchObject({ response: { code: 'INVALID_CURSOR' } });
    await expect(reads.listDeliverables(admin, { projectId: 'project', cursor })).rejects.toMatchObject({ response: { code: 'INVALID_CURSOR' } });
    await expect(reads.getWorkstream(reader, { projectId: 'project', workstreamId: 'week', cursor })).rejects.toMatchObject({ response: { code: 'INVALID_CURSOR' } });
    await expect(reads.getDeliverable(reader, { projectId: 'project', deliverableId: 'd1', section: 'subtasks', cursor })).rejects.toMatchObject({ response: { code: 'INVALID_CURSOR' } });
  });

  it('rechecks lost membership before continuing a collection', async () => {
    const first = await reads.listDeliverables(reader, { projectId: 'project', limit: 1 });
    await db.projectMember.update({ where: { projectId_userId: { projectId: 'project', userId: 'reader' } }, data: { leftAt: new Date() } });
    try {
      await expect(reads.listDeliverables(reader, { projectId: 'project', cursor: first.deliverables.nextCursor })).rejects.toMatchObject({ status: 404 });
    } finally {
      await db.projectMember.update({ where: { projectId_userId: { projectId: 'project', userId: 'reader' } }, data: { leftAt: null } });
    }
  });

  it('marks Unicode truncation and does not expose raw output fields', async () => {
    await db.deliverable.update({ where: { id: 'd1' }, data: { description: '🙂'.repeat(12001) } });
    try {
      const result = await reads.getDeliverable(reader, { projectId: 'project', deliverableId: 'd1' });
      if (result.section !== 'overview') throw new Error('Wrong section');
      expect(Array.from(result.deliverable.description)).toHaveLength(12000);
      expect(result.truncatedFields).toEqual(['/deliverable/description']);
      expect(result.deliverable).not.toHaveProperty('assignee');
    } finally {
      await db.deliverable.update({ where: { id: 'd1' }, data: { description: 'Describe the market.' } });
    }
  });

  it('blocks every operation before queries with the flag off', async () => {
    settings.AGENTIC_CMS_ENABLED = 'false';
    const query = jest.spyOn(db.project, 'findUnique');
    try {
      for (const call of [
        () => reads.listWorkstreams(reader, { projectId: 'project' }),
        () => reads.getWorkstream(reader, { projectId: 'project', workstreamId: 'week' }),
        () => reads.listDeliverables(reader, { projectId: 'project' }),
        () => reads.getDeliverable(reader, { projectId: 'project', deliverableId: 'd1' }),
      ]) await expect(call()).rejects.toMatchObject({ status: 404 });
      expect(query).not.toHaveBeenCalled();
    } finally { query.mockRestore(); }
  });
});
