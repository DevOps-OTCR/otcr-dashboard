import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import type { AgentEvent } from '../../agent/agent.events';
import { AgentService } from '../../agent/agent.service';
import { ConversationStore } from '../../agent/conversation.store';
import { countDraftWords, requestedWordLimit } from '../../agent/word-limit';
import { assistantMessage, type ModelClient, type ModelRequest } from '../../model/model-client';
import { TavilySearchClient } from '../../search/tavily-search.client';
import { SkillLibrary } from '../../skills/skill-library';
import { LoadSkillTool } from '../../tools/load-skill.tool';
import { MockWorkstreamTool } from '../../tools/mock-workstream.tool';
import { ToolRegistry } from '../../tools/tool-registry';
import { WebSearchTool } from '../../tools/web-search.tool';

const user = { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' };
const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' };
const prose = (n: number, tag = 'w') => {
  // realistic-ish sentences of 10 words
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(i % 10 === 9 ? `${tag}${i}.` : `${tag}${i}`);
  return out.join(' ');
};
function setup(model: ModelClient) {
  const store = new ConversationStore();
  const config = { get: (k: string) => settings[k] } as never;
  const flags = new FeatureFlagsService(config);
  const skills = new SkillLibrary(config);
  const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
  return { store, svc: new AgentService(model, store, flags, tools, skills, config) };
}
const scripted = (texts: string[], seen: ModelRequest[] = []): ModelClient => ({
  name: 'scripted',
  async stream(req, onText) {
    seen.push(req);
    const next = texts[seen.length - 1];
    if (next === undefined) throw new Error('script exhausted');
    onText(next);
    return { text: next, toolCalls: [], message: assistantMessage(next, []) };
  },
});
async function turn(svc: AgentService, message: string, conversationId?: string) {
  const events: AgentEvent[] = [];
  await svc.run({ user, projectId: 'p1', sprintId: 's1', message, conversationId, signal: new AbortController().signal }, (e) => events.push(e));
  const streamed = events.flatMap((e) => (e.type === 'text_delta' ? [e.text] : [])).join('');
  const replaces = events.flatMap((e) => (e.type === 'text_replace' ? [e.text] : []));
  const final = replaces.length ? replaces[replaces.length - 1] : streamed;
  const c = events.find((e) => e.type === 'conversation');
  return {
    events, final, finalWords: countDraftWords(final),
    summary: events.filter((e) => e.type !== 'text_delta').map((e) => e.type + (e.type === 'tool_end' ? `(${(e as any).ok},${(e as any).note})` : '')).join(' > '),
    conversationId: c && c.type === 'conversation' ? c.id : undefined,
  };
}
const report = (name: string, r: { summary: string; finalWords: number }, calls: number, extra = '') =>
  console.log(`[${name}] modelCalls=${calls} events=${r.summary || '(text only)'} finalBodyWords=${r.finalWords} ${extra}`);
describe('verify S4', () => {
  it('follow-up edit after capped turn', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(scripted([prose(330), prose(420), prose(340)], seen));
    const t1 = await turn(svc, 'Write a 350-word executive summary for Lumen');
    report('t1', t1, seen.length);
    const t2 = await turn(svc, 'Add a sentence on churn risk and the pricing caveat.', t1.conversationId);
    report('t2', t2, seen.length, `t2modelSawPriorCap=${JSON.stringify(seen[1].messages).includes('350-word')}`);
  });
});
