import { AgentService } from '../../agent/agent.service';
import { ConversationStore } from '../../agent/conversation.store';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { TavilySearchClient } from '../../search/tavily-search.client';
import { SkillLibrary } from '../../skills/skill-library';
import { LoadSkillTool } from '../../tools/load-skill.tool';
import { MockWorkstreamTool } from '../../tools/mock-workstream.tool';
import { ToolRegistry } from '../../tools/tool-registry';
import { WebSearchTool } from '../../tools/web-search.tool';
import { assistantMessage, type ModelClient } from '../../model/model-client';
import { requestedWordLimit } from '../../agent/word-limit';

const user = { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' };
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
function scripted(texts: string[]) {
  let calls = 0;
  const m: ModelClient = { stream: async () => { const t = texts[Math.min(calls++, texts.length - 1)]; return { text: t, toolCalls: [], message: assistantMessage(t, []) } as never; } } as never;
  return { m, calls: () => calls };
}
it('multiturn', async () => {
  const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' };
  const config = { get: (k: string) => settings[k] } as never;
  const sk = new SkillLibrary(config);
  const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(sk), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
  const s = scripted([words(340), words(520)]);
  const svc = new AgentService(s.m, new ConversationStore(), new FeatureFlagsService(config), tools, sk, config);
  const run = async (message: string, conversationId?: string) => { const ev: any[] = []; await svc.run({ user, projectId: 'p1', sprintId: 's1', message, conversationId, signal: new AbortController().signal }, (e) => ev.push(e)); return ev; };
  const e1 = await run('Write a 350-word summary');
  const id = e1.find((e) => e.type === 'conversation').id;
  const e2 = await run('Good. Add a short paragraph on risks.', id);
  console.log('calls', s.calls(), 'types', e2.map((e) => e.type).filter((t) => t !== 'text_delta'));
  console.log('cut it to 250 ->', requestedWordLimit('Too long, cut it to 250.'), '| keep it under 350 words ->', requestedWordLimit('Add risks, keep it under 350 words'));
  expect(s.calls()).toBe(2);
});
