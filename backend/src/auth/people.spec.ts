import { BadRequestException, ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { OnboardingController } from './onboarding.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

jest.mock('../common/utils/verify', () => ({ getVerifiedUser: async (token: string) => `${token}@example.test` }));

describe('People and onboarding HTTP authorization', () => {
  let app: INestApplication;
  let url: string;
  const people = { list: jest.fn().mockResolvedValue([]), changeRole: jest.fn().mockResolvedValue({}) };
  const auth = {
    getUserByEmail: async (email: string) => ({ id: email, role: email.split('@')[0] }),
    listOnboardingRequests: jest.fn().mockResolvedValue([]), approveOnboardingRequest: jest.fn().mockResolvedValue({}),
    rejectOnboardingRequest: jest.fn().mockResolvedValue({}),
  };
  const routes = [
    ['GET', '/people'], ['PATCH', '/people/person/role'], ['GET', '/onboarding/requests'],
    ['PATCH', '/onboarding/requests/request/approve'], ['PATCH', '/onboarding/requests/request/reject'],
  ];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [PeopleController, OnboardingController],
      providers: [AuthGuard, { provide: PeopleService, useValue: people }, { provide: AuthService, useValue: auth }],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1'); url = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  test.each(['CONSULTANT', 'LC', 'PM', 'PARTNER', 'EXECUTIVE', ''])('denies all management routes for %s', async role => {
    jest.clearAllMocks();
    for (const [method, path] of routes) {
      const response = await fetch(url + path, { method,
        headers: { ...(role ? { Authorization: `Bearer ${role}` } : {}), 'Content-Type': 'application/json' },
        ...(method === 'PATCH' ? { body: JSON.stringify({ role: 'ADMIN', grantedRole: 'ADMIN' }) } : {}),
      });
      expect(response.status).toBe(403);
    }
    for (const fn of [people.list, people.changeRole, auth.listOnboardingRequests, auth.approveOnboardingRequest, auth.rejectOnboardingRequest]) expect(fn).not.toHaveBeenCalled();
  });
  test('permits Admin access', async () => {
    for (const [method, path] of routes) {
      const response = await fetch(url + path, { method, headers: { Authorization: 'Bearer ADMIN', 'Content-Type': 'application/json' },
        ...(method === 'PATCH' ? { body: JSON.stringify({ role: 'PM', grantedRole: 'LC', notes: 'Reviewed' }) } : {}),
      });
      expect(response.status).toBe(200);
    }
    expect(auth.approveOnboardingRequest).toHaveBeenCalledWith('request', 'ADMIN@example.test', 'Reviewed', 'LC');
  });
});

function statefulFixture() {
  let person = { id: 'person', email: 'person@example.test', role: 'CONSULTANT' as Role, active: true, firstName: 'Casey', lastName: 'Test' };
  let access = { email: person.email, role: 'CONSULTANT' as Role, active: true };
  const user = {
    findUnique: jest.fn().mockImplementation(async () => ({ ...person })),
    update: jest.fn().mockImplementation(async ({ data }) => { person = { ...person, ...data }; return { ...person }; }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }), upsert: jest.fn().mockResolvedValue({}),
  };
  const allowedEmail = {
    updateMany: jest.fn().mockImplementation(async ({ data }) => { access = { ...access, ...data }; return { count: 1 }; }),
    create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockImplementation(async () => access),
  };
  const request = { id: 'request', email: person.email, name: 'Casey Test', requestedRole: 'CONSULTANT', status: 'PENDING' };
  const onboardingRequest = { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(request),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
  const tx = { user, allowedEmail, onboardingRequest };
  const prisma = { ...tx, $transaction: jest.fn().mockImplementation(action => action(tx)) };
  return { prisma, tx, request, people: new PeopleService(prisma as unknown as PrismaService), auth: new AuthService(prisma as unknown as PrismaService) };
}

describe('People directory and persistent role changes', () => {
  test('includes inactive users and deduplicates managed projects and active memberships', async () => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([{ id: 'p', active: false, role: 'PM',
      projectAssignments: [{ project: { id: 'a', name: 'Alpha' } }],
      pmProjects: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }],
    }]) } };
    const result = await new PeopleService(prisma as unknown as PrismaService).list();
    expect(result[0].teams).toEqual([{ id: 'a', name: 'Alpha', manages: true }, { id: 'b', name: 'Beta', manages: true }]);
    expect(result[0].active).toBe(false);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({
      projectAssignments: { where: { leftAt: null }, select: { project: { select: { id: true, name: true } } } },
    }) }));
  });
  test.each(['ADMIN', 'PM', 'LC', 'PARTNER', 'EXECUTIVE', 'CONSULTANT'])('keeps %s after subsequent sign-ins', async role => {
    const f = statefulFixture();
    await f.people.changeRole('person', role);
    expect((await f.auth.getUserByEmail('PERSON@example.test')).role).toBe(role);
    expect((await f.auth.getUserByEmail('person@example.test')).role).toBe(role);
    expect(f.tx.allowedEmail.updateMany).toHaveBeenCalledWith({ where: { email: { equals: 'person@example.test', mode: 'insensitive' } }, data: { role } });
  });
  test('rejects invalid roles without modifying access', async () => {
    const f = statefulFixture();
    await expect(f.people.changeRole('person', 'OWNER')).rejects.toBeInstanceOf(BadRequestException);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  test('propagates a failed user write so access changes roll back with it', async () => {
    const f = statefulFixture();
    f.tx.user.update.mockRejectedValue(new Error('write failed'));
    await expect(f.people.changeRole('person', 'PM')).rejects.toThrow('write failed');
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('onboarding review', () => {
  test.each([undefined, 'PM', 'ADMIN'])('preserves requested role while granting %s', async selectedRole => {
    const f = statefulFixture();
    await f.auth.approveOnboardingRequest('request', 'reviewer', '  Checked  ', selectedRole);
    const role = selectedRole ?? 'CONSULTANT';
    expect(f.tx.onboardingRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'request', status: 'PENDING' },
      data: { status: 'APPROVED', grantedRole: role, reviewedById: 'reviewer', reviewedAt: expect.any(Date), reviewerNotes: 'Checked' } });
    expect(f.request.requestedRole).toBe('CONSULTANT');
    expect(f.tx.allowedEmail.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { role, active: true } }));
    expect(f.tx.user.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ role }) }));
  });
  test('rejects an invalid granted role before any database changes', async () => {
    const f = statefulFixture();
    await expect(f.auth.approveOnboardingRequest('request', 'reviewer', undefined, 'OWNER')).rejects.toBeInstanceOf(BadRequestException);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  test('does not overwrite a request that another admin already reviewed', async () => {
    const f = statefulFixture(); f.tx.onboardingRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(f.auth.approveOnboardingRequest('request', 'reviewer')).rejects.toBeInstanceOf(ConflictException);
    expect(f.tx.allowedEmail.updateMany).not.toHaveBeenCalled();
    expect(f.tx.user.upsert).not.toHaveBeenCalled();
  });
  test('retains rejection notes and reviewer without granting access', async () => {
    const f = statefulFixture(); await f.auth.rejectOnboardingRequest('request', 'reviewer', ' Needs follow-up ');
    expect(f.tx.onboardingRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: 'REJECTED', reviewerNotes: 'Needs follow-up', grantedRole: null, reviewedById: 'reviewer',
    }) }));
    expect(f.tx.allowedEmail.updateMany).not.toHaveBeenCalled();
  });
});
