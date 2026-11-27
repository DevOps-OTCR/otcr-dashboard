import { INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../../auth/auth.guard';
import { AuthModule } from '../../auth/auth.module';
import { AuthService } from '../../auth/auth.service';
import { getVerifiedUser } from '../../common/utils/verify';
import { PrismaService } from '../../prisma/prisma.service';
import { AgenticCmsModule } from '../agentic-cms.module';
import { ResearchPastDataService } from './research-past-data.service';
import { PastDataRetrievalService } from './past-data-retrieval.service';

jest.mock('../../common/utils/verify', () => ({ getVerifiedUser: jest.fn() }));
const verify = jest.mocked(getVerifiedUser);
const resolve = jest.fn(); const enrolled = jest.fn();
@Module({ providers: [AuthGuard, { provide: AuthService, useValue: { getUserByEmail: resolve, isEmailAllowed: enrolled } }], exports: [AuthGuard, AuthService] })
class TestAuthModule {}

describe('Past-data routes share the existing verified-only Agentic CMS boundary', () => {
  let app: INestApplication; let base: string; let settings: Record<string, string>;
  const calls = { status: jest.fn(), preview: jest.fn(), schedule: jest.fn(), readSource: jest.fn() };
  const ops: { method: string; suffix: string; body?: unknown }[] = [
    { method: 'GET', suffix: '', body: undefined },
    { method: 'POST', suffix: '/preview', body: { focus: 'Budget' } },
    { method: 'POST', suffix: '/generate', body: { expectedVersion: 1, focus: 'Budget' } },
    { method: 'GET', suffix: '/source?kind=note&recordId=note', body: undefined },
  ];
  const request = (op = ops[0], token = 'Bearer verified-token') => fetch(`${base}/agentic-cms/research/projects/project/deliverables/item/past-data${op.suffix}`, {
    method: op.method, headers: { authorization: token, 'content-type': 'application/json' }, body: op.body ? JSON.stringify(op.body) : undefined,
  });
  beforeEach(async () => {
    jest.resetAllMocks(); settings = { AGENTIC_CMS_ENABLED: 'true', AGENTIC_CMS_ALLOWED_EMAILS: 'reader@example.test' };
    verify.mockResolvedValue('reader@example.test'); enrolled.mockResolvedValue(true);
    resolve.mockResolvedValue({ id: 'reader', email: 'reader@example.test', role: 'CONSULTANT', active: true });
    Object.values(calls).forEach(call => call.mockResolvedValue({ ok: true }));
    const module = await Test.createTestingModule({ imports: [AgenticCmsModule, AuthModule] })
      .overrideModule(AuthModule).useModule(TestAuthModule)
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(ResearchPastDataService).useValue(calls)
      .overrideProvider(PastDataRetrievalService).useValue({ readSource: calls.readSource })
      .useMocker(token => token === ConfigService ? { get: (key: string) => settings[key] } : undefined).compile();
    app = module.createNestApplication(); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  });
  afterEach(async () => { await app?.close(); });
  it.each([undefined, 'false', 'TRUE'])('blocks flag %s before identity, retrieval or generation', async flag => {
    settings.AGENTIC_CMS_ENABLED = flag;
    for (const op of ops) expect((await request(op)).status).toBe(404);
    expect(verify).not.toHaveBeenCalled(); Object.values(calls).forEach(call => expect(call).not.toHaveBeenCalled());
  });
  it.each(['Bearer reader@example.test', 'Bearer two tokens', ''])('rejects %s before invoking handlers', async token => {
    for (const op of ops) expect((await request(op, token)).status).toBe(401);
    Object.values(calls).forEach(call => expect(call).not.toHaveBeenCalled());
  });
  it('rejects revoked enrollment and pilot admission', async () => {
    enrolled.mockResolvedValue(false);
    for (const op of ops) expect((await request(op)).status).toBe(401);
    enrolled.mockResolvedValue(true); settings.AGENTIC_CMS_ALLOWED_EMAILS = 'other@example.test';
    for (const op of ops) expect((await request(op)).status).toBe(404);
    Object.values(calls).forEach(call => expect(call).not.toHaveBeenCalled());
  });
  it('accepts verified callers and passes server identity and bounded inputs', async () => {
    for (const op of ops) expect((await request(op)).status).toBe(op.method === 'GET' ? 200 : 201);
    expect(calls.schedule).toHaveBeenCalledWith(expect.objectContaining({ id: 'reader' }), 'project', 'item', 'Budget', 1);
    expect(calls.readSource).toHaveBeenCalledWith(expect.objectContaining({ id: 'reader' }), 'project', 'item', 'note', 'note');
  });
  it('rejects forged identity, invalid source kinds and oversized focus', async () => {
    expect((await request({ ...ops[2], body: { expectedVersion: 1, focus: 'x', authorId: 'other' } })).status).toBe(400);
    expect((await request({ ...ops[1], body: { focus: 'x'.repeat(1001) } })).status).toBe(400);
    expect((await request({ ...ops[3], suffix: '/source?kind=filesystem&recordId=anything' })).status).toBe(400);
    Object.values(calls).forEach(call => expect(call).not.toHaveBeenCalled());
  });
  it('framework route requires verified identity and the enabled flag before reading records', async () => {
    const endpoint = `${base}/agentic-cms/research/projects/project/deliverables/item/framework/generate`;
    settings.AGENTIC_CMS_ENABLED = 'false';
    expect((await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer verified-token', 'content-type': 'application/json' }, body: '{"expectedVersion":1}' })).status).toBe(404);
    settings.AGENTIC_CMS_ENABLED = 'true';
    expect((await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer reader@example.test', 'content-type': 'application/json' }, body: '{"expectedVersion":1}' })).status).toBe(401);
    expect((await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer verified-token', 'content-type': 'application/json' }, body: '{"expectedVersion":1,"authorId":"other"}' })).status).toBe(400);
  });

});
