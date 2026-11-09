import { countDraftWords } from '../../agent/word-limit';
import { Logger } from '@nestjs/common';
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

const words = (n: number, p = 'w') => Array.from({ length: n }, (_, i) => `${p}${i}`).join(' ');
const c = countDraftWords;
const log = (label: string, text: string, human: number) => {
  // eslint-disable-next-line no-console
  console.log(`${label}: server=${c(text)} human=${human}`);
};

describe('counter probes (pure)', () => {
  it('basic tokens', () => {
    log('hyphen data-driven', 'a data-driven approach', 3);
    log('emdash nospace', 'cost—benefit analysis', 2);
    log('emdash spaced', 'cost — benefit', 2);
    log('money/pct', '$1.2M and 25% growth', 4);
    log('url', 'see https://example.com/a-b now', 3);
    log('contraction', "don't won't it's", 3);
    log('bullets', '- one two\n* three\n1. four five', 5);
    log('bold/italic', '**bold** _ital_ ***both***', 3);
    log('table', '| Col A | Col B |\n|---|---|\n| one | two |', 6);
    log('inline code', 'use `npm install` here', 4);
    log('fenced', '```\nconst x = 1;\n```\nafter', 5);
    log('emoji', 'growth 🚀 strong', 2);
    log('DATA NEEDED', '[DATA NEEDED: churn rate] next', 4);
    log('cite [1][2]', 'claim [1][2] here', 2);
    log('cite [1-3]', 'claim [1-3] here', 2);
    log('cite [S1; I2]', 'claim [S1; I2] here', 2);
    log('cite [ESTIMATE S3]', 'claim [ESTIMATE S3] here', 2);
    log('cite [ESTIMATE: S3, S4]', 'claim [ESTIMATE: S3, S4] here', 2);
    log('cite [S1, I2]', 'claim [S1, I2] here', 2);
    log('cite [1, 2-4]', 'claim [1, 2–4] here', 2);
    log('cite [S3a]', 'claim [S3a] here', 2);
    log('setext', 'Title Words Here\n================\nbody', 1);
    log('CJK', '这是一个没有空格的中文句子用于测试字数统计', 21);
    log('japanese', '日本語の文章はスペースがありません', 17);
  });

  it('rules', () => {
    const body1 = words(300, 'a');
    const body2 = words(300, 'b');
    log('mid --- no note (600 body)', `${body1}\n\n---\n\n${body2}`, 600);
    log('mid --- + note', `${body1}\n\n---\n\n${body2}\n\n---\nWord count (estimate): 590 / 600`, 600);
    log('*** note', `${body1}\n\n***\nnote ${words(40, 'n')}`, 300);
    log('___ note', `${body1}\n\n___\nnote ${words(40, 'n')}`, 300);
    log('- - - note', `${body1}\n\n- - -\nnote ${words(40, 'n')}`, 300);
    log('yaml front matter', `---\ntitle: Paper\nauthor: OTCR\n---\n${words(600, 'b')}`, 600);
    log('setext H2 underline ---', `Section Heading\n---\n${words(500, 'b')}`, 500);
    log('--- inside fence', `${words(400, 'a')}\n\`\`\`yaml\n---\nk: v\n\`\`\`\n${words(5, 'z')}`, 407);
  });
});

describe('counter probes through AgentService', () => {
  const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' };
  const setup = (model: ModelClient) => {
    const store = new ConversationStore();
    const config = { get: (key: string) => settings[key] } as never;
    const flags = new FeatureFlagsService(config);
    const skills = new SkillLibrary(config);
    const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
    return new AgentService(model, store, flags, tools, skills, config);
  };
  const answers = (texts: string[], seen: ModelRequest[]): ModelClient => ({
    name: 'answers',
    async stream(req, onText) {
      seen.push(req);
      const next = texts[seen.length - 1];
      onText(next);
      return { text: next, toolCalls: [], message: assistantMessage(next, []) };
    },
  });
  const run = async (svc: AgentService, message: string) => {
    const events: AgentEvent[] = [];
    await svc.run({ user: { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' }, projectId: 'p1', sprintId: 's1', message, signal: new AbortController().signal }, (e) => events.push(e));
    return events;
  };
  beforeAll(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));

  it('A: 700-word draft with a mid-document --- section break passes a 350 limit unchecked', async () => {
    const seen: ModelRequest[] = [];
    const draft = `${words(200, 'a')}\n\n---\n\n${words(500, 'b')}`;
    const events = await run(setup(answers([draft], seen)), 'Write a 350-word summary');
    // eslint-disable-next-line no-console
    console.log('A model calls', seen.length, 'events', events.map((e) => e.type).filter((t) => t !== 'text_delta'));
    expect(seen).toHaveLength(1); // no cut attempted
  });

  it('B: cut round returns text that hides tail behind --- and is accepted as within limit', async () => {
    const seen: ModelRequest[] = [];
    const draft = words(486, 'a');
    const revised = `${words(300, 'a')}\n\n---\n\n${words(186, 'b')}`; // 486 human words, no reviewer note
    const events = await run(setup(answers([draft, revised], seen)), 'Write a 350-word summary');
    const end = events.find((e) => e.type === 'tool_end');
    // eslint-disable-next-line no-console
    console.log('B', seen.length, JSON.stringify(end));
  });

  it('C: YAML front matter draft of 600 words passes a 350 limit', async () => {
    const seen: ModelRequest[] = [];
    const draft = `---\ntitle: Summary\n---\n${words(600, 'b')}`;
    await run(setup(answers([draft], seen)), 'Write a 350-word summary');
    // eslint-disable-next-line no-console
    console.log('C model calls', seen.length);
  });

  it('D: reviewer note after *** counted, triggers needless cut', async () => {
    const seen: ModelRequest[] = [];
    const draft = `${words(340, 'a')}\n\n***\nWord count (estimate): 300 / 350. ${words(30, 'n')}`;
    await run(setup(answers([draft, draft], seen)), 'Write a 350-word summary');
    // eslint-disable-next-line no-console
    console.log('D model calls', seen.length);
  });

  it('E: CJK 400-char summary vs 100 word limit', async () => {
    const seen: ModelRequest[] = [];
    const draft = '中文句子'.repeat(100);
    await run(setup(answers([draft], seen)), 'Write a 100-word summary');
    // eslint-disable-next-line no-console
    console.log('E model calls', seen.length, 'count', c(draft));
  });
});
