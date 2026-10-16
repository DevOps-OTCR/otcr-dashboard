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
        status: 'PENDING',
        deliverable: { status: 'PENDING' },
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
  const process = (job: any) => (processor as any).processNotification(job);

  beforeEach(() => {
    prisma = createPrismaMock();
    slackService = { sendDeadlineReminder: jest.fn().mockResolvedValue(true) };
    processor = new NotificationsProcessor(
      prisma as any,
      slackService as any,
      { get: jest.fn() } as any,
    );
  });

  const reminderJob = (overrides: any = {}) => ({
    data: {
      userId: 'user-1',
      type: 'DEADLINE_24H',
      channel: 'BOTH',
      scheduledReminderId: 'rem-1',
      data: {
        deliverableTitle: 'Final Deck',
        projectName: 'Project One',
        deadline: new Date(),
        remainingMinutes: 1440,
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
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
    );
    expect(prisma.scheduledReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
    );
  });

  it('retries (throws) on a non-final Slack failure without creating a notification yet', async () => {
    slackService.sendDeadlineReminder.mockResolvedValue(false);

    await expect(process(reminderJob({ attemptsMade: 1 }))).rejects.toBeDefined();
    // No premature in-app record; attempts counter incremented for observability.
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.scheduledReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attempts: { increment: 1 } }) }),
    );
  });

  it('preserves the in-app notification and records FAILED on the final attempt', async () => {
    slackService.sendDeadlineReminder.mockResolvedValue(false);

    await process(reminderJob({ attemptsMade: 3 }));

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(prisma.scheduledReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('skips sending when the reminder is no longer valid (deliverable finalized)', async () => {
    prisma.scheduledReminder.findUnique.mockResolvedValue({
      id: 'rem-1',
      status: 'PENDING',
      deliverable: { status: 'SUBMITTED' },
    });

    await process(reminderJob());

    expect(slackService.sendDeadlineReminder).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
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
