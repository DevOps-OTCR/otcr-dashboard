import { BadRequestException } from '@nestjs/common';
import { DeadlineRemindersService } from './deadline-reminders.service';

const DAY = 24 * 60 * 60 * 1000;

function createPrismaMock() {
  return {
    project: {
      findUnique: jest.fn().mockResolvedValue({ sprintTimezone: 'America/Chicago' }),
    },
    reminderConfig: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    deliverable: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]),
    },
    scheduledReminder: {
      upsert: jest.fn().mockImplementation(({ create }) =>
        Promise.resolve({ id: `rem-${create.userId}-${create.offsetMinutes}`, ...create }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function createQueueMock() {
  return {
    add: jest.fn().mockResolvedValue({}),
    getJob: jest.fn().mockResolvedValue(null),
  };
}

describe('DeadlineRemindersService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let queue: ReturnType<typeof createQueueMock>;
  let notificationsService: { getNotificationQueue: jest.Mock };
  let configService: { get: jest.Mock };
  let service: DeadlineRemindersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    queue = createQueueMock();
    notificationsService = { getNotificationQueue: jest.fn().mockReturnValue(queue) };
    configService = { get: jest.fn().mockReturnValue('https://cms.example.com') };
    service = new DeadlineRemindersService(
      prisma as any,
      notificationsService as any,
      configService as any,
    );
  });

  describe('getConfig', () => {
    it('returns safe defaults when no config is stored', async () => {
      const config = await service.getConfig('project-1');
      expect(config).toEqual({
        enabled: false,
        offsetsMinutes: [1440, 60],
        timezone: 'America/Chicago',
      });
    });

    it('uses the project timezone', async () => {
      prisma.project.findUnique.mockResolvedValue({ sprintTimezone: 'America/New_York' });
      const config = await service.getConfig('project-1');
      expect(config.timezone).toBe('America/New_York');
    });
  });

  describe('updateConfig validation', () => {
    it('rejects empty offsets', async () => {
      await expect(
        service.updateConfig('project-1', { enabled: true, offsetsMinutes: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-positive offsets', async () => {
      await expect(
        service.updateConfig('project-1', { enabled: true, offsetsMinutes: [0] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects more than the max number of offsets', async () => {
      await expect(
        service.updateConfig('project-1', {
          enabled: true,
          offsetsMinutes: [10080, 1440, 720, 120, 60, 30],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects offsets beyond two weeks', async () => {
      await expect(
        service.updateConfig('project-1', { enabled: true, offsetsMinutes: [30000] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('rescheduleDeliverable', () => {
    const futureDeadline = () => new Date(Date.now() + 7 * DAY);

    function deliverableFixture(overrides: any = {}) {
      return {
        id: 'deliverable-1',
        title: 'Final Deck',
        deadline: futureDeadline(),
        status: 'PENDING',
        projectId: 'project-1',
        project: { name: 'Project One', sprintTimezone: 'America/Chicago' },
        assignments: [{ userId: 'user-1' }, { userId: 'user-2' }],
        ...overrides,
      };
    }

    it('does nothing when reminders are disabled', async () => {
      prisma.deliverable.findUnique.mockResolvedValue(deliverableFixture());
      await service.rescheduleDeliverable('deliverable-1');
      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.scheduledReminder.upsert).not.toHaveBeenCalled();
    });

    it('schedules one idempotent reminder per assignee per offset when enabled', async () => {
      prisma.reminderConfig.findUnique.mockResolvedValue({
        enabled: true,
        offsetsMinutes: [1440, 60],
      });
      prisma.deliverable.findUnique.mockResolvedValue(deliverableFixture());

      await service.rescheduleDeliverable('deliverable-1');

      // 2 assignees x 2 offsets = 4 reminders, 4 queued jobs.
      expect(prisma.scheduledReminder.upsert).toHaveBeenCalledTimes(4);
      expect(queue.add).toHaveBeenCalledTimes(4);
    });

    it('does not create duplicates when called repeatedly (idempotent)', async () => {
      prisma.reminderConfig.findUnique.mockResolvedValue({
        enabled: true,
        offsetsMinutes: [1440],
      });
      prisma.deliverable.findUnique.mockResolvedValue(deliverableFixture());

      await service.rescheduleDeliverable('deliverable-1');
      await service.rescheduleDeliverable('deliverable-1');

      // 2 assignees x 1 offset x 2 scans = 4 enqueue attempts, but the
      // deterministic jobIds mean only 2 distinct jobs exist, so BullMQ
      // dedupes and no duplicate reminder is ever sent.
      const jobIds = queue.add.mock.calls.map(([, , opts]) => opts.jobId);
      expect(jobIds).toHaveLength(4);
      expect(new Set(jobIds).size).toBe(2);
    });

    it('never notifies the whole team when the deliverable is unassigned', async () => {
      prisma.reminderConfig.findUnique.mockResolvedValue({ enabled: true, offsetsMinutes: [1440] });
      prisma.deliverable.findUnique.mockResolvedValue(deliverableFixture({ assignments: [] }));

      await service.rescheduleDeliverable('deliverable-1');

      expect(queue.add).not.toHaveBeenCalled();
      // Falls through to cancel (no eligible recipients), not a broadcast.
      expect(prisma.scheduledReminder.findMany).toHaveBeenCalled();
    });

    it('only notifies active assignees who still belong to the project', async () => {
      prisma.reminderConfig.findUnique.mockResolvedValue({ enabled: true, offsetsMinutes: [1440] });
      prisma.deliverable.findUnique.mockResolvedValue(deliverableFixture());
      // Simulate user-2 having left the project / gone inactive.
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1' }]);

      await service.rescheduleDeliverable('deliverable-1');

      expect(queue.add).toHaveBeenCalledTimes(1);
      const [, job] = queue.add.mock.calls[0];
      expect(job.userId).toBe('user-1');
    });

    it('cancels reminders instead of scheduling when the deliverable is finalized', async () => {
      prisma.reminderConfig.findUnique.mockResolvedValue({ enabled: true, offsetsMinutes: [1440] });
      prisma.deliverable.findUnique.mockResolvedValue(deliverableFixture({ status: 'SUBMITTED' }));

      await service.rescheduleDeliverable('deliverable-1');

      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.scheduledReminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deliverableId: 'deliverable-1', status: 'PENDING' } }),
      );
    });

    it('skips reminders whose fire time has already passed', async () => {
      prisma.reminderConfig.findUnique.mockResolvedValue({
        enabled: true,
        offsetsMinutes: [20160], // 2 weeks, but deadline only 7 days out
      });
      prisma.deliverable.findUnique.mockResolvedValue(deliverableFixture());

      await service.rescheduleDeliverable('deliverable-1');

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('includes timezone and a deep link in the queued job payload', async () => {
      prisma.reminderConfig.findUnique.mockResolvedValue({ enabled: true, offsetsMinutes: [1440] });
      prisma.deliverable.findUnique.mockResolvedValue(deliverableFixture());

      await service.rescheduleDeliverable('deliverable-1');

      const [, job] = queue.add.mock.calls[0];
      expect(job.data.timezone).toBe('America/Chicago');
      expect(job.data.deepLink).toContain('deliverableId=deliverable-1');
      expect(job.scheduledReminderId).toBeDefined();
    });
  });

  describe('cancelRemindersForDeliverable', () => {
    it('removes queued jobs and marks pending reminders CANCELLED', async () => {
      prisma.scheduledReminder.findMany.mockResolvedValue([
        { id: 'rem-1', jobId: 'reminder-deliverable-1-user-1-1440' },
        { id: 'rem-2', jobId: 'reminder-deliverable-1-user-2-1440' },
      ]);
      const removeJob = jest.fn().mockResolvedValue(undefined);
      queue.getJob.mockImplementation((jobId) =>
        jobId ? Promise.resolve({ remove: removeJob }) : Promise.resolve(null),
      );

      await service.cancelRemindersForDeliverable('deliverable-1', 'submitted');

      expect(removeJob).toHaveBeenCalledTimes(2);
      expect(prisma.scheduledReminder.updateMany).toHaveBeenCalledWith({
        where: { deliverableId: 'deliverable-1', status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
      });
    });
  });

  describe('getRecipientPreview', () => {
    it('reports slack connection status and skips inactive users', async () => {
      prisma.deliverable.findMany.mockResolvedValue([
        {
          id: 'deliverable-1',
          title: 'Deck',
          deadline: new Date(),
          assignments: [
            {
              user: {
                id: 'user-1',
                email: 'a@x.com',
                firstName: 'A',
                lastName: 'One',
                active: true,
                slackConnections: [{ id: 'conn-1' }],
              },
            },
            {
              user: {
                id: 'user-2',
                email: 'b@x.com',
                firstName: 'B',
                lastName: 'Two',
                active: false,
                slackConnections: [],
              },
            },
          ],
        },
      ]);

      const preview = await service.getRecipientPreview('project-1');
      expect(preview[0].recipients).toHaveLength(1);
      expect(preview[0].recipients[0]).toMatchObject({
        userId: 'user-1',
        slackConnected: true,
      });
    });
  });
});
