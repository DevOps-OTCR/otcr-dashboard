import { api } from '@/lib/api';

// Mirrors backend/src/agentic-cms/agent/agent.events.ts
export type AgentSource = { id: number; title: string; url: string };
export type AgentErrorKind = 'model' | 'rate_limit' | 'auth' | 'config' | 'disabled' | 'internal';
export type AgentEvent =
  | { type: 'conversation'; id: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_end'; id: string; ok: boolean; note?: string }
  | { type: 'sources'; sources: AgentSource[] }
  | { type: 'error'; kind: AgentErrorKind; retryable: boolean; message: string }
  | { type: 'done' };

export type ChatRequest = { projectId: string; sprintId?: string; conversationId?: string; message: string };

/** A request that failed before the stream started (HTTP error or network). */
export class ChatRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

function httpErrorMessage(status: number): ChatRequestError {
  if (status === 401 || status === 403) return new ChatRequestError("You don't have access to OTCR Bot for this project.", false);
  if (status === 404) return new ChatRequestError('OTCR Bot is turned off right now.', false);
  if (status === 400) return new ChatRequestError("That message couldn't be sent. Check its length and try again.", false);
  if (status === 429) return new ChatRequestError('Too many requests. Try again in a minute.', true);
  return new ChatRequestError("Couldn't reach OTCR Bot. Try again.", true);
}

/**
 * POSTs a message and calls onEvent for each Server-Sent Event. EventSource
 * cannot POST or send an Authorization header, so this reads the fetch body.
 * The provider key never reaches the browser; only the user's CMS token is sent.
 */
export async function streamChat(
  body: ChatRequest,
  token: string,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const base = (api.defaults.baseURL ?? '').replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/agentic-cms/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ChatRequestError("Couldn't reach the server. Check your connection and try again.", true);
  }
  if (!res.ok || !res.body) throw httpErrorMessage(res.status);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue; // heartbeat comments
      try {
        onEvent(JSON.parse(data) as AgentEvent);
      } catch {
        // Ignore a malformed frame rather than breaking the conversation.
      }
    }
  }
}
