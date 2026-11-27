import type { ResearchEditClarification } from './research-api';

export type ResearchChatTarget = {
  projectId: string; projectName?: string; workstreamTitle?: string; deliverableId: string; title: string; sprintId?: string; version: number;
  blocked: boolean; setBusy: (busy: boolean) => void;
  refresh: () => Promise<void>;
  undo: (expectedVersion: number, targetVersion: number) => Promise<boolean>;
};
export type ResearchChatResult =
  | { status: 'saved'; summary: string; changes: string[]; previousVersion: number; savedVersion: number }
  | { status: 'clarification'; question: string; pending: { prompt: string; clarifications: ResearchEditClarification[] } }
  | { status: 'no_change'; message: string };
export type ResearchChatRequest = {
  deliverableId: string; expectedVersion: number; editingBlocked: boolean;
  pending?: { prompt: string; clarifications: ResearchEditClarification[] };
};
