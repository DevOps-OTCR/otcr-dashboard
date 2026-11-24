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
export type ResearchDeliverable = { id: string; title: string; sprint?: { label: string } | null };
const base = (projectId: string, deliverableId: string) =>
  `/agentic-cms/research/projects/${encodeURIComponent(projectId)}/deliverables/${encodeURIComponent(deliverableId)}`;

export const researchAPI = {
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
