import type { SendEvent } from './agent.events';

export type AgentUser = { id: string; email: string; role: string };

export type RunInput = {
  user: AgentUser;
  projectId: string;
  sprintId?: string;
  conversationId?: string;
  deliverableId?: string;
  /** From the user's approval button: run the stored write call this id names (see WriteApprovals). */
  approvalId?: string;
  message: string;
  signal: AbortSignal; // aborted when the browser disconnects
};

export type { SendEvent };