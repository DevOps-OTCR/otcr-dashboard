import { FeatureFlagsService } from '../../../../../feature-flags/feature-flags.service';
import type { AgentEvent } from '../../../../agent/agent.events';
import { AgentService } from './agent.service';
import { ConversationStore } from '../../../../agent/conversation.store';
import { isTooShort, requestedWordLimit } from '../../../../agent/word-limit';
import { assistantMessage, type ModelClient, type ModelRequest } from '../../../../model/model-client';
import { TavilySearchClient } from '../../../../search/tavily-search.client';
import { SkillLibrary } from '../../../../skills/skill-library';
import { LoadSkillTool } from '../../../../tools/load-skill.tool';
import { MockWorkstreamTool } from '../../../../tools/mock-workstream.tool';
import { ToolRegistry } from '../../../../tools/tool-registry';
import { WebSearchTool } from '../../../../tools/web-search.tool';

const last = <T,>(a: T[]) => a[a.length - 1];
const user = { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' };
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
let settings: Record<string, string>;
beforeEach(() => { settings = { AGENTIC_CMS_ENABLED: 'true' }; });
const setup = (model: ModelClient) => {
  const store = new ConversationStore();
  const config = { get: (k: string) => settings[k] } as never;
  const skills = new SkillLibrary(config);
  const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
  return { store, svc: new AgentService(model, store, new FeatureFlagsService(config), tools, skills, config) };
};
const script = (texts: (string | Error | ((req: ModelRequest) => string))[], seen: ModelRequest[] = []): ModelClient => ({
  name: 'script',
  async stream(req, onText) {
    seen.push(req);
    let next = texts[seen.length - 1];
    if (typeof next === 'function') next = next(req);
    if (next instanceof Error) throw next;
    onText(next);
    return { text: next, toolCalls: [], message: assistantMessage(next, []) };
  },
});
async function run(svc: AgentService, message: string, ac = new AbortController()) {
  const events: AgentEvent[] = [];
  let id: string | undefined;
  const p = svc.run({ user, projectId: 'p1', sprintId: 's1', message, signal: ac.signal }, (e) => { events.push(e); if (e.type === 'conversation') id = e.id; });
  return { p, events, id: () => id };
}
const replaced = (ev: AgentEvent[]) => ev.flatMap((e) => (e.type === 'text_replace' ? [e.text] : []));

describe('PROBE requestedWordLimit cap phrasings', () => {
  it.each([
    'Keep it to no more than 300 words',
    'Make sure it is not over 300 words',
    'Nothing above 300 words please',
  ])('%s', (m) => {
    // Recorded actual behaviour:
    console.log(JSON.stringify(m), '=>', requestedWordLimit(m));
  });
});

describe('PROBE isTooShort ceil boundary at non-integer 80%', () => {
  it('limit 333: ceil(266.4)=267, so 266 is too short (floor mutant would say false)', () => {
    expect(isTooShort(266, 333)).toBe(true);
    expect(isTooShort(267, 333)).toBe(false);
  });
});

describe('PROBE service gaps (pass on original; each kills a surviving mutant)', () => {
  it('a cut of exactly the limit is accepted (kills > -> >=)', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(script([words(351), words(350)], seen));
    const r = await run(svc, 'Write a 350-word summary'); await r.p;
    expect(seen).toHaveLength(2);
    expect(r.events.find((e) => e.type === 'tool_end')).toMatchObject({ ok: true, note: '351 → 350 words' });
    expect(replaced(r.events)).toEqual([words(350)]);
  });

  it('an empty cut keeps the original with the notice (kills removal of !revised guard)', async () => {
    const seen: ModelRequest[] = [];
    const { svc, store } = setup(script([words(486), '   ', ''], seen));
    const r = await run(svc, 'Write a 350-word summary'); await r.p;
    expect(seen).toHaveLength(2);
    expect(replaced(r.events)[0]).toContain('This draft is 486 words');
    expect(last(await store.history(r.id()!)).content).toContain('over the 350-word limit');
  });

  it('abort during the cut rejects and saves only the user message (kills abort-rethrow removal)', async () => {
    const ac = new AbortController();
    const { svc, store } = setup(script([words(486), () => { ac.abort(); throw new Error('aborted'); }]));
    const r = await run(svc, 'Write a 350-word summary', ac);
    await expect(r.p).rejects.toThrow('aborted');
    expect(replaced(r.events)).toEqual([]);
    expect((await store.history(r.id()!)).map((m) => m.role)).toEqual(['user']);
  });

  it('cut requests carry the request abort signal (kills dropped signal)', async () => {
    const seen: ModelRequest[] = [];
    const ac = new AbortController();
    const { svc } = setup(script([words(486), words(300)], seen));
    const r = await run(svc, 'Write a 350-word summary', ac); await r.p;
    expect(seen[1].signal).toBe(ac.signal);
  });

  it('flag turned off during the first cut stops the retry (kills removal of in-loop recheck)', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(script([words(486), () => { settings.AGENTIC_CMS_ENABLED = 'false'; return words(400); }, words(300)], seen));
    const r = await run(svc, 'Write a 350-word summary');
    await expect(r.p).rejects.toMatchObject({ kind: 'disabled' });
    expect(seen).toHaveLength(2);
  });

  it('retry conversation includes the rejected rewrite as an assistant turn (kills dropped assistant msg)', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(script([words(486), words(400), words(330)], seen));
    const r = await run(svc, 'Write a 350-word summary'); await r.p;
    const msgs = seen[2].messages;
    expect(msgs[msgs.length - 2]).toEqual({ role: 'assistant', content: words(400) });
  });

  it('tool_start label names the limit, and persisted text is trimmed (kills label / trim mutants)', async () => {
    const { svc, store } = setup(script([words(486), `\n\n${words(300)}\n\n`]));
    const r = await run(svc, 'Write a 350-word summary'); await r.p;
    expect(r.events.find((e) => e.type === 'tool_start')).toMatchObject({ id: 'word-limit', label: 'Cutting the draft to 350 words' });
    expect(last(await store.history(r.id()!)).content).toBe(words(300));
  });

  it('a draft at limit+1 triggers a cut, at limit does not', async () => {
    const seenA: ModelRequest[] = []; const seenB: ModelRequest[] = [];
    await (await run(setup(script([words(351), words(330)], seenA)).svc, 'Write a 350-word summary')).p;
    await (await run(setup(script([words(350)], seenB)).svc, 'Write a 350-word summary')).p;
    expect(seenA).toHaveLength(2); expect(seenB).toHaveLength(1);
  });

  it('cut landing at ceil(0.8*limit)-1 retries; at ceil(0.8*limit) does not (limit 333)', async () => {
    const a: ModelRequest[] = []; const b: ModelRequest[] = [];
    await (await run(setup(script([words(400), words(266), words(300)], a)).svc, 'Write a 333-word summary')).p;
    await (await run(setup(script([words(400), words(267)], b)).svc, 'Write a 333-word summary')).p;
    expect(a).toHaveLength(3); expect(b).toHaveLength(2);
  });
});
