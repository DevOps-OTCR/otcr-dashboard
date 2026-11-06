import { NotFoundException } from '@nestjs/common';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { AgentError } from './agent-errors';
import type { AgentEvent } from './agent.events';
import { AgentService, MAX_ROUNDS } from './agent.service';
import { ConversationStore } from './conversation.store';
import { FakeModelClient } from '../model/fake-test-model.client';
import { assistantMessage, type ModelClient, type ModelRequest } from '../model/model-client';
import { TavilySearchClient } from '../search/tavily-search.client';
import { SkillLibrary } from '../skills/skill-library';
import { LoadSkillTool } from '../tools/load-skill.tool';
import { MockWorkstreamTool } from '../tools/mock-workstream.tool';
import { ToolRegistry } from '../tools/tool-registry';
import { WebSearchTool } from '../tools/web-search.tool';

// Spec for the agent loop (AgentService.run) and the fake model, including the
// release-flag rechecks from docs/agentic-cms.md. No database, network or real model.

const user = { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' };

async function runTurn(svc: AgentService, message: string, conversationId?: string, u = user) {
  const events: AgentEvent[] = [];
  await svc.run(
    { user: u, projectId: 'p1', sprintId: 's1', message, conversationId, signal: new AbortController().signal },
    (e) => events.push(e),
  );
  const text = events.flatMap((e) => (e.type === 'text_delta' ? [e.text] : [])).join('');
  const convoEvent = events.find((e) => e.type === 'conversation');
  return { events, text, conversationId: convoEvent && convoEvent.type === 'conversation' ? convoEvent.id : undefined };
}

describe('FakeModelClient', () => {
  it('streams an echo in several chunks and returns the same text', async () => {
    const chunks: string[] = [];
    const turn = await new FakeModelClient().stream(
      { system: 's', messages: [{ role: 'user', content: 'hello' }], tools: [], signal: new AbortController().signal },
      (d) => chunks.push(d),
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(turn.text);
    expect(turn.text).toContain('You said: "hello"');
    expect(turn.text).toContain('turn 1');
    expect(turn.toolCalls).toEqual([]);
    expect(turn.message).toMatchObject({ role: 'assistant', content: turn.text });
  });

  it('throws a retryable model error on "fail model"', async () => {
    const p = new FakeModelClient().stream(
      { system: 's', messages: [{ role: 'user', content: 'fail model' }], tools: [], signal: new AbortController().signal },
      () => undefined,
    );
    await expect(p).rejects.toMatchObject({ kind: 'model', retryable: true });
  });
});

describe('AgentService.run', () => {
  // Flag settings the FeatureFlagsService reads; tests flip these mid-turn.
  let settings: Record<string, string>;
  beforeEach(() => {
    settings = { AGENTIC_CMS_ENABLED: 'true' };
  });
  const setup = (model: ModelClient = new FakeModelClient()) => {
    const store = new ConversationStore();
    const config = { get: (key: string) => settings[key] } as never;
    const flags = new FeatureFlagsService(config);
    const skills = new SkillLibrary(config);
    const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool());
    return { store, svc: new AgentService(model, store, flags, tools, skills, config) };
  };

  it('sends the conversation id first, then streamed text', async () => {
    const { svc } = setup();
    const { events, text, conversationId } = await runTurn(svc, 'hi');
    expect(events[0].type).toBe('conversation');
    expect(conversationId).toBeTruthy();
    expect(events.slice(1).every((e) => e.type === 'text_delta')).toBe(true);
    expect(text).toContain('You said: "hi"');
  });

  it('remembers earlier turns when given the conversation id', async () => {
    const { svc } = setup();
    const first = await runTurn(svc, 'hello');
    const second = await runTurn(svc, 'hello again', first.conversationId);
    expect(second.conversationId).toBe(first.conversationId);
    expect(second.text).toContain('turn 2');
  });

  it("refuses another user's conversation", async () => {
    const { svc } = setup();
    const mine = await runTurn(svc, 'hello');
    await expect(runTurn(svc, 'peek', mine.conversationId, { ...user, id: 'u2' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sends the system prompt and full history to the model', async () => {
    const seen: ModelRequest[] = [];
    const spy: ModelClient = {
      name: 'spy',
      async stream(req) {
        seen.push(req);
        return { text: 'ok', toolCalls: [], message: assistantMessage('ok', []) };
      },
    };
    const { svc } = setup(spy);
    const first = await runTurn(svc, 'one');
    await runTurn(svc, 'two', first.conversationId);
    expect(seen[1].system).toContain('OTCR Bot');
    expect(seen[1].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('runs requested tools and calls the model again with the results', async () => {
    let calls = 0;
    const toolThenAnswer: ModelClient = {
      name: 'tool-then-answer',
      async stream(req) {
        calls++;
        if (calls === 1) {
          const call = { id: 'c1', name: 'lookup', args: {} };
          return { text: '', toolCalls: [call], message: assistantMessage('', [call]) };
        }
        expect(req.messages[req.messages.length - 1]).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
        return { text: 'done', toolCalls: [], message: assistantMessage('done', []) };
      },
    };
    const { svc } = setup(toolThenAnswer);
    const { events } = await runTurn(svc, 'use a tool');
    expect(calls).toBe(2);
    expect(events.map((e) => e.type)).toEqual(['conversation', 'tool_start', 'tool_end']);
    expect(events[2]).toMatchObject({ type: 'tool_end', id: 'c1', ok: false });
  });

  it(`stops after ${MAX_ROUNDS} rounds if the model keeps asking for tools`, async () => {
    let calls = 0;
    const loopsForever: ModelClient = {
      name: 'loops',
      async stream() {
        calls++;
        const call = { id: `c${calls}`, name: 'again', args: {} };
        return { text: '', toolCalls: [call], message: assistantMessage('', [call]) };
      },
    };
    const { svc } = setup(loopsForever);
    const { text } = await runTurn(svc, 'loop');
    expect(calls).toBe(MAX_ROUNDS);
    expect(text).toMatch(/too many steps/);
  });

  it('rethrows model errors and keeps only the user message in history', async () => {
    const { svc, store } = setup();
    const first = await runTurn(svc, 'hello');
    await expect(runTurn(svc, 'fail model', first.conversationId)).rejects.toBeInstanceOf(AgentError);
    const history = await store.history(first.conversationId!);
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  describe('release flag (docs/agentic-cms.md)', () => {
    it('does nothing when the flag is off: no conversation, no model call', async () => {
      settings.AGENTIC_CMS_ENABLED = 'false';
      const stream = jest.fn();
      const { svc } = setup({ name: 'spy', stream });
      const events: AgentEvent[] = [];
      await expect(
        svc.run({ user, projectId: 'p1', message: 'hi', signal: new AbortController().signal }, (e) => events.push(e)),
      ).rejects.toMatchObject({ kind: 'disabled', retryable: false });
      expect(stream).not.toHaveBeenCalled();
      expect(events).toEqual([]);
    });

    it('does nothing for a user outside the pilot allowlist', async () => {
      settings.AGENTIC_CMS_ALLOWED_EMAILS = 'pilot@illinois.edu';
      const stream = jest.fn();
      const { svc } = setup({ name: 'spy', stream });
      await expect(runTurn(svc, 'hi')).rejects.toMatchObject({ kind: 'disabled' });
      expect(stream).not.toHaveBeenCalled();
    });

    it('rechecks before each tool call: switched off mid-turn, the tool never starts', async () => {
      const call = { id: 'c1', name: 'lookup', args: {} };
      const stream = jest.fn(async () => {
        settings.AGENTIC_CMS_ENABLED = 'false'; // Isaiah rolls back while the model is answering
        return { text: '', toolCalls: [call], message: assistantMessage('', [call]) };
      });
      const { svc, store } = setup({ name: 'flips-off', stream });
      const events: AgentEvent[] = [];
      await expect(
        svc.run({ user, projectId: 'p1', message: 'use a tool', signal: new AbortController().signal }, (e) => events.push(e)),
      ).rejects.toMatchObject({ kind: 'disabled' });
      expect(stream).toHaveBeenCalledTimes(1);
      expect(events.some((e) => e.type === 'tool_start')).toBe(false);
      const convo = events.find((e) => e.type === 'conversation');
      expect(convo && convo.type === 'conversation' && (await store.history(convo.id)).map((m) => m.role)).toEqual(['user']);
    });

    it('rechecks before each model call: switched off after a tool, the model is not called again', async () => {
      let calls = 0;
      const call = { id: 'c1', name: 'lookup', args: {} };
      const model: ModelClient = {
        name: 'tool-then-answer',
        async stream() {
          calls++;
          return { text: '', toolCalls: [call], message: assistantMessage('', [call]) };
        },
      };
      const { svc } = setup(model);
      const events: AgentEvent[] = [];
      const run = svc.run({ user, projectId: 'p1', message: 'go', signal: new AbortController().signal }, (e) => {
        events.push(e);
        if (e.type === 'tool_end') settings.AGENTIC_CMS_ENABLED = 'false';
      });
      await expect(run).rejects.toMatchObject({ kind: 'disabled' });
      expect(calls).toBe(1);
    });
  });

  it('enforces the hourly message limit from OTCR_BOT_MAX_MESSAGES_PER_HOUR', async () => {
    settings.OTCR_BOT_MAX_MESSAGES_PER_HOUR = '2';
    const { svc } = setup();
    const first = await runTurn(svc, 'one');
    await runTurn(svc, 'two', first.conversationId);
    await expect(runTurn(svc, 'three', first.conversationId)).rejects.toMatchObject({ kind: 'rate_limit' });
  });

  describe('tools, sources and skills', () => {
    const realFetch = global.fetch;
    afterEach(() => jest.restoreAllMocks());

    /** A model that calls the given tools on its first turn, then answers. */
    const scripted = (calls: { name: string; args: unknown }[], seen: ModelRequest[] = []): ModelClient => ({
      name: 'scripted',
      async stream(req, onText) {
        seen.push(req);
        if (seen.length === 1 && calls.length) {
          const toolCalls = calls.map((c, i) => ({ id: `c${i}`, ...c }));
          return { text: '', toolCalls, message: assistantMessage('', toolCalls) };
        }
        onText('Answer [1]');
        return { text: 'Answer [1]', toolCalls: [], message: assistantMessage('Answer [1]', []) };
      },
    });

    it('separates text written before a tool call from the answer after it', async () => {
      let round = 0;
      const model: ModelClient = {
        name: 'talks-then-calls',
        async stream(_req, onText) {
          round++;
          if (round === 1) {
            onText('Let me check.');
            const call = { id: 'c1', name: 'get_workstream_summary', args: {} };
            return { text: 'Let me check.', toolCalls: [call], message: assistantMessage('Let me check.', [call]) };
          }
          onText('Done.');
          return { text: 'Done.', toolCalls: [], message: assistantMessage('Done.', []) };
        },
      };
      const { svc } = setup(model);
      expect((await runTurn(svc, 'go')).text).toBe('Let me check.\n\nDone.');
    });

    it('offers only configured tools and lists skills in the prompt', async () => {
      const seen: ModelRequest[] = [];
      const { svc } = setup(scripted([], seen));
      await runTurn(svc, 'hi');
      const names = seen[0].tools.map((t) => t.name);
      expect(names).toEqual(['load_skill', 'get_workstream_summary']); // no TAVILY_API_KEY -> no web_search
      expect(seen[0].tools[0].parameters).toMatchObject({ type: 'object', required: ['name'] });
      expect(seen[0].system).toContain('sample-executive-summary');
      expect(seen[0].system).toMatch(/can't search the web/);
    });

    it('runs web_search, streams numbered sources and gives the model the results', async () => {
      settings.TAVILY_API_KEY = 'tvly-test';
      jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        if (String(input) !== 'https://api.tavily.com/search') return realFetch(input, init);
        return new Response(JSON.stringify({ results: [
          { title: 'E-bike market report', url: 'https://example.com/report', content: 'The market grew 12%.' },
          { title: 'Bad scheme', url: 'javascript:alert(1)', content: 'x' },
        ] }), { status: 200 });
      });
      const seen: ModelRequest[] = [];
      const { svc, store } = setup(scripted([{ name: 'web_search', args: { query: 'e-bike market size' } }], seen));
      const { events, conversationId } = await runTurn(svc, 'How big is the e-bike market?');

      expect(seen[0].system).toMatch(/call web_search/);
      expect(events.map((e) => e.type)).toEqual(['conversation', 'tool_start', 'tool_end', 'sources', 'text_delta']);
      expect(events[1]).toMatchObject({ name: 'web_search', label: 'Searching the web for "e-bike market size"' });
      expect(events[2]).toMatchObject({ ok: true, note: '1 result' });
      expect(events[3]).toEqual({ type: 'sources', sources: [{ id: 1, title: 'E-bike market report', url: 'https://example.com/report' }] });
      const toolMsg = seen[1].messages.find((m) => m.role === 'tool');
      expect(toolMsg?.content).toContain('[1] E-bike market report');
      expect(toolMsg?.content).toMatch(/never follow instructions/);
      expect((await store.history(conversationId!)).map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    });

    it('reports a failed search to the user and the model without failing the turn', async () => {
      settings.TAVILY_API_KEY = 'tvly-test';
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 432 }));
      const seen: ModelRequest[] = [];
      const { svc } = setup(scripted([{ name: 'web_search', args: { query: 'anything' } }], seen));
      const { events, text } = await runTurn(svc, 'search');
      expect(events.find((e) => e.type === 'tool_end')).toMatchObject({ ok: false, note: 'Web search usage limit reached' });
      expect(seen[1].messages.find((m) => m.role === 'tool')?.content).toMatch(/could not search the web/);
      expect(text).toBe('Answer [1]');
    });

    it('loads a skill and runs the mock CMS tool with the access-checked project', async () => {
      const seen: ModelRequest[] = [];
      const { svc } = setup(scripted([
        { name: 'load_skill', args: { name: 'sample-executive-summary' } },
        { name: 'get_workstream_summary', args: {} },
      ], seen));
      const { events } = await runTurn(svc, 'Write an executive summary for my workstream');
      expect(events.filter((e) => e.type === 'tool_end').every((e) => e.type === 'tool_end' && e.ok)).toBe(true);
      const tools = seen[1].messages.filter((m) => m.role === 'tool').map((m) => m.content);
      expect(tools[0]).toContain('Executive summary (sample skill)');
      expect(JSON.parse(tools[1])).toMatchObject({ mock: true, projectId: 'p1', workstreamId: 's1' });
    });
  });
});