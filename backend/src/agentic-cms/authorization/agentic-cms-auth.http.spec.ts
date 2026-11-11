import { Controller, Get, INestApplication, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../../auth/auth.guard';
import { AuthModule } from '../../auth/auth.module';
import { getVerifiedUser } from '../../common/utils/verify';
import { PrismaService } from '../../prisma/prisma.service';
import { AgenticCmsModule } from '../agentic-cms.module';

// Only Microsoft Graph verification is mocked. The real global AgenticCmsGuard,
// AuthGuard and AuthService run against an in-memory stand-in for Prisma.
jest.mock('../../common/utils/verify', () => ({ getVerifiedUser: jest.fn() }));
const verify = jest.mocked(getVerifiedUser);
const handled = jest.fn();

type UserRow = { id: string; email: string; role: string; active: boolean; firstName: string | null; lastName: string | null };
type AllowedRow = { email: string; role: string; active: boolean };
let users: UserRow[];
let allowed: AllowedRow[];
const matches = (value: string, where: string | { equals?: string; mode?: string } | undefined) => typeof where === 'string'
  ? value === where
  : where?.mode === 'insensitive' ? value.toLowerCase() === String(where.equals).toLowerCase() : value === where?.equals;
const prisma = {
  user: {
    findUnique: jest.fn(async ({ where }) => users.find(u => (where.email ? u.email === where.email : u.id === where.id)) ?? null),
    create: jest.fn(async ({ data }) => { const row = { id: `u${users.length + 1}`, active: true, firstName: null, lastName: null, ...data }; users.push(row); return row; }),
    update: jest.fn(async ({ where, data }) => Object.assign(users.find(u => u.id === where.id)!, data)),
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
  allowedEmail: {
    findFirst: jest.fn(async ({ where }) => allowed.find(a => matches(a.email, where.email) && (where.active === undefined || a.active === where.active)) ?? null),
  },
  onboardingRequest: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null) },
};

// Test-only stand-in for #176's chat routes so the route-wide rule is proven first.
@Controller('agentic-cms/chat')
class ChatProbeController {
  @Post() send(@Req() req: { user: { email: string } }) { handled(req.user.email); return { ok: true }; }
  @Get('status') status(@Req() req: { user: { email: string } }) { handled(req.user.email); return { ok: true }; }
}
@Controller('ordinary-cms')
@UseGuards(AuthGuard)
class OrdinaryController {
  @Get() read() { return { ok: true }; }
}

describe('Agentic CMS route-wide verified authentication (real AuthGuard)', () => {
  let app: INestApplication;
  let base: string;
  let settings: Record<string, string | undefined>;
  const bearer = { authorization: 'Bearer verified-token' };
  const routes = [
    { method: 'POST', path: '/agentic-cms/chat', ok: 201 },
    { method: 'GET', path: '/agentic-cms/chat/status', ok: 200 },
    { method: 'GET', path: '/agentic-cms/status', ok: 200 },
  ];
  const call = (route: (typeof routes)[number], headers: Record<string, string> = bearer) =>
    fetch(`${base}${route.path}`, { method: route.method, headers });
  const expectAll = async (status: number, headers?: Record<string, string>) => {
    for (const route of routes) expect((await call(route, headers)).status).toBe(status);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    settings = { AGENTIC_CMS_ENABLED: 'true', AGENTIC_CMS_ALLOWED_EMAILS: 'pilot@illinois.edu' };
    users = [{ id: 'pilot', email: 'pilot@illinois.edu', role: 'PM', active: true, firstName: 'Pilot', lastName: 'User' }];
    allowed = [{ email: 'pilot@illinois.edu', role: 'PM', active: true }];
    verify.mockResolvedValue('pilot@illinois.edu');
    const module = await Test.createTestingModule({
      imports: [AgenticCmsModule, AuthModule], controllers: [ChatProbeController, OrdinaryController],
    }).overrideProvider(PrismaService).useValue(prisma)
      .useMocker(token => token === ConfigService ? { get: (key: string) => settings[key] } : undefined)
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterEach(async () => { await app?.close(); });

  it.each([undefined, 'false', 'TRUE'])('rejects flag %s before verification, identity or handler work', async flag => {
    settings.AGENTIC_CMS_ENABLED = flag;
    await expectAll(404);
    expect(verify).not.toHaveBeenCalled();
    for (const model of Object.values(prisma)) for (const query of Object.values(model)) expect(query).not.toHaveBeenCalled();
    expect(handled).not.toHaveBeenCalled();
    // Existing consulting routes keep their legacy sign-in with the feature off.
    expect((await fetch(`${base}/ordinary-cms`, { headers: { authorization: 'Bearer pilot@illinois.edu' } })).status).toBe(200);
  });

  it.each([
    ['missing', undefined], ['email-only', 'Bearer pilot@illinois.edu'], ['non-bearer', 'Basic verified-token'], ['malformed', 'Bearer two tokens'],
  ])('rejects %s credentials before Graph verification', async (_label, authorization) => {
    await expectAll(401, authorization ? { authorization } : {});
    expect(verify).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(handled).not.toHaveBeenCalled();
  });

  it('rejects invalid Graph tokens before identity lookup', async () => {
    verify.mockRejectedValue(new Error('Unauthorized: Invalid or Expired Token'));
    await expectAll(401);
    expect(prisma.allowedEmail.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(handled).not.toHaveBeenCalled();
  });

  it('rejects a verified but unenrolled identity without creating a CMS user', async () => {
    verify.mockResolvedValue('stranger@illinois.edu');
    settings.AGENTIC_CMS_ALLOWED_EMAILS = '';
    await expectAll(401);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(users.map(u => u.email)).toEqual(['pilot@illinois.edu']);
    expect(handled).not.toHaveBeenCalled();
  });

  it('rejects revoked enrollment and inactive users', async () => {
    allowed[0].active = false;
    await expectAll(401);
    allowed[0].active = true;
    users[0].active = false;
    await expectAll(401);
    expect(handled).not.toHaveBeenCalled();
  });

  it('applies the pilot allowlist after authentication', async () => {
    settings.AGENTIC_CMS_ALLOWED_EMAILS = 'other@illinois.edu';
    await expectAll(404);
    expect(verify).toHaveBeenCalledWith('verified-token');
    expect(handled).not.toHaveBeenCalled();
  });

  it('accepts an enrolled, active, pilot user and ignores identity headers', async () => {
    for (const route of routes) {
      expect((await call(route, { ...bearer, 'x-test-user': 'admin@illinois.edu' })).status).toBe(route.ok);
    }
    expect(handled.mock.calls).toEqual([['pilot@illinois.edu'], ['pilot@illinois.edu']]);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
