import { Logger } from '@nestjs/common';
import { DeliverablesService } from './deliverables.service';

const deliverableId = 'deliverable-1';
const submitterId = 'consultant-1';
const link = 'https://example.com/deck';

function createPrismaMock() {
  return {
    deliverable: {
      findUnique: jest.fn().mockResolvedValue({
        id: deliverableId,
        title: 'Final Deck',
        projectId: 'project-1',
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
        project: {
          id: 'project-1',
          name: 'Project One',
          pmId: 'pm-1',
          members: [{ userId: 'lc-1' }],
        },
      }),
      update: jest.fn().mockResolvedValue({ id: deliverableId, status: 'SUBMITTED' }),
    },
    submission: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'submission-1', ...data }),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    notification: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        role: 'CONSULTANT',
        firstName: 'Casey',
        lastName: 'Consultant',
        email: 'casey@example.com',
      }),
    },
  };
}

describe('DeliverablesService reviewer notifications', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let notificationsService: { queueNotification: jest.Mock };
  let service: DeliverablesService;

  const notifiedUserIds = () =>
    notificationsService.queueNotification.mock.calls.map(([job]) => job.userId);

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma = createPrismaMock();
    notificationsService = { queueNotification: jest.fn().mockResolvedValue(undefined) };
    service = new DeliverablesService(prisma as any, notificationsService as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('submitLink', () => {
    it('saves the submission, notifies reviewers, and marks notifications sent', async () => {
      const submission = await service.submitLink(deliverableId, submitterId, link);

      expect(submission).toMatchObject({
        id: 'submission-1',
        fileUrl: link,
        version: 1,
        reviewerNotificationStatus: 'SENT',
      });
      expect(prisma.submission.create.mock.calls[0][0].data.reviewerNotificationStatus).toBe(
        'PENDING',
      );
      expect(prisma.deliverable.update).toHaveBeenCalledWith({
        where: { id: deliverableId },
        data: { status: 'SUBMITTED' },
      });
      expect(notifiedUserIds()).toEqual(['pm-1', 'lc-1']);
      expect(notificationsService.queueNotification.mock.calls[0][0].data.submissionId).toBe(
        'submission-1',
      );
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 'submission-1' },
        data: { reviewerNotificationStatus: 'SENT' },
      });
    });

    it('returns the saved submission and leaves it pending when notification persistence fails', async () => {
      notificationsService.queueNotification.mockRejectedValue(
        new Error('notification insert failed'),
      );

      const submission = await service.submitLink(deliverableId, submitterId, link);

      expect(submission).toMatchObject({
        id: 'submission-1',
        fileUrl: link,
        reviewerNotificationStatus: 'PENDING',
      });
      expect(prisma.submission.create).toHaveBeenCalledTimes(1);
      expect(prisma.deliverable.update).toHaveBeenCalledTimes(1);
      expect(prisma.submission.update).not.toHaveBeenCalled();
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('still notifies remaining reviewers when one notification fails', async () => {
      notificationsService.queueNotification
        .mockRejectedValueOnce(new Error('notification insert failed'))
        .mockResolvedValue(undefined);

      await service.submitLink(deliverableId, submitterId, link);

      expect(notifiedUserIds()).toEqual(['pm-1', 'lc-1']);
      expect(prisma.submission.update).not.toHaveBeenCalled();
    });

    it('returns the saved submission when the reviewer lookup fails', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('user lookup failed'));

      const submission = await service.submitLink(deliverableId, submitterId, link);

      expect(submission).toMatchObject({
        id: 'submission-1',
        reviewerNotificationStatus: 'PENDING',
      });
      expect(notificationsService.queueNotification).not.toHaveBeenCalled();
      expect(prisma.submission.update).not.toHaveBeenCalled();
    });

    it('returns the saved submission when marking notifications sent fails', async () => {
      prisma.submission.update.mockRejectedValue(new Error('submission update failed'));

      const submission = await service.submitLink(deliverableId, submitterId, link);

      expect(submission).toMatchObject({
        id: 'submission-1',
        reviewerNotificationStatus: 'PENDING',
      });
    });

    it('rejects and skips notifications when the submission cannot be saved', async () => {
      prisma.submission.create.mockRejectedValue(new Error('submission insert failed'));

      await expect(service.submitLink(deliverableId, submitterId, link)).rejects.toThrow(
        'submission insert failed',
      );
      expect(prisma.deliverable.update).not.toHaveBeenCalled();
      expect(notificationsService.queueNotification).not.toHaveBeenCalled();
    });

    it('rejects when the deliverable status cannot be updated', async () => {
      prisma.deliverable.update.mockRejectedValue(new Error('status update failed'));

      await expect(service.submitLink(deliverableId, submitterId, link)).rejects.toThrow(
        'status update failed',
      );
      expect(notificationsService.queueNotification).not.toHaveBeenCalled();
    });
  });

  describe('retryPendingReviewerNotifications', () => {
    const pendingSubmission = (attempts = 0) => ({
      id: 'submission-1',
      deliverableId,
      userId: submitterId,
      isLate: false,
      submittedAt: new Date(Date.now() - 60 * 60 * 1000),
      reviewerNotificationAttempts: attempts,
      deliverable: { deadline: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    it('only picks up pending submissions older than five minutes', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-09T12:00:00Z'));

      await service.retryPendingReviewerNotifications();

      const { where } = prisma.submission.findMany.mock.calls[0][0];
      expect(where.reviewerNotificationStatus).toBe('PENDING');
      expect(where.submittedAt).toEqual({ lt: new Date('2026-10-09T11:55:00Z') });
    });

    it('notifies only reviewers who are missing the notification and marks it sent', async () => {
      prisma.submission.findMany.mockResolvedValue([pendingSubmission()]);
      prisma.notification.findFirst.mockImplementation(({ where }) =>
        Promise.resolve(where.userId === 'pm-1' ? { id: 'notification-1' } : null),
      );

      await service.retryPendingReviewerNotifications();

      expect(prisma.notification.findFirst.mock.calls[0][0].where.metadata).toEqual({
        path: ['submissionId'],
        equals: 'submission-1',
      });
      expect(notifiedUserIds()).toEqual(['lc-1']);
      expect(prisma.submission.create).not.toHaveBeenCalled();
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 'submission-1' },
        data: { reviewerNotificationStatus: 'SENT', reviewerNotificationAttempts: 1 },
      });
    });

    it('marks the submission sent without re-sending when every reviewer was already notified', async () => {
      prisma.submission.findMany.mockResolvedValue([pendingSubmission()]);
      prisma.notification.findFirst.mockResolvedValue({ id: 'notification-1' });

      await service.retryPendingReviewerNotifications();

      expect(notificationsService.queueNotification).not.toHaveBeenCalled();
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 'submission-1' },
        data: { reviewerNotificationStatus: 'SENT', reviewerNotificationAttempts: 1 },
      });
    });

    it('keeps the submission pending and counts the attempt when a notification fails again', async () => {
      prisma.submission.findMany.mockResolvedValue([pendingSubmission(1)]);
      notificationsService.queueNotification.mockRejectedValue(
        new Error('notification insert failed'),
      );

      await service.retryPendingReviewerNotifications();

      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 'submission-1' },
        data: { reviewerNotificationStatus: 'PENDING', reviewerNotificationAttempts: 2 },
      });
    });

    it('marks the submission failed after the final attempt', async () => {
      prisma.submission.findMany.mockResolvedValue([pendingSubmission(4)]);
      prisma.user.findUnique.mockRejectedValue(new Error('user lookup failed'));

      await service.retryPendingReviewerNotifications();

      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 'submission-1' },
        data: { reviewerNotificationStatus: 'FAILED', reviewerNotificationAttempts: 5 },
      });
    });
  });
});
