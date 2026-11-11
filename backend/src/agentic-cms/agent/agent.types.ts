import type { SendEvent } from './agent.events';

export type AgentUser = { id: string; email: string; role: string };

export type RunInput = {
  user: AgentUser;
  projectId: string;
  sprintId?: string;
  conversationId?: string;
  message: string;
  signal: AbortSignal; // aborted when the browser disconnects
};

export type { SendEvent };