import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';

// Supply this from authenticated request.user, never from tool arguments.
export type CmsReader = Pick<User, 'id' | 'email' | 'role'>;

const roles = new Set(['ADMIN', 'LC', 'EXECUTIVE', 'PM', 'CONSULTANT', 'PARTNER']);
const draftRoles = new Set(['ADMIN', 'LC', 'PM']);

@Injectable()
export class CmsReadAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}

  private deny(): never {
    throw new NotFoundException({
      code: 'NOT_FOUND_OR_FORBIDDEN',
      message: 'The requested CMS record is unavailable.',
    });
  }

  private checkFeature(user: CmsReader): void {
    this.flags.assertAgenticCmsEnabledFor(user?.email);
    if (!user?.id || !roles.has(user.role)) this.deny();
  }

  async projectScope(user: CmsReader, projectId: string, resource: 'workstreams' | 'deliverables') {
    this.checkFeature(user);
    // Read only authorization metadata, not client context or full project records.
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        pmId: true,
        members: { where: { userId: user.id, leftAt: null }, select: { userId: true }, take: 1 },
      },
    });
    if (!project) this.deny();
    const canReadDeliverables = user.role === 'ADMIN' || project.pmId === user.id || project.members.length > 0;
    const canReadWorkstreams = ['ADMIN', 'LC', 'EXECUTIVE'].includes(user.role)
      || (user.role === 'PM' && project.pmId === user.id) || project.members.length > 0;
    if (resource === 'workstreams' ? !canReadWorkstreams : !canReadDeliverables) this.deny();
    return { projectId: project.id, canReadDrafts: draftRoles.has(user.role), canReadDeliverables };
  }

  async assertContextWrite(user: CmsReader, projectId: string) {
    const access = await this.projectScope(user, projectId, 'deliverables');
    if (user.role !== 'ADMIN' && user.role !== 'LC' && user.role !== 'PM') {
      this.deny();
    }
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { pmId: true } });
    if (!project || (user.role === 'PM' && project.pmId !== user.id)) this.deny();
  }

  async workstreamScope(user: CmsReader, projectId: string) {
    const access = await this.projectScope(user, projectId, 'workstreams');
    const where: Prisma.SprintWhereInput = {
      projectId,
      ...(access.canReadDrafts ? {} : { status: 'RELEASED' }),
    };
    return { ...access, where };
  }

  async deliverableScope(user: CmsReader, projectId: string) {
    const access = await this.projectScope(user, projectId, 'deliverables');
    const where: Prisma.DeliverableWhereInput = {
      projectId,
      // Check linked sprint project as well as its visibility; null sprints are
      // visible only to managers, following existing deliverable detail rules.
      ...(access.canReadDrafts
        ? { OR: [{ sprintId: null }, { sprint: { is: { projectId } } }] }
        : { sprint: { is: { projectId, status: 'RELEASED' } } }),
    };
    return { ...access, where };
  }

  async assertWorkstreamAccess(user: CmsReader, projectId: string, workstreamId: string) {
    const access = await this.workstreamScope(user, projectId);
    this.checkFeature(user);
    const record = await this.prisma.sprint.findFirst({
      where: { AND: [access.where, { id: workstreamId }] },
      select: { id: true },
    });
    if (!record) this.deny();
    return access;
  }

  async assertDeliverableAccess(user: CmsReader, projectId: string, deliverableId: string) {
    const access = await this.deliverableScope(user, projectId);
    this.checkFeature(user);
    const record = await this.prisma.deliverable.findFirst({
      where: { AND: [access.where, { id: deliverableId }] },
      select: { id: true },
    });
    if (!record) this.deny();
    return access;
  }
}
