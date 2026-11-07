import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CmsReadAccessService, CmsReader } from './cms-read-access.service';

describe('CMS read authorization', () => {
  let settings: Record<string, string>;
  let service: CmsReadAccessService;
  const prisma = {
    project: { findUnique: jest.fn() },
    sprint: { findFirst: jest.fn() },
    deliverable: { findFirst: jest.fn() },
  };
  const user = (role: Role = 'CONSULTANT'): CmsReader => ({ id: 'reader', email: 'pilot@illinois.edu', role });
  beforeEach(() => {
    jest.resetAllMocks();
    settings = { AGENTIC_CMS_ENABLED: 'true' };
    const flags = new FeatureFlagsService({ get: (key: string) => settings[key] } as ConfigService);
    service = new CmsReadAccessService(prisma as unknown as PrismaService, flags);
    prisma.project.findUnique.mockResolvedValue({ id: 'project', pmId: 'other', members: [] });
  });

  const matrix: [Role, boolean, boolean, boolean][] = [
    ['ADMIN', true, true, true], ['LC', true, false, true],
    ['EXECUTIVE', true, false, false], ['PM', false, false, true],
    ['CONSULTANT', false, false, false], ['PARTNER', false, false, false],
  ];
  describe.each(matrix)('%s', (role, broadWorkstreams, broadDeliverables, drafts) => {
    it.each(['none', 'member', 'owner'])('enforces %s access and draft filters', async relation => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'project', pmId: relation === 'owner' ? 'reader' : 'other',
        members: relation === 'member' ? [{ userId: 'reader' }] : [],
      });
      const workstreams = service.workstreamScope(user(role), 'project');
      if (broadWorkstreams || relation === 'member' || (relation === 'owner' && role === 'PM')) {
        await expect(workstreams).resolves.toMatchObject({
          canReadDrafts: drafts,
          canReadDeliverables: broadDeliverables || relation !== 'none',
          where: drafts ? { projectId: 'project' } : { projectId: 'project', status: 'RELEASED' },
        });
      } else await expect(workstreams).rejects.toBeInstanceOf(NotFoundException);
      const deliverables = service.deliverableScope(user(role), 'project');
      if (broadDeliverables || relation !== 'none') {
        const access = await deliverables;
        expect(access.where).toEqual(drafts
          ? { projectId: 'project', OR: [{ sprintId: null }, { sprint: { is: { projectId: 'project' } } }] }
          : { projectId: 'project', sprint: { is: { projectId: 'project', status: 'RELEASED' } } });
      } else await expect(deliverables).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project' },
        select: { id: true, pmId: true, members: { where: { userId: 'reader', leftAt: null }, select: { userId: true }, take: 1 } },
      });
    });
  });

  it.each([undefined, 'false', 'TRUE', '1'])('blocks reads with flag %s', async value => {
    settings.AGENTIC_CMS_ENABLED = value;
    await expect(service.assertWorkstreamAccess(user(), 'project', 'week')).rejects.toThrow();
    await expect(service.assertDeliverableAccess(user(), 'project', 'item')).rejects.toThrow();
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expect(prisma.sprint.findFirst).not.toHaveBeenCalled();
    expect(prisma.deliverable.findFirst).not.toHaveBeenCalled();
  });

  it('blocks a non-pilot before authorization queries', async () => {
    settings.AGENTIC_CMS_ALLOWED_EMAILS = 'other@illinois.edu';
    await expect(service.workstreamScope(user('ADMIN'), 'project')).rejects.toThrow();
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it('denies unknown roles before queries', async () => {
    await expect(service.workstreamScope({ ...user(), role: 'UNKNOWN' as Role }, 'project')).rejects.toThrow();
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it('rechecks membership instead of caching permission between calls', async () => {
    prisma.project.findUnique.mockResolvedValueOnce({ id: 'project', pmId: 'other', members: [{ userId: 'reader' }] });
    await expect(service.deliverableScope(user(), 'project')).resolves.toBeDefined();
    await expect(service.deliverableScope(user(), 'project')).rejects.toThrow();
  });

  it('uses the same safe error for missing and inaccessible projects', async () => {
    for (const project of [null, { id: 'project', pmId: 'other', members: [] }]) {
      prisma.project.findUnique.mockResolvedValue(project);
      await expect(service.deliverableScope(user(), 'project')).rejects.toMatchObject({
        response: { code: 'NOT_FOUND_OR_FORBIDDEN', message: 'The requested CMS record is unavailable.' },
      });
    }
  });

  it('scopes individual workstreams and deliverables before reading record data', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'project', pmId: 'other', members: [{ userId: 'reader' }] });
    prisma.sprint.findFirst.mockResolvedValue({ id: 'week' });
    prisma.deliverable.findFirst.mockResolvedValue({ id: 'item' });
    await service.assertWorkstreamAccess(user(), 'project', 'week');
    await service.assertDeliverableAccess(user(), 'project', 'item');
    expect(prisma.sprint.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ projectId: 'project', status: 'RELEASED' }, { id: 'week' }] }, select: { id: true },
    });
    expect(prisma.deliverable.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ projectId: 'project', sprint: { is: { projectId: 'project', status: 'RELEASED' } } }, { id: 'item' }] },
      select: { id: true },
    });
    prisma.sprint.findFirst.mockResolvedValue(null);
    prisma.deliverable.findFirst.mockResolvedValue(null);
    await expect(service.assertWorkstreamAccess(user(), 'project', 'cross-project-or-draft')).rejects.toThrow();
    await expect(service.assertDeliverableAccess(user(), 'project', 'cross-project-or-draft')).rejects.toThrow();
  });

  it('rechecks the flag between project authorization and a child operation', async () => {
    prisma.project.findUnique.mockImplementation(async () => {
      settings.AGENTIC_CMS_ENABLED = 'false';
      return { id: 'project', pmId: 'reader', members: [] };
    });
    await expect(service.assertDeliverableAccess(user(), 'project', 'item')).rejects.toThrow();
    expect(prisma.deliverable.findFirst).not.toHaveBeenCalled();
  });
});
