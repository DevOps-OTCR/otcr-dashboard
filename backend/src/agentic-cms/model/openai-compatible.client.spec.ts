/* eslint-disable @typescript-eslint/no-explicit-any -- recorded request bodies */
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { OpenAICompatibleClient } from './openai-compatible.client';
import type { ModelRequest } from './model-client';

type Script = { status?: number; body?: string; frames?: unknown[] };

let server: http.Server;
let base: string;
let script: Script;
let lastRequest: { url?: string; headers: http.IncomingHttpHeaders; body: any };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      lastRequest = { url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null };
      if (script.status && script.status !== 200) {
        res.writeHead(script.status, { 'Content-Type': 'text/plain' });
        return res.end(script.body ?? 'error');
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const f of script.frames ?? []) res.write(`data: ${JSON.stringify(f)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const req = (over: Partial<ModelRequest> = {}): ModelRequest => ({
  system: 'You are OTCR Bot.',
  messages: [{ role: 'user', content: 'hi' }],
  tools: [],
  signal: new AbortController().signal,
  ...over,
});
const delta = (d: unknown) => ({ choices: [{ delta: d }] });

describe('OpenAICompatibleClient', () => {
  it('streams text deltas and returns the full text', async () => {
    script = { frames: [delta({ content: 'Hel' }), delta({ content: 'lo' }), delta({})] };
    const chunks: string[] = [];
    const turn = await new OpenAICompatibleClient(base, 'key', 'model-x').stream(req(), (d) => chunks.push(d));
    expect(chunks).toEqual(['Hel', 'lo']);
    expect(turn.text).toBe('Hello');
    expect(turn.toolCalls).toEqual([]);
    expect(turn.message).toEqual({ role: 'assistant', content: 'Hello' });
  });

  it('sends model, stream:true, the system prompt first, and a bearer key to /chat/completions', async () => {
    script = { frames: [delta({ content: 'ok' })] };
    await new OpenAICompatibleClient(`${base}/`, 'secret-key', 'model-x').stream(req(), () => undefined);
    expect(lastRequest.url).toBe('/v1/chat/completions'); // trailing slash on the base URL handled
    expect(lastRequest.headers.authorization).toBe('Bearer secret-key');
    expect(lastRequest.body).toMatchObject({ model: 'model-x', stream: true });
    expect(lastRequest.body.messages).toEqual([
      { role: 'system', content: 'You are OTCR Bot.' },
      { role: 'user', content: 'hi' },
    ]);
    expect(lastRequest.body.tools).toBeUndefined(); // no tools → don't send the field
  });

  it('sends tools in OpenAI function format', async () => {
    script = { frames: [delta({ content: 'ok' })] };
    const tools = [{ name: 'web_search', description: 'Search', parameters: { type: 'object' } }];
    await new OpenAICompatibleClient(base, 'k', 'm').stream(req({ tools }), () => undefined);
    expect(lastRequest.body.tools).toEqual([{ type: 'function', function: tools[0] }]);
  });

  it('assembles a tool call that arrives in pieces across frames', async () => {
    script = {
      frames: [
        delta({ tool_calls: [{ index: 0, id: 'call_a', function: { name: 'web_', arguments: '{"que' } }] }),
        delta({ tool_calls: [{ index: 0, function: { name: 'search', arguments: 'ry":"tam"}' } }] }),
        delta({ tool_calls: [{ index: 1, id: 'call_b', function: { name: 'load_skill', arguments: '{}' } }] }),
      ],
    };
    const turn = await new OpenAICompatibleClient(base, 'k', 'm').stream(req(), () => undefined);
    expect(turn.toolCalls).toEqual([
      { id: 'call_a', name: 'web_search', args: { query: 'tam' } },
      { id: 'call_b', name: 'load_skill', args: {} },
    ]);
    expect(turn.message).toMatchObject({ role: 'assistant', content: null, tool_calls: expect.any(Array) });
  });

  it('keeps unparseable tool arguments instead of crashing', async () => {
    script = { frames: [delta({ tool_calls: [{ index: 0, id: 'c', function: { name: 'x', arguments: '{not json' } }] })] };
    const turn = await new OpenAICompatibleClient(base, 'k', 'm').stream(req(), () => undefined);
    expect(turn.toolCalls[0].args).toEqual({ _unparsed: '{not json' });
  });

  it('maps HTTP 429 to a retryable rate_limit error', async () => {
    script = { status: 429, body: 'slow down' };
    await expect(new OpenAICompatibleClient(base, 'k', 'm').stream(req(), () => undefined)).rejects.toMatchObject({
      kind: 'rate_limit',
      retryable: true,
    });
  });

  it('maps other HTTP errors to a retryable model error', async () => {
    script = { status: 500, body: 'oops' };
    await expect(new OpenAICompatibleClient(base, 'k', 'm').stream(req(), () => undefined)).rejects.toMatchObject({
      kind: 'model',
      retryable: true,
    });
  });

  it.each([
    [401, '{}', 'config', false, /key was rejected/],
    [403, '{"error":{"code":"consent_required"}}', 'config', false, /accept this model's notice/],
    [403, '{"error":{"code":"model_blocked"}}', 'config', false, /isn't allowed/],
    [404, '{}', 'config', false, /LUMEN_MODEL/],
    [429, '{"error":{"code":"rate_limit_exceeded"}}', 'rate_limit', true, /Try again in a minute/],
    [429, '{"code":"insufficient_quota"}', 'rate_limit', false, /budget is used up/],
    [503, 'not json', 'model', true, /couldn't respond/],
    [504, '{}', 'model', true, /too long/],
  ])('maps Lumen HTTP %i %s to a clear %s error', async (status, body, kind, retryable, message) => {
    script = { status, body };
    const err = await new OpenAICompatibleClient(base, 'secret-key', 'm').stream(req(), () => undefined).catch((e) => e);
    expect(err).toMatchObject({ kind, retryable });
    expect(err.userMessage).toMatch(message);
    expect(JSON.stringify(err) + String(err.cause)).not.toContain('secret-key');
  });

  it('reports a timeout separately from other failures', async () => {
    script = { frames: [] };
    const slow = http.createServer(() => undefined); // accepts and never answers
    await new Promise<void>((r) => slow.listen(0, '127.0.0.1', () => r()));
    try {
      const url = `http://127.0.0.1:${(slow.address() as AddressInfo).port}/v1`;
      await expect(new OpenAICompatibleClient(url, 'k', 'm', 50).stream(req(), () => undefined)).rejects.toMatchObject({
        kind: 'model',
        userMessage: expect.stringMatching(/too long/),
      });
    } finally {
      slow.closeAllConnections();
      await new Promise<void>((r) => slow.close(() => r()));
    }
  });

  it('maps a network failure to a model error', async () => {
    const dead = new OpenAICompatibleClient('http://127.0.0.1:1/v1', 'k', 'm');
    await expect(dead.stream(req(), () => undefined)).rejects.toMatchObject({ kind: 'model' });
  });
});