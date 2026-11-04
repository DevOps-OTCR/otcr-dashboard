import { NotFoundException } from '@nestjs/common';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { AgentError } from './agent-errors';
import type { AgentEvent } from './agent.events';
import { AgentService, MAX_ROUNDS } from './agent.service';
import { ConversationStore } from './conversation.store';
import { FakeModelClient } from '../model/fake-test-model.client';
import { assistantMessage, type ModelClient, type ModelRequest } from '../model/model-client';

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
    const flags = new FeatureFlagsService({ get: (key: string) => settings[key] } as never);
    return { store, svc: new AgentService(model, store, flags) };
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

  it('enforces the hourly message limit', async () => {
    process.env.OTCR_BOT_MAX_MESSAGES_PER_HOUR = '2';
    try {
      const { svc } = setup();
      const first = await runTurn(svc, 'one');
      await runTurn(svc, 'two', first.conversationId);
      await expect(runTurn(svc, 'three', first.conversationId)).rejects.toMatchObject({ kind: 'rate_limit' });
    } finally {
      delete process.env.OTCR_BOT_MAX_MESSAGES_PER_HOUR;
    }
  });
});