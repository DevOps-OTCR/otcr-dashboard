import { Controller, Get, INestApplication, Module, Param, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../../auth/auth.guard';
import { AuthModule } from '../../auth/auth.module';
import { AuthService } from '../../auth/auth.service';
import { getVerifiedUser } from '../../common/utils/verify';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { FeatureFlagsModule } from '../../feature-flags/feature-flags.module';
import { CmsReadAccessService, CmsReader } from './cms-read-access.service';

jest.mock('../../common/utils/verify', () => ({ getVerifiedUser: jest.fn() }));
const verify = jest.mocked(getVerifiedUser);
const resolveUser = jest.fn();
const effects = jest.fn();
const prisma = {
  project: { findUnique: jest.fn() },
  deliverable: { findFirst: jest.fn() },
};

@Module({
  providers: [AuthGuard, { provide: AuthService, useValue: { getUserByEmail: resolveUser } }],
  exports: [AuthGuard, AuthService],
})
class TestAuthModule {}

// Test-only routes: Step 2 does not expose a production MCP endpoint.
@Controller('agentic-cms/mcp')
class McpProbeController {
  constructor(private readonly access: CmsReadAccessService) {}
  @Get(':projectId/:deliverableId')
  async read(@Req() request: { user: CmsReader }, @Param('projectId') projectId: string, @Param('deliverableId') deliverableId: string) {
    await this.access.assertDeliverableAccess(request.user, projectId, deliverableId);
    effects();
    return { ok: true };
  }
}
@Controller('agentic-cms')
class SplitMcpProbeController {
  @Get('mcp') read() { effects(); return { ok: true }; }
}
@Controller('agentic-cms/')
class SlashMcpProbeController {
  @Get('/mcp/slashes') read() { effects(); return { ok: true }; }
}
@Controller('ordinary-cms')
@UseGuards(AuthGuard)
class OrdinaryController {
  @Get() read() { return { ok: true }; }
}

describe('MCP HTTP authentication and feature ordering', () => {
  let app: INestApplication;
  let base: string;
  let settings: Record<string, string>;
  beforeEach(async () => {
    jest.resetAllMocks();
    settings = { AGENTIC_CMS_ENABLED: 'true', AGENTIC_CMS_ALLOWED_EMAILS: 'pilot@illinois.edu' };
    verify.mockResolvedValue('pilot@illinois.edu');
    resolveUser.mockResolvedValue({ id: 'reader', email: 'pilot@illinois.edu', role: 'CONSULTANT', active: true });
    prisma.project.findUnique.mockResolvedValue({ id: 'project', pmId: 'other', members: [{ userId: 'reader' }] });
    prisma.deliverable.findFirst.mockResolvedValue({ id: 'item' });
    const module = await Test.createTestingModule({
      imports: [FeatureFlagsModule, PrismaModule, AuthModule],
      controllers: [McpProbeController, SplitMcpProbeController, SlashMcpProbeController, OrdinaryController],
      providers: [CmsReadAccessService],
    }).overrideModule(AuthModule).useModule(TestAuthModule)
      .overrideProvider(PrismaService).useValue(prisma)
      .useMocker(token => token === ConfigService ? { get: (key: string) => settings[key] } : undefined)
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterEach(async () => { await app?.close(); });
  const headers = { authorization: 'Bearer verified-token' };

  it.each([undefined, 'false', 'TRUE', '1'])('blocks flag %s before verification, identity or reads', async flag => {
    settings.AGENTIC_CMS_ENABLED = flag;
    expect((await fetch(`${base}/agentic-cms/mcp/project/item`, { headers })).status).toBe(404);
    expect(verify).not.toHaveBeenCalled();
    expect(resolveUser).not.toHaveBeenCalled();
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expect(effects).not.toHaveBeenCalled();
    expect((await fetch(`${base}/ordinary-cms`, { headers: { authorization: 'Bearer pilot@illinois.edu' } })).status).toBe(200);
  });

  it.each([undefined, 'Bearer pilot@illinois.edu', 'verified-token', 'Basic verified-token', 'Bearer two tokens'])('rejects %s before identity lookup', async authorization => {
    const requestHeaders = authorization ? { authorization } : {};
    expect((await fetch(`${base}/agentic-cms/mcp/project/item`, { headers: requestHeaders })).status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
    expect(resolveUser).not.toHaveBeenCalled();
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expect(effects).not.toHaveBeenCalled();
  });

  it('does not resolve identity when token verification fails', async () => {
    verify.mockRejectedValue(new Error('invalid token'));
    expect((await fetch(`${base}/agentic-cms/mcp/project/item`, { headers })).status).toBe(401);
    expect(resolveUser).not.toHaveBeenCalled();
    expect(effects).not.toHaveBeenCalled();
  });

  it('rejects missing or inactive CMS users', async () => {
    for (const user of [null, { id: 'reader', email: 'pilot@illinois.edu', active: false }]) {
      resolveUser.mockResolvedValue(user);
      expect((await fetch(`${base}/agentic-cms/mcp/project/item`, { headers })).status).toBe(401);
    }
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it('blocks non-pilot users before project reads', async () => {
    settings.AGENTIC_CMS_ALLOWED_EMAILS = 'other@illinois.edu';
    expect((await fetch(`${base}/agentic-cms/mcp/project/item`, { headers })).status).toBe(404);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expect(effects).not.toHaveBeenCalled();
  });

  it('allows a verified member, ignores identity headers, then rechecks lost membership and flag changes', async () => {
    expect((await fetch(`${base}/agentic-cms/mcp/project/item`, { headers: { ...headers, 'x-test-user': 'admin@illinois.edu' } })).status).toBe(200);
    expect(resolveUser).toHaveBeenCalledWith('pilot@illinois.edu');
    expect(verify).toHaveBeenCalledWith('verified-token');
    prisma.project.findUnique.mockResolvedValue({ id: 'project', pmId: 'other', members: [] });
    const denied = await fetch(`${base}/agentic-cms/mcp/project/item`, { headers });
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual({ code: 'NOT_FOUND_OR_FORBIDDEN', message: 'The requested CMS record is unavailable.' });
    settings.AGENTIC_CMS_ENABLED = 'false';
    expect((await fetch(`${base}/agentic-cms/mcp/project/item`, { headers })).status).toBe(404);
    expect(effects).toHaveBeenCalledTimes(1);
  });

  it('enforces verified auth when the MCP path is split across controller and handler', async () => {
    expect((await fetch(`${base}/agentic-cms/mcp`, { headers: { authorization: 'Bearer pilot@illinois.edu' } })).status).toBe(401);
    expect((await fetch(`${base}/agentic-cms/mcp`, { headers })).status).toBe(200);
  });

  it('normalizes decorator slashes before selecting verified authentication', async () => {
    expect((await fetch(`${base}/agentic-cms/mcp/slashes`, { headers: { authorization: 'Bearer pilot@illinois.edu' } })).status).toBe(401);
    expect((await fetch(`${base}/agentic-cms/mcp/slashes`, { headers })).status).toBe(200);
  });

  it('denies an inaccessible child with a generic error before handler effects', async () => {
    prisma.deliverable.findFirst.mockResolvedValue(null);
    expect((await fetch(`${base}/agentic-cms/mcp/project/other-project-item`, { headers })).status).toBe(404);
    expect(effects).not.toHaveBeenCalled();
  });
});
