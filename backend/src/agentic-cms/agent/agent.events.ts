// Events streamed from POST /agentic-cms/chat as Server-Sent Events
export type AgentSource = { id: number; title: string; url: string };

export type AgentErrorKind = 'model' | 'rate_limit' | 'auth' | 'disabled' | 'internal';

export type AgentEvent =
  | { type: 'conversation'; id: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_end'; id: string; ok: boolean; note?: string }
  | { type: 'sources'; sources: AgentSource[] }
  | { type: 'error'; kind: AgentErrorKind; retryable: boolean; message: string }
  | { type: 'done' };

export type SendEvent = (event: AgentEvent) => void;