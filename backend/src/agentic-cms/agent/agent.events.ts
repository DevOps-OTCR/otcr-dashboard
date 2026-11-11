// Events streamed from POST /agentic-cms/chat as Server-Sent Events
export type AgentSource = { id: number; title: string; url: string };

// config = a server setting (key, model, consent) needs an admin; retrying will not help.
export type AgentErrorKind = 'model' | 'rate_limit' | 'auth' | 'config' | 'disabled' | 'internal';

export type AgentEvent =
  | { type: 'conversation'; id: string }
  | { type: 'text_delta'; text: string }
  // Replaces all of this reply's text so far, e.g. after the word-limit cut.
  | { type: 'text_replace'; text: string }
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_end'; id: string; ok: boolean; note?: string }
  | { type: 'sources'; sources: AgentSource[] }
  | { type: 'error'; kind: AgentErrorKind; retryable: boolean; message: string }
  | { type: 'done' };

export type SendEvent = (event: AgentEvent) => void;