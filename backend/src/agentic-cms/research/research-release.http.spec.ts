import { INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../../auth/auth.guard';
import { AuthModule } from '../../auth/auth.module';
import { AuthService } from '../../auth/auth.service';
import { getVerifiedUser } from '../../common/utils/verify';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectsService } from '../../projects/projects.service';
import { AgenticCmsModule } from '../agentic-cms.module';
import { ResearchPreparationService } from './research-preparation.service';

jest.mock('../../common/utils/verify', () => ({ getVerifiedUser: jest.fn() }));
const verify = jest.mocked(getVerifiedUser);
const resolveUser = jest.fn();
const isEmailAllowed = jest.fn();
@Module({
  providers: [AuthGuard, { provide: AuthService, useValue: { getUserByEmail: resolveUser, isEmailAllowed } }],
  exports: [AuthGuard, AuthService],
})
class TestAuthModule {}

describe('Existing release endpoint with gated research hook', () => {
  let app: INestApplication;
  let base: string;
  let settings: Record<string, string>;
  let user: { id: string; email: string; role: string; active: boolean };
  const projects = { findOne: jest.fn(), updateSprintStatus: jest.fn() };
  const prepare = jest.fn();
  const prisma = { project: { findUnique: jest.fn() }, researchWorkspace: { findUnique: jest.fn() } };
  const request = (status = 'RELEASED', authorization = 'Bearer verified-token') => fetch(`${base}/projects/project/sprints/week/status`, {
    method: 'PATCH', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ status }),
  });
  beforeEach(async () => {
    jest.resetAllMocks();
    settings = { AGENTIC_CMS_ENABLED: 'true', AGENTIC_CMS_ALLOWED_EMAILS: 'pm@example.test' };
    user = { id: 'pm', email: 'pm@example.test', role: 'PM', active: true };
    verify.mockResolvedValue(user.email);
    resolveUser.mockImplementation(async () => user);
    isEmailAllowed.mockResolvedValue(true);
    projects.findOne.mockResolvedValue({ id: 'project', pmId: 'pm' });
    projects.updateSprintStatus.mockImplementation(async (_project, _week, status) => ({ id: 'week', status }));
    prepare.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({ imports: [AgenticCmsModule, AuthModule] })
      .overrideModule(AuthModule).useModule(TestAuthModule)
      .overrideProvider(ProjectsService).useValue(projects)
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(ResearchPreparationService).useValue({ prepareReleasedWorkstream: prepare })
      .useMocker(token => token === ConfigService ? { get: (key: string) => settings[key] } : undefined)
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  });
  afterEach(async () => { await app?.close(); });

  it('prepares the released workstream using the verified enrolled identity after release succeeds', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'week', status: 'RELEASED' });
    expect(prepare).toHaveBeenCalledWith(user, 'project', 'week');
    expect(projects.updateSprintStatus.mock.invocationCallOrder[0]).toBeLessThan(prepare.mock.invocationCallOrder[0]);
    expect(isEmailAllowed).toHaveBeenCalledWith(user.email);
  });

  it.each([undefined, 'false', 'TRUE'])('keeps ordinary release successful for flag %s without research data access or enrollment checks', async flag => {
    settings.AGENTIC_CMS_ENABLED = flag;
    expect((await request()).status).toBe(200);
    expect(projects.updateSprintStatus).toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(isEmailAllowed).not.toHaveBeenCalled();
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expect(prisma.researchWorkspace.findUnique).not.toHaveBeenCalled();
  });

  it('does not let a legacy email credential start research, while preserving ordinary CMS release', async () => {
    expect((await request('RELEASED', 'Bearer pm@example.test')).status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
    expect(isEmailAllowed).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('denies research for revoked enrollment, inactive users and non-pilot callers', async () => {
    isEmailAllowed.mockResolvedValue(false);
    expect((await request()).status).toBe(200);
    isEmailAllowed.mockResolvedValue(true); user.active = false;
    expect((await request()).status).toBe(200);
    user.active = true; settings.AGENTIC_CMS_ALLOWED_EMAILS = 'other@example.test';
    expect((await request()).status).toBe(200);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('leaves release successful if preparation fails', async () => {
    prepare.mockRejectedValue(new Error('Synthetic storage outage'));
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'week', status: 'RELEASED' });
  });

  it('does not prepare on draft changes, invalid requests, role denial or failed releases', async () => {
    expect((await request('DRAFT')).status).toBe(200);
    expect((await request('INVALID')).status).toBe(400);
    user.role = 'CONSULTANT';
    expect((await request()).status).toBe(403);
    user.role = 'PM';
    projects.updateSprintStatus.mockRejectedValue(new Error('Synthetic release failure'));
    expect((await request()).status).toBe(500);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('rechecks pilot access after verified authentication', async () => {
    isEmailAllowed.mockImplementation(async () => { settings.AGENTIC_CMS_ENABLED = 'false'; return true; });
    expect((await request()).status).toBe(200);
    expect(prepare).not.toHaveBeenCalled();
  });
});
