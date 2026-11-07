import { Controller, Get, INestApplication, Module, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../../auth/auth.guard';
import { AuthModule } from '../../auth/auth.module';
import { AuthService } from '../../auth/auth.service';
import { getVerifiedUser } from '../../common/utils/verify';
import { PrismaService } from '../../prisma/prisma.service';
import { AgenticCmsModule } from '../agentic-cms.module';

jest.mock('../../common/utils/verify', () => ({ getVerifiedUser: jest.fn() }));
const verify = jest.mocked(getVerifiedUser);
const resolveUser = jest.fn();
const prisma = {
  project: { findUnique: jest.fn(), update: jest.fn() },
  projectContextNote: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
};
@Module({
  providers: [AuthGuard, { provide: AuthService, useValue: { getUserByEmail: resolveUser } }],
  exports: [AuthGuard, AuthService],
})
class TestAuthModule {}
@Controller('ordinary-cms')
@UseGuards(AuthGuard)
class OrdinaryController {
  @Get() read() { return { ok: true }; }
}

const operations = [
  { method: 'GET', suffix: '', body: undefined },
  { method: 'PUT', suffix: '', body: { overview: 'Overview', scope: 'Scope' } },
  { method: 'POST', suffix: '/notes', body: { title: 'Call', content: 'Notes' } },
  { method: 'DELETE', suffix: '/notes/note', body: undefined },
];

describe('Project-context HTTP security', () => {
  let app: INestApplication;
  let base: string;
  let settings: Record<string, string | undefined>;
  let role: string;
  let member: boolean;
  let owner: string;
  const headers = { authorization: 'Bearer verified-token', 'content-type': 'application/json' };
  const request = (op = operations[0], authorization: string | null = headers.authorization, project = 'project') => fetch(
    `${base}/agentic-cms/context/projects/${project}${op.suffix}`,
    { method: op.method, headers: authorization === null ? {} : { ...headers, authorization, 'x-test-user': 'admin@illinois.edu' }, body: op.body ? JSON.stringify(op.body) : undefined },
  );
  const expectNoDataAccess = () => {
    for (const model of Object.values(prisma)) for (const query of Object.values(model)) expect(query).not.toHaveBeenCalled();
  };
  const expectNoWrites = () => {
    expect(prisma.project.update).not.toHaveBeenCalled();
    expect(prisma.projectContextNote.create).not.toHaveBeenCalled();
    expect(prisma.projectContextNote.delete).not.toHaveBeenCalled();
  };
  beforeEach(async () => {
    jest.resetAllMocks();
    settings = { AGENTIC_CMS_ENABLED: 'true', AGENTIC_CMS_ALLOWED_EMAILS: 'pilot@illinois.edu' };
    role = 'PM'; member = true; owner = 'reader';
    verify.mockResolvedValue('pilot@illinois.edu');
    resolveUser.mockImplementation(async () => ({ id: 'reader', email: 'pilot@illinois.edu', role, active: true }));
    prisma.project.findUnique.mockImplementation(async ({ where, select }) => {
      if (select.overview) return { id: where.id, name: 'Synthetic project', overview: 'Overview', scope: 'Scope' };
      return { id: where.id, pmId: where.id === 'project' ? owner : 'other', members: where.id === 'project' && member ? [{ userId: 'reader' }] : [] };
    });
    prisma.project.update.mockResolvedValue({ id: 'project', overview: 'Overview', scope: 'Scope' });
    prisma.projectContextNote.findMany.mockResolvedValue([{ id: 'note', projectId: 'project', title: 'Call', content: 'Notes' }]);
    prisma.projectContextNote.create.mockResolvedValue({ id: 'note', projectId: 'project', title: 'Call', content: 'Notes' });
    prisma.projectContextNote.findFirst.mockResolvedValue({ id: 'note' });
    prisma.projectContextNote.delete.mockResolvedValue({ id: 'note' });
    const module = await Test.createTestingModule({
      imports: [AgenticCmsModule, AuthModule], controllers: [OrdinaryController],
    }).overrideModule(AuthModule).useModule(TestAuthModule)
      .overrideProvider(PrismaService).useValue(prisma)
      .useMocker(token => token === ConfigService ? { get: (key: string) => settings[key] } : undefined)
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterEach(async () => { await app?.close(); });

  it.each([undefined, 'false', 'TRUE', '1'])('blocks flag %s before authentication or data access for all operations', async flag => {
    settings.AGENTIC_CMS_ENABLED = flag;
    for (const op of operations) expect((await request(op)).status).toBe(404);
    expect(verify).not.toHaveBeenCalled(); expect(resolveUser).not.toHaveBeenCalled(); expectNoDataAccess();
    expect((await fetch(`${base}/ordinary-cms`, { headers: { authorization: 'Bearer pilot@illinois.edu' } })).status).toBe(200);
  });
  it.each([null, 'Bearer pilot@illinois.edu', 'verified-token', 'Basic token', 'Bearer two tokens'])('rejects credential %s before identity or data lookup', async credential => {
    for (const op of operations) expect((await request(op, credential)).status).toBe(401);
    expect(verify).not.toHaveBeenCalled(); expect(resolveUser).not.toHaveBeenCalled(); expectNoDataAccess();
  });
  it('rejects failed verification before identity resolution', async () => {
    verify.mockRejectedValue(new Error('Invalid token'));
    for (const op of operations) expect((await request(op)).status).toBe(401);
    expect(resolveUser).not.toHaveBeenCalled(); expectNoDataAccess();
  });
  it('rejects missing and inactive CMS identities', async () => {
    for (const user of [null, { id: 'reader', email: 'pilot@illinois.edu', role: 'ADMIN', active: false }]) {
      resolveUser.mockResolvedValue(user);
      for (const op of operations) expect((await request(op)).status).toBe(401);
    }
    expectNoDataAccess();
  });
  it('denies non-pilot users before data access', async () => {
    settings.AGENTIC_CMS_ALLOWED_EMAILS = 'other@illinois.edu';
    for (const op of operations) expect((await request(op)).status).toBe(404);
    expectNoDataAccess();
  });
  it('allows an authenticated owning PM to read, update, create and delete', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ project: { overview: 'Overview', scope: 'Scope' }, notes: [{ content: 'Notes' }] });
    for (const [index, status] of [[1, 200], [2, 201], [3, 200]]) expect((await request(operations[index])).status).toBe(status);
    expect(verify).toHaveBeenCalledWith('verified-token');
    expect(resolveUser).toHaveBeenCalledWith('pilot@illinois.edu');
    expect(prisma.projectContextNote.delete).toHaveBeenCalledWith({ where: { id: 'note', projectId: 'project' } });
  });
  it.each(['CONSULTANT', 'PARTNER', 'EXECUTIVE'])('allows member %s to read but denies writes', async userRole => {
    role = userRole; owner = 'other';
    expect((await request()).status).toBe(200);
    for (const op of operations.slice(1)) expect((await request(op)).status).toBe(404);
    expectNoWrites();
  });
  it.each(['ADMIN', 'LC'])('allows %s writes with required project access', async userRole => {
    role = userRole; owner = 'other'; member = userRole !== 'ADMIN';
    for (const op of operations.slice(1)) expect((await request(op)).status).toBe(op.method === 'POST' ? 201 : 200);
  });
  it.each(['LC', 'PM', 'CONSULTANT', 'PARTNER', 'EXECUTIVE'])('denies nonmember %s access to another project', async userRole => {
    role = userRole;
    for (const op of operations) expect((await request(op, headers.authorization, 'other-project')).status).toBe(404);
    expect(prisma.projectContextNote.findMany).not.toHaveBeenCalled(); expectNoWrites();
  });
  it('denies a PM member who does not own the project from editing', async () => {
    owner = 'other';
    expect((await request()).status).toBe(200);
    for (const op of operations.slice(1)) expect((await request(op)).status).toBe(404);
    expectNoWrites();
  });
  it('does not delete a note belonging to another project', async () => {
    prisma.projectContextNote.findFirst.mockResolvedValue(null);
    const response = await request(operations[3]);
    expect(await response.json()).toEqual({ deleted: false });
    expect(prisma.projectContextNote.findFirst).toHaveBeenCalledWith({ where: { id: 'note', projectId: 'project' }, select: { id: true } });
    expectNoWrites();
  });
  it.each([1, 2])('blocks operation %s if the feature is disabled during authorization', async index => {
    prisma.project.findUnique.mockImplementation(async () => {
      settings.AGENTIC_CMS_ENABLED = 'false';
      return { id: 'project', pmId: 'reader', members: [{ userId: 'reader' }] };
    });
    expect((await request(operations[index])).status).toBe(404); expectNoWrites();
  });
  it('rechecks pilot admission immediately before deleting after a note lookup', async () => {
    prisma.projectContextNote.findFirst.mockImplementation(async () => {
      settings.AGENTIC_CMS_ALLOWED_EMAILS = 'other@illinois.edu'; return { id: 'note' };
    });
    expect((await request(operations[3])).status).toBe(404); expectNoWrites();
  });
  it('does not return context if the feature is disabled while fetching it', async () => {
    prisma.projectContextNote.findMany.mockImplementation(async () => {
      settings.AGENTIC_CMS_ENABLED = 'false'; return [{ content: 'Private synthetic notes' }];
    });
    const response = await request();
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('Private synthetic notes');
  });
});
