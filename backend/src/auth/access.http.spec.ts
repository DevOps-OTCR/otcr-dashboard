import { createHttpTestClient, HttpTestClient } from '../common/testing/http-test-client';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { OnboardingController } from './onboarding.controller';
import { PeopleController } from './people.controller';
import { AuthService } from './auth.service';
import { PeopleService } from './people.service';
import { AuthGuard } from './auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { accessFixture, grant, request, user } from './testing/access-fixture';

jest.mock('../common/utils/verify', () => ({ getVerifiedUser: jest.fn(async (token: string) => {
  if (token === 'verified-person') return 'person@illinois.edu';
  if (token === 'verified-admin') return 'admin@illinois.edu';
  throw new Error('Invalid Microsoft token');
}) }));

describe('approval enforcement through Nest HTTP routes', () => {
  const f = accessFixture();
  let app: INestApplication;
  let http: HttpTestClient;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController, PeopleController, OnboardingController],
      providers: [AuthService, PeopleService, AuthGuard, { provide: PrismaService, useValue: f.prisma }],
    }).compile();
    app = module.createNestApplication();
    http = await createHttpTestClient(app);
  });
  beforeEach(() => {
    Object.assign(f.state, { users: [], grants: [], requests: [] });
    jest.clearAllMocks();
  });
  afterAll(async () => { await app?.close(); });
  const get = (path: string, token?: string) => http.fetch(http.baseUrl + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  const mutate = (path: string, method: string, body: unknown, token = 'verified-person') =>
    http.fetch(http.baseUrl + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  test('only the health exception is public', async () => {
    expect((await get('/auth/health')).status).toBe(200);
    for (const path of ['/auth/access-status', '/auth/check-email', '/auth/me', '/auth/role', '/auth/allowed-emails', '/people']) {
      expect((await get(path)).status).toBe(401);
    }
    expect(f.db.user.findMany).not.toHaveBeenCalled();
    expect(f.state.users).toEqual([]);
  });

  test.each(['not_requested', 'pending', 'rejected', 'revoked', 'inactive', 'approved'])('returns only the caller’s %s status while enforcing protected access', async state => {
    const email = 'person@illinois.edu';
    if (state === 'pending' || state === 'rejected') f.state.requests.push(request(email, state === 'pending' ? 'PENDING' : 'REJECTED'));
    if (state === 'revoked' || state === 'inactive' || state === 'approved') {
      f.state.users.push({ ...user(), active: state !== 'inactive' });
      f.state.grants.push({ ...grant(), active: state !== 'revoked' });
    }
    // Neither query parameters nor another person's rows may change this answer.
    f.state.users.push(user('other@illinois.edu', 'ADMIN'));
    f.state.grants.push(grant('other@illinois.edu', 'ADMIN'));
    f.state.requests.push({ ...request('other@illinois.edu', 'REJECTED'), reviewerNotes: 'Private review notes' });
    const response = await get('/auth/access-status?email=other%40illinois.edu&userId=other', 'verified-person');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({ success: true, accessStatus: state, hasCmsAccess: state === 'approved' });
    expect(Object.keys(body).sort()).toEqual(['success', 'accessStatus', 'requestStatus', 'profileActive', 'accessApproved', 'hasCmsAccess', 'role'].sort());
    expect(JSON.stringify(body)).not.toContain('Private');
    expect((await get('/auth/check-email?email=other%40illinois.edu', 'verified-person')).status).toBe(403);
    for (const path of ['/auth/me', '/auth/role', '/auth/allowed-emails']) {
      const protectedResponse = await get(path, 'verified-person');
      expect(protectedResponse.status).toBe(state === 'approved' ? 200 : 403);
      if (state !== 'approved') expect(await protectedResponse.json()).toMatchObject({ code: 'CMS_ACCESS_DENIED', accessStatus: state });
    }
    // Being approved as a consultant still does not confer administrator permissions.
    const people = await get('/people', 'verified-person');
    expect(people.status).toBe(403);
    if (state === 'approved') expect(await people.json()).not.toHaveProperty('code', 'CMS_ACCESS_DENIED');
  });

  test('plain email and invalid bearer headers cannot provision or query status', async () => {
    for (const token of ['person@illinois.edu', 'invalid-token']) {
      expect((await get('/auth/access-status', token)).status).toBe(401);
      expect((await get('/auth/me', token)).status).toBe(401);
    }
    expect(f.db.user.findMany).not.toHaveBeenCalled();
    expect(f.state.users).toEqual([]);
  });

  test('administrator approval enables the requested identity and preserves the selected role', async () => {
    f.state.users.push(user('admin@illinois.edu', 'ADMIN'));
    f.state.grants.push(grant('admin@illinois.edu', 'ADMIN'));
    f.state.requests.push({ ...request(), id: 'synthetic-request' });
    expect((await get('/auth/me', 'verified-person')).status).toBe(403);
    const approval = await mutate('/onboarding/requests/synthetic-request/approve', 'PATCH', { grantedRole: 'PM' }, 'verified-admin');
    expect(approval.status).toBe(200);
    for (let i = 0; i < 2; i++) expect(await (await get('/auth/role', 'verified-person')).json()).toEqual({ success: true, role: 'PM' });
    const people = await get('/people', 'verified-admin');
    expect(people.status).toBe(200);
    expect((await people.json()).people.find((p: { email: string }) => p.email === 'person@illinois.edu'))
      .toMatchObject({ role: 'PM', accessRole: 'PM', accessStatus: 'approved', profileActive: true, hasCmsAccess: true });
    f.state.grants.find(g => g.email === 'person@illinois.edu').active = false;
    expect((await get('/auth/me', 'verified-person')).status).toBe(403);
  });

  test('sync cannot create or relink a different identity', async () => {
    f.state.users.push(user());
    f.state.grants.push(grant());
    const response = await mutate('/auth/sync-user', 'POST', { email: 'other@illinois.edu', googleId: 'forged-provider-id', name: 'Forged Name' });
    expect(response.status).toBe(403);
    expect(f.state.users).toHaveLength(1);
    expect(f.state.users[0].googleId).toBeNull();
  });
});
