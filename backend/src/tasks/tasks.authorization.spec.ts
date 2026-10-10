import { ForbiddenException, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from '../integrations/google-calendar.service';

jest.mock('../common/utils/verify', () => ({
  getVerifiedUser: jest.fn(async (token: string) => {
    if (token === 'synthetic-consultant-token') return 'consultant@example.test';
    throw new Error('Invalid test token');
  }),
}));

const user = (id: string, role: User['role'] = 'CONSULTANT') => ({
  id, role, email: `${id}@example.test`,
}) as User;
const consultant = user('consultant');
const creator = user('creator');
const teammate = user('teammate');
const pm = user('pm', 'PM');
const lc = user('lc', 'LC');
const formerMember = user('former');
const admin = user('admin', 'ADMIN');
const actors = [consultant, creator, teammate, pm, lc, formerMember, admin];

function fixtures() {
  const task = {
    id: 'task-a', createdById: creator.id, projectId: 'project-a',
    assigneeType: 'PERSON', assigneeEmail: teammate.email,
    taskName: 'Synthetic task', projectName: 'Synthetic project', workstream: 'Test',
    dueDate: new Date('2026-11-01T12:00:00Z'), completed: false,
    googleCalendarEventId: null, googleCalendarId: null,
  };
  const memberships = new Set(['project-a:teammate', 'project-a:lc', 'project-b:consultant']);
  const prisma = {
    task: {
      findUnique: jest.fn(async () => ({ ...task })),
      findMany: jest.fn(async () => [{ ...task }]),
      create: jest.fn(async ({ data }) => ({ ...task, ...data })),
      update: jest.fn(async ({ data }) => ({ ...task, ...data })),
      delete: jest.fn(async () => ({ ...task })),
    },
    project: { findUnique: jest.fn(async ({ where }) =>
      where.id === 'project-a' ? { pmId: pm.id } : where.id === 'project-b' ? { pmId: 'other-pm' } : null) },
    projectMember: { findFirst: jest.fn(async ({ where }) => {
      // A departed membership exists, but must never authorize access.
      if (where.userId === formerMember.id && where.leftAt !== null) return { leftAt: new Date() };
      return memberships.has(`${where.projectId}:${where.userId}`) ? { leftAt: null } : null;
    }) },
    user: { findFirst: jest.fn(async ({ where }) => actors.find(actor =>
      actor.email.toLowerCase() === where.email.equals.toLowerCase()) ?? null) },
  };
  const calendar = {
    syncTask: jest.fn(async () => ({ googleCalendarEventId: null, googleCalendarId: null })),
    removeTaskEvent: jest.fn(async () => undefined),
  };
  const service = new TasksService(prisma as unknown as PrismaService, calendar as unknown as GoogleCalendarService);
  const assertNoWrites = () => {
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(prisma.task.delete).not.toHaveBeenCalled();
    expect(calendar.syncTask).not.toHaveBeenCalled();
    expect(calendar.removeTaskEvent).not.toHaveBeenCalled();
  };
  return { task, memberships, prisma, calendar, service, assertNoWrites };
}

describe('task object authorization', () => {
  test.each(['findOne', 'update', 'remove'] as const)('blocks cross-team %s before side effects', async method => {
    const f = fixtures();
    const request = method === 'update'
      ? f.service.update(f.task.id, { completed: true }, consultant)
      : f.service[method](f.task.id, consultant);
    await expect(request).rejects.toBeInstanceOf(ForbiddenException);
    f.assertNoWrites();
  });

  test.each([creator, teammate, pm, lc, admin])('allows authorized read/update/delete for $id', async actor => {
    const f = fixtures();
    await expect(f.service.findOne(f.task.id, actor)).resolves.toHaveProperty('id', f.task.id);
    await expect(f.service.update(f.task.id, { completed: true }, actor)).resolves.toHaveProperty('completed', true);
    await expect(f.service.remove(f.task.id, actor)).resolves.toHaveProperty('id', f.task.id);
    expect(f.calendar.syncTask).toHaveBeenCalledTimes(1);
    expect(f.calendar.removeTaskEvent).toHaveBeenCalledTimes(1);
  });

  test('active project membership permits reading but consultants only manage their own tasks', async () => {
    const f = fixtures();
    f.memberships.add('project-a:consultant');
    await expect(f.service.findOne(f.task.id, consultant)).resolves.toHaveProperty('id', f.task.id);
    await expect(f.service.update(f.task.id, { completed: true }, consultant)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.remove(f.task.id, consultant)).rejects.toBeInstanceOf(ForbiddenException);
    f.assertNoWrites();
  });

  test('departed members cannot read team tasks', async () => {
    const f = fixtures();
    f.task.assigneeType = 'ALL_TEAM';
    await expect(f.service.findOne(f.task.id, formerMember)).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.prisma.projectMember.findFirst).toHaveBeenCalledWith({
      where: { projectId: 'project-a', userId: formerMember.id, leftAt: null },
    });
    f.assertNoWrites();
  });

  test.each([user('outside-pm', 'PM'), user('outside-lc', 'LC')])('role alone does not give $role cross-team access', async actor => {
    const f = fixtures();
    await expect(f.service.update(f.task.id, { completed: true }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    f.assertNoWrites();
  });

  test.each(['ALL', 'ALL_PMS', 'ALL_TEAM'])('broadcast recipients cannot rewrite or delete %s tasks', async type => {
    const f = fixtures();
    f.task.assigneeType = type;
    f.task.projectId = type === 'ALL_TEAM' ? 'project-a' : null;
    const recipient = type === 'ALL_PMS' ? user('other-pm', 'PM') : teammate;
    await expect(f.service.findOne(f.task.id, recipient)).resolves.toHaveProperty('id', f.task.id);
    await expect(f.service.update(f.task.id, { completed: true }, recipient)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.remove(f.task.id, recipient)).rejects.toBeInstanceOf(ForbiddenException);
    f.assertNoWrites();
  });

  test.each([
    { assigneeType: 'ALL', actor: pm },
    { assigneeType: 'ALL', actor: lc },
    { assigneeType: 'ALL_PMS', actor: pm },
    { assigneeType: 'ALL_PMS', actor: lc },
  ])('$actor.role cannot manage project-linked $assigneeType tasks', async ({ assigneeType, actor }) => {
    const f = fixtures();
    f.task.createdById = admin.id;
    f.task.assigneeType = assigneeType;
    await expect(f.service.findOne(f.task.id, actor)).resolves.toHaveProperty('id', f.task.id);
    await expect(f.service.update(f.task.id, { taskName: 'Unauthorized change' }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.remove(f.task.id, actor)).rejects.toBeInstanceOf(ForbiddenException);
    f.assertNoWrites();
  });

  test.each(['ALL', 'ALL_PMS'])('admins and creators can manage project-linked %s tasks', async assigneeType => {
    for (const actor of [admin, creator]) {
      const f = fixtures();
      f.task.assigneeType = assigneeType;
      await expect(f.service.update(f.task.id, { taskName: 'Authorized change' }, actor)).resolves.toHaveProperty('taskName', 'Authorized change');
      await expect(f.service.remove(f.task.id, actor)).resolves.toHaveProperty('id', f.task.id);
      expect(f.calendar.syncTask).toHaveBeenCalledTimes(1);
      expect(f.calendar.removeTaskEvent).toHaveBeenCalledTimes(1);
    }
  });

  test.each([pm, lc])('team managers can still manage ALL_TEAM tasks for $id', async actor => {
    const f = fixtures();
    f.task.assigneeType = 'ALL_TEAM';
    await expect(f.service.update(f.task.id, { taskName: 'Authorized team change' }, actor)).resolves.toHaveProperty('taskName', 'Authorized team change');
    await expect(f.service.remove(f.task.id, actor)).resolves.toHaveProperty('id', f.task.id);
    expect(f.calendar.syncTask).toHaveBeenCalledTimes(1);
    expect(f.calendar.removeTaskEvent).toHaveBeenCalledTimes(1);
  });

  test('task listing still excludes tasks assigned to another team', async () => {
    const f = fixtures();
    f.task.assigneeType = 'ALL_TEAM';
    await expect(f.service.findForUser(consultant, {})).resolves.toEqual([]);
  });

  test.each(['findOne', 'update', 'remove'] as const)('missing task returns 404 for %s', async method => {
    const f = fixtures();
    f.prisma.task.findUnique.mockResolvedValue(null);
    const request = method === 'update'
      ? f.service.update('missing', {}, consultant)
      : f.service[method]('missing', consultant);
    await expect(request).rejects.toBeInstanceOf(NotFoundException);
    f.assertNoWrites();
  });

  test('calendar failures are not mislabeled as missing tasks', async () => {
    const f = fixtures();
    f.calendar.removeTaskEvent.mockRejectedValue(new Error('Calendar unavailable'));
    await expect(f.service.remove(f.task.id, creator)).rejects.toThrow('Calendar unavailable');
    expect(f.prisma.task.delete).not.toHaveBeenCalled();
  });
});

describe('task creation and reassignment', () => {
  const input = {
    taskName: 'Synthetic task', dueDate: '2026-11-01', projectName: 'Test', workstream: 'Test',
    assigneeType: 'PERSON' as const, assigneeEmail: consultant.email,
  };

  test('allows a personal task without a project', async () => {
    const f = fixtures();
    await f.service.create(input, consultant);
    expect(f.prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdById: consultant.id }),
    }));
  });

  test('allows creating your own task in an active project', async () => {
    const f = fixtures();
    await expect(f.service.create({ ...input, projectId: 'project-b' }, consultant)).resolves.toHaveProperty('id');
  });

  test('rejects creating a task in a foreign project', async () => {
    const f = fixtures();
    await expect(f.service.create({ ...input, projectId: 'project-a' }, consultant)).rejects.toBeInstanceOf(ForbiddenException);
    f.assertNoWrites();
  });

  test.each([pm, lc])('$role can assign an active team member', async actor => {
    const f = fixtures();
    await expect(f.service.create({ ...input, projectId: 'project-a', assigneeEmail: teammate.email }, actor)).resolves.toHaveProperty('id');
  });

  test.each([consultant, formerMember, admin])('PM cannot assign someone outside their team ($id)', async target => {
    const f = fixtures();
    await expect(f.service.create({ ...input, projectId: 'project-a', assigneeEmail: target.email }, pm)).rejects.toBeInstanceOf(ForbiddenException);
    f.assertNoWrites();
  });

  test.each(['ALL', 'ALL_PMS'] as const)('only an admin can create %s tasks', async assigneeType => {
    const f = fixtures();
    await expect(f.service.create({ ...input, assigneeType }, consultant)).rejects.toBeInstanceOf(ForbiddenException);
    f.assertNoWrites();
    await expect(f.service.create({ ...input, assigneeType }, admin)).resolves.toHaveProperty('id');
  });

  test('a team task requires a project and a team manager', async () => {
    const f = fixtures();
    await expect(f.service.create({ ...input, assigneeType: 'ALL_TEAM' }, pm)).rejects.toThrow('require a project');
    await expect(f.service.create({ ...input, assigneeType: 'ALL_TEAM', projectId: 'project-b' }, consultant)).rejects.toBeInstanceOf(ForbiddenException);
    f.assertNoWrites();
    await expect(f.service.create({ ...input, assigneeType: 'ALL_TEAM', projectId: 'project-a' }, pm)).resolves.toHaveProperty('id');
  });

  test('cannot move an accessible task into an unauthorized project', async () => {
    const f = fixtures();
    await expect(f.service.update(f.task.id, { projectId: 'project-b' }, teammate)).rejects.toBeInstanceOf(ForbiddenException);
    f.assertNoWrites();
  });

  test('cannot reassign an accessible task to someone outside the project', async () => {
    const f = fixtures();
    await expect(f.service.update(f.task.id, { assigneeEmail: consultant.email }, pm)).rejects.toBeInstanceOf(ForbiddenException);
    f.assertNoWrites();
  });

  test('cannot convert an assigned personal task into a broadcast task', async () => {
    const f = fixtures();
    await expect(f.service.update(f.task.id, { assigneeType: 'ALL' }, teammate)).rejects.toBeInstanceOf(ForbiddenException);
    f.assertNoWrites();
  });
});

describe('guarded tasks HTTP routes', () => {
  let app: INestApplication;
  let baseUrl: string;
  const f = fixtures();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        TasksService, AuthGuard,
        { provide: PrismaService, useValue: f.prisma },
        { provide: GoogleCalendarService, useValue: f.calendar },
        { provide: AuthService, useValue: { getUserByEmail: async (email: string) => email === consultant.email ? consultant : null } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });

  test.each(['GET', 'PATCH', 'DELETE'])('%s returns 403 across teams and preserves side effects', async method => {
    const response = await fetch(`${baseUrl}/tasks/task-a`, {
      method,
      headers: { Authorization: 'Bearer synthetic-consultant-token', 'Content-Type': 'application/json' },
      ...(method === 'PATCH' ? { body: JSON.stringify({ completed: true }) } : {}),
    });
    expect(response.status).toBe(403);
    f.assertNoWrites();
  });

  test.each(['GET', 'POST', 'PATCH', 'DELETE'])('%s rejects unauthenticated callers', async method => {
    const path = method === 'POST' ? '/tasks' : '/tasks/task-a';
    const response = await fetch(`${baseUrl}${path}`, { method });
    expect(response.status).toBe(403);
    f.assertNoWrites();
  });
});
