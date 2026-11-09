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

describe('redteam scenarios', () => {
  it('S1 350-word exec summary, 486 draft, cut 380 (model self-counts low), retry 360 -> notice', async () => {
    const seen: ModelRequest[] = [];
    const draft = `${prose(486)}\n\n---\nWord count (estimate): 340 / 350`;
    const { svc } = setup(scripted([draft, `${prose(380)}\n\n---\nWord count (estimate): 330 / 350`, `${prose(360)}\n\n---\nWord count (estimate): 320 / 350`], seen));
    const r = await turn(svc, 'Write a 350-word executive summary for Lumen');
    report('S1', r, seen.length, `limit=${requestedWordLimit('Write a 350-word executive summary for Lumen')} tail=${JSON.stringify(r.final.slice(-120))}`);
  });

  it('S1b 350-word exec summary, 486 draft, first cut lands 330', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(scripted([prose(486), prose(330)], seen));
    const r = await turn(svc, 'Write a 350-word executive summary for Lumen');
    report('S1b', r, seen.length);
  });

  it('S2 sectioned 1,500-word paper with per-section budgets, 1,527 draft', async () => {
    const seen: ModelRequest[] = [];
    const msg = 'Write a 1,500-word white paper: intro 200 words, analysis 900 words, recommendation 400 words.';
    const draft = `## Intro\n${prose(205, 'i')}\n\n## Analysis\n${prose(912, 'a')}\n\n## Recommendation\n${prose(410, 'r')}\n\n---\nWord count (estimate): 1,380 / 1,500`;
    const { svc } = setup(scripted([draft, prose(1400)], seen));
    const r = await turn(svc, msg);
    report('S2', r, seen.length, `limit=${requestedWordLimit(msg)}`);
  });

  it('S2b sectioned paper phrased "1,500 words total, with a 300-word intro"', async () => {
    const seen: ModelRequest[] = [];
    const msg = 'Draft the Lumen paper, 1,500 words total, with a 300-word intro.';
    const { svc } = setup(scripted([prose(1527), prose(1400)], seen));
    const r = await turn(svc, msg);
    report('S2b', r, seen.length, `limit=${requestedWordLimit(msg)}`);
  });

  it('S3 strict-cap revision follow-up: revise to 250 words, 266 draft', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(scripted([prose(330), prose(266), prose(240)], seen));
    const t1 = await turn(svc, 'Write a 350-word executive summary for Lumen');
    report('S3.t1', t1, seen.length);
    const t2 = await turn(svc, 'Good. Now revise to 250 words.', t1.conversationId);
    report('S3.t2', t2, seen.length);
  });

  it('S3b revision phrasings without the word "words" or with two numbers', async () => {
    for (const msg of ['Now cut it to 250.', 'Trim it down to 250 max', 'Revise the 350-word summary down to 250 words', 'Shorten it from 350 words to 250 words']) {
      const seen: ModelRequest[] = [];
      const { svc } = setup(scripted([prose(330), prose(266), prose(240)], seen));
      const t1 = await turn(svc, 'Write a 350-word executive summary for Lumen');
      const t2 = await turn(svc, msg, t1.conversationId);
      report(`S3b "${msg}"`, t2, seen.length, `limit=${requestedWordLimit(msg)}`);
    }
  });

  it('S4 limit only in previous turn', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(scripted([prose(330), prose(420)], seen));
    const t1 = await turn(svc, 'Write a 350-word executive summary for Lumen');
    const t2 = await turn(svc, 'Add a sentence on churn risk and the pricing caveat.', t1.conversationId);
    report('S4.t2', t2, seen.length, `limit=${requestedWordLimit('Add a sentence on churn risk and the pricing caveat.')}`);
  });

  it('S5 keep it under 300 words with long reviewer note below ---', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(scripted([`${prose(290)}\n\n---\n${prose(220, 'n')}`], seen));
    const r = await turn(svc, 'Keep it under 300 words please.');
    report('S5a', r, seen.length);
    const seen2: ModelRequest[] = [];
    const s2 = setup(scripted([`${prose(320)}\n\n---\n${prose(220, 'n')}`, `${prose(280)}\n\n---\n${prose(220, 'n')}`], seen2));
    const r2 = await turn(s2.svc, 'Keep it under 300 words please.');
    report('S5b', r2, seen2.length, `noteKept=${r2.final.includes('n219')}`);
  });

  it('S5c ceiling phrasings misread as floors', async () => {
    for (const msg of ['No more than 300 words.', 'Not more than 300 words please', "Don't go over 300 words.", 'Nothing over 300 words', 'Keep it to 300 words or fewer']) {
      const seen: ModelRequest[] = [];
      const { svc } = setup(scripted([prose(420), prose(280)], seen));
      const r = await turn(svc, msg);
      report(`S5c "${msg}"`, r, seen.length, `limit=${requestedWordLimit(msg)}`);
    }
  });

  it('S6 model writes its own wrong Word count line', async () => {
    // a) in reviewer note, body actually 372, note claims 340
    const seen: ModelRequest[] = [];
    const { svc } = setup(scripted([`${prose(372)}\n\n---\nWord count (estimate): 340 / 350`, `${prose(320)}\n\n---\nWord count (estimate): 340 / 350`], seen));
    const r = await turn(svc, 'Write a 350-word executive summary');
    report('S6a', r, seen.length, `staleCountLineInFinal=${/340 \/ 350/.test(r.final)}`);
    // b) in body, within limit, wrong number survives untouched
    const seen2: ModelRequest[] = [];
    const s2 = setup(scripted([`${prose(300)}\n\nWord count: 340`], seen2));
    const r2 = await turn(s2.svc, 'Write a 350-word executive summary');
    report('S6b', r2, seen2.length, `bodyCountLine=${r2.final.includes('Word count: 340')}`);
  });

  it('S7 horizontal rule in body, no reviewer note', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(scripted([`${prose(200, 'a')}\n\n---\n\n${prose(200, 'b')}`], seen));
    const r = await turn(svc, 'Write a 300-word summary');
    const trueWords = r.final.split(/\s+/).filter((t) => /\w/.test(t)).length;
    report('S7', r, seen.length, `actualVisibleWords=${trueWords}`);
  });

  it('S7b setext heading "Title\\n---" at top', async () => {
    const seen: ModelRequest[] = [];
    const { svc } = setup(scripted([`Lumen Executive Summary\n---\n${prose(480)}`], seen));
    const r = await turn(svc, 'Write a 350-word summary');
    report('S7b', r, seen.length);
  });

  it('S8 source length mentioned alongside target', async () => {
    for (const msg of ['Summarize this 2,000-word report in 300 words.', 'Summarize the attached 5,000 word filing into a 350-word brief']) {
      const seen: ModelRequest[] = [];
      const { svc } = setup(scripted([prose(420), prose(280)], seen));
      const r = await turn(svc, msg);
      report(`S8 "${msg}"`, r, seen.length, `limit=${requestedWordLimit(msg)}`);
    }
  });
});
