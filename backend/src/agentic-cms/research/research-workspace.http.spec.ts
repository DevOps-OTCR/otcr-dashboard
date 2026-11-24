import { Controller, Get, INestApplication, Module, NotFoundException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../../auth/auth.guard';
import { AuthModule } from '../../auth/auth.module';
import { AuthService } from '../../auth/auth.service';
import { getVerifiedUser } from '../../common/utils/verify';
import { PrismaService } from '../../prisma/prisma.service';
import { AgenticCmsModule } from '../agentic-cms.module';
import { ResearchDocumentAdapter } from './research-document.adapter';
import { emptyResearchDocument } from './research.schemas';

jest.mock('../../common/utils/verify', () => ({ getVerifiedUser: jest.fn() }));
const verify = jest.mocked(getVerifiedUser);
const resolveUser = jest.fn();
const isEmailAllowed = jest.fn();

@Module({
  providers: [AuthGuard, { provide: AuthService, useValue: { getUserByEmail: resolveUser, isEmailAllowed } }],
  exports: [AuthGuard, AuthService],
})
class TestAuthModule {}

@Controller('ordinary-research-test')
@UseGuards(AuthGuard)
class OrdinaryController {
  @Get() read() { return { ok: true }; }
}

type Operation = { method: string; suffix: string; body?: unknown };
const operations: Operation[] = [
  { method: 'POST', suffix: '', body: undefined },
  { method: 'GET', suffix: '', body: undefined },
  { method: 'PUT', suffix: '', body: { expectedVersion: 1, document: emptyResearchDocument() } },
  { method: 'PATCH', suffix: '/sections/findings', body: { expectedVersion: 1, content: 'A finding' } },
  { method: 'GET', suffix: '/revisions', body: undefined },
  { method: 'POST', suffix: '/restore', body: { expectedVersion: 1, targetVersion: 1 } },
  { method: 'GET', suffix: '/preparation', body: undefined },
  { method: 'POST', suffix: '/preparation/retry', body: undefined },
];

describe('Research HTTP boundary and permissions', () => {
  let app: INestApplication;
  let base: string;
  let settings: Record<string, string>;
  let role: string;
  let member: boolean;
  let assigned: boolean;
  let legacyAssigned: boolean;
  let owner: string;
  let released: boolean;
  const prisma = {
    project: { findUnique: jest.fn() }, deliverable: { findFirst: jest.fn() },
    researchPreparation: { findUnique: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
    researchWorkspace: { findUnique: jest.fn() },
  };
  const documents = { initialize: jest.fn(), read: jest.fn(), revise: jest.fn(), history: jest.fn() };
  const request = (op = operations[1], token = 'Bearer verified-token', projectId = 'project', deliverableId = 'deliverable') => fetch(
    `${base}/agentic-cms/research/projects/${projectId}/deliverables/${deliverableId}${op.suffix}`,
    { method: op.method, headers: { authorization: token, 'content-type': 'application/json' }, body: op.body === undefined ? undefined : JSON.stringify(op.body) },
  );
  const expectNoDocuments = () => Object.values(documents).forEach(mock => expect(mock).not.toHaveBeenCalled());

  beforeEach(async () => {
    jest.resetAllMocks();
    settings = { AGENTIC_CMS_ENABLED: 'true', AGENTIC_CMS_ALLOWED_EMAILS: 'pilot@illinois.edu' };
    role = 'CONSULTANT'; member = true; assigned = true; legacyAssigned = false; owner = 'pm'; released = true;
    verify.mockResolvedValue('pilot@illinois.edu');
    isEmailAllowed.mockResolvedValue(true);
    resolveUser.mockImplementation(async () => ({ id: 'reader', email: 'pilot@illinois.edu', role, active: true }));
    prisma.project.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id, pmId: owner,
      members: member && where.id === 'project' ? [{ userId: 'reader' }] : [],
    }));
    prisma.deliverable.findFirst.mockImplementation(async ({ where, select }) => {
      if (select.sprint) return { sprint: { projectId: 'project', status: released ? 'RELEASED' : 'DRAFT' } };
      const [scope, filter] = where.AND;
      if (filter.id !== 'deliverable' || scope.projectId !== 'project' || (scope.sprint && !released)) return null;
      return { assigneeId: legacyAssigned ? 'reader' : null, assignments: assigned ? [{ userId: 'reader' }] : [], project: { pmId: owner } };
    });
    const workspace = { id: 'workspace', deliverableId: 'deliverable', version: 1, document: emptyResearchDocument() };
    documents.initialize.mockImplementation(async (_id, context) => { await context.assertWrite(); return workspace; });
    documents.read.mockResolvedValue(workspace);
    documents.revise.mockImplementation(async (_id, _input, context) => { await context.assertWrite(); return { ...workspace, version: 2 }; });
    documents.history.mockResolvedValue({ items: [], nextBeforeVersion: null });
    prisma.researchPreparation.findUnique.mockResolvedValue(null);
    prisma.researchWorkspace.findUnique.mockResolvedValue(null);
    prisma.researchPreparation.createMany.mockResolvedValue({ count: 1 });
    prisma.researchPreparation.updateMany.mockResolvedValue({ count: 1 });
    const module = await Test.createTestingModule({ imports: [AgenticCmsModule, AuthModule], controllers: [OrdinaryController] })
      .overrideModule(AuthModule).useModule(TestAuthModule)
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(ResearchDocumentAdapter).useValue(documents)
      .useMocker(token => token === ConfigService ? { get: (key: string) => settings[key] } : undefined)
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterEach(async () => { await app?.close(); });

  it.each([undefined, 'false', 'TRUE'])('blocks flag %s before auth or research reads/writes; ordinary CMS still works', async flag => {
    settings.AGENTIC_CMS_ENABLED = flag;
    for (const op of operations) expect((await request(op)).status).toBe(404);
    expect(verify).not.toHaveBeenCalled();
    expect(resolveUser).not.toHaveBeenCalled();
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expectNoDocuments();
    expect((await fetch(`${base}/ordinary-research-test`, { headers: { authorization: 'Bearer pilot@illinois.edu' } })).status).toBe(200);
  });

  it.each(['Bearer pilot@illinois.edu', 'Basic token', 'Bearer two tokens', ''])('rejects malformed/email-only credential %s', async credential => {
    for (const op of operations) expect((await request(op, credential)).status).toBe(401);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expectNoDocuments();
  });

  it('denies unenrolled, inactive, invalid-token and non-pilot identities before research access', async () => {
    isEmailAllowed.mockResolvedValue(false);
    for (const op of operations) expect((await request(op)).status).toBe(401);
    isEmailAllowed.mockResolvedValue(true);
    resolveUser.mockResolvedValue({ id: 'reader', email: 'pilot@illinois.edu', role, active: false });
    for (const op of operations) expect((await request(op)).status).toBe(401);
    resolveUser.mockResolvedValue({ id: 'reader', email: 'pilot@illinois.edu', role, active: true });
    verify.mockRejectedValue(new Error('Invalid token'));
    for (const op of operations) expect((await request(op)).status).toBe(401);
    verify.mockResolvedValue('pilot@illinois.edu');
    settings.AGENTIC_CMS_ALLOWED_EMAILS = 'other@illinois.edu';
    for (const op of operations) expect((await request(op)).status).toBe(404);
    expectNoDocuments();
  });

  it('allows assigned consultants to initialize, read, save, target a section, list history and restore', async () => {
    for (const op of operations) expect((await request(op)).status).toBe(op.method === 'POST' ? 201 : 200);
    expect(await (await request()).json()).toMatchObject({ canEdit: true, storage: 'cms', version: 1 });
  });

  it('preserves legacy assignee editing', async () => {
    assigned = false; legacyAssigned = true;
    expect((await request(operations[2])).status).toBe(200);
  });

  it('reports initialization permission only after authorized reads and rechecks access', async () => {
    documents.read.mockRejectedValue(new NotFoundException({ code: 'WORKSPACE_NOT_INITIALIZED' }));
    expect(await (await request()).json()).toMatchObject({ code: 'WORKSPACE_NOT_INITIALIZED', canEdit: true });
    assigned = false;
    expect(await (await request()).json()).toMatchObject({ code: 'WORKSPACE_NOT_INITIALIZED', canEdit: false });
    documents.read.mockImplementation(async () => {
      member = false;
      throw new NotFoundException({ code: 'WORKSPACE_NOT_INITIALIZED' });
    });
    const response = await request();
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND_OR_FORBIDDEN' });
  });

  it.each(['CONSULTANT', 'PARTNER', 'EXECUTIVE', 'PM'])('keeps unassigned/nonowning member %s read-only', async userRole => {
    role = userRole; assigned = false;
    expect(await (await request()).json()).toMatchObject({ canEdit: false });
    for (const op of operations.filter(op => op.method !== 'GET')) expect((await request(op)).status).toBe(404);
    expect(documents.initialize).not.toHaveBeenCalled();
    expect(documents.revise).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'LC', 'PM'])('preserves authorized manager %s editing', async userRole => {
    role = userRole; assigned = false; owner = userRole === 'PM' ? 'reader' : 'other';
    member = userRole !== 'ADMIN';
    expect((await request(operations[2])).status).toBe(200);
  });

  it('does not let assignment bypass lost membership, cross-project access or hidden drafts', async () => {
    member = false;
    for (const op of operations) expect((await request(op)).status).toBe(404);
    member = true;
    for (const op of operations) expect((await request(op, 'Bearer verified-token', 'other')).status).toBe(404);
    for (const op of operations) expect((await request(op, 'Bearer verified-token', 'project', 'other-deliverable')).status).toBe(404);
    released = false;
    for (const op of operations) expect((await request(op)).status).toBe(404);
    expectNoDocuments();
  });

  it('rechecks flag and assignment immediately before writes', async () => {
    documents.read.mockImplementation(async () => {
      assigned = false;
      return { version: 1, document: emptyResearchDocument() };
    });
    expect((await request(operations[3])).status).toBe(404);
    documents.read.mockImplementation(async () => {
      settings.AGENTIC_CMS_ENABLED = 'false';
      return { version: 1, document: emptyResearchDocument() };
    });
    assigned = true;
    expect((await request(operations[3])).status).toBe(404);
  });

  it('does not return private content after membership is revoked during a read', async () => {
    documents.read.mockImplementation(async () => { member = false; return { document: { private: 'secret' } }; });
    const response = await request();
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('secret');
  });

  it('rejects invalid data, stale section edits and unknown sections without a write', async () => {
    const invalidBodies = [
      { document: emptyResearchDocument() },
      { expectedVersion: 0, document: emptyResearchDocument() },
      { expectedVersion: 1, document: { ...emptyResearchDocument(), sections: [] } },
      { expectedVersion: 1, document: emptyResearchDocument(), authorId: 'someone-else' },
    ];
    for (const body of invalidBodies) expect((await request({ ...operations[2], body })).status).toBe(400);
    expect((await request({ ...operations[3], body: { expectedVersion: 2, content: 'Stale' } })).status).toBe(409);
    expect((await request({ ...operations[3], suffix: '/sections/missing' })).status).toBe(404);
    expect((await request({ ...operations[4], suffix: '/revisions?limit=500' })).status).toBe(400);
    expect(documents.revise).not.toHaveBeenCalled();
  });
});
