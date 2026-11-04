import { modelRateLimited, modelUnavailable } from '../agent/agent-errors';
import { assistantMessage, ModelClient, ModelRequest, ModelTurn, ToolCall } from './model-client';

// Works with any OpenAI-style /chat/completions endpoint that supports streaming + tool calling.
// Configured from the LUMEN_* settings in model.provider.ts:
//   LUMEN_BASE_URL   e.g. https://lumen.ncsa.illinois.edu/v1
//   LUMEN_API_KEY
//   LUMEN_MODEL      e.g. deepseek-v4.1-flash
// Spec: openai-compatible.client.spec.ts (runs against a local fake OpenAI server)
export class OpenAICompatibleClient implements ModelClient {
  readonly name = 'openai-compatible';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 60_000,
  ) {}

  async stream(req: ModelRequest, onText: (delta: string) => void): Promise<ModelTurn> {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(this.timeoutMs)]);
    let res: Response;
    try {
    res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
        model: this.model,
        stream: true,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
        ...(req.tools.length
            ? { tools: req.tools.map((t) => ({ type: 'function', function: t })), tool_choice: 'auto' }
            : {}),
        }),
    });
    } catch (e) {
    throw modelUnavailable(e);
    }

    if (res.status === 429) throw modelRateLimited(await safeText(res));
    if (!res.ok || !res.body) throw modelUnavailable(`HTTP ${res.status}: ${await safeText(res)}`);

    let text = '';
    const calls = new Map<number, { id: string; name: string; args: string }>();
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    try {
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        const delta = JSON.parse(data).choices?.[0]?.delta;
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
    }
    } catch (e) {
    throw modelUnavailable(e);
    }

    const toolCalls: ToolCall[] = [...calls.values()].map((c, i) => ({
    id: c.id || `call_${i}`,
    name: c.name,
    args: parseArgs(c.args),
    }));
    return { text, toolCalls, message: assistantMessage(text, toolCalls) };

    function parseArgs(raw: string): unknown {
        if (!raw) return {};
        try {
            return JSON.parse(raw);
        } catch {
            return { _unparsed: raw }; // zod validation will reject it and tell the model
        }
        }
    
        async function safeText(res: Response) {
        try {
            return (await res.text()).slice(0, 500);
        } catch {
            return '';
        }
        }
    }

    
}