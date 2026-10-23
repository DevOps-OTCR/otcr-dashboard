import { ProjectsService } from './projects.service';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// The frontend's sprint queue relies on these existing backend semantics.
// Exercise the actual services with synthetic Prisma records, never a live DB.
describe('autosave deadline contract (#118)', () => {
  it('marks a directly edited deadline MANUAL before a later week move', async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = new DeliverablesService({ deliverable: { update } } as unknown as PrismaService, {} as NotificationsService);
    await service.updateDeadline('manual', '2026-11-03T18:00:00.000Z');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'manual' }, data: {
      deadline: new Date('2026-11-03T18:00:00.000Z'), dueDateSource: 'MANUAL', manualDeadlineUpdatedAt: expect.any(Date),
    } }));
  });

  it('moves AUTO deadlines in Chicago time and leaves manual overrides untouched', async () => {
    const tx = { sprint: { update: jest.fn() }, deliverable: { update: jest.fn() } };
    const prisma = {
      sprint: { findFirst: jest.fn().mockResolvedValue({ id: 'week', configSnapshot: { defaultDueTime: '17:30', initialSlideDueDay: 'TUESDAY' },
        deliverables: [{ id: 'manual', templateKind: 'CUSTOM', dueDateSource: 'MANUAL' },
          { id: 'auto-slides', templateKind: 'INITIAL_SLIDES', dueDateSource: 'AUTO' },
          { id: 'auto-custom', templateKind: 'CUSTOM', dueDateSource: 'AUTO' }],
      }) },
      $transaction: jest.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx)),
    };
    const service = new ProjectsService(prisma as unknown as PrismaService, {} as NotificationsService);
    jest.spyOn(service, 'getSprint').mockResolvedValue({ id: 'week' } as Awaited<ReturnType<ProjectsService['getSprint']>>);
    await service.updateSprint('project', 'week', { weekStartDate: '2026-10-26' });
    expect(tx.sprint.update).toHaveBeenCalledWith({ where: { id: 'week' }, data: {
      weekStartDate: new Date('2026-10-26T00:00:00Z'), weekEndDate: new Date('2026-11-01T00:00:00Z'),
    } });
    expect(tx.deliverable.update.mock.calls).toEqual([
      [{ where: { id: 'auto-slides' }, data: { deadline: new Date('2026-10-27T22:30:00Z') } }],
      [{ where: { id: 'auto-custom' }, data: { deadline: new Date('2026-11-01T23:30:00Z') } }],
    ]);
  });
});
