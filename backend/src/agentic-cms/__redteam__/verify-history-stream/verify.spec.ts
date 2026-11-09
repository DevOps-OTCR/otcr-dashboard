import type { AgentEvent } from '../../agent/agent.events';
import { AgentService } from '../../agent/agent.service';
import { ConversationStore } from '../../agent/conversation.store';
import { countDraftWords } from '../../agent/word-limit';
import { checkCitations } from '../../agent/citations';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { assistantMessage, type ModelClient, type ModelRequest, type ModelTurn } from '../../model/model-client';
import { TavilySearchClient } from '../../search/tavily-search.client';
import { SkillLibrary } from '../../skills/skill-library';
import { LoadSkillTool } from '../../tools/load-skill.tool';
import { MockWorkstreamTool } from '../../tools/mock-workstream.tool';
import { ToolRegistry } from '../../tools/tool-registry';
import { WebSearchTool } from '../../tools/web-search.tool';

const user = { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' };
const words = (n: number, p = 'w') => Array.from({ length: n }, (_, i) => `${p}${i}`).join(' ');
type Step = string | Error | { text: string; tool: true } | ((req: ModelRequest) => Promise<ModelTurn>);

function scripted(steps: Step[], seen: ModelRequest[] = []): ModelClient {
  return {
    name: 'scripted',
    async stream(req, onText) {
      seen.push(req);
      const s = steps[seen.length - 1];
      if (typeof s === 'function') return s(req);
      if (s instanceof Error) throw s;
      if (typeof s === 'object') {
        const call = { id: `c${seen.length}`, name: 'nonexistent_tool', args: {} };
        if (s.text) onText(s.text);
        return { text: s.text, toolCalls: [call], message: assistantMessage(s.text, [call]) };
      }
      onText(s);
      return { text: s, toolCalls: [], message: assistantMessage(s, []) };
    },
  };
}

function setup(model: ModelClient) {
  const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' };
  const store = new ConversationStore();
  const config = { get: (k: string) => settings[k] } as never;
  const skills = new SkillLibrary(config);
  const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
  return { store, svc: new AgentService(model, store, new FeatureFlagsService(config), tools, skills, config) };
}

async function run(svc: AgentService, message: string, conversationId?: string, signal = new AbortController().signal) {
  const events: AgentEvent[] = [];
  let error: unknown;
  try {
    await svc.run({ user, projectId: 'p1', sprintId: 's1', message, conversationId, signal }, (e) => events.push(e));
  } catch (e) { error = e; }
  // Simulate the browser reducer in OtcrBot.tsx
  let shown = '';
  let srcs: unknown[] = [];
  for (const e of events) {
    if (e.type === 'text_delta') shown += e.text;
    if (e.type === 'text_replace') shown = e.text;
    if (e.type === 'sources') srcs = e.sources;
  }
  const convo = events.find((e) => e.type === 'conversation') as { id: string } | undefined;
  return { events, shown, srcs, error, conversationId: convo?.id };
}

describe('redteam history-stream', () => {
  it('P1: text before a tool call is not counted; displayed answer exceeds limit with no cut', async () => {
    const { svc } = setup(scripted([{ text: words(200, 'a'), tool: true }, words(200, 'b')]));
    const r = await run(svc, 'Write a 350-word summary');
    const replaced = r.events.filter((e) => e.type === 'text_replace');
    console.log('P1 displayed words', countDraftWords(r.shown), 'text_replace events', replaced.length,
      'tool word_limit?', r.events.some((e) => e.type === 'tool_start' && e.name === 'word_limit'));
    expect(countDraftWords(r.shown)).toBeGreaterThan(350);
  });

  it('P1b: cut happens but shownBefore is kept, so the replaced text is still over the limit while tool_end says ok', async () => {
    const { svc } = setup(scripted([{ text: words(200, 'a'), tool: true }, words(400, 'b'), words(330, 'c')]));
    const r = await run(svc, 'Write a 350-word summary');
    const end = r.events.find((e) => e.type === 'tool_end' && e.id === 'word-limit');
    console.log('P1b displayed words', countDraftWords(r.shown), 'tool_end', JSON.stringify(end));
    expect(countDraftWords(r.shown)).toBeGreaterThan(350);
  });

  it('P2: cut can introduce a citation the draft never had; it is accepted into the cited sources', async () => {
    const { svc, store } = setup(scripted(['hi', `${words(400)} claim [1].`, `${words(320)} claim [1] and new claim [2] and [7].`]));
    const first = await run(svc, 'hi');
    await store.addSources(first.conversationId!, [{ title: 'A', url: 'https://a' }, { title: 'B', url: 'https://b' }]);
    const r = await run(svc, 'Write a 350-word summary', first.conversationId);
    console.log('P2 final sources', JSON.stringify(r.srcs), 'shown ends', r.shown.slice(-50));
    expect((r.srcs as { id: number }[]).map((s) => s.id)).toEqual([1, 2]);
  });

  it('P3: cut silently drops a citation; sources list follows the cut (consistent)', async () => {
    const { svc, store } = setup(scripted(['hi', `${words(400)} claim [1] other [2].`, `${words(320)} claim [1] other.`]));
    const first = await run(svc, 'hi');
    await store.addSources(first.conversationId!, [{ title: 'A', url: 'https://a' }, { title: 'B', url: 'https://b' }]);
    const r = await run(svc, 'Write a 350-word summary', first.conversationId);
    const hist = await store.history(first.conversationId!);
    console.log('P3 final sources', JSON.stringify(r.srcs), 'persisted last', hist[hist.length - 1].content.slice(-30));
    expect((r.srcs as { id: number }[]).map((s) => s.id)).toEqual([1]);
  });

  it('P4: persisted history excludes correction prompts and matches displayed text', async () => {
    const seen: ModelRequest[] = [];
    const { svc, store } = setup(scripted([{ text: 'Let me check.', tool: true }, words(400), words(380), words(330)], seen));
    const r = await run(svc, 'Write a 350-word summary');
    const hist = await store.history(r.conversationId!);
    const assistantText = hist.filter((m) => m.role === 'assistant').map((m) => m.content).filter(Boolean).join('\n\n');
    console.log('P4 roles', hist.map((m) => m.role).join(','), 'match', assistantText === r.shown);
    expect(hist.some((m) => m.role === 'user' && /counted by the server/.test(m.content))).toBe(false);
    expect(assistantText).toBe(r.shown);
  });

  it('P5: abort during the cut drops the already-delivered full answer from history', async () => {
    const ac = new AbortController();
    const { svc, store } = setup(scripted(['hi', words(400), async () => { ac.abort(); throw new Error('aborted'); }]));
    const first = await run(svc, 'hi');
    const r = await run(svc, 'Write a 350-word summary', first.conversationId, ac.signal);
    const hist = await store.history(first.conversationId!);
    console.log('P5 error', String(r.error), 'shown words', countDraftWords(r.shown), 'history roles', hist.map((m) => m.role).join(','));
    expect(countDraftWords(r.shown)).toBe(400);
    expect(hist.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('P6: over-limit notice persisted as the assistant own words (fed back to the model next turn)', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(scripted([words(400), words(390), words(380), 'ok'], seen));
    const r = await run(svc, 'Write a 350-word summary');
    await run(svc, 'thanks', r.conversationId);
    const msgs = seen[3].messages;
    console.log('P6 next-turn assistant content tail', (msgs[1] as { content: string }).content.slice(-90));
    expect((msgs[1] as { content: string }).content).toMatch(/over the 350-word limit/);
  });

  it('P7: grouped citations [1, 2] (format countDraftWords explicitly supports) are not recognised as cited', () => {
    const r = checkCitations('Claim [1, 2].', [{ id: 1, title: 'A', url: 'a' }, { id: 2, title: 'B', url: 'b' }]);
    console.log('P7', JSON.stringify(r));
    expect(r.cited).toEqual([]);
  });

});
