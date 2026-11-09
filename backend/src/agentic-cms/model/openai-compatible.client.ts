import { Logger } from '@nestjs/common';
import OpenAI, { APIError } from 'openai';
import {
  AgentError,
  modelConfigProblem,
  modelQuotaExhausted,
  modelRateLimited,
  modelTimedOut,
  modelUnavailable,
} from '../agent/agent-errors';
import { assistantMessage, ModelClient, ModelRequest, ModelTurn, ToolCall } from './model-client';

// Uses the OpenAI SDK against any OpenAI-style /chat/completions endpoint that supports
// streaming + tool calling. Configured from the LUMEN_* settings in model.provider.ts:
//   LUMEN_BASE_URL   e.g. https://lumen.ncsa.illinois.edu/v1
//   LUMEN_API_KEY
//   LUMEN_MODEL      e.g. deepseek-v4.1-flash
// Lumen errors: https://lumen.ncsa.illinois.edu/help/api
// Spec: openai-compatible.client.spec.ts (runs against a local fake OpenAI server)
export class OpenAICompatibleClient implements ModelClient {
  readonly name = 'openai-compatible';
  private readonly log = new Logger('OtcrBotModel');
  private readonly client: OpenAI;

  constructor(
    baseUrl: string,
    apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 60_000,
  ) {
    this.client = new OpenAI({
      baseURL: baseUrl.replace(/\/+$/, ''),
      apiKey,
      organization: null, // don't pick up OPENAI_* settings from the server's environment
      project: null,
      maxRetries: 0, // failures go straight to the user with a clear message and a Retry button
      logLevel: 'off', // SDK logs can include response text; see the logging rule in httpError
      fetch: keepTopLevelErrorCode,
    });
  }

  async stream(req: ModelRequest, onText: (delta: string) => void): Promise<ModelTurn> {
    // The SDK's own timeout stops once headers arrive, so this signal covers the whole stream.
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = AbortSignal.any([req.signal, timeout]);
    let text = '';
    const calls = new Map<number, { id: string; name: string; args: string }>();
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          stream: true,
          messages: [{ role: 'system', content: req.system }, ...req.messages],
          ...(req.tools.length
            ? { tools: req.tools.map((t) => ({ type: 'function' as const, function: t })), tool_choice: 'auto' as const }
            : {}),
        },
        { signal },
      );
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          text += delta.content;
          onText(delta.content);
        }
        for (const tc of delta.tool_calls ?? []) {
          const cur = calls.get(tc.index) ?? { id: '', name: '', args: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          calls.set(tc.index, cur);
        }
      }
    } catch (e) {
      throw e instanceof APIError && e.status ? this.httpError(e) : this.networkError(e, timeout);
    }

    const toolCalls: ToolCall[] = [...calls.values()].map((c, i) => ({
      id: c.id || `call_${i}`,
      name: c.name,
      args: parseArgs(c.args),
    }));
    return { text, toolCalls, message: assistantMessage(text, toolCalls) };
  }

  private networkError(e: unknown, timeout: AbortSignal): AgentError {
    const error = timeout.aborted ? modelTimedOut(e) : modelUnavailable(e);
    this.log.warn(`Model request failed: ${timeout.aborted ? 'timeout' : 'network or stream error'}`);
    return error;
  }

  /** Maps Lumen's documented statuses/codes to clear errors. Logs only status + code, never bodies or keys. */
  private httpError(e: APIError): AgentError {
    const status = e.status as number;
    const code = typeof e.code === 'string' && /^[a-z0-9_.-]{1,64}$/i.test(e.code) ? e.code : undefined;
    this.log.warn(`Model request failed: HTTP ${status}${code ? ` (${code})` : ''}`);
    const cause = `HTTP ${status}${code ? ` ${code}` : ''}`;
    if (status === 401) return modelConfigProblem('auth', cause);
    if (status === 403) return modelConfigProblem(code === 'consent_required' ? 'consent' : 'access', cause);
    if (status === 404) return modelConfigProblem('model', cause);
    if (status === 429) return code === 'insufficient_quota' ? modelQuotaExhausted(cause) : modelRateLimited(cause);
    if (status === 408 || status === 504) return modelTimedOut(cause);
    return modelUnavailable(cause);
  }
}

function parseArgs(raw: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _unparsed: raw }; // zod validation will reject it and tell the model
  }
}

/** The SDK reads only `error.code`, but an error body can also put `code` at the top level. */
const keepTopLevelErrorCode: typeof fetch = async (url, init) => {
  const res = await fetch(url, init);
  if (res.ok) return res;
  const raw = await res.text();
  let body = raw;
  try {
    const parsed = JSON.parse(raw) as { code?: unknown; error?: unknown };
    if (parsed && !parsed.error && parsed.code) body = JSON.stringify({ error: { code: parsed.code } });
  } catch {
    // Not JSON: the SDK handles a plain-text error body.
  }
  return new Response(body, { status: res.status, headers: res.headers });
};
