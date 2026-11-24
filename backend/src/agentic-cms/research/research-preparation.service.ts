import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CmsReadAccessService, CmsReader } from '../authorization/cms-read-access.service';
import { ResearchAccessService } from './research-access.service';
import { ResearchDocumentAdapter } from './research-document.adapter';

const LEASE_MS = 2 * 60_000;

@Injectable()
export class ResearchPreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly reads: CmsReadAccessService,
    private readonly access: ResearchAccessService,
    private readonly documents: ResearchDocumentAdapter,
  ) {}

  private async released(user: CmsReader, projectId: string, deliverableId: string, write: boolean) {
    const canEdit = await this.access.check(user, projectId, deliverableId, write);
    this.flags.assertAgenticCmsEnabledFor(user.email);
    const deliverable = await this.prisma.deliverable.findFirst({
      where: { id: deliverableId, projectId },
      select: { sprint: { select: { projectId: true, status: true } } },
    });
    this.flags.assertAgenticCmsEnabledFor(user.email);
    const isReleased = deliverable?.sprint?.projectId === projectId && deliverable.sprint.status === 'RELEASED';
    if (write && !isReleased) throw new NotFoundException({ code: 'WORKSTREAM_NOT_RELEASED', message: 'Release this workstream before preparing research.' });
    return { canEdit, isReleased };
  }

  async status(user: CmsReader, projectId: string, deliverableId: string) {
    await this.access.check(user, projectId, deliverableId);
    this.flags.assertAgenticCmsEnabledFor(user.email);
    const [record, workspace] = await Promise.all([
      this.prisma.researchPreparation.findUnique({ where: { deliverableId } }),
      this.prisma.researchWorkspace.findUnique({ where: { deliverableId }, select: { id: true } }),
    ]);
    const { canEdit, isReleased } = await this.released(user, projectId, deliverableId, false);
    // Step 3 prepares only the blank document. Its existence is authoritative,
    // including manual initialization or a save followed by a status-write failure.
    const state = workspace ? 'READY' : record?.status === 'READY' ? 'FAILED' : record?.status ?? 'NOT_STARTED';
    const interrupted = state === 'PREPARING' && (!record?.leaseExpiresAt || record.leaseExpiresAt <= new Date());
    return {
      state, attempts: record?.attempts ?? 0,
      lastAttemptAt: record?.lastAttemptAt ?? null, completedAt: record?.completedAt ?? null,
      interrupted,
      canRetry: canEdit && isReleased && state !== 'READY' && (state !== 'PREPARING' || interrupted),
      message: state === 'FAILED' ? 'Research preparation could not finish. Retry to create the workspace.'
        : interrupted ? 'Research preparation was interrupted. Retry to continue.' : null,
    };
  }

  async prepare(user: CmsReader, projectId: string, deliverableId: string) {
    const assertWrite = async () => { await this.released(user, projectId, deliverableId, true); };
    await assertWrite();
    this.flags.assertAgenticCmsEnabledFor(user.email);
    const existing = await this.prisma.researchWorkspace.findUnique({ where: { deliverableId }, select: { id: true } });
    if (existing) return this.status(user, projectId, deliverableId);

    await assertWrite();
    await this.prisma.researchPreparation.createMany({ data: [{ deliverableId }], skipDuplicates: true });
    const token = randomUUID();
    const now = new Date();
    await assertWrite();
    const claim = await this.prisma.researchPreparation.updateMany({
      where: {
        deliverableId,
        // Another initializer may finish between the first read and this claim.
        deliverable: { researchWorkspace: { is: null } },
        OR: [
          { status: { in: ['PENDING', 'FAILED', 'READY'] } },
          { status: 'PREPARING', OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }] },
        ],
      },
      data: { status: 'PREPARING', attempts: { increment: 1 }, leaseToken: token,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS), lastAttemptAt: now, completedAt: null, errorCode: null },
    });
    if (!claim.count) return this.status(user, projectId, deliverableId);

    try {
      await this.documents.initialize(deliverableId, { authorId: user.id, assertWrite });
      await assertWrite();
      await this.prisma.researchPreparation.updateMany({
        where: { deliverableId, leaseToken: token },
        data: { status: 'READY', completedAt: new Date(), leaseToken: null, leaseExpiresAt: null, errorCode: null },
      });
    } catch {
      // Flag/access loss stops all further preparation writes. The lease can be
      // reclaimed later by an authorized retry, without a background worker.
      await assertWrite();
      await this.prisma.researchPreparation.updateMany({
        where: { deliverableId, leaseToken: token },
        data: { status: 'FAILED', leaseToken: null, leaseExpiresAt: null, errorCode: 'INITIALIZATION_FAILED' },
      });
    }
    return this.status(user, projectId, deliverableId);
  }

  async prepareReleasedWorkstream(user: CmsReader, projectId: string, sprintId: string) {
    this.flags.assertAgenticCmsEnabledFor(user.email);
    await this.reads.projectScope(user, projectId, 'deliverables');
    await this.reads.assertWorkstreamAccess(user, projectId, sprintId);
    this.flags.assertAgenticCmsEnabledFor(user.email);
    const sprint = await this.prisma.sprint.findFirst({ where: { id: sprintId, projectId, status: 'RELEASED' }, select: { id: true } });
    if (!sprint) return;
    this.flags.assertAgenticCmsEnabledFor(user.email);
    const deliverables = await this.prisma.deliverable.findMany({ where: { projectId, sprintId }, select: { id: true }, orderBy: { id: 'asc' } });
    for (const deliverable of deliverables) {
      this.flags.assertAgenticCmsEnabledFor(user.email);
      await this.prepare(user, projectId, deliverable.id);
    }
  }
}
