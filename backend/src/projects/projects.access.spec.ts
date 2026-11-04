import { 
    ForbiddenException, 
    NotFoundException,
} from '@nestjs/common';

import { ProjectsService } from './projects.service';

const project = { id: 'p1', pmId: 'pm-owner'};

function makeService(opts: {exists?: boolean; members?: string[]} = {}) {
    const { exists = true, members = [] } = opts;
    const prisma: any = {
        project: { findUnique: jest.fn(async () => (exists ? project : null))},
        projectMember: { findFirst: jest.fn(async ({ where }: any) => members.includes(where.userId) && where.leftAt === null ? { id: 'm' } : null), },
    };

    const service = new ProjectsService(prisma, {} as any);
    return { service, prisma };
}

const user = (id: string, role: string) => ({ id, role });

describe('ProjectsService.assertProjectAccess', () => {

  it.each(['ADMIN', 'LC', 'EXECUTIVE'])('lets %s see any project without a membership lookup', async (role) => {
    const { service, prisma } = makeService();
    await expect(service.assertProjectAccess('p1', user('x', role))).resolves.toEqual(project);
    expect(prisma.projectMember.findFirst).not.toHaveBeenCalled();
  });

  it('lets a PM see a project they own', async () => {
    const { service } = makeService();
    await expect(service.assertProjectAccess('p1', user('pm-owner', 'PM'))).resolves.toEqual(project);
  });

  it("does not let a PM see someone else's project unless they are a member", async () => {
    const { service } = makeService();
    await expect(service.assertProjectAccess('p1', user('pm-other', 'PM'))).rejects.toBeInstanceOf(ForbiddenException);

    const asMember = makeService({ members: ['pm-other'] });
    await expect(asMember.service.assertProjectAccess('p1', user('pm-other', 'PM'))).resolves.toEqual(project);
  });

  it('lets an active member consultant in', async () => {
    const { service } = makeService({ members: ['c1'] });
    await expect(service.assertProjectAccess('p1', user('c1', 'CONSULTANT'))).resolves.toEqual(project);
  });
  
  it.each(['CONSULTANT', 'PARTNER'])('blocks a %s who is not a member', async (role) => {
    const { service } = makeService({ members: ['someone-else'] });
    await expect(service.assertProjectAccess('p1', user('c2', role))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 (not 403) for a project that does not exist, even for admins', async () => {
    const { service } = makeService({ exists: false });
    await expect(service.assertProjectAccess('nope', user('a', 'ADMIN'))).rejects.toBeInstanceOf(NotFoundException);
  });
});

