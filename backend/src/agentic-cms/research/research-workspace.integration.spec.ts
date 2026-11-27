import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
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
import { ResearchPreparationService } from './research-preparation.service';
import { ResearchWorkspaceController } from './research-workspace.controller';
import { ResearchReleaseInterceptor } from './research-release.interceptor';
import { AgenticCmsGuard } from '../../feature-flags/agentic-cms.guard';
import { AuthGuard } from '../../auth/auth.guard';
import { AuthService } from '../../auth/auth.service';
import { ProjectsController } from '../../projects/projects.controller';
import { ProjectsService } from '../../projects/projects.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { getVerifiedUser } from '../../common/utils/verify';

jest.mock('../../common/utils/verify', () => ({ getVerifiedUser: jest.fn() }));

const databaseUrl = process.env.CMS_READ_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('Research workspace against migrated PostgreSQL', () => {
  const schema = `research_test_${randomUUID().replace(/-/g, '')}`;
  let pool: Pool;
  let db: PrismaClient;
  let service: ResearchWorkspaceService;
  let adapter: CmsResearchDocumentAdapter;
  let preparation: ResearchPreparationService;
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
    preparation = new ResearchPreparationService(prisma, flags, new CmsReadAccessService(prisma, flags), access, adapter);
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

  it('prepares every released deliverable, leaves drafts/other projects alone and preserves edits on repeat release', async () => {
    const pm: CmsReader = { id: 'pm', email: 'pm@example.test', role: 'PM' };
    await preparation.prepareReleasedWorkstream(pm, 'project', 'week');
    expect(await db.researchWorkspace.count()).toBe(2);
    expect(await db.researchPreparation.findMany({ orderBy: { deliverableId: 'asc' } })).toEqual([
      expect.objectContaining({ deliverableId: 'deliverable', status: 'READY', attempts: 1 }),
      expect.objectContaining({ deliverableId: 'second', status: 'READY', attempts: 1 }),
    ]);
    await service.editSection(user, 'project', 'deliverable', 'findings', { expectedVersion: 1, content: 'Keep my research' });
    await preparation.prepareReleasedWorkstream(pm, 'project', 'week');
    expect((await service.read(user, 'project', 'deliverable')).document.sections[2].content).toBe('Keep my research');
    expect(await db.researchRevision.count()).toBe(3);
    expect((await preparation.status(user, 'project', 'deliverable')).attempts).toBe(1);
  });

  it('deduplicates concurrent retries, recovers expired leases and retains durable status', async () => {
    await Promise.all([preparation.prepare(user, 'project', 'deliverable'), preparation.prepare(teammate, 'project', 'deliverable')]);
    expect(await db.researchWorkspace.count()).toBe(1);
    expect(await db.researchRevision.count()).toBe(1);
    await db.researchPreparation.create({ data: { deliverableId: 'second', status: 'PREPARING', attempts: 1, leaseToken: 'interrupted', leaseExpiresAt: new Date(Date.now() - 1000) } });
    expect(await preparation.status(user, 'project', 'second')).toMatchObject({ state: 'PREPARING', interrupted: true, canRetry: true });
    expect(await preparation.prepare(user, 'project', 'second')).toMatchObject({ state: 'READY', attempts: 2 });
    expect((await db.researchPreparation.findUnique({ where: { deliverableId: 'second' } })).leaseToken).toBeNull();
  });

  it('records failures without resetting another workspace and allows a later retry', async () => {
    const initialize = jest.spyOn(adapter, 'initialize').mockRejectedValueOnce(new Error('Synthetic storage failure'));
    try {
      expect(await preparation.prepare(user, 'project', 'deliverable')).toMatchObject({ state: 'FAILED', attempts: 1, canRetry: true });
      expect(await db.researchWorkspace.count()).toBe(0);
      expect(await preparation.prepare(user, 'project', 'deliverable')).toMatchObject({ state: 'READY', attempts: 2, canRetry: false });
    } finally { initialize.mockRestore(); }
  });

  it('does not reclaim a live lease or let assignment override project/draft visibility', async () => {
    await db.researchPreparation.create({ data: { deliverableId: 'deliverable', status: 'PREPARING', attempts: 1, leaseToken: 'active', leaseExpiresAt: new Date(Date.now() + 120_000) } });
    expect(await preparation.prepare(user, 'project', 'deliverable')).toMatchObject({ state: 'PREPARING', canRetry: false, attempts: 1 });
    expect(await db.researchWorkspace.count()).toBe(0);
    for (const id of ['draft-item', 'other-item', 'inconsistent']) {
      await expect(preparation.prepare(user, 'project', id)).rejects.toMatchObject({ status: 404 });
    }
    const unassigned: CmsReader = { id: 'unassigned', email: 'unassigned@example.test', role: 'CONSULTANT' };
    expect(await preparation.status(unassigned, 'project', 'second')).toMatchObject({ canRetry: false });
    await expect(preparation.prepare(unassigned, 'project', 'second')).rejects.toMatchObject({ status: 404 });
  });

  it('stops preparation writes when the flag/pilot is revoked during initialization', async () => {
    const initialize = jest.spyOn(adapter, 'initialize').mockImplementationOnce(async (_id, context) => {
      settings.AGENTIC_CMS_ALLOWED_EMAILS = 'other@example.test';
      await context.assertWrite();
      throw new Error('Must not get here');
    });
    try {
      await expect(preparation.prepare(user, 'project', 'deliverable')).rejects.toMatchObject({ status: 404 });
      expect(await db.researchWorkspace.count()).toBe(0);
      expect(await db.researchPreparation.findUnique({ where: { deliverableId: 'deliverable' } })).toMatchObject({ status: 'PREPARING', attempts: 1 });
    } finally { initialize.mockRestore(); }
  });

  it('does not read, create or queue preparation with the flag off', async () => {
    settings.AGENTIC_CMS_ENABLED = 'false';
    await expect(preparation.prepareReleasedWorkstream(user, 'project', 'week')).rejects.toMatchObject({ status: 404 });
    await expect(preparation.prepare(user, 'project', 'deliverable')).rejects.toMatchObject({ status: 404 });
    await expect(preparation.status(user, 'project', 'deliverable')).rejects.toMatchObject({ status: 404 });
    expect(await db.researchPreparation.count()).toBe(0);
    expect(await db.researchWorkspace.count()).toBe(0);
  });

  it.each([false, true])('releases through the real HTTP handler and database with research enabled=%s', async enabled => {
    settings.AGENTIC_CMS_ENABLED = String(enabled);
    const prisma = db as unknown as PrismaService;
    const flags = new FeatureFlagsService({ get: (key: string) => settings[key] } as ConfigService);
    const notifications = { queueNotification: jest.fn().mockResolvedValue(undefined) };
    const pm = { id: 'pm', email: 'pm@example.test', role: 'PM', active: true };
    jest.mocked(getVerifiedUser).mockResolvedValue(pm.email);
    const module = await Test.createTestingModule({
      controllers: [ProjectsController, ResearchWorkspaceController],
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: { getUserByEmail: jest.fn().mockResolvedValue(pm), isEmailAllowed: jest.fn().mockResolvedValue(true) } },
        { provide: PrismaService, useValue: prisma },
        { provide: FeatureFlagsService, useValue: flags },
        { provide: ProjectsService, useValue: new ProjectsService(prisma, notifications as unknown as NotificationsService) },
        { provide: ResearchWorkspaceService, useValue: service },
        { provide: ResearchPreparationService, useValue: preparation },
        { provide: APP_GUARD, useClass: AgenticCmsGuard },
        { provide: APP_INTERCEPTOR, useClass: ResearchReleaseInterceptor },
      ],
    }).compile();
    const app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    try {
      await db.sprint.update({ where: { id: 'week' }, data: { status: 'DRAFT' } });
      const base = await app.getUrl();
      const response = await fetch(`${base}/projects/project/sprints/week/status`, {
        method: 'PATCH', headers: { authorization: 'Bearer synthetic-token', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'RELEASED' }),
      });
      expect(response.status).toBe(200);
      expect((await db.sprint.findUnique({ where: { id: 'week' } })).status).toBe('RELEASED');
      expect(notifications.queueNotification).toHaveBeenCalled();
      expect(await db.researchWorkspace.count()).toBe(enabled ? 2 : 0);
      expect(await db.researchPreparation.count()).toBe(enabled ? 2 : 0);
      if (enabled) {
        const read = await fetch(`${base}/agentic-cms/research/projects/project/deliverables/deliverable`, { headers: { authorization: 'Bearer synthetic-token' } });
        expect(read.status).toBe(200);
        expect(await read.json()).toMatchObject({ version: 1, document: emptyResearchDocument() });
      }
    } finally { await app.close(); }
  });
});
