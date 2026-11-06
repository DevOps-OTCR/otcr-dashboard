import { Logger } from '@nestjs/common';
import { DeliverablesService } from './deliverables.service';
import type { PrismaService } from '../prisma/prisma.service';

const deliverableId = 'deliverable-1';
const userId = 'consultant-1';
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
      update: jest.fn().mockResolvedValue({
        id: deliverableId,
        workingLinkUrl: link,
        workingLinkUpdatedAt: new Date(),
        workingLinkUpdatedById: userId,
      }),
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

describe('DeliverablesService working link', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let notificationsService: { queueNotification: jest.Mock };
  let service: DeliverablesService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma = createPrismaMock();
    notificationsService = { queueNotification: jest.fn().mockResolvedValue(undefined) };
    service = new DeliverablesService(
      prisma as unknown as PrismaService,
      notificationsService as unknown as ConstructorParameters<typeof DeliverablesService>[1],
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setWorkingLink', () => {
    it('saves a trimmed https link with updatedAt and updatedById', async () => {
      await service.setWorkingLink(deliverableId, userId, `  ${link}  `);

      expect(prisma.deliverable.update).toHaveBeenCalledTimes(1);
      expect(prisma.deliverable.update).toHaveBeenCalledWith({
        where: { id: deliverableId },
        data: {
          workingLinkUrl: link,
          workingLinkUpdatedAt: expect.any(Date),
          workingLinkUpdatedById: userId,
        },
        select: {
          id: true,
          workingLinkUrl: true,
          workingLinkUpdatedAt: true,
          workingLinkUpdatedById: true,
        },
      });

      const call = prisma.deliverable.update.mock.calls[0][0];
      expect(Object.keys(call.data).sort()).toEqual([
        'workingLinkUpdatedAt',
        'workingLinkUpdatedById',
        'workingLinkUrl',
      ]);
      expect(call.data).not.toHaveProperty('status');
    });

    it('stores the link without touching status', async () => {
      await service.setWorkingLink(deliverableId, userId, link);

      expect(prisma.deliverable.update).toHaveBeenCalledTimes(1);

      const call = prisma.deliverable.update.mock.calls[0][0];
      expect(Object.keys(call.data).sort()).toEqual([
        'workingLinkUpdatedAt',
        'workingLinkUpdatedById',
        'workingLinkUrl',
      ]);
      expect(call.data).not.toHaveProperty('status');
    });

    it('clears all three fields when link is null', async () => {
      await service.setWorkingLink(deliverableId, userId, null);

      expect(prisma.deliverable.update).toHaveBeenCalledTimes(1);
      expect(prisma.deliverable.update).toHaveBeenCalledWith({
        where: { id: deliverableId },
        data: {
          workingLinkUrl: null,
          workingLinkUpdatedAt: null,
          workingLinkUpdatedById: null,
        },
        select: {
          id: true,
          workingLinkUrl: true,
          workingLinkUpdatedAt: true,
          workingLinkUpdatedById: true,
        },
      });

      const call = prisma.deliverable.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('status');
    });

    it('clears all three fields when link is blank', async () => {
      await service.setWorkingLink(deliverableId, userId, '   ');

      expect(prisma.deliverable.update).toHaveBeenCalledTimes(1);
      expect(prisma.deliverable.update).toHaveBeenCalledWith({
        where: { id: deliverableId },
        data: {
          workingLinkUrl: null,
          workingLinkUpdatedAt: null,
          workingLinkUpdatedById: null,
        },
        select: {
          id: true,
          workingLinkUrl: true,
          workingLinkUpdatedAt: true,
          workingLinkUpdatedById: true,
        },
      });
    });

    it('rejects http links', async () => {
      await expect(
        service.setWorkingLink(deliverableId, userId, 'http://example.com/deck'),
      ).rejects.toThrow('Working link must be an https URL');

      expect(prisma.deliverable.update).not.toHaveBeenCalled();
    });

    it('rejects values that are not a URL', async () => {
      await expect(
        service.setWorkingLink(deliverableId, userId, 'not a url'),
      ).rejects.toThrow('Working link must be an https URL');

      expect(prisma.deliverable.update).not.toHaveBeenCalled();
    });

    it('rejects links longer than 2048 characters', async () => {
      const tooLong = `https://example.com/${'a'.repeat(2049)}`;
      expect(tooLong.length).toBeGreaterThan(2048);

      await expect(
        service.setWorkingLink(deliverableId, userId, tooLong),
      ).rejects.toThrow('Working link is too long (max 2048 characters)');

      expect(prisma.deliverable.update).not.toHaveBeenCalled();
    });

    it('never calls prisma.submission.create', async () => {
      await service.setWorkingLink(deliverableId, userId, link);
      await service.setWorkingLink(deliverableId, userId, null);

      expect(prisma.submission.create).not.toHaveBeenCalled();
    });
  });
});
