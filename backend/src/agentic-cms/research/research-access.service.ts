import { Injectable, NotFoundException } from '@nestjs/common';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CmsReadAccessService, CmsReader } from '../authorization/cms-read-access.service';

@Injectable()
export class ResearchAccessService {
  constructor(
    private readonly access: CmsReadAccessService,
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}

  async check(user: CmsReader, projectId: string, deliverableId: string, write = false) {
    // Reuse CMS project membership, draft visibility and nested-project scopes.
    const scope = await this.access.deliverableScope(user, projectId);
    this.flags.assertAgenticCmsEnabledFor(user.email);
    const deliverable = await this.prisma.deliverable.findFirst({
      where: { AND: [scope.where, { id: deliverableId }] },
      select: {
        assigneeId: true,
        assignments: { where: { userId: user.id }, select: { userId: true }, take: 1 },
        project: { select: { pmId: true } },
      },
    });
    if (!deliverable) this.deny();
    const canEdit = user.role === 'ADMIN' || user.role === 'LC'
      || (user.role === 'PM' && deliverable.project.pmId === user.id)
      || (user.role === 'CONSULTANT' && (deliverable.assigneeId === user.id || deliverable.assignments.length > 0));
    this.flags.assertAgenticCmsEnabledFor(user.email);
    if (write && !canEdit) this.deny();
    return canEdit;
  }

  private deny(): never {
    throw new NotFoundException({ code: 'NOT_FOUND_OR_FORBIDDEN', message: 'The requested research is unavailable.' });
  }
}
