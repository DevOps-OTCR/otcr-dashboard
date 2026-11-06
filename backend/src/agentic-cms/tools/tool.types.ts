import type { z } from 'zod';
import type { AgentSource } from '../agent/agent.events';
import type { AgentUser } from '../agent/agent.types';

/**
 * Everything a tool may rely on. projectId/sprintId come from the request after
 * the controller checked project access — tools must use these, never a project
 * id chosen by the model, so a tool cannot reach another project's records.
 */
export interface ToolContext {
  user: AgentUser;
  projectId: string;
  sprintId?: string;
  signal: AbortSignal;
  /** Registers citable sources for this answer and returns their [n] numbers. */
  addSources(sources: Omit<AgentSource, 'id'>[]): number[];
}

export interface ToolOutput {
  /** What the model sees. Keep it compact; external text is untrusted data. */
  content: string;
  /** Optional short status for the UI, e.g. "5 results". */
  note?: string;
}

export interface AgentTool<Input extends z.ZodType = z.ZodType> {
  /** snake_case name the model calls. */
  readonly name: string;
  /** Tells the model when to use the tool. */
  readonly description: string;
  /** Validates the model's arguments; also generates the JSON schema sent to the model. */
  readonly input: Input;
  /** False hides the tool from the model (e.g. missing API key). Default true. */
  isAvailable?(): boolean | Promise<boolean>;
  /** Short progress label for the sidebar, e.g. `Searching the web for "x"`. */
  label(input: z.infer<Input>): string;
  run(input: z.infer<Input>, ctx: ToolContext): Promise<ToolOutput>;
}

/** An expected tool failure: `note` is shown to the user, `modelMessage` is returned to the model. */
export class ToolFailure extends Error {
  constructor(readonly note: string, readonly modelMessage: string) {
    super(note);
  }
}
