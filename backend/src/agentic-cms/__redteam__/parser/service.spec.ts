import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import type { AgentEvent } from '../../agent/agent.events';
import { AgentService } from '../../agent/agent.service';
import { ConversationStore } from '../../agent/conversation.store';
import { assistantMessage, type ModelClient, type ModelRequest } from '../../model/model-client';
import { TavilySearchClient } from '../../search/tavily-search.client';
import { SkillLibrary } from '../../skills/skill-library';
import { LoadSkillTool } from '../../tools/load-skill.tool';
import { MockWorkstreamTool } from '../../tools/mock-workstream.tool';
import { ToolRegistry } from '../../tools/tool-registry';
import { WebSearchTool } from '../../tools/web-search.tool';
import { countDraftWords } from '../../agent/word-limit';

const user = { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' };
const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' };
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const answers = (texts: string[], seen: ModelRequest[]): ModelClient => ({
  name: 'answers',
  async stream(req, onText) {
    seen.push(req);
    const next = texts[seen.length - 1] ?? 'x';
    onText(next);
    return { text: next, toolCalls: [], message: assistantMessage(next, []) };
  },
});
const setup = (model: ModelClient) => {
  const store = new ConversationStore();
  const config = { get: (key: string) => settings[key] } as never;
  const flags = new FeatureFlagsService(config);
  const skills = new SkillLibrary(config);
  const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
  return { store, svc: new AgentService(model, store, flags, tools, skills, config) };
};
async function runTurn(svc: AgentService, message: string, conversationId?: string) {
  const events: AgentEvent[] = [];
  await svc.run({ user, projectId: 'p1', sprintId: 's1', message, conversationId, signal: new AbortController().signal }, (e) => events.push(e));
  const c = events.find((e) => e.type === 'conversation');
  return { events, conversationId: c && c.type === 'conversation' ? c.id : undefined };
}
const replaced = (ev: AgentEvent[]) => ev.flatMap((e) => (e.type === 'text_replace' ? [e.text] : []));

describe('parser service probes', () => {
  it('floor "500 words minimum": 700-word draft gets cut to <=500 (below the floor)', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(answers([words(700), words(480)], seen));
    const { events } = await runTurn(svc, 'Write the whitepaper section, 500 words minimum.');
    console.log('FLOOR calls', seen.length, 'correction:', String((seen[1] ? seen[1].messages[seen[1].messages.length - 1].content : "")).slice(0, 160), 'final words', replaced(events).map(countDraftWords));
  });
  it('per-slide "each slide under 50 words": 8-slide 400-word deck gets cut to 50 total', async () => {
    const seen: ModelRequest[] = [];
    const deck = Array.from({ length: 8 }, (_, i) => `## Slide ${i + 1}\n${words(45)}`).join('\n\n');
    const { svc } = setup(answers([deck, words(48)], seen));
    const { events } = await runTurn(svc, 'Build an 8-slide deck. Each slide under 50 words.');
    console.log('PERSLIDE calls', seen.length, 'draft words', countDraftWords(deck), 'correction:', String((seen[1] ? seen[1].messages[seen[1].messages.length - 1].content : "")).slice(0, 140), 'final', replaced(events).map(countDraftWords));
  });
  it('"no more than 400 words": 600-word draft passes uncut', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(answers([words(600)], seen));
    const { events } = await runTurn(svc, 'Write the exec summary in no more than 400 words.');
    console.log('NOMORETHAN calls', seen.length, 'tool_start?', events.some((e) => e.type === 'tool_start'));
  });
  it('"Summarise the 2,000-word report below in 300 words": 600 draft passes uncut', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(answers([words(600)], seen));
    await runTurn(svc, 'Summarise the 2,000-word report below in 300 words.\n\n<report text>');
    console.log('PASTED calls', seen.length);
  });
  it('multi-turn: limit set in turn 1, follow-up "add a risks paragraph" grows past it uncut', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(answers([words(340), words(520)], seen));
    const t1 = await runTurn(svc, 'Write a 350-word summary');
    await runTurn(svc, 'Good. Add a short paragraph on risks.', t1.conversationId);
    console.log('MULTITURN calls', seen.length, '(2 = no enforcement on turn 2 despite 520 > 350)');
  });
  it('multi-turn: "cut it to 250" (no "words") is not enforced', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(answers([words(340), words(330)], seen));
    const t1 = await runTurn(svc, 'Write a 350-word summary');
    await runTurn(svc, 'Too long, cut it to 250.', t1.conversationId);
    console.log('CUTTO calls', seen.length);
  });
  it('wpm: "300 words-per-minute, 2 minute talk" 600-word script gets cut to <=300', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(answers([words(600), words(290)], seen));
    const { events } = await runTurn(svc, 'Write a 2-minute talk track; the speaker reads at 300 words per minute.');
    console.log('WPM calls', seen.length, 'final', replaced(events).map(countDraftWords));
  });
  it('"at least 1000 words, ideally 1200 words": 1400-word draft gets cut', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(answers([words(1400), words(1150)], seen));
    await runTurn(svc, 'Make it longer: at least 1000 words, ideally 1200 words.');
    console.log('IDEALLY calls', seen.length);
  });
});
