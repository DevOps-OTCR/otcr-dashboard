import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'node:net';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DeadlineRemindersService } from '../jobs/deadline-reminders.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

describe('reminder HTTP routes and access', () => {
  let app: INestApplication;
  let base: string;
  let role = 'PM';
  let member = false;
  let userId = 'owner';
  const settings = {
    enabled: true,
    offsetsMinutes: [60],
    timezone: 'America/Chicago',
    override: {
      enabled: true,
      offsetMinutes: [60],
      explicitRecipientUserIds: ['u1'],
    },
    eligibleRecipients: [
      { userId: 'u1', name: 'Test User', slackConnected: false },
    ],
  };
  const reminders = {
    getConfig: jest.fn().mockResolvedValue(settings),
    getDeliverableReminderSettings: jest.fn().mockResolvedValue(settings),
    updateDeliverableReminderConfig: jest.fn().mockResolvedValue(settings),
  };

  beforeAll(async () => {
    const project = { id: 'p1', pmId: 'owner' };
    const module = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        AuthGuard,
        {
          provide: AuthService,
          useValue: { getUserByEmail: async () => ({ id: userId, role }) },
        },
        {
          provide: ProjectsService,
          useValue: {
            findOne: async () => project,
            findDeliverable: async (id: string) => {
              if (id === 'missing')
                throw new NotFoundException('Deliverable not found');
              return { id, project };
            },
            isMember: async () => member,
          },
        },
        { provide: DeadlineRemindersService, useValue: reminders },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
  });

  beforeEach(() => {
    role = 'PM';
    userId = 'owner';
    member = false;
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app?.close();
  });

  const request = (path: string, init: RequestInit = {}) =>
    fetch(base + path, {
      ...init,
      headers: {
        Authorization: 'Bearer fixture@example.test',
        'Content-Type': 'application/json',
      },
    });

  it('loads saved overrides on the exact frontend URL', async () => {
    const response = await request(
      '/projects/deliverables/d1/reminders/config',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(settings);
  });

  it('passes reset-to-inherit values through PATCH and returns settings', async () => {
    const body = {
      enabled: null,
      offsetMinutes: [],
      explicitRecipientUserIds: [],
    };
    const response = await request(
      '/projects/deliverables/d1/reminders/config',
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    );
    expect(response.status).toBe(200);
    expect(reminders.updateDeliverableReminderConfig).toHaveBeenCalledWith(
      'd1',
      body,
    );
    expect(await response.json()).toEqual(settings);
  });

  it('rejects a PM who neither owns nor belongs to the project', async () => {
    userId = 'outsider';
    const response = await request(
      '/projects/deliverables/d1/reminders/config',
    );
    expect(response.status).toBe(403);
    expect(reminders.getDeliverableReminderSettings).not.toHaveBeenCalled();
  });

  it.each(['LC', 'PM'])(
    'allows a current %s project member',
    async (currentRole) => {
      userId = 'member';
      role = currentRole;
      member = true;
      expect((await request('/projects/p1/reminders/config')).status).toBe(200);
    },
  );

  it('allows administrators without membership', async () => {
    userId = 'admin';
    role = 'ADMIN';
    expect((await request('/projects/p1/reminders/config')).status).toBe(200);
  });

  it('rejects consultants even when they belong to the project', async () => {
    userId = 'member';
    role = 'CONSULTANT';
    member = true;
    expect((await request('/projects/p1/reminders/config')).status).toBe(403);
  });

  it('returns 404 for an unknown deliverable', async () => {
    expect(
      (await request('/projects/deliverables/missing/reminders/config')).status,
    ).toBe(404);
  });
});
