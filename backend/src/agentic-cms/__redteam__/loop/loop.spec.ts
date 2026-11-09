import { Logger } from '@nestjs/common';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import type { AgentEvent } from '../../agent/agent.events';
import { AgentService } from '../../agent/agent.service';
import { ConversationStore } from '../../agent/conversation.store';
import { countDraftWords, isTooShort } from '../../agent/word-limit';
import { assistantMessage, type ModelClient, type ModelRequest } from '../../model/model-client';
import { TavilySearchClient } from '../../search/tavily-search.client';
import { SkillLibrary } from '../../skills/skill-library';
import { LoadSkillTool } from '../../tools/load-skill.tool';
import { MockWorkstreamTool } from '../../tools/mock-workstream.tool';
import { ToolRegistry } from '../../tools/tool-registry';
import { WebSearchTool } from '../../tools/web-search.tool';

const user = { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' };
const words = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ');
type Step = string | Error | ((req: ModelRequest) => any);

let settings: Record<string, string>;
beforeEach(() => {
  settings = { AGENTIC_CMS_ENABLED: 'true' };
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

function scripted(steps: Step[]) {
  const seen: ModelRequest[] = [];
  const model: ModelClient = {
    name: 'scripted',
    async stream(req, onText) {
      seen.push(req);
      const step = steps[seen.length - 1];
      if (step === undefined) throw new Error('unexpected extra model call');
      if (step instanceof Error) throw step;
      if (typeof step === 'function') return step(req);
      if (seen.length === 1) onText(step);
      return { text: step, toolCalls: [], message: assistantMessage(step, []) };
    },
  };
  return { model, seen };
}

function setup(model: ModelClient) {
  const store = new ConversationStore();
  const config = { get: (key: string) => settings[key] } as never;
  const flags = new FeatureFlagsService(config);
  const skills = new SkillLibrary(config);
  const tools = new ToolRegistry(
    new WebSearchTool(new TavilySearchClient(config)),
    new LoadSkillTool(skills),
    new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never),
  );
  return { store, svc: new AgentService(model, store, flags, tools, skills, config) };
}

async function run(svc: AgentService, message: string, signal = new AbortController().signal) {
  const events: AgentEvent[] = [];
  let error: unknown;
  try {
    await svc.run({ user, projectId: 'p1', sprintId: 's1', message, signal }, (e) => events.push(e));
  } catch (e) {
    error = e;
  }
  const replace = [...events].reverse().find((e) => e.type === 'text_replace') as any;
  const streamed = events.flatMap((e) => (e.type === 'text_delta' ? [e.text] : [])).join('');
  return { events, error, final: replace ? replace.text : streamed };
}

const MSG = 'Write a 100-word summary of Lumen.';

describe('enforceWordLimit control flow', () => {
  it('first cut within 80-100% -> exactly 1 cut call', async () => {
    const { model, seen } = scripted([words(150), words(90)]);
    const { final } = await run(setup(model).svc, MSG);
    expect(seen.length).toBe(2);
    expect(countDraftWords(final)).toBe(90);
    expect(seen[1].tools).toEqual([]);
  });

  it('cut < 80% then retry < 80% -> ships too-short retry/longest with ok:true and no notice', async () => {
    const { model, seen } = scripted([words(150), words(60), words(70)]);
    const { final, events } = await run(setup(model).svc, MSG);
    expect(seen.length).toBe(3);
    console.log('TOO_SHORT both:', countDraftWords(final), JSON.stringify(events.find((e) => e.type === 'tool_end')));
    expect(countDraftWords(final)).toBe(70);
    expect(final).not.toMatch(/limit/);
  });

  it('79% boundary: 79 is too short, 80 is not (limit 100); limit 333 boundary', () => {
    expect(isTooShort(79, 100)).toBe(true);
    expect(isTooShort(80, 100)).toBe(false);
    expect(isTooShort(266, 333)).toBe(true);
    expect(isTooShort(267, 333)).toBe(false);
  });

  it('cut 79% then retry 40% -> keeps 79 (longest within)', async () => {
    const { model } = scripted([words(150), words(79), words(40)]);
    const { final, events } = await run(setup(model).svc, MSG);
    expect(countDraftWords(final)).toBe(79);
    console.log('79then40 tool_end', JSON.stringify(events.find((e) => e.type === 'tool_end')));
  });

  it('first cut over, retry under 80% -> retry (too short) shipped', async () => {
    const { model } = scripted([words(150), words(120), words(30)]);
    const { final, events } = await run(setup(model).svc, MSG);
    console.log('over-then-30:', countDraftWords(final), JSON.stringify(events.find((e) => e.type === 'tool_end')));
    expect(countDraftWords(final)).toBe(30);
  });

  it('both cuts over -> shortest kept + notice', async () => {
    const { model, seen } = scripted([words(150), words(130), words(110)]);
    const { final } = await run(setup(model).svc, MSG);
    expect(seen.length).toBe(3);
    expect(final).toMatch(/This draft is 110 words, over the 100-word limit/);
  });

  it('empty cut -> original + notice, no retry', async () => {
    const { model, seen } = scripted([words(150), '   ']);
    const { final } = await run(setup(model).svc, MSG);
    expect(seen.length).toBe(2);
    expect(final).toMatch(/150 words, over/);
  });

  it('model throws on cut -> original + notice', async () => {
    const { model } = scripted([words(150), new Error('boom')]);
    const { final, error } = await run(setup(model).svc, MSG);
    expect(error).toBeUndefined();
    expect(final).toMatch(/150 words, over/);
  });

  it('provider ignores tools:[] and returns a tool call during cut', async () => {
    const call = { id: 'x', name: 'web_search', args: { q: 'x' } };
    const { model, store } = (() => {
      const s = scripted([
        words(150),
        () => ({ text: words(90), toolCalls: [call], message: assistantMessage(words(90), [call]) }),
      ]);
      return { ...s, store: undefined };
    })();
    const { final } = await run(setup(model).svc, MSG);
    expect(countDraftWords(final)).toBe(90);
  });

  it('provider returns only a tool call (no text) during cut', async () => {
    const call = { id: 'x', name: 'web_search', args: { q: 'x' } };
    const { model } = scripted([words(150), () => ({ text: '', toolCalls: [call], message: assistantMessage('', [call]) })]);
    const { final } = await run(setup(model).svc, MSG);
    expect(final).toMatch(/150 words, over/);
  });

  it('abort mid-cut: client resolves with partial text instead of throwing -> partial accepted as the cut', async () => {
    const ac = new AbortController();
    const { model } = scripted([
      words(150),
      () => {
        ac.abort();
        const partial = words(85);
        return { text: partial, toolCalls: [], message: assistantMessage(partial, []) };
      },
    ]);
    const { final, error, events } = await run(setup(model).svc, MSG, ac.signal);
    console.log('ABORT partial: error=', error, 'final words=', countDraftWords(final), 'tool_end=', JSON.stringify(events.find((e) => e.type === 'tool_end')));
  });

  it('abort mid-cut with throw -> rethrown, turn dropped', async () => {
    const ac = new AbortController();
    const { model } = scripted([words(150), () => { ac.abort(); throw new Error('aborted'); }]);
    const { error, events } = await run(setup(model).svc, MSG, ac.signal);
    expect(error).toBeDefined();
    console.log('ABORT throw events:', events.map((e) => e.type).join(','));
  });

  it('flag disabled before retry -> error, tool_start never closed, draft not saved', async () => {
    const { model } = scripted([
      words(150),
      () => {
        settings.AGENTIC_CMS_ENABLED = 'false';
        return { text: words(120), toolCalls: [], message: assistantMessage(words(120), []) };
      },
    ]);
    const { svc, store } = setup(model);
    const { error, events } = await run(svc, MSG);
    const convo = events.find((e) => e.type === 'conversation') as any;
    const hist = await store.history(convo.id);
    console.log('FLAG mid-cut: error=', (error as any)?.kind ?? String(error), 'events=', events.map((e) => e.type).join(','), 'history roles=', hist.map((m) => m.role).join(','));
    expect(events.some((e) => e.type === 'tool_start')).toBe(true);
    expect(events.some((e) => e.type === 'tool_end')).toBe(false);
  });

  it('cut drops the --- reviewer note: within limit but note gone', async () => {
    const draft = `${words(150)}\n\n---\nWord count (estimate): 150 / 100. Reviewer: check S3.`;
    const { model } = scripted([draft, words(95)]);
    const { final } = await run(setup(model).svc, MSG);
    console.log('note kept?', final.includes('---'));
    expect(final.includes('---')).toBe(false);
  });

  it('cut that keeps note but loses the --- rule -> note counted, forcing retry', async () => {
    const note = 'Word count estimate ninety of one hundred and reviewer should verify sources';
    const { model, seen } = scripted([words(150) + '\n\n---\n' + note, words(90) + '\n\n' + note, words(90) + '\n\n---\n' + note]);
    await run(setup(model).svc, MSG);
    console.log('calls with lost rule', seen.length);
  });

  it('sectioned draft using --- as section separators, no reviewer note -> only first sections counted, limit silently exceeded', async () => {
    const draft = `## Intro\n${words(45)}\n\n---\n\n## Analysis\n${words(45)}\n\n---\n\n## Recommendation\n${words(45)}`;
    const { model, seen } = scripted([draft]);
    const { final, events } = await run(setup(model).svc, MSG);
    const realBody = final.split(/\s+/).filter((t) => /^word$/.test(t)).length;
    console.log('SECTIONED: counted=', countDraftWords(final), 'real body words=', realBody, 'model calls=', seen.length, 'tool events=', events.filter((e) => e.type.startsWith('tool')).length);
    expect(seen.length).toBe(1);
    expect(realBody).toBe(135);
  });

  it('cut returns over-limit text with a fake --- that hides the overflow', async () => {
    const sneaky = `${words(90)}\n\n---\n${words(200)}`;
    const { model, seen } = scripted([words(150), sneaky]);
    const { final, events } = await run(setup(model).svc, MSG);
    console.log('SNEAKY: calls', seen.length, 'tool_end', JSON.stringify(events.find((e) => e.type === 'tool_end')), 'final total tokens', final.split(/\s+/).length);
  });

  it('second retry message contains original draft for restore', async () => {
    const { model, seen } = scripted([words(150, 'orig'), words(50), words(90)]);
    await run(setup(model).svc, MSG);
    const roles = seen[2].messages.map((m) => m.role).join(',');
    console.log('retry roles:', roles);
    expect(seen[2].messages.some((m) => m.role === 'assistant' && String(m.content).includes('orig'))).toBe(true);
  });

  it('cut with new citation [9] not in registry is accepted', async () => {
    const { model } = scripted([words(150) + ' [1]', words(90) + ' [9]']);
    const { final } = await run(setup(model).svc, MSG);
    console.log('new cite accepted:', final.includes('[9]'));
  });

  it('cut that drops [DATA NEEDED] / recommendation is accepted (no check)', async () => {
    const { model } = scripted([words(150) + ' [DATA NEEDED: churn rate] Recommendation: launch.', words(90)]);
    const { final } = await run(setup(model).svc, MSG);
    console.log('DATA NEEDED kept:', final.includes('DATA NEEDED'));
  });

  it('95% target vs model counting 10% low (skill says draft to 85%)', async () => {
    const { model, seen } = scripted([words(150), () => ({}) as any]);
    await run(setup(model).svc, MSG).catch(() => undefined);
    console.log('correction prompt:', seen[1].messages[seen[1].messages.length - 1].content);
  });
});
