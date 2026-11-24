import { api } from '@/lib/api';

export type ResearchTab = 'past-data' | 'framework' | 'findings';
export type ResearchSection = { id: string; tab: ResearchTab; title: string; content: string; sourceIds: string[] };
export type ResearchDocument = {
  schemaVersion: 1;
  sections: ResearchSection[];
  sources: { id: string; title: string; url: string }[];
};
export type ResearchWorkspace = {
  id: string; projectId: string; deliverableId: string; version: number;
  document: ResearchDocument; canEdit: boolean; storage: 'cms'; updatedAt: string;
};
export type ResearchRevision = {
  version: number; action: 'INITIALIZE' | 'EDIT' | 'RESTORE';
  restoredFromVersion: number | null; authorId: string | null; createdAt: string;
};
export type ResearchHistory = { items: ResearchRevision[]; nextBeforeVersion: number | null };
export type ResearchPreparation = {
  state: 'NOT_STARTED' | 'PENDING' | 'PREPARING' | 'READY' | 'FAILED';
  attempts: number; lastAttemptAt: string | null; completedAt: string | null;
  interrupted: boolean; canRetry: boolean; message: string | null;
};
export type ResearchDeliverable = {
  id: string; title: string; sprintId?: string | null;
  sprint?: { id: string; label: string; sequenceNumber?: number; weekStartDate?: string } | null;
};
export type PastDataSource = {
  id: string; kind: string; recordId: string; title: string; text: string; date: string; url: string; truncated: boolean;
};
export type PastDataPreview = {
  sources: PastDataSource[];
  diagnostics: { candidatesConsidered: number; sourcesSent: number; queryTerms: string[]; limitsReached: boolean; linkedFilesRead: boolean };
};
export type PastDataStatus = {
  state: 'NOT_STARTED' | 'PENDING' | 'RUNNING' | 'READY' | 'FAILED' | 'CONFLICT';
  focus: string; attempts: number; model: string | null; modelConfigured: boolean;
  canGenerate: boolean; released: boolean; interrupted: boolean; message: string | null;
  result: null | { items: { sourceId: string; summary: string; whyRelevant: string; quote: string; source: PastDataSource }[];
    gaps: string[]; sparse: boolean; focus?: string; model?: string; diagnostics: PastDataPreview['diagnostics']; savedVersion: number; generatedAt: string };
};
const base = (projectId: string, deliverableId: string) =>
  `/agentic-cms/research/projects/${encodeURIComponent(projectId)}/deliverables/${encodeURIComponent(deliverableId)}`;

export const researchAPI = {
  async pastDataStatus(projectId: string, deliverableId: string) {
    return (await api.get<PastDataStatus>(`${base(projectId, deliverableId)}/past-data`)).data;
  },
  async previewPastData(projectId: string, deliverableId: string, focus: string) {
    return (await api.post<PastDataPreview>(`${base(projectId, deliverableId)}/past-data/preview`, { focus })).data;
  },
  async generatePastData(projectId: string, deliverableId: string, expectedVersion: number, focus: string) {
    return (await api.post<PastDataStatus>(`${base(projectId, deliverableId)}/past-data/generate`, { focus, expectedVersion })).data;
  },
  async pastDataSource(projectId: string, deliverableId: string, kind: string, recordId: string) {
    return (await api.get<PastDataSource>(`${base(projectId, deliverableId)}/past-data/source`, { params: { kind, recordId } })).data;
  },
  async preparation(projectId: string, deliverableId: string) {
    return (await api.get<ResearchPreparation>(`${base(projectId, deliverableId)}/preparation`)).data;
  },
  async retryPreparation(projectId: string, deliverableId: string) {
    return (await api.post<ResearchPreparation>(`${base(projectId, deliverableId)}/preparation/retry`)).data;
  },
  async deliverables(projectId: string): Promise<ResearchDeliverable[]> {
    const items: ResearchDeliverable[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const { data } = await api.get<{ deliverables: ResearchDeliverable[]; pagination: { totalPages: number } }>('/deliverables', {
        params: { projectId, page, limit: 50 },
      });
      items.push(...data.deliverables);
      totalPages = data.pagination.totalPages;
      page += 1;
    } while (page <= totalPages);
    return items;
  },
  async read(projectId: string, deliverableId: string) {
    return (await api.get<ResearchWorkspace>(base(projectId, deliverableId))).data;
  },
  async initialize(projectId: string, deliverableId: string) {
    return (await api.post<ResearchWorkspace>(base(projectId, deliverableId))).data;
  },
  async save(projectId: string, deliverableId: string, expectedVersion: number, document: ResearchDocument) {
    return (await api.put<ResearchWorkspace>(base(projectId, deliverableId), { expectedVersion, document })).data;
  },
  async history(projectId: string, deliverableId: string, beforeVersion?: number) {
    return (await api.get<ResearchHistory>(`${base(projectId, deliverableId)}/revisions`, { params: { limit: 10, beforeVersion } })).data;
  },
  async restore(projectId: string, deliverableId: string, expectedVersion: number, targetVersion: number) {
    return (await api.post<ResearchWorkspace>(`${base(projectId, deliverableId)}/restore`, { expectedVersion, targetVersion })).data;
  },
};

export function researchFailure(error: unknown) {
  const response = (error as { response?: { status?: number; data?: { code?: string; canEdit?: boolean } } } | null)?.response;
  return { status: response?.status, code: response?.data?.code, canEdit: response?.data?.canEdit === true };
}
