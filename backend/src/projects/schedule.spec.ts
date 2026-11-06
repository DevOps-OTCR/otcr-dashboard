import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// Coverage for ProjectsService.getSchedule: the visibility rules differ per
// role, so Prisma is stubbed and the emitted query shape is asserted directly.

describe('ProjectsService.getSchedule', () => {
  const from = new Date('2026-10-05T00:00:00.000Z');
  const to = new Date('2026-10-12T00:00:00.000Z');

  type ProjectRow = {
    id: string;
    name: string;
    pmId: string | null;
    sprintTimezone: string;
  };

  type DeliverableRow = {
    id: string;
    title: string;
    deadline: Date;
    projectId: string;
    status: string;
  };

  const projectA: ProjectRow = {
    id: 'project-a',
    name: 'Project A',
    pmId: 'user-pm',
    sprintTimezone: 'America/Chicago',
  };

  const projectB: ProjectRow = {
    id: 'project-b',
    name: 'Project B',
    pmId: 'user-other-pm',
    sprintTimezone: 'America/New_York',
  };

  function buildService(projects: ProjectRow[], deliverables: DeliverableRow[] = []) {
    const prisma = {
      project: { findMany: jest.fn().mockResolvedValue(projects) },
      deliverable: { findMany: jest.fn().mockResolvedValue(deliverables) },
    } as unknown as PrismaService;
    const notificationsService = {} as NotificationsService;
    return { service: new ProjectsService(prisma, notificationsService), prisma };
  }

  it('scopes a CONSULTANT to active memberships and keeps the RELEASED filter when nothing is manageable', async () => {
    const { service, prisma } = buildService([projectA]);
    const projectFindMany = prisma.project.findMany as unknown as jest.Mock;
    const deliverableFindMany = prisma.deliverable.findMany as unknown as jest.Mock;

    const result = await service.getSchedule({ id: 'user-consultant', role: 'CONSULTANT' }, from, to);

    const projectArgs = projectFindMany.mock.calls[0][0];
    expect(projectArgs.where).toEqual({
      members: { some: { userId: 'user-consultant', leftAt: null } },
    });
    expect(projectArgs.select).toEqual({
      id: true,
      name: true,
      pmId: true,
      sprintTimezone: true,
    });
    expect(projectArgs.orderBy).toEqual({ name: 'asc' });

    const deliverableArgs = deliverableFindMany.mock.calls[0][0];
    expect(deliverableArgs.where.projectId).toEqual({ in: ['project-a'] });
    expect(deliverableArgs.where.sprintId).toEqual({ not: null });
    expect(deliverableArgs.where.deadline).toEqual({ gte: from, lt: to });
    expect(deliverableArgs.where.OR).toEqual([
      { projectId: { in: [] } },
      { sprint: { status: 'RELEASED' } },
    ]);

    expect(result.projects).toEqual([
      { id: 'project-a', name: 'Project A', timeZone: 'America/Chicago', canManage: false },
    ]);
    expect(result.projects[0]).not.toHaveProperty('pmId');
  });

  it('lets a PM see managed and member projects but only manage their own', async () => {
    const { service, prisma } = buildService([projectA, projectB]);
    const projectFindMany = prisma.project.findMany as unknown as jest.Mock;
    const deliverableFindMany = prisma.deliverable.findMany as unknown as jest.Mock;

    const result = await service.getSchedule({ id: 'user-pm', role: 'PM' }, from, to);

    const projectArgs = projectFindMany.mock.calls[0][0];
    expect(projectArgs.where).toEqual({
      OR: [
        { pmId: 'user-pm' },
        { members: { some: { userId: 'user-pm', leftAt: null } } },
      ],
    });

    expect(result.projects).toEqual([
      { id: 'project-a', name: 'Project A', timeZone: 'America/Chicago', canManage: true },
      { id: 'project-b', name: 'Project B', timeZone: 'America/New_York', canManage: false },
    ]);

    const deliverableArgs = deliverableFindMany.mock.calls[0][0];
    expect(deliverableArgs.where.OR[0]).toEqual({ projectId: { in: ['project-a'] } });
    expect(deliverableArgs.where.OR[1]).toEqual({ sprint: { status: 'RELEASED' } });
  });

  it('gives an ADMIN unfiltered projects, all manageable', async () => {
    const { service, prisma } = buildService([projectA, projectB]);
    const projectFindMany = prisma.project.findMany as unknown as jest.Mock;

    const result = await service.getSchedule({ id: 'user-admin', role: 'ADMIN' }, from, to);

    expect(projectFindMany.mock.calls[0][0].where).toEqual({});
    expect(result.projects.map((project) => project.canManage)).toEqual([true, true]);
  });

  it('gives an EXECUTIVE unfiltered projects with canManage false', async () => {
    const { service, prisma } = buildService([projectA, projectB]);
    const projectFindMany = prisma.project.findMany as unknown as jest.Mock;

    const result = await service.getSchedule({ id: 'user-exec', role: 'EXECUTIVE' }, from, to);

    expect(projectFindMany.mock.calls[0][0].where).toEqual({});
    expect(result.projects.map((project) => project.canManage)).toEqual([false, false]);
  });

  it('skips the deliverable query when no projects are visible', async () => {
    const { service, prisma } = buildService([]);
    const deliverableFindMany = prisma.deliverable.findMany as unknown as jest.Mock;

    const result = await service.getSchedule({ id: 'user-consultant', role: 'CONSULTANT' }, from, to);

    expect(deliverableFindMany).not.toHaveBeenCalled();
    expect(result.projects).toEqual([]);
    expect(result.deliverables).toEqual([]);
  });

  it('serializes deadlines as ISO strings and passes the range as gte/lt', async () => {
    const { service, prisma } = buildService(
      [projectA],
      [
        {
          id: 'deliverable-1',
          title: 'Week 1 Memo',
          deadline: new Date('2026-10-10T17:00:00.000Z'),
          projectId: 'project-a',
          status: 'IN_PROGRESS',
        },
      ],
    );
    const deliverableFindMany = prisma.deliverable.findMany as unknown as jest.Mock;

    const result = await service.getSchedule({ id: 'user-admin', role: 'ADMIN' }, from, to);

    const deliverableArgs = deliverableFindMany.mock.calls[0][0];
    expect(deliverableArgs.where.deadline).toEqual({ gte: from, lt: to });
    expect(deliverableArgs.orderBy).toBeDefined();

    expect(result.deliverables).toEqual([
      {
        id: 'deliverable-1',
        title: 'Week 1 Memo',
        deadline: '2026-10-10T17:00:00.000Z',
        projectId: 'project-a',
        status: 'IN_PROGRESS',
      },
    ]);
  });
});
