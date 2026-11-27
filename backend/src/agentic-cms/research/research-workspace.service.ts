import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ResearchWorkspace } from '@prisma/client';
import { CmsReader } from '../authorization/cms-read-access.service';
import { ResearchAccessService } from './research-access.service';
import { ResearchDocumentAdapter } from './research-document.adapter';
import { documentSchema, editSectionSchema, historySchema, parseResearch, restoreSchema, saveSchema } from './research.schemas';

@Injectable()
export class ResearchWorkspaceService {
  constructor(private readonly access: ResearchAccessService, private readonly documents: ResearchDocumentAdapter) {}

  private context(user: CmsReader, projectId: string, deliverableId: string) {
    return { authorId: user.id, assertWrite: async () => { await this.access.check(user, projectId, deliverableId, true); } };
  }

  private async response(user: CmsReader, projectId: string, deliverableId: string, workspace: ResearchWorkspace) {
    const canEdit = await this.access.check(user, projectId, deliverableId);
    return { ...workspace, projectId, storage: 'cms' as const, canEdit, document: documentSchema.parse(workspace.document) };
  }

  async initialize(user: CmsReader, projectId: string, deliverableId: string) {
    await this.access.check(user, projectId, deliverableId, true);
    return this.response(user, projectId, deliverableId,
      await this.documents.initialize(deliverableId, this.context(user, projectId, deliverableId)));
  }

  async read(user: CmsReader, projectId: string, deliverableId: string) {
    await this.access.check(user, projectId, deliverableId);
    let workspace: ResearchWorkspace;
    try {
      workspace = await this.documents.read(deliverableId);
    } catch (error) {
      if (error instanceof NotFoundException && (error.getResponse() as { code?: string }).code === 'WORKSPACE_NOT_INITIALIZED') {
        // Let the UI offer initialization only when the server permits editing.
        const canEdit = await this.access.check(user, projectId, deliverableId);
        throw new NotFoundException({ code: 'WORKSPACE_NOT_INITIALIZED', message: 'Research has not been initialized.', canEdit });
      }
      throw error;
    }
    return this.response(user, projectId, deliverableId, workspace);
  }

  async save(user: CmsReader, projectId: string, deliverableId: string, raw: unknown) {
    await this.access.check(user, projectId, deliverableId, true);
    const input = parseResearch(saveSchema, raw);
    return this.response(user, projectId, deliverableId,
      await this.documents.revise(deliverableId, input, this.context(user, projectId, deliverableId)));
  }

  async editSection(user: CmsReader, projectId: string, deliverableId: string, sectionId: string, raw: unknown) {
    await this.access.check(user, projectId, deliverableId, true);
    const { expectedVersion, ...changes } = parseResearch(editSectionSchema, raw);
    const workspace = await this.documents.read(deliverableId);
    if (workspace.version !== expectedVersion) {
      throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Research changed. Reload before saving or restoring.' });
    }
    const document = documentSchema.parse(workspace.document);
    const section = document.sections.find(section => section.id === sectionId);
    if (!section) throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Research section is unavailable.' });
    Object.assign(section, changes);
    const validated = parseResearch(documentSchema, document);
    return this.response(user, projectId, deliverableId,
      await this.documents.revise(deliverableId, { expectedVersion, document: validated }, this.context(user, projectId, deliverableId)));
  }

  async restore(user: CmsReader, projectId: string, deliverableId: string, raw: unknown) {
    await this.access.check(user, projectId, deliverableId, true);
    const input = parseResearch(restoreSchema, raw);
    return this.response(user, projectId, deliverableId,
      await this.documents.revise(deliverableId, input, this.context(user, projectId, deliverableId)));
  }

  async history(user: CmsReader, projectId: string, deliverableId: string, raw: unknown) {
    await this.access.check(user, projectId, deliverableId);
    const input = parseResearch(historySchema, raw);
    const result = await this.documents.history(deliverableId, input.beforeVersion, input.limit);
    await this.access.check(user, projectId, deliverableId);
    return result;
  }
}
