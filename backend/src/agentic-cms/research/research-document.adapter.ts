import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ResearchRevisionAction, ResearchWorkspace } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { emptyResearchDocument, ResearchDocument } from './research.schemas';

export type ResearchWriteContext = { authorId: string; assertWrite: () => Promise<void> };
type RevisionInput = { expectedVersion: number; targetVersion?: number; document?: ResearchDocument };

// Keep storage out of controllers/tools. This step uses CMS-native documents;
// a future external adapter must preserve version checks and revision history.
export abstract class ResearchDocumentAdapter {
  abstract read(deliverableId: string): Promise<ResearchWorkspace>;
  abstract initialize(deliverableId: string, context: ResearchWriteContext): Promise<ResearchWorkspace>;
  abstract revise(deliverableId: string, input: RevisionInput, context: ResearchWriteContext): Promise<ResearchWorkspace>;
  abstract history(deliverableId: string, beforeVersion: number | undefined, limit: number): Promise<{
    items: { version: number; action: ResearchRevisionAction; restoredFromVersion: number | null; authorId: string | null; createdAt: Date }[];
    nextBeforeVersion: number | null;
  }>;
}

@Injectable()
export class CmsResearchDocumentAdapter extends ResearchDocumentAdapter {
  constructor(private readonly prisma: PrismaService) { super(); }

  async read(deliverableId: string) {
    const workspace = await this.prisma.researchWorkspace.findUnique({ where: { deliverableId } });
    if (!workspace) throw new NotFoundException({ code: 'WORKSPACE_NOT_INITIALIZED', message: 'Research has not been initialized.' });
    return workspace;
  }

  async initialize(deliverableId: string, context: ResearchWriteContext) {
    await context.assertWrite();
    const document = emptyResearchDocument();
    // The unique deliverable key makes parallel initialization idempotent.
    // Nested creation commits the initial snapshot and workspace together.
    try {
      return await this.prisma.researchWorkspace.upsert({
        where: { deliverableId }, update: {},
        create: {
          deliverableId, document,
          revisions: { create: { version: 1, document, action: 'INITIALIZE', authorId: context.authorId } },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.read(deliverableId);
      }
      throw error;
    }
  }

  async revise(deliverableId: string, input: RevisionInput, context: ResearchWriteContext) {
    return this.prisma.$transaction(async tx => {
      const workspace = await tx.researchWorkspace.findUnique({ where: { deliverableId } });
      if (!workspace) throw new NotFoundException({ code: 'WORKSPACE_NOT_INITIALIZED', message: 'Research has not been initialized.' });
      if (workspace.version !== input.expectedVersion) this.conflict();
      let document: Prisma.InputJsonValue = input.document;
      if (input.targetVersion !== undefined) {
        const revision = await tx.researchRevision.findUnique({
          where: { workspaceId_version: { workspaceId: workspace.id, version: input.targetVersion } },
        });
        if (!revision) throw new NotFoundException({ code: 'REVISION_NOT_FOUND', message: 'Research revision is unavailable.' });
        document = revision.document as Prisma.InputJsonValue;
      }
      // Recheck flag, membership, visibility and assignment immediately before writing.
      await context.assertWrite();
      const changed = await tx.researchWorkspace.updateMany({
        where: { id: workspace.id, version: input.expectedVersion },
        data: { document, version: { increment: 1 } },
      });
      if (changed.count !== 1) this.conflict();
      await tx.researchRevision.create({
        data: {
          workspaceId: workspace.id, version: input.expectedVersion + 1, document,
          action: input.targetVersion === undefined ? 'EDIT' : 'RESTORE',
          restoredFromVersion: input.targetVersion, authorId: context.authorId,
        },
      });
      return tx.researchWorkspace.findUniqueOrThrow({ where: { id: workspace.id } });
    });
  }

  async history(deliverableId: string, beforeVersion: number | undefined, limit: number) {
    const workspace = await this.read(deliverableId);
    const rows = await this.prisma.researchRevision.findMany({
      where: { workspaceId: workspace.id, ...(beforeVersion === undefined ? {} : { version: { lt: beforeVersion } }) },
      select: { version: true, action: true, restoredFromVersion: true, authorId: true, createdAt: true },
      orderBy: { version: 'desc' }, take: limit + 1,
    });
    const items = rows.slice(0, limit);
    return { items, nextBeforeVersion: rows.length > limit ? items[items.length - 1].version : null };
  }

  private conflict(): never {
    throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Research changed. Reload before saving or restoring.' });
  }
}
