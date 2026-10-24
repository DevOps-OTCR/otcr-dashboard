import { ProjectsService } from './projects.service';

describe('project changes synchronize reminders', () => {
  function fixture() {
    const prisma = {
      project: { update: jest.fn().mockResolvedValue({ id: 'p1', sprintTimezone: 'America/New_York' }) },
      projectMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'membership' }),
        update: jest.fn().mockResolvedValue({ id: 'membership' }),
      },
      deliverable: { findMany: jest.fn().mockResolvedValue([{ id: 'd1' }]) },
      sprint: { findFirst: jest.fn().mockResolvedValue({ id: 's1', configSnapshot: {},
        deliverables: [{ id: 'd1', dueDateSource: 'AUTO', templateKind: 'INITIAL_SLIDES' }] }) },
      $transaction: jest.fn().mockImplementation(async action => {
        await action({ sprint: { update: jest.fn() }, deliverable: { update: jest.fn() } });
      }),
    };
    const reminders = { rescheduleDeliverable: jest.fn().mockResolvedValue(undefined) };
    const service = new ProjectsService(
      prisma as unknown as ConstructorParameters<typeof ProjectsService>[0],
      {} as ConstructorParameters<typeof ProjectsService>[1],
      reminders as unknown as ConstructorParameters<typeof ProjectsService>[2],
    );
    return { service, reminders, prisma };
  }

  it('reschedules after a project member leaves', async () => {
    const { service, reminders, prisma } = fixture();
    await service.removeMember('p1', 'u1');
    expect(prisma.projectMember.update).toHaveBeenCalledWith({
      where: { id: 'membership' }, data: { leftAt: expect.any(Date) },
    });
    expect(reminders.rescheduleDeliverable).toHaveBeenCalledWith('d1');
  });

  it('reschedules after a timezone change', async () => {
    const { service, reminders } = fixture();
    await service.updateSprintConfig('p1', { sprintTimezone: 'America/New_York' });
    expect(reminders.rescheduleDeliverable).toHaveBeenCalledWith('d1');
  });

  it('reschedules after a sprint moves its automatic deadlines', async () => {
    const { service, reminders, prisma } = fixture();
    jest.spyOn(service, 'getSprint').mockResolvedValue({ id: 's1' } as Awaited<ReturnType<typeof service.getSprint>>);
    await service.updateSprint('p1', 's1', { weekStartDate: '2026-11-02' });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(reminders.rescheduleDeliverable).toHaveBeenCalledWith('d1');
  });
});
