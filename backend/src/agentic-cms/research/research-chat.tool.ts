import type { CmsReader } from '../authorization/cms-read-access.service';
import { Injectable, HttpException } from '@nestjs/common';
import { z } from 'zod';
import { RunInput, SendEvent } from '../agent/agent.types';
import { AgentTool, ToolFailure, ToolOutput } from '../tools/tool.types';
import { researchEditInput } from './research-edit.schemas';
import { ResearchEditService } from './research-edit.service';

export const researchChatContext = z.strictObject({
  deliverableId: z.string().min(1).max(100), expectedVersion: researchEditInput.shape.expectedVersion,
  editingBlocked: z.boolean().default(false),
  pending: researchEditInput.omit({ expectedVersion: true }).optional(),
});
export type ResearchChatContext = z.infer<typeof researchChatContext>;
export type ResearchChatResult =
  | { status: 'saved'; summary: string; changes: string[]; previousVersion: number; savedVersion: number }
  | { status: 'clarification'; question: string; pending: { prompt: string; clarifications: { question: string; answer: string }[] } }
  | { status: 'no_change'; message: string };

@Injectable()
export class ResearchChatTool {
  constructor(private readonly edits: ResearchEditService) {}
  forTurn(input: RunInput, send: SendEvent): AgentTool[] {
    const selected = input.research;
    if (!selected) return [];
    let result: Promise<ToolOutput> | undefined;
    return [{
      name: 'edit_research_workspace',
      description: 'Apply the current user message as an edit to the selected research workspace, or resolve its pending clarification. Use for explicit requests to change saved research, buckets, questions, or findings. Do not use for discussion or new research. No arguments: the server uses the actual user request and selected deliverable. At most one edit per user turn.',
      input: z.strictObject({}), label: () => 'Editing selected research workspace…',
      run: async () => {
        if (selected.editingBlocked) throw new ToolFailure('Research editing blocked', 'No changes were made. Ask the user to save or discard manual drafts, finish other operations, or reload after a version conflict. Read-only workspaces cannot be edited.');
        // Repeated calls in one model turn reuse the same result, never apply twice.
        return result ??= (async () => {
          try {
            const response = await this.edits.edit(input.user as CmsReader, input.projectId, selected.deliverableId, {
              expectedVersion: selected.expectedVersion,
              prompt: selected.pending?.prompt ?? input.message,
              clarifications: selected.pending?.clarifications ?? [],
            }, input.signal);
            const out: ResearchChatResult = response.status === 'saved'
              ? { status: 'saved', summary: response.summary, changes: response.changes, previousVersion: response.previousVersion, savedVersion: response.savedVersion }
              : response.status === 'clarification'
                ? { ...response, pending: { prompt: selected.pending?.prompt ?? input.message, clarifications: selected.pending?.clarifications ?? [] } }
                : response;
            send({ type: 'research_edit', projectId: input.projectId, deliverableId: selected.deliverableId, result: out });
            return { content: JSON.stringify(out), note: out.status === 'saved' ? `Saved version ${out.savedVersion}` : out.status === 'clarification' ? 'Clarification needed; nothing saved' : 'No changes saved' };
          } catch (error) {
            if (input.signal.aborted) throw error;
            const response = error instanceof HttpException ? error.getResponse() : undefined;
            const code = response && typeof response === 'object' && 'code' in response ? String(response.code) : '';
            const messages: Record<string, string> = {
              VERSION_CONFLICT: 'Research changed elsewhere. No bot edits were saved. Reload saved research and start a new chat.',
              SOURCE_CHANGED: 'The assignment changed. No bot edits were saved. Reload and start a new chat.',
              MODEL_NOT_CONFIGURED: 'Configure your local Lumen key and restart the backend.',
              INVALID_ARGUMENT: 'Keep edit requests under 4,000 characters and clarification answers under 2,000 characters, with at most three answers.',
              EDIT_BUSY: 'Research editing is busy or its hourly limit was reached. Try later.',
            };
            throw new ToolFailure('Research edit could not finish', messages[code] ?? 'Research editing could not finish or access changed. No bot edits were saved. Check access and retry.');
          }
        })();
      },
    }];
  }
}
