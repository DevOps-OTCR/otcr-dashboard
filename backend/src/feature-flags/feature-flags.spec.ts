import { Controller, Get, INestApplication, Module, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../auth/auth.guard';
import { AuthModule } from '../auth/auth.module';
import { AgenticCmsModule } from '../agentic-cms/agentic-cms.module';
import { FeatureFlagsService } from './feature-flags.service';
import { PrismaService } from '../prisma/prisma.service';

const effects = jest.fn();
@Controller('agentic-cms/test')
class AgenticTestController {
  @Post() run() { effects(); return { ok: true }; }
}
@Controller('ordinary-cms')
class OrdinaryController {
  @Get() get() { return { ok: true }; }
}
const auth = {
  canActivate: jest.fn(context => {
    const request = context.switchToHttp().getRequest();
    const email = request.headers['x-test-user'];
    if (!email) return false;
    request.user = { email };
    return true;
  }),
};
@Module({ providers: [{ provide: AuthGuard, useValue: auth }], exports: [AuthGuard] })
class TestAuthModule {}

describe('Agentic CMS feature boundary', () => {
  let app: INestApplication;
  let base: string;
  let settings: Record<string, string>;
  beforeEach(async () => {
    settings = {};
    effects.mockClear();
    auth.canActivate.mockClear();
    const module = await Test.createTestingModule({
      imports: [AgenticCmsModule],
      controllers: [AgenticTestController, OrdinaryController],
    }).overrideModule(AuthModule).useModule(TestAuthModule)
      .overrideProvider(PrismaService).useValue({})
      .overrideGuard(AuthGuard).useValue(auth)
      .useMocker(token => token === ConfigService ? { get: (key: string) => settings[key] } : undefined)
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterEach(async () => { await app?.close(); });

  it.each([undefined, 'false', 'TRUE', '1', 'invalid'])('keeps routes and side effects off for %s', async value => {
    if (value !== undefined) settings.AGENTIC_CMS_ENABLED = value;
    expect((await fetch(`${base}/agentic-cms/status`)).status).toBe(404);
    expect((await fetch(`${base}/agentic-cms/test`, { method: 'POST' })).status).toBe(404);
    expect(effects).not.toHaveBeenCalled();
    expect(auth.canActivate).not.toHaveBeenCalled();
    expect((await fetch(`${base}/ordinary-cms`)).status).toBe(200);
  });

  it('requires authentication even when enabled', async () => {
    settings.AGENTIC_CMS_ENABLED = 'true';
    expect((await fetch(`${base}/agentic-cms/status`)).status).toBe(401);
    expect((await fetch(`${base}/feature-flags`)).status).toBe(403);
  });

  it('limits the pilot and returns only the current user flag', async () => {
    settings.AGENTIC_CMS_ENABLED = 'true';
    settings.AGENTIC_CMS_ALLOWED_EMAILS = ' Pilot@Example.test, second@example.test ';
    const headers = { 'x-test-user': 'pilot@example.test' };
    const flags = await fetch(`${base}/feature-flags`, { headers });
    expect(flags.headers.get('cache-control')).toBe('no-store');
    expect(await flags.json()).toEqual({ agenticCms: true });
    expect((await fetch(`${base}/agentic-cms/status`, { headers })).status).toBe(200);
    const other = { 'x-test-user': 'other@example.test' };
    expect(await (await fetch(`${base}/feature-flags`, { headers: other })).json()).toEqual({ agenticCms: false });
    expect((await fetch(`${base}/agentic-cms/test`, { method: 'POST', headers: other })).status).toBe(404);
    expect(effects).not.toHaveBeenCalled();
  });

  it('enables authenticated users with no allowlist and disables existing endpoints immediately', async () => {
    settings.AGENTIC_CMS_ENABLED = 'true';
    const headers = { 'x-test-user': 'pilot@example.test' };
    expect((await fetch(`${base}/agentic-cms/test`, { method: 'POST', headers })).status).toBe(201);
    expect(effects).toHaveBeenCalledTimes(1);
    settings.AGENTIC_CMS_ENABLED = 'false';
    expect((await fetch(`${base}/agentic-cms/test`, { method: 'POST', headers })).status).toBe(404);
    expect(effects).toHaveBeenCalledTimes(1);
    expect(await (await fetch(`${base}/feature-flags`, { headers })).json()).toEqual({ agenticCms: false });
  });

  it('provides the same fail-closed check for workers and rejects an unusable allowlist', () => {
    const flags = app.get(FeatureFlagsService);
    expect(() => flags.assertAgenticCmsEnabledFor('pilot@example.test')).toThrow();
    settings.AGENTIC_CMS_ENABLED = 'true';
    settings.AGENTIC_CMS_ALLOWED_EMAILS = ', ,';
    expect(() => flags.assertAgenticCmsEnabledFor('pilot@example.test')).toThrow();
    settings.AGENTIC_CMS_ALLOWED_EMAILS = 'pilot@example.test';
    expect(() => flags.assertAgenticCmsEnabledFor('pilot@example.test')).not.toThrow();
    expect(() => flags.assertAgenticCmsEnabledFor()).toThrow();
  });
});
