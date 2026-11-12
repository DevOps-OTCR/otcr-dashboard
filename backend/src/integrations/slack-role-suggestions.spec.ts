import { ConflictException, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role, SlackRoleSuggestionStatus } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SlackService } from './slack.service';
import { SlackRoleSuggestionsController } from './slack-role-suggestions.controller';
import { SlackRoleSuggestionsService } from './slack-role-suggestions.service';

jest.mock('../common/utils/verify', () => ({
  getVerifiedUser: async (token: string) => `${token}@example.test`,
}));

describe('Slack role suggestions HTTP authorization', () => {
  let app: INestApplication;
  let url: string;
  const suggestions = {
    list: jest.fn().mockResolvedValue({ status: 'connected', suggestions: [] }),
    sync: jest.fn().mockResolvedValue({ status: 'connected', created: 0 }),
    approve: jest.fn().mockResolvedValue({ success: true }),
    dismiss: jest.fn().mockResolvedValue({ success: true }),
  };
  const auth = {
    getUserByEmail: async (email: string) => ({ id: email, role: email.split('@')[0] }),
  };
  const routes = [
    ['GET', '/integrations/slack/role-suggestions'],
    ['POST', '/integrations/slack/role-suggestions/sync'],
    ['PATCH', '/integrations/slack/role-suggestions/s1/approve'],
    ['PATCH', '/integrations/slack/role-suggestions/s1/dismiss'],
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SlackRoleSuggestionsController],
      providers: [
        AuthGuard,
        { provide: SlackRoleSuggestionsService, useValue: suggestions },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  test.each(['CONSULTANT', 'LC', 'PM', 'PARTNER', 'EXECUTIVE', ''])(
    'denies all routes for %s',
    async (role) => {
      jest.clearAllMocks();
      for (const [method, path] of routes) {
        const response = await fetch(url + path, {
          method,
          headers: {
            ...(role ? { Authorization: `Bearer ${role}` } : {}),
            'Content-Type': 'application/json',
          },
          ...(method !== 'GET'
            ? { body: JSON.stringify({ role: 'ADMIN', suggestedRole: 'ADMIN' }) }
            : {}),
        });
        expect(response.status).toBe(403);
      }
      for (const fn of [suggestions.list, suggestions.sync, suggestions.approve, suggestions.dismiss]) {
        expect(fn).not.toHaveBeenCalled();
      }
    },
  );

  test('permits ADMIN and ignores client-supplied roles', async () => {
    jest.clearAllMocks();
    for (const [method, path] of routes) {
      const response = await fetch(url + path, {
        method,
        headers: { Authorization: 'Bearer ADMIN', 'Content-Type': 'application/json' },
        ...(method !== 'GET'
          ? { body: JSON.stringify({ role: 'ADMIN', suggestedRole: 'ADMIN' }) }
          : {}),
      });
      expect(response.status).toBe(method === 'POST' ? 201 : 200);
    }
    expect(suggestions.approve).toHaveBeenCalledWith('s1', 'ADMIN@example.test');
    expect(suggestions.dismiss).toHaveBeenCalledWith('s1', 'ADMIN@example.test');
  });
});

function statefulFixture() {
  type Suggestion = {
    id: string;
    userId: string;
    slackUserId: string;
    slackTitle: string;
    currentRole: Role;
    suggestedRole: Role;
    status: SlackRoleSuggestionStatus;
    reviewedById: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  let workspace: { id: string; botAccessToken: string; updatedAt: Date } | null = {
    id: 'ws',
    botAccessToken: 'xoxb-test',
    updatedAt: new Date(),
  };
  const users = new Map<
    string,
    { id: string; email: string; role: Role; active: boolean; firstName: string; lastName: string }
  >();
  const connections: Array<{
    slackUserId: string;
    user: { id: string; email: string; role: Role; active: boolean };
    workspace: { botAccessToken: string };
  }> = [];
  const allowedEmails = new Map<string, { email: string; role: Role; active: boolean }>();
  const suggestions = new Map<string, Suggestion>();
  let nextId = 1;

  const slackWorkspace = {
    findFirst: jest.fn(async () => (workspace ? { ...workspace } : null)),
  };
  const slackUserConnection = {
    findMany: jest.fn(async () => connections.map((c) => ({ ...c }))),
  };
  const userModel = {
    count: jest.fn(async () => {
      const connected = new Set(connections.map((c) => c.user.id));
      return [...users.values()].filter((u) => u.active && !connected.has(u.id)).length;
    }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const u = users.get(where.id);
      return u ? { ...u } : null;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<{ role: Role }> }) => {
      const u = users.get(where.id);
      if (!u) throw new Error('not found');
      const updated = { ...u, ...data };
      users.set(where.id, updated);
      return { id: updated.id, email: updated.email, role: updated.role };
    }),
  };
  const allowedEmail = {
    updateMany: jest.fn(async ({ where, data }: { where: { email: { equals: string } }; data: Partial<{ role: Role; active: boolean }> }) => {
      const key = where.email.equals.toLowerCase();
      const existing = allowedEmails.get(key);
      if (!existing) return { count: 0 };
      allowedEmails.set(key, { ...existing, ...data });
      return { count: 1 };
    }),
    create: jest.fn(async ({ data }: { data: { email: string; role: Role; active: boolean } }) => {
      allowedEmails.set(data.email.toLowerCase(), { ...data });
      return data;
    }),
    findFirstOrThrow: jest.fn(async ({ where }: { where: { email: { equals: string } } }) => {
      const found = allowedEmails.get(where.email.equals.toLowerCase());
      if (!found) throw new Error('not found');
      return found;
    }),
  };
  const slackRoleSuggestion = {
    findMany: jest.fn(async ({ where }: { where?: { status?: SlackRoleSuggestionStatus } } = {}) =>
      [...suggestions.values()].filter((s) => !where?.status || s.status === where.status),
    ),
    findFirst: jest.fn(async ({ where }: { where: Partial<Pick<Suggestion, 'userId' | 'status' | 'suggestedRole' | 'slackTitle'>> }) =>
      [...suggestions.values()].find(
        (s) =>
          (where.userId === undefined || s.userId === where.userId) &&
          (where.status === undefined || s.status === where.status) &&
          (where.suggestedRole === undefined || s.suggestedRole === where.suggestedRole) &&
          (where.slackTitle === undefined || s.slackTitle === where.slackTitle),
      ) ?? null,
    ),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => suggestions.get(where.id) ?? null),
    create: jest.fn(async ({ data }: { data: Omit<Suggestion, 'id' | 'reviewedById' | 'reviewedAt' | 'createdAt' | 'updatedAt'> }) => {
      const record: Suggestion = {
        ...data,
        id: `sug${nextId++}`,
        reviewedById: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      suggestions.set(record.id, record);
      return record;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Suggestion> }) => {
      const existing = suggestions.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() };
      suggestions.set(where.id, updated);
      return updated;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: { id: string; status?: SlackRoleSuggestionStatus }; data: Partial<Suggestion> }) => {
      const existing = suggestions.get(where.id);
      if (!existing || (where.status && existing.status !== where.status)) return { count: 0 };
      suggestions.set(where.id, { ...existing, ...data, updatedAt: new Date() });
      return { count: 1 };
    }),
  };

  const tx = { user: userModel, allowedEmail, slackRoleSuggestion };
  const prisma = {
    ...tx,
    slackWorkspace,
    slackUserConnection,
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };

  const slack = {
    getSlackProfileTitle: jest.fn(async (): Promise<string | null> => null),
  };

  return {
    prisma,
    tx,
    slack,
    workspace,
    users,
    connections,
    allowedEmails,
    suggestions,
    setWorkspace: (w: typeof workspace) => {
      workspace = w;
    },
    service: new SlackRoleSuggestionsService(
      prisma as unknown as PrismaService,
      slack as unknown as SlackService,
    ),
  };
}

describe('SlackRoleSuggestionsService', () => {
  test('list returns not_connected when no workspace', async () => {
    const f = statefulFixture();
    f.setWorkspace(null);
    const result = await f.service.list();
    expect(result.status).toBe('not_connected');
    expect(result.suggestions).toEqual([]);
  });

  test('sync returns not_connected and does nothing when no workspace', async () => {
    const f = statefulFixture();
    f.setWorkspace(null);
    const result = await f.service.sync();
    expect(result.status).toBe('not_connected');
    expect(f.slack.getSlackProfileTitle).not.toHaveBeenCalled();
    expect(f.tx.slackRoleSuggestion.create).not.toHaveBeenCalled();
  });

  test('sync creates PENDING suggestion and never writes roles', async () => {
    const f = statefulFixture();
    f.users.set('u1', {
      id: 'u1',
      email: 'u1@example.test',
      role: Role.CONSULTANT,
      active: true,
      firstName: 'A',
      lastName: 'B',
    });
    f.connections.push({
      slackUserId: 'S1',
      user: f.users.get('u1')!,
      workspace: { botAccessToken: 'tok' },
    });
    f.slack.getSlackProfileTitle.mockResolvedValueOnce('Project Manager');

    const result = await f.service.sync();

    expect(result.status).toBe('connected');
    expect((result as { created: number }).created).toBe(1);
    const created = [...f.suggestions.values()][0];
    expect(created).toMatchObject({
      userId: 'u1',
      suggestedRole: Role.PM,
      currentRole: Role.CONSULTANT,
      slackTitle: 'Project Manager',
      status: SlackRoleSuggestionStatus.PENDING,
    });
    expect(f.tx.user.update).not.toHaveBeenCalled();
    expect(f.tx.allowedEmail.updateMany).not.toHaveBeenCalled();
    expect(f.tx.allowedEmail.create).not.toHaveBeenCalled();
  });

  test('sync skips unknown titles, unchanged roles, and Slack errors', async () => {
    const f = statefulFixture();
    f.users.set('unknown', {
      id: 'unknown',
      email: 'unknown@example.test',
      role: Role.CONSULTANT,
      active: true,
      firstName: 'U',
      lastName: 'K',
    });
    f.users.set('same', {
      id: 'same',
      email: 'same@example.test',
      role: Role.PM,
      active: true,
      firstName: 'S',
      lastName: 'R',
    });
    f.users.set('throws', {
      id: 'throws',
      email: 'throws@example.test',
      role: Role.CONSULTANT,
      active: true,
      firstName: 'T',
      lastName: 'H',
    });
    const mk = (id: string) => ({ slackUserId: id.toUpperCase(), user: f.users.get(id)!, workspace: { botAccessToken: 'tok' } });
    f.connections.push(mk('unknown'), mk('same'), mk('throws'));

    f.slack.getSlackProfileTitle
      .mockResolvedValueOnce('Wizard')
      .mockResolvedValueOnce('Project Manager')
      .mockRejectedValueOnce(new Error('boom'));

    const result = await f.service.sync();

    expect((result as { created: number }).created).toBe(0);
    expect(f.suggestions.size).toBe(0);
    expect(f.tx.user.update).not.toHaveBeenCalled();
    expect(f.tx.allowedEmail.updateMany).not.toHaveBeenCalled();
  });

  test('approve promotes user, writes allowed email, marks APPROVED', async () => {
    const f = statefulFixture();
    f.users.set('u1', {
      id: 'u1',
      email: 'u1@example.test',
      role: Role.CONSULTANT,
      active: true,
      firstName: 'A',
      lastName: 'B',
    });
    const suggestion = await f.tx.slackRoleSuggestion.create({
      data: {
        userId: 'u1',
        slackUserId: 'S1',
        slackTitle: 'Project Manager',
        currentRole: Role.CONSULTANT,
        suggestedRole: Role.PM,
        status: SlackRoleSuggestionStatus.PENDING,
      },
    });

    const result = await f.service.approve(suggestion.id, 'ADMIN@example.test');

    expect(result).toEqual({ success: true, user: { id: 'u1', email: 'u1@example.test', role: Role.PM } });
    expect(f.users.get('u1')!.role).toBe(Role.PM);
    expect(f.allowedEmails.get('u1@example.test')).toMatchObject({ role: Role.PM });
    const stored = f.suggestions.get(suggestion.id)!;
    expect(stored.status).toBe(SlackRoleSuggestionStatus.APPROVED);
    expect(stored.reviewedById).toBe('ADMIN@example.test');
    expect(stored.reviewedAt).toBeInstanceOf(Date);
  });

  test('approve unknown id throws NotFoundException with no role change', async () => {
    const f = statefulFixture();
    f.users.set('u1', { id: 'u1', email: 'u1@example.test', role: Role.CONSULTANT, active: true, firstName: '', lastName: '' });
    await expect(f.service.approve('nope', 'ADMIN@example.test')).rejects.toBeInstanceOf(NotFoundException);
    expect(f.users.get('u1')!.role).toBe(Role.CONSULTANT);
    expect(f.tx.user.update).not.toHaveBeenCalled();
    expect(f.tx.allowedEmail.updateMany).not.toHaveBeenCalled();
  });

  test.each([SlackRoleSuggestionStatus.APPROVED, SlackRoleSuggestionStatus.DISMISSED])(
    'approve of %s suggestion throws ConflictException',
    async (status) => {
      const f = statefulFixture();
      f.users.set('u1', { id: 'u1', email: 'u1@example.test', role: Role.CONSULTANT, active: true, firstName: '', lastName: '' });
      const suggestion = await f.tx.slackRoleSuggestion.create({
        data: {
          userId: 'u1',
          slackUserId: 'S1',
          slackTitle: 'Project Manager',
          currentRole: Role.CONSULTANT,
          suggestedRole: Role.PM,
          status,
        },
      });
      await expect(f.service.approve(suggestion.id, 'ADMIN@example.test')).rejects.toBeInstanceOf(ConflictException);
      expect(f.users.get('u1')!.role).toBe(Role.CONSULTANT);
      expect(f.tx.user.update).not.toHaveBeenCalled();
    },
  );

  test('approve when user is gone throws NotFoundException and leaves suggestion PENDING', async () => {
    const f = statefulFixture();
    f.users.set('u1', { id: 'u1', email: 'u1@example.test', role: Role.CONSULTANT, active: true, firstName: '', lastName: '' });
    const suggestion = await f.tx.slackRoleSuggestion.create({
      data: {
        userId: 'u1',
        slackUserId: 'S1',
        slackTitle: 'Project Manager',
        currentRole: Role.CONSULTANT,
        suggestedRole: Role.PM,
        status: SlackRoleSuggestionStatus.PENDING,
      },
    });
    f.users.delete('u1');
    await expect(f.service.approve(suggestion.id, 'ADMIN@example.test')).rejects.toBeInstanceOf(NotFoundException);
    expect(f.suggestions.get(suggestion.id)!.status).toBe(SlackRoleSuggestionStatus.PENDING);
    expect(f.tx.user.update).not.toHaveBeenCalled();
  });

  test('dismiss marks DISMISSED and never mutates roles', async () => {
    const f = statefulFixture();
    f.users.set('u1', { id: 'u1', email: 'u1@example.test', role: Role.CONSULTANT, active: true, firstName: '', lastName: '' });
    const suggestion = await f.tx.slackRoleSuggestion.create({
      data: {
        userId: 'u1',
        slackUserId: 'S1',
        slackTitle: 'Project Manager',
        currentRole: Role.CONSULTANT,
        suggestedRole: Role.PM,
        status: SlackRoleSuggestionStatus.PENDING,
      },
    });

    const result = await f.service.dismiss(suggestion.id, 'ADMIN@example.test');

    expect(result).toEqual({ success: true });
    const stored = f.suggestions.get(suggestion.id)!;
    expect(stored.status).toBe(SlackRoleSuggestionStatus.DISMISSED);
    expect(stored.reviewedById).toBe('ADMIN@example.test');
    expect(stored.reviewedAt).toBeInstanceOf(Date);
    expect(f.users.get('u1')!.role).toBe(Role.CONSULTANT);
    expect(f.tx.user.update).not.toHaveBeenCalled();
    expect(f.tx.allowedEmail.updateMany).not.toHaveBeenCalled();
    expect(f.tx.allowedEmail.create).not.toHaveBeenCalled();
  });

  test('dismiss of non-pending id throws NotFoundException', async () => {
    const f = statefulFixture();
    f.users.set('u1', { id: 'u1', email: 'u1@example.test', role: Role.CONSULTANT, active: true, firstName: '', lastName: '' });
    const suggestion = await f.tx.slackRoleSuggestion.create({
      data: {
        userId: 'u1',
        slackUserId: 'S1',
        slackTitle: 'Project Manager',
        currentRole: Role.CONSULTANT,
        suggestedRole: Role.PM,
        status: SlackRoleSuggestionStatus.APPROVED,
      },
    });
    await expect(f.service.dismiss(suggestion.id, 'ADMIN@example.test')).rejects.toBeInstanceOf(NotFoundException);
    expect(f.suggestions.get(suggestion.id)!.status).toBe(SlackRoleSuggestionStatus.APPROVED);
  });
});
