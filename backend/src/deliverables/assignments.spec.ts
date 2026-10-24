import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DeliverablesService } from './deliverables.service';
import { DeliverablesController } from './deliverables.controller';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectsService } from '../projects/projects.service';

function fixture() {
  const tx = {
    user: { findMany: jest.fn().mockImplementation(({ where }) =>
      Promise.resolve(where.id.in.filter((id: string) => ['pm', 'a', 'b'].includes(id)).map((id: string) => ({ id })))) },
    deliverable: { create: jest.fn().mockResolvedValue({ id: 'd' }) },
    deliverableAssignment: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      findMany: jest.fn().mockResolvedValue([{ user: { id: 'a' } }, { user: { id: 'b' } }]),
    },
  };
  const prisma = { $transaction: jest.fn().mockImplementation(action => action(tx)) };
  const service = new DeliverablesService(prisma as unknown as PrismaService, {} as NotificationsService, { rescheduleDeliverable: jest.fn().mockResolvedValue(undefined) } as unknown as ConstructorParameters<typeof DeliverablesService>[2]);
  return { tx, prisma, service };
}

const draft = { title: 'Research', type: 'OTHER', deadline: '2026-10-18T23:00:00Z' };
describe('deliverable assignment sets', () => {
  test.each([[], ['a'], ['a', 'b'], ['pm', 'a', 'b']].map(ids => ({ ids })))('creates a deliverable with the initial set $ids', async ({ ids }) => {
    const f = fixture();
    await f.service.create('p', { ...draft, assigneeIds: ids });
    expect(f.tx.deliverable.create).toHaveBeenCalledTimes(1);
    if (ids.length) expect(f.tx.deliverableAssignment.createMany).toHaveBeenCalledWith({
      data: ids.map(userId => ({ deliverableId: 'd', userId })),
    });
    else expect(f.tx.deliverableAssignment.createMany).not.toHaveBeenCalled();
  });

  test.each([undefined, null, 'a', [7], [''], ['outsider'], ['inactive'], ['departed']].map(value => ({ value })))('rejects invalid or ineligible sets $value before changing assignments', async ({ value }) => {
    const f = fixture();
    await expect(f.service.setAssignments('d', 'p', value)).rejects.toBeInstanceOf(BadRequestException);
    expect(f.tx.deliverableAssignment.deleteMany).not.toHaveBeenCalled();
    expect(f.tx.deliverableAssignment.createMany).not.toHaveBeenCalled();
  });

  test('validates active user and current project membership or PM eligibility', async () => {
    const f = fixture();
    await f.service.setAssignments('d', 'p', ['pm', 'a', 'a']);
    expect(f.tx.user.findMany).toHaveBeenCalledWith({ where: {
      id: { in: ['pm', 'a'] }, active: true,
      OR: [{ pmProjects: { some: { id: 'p' } } }, { projectAssignments: { some: { projectId: 'p', leftAt: null } } }],
    }, select: { id: true } });
    expect(f.tx.deliverableAssignment.createMany).toHaveBeenCalledWith({
      data: [{ deliverableId: 'd', userId: 'pm' }, { deliverableId: 'd', userId: 'a' }], skipDuplicates: true,
    });
  });

  test.each([[], ['b'], ['a', 'b']].map(ids => ({ ids })))('replaces the set atomically and retains existing assignment rows $ids', async ({ ids }) => {
    const f = fixture();
    await f.service.setAssignments('d', 'p', ids);
    expect(f.tx.deliverableAssignment.deleteMany).toHaveBeenCalledWith({ where: { deliverableId: 'd', userId: { notIn: ids } } });
    expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  test('rejects failed writes so the transaction cannot commit a partial set', async () => {
    const f = fixture();
    f.tx.deliverableAssignment.createMany.mockRejectedValue(new Error('database failure'));
    await expect(f.service.setAssignments('d', 'p', ['b'])).rejects.toThrow('database failure');
    expect(f.tx.deliverableAssignment.findMany).not.toHaveBeenCalled();
  });

  test('does not create a deliverable if initial assignees are invalid', async () => {
    const f = fixture();
    await expect(f.service.create('p', { ...draft, assigneeIds: ['outsider'] })).rejects.toBeInstanceOf(BadRequestException);
    expect(f.tx.deliverable.create).not.toHaveBeenCalled();
  });
});

describe('assignment permissions', () => {
  function controller() {
    const service = { findOne: jest.fn().mockResolvedValue({ id: 'd', projectId: 'p', sprint: { status: 'RELEASED' } }),
      setAssignments: jest.fn().mockResolvedValue([]), updateAssignment: jest.fn().mockResolvedValue([]) };
    const projects = { findOne: jest.fn().mockResolvedValue({ pmId: 'pm' }), isMember: jest.fn().mockResolvedValue(true) };
    return { service, controller: new DeliverablesController(service as unknown as DeliverablesService, projects as unknown as ProjectsService) };
  }
  test.each(['CONSULTANT', 'PARTNER', 'EXECUTIVE', 'PM'])('denies a bulk update from an unauthorized %s', async role => {
    const f = controller();
    await expect(f.controller.setAssignments('d', { assigneeIds: ['a'] }, { id: 'outside', role })).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.service.setAssignments).not.toHaveBeenCalled();
  });
  test.each(['ADMIN', 'LC', 'PM'])('preserves management access for %s', async role => {
    const f = controller();
    await f.controller.setAssignments('d', { assigneeIds: ['a', 'b'] }, { id: 'pm', role });
    expect(f.service.setAssignments).toHaveBeenCalledWith('d', 'p', ['a', 'b']);
  });
  test('preserves consultant self-assignment without permitting assignment of someone else', async () => {
    const f = controller();
    await f.controller.updateAssignment('d', { assigned: true, assigneeId: 'b' }, { id: 'a', role: 'CONSULTANT' });
    expect(f.service.updateAssignment).toHaveBeenCalledWith('d', 'a', true);
  });
});
