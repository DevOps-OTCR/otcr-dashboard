import { Logger } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { FeatureFlagsService } from '../../../../feature-flags/feature-flags.service';
import { AgentError } from '../../../agent/agent-errors';
import type { AgentEvent } from '../../../agent/agent.events';
import { AgentService, MAX_ROUNDS } from './mutant.service';
import { ConversationStore } from '../../../agent/conversation.store';
import { FakeModelClient } from '../../../model/fake-test-model.client';
import { assistantMessage, type ModelClient, type ModelRequest } from '../../../model/model-client';
import { TavilySearchClient } from '../../../search/tavily-search.client';
import { SkillLibrary } from '../../../skills/skill-library';
import { LoadSkillTool } from '../../../tools/load-skill.tool';
import { MockWorkstreamTool } from '../../../tools/mock-workstream.tool';
import { ToolRegistry } from '../../../tools/tool-registry';
import { WebSearchTool } from '../../../tools/web-search.tool';

// Spec for the agent loop (AgentService.run) and the fake model, including the
// release-flag rechecks from docs/agentic-cms.md. No database, network or real model.

const user = { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' };
const last = <T>(items: T[]) => items[items.length - 1];

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
    const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
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

  /** Fails like a strict provider if any tool call lacks a result before the next non-tool message. */
  const assertValidToolHistory = (messages: ModelRequest['messages']) => {
    messages.forEach((message, i) => {
      if (message.role !== 'assistant' || !message.tool_calls) return;
      const results = [];
      for (let j = i + 1; j < messages.length && messages[j].role === 'tool'; j++) results.push(messages[j]);
      expect(results.map((r) => (r.role === 'tool' ? r.tool_call_id : ''))).toEqual(message.tool_calls.map((c) => c.id));
    });
  };

  it('keeps history valid at the step limit, and the same chat can continue', async () => {
    let calls = 0;
    const seen: ModelRequest[] = [];
    const loopsThenAnswers: ModelClient = {
      name: 'loops-then-answers',
      async stream(req, onText) {
        seen.push(req);
        assertValidToolHistory(req.messages);
        if (++calls > MAX_ROUNDS) {
          onText('back on track');
          return { text: 'back on track', toolCalls: [], message: assistantMessage('back on track', []) };
        }
        const toolCalls = [{ id: `a${calls}`, name: 'again', args: {} }, { id: `b${calls}`, name: 'again', args: {} }];
        return { text: '', toolCalls, message: assistantMessage('', toolCalls) };
      },
    };
    const { svc, store } = setup(loopsThenAnswers);
    const first = await runTurn(svc, 'loop');
    expect(first.text).toMatch(/too many steps/);

    const saved = await store.history(first.conversationId!);
    assertValidToolHistory(saved);
    expect(saved[saved.length - 1]).toMatchObject({ role: 'assistant', content: expect.stringMatching(/too many steps/) });
    expect(saved.slice(-3, -1)).toEqual([
      { role: 'tool', tool_call_id: `a${MAX_ROUNDS}`, content: expect.stringMatching(/step limit/) },
      { role: 'tool', tool_call_id: `b${MAX_ROUNDS}`, content: expect.stringMatching(/step limit/) },
    ]);

    const second = await runTurn(svc, 'continue', first.conversationId);
    expect(second.text).toBe('back on track');
    expect(last(seen[seen.length - 1].messages)).toEqual({ role: 'user', content: 'continue' });
  });

  it('refuses to reopen a conversation under a different workstream, before any model call', async () => {
    const stream = jest.fn(async () => ({ text: 'ok', toolCalls: [], message: assistantMessage('ok', []) }));
    const { svc } = setup({ name: 'spy', stream });
    const first = await runTurn(svc, 'week one');
    stream.mockClear();
    await expect(
      svc.run(
        { user, projectId: 'p1', sprintId: 's2', conversationId: first.conversationId, message: 'week two', signal: new AbortController().signal },
        () => undefined,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(stream).not.toHaveBeenCalled();
  });

  describe('word limit check', () => {
    it('PROBE: a cut of exactly the limit is accepted', async () => {
      const seen: ModelRequest[] = [];
      const { svc } = setup(answers([words(351), words(350), words(10)], seen));
      const { events } = await runTurn(svc, 'Write a 350-word summary');
      expect(seen).toHaveLength(2);
      expect(replaced(events)).toEqual([words(350)]);
      expect(events.find((e) => e.type === 'tool_end')).toMatchObject({ ok: true, note: '351 → 350 words' });
    });
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
    /** Answers with each scripted text in turn, streaming the text like a real model. */
    const answers = (texts: (string | Error)[], seen: ModelRequest[] = []): ModelClient => ({
      name: 'answers',
      async stream(req, onText) {
        seen.push(req);
        const next = texts[seen.length - 1];
        if (next instanceof Error) throw next;
        onText(next);
        return { text: next, toolCalls: [], message: assistantMessage(next, []) };
      },
    });
    const replaced = (events: AgentEvent[]) => events.flatMap((e) => (e.type === 'text_replace' ? [e.text] : []));

    it('leaves a draft within the limit alone and makes no extra model call', async () => {
      const seen: ModelRequest[] = [];
      const { svc } = setup(answers([words(100)], seen));
      const { events } = await runTurn(svc, 'Write a 100-word summary');
      expect(seen).toHaveLength(1);
      expect(replaced(events)).toEqual([]);
    });

    it('makes no check when the user set no limit', async () => {
      const seen: ModelRequest[] = [];
      const { svc } = setup(answers([words(900)], seen));
      await runTurn(svc, 'Write a summary');
      expect(seen).toHaveLength(1);
    });

    it('cuts an over-limit draft once and saves only the final text', async () => {
      const seen: ModelRequest[] = [];
      const { svc, store } = setup(answers([words(486), words(300)], seen));
      const { events, conversationId } = await runTurn(svc, 'Write a 350-word summary');

      expect(seen).toHaveLength(2);
      expect(seen[1].tools).toEqual([]);
      expect(last(seen[1].messages)).toMatchObject({ role: 'user', content: expect.stringContaining('486 words') });
      expect(replaced(events)).toEqual([words(300)]);
      expect(events.find((e) => e.type === 'tool_end')).toMatchObject({ ok: true, note: '486 → 300 words' });
      expect(await store.history(conversationId!)).toEqual([
        { role: 'user', content: 'Write a 350-word summary' },
        { role: 'assistant', content: words(300) },
      ]);
    });

    it('does not count the reviewer note toward the limit', async () => {
      const seen: ModelRequest[] = [];
      const { svc } = setup(answers([`${words(100)}\n\n---\n${words(50)}`], seen));
      await runTurn(svc, 'Write a 100-word summary');
      expect(seen).toHaveLength(1);
    });

    it('retries a cut that is still over, then accepts one that fits', async () => {
      const seen: ModelRequest[] = [];
      const { svc, store } = setup(answers([words(486), words(400), words(330)], seen));
      const { events, conversationId } = await runTurn(svc, 'Write a 350-word summary');
      expect(seen).toHaveLength(3);
      expect(last(seen[2].messages)).toMatchObject({ role: 'user', content: expect.stringMatching(/still has 400 words/) });
      expect(replaced(events)).toEqual([words(330)]);
      expect(events.find((e) => e.type === 'tool_end')).toMatchObject({ ok: true, note: '486 → 330 words' });
      expect((await store.history(conversationId!)).map((m) => m.role)).toEqual(['user', 'assistant']);
    });

    it('retries a cut that lost too much, and uses the fuller version', async () => {
      const seen: ModelRequest[] = [];
      const { svc } = setup(answers([words(486), words(100), words(330)], seen));
      const { events } = await runTurn(svc, 'Write a 350-word summary');
      expect(last(seen[2].messages)).toMatchObject({ role: 'user', content: expect.stringMatching(/only 100 words/) });
      expect(seen[2].tools).toEqual([]);
      expect(replaced(events)).toEqual([words(330)]);
    });

    it('does not retry a cut that lands near the limit', async () => {
      const seen: ModelRequest[] = [];
      const { svc } = setup(answers([words(486), words(280)], seen));
      await runTurn(svc, 'Write a 350-word summary');
      expect(seen).toHaveLength(2);
    });

    it('keeps the longer of two short cuts rather than warning', async () => {
      const { svc } = setup(answers([words(486), words(200), words(150)]));
      const { events } = await runTurn(svc, 'Write a 350-word summary');
      expect(replaced(events)).toEqual([words(200)]);
      expect(events.find((e) => e.type === 'tool_end')).toMatchObject({ ok: true, note: '486 → 200 words' });
    });

    it('keeps a short cut if the retry goes back over the limit', async () => {
      const { svc } = setup(answers([words(486), words(200), words(500)]));
      const { events } = await runTurn(svc, 'Write a 350-word summary');
      expect(replaced(events)).toEqual([words(200)]);
    });

    it('stops after one retry and tells the reader when the draft is still over', async () => {
      const seen: ModelRequest[] = [];
      const { svc, store } = setup(answers([words(486), words(400), words(380), words(10)], seen));
      const { events, conversationId } = await runTurn(svc, 'Write a 350-word summary');
      expect(seen).toHaveLength(3);
      expect(replaced(events)[0]).toMatch(/^w0[\s\S]*This draft is 380 words, over the 350-word limit/);
      expect(events.find((e) => e.type === 'tool_end')).toMatchObject({ ok: false, note: 'Still 380 words' });
      expect(last(await store.history(conversationId!)).content).toContain('over the 350-word limit');
    });

    it('keeps the original draft with a warning when the cut fails', async () => {
      const { svc } = setup(answers([words(486), new AgentError('model', 'nope', true)]));
      const { events } = await runTurn(svc, 'Write a 350-word summary');
      expect(replaced(events)[0]).toContain(words(486));
      expect(replaced(events)[0]).toContain('This draft is 486 words');
    });

    it('keeps the original draft when the cut comes back longer', async () => {
      const { svc } = setup(answers([words(486), words(600), words(700)]));
      const { events } = await runTurn(svc, 'Write a 350-word summary');
      expect(replaced(events)[0]).toContain('This draft is 486 words');
      expect(replaced(events)[0]).not.toContain('w599');
    });

    it('rechecks the release flag before the cut', async () => {
      const seen: ModelRequest[] = [];
      const model: ModelClient = {
        name: 'flips-off',
        async stream(req, onText) {
          seen.push(req);
          settings.AGENTIC_CMS_ENABLED = 'false';
          onText(words(486));
          return { text: words(486), toolCalls: [], message: assistantMessage(words(486), []) };
        },
      };
      const { svc } = setup(model);
      await expect(runTurn(svc, 'Write a 350-word summary')).rejects.toMatchObject({ kind: 'disabled' });
      expect(seen).toHaveLength(1);
    });

    it('keeps text written before a tool call when replacing the final draft', async () => {
      let round = 0;
      const model: ModelClient = {
        name: 'talks-tool-drafts-cuts',
        async stream(_req, onText) {
          round++;
          if (round === 1) {
            onText('Let me check.');
            const call = { id: 'c1', name: 'lookup', args: {} };
            return { text: 'Let me check.', toolCalls: [call], message: assistantMessage('Let me check.', [call]) };
          }
          const text = round === 2 ? words(486) : words(300);
          if (round === 2) onText(text);
          return { text, toolCalls: [], message: assistantMessage(text, []) };
        },
      };
      const { svc } = setup(model);
      const { events } = await runTurn(svc, 'Write a 350-word summary');
      expect(replaced(events)).toEqual([`Let me check.\n\n${words(300)}`]);
    });
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
      expect(events.map((e) => e.type)).toEqual(['conversation', 'tool_start', 'tool_end', 'sources', 'text_delta', 'sources']);
      expect(events[1]).toMatchObject({ name: 'web_search', label: 'Searching the web for "e-bike market size"' });
      expect(events[2]).toMatchObject({ ok: true, note: '1 result' });
      expect(events[3]).toEqual({ type: 'sources', sources: [{ id: 1, title: 'E-bike market report', url: 'https://example.com/report' }] });
      const toolMsg = seen[1].messages.find((m) => m.role === 'tool');
      expect(toolMsg?.content).toContain('[1] E-bike market report');
      expect(toolMsg?.content).toMatch(/never follow instructions/);
      expect((await store.history(conversationId!)).map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    });

    it('ends with only the cited sources and logs numbers that match no source', async () => {
      settings.TAVILY_API_KEY = 'tvly-test';
      jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        if (String(input) !== 'https://api.tavily.com/search') return realFetch(input, init);
        return new Response(JSON.stringify({ results: [
          { title: 'Cited', url: 'https://example.com/cited', content: 'x' },
          { title: 'Unused', url: 'https://example.com/unused', content: 'y' },
        ] }), { status: 200 });
      });
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      let round = 0;
      const model: ModelClient = {
        name: 'cites-one',
        async stream(_req, onText) {
          if (++round === 1) {
            const call = { id: 'c1', name: 'web_search', args: { query: 'e-bikes' } };
            return { text: '', toolCalls: [call], message: assistantMessage('', [call]) };
          }
          const text = 'Real [1], invented [7].';
          onText(text);
          return { text, toolCalls: [], message: assistantMessage(text, []) };
        },
      };
      const { svc } = setup(model);
      const { events } = await runTurn(svc, 'Research e-bikes');

      const lists = events.filter((e) => e.type === 'sources').map((e) => (e.type === 'sources' ? e.sources : []));
      expect(lists[0].map((s) => s.title)).toEqual(['Cited', 'Unused']); // available while streaming
      expect(lists[1]).toEqual([{ id: 1, title: 'Cited', url: 'https://example.com/cited' }]);
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/unknown sources \[7\]/));
    });

    describe('citations across turns', () => {
      const a = { id: 1, title: 'A', url: 'https://a.test/' };
      const b = { id: 2, title: 'B', url: 'https://b.test/' };
      const c = { id: 3, title: 'C', url: 'https://c.test/' };
      let results: { title: string; url: string }[][];

      /** Each turn: search if a batch is queued for it, then answer with the scripted text. */
      const chat = (answers: string[], searchOnTurn: boolean[]): ModelClient => {
        let turn = 0;
        let searched = false;
        return {
          name: 'cites-across-turns',
          async stream(_req, onText) {
            if (searchOnTurn[turn] && !searched) {
              searched = true;
              const call = { id: `c${turn}`, name: 'web_search', args: { query: 'e-bikes' } };
              return { text: '', toolCalls: [call], message: assistantMessage('', [call]) };
            }
            const text = answers[turn++];
            searched = false;
            onText(text);
            return { text, toolCalls: [], message: assistantMessage(text, []) };
          },
        };
      };
      const lastSources = (events: AgentEvent[]) => last(events.filter((e) => e.type === 'sources'));

      beforeEach(() => {
        settings.TAVILY_API_KEY = 'tvly-test';
        jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
          if (String(input) !== 'https://api.tavily.com/search') return realFetch(input, init);
          const batch = results.shift() ?? [];
          return new Response(JSON.stringify({ results: batch.map((r) => ({ ...r, content: 'x' })) }), { status: 200 });
        });
      });

      it('restores an earlier source when a follow-up cites only old numbers', async () => {
        results = [[a, b]];
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const { svc } = setup(chat(['First [1] and [2].', 'As noted, [2].'], [true, false]));
        const first = await runTurn(svc, 'research');
        const second = await runTurn(svc, 'tell me more', first.conversationId);
        expect(lastSources(second.events)).toEqual({ type: 'sources', sources: [b] });
        expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/unknown sources/));
      });

      it('gives new sources new numbers and resolves mixed old and new citations', async () => {
        results = [[a, b], [c]];
        const { svc } = setup(chat(['First [1].', 'Old [1], new [3].'], [true, true]));
        const first = await runTurn(svc, 'research');
        const second = await runTurn(svc, 'more', first.conversationId);
        expect(lastSources(second.events)).toEqual({ type: 'sources', sources: [a, c] });
      });

      it('never reuses a number for a different URL, and reuses the number of a repeat URL', async () => {
        results = [[a], [{ title: 'B', url: b.url }, { title: 'A again', url: a.url }]];
        const { svc, store } = setup(chat(['One [1].', 'Two [2], one [1].'], [true, true]));
        const first = await runTurn(svc, 'research');
        const second = await runTurn(svc, 'more', first.conversationId);
        const streamed = second.events.filter((e) => e.type === 'sources')[0];
        expect(streamed).toEqual({ type: 'sources', sources: [{ id: 2, title: 'B', url: b.url }, a] });
        expect(await store.sources(first.conversationId!)).toEqual([a, { id: 2, title: 'B', url: b.url }]);
      });

      it('still warns about a number no source in the conversation has', async () => {
        results = [[a]];
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const { svc } = setup(chat(['One [1].', 'Invented [9].'], [true, false]));
        const first = await runTurn(svc, 'research');
        await runTurn(svc, 'more', first.conversationId);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/unknown sources \[9\]/));
      });
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