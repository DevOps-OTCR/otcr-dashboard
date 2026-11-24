import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CmsReadAccessService, CmsReader } from '../authorization/cms-read-access.service';
import { ResearchAccessService } from './research-access.service';
import { CmsResearchDocumentAdapter } from './research-document.adapter';
import { emptyResearchDocument } from './research.schemas';
import { ResearchWorkspaceService } from './research-workspace.service';

const databaseUrl = process.env.CMS_READ_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('Research workspace against migrated PostgreSQL', () => {
  const schema = `research_test_${randomUUID().replace(/-/g, '')}`;
  let pool: Pool;
  let db: PrismaClient;
  let service: ResearchWorkspaceService;
  let adapter: CmsResearchDocumentAdapter;
  let settings: Record<string, string>;
  const user: CmsReader = { id: 'consultant', email: 'consultant@example.test', role: 'CONSULTANT' };
  const teammate: CmsReader = { id: 'teammate', email: 'teammate@example.test', role: 'CONSULTANT' };

  beforeAll(async () => {
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
    const access = new ResearchAccessService(new CmsReadAccessService(prisma, flags), prisma, flags);
    adapter = new CmsResearchDocumentAdapter(prisma);
    service = new ResearchWorkspaceService(access, adapter);
    await db.user.createMany({ data: ['pm', 'consultant', 'teammate', 'unassigned'].map(id => ({ id, email: `${id}@example.test` })) });
    await db.project.createMany({ data: ['project', 'other'].map(id => ({ id, name: id, pmId: 'pm', startDate: new Date() })) });
    await db.projectMember.createMany({ data: ['consultant', 'teammate', 'unassigned'].map(userId => ({ projectId: 'project', userId })) });
    await db.sprint.createMany({ data: ['week', 'draft', 'other-week'].map((id, index) => ({
      id, projectId: id === 'other-week' ? 'other' : 'project', sequenceNumber: index + 1,
      label: id, status: id === 'draft' ? 'DRAFT' : 'RELEASED', weekStartDate: new Date(), weekEndDate: new Date(),
    })) });
  }, 30_000);

  beforeEach(async () => {
    settings = { AGENTIC_CMS_ENABLED: 'true' };
    await db.deliverable.deleteMany();
    await db.projectMember.updateMany({ data: { leftAt: null } });
    await db.deliverable.createMany({ data: [
      { id: 'deliverable', projectId: 'project', sprintId: 'week' },
      { id: 'second', projectId: 'project', sprintId: 'week' },
      { id: 'draft-item', projectId: 'project', sprintId: 'draft' },
      { id: 'other-item', projectId: 'other', sprintId: 'other-week' },
      { id: 'inconsistent', projectId: 'project', sprintId: 'other-week' },
    ].map(item => ({ ...item, title: item.id, type: 'ANALYSIS' as const, deadline: new Date() })) });
    await db.deliverableAssignment.createMany({ data: ['deliverable', 'second', 'draft-item', 'other-item', 'inconsistent'].flatMap(deliverableId =>
      ['consultant', 'teammate'].map(userId => ({ deliverableId, userId }))) });
  });

  afterAll(async () => {
    await db?.$disconnect();
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  });

  it('initializes one shared workspace and initial revision, even with parallel requests', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => service.initialize(user, 'project', 'deliverable')));
    expect(new Set(results.map(result => result.id)).size).toBe(1);
    expect(results[0]).toMatchObject({ version: 1, canEdit: true, storage: 'cms', document: emptyResearchDocument() });
    expect(await db.researchWorkspace.count()).toBe(1);
    expect(await db.researchRevision.count()).toBe(1);
    expect((await service.read(teammate, 'project', 'deliverable')).id).toBe(results[0].id);
    await service.initialize(user, 'project', 'second');
    expect(await db.researchWorkspace.count()).toBe(2);
  });

  it('persists section edits, sources and snapshots across service instances; restore appends history', async () => {
    await service.initialize(user, 'project', 'deliverable');
    const document = emptyResearchDocument();
    document.sources.push({ id: 's1', title: 'Synthetic evidence', url: 'https://example.test/evidence' });
    document.sections[2].content = 'A supported finding [s1].';
    document.sections[2].sourceIds = ['s1'];
    await service.save(user, 'project', 'deliverable', { expectedVersion: 1, document });
    await service.editSection(teammate, 'project', 'deliverable', 'framework', { expectedVersion: 2, title: 'Our structure', content: 'Market demand' });
    const reloaded = await new CmsResearchDocumentAdapter(db as unknown as PrismaService).read('deliverable');
    expect(reloaded.version).toBe(3);
    expect(reloaded.document).toMatchObject({ sources: document.sources, sections: [expect.anything(), expect.objectContaining({ content: 'Market demand' }), document.sections[2]] });
    const restored = await service.restore(user, 'project', 'deliverable', { expectedVersion: 3, targetVersion: 1 });
    expect(restored).toMatchObject({ version: 4, document: emptyResearchDocument() });
    const history = await service.history(user, 'project', 'deliverable', { limit: 2 });
    expect(history.items.map(item => item.version)).toEqual([4, 3]);
    expect(history.items[0]).toMatchObject({ action: 'RESTORE', restoredFromVersion: 1, authorId: 'consultant' });
    expect(history.items[1].authorId).toBe('teammate');
    const older = await service.history(user, 'project', 'deliverable', { beforeVersion: history.nextBeforeVersion, limit: 2 });
    expect(older.items.map(item => item.version)).toEqual([2, 1]);
    expect(older.nextBeforeVersion).toBeNull();
    // A restore is itself reversible; the cited finding has not been deleted from history.
    const redo = await service.restore(user, 'project', 'deliverable', { expectedVersion: 4, targetVersion: 3 });
    expect(redo.document.sections[2]).toEqual(document.sections[2]);
    expect(redo.version).toBe(5);
  });

  it('accepts exactly one concurrent save and rejects stale saves/restores without losing history', async () => {
    await service.initialize(user, 'project', 'deliverable');
    const edits = await Promise.allSettled(['First', 'Second'].map(content => service.editSection(user, 'project', 'deliverable', 'findings', { expectedVersion: 1, content })));
    expect(edits.filter(edit => edit.status === 'fulfilled')).toHaveLength(1);
    const failed = edits.find(edit => edit.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ status: 409 });
    await expect(service.restore(user, 'project', 'deliverable', { expectedVersion: 1, targetVersion: 1 })).rejects.toMatchObject({ status: 409 });
    expect(await db.researchRevision.count()).toBe(2);
    await expect(service.restore(user, 'project', 'deliverable', { expectedVersion: 2, targetVersion: 99 })).rejects.toMatchObject({ status: 404 });
    expect((await service.read(user, 'project', 'deliverable')).version).toBe(2);
  });

  it('rolls back content if its revision cannot be recorded', async () => {
    await service.initialize(user, 'project', 'deliverable');
    const document = emptyResearchDocument(); document.sections[2].content = 'Must roll back';
    await expect(adapter.revise('deliverable', { expectedVersion: 1, document }, {
      authorId: 'nonexistent-user', assertWrite: async () => {},
    })).rejects.toBeDefined();
    expect(await adapter.read('deliverable')).toMatchObject({ version: 1, document: emptyResearchDocument() });
    expect(await db.researchRevision.count()).toBe(1);
  });

  it('preserves CMS scope, assignment and released-week restrictions using real relations', async () => {
    await service.initialize(user, 'project', 'deliverable');
    const unassigned: CmsReader = { id: 'unassigned', email: 'unassigned@example.test', role: 'CONSULTANT' };
    expect((await service.read(unassigned, 'project', 'deliverable')).canEdit).toBe(false);
    await expect(service.save(unassigned, 'project', 'deliverable', { expectedVersion: 1, document: emptyResearchDocument() })).rejects.toMatchObject({ status: 404 });
    for (const id of ['draft-item', 'other-item', 'inconsistent']) {
      await expect(service.initialize(user, 'project', id)).rejects.toMatchObject({ status: 404 });
    }
    await db.deliverableAssignment.delete({ where: { deliverableId_userId: { deliverableId: 'deliverable', userId: user.id } } });
    await expect(service.restore(user, 'project', 'deliverable', { expectedVersion: 1, targetVersion: 1 })).rejects.toMatchObject({ status: 404 });
    await db.projectMember.updateMany({ where: { userId: user.id }, data: { leftAt: new Date() } });
    await expect(service.history(user, 'project', 'deliverable', {})).rejects.toMatchObject({ status: 404 });
  });

  it('rejects invalid citations and duplicate/missing section IDs without altering saved content', async () => {
    await service.initialize(user, 'project', 'deliverable');
    const badCitation = emptyResearchDocument(); badCitation.sections[2].sourceIds = ['missing'];
    const duplicate = emptyResearchDocument(); duplicate.sections.push({ ...duplicate.sections[0] });
    const missing = emptyResearchDocument(); missing.sections[0].id = 'renamed-root';
    const unsafeUrl = emptyResearchDocument(); unsafeUrl.sources.push({ id: 's1', title: 'Unsafe', url: 'javascript:alert(1)' });
    for (const document of [badCitation, duplicate, missing, unsafeUrl]) {
      await expect(service.save(user, 'project', 'deliverable', { expectedVersion: 1, document })).rejects.toMatchObject({ status: 400 });
    }
    expect(await db.researchRevision.count()).toBe(1);
  });

  it('blocks all operations when disabled, before any workspace is created', async () => {
    settings.AGENTIC_CMS_ENABLED = 'false';
    await expect(service.initialize(user, 'project', 'deliverable')).rejects.toMatchObject({ status: 404 });
    await expect(service.read(user, 'project', 'deliverable')).rejects.toMatchObject({ status: 404 });
    await expect(service.save(user, 'project', 'deliverable', {})).rejects.toMatchObject({ status: 404 });
    await expect(service.editSection(user, 'project', 'deliverable', 'findings', {})).rejects.toMatchObject({ status: 404 });
    await expect(service.restore(user, 'project', 'deliverable', {})).rejects.toMatchObject({ status: 404 });
    await expect(service.history(user, 'project', 'deliverable', {})).rejects.toMatchObject({ status: 404 });
    expect(await db.researchWorkspace.count()).toBe(0);
    expect(await db.researchRevision.count()).toBe(0);
  });
});
