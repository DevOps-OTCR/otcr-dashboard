import { NotificationsProcessor } from './notifications.processor';

function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'a@x.com',
        firstName: 'A',
        lastName: 'One',
      }),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    scheduledReminder: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'rem-1',
        jobId: 'job-1',
        userId: 'user-1',
        offsetMinutes: 60,
        status: 'PENDING',
        fireAt: new Date('2099-01-01T11:00:00Z'),
        user: { active: true },
        deliverable: {
          status: 'PENDING',
          completed: false,
          deadline: new Date('2099-01-01T12:00:00Z'),
          assignments: [{ userId: 'user-1' }],
          reminderOverride: null,
          project: {
            sprintTimezone: 'America/Chicago',
            reminderConfig: { enabled: true, offsetsMinutes: [60] },
            members: [{ userId: 'user-1' }],
          },
        },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('NotificationsProcessor reminder handling', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let slackService: { sendDeadlineReminder: jest.Mock };
  let processor: NotificationsProcessor;

  // processNotification is private; invoke it through the instance for testing.
  const process = (job: unknown) =>
    (
      processor as unknown as {
        processNotification: (job: unknown) => Promise<void>;
      }
    ).processNotification(job);

  beforeEach(() => {
    prisma = createPrismaMock();
    slackService = { sendDeadlineReminder: jest.fn().mockResolvedValue(true) };
    processor = new NotificationsProcessor(
      prisma as unknown as ConstructorParameters<
        typeof NotificationsProcessor
      >[0],
      slackService as unknown as ConstructorParameters<
        typeof NotificationsProcessor
      >[1],
      { get: jest.fn() } as unknown as ConstructorParameters<
        typeof NotificationsProcessor
      >[2],
    );
  });

  const reminderJob = (overrides: Record<string, unknown> = {}) => ({
    id: 'job-1',
    opts: { attempts: 3 },
    data: {
      userId: 'user-1',
      type: 'DEADLINE_24H',
      channel: 'BOTH',
      scheduledReminderId: 'rem-1',
      data: {
        deliverableTitle: 'Final Deck',
        projectName: 'Project One',
        deadline: new Date('2099-01-01T12:00:00Z'),
        remainingMinutes: 60,
        timezone: 'America/Chicago',
        deepLink: 'https://cms.example.com/deliverables?x=1',
      },
    },
    attemptsMade: 1,
    ...overrides,
  });

  it('marks the reminder SENT and creates an in-app notification on Slack success', async () => {
    await process(reminderJob());

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
    expect(prisma.scheduledReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
  });

  it('retries (throws) on a non-final Slack failure without creating a notification yet', async () => {
    slackService.sendDeadlineReminder.mockResolvedValue(false);

    await expect(
      process(reminderJob({ attemptsMade: 1 })),
    ).rejects.toBeDefined();
    // No premature in-app record; attempts counter incremented for observability.
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.scheduledReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      }),
    );
  });

  it('preserves the in-app notification and records FAILED on the final attempt', async () => {
    slackService.sendDeadlineReminder.mockResolvedValue(false);

    await process(reminderJob({ attemptsMade: 2 }));

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(prisma.scheduledReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('skips sending when the reminder is no longer valid (deliverable finalized)', async () => {
    prisma.scheduledReminder.findUnique.mockResolvedValue({
      id: 'rem-1',
      jobId: 'job-1',
      status: 'CANCELLED',
    });

    await process(reminderJob());

    expect(slackService.sendDeadlineReminder).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it.each([
    'completed',
    'deadline',
    'assignee',
    'member',
    'offset',
    'inactive',
  ])('skips a stale %s reminder before sending', async (change) => {
    const row = await prisma.scheduledReminder.findUnique();
    if (change === 'completed') row.deliverable.completed = true;
    if (change === 'deadline')
      row.deliverable.deadline = new Date('2099-01-02T12:00:00Z');
    if (change === 'assignee') row.deliverable.assignments = [];
    if (change === 'member') row.deliverable.project.members = [];
    if (change === 'offset')
      row.deliverable.project.reminderConfig.offsetsMinutes = [1440];
    if (change === 'inactive') row.user.active = false;
    await process(reminderJob());
    expect(slackService.sendDeadlineReminder).not.toHaveBeenCalled();
    expect(prisma.scheduledReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
  });

  it('allows an enabled override to inherit offsets before project settings exist', async () => {
    const row = await prisma.scheduledReminder.findUnique();
    row.deliverable.project.reminderConfig = null;
    row.deliverable.reminderOverride = {
      enabled: true,
      offsetMinutes: [],
      explicitRecipientUserIds: [],
    };
    await process(reminderJob());
    expect(slackService.sendDeadlineReminder).toHaveBeenCalledTimes(1);
  });

  it('does not cancel a replacement schedule when an old job runs', async () => {
    const row = await prisma.scheduledReminder.findUnique();
    row.jobId = 'replacement-job';
    await process(reminderJob());
    expect(slackService.sendDeadlineReminder).not.toHaveBeenCalled();
    expect(prisma.scheduledReminder.updateMany).not.toHaveBeenCalled();
  });

  it('uses the configured attempt budget with zero-based attemptsMade', async () => {
    slackService.sendDeadlineReminder.mockResolvedValue(false);
    await process(reminderJob({ attemptsMade: 0, opts: { attempts: 1 } }));
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('uses the pre-created PENDING notification path for non-reminder jobs', async () => {
    slackService.sendDeadlineReminder.mockResolvedValue(true);

    await process({
      data: {
        userId: 'user-1',
        type: 'DEADLINE_24H',
        channel: 'BOTH',
        data: { deliverableTitle: 'X', projectName: 'Y', deadline: new Date() },
      },
      attemptsMade: 1,
    });

    expect(prisma.notification.updateMany).toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
